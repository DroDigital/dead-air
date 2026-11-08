/**
 * The art pack: slices the owner-provided sheets in /assets-src/art into game-ready sprites in
 * /public/assets/art and writes the runtime index src/assets/art.json.
 *
 *   icons-wedges.png        5×5 grid, wedge kinds in WEDGES order (+2 spares)
 *   icons-artifacts-1/2.png 5×5 grids, ARTIFACTS order
 *   icons-scratch.png       4×3 grid, SCRATCH_CARDS order
 *   host-faces.png          4×4 grid → one 512² atlas (128 px faces) for the host's CRT
 *   callers.png             the Producer and the voice on the other line
 *   ui-hud.png / ui-panels  named sprites (boxes measured on the sheet, trimmed to the ink)
 *   screen-*.png, title-*   menus and end-of-run screens
 *   gameover/               the game-over backdrop and the glove waving from its trapdoor (4 crops)
 *
 * The host's parts are cut out of the opaque model sheet; src/render/scene/host.ts
 * rigs them. Run by `npm run assets` (or `npx tsx tools/art.ts` on its own).
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACTS } from '../src/content/artifacts';
import { SCRATCH_CARDS } from '../src/content/scratchCards';
import { WEDGE_KINDS } from '../src/content/wedges';
import { horrorIcons } from './horror-art';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets-src', 'art');
const OUT = join(ROOT, 'public', 'assets', 'art');

type Box = [number, number, number, number];

const HUD: Record<string, Box> = {
  capLeft: [16, 8, 340, 200],
  barMid: [368, 36, 796, 140],
  capRight: [1176, 16, 346, 190],
  bulbRedOn: [8, 216, 186, 250],
  bulbRedOff: [196, 270, 150, 196],
  bulbOn: [356, 276, 126, 160],
  bulbOff: [486, 296, 110, 140],
  coin: [606, 260, 190, 200],
  safe: [806, 236, 236, 228],
  tray: [1046, 270, 252, 190],
  flameRing: [1300, 206, 228, 250],
  handLeft: [24, 530, 236, 156],
  handRight: [284, 530, 240, 156],
  handUp: [548, 460, 164, 248],
  handDown: [744, 490, 172, 236],
  handPoint: [1024, 498, 196, 214],
  handOpen: [1232, 498, 210, 212],
  filmFrame: [8, 700, 664, 324],
  ticket: [680, 756, 430, 228],
  phone: [1116, 710, 412, 306],
};
const PANELS: Record<string, Box> = {
  panelBig: [16, 8, 590, 808],
  pillCream: [624, 16, 440, 140],
  pillGold: [624, 160, 436, 148],
  pillGoldFlat: [624, 312, 436, 116],
  bubble: [1066, 8, 466, 322],
  ribbonSmall: [1086, 330, 390, 116],
  cardCream: [624, 446, 252, 344],
  cardAged: [894, 446, 258, 344],
  note: [1172, 470, 350, 270],
  ribbonBig: [8, 812, 784, 210],
  plate: [802, 820, 444, 170],
  circle: [1258, 840, 128, 128],
  check: [1386, 840, 140, 128],
};

type Sharp = typeof import('sharp').default;
const index: Record<string, { url: string; w: number; h: number }> = {};

async function save(sharp: Sharp, img: import('sharp').Sharp, id: string, rel: string, max: number): Promise<void> {
  const out = join(OUT, rel);
  await mkdir(dirname(out), { recursive: true });
  const buf = await img.png().toBuffer();
  // Trim to the ink (transparent margins), pad a hair, fit inside max×max.
  let t = sharp(buf);
  try {
    t = sharp(await sharp(buf).trim({ threshold: 4 }).toBuffer());
  } catch {
    /* fully opaque or empty: keep as is */
  }
  const fitted = await t.resize(max, max, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true, quality: 92 }).toBuffer({ resolveWithObject: true });
  await writeFile(out, fitted.data);
  index[id] = { url: `assets/art/${rel}`, w: fitted.info.width, h: fitted.info.height };
}

