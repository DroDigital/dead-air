/**
 * Sweep mutators — rule changes for Deadlines 4 and 8 (and periodically in Endless).
 */
import type { WidthMods } from '../game/wheel';
import type { RunState } from '../game/types';

export interface MutatorDef {
  id: string;
  name: string;
  text: string;
  widthMods?(m: WidthMods): void;
  ringMod?(ring: number[]): number[];
  spinsDelta?: number;
  streakStepAdd?: number;
  cashMult?: number;
  jackpotMult?: number;
  debtMult?: number;
  /** Applied once at Deadline start. */
  onStart?(run: RunState): void;
  tokenPackageMult?: number;
}

export const MUTATORS: readonly MutatorDef[] = [
  {
    id: 'double_bankrupt',
    name: 'DOUBLE TROUBLE',
    text: 'Bankrupt wedges are double width.',
    widthMods: (m) => {
      m.mult.bankrupt = (m.mult.bankrupt ?? 1) * 2;
    },
  },
  {
    id: 'no_x1',
    name: 'NO SAFE BETS',
    text: 'The inner ring has no ×1.',
    ringMod: (ring) => {
      const r = ring.filter((m) => m !== 1);
      return r.length ? r : ring;
    },
  },
  {
    id: 'blackout',
    name: 'BLACKOUT',
    text: 'One fewer spin — but Cash pays ×1.25.',
    spinsDelta: -1,
    cashMult: 1.25,
  },
  {
    id: 'skinny_jackpot',
    name: 'THE NEEDLE',
    text: 'The Jackpot is a hair-thin 3° — and pays ×3.',
    widthMods: (m) => {
      m.mult.jackpot = (m.mult.jackpot ?? 1) * 0.5;
    },
    jackpotMult: 3,
  },
  {
    id: 'hot_studio',
    name: 'HOT STUDIO',
    text: 'Streak grows twice as fast.',
    streakStepAdd: 0.25,
  },
  {
    id: 'audit',
    name: 'THE AUDIT',
    text: 'Tax wedges are triple width.',
    widthMods: (m) => {
      m.mult.tax = (m.mult.tax ?? 1) * 3;
    },
  },
  {
    id: 'zero_ring',
    name: 'NULL SIGNAL',
    text: 'An extra ×0 joins the inner ring. So does an extra ×3.',
    ringMod: (ring) => [...ring, 0, 3],
  },
  {
    id: 'no_tokens',
    name: 'BUDGET CUTS',
    text: 'Broadcast Packages give no Tokens, but every package gets +2 spins.',
    spinsDelta: 2,
    tokenPackageMult: 0,
  },
];

export const MUTATOR_MAP: Record<string, MutatorDef> = Object.fromEntries(MUTATORS.map((m) => [m.id, m]));

export function mutatorDef(id: string | null): MutatorDef | null {
  return id ? (MUTATOR_MAP[id] ?? null) : null;
}
