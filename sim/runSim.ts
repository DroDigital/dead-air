/**
 * Balance simulator.
 *   npm run sim -- --runs 5000 --seed 1 [--policies ev,deposit-every-spin] [--workers 4] [--stake 0]
 *
 * Plays full runs headlessly with real wheel physics and reports, per policy:
 *   pass rate per Deadline, win rate, average Tray at Bankrupt, artifact pick/win
 *   correlation, combo frequency.
 */
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Game } from '../src/game/run';
import { Bot, POLICIES } from './bot';

export interface RunResult {
  policy: string;
  reached: number;
  won: boolean;
  spins: number;
  bankrupts: number;
  trayAtBankrupt: number[];
  combos: Record<string, number>;
  artifacts: string[];
  picked: string[];
  maxStreak: number;
  jackpots: number;
}

export function playRun(policy: string, seed: string, stake = 0): RunResult {
  const g = Game.newRun({ seed, stake, startWheel: 'standard' });
  const bot = new Bot(POLICIES[policy]);
  const picked = new Set<string>();
  g.bus.on('artifactGained', (e) => picked.add(e.id));
  for (let i = 0; i < 20000; i++) if (!bot.step(g)) break;
  const r = g.run;
  const paid = r.deadlines.filter((d) => d.paid).length;
  return {
    policy,
    reached: paid,
    won: r.deadlines.some((d) => d.paid && d.deadline === 8),
    spins: r.stats.spins,
    bankrupts: r.stats.bankrupts,
    trayAtBankrupt: r.stats.trayAtBankrupt,
    combos: r.stats.combos,
    artifacts: r.artifacts.map((a) => a.id),
    picked: [...picked],
    maxStreak: r.stats.maxStreak,
    jackpots: r.stats.jackpots,
  };
}

interface Job {
  policy: string;
  seeds: string[];
  stake: number;
}

if (!isMainThread) {
  const job = workerData as Job;
  const out: RunResult[] = [];
  for (const s of job.seeds) out.push(playRun(job.policy, s, job.stake));
  parentPort!.postMessage(out);
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

export interface PolicyReport {
  policy: string;
  runs: number;
  passByDeadline: number[];
  winRate: number;
  avgReached: number;
  avgTrayAtBankrupt: number;
  bankruptsPerRun: number;
  combosPerSpin: Record<string, number>;
  artifactWin: { id: string; n: number; winRate: number }[];
  pickedWin: { id: string; n: number; winRate: number }[];
}

export function summarize(policy: string, rs: RunResult[]): PolicyReport {
  const n = rs.length;
  const pass = Array.from({ length: 8 }, (_, d) => rs.filter((r) => r.reached >= d + 1).length / n);
  const trays = rs.flatMap((r) => r.trayAtBankrupt);
  const spins = rs.reduce((a, r) => a + r.spins, 0);
  const combos: Record<string, number> = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.combos)) combos[k] = (combos[k] ?? 0) + v;
  for (const k of Object.keys(combos)) combos[k] /= Math.max(1, spins);
  const corr = (field: 'artifacts' | 'picked') => {
    const m = new Map<string, { n: number; w: number }>();
    for (const r of rs)
      for (const id of new Set(r[field])) {
        const e = m.get(id) ?? { n: 0, w: 0 };
        e.n++;
        if (r.won) e.w++;
        m.set(id, e);
      }
    return [...m.entries()].map(([id, e]) => ({ id, n: e.n, winRate: e.w / e.n })).sort((a, b) => b.winRate - a.winRate);
  };
  return {
    policy,
    runs: n,
    passByDeadline: pass,
    winRate: rs.filter((r) => r.won).length / n,
    avgReached: rs.reduce((a, r) => a + r.reached, 0) / n,
    avgTrayAtBankrupt: trays.length ? trays.reduce((a, b) => a + b, 0) / trays.length : 0,
    bankruptsPerRun: rs.reduce((a, r) => a + r.bankrupts, 0) / n,
    combosPerSpin: combos,
    artifactWin: corr('artifacts'),
    pickedWin: corr('picked'),
  };
}

