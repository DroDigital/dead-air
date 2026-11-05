/**
 * Draws the desktop app icon (desktop/icon.png, 1024×1024): the host's TV head from the art pack in a
 * round window on the prize wheel's sunburst, all in a rounded tile inside the 824 px safe area macOS
 * expects. electron-builder converts it to .icns (macOS) and .ico (Windows); Linux uses the PNG.
 *
 *   npx tsx tools/desktop-icon.ts
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const S = 1024; // canvas
const T = 824; // the tile: macOS keeps icon artwork inside 824 px, so the tile sits in a 100 px margin
const M = (S - T) / 2;
const RX = 184; // tile corner radius (close to Apple's squircle at this size)
const C = S / 2; // centre of the tile, the wheel and the round window
const WEDGES = ['#2f7d3a', '#f2c230', '#c0472a', '#2a5d9c', '#b8862b', '#6b3a8c', '#e05aa0', '#1f6f6a']; // the wheel's colours
const GOLD = '#c89830';
const OXBLOOD = '#6a1a14';
const INK = '#140b06';

// The head art is 290 px wide (tools/art.ts cuts it from the model sheet). It is drawn at HEAD_W, and
// clipped to a round window on the TV's middle: that hides the bow tie and the strokes under the cabinet,
// and the wheel's rim, drawn over the window's edge, hides the cut.
const ART_W = 290;
const HEAD_W = 600;
const WINDOW = { x: 145, y: 118, r: 150 }; // in art pixels
const RIM_R = 326; // the rim's centre line, on the canvas

const point = (a: number, r: number) => `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
const wedges = Array.from({ length: 16 }, (_, i) => {
  const a0 = (i / 16) * Math.PI * 2 - Math.PI / 2;
  const a1 = ((i + 1) / 16) * Math.PI * 2 - Math.PI / 2;
  return `<path d="M${C} ${C}L${point(a0, 1000)}L${point(a1, 1000)}Z" fill="${WEDGES[i % WEDGES.length]}"/>`;
}).join('');

// The tile: the wheel's sunburst, darkened towards the edges so the host stands out, a gold menu-panel
// frame, and the wheel's oxblood rim with gold pinstripes round the window.
const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs>
  <clipPath id="tile"><rect x="${M}" y="${M}" width="${T}" height="${T}" rx="${RX}"/></clipPath>
  <radialGradient id="vignette" gradientUnits="userSpaceOnUse" cx="${C}" cy="${C}" r="${T * 0.62}">
    <stop offset="0.3" stop-color="${INK}" stop-opacity="0.15"/>
    <stop offset="1" stop-color="${INK}" stop-opacity="0.9"/>
  </radialGradient>
</defs>
<rect x="${M}" y="${M}" width="${T}" height="${T}" rx="${RX}" fill="${INK}"/>
<g clip-path="url(#tile)">${wedges}<rect width="${S}" height="${S}" fill="url(#vignette)"/></g>
<circle cx="${C}" cy="${C}" r="${RIM_R}" fill="none" stroke="${OXBLOOD}" stroke-width="40"/>
<circle cx="${C}" cy="${C}" r="${RIM_R - 23}" fill="none" stroke="${GOLD}" stroke-width="4"/>
<circle cx="${C}" cy="${C}" r="${RIM_R + 23}" fill="none" stroke="${GOLD}" stroke-width="4"/>
<rect x="${M + 16}" y="${M + 16}" width="${T - 32}" height="${T - 32}" rx="${RX - 16}" fill="none" stroke="${GOLD}" stroke-width="22"/>
</svg>`;

// The head, resized and clipped to the round window (anti-aliased edge). The window's centre lands on
// the canvas centre.
const headFile = fileURLToPath(new URL('../public/assets/art/host/head.png', import.meta.url));
const head = await sharp(headFile).resize({ width: HEAD_W, kernel: 'lanczos3' }).sharpen({ sigma: 0.8 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = head.info;
const scale = w / ART_W;
const wx = WINDOW.x * scale,
  wy = WINDOW.y * scale,
  wr = WINDOW.r * scale;
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    const d = Math.hypot(x + 0.5 - wx, y + 0.5 - wy);
    const cover = Math.min(1, Math.max(0, wr - d + 0.5));
    const i = (y * w + x) * 4 + 3;
    head.data[i] = Math.round(head.data[i] * cover);
  }
const headPng = await sharp(head.data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();

// A soft drop shadow: the head's own silhouette, blurred, dark and offset downwards.
const shade = Buffer.alloc(w * h * 4);
for (let i = 0; i < w * h; i++) {
  shade[i * 4] = 12;
  shade[i * 4 + 1] = 5;
  shade[i * 4 + 2] = 3;
  shade[i * 4 + 3] = Math.round(head.data[i * 4 + 3] * 0.6);
}
const shadow = await sharp(shade, { raw: { width: w, height: h, channels: 4 } }).blur(16).png().toBuffer();

const out = fileURLToPath(new URL('../desktop/icon.png', import.meta.url));
const left = Math.round(C - wx);
const top = Math.round(C - wy);
await sharp(Buffer.from(base))
  .composite([
    { input: shadow, left, top: top + 18 },
    { input: headPng, left, top },
  ])
  .png({ compressionLevel: 9 })
  .toFile(out);
console.log(`wrote ${out}`);
