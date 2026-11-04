/**
 * Voice-over script: every voiced line in the game, keyed by a stable id (hash of speaker + text).
 *
 *   npx tsx tools/vo.ts script   → assets-src/vo/script.json (batches sent to ElevenLabs, one take each)
 *   npx tsx tools/vo.ts split <batchId> <audio file>  → cuts one batch into per-line clips
 *   npx tsx tools/vo.ts index    → src/assets/vo.json (runtime index of the clips that exist)
 *
 * A batch is several lines from one speaker read in one generation, separated by [long pause]
 * tags. `split` finds the N−1 longest silences and cuts there, then checks every clip's
 * length against its text so a mis-split batch is rejected instead of shipped.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BARGAINS, PRODUCER_INTROS } from '../src/content/bargains';
import { DEADLINE_LINES, HOST_LINES, PRODUCER_ACCEPT, PRODUCER_HANGUP, SECRET_ACCEPT, type HostTrigger } from '../src/content/hostLines';
import { LORE } from '../src/content/lore';
import { voId } from '../src/audio/voId';

/** Archive notes read aloud in the Prop Room (budget: the first four). */
export const ARCHIVE_VOICED = 4;

export type Speaker = 'host' | 'producer' | 'secret' | 'archive';
export const VOICES: Record<Speaker, { id: string; name: string }> = {
  // Custom voices designed for the game (ElevenLabs voice design, eleven_ttv_v3).
  host: { id: '1ZXEoWxMa1iha6a57UoM', name: 'DEAD AIR Host' },
  producer: { id: 'ncChMB7ZB1vnZEjg7kvI', name: 'DEAD AIR Producer' },
  secret: { id: 'lbIDPbGALZZqUPPfyITw', name: 'DEAD AIR Other Line' },
  archive: { id: 'yHofioyxMKXVSF6qJKEZ', name: 'DEAD AIR Archivist' },
};


const HOST_TAG: Partial<Record<HostTrigger, string>> = {
  intro: '[excited]',
  bankrupt: '[mischievously]',
  jackpot: '[shouting] [excited]',
  streak: '[excited]',
  deposit: '[cheerfully]',
  debtPaid: '[excited]',
  debtMissed: '[sarcastic]',
  idle: '[mischievously]',
  artifact: '[curious]',
  combo: '[excited]',
  phone: '[surprised]',
  shop: '[warmly]',
  bigWin: '[shouting] [excited]',
  dud: '[laughs]',
  tax: '[mischievously]',
  victory: '[excited]',
  package: '[cheerfully]',
  sweep: '[dramatically]',
  mystery: '[curious]',
  lastSpin: '[dramatically]',
  scratch: '[excited]',
  sell: '[cheerfully]',
  dealTaken: '[nervous]',
  dealRefused: '[surprised]',
  endless: '[excited]',
  gameOver: '[warmly]',
  neighbors: '[surprised]',
  hatTrick: '[shouting] [excited]',
  title: '[dramatically]',
};

/** Per-trigger tag rotation so a batch doesn't read every line the same way. */
const HOST_ROTATE: Partial<Record<HostTrigger, string[]>> = {
  bankrupt: ['[mischievously]', '[laughs]', '[sarcastic]', '[giggles]'],
  idle: ['[mischievously]', '[whispers]', '[sighs]', '[curious]'],
  debtMissed: ['[sarcastic]', '[sad]', '[dramatically]'],
  dud: ['[laughs]', '[sarcastic]', '[chuckles]'],
  gameOver: ['[warmly]', '[sad]', '[mischievously]'],
  artifact: ['[curious]', '[whispers]', '[excited]'],
};
const PRODUCER_ROTATE = ['[raspy]', '[chuckles]', '[softly]', '[sarcastic]', '[raspy] [slowly]'];

/** Inline v4 direction: tags that colour particular words. Captions keep the plain text. */
export function direct(text: string): string {
  return text
    .replace(/\bHa-ha!/g, '[laughs] Ha-ha!')
    .replace(/^Oh no\./, '[gasps] Oh no.')
    .replace(/^Psst\./, '[whispers] Psst.')
    .replace(/Ka-THUNK!/, '[shouting] Ka-THUNK!')
    .replace(/Ding ding ding!/, '[singing] Ding ding ding!')
    .replace(/ Probably!$/, ' [short pause] [mischievously] Probably!')
    .replace(/ Probably\.$/, ' [short pause] Probably.')
    .replace(/ Briefly!$/, ' [short pause] Briefly!')
    .replace(/ Well\. Some people\. Once\./, ' [darkly amused] Well. Some people. Once.')
    .replace(/(\.\.\.|…) /g, '$1 [short pause] ')
    // Stage directions in parentheses become delivery tags (never [long pause]: that is the batch separator).
    .replace(/^\(a whisper\) /, '[whispers] ')
    .replace(/^\(static\) /, '[exhales] ')
    .replace(/^\(breathing\) /, '[breathless] ')
    .replace(/^\(a long pause\) /, '[pause] ')
    .replace(/ \/ /g, ' [short pause] ');
}

