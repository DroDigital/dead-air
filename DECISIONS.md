# DECISIONS

Choices made where the brief was silent or ambiguous, plus every deviation from it, with reasons.

## Stack & libraries

| Library | Used? | Why |
|---|---|---|
| three 0.187 | yes | Rendering, GLTFLoader. Measured at ~190 kB gz (full namespace, minified, esbuild); the app's tree-shaken share is less. It *is* the renderer. |
| gsap 3.15 | yes | Camera station moves (eased ~0.25 s). Small. |
| postprocessing (pmndrs) | **no** | The PSX chain is two full-screen passes (dither/quantise at internal res, then CRT upscale). A 60-line custom `PostFx` is smaller, and the composer's HDR/half-float defaults fight the 15-bit look. |
| howler | **no** | Needed real per-bus routing (music/sfx/voice/ambience), a master lowpass for muffles, and procedural buffers. Plain WebAudio gives all of that; howler's global-only volume would have meant wrapping it anyway. Real files (if present) are decoded by id into the same buffers. |
| tone | **no** | Music/voice/SFX synthesis is small enough in raw WebAudio. |
| three.quarks | **no** | VFX (floating text, confetti, sparks) are drawn pixel-exact into the internal-resolution overlay — better PS1 fidelity than billboards. |
| lil-gui | dev only | `?gui` in `npm run dev`. Behind `import.meta.env.DEV` + dynamic import → tree-shaken from production (verified: no lil-gui chunk in `dist`). |
| DRACOLoader / KTX2Loader | **no** | Imported models are decimated to a few hundred triangles and textures to 64–128 px PNG; Draco/KTX2 would add decoders larger than the assets. |
| gltf-transform, sharp, meshoptimizer | build-time | `npm run assets`. |
| vitest, tsx, typescript | dev | Tests, sim, typecheck. |

The only library over ~100 kB gz is three.js. GSAP measures ~28 kB gz. Built app: ~275 kB gz total (`npm run build`).

## Rules interpretations