async function runParallel(policy: string, seeds: string[], workers: number, stake: number): Promise<RunResult[]> {
  const chunk = Math.ceil(seeds.length / workers);
  const jobs: Promise<RunResult[]>[] = [];
  for (let w = 0; w < workers; w++) {
    const part = seeds.slice(w * chunk, (w + 1) * chunk);
    if (!part.length) continue;
    jobs.push(
      new Promise((res, rej) => {
        // Bootstrap tsx inside the worker so it can load this TypeScript file.
        const boot = `import('tsx/esm/api').then((m) => { m.register(); return import(${JSON.stringify(import.meta.url)}); });`;
        const worker = new Worker(boot, { eval: true, workerData: { policy, seeds: part, stake } satisfies Job });
        worker.once('message', res);
        worker.once('error', rej);
      }),
    );
  }
  return (await Promise.all(jobs)).flat();
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

async function main(): Promise<void> {
  const runs = Number(arg('runs', '1000'));
  const seed = arg('seed', '1');
  const stake = Number(arg('stake', '0'));
  const workers = Number(arg('workers', String(Math.max(1, cpus().length))));
  const policies = arg('policies', 'deposit-every-spin,ride-to-3,ride-to-5,ev').split(',');
  const seeds = Array.from({ length: runs }, (_, i) => `sim-${seed}-${i}`);
  const t0 = Date.now();
  const reports: PolicyReport[] = [];
  for (const p of policies) {
    if (!POLICIES[p]) throw new Error(`unknown policy ${p}`);
    const rs = await runParallel(p, seeds, workers, stake);
    reports.push(summarize(p, rs));
    process.stderr.write(`  ${p}: done (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
  }
  console.log(`\nDEAD AIR balance sim — ${runs} runs/policy, seed ${seed}, stake ${stake}\n`);
  console.log(`| policy | ${Array.from({ length: 8 }, (_, i) => `D${i + 1}`).join(' | ')} | win | avg paid | bankrupts/run | avg tray @ bankrupt |`);
  console.log(`|---|${'---|'.repeat(8)}---|---|---|---|`);
  for (const r of reports)
    console.log(`| ${r.policy} | ${r.passByDeadline.map(pct).join(' | ')} | **${pct(r.winRate)}** | ${r.avgReached.toFixed(2)} | ${r.bankruptsPerRun.toFixed(2)} | $${r.avgTrayAtBankrupt.toFixed(0)} |`);
  console.log('\nCombo frequency (per spin):');
  for (const r of reports) console.log(`  ${r.policy}: ${Object.entries(r.combosPerSpin).map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
  const ev = reports.find((r) => r.policy === 'ev') ?? reports[reports.length - 1];
  console.log(`\nArtifact pick ↔ win correlation (${ev.policy}; runs that ever acquired it, n ≥ 30; baseline ${pct(ev.winRate)}):`);
  const rows = ev.pickedWin.filter((a) => a.n >= 30);
  for (const a of rows.slice(0, 10)) console.log(`  ▲ ${a.id.padEnd(18)} n=${String(a.n).padStart(5)} win ${pct(a.winRate)}`);
  for (const a of rows.slice(-5)) console.log(`  ▼ ${a.id.padEnd(18)} n=${String(a.n).padStart(5)} win ${pct(a.winRate)}`);
  const pickRate = [...ev.pickedWin].sort((a, b) => b.n - a.n).slice(0, 8);
  console.log(`Most-picked: ${pickRate.map((a) => `${a.id} ${pct(a.n / ev.runs)}`).join(', ')}`);
  const maxA = rows[0];
  console.log(`\nTargets (EV bot): D1 ≥ 95% → ${pct(ev.passByDeadline[0])} · win 8–20% → ${pct(ev.winRate)} · max artifact win ≤ 60% → ${maxA ? `${maxA.id} ${pct(maxA.winRate)}` : 'n/a'}`);
  const dep = reports.find((r) => r.policy === 'deposit-every-spin');
  if (dep) {
    const dies = dep.passByDeadline.findIndex((p) => p < 0.5) + 1;
    console.log(`deposit-every-spin median death: Deadline ${dies || '>8'} (target 4–5)`);
  }
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
