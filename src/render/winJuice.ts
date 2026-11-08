/**
 * 3D juice for big wins, in three tiers:
 *   big      a gold shockwave off the wheel and a burst of sparks from the pointer;
 *   huge     + banknotes fluttering down through the shot and light rays behind the wheel;
 *   jackpot  + more of everything, the rays turning.
 * All generated here: a canvas banknote on instanced quads, a ring, a spark cloud, ray planes.
 */
import * as THREE from 'three';
import { psxMaterial, psxTexture, type PsxMaterial } from './psxMaterial';

export type WinTier = 'big' | 'huge' | 'jackpot';

const BILLS = 90;
const SPARKS = 160;

function billTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 32;
  cv.height = 16;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#4e7a3c';
  c.fillRect(0, 0, 32, 16);
  c.fillStyle = '#8ab46a';
  c.fillRect(2, 2, 28, 12);
  c.fillStyle = '#f0e8c8';
  c.beginPath();
  c.ellipse(16, 8, 5, 5, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#2a4a20';
  c.font = 'bold 8px monospace';
  c.textAlign = 'center';
  c.fillText('$', 16, 11);
  c.fillRect(4, 4, 3, 2);
  c.fillRect(25, 10, 3, 2);
  return psxTexture(new THREE.CanvasTexture(cv), false);
}

interface Bill {
  p: THREE.Vector3;
  v: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  phase: number;
  life: number;
}

export class WinJuice {
  readonly group = new THREE.Group();
  private bills: THREE.InstancedMesh;
  private billState: Bill[] = [];
  private ring: THREE.Mesh<THREE.RingGeometry, PsxMaterial>;
  private ring2: THREE.Mesh<THREE.RingGeometry, PsxMaterial>;
  private ringT = 9;
  private sparks: THREE.Points;
  private sparkPos = new Float32Array(SPARKS * 3);
  private sparkVel = new Float32Array(SPARKS * 3);
  private sparkLife = new Float32Array(SPARKS);
  private sparkNext = 0;
  private rays: THREE.Group;
  private rayMats: PsxMaterial[] = [];
  private rayT = 9;
  private rayLife = 2.5;
  private raySpin = 0;
  reducedFlashing = false;

