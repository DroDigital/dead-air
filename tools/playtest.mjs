// Automated playtest through the real UI (keyboard, mouse, menus) in headless Chromium.
//
// usage: node tools/playtest.mjs [--url http://localhost:4173/] [--minutes 6] [--out playtest-out]
//                                [--boost] [--jump8] [--doom] [--reload] [--unlock] [--no-shots]
//   --boost   extra vault money so the Prize Cabinet and phone are reached sooner
//   --jump8   sometimes jump to Deadline 8 (victory, endless)      --doom  sometimes make the Debt impossible (game over)
//   --reload  sometimes reload the page mid-run and check the save restores the same state
//   --unlock  start with Ratings unlocked (endless, all stakes, locked artifacts)
//
// After every step it checks game invariants (money never negative, 24 wedges, phase/FSM agreement,
// layout sums to 360°, shelf/scratch limits, no NaN) and watches every caption, banner, toast and
// marquee for "undefined"/"NaN"/"[object". Page errors and console errors are collected.
// Exits non-zero if any issue was found, and writes a JSON report to --out.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from './browser.mjs';

const opt = { url: 'http://localhost:4173/', minutes: 6, out: 'playtest-out', boost: false, shots: true, jump8: false, doom: false, reload: false, unlock: false };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--boost') opt.boost = true;
  else if (a === '--jump8') opt.jump8 = true;
  else if (a === '--doom') opt.doom = true;
  else if (a === '--reload') opt.reload = true;
  else if (a === '--unlock') opt.unlock = true;
  else if (a === '--no-shots') opt.shots = false;
  else if (a === '--url') opt.url = process.argv[++i];
  else if (a === '--minutes') opt.minutes = Number(process.argv[++i]);
  else if (a === '--out') opt.out = process.argv[++i];
}
mkdirSync(opt.out, { recursive: true });

const issues = [];
const seen = new Set();
const note = (kind, msg, extra = {}) => {
  const key = `${kind}:${msg}`;
  if (seen.has(key)) return;
  seen.add(key);
  issues.push({ kind, msg, ...extra });
  console.log(`!! [${kind}] ${msg}`);
};
const counts = { steps: 0, spins: 0, deposits: 0, choices: 0, shopActions: 0, buys: 0, services: 0, scratch: 0, clicks: 0, menus: 0, games: 0, gameOvers: 0, victories: 0, phones: 0, reloads: 0, stuck: 0, shots: 0 };

const CHOICE_PHASES = ['PackageSelect', 'ArtifactPick', 'Nudge', 'Conversion', 'PhoneCall'];
const FSM_FOR_PHASE = {
  PackageSelect: ['PackageSelect', 'DeadlineIntro'],
  AwaitAction: ['AwaitAction', 'Charging', 'Spinning', 'Resolving'],
  Nudge: ['Resolving'],
  ArtifactPick: ['Resolving'],
  WedgeReplace: ['Shop'],
  Shop: ['Shop'],
  Conversion: ['Conversion'],
  PhoneCall: ['PhoneCall'],
  GameOver: ['GameOver'],
  Victory: ['Victory'],
};

