/**
 * Draws the desktop app icon (desktop/icon.png, 1024×1024) as 64×64 pixel art and scales it
 * up nearest-neighbour, so it stays crisp in the game's PS1/pixel style at every size.
 * electron-builder converts it to .icns (macOS) and .ico (Windows); Linux uses the PNG.
 *
 *   npx tsx tools/desktop-icon.ts
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const N = 64;
const px: string[] = [];
const rect = (x: number, y: number, w: number, h: number, c: string) => px.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`);
const dot = (x: number, y: number, c: string) => rect(x, y, 1, 1, c);

// Tile: dark studio brown, gold frame (the menu panel look), rounded by trimmed corners.
const tile = (inset: number, c: string) => {
  const s = N - inset * 2;
  rect(inset + 2, inset, s - 4, s, c);
  rect(inset, inset + 2, s, s - 4, c);
  rect(inset + 1, inset + 1, s - 2, s - 2, c);
};
tile(2, '#3a1a08');
tile(3, '#c89830');
tile(5, '#140b06');

// Prize-wheel sunburst behind the host, in wedge colours.
const wedges = ['#2f7d3a', '#f2c230', '#c0472a', '#2a5d9c', '#b8862b', '#6b3a8c', '#e05aa0', '#1f6f6a'];
const cx = 32,
  cy = 36;
for (let y = 6; y < 58; y++)
  for (let x = 6; x < 58; x++) {
    const dx = x + 0.5 - cx,
      dy = y + 0.5 - cy,
      r = Math.hypot(dx, dy);
    if (r > 25 || r < 4) continue;
    const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
    const w = Math.floor(a * 16) % wedges.length;
    // Darker towards the rim, with a gold rim ring.
    if (r > 23.5) dot(x, y, '#c89830');
    else dot(x, y, r > 17 ? wedges[w] : shade(wedges[w], 0.55));
  }

// Rabbit-ear antennas.
for (let i = 0; i < 9; i++) {
  dot(22 - i, 14 - i, '#d8d0c0');
  dot(42 + i, 14 - i, '#d8d0c0');
}
dot(13, 5, '#ff4a2a');
dot(51, 5, '#ff4a2a');

// CRT body.
rect(14, 15, 36, 30, '#1a1210');
rect(15, 14, 34, 32, '#1a1210');
rect(15, 15, 34, 30, '#5a5048');
rect(16, 16, 32, 28, '#3a332e');
// Screen bezel + phosphor screen.
rect(18, 18, 22, 22, '#0c0a08');
rect(19, 19, 20, 20, '#0f3a22');
for (let y = 19; y < 39; y += 2) rect(19, y, 20, 1, '#124a2a'); // scanlines
// Face: eyes and grin (the host's CRT face).
rect(23, 24, 3, 3, '#8affb0');
rect(32, 24, 3, 3, '#8affb0');
rect(22, 31, 1, 1, '#8affb0');
rect(36, 31, 1, 1, '#8affb0');
rect(23, 32, 1, 1, '#8affb0');
rect(35, 32, 1, 1, '#8affb0');
rect(24, 33, 11, 1, '#8affb0');
dot(20, 20, '#c0ffd8'); // glare
dot(21, 20, '#4a9a6a');
dot(20, 21, '#4a9a6a');
// Knobs + ON AIR lamp.
rect(42, 20, 4, 4, '#c89830');
rect(43, 21, 2, 2, '#6a4820');
rect(42, 27, 4, 4, '#c89830');
rect(43, 28, 2, 2, '#6a4820');
rect(42, 35, 4, 3, '#ff4a2a');
rect(43, 35, 1, 1, '#ffb0a0');
// Feet + bow tie.
rect(18, 46, 4, 2, '#1a1210');
rect(42, 46, 4, 2, '#1a1210');
rect(26, 48, 4, 4, '#ff4a2a');
rect(34, 48, 4, 4, '#ff4a2a');
rect(30, 49, 4, 2, '#ffd040');
rect(27, 49, 2, 2, '#c02818');
rect(35, 49, 2, 2, '#c02818');

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">${px.join('')}</svg>`;
const out = fileURLToPath(new URL('../desktop/icon.png', import.meta.url));
const small = await sharp(Buffer.from(svg)).png().toBuffer();
await sharp(small).resize(1024, 1024, { kernel: 'nearest' }).png({ compressionLevel: 9 }).toFile(out);
console.log(`wrote ${out}`);