async function grid(sharp: Sharp, file: string, cols: number, rows: number, ids: string[], dir: string, max: number): Promise<void> {
  const meta = await sharp(join(SRC, file)).metadata();
  const cw = meta.width! / cols,
    ch = meta.height! / rows;
  for (let i = 0; i < ids.length && i < cols * rows; i++) {
    const c = i % cols,
      r = Math.floor(i / cols);
    const { data, info } = await sharp(join(SRC, file))
      .extract({ left: Math.round(c * cw), top: Math.round(r * ch), width: Math.round(cw), height: Math.round(ch) })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    dropStrays(data, info.width, info.height);
    await save(sharp, sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }), `${dir}.${ids[i]}`, `${dir}/${ids[i]}.png`, max);
  }
}

/**
 * Icons on the sheets aren't perfectly centred in their grid cells, so a cell can catch a sliver
 * of its neighbour. Clear every ink island that touches the cell's edge, except the main one.
 */
function dropStrays(data: Buffer, W: number, H: number): void {
  const label = new Int32Array(W * H).fill(-1);
  const islands: { size: number; edge: boolean }[] = [];
  for (let start = 0; start < W * H; start++) {
    if (label[start] >= 0 || data[start * 4 + 3] <= 8) continue;
    const id = islands.length;
    const isl = { size: 0, edge: false };
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const i = stack.pop()!;
      isl.size++;
      const x = i % W,
        y = (i / W) | 0;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) isl.edge = true;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j < 0 || label[j] >= 0 || data[j * 4 + 3] <= 8) continue;
        label[j] = id;
        stack.push(j);
      }
    }
    islands.push(isl);
  }
  if (!islands.length) return;
  const main = islands.reduce((m, s, i) => (s.size > islands[m].size ? i : m), 0);
  for (let i = 0; i < W * H; i++) {
    const l = label[i];
    if (l >= 0 && l !== main && islands[l].edge) data[i * 4 + 3] = 0;
  }
}

async function boxes(sharp: Sharp, file: string, map: Record<string, Box>, prefix: string, max: number): Promise<void> {
  const meta = await sharp(join(SRC, file)).metadata();
  for (const [name, [x, y, w, h]] of Object.entries(map)) {
    const left = Math.max(0, x),
      top = Math.max(0, y);
    const img = sharp(join(SRC, file)).extract({ left, top, width: Math.min(w, meta.width! - left), height: Math.min(h, meta.height! - top) });
    await save(sharp, img, `${prefix}.${name}`, `${prefix}/${name}.png`, max);
  }
}

/**
 * Cut a part out of an opaque sheet: flood-fill the paper background from the crop's edges
 * (the ink outline stops it), feather the edge, trim. Returns nothing; writes host/<name>.png.
 */
