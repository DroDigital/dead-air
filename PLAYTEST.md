# PLAYTEST

What was played, what broke, what was fixed, and what still needs a human.

## Method

Three kinds of check were run against the built game (`npm run build`, served with `npm run preview`):

1. **Automated playthroughs** (`npm run playtest`, `tools/playtest.mjs`). A headless Chromium drives the real UI with keyboard, mouse and menus, in fast mode. After every step it checks:
   - Game invariants: Tray, Vault, Tokens, spins and Streak never go negative or non-numeric; exactly 24 wedges; the shelf holds at most 6 artifacts with no duplicates; at most 3 scratch cards; the wheel layout sums to 360° with no gaps.
   - Phase and state agreement: choice panels appear only in the phases that use them, and the state machine agrees with the game phase whenever nothing is animating.
   - Text: every caption, banner, toast and marquee is watched for `undefined`, `NaN`, `[object` and `null`.
   - Errors: page errors and console errors are collected, and any stall is flagged.
   - Saves: a reload mid-run followed by Continue must restore the same Tray, Vault, spins, Deadline, Streak, Debt and shelf.
   - Escape: pressed during play, it must open the pause menu and keep it open.
   The late-game options force states that random play rarely reaches: `--jump8` (Deadline 8, for victory and Endless), `--doom` (an unpayable Debt, for game over), `--reload`, `--unlock` (Ratings unlocked), `--boost` (more money, so the Cabinet and phone come up sooner).
2. **Scripted scenarios** (`node tools/scenarios.mjs`, 11 checks). These cover the paths random play barely reaches: Prize Room and Credits rendering, every settings option, 2× resolution, a tooltip compared with the wedge under the flapper, quitting during a spin, continuing a saved run, abandoning a run, fast-mode toggling, and winning Deadline 8 into Endless.
3. **Static text checks** (`tests/text.test.ts`). Every string the in-world font draws, from wedges, artifacts, bargains, scratch cards, mutators, host lines and combos, is checked for characters the font can't draw. Those would otherwise appear as question marks.

Plus screenshot review of each station and overlay, at 320×180 and 1280×720, and the simulator (`npm run sim`).

**Limits.** Automated play doesn't judge feel or pacing, and it can't hear the audio. Frame rate here is software-rendered and not representative of a laptop GPU. A human playtest is still needed before calling the tuning final.

## Automated passes

| Pass | Length | Options | Steps | Games | Spins | Shop actions | Game overs | Victories | Reloads | Escapes | Issues |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4 min | base | 201 | 1 | 46 | 29 | not counted* | not counted* | 0 | — | 0 |
| 2 | 7 min | boost, jump8, doom, reload, unlock | 292 | 4 | 86 | 56 | not counted* | not counted* | 2 | — | 0 |
| 3 | 7 min | as pass 2 | crashed in the harness (see below) | | | | | | | | 2 harness findings |
| 4 | 7 min | as pass 2 | 297 | 3 | 84 | 100 | 1 | 2 | 0 | — | 0 |
| 5 | 7 min | as pass 2 | 310 | 5 | 87 | 61 | 4 | 0 | 5 | 5 | 0 |

\* Passes 1 and 2 counted endings from a game phase the snapshot could not see, so those columns undercount. Passes 4 and 5 count them from the summary screen.

Pass 3 stopped in the harness. Its reload checked the page before the stage existed, and that crashed the run. Its two findings were both harness artifacts: an injected Debt was read as a game bug, and a random walk missed a confirm for 40 presses. Both are fixed in the harness.

Across passes 4 and 5 the forced paths were exercised: two victories, five game overs, five reloads with state preserved, five Escape presses, and four jumps to Deadline 8 (one in pass 4, three in pass 5).

## Scripted scenarios (final run, after all fixes)

Eleven checks passed with zero page errors:

- Prize Room renders; Credits lists the audio sources.
- Settings persist: resolution, CRT, colourblind, reduced flashing, warp.
- A run starts at 2× internal resolution.
- The tooltip on the wheel names the wedge under the flapper.
- Quitting during a spin waits for the spin, then returns to the title.
- Continue restores the saved run.
- Abandoning a run shows the end-of-run summary and Ratings.
- F toggles fast mode.
- Paying Deadline 8 shows the victory summary with Endless on offer.
- Endless starts Deadline 9 with Endless flagged.

## Bugs found and fixed

