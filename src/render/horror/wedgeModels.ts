/**
 * Models that live on the horror wedges and turn with the wheel. All generated here (PSX
 * geometry, canvas textures, code-driven animation):
 *
 *   The Mouth     lips over too many teeth; it chews while it waits, gnashes when it eats from
 *                 the Tray, swells with what it holds, and gapes when it brings it back up.
 *   The Eye       a bloodshot eyeball with lids; it follows the camera, blinks, and shuts.
 *   The Cleaver   a cleaver buried in the rim; it wrenches free and chops the wedge beside it.
 *   Stump         a severed chunk with a bone in it, dripping.
 *   Bleeder       a gash that pulses and drips (faster while the Tray bleeds).
 *   Stitches      cross-stitches over a seam; they strain, snap one by one, and tear.
 *
 * Local frame of a wedge prop: +Y points out along the wedge's radius, +Z out of the wheel face.
 */
import * as THREE from 'three';
import type { HorrorEvent } from '../../game/run';
import type { Layout, Segment, WedgeKind } from '../../game/types';
import { psxMaterial, psxTexture } from '../psxMaterial';
import { DEG } from '../scene/util';
import type { BloodFx } from './blood';

const R_PROP = 0.55;
const KINDS = new Set<WedgeKind>(['mouth', 'eye', 'cleaver', 'stump', 'bleeder', 'stitches']);

const mat = (color: number, o: { emissive?: number; lit?: boolean } = {}) => psxMaterial({ color, emissive: o.emissive ?? 0, lit: o.lit, wrap: 0.4 });

