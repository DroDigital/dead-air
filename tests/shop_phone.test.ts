import { describe, expect, it } from 'vitest';
import { BARGAINS } from '../src/content/bargains';
import { Game } from '../src/game/run';
import { RING, cash, makeGame, wheelWith } from './helpers';

function toShop(seed = 'shop'): Game {
  const g = makeGame(wheelWith(cash(1000)), { pkg: 'short', seed });
  while (g.run.phase === 'AwaitAction') g.spinForced(0, RING.x1);
  g.convert(0);
  g.run.tokens = 50;
  return g;
}

describe('prize cabinet', () => {
  it('stocks 3 artifacts, 2 wedges, 1 scratch card', () => {
    const g = toShop();
    const items = g.run.shop!.items;
    expect(items.filter((i) => i.type === 'artifact')).toHaveLength(3);
    expect(items.filter((i) => i.type === 'wedge')).toHaveLength(2);
    expect(items.filter((i) => i.type === 'scratch')).toHaveLength(1);
  });

  it('buying an artifact costs Tokens and fills a shelf slot', () => {
    const g = toShop();
    const it0 = g.run.shop!.items.find((i) => i.type === 'artifact')!;
    const t = g.run.tokens;
    expect(g.shopBuy(it0.slot).ok).toBe(true);
    expect(g.run.tokens).toBe(t - it0.cost);
    expect(g.run.artifacts.map((a) => a.id)).toContain(it0.id);
    expect(g.shopBuy(it0.slot).ok).toBe(false);
  });

  it('buying a wedge asks which wedge it replaces', () => {
    const g = toShop();
    const it0 = g.run.shop!.items.find((i) => i.type === 'wedge')!;
    g.shopBuy(it0.slot);
    expect(g.run.phase).toBe('WedgeReplace');
    g.replaceWedge(3);
    expect(g.run.wheel[3].kind).toBe(it0.wedge!.kind);
    expect(g.run.phase).toBe('Shop');
  });

  it('reroll costs 1, then +1 each time', () => {
    const g = toShop();
    const t = g.run.tokens;
    g.shopReroll();
    g.shopReroll();
    expect(g.run.tokens).toBe(t - 1 - 2);
  });

  it('remove turns a wedge into a Dud; gild +50%; widen/narrow ±5°', () => {
    const g = toShop();
    g.shopRemove(0);
    expect(g.run.wheel[0].kind).toBe('dud');
    g.run.wheel[1].kind = 'cash';
    g.run.wheel[1].value = 100;
    g.shopGild(1);
    expect(g.run.wheel[1].gild).toBe(1);
    expect(g.cashValueOf(g.layout().segments[1])).toBe(150);
    const w = g.run.wheel[2].width;
    g.shopResize(2, 1);
    expect(g.run.wheel[2].width).toBe(w + 5);
    g.shopResize(2, -1);
    expect(g.run.wheel[2].width).toBe(w);
  });

  it('shop stock is deterministic per seed and independent of the wheel stream', () => {
    const a = toShop('same');
    const b = toShop('same');
    expect(a.run.shop!.items.map((i) => i.id)).toEqual(b.run.shop!.items.map((i) => i.id));
  });

  it('leaving the shop goes to the phone or the next Deadline', () => {
    const g = toShop();
    g.leaveShop();
    expect(['PhoneCall', 'PackageSelect']).toContain(g.run.phase);
  });
});

describe('the phone', () => {
  it('has at least 30 bargains with unique ids and original dialogue', () => {
    expect(BARGAINS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(BARGAINS.map((b) => b.id)).size).toBe(BARGAINS.length);
    for (const b of BARGAINS) expect(b.line.length).toBeGreaterThan(20);
  });

  it('every bargain applies cleanly to a mid-run state', () => {
    for (const b of BARGAINS) {
      const g = toShop(`bg-${b.id}`);
      g.grantArtifact('piggy_bank');
      g.run.vault = 2000;
      g.run.tokens = 10;
      g.run.marks.lastBankruptLoss = 800;
      if (b.available && !b.available(g.run)) continue;
      const params = b.roll ? b.roll(g) : {};
      expect(() => b.apply(g, params)).not.toThrow();
    }
  });

  it('$800 bargain adds cash and a Bankrupt', () => {
    const g = toShop();
    const b = BARGAINS.find((x) => x.id === 'cash_for_bankrupt')!;
    const v = g.run.vault;
    const bk = g.run.wheel.filter((w) => w.kind === 'bankrupt').length;
    b.apply(g, {});
    expect(g.run.vault).toBe(v + 800);
    expect(g.run.wheel.filter((w) => w.kind === 'bankrupt').length).toBe(bk + 1);
  });

  it('accepting a between-deadline bargain starts the next Deadline', () => {
    const g = toShop('phone-accept');
    g.run.deadline = 3; // guaranteed call
    g.leaveShop();
    expect(g.run.phase).toBe('PhoneCall');
    expect(g.run.phone!.offers).toHaveLength(2);
    g.phoneAccept(0);
    expect(g.run.phase).toBe('PackageSelect');
    expect(g.run.deadline).toBe(4);
  });

  it('hanging up three times opens the secret Other Line', () => {
    const g = toShop('secret');
    g.run.marks.hangups = 3;
    g.leaveShop();
    expect(g.run.phase).toBe('PhoneCall');
    expect(g.run.phone!.reason).toBe('secret');
    expect(g.run.marks.secretCalled).toBe(1);
  });

  it('a bargain that raises "this Debt" applies to the next Deadline', () => {
    const g = toShop('debt');
    g.run.deadline = 3;
    g.leaveShop();
    g.run.phone!.offers[0] = { bargainId: 'spins_for_debt', params: {} };
    g.phoneAccept(0);
    expect(g.run.debt).toBe(Math.round((2200 * 1.15) / 50) * 50);
    expect(g.run.nextMods.spinsDelta).toBe(3);
  });
});
