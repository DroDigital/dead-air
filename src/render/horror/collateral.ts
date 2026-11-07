/**
 * Payment in kind. Your hand, strapped to the chair's arm (generated: segmented PS1 fingers on
 * hinges), the bolt cutters that take a finger (Poly Haven, CC0, split into two hinged halves
 * here) and the spoon that takes an eye (Poly Haven, CC0).
 *
 * The hand is always there once you sit down: it twitches, strains against the strap when the
 * phone rings, and keeps its bandaged stumps for the rest of the run. With Broadcast Standards on
 * Censored the cutscenes cut to snow before the blade closes.
 */
import * as THREE from 'three';
import type { Assets } from '../../assets/loader';
import { psxMaterial, type PsxMaterial } from '../psxMaterial';
import type { BloodFx } from './blood';

const SKIN = 0xd8a890;
/** Finger order, thumb first. The pinky goes first. */
const FINGERS = [
  { x: 0.05, len: [0.026, 0.02, 0.016], spread: 0.55, thumb: true },
  { x: 0.03, len: [0.03, 0.022, 0.017], spread: 0.08 },
  { x: 0.01, len: [0.033, 0.024, 0.018], spread: 0 },
  { x: -0.011, len: [0.031, 0.022, 0.017], spread: -0.06 },
  { x: -0.03, len: [0.025, 0.018, 0.014], spread: -0.14 },
];
const PINKY = 4;

interface Finger {
  joints: THREE.Group[];
  /** Bandage on the stump (shown once the finger is gone). */
  bandage: THREE.Mesh;
  gone: boolean;
}

/** Split a merged mesh into two halves across its width so the halves can hinge (scissor jaws). */
function splitCutters(model: THREE.Object3D): { root: THREE.Group; a: THREE.Group; b: THREE.Group; jaw: THREE.Vector3 } | null {
  let mesh: THREE.Mesh | null = null;
  model.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
  });
  if (!mesh) return null;
  const m = mesh as THREE.Mesh;
  m.updateWorldMatrix(true, false);
  const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  if (pos.count < 60) return null;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = bb.getSize(new THREE.Vector3());
  const centre = bb.getCenter(new THREE.Vector3());
  // Long axis = length; the next one is the width the two halves separate across.
  const axes = (['x', 'y', 'z'] as const).slice().sort((p, q) => size[q] - size[p]);
  const L = axes[0],
    W = axes[1],
    N = axes[2];
  // The jaw end is the narrower end (the handles splay wider at the grips).
  const spread = (lo: boolean) => {
    let min = Infinity,
      max = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const v = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      const l = v['xyz'.indexOf(L)];
      const t = (l - bb.min[L]) / size[L];
      if (lo ? t > 0.12 : t < 0.88) continue;
      const w = v['xyz'.indexOf(W)];
      min = Math.min(min, w);
      max = Math.max(max, w);
    }
    return max - min;
  };
  const jawAtMin = spread(true) < spread(false);
  const jaw = centre.clone();
  jaw[L] = jawAtMin ? bb.min[L] : bb.max[L];
  const pivot = centre.clone();
  pivot[L] = jawAtMin ? bb.min[L] + size[L] * 0.2 : bb.max[L] - size[L] * 0.2;
  const halves = [[], []] as number[][];
  const arr = pos.array as Float32Array;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  for (let t = 0; t < pos.count; t += 3) {
    let c = 0;
    for (let k = 0; k < 3; k++) c += arr[(t + k) * 3 + 'xyz'.indexOf(W)];
    halves[c / 3 > centre[W] ? 0 : 1].push(t);
  }
  const make = (tris: number[]) => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(tris.length * 9),
      n = new Float32Array(tris.length * 9),
      u = new Float32Array(tris.length * 6);
    tris.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const s = t + k;
        p.set([pos.getX(s) - pivot.x, pos.getY(s) - pivot.y, pos.getZ(s) - pivot.z], (i * 3 + k) * 3);
        if (nrm) n.set([nrm.getX(s), nrm.getY(s), nrm.getZ(s)], (i * 3 + k) * 3);
        if (uv) u.set([uv.getX(s), uv.getY(s)], (i * 3 + k) * 2);
      }
    });
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
    if (!nrm) g.computeVertexNormals();
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(g, m.material as PsxMaterial));
    return grp;
  };
  const root = new THREE.Group();
  const a = make(halves[0]),
    b = make(halves[1]);
  root.add(a, b);
  // Hinge axis = the thin axis; store it on the halves.
  a.userData.axis = N;
  b.userData.axis = N;
  return { root, a, b, jaw: jaw.sub(pivot) };
}

export class CollateralView {
  readonly group = new THREE.Group();
  readonly hand = new THREE.Group();
  private fingers: Finger[] = [];
  private cutters: { root: THREE.Group; a: THREE.Group; b: THREE.Group; jaw: THREE.Vector3 } | null = null;
  private spoon: THREE.Object3D;
  private loose: { mesh: THREE.Object3D; v: THREE.Vector3; spin: THREE.Vector3; rest: number }[] = [];
  private strain = 0;
  private t = 0;
  uncut = true;

