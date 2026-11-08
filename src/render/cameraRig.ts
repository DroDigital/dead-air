/**
 * Seated camera: eased ~0.25 s looks between fixed stations, idle head sway, shake, plus the
 * broadcast moves — an FOV punch on impacts, a dutch tilt on Bankrupt, a slow dolly toward the
 * wheel while it spins, a crane-down when a Deadline opens, and cinematic "shots": an eased
 * push toward a point of interest (the flapper in a slow-motion finish, the host's reaction)
 * that holds and then returns, plus a whip pan's lateral snap.
 */
import gsap from 'gsap';
import * as THREE from 'three';

export type Station = 'center' | 'down' | 'left' | 'right';

interface StationDef {
  eye: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export const STATIONS: Record<Station, StationDef> = {
  center: { eye: new THREE.Vector3(0, 1.28, 3.05), target: new THREE.Vector3(0, 1.42, -0.6), fov: 60 },
  down: { eye: new THREE.Vector3(0, 1.42, 3.3), target: new THREE.Vector3(0, 0.62, 2.4), fov: 60 },
  left: { eye: new THREE.Vector3(-0.15, 1.3, 3.0), target: new THREE.Vector3(-2.0, 1.15, 2.55), fov: 62 },
  right: { eye: new THREE.Vector3(0.15, 1.3, 3.0), target: new THREE.Vector3(2.0, 1.25, 2.3), fov: 62 },
};

/** Which station a direction key moves to from each station. */
export const NAV: Record<Station, Partial<Record<'up' | 'down' | 'left' | 'right', Station>>> = {
  center: { down: 'down', left: 'left', right: 'right' },
  down: { up: 'center', left: 'left', right: 'right' },
  left: { right: 'center', down: 'down' },
  right: { left: 'center', down: 'down' },
};

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  station: Station = 'center';
  private eye = STATIONS.center.eye.clone();
  private target = STATIONS.center.target.clone();
  private shakeAmt = 0;
  private tween: gsap.core.Tween | null = null;
  sway = 1;
  /** Extra look offset (e.g. phone call lean). */
  readonly offset = new THREE.Vector3();
  /** FOV kick in degrees (negative = zoom in); springs back. */
  private punchV = 0;
  private punchX = 0;
  /** Dutch tilt (radians); eases to `rollTarget`. */
  private roll = 0;
  rollTarget = 0;
  /** 0..1 dolly toward the wheel (spinning). */
  private dolly = 0;
  dollyTarget = 0;
  /** Crane offset (metres up/back), eased to zero. */
  private crane = new THREE.Vector3();
  private baseFov = STATIONS.center.fov;
  onMove?: (s: Station) => void;
  /** The current cinematic shot: where it looks, how far the eye travels toward it, its lens. */
  private shot = { look: new THREE.Vector3(), push: 0, fov: 60, roll: 0, w: 0 };
  private shotTween: gsap.core.Timeline | null = null;
  /** Whip-pan offset (metres, sideways) on a stiff spring. */
  private whipX = 0;
  private whipV = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(STATIONS.center.fov, aspect, 0.05, 30);
    this.apply(0);
  }

  go(s: Station, dur = 0.25): void {
    if (s === this.station && !this.tween) return;
    this.station = s;
    const d = STATIONS[s];
    this.tween?.kill();
    const state = { ex: this.eye.x, ey: this.eye.y, ez: this.eye.z, tx: this.target.x, ty: this.target.y, tz: this.target.z, fov: this.camera.fov };
    this.tween = gsap.to(state, {
      ex: d.eye.x,
      ey: d.eye.y,
      ez: d.eye.z,
      tx: d.target.x,
      ty: d.target.y,
      tz: d.target.z,
      fov: d.fov,
      duration: dur,
      ease: 'power2.inOut',
      onUpdate: () => {
        this.eye.set(state.ex, state.ey, state.ez);
        this.target.set(state.tx, state.ty, state.tz);
        this.baseFov = state.fov;
      },
      onComplete: () => {
        this.tween = null;
      },
    });
    this.onMove?.(s);
  }

  nav(dir: 'up' | 'down' | 'left' | 'right'): boolean {
    const to = NAV[this.station][dir];
    if (to) this.go(to);
    return !!to;
  }

  shake(amount: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  /** A quick zoom kick (degrees of FOV; negative zooms in). */
  punch(deg: number): void {
    this.punchV += deg * 18;
  }

  /** Dutch tilt that holds for `seconds`, then rights itself. */
  tilt(rad: number, seconds = 0.8): void {
    this.rollTarget = rad;
    setTimeout(() => {
      if (this.rollTarget === rad) this.rollTarget = 0;
    }, seconds * 1000);
  }

  /** Start from a high, wide crane position and settle into the seat. */
  craneIn(): void {
    this.crane.set(0, 1.4, 1.6);
  }

  /**
   * Cut to a shot: ease toward `look` (the eye travels `push` of the way there), narrow the lens
   * to `fov`, hold, then ease back. A newer shot replaces the current one mid-move.
   */
  focus(look: THREE.Vector3, o: { push?: number; fov?: number; roll?: number; in?: number; hold?: number; out?: number } = {}): void {
    this.shotTween?.kill();
    const sh = this.shot;
    sh.look.copy(look);
    sh.push = o.push ?? 0.3;
    sh.fov = o.fov ?? 40;
    sh.roll = o.roll ?? 0;
    const tl = gsap.timeline();
    tl.to(sh, { w: 1, duration: o.in ?? 0.35, ease: 'power3.out' });
    if (o.hold !== Infinity) tl.to(sh, { w: 0, duration: o.out ?? 0.45, ease: 'power2.inOut', delay: o.hold ?? 0.8 });
    this.shotTween = tl;
  }

  /** Let go of the current shot (eased). */
  release(out = 0.4): void {
    this.shotTween?.kill();
    this.shotTween = gsap.timeline().to(this.shot, { w: 0, duration: out, ease: 'power2.inOut' });
  }

  get inShot(): boolean {
    return this.shot.w > 0.01;
  }

  /** A whip pan: the view snaps sideways and springs back (pair it with a swish). */
  whip(dir: number): void {
    this.whipV += dir * 9;
  }

  get moving(): boolean {
    return !!this.tween;
  }

  apply(time: number, dt = 0): void {
    // Springs and eases for the broadcast moves.
    const d = Math.min(0.05, dt);
    this.punchV += (-this.punchX * 90 - this.punchV * 14) * d;
    this.punchX += this.punchV * d;
    this.roll += (this.rollTarget - this.roll) * Math.min(1, d * 6);
    this.dolly += (this.dollyTarget - this.dolly) * Math.min(1, d * 1.2);
    this.crane.multiplyScalar(Math.max(0, 1 - d * 1.1));
    this.whipV += (-this.whipX * 260 - this.whipV * 20) * d;
    this.whipX += this.whipV * d;
    const sh = this.shot;
    const w = sh.w * sh.w * (3 - 2 * sh.w);
    let fov = this.baseFov + this.punchX - this.dolly * 7 + this.crane.length() * 6;
    fov += (sh.fov - fov) * w;
    // Narrower than 16:9 (4:3, portrait-ish windows): widen the lens so the shot keeps its width.
    const aspect = this.camera.aspect;
    if (aspect < 16 / 9) fov = (2 * Math.atan((Math.tan((fov * Math.PI) / 360) * (16 / 9)) / aspect) * 180) / Math.PI;
    if (Math.abs(fov - this.camera.fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const sx = Math.sin(time * 0.37) * 0.012 + Math.sin(time * 0.91) * 0.005;
    const sy = Math.sin(time * 0.53) * 0.008 + Math.sin(time * 1.3) * 0.003;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
    const k = this.shakeAmt * this.shakeAmt;
    const shx = (Math.random() - 0.5) * 0.08 * k;
    const shy = (Math.random() - 0.5) * 0.08 * k;
    const dz = this.station === 'center' ? -this.dolly * 0.35 : 0;
    const ex = this.eye.x + sx * this.sway + shx + this.crane.x + this.whipX,
      ey = this.eye.y + sy * this.sway + shy + this.crane.y,
      ez = this.eye.z + dz + this.crane.z;
    const lx = this.target.x + this.offset.x + sx * 0.6 * this.sway + this.whipX * 2,
      ly = this.target.y + this.offset.y,
      lz = this.target.z + this.offset.z;
    // Blend toward the shot: the look point moves to the subject, the eye travels part-way.
    this.camera.position.set(ex + (sh.look.x - ex) * sh.push * w, ey + (sh.look.y - ey) * sh.push * w, ez + (sh.look.z - ez) * sh.push * w);
    this.camera.lookAt(lx + (sh.look.x - lx) * w, ly + (sh.look.y - ly) * w, lz + (sh.look.z - lz) * w);
    const roll = this.roll + sh.roll * w;
    if (Math.abs(roll) > 1e-4) this.camera.rotateZ(roll);
  }

  setAspect(a: number): void {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}
