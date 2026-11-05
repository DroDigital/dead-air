// Builds the itch.io page kit in /itch from the owner's art pack.
//   node tools/itch-kit/build.mjs [asset ids…]      art (cover, banner, logos, headers, background)
//   node tools/itch-kit/capture.mjs                  gameplay screenshots and GIFs (needs `npm run preview`)
// Needs Playwright with Chromium (tools/browser.mjs), ffmpeg and ImageMagick.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '../browser.mjs';
import { prep } from './prep.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const OUT = join(root, 'itch');
const TMP = join(root, 'itch-out-tmp');
const PIECES = join(TMP, 'pieces');
/** The itch page's background colour: GIF edges are flattened onto it. */
export const PAGE = '#140a06';

const PLAN = {
  logo: 'logo/logo.png',
  'logo-960': 'logo/logo-960.png',
  'logo-480': 'logo/logo-480.png',
  'logo-tagline': 'logo/logo-tagline.png',
  cover: 'cover/cover.png',
  'cover-2x': 'cover/cover-1260x1000.png',
  'cover-animated': 'cover/cover-animated.gif',
  banner: 'banner/banner.png',
  'banner-animated': 'banner/banner-animated.gif',
  divider: 'gifs/divider.gif',
  'host-loop': 'gifs/host.gif',
  'producer-loop': 'gifs/producer.gif',
  'other-line-loop': 'gifs/other-line.gif',
  'edge-haunt': 'background/edge-haunt.gif',
  'edge-haunt-still': 'background/edge-haunt.png',
};
for (const h of ['the-show', 'how-to-play', 'features', 'controls', 'download', 'credits']) {
  PLAN[`header-${h}`] = `headers/header-${h}.png`;
  PLAN[`header-${h}-animated`] = `headers/header-${h}.gif`;
}

/** Frames → GIF with one shared palette (ffmpeg), keeping 1-bit transparency where present. */
export function gif(frameGlob, fps, out, transparent) {
  const pal = `${out}.palette.png`;
  const gen = transparent ? 'palettegen=reserve_transparent=1:stats_mode=full:max_colors=255' : 'palettegen=stats_mode=diff:max_colors=256';
  const use = transparent ? 'paletteuse=dither=bayer:bayer_scale=5:alpha_threshold=128' : 'paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle';
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', frameGlob, '-vf', gen, pal]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', frameGlob, '-i', pal, '-lavfi', use, '-gifflags', '-offsetting', '-loop', '0', out]);
  rmSync(pal);
}

const only = process.argv.slice(2);
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  rmSync(TMP, { recursive: true, force: true });
  await prep(join(root, 'assets-src', 'art'), PIECES);
  // The page reads the prepared pieces from disk; let file:// images be read back from the canvas.
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${pathToFileURL(join(here, 'compose.html')).href}?src=${encodeURIComponent(pathToFileURL(PIECES).href)}`);
  await page.evaluate(() => window.KIT2.ready);
  const assets = await page.evaluate(() => window.KIT2.list());
  const report = [];
  for (const a of assets) {
    if (only.length && !only.includes(a.id)) continue;
    const rel = PLAN[a.id];
    if (!rel) throw new Error(`no output for ${a.id}`);
    const out = join(OUT, rel);
    mkdirSync(dirname(out), { recursive: true });
    const isGif = out.endsWith('.gif');
    const dir = join(TMP, a.id);
    mkdirSync(dir, { recursive: true });
    for (let f = 0; f < a.frames; f++) {
      const url = await page.evaluate(([id, i, m]) => window.KIT2.render(id, i, m), [a.id, f, isGif ? PAGE : null]);
      writeFileSync(join(dir, `f${String(f).padStart(3, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    if (isGif) gif(join(dir, 'f%03d.png'), a.fps, out, a.transparent);
    else execFileSync('convert', [join(dir, 'f000.png'), '-strip', `PNG${a.transparent ? '32' : '24'}:${out}`]);
    report.push(`${rel.padEnd(40)} ${`${a.w}×${a.h}`.padEnd(10)} ${String(a.frames).padStart(3)} fr ${(statSync(out).size / 1024).toFixed(0).padStart(6)} KB`);
  }
  await browser.close();
  rmSync(TMP, { recursive: true, force: true });
  console.log(report.join('\n'));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
}