  constructor(
    assets: Assets,
    private blood: BloodFx,
  ) {
    const skin = psxMaterial({ color: SKIN, wrap: 0.5 });
    // Palm down on the left arm of the chair, fingers over its front edge.
    this.hand.position.set(-0.62, 0.77, 2.88);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.022, 0.085), skin);
    palm.position.z = 0.02;
    this.hand.add(palm);
    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.12), skin);
    wrist.position.z = 0.12;
    this.hand.add(wrist);
    // The strap and its buckle.
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.035), psxMaterial({ map: assets.texture('tex.leather'), color: 0x4a2418 }));
    strap.position.set(0, 0.0, 0.1);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.045, 0.03), psxMaterial({ color: 0xc89830, emissive: 0x201000 }));
    buckle.position.set(0.05, 0.003, 0.1);
    this.hand.add(strap, buckle);
    // Fingers: three hinged segments each (the thumb comes off the side).
    FINGERS.forEach((f) => {
      const joints: THREE.Group[] = [];
      let parent: THREE.Object3D = this.hand;
      f.len.forEach((len, k) => {
        const j = new THREE.Group();
        if (k === 0) {
          j.position.set(f.x, 0, f.thumb ? 0.01 : -0.022);
          j.rotation.y = f.spread;
        } else j.position.z = -f.len[k - 1];
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.016 - k * 0.0015, 0.016 - k * 0.0015, len), skin);
        seg.position.z = -len / 2;
        j.add(seg);
        if (k === 2) {
          const nail = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.002, 0.009), psxMaterial({ color: 0xe8c8b8 }));
          nail.position.set(0, 0.008, -len + 0.005);
          j.add(nail);
        }
        parent.add(j);
        parent = j;
        joints.push(j);
      });
      const bandage = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 6), psxMaterial({ color: 0xf0ece0 }));
      bandage.rotation.x = Math.PI / 2;
      bandage.position.z = -0.008;
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.006, 5), psxMaterial({ color: 0x8a0a06 }));
      spot.position.set(0, 0.0115, 0);
      spot.rotation.x = -Math.PI / 2;
      bandage.add(spot);
      bandage.visible = false;
      joints[0].add(bandage);
      this.fingers.push({ joints, bandage, gone: false });
    });
    this.group.add(this.hand);

    const raw = assets.fitted('mdl.bolt_cutters', 0.62);
    this.cutters = splitCutters(raw);
    if (this.cutters) {
      this.cutters.root.visible = false;
      this.group.add(this.cutters.root);
    }
    this.spoon = assets.fitted('mdl.spoon', 0.26);
    this.spoon.visible = false;
    this.group.add(this.spoon);
  }

  /** World position of a finger's first knuckle (where the cutters bite). */
  knuckle(i = PINKY): THREE.Vector3 {
    const f = this.fingers[i];
    return f.joints[1].getWorldPosition(new THREE.Vector3());
  }

  /** Restore the state a run left the hand in: fingers already paid. */
  setFingers(lost: number): void {
    this.fingers.forEach((f, i) => {
      const gone = i >= this.fingers.length - lost;
      f.gone = gone;
      f.joints[1].visible = !gone;
      f.bandage.visible = gone;
    });
  }

  /** 0..1: pull against the strap (the phone, the cutters). */
  setStrain(s: number): void {
    this.strain = s;
  }

  private jaws(open: number): void {
    const c = this.cutters;
    if (!c) return;
    const ax = c.a.userData.axis as 'x' | 'y' | 'z';
    c.a.rotation.set(0, 0, 0);
    c.b.rotation.set(0, 0, 0);
    c.a.rotation[ax] = open * 0.32;
    c.b.rotation[ax] = -open * 0.32;
  }

  /** Place the cutters so their jaw sits at `at`, approaching from above and the side. */
  private poseCutters(at: THREE.Vector3, lift: number): void {
    const c = this.cutters;
    if (!c) return;
    c.root.position.copy(at).add(new THREE.Vector3(-0.05 - lift * 0.2, 0.02 + lift * 0.45, 0.02 + lift * 0.1));
    c.root.lookAt(at.clone().add(new THREE.Vector3(0.3, -0.25, -0.6)));
    // Bring the jaw (not the pivot) onto the knuckle.
    const jawWorld = c.jaw.clone().applyQuaternion(c.root.quaternion);
    c.root.position.sub(jawWorld.multiplyScalar(1 - lift * 0.5));
  }

  /**
   * The finger. `shot` frames the camera on the hand; resolves when the bandage is on.
   * `onSnap` fires at the moment the jaws close (sound, shake).
   */
  async takeFinger(o: { onSnap: () => void; snow: (v: number) => void; veil: (v: number) => void }): Promise<void> {
    const idx = [PINKY, 3, 2, 1].find((i) => !this.fingers[i].gone) ?? PINKY;
    const f = this.fingers[idx];
    const at = this.knuckle(idx);
    const c = this.cutters;
    if (c) c.root.visible = true;
    this.strain = 1;
    const anim = (secs: number, fn: (k: number) => void) =>
      new Promise<void>((res) => {
        const t0 = performance.now();
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
          fn(k);
          if (k < 1) requestAnimationFrame(step);
          else res();
        };
        step();
      });
    // Down onto the knuckle, jaws opening.
    await anim(1.2, (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      this.poseCutters(at, 1 - e);
      this.jaws(e);
    });
    await anim(0.5, (k) => this.jaws(1 - k * 0.15 + Math.sin(k * 30) * 0.02));
    if (!this.uncut) o.snow(1);
    // Snap.
    await anim(0.08, (k) => this.jaws(0.85 * (1 - k)));
    o.onSnap();
    f.gone = true;
    // The finger comes off: the distal segments fly loose and tumble onto the floor.
    const piece = f.joints[1];
    const world = piece.getWorldPosition(new THREE.Vector3());
    const q = piece.getWorldQuaternion(new THREE.Quaternion());
    const loose = piece.clone(true);
    loose.position.copy(world);
    loose.quaternion.copy(q);
    piece.visible = false;
    if (this.uncut) {
      this.group.add(loose);
      this.loose.push({ mesh: loose, v: new THREE.Vector3(-0.4, 0.9, -0.3), spin: new THREE.Vector3(9, 4, 6), rest: 0 });
      this.blood.spurt(world, new THREE.Vector3(0.2, 0.8, -0.4), 70, 1.8, 0.9);
      o.veil(0.55);
    }
    await anim(0.9, (k) => {
      this.poseCutters(at, k * 0.3);
      this.jaws(k * 0.4);
    });
    o.snow(0);
    // Away with the cutters; the stump is dressed.
    await anim(0.6, (k) => this.poseCutters(at, 0.3 + k * 1.2));
    if (c) c.root.visible = false;
    f.bandage.visible = true;
    this.strain = 0.3;
  }

  /**
   * The eye: the spoon comes up out of the dark at the camera. The caller fades in the patch.
   */
  async takeEye(camera: THREE.Camera, o: { onContact: () => void; snow: (v: number) => void }): Promise<void> {
    const s = this.spoon;
    s.visible = true;
    await new Promise<void>((res) => {
      const t0 = performance.now();
      const dur = 1.9;
      let touched = false;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
        const e = k * k * (3 - 2 * k);
        // Camera space: from below the frame, up to the left eye, trembling.
        const local = new THREE.Vector3(0.12 - e * 0.17, -0.42 + e * 0.4, -0.75 + e * 0.66);
        local.x += Math.sin(k * 70) * 0.004;
        s.position.copy(camera.localToWorld(local));
        s.quaternion.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.2 + e * 0.6, 0.3, 0.2)));
        if (!this.uncut && k > 0.72) o.snow(1);
        if (k > 0.9 && !touched) {
          touched = true;
          o.onContact();
        }
        if (k < 1) requestAnimationFrame(step);
        else res();
      };
      step();
    });
    s.visible = false;
  }

  update(dt: number): void {
    this.t += dt;
    // Twitching, and pulling at the strap when frightened.
    this.fingers.forEach((f, i) => {
      if (f.gone && i !== 0) {
        f.joints[0].rotation.x = 0.1;
        return;
      }
      const tw = Math.sin(this.t * (7 + i) + i * 2) * (0.04 + this.strain * 0.25) + (Math.random() < dt * 0.4 ? 0.2 : 0);
      const curl = 0.15 + this.strain * (0.5 + Math.sin(this.t * 13 + i) * 0.4);
      f.joints[0].rotation.x = -curl * 0.6 + tw;
      f.joints[1].rotation.x = -curl * 0.5;
      f.joints[2].rotation.x = -curl * 0.4;
    });
    this.hand.rotation.z = Math.sin(this.t * 17) * 0.02 * this.strain;
    this.strain = Math.max(0, this.strain - dt * 0.15);
    // Loose fingers tumble and come to rest on the floor.
    for (const l of this.loose) {
      if (l.rest) continue;
      l.v.y -= 6.5 * dt;
      l.mesh.position.addScaledVector(l.v, dt);
      l.mesh.rotation.x += l.spin.x * dt;
      l.mesh.rotation.y += l.spin.y * dt;
      if (l.mesh.position.y < 0.01) {
        l.mesh.position.y = 0.01;
        l.rest = 1;
      }
    }
  }

  /** A new run: every finger back where it was (the floor is swept). */
  reset(): void {
    for (const l of this.loose) this.group.remove(l.mesh);
    this.loose = [];
    this.setFingers(0);
  }
}
