/**
 * The Rot: one 0..1 number for how far gone the show is. The studio, the wheel, the picture
 * and the audience all read it, so the whole set decays together instead of by script.
 *
 *   - the Deadline (most of it): the show wears out on its own;
 *   - pressure: how much of the Debt is still missing while you are spinning;
 *   - scars: Bankrupts taken, body parts paid, silences breached.
 */
import type { RunState } from './types';

export interface RotParts {
  age: number;
  pressure: number;
  scars: number;
  total: number;
}

export function rotParts(run: RunState): RotParts {
  // Something is already wrong on night one; it only gets worse.
  const age = 0.2 + Math.min(1, Math.max(0, (run.deadline - 1) / 7)) * 0.5;
  const missing = run.debt > 0 ? (run.debt - run.vault - run.tray) / run.debt : 0;
  const pressure = run.phase === 'AwaitAction' ? Math.min(1, Math.max(0, missing)) * 0.15 : 0;
  const scars =
    Math.min(0.12, run.stats.bankrupts * 0.02) + (run.marks.collateral ?? 0) * 0.08 + Math.min(0.1, (run.marks.silences ?? 0) * 0.025);
  return { age, pressure, scars, total: Math.min(1, age + pressure + scars) };
}

export function rot(run: RunState): number {
  return rotParts(run).total;
}
