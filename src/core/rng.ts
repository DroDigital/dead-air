/**
 * Seeded, deterministic RNG.
 *
 * sfc32 (Small Fast Counting, Chris Doty-Humphrey) — 128 bits of state, passes PractRand,
 * and is trivially serialisable. Seeds are expanded with cyrb128 so that string seeds and
 * nearby numeric seeds produce well-separated streams.
 *
 * A run owns several *independent* streams (wheel, shop, events, loot) so that, e.g.,
 * rerolling the shop never changes where the wheel lands.
 */

export type RngState = [number, number, number, number];

/** cyrb128 string hash -> four 32-bit words. */
export function cyrb128(str: string): RngState {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string | number | RngState) {
    const s: RngState = Array.isArray(seed) ? seed : cyrb128(String(seed));
    this.a = s[0] >>> 0;
    this.b = s[1] >>> 0;
    this.c = s[2] >>> 0;
    this.d = s[3] >>> 0;
    // An all-zero state would be degenerate.
    if ((this.a | this.b | this.c | this.d) === 0) this.d = 1;
    if (!Array.isArray(seed)) for (let i = 0; i < 15; i++) this.nextU32();
  }

  /** Raw 32-bit output. */
  nextU32(): number {
    const a = this.a,
      b = this.b,
      c = this.c,
      d = this.d;
    const t = (((a + b) | 0) + d) | 0;
    this.d = (d + 1) | 0;
    this.a = b ^ (b >>> 9);
    this.b = (c + (c << 3)) | 0;
    let cc = (c << 21) | (c >>> 11);
    cc = (cc + t) | 0;
    this.c = cc;
    return t >>> 0;
  }

  /** Float in [0, 1). */
  float(): number {
    return this.nextU32() / 4294967296;
  }

  /** Float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.float();
  }

  /** Integer in [0, n). */
  int(n: number): number {
    if (n <= 0) return 0;
    return Math.floor(this.float() * n);
  }

  /** Integer in [lo, hi] inclusive. */
  intRange(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick on empty array');
    return arr[this.int(arr.length)];
  }

  /** Pick by weight. Returns index. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return this.int(weights.length);
    let r = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    return items[this.weightedIndex(items.map(weight))];
  }

  /** Fisher–Yates, returns a new array. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }

  /** Sample k distinct items. */
  sample<T>(arr: readonly T[], k: number): T[] {
    return this.shuffle(arr).slice(0, Math.min(k, arr.length));
  }

  getState(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  setState(s: RngState): void {
    this.a = s[0] >>> 0;
    this.b = s[1] >>> 0;
    this.c = s[2] >>> 0;
    this.d = s[3] >>> 0;
  }

  clone(): Rng {
    return new Rng(this.getState());
  }

  /** Derive an independent child stream (used for per-run sub-streams). */
  fork(label: string): Rng {
    const s = this.getState();
    const r = new Rng(cyrb128(`${label}:${s.join(',')}`));
    for (let i = 0; i < 15; i++) r.nextU32();
    return r;
  }
}

export type StreamName = 'wheel' | 'shop' | 'events' | 'loot';
export const STREAM_NAMES: readonly StreamName[] = ['wheel', 'shop', 'events', 'loot'];

export type RngStreams = Record<StreamName, Rng>;
export type RngStreamStates = Record<StreamName, RngState>;

export function makeStreams(seed: string | number): RngStreams {
  const root = new Rng(seed);
  return {
    wheel: root.fork('wheel'),
    shop: root.fork('shop'),
    events: root.fork('events'),
    loot: root.fork('loot'),
  };
}

export function streamStates(s: RngStreams): RngStreamStates {
  return {
    wheel: s.wheel.getState(),
    shop: s.shop.getState(),
    events: s.events.getState(),
    loot: s.loot.getState(),
  };
}

export function restoreStreams(st: RngStreamStates): RngStreams {
  return {
    wheel: new Rng(st.wheel),
    shop: new Rng(st.shop),
    events: new Rng(st.events),
    loot: new Rng(st.loot),
  };
}

/** Random human-friendly seed string, e.g. "WAX-4821". Uses Math.random — only for *choosing* a seed. */
export function randomSeedString(): string {
  const words = ['WAX', 'HUM', 'TAPE', 'DUST', 'BULB', 'LINT', 'MOTH', 'RUST', 'GLUE', 'FUZZ', 'SOOT', 'HISS'];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `${w}-${n}`;
}
