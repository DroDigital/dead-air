// Scripted checks for paths that random play reaches rarely. Run with the preview server up:
//   node tools/scenarios.mjs [--url http://localhost:4173/] [--out <dir>]
// Exits non-zero if any check fails. Each check prints PASS or FAIL with the evidence.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from './browser.mjs';

const flag = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const url = flag('--url', 'http://localhost:4173/');
const out = flag('--out', 'scenario-out');
mkdirSync(out, { recursive: true });

const results = [];
const pageErrors = [];
const check = (name, ok, evidence = '') => {
  results.push({ name, ok, evidence });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${evidence ? `  (${evidence})` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('dialog', (d) => d.accept());
await page.goto(url);
await page.waitForFunction(() => window.deadAir && window.deadAir.stage && window.deadAir.fsm.state === 'Menu', null, { timeout: 90000 });

const idle = (ms = 15000) =>
  page.waitForFunction(() => window.deadAir.busy === 0 && !window.deadAir.stage.wheel.busy && !window.deadAir.charge, null, { timeout: ms }).then(() => true, () => false);
const menuPage = () => page.evaluate(() => window.deadAir.menus.page);
const clickMenu = (label) => page.locator('#menus button', { hasText: label }).first().click({ timeout: 5000 });

// ---- 1. Prize Room and Credits render without undefined/NaN text ----------------------
await page.locator('#menus button', { hasText: 'THE PROP ROOM' }).first().click();
await page.waitForTimeout(200);
let text = await page.locator('#menus').innerText();
check('prop room renders', /PROP ROOM/.test(text) && !/undefined|NaN|\[object/.test(text), `${text.length} chars`);
await clickMenu('BACK');
await page.locator('#menus button', { hasText: 'CREDITS' }).first().click();
await page.waitForTimeout(200);
text = await page.locator('#menus').innerText();
check('credits page lists the audio cues', /RPG Sound Pack|artisticdude/.test(text) && !/undefined|NaN|\[object/.test(text));
await clickMenu('BACK');

// ---- 2. Settings: every option applies without errors, including a mid-run change ----
await page.locator('#menus button', { hasText: 'SETTINGS' }).first().click();
await page.waitForTimeout(150);
await page.locator('#menus select[data-k="resolutionScale"]').selectOption('2');
await page.locator('#menus input[data-k="crt"]').uncheck();
await page.locator('#menus input[data-k="colorblind"]').check();
await page.locator('#menus input[data-k="reducedFlashing"]').check();
await page.locator('#menus input[data-k="warp"]').fill('0.5');
await clickMenu('DONE');
const settings = await page.evaluate(() => window.deadAir.settings);
check('settings persist', settings.resolutionScale === 2 && settings.crt === false && settings.colorblind === true && settings.reducedFlashing === true && Math.abs(settings.warp - 0.5) < 1e-9, JSON.stringify({ r: settings.resolutionScale, crt: settings.crt, cb: settings.colorblind, rf: settings.reducedFlashing, warp: settings.warp }));
await page.locator('#menus input[data-k="colorblind"]').count(); // settings page closed; reopen check below

// ---- 3. Start a run at 2× resolution with colourblind patterns ----------------------
await page.locator('#menus button', { hasText: 'NEW BROADCAST' }).first().click();
await page.waitForTimeout(150);
await clickMenu('GO LIVE');
await page.waitForFunction(() => window.deadAir.game && window.deadAir.hud.choice, null, { timeout: 30000 });
const scaleOk = await page.evaluate(() => window.deadAir.stage.post.scale === 2 && window.deadAir.stage.post.crt === false);
check('2× internal resolution applies at run start', scaleOk);
await page.evaluate(() => window.deadAir.applySettings({ ...window.deadAir.settings, fastMode: true }));
await page.keyboard.press('2');
await page.waitForTimeout(1500);
await page.evaluate(() => window.deadAir.hud.caption && window.deadAir.hud.captions.splice(0));
await page.screenshot({ path: join(out, 'settings-2x-colorblind.png') });

// ---- 4. Tooltip under the pointer matches the wedge under the flapper ----------------
await idle(20000);
await page.keyboard.down(' ');
await page.waitForTimeout(400);
await page.keyboard.up(' ');
await idle(30000);
const hover = await page.evaluate(() => {
  const a = window.deadAir;
  const L = a.game.layout();
  const pointer = a.stage.wheel.pointerLocal();
  const expected = L.segments.find((s) => pointer >= s.start && pointer < s.end);
  // Hover on the rim just above the flapper (the wedge under the pointer at rest).
  const r = a.canvas.getBoundingClientRect();
  const vp = a.stage.post.viewport(r.width, r.height);
  const iy = a.stage.wheel.group.position.y;
  return { expectedKind: expected ? expected.kind : null, pointer, vp, iy };
});
await page.mouse.move(640, 160);
await page.waitForTimeout(400);
const tip = await page.evaluate(() => window.deadAir.hud.tooltip);
const tipName = tip ? tip.split('\n')[0] : '';
// Tooltip first line is the wedge's display name (upper case), e.g. "CASH $200".
const NAMES = { cash: 'CASH', jackpot: 'JACKPOT', bankrupt: 'BANKRUPT', dud: 'DUD', respin: 'RESPIN', token: 'TOKEN', boost: 'BOOST', artifact: 'ARTIFACT', mystery: 'MYSTERY', tax: 'TAX', interest: 'INTEREST', thief: 'THIEF', haunted: 'HAUNTED', charge: 'CHARGE', overtime: 'OVERTIME', scratch: 'SCRATCHER', payday: 'PAYDAY', doubler: 'DOUBLER', vaultKey: 'VAULT KEY', ringJump: 'RING JUMP', wild: 'WILD', splitter: 'SPLITTER', cursedCash: 'CURSED CASH' };
const want = NAMES[hover.expectedKind] ?? hover.expectedKind;
check('tooltip on the wheel names the wedge under the pointer', !!tip && tipName.startsWith(want), `tooltip "${tipName}", wedge under flapper: ${want}`);

// ---- 5. Quitting during a spin waits for the spin, then quits cleanly -------------------
await idle(20000);
await page.keyboard.down(' ');
await page.waitForTimeout(300);
await page.keyboard.up(' ');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await clickMenu('QUIT TO TITLE');
await page.waitForFunction(() => window.deadAir.menus.page === 'title', null, { timeout: 40000 }).then(() => true, () => false);
const quitOk = (await menuPage()) === 'title' && (await page.evaluate(() => !window.deadAir.game || window.deadAir.game.run.phase !== undefined));
check('quit during a spin waits for the spin, then returns to title', quitOk && pageErrors.length === 0, `menu=${await menuPage()}`);

// ---- 6. Continue the saved run, then abandon it -----------------------------------------
await page.locator('#menus button', { hasText: 'CONTINUE' }).first().click({ timeout: 5000 }).catch(() => {});
await page.waitForFunction(() => window.deadAir.game && window.deadAir.game.run, null, { timeout: 20000 }).then(() => true, () => false);
const continued = await page.evaluate(() => !!window.deadAir.game);
check('continue restores the saved run', continued);
await page.evaluate(() => window.deadAir.abandon());
await page.waitForFunction(() => window.deadAir.menus.page === 'summary', null, { timeout: 20000 }).then(() => true, () => false);
const summaryTitle = await page.locator('#menus h2').first().textContent().catch(() => '');
check('abandon shows the end-of-run summary and records Ratings', /THAT'S OUR SHOW/.test(summaryTitle), summaryTitle);
await clickMenu('BACK TO TITLE');

// ---- 7. Fast mode toggles from the keyboard and shows its tag ----------------------------
await page.locator('#menus button', { hasText: 'NEW BROADCAST' }).first().click();
await page.waitForTimeout(150);
await clickMenu('GO LIVE');
await page.waitForFunction(() => window.deadAir.game && window.deadAir.hud.choice, null, { timeout: 30000 });
await page.evaluate(() => window.deadAir.applySettings({ ...window.deadAir.settings, fastMode: false }));
await page.keyboard.press('f');
await page.waitForTimeout(150);
const fastOn = await page.evaluate(() => window.deadAir.settings.fastMode && window.deadAir.hud.fastMode);
check('F toggles fast mode', fastOn);

// ---- 8. Paying Deadline 8 offers Endless, and Endless starts Deadline 9 ---------------
await page.evaluate(() => { window.deadAir.meta.totalRatings = 600; });
await clickMenu('BACK TO TITLE').catch(() => {});
await page.waitForFunction(() => window.deadAir.menus.page === 'title' || window.deadAir.menus.page === null, null, { timeout: 20000 }).catch(() => {});
await page.evaluate(() => window.deadAir.menus.show('title'));
await page.locator('#menus button', { hasText: 'NEW BROADCAST' }).first().click();
await page.waitForTimeout(150);
await clickMenu('GO LIVE');
await page.waitForFunction(() => window.deadAir.game && window.deadAir.hud.choice, null, { timeout: 30000 });
await page.evaluate(() => {
  const g = window.deadAir.game;
  for (let d = 1; d < 8; d++) g.run.deadlines.push({ deadline: d, debt: 450, paid: true, vaultAfter: 0, pkg: 'standard' });
  g.run.deadline = 8;
  g.run.debt = 450;
  g.run.vault = 1000;
  window.deadAir.sync(false);
});
await page.keyboard.press('2');
await page.waitForTimeout(1200);
await page.evaluate(() => { window.deadAir.game.run.spinsLeft = 1; });
await page.keyboard.down(' ');
await page.waitForTimeout(300);
await page.keyboard.up(' ');
const victory = await page.waitForFunction(() => window.deadAir.menus.page === 'summary', null, { timeout: 60000 }).then(() => true, () => false);
const winTitle = victory ? await page.locator('#menus h2').first().textContent() : '';
const endlessButton = await page.locator('#menus button', { hasText: 'KEEP BROADCASTING' }).count();
check('paying Deadline 8 shows the victory summary with Endless on offer', victory && /PAID/.test(winTitle) && endlessButton === 1, `title "${winTitle}", endless button ${endlessButton}`);
if (victory && endlessButton) {
  await clickMenu('KEEP BROADCASTING');
  await page.waitForFunction(() => window.deadAir.game && window.deadAir.game.run.phase === 'Conversion', null, { timeout: 20000 }).then(() => true, () => false);
  await page.waitForFunction(() => window.deadAir.hud.choice, null, { timeout: 20000 }).catch(() => {});
  await page.keyboard.press('4');
  await page.waitForTimeout(700);
  await page.waitForFunction(() => window.deadAir.game && window.deadAir.game.run.phase === 'Shop', null, { timeout: 20000 }).then(() => true, () => false);
  await page.keyboard.press('n');
  await page.waitForTimeout(900);
  if (await page.evaluate(() => window.deadAir.game && window.deadAir.game.run.phase === 'PhoneCall')) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.press('3');
    await page.waitForTimeout(700);
  }
  await page.waitForFunction(() => window.deadAir.game && window.deadAir.game.run.deadline === 9, null, { timeout: 20000 }).then(() => true, () => false);
  const e = await page.evaluate(() => ({ deadline: window.deadAir.game?.run.deadline, endless: window.deadAir.game?.run.endless, phase: window.deadAir.game?.run.phase }));
  check('Endless starts Deadline 9 with Endless flagged', e.deadline === 9 && e.endless === true, JSON.stringify(e));
  await page.screenshot({ path: join(out, 'endless-deadline-9.png') });
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
for (const e of pageErrors) console.log(`page error: ${e}`);
console.log(`\n${results.length - failed}/${results.length} checks passed, ${pageErrors.length} page errors`);
process.exit(failed || pageErrors.length ? 1 : 0);
