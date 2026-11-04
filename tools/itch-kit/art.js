/*
 * DEAD AIR — itch.io page art. Every image is drawn here as pixel art at native resolution,
 * frame by frame and deterministically (no clocks, no Math.random), so a GIF loops exactly
 * and a rebuild reproduces the same files. tools/itch-kit/build.mjs renders the frames in
 * headless Chromium and scales them up nearest-neighbour.
 *
 * Brand art only: none of this is captured from the game, so it stays valid while the game's
 * look changes. Fonts are the game's own (Silkscreen, VT323; both OFL).
 */
(() => {
  'use strict';

  // ------------------------------------------------------------------------- palette --
  const P = {
    black: '#000000',
    ink: '#0a0503',
    studio: '#140b06',
    wood: '#3a1a08',
    brown: '#6a4820',
    gold: '#c89830',
    yellow: '#ffd040',
    cream: '#f0e0c0',
    red: '#ff4a2a',
    blood: '#c02818',
    deep: '#3a0800',
    phos: '#8affb0',
    phosDim: '#2a7a4a',
    screen: '#0f3a22',
    screenLine: '#124a2a',
    plastic: '#5a5048',
    plasticDark: '#3a332e',
    shell: '#1a1210',
    bulbOn: '#ffe890',
    bulbOff: '#4a3418',
    violet: '#c080ff',
  };
  const WEDGES = ['#2f7d3a', '#f2c230', '#c0472a', '#2a5d9c', '#b8862b', '#6b3a8c', '#e05aa0', '#1f6f6a'];

  // ------------------------------------------------------------------ deterministic rng --
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
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  // ----------------------------------------------------------------------- primitives --
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return [c, g];
  }
  const rect = (g, x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const hex = (c) => {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const mix = (a, b, t) => {
    const A = hex(a),
      B = hex(b);
    return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
  };
  const shade = (c, k) => mix('#000000', c, k);

  /**
   * Crisp pixel text: rasterised, alpha-thresholded to 1-bit, then optional 1 px outline and
   * hard drop shadow. Returns a canvas to draw at integer coordinates.
   */
  function text(str, o) {
    const size = o.size ?? 16;
    const font = `${size}px ${o.font ?? 'Silk'}`;
    const [mc, mg] = canvas(8, 8);
    mg.font = font;
    const spacing = Math.round(o.spacing ?? 0);
    const tw = Math.ceil(mg.measureText(str).width) + spacing * str.length;
    const pad = 3;
    const W = tw + pad * 2,
      H = Math.ceil(size * 1.4) + pad * 2;
    const [tc, tg] = canvas(W, H);
    tg.font = font;
    tg.fillStyle = '#fff';
    tg.textBaseline = 'top';
    if (spacing) {
      let x = pad;
      for (const ch of str) {
        tg.fillText(ch, Math.round(x), pad);
        x += tg.measureText(ch).width + spacing;
      }
    } else tg.fillText(str, pad, pad);
    const src = tg.getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = src[i * 4 + 3] >= (o.threshold ?? 120) ? 1 : 0;
    // Trim to content.
    let x0 = W,
      y0 = H,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (mask[y * W + x]) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
    if (x1 < 0) return canvas(1, 1)[0];
    const ol = o.outline ? 1 : 0;
    const sx = o.shadow ? Math.max(1, Math.round(o.shadowOff ?? 1)) : 0;
    const ow = x1 - x0 + 1 + ol * 2 + sx,
      oh = y1 - y0 + 1 + ol * 2 + sx;
    const [oc, og] = canvas(ow, oh);
    const img = og.createImageData(ow, oh);
    const put = (x, y, c) => {
      if (x < 0 || y < 0 || x >= ow || y >= oh) return;
      const i = (y * ow + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    };
    const at = (x, y) => x >= x0 && y >= y0 && x <= x1 && y <= y1 && mask[y * W + x];
    const fill = (x, y) => (typeof o.color === 'function' ? hex(o.color(x - x0, y - y0, x1 - x0 + 1, y1 - y0 + 1)) : hex(o.color ?? P.cream));
    for (let y = y0 - 1; y <= y1 + 1; y++)
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        const X = x - x0 + ol,
          Y = y - y0 + ol;
        if (o.outline) {
          let hit = false;
          for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1 && !hit; dx++) hit = !!at(x + dx, y + dy);
          if (hit) {
            put(X, Y, hex(o.outline));
            if (sx) put(X + sx, Y + sx, hex(o.outline));
          }
        }
      }
    if (sx)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) if (at(x, y)) put(x - x0 + ol + sx, y - y0 + ol + sx, hex(o.shadow));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (at(x, y)) put(x - x0 + ol, y - y0 + ol, fill(x, y));
    og.putImageData(img, 0, 0);
    return oc;
  }

  // -------------------------------------------------------------------------- pieces --

  /** The DEAD AIR wordmark: red DEAD, yellow AIR, hard shadow, dark outline. */
  function logo(o = {}) {
    const size = o.size ?? 32;
    const outline = o.outline === false ? undefined : (o.outlineColor ?? P.black);
    const dead = text('DEAD', { size, color: (x, y, w, h) => (y < h * 0.45 ? '#ff6a40' : P.red), shadow: P.deep, shadowOff: size / 16, outline, spacing: size / 16 });
    const air = text('AIR', { size, color: (x, y, w, h) => (y < h * 0.45 ? '#ffe070' : P.yellow), shadow: '#5a3a00', shadowOff: size / 16, outline, spacing: size / 16 });
    const gap = Math.round(size * 0.45);
    const [c, g] = canvas(dead.width + gap + air.width, Math.max(dead.height, air.height));
    g.drawImage(dead, 0, 0);
    g.drawImage(air, dead.width + gap, 0);
    return c;
  }

  function tagline(str = 'A PRIZE-WHEEL GAMBLING ROGUELITE', size = 16, color = P.cream) {
    return text(str, { font: 'VT', size, color, outline: P.black });
  }

  /** CRT host head (the game's host has a television for a head), k = pixel scale. */
  function host(g, x, y, k, o = {}) {
    const R = (rx, ry, w, h, c) => rect(g, x + rx * k, y + ry * k, w * k, h * k, c);
    const talk = o.talk ?? 0; // 0 closed … 1 open
    const blink = !!o.blink;
    const glow = o.glow ?? 1;
    // Antennas.
    for (let i = 0; i < 7; i++) {
      R(10 - i, 6 - i, 1, 1, '#d8d0c0');
      R(24 + i, 6 - i, 1, 1, '#d8d0c0');
    }
    R(3, -1, 1, 1, P.red);
    R(31, -1, 1, 1, P.red);
    // Shell.
    R(1, 7, 32, 26, P.shell);
    R(2, 6, 30, 28, P.shell);
    R(2, 7, 30, 26, P.plastic);
    R(3, 8, 28, 24, P.plasticDark);
    // Screen.
    R(5, 10, 20, 20, '#0c0a08');
    R(6, 11, 18, 18, shade(P.screen, 0.6 + 0.4 * glow));
    for (let sy = 11; sy < 29; sy += 2) R(6, sy, 18, 1, shade(P.screenLine, 0.6 + 0.4 * glow));
    const f = glow > 0.4 ? P.phos : P.phosDim;
    if (!o.static) {
      // Eyes.
      if (blink) {
        R(9, 16, 3, 1, f);
        R(18, 16, 3, 1, f);
      } else {
        R(9, 15, 3, 3, f);
        R(18, 15, 3, 3, f);
      }
      // Mouth: grin, or open while talking.
      if (talk > 0.15) {
        const h = 1 + Math.round(talk * 3);
        R(11, 22, 8, 1, f);
        R(10, 23, 1, h, f);
        R(19, 23, 1, h, f);
        R(11, 23 + h, 8, 1, f);
        R(11, 23, 8, h, '#06301a');
      } else {
        R(9, 22, 1, 1, f);
        R(20, 22, 1, 1, f);
        R(10, 23, 1, 1, f);
        R(19, 23, 1, 1, f);
        R(11, 24, 8, 1, f);
      }
    } else {
      const r = rng(o.static);
      for (let sy = 11; sy < 29; sy++) for (let sx = 6; sx < 24; sx++) if (r() < 0.45) R(sx, sy, 1, 1, r() < 0.5 ? '#8ab09a' : '#3a5a48');
    }
    R(7, 12, 1, 1, '#c0ffd8');
    // Knobs + tally lamp.
    R(26, 12, 4, 4, P.gold);
    R(27, 13, 2, 2, P.brown);
    R(26, 19, 4, 4, P.gold);
    R(27, 20, 2, 2, P.brown);
    R(26, 26, 4, 3, o.lamp === false ? P.deep : P.red);
    // Feet.
    R(5, 34, 4, 2, P.shell);
    R(25, 34, 4, 2, P.shell);
    if (o.suit) {
      // Shoulders, lapels and the red bow tie.
      R(-6, 37, 46, 12, '#16100c');
      R(-4, 36, 42, 2, '#16100c');
      R(12, 36, 10, 13, P.cream);
      R(14, 37, 6, 12, '#d8c8a8');
      R(9, 36, 5, 13, '#221812');
      R(20, 36, 5, 13, '#221812');
      R(12, 37, 4, 4, P.red);
      R(18, 37, 4, 4, P.red);
      R(16, 38, 2, 2, P.yellow);
    }
  }

  /** Prize wheel, drawn per pixel so it rotates crisply. */
  function wheel(g, cx, cy, R, rot, o = {}) {
    const N = o.wedges ?? 16;
    const step = (Math.PI * 2) / N;
    const x0 = Math.floor(cx - R - 1),
      y0 = Math.floor(cy - R - 1),
      S = Math.ceil(R * 2 + 3);
    const img = g.getImageData(x0, y0, S, S);
    const d = img.data;
    const put = (i, c) => {
      const [r, gg, b] = hex(c);
      d[i] = r;
      d[i + 1] = gg;
      d[i + 2] = b;
      d[i + 3] = 255;
    };
    const lit = o.lit ?? 0;
    for (let py = 0; py < S; py++)
      for (let px = 0; px < S; px++) {
        const dx = x0 + px + 0.5 - cx,
          dy = y0 + py + 0.5 - cy;
        const r = Math.hypot(dx, dy);
        if (r > R) continue;
        const i = (py * S + px) * 4;
        let a = Math.atan2(dy, dx) - rot;
        a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const w = Math.floor(a / step);
        const frac = a / step - w;
        const edge = Math.min(frac, 1 - frac) * step * r; // px from a wedge boundary
        if (r > R - 2.2) {
          // Gold rim with chasing bulbs at each wedge boundary.
          const bulbIdx = Math.round(a / step) % N;
          const near = Math.min(frac, 1 - frac) * step * r < 1.3 && r > R - 2;
          put(i, near ? ((bulbIdx + lit) % 3 === 0 ? P.bulbOn : P.bulbOff) : r > R - 0.9 ? P.brown : P.gold);
          continue;
        }
        if (r < R * 0.13) {
          put(i, r < R * 0.07 ? P.yellow : P.gold);
          continue;
        }
        if (r < R * 0.3 && r > R * 0.24) {
          put(i, '#1a1008');
          continue;
        }
        if (edge < 0.55) {
          put(i, '#1a1008');
          continue;
        }
        let c = WEDGES[w % WEDGES.length];
        if (o.colors) c = o.colors[w % o.colors.length];
        if (r < R * 0.24) c = shade(c, 0.55);
        // Light from the top-left, ordered dither so it reads as PS1 shading.
        const light = 0.82 + 0.25 * (-(dx + dy) / (R * 1.6));
        const k = light + (bayer(x0 + px, y0 + py) - 0.5) * 0.12;
        put(i, shade(c, Math.min(1, Math.max(0.55, k))));
      }
    g.putImageData(img, x0, y0);
    if (o.pointer !== false) {
      // Pointer at the top.
      const px = Math.round(cx),
        py = Math.round(cy - R - 1);
      for (let j = 0; j < 6; j++) rect(g, px - 5 + j, py - 4 + j, 11 - j * 2, 1, j < 1 ? P.deep : P.red);
      rect(g, px - 1, py - 5, 3, 2, P.yellow);
    }
  }

  /** A row of game-show bulbs; every third lit, chasing with `phase`. */
  function bulbs(g, x, y, n, gap, phase, o = {}) {
    for (let i = 0; i < n; i++) {
      const on = (i + phase) % 3 === 0;
      const bx = o.vertical ? x : x + i * gap,
        by = o.vertical ? y + i * gap : y;
      if (on) {
        rect(g, bx - 1, by, 4, 2, P.gold);
        rect(g, bx, by - 1, 2, 4, P.gold);
        rect(g, bx, by, 2, 2, P.bulbOn);
      } else rect(g, bx, by, 2, 2, P.bulbOff);
    }
  }

  /** ON AIR tally sign. */
  function onAir(g, x, y, on, k = 1) {
    const t = text('ON AIR', { size: 8 * k, color: on ? '#ff6a50' : '#5a1810' });
    const w = t.width + 6 * k,
      h = t.height + 5 * k;
    rect(g, x, y, w, h, on ? '#ff3020' : '#3a1410');
    rect(g, x + k, y + k, w - 2 * k, h - 2 * k, on ? '#2a0804' : P.ink);
    g.drawImage(t, x + 3 * k, y + Math.round(2.5 * k));
    return [w, h];
  }

  /** Desk phone (the Producer's line), ringing when `ring` > 0. */
  function phone(g, x, y, k, ring, o = {}) {
    const R = (rx, ry, w, h, c) => rect(g, x + rx * k, y + ry * k, w * k, h * k, c);
    const jig = ring ? (ring % 2 ? -1 : 1) : 0;
    // Base.
    R(4, 18, 28, 12, P.shell);
    R(3, 21, 30, 9, P.shell);
    R(5, 19, 26, 10, o.color ?? '#8f1d1d');
    R(5, 19, 26, 2, mix(o.color ?? '#8f1d1d', '#ffffff', 0.25));
    // Dial.
    R(12, 21, 12, 8, P.shell);
    R(13, 22, 10, 6, P.cream);
    R(17, 24, 2, 2, P.shell);
    for (const [dx, dy] of [[14, 22], [16, 22], [19, 22], [21, 22], [22, 24], [21, 26], [14, 26], [13, 24]]) R(dx, dy, 1, 1, P.brown);
    // Handset, jumping on its cradle.
    const hy = 12 + (ring ? -1 + (jig > 0 ? 0 : -1) : 0);
    R(2 + jig, hy, 32, 4, P.shell);
    R(1 + jig, hy - 1, 7, 6, P.shell);
    R(28 + jig, hy - 1, 7, 6, P.shell);
    R(3 + jig, hy, 30, 2, o.color ?? '#8f1d1d');
    R(2 + jig, hy, 5, 4, o.color ?? '#8f1d1d');
    R(29 + jig, hy, 5, 4, o.color ?? '#8f1d1d');
    R(6, 17, 2, 2, P.shell);
    R(28, 17, 2, 2, P.shell);
    // Cord.
    for (let i = 0; i < 6; i++) R(33 + (i % 2), 22 + i, 1, 1, P.shell);
    if (ring) {
      // Ring lines.
      const c = ring % 2 ? P.yellow : P.red;
      R(-3, 8, 2, 1, c);
      R(-4, 11, 2, 1, c);
      R(-3, 14, 2, 1, c);
      R(37, 8, 2, 1, c);
      R(38, 11, 2, 1, c);
      R(37, 14, 2, 1, c);
    }
  }

  /** Red stage curtain, dithered folds. */
  function curtain(g, w, h, o = {}) {
    const img = g.createImageData(w, h);
    const d = img.data;
    const cols = [hex('#1a0302'), hex('#3a0806'), hex('#5a120c'), hex('#7a1c12'), hex('#9a2a18')];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const fold = 0.5 + 0.5 * Math.sin((x / (o.fold ?? 13)) * Math.PI * 2 + Math.sin(y / 40) * 0.6);
        const top = Math.min(1, y / (h * 0.25));
        const spot = o.spot ? Math.max(0, 1 - Math.hypot((x - o.spot[0]) / o.spot[2], (y - o.spot[1]) / o.spot[3])) : 0;
        let v = fold * 0.55 + spot * 0.6 - (1 - top) * 0.25 + (o.lift ?? 0);
        v = v * (cols.length - 1) + (bayer(x, y) - 0.5);
        const c = cols[Math.max(0, Math.min(cols.length - 1, Math.round(v)))];
        const i = (y * w + x) * 4;
        d[i] = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
        d[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
  }

  /** Dithered darkening toward the edges. */
  function vignette(g, w, h, strength = 0.6) {
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const nx = (x / w) * 2 - 1,
          ny = (y / h) * 2 - 1;
        const v = Math.max(0, Math.hypot(nx * 0.9, ny) - 0.55) * strength * 2;
        if (v > bayer(x, y)) {
          const i = (y * w + x) * 4;
          d[i] = d[i] * 0.45;
          d[i + 1] = d[i + 1] * 0.45;
          d[i + 2] = d[i + 2] * 0.45;
        }
      }
    g.putImageData(img, 0, 0);
  }

  function scanlines(g, w, h, alpha = 0.18) {
    g.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let y = 1; y < h; y += 2) g.fillRect(0, y, w, 1);
  }

  // ------------------------------------------------------------------------ assets --
  // Each asset: { w, h, frames, fps, scale, transparent, draw(g, f, n) }.
  const A = {};

  A['logo'] = {
    transparent: true,
    scale: 4,
    frames: 1,
    size() {
      const l = logo({ size: 32 });
      return [l.width + 2, l.height + 2];
    },
    draw(g) {
      g.drawImage(logo({ size: 32 }), 1, 1);
    },
  };

  A['logo-tagline'] = {
    transparent: true,
    scale: 4,
    frames: 1,
    size() {
      const l = logo({ size: 32 }),
        t = tagline();
      return [Math.max(l.width, t.width) + 2, l.height + t.height + 6];
    },
    draw(g, f, n, w) {
      const l = logo({ size: 32 }),
        t = tagline();
      g.drawImage(l, Math.round((w - l.width) / 2), 1);
      g.drawImage(t, Math.round((w - t.width) / 2), l.height + 4);
    },
  };

  A['logo-flicker'] = {
    transparent: true,
    scale: 4,
    frames: 32,
    fps: 12,
    size() {
      const l = logo({ size: 32 });
      return [l.width + 2, l.height + 2];
    },
    draw(g, f) {
      // A sign warming up on a dying circuit: mostly on, a stutter, a long dropout.
      const off = [3, 5, 6, 17, 18, 19, 20, 27].includes(f);
      const dim = [4, 21, 26].includes(f);
      if (off) return;
      const l = logo({ size: 32 });
      g.globalAlpha = dim ? 0.5 : 1;
      g.drawImage(l, 1, 1);
      g.globalAlpha = 1;
      if (f === 4 || f === 26) {
        // Torn horizontal line, VHS style.
        const y = f === 4 ? 9 : 22;
        const [sc, sg] = canvas(l.width, 3);
        sg.drawImage(l, 0, -y);
        g.clearRect(0, y + 1, l.width + 2, 3);
        g.drawImage(sc, 4, y + 1);
      }
    },
  };

  A['banner'] = {
    transparent: true,
    scale: 3,
    frames: 1,
    size: () => [320, 84],
    draw: (g, f, n) => drawBanner(g, 0, 1),
  };
  A['banner-animated'] = {
    transparent: true,
    scale: 3,
    frames: 48,
    fps: 12,
    size: () => [320, 84],
    draw: (g, f, n) => drawBanner(g, f, n),
  };
  function drawBanner(g, f, n) {
    const W = 320;
    const t = f / n;
    // Wheel at the right, quarter-turn per loop (the wedge pattern repeats every 8 of 16).
    wheel(g, 318, 46, 38, t * Math.PI, { lit: f % 3, pointer: false });
    // Host peeking in from the left, talking.
    const talk = Math.max(0, Math.sin(f * 1.3) * Math.sin(f * 0.37 + 1));
    host(g, -10, 16, 2, { talk: f % 24 < 14 ? talk : 0, blink: f % 24 === 20 || f % 24 === 21, lamp: f % 12 < 8 });
    const l = logo({ size: 32 });
    g.drawImage(l, Math.round((W - l.width) / 2), 12);
    const tg = tagline();
    g.drawImage(tg, Math.round((W - tg.width) / 2), 12 + l.height + 4);
    bulbs(g, 92, 5, 23, 6, f % 3);
    bulbs(g, 92, 12 + l.height + tg.height + 8, 23, 6, (f + 1) % 3);
  }

  A['cover'] = {
    transparent: false,
    scale: 2,
    frames: 1,
    size: () => [315, 250],
    draw: (g) => drawCover(g, 0, 1),
  };
  A['cover-animated'] = {
    transparent: false,
    scale: 2,
    frames: 60,
    fps: 12,
    size: () => [315, 250],
    draw: (g, f, n) => drawCover(g, f, n),
  };
  let coverBg = null;
  function drawCover(g, f, n) {
    const W = 315,
      H = 250;
    if (!coverBg) {
      const [c, cg] = canvas(W, H);
      curtain(cg, W, H, { spot: [196, 96, 120, 110], fold: 15 });
      // Stage floor.
      rect(cg, 0, 196, W, 54, '#120806');
      for (let y = 196; y < H; y++)
        for (let x = 0; x < W; x++) if (bayer(x, y) < (y - 196) / 70) rect(cg, x, y, 1, 1, '#070302');
      rect(cg, 0, 195, W, 2, P.gold);
      rect(cg, 0, 197, W, 1, P.brown);
      coverBg = c;
    }
    g.drawImage(coverBg, 0, 0);
    const t = f / n;
    // The wheel: half a turn per loop (the wedge colours repeat after eight of sixteen).
    wheel(g, 200, 110, 74, -0.3 + t * Math.PI, { lit: f % 3 });
    // Floor bulbs.
    bulbs(g, 6, 202, 51, 6, f % 3);
    // The host in the foreground, lower left.
    const talk = Math.max(0, Math.sin(f * 1.1) * Math.sin(f * 0.29 + 0.5));
    const blink = f % 30 === 12 || f % 30 === 13;
    const glitch = f % 20 === 7;
    host(g, 22, 110, 2, { talk: f % 30 < 22 ? talk : 0, blink, static: glitch ? 1000 + f : 0, suit: true, lamp: f % 12 < 7 });
    // The host's podium.
    rect(g, 8, 176, 96, 34, P.shell);
    rect(g, 10, 178, 92, 30, '#4a1010');
    rect(g, 10, 178, 92, 3, P.gold);
    rect(g, 10, 181, 92, 1, P.brown);
    rect(g, 24, 186, 64, 16, '#1a0604');
    const hostSign = text('HOST', { size: 8, color: f % 24 < 20 ? P.yellow : P.gold });
    g.drawImage(hostSign, 56 - Math.round(hostSign.width / 2), 191);
    bulbs(g, 14, 204, 15, 6, (f + 1) % 3);
    vignette(g, W, H, 0.55);
    // Logo + tagline on top.
    const l = logo({ size: 48 });
    g.drawImage(l, Math.round((W - l.width) / 2), 6);
    const tg = tagline('A PRIZE-WHEEL GAMBLING ROGUELITE', 16, P.cream);
    g.drawImage(tg, Math.round((W - tg.width) / 2), 225);
    onAir(g, 262, 60, f % 24 < 18 || f % 24 === 20);
    scanlines(g, W, H, 0.12);
  }

  // Section headers for the description (transparent animated GIFs).
  const HEADERS = {
    'header-the-show': 'THE SHOW',
    'header-how-to-play': 'HOW TO PLAY',
    'header-features': 'FEATURES',
    'header-controls': 'CONTROLS',
    'header-download': 'DOWNLOAD',
    'header-credits': 'CREDITS',
  };
  for (const [id, label] of Object.entries(HEADERS)) {
    A[id] = {
      transparent: true,
      scale: 3,
      frames: 18,
      fps: 9,
      size: () => [300, 26],
      draw(g, f, n, w, h) {
        const glitch = f === 11;
        const t = text(label, { size: 16, color: (x, y, tw, th) => (y < th / 2 ? P.yellow : '#e8b030'), shadow: P.deep, outline: P.black, spacing: 1 });
        const x = Math.round((w - t.width) / 2),
          y = Math.round((h - t.height) / 2);
        if (glitch) {
          const r = text(label, { size: 16, color: P.red, spacing: 1 });
          g.drawImage(r, x - 2, y);
        }
        g.drawImage(t, x + (glitch ? 1 : 0), y);
        // Bulbs either side.
        const bw = 6,
          nb = Math.floor((x - 12) / bw);
        bulbs(g, x - 8 - (nb - 1) * bw, Math.round(h / 2) - 1, nb, bw, (f + 2) % 3);
        bulbs(g, x + t.width + 6, Math.round(h / 2) - 1, nb, bw, f % 3);
      },
    };
  }

  A['divider'] = {
    transparent: true,
    scale: 3,
    frames: 6,
    fps: 8,
    size: () => [320, 8],
    draw(g, f, n, w) {
      rect(g, 0, 3, w, 2, P.brown);
      rect(g, 0, 3, w, 1, P.gold);
      bulbs(g, 2, 3, 53, 6, f % 3);
    },
  };

  A['wheel-spin'] = {
    transparent: true,
    scale: 3,
    frames: 54,
    fps: 15,
    size: () => [120, 124],
    draw(g, f, n) {
      // Rest, a pull, three full turns easing out, a tick-back, rest: starts where it ends.
      const hold = 10,
        spin = n - hold * 2;
      let a = 0;
      if (f >= hold && f < hold + spin) {
        const u = (f - hold) / spin;
        a = Math.PI * 2 * 3 * (1 - Math.pow(1 - u, 3)) - 0.06 * Math.sin(u * Math.PI);
      } else if (f >= hold + spin) a = Math.PI * 2 * 3;
      const settle = f >= hold + spin && f < hold + spin + 4 ? Math.sin(((f - hold - spin) / 4) * Math.PI) * 0.05 : 0;
      wheel(g, 60, 64, 54, a + settle, { lit: Math.floor(f / 2) % 3 });
    },
  };

  A['host-talk'] = {
    transparent: true,
    scale: 4,
    frames: 40,
    fps: 12,
    size: () => [52, 52],
    draw(g, f) {
      const talk = f < 26 ? Math.max(0, Math.sin(f * 1.25) * Math.sin(f * 0.41 + 0.3)) : 0;
      const blink = f === 30 || f === 31 || f === 8;
      const glitch = f === 34 ? 500 : 0;
      host(g, 9, 8, 1, { talk, blink, static: glitch, suit: false, lamp: f % 10 < 6, glow: f === 35 ? 0.3 : 1 });
    },
  };

  A['phone-ring'] = {
    transparent: true,
    scale: 4,
    frames: 24,
    fps: 12,
    size: () => [48, 40],
    draw(g, f) {
      // Two rings, then silence: the Producer is waiting.
      const ring = f < 6 || (f >= 9 && f < 15) ? f + 1 : 0;
      phone(g, 6, 4, 1, ring);
    },
  };

  A['phone-ring-other-line'] = {
    transparent: true,
    scale: 4,
    frames: 24,
    fps: 12,
    size: () => [48, 40],
    draw(g, f) {
      const ring = f < 3 || (f >= 12 && f < 15) ? f + 1 : 0;
      phone(g, 6, 4, 1, ring, { color: '#4a2a6a' });
    },
  };

  /**
   * The page background: a vertically tiling, looping strip. The middle 960 px (the itch
   * content column) stays plain studio-dark; the edges are haunted — ghost hosts surfacing
   * in the static, a rolling hum bar, flickering ON AIR signs, and a bulb rail framing the
   * column that chases downward. Native 480×180 → 1920×720 at ×4; tiles seamlessly in y and
   * loops seamlessly in time.
   */
  A['edge-haunt'] = {
    transparent: false,
    scale: 4,
    frames: 30,
    fps: 10,
    size: () => [480, 180],
    draw: (g, f, n) => drawHaunt(g, f, n),
  };
  A['edge-haunt-still'] = {
    transparent: false,
    scale: 4,
    frames: 1,
    size: () => [480, 180],
    draw: (g) => drawHaunt(g, 0, 30),
  };
  let hauntBase = null;
  function drawHaunt(g, f, n) {
    const W = 480,
      H = 180,
      L = 120,
      Rr = 360; // content column 120..360 native = 480..1440 at ×4
    const t = f / n;
    if (!hauntBase) {
      const [c, cg] = canvas(W, H);
      const img = cg.createImageData(W, H);
      const d = img.data;
      const base = hex('#0a0503'),
        edge = hex('#140806'),
        far = hex('#1e0c08');
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const dist = x < L ? (L - x) / L : x >= Rr ? (x - Rr + 1) / (W - Rr) : 0;
          const v = dist * 2 + (bayer(x, y) - 0.5);
          const col = v < 0.5 ? base : v < 1.5 ? edge : far;
          const i = (y * W + x) * 4;
          d[i] = col[0];
          d[i + 1] = col[1];
          d[i + 2] = col[2];
          d[i + 3] = 255;
        }
      cg.putImageData(img, 0, 0);
      // Faint wedge-coloured streaks low in the edges, like old studio gels.
      for (let k = 0; k < 6; k++) {
        const x = k < 3 ? 14 + k * 34 : Rr + 14 + (k - 3) * 34;
        const col = shade(WEDGES[(k * 3) % WEDGES.length], 0.22);
        for (let y = 0; y < H; y++) if ((y + k * 7) % 4 === 0 || bayer(x, y) < 0.3) rect(cg, x + (y % 9 === 0 ? 1 : 0), y, 1, 1, col);
      }
      hauntBase = c;
    }
    g.drawImage(hauntBase, 0, 0);
    const inEdge = (x) => x < L - 4 || x >= Rr + 4;
    // Sparse static in the edges, thicker toward the outside.
    const r = rng(9000 + f);
    for (let i = 0; i < 1400; i++) {
      const x = Math.floor(r() * W),
        y = Math.floor(r() * H);
      if (!inEdge(x)) continue;
      const dist = x < L ? (L - x) / L : (x - Rr) / (W - Rr);
      if (r() > dist * 0.9 + 0.1) continue;
      const v = r();
      rect(g, x, y, 1, 1, v < 0.6 ? '#2a1a14' : v < 0.9 ? '#4a3a30' : '#8a7a6a');
    }
    // Rolling hum bar: one band per loop, wrapping so the tile still matches top to bottom.
    const by = Math.floor(t * H);
    for (let dy = 0; dy < 10; dy++) {
      const y = (by + dy) % H;
      for (let x = 0; x < W; x++) if (inEdge(x) && bayer(x, y) < 0.35 - Math.abs(dy - 5) * 0.06) rect(g, x, y, 1, 1, '#3a2418');
    }
    // Ghost hosts: each surfaces, holds, and sinks back into the static on its own phase.
    const ghosts = [
      [8, 8, 0.0, 2],
      [66, 100, 0.33, 1],
      [12, 132, 0.62, 1],
      [392, 22, 0.5, 1],
      [418, 92, 0.12, 2],
      [370, 140, 0.8, 1],
    ];
    for (const [gx, gy, ph, k] of ghosts) {
      const u = (t + ph) % 1;
      const vis = Math.max(0, Math.sin(u * Math.PI * 2)); // 0 … 1 … 0, half the loop
      if (vis < 0.05) continue;
      const [hc, hg] = canvas(36 * k + 2, 38 * k + 2);
      const glitch = Math.floor(u * 30) % 7 === 3;
      host(hg, 1, 2 * k, k, { talk: Math.max(0, Math.sin(u * 40)) * 0.8, blink: Math.floor(u * 30) % 9 === 0, static: glitch ? 77 + f : 0, glow: vis, lamp: vis > 0.6 });
      // Dissolve: keep each pixel only while the dither threshold is under the visibility.
      const id = hg.getImageData(0, 0, hc.width, hc.height);
      for (let y = 0; y < hc.height; y++)
        for (let x = 0; x < hc.width; x++) {
          const i = (y * hc.width + x) * 4;
          if (bayer(x + gx, y + gy) > vis * 0.7) id.data[i + 3] = 0;
          else {
            id.data[i] *= 0.38;
            id.data[i + 1] *= 0.45;
            id.data[i + 2] *= 0.4;
          }
        }
      hg.putImageData(id, 0, 0);
      const ox = glitch ? 2 : 0;
      // Draw wrapped so ghosts near the bottom continue at the top of the next tile.
      g.drawImage(hc, gx + ox, gy);
      if (gy + hc.height > H) g.drawImage(hc, gx + ox, gy - H);
    }
    // ON AIR signs flicker on their own rhythm.
    onAir(g, 62, 152, f % 10 < 6 && f !== 3);
    onAir(g, 372, 72, (f + 4) % 15 < 9);
    // Bulb rails framing the content column, chasing downward; 30 bulbs per tile.
    rect(g, L - 4, 0, 1, H, P.brown);
    rect(g, Rr + 4, 0, 1, H, P.brown);
    bulbs(g, L - 5, 2, 30, 6, (3 - (f % 3)) % 3, { vertical: true });
    bulbs(g, Rr + 3, 2, 30, 6, (3 - (f % 3)) % 3, { vertical: true });
    scanlines(g, W, H, 0.1);
  }

  // -------------------------------------------------------------------------- render --
  function render(id, f) {
    const a = A[id];
    const [w, h] = a.size();
    const [c, g] = canvas(w, h);
    if (!a.transparent) rect(g, 0, 0, w, h, P.black);
    a.draw(g, f, a.frames, w, h);
    if (a.transparent) {
      // 1-bit alpha so GIF transparency is exact.
      const img = g.getImageData(0, 0, w, h);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= 128 ? 255 : 0;
      g.putImageData(img, 0, 0);
    }
    return c.toDataURL('image/png');
  }

  window.KIT = {
    list: () => Object.entries(A).map(([id, a]) => ({ id, frames: a.frames, fps: a.fps ?? 10, scale: a.scale, transparent: a.transparent, size: a.size() })),
    render,
  };
})();
