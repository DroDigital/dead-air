import { describe, expect, it } from 'vitest';
import { trimCutoutAlpha } from '../src/render/scene/hostCutout';

describe('host cutout cleanup', () => {
  it('removes the pale fringe while preserving opaque interior details and the image bounds', () => {
    const width = 9;
    const height = 9;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 1; y <= 7; y++) {
      for (let x = 1; x <= 7; x++) {
        const i = (y * width + x) * 4;
        pixels.set([240, 235, 220, 255], i);
      }
    }
    const original = pixels.slice();
    trimCutoutAlpha(pixels, width, height);
    const pixel = (x: number, y: number) => Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
    expect(pixel(1, 4)[3]).toBe(0);
    expect(pixel(2, 4)[3]).toBe(0);
    expect(pixel(3, 4)).toEqual([240, 235, 220, 255]);
    expect(pixels.length).toBe(original.length);
  });
});
