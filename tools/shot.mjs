// Dev helper: drive the built game in headless Chromium and take screenshots.
// usage: node tools/shot.mjs <url> <outdir> [basic|title|long]
import { mkdirSync } from 'node:fs';
import { chromium } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'shots';
const script = process.argv[4] ?? 'basic';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => {
  if (!m.text().includes('useProgram')) logs.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url.includes('?') ? `${url}&skipintro` : `${url}?skipintro`);
const snap = async (name) => page.screenshot({ path: `${out}/${name}.png` });
const sleep = (ms) => page.waitForTimeout(ms);
const state = () => page.evaluate(() => ({ phase: window.deadAir.game?.run.phase ?? null, choice: !!window.deadAir.hud.choice, fsm: window.deadAir.fsm.state, busy: window.deadAir.busy }));

await sleep(2500);
await snap('01-loading');
await sleep(4000);
await snap('02-title');
if (script === 'title') {
  console.log(logs.join('\n'));
  await browser.close();
  process.exit(0);
}
await page.evaluate(() => window.deadAir.newRun('SHOT-1', 0, 'standard'));
await sleep(4500);
await snap('03-packages');
await page.keyboard.press('2');
await sleep(1500);
await snap('04-center');
let spins = 0;
const maxSpins = script === 'long' ? 40 : 2;
for (let guard = 0; guard < 400 && spins < maxSpins; guard++) {
  const s = await state();
  if (s.busy) {
    await sleep(300);
    continue;
  }
  if (s.phase === 'GameOver' || s.phase === null) {
    await sleep(3000);
    await snap('game-over');
    break;
  }
  if (s.choice) {
    if (spins % 7 === 3) await snap(`choice-${spins}`);
    await page.keyboard.press('Enter');
    await sleep(400);
    continue;
  }
  if (s.phase === 'AwaitAction') {
    await page.keyboard.down(' ');
    await sleep(350 + ((spins * 137) % 600));
    if (spins === 0) await snap('05-charging');
    await page.keyboard.up(' ');
    spins++;
    await sleep(1500);
    if (spins === 1) await snap('06-spinning');
    continue;
  }
  if (s.phase === 'PhoneCall') {
    await page.keyboard.press('Enter');
    await sleep(500);
    continue;
  }
  if (s.phase === 'Shop') {
    await snap(`shop-${spins}`);
    await page.keyboard.press('n');
    await sleep(500);
    continue;
  }
  await sleep(300);
}
await sleep(2000);
await snap('07-after');
for (const [k, name] of [
  ['ArrowDown', '08-down'],
  ['ArrowLeft', '09-left'],
  ['ArrowRight', '10-center'],
  ['ArrowRight', '11-right'],
]) {
  await page.keyboard.press(k);
  await sleep(900);
  await snap(name);
  logs.push(`${name} ${JSON.stringify(await page.evaluate(() => window.deadAir.stage.stats))}`);
}
const stats = await page.evaluate(() => {
  const a = window.deadAir;
  return { calls: a.stage.stats.calls, tris: a.stage.stats.triangles, phase: a.game?.run.phase, fsm: a.fsm.state, deadline: a.game?.run.deadline };
});
logs.push(`STATS ${JSON.stringify(stats)}`);
console.log(logs.join('\n'));
await browser.close();
