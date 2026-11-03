/**
 * Starting wheels (meta-unlockable) and the base inner ring.
 */
import { BALANCE } from '../game/balance';
import type { WedgeKind } from '../game/types';

export interface WedgeSpec {
  kind: WedgeKind;
  value?: number;
  width?: number;
}

export interface StartingWheelDef {
  id: string;
  name: string;
  text: string;
  wedges: WedgeSpec[];
  ring: number[];
  /** Ratings needed to unlock (0 = available from the start). */
  unlockAt: number;
}

const C = (value: number): WedgeSpec => ({ kind: 'cash', value });
const K = (kind: WedgeKind): WedgeSpec => ({ kind });
const J: WedgeSpec = { kind: 'jackpot', value: BALANCE.jackpotValue, width: BALANCE.jackpotWidth };

/** Base inner Multiplier Ring: 4×(×1), 2×(×2), 1×(×3), 1×(×0) [BRIEF]. */
export const BASE_RING = [1, 2, 1, 0, 1, 3, 1, 2];

export const STARTING_WHEELS: readonly StartingWheelDef[] = [
  {
    id: 'standard',
    name: 'House Wheel',
    text: 'The wheel as the Network intended. 24 wedges, 2 Bankrupts, one 6° Jackpot.',
    unlockAt: 0,
    ring: BASE_RING,
    wedges: [
      C(100), K('respin'), C(25), K('bankrupt'), C(150), K('token'), C(50), K('boost'),
      C(75), K('mystery'), C(200), K('dud'), J, C(25), K('respin'), C(100),
      K('tax'), C(50), K('artifact'), C(75), K('bankrupt'), K('token'), K('boost'), K('respin'),
    ],
  },
  {
    id: 'loaded',
    name: 'Loaded Wheel',
    text: 'Fatter Cash, three Bankrupts, no Duds. Somebody tampered with it. Somebody was you.',
    unlockAt: 120,
    ring: BASE_RING,
    wedges: [
      C(200), K('respin'), C(50), K('bankrupt'), C(300), K('token'), C(100), K('boost'),
      C(150), K('bankrupt'), C(400), K('mystery'), J, C(50), K('respin'), C(200),
      K('tax'), C(100), K('artifact'), C(150), K('bankrupt'), K('token'), C(250), K('respin'),
    ],
  },
  {
    id: 'all_mystery',
    name: 'All Mystery',
    text: 'Twenty-three question marks and a Jackpot. Nobody knows what anything is. Not even the wheel.',
    unlockAt: 260,
    ring: BASE_RING,
    wedges: [...Array.from({ length: 23 }, () => K('mystery')).slice(0, 12), J, ...Array.from({ length: 11 }, () => K('mystery'))],
  },
  {
    id: 'no_bankrupt',
    name: 'Safety Wheel',
    text: 'No Bankrupts at all. The inner ring, however, has three ×0s.',
    unlockAt: 420,
    ring: [1, 0, 2, 0, 1, 3, 0, 2],
    wedges: [
      C(100), K('respin'), C(25), K('dud'), C(150), K('token'), C(50), K('boost'),
      C(75), K('mystery'), C(200), K('dud'), J, C(25), K('respin'), C(100),
      K('tax'), C(50), K('artifact'), C(75), C(50), K('token'), K('boost'), K('respin'),
    ],
  },
];

export const STARTING_WHEEL_MAP: Record<string, StartingWheelDef> = Object.fromEntries(STARTING_WHEELS.map((w) => [w.id, w]));

export function startingWheel(id: string): StartingWheelDef {
  return STARTING_WHEEL_MAP[id] ?? STARTING_WHEEL_MAP.standard;
}

export interface StakeDef {
  id: number;
  name: string;
  text: string;
  unlockAt: number;
}

export const STAKES: readonly StakeDef[] = [
  { id: 0, name: 'Prime Time', text: 'The standard broadcast.', unlockAt: 0 },
  { id: 1, name: 'Late Night', text: 'Debt +15%.', unlockAt: 80 },
  { id: 2, name: 'Graveyard Shift', text: 'Debt +30%. One extra Bankrupt.', unlockAt: 200 },
  { id: 3, name: 'Dead Air', text: 'Debt +30%. One extra Bankrupt. The Prize Cabinet charges +1 Token for everything.', unlockAt: 360 },
];