interface Line {
  id: string;
  speaker: Speaker;
  text: string;
  tag: string;
}

export function allLines(): Line[] {
  const out: Line[] = [];
  const add = (speaker: Speaker, text: string, tag: string) => out.push({ id: voId(speaker, text), speaker, text, tag });
  for (const [t, lines] of Object.entries(HOST_LINES) as [HostTrigger, readonly string[]][])
    lines.forEach((l, i) => add('host', l, HOST_ROTATE[t]?.[i % HOST_ROTATE[t]!.length] ?? HOST_TAG[t] ?? '[excited]'));
  DEADLINE_LINES.forEach((l, i) => add('host', l, i >= 6 ? '[dramatically] [nervous]' : '[dramatically]'));
  let pi = 0;
  const prod = (l: string) => add('producer', l, PRODUCER_ROTATE[pi++ % PRODUCER_ROTATE.length]);
  [...PRODUCER_INTROS.normal, ...PRODUCER_INTROS.deadAir].forEach(prod);
  PRODUCER_ACCEPT.forEach((l) => add('producer', l, '[chuckles]'));
  PRODUCER_HANGUP.forEach((l) => add('producer', l, '[angry] [raspy]'));
  for (const b of BARGAINS) if (b.tier !== 'secret') prod(b.line);
  for (const l of PRODUCER_INTROS.secret) add('secret', l, '[whispers] [nervous]');
  add('secret', SECRET_ACCEPT, '[whispers]');
  for (const b of BARGAINS) if (b.tier === 'secret') add('secret', b.line, '[whispers] [trembling voice]');
  for (const n of LORE.slice(0, ARCHIVE_VOICED)) add('archive', n.text, '[tired] [slowly]');
  return out;
}

interface Batch {
  id: string;
  speaker: Speaker;
  lines: string[];
  prompt: string;
}

function batches(): Batch[] {
  const lines = allLines();
  const out: Batch[] = [];
  const bySpeaker = new Map<Speaker, Line[]>();
  for (const l of lines) bySpeaker.set(l.speaker, [...(bySpeaker.get(l.speaker) ?? []), l]);
  for (const [sp, ls] of bySpeaker) {
    let cur: Line[] = [];
    let len = 0;
    const flush = () => {
      if (!cur.length) return;
      const prompt = cur.map((l) => `${l.tag} ${direct(l.text)}`).join(' [long pause] ');
      out.push({ id: `${sp}${out.filter((b) => b.speaker === sp).length + 1}`, speaker: sp, lines: cur.map((l) => l.id), prompt });
      cur = [];
      len = 0;
    };
    const max = sp === 'archive' ? 700 : 850;
    for (const l of ls) {
      if (len + l.text.length > max) flush();
      cur.push(l);
      len += l.text.length + 20;
    }
    flush();
  }
  return out;
}

const SRC = 'assets-src/vo';
const OUT = 'public/assets/vo';

function parse(err: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let s = -1;
  for (const m of err.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (m[1] === 'start') s = Number(m[2]);
    else if (s >= 0) {
      out.push({ start: s, end: Number(m[2]) });
      s = -1;
    }
  }
  return out;
}

function duration(file: string): number {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());
}

/**
 * Choose N−1 cut points among the detected silences so every clip's length matches its text
 * (seconds ∝ characters), preferring longer silences. Dynamic programming over candidates.
 */
