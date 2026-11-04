/**
 * 3D coin shower: instanced gold coins that burst out of the Tray on wins and rain over the
 * stage on a Jackpot. One draw call, gravity, spin, a bounce on the table and the floor.
 */
import * as THREE from 'three';
import { psxMaterial } from '../psxMaterial';

const MAX = 120;

interface Coin {
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3;
  life: number;
  floor: number;
}

export class CoinShower {
  readonly mesh: THREE.InstancedMesh;
  private coins: Coin[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);

  constructor() {
    const geo = new THREE.CylinderGeometry(0.035, 0.035, 0.008, 8);
    this.mesh = new THREE.InstancedMesh(geo, psxMaterial({ color: 0xe8b830, emissive: 0x3a2400, wrap: 0.3 }), MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  /** Burst `n` coins from a point, thrown up and outward. */
  burst(at: THREE.Vector3, n: number, speed = 1.6, floor = 0.82): void {
    for (let i = 0; i < n && this.coins.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.coins.push({
        p: at.clone(),
        v: new THREE.Vector3(Math.cos(a) * s * 0.4, s * (0.9 + Math.random() * 0.6), Math.sin(a) * s * 0.4),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        w: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30),
        life: 2.2 + Math.random(),
        floor,
      });
    }
  }

  /** Coins raining from the rig over the wheel. */
  rain(n: number): void {
    for (let i = 0; i < n && this.coins.length < MAX; i++) {
      this.coins.push({
        p: new THREE.Vector3((Math.random() - 0.5) * 3.4, 3.4 + Math.random() * 1.5, -0.8 + Math.random() * 2.4),
        v: new THREE.Vector3(0, -Math.random(), 0),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        w: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 20),
        life: 3 + Math.random() * 1.5,
        floor: 0.19,
      });
    }
  }

  update(dt: number): void {
    const d = Math.min(0.05, dt);
    for (const c of this.coins) {
      c.v.y -= 9.8 * d;
      c.p.addScaledVector(c.v, d);
      if (c.p.y < c.floor) {
        c.p.y = c.floor;
        c.v.y = Math.abs(c.v.y) * 0.35;
        c.v.x *= 0.6;
        c.v.z *= 0.6;
        c.w.multiplyScalar(0.6);
      }
      c.r.x += c.w.x * d;
      c.r.y += c.w.y * d;
      c.r.z += c.w.z * d;
      c.life -= d;
    }
    this.coins = this.coins.filter((c) => c.life > 0);
    this.coins.forEach((c, i) => {
      const k = Math.min(1, c.life * 2);
      this.s.setScalar(k);
      this.m.compose(c.p, this.q.setFromEuler(c.r), this.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.count = this.coins.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
