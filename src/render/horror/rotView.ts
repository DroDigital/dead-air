/**
 * The Rot made visible: the studio decays with one 0..1 number (src/game/rot.ts).
 *
 *  - a pool under the wheel that the drips from its rim feed, spreading as the show goes on;
 *  - wallpaper peeling off the side walls in curling flaps, with meat underneath that breathes;
 *  - splats on the floor where spurts land.
 * Everything is generated here: canvas textures, curled planes, PSX materials.
 */
import * as THREE from 'three';
import type { Assets } from '../../assets/loader';
import { psxMaterial, psxTexture, type PsxMaterial } from '../psxMaterial';
import { BloodFx, floorAt } from './blood';

/** Deterministic noise so the generated textures are the same every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A wet, irregular pool (alpha-cut blob with a darker rim and a highlight). */
function poolTexture(seed: number, uncut: boolean): THREE.CanvasTexture {
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  const r = rng(seed);
  const pts: [number, number][] = [];
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = S * (0.3 + r() * 0.17);
    pts.push([S / 2 + Math.cos(a) * rad, S / 2 + Math.sin(a) * rad]);
  }
  const blob = (scale: number, fill: string) => {
    c.beginPath();
    pts.forEach(([x, y], i) => {
      const px = S / 2 + (x - S / 2) * scale,
        py = S / 2 + (y - S / 2) * scale;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    });
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };
  blob(1, uncut ? '#3a0402' : '#0c0806');
  blob(0.86, uncut ? '#6a0804' : '#16100c');
  // Satellite droplets.
  for (let i = 0; i < 9; i++) {
    c.beginPath();
    c.arc(r() * S, r() * S, 1 + r() * 2.5, 0, Math.PI * 2);
    c.fillStyle = uncut ? '#5a0603' : '#100a08';
    c.fill();
  }
  c.fillStyle = 'rgba(255,200,190,0.35)';
  c.fillRect(S * 0.36, S * 0.4, 6, 2);
  return psxTexture(new THREE.CanvasTexture(cv), false);
}

/** Raw meat behind the paper: marbled red with veins and wet highlights. */
function meatTexture(): THREE.CanvasTexture {
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  const r = rng(77);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = Math.sin(x * 0.4 + Math.sin(y * 0.3) * 2) * 0.5 + 0.5;
      const k = 0.55 + v * 0.35 + (r() - 0.5) * 0.15;
      c.fillStyle = `rgb(${Math.round(150 * k)},${Math.round(28 * k)},${Math.round(30 * k)})`;
      c.fillRect(x, y, 1, 1);
    }
  c.strokeStyle = 'rgba(70,10,30,0.8)';
  c.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    c.beginPath();
    let x = r() * S,
      y = r() * S;
    c.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (r() - 0.5) * 18;
      y += (r() - 0.5) * 18;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  // Fat marbling and wet glints.
  for (let i = 0; i < 10; i++) {
    c.fillStyle = 'rgba(240,210,180,0.35)';
    c.fillRect(r() * S, r() * S, 2 + r() * 5, 1);
    c.fillStyle = 'rgba(255,230,230,0.5)';
    c.fillRect(r() * S, r() * S, 1, 1);
  }
  return psxTexture(new THREE.CanvasTexture(cv));
}

interface Flap {
  pivot: THREE.Group;
  paper: THREE.Mesh<THREE.PlaneGeometry, PsxMaterial>;
  meat: THREE.Mesh<THREE.PlaneGeometry, PsxMaterial>;
  base: Float32Array;
  /** Rot at which this flap starts to peel, and its random phase. */
  at: number;
  phase: number;
  curl: number;
}

export class RotView {
  readonly group = new THREE.Group();
  readonly blood = new BloodFx();
  private pool: THREE.Mesh<THREE.CircleGeometry, PsxMaterial>;
  private poolSize = 0;
  private flaps: Flap[] = [];
  private splats: THREE.InstancedMesh;
  private splatN = 0;
  private dripT = 0;
  private uncutOn = true;
  /** The rim point under the wheel the drips fall from (world space, set by the stage). */
  readonly dripFrom = new THREE.Vector3(0, 0.32, -0.52);
  rot = 0;

  constructor(assets: Assets) {
    // The pool on the stage under the wheel.
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(1, 20), psxMaterial({ map: poolTexture(5, true), alphaTest: 0.5, wrap: 0.2 }));
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.set(0.05, 0.183, -0.3);
    this.pool.scale.setScalar(0.001);
    this.group.add(this.pool);