| # | Found by | What the player saw | Fix | Test |
|---|---|---|---|---|
| 1 | Scenario check (quit) | **Escape did nothing in play.** The pause menu opened and closed on the same keypress, because two listeners both handled it. | One Escape path, in the input handler. | Scenario 5; playtest Escape check |
| 2 | Screenshot review | The payout line stayed on screen after the spin, over the Cabinet and the Vault. | Clears 5 s after the last update. | Visual |
| 3 | Screenshot review | Captions printed through the choice panels, and the panels were too transparent to read. | Captions wait while a panel is open; panels are 94% opaque. | Visual |
| 4 | Screenshot review | Phone-offer cards ran past the card and into the ticker. | Card detail is cut to the room the card has, with an ellipsis. | Visual |
| 5 | Screenshot review | Card numbers sat on the first label line; the fast-mode tag drew over the panel text. | Labels start lower; the tag is hidden while a panel is open. | Visual |
| 6 | Screenshot review (known issue) | **Wheel labels were unreadable at 320×180** and barely legible at 1280×720. | The wheel face is a 128 px PS1-resolution texture. Labels use the native 5×7 font, are flipped on the left so they read upright, and are skipped on wedges under 12° (the tooltip names them). The Bankrupt label is now `BANK`. | Visual at both resolutions |
| 7 | Text test | The Nudge scratch card used `±`, which the in-world font can't draw. It showed as `?`. | Reworded. | `tests/text.test.ts` |
| 8 | Screenshot review | The DEPOSIT label was too small to read. | Larger label. | Visual |
| 9 | Code review, scenario 5 | Quit or abandon during a spin or payout could change state underneath it. | Waits until the presentation finishes; cancelled if the player resumes. | Scenario 5 |
| 10 | Code review | A timer after game over reset the lights and Vault display 600 ms later, which could land on a new run. | The reset happens when a run starts, not on a timer. | Visual |
| 11 | Code review | Background music never started if audio was unlocked after the run began. | Starts as soon as audio unlocks. | Manual check of the code path |
| 12 | Code review against the card | **Mannequin Hand** taxed only manual deposits, but its card says every deposit. Automatic deposits were untaxed. | Every deposit loses 15%; only manual deposits keep the Streak. | `regressions.test.ts` |
| 13 | Code review and simulator | **Severance Check's** 6-Token cap applied only once per spin. Tokens could sit above 6 between spins. | Enforced on every change to Tokens. | `regressions.test.ts` |
| 14 | Code review | **Polish** could gild a wedge past the two-gild cap. | Respects the cap; the card is unusable once every cash wedge is at the cap. | `regressions.test.ts` |
| 15 | Code review | **The Understudy** kept its own copy of each artifact's state, so "once per Deadline" effects weren't shared. A copied **Trapdoor Lever** was never used up. | The copy shares its source's instance. | `regressions.test.ts` |
| 16 | Code review | The bargain "Bankrupts 5° narrower" could drop a Bankrupt below the 10° floor used by the Cabinet. | Same floor. | `regressions.test.ts` |
| 17 | Code review | Dead code: an unreachable Bankrupt-removal price branch. | Removed. | Typecheck |
| 18 | Script check | `npm run credits` pointed at a file that doesn't exist. | Script removed; CREDITS.md is generated by `npm run assets`. | `npm run` check |
| 19 | Screenshot review | Repeated notes, such as ECHO on a Token or several Boosts from one spin, stacked as identical lines. | One line with a count, e.g. `BOOST +×1 ×3`. | Visual |
| 20 | Screenshot review | The phone on the left station was lost against the dark table. | Oxblood body. | Visual |
| 21 | Documented known issue | Only 16-bit PCM could be converted, which blocked the RPG Sound Pack's 24-bit files. | Converter reads 8/16/24/32-bit PCM and float. Eight cues now use real CC0 recordings. | `npm run assets` output |
| 22 | Documentation check | README said 150+ tests (there are 159) and 36 bargains (there are 37). DECISIONS gave three.js as ~170 kB gzip (measured ~190 kB). Audio status was out of date. | Corrected from measurements and counts. | — |

### Harness-only fixes (not game bugs)

These were in `tools/playtest.mjs` and fixed while the playtest was being built: an injected Debt was read as a game bug; a reload was checked before the stage existed; endings were counted from a phase that's already cleared; station labels were taken before the action; a confirm could be missed in the random walk; the Endless and reload probabilities were too low to reliably exercise those paths; and the harness didn't accept the abandon confirmation dialog.

## Checked and explained (not defects)

- **NEIGHBORS fires on about 32% of spins.** With uniform releases it's 26.4%, which matches the geometry: 24 boundaries × 4° of 360° = 26.7%. The extra ~5% in bot play comes from sweet-spot releases, which bias stops toward high-value wedges. The brief's 2° is kept.
- **Where the wheel stops inside a wedge is not uniform.** It is more often in the middle of a wedge, where the flapper rests between two pegs. Landing probability per wedge is still proportional to its width (`tests/wheel.test.ts`).
- **lil-gui isn't in the production bundle.** Grep of `dist/` finds no tuning-panel strings.
- **Bundle sizes**, measured with esbuild: three.js ~190 kB gzip with its full namespace, GSAP ~28 kB. The built app is ~276 kB gzip.

## Balance observations

The post-fix simulation still meets every target (see BALANCE.md). Two artifacts are now weak picks: **Severance Check** (9.6% win when held, after its cap began applying everywhere) and **Lucky Sock** (8.6%). Severance is the first candidate for tuning if a human playtest agrees.

## Not fixed, and why

- **Frame rate on real hardware** hasn't been measured. Here, software rendering averaged 26–30 fps across passes 1, 2, 4 and 5, which says nothing about a laptop GPU.
- **Host animation** is procedural, not Mixamo. Mixamo needs an Adobe login.
- **Four cues are still synthesised:** the bankrupt crash, the crowd groan, the jackpot bells and the music loop. No matching CC0 recording was found yet. ASSETS_TODO.md links an OpenGameArt search for each.
- **Choice prompts are on-air graphics**, not in-world objects. This is a deliberate design deviation, recorded in DECISIONS.md.
- **Feel and tuning need a human.** Automated play can't judge pacing, readability on a real screen, or the audio mix.

## Reproducing

```bash
npm run build
npm run preview
```

```bash
npm run playtest -- --minutes 7 --boost --jump8 --doom --reload --unlock
```

```bash
node tools/scenarios.mjs
```

Playwright with a Chromium build is required for both scripts; the README gives the install commands. The loader is `tools/browser.mjs`, and it prints the install command if Playwright is missing.
