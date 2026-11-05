import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Wedge, WedgeKind } from '../src/game/types';
import {
  angleForSegment,
  computeLayout,
  emptyWidthMods,
  mod360,
  noPhysicsMods,
  ringSegmentAt,
  segmentAt,
  simulateRingOnly,
  simulateSpin,
  meterValue,
} from '../src/game/wheel';

function wedges(kinds: WedgeKind[], widths?: number[]): Wedge[] {
  return kinds.map((kind, i) => ({ uid: i + 1, kind, value: 100, width: widths?.[i] ?? 15, gild: 0, bonus: 0 }));
}
const STD = wedges([...Array(23).fill('cash'), 'jackpot'] as WedgeKind[], [...Array(23).fill(15), 6]);

describe('layout', () => {
  it('normalises widths to exactly 360°', () => {
    const L = computeLayout(STD, [], emptyWidthMods());
    expect(L.segments).toHaveLength(24);
    expect(L.segments[0].start).toBe(0);
    expect(L.segments[23].end).toBe(360);
    for (let i = 1; i < 24; i++) expect(L.segments[i].start).toBeCloseTo(L.segments[i - 1].end, 9);
  });

  it('keeps width proportions (jackpot is a sliver)', () => {
    const L = computeLayout(STD, [], emptyWidthMods());
    const j = L.segments[23];
    const c = L.segments[0];
    expect((j.end - j.start) / (c.end - c.start)).toBeCloseTo(6 / 15, 6);
  });

  it('splitter yields two half segments with an extra peg', () => {
    const w = wedges(['cash', 'splitter', 'dud']);
    w[1].halves = [
      { kind: 'token', value: 2 },
      { kind: 'cash', value: 150 },
    ];
    const L = computeLayout(w, [], emptyWidthMods());
    expect(L.segments).toHaveLength(4);
    expect(L.pegs).toHaveLength(4);
    expect(L.segments[1].kind).toBe('token');
    expect(L.segments[2].kind).toBe('cash');
    expect(L.segments[2].value).toBe(150);
    expect(L.segments[1].end - L.segments[1].start).toBeCloseTo(60, 6);
  });

  it('width mods add and multiply by kind, then clamp', () => {
    const w = wedges(['bankrupt', 'cash', 'cash', 'cash']);
    const m = emptyWidthMods();
    m.mult.bankrupt = 2;
    const L = computeLayout(w, [], m);
    expect(L.segments[0].end - L.segments[0].start).toBeCloseTo(360 * (30 / 75), 6);
    const m2 = emptyWidthMods();
    m2.mult.bankrupt = 100;
    const L2 = computeLayout(w, [], m2);
    expect(L2.segments[0].end - L2.segments[0].start).toBeCloseTo(360 * (60 / 105), 6);
  });

  it('overrides change a segment kind temporarily', () => {
    const w = wedges(['cash', 'cash']);
    const L = computeLayout(w, [{ uid: 2, half: -1, kind: 'bankrupt', value: 0, scope: 'deadline', reason: 't' }], emptyWidthMods());
    expect(L.segments[1].kind).toBe('bankrupt');
    expect(L.segments[1].overridden).toBe(true);
    expect(w[1].kind).toBe('cash');
  });

  it('segmentAt finds the segment containing an angle', () => {
    const L = computeLayout(STD, [], emptyWidthMods());
    for (const s of L.segments) {
      expect(segmentAt(L, (s.start + s.end) / 2)).toBe(s.idx);
      expect(segmentAt(L, s.start + 1e-6)).toBe(s.idx);
    }
    expect(segmentAt(L, -1)).toBe(23);
    expect(segmentAt(L, 360)).toBe(0);
  });

  it('angleForSegment puts the segment centre under the pointer', () => {
    const L = computeLayout(STD, [], emptyWidthMods());
    for (const s of L.segments) expect(segmentAt(L, mod360(-angleForSegment(L, s.idx)))).toBe(s.idx);
  });

  it('ringSegmentAt maps angles to ring segments', () => {
    expect(ringSegmentAt(8, 0)).toBe(0);
    expect(ringSegmentAt(8, -50)).toBe(1);
    expect(ringSegmentAt(8, -359)).toBe(7);
  });
});