  constructor() {
    const billMat = psxMaterial({ map: billTexture(), side: THREE.DoubleSide, wrap: 0.6 });
    this.bills = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.15, 0.075), billMat, BILLS);
    this.bills.count = 0;
    this.bills.frustumCulled = false;
    this.group.add(this.bills);

    const ringMat = () => {
      const m = psxMaterial({ color: 0xffd860, emissive: 0xffc030, lit: false, transparent: true, opacity: 0, side: THREE.DoubleSide, fog: 0 });
      m.blending = THREE.AdditiveBlending;
      return m;
    };
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), ringMat());
    this.ring2 = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 48), ringMat());
    this.ring.visible = this.ring2.visible = false;
    this.group.add(this.ring, this.ring2);

    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    for (let i = 0; i < SPARKS; i++) this.sparkPos[i * 3 + 1] = -100;
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffe080, size: 2, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);

    // Light rays fanned out behind the wheel.
    this.rays = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const m = psxMaterial({ color: 0xfff0b0, emissive: 0xffe0a0, lit: false, transparent: true, opacity: 0, side: THREE.DoubleSide, fog: 0 });
      m.blending = THREE.AdditiveBlending;
      m.depthWrite = false;
      this.rayMats.push(m);
      const geo = new THREE.PlaneGeometry(0.35, 4.2);
      geo.translate(0, 2.1, 0);
      const ray = new THREE.Mesh(geo, m);
      ray.rotation.z = (i / 10) * Math.PI * 2;
      this.rays.add(ray);
    }
    this.rays.visible = false;
    this.group.add(this.rays);
  }

  /** Fire the effects for a win of `tier` at the wheel (centre and pointer, world space). */
  play(tier: WinTier, centre: THREE.Vector3, pointer: THREE.Vector3): void {
    // Shockwave rings, facing the chair, just in front of the wheel.
    this.ring.position.copy(centre).add(new THREE.Vector3(0, 0, 0.15));
    this.ring2.position.copy(this.ring.position);
    this.ringT = 0;
    this.ring.visible = this.ring2.visible = true;
    // Sparks off the pointer.
    const n = tier === 'big' ? 50 : tier === 'huge' ? 90 : 140;
    for (let k = 0; k < n; k++) {
      const i = this.sparkNext;
      this.sparkNext = (this.sparkNext + 1) % SPARKS;
      const a = Math.random() * Math.PI * 2;
      const s = 1.2 + Math.random() * 2.2;
      this.sparkPos.set([pointer.x, pointer.y, pointer.z + 0.1], i * 3);
      this.sparkVel.set([Math.cos(a) * s, Math.abs(Math.sin(a)) * s * 1.2 + 0.6, 0.6 + Math.random() * 1.2], i * 3);
      this.sparkLife[i] = 0.7 + Math.random() * 0.6;
    }
    if (tier === 'big') return;
    // Money falling through the shot.
    const count = tier === 'huge' ? 45 : BILLS;
    this.billState = [];
    for (let i = 0; i < count; i++) {
      this.billState.push({
        p: new THREE.Vector3((Math.random() - 0.5) * 3.6, 3.3 + Math.random() * 1.8, -0.4 + Math.random() * 2.6),
        v: new THREE.Vector3((Math.random() - 0.5) * 0.3, -0.25 - Math.random() * 0.3, (Math.random() - 0.5) * 0.2),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6),
        phase: Math.random() * 6,
        life: 6,
      });
    }
    this.bills.count = count;
    // Rays behind the wheel.
    this.rays.position.copy(centre).add(new THREE.Vector3(0, 0, -0.2));
    this.rayT = 0;
    this.rayLife = tier === 'jackpot' ? 3.5 : 2.2;
    this.raySpin = tier === 'jackpot' ? 0.6 : 0.15;
    this.rays.visible = true;
  }

  update(dt: number, time: number): void {
    // Rings: expand fast, fade.
    if (this.ringT < 1.2) {
      this.ringT += dt;
      const k1 = Math.min(1, this.ringT / 0.7);
      const k2 = Math.min(1, Math.max(0, (this.ringT - 0.12) / 0.8));
      this.ring.scale.setScalar(1.3 + k1 * 2.6);
      this.ring2.scale.setScalar(1.2 + k2 * 3.4);
      const flash = this.reducedFlashing ? 0.35 : 0.85;
      this.ring.material.uniforms.uOpacity.value = (1 - k1) * flash;
      this.ring2.material.uniforms.uOpacity.value = (1 - k2) * flash * 0.6;
      if (this.ringT >= 1.2) this.ring.visible = this.ring2.visible = false;
    }
    // Sparks: ballistic, dying out.
    for (let i = 0; i < SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt;
      this.sparkVel[i * 3 + 1] -= 4.5 * dt;
      for (let a = 0; a < 3; a++) this.sparkPos[i * 3 + a] += this.sparkVel[i * 3 + a] * dt;
      if (this.sparkLife[i] <= 0) this.sparkPos[i * 3 + 1] = -100;
    }
    (this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    // Bills: drag, flutter side to side, tumble; settle on the floor and vanish.
    if (this.bills.count > 0) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      let alive = 0;
      this.billState.forEach((b, i) => {
        b.life -= dt;
        if (b.p.y > 0.02) {
          b.v.y = Math.max(-0.55, b.v.y - 0.6 * dt);
          b.p.x += (b.v.x + Math.sin(time * 2.3 + b.phase) * 0.35) * dt;
          b.p.y += b.v.y * dt;
          b.p.z += (b.v.z + Math.cos(time * 1.7 + b.phase) * 0.2) * dt;
          b.rot.x += b.spin.x * dt;
          b.rot.y += b.spin.y * dt;
          b.rot.z += b.spin.z * dt;
        } else b.rot.set(-Math.PI / 2, b.rot.y, 0);
        const scale = b.life < 0.5 ? Math.max(0.001, b.life * 2) : 1;
        if (b.life > 0) alive++;
        q.setFromEuler(b.rot);
        m.compose(b.p, q, one.clone().multiplyScalar(scale));
        this.bills.setMatrixAt(i, m);
      });
      this.bills.instanceMatrix.needsUpdate = true;
      if (!alive) this.bills.count = 0;
    }
    // Rays: swell, turn, fade.
    if (this.rays.visible) {
      this.rayT += dt;
      const k = this.rayT / this.rayLife;
      const env = k < 0.2 ? k / 0.2 : Math.max(0, 1 - (k - 0.2) / 0.8);
      this.rays.rotation.z += dt * this.raySpin;
      const amt = (this.reducedFlashing ? 0.12 : 0.28) * env;
      this.rayMats.forEach((mm, i) => (mm.uniforms.uOpacity.value = amt * (0.6 + 0.4 * Math.sin(time * 3 + i * 1.7))));
      if (k >= 1) this.rays.visible = false;
    }
  }
}