async function cutout(sharp: Sharp, file: string, name: string, [x, y, w, h]: Box, max: number, tol = 34, opts: { dir?: string; seedCenter?: boolean } = {}): Promise<void> {
  const dir = opts.dir ?? 'host';
  const { data, info } = await sharp(join(SRC, file)).extract({ left: x, top: y, width: w, height: h }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width,
    H = info.height;
  // Paper colour: sampled from the sheet's own top-left corner (crop corners may land on ink).
  const paper = await sharp(join(SRC, file)).extract({ left: 2, top: 2, width: 8, height: 8 }).removeAlpha().raw().toBuffer();
  const bg = [0, 1, 2].map((c) => {
    let t = 0;
    for (let i = c; i < paper.length; i += 3) t += paper[i];
    return t / (paper.length / 3);
  });
  const dist = (i: number) => Math.hypot(data[i * 4] - bg[0], data[i * 4 + 1] - bg[1], data[i * 4 + 2] - bg[2]);
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  for (let i = 0; i < W; i++) stack.push(i, (H - 1) * W + i);
  for (let j = 0; j < H; j++) stack.push(j * W, j * W + W - 1);
  // A ring (the wheel frame) has paper inside it too: fill from the middle as well.
  if (opts.seedCenter) stack.push(((H / 2) | 0) * W + ((W / 2) | 0));
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i] || dist(i) > tol) continue;
    seen[i] = 1;
    const px = i % W,
      py = (i / W) | 0;
    if (px > 0) stack.push(i - 1);
    if (px < W - 1) stack.push(i + 1);
    if (py > 0) stack.push(i - W);
    if (py < H - 1) stack.push(i + W);
  }
  for (let i = 0; i < W * H; i++) {
    if (seen[i]) data[i * 4 + 3] = 0;
    else {
      // Feather pixels next to the background in proportion to how paper-coloured they are.
      const px = i % W,
        py = (i / W) | 0;
      const edge = (px > 0 && seen[i - 1]) || (px < W - 1 && seen[i + 1]) || (py > 0 && seen[i - W]) || (py < H - 1 && seen[i + W]);
      if (edge) data[i * 4 + 3] = Math.round(255 * Math.min(1, dist(i) / (tol * 2.5)));
    }
  }
  const img = sharp(data, { raw: { width: W, height: H, channels: 4 } });
  await save(sharp, img, `${dir}.${name}`, `${dir}/${name}.png`, max);
}

