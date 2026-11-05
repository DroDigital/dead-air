import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/run';
import { meterValue } from '../src/game/wheel';
import { advanceCharge, GRAB_FULL, GRAB_MIN, grabPower, type ChargeMeter } from '../src/ui/charge';

function meter(): ChargeMeter {
  return { t: 0, power: 0, peek: false, previewAt: null };
}

function previewGame(): Game {
  const g = Game.newRun({ seed: 'preview', stake: 0, startWheel: 'standard' });
  g.choosePackage('standard');
  g.run.flags.peek = 1;
  return g;
}

/** Starting wheel speed the physics derives from a release power (same seed each time, so only power differs). */
function startSpeed(power: number): number {
  return previewGame().spin(power).sim.omega0;
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

describe('spin power comes from the player', () => {
  it('a hand flick maps its speed to power: springs back below GRAB_MIN, full power at GRAB_FULL', () => {
    expect(grabPower(-GRAB_MIN)).toBe(0);
    expect(grabPower(0)).toBe(0);
    expect(grabPower(GRAB_MIN)).toBe(0);
    expect(grabPower(GRAB_FULL)).toBe(1);
    expect(grabPower(GRAB_FULL * 3)).toBe(1);
    const speeds = [GRAB_MIN + 1, 300, 500, 700, 900, GRAB_FULL];
    const powers = speeds.map(grabPower);
    for (let i = 1; i < powers.length; i++) expect(powers[i]).toBeGreaterThan(powers[i - 1]);
  });

  it('a faster hand flick starts the wheel faster', () => {
    expect(startSpeed(grabPower(900))).toBeGreaterThan(startSpeed(grabPower(300)));
  });

  it('a longer hold on the lever starts the wheel faster', () => {
    const releaseAfter = (t: number): number => {
      const c = meter();
      advanceCharge(c, t);
      return startSpeed(c.power);
    };
    expect(releaseAfter(0.75)).toBeGreaterThan(releaseAfter(0.1));
  });
});
