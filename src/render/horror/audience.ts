/**
 * The studio audience: one dead contestant in the raked seats for every broadcast you lost.
 *
 * The figures are the CC0 KayKit skeletons (rigged, with their seated clips), split at load into
 * upper/lower-body clips so they can clap from their seats. They sit and sway; their heads turn
 * to the wheel on a slow-motion finish; they clap on a Bankrupt and all stand on DEAD AIR. The
 * newest dead are freshest (still bloody, with Broadcast Standards on Uncut); the oldest are
 * dusty bone. When the studio goes silent too long, one of them gets up and comes closer.
 */
import * as THREE from 'three';
import type { Assets, SkinnedAsset } from '../../assets/loader';
import type { PsxMaterial } from '../psxMaterial';

const UPPER = /^(spine|chest|head|upperarm|lowerarm|wrist|hand|handslot|elbowIK|handIK)/;
const MAX_SEATED = 12;
/** Standing height of a figure (metres). */
const HEIGHT = 1.15;
/** The visitor's marks, one step closer to the chair for every breach of the silence. */
const VISITOR_MARKS: [number, number, number][] = [
  [-2.2, 0, 0.3],
  [-1.75, 0, 1.25],
  [-1.25, 0, 1.95],
  [-0.92, 0, 2.45],
];
/** Clothes of past runs: faded studio colours. */
const CLOTH = [0x5a2a6a, 0x2a4a6a, 0x6a4a1a, 0x3a5a3a, 0x6a1a1a, 0x4a4a4a, 0x7a5a2a, 0x2a3a5a];

interface Clips {
  sitLower: THREE.AnimationClip;
  sitUpper: THREE.AnimationClip;
  cheerUpper: THREE.AnimationClip;
  standUp: THREE.AnimationClip;
  idle: THREE.AnimationClip;
  sitDown: THREE.AnimationClip;
}

function filtered(clip: THREE.AnimationClip, upper: boolean, name: string): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => UPPER.test(t.name.split('.')[0]) === upper);
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

function prepareClips(all: THREE.AnimationClip[]): Clips | null {
  const get = (n: string) => all.find((c) => c.name === n);
  const sit = get('Sit_Chair_Idle'),
    cheer = get('Cheer'),
    up = get('Sit_Chair_StandUp'),
    idle = get('Idle'),
    down = get('Sit_Chair_Down');
  if (!sit || !cheer || !up || !idle || !down) return null;
  return {
    sitLower: filtered(sit, false, 'sitLower'),
    sitUpper: filtered(sit, true, 'sitUpper'),
    cheerUpper: filtered(cheer, true, 'cheerUpper'),
    standUp: up,
    idle,
    sitDown: down,
  };
}

class Figure {
  readonly root = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  private head: THREE.Object3D | null = null;
  private a: Record<'sitLower' | 'sitUpper' | 'cheerUpper' | 'standUp' | 'idle' | 'sitDown', THREE.AnimationAction>;
  standing = false;
  private clapT = 0;
  /** Extra look (yaw, pitch) toward the current target, eased. */
  private look = new THREE.Vector2();

  constructor(
    rig: SkinnedAsset,
    clips: Clips,
    private freshness: number,
    cloth: number,
    uncut: boolean,
  ) {
    const body = rig.root;
    // Fit to the standing height, feet on the origin.
    const box = new THREE.Box3().setFromObject(body);
    const k = HEIGHT / Math.max(0.01, box.max.y - box.min.y);
    body.scale.setScalar(k);
    body.position.y = -box.min.y * k;
    this.root.add(body);
    body.traverse((o) => {
      if (o.name === 'head' && !this.head) this.head = o;
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as PsxMaterial;
      if (/Cloak|Hood|Cape/i.test(o.name)) mat.uniforms.uColor.value.setHex(cloth);
      else this.tint(mat, uncut);
    });
    this.mixer = new THREE.AnimationMixer(body);
    const act = (c: THREE.AnimationClip) => this.mixer.clipAction(c);
    this.a = {
      sitLower: act(clips.sitLower),
      sitUpper: act(clips.sitUpper),
      cheerUpper: act(clips.cheerUpper),
      standUp: act(clips.standUp),
      idle: act(clips.idle),
      sitDown: act(clips.sitDown),
    };
    for (const k2 of ['standUp', 'sitDown'] as const) {
      this.a[k2].setLoop(THREE.LoopOnce, 1);
      this.a[k2].clampWhenFinished = true;
    }
    // Barely alive: slow, out of step with each other.
    const rate = 0.45 + Math.random() * 0.35;
    for (const k2 of ['sitLower', 'sitUpper'] as const) {
      this.a[k2].timeScale = rate;
      this.a[k2].time = Math.random() * clips.sitLower.duration;
      this.a[k2].play();
    }
  }

