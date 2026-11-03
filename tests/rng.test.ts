import { describe, expect, it } from 'vitest';
import { Rng, cyrb128, makeStreams, restoreStreams, streamStates } from '../src/core/rng';

describe('rng (sfc32)', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng('seed-1');
    const b = new Rng('seed-1');
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('differs for different seeds', () => {
    const a = new Rng('seed-1');
    const b = new Rng('seed-2');
    let same = 0;
    for (let i = 0; i < 100; i++) if (a.nextU32() === b.nextU32()) same++;
    expect(same).toBeLessThan(3);
  });

  it('float() is in [0,1)', () => {
    const r = new Rng(42);
    for (let i = 0; i < 10000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('int(n) covers 0..n-1 roughly uniformly', () => {
    const r = new Rng(7);
    const c = new Array(6).fill(0);
    for (let i = 0; i < 60000; i++) c[r.int(6)]++;
    for (const x of c) expect(Math.abs(x - 10000)).toBeLessThan(500);
  });

  it('state round-trips exactly', () => {
    const r = new Rng('x');
    r.float();
    const s = r.getState();
    const seq = [r.nextU32(), r.nextU32(), r.nextU32()];
    const r2 = new Rng(s);
    expect([r2.nextU32(), r2.nextU32(), r2.nextU32()]).toEqual(seq);
  });

  it('clone() is independent', () => {
    const r = new Rng('c');
    const c = r.clone();
    const x = c.float();
    expect(r.float()).toBe(x);
    c.float();
    expect(r.float()).not.toBe(c.float());
  });

  it('shuffle returns a permutation', () => {
    const r = new Rng(1);
    const arr = Array.from({ length: 50 }, (_, i) => i);
    const s = r.shuffle(arr);
    expect([...s].sort((a, b) => a - b)).toEqual(arr);
    expect(s).not.toEqual(arr);
  });

  it('weightedIndex respects weights', () => {
    const r = new Rng(3);
    const c = [0, 0, 0];
    for (let i = 0; i < 30000; i++) c[r.weightedIndex([1, 2, 0])]++;
    expect(c[2]).toBe(0);
    expect(c[1] / c[0]).toBeGreaterThan(1.8);
    expect(c[1] / c[0]).toBeLessThan(2.2);
  });

  it('streams are independent: consuming one does not shift another', () => {
    const a = makeStreams('run');
    const b = makeStreams('run');
    for (let i = 0; i < 50; i++) a.shop.float();
    expect(a.wheel.float()).toBe(b.wheel.float());
    expect(a.loot.float()).toBe(b.loot.float());
  });

  it('stream states serialise and restore', () => {
    const a = makeStreams('save');
    a.events.float();
    const st = JSON.parse(JSON.stringify(streamStates(a)));
    const b = restoreStreams(st);
    expect(b.events.float()).toBe(a.events.float());
    expect(b.wheel.float()).toBe(a.wheel.float());
  });

  it('cyrb128 yields four 32-bit words', () => {
    const h = cyrb128('hello');
    expect(h).toHaveLength(4);
    for (const w of h) expect(w).toBeGreaterThanOrEqual(0);
  });
});
