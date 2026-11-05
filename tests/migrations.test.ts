import { describe, expect, it } from 'vitest';
import { RUN_MIGRATIONS } from '../src/core/save';
import { RUN_VERSION } from '../src/game/run';

describe('run save migrations', () => {
  it('drops the cards and artifacts removed with the sweet spot from v1 saves', () => {
    const out = RUN_MIGRATIONS[1]({
      v: 1,
      scratch: ['lock', 'peek', 'hot_streak'],
      artifacts: [
        { uid: 1, id: 'glass_eye', state: {} },
        { uid: 2, id: 'stopwatch', state: {} },
        { uid: 3, id: 'tooth_fairy', state: {} },
      ],
      flags: { lock: true, peek: 1, freeze: false },
    });
    expect(out.scratch).toEqual(['hot_streak']);
    expect((out.artifacts as { id: string }[]).map((a) => a.id)).toEqual(['tooth_fairy']);
    expect(out.flags).toEqual({ freeze: false });
    expect(out.v).toBe(2);
  });

  it('the current run version is the one the migration produces', () => {
    expect(RUN_VERSION).toBe(2);
  });
});
