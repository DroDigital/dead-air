import { describe, expect, it } from 'vitest';
import { INTRO_PUSH, LOADING_BAR, LOADING_RATE, cameraAt, followProgress, loadingTime, smoothstep } from '../src/ui/bootTimeline';

describe('loading banner timing', () => {
  it('maps progress onto the banner’s own bar, clamped', () => {
    expect(loadingTime(0)).toBeCloseTo(LOADING_BAR.start);
    expect(loadingTime(1)).toBeCloseTo(LOADING_BAR.full);
    expect(loadingTime(0.5)).toBeCloseTo((LOADING_BAR.start + LOADING_BAR.full) / 2);
    expect(loadingTime(-3)).toBeCloseTo(LOADING_BAR.start);
    expect(loadingTime(7)).toBeCloseTo(LOADING_BAR.full);
  });

  it('follows real progress without passing it, and never moves back', () => {
    let shown = 0;
    let prev = 0;
    for (let i = 0; i < 400; i++) {
      const real = Math.min(1, i / 120);
      shown = followProgress(shown, real, 1 / 60);
      expect(shown).toBeLessThanOrEqual(real + 1e-9);
      expect(shown).toBeGreaterThanOrEqual(prev);
      prev = shown;
    }
    expect(shown).toBeCloseTo(1, 6);
  });

  it('climbs at the set rate when the work is already done', () => {
    expect(followProgress(0, 1, 1)).toBeCloseTo(LOADING_RATE, 6);
  });

  it('holds still when the real progress dips', () => {
    expect(followProgress(0.6, 0.2, 0.1)).toBeCloseTo(0.6, 6);
  });
});

describe('intro camera push', () => {
  it('is at rest before the raise and holds its peak after the ease', () => {
    expect(cameraAt(0)).toEqual({ scale: 1, blur: 0 });
    expect(cameraAt(INTRO_PUSH.at - 1)).toEqual({ scale: 1, blur: 0 });
    const peak = cameraAt(INTRO_PUSH.at + INTRO_PUSH.ease + 5);
    expect(peak.scale).toBeCloseTo(INTRO_PUSH.scale, 6);
    expect(peak.blur).toBeCloseTo(INTRO_PUSH.blur, 6);
  });

  it('eases in monotonically, with a blur that never goes negative', () => {
    let prev = cameraAt(INTRO_PUSH.at).scale;
    for (let t = INTRO_PUSH.at; t <= INTRO_PUSH.at + INTRO_PUSH.ease; t += 0.02) {
      const c = cameraAt(t);
      expect(c.scale).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(c.blur).toBeGreaterThanOrEqual(0);
      prev = c.scale;
    }
  });
});

describe('smoothstep', () => {
  it('is 0 at a, 1 at b, clamped outside, and halfway at the midpoint', () => {
    expect(smoothstep(1, 2, 0)).toBe(0);
    expect(smoothstep(1, 2, 1)).toBe(0);
    expect(smoothstep(1, 2, 2)).toBe(1);
    expect(smoothstep(1, 2, 9)).toBe(1);
    expect(smoothstep(1, 2, 1.5)).toBeCloseTo(0.5, 6);
  });
});
