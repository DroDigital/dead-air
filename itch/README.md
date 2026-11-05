# DEAD AIR — itch.io page kit

Everything for the itch.io page, made from the game's own art pack (`assets-src/art`) and
captured from the game itself. The art is composed by `tools/itch-kit/build.mjs`, and the
screenshots and gameplay GIFs come from `tools/itch-kit/capture.mjs`. Both are deterministic,
so a rebuild reproduces the same files.

Preview it all together: run `python3 -m http.server 8000` in the repo root, then open
<http://localhost:8000/itch/preview.html>.

## Files

| File | Size | Where it goes on itch.io |
|---|---|---|
| `cover/cover.png` | 630×500 | **Edit game → Cover image** |
| `cover/cover-1260x1000.png` | 1260×1000 | Same, at double resolution |
| `cover/cover-animated.gif` | 630×500, 24 frames | Cover image, animated: the host cheering on twos, coins tumbling, film flicker |
| `banner/banner.png` | 960×360, transparent | **Edit theme → Banner** |
| `banner/banner-animated.gif` | 960×360 | Banner, animated: the host presenting and talking, the Producer on the line |
| `background/edge-haunt.gif` | 1920×1024, 16 frames | **Edit theme → Background image**: repeat vertically, top center |
| `background/edge-haunt.png` | 1920×1024 | Background, still alternative |
| `screenshots/*.png` | 1920×1080 | **Edit game → Screenshots**, in order |
| `gifs/spin.gif` | 600 wide | Description: a lever spin with its slow-motion finish and payout |
| `gifs/flick.gif` | 600 wide | Description: grabbing the wheel with the mouse and flicking it, landing a prize |
| `gifs/phone.gif` | 600 wide | Description: the phone rings, the Producer's deals |
| `gifs/game-over.gif` | 720 wide | Description: the trapdoor |
| `video/*.mp4` | 960×540 | The same four clips at full quality, for devlogs, socials and the trailer field |
| `gifs/host.gif`, `producer.gif`, `other-line.gif` | 360×440, transparent | Description and devlogs: the cast, animated |
| `gifs/divider.gif` | 960×64, transparent | Chasing-bulb divider |
| `headers/header-*.gif` / `.png` | 720×190, transparent | Section headers on the red ribbon (animated with line boil, or still) |
| `logo/logo*.png` | 1536 / 960 / 480 wide, transparent | Devlogs, press kit, socials |
| `logo/logo-tagline.png` | 1200×700, transparent | Logo with the tagline ribbon |
| `page/description.txt` | — | **Edit game → Description**, plain text to paste; `[GIF: …]` marks each image |
| `page/description.html` | — | The same description as HTML, for the editor's source view |
| `page/custom.css` | — | **Edit theme → Custom CSS** (optional; itch enables it per account on request) |

Transparent GIFs have soft edges flattened onto the page colour `#140a06`, because GIF has no
partial transparency. They're made to sit on the dark theme below.

## Page setup checklist

**Edit game**

- **Title:** DEAD AIR
- **Short description or tagline:** A prize-wheel gambling roguelite in a rotting TV studio.
- **Classification:** Games. **Kind of project:** HTML (the browser build plays on the page; the desktop builds are downloads).
- **Release status:** In development (switch it on release).
- **Uploads:** pushed by the release workflow (below). On the `html5` upload, tick **This file will be played in the browser**.
- **Embed options:** viewport **1280 × 720**, tick **Fullscreen button**, leave **Mobile friendly** off, leave **Automatically start on page load** off (the first click also unlocks audio).
- **Description:** paste `page/description.txt` and insert each image where its `[GIF: …]` line is, or paste `page/description.html` into the source view and swap the `src` paths for the uploaded images.
- **Genre:** Strategy. **Tags:** `roguelite`, `gambling`, `game-show`, `rubber-hose`, `cartoon`, `horror`, `dark-humor`, `retro`, `singleplayer`, `luck`.
- **AI generation disclosure:** the voices and the 2D art pack are AI-generated; answer itch's disclosure questions accordingly.
- **Cover image:** `cover/cover.png`, or the animated GIF.
- **Screenshots:** the seven in `screenshots/`, in order.

**Edit theme**

| Setting | Value |
|---|---|
| Background color | `#140a06` |
| Background image | `background/edge-haunt.gif`, **repeat vertically**, **top center** |
| Banner | `banner/banner-animated.gif` (or `banner.png`), centered |
| Secondary background (content column) | `#1e120a` |
| Text color | `#f6ead0` |
| Link color | `#e0a830` |
| Button color | `#b3291a` |
| Button text color | `#f6ead0` |
| Border color | `#e0a830` |
| Fonts | a bold display serif for headers, a readable sans or serif for body text |
| Layout | center the content column; hide the title (the banner carries the logo) |

The background's middle 960 px stays plain under the content column. Its edges are red curtains in the dark, with the host's ghost screens surfacing between the folds and a flickering lamp glow. It tiles seamlessly top to bottom and loops.

## Pushing builds

`.github/workflows/release.yml` pushes every tagged release to itch.io with butler:

| Channel | Contents |
|---|---|
| `windows` | unpacked Windows x64 app |
| `mac` | unpacked macOS universal app (Apple Silicon + Intel) |
| `linux` | unpacked Linux x64 app |
| `html5` | the browser build (`dist/`) |

Set it up once in the GitHub repository, under **Settings → Secrets and variables → Actions**:

- secret **`BUTLER_API_KEY`**: an API key from itch.io → **Settings → API keys**
- variable **`ITCH_GAME`**: `<itch-username>/<game-slug>`

Then tag a release (`git tag v0.1.0`, `git push origin v0.1.0`), or run **Release** from the Actions tab with **Push this build to itch.io** ticked.

## Regenerating

```bash
node tools/itch-kit/build.mjs
```

```bash
npm run build && npm run preview
```

```bash
node tools/itch-kit/capture.mjs
```

`build.mjs` makes the art. Pass asset ids to rebuild only some, e.g. `cover-animated edge-haunt`. `capture.mjs` takes the screenshots and gameplay GIFs from the running preview build. Pass names to retake only some, e.g. `spin phone`. Both need Playwright with Chromium (see `tools/browser.mjs`), ffmpeg and ImageMagick.