  /** Fresh dead are pink and bloody (Uncut), the old ones bleached, the oldest dusty. */
  tint(mat: PsxMaterial, uncut: boolean): void {
    const f = this.freshness;
    const c = new THREE.Color(0xc8bea8).lerp(new THREE.Color(0x6a6050), Math.max(0, 0.6 - f));
    if (uncut && f > 0.55) c.lerp(new THREE.Color(0xb0383a), (f - 0.55) * 1.3);
    mat.uniforms.uColor.value.copy(c);
  }

  setUncut(uncut: boolean): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !/Cloak|Hood|Cape/i.test(o.name)) this.tint(m.material as PsxMaterial, uncut);
    });
  }

  clap(seconds: number): void {
    if (this.standing) return;
    this.clapT = seconds;
    this.a.cheerUpper.reset().setEffectiveTimeScale(0.8 + Math.random() * 0.4).play();
    this.a.cheerUpper.crossFadeFrom(this.a.sitUpper, 0.25, false);
  }

  stand(): void {
    if (this.standing) return;
    this.standing = true;
    const up = this.a.standUp.reset().play();
    for (const k of ['sitLower', 'sitUpper', 'cheerUpper'] as const) this.a[k].fadeOut(0.3);
    up.fadeIn(0.3);
    setTimeout(() => {
      if (!this.standing) return;
      this.a.idle.reset().setEffectiveTimeScale(0.6).fadeIn(0.4).play();
      up.fadeOut(0.4);
    }, (this.a.standUp.getClip().duration - 0.3) * 1000);
  }

  sit(): void {
    if (!this.standing) return;
    this.standing = false;
    const down = this.a.sitDown.reset().fadeIn(0.3).play();
    this.a.idle.fadeOut(0.3);
    setTimeout(() => {
      if (this.standing) return;
      for (const k of ['sitLower', 'sitUpper'] as const) this.a[k].reset().fadeIn(0.4).play();
      down.fadeOut(0.4);
    }, (this.a.sitDown.getClip().duration - 0.3) * 1000);
  }

  update(dt: number, target: THREE.Vector3 | null, weight: number): void {
    if (this.clapT > 0) {
      this.clapT -= dt;
      if (this.clapT <= 0) {
        this.a.sitUpper.reset().play();
        this.a.sitUpper.crossFadeFrom(this.a.cheerUpper, 0.4, false);
      }
    }
    this.mixer.update(dt);
    if (!this.head) return;
    // Turn the head toward the target, on top of whatever the clip did.
    let yaw = 0,
      pitch = 0;
    if (target && weight > 0) {
      const hp = this.head.getWorldPosition(new THREE.Vector3());
      const d = target.clone().sub(hp).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()).invert());
      yaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -1.3, 1.3) * weight;
      pitch = THREE.MathUtils.clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.6, 0.6) * weight;
    }
    const e = Math.min(1, dt * 4);
    this.look.x += (yaw - this.look.x) * e;
    this.look.y += (pitch - this.look.y) * e;
    this.head.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.look.y, this.look.x, 0)));
  }
}

export class AudienceView {
  readonly group = new THREE.Group();
  private figures: Figure[] = [];
  private visitor: Figure | null = null;
  private clips: Clips | null = null;
  private rigIds: string[] = [];
  private count = -1;
  private uncut = true;
  /** Where heads turn (world), and how hard (0..1). */
  watchTarget: THREE.Vector3 | null = null;
  watchWeight = 0.15;
  /** The visitor stares at the player. */
  readonly camera = new THREE.Vector3(0, 1.3, 3.05);

