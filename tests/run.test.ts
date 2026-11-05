import { describe, expect, it } from 'vitest';
import { BALANCE, baseDebt } from '../src/game/balance';
import { Game } from '../src/game/run';
import { RING, cash, makeGame, wheelWith } from './helpers';

describe('debt & run structure', () => {
  it('Debt(d) = round50(450 × 1.7^(d−1))', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(baseDebt)).toEqual([450, 750, 1300, 2200, 3750, 6400, 10850, 18450]);
  });

  it('a run starts at Deadline 1 in package select with the starting wheel', () => {
    const g = Game.newRun({ seed: 'a', stake: 0, startWheel: 'standard' });
    expect(g.run.deadline).toBe(1);
    expect(g.run.phase).toBe('PackageSelect');
    expect(g.run.debt).toBe(450);
    expect(g.run.wheel).toHaveLength(24);
    const count = (kind: string) => g.run.wheel.filter((w) => w.kind === kind).length;
    expect(count('cash')).toBe(10);
    expect(count('respin')).toBe(3);
    expect(count('bankrupt')).toBe(2);
    expect(count('jackpot')).toBe(1);
    expect(g.run.ring).toEqual([1, 2, 1, 0, 1, 3, 1, 2]);
  });

  it('starting cash values match the brief', () => {
    const g = Game.newRun({ seed: 'a', stake: 0, startWheel: 'standard' });
    const vals = g.run.wheel.filter((w) => w.kind === 'cash').map((w) => w.value).sort((a, b) => a - b);
    expect(vals).toEqual([25, 25, 50, 50, 75, 75, 100, 100, 150, 200]);
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
    expect(g.run.phase).toBe('Conversion');
    expect(g.run.tray).toBe(0);
    expect(g.run.deadlines[0].paid).toBe(true);
  });

  it('a short Vault ends the run (Game Over)', () => {
    const g = makeGame(wheelWith(), { pkg: 'short' });
    for (let i = 0; i < 6; i++) g.spinForced(0, RING.x1);
    expect(g.run.phase).toBe('GameOver');
    expect(g.run.endedAt).toBe(1);
  });

  it('conversion: $50 per Token, remainder earns 10% interest (capped)', () => {
    const g = makeGame(wheelWith(cash(1000)), { pkg: 'short' });
    for (let i = 0; i < 6; i++) g.spinForced(0, RING.x1);
    const vault = g.run.vault;
    const res = g.convert(4);
    expect(res.tokens).toBe(4);
    const left = vault - 200;
    expect(res.interest).toBe(Math.min(BALANCE.interestCap(1), Math.floor(left * 0.1)));
    expect(g.run.phase).toBe('Shop');
  });

  it('cannot convert more than the Vault allows', () => {
    const g = makeGame(wheelWith(cash(100)), { pkg: 'short' });
    for (let i = 0; i < 6; i++) g.spinForced(0, RING.x1);
    const max = g.maxConvertible();
    expect(g.convert(9999).tokens).toBe(max);
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
    expect(g.run.phase).toBe('Conversion');
    g.convert(0);
    g.leaveShop();
    if (g.run.phase === 'PhoneCall') g.phoneHangUp();
    expect(g.run.deadline).toBe(9);
    expect(g.run.debt).toBe(baseDebt(9));
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
    const kind = o.resolution?.seg.kind;
    if (kind !== 'respin' && kind !== 'overtime') expect(g.run.spinsLeft).toBe(s);
  });
});
