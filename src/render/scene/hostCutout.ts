/**
 * The host parts were cut from a paper-colored model sheet. Trim the two outermost
 * pixels of their alpha silhouettes, where the original paper remains baked into
 * the ink. RGB and interior details (including the white gloves) stay untouched.
 */
export function trimCutoutAlpha(pixels: Uint8ClampedArray, width: number, height: number): void {
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let a = 255;
      // Clamp to the image bounds: some parts intentionally end at a sheet crop.
      for (let yy = Math.max(0, y - 2); yy <= Math.min(height - 1, y + 2) && a; yy++) {
        for (let xx = Math.max(0, x - 2); xx <= Math.min(width - 1, x + 2); xx++) {
          a = Math.min(a, alpha[yy * width + xx]);
        }
      }
      pixels[(y * width + x) * 4 + 3] = a;
    }
  }
}

const cleaned = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

/** Clean each source image once, then reuse it for every pose and animation frame. */
export function cleanHostCutout(image: HTMLImageElement): HTMLCanvasElement {
  const cached = cleaned.get(image);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  trimCutoutAlpha(pixels.data, canvas.width, canvas.height);
  ctx.putImageData(pixels, 0, 0);
  cleaned.set(image, canvas);
  return canvas;
}
