import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/game/balance';
import { rot } from '../src/game/rot';
import type { Game } from '../src/game/run';
import { RING, cash, k, makeGame, wheelWith } from './helpers';

/** Spin the Deadline out just short of the Debt (a near miss). */
function missNarrowly(g: Game): void {
  g.run.vault = g.run.debt - Math.floor(g.run.debt * 0.1);
  while ((g.run.phase as string) === 'AwaitAction') g.spinForced(0, RING.x1);
}

/** Hang up on any ordinary call and pick a package, so the next Deadline is spinning. */
function nextDeadline(g: Game): void {
  g.leaveShop();
  if (g.run.phase === 'PhoneCall') g.phoneHangUp();
  g.choosePackage('short');
}

describe('horror wedges', () => {
  it('the Mouth eats from the Tray on every miss and brings it back up ×2', () => {
    const g = makeGame(wheelWith(cash(100), k('mouth')));
    const mouth = g.run.wheel[1].uid;
    g.spinForced(0, RING.x1);
    expect(g.run.tray).toBe(90);
    expect(g.run.marks[`belly:${mouth}`]).toBe(10);
    g.spinForced(1, RING.x1);
    expect(g.run.tray).toBe(90 + 10 * BALANCE.mouthVomit);
    expect(g.run.marks[`belly:${mouth}`]).toBeUndefined();
  });

  it('an empty Mouth pays nothing', () => {
    const g = makeGame(wheelWith(k('mouth')));
    const r = g.spinForced(0, RING.x1);
    expect(r.payout.cash).toBe(0);
    expect(g.run.tray).toBe(0);
  });

  it('the Cleaver pays its value and severs a neighbour into a Stump', () => {
    const g = makeGame(wheelWith(k('cleaver'), cash(100)));
    const r = g.spinForced(0, RING.x1);
    expect(r.payout.cash).toBe(BALANCE.cleaverValue);
    const kinds = [g.run.wheel[1].kind, g.run.wheel[23].kind];
    expect(kinds).toContain('stump');
    expect(g.run.marks.cleaveTarget).toBeUndefined();
  });

  it('a Bleeder drains the Tray every spin until a deposit stops it', () => {
    const g = makeGame(wheelWith(k('bleeder')));
    g.spinForced(0, RING.x1);
    expect(g.run.tray).toBe(BALANCE.bleederValue);
    expect(g.run.marks.bleeding).toBe(1);
    g.spinForced(1, RING.x1);
    expect(g.run.tray).toBe(BALANCE.bleederValue - Math.floor(BALANCE.bleederValue * BALANCE.bleedRate));
    g.deposit();
    expect(g.run.marks.bleeding).toBe(0);
  });

  it('the Eye grants previews, then blinks shut into a Bankrupt', () => {
    const g = makeGame(wheelWith(k('eye')));
    const uid = g.run.wheel[0].uid;
    g.spinForced(0, RING.x1);
    expect(g.run.flags.peek).toBe(BALANCE.eyePeeks);
    expect(g.canPeek()).toBe(true);
    for (let i = 0; i < BALANCE.eyePeeks - 1; i++) g.spinForced(5, RING.x1);
    expect(g.wedgeByUid(uid)?.kind).toBe('eye');
    g.spinForced(5, RING.x1);
    expect(g.wedgeByUid(uid)?.kind).toBe('bankrupt');
  });

  it('Stitches pays each neighbour at 75% and tears open on its third landing', () => {
    const g = makeGame(wheelWith(k('stitches'), cash(100)));
    const uid = g.run.wheel[0].uid;
    const r = g.spinForced(0, RING.x1);
    expect(r.payout.cash).toBe(Math.round(100 * BALANCE.stitchWeight));
    expect(g.run.marks[`stitch:${uid}`]).toBe(1);
    g.spinForced(0, RING.x1);
    g.spinForced(0, RING.x1);
    expect(g.wedgeByUid(uid)?.kind).toBe('bankrupt');
  });
});

describe('collateral', () => {
  it('a missed Debt is paid with a finger, then an eye, then the floor', () => {
    const g = makeGame(wheelWith(), { pkg: 'short' });
    missNarrowly(g);
    expect(g.run.phone?.offers[0].bargainId).toBe('collateral_finger');
    g.phoneAccept(0);
    expect(g.run.phase).toBe('Shop');
    expect(g.run.deadlines[0].paid).toBe(true);
    expect(g.run.marks.fingers).toBe(1);
    expect(g.maxArtifacts()).toBe(BALANCE.maxArtifacts - 1);

    nextDeadline(g);
    missNarrowly(g);
    expect(g.run.phone?.offers[0].bargainId).toBe('collateral_eye');
    g.phoneAccept(0);
    expect(g.run.marks.eyeLost).toBe(1);

    nextDeadline(g);
    expect(g.run.spinsLeft).toBe(BALANCE.packages.short.spins - 1);
    g.run.flags.peek = 2;
    expect(g.canPeek()).toBe(false);
    missNarrowly(g);
    expect(g.run.phase).toBe('GameOver');
  });

  it('a rout gets no offer: the floor opens at once', () => {
    const g = makeGame(wheelWith(), { pkg: 'short' });
    for (let i = 0; i < 6; i++) g.spinForced(0, RING.x1);
    expect(g.run.phase).toBe('GameOver');
  });

  it('losing a finger drops whatever no longer fits on the shelf', () => {
    const g = makeGame(wheelWith(), { pkg: 'short', artifacts: ['lucky_penny', 'piggy_bank', 'tooth_fairy', 'coffee_ring', 'pocket_lint', 'bent_nail'] });
    expect(g.run.artifacts.length).toBe(6);
    missNarrowly(g);
    g.phoneAccept(0);
    expect(g.run.artifacts.length).toBe(5);
  });
});

describe('rot and silence', () => {
  it('rot rises with the Deadline and with scars, and stays within 0..1', () => {
    const g = makeGame(wheelWith(cash(100)));
    const r0 = rot(g.run);
    g.run.deadline = 8;
    const r1 = rot(g.run);
    expect(r1).toBeGreaterThan(r0);
    g.recordSilence();
    g.run.marks.collateral = 2;
    g.run.stats.bankrupts = 20;
    expect(rot(g.run)).toBeGreaterThan(r1);
    expect(rot(g.run)).toBeLessThanOrEqual(1);
    expect(g.run.marks.silences).toBe(1);
  });
});