- **Wedge widths.** All wedges have a *nominal* width (15°, Jackpot 6°). The layout normalises the sum to 360°, so widen/narrow/mutators/artifacts change relative odds. Width is clamped to [3°, 60°] nominal.
- **Streak timing.** The current Streak multiplies this spin's cash; *then* it grows by +0.25 (if no Bankrupt). The first spin after a deposit therefore pays ×1.0, as the brief states.
- **Streak and non-cash spins.** Every spin (including prizes and Duds) grows the Streak — "each consecutive spin without depositing".
- **Boost** "+×1 on the next spin" is added to the inner-ring multiplier (step 2), so a Boost on a ×0 ring still pays ×1. It is consumed by the next spin whatever it lands on.
- **Respin** = +1 spin (the spin it cost is given back).
- **Jackpot counts as Cash** (gets ring, streak, artifact cash modifiers).
- **NEIGHBORS** is evaluated in step 1 (both wedges contribute 50% of their base) and announced in step 5. Half-prizes: Tokens halve (rounded up), Tax halves, a neighbouring **Bankrupt loses half the Tray**, binary prizes (Respin, Artifact…) are awarded whole. Measured: with uniform releases the wheel stops within 2° of a boundary 26.4% of the time, matching the geometry (24 boundaries × 4° of 360° = 26.7%). The balance bot's sweet-spot releases push that to ~32%, because the sweet-spot bias favours high-value wedges and those sit next to their neighbours. The brief's 2° is kept; `neighborsThreshold` in `balance.ts` is the knob.
- **ECHO** compares the *landed* wedge type (Mystery twice = ECHO). Bankrupt/Dud/Splitter never ECHO. Cash ECHO multiplies cash; a repeatable prize ECHO awards the prize again. History resets each Deadline.
- **HAT TRICK** fires on every 3rd consecutive cash landing (3, 6, 9…); a Deposit resets the count along with the Streak.
- **DEAD AIR** requires an unblocked full Bankrupt with Tray > Debt; the Producer call happens right after the spin, then play resumes.
- **Doubler** doubles the next non-Bankrupt result (cash ×2 and every prize again, except Doubler/Ring Jump themselves).
- **Ring Jump** re-spins only the inner ring (real ring-only physics) and re-pays your previous wedge with the new multiplier (no combos, no streak growth). A nested Ring Jump fizzles.
- **Wild** copies the best *Cash* wedge (not the Jackpot — that would make Wild a 15° Jackpot).
- **Haunted** rolls from a weighted pool each spin (mostly good, 13% Bankrupt, 6% Tax, 4% Jackpot).
- **Mystery** flips Bankrupt 25% of the time, otherwise a weighted prize (cash $300, tokens, respin, boost, artifact, scratch card, rare Jackpot).
- **Cursed Cash**: installing it also converts a low wedge into a Tax.
- **Thief** converts 20% of the Tray into Tokens at the $50 rate (min 1).
- **Static** decides the 5th-spin Jackpot *before* the spin (visible, striped) rather than mid-spin, so physics and visuals agree.
- **Lock** is implemented physically: the game searches the wheel RNG stream for a jitter that lands on the target (≤ 400 deterministic trials) and replays that trace. Same seed + same inputs → same result.
- **Nudge** pauses resolution after the stop and offers −1 / stay / +1 (a nudge lands mid-wedge, so no NEIGHBORS).
- **Glass Eye / Peek** show a live landing preview while charging (press **E**); the preview is the exact deterministic result for the current meter value.
- **Sweet spot** bias is physical: in the green band, extra Coulomb drag is applied while the wheel is slow over high-value wedges (cash ≥ $150, Jackpot, Artifact, Wild).
- **Loaded Flapper** makes Bankrupt pegs *easier to slip past* and lets the wheel glide through Bankrupt wedges — the artifact's intent ("drag past them") is to avoid landing there.
- **Surplus conversion.** After paying, the player picks how many $50 → Token conversions to make; whatever stays earns 10% interest, capped at $30 + $20 × Deadline (tuned). Interest is paid once, when you settle, on the surplus you keep. It does not compound every Deadline; that keeps the Vault from growing without limit.
- **Phone timing.** Guaranteed after Deadlines 3 and 6, otherwise a per-Deadline chance; DEAD AIR always calls.
- **Secret dark line (designed).** Hang up on the Producer three times in one run → the next call is *The Other Line*: the previous contestant, whispering from under the floor, with four dark bargains (erase your next Debt for every artifact; the Trapdoor Lever + $666; cut the feed — every Bankrupt becomes a Dud and the Host goes silent; the truth — unlocks the final lore note).
- **Endless.** After Deadline 8 the summary offers "Keep broadcasting" (if unlocked); Debt keeps following the formula; a Sweep every 2nd Deadline.
- **Stakes.** Prime Time is the base; Late Night (+15% Debt), Graveyard Shift (+30% Debt, +1 Bankrupt) and Dead Air (as Graveyard, plus every Cabinet price +1) unlock with Ratings. The brief asks for three stakes; we ship three unlockable ones on top of the base game.
- **Token purse.** Severance Check caps Tokens at 6 wherever Tokens change (gains, purchases, bargains), not only on spin resolution.
- **Understudy.** The copy shares its source artifact's instance, so "once per Deadline" effects are shared. A copied Trapdoor Lever is consumed like the real one.
- **Bankrupt wedge width.** Both the Cabinet and the bargain "narrower" stop at the same 10° floor.

## Deviations (with reasons)

