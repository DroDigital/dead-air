import { describe, expect, it } from 'vitest';
import { playRun, summarize } from '../sim/runSim';

describe('balance simulator', () => {
  it('plays complete runs for every policy without errors', () => {
    for (const p of ['deposit-every-spin', 'ride-to-3', 'ev']) {
      const r = playRun(p, `smoke-${p}`);
      expect(r.reached).toBeGreaterThanOrEqual(0);
      expect(r.spins).toBeGreaterThan(0);
    }
  });

  it('is deterministic per seed', () => {
    expect(playRun('ev', 'same')).toEqual(playRun('ev', 'same'));
  });

  it('summaries have pass rates that never increase with depth', () => {
    const rs = Array.from({ length: 12 }, (_, i) => playRun('ev', `sum-${i}`));
    const s = summarize('ev', rs);
    for (let d = 1; d < 8; d++) expect(s.passByDeadline[d]).toBeLessThanOrEqual(s.passByDeadline[d - 1]);
  });
});
