/*
 * DEAD AIR — itch.io page art, composed from the owner's art pack (see prep.mjs for the pieces).
 * Every asset is drawn frame by frame and deterministically, so GIFs loop exactly and a rebuild
 * reproduces the same files. Animation is "on twos" in the rubber-hose manner: drawings are
 * held for two frames, outlines boil between three slightly different redraws, and the host
 * swaps between the A and B drawings of his poses.
 */
(() => {
  'use strict';
  const SRC = new URLSearchParams(location.search).get('src');
  const INK = '#2a1206',
    CREAM = '#f6ead0',
    RED = '#b3291a',
    GOLD = '#e0a830';

  // ----------------------------------------------------------------------------- loading --
  const NAMES = [
    'logo', 'ribbonBig', 'ribbonSmall', 'plate', 'bulbOn', 'bulbOff', 'bulbRedOn', 'coin', 'handPoint', 'producer', 'otherLine', 'cardCream', 'bubble',
    'screen-title-bg', 'screen-win', 'screen-lose', 'screen-standby', 'texture-curtain', 'texture-wallpaper', 'host-faces',
    ...['idle', 'present', 'cheer', 'point', 'shrug', 'slump'].flatMap((p) => [`host-${p}A`, `host-${p}B`]),
  ];
  const IMG = {};
  async function load() {
    await Promise.all(
      NAMES.map(
        (n) =>
          new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res((IMG[n] = i));
            i.onerror = () => rej(new Error(`missing ${n}`));
            i.src = `${SRC}/${n}.png`;
          }),
      ),
    );
    await document.fonts.load('64px Shrikhand');
  }

  // --------------------------------------------------------------------------- helpers --
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.round(w);
    c.height = Math.round(h);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    return [c, g];
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Draw an image scaled to height h with its bottom-centre at (x, y). */
  function placeBottom(g, im, x, y, h, flip = false) {
    const w = (im.width / im.height) * h;
    g.save();
    if (flip) {
      g.translate(x, 0);
      g.scale(-1, 1);
      g.drawImage(im, -w / 2, y - h, w, h);
    } else g.drawImage(im, x - w / 2, y - h, w, h);
    g.restore();
    return w;
  }
  function placeCenter(g, im, x, y, w, rot = 0) {
    const h = (im.height / im.width) * w;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.drawImage(im, -w / 2, -h / 2, w, h);
    g.restore();
    return h;
  }
  /** Cover-fit an image into a w×h box (crop the overflow), optional focal point. */
  function cover(g, im, w, h, fx = 0.5, fy = 0.5) {
    const s = Math.max(w / im.width, h / im.height);
    const dw = im.width * s,
      dh = im.height * s;
    g.drawImage(im, (w - dw) * fx, (h - dh) * fy, dw, dh);
  }

  /**
   * Line boil: redraw a finished layer with each horizontal band nudged by a fraction of a
   * pixel, three variants, so held drawings shimmer like re-inked cels.
   */
  function boil(src, variant, amp = 1.1) {
    if (variant === 0) return src;
    const [c, g] = canvas(src.width, src.height);
    const band = 6;
    for (let y = 0; y < src.height; y += band) {
      const dx = Math.sin(y * 0.045 + variant * 2.1) * amp + Math.sin(y * 0.11 + variant * 4.3) * amp * 0.5;
      g.drawImage(src, 0, y, src.width, band, dx, y, src.width, band);
    }
    return c;
  }

  const grainCache = new Map();
  /** Film grain: a few fixed noise plates, cycled on twos. */
  function grain(g, w, h, plate, alpha = 0.09) {
    const key = `${w}x${h}:${plate}`;
    if (!grainCache.has(key)) {
      const [c, gg] = canvas(w, h);
      const img = gg.createImageData(w, h);
      const r = rng(1234 + plate * 77);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = r() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      gg.putImageData(img, 0, 0);
      // A few film scratches.
      gg.strokeStyle = 'rgba(255,255,255,0.8)';
      for (let k = 0; k < 2; k++) {
        const x = r() * w;
        gg.lineWidth = 1 + r();
        gg.beginPath();
        gg.moveTo(x, 0);
        gg.lineTo(x + (r() - 0.5) * 12, h);
        gg.stroke();
      }
      grainCache.set(key, c);
    }
    g.save();
    g.globalAlpha = alpha;
    g.globalCompositeOperation = 'overlay';
    g.drawImage(grainCache.get(key), 0, 0);
    g.restore();
  }
  function vignette(g, w, h, strength = 0.55) {
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    v.addColorStop(0, 'rgba(20,8,2,0)');
    v.addColorStop(1, `rgba(20,8,2,${strength})`);
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }

  /** Shrikhand lettering in the title-card manner: cream fill, ink outline, hard shadow. */
  function letter(text, size, o = {}) {
    const [m, mg] = canvas(8, 8);
    mg.font = `${size}px Shrikhand`;
    const tw = mg.measureText(text).width;
    const pad = size * 0.4;
    const [c, g] = canvas(tw + pad * 2, size * 1.7 + pad);
    g.font = `${size}px Shrikhand`;
    g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    const x = pad,
      y = size * 1.12 + pad * 0.4;
    const sh = o.shadow ?? size * 0.07;
    g.fillStyle = o.shadowColor ?? INK;
    g.strokeStyle = o.shadowColor ?? INK;
    g.lineWidth = size * (o.stroke ?? 0.16);
    g.strokeText(text, x + sh, y + sh);
    g.fillText(text, x + sh, y + sh);
    g.strokeStyle = o.outline ?? INK;
    g.strokeText(text, x, y);
    g.fillStyle = o.fill ?? CREAM;
    g.fillText(text, x, y);
    if (o.highlight !== false) {
      g.save();
      g.beginPath();
      g.rect(0, 0, c.width, y - size * 0.42);
      g.clip();
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillText(text, x, y);
      g.restore();
    }
    return c;
  }

  // ----------------------------------------------------------------------- host + faces --
  const FACE = { smileA: 0, smileB: 1, grin: 2, wink: 3, shock: 4, sad: 5, dead: 6, side: 7, blink: 8, talkM: 9, talkE: 10, talkA: 11, talkO: 12, static: 13, melt: 14, angry: 15 };
  const hostCache = new Map();
  /** A host pose with a face drawn onto its blank mint screen. */
  function host(pose, face) {
    const key = `${pose}|${face}`;
    if (hostCache.has(key)) return hostCache.get(key);
    const im = IMG[`host-${pose}`];
    const [c, g] = canvas(im.width, im.height);
    g.drawImage(im, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    // The screen: the large mint region (#9fe8c0-ish).
    const [mc, mg] = canvas(c.width, c.height);
    const mask = mg.createImageData(c.width, c.height);
    let x0 = c.width,
      y0 = c.height,
      x1 = 0,
      y1 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i],
        gg = d[i + 1],
        b = d[i + 2],
        a = d[i + 3];
      const mint = a > 200 && gg > 170 && gg > r + 25 && b > 120 && gg > b - 10;
      if (mint) {
        const p = i / 4,
          x = p % c.width,
          y = (p / c.width) | 0;
        mask.data[i + 3] = 255;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    mg.putImageData(mask, 0, 0);
    if (x1 > x0) {
      const fi = FACE[face] ?? 0;
      const fs = IMG['host-faces'].width / 4;
      const [fc, fg] = canvas(c.width, c.height);
      // The face cell includes its own glass edge; draw a little larger so the screen is full.
      const bw = x1 - x0 + 1,
        bh = y1 - y0 + 1;
      const inset = 0.13;
      fg.drawImage(IMG['host-faces'], (fi % 4) * fs + fs * inset, Math.floor(fi / 4) * fs + fs * inset, fs * (1 - 2 * inset), fs * (1 - 2 * inset), x0, y0, bw, bh);
      fg.globalCompositeOperation = 'destination-in';
      fg.drawImage(mc, 0, 0);
      g.drawImage(fc, 0, 0);
    }
    hostCache.set(key, c);
    return c;
  }

  // ---------------------------------------------------------------------------- assets --
  const A = {};

  // Logo, trimmed, transparent, at a couple of sizes.
  A['logo'] = { w: 1536, h: 633, frames: 1, transparent: true, draw: (g) => g.drawImage(IMG.logo, 0, 0) };
  A['logo-960'] = { w: 960, h: 396, frames: 1, transparent: true, draw: (g, f, n, w, h) => g.drawImage(IMG.logo, 0, 0, w, h) };
  A['logo-480'] = { w: 480, h: 198, frames: 1, transparent: true, draw: (g, f, n, w, h) => g.drawImage(IMG.logo, 0, 0, w, h) };

  function tagRibbon(width) {
    const rib = IMG.ribbonBig;
    const rh = (rib.height / rib.width) * width;
    const [c, g] = canvas(width, rh);
    g.drawImage(rib, 0, 0, width, rh);
    const t = letter('A Prize-Wheel Gambling Roguelite', rh * 0.26, { shadow: rh * 0.02, stroke: 0.14 });
    const tw = width * 0.66;
    const th = (t.height / t.width) * tw;
    g.drawImage(t, (width - tw) / 2, rh * 0.44 - th / 2, tw, th);
    return c;
  }

  A['logo-tagline'] = {
    w: 1200,
    h: 700,
    frames: 1,
    transparent: true,
    draw(g, f, n, w) {
      const lw = w * 0.96,
        lh = (IMG.logo.height / IMG.logo.width) * lw;
      g.drawImage(IMG.logo, (w - lw) / 2, 0, lw, lh);
      const r = tagRibbon(w * 0.78);
      g.drawImage(r, (w - r.width) / 2, lh - r.height * 0.18);
    },
  };

  // Cover: the title stage, the logo, the host cheering, coins in the air.
  function drawCover(g, f, n, w, h) {
    const s = w / 630;
    cover(g, IMG['screen-title-bg'], w, h, 0.5, 0.55);
    // A slow projector flicker on the whole frame.
    const r = rng(500 + (f >> 1));
    // Coins tumbling: squash in two steps, on twos.
    const coins = [
      [0.13, 0.62, 0.08, -0.4],
      [0.86, 0.58, 0.075, 0.5],
      [0.79, 0.78, 0.06, 0.2],
      [0.2, 0.84, 0.065, -0.15],
      [0.92, 0.36, 0.05, 0.9],
      [0.07, 0.38, 0.05, -0.8],
    ];
    coins.forEach(([cx, cy, cw, rot], i) => {
      const step = ((f >> 1) + i) % 4;
      const squash = [1, 0.55, 0.15, 0.55][step];
      const bob = Math.sin(((f >> 1) + i * 2) * 0.9) * 3 * s;
      g.save();
      g.translate(cx * w, cy * h + bob);
      g.rotate(rot);
      g.scale(squash, 1);
      g.drawImage(IMG.coin, (-cw * w) / 2, (-cw * w) / 2, cw * w, cw * w);
      g.restore();
    });
    // The host: cheer A/B, swapped every four frames; the face grins, winks once per loop.
    const pose = (f >> 2) % 2 ? 'cheerB' : 'cheerA';
    const face = f % n === n - 4 || f % n === n - 3 ? 'wink' : (f >> 2) % 2 ? 'grin' : 'smileA';
    const hc = boil(host(pose, face), (f >> 1) % 3, 0.8 * s);
    placeBottom(g, hc, w * 0.5, h * 0.965, h * 0.58);
    // Logo across the top, with a little boil.
    const lw = w * 0.86;
    const lh = (IMG.logo.height / IMG.logo.width) * lw;
    const [lc, lg] = canvas(lw, lh);
    lg.drawImage(IMG.logo, 0, 0, lw, lh);
    g.drawImage(boil(lc, (f >> 1) % 3, 0.7 * s), (w - lw) / 2, h * 0.02);
    vignette(g, w, h, 0.5);
    grain(g, w, h, (f >> 1) % 3, 0.1);
    const flick = 0.04 * (r() - 0.5);
    g.fillStyle = flick > 0 ? `rgba(255,240,210,${flick})` : `rgba(20,8,2,${-flick})`;
    g.fillRect(0, 0, w, h);
  }
  A['cover'] = { w: 630, h: 500, frames: 1, draw: drawCover };
  A['cover-2x'] = { w: 1260, h: 1000, frames: 1, draw: drawCover };
  A['cover-animated'] = { w: 630, h: 500, frames: 24, fps: 12, draw: drawCover };

  // Banner (transparent): logo + tagline ribbon, the host waving in from the left, the
  // Producer on the line at the right.
  function drawBanner(g, f, n, w, h) {
    const s = w / 960;
    const lw = w * 0.56,
      lh = (IMG.logo.height / IMG.logo.width) * lw;
    const [lc, lg] = canvas(lw, lh);
    lg.drawImage(IMG.logo, 0, 0, lw, lh);
    g.drawImage(boil(lc, (f >> 1) % 3, 0.6 * s), (w - lw) / 2, h * 0.01);
    const r = tagRibbon(w * 0.5);
    g.drawImage(boil(r, (f >> 1) % 3, 0.5 * s), (w - r.width) / 2, h * 0.01 + lh - r.height * 0.22);
    const pose = (f >> 2) % 2 ? 'presentB' : 'presentA';
    const talk = ['talkA', 'talkE', 'talkO', 'smileA'][(f >> 1) % 4];
    placeBottom(g, boil(host(pose, f < n / 2 ? talk : 'smileA'), (f >> 1) % 3, 0.6 * s), w * 0.12, h * 0.98, h * 0.94);
    const pb = boil(IMG.producer, (f >> 1) % 3, 0.6 * s);
    placeBottom(g, pb, w * 0.88, h * 0.98 + ((f >> 2) % 2) * 2 * s, h * 0.8, true);
  }
  A['banner'] = { w: 960, h: 360, frames: 1, transparent: true, draw: drawBanner };
  A['banner-animated'] = { w: 960, h: 360, frames: 16, fps: 8, transparent: true, draw: drawBanner };

  // Section headers on the red ribbon, boiling on twos.
  const HEADERS = { 'the-show': 'The Show', 'how-to-play': 'How to Play', features: 'Features', controls: 'Controls', download: 'Download', credits: 'Credits' };
  function drawHeader(label) {
    return (g, f, n, w, h) => {
      const rib = IMG.ribbonBig;
      const rh = (rib.height / rib.width) * w;
      const [c, cg] = canvas(w, h);
      cg.drawImage(rib, 0, (h - rh) / 2, w, rh);
      const t = letter(label, rh * 0.42, { shadow: rh * 0.03 });
      const th = rh * 0.62;
      const tw = Math.min((t.width / t.height) * th, w * 0.62);
      const thh = (t.height / t.width) * tw;
      cg.drawImage(t, (w - tw) / 2, (h - thh) / 2 - rh * 0.07, tw, thh);
      g.drawImage(boil(c, f % 3, 0.9), 0, 0);
    };
  }
  for (const [id, label] of Object.entries(HEADERS)) {
    A[`header-${id}`] = { w: 720, h: 190, frames: 1, transparent: true, draw: drawHeader(label) };
    A[`header-${id}-animated`] = { w: 720, h: 190, frames: 6, fps: 8, transparent: true, draw: drawHeader(label) };
  }

  // Divider: a row of show bulbs, every third lit, chasing.
  A['divider'] = {
    w: 960,
    h: 64,
    frames: 6,
    fps: 8,
    transparent: true,
    draw(g, f, n, w, h) {
      g.fillStyle = INK;
      g.fillRect(0, h * 0.62, w, 5);
      g.fillStyle = GOLD;
      g.fillRect(0, h * 0.62, w, 2);
      const k = 20;
      for (let i = 0; i < k; i++) {
        const on = (i + f) % 3 === 0;
        const im = on ? IMG.bulbOn : IMG.bulbOff;
        placeBottom(g, im, (i + 0.5) * (w / k), h * 0.66, on ? h * 0.92 : h * 0.74);
      }
    },
  };

  // Small transparent character loops for the description.
  A['host-loop'] = {
    w: 360,
    h: 440,
    frames: 24,
    fps: 12,
    transparent: true,
    draw(g, f, n, w, h) {
      const poses = ['presentA', 'presentA', 'presentB', 'presentB'];
      const faces = ['talkA', 'talkE', 'talkO', 'talkM', 'grin', 'talkA', 'smileA', 'smileB', 'wink', 'smileA', 'talkE', 'talkO'];
      placeBottom(g, boil(host(poses[(f >> 1) % 4], faces[(f >> 1) % faces.length]), (f >> 1) % 3, 0.8), w / 2, h * 0.99, h * 0.97);
    },
  };
  A['producer-loop'] = {
    w: 360,
    h: 440,
    frames: 12,
    fps: 8,
    transparent: true,
    draw(g, f, n, w, h) {
      placeBottom(g, boil(IMG.producer, f % 3, 0.9), w / 2, h * 0.99 - (f % 4 < 2 ? 0 : 3), h * 0.96);
    },
  };
  A['other-line-loop'] = {
    w: 360,
    h: 440,
    frames: 12,
    fps: 8,
    transparent: true,
    draw(g, f, n, w, h) {
      g.globalAlpha = 0.75 + 0.25 * Math.sin((f / n) * Math.PI * 2);
      placeBottom(g, boil(IMG.otherLine, f % 3, 1.2), w / 2, h * 0.97 + Math.sin((f / n) * Math.PI * 2) * 6, h * 0.94);
      g.globalAlpha = 1;
    },
  };

  let curtainCache = null;
  /** A vertically seamless curtain tile of height h: a band of folds, then the band mirrored. */
  function curtainTile(h) {
    if (curtainCache && curtainCache.height === h) return curtainCache;
    const cur = IMG['texture-curtain'];
    const scale = 0.8;
    const tw = cur.width * scale;
    const [c, g] = canvas(tw, h);
    const bandSrcTop = cur.height * 0.04,
      bandSrcH = cur.height * 0.7;
    g.drawImage(cur, 0, bandSrcTop, cur.width, bandSrcH, 0, 0, tw, h / 2);
    g.save();
    g.translate(0, h);
    g.scale(1, -1);
    g.drawImage(cur, 0, bandSrcTop, cur.width, bandSrcH, 0, 0, tw, h / 2);
    g.restore();
    curtainCache = c;
    return c;
  }

  /**
   * The page background ("edge haunt"): 1920 wide, tiles vertically, loops. The middle 960 px
   * is the itch content column (left plain); the edges are red curtains in the dark with the
   * host's ghost screens drifting between the folds, a flickering lamp glow, and film grain.
   */
  function drawHaunt(g, f, n, w, h) {
    g.fillStyle = '#140a06';
    g.fillRect(0, 0, w, h);
    const colL = (w - 960) / 2,
      colR = colL + 960;
    // Curtain strips. The texture has a hem at the bottom, so a seamless tile is built from a
    // band of its folds plus that band mirrored vertically (top and bottom then always meet).
    const sw = colL - 40;
    const tile = curtainTile(h);
    for (const [x, flip] of [[0, false], [colR + 40, true]]) {
      g.save();
      g.beginPath();
      g.rect(x, 0, sw, h);
      g.clip();
      if (flip) {
        g.translate(x + sw, 0);
        g.scale(-1, 1);
        g.drawImage(tile, tile.width - sw, 0, sw, h, 0, 0, sw, h);
      } else g.drawImage(tile, tile.width - sw, 0, sw, h, x, 0, sw, h);
      g.restore();
      const grad = g.createLinearGradient(flip ? x + sw : x, 0, flip ? x : x + sw, 0);
      grad.addColorStop(0, 'rgba(20,10,6,0.25)');
      grad.addColorStop(0.65, 'rgba(20,10,6,0.55)');
      grad.addColorStop(1, 'rgba(20,10,6,0.95)');
      g.fillStyle = grad;
      g.fillRect(x, 0, sw, h);
    }
    // Gold trim lines framing the column.
    for (const x of [colL - 24, colR + 20]) {
      g.fillStyle = INK;
      g.fillRect(x, 0, 6, h);
      g.fillStyle = GOLD;
      g.fillRect(x + 1, 0, 3, h);
    }
    // Ghost screens: the host's faces surface between the folds and sink back.
    const ghosts = [
      [colL * 0.42, h * 0.18, 'side', 0.0],
      [colL * 0.62, h * 0.58, 'grin', 0.33],
      [colL * 0.3, h * 0.83, 'melt', 0.66],
      [colR + 40 + sw * 0.55, h * 0.12, 'static', 0.5],
      [colR + 40 + sw * 0.4, h * 0.47, 'shock', 0.1],
      [colR + 40 + sw * 0.62, h * 0.78, 'wink', 0.8],
    ];
    const fs = IMG['host-faces'].width / 4;
    for (const [gx, gy, face, ph] of ghosts) {
      const u = ((f >> 1) / Math.max(1, n >> 1) + ph) % 1;
      const vis = Math.max(0, Math.sin(u * Math.PI * 2));
      if (vis < 0.04) continue;
      const fi = FACE[face];
      const size = 168;
      const y = gy + (1 - vis) * 14;
      g.save();
      g.globalAlpha = vis * 0.3;
      g.globalCompositeOperation = 'screen';
      const glow = g.createRadialGradient(gx, y, size * 0.2, gx, y, size * 0.75);
      glow.addColorStop(0, 'rgba(120,230,170,0.7)');
      glow.addColorStop(1, 'rgba(120,230,170,0)');
      g.fillStyle = glow;
      g.fillRect(gx - size, y - size, size * 2, size * 2);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = vis * 0.72;
      g.drawImage(IMG['host-faces'], (fi % 4) * fs, Math.floor(fi / 4) * fs, fs, fs, gx - size / 2, y - size / 2, size, size);
      // Scanlines and a dark wash so they read as faint broadcasts, not stickers.
      g.globalAlpha = vis * 0.35;
      g.fillStyle = '#140a06';
      for (let ly = y - size / 2; ly < y + size / 2; ly += 4) g.fillRect(gx - size / 2, ly, size, 2);
      g.restore();
    }
    // Lamp glow flicker over the column edges.
    const r = rng(77 + (f >> 1));
    const lamp = 0.1 + (r() < 0.25 ? 0.03 : 0);
    for (const x of [colL, colR]) {
      const lg = g.createRadialGradient(x, h / 2, 0, x, h / 2, 420);
      lg.addColorStop(0, `rgba(255,200,120,${lamp})`);
      lg.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = lg;
      g.fillRect(x - 420, 0, 840, h);
    }
    // Fixed grain here: a full-frame change every frame would make the GIF several times larger.
    grain(g, w, h, 0, 0.07);
    // Keep the column itself calm: re-darken it so text sits on a steady ground.
    g.fillStyle = 'rgba(20,10,6,0.92)';
    g.fillRect(colL - 18, 0, 960 + 36, h);
  }
  A['edge-haunt'] = { w: 1920, h: 1024, frames: 16, fps: 8, draw: drawHaunt };
  A['edge-haunt-still'] = { w: 1920, h: 1024, frames: 1, draw: drawHaunt };

  // ------------------------------------------------------------------------------ api --
  /**
   * Render one frame. `matte` (a CSS colour) flattens soft edges onto that colour and makes
   * alpha 1-bit, for GIFs, which have no partial transparency.
   */
  function render(id, f, matte) {
    const a = A[id];
    const [c, g] = canvas(a.w, a.h);
    a.draw(g, f, a.frames, a.w, a.h);
    if (matte && a.transparent) {
      const img = g.getImageData(0, 0, c.width, c.height);
      const d = img.data;
      const m = matte.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16));
      for (let i = 0; i < d.length; i += 4) {
        const al = d[i + 3] / 255;
        if (al < 0.5) {
          d[i + 3] = 0;
          continue;
        }
        for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] * al + m[k] * (1 - al));
        d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }
    return c.toDataURL('image/png');
  }
  window.KIT2 = {
    ready: load(),
    list: () => Object.entries(A).map(([id, a]) => ({ id, w: a.w, h: a.h, frames: a.frames, fps: a.fps ?? 10, transparent: !!a.transparent })),
    render,
  };
})();
