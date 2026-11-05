import { describe, expect, it } from 'vitest';
import { supportsGlyph, textWidth } from '../src/ui/bitfont';
import { worldNumber } from '../src/render/scene/worldNumbers';

describe('world display numbers', () => {
  it('preserves full numbers that fit and identifies shortened values', () => {
    expect(worldNumber(9999999, 7)).toBe('9999999');
    expect(worldNumber(10000000, 7)).toBe('~10M');
    expect(worldNumber(123456789, 7)).toBe('~123.5M');
  });
  it('stays within the display for rounding boundaries and very large values', () => {
    for (const n of [99999999, 999999999, 999999999999999, 1e30, 1e100, Number.MAX_VALUE]) {
      expect(worldNumber(n, 7).length).toBeLessThanOrEqual(7);
      expect(worldNumber(n, 7)).toMatch(/^~[0-9.]+(K|M|B|T|E\d+)$/);
      expect(textWidth(`V $${worldNumber(n, 7)}`)).toBeLessThanOrEqual(64);
      for (const ch of worldNumber(n, 7)) expect(supportsGlyph(ch)).toBe(true);
    }
    expect(worldNumber(Number.MAX_VALUE, 6)).not.toBe('∞');
  });
});