    // Splats where spurts land (instanced quads on the floor).
    this.splats = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.035, 6).rotateX(-Math.PI / 2),
      psxMaterial({ color: 0x5a0604, wrap: 0.2 }),
      160,
    );
    this.splats.count = 0;
    this.group.add(this.splats);
    this.blood.onLand = (p) => this.splat(p);
    this.group.add(this.blood.points);

    // Wallpaper flaps over meat, along both side walls (upper wallpaper band, x = ±3).
    const meatTex = meatTexture();
    const paperTex = assets.texture('tex.wallpaper');
    const r = rng(1234);
    const spots: [number, number, number][] = [];
    for (let i = 0; i < 10; i++) spots.push([i % 2 ? 1 : -1, 1.75 + r() * 1.5, -1.6 + r() * 4.2]);
    spots.forEach(([side, y, z], i) => {
      const w = 0.45 + r() * 0.35,
        h = 0.55 + r() * 0.5;
      const meat = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.95, h * 0.95), psxMaterial({ map: meatTex, wrap: 0.5, color: 0xd09090 }));
      meat.position.set(side * 2.995, y - h / 2, z);
      meat.rotation.y = -side * Math.PI / 2;
      meat.visible = false;
      this.group.add(meat);
      const pivot = new THREE.Group();
      pivot.position.set(side * 2.99, y, z);
      pivot.rotation.y = -side * Math.PI / 2;
      const geo = new THREE.PlaneGeometry(w, h, 1, 8);
      geo.translate(0, -h / 2, 0.002);
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w * 0.5 + r(), uv.getY(k) * h * 0.5);
      const paper = new THREE.Mesh(geo, psxMaterial({ map: paperTex, color: 0x9a9070, side: THREE.DoubleSide, wrap: 0.4 }));
      pivot.add(paper);
      pivot.visible = false;
      this.group.add(pivot);
      this.flaps.push({ pivot, paper, meat, base: Float32Array.from((geo.getAttribute('position') as THREE.BufferAttribute).array), at: 0.2 + (i / spots.length) * 0.7, phase: r() * 6, curl: 0 });
    });
  }

  set uncut(on: boolean) {
    if (on === this.uncutOn) return;
    this.uncutOn = on;
    this.blood.uncut = on;
    this.pool.material.uniforms.map.value = poolTexture(5, on);
    (this.splats.material as PsxMaterial).uniforms.uColor.value.setHex(on ? 0x5a0604 : 0x120c08);
  }

  private splat(p: THREE.Vector3): void {
    // Drops landing in the pool just feed it.
    if (Math.hypot(p.x - this.pool.position.x, p.z - this.pool.position.z) < this.poolSize * 0.9) return;
    const i = this.splatN % 160;
    this.splatN++;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, floorAt(p.x, p.z) + 0.004 + (i % 7) * 0.0004, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * 6, 0)),
      new THREE.Vector3(1, 1, 1).multiplyScalar(0.5 + Math.random()),
    );
    this.splats.setMatrixAt(i, m);
    this.splats.count = Math.min(160, this.splatN);
    this.splats.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, time: number): void {
    const rot = this.rot;
    // The pool spreads toward a size set by the rot (never shrinks within a run).
    const target = rot < 0.25 ? 0 : 0.25 + (rot - 0.25) * 1.1;
    this.poolSize = Math.max(this.poolSize * (target === 0 ? 0.9 : 1), this.poolSize + (target - this.poolSize) * Math.min(1, dt * 0.4));
    if (target === 0 && this.poolSize < 0.01) this.poolSize = 0;
    this.pool.scale.setScalar(Math.max(0.001, this.poolSize));
    this.pool.visible = this.poolSize > 0.01;
    // Drips from the rim once the show is going off.
    if (rot > 0.3) {
      this.dripT -= dt * (rot - 0.3) * 3;
      if (this.dripT <= 0) {
        this.dripT = 0.4 + Math.random() * 0.8;
        this.blood.drip(this.dripFrom.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, 0)));
      }
    }
    this.blood.update(dt);
    // Flaps: peel past their threshold, curl and stir; the meat behind breathes.
    for (const f of this.flaps) {
      const k = THREE.MathUtils.clamp((rot - f.at) / 0.25, 0, 1);
      f.curl += (k - f.curl) * Math.min(1, dt * 0.8);
      const on = f.curl > 0.01;
      f.pivot.visible = on;
      f.meat.visible = on;
      if (!on) continue;
      const pos = f.paper.geometry.getAttribute('position') as THREE.BufferAttribute;
      const h = -f.base[(pos.count - 1) * 3 + 1];
      for (let i = 0; i < pos.count; i++) {
        const y = f.base[i * 3 + 1];
        const t = -y / h; // 0 at the hinge, 1 at the free edge
        const bend = f.curl * (t * t) * (1.4 + Math.sin(time * 0.7 + f.phase) * 0.08);
        pos.setY(i, y * Math.cos(bend * 0.6));
        pos.setZ(i, f.base[i * 3 + 2] + Math.sin(bend) * h * 0.6 * t);
      }
      pos.needsUpdate = true;
      f.paper.geometry.computeVertexNormals();
      const breathe = 1 + Math.sin(time * 1.3 + f.phase) * 0.03 * f.curl;
      f.meat.scale.set(breathe, breathe, 1);
    }
  }
}