async function screen(sharp: Sharp, file: string, id: string, width: number): Promise<void> {
  const out = join(OUT, 'screens', `${id}.jpg`);
  await mkdir(dirname(out), { recursive: true });
  const r = await sharp(join(SRC, file)).resize(width).flatten({ background: '#120806' }).jpeg({ quality: 84, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  await writeFile(out, r.data);
  index[`screen.${id}`] = { url: `assets/art/screens/${id}.jpg`, w: r.info.width, h: r.info.height };
}

/** Where the waving glove sits on the game-over backdrop (the four wave crops are cut from here). */
export const GAMEOVER_WAVE_BOX: Box = [688, 716, 218, 194];

/**
 * The game-over scene: the empty-trapdoor backdrop as a full-size JPEG, and the glove waving
 * from the trapdoor as a 4-cell strip of crops taken from the same box of each animation frame,
 * so it lines up with the backdrop exactly (positioned in % of the 1536×1024 art).
 */
async function gameOver(sharp: Sharp): Promise<void> {
  const dir = join(SRC, 'gameover');
  if (!existsSync(join(dir, 'background.png'))) return;
  await mkdir(join(OUT, 'gameover'), { recursive: true });
  const bg = await sharp(join(dir, 'background.png')).flatten({ background: '#120806' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  await writeFile(join(OUT, 'gameover', 'background.jpg'), bg.data);
  index['gameover.background'] = { url: 'assets/art/gameover/background.jpg', w: bg.info.width, h: bg.info.height };
  const [, , w, h] = GAMEOVER_WAVE_BOX;
  const strip = await sharp({ create: { width: w * 4, height: h, channels: 3, background: '#000' } })
    .composite([1, 2, 3, 4].map((i) => ({ input: join(dir, `wave-0${i}.png`), left: (i - 1) * w, top: 0 })))
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  await writeFile(join(OUT, 'gameover', 'wave.jpg'), strip.data);
  index['gameover.wave'] = { url: 'assets/art/gameover/wave.jpg', w: strip.info.width, h: strip.info.height };
}

export async function buildArt(): Promise<number> {
  if (!existsSync(join(SRC, 'icons-wedges.png'))) return 0;
  const sharp = (await import('sharp')).default;
  // The owner's sheet covers the wedges up to Payday; the horror wedges are drawn by tools/horror-art.ts.
  await grid(sharp, 'icons-wedges.png', 5, 5, WEDGE_KINDS.slice(WEDGE_KINDS.indexOf('cash'), WEDGE_KINDS.indexOf('payday') + 1), 'wedge', 128);
  // If the GPT-image sheet for the newer wedges exists (docs/art-prompts.md §7b), slice it; the
  // drawn SVG icons below fill in whatever it doesn't cover.
  const sheet2 = ['mouth', 'cleaver', 'stump', 'bleeder', 'eye', 'stitches', 'roulette', 'hushMoney', 'encore', 'curtainCall'];
  const fromSheet = existsSync(join(SRC, 'icons-wedges-2.png'));
  if (fromSheet) await grid(sharp, 'icons-wedges-2.png', 4, 3, sheet2, 'wedge', 128);
  if (existsSync(join(SRC, 'wedge-gun.png'))) {
    await save(sharp, sharp(join(SRC, 'wedge-gun.png')), 'wedge.gun', 'wedge/gun.png', 192);
  }
  await horrorIcons(sharp, async (id, buf) => {
    if (fromSheet && sheet2.includes(id)) return;
    const out = join(OUT, 'wedge', `${id}.png`);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, buf);
    index[`wedge.${id}`] = { url: `assets/art/wedge/${id}.png`, w: 128, h: 128 };
  });
  const arts = ARTIFACTS.map((a) => a.id);
  await grid(sharp, 'icons-artifacts-1.png', 5, 5, arts.slice(0, 25), 'artifact', 128);
  await grid(sharp, 'icons-artifacts-2.png', 5, 5, arts.slice(25, 50), 'artifact', 128);
  await grid(sharp, 'icons-scratch.png', 4, 3, SCRATCH_CARDS.map((s) => s.id), 'scratch', 160);
  // Host faces: a 4×4 atlas of 128 px faces for the CRT screen.
  {
    const out = join(OUT, 'host', 'faces.png');
    await mkdir(dirname(out), { recursive: true });
    const r = await sharp(join(SRC, 'host-faces.png')).resize(512, 512, { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true, quality: 92 }).toBuffer({ resolveWithObject: true });
    await writeFile(out, r.data);
    index['host.faces'] = { url: 'assets/art/host/faces.png', w: 512, h: 512 };
  }
  // The host as a 2D cut-out rig (front view on the model sheet, spare parts on its bottom row).
  await cutout(sharp, 'host-model-sheet.png', 'head', [100, 0, 290, 308], 320);
  await cutout(sharp, 'host-model-sheet.png', 'torso', [138, 296, 200, 258], 256);
  await cutout(sharp, 'host-model-sheet.png', 'bowtie', [540, 700, 420, 300], 192);
  await cutout(sharp, 'host-model-sheet.png', 'glove', [110, 700, 330, 300], 160);
  await cutout(sharp, 'host-model-sheet.png', 'shoe', [1060, 720, 380, 260], 160);
  await boxes(sharp, 'callers.png', { producer: [0, 0, 860, 1024], secret: [880, 40, 640, 984] }, 'caller', 320);
  await boxes(sharp, 'ui-hud.png', HUD, 'ui', 192);
  await boxes(sharp, 'ui-panels.png', PANELS, 'panel', 384);
  await boxes(sharp, 'title-plate-lettered.png', { lettered: [0, 0, 1536, 1024] }, 'title', 768);
  await boxes(sharp, 'title-plate.png', { plate: [0, 0, 1536, 1024] }, 'title', 768);
  await screen(sharp, 'screen-title-bg.png', 'title', 1280);
  await screen(sharp, 'screen-win.png', 'win', 1280);
  await screen(sharp, 'screen-lose.png', 'lose', 1280);
  await screen(sharp, 'screen-standby.png', 'standby', 1280);
  await gameOver(sharp);
  await mkdir(join(ROOT, 'src', 'assets'), { recursive: true });
  await writeFile(join(ROOT, 'src', 'assets', 'art.json'), JSON.stringify(index, null, 1) + '\n');
  return Object.keys(index).length;
}

if (process.argv[1]?.endsWith('art.ts')) buildArt().then((n) => console.log(`${n} art sprites`));
