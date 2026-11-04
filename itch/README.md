# DEAD AIR — itch.io page kit

Everything needed to set up the itch.io page, plus the release pipeline that fills it.
All art is generated pixel art (`tools/itch-kit/`), not captured from the game, so it stays
valid while the game's look changes. **Screenshots and gameplay GIFs are left out for now.**
Add them once the new style lands; the description marks the spot.

Preview everything together: run `python3 -m http.server 8000` in the repo root and open
<http://localhost:8000/itch/preview.html>.

## Files

| File | Size | Where it goes on itch.io |
|---|---|---|
| `cover/cover.png` | 630×500 | **Edit game → Cover image** (itch's recommended size) |
| `cover/cover-animated.gif` | 630×500, 60 frames | Cover image, animated alternative (where itch animates covers) |
| `banner/banner.png` | 960×252, transparent | **Edit theme → Banner** (still) |
| `banner/banner-animated.gif` | 960×252, transparent | Banner, animated alternative |
| `background/edge-haunt.gif` | 1920×720, loops, tiles vertically | **Edit theme → Background image**: repeat vertically, top center |
| `background/edge-haunt.png` | 1920×720 | Background, still alternative |
| `logo/logo.png`, `logo-large.png` | 680×104, 1360×208, transparent | Devlogs, press kit, social posts, the game's own title card |
| `logo/logo-tagline.png` | 828×164, transparent | Same, with the tagline |
| `logo/logo-flicker.gif` | 680×104, transparent | Sign-off at the bottom of the description |
| `gifs/header-*.gif` | 900×78, transparent | Section headers in the description (THE SHOW, HOW TO PLAY, FEATURES, CONTROLS, DOWNLOAD, CREDITS) |
| `gifs/divider.gif` | 960×24, transparent | Chasing-bulb divider between sections |
| `gifs/host-talk.gif` | 208×208, transparent | The host, talking (top of the description) |
| `gifs/wheel-spin.gif` | 360×372, transparent | The wheel: rest, spin, settle (THE SHOW) |
| `gifs/phone-ring.gif` | 192×160, transparent | The Producer's phone (HOW TO PLAY) |
| `gifs/phone-ring-other-line.gif` | 192×160, transparent | The Other Line's phone (spare, for a devlog) |
| `page/description.html` | — | **Edit game → Description** |
| `page/custom.css` | — | **Edit theme → Custom CSS** (optional; itch enables it per account on request) |

Every GIF is under 1.1 MB, and every transparent image uses 1-bit alpha, so the GIF edges stay crisp.

## Page setup checklist

**Edit game**

- **Title:** DEAD AIR
- **Short description or tagline:** A prize-wheel gambling roguelite in a rotting TV studio.
- **Classification:** Games · **Kind of project:** HTML (the browser build is playable on the page; the desktop builds are downloads)
- **Release status:** In development (switch it on release)
- **Pricing:** your call. "No payments" or "Donate" suits an in-development build.
- **Uploads:** pushed by the release workflow (below). On the `html5` upload tick **This file will be played in the browser**; the others are detected as Windows / macOS / Linux from their channel names.
- **Embed options:** viewport **1280 × 720**, tick **Fullscreen button**. Leave **Mobile friendly** off. Leave **Automatically start on page load** off, so the first click also unlocks audio.
- **Description:** paste `page/description.html` into the editor's HTML/source view. Then upload the GIFs it references and swap each `src` for the uploaded image, or insert each one with the editor's image button at the same spot. Keep the images at their listed sizes; the column is 960 px wide.
- **Genre:** Strategy
- **Tags** (up to 10): `roguelite`, `gambling`, `game-show`, `psx`, `retro`, `horror`, `dark-humor`, `low-poly`, `singleplayer`, `luck`
- **AI generation disclosure:** the voices are AI-generated (custom ElevenLabs voices); answer itch's disclosure question accordingly.
- **Content:** simulated gambling with in-game money only; the description says so.
- **Cover image:** `cover/cover.png` (or the animated GIF).
- **Screenshots:** skipped for now. Add 3–5 once the new look lands.

**Edit theme**

| Setting | Value |
|---|---|
| Background color | `#0a0503` |
| Background image | `background/edge-haunt.gif`, **repeat vertically**, **top center** |
| Banner | `banner/banner-animated.gif` (or `banner.png`), centered |
| Secondary background (content column) | `#140b06` |
| Text color | `#f0e0c0` |
| Link color | `#ffd040` |
| Button color | `#ff4a2a` |
| Button text color | `#140b06` |
| Border color | `#c89830` |
| Fonts | a pixel or monospace font from itch's list for headers, and a readable monospace for body text |
| Layout | center the content column; hide the title (the banner carries the logo) |

The edge haunt keeps its middle 960 px plain studio-dark, under the content column. The edges carry the haunting: ghost hosts that surface out of the static and sink back, a rolling hum bar, ON AIR signs on a failing circuit, and bulb rails chasing down either side of the column. It tiles seamlessly top to bottom and loops seamlessly in time.

## Pushing builds

`.github/workflows/release.yml` pushes every tagged release to itch.io with butler:

| Channel | Contents |
|---|---|
| `windows` | unpacked Windows x64 app |
| `mac` | unpacked macOS universal app (Apple Silicon + Intel) |
| `linux` | unpacked Linux x64 app |
| `html5` | the browser build (`dist/`) |

Set up once, in the GitHub repository → **Settings → Secrets and variables → Actions**:

- secret **`BUTLER_API_KEY`**: an API key from itch.io → **Settings → API keys**
- variable **`ITCH_GAME`**: `<itch-username>/<game-slug>`, matching the page URL `https://<itch-username>.itch.io/<game-slug>`

Then tag a release (`git tag v0.1.0`, `git push origin v0.1.0`). You can also run **Release** from the Actions tab with **Push this build to itch.io** ticked.

## Regenerating the art

```bash
node tools/itch-kit/build.mjs
```

This needs Playwright with Chromium (see `tools/browser.mjs`) and ImageMagick. Pass asset ids to rebuild only those (e.g. `cover-animated edge-haunt`). The drawing code lives in `tools/itch-kit/art.js`. It uses the game's palette and fonts (Silkscreen, VT323, both OFL), and every frame is deterministic, so a rebuild reproduces the same files.
