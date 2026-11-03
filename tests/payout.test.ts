import { describe, expect, it } from 'vitest';
import { RING, cash, k, makeGame, wheelWith } from './helpers';

describe('payout pipeline (§8 order)', () => {
  it('1. base cash goes to the Tray, not the Vault', () => {
    const g = makeGame(wheelWith(cash(100)));
    const r = g.spinForced(0, RING.x1);
    expect(r.payout.cash).toBe(100);
    expect(g.run.tray).toBe(100);
    expect(g.run.vault).toBe(0);
  });

  it('2. inner ring multiplies cash', () => {
    const g = makeGame(wheelWith(cash(100)));
    expect(g.spinForced(0, RING.x3).payout.cash).toBe(300);
  });

  it('2. inner ring ×0 zeroes cash', () => {
    const g = makeGame(wheelWith(cash(100)));
    expect(g.spinForced(0, RING.x0).payout.cash).toBe(0);
  });

  it('2. inner ring does not affect prizes', () => {
    const g = makeGame(wheelWith(k('token')));
    const before = g.run.tokens;
    g.spinForced(0, RING.x0);
    expect(g.run.tokens).toBe(before + 2);
  });

  it('3. streak grows +0.25 per spin and multiplies cash', () => {
    const g = makeGame(wheelWith(cash(100)));
    g.spinForced(1, RING.x1); // dud
    expect(g.run.streak).toBe(1.25);
    const r = g.spinForced(0, RING.x1);
    expect(r.payout.cash).toBe(125);
    expect(g.run.streak).toBe(1.5);
  });

  it('boost adds +×1 to the next spin multiplier then clears', () => {
    const g = makeGame(wheelWith(k('boost'), cash(100)));
    g.spinForced(0, RING.x1);
    expect(g.run.boost).toBe(1);
    const r = g.spinForced(1, RING.x2);
    expect(r.payout.cash).toBe(Math.round(100 * 3 * 1.25));
    expect(g.run.boost).toBe(0);
  });

  it('marquee shows each step in sequence', () => {
    const g = makeGame(wheelWith(cash(100), cash(100)));
    g.spinForced(5, RING.x1);
    const r = g.spinForced(0, RING.x2);
    expect(r.payout.marquee).toContain('$100');
    expect(r.payout.marquee).toContain('×2');
    expect(r.payout.marquee).toContain('STREAK');
    expect(r.payout.marquee).toMatch(/= \$250$/);
  });

  it('respin gives back the spin', () => {
    const g = makeGame(wheelWith(k('respin')));
    const s = g.run.spinsLeft;
    g.spinForced(0, RING.x1);
    expect(g.run.spinsLeft).toBe(s);
  });

  it('jackpot pays $1000 and counts as cash', () => {
    const g = makeGame(wheelWith({ kind: 'jackpot', value: 1000, width: 6 }));
    const r = g.spinForced(0, RING.x2);
    expect(r.payout.cash).toBe(2000);
    expect(g.run.stats.jackpots).toBe(1);
  });

  it('tax takes 10% of the Vault', () => {
    const g = makeGame(wheelWith(k('tax')));
    g.run.vault = 1000;
    g.spinForced(0, RING.x1);
    expect(g.run.vault).toBe(900);
  });

  it('dud pays nothing', () => {
    const g = makeGame(wheelWith(cash(100)));
    const r = g.spinForced(3, RING.x3);
    expect(r.payout.cash).toBe(0);
    expect(g.run.tray).toBe(0);
  });
});

