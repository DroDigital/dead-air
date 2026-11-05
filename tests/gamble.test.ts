import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/game/balance';
import { Game } from '../src/game/run';
import { cash, makeGame, wheelWith } from './helpers';

describe('Double or Nothing', () => {
  it('needs the minimum Tray and is offered once per Deadline', () => {
    const g = makeGame(wheelWith(cash(100)));
    g.run.tray = BALANCE.gambleMin - 1;
    expect(g.canGamble()).toBe(false);
    g.run.tray = BALANCE.gambleMin;
    expect(g.canGamble()).toBe(true);
    g.gamble();
    g.run.tray = BALANCE.gambleMin * 2;
    expect(g.canGamble()).toBe(false);
    expect(() => g.gamble()).toThrow();
  });

  it('doubles the Tray or empties it and resets the Streak', () => {
    let wins = 0;
    let losses = 0;
    for (let i = 0; i < 40; i++) {
      const g = makeGame(wheelWith(cash(100)), { seed: `G${i}` });
      g.run.tray = 400;
      g.run.streak = 2.5;
      const r = g.gamble();
      if (r.won) {
        wins++;
        expect(g.run.tray).toBe(800);
        expect(g.run.streak).toBe(2.5);
      } else {
        losses++;
        expect(g.run.tray).toBe(0);
        expect(g.run.streak).toBe(BALANCE.streakStart);
      }
      expect(r.stake).toBe(400);
    }
    expect(wins).toBeGreaterThan(5);
    expect(losses).toBeGreaterThan(5);
  });

  it('is even odds (expected value zero) over many seeds', () => {
    let net = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const g = makeGame(wheelWith(cash(100)), { seed: `EV${i}` });
      g.run.tray = 300;
      net += g.gamble().tray - 300;
    }
    // ±300 per flip: the mean should sit well within 3 standard errors of zero.
    expect(Math.abs(net / N)).toBeLessThan((3 * 300) / Math.sqrt(N));
  });

  it('is deterministic and survives a save round-trip', () => {
    const a = makeGame(wheelWith(cash(100)), { seed: 'DET' });
    a.run.tray = 500;
    const snap = a.snapshot();
    const b = Game.fromState(JSON.parse(JSON.stringify(snap)));
    expect(a.gamble().won).toBe(b.gamble().won);
    const c = Game.fromState(JSON.parse(JSON.stringify(a.snapshot())));
    expect(c.run.marks.gambledAt).toBe(a.run.deadline);
    expect(c.canGamble()).toBe(false);
  });
});
