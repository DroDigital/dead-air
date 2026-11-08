import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/run';
import { Bot, POLICIES } from '../sim/bot';
import { RING, cash, k, makeGame, wheelWith } from './helpers';

describe('rare supernatural choices', () => {
  it('offers a serializable pact and preserves the permanent price after reloading', () => {
    const g = makeGame(wheelWith(k('crossroads'), cash(100)));
    g.spinForced(0, RING.x1);
    expect(g.run.phase).toBe('SupernaturalChoice');
    expect(g.run.pending).toEqual({ type: 'supernatural', source: 'pact', options: ['fortune', 'time', 'power'] });
    const restored = Game.fromState(g.snapshot());
    expect(restored.chooseSupernatural('fortune')).toBe(true);
    expect(restored.run.vault).toBe(5000);
    const cursed = Game.fromState(restored.snapshot());
    cursed.run.tray = 1000;
    expect(cursed.deposit().lost).toBe(250);
    expect(cursed.run.vault).toBe(5750);
  });

  it('offers three blessings and declines without any effect', () => {
    const g = makeGame(wheelWith(k('angel')));
    g.spinForced(0, RING.x1);
    expect(g.run.pending).toEqual({ type: 'supernatural', source: 'blessing', options: ['grace', 'mercy', 'radiance'] });
    expect(g.chooseSupernatural('fortune')).toBe(false);
    expect(g.chooseSupernatural(null)).toBe(true);
    expect(g.run.phase).toBe('AwaitAction');
    expect(g.run.vault).toBe(0);
    expect(g.run.marks.pactCurse).toBeUndefined();
  });

  it('grants extra spins in the current and future deadlines', () => {
    const g = makeGame(wheelWith(k('angel')));
    g.spinForced(0, RING.x1);
    const before = g.run.spinsLeft;
    expect(g.chooseSupernatural('mercy')).toBe(true);
    expect(g.run.spinsLeft).toBe(before + 3);
    expect(g.spinsForPackage('short')).toBe(9);
  });

  it('grants the other choices their described benefits', () => {
    const grace = makeGame(wheelWith(k('angel')));
    grace.spinForced(0, RING.x1);
    grace.chooseSupernatural('grace');
    expect(grace.run.vault).toBe(3000);

    const time = makeGame(wheelWith(k('crossroads')));
    time.spinForced(0, RING.x1);
    const before = time.run.spinsLeft;
    time.chooseSupernatural('time');
    expect(time.run.spinsLeft).toBe(before + 6);
    expect(time.spinsForPackage('short')).toBe(12);
    expect(time.run.marks.pactCurse).toBe(1);

    const radiance = makeGame(wheelWith(k('angel'), cash(100)));
    radiance.spinForced(0, RING.x1);
    radiance.chooseSupernatural('radiance');
    radiance.run.streak = 1;
    expect(radiance.spinForced(1, RING.x1).payout.cash).toBe(150);
  });

  it('multiplies flat artifact bonuses as part of the final cash payout', () => {
    const g = makeGame(wheelWith(k('crossroads'), cash(50)), { artifacts: ['bent_nail'] });
    g.spinForced(0, RING.x1);
    g.chooseSupernatural('power');
    g.run.streak = 1;
    expect(g.spinForced(1, RING.x1).payout.cash).toBe(160);
  });

  it('increases future cash payouts with the power wish', () => {
    const g = makeGame(wheelWith(k('crossroads'), cash(100)));
    g.spinForced(0, RING.x1);
    g.chooseSupernatural('power');
    g.run.streak = 1;
    expect(g.spinForced(1, RING.x1).payout.cash).toBe(200);
  });
});

describe('rare reveal thresholds', () => {
  for (const kind of ['mystery', 'haunted'] as const) {
    for (const [roll, expected] of [[0, 'pact'], [0.004999, 'pact'], [0.005, 'blessing'], [0.009999, 'blessing'], [0.01, 'gun'], [0.014999, 'gun'], [0.015, null]] as const) {
      it(`${kind} at ${roll} reveals ${expected ?? 'an ordinary prize'}`, () => {
        const g = makeGame(wheelWith(k(kind)));
        const rng = kind === 'mystery' ? g.rng.loot : g.rng.events;
        // Mystery first checks its Bankrupt chance; other random draws use a safe value.
        let n = 0;
        rng.float = () => kind === 'mystery' && n++ === 0 ? 0.9 : n++ <= (kind === 'mystery' ? 2 : 1) ? roll : 0.5;
        const result = g.spinForced(0, RING.x1);
        const p = g.run.pending;
        expect(result.payout.resolvedKind === 'gun' ? 'gun' : p?.type === 'supernatural' ? p.source : null).toBe(expected);
      });
    }
  }
});

describe('choices on the final spin', () => {
  it('spins granted now defer the Deadline', () => {
    const g = makeGame(wheelWith(k('angel')));
    g.run.spinsLeft = 1;
    g.spinForced(0, RING.x1);
    expect(g.chooseSupernatural('mercy')).toBe(true);
    expect(g.run.phase).toBe('AwaitAction');
    expect(g.run.spinsLeft).toBe(3);
  });

  it('applies the pact curse before the automatic deposit', () => {
    const g = makeGame(wheelWith(k('crossroads')));
    g.run.spinsLeft = 1;
    g.run.tray = 1000;
    g.spinForced(0, RING.x1);
    expect(g.chooseSupernatural('fortune')).toBe(true);
    expect(g.run.deadlines[0].vaultAfter).toBe(5300); // 5000 + 750 − first Debt 450
  });
});


describe('balance simulation', () => {
  it('resolves either kind of rare choice and continues', () => {
    for (const kind of ['crossroads', 'angel'] as const) {
      const g = makeGame(wheelWith(k(kind)));
      g.spinForced(0, RING.x1);
      const bot = new Bot(POLICIES.ev, 'rare');
      expect(bot.step(g)).toBe(true);
      expect(g.run.phase).toBe('AwaitAction');
    }
  });
});