1. **Bankrupts are Network property** — the Cabinet's Remove service and wedge installs cannot target a Bankrupt (they can be narrowed, floor 10° nominal). *Reason:* in simulation the shop bot deleted both Bankrupts by Deadline 2, after which Let It Ride had no risk and runs became unloseable (EV-bot win rate 59%, trays of $40k+). The brief's core gamble needs a permanent risk; Bankrupts can still be removed by a Producer bargain or neutralised by Vault Keys, Insurance, Loaded Flapper and Hollow Tooth.
2. **Gild cap** — max 2 gilds per wedge, and each gild costs +2 Tokens more than the last (Remove: +2 each). *Reason:* same runaway economy (single wedges reached $5,000).
3. **Starting Vault $200, 2 starting Tokens.** *Reason:* the simulator showed Deadline 1 was a coin-flip for low-variance play (88% EV bot) — the brief requires ≥95%.
4. **Prize Cabinet artifact prices +3 Tokens** over listed rarity costs (tuned, see BALANCE.md).
5. **Choice moments are on-air graphics.** Package select, Nudge, artifact 1-of-3, surplus conversion and the Producer's offers are drawn as broadcast chyrons in the pixel font (the show is a TV broadcast, so its own graphics are diegetic). Everything else is in-world: tray, vault nixie, flip clock, placard, cabinet price tags, shelf, marquee, host captions.
6. **Dust motes** use `THREE.Points` with a tiny PointsMaterial rather than the PSX ShaderMaterial (1-px points have no texture/lighting to speak of). Everything else uses the single PSX material.
7. **Audio sources, in order of precedence.** Music is the project owner's own score (six Suno tracks by digitaldro: title, wheel, Prize Cabinet, deadline, spin tension, game-over cue). Voice-over, the remaining sound effects and the phone-call lounge track were generated with ElevenLabs for this project (custom-designed voices; prompts in `assets/elevenlabs.json`). Eight small cues are CC0 recordings from OpenGameArt's "RPG Sound Pack" by artisticdude. Anything missing falls back to the procedural synth, so the game still runs from a bare checkout.
8. **Voices are performed, then placed.** Each speaker has a custom ElevenLabs voice and every line is read with `eleven_v4` audio tags. The clips are clean; the room is added at runtime by a per-speaker WebAudio chain (CRT speaker for the host, phone line for the Producer, a crossed line for the secret caller, reel-to-reel for the archive). The host's chain wears with the Deadline and glitches when the show goes wrong, so one recording serves every point in a run.
9. **Double or Nothing is EV-neutral and outside the simulator.** Once per Deadline, with at least $300 in the Tray, the player may stake the whole Tray on an even-odds flip (events RNG stream, so replays stay deterministic). The expected value is exactly zero, so it changes variance, not the balance targets; the bots never take it, and BALANCE.md's numbers are unaffected. `tests/gamble.test.ts` checks the odds, the once-per-Deadline rule and save round-trips.
10. **Host animation** is procedural (stepped at 12 fps), not Mixamo — Mixamo requires an Adobe login and its licence forbids redistributing raw files.
11. **The Sponsor's Challenge pays for risk.** One goal per Deadline, drawn from the events stream and stored in `run.marks` (no save-format change). A first version that also rewarded a big single deposit let the always-deposit bot live past Deadline 5, so the deposit goal became NO NET (ride four spins) and easy goals pay 1 Token, risky ones 2. BALANCE.md has the before and after.
12. **One key for the whole score.** The title and wheel themes were in G minor, the Cabinet and deadline tracks in C minor, the phone lounge in A minor, and the cues in C major. `tools/music-key.ts` (chromagram + Krumhansl–Schmuckler profiles, peak-interpolated tuning) picked the key that needs the least weighted shifting: A minor, with every shift within ±3 semitones (+2 for the G-minor tracks, −3 for the C-minor ones). The pipeline applies it with rubberband at high quality, tempo unchanged, and also pulls each track onto A440 (up to 6¢). Re-analysing the outputs reads A minor / C major within ±1¢. The tension and game-over cues play at the music's tape speed so the per-Deadline slowdown keeps them in tune.

## Technical choices

- **Physics.** 240 Hz fixed frames; when the wheel is slow, frames are sub-stepped (deterministic function of state) and pegs interact with a spring-damped leather flapper via penalty contacts (with slip-under when the flapper bends past its limit); when fast, peg passes are discrete energy impulses that kick the flapper. Coulomb friction is velocity-dependent (low static friction) so the flapper can push the wheel back off a peg. The inner ring counter-rotates with its own drag, couples to the outer wheel as it slows, and has soft detents. ~0.35 ms per spin headless.
- **Renderer replays the trace** (60 Hz samples of wheel angle, ring angle, flapper deflection + peg-tick events) — the result shown is the result computed.
- **RNG streams.** wheel (physics + Ring Jump), shop (stock, new wedges), events (mutators, phone, Haunted, Static, Marathon), loot (Mystery, artifact picks, scratch cards).
- **Saves.** `deadair.run`, `deadair.meta`, `deadair.settings` envelopes `{v, savedAt, data}` with step-wise migrations; autosave after every rules action (each is a safe state; mid-Nudge spins are serialised as `pendingSpin`).
- **Draw calls.** Static geometry is merged per material (`Batcher`), props are vertex-coloured merges (`PropBuilder`), imported GLBs are flattened to one mesh per texture, panels share canvases. Measured: 26–36 calls per station including the two post passes; ~3–4.5k triangles.
- **In-world text** uses the game's own 5×7 bitmap font (`ui/bitfont.ts`); DOM menus use Silkscreen (OFL).

## The host as a 2D cut-out

