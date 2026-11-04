// Renders the itch.io page art (tools/itch-kit/art.js) into /itch.
// usage: node tools/itch-kit/build.mjs [asset ids…]
// Needs Playwright with Chromium (see tools/browser.mjs) and ImageMagick (`convert`).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '../browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const OUT = join(root, 'itch');
const TMP = join(root, 'itch-out-tmp');

// Where each asset goes, and at which scale(s). Native sizes are tiny pixel art.
const PLAN = {
  logo: [
    { file: 'logo/logo.png', scale: 4 },
    { file: 'logo/logo-large.png', scale: 8 },
  ],
  'logo-tagline': [{ file: 'logo/logo-tagline.png', scale: 4 }],
  'logo-flicker': [{ file: 'logo/logo-flicker.gif', scale: 4 }],
  banner: [{ file: 'banner/banner.png', scale: 3 }],
  'banner-animated': [{ file: 'banner/banner-animated.gif', scale: 3 }],
  cover: [{ file: 'cover/cover.png', scale: 2 }],
  'cover-animated': [{ file: 'cover/cover-animated.gif', scale: 2 }],
  'edge-haunt': [{ file: 'background/edge-haunt.gif', scale: 4 }],
  'edge-haunt-still': [{ file: 'background/edge-haunt.png', scale: 4 }],
  'wheel-spin': [{ file: 'gifs/wheel-spin.gif', scale: 3 }],
  'host-talk': [{ file: 'gifs/host-talk.gif', scale: 4 }],
  'phone-ring': [{ file: 'gifs/phone-ring.gif', scale: 4 }],
  'phone-ring-other-line': [{ file: 'gifs/phone-ring-other-line.gif', scale: 4 }],
  divider: [{ file: 'gifs/divider.gif', scale: 3 }],
};
for (const h of ['the-show', 'how-to-play', 'features', 'controls', 'download', 'credits']) PLAN[`header-${h}`] = [{ file: `gifs/header-${h}.gif`, scale: 3 }];

const only = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(join(here, 'render.html')).href);
await page.evaluate(async () => {
  await document.fonts.load('16px Silk');
  await document.fonts.load('16px VT');
  await document.fonts.ready;
});
const assets = await page.evaluate(() => window.KIT.list());
rmSync(TMP, { recursive: true, force: true });

const report = [];
for (const a of assets) {
  if (only.length && !only.includes(a.id)) continue;
  const plan = PLAN[a.id];
  if (!plan) throw new Error(`no output plan for ${a.id}`);
  const dir = join(TMP, a.id);
  mkdirSync(dir, { recursive: true });
  const frames = [];
  for (let f = 0; f < a.frames; f++) {
    const url = await page.evaluate(([id, i]) => window.KIT.render(id, i), [a.id, f]);
    const file = join(dir, `f${String(f).padStart(3, '0')}.png`);
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    frames.push(file);
  }
  for (const p of plan) {
    const out = join(OUT, p.file);
    mkdirSync(dirname(out), { recursive: true });
    const resize = ['-filter', 'point', '-resize', `${p.scale * 100}%`];
    if (out.endsWith('.png')) execFileSync('convert', [frames[0], ...resize, '-strip', `PNG${a.transparent ? '32' : '24'}:${out}`]);
    else {
      const delay = String(Math.round(100 / a.fps));
      execFileSync('convert', ['-delay', delay, '-loop', '0', '-dispose', a.transparent ? 'Background' : 'None', ...frames, ...resize, '+dither', '-layers', a.transparent ? 'OptimizeFrame' : 'Optimize', out]);
    }
    const [w, h] = a.size.map((v) => v * p.scale);
    report.push(`${p.file.padEnd(38)} ${`${w}×${h}`.padEnd(10)} ${String(a.frames).padStart(3)} fr  ${(statSync(out).size / 1024).toFixed(0).padStart(5)} KB`);
  }
}
await browser.close();
rmSync(TMP, { recursive: true, force: true });
console.log(report.join('\n'));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