// Runs inside the page once the app exists: wraps every text-producing call.
const HOOKS = () => {
  const a = window.deadAir;
  window.__pt = { errors: [], strings: 0 };
  const bad = /undefined|NaN|\[object|Infinity|null/;
  const wrap = (obj, name, label) => {
    const orig = obj[name].bind(obj);
    obj[name] = (...args) => {
      const s = args.map((x) => String(x)).join(' | ');
      window.__pt.strings++;
      if (bad.test(s)) window.__pt.errors.push(`${label}: ${s.slice(0, 160)}`);
      return orig(...args);
    };
  };
  wrap(a.hud, 'toast', 'toast');
  wrap(a.hud, 'caption', 'caption');
  wrap(a.hud, 'showBanner', 'banner');
  wrap(a.stage.marquee, 'set', 'marquee');
  a.applySettings({ ...a.settings, fastMode: true });
};

const SNAP = () => {
  const a = window.deadAir;
  const g = a.game;
  const r = g ? g.run : null;
  const out = {
    fsm: a.fsm.state,
    busy: a.busy + (a.stage.wheel.busy ? 1 : 0),
    charging: !!a.charge,
    station: a.stage.rig.station,
    menu: a.menus.page,
    choice: a.hud.choice ? { title: a.hud.choice.title, labels: a.hud.choice.options.map((o) => o.label) } : null,
    target: !!a.target,
    bad: window.__pt.errors.splice(0),
    payout: a.hud.payout ? a.hud.payout.text : null,
  };
  if (r) {
    Object.assign(out, {
      phase: r.phase,
      deadline: r.deadline,
      tray: r.tray,
      vault: r.vault,
      tokens: r.tokens,
      spins: r.spinsLeft,
      streak: r.streak,
      debt: r.debt,
      arts: r.artifacts.map((x) => x.id),
      scratch: r.scratch.length,
      wheel: r.wheel.length,
      phone: !!r.phone,
      shop: !!r.shop,
      mutator: r.mutator,
      ring: r.ring,
      layoutOk: (() => {
        const L = g.layout();
        const s = L.segments;
        let ok = Math.abs(s[s.length - 1].end - 360) < 1e-6;
        for (let i = 1; i < s.length; i++) ok = ok && Math.abs(s[i].start - s[i - 1].end) < 1e-6 && s[i].end > s[i].start;
        return ok;
      })(),
    });
  }
  return out;
};

function checkSnap(s, prev) {
  const v = [];
  if (s.phase === undefined) return v;
  for (const k of ['tray', 'vault', 'tokens', 'spins', 'streak', 'debt', 'deadline']) if (!Number.isFinite(s[k])) v.push(`${k} is not a number (${s[k]})`);
  if (s.tray < 0) v.push(`tray negative (${s.tray})`);
  if (s.vault < 0) v.push(`vault negative (${s.vault})`);
  if (s.tokens < 0) v.push(`tokens negative (${s.tokens})`);
  if (s.spins < 0) v.push(`spins negative (${s.spins})`);
  if (s.streak < 1) v.push(`streak below ×1 (${s.streak})`);
  if (s.wheel !== 24) v.push(`wheel has ${s.wheel} wedges`);
  if (s.arts.length > 6) v.push(`shelf holds ${s.arts.length} artifacts`);
  if (new Set(s.arts).size !== s.arts.length) v.push(`duplicate artifact on shelf: ${s.arts.join(',')}`);
  if (s.scratch > 3) v.push(`${s.scratch} scratch cards held`);
  if (!s.layoutOk) v.push('wheel layout does not sum to 360° contiguously');
  if (s.ring.some((m) => !Number.isFinite(m) || m < 0)) v.push(`inner ring has bad values ${JSON.stringify(s.ring)}`);
  if (s.choice && !CHOICE_PHASES.includes(s.phase)) v.push(`choice panel open during ${s.phase}`);
  if (!s.busy && !s.menu && !s.charging && s.phase) {
    const ok = FSM_FOR_PHASE[s.phase] ?? [];
    if (!ok.includes(s.fsm)) v.push(`FSM ${s.fsm} disagrees with phase ${s.phase}`);
  }
  if (s.charging && s.fsm !== 'Charging' && !s.menu) v.push(`charging flag set but FSM is ${s.fsm}`);
  if (!s.charging && s.fsm === 'Charging' && !s.menu) v.push('FSM stuck in Charging with no charge in progress');
  if (prev && prev.phase === 'AwaitAction' && s.phase === 'AwaitAction' && s.debt !== prev.debt && s.deadline === prev.deadline && !s.phone) v.push(`debt changed mid-deadline without a call (${prev.debt} -> ${s.debt})`);
  for (const b of s.bad ?? []) note('text', b);
  return v;
}

async function click(page, label) {
  const btn = page.locator('#menus button', { hasText: label }).first();
  if (await btn.count()) {
    await btn.click({ timeout: 3000 }).catch(() => {});
    return true;
  }
  return false;
}

async function waitIdle(page, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const busy = await page.evaluate(() => window.deadAir.busy + (window.deadAir.stage.wheel.busy ? 1 : 0) + (window.deadAir.charge ? 1 : 0));
    if (!busy) return true;
    await page.waitForTimeout(120);
  }
  return false;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const digit = (n) => String(1 + Math.floor(Math.random() * Math.max(1, n)));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => note('pageerror', e.message, { stack: (e.stack || '').split('\n').slice(0, 4).join(' | ') }));