  constructor(private assets: Assets) {
    for (const id of ['mdl.skeleton_minion', 'mdl.skeleton_rogue']) {
      const r = assets.skinned(id);
      if (!r) continue;
      this.rigIds.push(id);
      this.clips ??= prepareClips(r.clips);
    }
  }

  get available(): boolean {
    return !!this.clips && this.rigIds.length > 0;
  }

  /** Seats along both raked banks: 3 rows rising toward the wall, 4 columns along the room. */
  private seat(i: number): { pos: THREE.Vector3; yaw: number } {
    const side = i % 2 ? 1 : -1;
    const slot = Math.floor(i / 2);
    const row = slot % 3,
      col = Math.floor(slot / 3);
    const t = (row + 0.5) / 3;
    const pos = new THREE.Vector3(side * (2.38 + 0.6 * t), 0.02 + 1.38 * t - 0.42, -1.85 + col * 0.72);
    // Face the wheel side of the room, angled toward the contestant a little.
    return { pos, yaw: side > 0 ? -Math.PI / 2 + 0.25 : Math.PI / 2 - 0.25 };
  }

  private make(i: number, freshness: number): Figure | null {
    if (!this.clips) return null;
    const rig = this.assets.skinned(this.rigIds[i % this.rigIds.length]);
    if (!rig) return null;
    return new Figure(rig, this.clips, freshness, CLOTH[i % CLOTH.length], this.uncut);
  }

  /** Seat one figure per lost broadcast (most recent first, freshest). */
  setCount(n: number, uncut: boolean): void {
    n = Math.min(MAX_SEATED, Math.max(0, n));
    if (n === this.count && uncut === this.uncut) return;
    this.uncut = uncut;
    if (n === this.count) {
      for (const f of this.figures) f.setUncut(uncut);
      this.visitor?.setUncut(uncut);
      return;
    }
    this.count = n;
    for (const f of this.figures) this.group.remove(f.root);
    this.figures = [];
    for (let i = 0; i < n; i++) {
      const f = this.make(i, 1 / (1 + i * 0.7));
      if (!f) break;
      const s = this.seat(i);
      f.root.position.copy(s.pos);
      f.root.rotation.y = s.yaw;
      this.figures.push(f);
      this.group.add(f.root);
    }
  }

  /** Applause from the dead (a Bankrupt, the Sponsor's Challenge). */
  clap(seconds = 2.4): void {
    this.figures.forEach((f, i) => setTimeout(() => f.clap(seconds), i * 90 + Math.random() * 120));
  }

  /** Everyone up (DEAD AIR), then back down after `seconds`. */
  standAll(seconds = 4): void {
    this.figures.forEach((f, i) => setTimeout(() => f.stand(), i * 60));
    setTimeout(() => this.figures.forEach((f, i) => setTimeout(() => f.sit(), i * 80)), seconds * 1000);
  }

  /**
   * The visitor: after the nth breach of the silence one of them is standing in the studio,
   * closer each time. Call it while the lights are out. 0 sends it back to the dark.
   */
  approach(step: number): void {
    if (step <= 0) {
      if (this.visitor) this.group.remove(this.visitor.root);
      this.visitor = null;
      return;
    }
    if (!this.visitor) {
      this.visitor = this.make(this.count + 1, 0.9);
      if (!this.visitor) return;
      this.visitor.stand();
      this.group.add(this.visitor.root);
    }
    const m = VISITOR_MARKS[Math.min(VISITOR_MARKS.length - 1, step - 1)];
    this.visitor.root.position.set(m[0], m[1], m[2]);
    this.visitor.root.lookAt(this.camera.x, m[1], this.camera.z);
  }

  get visitorStep(): boolean {
    return !!this.visitor;
  }

  update(dt: number): void {
    for (const f of this.figures) f.update(dt, this.watchTarget, this.watchWeight);
    this.visitor?.update(dt, this.camera, 1);
  }
}
