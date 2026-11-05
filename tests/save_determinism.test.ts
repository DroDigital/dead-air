import { describe, expect, it } from 'vitest';
import { MemoryStorage, RUN_MIGRATIONS, META_MIGRATIONS, SaveSlot, SAVE_KEYS } from '../src/core/save';
import { META_VERSION, applyRun, computeRatings, maxStake, newMeta, type MetaState } from '../src/game/meta';
import { Game, RUN_VERSION } from '../src/game/run';
import type { RunState } from '../src/game/types';

/** Deterministic scripted player: the "inputs". */
function step(g: Game, i: number): void {
  const r = g.run;
  switch (r.phase) {
    case 'PackageSelect':
      g.choosePackage((['short', 'standard', 'marathon'] as const)[i % 3]);
      break;
    case 'AwaitAction':
      if (r.tray > 0 && r.streak >= 1.75) g.deposit();
      else g.spin(((i * 37) % 100) / 100);
      break;
    case 'ArtifactPick':
      if (r.pending?.type === 'artifactPick') g.pickArtifact(r.pending.options[i % 3] ?? null, 0);
      break;
    case 'Nudge':
      g.chooseNudge(1);
      break;
    case 'Conversion':
      g.convert(Math.floor(g.maxConvertible() / 2));
      break;
    case 'Shop': {
      const it = r.shop!.items.find((x) => x.type === 'artifact' && !x.sold && x.cost <= r.tokens);
      if (it && r.artifacts.length < 6) g.shopBuy(it.slot);
      else g.leaveShop();
      break;
    }
    case 'PhoneCall':
      if (i % 2) g.phoneAccept(0);
      else g.phoneHangUp();
      break;
    case 'WedgeReplace':
      g.replaceWedge(null);
      break;
  }
}

function play(g: Game, steps: number, from = 0): void {
  for (let i = from; i < from + steps; i++) {
    if (g.run.phase === 'GameOver' || g.run.phase === 'Victory') return;
    step(g, i);
  }
}

describe('determinism', () => {
  it('same seed + same inputs → identical run', () => {
    const a = Game.newRun({ seed: 'DET', stake: 0, startWheel: 'standard' });
    const b = Game.newRun({ seed: 'DET', stake: 0, startWheel: 'standard' });
    play(a, 300);
    play(b, 300);
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
  });

  it('different seeds diverge', () => {
    const a = Game.newRun({ seed: 'DET1', stake: 0, startWheel: 'standard' });
    const b = Game.newRun({ seed: 'DET2', stake: 0, startWheel: 'standard' });
    play(a, 40);
    play(b, 40);
    expect(JSON.stringify(a.snapshot())).not.toBe(JSON.stringify(b.snapshot()));
  });

  it('save → load mid-run continues exactly like an uninterrupted run', () => {
    const ref = Game.newRun({ seed: 'SL', stake: 1, startWheel: 'standard' });
    play(ref, 400);
    const a = Game.newRun({ seed: 'SL', stake: 1, startWheel: 'standard' });
    play(a, 137);
    const json = JSON.stringify(a.snapshot());
    const b = Game.fromState(JSON.parse(json) as RunState);
    play(b, 400 - 137, 137);
    expect(JSON.stringify(b.snapshot())).toBe(JSON.stringify(ref.snapshot()));
  });
});

describe('save slots', () => {
  it('round-trips a run through storage', () => {
    const st = new MemoryStorage();
    const slot = new SaveSlot<RunState>(SAVE_KEYS.run, RUN_VERSION, RUN_MIGRATIONS, st);
    const g = Game.newRun({ seed: 'RT', stake: 0, startWheel: 'standard' });
    play(g, 30);
    slot.save(g.snapshot());
    const loaded = slot.load()!;
    expect(loaded).toEqual(g.snapshot());
  });

  it('migrates a v0 run save to v1', () => {
    const st = new MemoryStorage();
    const g = Game.newRun({ seed: 'MIG', stake: 0, startWheel: 'standard' });
    const legacy: Record<string, unknown> = { ...g.snapshot(), v: 0, innerRing: [1, 2, 3] };
    delete legacy.ring;
    delete legacy.resume;
    delete legacy.pendingSpin;
    st.setItem(SAVE_KEYS.run, JSON.stringify({ v: 0, savedAt: 0, data: legacy }));
    const slot = new SaveSlot<RunState>(SAVE_KEYS.run, RUN_VERSION, RUN_MIGRATIONS, st);
    const loaded = slot.load()!;
    expect(loaded.ring).toEqual([1, 2, 3]);
    expect(loaded.resume).toBe('AwaitAction');
    expect(loaded.pendingSpin).toBeNull();
    expect(() => Game.fromState(loaded)).not.toThrow();
  });

  it('corrupt or future saves load as null', () => {
    const st = new MemoryStorage();
    const slot = new SaveSlot<RunState>(SAVE_KEYS.run, RUN_VERSION, RUN_MIGRATIONS, st);
    st.setItem(SAVE_KEYS.run, '{not json');
    expect(slot.load()).toBeNull();
    st.setItem(SAVE_KEYS.run, JSON.stringify({ v: 999, savedAt: 0, data: {} }));
    expect(slot.load()).toBeNull();
  });

  it('meta state round-trips and migrates', () => {
    const st = new MemoryStorage();
    const slot = new SaveSlot<MetaState>(SAVE_KEYS.meta, META_VERSION, META_MIGRATIONS, st);
    const m = newMeta();
    m.ratings = 50;
    slot.save(m);
    expect(slot.load()).toEqual(m);
    const old: Record<string, unknown> = { ...m, v: 0 };
    delete old.lifetime;
    st.setItem(SAVE_KEYS.meta, JSON.stringify({ v: 0, savedAt: 0, data: old }));
    expect(slot.load()!.lifetime.bankrupts).toBe(0);
  });
});

describe('meta', () => {
  it('offers every difficulty to a new player', () => {
    expect(maxStake(newMeta())).toBe(3);
  });

  it('ratings reward deadlines survived and scale with stake', () => {
    const g = Game.newRun({ seed: 'meta', stake: 0, startWheel: 'standard' });
    g.run.deadlines = [
      { deadline: 1, debt: 450, paid: true, vaultAfter: 0, pkg: 'standard' },
      { deadline: 2, debt: 750, paid: false, vaultAfter: 0, pkg: 'standard' },
    ];
    expect(computeRatings(g.run).total).toBe(10);
    g.run.stake = 3;
    expect(computeRatings(g.run).total).toBe(20);
  });

  it('applyRun accumulates and reports unlocks', () => {
    const m = newMeta();
    const g = Game.newRun({ seed: 'meta2', stake: 0, startWheel: 'standard' });
    g.run.deadlines = Array.from({ length: 8 }, (_, i) => ({ deadline: i + 1, debt: 0, paid: true, vaultAfter: 0, pkg: 'standard' as const }));
    const res = applyRun(m, g.run);
    expect(m.wins).toBe(1);
    expect(m.totalRatings).toBe(res.ratings.total);
    expect(res.newUnlocks.length).toBeGreaterThan(0);
  });
});