function align(sil: { start: number; end: number }[], texts: string[], total: number): [number, number][] {
  const n = texts.length;
  if (n === 1) return [[0, total]];
  const w = texts.map((t) => Math.max(8, t.length));
  const sum = w.reduce((a, c) => a + c, 0);
  const speech = total - 0.6 * (n - 1);
  const expect = w.map((x) => (x / sum) * speech);
  const m = sil.length;
  const segCost = (a: number, e: number, i: number) => {
    const d = Math.max(0.05, e - a);
    const r = Math.log(d / expect[i]);
    return r * r;
  };
  const gapBonus = (j: number) => 0.6 * Math.min(1.2, sil[j].end - sil[j].start);
  // dp[k][j]: best cost with the k-th cut (0-based) at silence j.
  const dp: number[][] = Array.from({ length: n - 1 }, () => new Array(m).fill(Infinity));
  const from: number[][] = Array.from({ length: n - 1 }, () => new Array(m).fill(-1));
  for (let j = 0; j < m; j++) dp[0][j] = segCost(0, sil[j].start, 0) - gapBonus(j);
  for (let k = 1; k < n - 1; k++)
    for (let j = k; j < m; j++)
      for (let p = k - 1; p < j; p++) {
        const c = dp[k - 1][p] + segCost(sil[p].end, sil[j].start, k) - gapBonus(j);
        if (c < dp[k][j]) {
          dp[k][j] = c;
          from[k][j] = p;
        }
      }
  let best = Infinity,
    bj = -1;
  for (let j = 0; j < m; j++) {
    const c = dp[n - 2][j] + segCost(sil[j].end, total, n - 1);
    if (c < best) {
      best = c;
      bj = j;
    }
  }
  const cuts: number[] = [];
  for (let k = n - 2, j = bj; k >= 0; k--) {
    cuts.unshift(j);
    j = from[k][j];
  }
  const segs: [number, number][] = [];
  let t = 0;
  for (const j of cuts) {
    segs.push([t, sil[j].start + 0.06]);
    t = Math.max(t, sil[j].end - 0.08);
  }
  segs.push([t, total]);
  return segs;
}

function split(batchId: string, file: string): void {
  const script = JSON.parse(readFileSync(join(SRC, 'script.json'), 'utf8')) as { batches: Batch[]; lines: Line[] };
  const b = script.batches.find((x) => x.id === batchId);
  if (!b) throw new Error(`no batch ${batchId}`);
  const total = duration(file);
  // ffmpeg prints silencedetect to stderr even on success; run it with stderr captured.
  const res = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${file}" -af silencedetect=noise=-38dB:d=0.22 -f null - 2>&1`], { encoding: 'utf8' });
  const sil = parse(res).filter((x) => x.start > 0.05 && x.end < total - 0.05);
  const n = b.lines.length;
  if (n > 1 && sil.length < n - 1) throw new Error(`${batchId}: found ${sil.length} gaps, need ${n - 1}`);
  const texts = b.lines.map((id) => script.lines.find((l) => l.id === id)!.text);
  const segs = align(sil, texts, total);
  // Sanity: seconds per character should be roughly constant within a batch.
  const rates = segs.map(([a, e], i) => (e - a) / Math.max(8, texts[i].length));
  const med = [...rates].sort((a, c) => a - c)[Math.floor(rates.length / 2)];
  const bad = rates.map((r, i) => (r > med * 2 || r < med / 2 ? i : -1)).filter((i) => i >= 0);
  if (bad.length) throw new Error(`${batchId}: clip lengths don't match text at ${bad.join(',')}: ${rates.map((r) => r.toFixed(3)).join(' ')}`);
  mkdirSync(OUT, { recursive: true });
  segs.forEach(([a, e], i) => {
    const out = join(OUT, `${b.lines[i]}.mp3`);
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', a.toFixed(3), '-to', e.toFixed(3), '-i', file, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,afade=t=in:d=0.01', '-ac', '1', '-ar', '22050', '-b:a', '48k', out]);
  });
  console.log(`${batchId}: ${n} clips (${segs.map(([a, e]) => (e - a).toFixed(1)).join(' ')})`);
}

function index(): void {
  const files = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith('.mp3')) : [];
  const ids = new Set(files.map((f) => f.replace(/\.mp3$/, '')));
  const out: Record<string, number> = {};
  for (const l of allLines()) if (ids.has(l.id)) out[l.id] = Math.round(duration(join(OUT, `${l.id}.mp3`)) * 100) / 100;
  writeFileSync('src/assets/vo.json', JSON.stringify(out, null, 0) + '\n');
  console.log(`${Object.keys(out).length}/${allLines().length} lines voiced`);
}

const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'script') {
  const bs = batches();
  mkdirSync(SRC, { recursive: true });
  writeFileSync(join(SRC, 'script.json'), JSON.stringify({ voices: VOICES, batches: bs, lines: allLines() }, null, 1));
  const chars = bs.reduce((n, b) => n + b.prompt.length, 0);
  console.log(`${bs.length} batches, ${allLines().length} lines, ${chars} chars`);
  for (const b of bs) console.log(b.id, b.lines.length, b.prompt.length);
} else if (cmd === 'split') split(a1, a2);
else if (cmd === 'index') index();
else console.log('usage: vo.ts script | split <batch> <file> | index');
