/**
 * The prize wheel: outer ring of wedges, counter-rotating inner Multiplier Ring, gold pegs,
 * leather flapper, chasing marquee bulbs. Replays physics traces exactly.
 */
import * as THREE from 'three';
import { WEDGES } from '../../content/wedges';
import type { Layout, Segment } from '../../game/types';
import type { PegTick, SpinTrace } from '../../game/wheel';
import { drawText, textWidth } from '../../ui/bitfont';
import type { Assets } from '../../assets/loader';
import { art } from '../../assets/art';
import { psxMaterial, type PsxMaterial } from '../psxMaterial';
import { CanvasPanel, DEG, TAU, hexCss, pickable } from './util';
import { PropBuilder } from './props';

export const WHEEL_R = 1.25;
const INNER_R = 0.42;
const PEG_R = WHEEL_R - 0.05;
const FLAP_LEN = 0.2;
/** Marquee bulbs round the gold rim. */
const BULBS = 40;
/** Wheel face texture size, and the bitmap-font scale on it (native pixel size on screen). */
const FACE_PX = 256;
const GLYPH = 2;
const GLYPH_H = 7 * GLYPH;
/** The face's rim band (oxblood, cream dots) starts at this fraction of the radius. */
const RIM_IN = 0.95;
/** Divider ink width on the face; text and icons keep clear of it. */
const DIVIDER = 2.5;
/** Wedge kinds whose label is a number: the number matters more than the icon. */
const NUMERIC = new Set(['cash', 'cursedCash', 'jackpot', 'token', 'interest', 'overtime', 'doubler']);

/** Shorter forms of a wedge label, tried in order when the full one doesn't fit its wedge. */
function labelVariants(t: string): string[] {
  const out = [t];
  const cash = /^\$(\d+)$/.exec(t);
  if (cash) {
    const n = Number(cash[1]);
    // Only use a one-decimal K label when it represents the exact amount.
    if (n >= 1000 && n % 100 === 0) {
      const compact = `${n / 1000}K`;
      out.push(`$${compact}`, compact);
    }
    if (n >= 1000) out.push(cash[1]);
  }
  if (t.endsWith(' TOK')) out.push(t.replace(' TOK', 'T'));
  if (t.endsWith(' SPN')) out.push(t.replace(' SPN', 'S'));
  if (t === 'x2 NXT') out.push('x2');
  if (t === '+5% V') out.push('+5%');
  if (t === 'JACKPOT') out.push('JACK');
  if (t === 'PAYDAY') out.push('PAY');
  if (t === 'RESPIN') out.push('SPIN');
  if (t === 'CHARGE') out.push('ZAP');
  return out;
}

/** Push a wedge colour toward the art pack's printed-card palette: warmer, a touch softer. */
function printColor(hex: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 1.08), Math.min(0.62, hsl.l * 1.06));
  c.lerp(new THREE.Color(0xf3dfb0), 0.07);
  return `#${c.getHexString()}`;
}

const lum = (hex: number) => {
  const c = new THREE.Color(hex);
  return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
};

/** Bitmap text with a 1-px outline all round, so it reads on any wedge colour. */
function outlinedText(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, color: string, outline: string, scale = GLYPH): void {
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) drawText(ctx, t, x + dx, y + dy, { scale, color: outline });
  drawText(ctx, t, x, y, { scale, color });
}

/** Paper grain shared by the wheel faces (light, so 'multiply' only ages the print). */
let GRAIN: HTMLCanvasElement | null = null;
function grain(size: number): HTMLCanvasElement {
  if (GRAIN && GRAIN.width === size) return GRAIN;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 228 + Math.random() * 27;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v * 0.97;
    img.data[i * 4 + 2] = v * 0.9;
    img.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  // A few faint scuffs.
  c.strokeStyle = 'rgba(120,80,40,0.18)';
  for (let k = 0; k < 18; k++) {
    c.beginPath();
    const x = Math.random() * size,
      y = Math.random() * size;
    c.moveTo(x, y);
    c.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
    c.stroke();
  }
  GRAIN = cv;
  return cv;
}

/** How a wedge's contents fit: an icon at the rim, a label along the radius, or both. */
export interface WedgeFit {
  icon: { size: number; r: number } | null;
  label: { text: string; r0: number; r1: number } | null;
}

/**
 * Choose what goes in a wedge so that everything fits inside its width: the label (bitmap font
 * at native size, read along the radius) must sit where the wedge is wider than a glyph, and
 * the icon must fit the chord at its inner edge. Long labels fall back to shorter forms; a
 * wedge too narrow for text shows its icon alone (the tooltip names it).
 * Radii are in face pixels; `R` is the face radius, `hub` the inner ring's radius.
 */
