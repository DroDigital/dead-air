# DEAD AIR

*A prize-wheel gambling roguelite in a rotting TV studio.*

You wake up strapped into a contestant chair in an abandoned game-show studio. The show is still broadcasting to no one. A host with a CRT television for a head runs it, cheerfully. You owe The Network money, and every Deadline the debt comes due and grows. Spin the wheel. Let it ride. Miss a payment and the floor opens.

Original game: no real game show's name, logo or catchphrases are used.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open the printed URL. Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Typecheck (strict) + production build to `dist/` |
| `npm test` | 168 Vitest tests: rules, wheel physics, determinism, saves and migrations, content, text coverage, regressions, simulator smoke tests |
| `npm run sim -- --runs 5000 --seed 1` | Headless balance simulator (all bot policies, multi-threaded) |
| `npm run assets` | Convert `/assets-src` → `/public/assets` (PS1 conformance), regenerate the runtime index, CREDITS.md, ASSETS_TODO.md |
| `npm run assets -- --fetch` | Download any missing CC0/OFL sources first, then convert |
| `npm run playtest -- --minutes 6` | Automated playtest through the real UI in headless Chromium (keyboard, mouse, menus). Checks game invariants and on-screen text after every step. Flags: `--boost --jump8 --doom --reload --unlock`. Needs `npm run preview` running (port 4173, or `--url`) and Playwright with a Chromium build: `npm i --no-save playwright && npx playwright install chromium`. |
| `npx tsx tools/vo.ts script \| pending \| split <batch> <file> \| index` | Voice-over script, batch splitting and the runtime clip index (see the file header) |
| `node tools/scenarios.mjs` | 11 scripted checks for paths random play rarely reaches (Prize Room, every setting, quitting mid-spin, continue, abandon, Endless). Same setup as the playtest. |

Dev extras: `?gui` (lil-gui tuning panel, dev builds only), `?debug` (draw-call/triangle readout).

## How to play

You stay seated and look between four stations (**arrow keys / WASD**, mouse wheel, or the on-screen arrows):

- **CENTER — the wheel.** Hold **SPACE** (or hold the red lever) to charge, release to spin. The gauge needle sweeps; releasing in the **green band** biases the wheel toward high-value wedges. With the Glass Eye or a Peek card, press **E** while charging to see where it will land.
- **DOWN — Tray & Vault.** Winnings land in the glass **Tray** (at risk). Every spin you don't deposit grows your **Streak** (+0.25, cash only). **ENTER** / the red **DEPOSIT** button sweeps the Tray into the **Vault** (safe) and resets the Streak. **1–3** scratch a card.
- **Sponsor's Challenge.** Each Deadline opens with one goal (score a combo, ride the Streak to ×2, hold a big Tray, ride four spins without depositing, three sweet-spot releases, land a prize). It shows top left and pays 1–2 Tokens.
- **D — Double or Nothing.** Once per Deadline, with $300+ in the Tray: stake all of it on an even-odds flip. Win and it doubles (the Streak stands); lose and it's gone (the Streak resets).
- **LEFT — shelf & phone.** Up to 6 artifacts; they trigger left → right, so order matters. **1–6** select, click another slot (or **, .**) to move, **X** twice to sell. When the phone rings, **ENTER** answers.
- **RIGHT — Prize Cabinet & debt board.** Spend Tokens: **1–6** buy, **R**/crank reroll, **X** remove, **G** gild, **+/-** widen/narrow (then pick a wedge on the wheel with ←/→ + ENTER), **N** done.

**F** toggles fast mode, **ESC** pauses. Everything is also clickable.

**A run:** 8 Deadlines (Debt = round50(450 × 1.7^(d−1))), Sweeps at 4 and 8. Pick a Broadcast Package (Short 6 spins +4 Tokens / Standard 8 +2 / Marathon 11 +0 and a temporary Bankrupt). When spins run out the Tray auto-deposits and the Vault pays. Surplus can become Tokens ($50 each) or earn interest. Then the Prize Cabinet opens, and the phone may ring.

**Combos:** ECHO (same type twice, ×2), HAT TRICK (3 cash in a row, +3 Tokens), NEIGHBORS (within 2° of a boundary, both wedges at 50%), DEAD AIR (Bankrupt with Tray > Debt — the Producer calls).

## Sound

- **Music:** the project's own score: *Channel 98* (title), *The Final Round* (the wheel), *Department Store Dreams* (Prize Cabinet), *Final Question* (deadline payment, and a short last spin), a spin-tension cue and a game-over cue. The tape slows and dulls a little every Deadline.
- **Voices:** every host, Producer, secret-caller and archive line is voiced with custom ElevenLabs voices (`eleven_v4` with audio tags) and placed through a per-speaker effect chain at runtime. The host's mouth on the CRT follows the voice.
- **Effects:** ElevenLabs-generated crowd, buzzer, bells, fanfare, phone, static, trapdoor and room tone, plus CC0 recordings for the small mechanical cues.

## Project layout

```
src/
  main.ts, app.ts          entry + app controller (FSM, flow, input routing, autosave)
  core/                    rng (sfc32 streams), fsm, events, save (versioned + migrations), config
  game/                    rules core — no DOM/Three: wheel physics, payout, combos, run, shop, hooks, balance, meta
  content/                 wedges (23), artifacts (50), scratch cards (12), bargains (37), mutators (8), host lines (95), lore (22), starting wheels (4), stakes (4)
  assets/                  id-based loader with procedural fallbacks; generated runtime manifest
  render/                  PSX material, post chain, camera rig, VFX, stage, scene/* (studio, wheel, tray, vault, shelf, cabinet, host, phone, lever, props)
  audio/                   mixer (buses), SFX, music (context tracks with tape wear), voice-over player with per-speaker effect chains, gibberish fallback voice
  ui/                      input, HUD/chyrons, tooltips, DOM menus, bitmap font
sim/                       bot policies + simulator
tools/                     asset pipeline (assets.ts), browser harnesses (playtest.mjs, scenarios.mjs, shared Playwright loader browser.mjs), screenshot helper (shot.mjs)
tests/                     Vitest suites (rng, wheel, payout, artifacts, run, shop/phone, saves, content, text, regressions, sim)
assets/manifest.json       licensing source of truth
```

See **DECISIONS.md** (interpretations and deviations), **BALANCE.md** (simulator results), **PLAYTEST.md** (playtest method, findings and fixes), **CREDITS.md** (generated), **ASSETS_TODO.md** (procedural stand-ins still awaiting CC0 recordings).
