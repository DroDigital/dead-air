/**
 * The Prize Cabinet: stock generation and pricing (pure functions over a Game).
 */
import { ARTIFACTS } from '../content/artifacts';
import { SCRATCH_CARDS } from '../content/scratchCards';
import { SHOP_CASH_VALUES, SPLITTER_HALVES, WEDGES, WEDGE_KINDS } from '../content/wedges';
import type { Rng } from '../core/rng';
import { BALANCE } from './balance';
import type { ArtifactDef } from './hooks';
import type { RunState, ShopItem, ShopState, Wedge, WedgeKind } from './types';

export function markup(run: RunState): number {
  return BALANCE.stakeShopMarkup[run.stake] ?? 0;
}

export function availableArtifacts(run: RunState): ArtifactDef[] {
  const owned = new Set(run.artifacts.map((a) => a.id));
  return ARTIFACTS.filter((a) => !owned.has(a.id) && (run.unlockedArtifacts === null || run.unlockedArtifacts.includes(a.id)));
}

export function rollArtifacts(run: RunState, rng: Rng, n: number, rarity?: ArtifactDef['rarity'], exclude: string[] = []): string[] {
  let pool = availableArtifacts(run).filter((a) => !exclude.includes(a.id));
  if (rarity) {
    const r = pool.filter((a) => a.rarity === rarity);
    if (r.length) pool = r;
  }
  const out: string[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const pick = rng.weighted(pool, (a) => BALANCE.rarityWeights[a.rarity] ?? 1);
    out.push(pick.id);
    pool = pool.filter((a) => a.id !== pick.id);
  }
  return out;
}

const SHOP_WEDGE_WEIGHT: Record<string, number> = { starter: 30, common: 26, uncommon: 16, rare: 7, cursed: 9 };

export function shopWedgeKinds(run: RunState): WedgeKind[] {
  return WEDGE_KINDS.filter((k) => WEDGES[k].shop && (run.unlockedWedges === null || run.unlockedWedges.includes(k)));
}

export function makeWedge(kind: WedgeKind, uid: number, rng: Rng, value?: number): Wedge {
  const def = WEDGES[kind];
  const w: Wedge = {
    uid,
    kind,
    value: value ?? def.defaultValue,
    width: kind === 'jackpot' ? BALANCE.jackpotWidth : BALANCE.baseWidth,
    gild: 0,
    bonus: 0,
  };
  if (kind === 'cash' && value === undefined) w.value = rng.pick(SHOP_CASH_VALUES);
  if (kind === 'splitter') {
    const a = rng.weighted(SPLITTER_HALVES, (h) => h.w);
    const b = rng.weighted(SPLITTER_HALVES, (h) => h.w);
    w.halves = [
      { kind: a.kind, value: a.value },
      { kind: b.kind, value: b.value },
    ];
  }
  return w;
}

export function wedgeCost(w: Wedge, run: RunState): number {
  const def = WEDGES[w.kind];
  let c = def.cost;
  if (w.kind === 'cash') c = 2 + Math.round(w.value / 100);
  return c + markup(run);
}

export function rollShop(run: RunState, rng: Rng, nextUid: () => number): ShopItem[] {
  const items: ShopItem[] = [];
  const arts = rollArtifacts(run, rng, BALANCE.shopArtifacts);
  for (const id of arts) {
    const def = ARTIFACTS.find((a) => a.id === id)!;
    items.push({ slot: items.length, type: 'artifact', id, cost: def.cost + markup(run), sold: false });
  }
  const kinds = shopWedgeKinds(run);
  for (let i = 0; i < BALANCE.shopWedges; i++) {
    const k = rng.weighted(kinds, (kk) => SHOP_WEDGE_WEIGHT[WEDGES[kk].rarity] ?? 10);
    const w = makeWedge(k, nextUid(), rng);
    items.push({ slot: items.length, type: 'wedge', id: k, wedge: w, cost: wedgeCost(w, run), sold: false });
  }
  for (let i = 0; i < BALANCE.shopScratch; i++) {
    const s = rng.pick(SCRATCH_CARDS);
    items.push({ slot: items.length, type: 'scratch', id: s.id, cost: BALANCE.scratchCost + markup(run), sold: false });
  }
  return items;
}

export function newShopState(run: RunState, rng: Rng, nextUid: () => number): ShopState {
  return {
    items: rollShop(run, rng, nextUid),
    rerolls: 0,
    rerollCost: BALANCE.rerollBase,
    freeRerolls: 0,
    crank: 0,
  };
}

export const SERVICE_COSTS = {
  remove: () => BALANCE.removeCost,
  gild: () => BALANCE.gildCost,
  resize: () => BALANCE.resizeCost,
};

export function sellValue(cost: number, sellMult: number): number {
  return Math.max(1, Math.floor(cost * BALANCE.sellFraction * sellMult));
}
