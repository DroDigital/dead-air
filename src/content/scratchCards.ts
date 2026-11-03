/**
 * Scratch Cards — consumables (max 3). Each is used from the card slot by the Tray.
 */
import type { GameOps } from '../game/hooks';
import type { RunState } from '../game/types';

export interface ScratchDef {
  id: string;
  name: string;
  text: string;
  /** Where it can be used. */
  when: 'spin' | 'shop' | 'any';
  color: number;
  usable(run: RunState): boolean;
  use(ops: GameOps): void;
}

const awaiting = (r: RunState) => r.phase === 'AwaitAction';

export const SCRATCH_CARDS: readonly ScratchDef[] = [
  {
    id: 'nudge',
    name: 'Nudge',
    text: 'After your next spin stops, rotate the wheel ±1 wedge (or leave it).',
    when: 'spin',
    color: 0x4ab0ff,
    usable: (r) => awaiting(r) && !r.flags.nudge,
    use: (ops) => {
      ops.run.flags.nudge = true;
      ops.note('NUDGE ARMED');
    },
  },
  {
    id: 'insurance',
    name: 'Insurance',
    text: 'Your next Bankrupt is blocked.',
    when: 'any',
    color: 0x6ad07a,
    usable: () => true,
    use: (ops) => {
      ops.run.flags.insurance += 1;
      ops.note('INSURED');
    },
  },
  {
    id: 'lock',
    name: 'Lock',
    text: 'Your next spin lands on the same wedge as your last one.',
    when: 'spin',
    color: 0xd0a040,
    usable: (r) => awaiting(r) && r.history.length > 0 && !r.flags.lock,
    use: (ops) => {
      ops.run.flags.lock = true;
      ops.note('LOCKED');
    },
  },
  {
    id: 'hot_streak',
    name: 'Hot Streak',
    text: 'Streak +×1.',
    when: 'spin',
    color: 0xff6a2a,
    usable: awaiting,
    use: (ops) => ops.addStreak(1),
  },
  {
    id: 'reroll_shop',
    name: 'Reroll',
    text: 'A free Prize Cabinet reroll.',
    when: 'shop',
    color: 0xb07aff,
    usable: (r) => r.phase === 'Shop',
    use: (ops) => {
      if (ops.run.shop) ops.run.shop.freeRerolls += 1;
      ops.note('FREE REROLL');
    },
  },
  {
    id: 'freeze',
    name: 'Freeze',
    text: 'Your next spin costs no spin.',
    when: 'spin',
    color: 0x9fe8ff,
    usable: (r) => awaiting(r) && !r.flags.freeze,
    use: (ops) => {
      ops.run.flags.freeze = true;
      ops.note('FROZEN');
    },
  },
  {
    id: 'peek',
    name: 'Peek',
    text: 'Preview where your next spin will land while charging.',
    when: 'spin',
    color: 0xf0f0f0,
    usable: awaiting,
    use: (ops) => {
      ops.run.flags.peek += 1;
      ops.note('PEEK READY');
    },
  },
  {
    id: 'polish',
    name: 'Polish',
    text: 'Gild a random Cash wedge (+50% value).',
    when: 'any',
    color: 0xffe070,
    usable: (r) => r.wheel.some((w) => w.kind === 'cash'),
    use: (ops) => {
      const cash = ops.run.wheel.filter((w) => w.kind === 'cash');
      const w = ops.rng.loot.pick(cash);
      w.gild += 1;
      ops.note(`GILDED $${w.value}`);
    },
  },
  {
    id: 'lucky_coin',
    name: 'Lucky Coin',
    text: '+3 Tokens.',
    when: 'any',
    color: 0xe0a030,
    usable: () => true,
    use: (ops) => ops.addTokens(3, 'lucky coin'),
  },
  {
    id: 'safe_deposit',
    name: 'Safe Deposit',
    text: 'Your next Deposit keeps your Streak.',
    when: 'spin',
    color: 0x80a0b0,
    usable: (r) => awaiting(r) && !r.flags.safeDeposit,
    use: (ops) => {
      ops.run.flags.safeDeposit = true;
      ops.note('SAFE DEPOSIT');
    },
  },
  {
    id: 'static_burst',
    name: 'Static Burst',
    text: 'For your next spin, a random wedge becomes a Jackpot.',
    when: 'spin',
    color: 0xc0c0c0,
    usable: (r) => awaiting(r) && !r.flags.staticBurst,
    use: (ops) => {
      ops.run.flags.staticBurst = true;
      ops.note('STATIC BURST');
    },
  },
  {
    id: 'rebate',
    name: 'Rebate',
    text: '+$150 straight into the Vault.',
    when: 'any',
    color: 0x60c080,
    usable: () => true,
    use: (ops) => ops.addVault(150, 'rebate'),
  },
];

export const SCRATCH_MAP: Record<string, ScratchDef> = Object.fromEntries(SCRATCH_CARDS.map((s) => [s.id, s]));

export function scratchDef(id: string): ScratchDef {
  const d = SCRATCH_MAP[id];
  if (!d) throw new Error(`Unknown scratch card ${id}`);
  return d;
}
