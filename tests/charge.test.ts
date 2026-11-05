import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/run';
import { meterValue } from '../src/game/wheel';
import { advanceCharge, type ChargeMeter } from '../src/ui/charge';

function meter(): ChargeMeter {
  return { t: 0, power: 0, peek: false, previewAt: null };
}

function previewGame(): Game {
  const g = Game.newRun({ seed: 'preview', stake: 0, startWheel: 'standard' });
  g.choosePackage('standard');
  g.run.flags.peek = 1;
  return g;
}

describe('lever charge preview', () => {
  it('holds release power at the displayed prediction between preview refreshes', () => {
    const g = previewGame();
    const c = meter();
    advanceCharge(c, 0.4);
    c.peek = true;
    expect(advanceCharge(c, 0)).toBe(true);
    const prediction = g.previewLanding(c.power);
    expect(g.previewLanding(meterValue(0.417)).segIdx).not.toBe(prediction.segIdx);

    expect(advanceCharge(c, 0.017)).toBe(false);
    expect(advanceCharge(c, 0.017)).toBe(false);
    expect(c.power).toBe(meterValue(0.4));
    const outcome = g.spin(c.power, { peek: true });
    expect([outcome.sim.outerIndex, outcome.sim.innerIndex]).toEqual([prediction.segIdx, prediction.innerIndex]);
  });

  it('keeps the last displayed power on immediate activation and updates at the preview cadence', () => {
    const c = meter();
    advanceCharge(c, 0.4);
    const displayed = c.power;
    c.peek = true;
    // Releasing before another frame still uses the power already shown by the needle.
    expect(c.power).toBe(displayed);
    expect(advanceCharge(c, 0)).toBe(true);
    expect(advanceCharge(c, 0.05)).toBe(false);
    expect(c.power).toBe(displayed);
    expect(advanceCharge(c, 0.051)).toBe(true);
    expect(c.power).toBe(meterValue(c.t));
  });
});