describe('bankrupt & let it ride', () => {
  it('bankrupt empties the Tray and resets the Streak', () => {
    const g = makeGame(wheelWith(cash(100), k('bankrupt')));
    g.spinForced(0, RING.x1);
    g.spinForced(0, RING.x1);
    expect(g.run.tray).toBeGreaterThan(0);
    const r = g.spinForced(1, RING.x1);
    expect(r.payout.bankrupt).toBe(true);
    expect(g.run.tray).toBe(0);
    expect(g.run.streak).toBe(1);
    expect(g.run.stats.bankrupts).toBe(1);
  });

  it('bankrupt never touches the Vault', () => {
    const g = makeGame(wheelWith(cash(100), k('bankrupt')));
    g.run.vault = 500;
    g.spinForced(0, RING.x1);
    g.spinForced(1, RING.x1);
    expect(g.run.vault).toBe(500);
  });

  it('deposit sweeps the Tray into the Vault, resets Streak and costs no spin', () => {
    const g = makeGame(wheelWith(cash(100)));
    g.spinForced(0, RING.x1);
    g.spinForced(0, RING.x1);
    const spins = g.run.spinsLeft;
    const tray = g.run.tray;
    g.deposit();
    expect(g.run.vault).toBe(tray);
    expect(g.run.tray).toBe(0);
    expect(g.run.streak).toBe(1);
    expect(g.run.spinsLeft).toBe(spins);
  });

  it('vault key blocks one bankrupt', () => {
    const g = makeGame(wheelWith(cash(100), k('bankrupt'), k('vaultKey')));
    g.spinForced(2, RING.x1);
    g.spinForced(0, RING.x1);
    const tray = g.run.tray;
    const r = g.spinForced(1, RING.x1);
    expect(r.payout.bankruptBlocked).toBe(true);
    expect(g.run.tray).toBe(tray);
    g.spinForced(1, RING.x1);
    expect(g.run.tray).toBe(0);
  });

  it('insurance scratch card blocks a bankrupt', () => {
    const g = makeGame(wheelWith(cash(100), k('bankrupt')));
    g.run.scratch = ['insurance'];
    expect(g.useScratch(0)).toBe(true);
    g.spinForced(0, RING.x1);
    const r = g.spinForced(1, RING.x1);
    expect(r.payout.bankruptBlocked).toBe(true);
    expect(g.run.tray).toBe(100);
  });
});

describe('combos', () => {
  it('ECHO: same wedge type twice in a row pays ×2', () => {
    const g = makeGame(wheelWith(cash(100), cash(50)));
    g.spinForced(0, RING.x1);
    const r = g.spinForced(1, RING.x1);
    expect(r.combos).toContain('echo');
    expect(r.payout.cash).toBe(Math.round(50 * 1.25 * 2));
  });

  it('ECHO on a repeatable prize awards it again', () => {
    const g = makeGame(wheelWith(k('token'), k('token')));
    const t = g.run.tokens;
    g.spinForced(0, RING.x1);
    g.spinForced(1, RING.x1);
    expect(g.run.tokens).toBe(t + 2 + 4);
  });

  it('no ECHO across different kinds', () => {
    const g = makeGame(wheelWith(cash(100), k('token')));
    g.spinForced(0, RING.x1);
    expect(g.spinForced(1, RING.x1).combos).not.toContain('echo');
  });

  it('HAT TRICK: three cash in a row gives +3 Tokens', () => {
    const g = makeGame(wheelWith(cash(100), cash(50)));
    g.spinForced(0, RING.x1);
    g.spinForced(1, RING.x1);
    const t = g.run.tokens;
    const r = g.spinForced(0, RING.x1);
    expect(r.combos).toContain('hatTrick');
    expect(g.run.tokens).toBe(t + 3);
  });

  it('NEIGHBORS: near a boundary pays both wedges at 50%', () => {
    const g = makeGame(wheelWith(cash(100), cash(200)));
    const r = g.spinForced(0, RING.x1, { boundaryDist: 1, neighborIndex: 1 });
    expect(r.combos).toContain('neighbors');
    expect(r.payout.cash).toBe(150);
  });

  it('NEIGHBORS with a Bankrupt neighbour loses half the Tray', () => {
    const g = makeGame(wheelWith(cash(100), k('bankrupt')));
    g.run.tray = 400;
    const r = g.spinForced(0, RING.x1, { boundaryDist: 0.5, neighborIndex: 1 });
    expect(r.payout.trayLost).toBe(200);
    expect(g.run.tray).toBe(250);
  });

  it('DEAD AIR: bankrupt with Tray > Debt rings the Producer', () => {
    const g = makeGame(wheelWith(k('bankrupt')));
    g.run.tray = g.run.debt + 100;
    const r = g.spinForced(0, RING.x1);
    expect(r.combos).toContain('deadAir');
    expect(g.run.phase).toBe('PhoneCall');
    expect(g.run.phone?.reason).toBe('deadAir');
    g.phoneHangUp();
    expect(g.run.phase).toBe('AwaitAction');
  });

  it('no DEAD AIR when the Tray is below the Debt', () => {
    const g = makeGame(wheelWith(k('bankrupt')));
    g.run.tray = 10;
    expect(g.spinForced(0, RING.x1).combos).not.toContain('deadAir');
  });
});