- The art pack has a pose sheet (12 drawings, two per pose) and a model sheet with spare parts. The host is rigged from the model sheet's parts instead of flipping the pose drawings, so he can blend between any two poses, react to the voice every frame and keep one consistent face screen; the pose sheet served as the reference for the six poses.
- The sheet's TV screens are blank in the pose drawings and full screens in the face sheet; the face cell is clipped into the TV's screen shape and given scanlines and a rolling bar.
- The model sheet is opaque, so parts are cut out with a flood fill from the crop edges that stops at the ink outline, then feathered.
- He is a billboard facing the contestant's chair. He used to be a low-poly mannequin; the 3D model the owner mentioned can replace the billboard later without changing the `HostView` API.
- The wheel face is a 256 px texture with the pixel font at scale 2, so text is the same on-screen size as the HUD's (it can't shrink and stay legible at 320×180). That fixes what fits: on a standard 15° wedge a four-character value fills the outer half of the wedge, so numbers win over icons there; the icon joins the label on wider wedges and stands alone on non-number wedges. The face is mipmapped (unlike the rest of the PS1 textures) so the painted detail doesn't shimmer while it spins.
- The owner's painted wheel and ornamental frame were references; the frame was tried around the wheel and taken out again at the owner's request (it didn't sit right), so the wheel keeps its gold rim and 40 marquee bulbs.

## Grabbing the wheel, and the slow-motion finishes

- A hand spin uses the same physics and the same sweet-spot rule as the lever: the flick's angular speed over the last 0.12 s maps to power (140°/s is the least that spins, 1000°/s is full power), and the spin starts from wherever the player let go. Starting angle is a new input to `Game.spin` (`startAngle`); runs stay deterministic for the same inputs. Because the omega jitter still applies, letting go at a chosen angle doesn't let a player aim a wedge.
- A feeble or backwards flick springs back to where the wheel stopped, so the wheel can't be parked by hand between spins.
- Mouse only: the gamepad cursor and keyboard keep the lever.
- Which spins get the slow-motion finish is decided when the spin starts (the outcome is already known), so the close-up begins in time rather than reacting late. Fast mode skips it, and Reduced Flashing drops the flash frames and softens the shock.

## Desktop launcher

- **Electron, not Tauri.** Tauri renders with the OS web view, which is WebKitGTK on Linux and WebKit on macOS: uneven WebGL2, Gamepad API and WebAudio support across the three platforms. Electron ships one Chromium everywhere, the same engine the game is developed and playtested in. The cost is size (~100 MB installers).
- **`app://` origin instead of `file://`.** `fetch()` of audio and voice files does not work from `file://`, and a custom privileged scheme gives localStorage a stable origin for saves.
- **No `node_modules` in the package.** Vite already bundles three.js and GSAP into `dist/`, so the app ships only `dist/` and the launcher (an 18 MB asar).
- **SwiftShader fallback** (`--enable-unsafe-swiftshader`). Without it, Chromium refuses WebGL on machines with no usable GPU (VMs, blocklisted drivers) and the game would hang at boot. The window only ever loads the game's own local build.
- **itch.io gets the unpacked app**, not the installer, so the itch app can install, launch and patch it with butler's diffs.
- **The app icon is the host's TV head** from the art pack, clipped to a round window on the wheel's sunburst and set in an 824 px rounded tile (macOS keeps icon artwork inside that safe area). The head art is 290 px, so it is upscaled once. The window's rim covers the clip edge, which hides the bow tie and the strokes under the cabinet. `tools/desktop-icon.ts` regenerates `desktop/icon.png` from `public/assets/art/host/head.png`.

## Phone dialogue length

- Every caller line on a phone card is at most two sentences (a test enforces it). The lines were shortened by keeping two of their original sentences, so the existing voice takes were cut rather than re-recorded (`tools/vo.ts cut`). Sentence timings for the cuts came from a forced alignment of each take against its script (pocketsphinx), because the silence-based aligner misplaces boundaries around very short sentences ("Cash. Today.").

## Resolution and HUD text

- **The default internal resolution is 640×360.** The HUD reads cleanly at 1280×720, and the window stays a whole-number 2× on the common screen sizes. Saves from the old default (320×180, written on first launch) move to 640×360 once, through the settings v1 → v2 migration. Other settings are kept.
- **HUD text is drawn at its native 5×7 size at every resolution** (`TS` in `src/ui/hud.ts`). It used to scale with the layout, so at 640×360 it crowded the bottom bar and captions. Boxes and spacing still scale with the resolution; text widths, line steps and wrap widths use `TS`.
- **The HUD overlay texture is rebuilt when the resolution changes.** A three.js texture keeps the GPU size it was first made at, so at 640×360 every upload failed and the overlay disappeared.
