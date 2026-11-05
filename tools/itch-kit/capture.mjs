// Captures the itch.io screenshots and gameplay GIFs from the real game.
//   npm run build && npm run preview      (in another terminal)
//   node tools/itch-kit/capture.mjs [--url http://localhost:4173/] [names…]
// The page clock is frozen and stepped one frame at a time (Playwright's clock), so every GIF
// is smooth and identical run to run however slowly the software renderer draws a frame.
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from '../browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const OUT = join(root, 'itch');
const TMP = join(root, 'itch-out-tmp', 'capture');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:4173/';
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--url');
const want = (n) => !only.length || only.includes(n);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const report = [];

/** A fresh page on a frozen clock, booted to the title screen (the game's default 320×180). */
async function boot() {
  // The game scales its 320×180 image by whole numbers only, so window sizes are exact
  // multiples: clips render at 960×540 (3×), stills at 1920×1080 (6×, see still()).
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.clock.install();
  await page.goto(url);
  const step = (ms) => page.clock.runFor(ms);
  const until = async (pred, ms = 20000, arg) => {
    for (let t = 0; t < ms; t += 100) {
      if (await page.evaluate(pred, arg)) return true;
      await step(100);
      await page.waitForTimeout(5);
    }
    return false;
  };
  await until(() => window.deadAir?.fsm?.state === 'Menu', 60000);
  await step(1500);
  const settled = () => until(() => window.deadAir.busy === 0 && !window.deadAir.stage.wheel.busy && !window.deadAir.charge && !window.deadAir.stage.rig.inShot, 30000);
  return { page, step, until, settled };
}