export function fitWedge(spanDeg: number, kind: string, text: string, R: number, hub: number, glyphH = GLYPH_H, scale = GLYPH): WedgeFit {
  const span = Math.min(spanDeg, 180) * DEG;
  const chord = (r: number) => 2 * r * Math.sin(span / 2);
  const rimIn = R * RIM_IN;
  // Icons: squares 3 px in from the rim band whose inner edge still fits the wedge, biggest first.
  const icons: { size: number; r: number }[] = [];
  for (let sz = Math.round(R * 0.3); sz >= 14; sz -= 2) {
    const rc = rimIn - 3 - sz / 2;
    if (rc - sz / 2 > hub + 4 && chord(rc - sz / 2) >= sz + DIVIDER + 1) icons.push({ size: sz, r: rc });
  }
  const icon = icons[0] ?? null;
  // Text needs the wedge to be as wide as a glyph plus its 1-px outline, clear of the dividers.
  const need = glyphH + 2 + DIVIDER;
  const r0 = Math.max(hub + 4, need / (2 * Math.sin(span / 2)));
  const variants = text ? labelVariants(text) : [];
  const fits = (t: string, r1: number) => r0 + textWidth(t, scale) <= r1;
  // With a label, the icon shrinks (not below 18 px) until the label fits under it.
  const withIcon = (t: string): WedgeFit | null => {
    for (const ic of icons) {
      if (ic.size < 18) break;
      const r1 = ic.r - ic.size / 2 - 2;
      if (fits(t, r1)) return { icon: ic, label: { text: t, r0, r1 } };
    }
    return null;
  };
  const alone = (t: string) => (fits(t, rimIn - 2) ? { icon: null, label: { text: t, r0, r1: rimIn - 2 } } : null);
  for (const t of variants) {
    const f = withIcon(t);
    if (f) return f;
  }
  const numeric = NUMERIC.has(kind);
  if (!numeric && icon) return { icon, label: null };
  for (const t of variants) {
    const f = alone(t);
    if (f) return f;
  }
  return { icon, label: null };
}

export interface WheelLabelFn {
  (seg: Segment): string;
}

interface Playback {
  outer: Float32Array;
  inner: Float32Array | null;
  flapper: Float32Array | null;
  dt: number;
  t: number;
  duration: number;
  ticks: PegTick[];
  tickIdx: number;
  hang: number;
  onTick?: (t: PegTick) => void;
  resolve: () => void;
}

export class WheelView {
  readonly group = new THREE.Group();
  private spinner = new THREE.Group();
  private ringSpinner = new THREE.Group();
  private face: CanvasPanel;
  private ringFace: CanvasPanel;
  private faceMat: PsxMaterial;
  private pegs: THREE.InstancedMesh;
  private bulbs: THREE.InstancedMesh;
  /** Each marquee bulb's position round the frame, 0..1 clockwise from the top. */
  private bulbAngles: number[] = [];
  private flapperPivot = new THREE.Group();
  private highlight: THREE.Mesh;
  private highlightMat: PsxMaterial;
  private layout: Layout | null = null;
  private play: Playback | null = null;
  private tween: { from: number; to: number; t: number; dur: number; ring: boolean; resolve: () => void } | null = null;
  theta = 0;
  alpha = 0;
  psi = 0;
  /** Streak drives bulb chase speed. */
  streak = 1;
  bulbsOn = 1;
  /** A timed bulb show over the chase: win sweep, jackpot strobe, Bankrupt red. */
  private show: { kind: 'win' | 'jackpot' | 'bankrupt'; t: number; life: number } | null = null;
  reducedFlashing = false;
  private chase = 0;
  private colorblind = false;
  private flapJiggle = 0;
  private speedDeg = 0;
  private sun!: CanvasPanel;
  private sunKey = '';
  /**
   * How far gone the show is, 0..1 (the app raises it every Deadline): more ink runs down the
   * dividers, more stains on the print, and the sun's tear.
   */
  decay = 0;
  /** Where the hub sun's eyes look (-1..1, screen-ish), and its mood. */
  sunLook = { x: 0, y: 0.25 };
  sunMood: 'idle' | 'dizzy' | 'gloat' = 'idle';
  private lastTheta = 0;

