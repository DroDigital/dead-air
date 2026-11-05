// Cuts the pieces the itch.io kit composes from the owner's full-resolution art sheets
// (/assets-src/art) into a work folder: host poses, the lettered logo, ribbons, bulbs, coin.
// Used by build.mjs; boxes on the shared sheets are the ones tools/art.ts slices for the game.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const BOXES = {
  'ui-panels.png': {
    ribbonBig: [8, 812, 784, 210],
    ribbonSmall: [1086, 330, 390, 116],
    plate: [802, 820, 444, 170],
    pillGold: [624, 160, 436, 148],
    cardCream: [624, 446, 252, 344],
    bubble: [1066, 8, 466, 322],
  },
  'ui-hud.png': {
    bulbOn: [356, 276, 126, 160],
    bulbOff: [486, 296, 110, 140],
    bulbRedOn: [8, 216, 186, 250],
    coin: [606, 260, 190, 200],
    handPoint: [1024, 498, 196, 214],
  },
};

const POSES = ['idleA', 'idleB', 'presentA', 'presentB', 'cheerA', 'cheerB', 'pointA', 'pointB', 'shrugA', 'shrugB', 'slumpA', 'slumpB'];

async function trimmed(img) {
  // Trim to the ink: anything with alpha. sharp's trim keys on the corner colour, which is
  // transparent on these sheets.
  return img.trim({ threshold: 1 });
}

export async function prep(srcDir, outDir) {
  await mkdir(outDir, { recursive: true });
  for (const [sheet, boxes] of Object.entries(BOXES)) {
    for (const [id, b] of Object.entries(boxes)) {
      const [left, top, width, height] = b;
      const img = sharp(join(srcDir, sheet)).extract({ left, top, width, height });
      await (await trimmed(sharp(await img.png().toBuffer()))).png().toFile(join(outDir, `${id}.png`));
    }
  }
  // The lettered logo and the plain plate.
  for (const [id, f] of [['logo', 'title-plate-lettered.png'], ['plateTitle', 'title-plate.png']]) {
    await (await trimmed(sharp(join(srcDir, f)))).png().toFile(join(outDir, `${id}.png`));
  }
  // The callers: split at the emptiest column between the two figures.
  const { data, info } = await sharp(join(srcDir, 'callers.png')).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let best = Math.round(info.width / 2),
    bestSum = Infinity;
  for (let x = Math.round(info.width * 0.35); x < info.width * 0.65; x++) {
    let sum = 0;
    for (let y = 0; y < info.height; y++) sum += data[y * info.width + x];
    if (sum < bestSum) {
      bestSum = sum;
      best = x;
    }
  }
  for (const [id, left, width] of [['producer', 0, best], ['otherLine', best, info.width - best]]) {
    const half = await sharp(join(srcDir, 'callers.png')).extract({ left, top: 0, width, height: info.height }).png().toBuffer();
    await (await trimmed(sharp(half))).png().toFile(join(outDir, `${id}.png`));
  }
  // Host poses: a 4×3 grid of transparent cells, A/B drawings in pairs.
  const ps = await sharp(join(srcDir, 'host-poses.png')).metadata();
  const cw = ps.width / 4,
    ch = ps.height / 3;
  for (let i = 0; i < 12; i++) {
    const cell = await sharp(join(srcDir, 'host-poses.png'))
      .extract({ left: Math.round((i % 4) * cw), top: Math.round(Math.floor(i / 4) * ch), width: Math.round(cw), height: Math.round(ch) })
      .png()
      .toBuffer();
    await (await trimmed(sharp(cell))).png().toFile(join(outDir, `host-${POSES[i]}.png`));
  }
  // Full-screen cards, as-is.
  for (const f of ['screen-title-bg', 'screen-win', 'screen-lose', 'screen-standby', 'texture-curtain', 'texture-wallpaper', 'host-faces']) {
    await sharp(join(srcDir, `${f}.png`)).png().toFile(join(outDir, `${f}.png`));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await prep(process.argv[2], process.argv[3]);
  console.log('prepared', process.argv[3]);
}
