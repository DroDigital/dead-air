/**
 * Combo detection (pure). Effects are applied by the payout pipeline (step 5).
 */
import { BALANCE } from './balance';
import type { ComboId, SpinRecord, WedgeKind } from './types';

export const COMBO_NAMES: Record<ComboId, string> = {
  echo: 'ECHO',
  hatTrick: 'HAT TRICK',
  neighbors: 'NEIGHBORS',
  deadAir: 'DEAD AIR',
};

export const COMBO_TEXT: Record<ComboId, string> = {
  echo: 'The same wedge type twice in a row: ×2.',
  hatTrick: 'Three Cash wedges in a row: +3 Tokens.',
  neighbors: `Landing within ${BALANCE.neighborsThreshold}° of a boundary pays both wedges at 50%.`,
  deadAir: 'A Bankrupt while the Tray holds more than your Debt. The Producer will call.',
};

const NO_ECHO: readonly WedgeKind[] = ['bankrupt', 'dud', 'splitter'];

export function isEcho(prev: SpinRecord | undefined, kind: WedgeKind): boolean {
  return !!prev && prev.kind === kind && !NO_ECHO.includes(kind);
}

/** HAT TRICK fires on every 3rd consecutive Cash landing. */
export function isHatTrick(cashRunAfter: number): boolean {
  return cashRunAfter > 0 && cashRunAfter % 3 === 0;
}

export function isNeighbors(boundaryDist: number, distinctNeighbor: boolean): boolean {
  return distinctNeighbor && boundaryDist < BALANCE.neighborsThreshold;
}

export function isDeadAir(bankruptFrac: number, blocked: boolean, tray: number, debt: number): boolean {
  return bankruptFrac >= 1 && !blocked && tray > debt;
}
