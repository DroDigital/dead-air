import { describe, expect, it } from 'vitest';
import { bargainDef } from '../src/content/bargains';
import { scratchDef } from '../src/content/scratchCards';
import { RING, cash, makeGame, wheelWith } from './helpers';

describe('regressions from the playtest pass', () => {
  it('Mannequin Hand: the 15% deposit loss applies to automatic deposits too', () => {
    const g = makeGame(wheelWith(cash(100)), { artifacts: ['mannequin_hand'] });
    g.run.tray = 100;
    g.deposit(true);
    expect(g.run.vault).toBe(85);
  });

  it('Mannequin Hand: only manual deposits keep the Streak', () => {
    const g = makeGame(wheelWith(cash(100)), { artifacts: ['mannequin_hand'] });
    g.run.streak = 2;
    g.run.tray = 100;
    g.deposit(true);
    expect(g.run.streak).toBe(2);
    g.run.tray = 100;
    g.deposit();
    expect(g.run.streak).toBe(2);
  });

  it('Severance Check: tokens are capped at 6 whenever they change', () => {
    const g = makeGame(wheelWith(), { artifacts: ['severance_check'] });
    g.addTokens(50, 'test');
    expect(g.run.tokens).toBe(6);
    g.addTokens(-2, 'test');
    expect(g.run.tokens).toBe(4);
  });

  it('Severance Check: acquiring it trims a larger purse at once', () => {
    const g = makeGame(wheelWith());
    g.run.tokens = 12;
    g.grantArtifact('severance_check');
    expect(g.run.tokens).toBe(6);
  });

  it('Polish never gilds past the two-gild cap', () => {
    const g = makeGame(wheelWith(cash(100)));
    const idx = g.run.wheel.findIndex((w) => w.kind === 'cash');
    g.run.wheel[idx].gild = 2;
    expect(scratchDef('polish').usable(g.run)).toBe(false);
    g.run.wheel[idx].gild = 1;
    expect(scratchDef('polish').usable(g.run)).toBe(true);
    scratchDef('polish').use({ run: g.run, rng: g.rng, note: () => {}, addTokens: () => {} } as never);
    expect(g.run.wheel[idx].gild).toBe(2);
  });

  it('The Understudy shares its copy\'s instance, so "once per Deadline" flags are shared', () => {
    const g = makeGame(wheelWith(cash(100)), { artifacts: ['understudy', 'iron_nerve'] });
    g.run.streak = 2;
    g.deposit();
    expect(g.run.artifacts[1].state.used).toBe(1);
    expect(g.run.streak).toBe(2);
  });

  it('The Understudy copying Trapdoor Lever consumes the real lever', () => {
    const g = makeGame(wheelWith(), { artifacts: ['understudy', 'trapdoor_lever'], pkg: 'short' });
    g.run.vault = 0;
    g.endDeadline();
    expect(g.run.artifacts.some((a) => a.id === 'trapdoor_lever')).toBe(false);
    expect(g.run.deadlines[0].paid).toBe(true);
  });

  it('Bargain "Bankrupts 5° narrower" respects the Bankrupt width floor', () => {
    const g = makeGame(wheelWith());
    const i = 5;
    g.run.wheel[i].kind = 'bankrupt';
    g.run.wheel[i].width = 12;
    g.run.tokens = 10;
    bargainDef('shrink_bankrupts').apply(g, {});
    expect(g.run.wheel[i].width).toBe(10);
  });

  it('a wheel landing on a Bankrupt in Ring ×0 still ends the spin cleanly', () => {
    const g = makeGame(wheelWith(cash(100), { kind: 'bankrupt' }));
    const r = g.spinForced(1, RING.x0);
    expect(r.payout.bankrupt).toBe(true);
  });
});
