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
import { psxMaterial, type PsxMaterial } from '../psxMaterial';
import { CanvasPanel, DEG, TAU, hexCss, pickable } from './util';
import { PropBuilder } from './props';

export const WHEEL_R = 1.25;
const INNER_R = 0.42;
const PEG_R = WHEEL_R - 0.05;
const FLAP_LEN = 0.2;
const BULBS = 40;
/** Narrowest wedge (degrees) that still gets a label on the wheel face. */
const LABEL_MIN_DEG = 12;

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
  private chase = 0;
  private colorblind = false;
  private flapJiggle = 0;

  constructor(assets: Assets) {
    const g = this.group;
    g.position.set(0, 1.55, -0.6);

    // Back plate / frame (static).
    // Static frame: back plate, gold rim, stand, hub, flapper bracket, inner pointer — one mesh.
    const frame = new PropBuilder()
      .cyl(0x8a8a92, WHEEL_R + 0.16, WHEEL_R + 0.16, 0.12, [0, 0, -0.08], [Math.PI / 2, 0, 0], 40)
      .torus(0xd8a830, WHEEL_R + 0.09, 0.045, [0, 0, 0], [0, 0, 0], 40, 5)
      .box(0x4a4448, [0.35, 1.5, 0.3], [0, -1.0, -0.2])
      .cyl(0xd8a830, 0.11, 0.13, 0.08, [0, 0, 0.07], [Math.PI / 2, 0, 0], 10)
      .box(0xd8a830, [0.12, 0.1, 0.12], [0, WHEEL_R + 0.2, 0.06])
      .cone(0xe03020, 0.04, 0.09, [0, INNER_R + 0.02, 0.07], [0, 0, Math.PI])
      .build();
    g.add(frame);
    void assets;

    // Outer wheel face.
    this.face = new CanvasPanel(128, 128);
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
    this.ringFace = new CanvasPanel(64, 64);
    const ringMesh = new THREE.Mesh(new THREE.CircleGeometry(INNER_R, 32), psxMaterial({ map: this.ringFace.texture, wrap: 0.35 }));
    ringMesh.position.z = 0.03;
    this.ringSpinner.add(ringMesh);
    pickable(ringMesh, 'ring');
    g.add(this.ringSpinner);
    // Flapper (leather) hangs from the bracket at the top.
    this.flapperPivot.position.set(0, WHEEL_R + 0.15, 0.07);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.05, FLAP_LEN, 0.015), psxMaterial({ map: assets.texture('tex.leather'), color: 0x8a3020 }));
    flap.position.y = -FLAP_LEN / 2;
    this.flapperPivot.add(flap);
    g.add(this.flapperPivot);

    // Marquee bulbs around the frame.
    const bulbMat = psxMaterial({ lit: false, color: 0xffffff, fog: 0.3 });
    this.bulbs = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.035, 0), bulbMat, BULBS);
    const m = new THREE.Matrix4();
    for (let i = 0; i < BULBS; i++) {
      const a = (i / BULBS) * TAU;
      m.makeTranslation(Math.sin(a) * (WHEEL_R + 0.13), Math.cos(a) * (WHEEL_R + 0.13), 0.04);
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
    const lw = Math.max(1, R / 64);
    this.face.draw((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(R, R);
      for (const s of layout.segments) {
        const def = WEDGES[s.kind];
        const a0 = (s.start - 90) * DEG,
          a1 = (s.end - 90) * DEG;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, a0, a1);
        ctx.closePath();
        ctx.fillStyle = hexCss(def.color);
        ctx.fill();
        if (this.colorblind || s.overridden) this.pattern(ctx, def.pattern, a0, a1, R, def.ink, s.overridden);
        if (s.gild > 0) {
          ctx.strokeStyle = '#ffd84a';
          ctx.lineWidth = lw * 2;
          ctx.beginPath();
          ctx.arc(0, 0, R - lw * 3, a0 + 0.02, a1 - 0.02);
          ctx.stroke();
        }
      }
      // Dividers.
      ctx.strokeStyle = '#e8c050';
      ctx.lineWidth = lw;
      for (const s of layout.segments) {
        const a = (s.start - 90) * DEG;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * INNER_R * (R / WHEEL_R), Math.sin(a) * INNER_R * (R / WHEEL_R));
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        ctx.stroke();
      }
      // Labels, radial, reading outward.
      for (const s of layout.segments) {
        const def = WEDGES[s.kind];
        const mid = ((s.start + s.end) / 2 - 90) * DEG;
        const txt = label(s);
        // Too narrow to carry a label: the tooltip names it.
        if (s.end - s.start < LABEL_MIN_DEG) continue;
        // Labels use the native 5×7 font. Left-hand wedges are flipped so every label reads upright.
        const flip = Math.cos(mid) < 0;
        ctx.save();
        ctx.rotate(flip ? mid + Math.PI : mid);
        let shown = txt;
        while (textWidth(shown) > R * 0.6 && shown.length > 1) shown = shown.slice(0, -1);
        const x = flip ? -R * 0.9 : R * 0.3;
        drawText(ctx, shown, x, -3.5, { color: hexCss(def.ink), shadow: '#000' });
        ctx.restore();
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
    this.ringFace.draw((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(R, R);
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const v = ring[i];
        const a0 = ((i / n) * 360 - 90) * DEG,
          a1 = (((i + 1) / n) * 360 - 90) * DEG;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, a0, a1);
        ctx.closePath();
        ctx.fillStyle = v === 0 ? '#111' : v === 1 ? '#3a3a48' : v === 2 ? '#2c6a8a' : v === 3 ? '#c09020' : '#c02030';
        ctx.fill();
        ctx.strokeStyle = '#e8c050';
        ctx.lineWidth = 1;
        ctx.stroke();
        const mid = (a0 + a1) / 2;
        ctx.save();
        ctx.rotate(mid + Math.PI / 2);
        drawText(ctx, `×${v}`, 0, -R * 0.78, { scale: 1, align: 'center', color: v === 0 ? '#c03030' : '#fff4c0', shadow: '#000' });
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

  /** Light up a segment (landing glow / Glass Eye preview). */
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
    this.spinner.rotation.z = -this.theta * DEG;
    this.ringSpinner.rotation.z = -this.alpha * DEG;
    this.flapperPivot.rotation.z = this.psi * DEG * (PEG_R / FLAP_LEN);

    // Bulbs chase faster as the Streak climbs.
    const rate = 4 + Math.max(0, this.streak - 1) * 10;
    this.chase += dt * rate;
    const c = new THREE.Color();
    const hot = Math.min(1, (this.streak - 1) / 2);
    for (let i = 0; i < BULBS; i++) {
      const on = (Math.floor(this.chase) + i) % 4 === 0 || (hot > 0.5 && (Math.floor(this.chase) + i) % 4 === 2);
      const b = (on ? 1 : 0.18) * this.bulbsOn;
      c.setRGB(b, b * (0.82 - 0.4 * hot), b * (0.35 - 0.3 * hot));
      this.bulbs.setColorAt(i, c);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }

  /** Wheel-local angle under the pointer. */
  pointerLocal(): number {
    return (((-this.theta % 360) + 360) % 360);
  }
}