/** Eyeball texture: veined white, red iris and pupil at the +Z pole (u = 0.25, v = 0.5). */
function eyeTexture(): THREE.CanvasTexture {
  const W = 64,
    H = 32;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#f4ead4';
  c.fillRect(0, 0, W, H);
  c.strokeStyle = '#b8241c';
  c.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    let x = (i / 14) * W,
      y = Math.random() < 0.5 ? 2 : H - 2;
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (16 - x) * 0.25 + (Math.random() - 0.5) * 6;
      y += (16 - y) * 0.25 + (Math.random() - 0.5) * 4;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  c.fillStyle = '#9a1a12';
  c.beginPath();
  c.arc(16, 16, 6, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#100404';
  c.beginPath();
  c.arc(16, 16, 3, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#fff';
  c.fillRect(14, 13, 2, 2);
  return psxTexture(new THREE.CanvasTexture(cv), false);
}
let EYE_TEX: THREE.CanvasTexture | null = null;

interface Prop {
  uid: number;
  kind: WedgeKind;
  /** Mid-angle of its segment (deg, wheel-local, clockwise from the top). */
  angle: number;
  group: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  t: number;
  /** Event timers. */
  fx: Record<string, number>;
  dying: number;
  size: number;
}

export class WedgeModels {
  readonly group = new THREE.Group();
  private props = new Map<number, Prop>();
  private dying: Prop[] = [];
  private uncut = true;
  private bleeding = false;
  private bellies: Record<number, number> = {};
  private wear: Record<number, number> = {};
  private camWorld = new THREE.Vector3();

  constructor(private blood: BloodFx) {}

  private place(p: Prop): void {
    const a = p.angle * DEG;
    const r = p.kind === 'stitches' ? 0 : p.kind === 'cleaver' ? WHEEL_RIM : R_PROP;
    p.group.position.set(Math.sin(a) * r, Math.cos(a) * r, 0.02);
    p.group.rotation.set(0, 0, -a);
  }

  private build(seg: Segment): Prop {
    const g = new THREE.Group();
    const parts: Record<string, THREE.Object3D> = {};
    const red = this.uncut ? 0x9a1410 : 0x2a2420;
    const flesh = this.uncut ? 0xd08878 : 0x8a8078;
    switch (seg.kind) {
      case 'mouth': {
        const maw = new THREE.Mesh(new THREE.CircleGeometry(0.042, 10), mat(0x1a0202));
        maw.scale.y = 0.7;
        g.add(maw);
        const upper = new THREE.Group();
        const lower = new THREE.Group();
        const lipU = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.013, 4, 10, Math.PI), mat(0xa01820));
        const lipL = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.013, 4, 10, Math.PI), mat(0xa01820));
        lipL.rotation.z = Math.PI;
        upper.add(lipU);
        lower.add(lipL);
        const tooth = new THREE.ConeGeometry(0.006, 0.02, 3);
        const toothMat = mat(0xf0e4c0);
        for (let i = 0; i < 7; i++) {
          const a = (i / 6) * Math.PI * 0.8 + Math.PI * 0.1;
          const t = new THREE.Mesh(tooth, toothMat);
          t.position.set(Math.cos(a) * 0.036, Math.sin(a) * 0.02, 0.006);
          t.rotation.z = Math.PI;
          upper.add(t);
          const b = new THREE.Mesh(tooth, toothMat);
          b.position.set(Math.cos(a) * 0.034, -Math.sin(a) * 0.02, 0.006);
          lower.add(b);
        }
        const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), mat(0xd0566a));
        tongue.scale.set(1, 0.5, 0.4);
        tongue.position.set(0.006, -0.018, 0.004);
        lower.add(tongue);
        g.add(upper, lower);
        g.scale.y = 1;
        parts.upper = upper;
        parts.lower = lower;
        break;
      }
      case 'eye': {
        EYE_TEX ??= eyeTexture();
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), psxMaterial({ map: EYE_TEX, wrap: 0.5 }));
        const lidMat = mat(flesh);
        const lidU = new THREE.Mesh(new THREE.SphereGeometry(0.054, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
        const lidL = new THREE.Mesh(new THREE.SphereGeometry(0.054, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidMat);
        const socket = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.01, 4, 12), mat(this.uncut ? 0x5a1010 : 0x302824));
        socket.position.z = -0.01;
        g.add(socket, ball, lidU, lidL);
        g.position.z = 0.03;
        parts.ball = ball;
        parts.lidU = lidU;
        parts.lidL = lidL;
        break;
      }
      case 'cleaver': {
        // Buried edge-first in the rim, the handle angled out toward the camera.
        const holder = new THREE.Group();
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.006), mat(0xb8bcc0, { emissive: 0x101214 }));
        blade.position.set(0, 0.0, 0.035);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.0065), mat(red));
        edge.position.set(0, -0.03, 0.035);
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.008, 6), mat(0x202020));
        hole.position.set(0.04, 0.022, 0.0385);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.07, 6), mat(0x6a3418));
        handle.rotation.z = Math.PI / 2;
        handle.position.set(-0.085, 0.01, 0.035);
        holder.add(blade, edge, hole, handle);
        holder.rotation.x = -Math.PI / 2 + 0.35; // stand the blade up out of the face
        g.add(holder);
        parts.holder = holder;
        break;
      }
      case 'stump': {
        const geo = new THREE.IcosahedronGeometry(0.04, 0);
        const pos = geo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.8 + Math.random() * 0.5), pos.getY(i) * (0.8 + Math.random() * 0.5), pos.getZ(i) * 0.6);
        geo.computeVertexNormals();
        const chunk = new THREE.Mesh(geo, mat(red));
        const fat = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 3, 8), mat(this.uncut ? 0xe8c8a0 : 0x9a9088));
        fat.position.z = 0.015;
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.05, 6), mat(0xf0e8d0));
        bone.rotation.x = Math.PI / 2;
        bone.position.z = 0.02;
        g.add(chunk, fat, bone);
        parts.chunk = chunk;
        break;
      }
      case 'bleeder': {
        const gash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 4), mat(this.uncut ? 0x3a0202 : 0x100a08));
        gash.scale.set(1, 0.18, 0.15);
        gash.rotation.z = 0.5;
        const lipA = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 3, 10, Math.PI), mat(flesh));
        lipA.scale.set(1, 0.25, 1);
        lipA.rotation.z = 0.5;
        const lipB = lipA.clone();
        lipB.rotation.z = 0.5 + Math.PI;
        g.add(gash, lipA, lipB);
        parts.gash = gash;
        break;
      }
      case 'stitches': {
        // Spans the wedge along its radius: a seam with cross-stitches over it.
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.52, 0.004), mat(red));
        seam.position.set(0, 0.74, 0.004);
        g.add(seam);
        const threadMat = mat(0x0c0806);
        for (let i = 0; i < 5; i++) {
          const x = new THREE.Group();
          for (const s of [-1, 1]) {
            const th = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.06, 0.006), threadMat);
            th.rotation.z = s * 0.7;
            x.add(th);
          }
          x.position.set(0, 0.52 + i * 0.1, 0.01);
          x.userData.v = new THREE.Vector3();
          g.add(x);
          parts[`x${i}`] = x;
        }
        break;
      }
    }
    return { uid: seg.uid, kind: seg.kind, angle: (seg.start + seg.end) / 2, group: g, parts, t: Math.random() * 10, fx: {}, dying: 0, size: 1 };
  }

  /** Rebuild after a layout change: new props appear, removed ones play out their end. */
  sync(layout: Layout, marks: Record<string, number>, uncut: boolean): void {
    if (uncut !== this.uncut) {
      this.uncut = uncut;
      for (const p of this.props.values()) this.group.remove(p.group);
      this.props.clear();
    }
    this.bleeding = !!marks.bleeding;
    this.bellies = {};
    this.wear = {};
    for (const [k, v] of Object.entries(marks)) {
      if (k.startsWith('belly:')) this.bellies[Number(k.slice(6))] = v;
      if (k.startsWith('stitch:')) this.wear[Number(k.slice(7))] = v;
    }
    const seen = new Set<number>();
    for (const seg of layout.segments) {
      if (!KINDS.has(seg.kind) || seg.overridden) continue;
      seen.add(seg.uid);
      let p = this.props.get(seg.uid);
      if (p && p.kind !== seg.kind) {
        this.retire(p);
        p = undefined;
      }
      if (!p) {
        p = this.build(seg);
        this.props.set(seg.uid, p);
        this.group.add(p.group);
      }
      p.angle = (seg.start + seg.end) / 2;
      this.place(p);
    }
    for (const [uid, p] of this.props) if (!seen.has(uid)) this.retire(p);
  }

  private retire(p: Prop): void {
    this.props.delete(p.uid);
    p.dying = 1;
    this.dying.push(p);
    if (p.kind === 'stitches') {
      // The threads burst off the seam.
      for (const k of Object.keys(p.parts)) if (k.startsWith('x')) p.parts[k].userData.v.set((Math.random() - 0.5) * 1.5, Math.random() * 1.2, 0.8 + Math.random());
      const w = this.worldOf(p);
      if (w) this.blood.spurt(w.add(new THREE.Vector3(0, 0, 0.05)), new THREE.Vector3(0, 0.3, 1), 30, 1.6);
    }
  }

  /** World position of a prop (where coins or blood come from). */
  worldPos(uid: number): THREE.Vector3 | null {
    const p = this.props.get(uid);
    return p ? this.worldOf(p) : null;
  }

  private worldOf(p: Prop): THREE.Vector3 | null {
    p.group.updateWorldMatrix(true, false);
    const local = p.kind === 'stitches' ? new THREE.Vector3(0, 0.74, 0) : new THREE.Vector3();
    return local.applyMatrix4(p.group.matrixWorld);
  }

  /** Act out a horror beat (called when the spin's result is presented). */
  event(e: HorrorEvent): void {
    switch (e.type) {
      case 'mouthEat': {
        const p = this.props.get(e.uid);
        if (p) p.fx.chomp = 1.1;
        break;
      }
      case 'mouthVomit': {
        const p = this.props.get(e.uid) ?? this.dying.find((d) => d.uid === e.uid);
        if (p) p.fx.gape = 1.6;
        break;
      }
      case 'eyeOpen': {
        const p = this.props.get(e.uid);
        if (p) p.fx.wide = 1.5;
        break;
      }
      case 'eyeShut':
        break;
      case 'stitchStrain': {
        const p = this.props.get(e.uid);
        if (p) p.fx.strain = 1;
        break;
      }
      case 'cleave': {
        const p = this.props.get(e.uid);
        const target = this.props.get(e.target);
        if (p) {
          p.fx.chop = 1;
          p.fx.chopTo = target ? target.angle : p.angle + 15;
        }
        break;
      }
      default:
        break;
    }
  }

  update(dt: number, time: number, camera: THREE.Camera): void {
    camera.getWorldPosition(this.camWorld);
    for (const p of this.props.values()) this.animate(p, dt, time);
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const p = this.dying[i];
      p.dying -= dt;
      this.animate(p, dt, time);
      if (p.kind === 'eye') {
        // The lids close for good and it sinks into the face.
        (p.parts.lidU as THREE.Mesh).rotation.x = 0;
        (p.parts.lidL as THREE.Mesh).rotation.x = 0;
      }
      if (p.kind === 'stitches') {
        for (const k of Object.keys(p.parts)) {
          if (!k.startsWith('x')) continue;
          const o = p.parts[k];
          const v = o.userData.v as THREE.Vector3;
          v.y -= 3 * dt;
          o.position.addScaledVector(v, dt * 0.3);
          o.rotation.z += dt * 8;
        }
      }
      p.group.scale.setScalar(Math.max(0.001, p.kind === 'stitches' ? 1 : Math.min(1, p.dying * 1.5)));
      if (p.dying <= 0) {
        this.group.remove(p.group);
        this.dying.splice(i, 1);
      }
    }
  }

  private animate(p: Prop, dt: number, time: number): void {
    p.t += dt;
    for (const k of Object.keys(p.fx)) if (k !== 'chopTo') p.fx[k] = Math.max(0, p.fx[k] - dt);
    switch (p.kind) {
      case 'mouth': {
        const belly = this.bellies[p.uid] ?? 0;
        const want = 1 + Math.min(0.7, belly / 500);
        p.size += (want - p.size) * Math.min(1, dt * 2);
        let open = 0.25 + 0.25 * Math.sin(p.t * 2.1) * Math.sin(p.t * 0.7);
        if (p.fx.chomp) open = Math.abs(Math.sin(p.fx.chomp * 18)) * 0.9;
        if (p.fx.gape) open = 1.4;
        p.parts.upper.position.y = open * 0.012;
        p.parts.lower.position.y = -open * 0.018;
        const swell = p.fx.chomp ? 1 + Math.sin(p.fx.chomp * 9) * 0.08 : 1;
        p.group.scale.setScalar(p.size * swell);
        break;
      }
      case 'eye': {
        // Track the camera; blink now and then; wide open when it is landed.
        p.parts.ball.lookAt(this.camWorld);
        const cycle = (p.t + p.uid * 1.7) % 5;
        const blink = cycle < 0.18 ? Math.sin((cycle / 0.18) * Math.PI) : 0;
        const openU = p.fx.wide ? -1.5 : -1.05,
          openL = p.fx.wide ? 1.5 : 1.15;
        (p.parts.lidU as THREE.Mesh).rotation.x = openU * (1 - blink);
        (p.parts.lidL as THREE.Mesh).rotation.x = openL * (1 - blink);
        break;
      }
      case 'cleaver': {
        const h = p.parts.holder;
        if (p.fx.chop) {
          // Wrench out, swing over to the neighbour, slam down, come back.
          const k = 1 - p.fx.chop;
          const to = p.fx.chopTo ?? p.angle;
          const swing = k < 0.35 ? 0 : k < 0.55 ? (k - 0.35) / 0.2 : k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
          const lift = k < 0.35 ? k / 0.35 : k < 0.55 ? 1 : k < 0.62 ? 1 - (k - 0.55) / 0.07 : k < 0.8 ? 0 : Math.sin(((k - 0.8) / 0.2) * Math.PI);
          const ang = p.angle + (to - p.angle) * swing;
          const a = ang * DEG;
          p.group.position.set(Math.sin(a) * WHEEL_RIM, Math.cos(a) * WHEEL_RIM, 0.02 + lift * 0.18);
          p.group.rotation.z = -a;
          h.rotation.y = lift * 0.9;
          if (k > 0.6 && k < 0.63 && !p.fx.splashed) {
            p.fx.splashed = 1;
            const w = this.worldOf(p);
            if (w) this.blood.spurt(w, new THREE.Vector3(0, 0.6, 1), 50, 2.4);
          }
          if (p.fx.chop <= 0.01) {
            p.fx.splashed = 0;
            this.place(p);
          }
        } else h.rotation.y = Math.sin(time * 3 + p.uid) * 0.03;
        break;
      }
      case 'stump': {
        p.parts.chunk.scale.setScalar(1 + Math.sin(time * 2.4 + p.uid) * 0.05);
        if (Math.random() < dt * 0.9) {
          const w = this.worldOf(p);
          if (w) this.blood.drip(w);
        }
        break;
      }
      case 'bleeder': {
        const beat = Math.pow(Math.max(0, Math.sin(time * (this.bleeding ? 6 : 3))), 6);
        p.parts.gash.scale.set(1, 0.18 + beat * 0.12, 0.15);
        if (Math.random() < dt * (this.bleeding ? 5 : 0.8)) {
          const w = this.worldOf(p);
          if (w) this.blood.drip(w);
        }
        break;
      }
      case 'stitches': {
        const wear = this.wear[p.uid] ?? 0;
        for (let i = 0; i < 5; i++) {
          const x = p.parts[`x${i}`];
          if (!x || p.dying) continue;
          // Snapped stitches hang loose; the rest tremble harder as it wears.
          const snapped = i < wear * 2;
          x.visible = !snapped;
          const tremble = (0.004 + wear * 0.004 + (p.fx.strain ?? 0) * 0.02) * Math.sin(time * 40 + i * 2);
          x.position.x = tremble;
        }
        break;
      }
    }
  }
}

/** Radius where the Cleaver bites into the rim band. */
const WHEEL_RIM = 1.06;
