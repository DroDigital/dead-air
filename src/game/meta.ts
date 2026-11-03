/**
 * Meta-progression: Ratings earned per run, unlock thresholds, lifetime stats.
 * Pure functions over a serialisable MetaState.
 */
import { ARTIFACTS, LOCKED_ARTIFACTS } from '../content/artifacts';
import { WEDGE_KINDS } from '../content/wedges';
import { STAKES, STARTING_WHEELS } from '../content/wheels';
import { BALANCE } from './balance';
import type { RunState, WedgeKind } from './types';

export const META_VERSION = 1;

export interface MetaState {
  v: number;
  ratings: number;
  totalRatings: number;
  runs: number;
  wins: number;
  bestDeadline: number;
  bestStakeWon: number;
  seenArtifacts: string[];
  unlocked: string[];
  secretFound: boolean;
  truthFound: boolean;
  lifetime: {
    bankrupts: number;
    jackpots: number;
    phoneCalls: number;
    deadAir: number;
    maxStreak: number;
    fullShelf: number;
    spins: number;
  };
  lastSeed: string;
}

export function newMeta(): MetaState {
  return {
    v: META_VERSION,
    ratings: 0,
    totalRatings: 0,
    runs: 0,
    wins: 0,
    bestDeadline: 0,
    bestStakeWon: -1,
    seenArtifacts: [],
    unlocked: [],
    secretFound: false,
    truthFound: false,
    lifetime: { bankrupts: 0, jackpots: 0, phoneCalls: 0, deadAir: 0, maxStreak: 1, fullShelf: 0, spins: 0 },
    lastSeed: '',
  };
}

export interface Unlock {
  id: string;
  kind: 'artifact' | 'wedge' | 'wheel' | 'stake' | 'endless';
  ref: string;
  name: string;
  at: number;
}

const LOCKED_WEDGES: { kind: WedgeKind; at: number }[] = [
  { kind: 'splitter', at: 30 },
  { kind: 'wild', at: 60 },
  { kind: 'haunted', at: 90 },
  { kind: 'ringJump', at: 150 },
  { kind: 'doubler', at: 180 },
  { kind: 'cursedCash', at: 220 },
  { kind: 'payday', at: 300 },
];

/** The full unlock table, ordered by threshold of lifetime Ratings. */
export const UNLOCKS: readonly Unlock[] = (() => {
  const u: Unlock[] = [];
  LOCKED_ARTIFACTS.forEach((id, i) => {
    const a = ARTIFACTS.find((x) => x.id === id)!;
    u.push({ id: `artifact:${id}`, kind: 'artifact', ref: id, name: a.name, at: 20 + i * 35 });
  });
  for (const w of LOCKED_WEDGES) u.push({ id: `wedge:${w.kind}`, kind: 'wedge', ref: w.kind, name: w.kind, at: w.at });
  for (const w of STARTING_WHEELS) if (w.unlockAt > 0) u.push({ id: `wheel:${w.id}`, kind: 'wheel', ref: w.id, name: w.name, at: w.unlockAt });
  for (const s of STAKES) if (s.unlockAt > 0) u.push({ id: `stake:${s.id}`, kind: 'stake', ref: String(s.id), name: s.name, at: s.unlockAt });
  u.push({ id: 'endless', kind: 'endless', ref: 'endless', name: 'Endless Mode', at: 100 });
  return u.sort((a, b) => a.at - b.at);
})();

export function isUnlocked(meta: MetaState, id: string): boolean {
  const u = UNLOCKS.find((x) => x.id === id);
  if (!u) return true;
  return meta.unlocked.includes(id) || meta.totalRatings >= u.at;
}

export function unlockedArtifacts(meta: MetaState): string[] {
  return ARTIFACTS.filter((a) => !LOCKED_ARTIFACTS.includes(a.id) || isUnlocked(meta, `artifact:${a.id}`)).map((a) => a.id);
}

export function unlockedWedges(meta: MetaState): WedgeKind[] {
  return WEDGE_KINDS.filter((k) => !LOCKED_WEDGES.some((l) => l.kind === k) || isUnlocked(meta, `wedge:${k}`));
}

export function unlockedWheels(meta: MetaState): string[] {
  return STARTING_WHEELS.filter((w) => w.unlockAt === 0 || isUnlocked(meta, `wheel:${w.id}`)).map((w) => w.id);
}

