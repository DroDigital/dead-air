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
| `npm test` | 150+ Vitest unit tests (rules, physics, determinism, saves, content, sim) |
| `npm run sim -- --runs 5000 --seed 1` | Headless balance simulator (all bot policies, multi-threaded) |
| `npm run assets` | Convert `/assets-src` → `/public/assets` (PS1 conformance), regenerate the runtime index, CREDITS.md, ASSETS_TODO.md |
| `npm run assets -- --fetch` | Download any missing CC0/OFL sources first, then convert |

Dev extras: `?gui` (lil-gui tuning panel, dev builds only), `?debug` (draw-call/triangle readout).

## How to play

You stay seated and look between four stations (**arrow keys / WASD**, mouse wheel, or the on-screen arrows):

- **CENTER — the wheel.** Hold **SPACE** (or hold the red lever) to charge, release to spin. The gauge needle sweeps; releasing in the **green band** biases the wheel toward high-value wedges. With the Glass Eye or a Peek card, press **E** while charging to see where it will land.
- **DOWN — Tray & Vault.** Winnings land in the glass **Tray** (at risk). Every spin you don't deposit grows your **Streak** (+0.25, cash only). **ENTER** / the red **DEPOSIT** button sweeps the Tray into the **Vault** (safe) and resets the Streak. **1–3** scratch a card.
- **LEFT — shelf & phone.** Up to 6 artifacts; they trigger left → right, so order matters. **1–6** select, click another slot (or **, .**) to move, **X** twice to sell. When the phone rings, **ENTER** answers.
- **RIGHT — Prize Cabinet & debt board.** Spend Tokens: **1–6** buy, **R**/crank reroll, **X** remove, **G** gild, **+/-** widen/narrow (then pick a wedge on the wheel with ←/→ + ENTER), **N** done.

**F** toggles fast mode, **ESC** pauses. Everything is also clickable.

**A run:** 8 Deadlines (Debt = round50(450 × 1.7^(d−1))), Sweeps at 4 and 8. Pick a Broadcast Package (Short 6 spins +4 Tokens / Standard 8 +2 / Marathon 11 +0 and a temporary Bankrupt). When spins run out the Tray auto-deposits and the Vault pays. Surplus can become Tokens ($50 each) or earn interest. Then the Prize Cabinet opens, and the phone may ring.

**Combos:** ECHO (same type twice, ×2), HAT TRICK (3 cash in a row, +3 Tokens), NEIGHBORS (within 2° of a boundary, both wedges at 50%), DEAD AIR (Bankrupt with Tray > Debt — the Producer calls).

## Project layout

```
src/
  main.ts, app.ts          entry + app controller (FSM, flow, input routing, autosave)
  core/                    rng (sfc32 streams), fsm, events, save (versioned + migrations), config
  game/                    rules core — no DOM/Three: wheel physics, payout, combos, run, shop, hooks, balance, meta
  content/                 wedges (23), artifacts (50), scratch cards (12), bargains (36), mutators (8), host lines (95), lore (22), starting wheels
  assets/                  id-based loader with procedural fallbacks; generated runtime manifest
  render/                  PSX material, post chain, camera rig, VFX, stage, scene/* (studio, wheel, tray, vault, shelf, cabinet, host, phone, lever, props)
  audio/                   mixer (buses), procedural SFX, music, gibberish voice
  ui/                      input, HUD/chyrons, tooltips, DOM menus, bitmap font
sim/                       bot policies + simulator
tools/                     asset pipeline, screenshot driver
tests/                     Vitest suites
assets/manifest.json       licensing source of truth
```

See **DECISIONS.md** (interpretations and deviations), **BALANCE.md** (simulator results), **CREDITS.md** (generated), **ASSETS_TODO.md** (procedural stand-ins awaiting real files).
