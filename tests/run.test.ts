import { describe, expect, it } from 'vitest';
import { BALANCE, baseDebt, round50 } from '../src/game/balance';
import type { DeadlineEndResult } from '../src/game/run';
import { Game } from '../src/game/run';
import { RING, cash, makeGame, wheelWith } from './helpers';

describe('debt & run structure', () => {
  it('Debt(d) = round50(450 × 1.44^(d−1)), and from Deadline 5 it grows faster', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(baseDebt)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((d) => round50(450 * Math.pow(BALANCE.debtGrowth, d - 1))));
    const g = Game.newRun({ seed: 'late', stake: 0, startWheel: 'standard' });
    expect(g.computeDebt(4)).toBe(baseDebt(4));
    expect(g.computeDebt(6)).toBe(round50(baseDebt(6) * Math.pow(BALANCE.lateDebtGrowth, 2)));
  });

  it('the late show widens the Bankrupts every Deadline past the fourth', () => {
    const g = Game.newRun({ seed: 'late', stake: 0, startWheel: 'standard' });
    const width = () => g.layout().segments.filter((s) => s.kind === 'bankrupt').reduce((n, s) => n + (s.end - s.start), 0);
    g.run.deadline = 4;
    const w4 = width();
    g.run.deadline = 7;
    expect(width()).toBeGreaterThan(w4);
  });

  it('a run starts at Deadline 1 in package select with the starting wheel', () => {
    const g = Game.newRun({ seed: 'a', stake: 0, startWheel: 'standard' });
    expect(g.run.deadline).toBe(1);
    expect(g.run.phase).toBe('PackageSelect');
    expect(g.run.debt).toBe(450);
    expect(g.run.wheel).toHaveLength(24);
    const count = (kind: string) => g.run.wheel.filter((w) => w.kind === kind).length;
    expect(count('cash')).toBe(8);
    expect(count('respin')).toBe(1);
    for (const k of ['stitches', 'mouth', 'roulette', 'bleeder', 'hushMoney', 'encore']) expect(count(k)).toBe(1);
    expect(count('bankrupt')).toBe(2);
    expect(count('jackpot')).toBe(1);
    expect(g.run.ring).toEqual([1, 2, 1, 0, 1, 3, 1, 2]);
  });

  it('starting cash values (the House Wheel trades two small Cash wedges for horror wedges)', () => {
    const g = Game.newRun({ seed: 'a', stake: 0, startWheel: 'standard' });
    const vals = g.run.wheel.filter((w) => w.kind === 'cash').map((w) => w.value).sort((a, b) => a - b);
    expect(vals).toEqual([25, 50, 75, 75, 100, 100, 150, 200]);
  });

  it('jackpot is a 6° sliver of the layout (before normalisation)', () => {
    const g = Game.newRun({ seed: 'a', stake: 0, startWheel: 'standard' });
    const j = g.run.wheel.find((w) => w.kind === 'jackpot')!;
    expect(j.width).toBe(6);
  });

  it('packages set spins and tokens', () => {
    for (const [p, spins, tok] of [
      ['short', 6, 4],
      ['standard', 8, 2],
      ['marathon', 11, 0],
    ] as const) {
      const g = Game.newRun({ seed: 'p', stake: 0, startWheel: 'standard' });
      const t = g.run.tokens;
      g.choosePackage(p);
      expect(g.run.spinsLeft).toBe(spins);
      expect(g.run.tokens).toBe(t + tok);
    }
  });

  it('marathon turns one random wedge Bankrupt for this Deadline only', () => {
    const g = Game.newRun({ seed: 'm', stake: 0, startWheel: 'standard' });
    g.choosePackage('marathon');
    expect(g.run.overrides.filter((o) => o.reason === 'marathon')).toHaveLength(1);
    expect(g.layout().segments.filter((s) => s.kind === 'bankrupt')).toHaveLength(3);
    expect(g.run.wheel.filter((w) => w.kind === 'bankrupt')).toHaveLength(2);
  });

  it('when spins hit 0 the Tray auto-deposits and the Vault pays the Debt', () => {
    const g = makeGame(wheelWith(cash(100)), { pkg: 'short' });
    for (let i = 0; i < 5; i++) g.spinForced(0, RING.x1);
    expect(g.run.phase).toBe('AwaitAction');
    g.spinForced(0, RING.x1);
    // Nothing to convert any more: straight to the Prize Cabinet.
    expect(g.run.phase).toBe('Shop');
    expect(g.run.tray).toBe(0);
    expect(g.run.deadlines[0].paid).toBe(true);
  });

  it('a short Vault ends the run (Game Over)', () => {
    const g = makeGame(wheelWith(), { pkg: 'short' });
    for (let i = 0; i < 6; i++) g.spinForced(0, RING.x1);
    expect(g.run.phase).toBe('GameOver');
    expect(g.run.endedAt).toBe(1);
  });

  it('a near miss gets the collateral call first; hanging up opens the floor', () => {
    const g = makeGame(wheelWith(), { pkg: 'short' });
    g.run.vault = g.run.debt - 50;
    for (let i = 0; i < 6; i++) g.spinForced(0, RING.x1);
    expect(g.run.phase).toBe('PhoneCall');
    expect(g.run.phone?.reason).toBe('collateral');
    g.phoneHangUp();
    expect(g.run.phase).toBe('GameOver');
    expect(g.run.endedAt).toBe(1);
  });

  it('the Vault does not carry over: leftover cash becomes Tokens at this Deadline\'s rate', () => {
    const g = makeGame(wheelWith(cash(100)), { pkg: 'short' });
    let end: DeadlineEndResult | null = null;
    g.bus.on('deadlineEnd', (e) => (end = e));
    for (let i = 0; i < 6; i++) g.spinForced(0, RING.x1);
    const r = end as unknown as DeadlineEndResult;
    const leftover = r.vaultBefore - r.debt;
    const rate = Math.max(BALANCE.surplusTokenFloor, Math.round(450 / BALANCE.surplusTokenDivisor));
    expect(g.run.vault).toBe(0);
    expect(r.surplusTokens).toBe(Math.min(BALANCE.surplusTokenCap, Math.floor(leftover / rate)));
  });

  it('leftover Tokens are capped per Deadline', () => {
    const g = makeGame(wheelWith(cash(1000)), { pkg: 'short' });
    let end: DeadlineEndResult | null = null;
    g.bus.on('deadlineEnd', (e) => (end = e));
    for (let i = 0; i < 6; i++) g.spinForced(0, RING.x1);
    expect(g.run.vault).toBe(0);
    expect((end as unknown as DeadlineEndResult).surplusTokens).toBe(BALANCE.surplusTokenCap);
  });

  it('Tokens held when a Debt is paid earn interest: +1 per 5, at most 5', () => {
    const g = makeGame(wheelWith(), { pkg: 'short' });
    g.run.vault = g.run.debt;
    g.run.tokens = 17;
    let end: DeadlineEndResult | null = null;
    g.bus.on('deadlineEnd', (e) => (end = e));
    while (g.run.phase === 'AwaitAction') g.spinForced(0, RING.x1);
    // Interest counts the Tokens held at payment (17, plus any the Deadline paid out on the way).
    const r = end as unknown as DeadlineEndResult;
    expect(r.interestTokens).toBeGreaterThanOrEqual(3);
    expect(r.interestTokens).toBeLessThanOrEqual(BALANCE.tokenInterestCap);
    expect(g.tokenInterest(60)).toBe(BALANCE.tokenInterestCap);
  });

  it('Deadlines 4 and 8 are Sweeps with a mutator', () => {
    const g = Game.newRun({ seed: 'sw', stake: 0, startWheel: 'standard' });
    expect(g.isSweep(4)).toBe(true);
    expect(g.isSweep(8)).toBe(true);
    expect(g.isSweep(3)).toBe(false);
    g.startDeadline(4);
    expect(g.run.mutator).not.toBeNull();
  });

  it('paying Deadline 8 is Victory; Endless continues to 9', () => {
    const g = makeGame(wheelWith(cash(1000)), { pkg: 'short' });
    g.startDeadline(8);
    g.choosePackage('short');
    g.run.vault = 1_000_000;
    while (g.run.phase === 'AwaitAction') g.spinForced(0, RING.x1);
    expect(g.run.phase).toBe('Victory');
    g.continueEndless();
    expect(g.run.phase).toBe('Shop');
    g.leaveShop();
    if (g.run.phase === 'PhoneCall') g.phoneHangUp();
    expect(g.run.deadline).toBe(9);
    expect(g.run.debt).toBe(round50(baseDebt(9) * Math.pow(BALANCE.lateDebtGrowth, 5)));
  });

  it('stakes raise the Debt', () => {
    const g = Game.newRun({ seed: 's', stake: 2, startWheel: 'standard' });
    expect(g.run.debt).toBe(Math.round((450 * 1.3) / 50) * 50);
    expect(g.run.wheel.filter((w) => w.kind === 'bankrupt')).toHaveLength(3);
  });

  it('actions in the wrong phase throw', () => {
    const g = Game.newRun({ seed: 'x', stake: 0, startWheel: 'standard' });
    expect(() => g.spin(0.5)).toThrow();
    expect(() => g.deposit()).toThrow();
  });
});