page.on('console', (m) => {
  if (m.type() === 'error' && !/useProgram|WebGL|GPU stall|swiftshader/i.test(m.text())) note('console', m.text().slice(0, 240));
});

if (opt.unlock) {
  const meta = { v: 1, savedAt: Date.now(), data: { v: 1, ratings: 600, totalRatings: 600, runs: 12, wins: 1, bestDeadline: 5, bestStakeWon: -1, seenArtifacts: [], unlocked: [], secretFound: false, truthFound: false, lifetime: { bankrupts: 4, jackpots: 1, phoneCalls: 3, deadAir: 0, maxStreak: 3, fullShelf: 0, spins: 90 }, lastSeed: '' } };
  await page.addInitScript((m) => { try { if (!localStorage.getItem('deadair.meta')) localStorage.setItem('deadair.meta', JSON.stringify(m)); } catch { /* storage blocked */ } }, meta);
}
await page.goto(opt.url.includes('?') ? `${opt.url}&skipintro` : `${opt.url}?skipintro`);
await page.waitForFunction(() => window.deadAir && window.deadAir.stage && window.deadAir.game, null, { timeout: 90000 });
await page.evaluate(HOOKS);

// Frame pacing in this environment (CPU-rendered; not representative of a GPU laptop).
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0;
  const t0 = performance.now();
  const f = () => {
    n++;
    if (performance.now() - t0 < 3000) requestAnimationFrame(f);
    else res({ fps: n / 3, frameMs: 3000 / n });
  };
  requestAnimationFrame(f);
}));
console.log(`frame pacing (headless, software GL): ${fps.fps.toFixed(1)} fps`);

const shotNames = new Set();
let summaryCounted = false;
let convSteps = 0;
async function shot(name) {
  if (!opt.shots || counts.shots >= 30 || shotNames.has(name)) return;
  shotNames.add(name);
  counts.shots++;
  await page.screenshot({ path: join(opt.out, `${String(counts.shots).padStart(2, '0')}-${name}.png`) });
}

const deadline = Date.now() + opt.minutes * 60000;
let prev = null;
let sameCount = 0;
let lastKey = '';