describe('simulateSpin', () => {
  const L = computeLayout(STD, [], emptyWidthMods());
  const run = (seed: number, power: number, start = 0) =>
    simulateSpin({ layout: L, ringLen: 8, power, startAngle: start, ringStartAngle: 0 }, new Rng(seed));

  it('is deterministic (same seed + power → identical result and trace)', () => {
    const a = run(5, 0.6);
    const b = run(5, 0.6);
    expect(a.outerIndex).toBe(b.outerIndex);
    expect(a.innerIndex).toBe(b.innerIndex);
    expect(a.finalAngle).toBe(b.finalAngle);
    expect(Array.from(a.trace.outer)).toEqual(Array.from(b.trace.outer));
    expect(a.trace.ticks.length).toBe(b.trace.ticks.length);
  });

  it('consumes exactly 3 floats from the rng', () => {
    const r = new Rng(9);
    const ref = new Rng(9);
    simulateSpin({ layout: L, ringLen: 8, power: 0.3, startAngle: 0, ringStartAngle: 0 }, r);
    ref.float();
    ref.float();
    ref.float();
    expect(r.float()).toBe(ref.float());
  });

  it('the trace ends exactly at the reported landing', () => {
    const s = run(11, 0.8);
    const last = s.trace.outer[s.trace.outer.length - 1];
    expect(Math.abs(last - s.finalAngle)).toBeLessThan(1e-3);
    expect(segmentAt(L, mod360(-last))).toBe(s.outerIndex);
    expect(ringSegmentAt(8, s.trace.inner[s.trace.inner.length - 1])).toBe(s.innerIndex);
  });

  it('spins for a plausible time and several rotations', () => {
    const s = run(2, 0.5);
    expect(s.trace.duration).toBeGreaterThan(3);
    expect(s.trace.duration).toBeLessThan(15);
    expect(Math.abs(s.finalAngle) / 360).toBeGreaterThan(2);
  });

  it('more power travels further on average', () => {
    let lo = 0,
      hi = 0;
    for (let i = 0; i < 40; i++) {
      lo += Math.abs(run(100 + i, 0.05).finalAngle);
      hi += Math.abs(run(100 + i, 0.95).finalAngle);
    }
    expect(hi).toBeGreaterThan(lo * 1.4);
  });

  it('records peg ticks that slow down toward the end', () => {
    const s = run(4, 0.7);
    const t = s.trace.ticks;
    expect(t.length).toBeGreaterThan(30);
    expect(t[t.length - 1].speed).toBeLessThan(t[0].speed);
  });

  it('the inner ring settles at or after the outer wheel', () => {
    const s = run(8, 0.6);
    expect(s.trace.duration).toBeGreaterThanOrEqual(s.trace.outerStop);
  });

  it('lands roughly in proportion to wedge width', () => {
    const w = wedges(['cash', 'cash', 'cash', 'bankrupt'], [90, 90, 90, 90]);
    const L2 = computeLayout(w, [], emptyWidthMods());
    const c = [0, 0, 0, 0];
    const rng = new Rng(77);
    let a = 0;
    for (let i = 0; i < 600; i++) {
      const s = simulateSpin({ layout: L2, ringLen: 8, power: rng.float(), startAngle: a, ringStartAngle: 0, noTrace: true }, rng);
      a = s.finalAngle;
      c[s.outerIndex]++;
    }
    for (const x of c) expect(Math.abs(x - 150)).toBeLessThan(55);
  });

  it('slippery pegs + glide reduce landings on a marked segment', () => {
    const w = wedges(['bankrupt', 'cash', 'cash', 'cash', 'cash', 'cash'], [60, 60, 60, 60, 60, 60]);
    const L2 = computeLayout(w, [], emptyWidthMods());
    let plain = 0,
      loaded = 0;
    for (let i = 0; i < 400; i++) {
      const p = simulateSpin({ layout: L2, ringLen: 8, power: (i % 20) / 20, startAngle: i * 13.1, ringStartAngle: 0, noTrace: true }, new Rng(i));
      const mods = noPhysicsMods(L2);
      mods.glide[0] = true;
      mods.slippery[0] = true;
      mods.slippery[1] = true;
      const b = simulateSpin({ layout: L2, ringLen: 8, power: (i % 20) / 20, startAngle: i * 13.1, ringStartAngle: 0, noTrace: true, mods }, new Rng(i));
      if (p.outerIndex === 0) plain++;
      if (b.outerIndex === 0) loaded++;
    }
    expect(loaded).toBeLessThan(plain);
  });

  it('simulateRingOnly settles on a valid segment deterministically', () => {
    const a = simulateRingOnly(8, 10, new Rng(3));
    const b = simulateRingOnly(8, 10, new Rng(3));
    expect(a.innerIndex).toBe(b.innerIndex);
    expect(a.innerIndex).toBeGreaterThanOrEqual(0);
    expect(a.innerIndex).toBeLessThan(8);
    expect(ringSegmentAt(8, a.finalRingAngle)).toBe(a.innerIndex);
  });
});


describe('lever power meter', () => {
  it('oscillates from zero to full power and back', () => {
    expect(meterValue(0)).toBeCloseTo(0);
    expect(meterValue(0.75)).toBeCloseTo(1);
    expect(meterValue(1.5)).toBeCloseTo(0);
  });
});
