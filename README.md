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
| `npm test` | 199 Vitest tests: rules, wheel physics, determinism, saves and migrations, content, text coverage, regressions, simulator smoke tests |
| `npm run sim -- --runs 5000 --seed 1` | Headless balance simulator (all bot policies, multi-threaded) |
| `npm run assets` | Convert `/assets-src` → `/public/assets` (PS1 conformance), slice the 2D art pack into sprites (`tools/art.ts`), regenerate the runtime indexes, CREDITS.md, ASSETS_TODO.md |
| `npm run assets -- --fetch` | Download any missing CC0/OFL sources first, then convert |
| `npm run playtest -- --minutes 6` | Automated playtest through the real UI in headless Chromium (keyboard, mouse, menus). Checks game invariants and on-screen text after every step. Flags: `--boost --jump8 --doom --reload --unlock`. Needs `npm run preview` running (port 4173, or `--url`) and Playwright with a Chromium build: `npm i --no-save playwright && npx playwright install chromium`. |
| `npm run desktop` | Build, then run the game in the desktop launcher (Electron) |
| `npm run desktop:dev` | Desktop launcher pointed at a running `npm run dev` (hot reload, DevTools) |
| `npm run dist:mac` / `dist:win` / `dist:linux` | Package the desktop app into `release/` (see **Desktop builds**) |
| `npx tsx tools/desktop-icon.ts` | Redraw the app icon (`desktop/icon.png`) |
| `node tools/itch-kit/build.mjs` | Compose the itch.io page art in `itch/` from the art pack (cover, banner, logos, headers, cast GIFs, the edge-haunt background); see `itch/README.md` |
| `node tools/itch-kit/capture.mjs` | Capture the itch.io screenshots and gameplay GIFs from the running preview build, on a frame-stepped clock |
| `npx tsx tools/vo.ts script \| pending \| split <batch> <file> \| cut <speaker> <old> <new> [spans] \| index` | Voice-over script, batch splitting, shortening a line to some of its sentences without re-recording, and the runtime clip index (see the file header) |
| `npx tsx tools/music-key.ts [--write]` | Estimate each music track's key and tuning and choose the shared key; `--write` stores the shifts the asset pipeline applies |
| `node tools/scenarios.mjs` | 12 scripted checks for paths random play rarely reaches (Prize Room, every setting, grabbing and flicking the wheel, quitting mid-spin, continue, abandon, Endless). Same setup as the playtest. |

Dev extras: `?gui` (lil-gui tuning panel, dev builds only), `?debug` (draw-call/triangle readout).

## Desktop builds

The desktop launcher (`desktop/`) wraps the production build in Electron for **macOS, Windows and Linux**. It serves `dist/` from a private `app://dead-air/` origin (so asset fetches and saves behave exactly as on the web), remembers window size/position/fullscreen, keeps the display awake while the window is focused (gamepad play), and adds **QUIT TO DESKTOP** on the title screen and a **FULLSCREEN / WINDOWED** toggle in Settings. **F11** or **Alt+Enter** toggles fullscreen (and **Ctrl+Cmd+F** on macOS). Without a usable GPU it falls back to software WebGL.

| Platform | `release/` output | Notes |
|---|---|---|
| macOS (universal: Apple Silicon + Intel) | `.dmg`, `.zip` | Ad-hoc signed, not notarized: the first launch of a browser download needs right-click → **Open** (or `xattr -cr "/Applications/DEAD AIR.app"`). For a Developer ID build, remove `identity: '-'` from `electron-builder.yml` and set the `MAC_CSC_LINK` / `MAC_CSC_KEY_PASSWORD` secrets. |
| Windows x64 | NSIS installer `.exe`, portable `.exe` | Unsigned: SmartScreen shows **More info → Run anyway** once. |
| Linux x64 | `.AppImage`, `.deb`, `.tar.gz` | `chmod +x` the AppImage. |

Build each platform on its own OS (`npm run dist:mac` on a Mac, etc.); CI does all three. Saves live in the per-user data folder: `~/Library/Application Support/DEAD AIR` (macOS), `%APPDATA%\DEAD AIR` (Windows), `~/.config/DEAD AIR` (Linux). Launcher flags: `--fullscreen`, `--windowed`, `--devtools`.

## Releases & itch.io

`.github/workflows/release.yml` runs on every `v*` tag (and on demand from the Actions tab):

For a manual build, open **Actions → Release → Run workflow** and enter a version such as `1.2.3` or `1.2.3-beta.1` in **Version**. A leading `v` is optional. Leave it blank to use the package version with the run number, such as `0.1.0-build.42`. Manual builds provide downloadable workflow artifacts; they do not create a GitHub Release. Tick **Push this build to itch.io** to upload them if itch.io is configured.

1. tests + web build, then the desktop app on macOS, Windows and Linux runners;
2. a **GitHub Release** with every installer and a web `.zip` (tags only);
3. a **butler** push to itch.io: channels `windows`, `mac`, `linux` (the unpacked apps, so the itch app installs and patches them) and `html5` (the browser version), each with the release version.