while (Date.now() < deadline) {
  counts.steps++;
  const s = await page.evaluate(SNAP);
  const problems = checkSnap(s, prev);
  for (const p of problems) note('invariant', p, { phase: s.phase, deadline: s.deadline });
  if (s.phase && s.phase !== prev?.phase) {
    if (s.phase === 'GameOver') counts.gameOvers++;
    if (s.phase === 'Victory') counts.victories++;
  }
  prev = s;

  const key = JSON.stringify([s.menu, s.phase, s.deadline, s.spins, s.tray, s.vault, s.fsm, s.busy, !!s.choice]);
  sameCount = key === lastKey ? sameCount + 1 : 0;
  lastKey = key;
  if (sameCount > 40) {
    counts.stuck++;
    note('stuck', `no progress for 40 steps in ${s.menu ?? s.phase} (fsm ${s.fsm}, busy ${s.busy})`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await page.reload();
    await page.waitForFunction(() => window.deadAir && window.deadAir.stage, null, { timeout: 90000 });
    await page.evaluate(HOOKS);
    counts.reloads++;
    sameCount = 0;
    continue;
  }

  // ---- Menus -------------------------------------------------------------------------
  if (s.menu) {
    counts.menus++;
    if (s.menu === 'new') {
      if (Math.random() < 0.5) await page.locator('#stake').selectOption({ index: Math.floor(Math.random() * 2) }).catch(() => {});
      await click(page, 'GO LIVE');
      counts.games++;
    } else if (s.menu === 'pause') {
      // The pause menu is the hub: no title screen to quit to.
      const r = Math.random();
      if (r < 0.12) await click(page, 'SETTINGS');
      else if (r < 0.17) await click(page, 'THE PROP ROOM');
      else if (r < 0.2) await click(page, 'NEW BROADCAST');
      else if (r < 0.23) await click(page, 'ABANDON BROADCAST');
      else (await click(page, 'RESUME')) || (await click(page, 'NEXT CONTESTANT'));
    } else if (s.menu === 'summary') {
      const title = (await page.locator('#menus h2').first().textContent().catch(() => '')) || '';
      if (!summaryCounted) {
        summaryCounted = true;
        if (title.includes('PAID')) counts.victories++; else counts.gameOvers++;
      }
      await shot('summary');
      let clicked = false;
      if (title.includes('PAID') && Math.random() < 0.8) clicked = await click(page, 'KEEP BROADCASTING');
      if (clicked) counts.endless = (counts.endless ?? 0) + 1;
      else await click(page, 'RETIRE A WINNER') || await click(page, 'NEXT CONTESTANT') || await click(page, 'KEEP BROADCASTING');
      summaryCounted = false;
    } else if (s.menu === 'settings') {
      const boxes = page.locator('#menus input[type=checkbox]');
      const n = await boxes.count();
      if (n) await boxes.nth(Math.floor(Math.random() * n)).click().catch(() => {});
      await click(page, 'DONE');
    } else if (s.menu === 'collection' || s.menu === 'credits') {
      await click(page, 'BACK');
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(250);
    continue;
  }

  // Watch the score of the one thing that should always be visible while playing.
  if (!s.phase) {
    await page.waitForTimeout(300);
    continue;
  }

  if (opt.boost && s.phase === 'PackageSelect' && !s.choice && Math.random() < 0.5) {
    await page.evaluate(() => { window.deadAir.game.run.vault += 1500; window.deadAir.sync(false); });
  }

  if (opt.jump8 && s.phase === 'PackageSelect' && s.deadline < 8 && !s.jumped && Math.random() < 0.25) {
    prev = null;
    await page.evaluate(() => { const g = window.deadAir.game; for (let d = 1; d < 8; d++) g.run.deadlines.push({ deadline: d, debt: 450, paid: true, vaultAfter: 0, pkg: 'standard' }); g.run.deadline = 8; g.run.debt = 450; g.run.vault = Math.max(g.run.vault, 1000); window.deadAir.sync(false); window.deadAir.enterPhase(); });
    counts.jumps = (counts.jumps ?? 0) + 1;
    await page.waitForTimeout(400);
    continue;
  }
  if (opt.doom && s.phase === 'AwaitAction' && s.deadline >= 2 && Math.random() < 0.02) {
    prev = null;
    await page.evaluate(() => { const g = window.deadAir.game; g.run.debt = 1000000; g.run.spinsLeft = 1; window.deadAir.sync(false); });
  }
  if (opt.reload && s.phase === 'AwaitAction' && !s.charging && Math.random() < 0.02) {
    const before = { phase: s.phase, deadline: s.deadline, tray: s.tray, vault: s.vault, spins: s.spins, streak: s.streak, debt: s.debt, arts: s.arts.join(',') };
    counts.reloads++;
    await page.reload();
    // No title screen: the saved run resumes by itself after the fly-in.
    const resumed = await page.waitForFunction(() => window.deadAir && window.deadAir.game && window.deadAir.busy === 0, null, { timeout: 90000 }).then(() => true, () => false);
    await page.evaluate(HOOKS);
    if (!resumed) {
      note('save', 'the saved run did not resume after reloading mid-run');
    } else {
      await page.waitForTimeout(600);
      const after = await page.evaluate(SNAP);
      const diffs = Object.keys(before).filter((k) => String(before[k]) !== String(after[k] ?? '')).map((k) => `${k}: ${before[k]} -> ${after[k]}`);
      if (diffs.length) note('save', `state changed across reload+continue (${diffs.join('; ')})`);
    }
    continue;
  }

  // ---- Choices (artifact picks, nudge, package, conversion, phone offers) -----------
  if (s.choice) {
    counts.choices++;
    convSteps = s.phase === 'Conversion' ? convSteps + 1 : 0;
    if (convSteps % 6 === 5) { await page.keyboard.press('4'); await page.waitForTimeout(200); continue; }
    await shot(`choice-${s.phase}`);
    const n = s.choice.labels.length;
    if (s.phase === 'Conversion' && Math.random() < 0.6) {
      await page.keyboard.press(pick(['1', '2', '3']));
    } else if (s.phase === 'PhoneCall') {
      counts.phones++;
      await shot('phone-offers');
      await page.keyboard.press(Math.random() < 0.25 ? String(n) : digit(n - 1));
    } else if (Math.random() < 0.15) {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
    } else {
      await page.keyboard.press(digit(n));
    }
    await page.waitForTimeout(200);
    await waitIdle(page, 8000);
    continue;
  }

  // ---- Phone ring (answer with Enter, or wait) ---------------------------------------
  if (s.phase === 'PhoneCall') {
    await shot('phone-ringing');
    await page.keyboard.press('Enter');
    await waitIdle(page, 8000);
    continue;
  }

  // ---- Wedge targeting (Cabinet install / remove / gild / resize) --------------------
  if (s.target) {
    const r = Math.random();
    if (r < 0.5) await page.keyboard.press('Enter');
    else if (r < 0.9) await page.keyboard.press(pick(['ArrowLeft', 'ArrowRight']));
    else await page.keyboard.press('Backspace');
    await page.waitForTimeout(120);
    continue;
  }

  // ---- Prize Cabinet ---------------------------------------------------------------
  if (s.phase === 'Shop' || s.shop) {
    if (s.station !== 'right') {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(350);
      continue;
    }
    counts.shopActions++;
    await shot('cabinet');
    const r = Math.random();
    if (r < 0.35) { counts.buys++; await page.keyboard.press(digit(6)); }
    else if (r < 0.45) await page.keyboard.press('r');
    else if (r < 0.6) { counts.services++; await page.keyboard.press(pick(['x', 'g', '+', '-'])); }
    else if (r < 0.66) await page.keyboard.press('n');
    else if (r < 0.72) await page.mouse.click(1280 * (0.6 + Math.random() * 0.35), 720 * (0.3 + Math.random() * 0.5));
    else await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await waitIdle(page, 6000);
    continue;
  }

  // ---- Game table ------------------------------------------------------------------
  if (s.phase === 'AwaitAction') {
    if (Math.random() < 0.02) {
      // Escape must open the pause menu and keep it open.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      const page2 = await page.evaluate(() => window.deadAir.menus.page);
      if (page2 !== 'pause') note('input', `Escape during play did not open the pause menu (menu is ${page2})`);
      counts.escapes = (counts.escapes ?? 0) + 1;
      continue;
    }
    if (opt.boost && s.spins > 0 && Math.random() < 0.03) {
      await page.evaluate(() => { const g = window.deadAir.game; g.run.tray = g.run.debt + 300; window.deadAir.sync(false); });
    }
    const r = Math.random();
    if (r < 0.6) {
      counts.spins++;
      await page.keyboard.down(' ');
      await page.waitForTimeout(60 + Math.floor(Math.random() * 900));
      if (Math.random() < 0.2) await page.keyboard.press('e');
      await page.keyboard.up(' ');
      await shot(`spin-${s.station}`);
      await page.waitForTimeout(150);
      await waitIdle(page, 20000);
    } else if (r < 0.68) {
      counts.deposits++;
      await page.keyboard.press('Enter');
      await waitIdle(page, 6000);
    } else if (r < 0.74) {
      counts.scratch++;
      await page.keyboard.press(digit(3));
      await page.waitForTimeout(200);
    } else if (r < 0.86) {
      await page.keyboard.press(pick(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']));
      await page.waitForTimeout(300);
    } else if (r < 0.92) {
      counts.clicks++;
      await page.mouse.click(40 + Math.random() * 1200, 40 + Math.random() * 640);
      await page.waitForTimeout(250);
    } else {
      await page.keyboard.press(pick(['1', '2', '3', '4', '5', '6']));
      await page.waitForTimeout(200);
    }
    if (counts.steps % 45 === 0) await shot(`station-${await page.evaluate(() => window.deadAir.stage.rig.station)}`);
    continue;
  }

  // ---- Anything else (intro, nudge without choice, unexpected) ----------------------
  await page.waitForTimeout(300);
  if (s.phase === 'Nudge' || s.phase === 'ArtifactPick') await page.keyboard.press('Enter');
  if (s.phase === 'GameOver' || s.phase === 'Victory') await waitIdle(page, 8000);
}

const report = { url: opt.url, minutes: opt.minutes, frame: fps, counts, issues, finishedAt: new Date().toISOString() };
writeFileSync(join(opt.out, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\nsteps ${counts.steps} · games ${counts.games} · spins ${counts.spins} · choices ${counts.choices} · phone ${counts.phones} · shop actions ${counts.shopActions} · game overs ${counts.gameOvers} · victories ${counts.victories} · stuck ${counts.stuck}`);
console.log(`issues: ${issues.length}`);
await browser.close();
process.exit(issues.length ? 1 : 0);