describe('real spins', () => {
  it('spin runs physics and resolves the landed segment', () => {
    const g = Game.newRun({ seed: 'phys', stake: 0, startWheel: 'standard' });
    g.choosePackage('standard');
    const o = g.spin(0.5);
    expect(o.resolution).not.toBeNull();
    expect(o.resolution!.segIdx).toBe(o.sim.outerIndex);
    expect(o.sim.trace.outer.length).toBeGreaterThan(10);
  });

  it('passes the chosen power into the spin physics', () => {
    const low = Game.newRun({ seed: 'power', stake: 0, startWheel: 'standard' });
    const high = Game.newRun({ seed: 'power', stake: 0, startWheel: 'standard' });
    low.choosePackage('standard');
    high.choosePackage('standard');
    const a = low.spin(0.1);
    const b = high.spin(0.9);
    expect(a.power).toBe(0.1);
    expect(b.power).toBe(0.9);
    expect(b.sim.omega0).toBeGreaterThan(a.sim.omega0);
  });

  it('previews the exact landing without consuming the wheel RNG', () => {
    const g = Game.newRun({ seed: 'preview', stake: 0, startWheel: 'standard' });
    g.choosePackage('standard');
    g.run.scratch = ['peek'];
    expect(g.useScratch(0)).toBe(true);
    expect(g.canPeek()).toBe(true);
    const preview = g.previewLanding(0.42);
    expect(g.previewLanding(0.42)).toEqual(preview);
    const o = g.spin(0.42, { peek: true });
    expect(o.peeked).toBe(true);
    expect(g.run.flags.peek).toBe(0);
    expect([o.sim.outerIndex, o.sim.innerIndex]).toEqual([preview.segIdx, preview.innerIndex]);
  });

  it('Lock returns to the last wedge and preview matches the locked spin', () => {
    const g = Game.newRun({ seed: 'lock', stake: 0, startWheel: 'standard' });
    g.choosePackage('standard');
    const first = g.spin(0.5);
    expect(g.run.phase).toBe('AwaitAction');
    g.run.scratch = ['lock'];
    expect(g.useScratch(0)).toBe(true);
    const preview = g.previewLanding(0.9);
    const second = g.spin(0.9);
    expect(second.locked).toBe(true);
    expect(second.sim.outerIndex).toBe(first.sim.outerIndex);
    expect([second.sim.outerIndex, second.sim.innerIndex]).toEqual([preview.segIdx, preview.innerIndex]);
  });

  it('Glass Eye grants one preview per Deadline', () => {
    const g = Game.newRun({ seed: 'ge', stake: 0, startWheel: 'standard' });
    g.grantArtifact('glass_eye');
    g.choosePackage('standard');
    expect(g.canPeek()).toBe(true);
    expect(g.spin(0.5, { peek: true }).peeked).toBe(true);
    expect(g.run.artifacts.find((a) => a.id === 'glass_eye')!.state.used).toBe(1);
  });

  it('Nudge pauses resolution and moves ±1 wedge', () => {
    const g = Game.newRun({ seed: 'nudge', stake: 0, startWheel: 'standard' });
    g.choosePackage('standard');
    g.run.scratch = ['nudge'];
    g.useScratch(0);
    const o = g.spin(0.5);
    expect(o.resolution).toBeNull();
    expect(g.run.phase).toBe('Nudge');
    const r = g.chooseNudge(1);
    expect(r.segIdx).toBe((o.sim.outerIndex + 1) % o.layout.segments.length);
  });

  it('Freeze: the spin costs no spin', () => {
    const g = Game.newRun({ seed: 'fz', stake: 0, startWheel: 'standard' });
    g.choosePackage('standard');
    g.run.scratch = ['freeze'];
    g.useScratch(0);
    const s = g.run.spinsLeft;
    const o = g.spin(0.5);
    expect(o.free).toBe(true);
    // Only the spin itself is free; a landing that grants spins (Respin, Overtime, a Stitches neighbour) still adds them.
    const granted = (o.resolution?.payout.prizes ?? []).some((p) => p.kind === 'respin' || p.kind === 'overtime');
    if (!granted) expect(g.run.spinsLeft).toBe(s);
  });
});
