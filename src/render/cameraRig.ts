/**
 * Seated camera: eased ~0.25 s looks between fixed stations, idle head sway, shake.
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
  onMove?: (s: Station) => void;

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
        this.camera.fov = state.fov;
        this.camera.updateProjectionMatrix();
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

  get moving(): boolean {
    return !!this.tween;
  }

  apply(time: number, dt = 0): void {
    const sx = Math.sin(time * 0.37) * 0.012 + Math.sin(time * 0.91) * 0.005;
    const sy = Math.sin(time * 0.53) * 0.008 + Math.sin(time * 1.3) * 0.003;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
    const k = this.shakeAmt * this.shakeAmt;
    const shx = (Math.random() - 0.5) * 0.08 * k;
    const shy = (Math.random() - 0.5) * 0.08 * k;
    this.camera.position.set(this.eye.x + sx * this.sway + shx, this.eye.y + sy * this.sway + shy, this.eye.z);
    this.camera.lookAt(this.target.x + this.offset.x + sx * 0.6 * this.sway, this.target.y + this.offset.y, this.target.z + this.offset.z);
  }

  setAspect(a: number): void {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}