export function maxStake(meta: MetaState): number {
  let m = 0;
  for (const s of STAKES) if (s.unlockAt === 0 || isUnlocked(meta, `stake:${s.id}`)) m = Math.max(m, s.id);
  return m;
}

export function endlessUnlocked(meta: MetaState): boolean {
  return isUnlocked(meta, 'endless');
}

export interface RatingsBreakdown {
  total: number;
  lines: { label: string; value: number }[];
}

/** Ratings: Deadlines survived and feats, scaled by stake. */
export function computeRatings(run: RunState): RatingsBreakdown {
  const lines: { label: string; value: number }[] = [];
  const survived = run.deadlines.filter((d) => d.paid).length;
  lines.push({ label: `Deadlines survived ×${survived}`, value: survived * BALANCE.ratingsPerDeadline });
  const won = run.deadlines.some((d) => d.paid && d.deadline === BALANCE.deadlinesPerRun);
  if (won) lines.push({ label: 'Paid off the Network', value: BALANCE.ratingsWinBonus });
  if (run.stats.jackpots > 0) lines.push({ label: `Jackpots ×${run.stats.jackpots}`, value: 4 * run.stats.jackpots });
  if (run.stats.maxStreak >= 3) lines.push({ label: `Streak ×${run.stats.maxStreak.toFixed(2)}`, value: 6 });
  if (run.stats.maxTray >= 2000) lines.push({ label: 'Tray over $2000', value: 6 });
  const combos = run.stats.combos.echo + run.stats.combos.hatTrick + run.stats.combos.neighbors;
  if (combos >= 10) lines.push({ label: `Combos ×${combos}`, value: 5 });
  if (run.stats.combos.deadAir > 0) lines.push({ label: 'DEAD AIR', value: 5 });
  if (run.marks.secretCalled) lines.push({ label: 'The Other Line', value: 10 });
  const raw = lines.reduce((a, l) => a + l.value, 0);
  const mult = BALANCE.ratingsStakeMult[run.stake] ?? 1;
  const total = Math.round(raw * mult);
  if (mult !== 1) lines.push({ label: `Stake ×${mult}`, value: total - raw });
  return { total, lines };
}

/** Fold a finished run into the meta state. Returns the newly unlocked entries. */
export function applyRun(meta: MetaState, run: RunState): { ratings: RatingsBreakdown; newUnlocks: Unlock[] } {
  const before = new Set(UNLOCKS.filter((u) => isUnlocked(meta, u.id)).map((u) => u.id));
  const ratings = computeRatings(run);
  meta.ratings += ratings.total;
  meta.totalRatings += ratings.total;
  meta.runs += 1;
  const best = Math.max(0, ...run.deadlines.filter((d) => d.paid).map((d) => d.deadline));
  meta.bestDeadline = Math.max(meta.bestDeadline, best);
  const won = run.deadlines.some((d) => d.paid && d.deadline === BALANCE.deadlinesPerRun);
  if (won) {
    meta.wins += 1;
    meta.bestStakeWon = Math.max(meta.bestStakeWon, run.stake);
  }
  const seen = new Set(meta.seenArtifacts);
  for (const a of run.artifacts) seen.add(a.id);
  for (const a of run.stats.artifactsBought) seen.add(a);
  meta.seenArtifacts = [...seen];
  if (run.marks.secretCalled) meta.secretFound = true;
  if (run.marks.truthUnlocked) meta.truthFound = true;
  const L = meta.lifetime;
  L.bankrupts += run.stats.bankrupts;
  L.jackpots += run.stats.jackpots;
  L.phoneCalls += run.stats.phoneCalls;
  L.deadAir += run.stats.combos.deadAir;
  L.maxStreak = Math.max(L.maxStreak, run.stats.maxStreak);
  L.spins += run.stats.spins;
  if (run.marks.fullShelf) L.fullShelf += 1;
  const newUnlocks = UNLOCKS.filter((u) => !before.has(u.id) && isUnlocked(meta, u.id));
  for (const u of newUnlocks) if (!meta.unlocked.includes(u.id)) meta.unlocked.push(u.id);
  return { ratings, newUnlocks };
}

/** Track partial progress during a run (seen artifacts, full shelf) without finishing it. */
export function noteRunProgress(meta: MetaState, run: RunState): void {
  const seen = new Set(meta.seenArtifacts);
  for (const a of run.artifacts) seen.add(a.id);
  meta.seenArtifacts = [...seen];
  if (run.artifacts.length >= BALANCE.maxArtifacts) run.marks.fullShelf = 1;
}