To turn on the itch.io push, add a repository **secret** `BUTLER_API_KEY` (from itch.io → Settings → API keys) and a repository **variable** `ITCH_GAME` set to `<itch-user>/<game-slug>`. Without them the push is skipped with a warning. On the itch.io edit page, tick **This file will be played in the browser** on the `html5` upload once. The page itself (cover, banner, background, logos, description, theme colours) is in `itch/`; see `itch/README.md`. Release:

```bash
git tag v0.1.0
```

```bash
git push origin v0.1.0
```

## How to play

You stay seated and look between four stations (**arrow keys / WASD**, mouse wheel, or the on-screen arrows):

- **CENTER — the wheel.** Hold **SPACE** (or hold the red lever) to charge, release to spin. Or **grab the wheel with the mouse**: drag it round (the pegs click past the glove), flick it clockwise and let go. The flick's speed is the power, read live on the lever's gauge, so the sweet spot can be hit by hand; a feeble or backwards flick springs back without spending the spin. The gauge needle sweeps; releasing in the **green band** biases the wheel toward high-value wedges. With the Glass Eye or a Peek card, press **E** while charging to see where it will land.
- **DOWN — Tray & Vault.** Winnings land in the glass **Tray** (at risk). Every spin you don't deposit grows your **Streak** (+0.25, cash only). **ENTER** / the red **DEPOSIT** button sweeps the Tray into the **Vault** (safe) and resets the Streak. **1–3** scratch a card.
- **Sponsor's Challenge.** Each Deadline opens with one goal (score a combo, ride the Streak to ×2, hold a big Tray, ride four spins without depositing, three sweet-spot releases, land a prize). It shows top left and pays 1–2 Tokens.
- **D — Double or Nothing.** Once per Deadline, with $300+ in the Tray: stake all of it on an even-odds flip. Win and it doubles (the Streak stands); lose and it's gone (the Streak resets).
- **LEFT — shelf & phone.** Up to 6 artifacts; they trigger left → right, so order matters. **1–6** select, click another slot (or **, .**) to move, **X** twice to sell. When the phone rings, **ENTER** answers.
- **RIGHT — Prize Cabinet & debt board.** Spend Tokens: **1–6** buy, **R**/crank reroll, **X** remove, **G** gild, **+/-** widen/narrow (then pick a wedge on the wheel with ←/→ + ENTER), **N** done.

**F** toggles fast mode, **ESC** pauses. Everything is also clickable.

A standard gamepad is supported: use the **D-pad / left stick** to look and navigate choices, **A / Cross** to confirm or deposit, **B / Circle** to go back or sell a selected artifact, and hold **X / Square** to charge the lever (release to spin). **Y / Triangle** offers Double or Nothing, **LB / L1** peeks while charging, **RB / R1** toggles fast mode, and **Start / Options** pauses. Move the scene cursor with the **right stick** and press **RT / R2** to click cards, artifacts, shop items, and services; click an artifact and then another slot to swap them. In menus, use the D-pad / left stick and A / Cross, and use left/right to adjust settings. Connect a controller and press a button if the browser has not detected it yet.

All four Stakes are available when starting a run. Choose a higher Stake for more Debt, extra Bankrupt wedges, and higher shop prices; the setup screen lists the exact changes.

**A run:** 8 Deadlines (Debt = round50(450 × 1.7^(d−1))), Sweeps at 4 and 8. Pick a Broadcast Package (Short 6 spins +4 Tokens / Standard 8 +2 / Marathon 11 +0 and a temporary Bankrupt). When spins run out the Tray auto-deposits and the Vault pays. Surplus can become Tokens ($50 each) or earn interest. Then the Prize Cabinet opens, and the phone may ring.

**Combos:** ECHO (same type twice, ×2), HAT TRICK (3 cash in a row, +3 Tokens), NEIGHBORS (within 2° of a boundary, both wedges at 50%), DEAD AIR (Bankrupt with Tray > Debt — the Producer calls).

## Art

The project owner's 2D art pack (`assets-src/art`, layouts in `docs/art-prompts.md`) is sliced by `tools/art.ts` into sprites under `public/assets/art`:

- **The host** is a rigged cut-out of the model sheet: TV head, tailcoat, bow tie, gloves and shoes as sprites, rubber-hose arms and legs, springy antennae. Six poses on springs that overshoot and settle, hops, squash and stretch, and gestures timed to his voice. The TV shows the 16 faces from the face sheet, swapped by expression and lip-synced (M/E/O/A mouths, idle line boil, blinks, glances, glitch frames on late Deadlines). Redrawn at 12 fps onto a billboard in the studio.
- **Menus** use the panel kit (paper panels, pill buttons, ribbons, plaques, checkboxes), with the title backdrop and lettered plate, and the win card behind a won run's summary. The loading screen is the "please stand by" card.
- **Game over:** the trapdoor scene under a flickering lamp (the whole stage dims with it), the host's glove waving from below, then GAME OVER drops in (Shrikhand, OFL) and the run's card rises. A click skips to the card.
- **Icons:** the Prop Room and prize picks show the drawn artifact icons, the landed wedge's icon pops up when the wheel stops, and the phone panel shows the Producer or the Other Line.
- **The wheel:** a printed-card face with paper grain, ink-and-gold dividers and an oxblood rim, each wedge's drawn icon, a cream inner ring with a scalloped gold edge, a grinning brass sun for a hub, and a cartoon glove for the pointer. Every label is fitted to its wedge: the native-size pixel font is only placed where the wedge is wider than a glyph, long values shorten (`1.5K`, `+2T`), and a wedge too narrow for text shows its icon (tests in `tests/wheelFit.test.ts`).
- **Studio textures:** wallpaper, curtain, floor, wood, brass, and raked audience seating.

## Juice

- **Slow-motion finishes:** a spin that will land on a Jackpot, a Bankrupt, a big win, or stop within 3° of a Jackpot or Bankrupt next door drops to a third speed for its last stretch. The camera pushes in onto the pointer with a dutch tilt, letterbox bars close in, the mix muffles under a heartbeat and a rising whoosh, then it cuts back to speed with an impact, a flash frame and a camera punch. Big wins and Jackpots then whip-pan to the host's reaction.
- **Wind-ups:** a lever spin rocks the wheel back against its brake while the camera draws breath, then releases with a whoosh; a hand spin goes straight from the flick.
- **On screen:** cartoon speed lines round the wheel while it's really going, and a glove cursor that opens over the wheel and closes when you grab it.
- **The twisted wheel:** ink bleeds down the dividers and stain rings creep in as the Deadlines pass, Bankrupt wedges grin faintly with an eye in the rim, and the hub sun's eyes follow your hand, roll while it spins, gloat after a Bankrupt and, late in the show, weep ink.
- **New CC0 sounds** (OpenGameArt): the flick and whip-pan swish, the slow-motion riser, the landing impact, the grab clunk, the spring-back boing and the sweet-spot ding (see CREDITS.md).

## Sound

- **Music:** the project's own score: *Channel 98* (title), *The Final Round* (the wheel), *Department Store Dreams* (Prize Cabinet), *Final Question* (deadline payment, and a short last spin), a spin-tension cue and a game-over cue. Every tonal track is pitched into A minor (its relative C major for the two cues; tempo unchanged, tuning corrected to A440) so crossfades between contexts stay in key, and tonal cues follow the tape speed. The tape slows and dulls a little every Deadline.
- **Voices:** every host, Producer, secret-caller and archive line (all 214, including every Prop Room note) is voiced with custom ElevenLabs voices (`eleven_v4` with audio tags) and placed through a per-speaker effect chain at runtime. The host's mouth on the CRT follows the voice.
- **Effects:** ElevenLabs-generated crowd, buzzer, bells, fanfare, phone, static, trapdoor and room tone, plus CC0 recordings for the small mechanical cues.

## Project layout

```
src/
  main.ts, app.ts          entry + app controller (FSM, flow, input routing, autosave)
  core/                    rng (sfc32 streams), fsm, events, save (versioned + migrations), config, desktop bridge
  game/                    rules core — no DOM/Three: wheel physics, payout, combos, run, shop, hooks, balance, meta
  content/                 wedges (23), artifacts (50), scratch cards (12), bargains (37), mutators (8), host lines (95), lore (22), starting wheels (4), stakes (4)
  assets/                  id-based loader with procedural fallbacks; generated runtime manifest
  render/                  PSX material, post chain, camera rig, VFX, stage, scene/* (studio, wheel, tray, vault, shelf, cabinet, host, phone, lever, props)
  audio/                   mixer (buses), SFX, music (context tracks with tape wear), voice-over player with per-speaker effect chains, gibberish fallback voice
  ui/                      input, HUD/chyrons, tooltips, DOM menus, bitmap font
desktop/                   desktop launcher: Electron main process, preload bridge, app icon
sim/                       bot policies + simulator
tools/                     asset pipeline (assets.ts, art.ts), browser harnesses (playtest.mjs, scenarios.mjs, shared Playwright loader browser.mjs), screenshot helper (shot.mjs)
itch/                      itch.io page kit: cover, banner, logos, GIFs, edge-haunt background, description, setup guide
electron-builder.yml       desktop packaging (macOS / Windows / Linux targets)
.github/workflows/         release.yml: build all platforms, GitHub Release, itch.io push
tests/                     Vitest suites (rng, wheel, payout, artifacts, run, shop/phone, saves, content, text, regressions, sim)
assets/manifest.json       licensing source of truth
```

See **DECISIONS.md** (interpretations and deviations), **BALANCE.md** (simulator results), **PLAYTEST.md** (playtest method, findings and fixes), **CREDITS.md** (generated), **ASSETS_TODO.md** (procedural stand-ins still awaiting CC0 recordings).