describe('prize wedges', () => {
  it('mystery resolves to something (deterministic per seed)', () => {
    const a = makeGame(wheelWith(k('mystery')), { seed: 'M' });
    const b = makeGame(wheelWith(k('mystery')), { seed: 'M' });
    expect(a.spinForced(0, RING.x1).payout.resolvedKind).toBe(b.spinForced(0, RING.x1).payout.resolvedKind);
  });

  it('artifact wedge offers a pick of 3', () => {
    const g = makeGame(wheelWith(k('artifact')));
    g.spinForced(0, RING.x1);
    expect(g.run.phase).toBe('ArtifactPick');
    const p = g.run.pending;
    expect(p?.type === 'artifactPick' && p.options.length).toBe(3);
    if (p?.type === 'artifactPick') g.pickArtifact(p.options[1]);
    expect(g.run.artifacts).toHaveLength(1);
    expect(g.run.phase).toBe('AwaitAction');
  });

  it('interest grows the Vault 5%', () => {
    const g = makeGame(wheelWith(k('interest')));
    g.run.vault = 1000;
    g.spinForced(0, RING.x1);
    expect(g.run.vault).toBe(1050);
  });

  it('thief converts 20% of the Tray into Tokens', () => {
    const g = makeGame(wheelWith(k('thief')));
    g.run.tray = 500;
    const t = g.run.tokens;
    g.spinForced(0, RING.x1);
    expect(g.run.tray).toBe(400);
    expect(g.run.tokens).toBe(t + 2);
  });

  it('overtime gives +2 spins', () => {
    const g = makeGame(wheelWith(k('overtime')));
    const s = g.run.spinsLeft;
    g.spinForced(0, RING.x1);
    expect(g.run.spinsLeft).toBe(s + 1);
  });

  it('charge adds +1.0 Streak (plus the normal step)', () => {
    const g = makeGame(wheelWith(k('charge')));
    g.spinForced(0, RING.x1);
    expect(g.run.streak).toBe(2.25);
  });

  it('payday sweeps the Tray without resetting the Streak', () => {
    const g = makeGame(wheelWith(cash(100), k('payday')));
    g.spinForced(0, RING.x1);
    g.spinForced(1, RING.x1);
    expect(g.run.tray).toBe(0);
    expect(g.run.vault).toBe(100);
    expect(g.run.streak).toBe(1.5);
  });

  it('doubler awards the next prize twice', () => {
    const g = makeGame(wheelWith(k('doubler'), cash(100)));
    g.spinForced(0, RING.x1);
    const r = g.spinForced(1, RING.x1);
    expect(r.payout.cash).toBe(Math.round(100 * 1.25 * 2));
    expect(g.run.flags.doubler).toBe(0);
  });

  it('ring jump re-pays the previous wedge with a fresh inner ring', () => {
    const g = makeGame(wheelWith(cash(100), k('ringJump')));
    g.spinForced(0, RING.x1);
    const tray = g.run.tray;
    const r = g.spinForced(1, RING.x1);
    expect(r.ringJump).not.toBeNull();
    expect(r.ringJump!.payout).not.toBeNull();
    expect(g.run.tray).toBe(tray + r.ringJump!.payout!.cash);
  });

  it('wild copies the best cash wedge', () => {
    const g = makeGame(wheelWith(k('wild'), cash(300), cash(50)));
    expect(g.spinForced(0, RING.x1).payout.cash).toBe(300);
  });

  it('splitter halves are separate landings', () => {
    const g = makeGame(wheelWith(k('splitter'), cash(100)));
    g.run.wheel[0].halves = [
      { kind: 'cash', value: 150 },
      { kind: 'token', value: 2 },
    ];
    const L = g.layout();
    expect(L.segments[0].kind).toBe('cash');
    expect(L.segments[1].kind).toBe('token');
    expect(g.spinForced(0, RING.x1).payout.cash).toBe(150);
  });
});
