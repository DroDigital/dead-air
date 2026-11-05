import { describe, expect, it } from 'vitest';
import { CHALLENGES } from '../src/content/challenges';
import { Game } from '../src/game/run';
import type { ChallengeEvent } from '../src/content/challenges';
import { cash, makeGame, wheelWith } from './helpers';

type Internal = { challengeEvent(e: ChallengeEvent): void };
const fire = (g: Game, e: ChallengeEvent) => (g as unknown as Internal).challengeEvent(e);
const spin = (over: Partial<Extract<ChallengeEvent, { type: 'spin' }>> = {}): ChallengeEvent => ({ type: 'spin', kind: 'cash', cash: 0, combos: [], streak: 1, tray: 0, ...over });
const withChallenge = (id: string) => {
  const g = makeGame(wheelWith(cash(100)));
  g.run.marks.chal = CHALLENGES.findIndex((c) => c.id === id) + 1;
  g.run.marks.chalProg = 0;
  g.run.marks.chalDone = 0;
  g.run.tokens = 0;
  return g;
};

describe("Sponsor's Challenge", () => {
  it('every Deadline draws one, deterministically from the seed', () => {
    const a = makeGame(wheelWith(cash(100)), { seed: 'CH' });
    const b = makeGame(wheelWith(cash(100)), { seed: 'CH' });
    expect(a.challenge()).not.toBeNull();
    expect(a.run.marks.chal).toBe(b.run.marks.chal);
    expect(a.run.marks.chal).toBeGreaterThanOrEqual(1);
    expect(a.run.marks.chal).toBeLessThanOrEqual(CHALLENGES.length);
  });

  it('count goals accumulate and pay their reward once', () => {
    const g = withChallenge('ride');
    fire(g, spin());
    fire(g, spin());
    fire(g, spin());
    expect(g.challenge()!.done).toBe(false);
    fire(g, spin());
    expect(g.challenge()!.done).toBe(true);
    expect(g.run.tokens).toBe(2);
    fire(g, spin());
    expect(g.run.tokens).toBe(2);
  });

  it('peak goals compare the best value, and risky goals pay 2', () => {
    const g = withChallenge('streak');
    fire(g, spin({ streak: 1.75 }));
    fire(g, spin({ streak: 1 }));
    expect(g.challenge()!.progress).toBe(1.75);
    fire(g, spin({ streak: 2 }));
    expect(g.run.tokens).toBe(2);
  });

  it('NO NET starts over on a deposit', () => {
    const g = withChallenge('ride');
    for (let i = 0; i < 3; i++) fire(g, spin());
    fire(g, { type: 'deposit', amount: 100 });
    expect(g.challenge()!.progress).toBe(0);
    for (let i = 0; i < 4; i++) fire(g, spin());
    expect(g.challenge()!.done).toBe(true);
  });

  it('progress survives a save round-trip', () => {
    const g = withChallenge('combo');
    const c = Game.fromState(JSON.parse(JSON.stringify(g.snapshot())));
    expect(c.challenge()!.def.id).toBe('combo');
    fire(c, spin({ combos: ['echo'] }));
    expect(c.challenge()!.done).toBe(true);
  });
});