async function still(page, name) {
  const out = join(OUT, 'screenshots', `${name}.png`);
  mkdirSync(dirname(out), { recursive: true });
  const look = await page.evaluate(() => {
    const p = window.deadAir.stage.post;
    const s = { grain: p.grain, dither: p.dither };
    const set = window.deadAir.settings;
    p.grain = 0.035;
    p.dither = set ? set.dither !== false : true;
    return s;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.clock.runFor(50);
  await page.screenshot({ path: out });
  await page.setViewportSize({ width: 960, height: 540 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.evaluate((s) => Object.assign(window.deadAir.stage.post, s), look);
  report.push(`screenshots/${name}.png  1920×1080  ${(statSync(out).size / 1024).toFixed(0)} KB`);
}

/**
 * Raw frames (r000.png…) → gifs/<name>.gif and video/<name>.mp4. A spinning wheel changes
 * nearly every pixel each frame, so the GIF is kept to 600 px and 160 colours (a 7 s clip at
 * 720 px and 256 colours was 10 MB); the MP4 keeps full quality for devlogs and socials.
 */
export function encode(dir, name, fps, width = 600) {
  const gifOut = join(OUT, 'gifs', `${name}.gif`);
  const mp4Out = join(OUT, 'video', `${name}.mp4`);
  mkdirSync(dirname(gifOut), { recursive: true });
  mkdirSync(dirname(mp4Out), { recursive: true });
  const src = ['-framerate', String(fps), '-i', join(dir, 'r%03d.png')];
  const vf = `scale=${width}:-2:flags=lanczos`;
  const pal = join(dir, 'palette.png');
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...src, '-vf', `${vf},palettegen=stats_mode=diff:max_colors=160`, pal]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...src, '-i', pal, '-lavfi', `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, '-loop', '0', gifOut]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...src, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', mp4Out]);
}

/** Step `count` frames at `fps`, calling `each(f)` first, and turn them into a GIF. */
async function clip(ctx, name, count, fps, each, { width = 600 } = {}) {
  const dir = join(TMP, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // Film grain and the ordered dither change every pixel every frame, which GIF can't
  // compress (a 7 s clip came out at 9 MB). Clips leave them off; the CRT look stays, and the
  // screenshots keep everything.
  const saved = await ctx.page.evaluate(() => {
    const p = window.deadAir.stage.post;
    const s = { grain: p.grain, dither: p.dither };
    p.grain = 0;
    p.dither = false;
    return s;
  });
  for (let f = 0; f < count; f++) {
    if (each) await each(f);
    await ctx.page.evaluate(() => {
      const p = window.deadAir.stage.post;
      p.grain = 0;
      p.dither = false;
    });
    await ctx.step(1000 / fps);
    await ctx.page.screenshot({ path: join(dir, `r${String(f).padStart(3, '0')}.png`) });
  }
  await ctx.page.evaluate((s) => Object.assign(window.deadAir.stage.post, s), saved);
  encode(dir, name, fps, width);
  const out = join(OUT, 'gifs', `${name}.gif`);
  report.push(`gifs/${name}.gif  ${width}px  ${count} fr @ ${fps} fps  ${(statSync(out).size / 1024).toFixed(0)} KB  (+ video/${name}.mp4)`);
}

async function startRun(ctx, seed, pkg = '2') {
  await ctx.page.evaluate((s) => window.deadAir.newRun(s, 0, 'standard'), seed);
  await ctx.until(() => !!window.deadAir.hud.choice, 30000);
  await ctx.step(600);
  await ctx.page.keyboard.press(pkg);
  await ctx.settled();
  await ctx.step(800);
}

// ---- Title screen ---------------------------------------------------------------------------
if (want('title')) {
  const c = await boot();
  await c.step(2500);
  await still(c.page, '01-title');
  await c.page.close();
}

// ---- The wheel: a lever spin, start to payout ------------------------------------------------
if (want('spin')) {
  const c = await boot();
  await startRun(c, 'ITCH-SPIN');
  await still(c.page, '02-the-wheel');
  let shot = false;
  await clip(c, 'spin', 60, 12, async (f) => {
    if (f === 4) await c.page.keyboard.down(' ');
    if (f === 20) await c.page.keyboard.up(' ');
    if (!shot && f === 21) {
      shot = true;
      await still(c.page, '03-slow-motion-finish');
    }
  });
  await c.page.close();
}

// ---- Grab the wheel with the mouse and flick it ---------------------------------------------
if (want('flick')) {
  const c = await boot();
  await startRun(c, 'ITCH-FLICK');
  const geo = await c.page.evaluate(() => {
    const a = window.deadAir;
    const r = a.canvas.getBoundingClientRect();
    const vp = a.stage.post.viewport(r.width, r.height);
    const ce = a.toScreen(a.stage.wheel.centerWorld());
    const e = a.toScreen(a.stage.wheel.rimWorld());
    return { cx: r.left + vp.x + ce.x * vp.k, cy: r.top + vp.y + ce.y * vp.k, rad: Math.hypot(e.x - ce.x, e.y - ce.y) * vp.k * 0.7 };
  });
  const at = (deg) => [geo.cx + Math.cos((deg * Math.PI) / 180) * geo.rad, geo.cy + Math.sin((deg * Math.PI) / 180) * geo.rad];
  await c.page.mouse.move(...at(170));
  await clip(c, 'flick', 84, 12, async (f) => {
    if (f === 6) {
      await c.page.mouse.move(...at(180));
      await c.page.mouse.down();
    }
    // Drag slowly round to show the grip, then sweep over the top fast and let go. The game
    // times the drag on the page clock, so the sweep advances it in small steps.
    if (f > 6 && f <= 14) await c.page.mouse.move(...at(180 + (f - 6) * 2));
    if (f === 15) {
      for (let d = 200; d <= 320; d += 15) {
        await c.page.mouse.move(...at(d));
        await c.step(12);
      }
      await c.page.mouse.up();
    }
  });
  await c.page.close();
}

// ---- The phone: the Producer calls ----------------------------------------------------------
if (want('phone')) {
  const c = await boot();
  await startRun(c, 'ITCH-PHONE');
  await c.page.evaluate(() => {
    const g = window.deadAir.game;
    g.openPhone('deadline', 'AwaitAction');
    g.setPhase('PhoneCall');
    g.changed('phone');
  });
  // Let it ring, then keep answering until the call is on the line.
  await clip(c, 'phone', 96, 12, async (f) => {
    if (f >= 30 && f % 4 === 0 && !(await c.page.evaluate(() => !!window.deadAir.hud.choice))) await c.page.keyboard.press('Enter');
  });
  await c.step(1500);
  await still(c.page, '04-the-producer-calls');
  await c.page.close();
}

// ---- The Prize Cabinet ----------------------------------------------------------------------
if (want('shop')) {
  const c = await boot();
  await startRun(c, 'ITCH-SHOP');
  // Pay the first Deadline in one spin and head into the cabinet.
  await c.page.evaluate(() => {
    const a = window.deadAir;
    a.game.run.vault = 2400;
    a.game.run.tokens = 14;
    a.game.run.spinsLeft = 1;
    a.sync(false);
  });
  await c.page.keyboard.down(' ');
  await c.step(300);
  await c.page.keyboard.up(' ');
  // Answered through the game's choice handler, never the keyboard: a key that arrives just
  // as the cabinet opens would buy something.
  for (let i = 0; i < 40; i++) {
    const ph = await c.page.evaluate(() => {
      const a = window.deadAir;
      const p = a.game?.run.phase;
      if (p !== 'Shop' && a.hud.choice && a.choiceHandler) {
        const opts = a.hud.choice.options;
        // Conversion: CONFIRM is the last option; anything else: the first.
        a.choiceHandler(p === 'Conversion' ? opts.length - 1 : 0);
      }
      return p;
    });
    if (ph === 'Shop') break;
    await c.step(800);
  }
  await c.settled();
  await c.step(1500);
  await still(c.page, '05-prize-cabinet');
  await c.page.close();
}

// ---- Game over: the trapdoor ----------------------------------------------------------------
if (want('gameover')) {
  const c = await boot();
  await startRun(c, 'ITCH-DOOM');
  await c.page.evaluate(() => {
    const a = window.deadAir;
    a.game.run.vault = 0;
    a.game.run.tray = 0;
    a.game.run.spinsLeft = 1;
    a.game.run.artifacts = [];
    a.sync(false);
  });
  await c.page.keyboard.down(' ');
  await c.step(300);
  await c.page.keyboard.up(' ');
  await c.until(() => window.deadAir.fsm.state === 'GameOver', 40000);
  await clip(c, 'game-over', 84, 12);
  await c.step(3000);
  await still(c.page, '06-game-over');
  await c.page.close();
}

// ---- The win card ---------------------------------------------------------------------------
if (want('win')) {
  const c = await boot();
  await startRun(c, 'ITCH-WIN');
  await c.page.evaluate(() => {
    const g = window.deadAir.game;
    for (let d = 1; d < 8; d++) g.run.deadlines.push({ deadline: d, debt: 450, paid: true, vaultAfter: 0, pkg: 'standard' });
    g.run.deadline = 8;
    g.run.debt = 450;
    g.run.vault = 1000;
    g.run.spinsLeft = 1;
    window.deadAir.sync(false);
  });
  await c.page.keyboard.down(' ');
  await c.step(300);
  await c.page.keyboard.up(' ');
  await c.until(() => window.deadAir.menus.page === 'summary', 60000);
  await c.step(2500);
  await still(c.page, '07-paid-in-full');
  await c.page.close();
}

await browser.close();
rmSync(TMP, { recursive: true, force: true });
console.log(report.join('\n'));
