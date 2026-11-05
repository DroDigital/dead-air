import { describe, expect, it } from 'vitest';
import { RUN_MIGRATIONS } from '../src/core/save';
import { RUN_VERSION } from '../src/game/run';

describe('run save migrations', () => {
  it('preserves restored items and flags in v1 saves, while removing Stopwatch', () => {
    const v2 = RUN_MIGRATIONS[1]({
      v: 1, scratch: ['lock', 'peek', 'hot_streak'],
      artifacts: [{ id: 'glass_eye', state: {} }, { id: 'stopwatch', state: {} }],
      flags: { lock: true, peek: 1, freeze: false },
    });
    const out = RUN_MIGRATIONS[2](v2);
    expect(out.scratch).toEqual(['lock', 'peek', 'hot_streak']);
    expect(out.artifacts).toEqual([{ id: 'glass_eye', state: {} }]);
    expect(out.flags).toEqual({ lock: true, peek: 1, freeze: false });
    expect(out.v).toBe(RUN_VERSION);
  });

  it('adds restored flags to v2 saves', () => {
    const out = RUN_MIGRATIONS[2]({ v: 2, flags: { freeze: true } });
    expect(out.flags).toEqual({ lock: false, peek: 0, freeze: true });
    expect(out.v).toBe(RUN_VERSION);
  });
});
