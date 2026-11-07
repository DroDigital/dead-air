/**
 * World-space blood: spurts, drips and the splats they leave. One Points cloud for every
 * particle in the studio (one draw call). With Broadcast Standards on Censored, it is ink.
 */
import * as THREE from 'three';

const MAX = 600;
const GRAVITY = -6.5;

/** Floor height under a point: the stage platform under the wheel, the studio floor elsewhere. */
export function floorAt(x: number, z: number): number {
  return Math.abs(x) < 2.5 && z > -2.2 && z < 0.4 ? 0.18 : 0.0;
}

export class BloodFx {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private next = 0;
  private mat: THREE.PointsMaterial;
  /** Called where a drop hits the floor (the pool grows from these). */
  onLand?: (p: THREE.Vector3) => void;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ color: 0x8a0a06, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.95, depthWrite: false });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -100;
  }

  set uncut(on: boolean) {
    this.mat.color.setHex(on ? 0x8a0a06 : 0x140c08);
  }

  private emit(p: THREE.Vector3, vx: number, vy: number, vz: number, life: number, size: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life;
    this.size[i] = size;
  }

  /** A spray from `p` along `dir` (a cone), e.g. the cleaver landing or the finger coming off. */
  spurt(p: THREE.Vector3, dir: THREE.Vector3, count = 40, speed = 2.2, spread = 0.6): void {
    const d = dir.clone().normalize();
    for (let k = 0; k < count; k++) {
      const s = speed * (0.4 + Math.random() * 0.8);
      this.emit(
        p,
        (d.x + (Math.random() - 0.5) * spread) * s,
        (d.y + (Math.random() - 0.5) * spread) * s,
        (d.z + (Math.random() - 0.5) * spread) * s,
        1.5 + Math.random(),
        1,
      );
    }
  }

  /** Slow drops falling from `p` (a wedge, the wheel's rim, a stump). */
  drip(p: THREE.Vector3, count = 1): void {
    for (let k = 0; k < count; k++) this.emit(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.03)), 0, -0.1, 0, 3, 1);
  }

  update(dt: number): void {
    const P = this.pos,
      V = this.vel;
    const hit = new THREE.Vector3();
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      V[i * 3 + 1] += GRAVITY * dt;
      P[i * 3] += V[i * 3] * dt;
      P[i * 3 + 1] += V[i * 3 + 1] * dt;
      P[i * 3 + 2] += V[i * 3 + 2] * dt;
      const fy = floorAt(P[i * 3], P[i * 3 + 2]);
      if (P[i * 3 + 1] <= fy || this.life[i] <= 0) {
        if (P[i * 3 + 1] <= fy) this.onLand?.(hit.set(P[i * 3], fy, P[i * 3 + 2]));
        this.life[i] = 0;
        P[i * 3 + 1] = -100;
      }
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
