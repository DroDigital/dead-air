/**
 * Versioned localStorage persistence with forward migrations.
 *
 * Each slot stores an envelope { v, savedAt, data }. On load, the stored version is migrated
 * step by step (v → v+1 → … → current). Unknown/corrupt data loads as null, never throws.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

export function defaultStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') {
      const k = '__deadair_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return localStorage;
    }
  } catch {
    /* private mode / blocked */
  }
  return new MemoryStorage();
}

export interface Envelope<T> {
  v: number;
  savedAt: number;
  data: T;
}

/** migrations[n] upgrades data from version n to n+1. */
export type Migrations = Record<number, (data: Record<string, unknown>) => Record<string, unknown>>;

export class SaveSlot<T> {
  constructor(
    readonly key: string,
    readonly version: number,
    private readonly migrations: Migrations,
    private readonly storage: StorageLike,
  ) {}

  save(data: T): void {
    const env: Envelope<T> = { v: this.version, savedAt: Date.now(), data };
    try {
      this.storage.setItem(this.key, JSON.stringify(env));
    } catch (e) {
      console.warn(`save ${this.key} failed`, e);
    }
  }

  load(): T | null {
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const env = JSON.parse(raw) as Envelope<Record<string, unknown>>;
      if (!env || typeof env !== 'object' || typeof env.v !== 'number' || !env.data) return null;
      return this.migrate(env.v, env.data);
    } catch {
      return null;
    }
  }

  migrate(from: number, data: Record<string, unknown>): T | null {
    if (from > this.version) return null;
    let d = data;
    for (let v = from; v < this.version; v++) {
      const m = this.migrations[v];
      if (!m) return null;
      d = m(d);
    }
    return d as T;
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }

  exists(): boolean {
    try {
      return this.storage.getItem(this.key) !== null;
    } catch {
      return false;
    }
  }
}

export const SAVE_KEYS = {
  run: 'deadair.run',
  meta: 'deadair.meta',
  settings: 'deadair.settings',
} as const;

/**
 * Run-save migrations.
 * v0 → v1: early prototype saves lacked `resume`, `pendingSpin`, `marks` and per-deadline
 * history; they also stored the inner ring as `innerRing`.
 */
export const RUN_MIGRATIONS: Migrations = {
  0: (d) => {
    const out: Record<string, unknown> = { ...d };
    if (!('ring' in out) && 'innerRing' in out) out.ring = out.innerRing;
    delete out.innerRing;
    out.resume ??= 'AwaitAction';
    out.pendingSpin ??= null;
    out.marks ??= {};
    out.history ??= [];
    out.pendingQueue ??= [];
    out.overrides ??= [];
    out.v = 1;
    return out;
  },
  // v1 → v2: Lock, Peek, Glass Eye and the Stopwatch went with the sweet spot. A saved run that still holds
  // them loses those cards and artifacts, and the flags they set.
  1: (d) => {
    const out: Record<string, unknown> = { ...d };
    if (out.flags && typeof out.flags === 'object') {
      const flags: Record<string, unknown> = { ...(out.flags as Record<string, unknown>) };
      delete flags.lock;
      delete flags.peek;
      out.flags = flags;
    }
    if (Array.isArray(out.scratch)) out.scratch = (out.scratch as unknown[]).filter((id) => id !== 'lock' && id !== 'peek');
    if (Array.isArray(out.artifacts)) {
      out.artifacts = (out.artifacts as unknown[]).filter((a) => {
        const id = (a as { id?: unknown } | null)?.id;
        return id !== 'glass_eye' && id !== 'stopwatch';
      });
    }
    out.v = 2;
    return out;
  },
};

/** Meta-save migrations. v0 → v1: lifetime stats block added. */
export const META_MIGRATIONS: Migrations = {
  0: (d) => ({
    ...d,
    v: 1,
    lifetime: d.lifetime ?? { bankrupts: 0, jackpots: 0, phoneCalls: 0, deadAir: 0, maxStreak: 1, fullShelf: 0, spins: 0 },
    truthFound: d.truthFound ?? false,
    secretFound: d.secretFound ?? false,
  }),
};

/**
 * Settings migrations. v1 → v2: the default internal resolution became 640×360. v1 saves stored
 * 320×180, because the old default was written on first launch, so they all move to 640×360 once.
 */
export const SETTINGS_MIGRATIONS: Migrations = {
  1: (d) => ({ ...d, resolutionScale: 2, v: 2 }),
};
