import { describe, expect, it } from 'vitest';
import { WEDGES, WEDGE_KINDS } from '../src/content/wedges';
import { fitGunMark, fitWedge } from '../src/render/scene/wheel';
import { supportsGlyph, textWidth } from '../src/ui/bitfont';

// The face is 256 px (radius 128), the inner ring covers the middle 0.336 of it, text is the
// 5×7 font at scale 2 (14 px tall).
const R = 128;
const HUB = (0.42 / 1.25) * R;
const GLYPH_H = 14;

const labelsFor = (kind: string): string[] => {
  if (kind === 'cash' || kind === 'cursedCash' || kind === 'jackpot') return ['$25', '$150', '$600', '$1500', '$2400', '$12000'];
  if (kind === 'token') return ['+2 TOK', '+3 TOK', '+4 TOK'];
  return [WEDGES[kind as keyof typeof WEDGES].glyph];
};

describe('wheel face layout', () => {
  it('fits the gun symbol inside a six-degree sliver', () => {
    const mark = fitGunMark(6, R, HUB);
    expect(mark).not.toBeNull();
    const { width, height, r } = mark!;
    const inner = r - height / 2;
    expect(inner).toBeGreaterThan(HUB);
    expect(r + height / 2).toBeLessThanOrEqual(R * 0.95);
    expect(width + 2.5).toBeLessThanOrEqual(2 * inner * Math.sin(3 * Math.PI / 180));
  });
  for (const kind of WEDGE_KINDS) {
    it(`every ${kind} label fits its wedge, at every width`, () => {
      for (const text of labelsFor(kind)) {
        for (let span = 4; span <= 90; span += 0.5) {
          const f = fitWedge(span, kind, text, R, HUB);
          const half = (span * Math.PI) / 360;
          const chord = (r: number) => 2 * r * Math.sin(half);
          if (f.label) {
            const { text: t, r0, r1 } = f.label;
            // Inside the wedge: as wide as an outlined glyph plus a divider where it starts, and it
            // ends before the icon and the rim band.
            expect(chord(r0)).toBeGreaterThanOrEqual(GLYPH_H + 2 + 2.5 - 1e-9);
            expect(r0).toBeGreaterThanOrEqual(HUB);
            expect(r0 + textWidth(t, 2)).toBeLessThanOrEqual(r1 + 1e-9);
            expect(r1).toBeLessThanOrEqual(R * 0.95);
            for (const ch of t) expect(supportsGlyph(ch)).toBe(true);
            // Shortened forms keep the number: never cut mid-word.
            const digits = text.replace(/\D/g, '');
            if (digits) expect(t.replace(/\D/g, '')[0]).toBe(digits[0]);
          }
          if (f.icon) {
            const inner = f.icon.r - f.icon.size / 2;
            expect(chord(inner)).toBeGreaterThanOrEqual(f.icon.size);
            expect(f.icon.r + f.icon.size / 2).toBeLessThanOrEqual(R * 0.95);
            expect(inner).toBeGreaterThan(HUB);
            if (f.label) expect(f.label.r1).toBeLessThanOrEqual(inner);
          }
        }
      }
    });
  }

  it('a standard 15° cash wedge shows its full value', () => {
    expect(fitWedge(15, 'cash', '$150', R, HUB).label?.text).toBe('$150');
    expect(fitWedge(15, 'cash', '$600', R, HUB).label?.text).toBe('$600');
  });

  it('a wide wedge carries its icon and its label together', () => {
    const f = fitWedge(30, 'cash', '$150', R, HUB);
    expect(f.label?.text).toBe('$150');
    expect(f.icon).not.toBeNull();
  });

  it('a standard wedge of a non-number kind shows its icon', () => {
    for (const k of ['respin', 'bankrupt', 'mystery', 'boost']) expect(fitWedge(15, k, WEDGES[k as keyof typeof WEDGES].glyph, R, HUB).icon).not.toBeNull();
  });

  it('preserves exact cash values when they must be shortened', () => {
    expect(fitWedge(15, 'cash', '$1050', R, HUB).label?.text).toBe('1050');
    for (const amount of [1000, 1050, 1099, 1500, 12000]) {
      for (let span = 4; span <= 90; span += 0.5) {
        const label = fitWedge(span, 'cash', `$${amount}`, R, HUB).label?.text;
        if (!label) continue;
        const displayed = Number(label.replace('$', '').replace('K', '')) * (label.endsWith('K') ? 1000 : 1);
        expect(displayed).toBe(amount);
      }
    }
  });

  it('big values shorten instead of overflowing', () => {
    expect(fitWedge(15, 'cash', '$1500', R, HUB).label?.text).toBe('1.5K');
    expect(fitWedge(15, 'token', '+2 TOK', R, HUB).label?.text).toBe('+2T');
  });
});
