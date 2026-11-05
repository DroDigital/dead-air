/**
 * The Sponsor's Challenge: one goal per Deadline, read out on the placard, paid in Tokens.
 * Each check sees one event; progress lives in run.marks (chal, chalProg, chalDone) so saves
 * need no new fields.
 */
import type { RunState, WedgeKind } from '../game/types';

export type ChallengeEvent =
  | { type: 'spin'; kind: WedgeKind; cash: number; combos: string[]; streak: number; tray: number }
  | { type: 'deposit'; amount: number };

export interface ChallengeDef {
  id: string;
  name: string;
  /** Text with {n} replaced by the target. */
  text: string;
  /** Target for this Deadline. */
  target(run: RunState): number;
  /** Progress delta from one event (counts) or a value to compare (thresholds). */
  progress(e: ChallengeEvent, run: RunState): number;
  /** 'count' accumulates progress; 'peak' keeps the best single value. */
  mode: 'count' | 'peak';
  /** Progress starts over when the player deposits. */
  resetOnDeposit?: boolean;
  /** Tokens paid on completion: risky goals pay more. */
  reward: number;
}

const round25 = (n: number) => Math.max(25, Math.round(n / 25) * 25);

export const CHALLENGES: readonly ChallengeDef[] = [
  { id: 'combo', name: 'COMBO KID', reward: 1, text: 'Score {n} combo', mode: 'count', target: () => 1, progress: (e) => (e.type === 'spin' ? e.combos.filter((c) => c !== 'deadAir').length : 0) },
  { id: 'streak', name: 'HOT HANDS', reward: 2, text: 'Ride the Streak to ×{n}', mode: 'peak', target: () => 2, progress: (e) => (e.type === 'spin' ? e.streak : 0) },
  { id: 'tray', name: 'HIGH ROLLER', reward: 2, text: 'Hold ${n} in the Tray', mode: 'peak', target: (r) => round25(r.debt * 0.45), progress: (e) => (e.type === 'spin' ? e.tray : 0) },
  { id: 'ride', name: 'NO NET', reward: 2, text: 'Ride {n} spins in a row without depositing', mode: 'count', resetOnDeposit: true, target: () => 4, progress: (e) => (e.type === 'spin' ? 1 : 0) },
  { id: 'prize', name: 'PRIZE PATROL', reward: 1, text: 'Land a Jackpot, Prize or Mystery', mode: 'count', target: () => 1, progress: (e) => (e.type === 'spin' && (e.kind === 'jackpot' || e.kind === 'artifact' || e.kind === 'mystery') ? 1 : 0) },
];


export function challengeText(def: ChallengeDef, run: RunState): string {
  return def.text.replace('{n}', String(def.target(run)));
}