  constructor(assets: Assets) {
    const g = this.group;
    g.position.set(0, 1.55, -0.6);

    // Static frame: back plate, gold rim, stand, flapper bracket, inner pointer — one mesh.
    const frame = new PropBuilder()
      .cyl(0x2a1a12, WHEEL_R + 0.16, WHEEL_R + 0.16, 0.12, [0, 0, -0.08], [Math.PI / 2, 0, 0], 40)
      .torus(0xd8a830, WHEEL_R + 0.09, 0.045, [0, 0, 0], [0, 0, 0], 40, 5)
      .box(0x3a2216, [0.35, 1.5, 0.3], [0, -1.0, -0.2])
      .box(0xc89830, [0.39, 0.05, 0.34], [0, -0.3, -0.2])
      .box(0xd8a830, [0.12, 0.1, 0.12], [0, WHEEL_R + 0.2, 0.06])
      .cone(0xc0392b, 0.04, 0.09, [0, INNER_R + 0.02, 0.07], [0, 0, Math.PI])
      .build();
    g.add(frame);
    void assets;

    // Outer wheel face.
    this.face = new CanvasPanel(FACE_PX, FACE_PX);
    // Mipmapped so the painted face and its icons don't shimmer while it spins.
    this.face.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.face.texture.generateMipmaps = true;
    this.faceMat = psxMaterial({ map: this.face.texture, wrap: 0.35 });
    const face = new THREE.Mesh(new THREE.CircleGeometry(WHEEL_R, 48), this.faceMat);
    this.spinner.add(face);
    pickable(face, 'wheel');
    // Pegs (instanced).
    this.pegs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 5), psxMaterial({ color: 0xf0c040, emissive: 0x201400 }), 64);
    this.pegs.count = 0;
    this.spinner.add(this.pegs);
    g.add(this.spinner);

    // Landing highlight (a translucent wedge drawn on top of the face).
    this.highlightMat = psxMaterial({ color: 0xffffff, emissive: 0xffffff, lit: false, transparent: true, opacity: 0 });
    this.highlight = new THREE.Mesh(new THREE.BufferGeometry(), this.highlightMat);
    this.highlight.position.z = 0.012;
    this.highlight.visible = false;
    this.spinner.add(this.highlight);

    // Inner ring.
    this.ringFace = new CanvasPanel(128, 128);
    this.ringFace.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.ringFace.texture.generateMipmaps = true;
    const ringMesh = new THREE.Mesh(new THREE.CircleGeometry(INNER_R, 32), psxMaterial({ map: this.ringFace.texture, wrap: 0.35 }));
    ringMesh.position.z = 0.03;
    this.ringSpinner.add(ringMesh);
    pickable(ringMesh, 'ring');
    g.add(this.ringSpinner);
    // Hub: a grinning brass sun that stays upright while the wheel turns under it.
    const sun = new CanvasPanel(96, 96);
    this.sun = sun;
    sun.draw((ctx) => drawSun(ctx, 48, this.sunMood, 0, 0.25, 0));
    sun.texture.minFilter = THREE.LinearMipmapLinearFilter;
    sun.texture.generateMipmaps = true;
    const hub = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), psxMaterial({ map: sun.texture, alphaTest: 0.5, wrap: 0.5 }));
    hub.position.z = 0.085;
    hub.raycast = () => {};
    g.add(hub);
    // Flapper (leather) hangs from the bracket at the top.
    this.flapperPivot.position.set(0, WHEEL_R + 0.15, 0.07);
    // The pointer is a cartoon glove pointing down at the winning wedge (leather strap without art).
    const glove = art.img('ui.handDown');
    if (glove) {
      const gt = new THREE.Texture(glove);
      gt.colorSpace = THREE.NoColorSpace;
      gt.magFilter = THREE.NearestFilter;
      gt.minFilter = THREE.LinearMipmapLinearFilter;
      gt.needsUpdate = true;
      const gh = FLAP_LEN + 0.14;
      const flap = new THREE.Mesh(new THREE.PlaneGeometry(gh * (glove.width / glove.height), gh), psxMaterial({ map: gt, alphaTest: 0.5, wrap: 0.6, side: THREE.DoubleSide }));
      flap.position.set(0, -gh / 2 + 0.06, 0.02);
      flap.raycast = () => {};
      this.flapperPivot.add(flap);
    } else {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.05, FLAP_LEN, 0.015), psxMaterial({ map: assets.texture('tex.leather'), color: 0x8a3020 }));
      flap.position.y = -FLAP_LEN / 2;
      this.flapperPivot.add(flap);
    }
    g.add(this.flapperPivot);

    // Marquee bulbs around the frame.
    const bulbMat = psxMaterial({ lit: false, color: 0xffffff, fog: 0.3 });
    this.bulbAngles = Array.from({ length: BULBS }, (_, i) => i / BULBS);
    const n = BULBS;
    const br = WHEEL_R + 0.13;
    this.bulbs = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.035, 0), bulbMat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = this.bulbAngles[i] * TAU;
      m.makeTranslation(Math.sin(a) * br, Math.cos(a) * br, 0.04);
      this.bulbs.setMatrixAt(i, m);
      this.bulbs.setColorAt(i, new THREE.Color(1, 0.8, 0.3));
    }
    g.add(this.bulbs);
  }

  setColorblind(on: boolean): void {
    this.colorblind = on;
  }

  /** Rebuild the face texture and pegs for a new layout. */
  setLayout(layout: Layout, ring: number[], label: WheelLabelFn): void {
    this.layout = layout;
    const R = this.face.w / 2;
    const rimIn = R * RIM_IN;
    const hub = (INNER_R / WHEEL_R) * R;
    this.face.draw((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.save();
      ctx.translate(R, R);
      // Wedges: printed card colours, darker toward the hub, a sheen at the rim, fine sunburst rays.
      for (const s of layout.segments) {
        const def = WEDGES[s.kind];
        const a0 = (s.start - 90) * DEG,
          a1 = (s.end - 90) * DEG;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, rimIn, a0, a1);
        ctx.closePath();
        ctx.fillStyle = printColor(def.color);
        ctx.fill();
        ctx.clip();
        const gr = ctx.createRadialGradient(0, 0, hub, 0, 0, rimIn);
        gr.addColorStop(0, 'rgba(40,14,4,0.26)');
        gr.addColorStop(0.5, 'rgba(40,14,4,0)');
        gr.addColorStop(0.92, 'rgba(255,244,214,0.14)');
        gr.addColorStop(1, 'rgba(40,14,4,0.25)');
        ctx.fillStyle = gr;
        ctx.fillRect(-R, -R, 2 * R, 2 * R);
        ctx.strokeStyle = lum(def.color) > 0.5 ? 'rgba(60,30,10,0.08)' : 'rgba(255,240,210,0.07)';
        ctx.lineWidth = 1;
        for (let d = s.start + 1.5; d < s.end - 0.5; d += 3) {
          const a = (d - 90) * DEG;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * hub, Math.sin(a) * hub);
          ctx.lineTo(Math.cos(a) * rimIn, Math.sin(a) * rimIn);
          ctx.stroke();
        }
        ctx.restore();
        if (this.colorblind || s.overridden) this.pattern(ctx, def.pattern, a0, a1, rimIn, def.ink, s.overridden);
      }
      // Aged paper over the print.
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, rimIn, 0, TAU);
      ctx.clip();
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(grain(w), -R, -R);
      // Twisted: the print is going off. Stain rings, more of them as the show rots.
      const rnd = seeded(layout.segments.length * 977 + Math.round(this.decay * 8));
      for (let k = 0; k < 2 + Math.round(this.decay * 5); k++) {
        const a = rnd() * TAU,
          rr = hub + 8 + rnd() * (rimIn - hub - 20),
          sr = 5 + rnd() * 9;
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(120,60,30,0.10)';
        ctx.strokeStyle = 'rgba(90,40,20,0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, sr, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      // Gilded wedges: a gold inlay inside the rim (two lines for a double gild).
      for (const s of layout.segments) {
        if (!s.gild) continue;
        const a0 = (s.start - 90) * DEG + 0.02,
          a1 = (s.end - 90) * DEG - 0.02;
        ctx.strokeStyle = '#ffd84a';
        ctx.lineWidth = 3;
        for (let k = 0; k < Math.min(2, s.gild); k++) {
          ctx.beginPath();
          ctx.arc(0, 0, rimIn - 5 - k * 6, a0, a1);
          ctx.stroke();
        }
      }
      // Dividers: an ink line with a gold core, like the owner's painted wheel.
      for (const s of layout.segments) {
        const a = (s.start - 90) * DEG;
        const line = (col: string, lw: number) => {
          ctx.strokeStyle = col;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * hub, Math.sin(a) * hub);
          ctx.lineTo(Math.cos(a) * rimIn, Math.sin(a) * rimIn);
          ctx.stroke();
        };
        line('#2a1206', DIVIDER);
        line('#e8b84a', 1);
      }
      // Rim band: oxblood with gold piping and a cream marquee dot in the middle of each wedge.
      ctx.lineWidth = R - rimIn;
      ctx.strokeStyle = '#4a120c';
      ctx.beginPath();
      ctx.arc(0, 0, (R + rimIn) / 2, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2a0c06';
      ctx.beginPath();
      ctx.arc(0, 0, rimIn, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#d8a838';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, rimIn + 2, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, R - 1.5, 0, TAU);
      ctx.stroke();
      for (const s of layout.segments) {
        if (s.end - s.start < 6 || s.kind === 'bankrupt') continue;
        const a = ((s.start + s.end) / 2 - 90) * DEG;
        const rr = (R + rimIn) / 2;
        ctx.fillStyle = '#fff0c8';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 2.2, 0, TAU);
        ctx.fill();
      }
      // Twisted: ink bleeds from the rim down the dividers (never across a label), and Bankrupt
      // wedges have a faint grin and a staring eye in the rim where the dot should be.
      const drip = seeded(layout.segments.length * 131 + Math.round(this.decay * 8));
      const segs = layout.segments;
      for (let si = 0; si < segs.length; si++) {
        const s = segs[si];
        const prev = segs[(si - 1 + segs.length) % segs.length];
        // Only between wedges wide enough that a label never comes near the divider out here.
        if (drip() > 0.22 + this.decay * 0.45 || s.end - s.start < 14 || prev.end - prev.start < 14) continue;
        const a = (s.start - 90) * DEG;
        const len = 6 + drip() * 10 + this.decay * 18;
        const r0 = rimIn + 1,
          r1 = rimIn - len;
        ctx.strokeStyle = '#2a0c06';
        ctx.fillStyle = '#2a0c06';
        ctx.lineWidth = 1.6 + drip() * 0.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r1, Math.sin(a) * r1, ctx.lineWidth * 0.75, 0, TAU);
        ctx.fill();
      }
      for (const s of layout.segments) {
        if (s.kind !== 'bankrupt') continue;
        const mid = ((s.start + s.end) / 2 - 90) * DEG;
        // The eye in the rim.
        const re = (R + rimIn) / 2;
        const ex = Math.cos(mid) * re,
          ey = Math.sin(mid) * re;
        ctx.fillStyle = '#fff0c8';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 3.2, 2.2, mid + Math.PI / 2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#b01810';
        ctx.beginPath();
        ctx.arc(ex, ey, 1.2, 0, TAU);
        ctx.fill();
        // A faint grin, low in the wedge, where nothing else is drawn.
        const span = (s.end - s.start) * DEG;
        const gr = hub + 14;
        const gw = Math.min(span * gr * 0.42, 9);
        if (gw < 4) continue;
        ctx.save();
        ctx.rotate(mid + Math.PI / 2);
        ctx.translate(0, -gr);
        ctx.strokeStyle = 'rgba(255,240,210,0.3)';
        ctx.fillStyle = 'rgba(255,240,210,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, -gw * 0.6, gw, 0.35, Math.PI - 0.35);
        ctx.stroke();
        for (let t = -2; t <= 2; t++) {
          const tx = t * gw * 0.3;
          ctx.beginPath();
          ctx.moveTo(tx - 1, gw * 0.3);
          ctx.lineTo(tx + 1, gw * 0.3);
          ctx.lineTo(tx, gw * 0.3 + 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(-gw * 0.45, -gw * 0.75, 1, 0, TAU);
        ctx.arc(gw * 0.45, -gw * 0.75, 1, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      // Contents: the drawn icon at the rim and the label along the radius, each only if it fits.
      for (const s of layout.segments) {
        const def = WEDGES[s.kind];
        const mid = ((s.start + s.end) / 2 - 90) * DEG;
        const fit = fitWedge(s.end - s.start, s.kind, label(s), R, hub);
        const img = fit.icon ? art.img(`wedge.${s.kind}`) : null;
        if (fit.icon && img) {
          ctx.save();
          ctx.rotate(mid + Math.PI / 2);
          const sz = fit.icon.size;
          // A soft drop shadow so the icon sits on the card.
          ctx.globalAlpha = 0.35;
          ctx.filter = 'brightness(0)';
          ctx.drawImage(img, -sz / 2 + 1.5, -fit.icon.r - sz / 2 + 1.5, sz, sz);
          ctx.filter = 'none';
          ctx.globalAlpha = 1;
          ctx.drawImage(img, -sz / 2, -fit.icon.r - sz / 2, sz, sz);
          ctx.restore();
        }
        if (fit.label) {
          // Read outward; left-hand wedges are flipped so every label reads upright.
          const flip = Math.cos(mid) < 0;
          const L = textWidth(fit.label.text, GLYPH);
          const rc = (fit.label.r0 + fit.label.r1) / 2;
          ctx.save();
          ctx.rotate(flip ? mid + Math.PI : mid);
          const x = flip ? -rc - L / 2 : rc - L / 2;
          const ink = def.ink;
          outlinedText(ctx, fit.label.text, x, -GLYPH_H / 2, `#${new THREE.Color(ink).getHexString()}`, lum(ink) > 0.5 ? '#1c0a04' : '#fff0d0');
          ctx.restore();
        }
      }
      ctx.restore();
    });
    // Pegs at every segment boundary.
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    layout.pegs.forEach((b, i) => {
      const a = b * DEG;
      m.compose(new THREE.Vector3(Math.sin(a) * PEG_R, Math.cos(a) * PEG_R, 0.04), q, new THREE.Vector3(1, 1, 1));
      this.pegs.setMatrixAt(i, m);
    });
    this.pegs.count = layout.pegs.length;
    this.pegs.instanceMatrix.needsUpdate = true;
    this.setRing(ring);
  }

  setRing(ring: number[]): void {
    const R = this.ringFace.w / 2;
    // The brass sun covers the middle; values sit in the band outside it.
    const sunR = (0.17 / INNER_R) * R;
    this.ringFace.draw((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.save();
      ctx.translate(R, R);
      const n = ring.length;
      const span = (360 / n) * DEG;
      for (let i = 0; i < n; i++) {
        const v = ring[i];
        const a0 = ((i / n) * 360 - 90) * DEG,
          a1 = a0 + span;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, a0, a1);
        ctx.closePath();
        ctx.fillStyle = v === 0 ? '#1c0e08' : v === 1 ? '#efe0bc' : v === 2 ? '#2f7a74' : v === 3 ? '#e2a52e' : '#c2402a';
        ctx.fill();
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.clip();
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(grain(256), -R, -R, 2 * R, 2 * R);
      ctx.restore();
      for (let i = 0; i < n; i++) {
        const a = ((i / n) * 360 - 90) * DEG;
        ctx.strokeStyle = '#2a1206';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        ctx.stroke();
        ctx.strokeStyle = '#e8b84a';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // Scalloped gold edge.
      ctx.fillStyle = '#d8a838';
      const bumps = Math.max(16, n * 3);
      for (let k = 0; k < bumps; k++) {
        const a = (k / bumps) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (R - 3), Math.sin(a) * (R - 3), 3.5, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = '#2a1206';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, R - 7, 0, TAU);
      ctx.stroke();
      // Values: across the segment if the chord allows, else along the radius, else colour only.
      for (let i = 0; i < n; i++) {
        const v = ring[i];
        const t = `×${v}`;
        const L = textWidth(t, GLYPH);
        const mid = (((i + 0.5) / n) * 360 - 90) * DEG;
        const col = v === 0 ? '#ff6a4a' : v === 1 ? '#3a2010' : '#fff4d8';
        const out = v === 1 ? '#fff4d8' : '#1c0a04';
        const band0 = sunR + 2,
          band1 = R - 9;
        const rText = band1 - GLYPH_H / 2 - 2;
        const chordAt = (r: number) => 2 * r * Math.sin(span / 2);
        ctx.save();
        if (chordAt(rText - GLYPH_H / 2) >= L + 4) {
          // Lower half: turned the other way so the value reads upright at rest.
          const low = Math.sin(mid) > 0;
          ctx.rotate(low ? mid - Math.PI / 2 : mid + Math.PI / 2);
          outlinedText(ctx, t, -L / 2, low ? rText - GLYPH_H / 2 : -rText - GLYPH_H / 2, col, out);
        } else {
          const r0 = Math.max(band0, (GLYPH_H + 4) / (2 * Math.sin(span / 2)));
          if (r0 + L <= band1) {
            const flip = Math.cos(mid) < 0;
            ctx.rotate(flip ? mid + Math.PI : mid);
            const rc = (r0 + band1) / 2;
            outlinedText(ctx, t, flip ? -rc - L / 2 : rc - L / 2, -GLYPH_H / 2, col, out);
          }
        }
        ctx.restore();
      }
      ctx.restore();
    });
  }

  private pattern(ctx: CanvasRenderingContext2D, p: string, a0: number, a1: number, R: number, ink: number, overridden: boolean): void {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a0, a1);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = overridden ? 'rgba(255,255,255,0.25)' : `${hexCss(ink)}55`;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1, R / 64);
    const step = Math.max(3, Math.round(R / 8));
    if (p === 'stripes' || p === 'diag' || overridden) {
      for (let k = -R * 2; k < R * 2; k += step) {
        ctx.beginPath();
        ctx.moveTo(k, -R);
        ctx.lineTo(k + (p === 'stripes' ? 0 : R), R);
        ctx.stroke();
      }
    } else if (p === 'dots' || p === 'grid') {
      for (let y = -R; y < R; y += step) for (let x = -R; x < R; x += step) ctx.fillRect(x, y, p === 'dots' ? 4 : step, p === 'dots' ? 4 : 2);
    } else if (p === 'checker') {
      for (let y = -R; y < R; y += step) for (let x = -R; x < R; x += step) if (((x + y) / step) % 2 === 0) ctx.fillRect(x, y, step, step);
    } else if (p === 'rings') {
      for (let r = 20; r < R; r += step * 1.5) {
        ctx.beginPath();
        ctx.arc(0, 0, r, a0, a1);
        ctx.stroke();
      }
    } else if (p === 'zigzag' || p === 'cross') {
      for (let y = -R; y < R; y += step) {
        ctx.beginPath();
        for (let x = -R; x < R; x += step) ctx.lineTo(x, y + ((x / step) % 2 ? step / 2 : 0));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Light up a segment (the landing glow). */
  showHighlight(segIdx: number | null, color = 0xffffff, opacity = 0.35): void {
    if (segIdx === null || !this.layout) {
      this.highlightMat.uniforms.uOpacity.value = 0;
      this.highlight.visible = false;
      return;
    }
    const s = this.layout.segments[segIdx];
    const pts: number[] = [];
    const steps = Math.max(2, Math.ceil((s.end - s.start) / 4));
    for (let i = 0; i < steps; i++) {
      const b0 = (s.start + ((s.end - s.start) * i) / steps) * DEG;
      const b1 = (s.start + ((s.end - s.start) * (i + 1)) / steps) * DEG;
      const r0 = INNER_R + 0.02;
      pts.push(Math.sin(b0) * r0, Math.cos(b0) * r0, 0, Math.sin(b0) * WHEEL_R, Math.cos(b0) * WHEEL_R, 0, Math.sin(b1) * WHEEL_R, Math.cos(b1) * WHEEL_R, 0);
      pts.push(Math.sin(b0) * r0, Math.cos(b0) * r0, 0, Math.sin(b1) * WHEEL_R, Math.cos(b1) * WHEEL_R, 0, Math.sin(b1) * r0, Math.cos(b1) * r0, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pts.length).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pts.length / 3) * 2), 2));
    this.highlight.geometry.dispose();
    this.highlight.geometry = geo;
    this.highlightMat.uniforms.uEmissive.value.setHex(color);
    this.highlightMat.uniforms.uOpacity.value = opacity;
    this.highlight.visible = true;
  }

  /** Replay a recorded spin. Resolves when the wheel has settled (plus a flapper hang beat). */
  playTrace(trace: SpinTrace, opts: { hang?: boolean; onTick?: (t: PegTick) => void } = {}): Promise<void> {
    return new Promise((resolve) => {
      this.play = {
        outer: trace.outer,
        inner: trace.inner,
        flapper: trace.flapper,
        dt: trace.sampleDt,
        t: 0,
        duration: (trace.outer.length - 1) * trace.sampleDt,
        ticks: trace.ticks,
        tickIdx: 0,
        hang: opts.hang ? 0.6 : 0,
        onTick: opts.onTick,
        resolve,
      };
    });
  }

  playRingTrace(trace: Float32Array, dt: number): Promise<void> {
    return new Promise((resolve) => {
      this.play = { outer: new Float32Array([this.theta]), inner: trace, flapper: null, dt, t: 0, duration: (trace.length - 1) * dt, ticks: [], tickIdx: 0, hang: 0, resolve };
    });
  }

  /** Smoothly rotate to an absolute angle (Nudge). */
  rotateTo(theta: number, dur = 0.6): Promise<void> {
    return new Promise((resolve) => {
      let to = theta;
      while (to - this.theta > 180) to -= 360;
      while (to - this.theta < -180) to += 360;
      this.tween = { from: this.theta, to, t: 0, dur, ring: false, resolve };
    });
  }

  get busy(): boolean {
    return !!this.play || !!this.tween;
  }

  /** Seconds of recorded spin left to play (0 when not spinning). */
  get timeLeft(): number {
    return this.play ? Math.max(0, this.play.duration - this.play.t) : 0;
  }

  /** How fast the face is turning, degrees per second (smoothed). */
  get spinSpeed(): number {
    return this.speedDeg;
  }

  /** World position of the pointer's tip, and of the hub. */
  pointerTipWorld(): THREE.Vector3 {
    return new THREE.Vector3(0, WHEEL_R - 0.05, 0.1).applyMatrix4(this.group.matrixWorld);
  }

  centerWorld(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, 0.05).applyMatrix4(this.group.matrixWorld);
  }

  /** Rim point straight up from the hub (for the on-screen radius). */
  rimWorld(): THREE.Vector3 {
    return new THREE.Vector3(0, WHEEL_R, 0.05).applyMatrix4(this.group.matrixWorld);
  }

  /** Instantly finish the current playback (fast-forward). */
  skip(): void {
    if (this.play) this.play.t = this.play.duration + this.play.hang;
    if (this.tween) this.tween.t = this.tween.dur;
  }

  kickFlapper(): void {
    this.flapJiggle = 1;
  }

  update(dt: number, time: number, speed: number): void {
    const p = this.play;
    if (p) {
      p.t += dt * speed;
      const tt = Math.min(p.t, p.duration);
      const f = tt / p.dt;
      const i = Math.min(p.outer.length - 1, Math.floor(f));
      const j = Math.min(p.outer.length - 1, i + 1);
      const u = f - i;
      const lerp = (a: Float32Array | null, fallback: number) => (a && a.length ? a[Math.min(a.length - 1, i)] * (1 - u) + a[Math.min(a.length - 1, j)] * u : fallback);
      if (p.outer.length > 1) this.theta = lerp(p.outer, this.theta);
      if (p.inner) this.alpha = lerp(p.inner, this.alpha);
      this.psi = p.flapper ? lerp(p.flapper, 0) : this.psi * 0.9;
      while (p.tickIdx < p.ticks.length && p.ticks[p.tickIdx].t <= tt) {
        p.onTick?.(p.ticks[p.tickIdx]);
        p.tickIdx++;
      }
      if (p.t >= p.duration) {
        if (p.hang > 0 && p.t < p.duration + p.hang) {
          // Flapper hangs on the peg, trembling, then lets go.
          this.psi = Math.sin(time * 60) * 0.4 + 1.2;
        } else {
          if (p.outer.length > 1) this.theta = p.outer[p.outer.length - 1];
          if (p.inner) this.alpha = p.inner[p.inner.length - 1];
          this.play = null;
          p.resolve();
        }
      }
    }
    const tw = this.tween;
    if (tw) {
      tw.t += dt * speed;
      const k = Math.min(1, tw.t / tw.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.theta = tw.from + (tw.to - tw.from) * e;
      this.psi = Math.sin(k * Math.PI * 6) * 1.5 * (1 - k);
      if (k >= 1) {
        this.tween = null;
        tw.resolve();
      }
    }
    if (!this.play && !this.tween) {
      this.flapJiggle *= Math.pow(0.02, dt);
      this.psi = this.psi * Math.pow(0.001, dt) + Math.sin(time * 30) * this.flapJiggle * 2;
    }
    const mood = this.speedDeg > 260 ? 'dizzy' : this.sunMood;
    const step = Math.floor(time * 12);
    const lx = Math.round(this.sunLook.x * 6) / 6,
      ly = Math.round(this.sunLook.y * 6) / 6;
    const key = mood === 'dizzy' ? `d${step}` : `${mood}${lx},${ly},${Math.round(this.decay * 4)}`;
    if (key !== this.sunKey) {
      this.sunKey = key;
      this.sun.draw((ctx) => drawSun(ctx, 48, mood, lx, ly, this.decay, time));
    }
    if (dt > 0) {
      const v = Math.abs(this.theta - this.lastTheta) / dt;
      this.speedDeg += (v - this.speedDeg) * Math.min(1, dt * 10);
    }
    this.lastTheta = this.theta;
    this.spinner.rotation.z = -this.theta * DEG;
    this.ringSpinner.rotation.z = -this.alpha * DEG;
    this.flapperPivot.rotation.z = this.psi * DEG * (PEG_R / FLAP_LEN);

    // Bulbs chase faster as the Streak climbs.
    const rate = 4 + Math.max(0, this.streak - 1) * 10;
    this.chase += dt * rate;
    const c = new THREE.Color();
    const hot = Math.min(1, (this.streak - 1) / 2);
    const sh = this.show;
    if (sh) {
      sh.t += dt;
      if (sh.t > sh.life) this.show = null;
    }
    for (let i = 0; i < this.bulbAngles.length; i++) {
      const on = (Math.floor(this.chase) + i) % 4 === 0 || (hot > 0.5 && (Math.floor(this.chase) + i) % 4 === 2);
      let b = (on ? 1 : 0.18) * this.bulbsOn;
      if (sh) {
        const f = this.bulbAngles[i];
        if (sh.kind === 'win') {
          // Two bright heads racing round the rim in gold.
          const head = (sh.t * 1.6) % 1;
          const d = Math.min(Math.abs(f - head), Math.abs(f - ((head + 0.5) % 1)));
          b = (d < 0.06 ? 1 : 0.25) * this.bulbsOn;
          c.setRGB(b, b * 0.85, b * 0.3);
        } else if (sh.kind === 'jackpot') {
          // Rainbow strobe (steady rainbow with Reduced Flashing).
          const strobe = this.reducedFlashing ? 1 : Math.floor(sh.t * 12 + i) % 2 ? 1 : 0.3;
          c.setHSL((f + sh.t * 0.8) % 1, 1, 0.5 * strobe * this.bulbsOn);
        } else {
          // Bankrupt: everything red, pulsing down.
          const pulse = this.reducedFlashing ? 0.6 : 0.35 + 0.65 * Math.abs(Math.sin(sh.t * 9));
          b = pulse * this.bulbsOn * (1 - sh.t / sh.life * 0.6);
          c.setRGB(b, b * 0.05, b * 0.03);
        }
      } else c.setRGB(b, b * (0.82 - 0.4 * hot), b * (0.35 - 0.3 * hot));
      this.bulbs.setColorAt(i, c);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }

  lightShow(kind: 'win' | 'jackpot' | 'bankrupt', seconds = 2.2): void {
    this.show = { kind, t: 0, life: seconds };
  }

  /** Wheel-local angle under the pointer. */
  pointerLocal(): number {
    return (((-this.theta % 360) + 360) % 360);
  }
}

/** Deterministic little PRNG so a layout's stains and drips don't jump about between redraws. */
function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The hub: a brass sun with a grin that has slightly too many teeth. Its eyes follow `look`
 * (the player's hand), roll while the wheel spins, and go to slits when it gloats; late in the
 * show, ink runs from one eye.
 */
function drawSun(ctx: CanvasRenderingContext2D, r: number, mood: 'idle' | 'dizzy' | 'gloat', lx: number, ly: number, decay: number, time = 0): void {
  ctx.clearRect(0, 0, 2 * r, 2 * r);
  ctx.save();
  ctx.translate(r, r);
  const rays = 12;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * TAU + (mood === 'dizzy' ? time * 0.6 : 0);
    // Rays aren't quite even: one is bent.
    const tip = i === 7 ? 0.86 : 0.97;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.2) * r * 0.6, Math.sin(a - 0.2) * r * 0.6);
    ctx.lineTo(Math.cos(a + (i === 7 ? 0.12 : 0)) * r * tip, Math.sin(a + (i === 7 ? 0.12 : 0)) * r * tip);
    ctx.lineTo(Math.cos(a + 0.2) * r * 0.6, Math.sin(a + 0.2) * r * 0.6);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? '#e2a52e' : '#f3dfb0';
    ctx.fill();
    ctx.strokeStyle = '#2a1206';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const gr = ctx.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.05, 0, 0, r * 0.62);
  gr.addColorStop(0, '#fff2b0');
  gr.addColorStop(0.45, '#e2b040');
  gr.addColorStop(1, '#9a6418');
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.fillStyle = gr;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#2a1206';
  ctx.stroke();
  // Eyes: whites with pupils that follow, roll (dizzy) or narrow (gloat).
  for (const s of [-1, 1]) {
    const ex = s * r * 0.21,
      ey = -r * 0.13;
    ctx.fillStyle = '#fff8e0';
    ctx.strokeStyle = '#1c0a04';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(ex, ey, r * 0.11, mood === 'gloat' ? r * 0.06 : r * 0.15, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    let px = lx,
      py = ly;
    if (mood === 'dizzy') {
      px = Math.cos(time * 9 * s);
      py = Math.sin(time * 9 * s);
    }
    ctx.fillStyle = mood === 'gloat' ? '#8a1008' : '#1c0a04';
    ctx.beginPath();
    ctx.arc(ex + px * r * 0.05, ey + py * (mood === 'gloat' ? r * 0.01 : r * 0.08), r * 0.055, 0, TAU);
    ctx.fill();
    // Heavy lids when gloating.
    if (mood === 'gloat') {
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.13, ey - r * 0.02 - s * r * 0.03);
      ctx.lineTo(ex + r * 0.13, ey - r * 0.02 + s * r * 0.03);
      ctx.stroke();
    }
  }
  // The grin: wide, with a row of small pointed teeth.
  const wide = mood === 'gloat' ? 0.4 : 0.33;
  ctx.fillStyle = '#1c0a04';
  ctx.beginPath();
  ctx.arc(0, r * 0.06, r * wide, 0.22, Math.PI - 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff4d8';
  const teeth = 9;
  for (let t = 0; t < teeth; t++) {
    const a = 0.32 + ((Math.PI - 0.64) * (t + 0.5)) / teeth;
    const x = Math.cos(a) * r * wide * 0.92;
    const y = r * 0.06 + Math.sin(0.22) * r * wide;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.03, y);
    ctx.lineTo(x + r * 0.03, y);
    ctx.lineTo(x, y + r * 0.07);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.36, r * 0.09, r * 0.04, -0.6, 0, TAU);
  ctx.fill();
  // Late in the show: ink runs from the right eye down the brass.
  if (decay > 0.35) {
    const len = r * (0.15 + decay * 0.3);
    ctx.fillStyle = '#1c0a04';
    ctx.fillRect(r * 0.24, -r * 0.02, r * 0.035, len);
    ctx.beginPath();
    ctx.arc(r * 0.257, -r * 0.02 + len, r * 0.035, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
