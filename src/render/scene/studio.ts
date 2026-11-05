/**
 * The rotting studio: room shell, sagging curtain, dead stage lights, the contestant console,
 * the swinging bare bulb, the wheel spotlight, the flickering fluorescent tube, dust motes,
 * the trapdoor under the chair.
 */
import * as THREE from 'three';
import type { Assets } from '../../assets/loader';
import { PSX_SHARED, psxMaterial } from '../psxMaterial';
import { Batcher, TAU, scaleUv } from './util';

export class StudioView {
  readonly group = new THREE.Group();
  private bulbPivot = new THREE.Group();
  private bulbMesh: THREE.Object3D;
  private bulbMat: THREE.ShaderMaterial | null = null;
  private tubeMats: THREE.ShaderMaterial[] = [];
  private dust: THREE.Points;
  private dustVel: Float32Array;
  private trapL = new THREE.Group();
  private trapR = new THREE.Group();
  /** Bulb swing (radians) and velocity. */
  private swing = 0.05;
  private swingV = 0;
  /** 0..1 global light level for bulb/spot/fluorescent (Bankrupt blackout, Game Over). */
  lightLevel = 1;
  spotLevel = 1;
  fluoFlicker = 0;
  bulbWarmth = 1;
  private flickerT = 0;
  private flickerOn = 1;
  /** Extra light used by phone/jackpot moments. */
  readonly accent = { color: new THREE.Color(0, 0, 0), pos: new THREE.Vector3(0, 2, 0) };

  constructor(assets: Assets) {
    const g = this.group;
    const b = new Batcher();
    const wall = () => psxMaterial({ map: assets.texture('tex.wall_panel'), color: 0xc8a888 });
    const paper = () => psxMaterial({ map: assets.texture('tex.wallpaper'), color: 0x9a9070 });
    const carpet = () => psxMaterial({ map: assets.texture('tex.carpet'), color: 0xc08080 });
    const stage = () => psxMaterial({ map: assets.texture('tex.stage_wood') });
    // Untextured trims/props share one vertex-coloured batch (one draw call).
    const vc = () => psxMaterial({ vertexColors: true });
    const DARK = 0x241a14,
      METAL = 0x5a5a5e,
      GOLD = 0xc89830;
    const plaster = () => psxMaterial({ map: assets.texture('tex.plaster'), color: 0x605850 });

    // Floor: carpet around, stage platform under the wheel.
    const floor = new THREE.PlaneGeometry(12, 12);
    scaleUv(floor, 8, 8);
    b.add('carpet', carpet, floor, new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    b.box('stage', stage, [5, 0.18, 2.6], [0, 0.09, -0.9], [0, 0, 0], 1.2);
    // Walls: wood paneling below, wallpaper above.
    for (const [x, ry] of [
      [-3, Math.PI / 2],
      [3, -Math.PI / 2],
    ] as const) {
      const low = new THREE.PlaneGeometry(10, 1.3);
      scaleUv(low, 6, 1);
      b.add('wall', wall, low, new THREE.Matrix4().compose(new THREE.Vector3(x, 0.65, 1), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)));
      const hi = new THREE.PlaneGeometry(10, 2.9);
      scaleUv(hi, 5, 1.5);
      b.add('paper', paper, hi, new THREE.Matrix4().compose(new THREE.Vector3(x, 2.75, 1), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)));
      b.box('vc', vc, [0.08, 0.1, 10], [x + (x < 0 ? 0.04 : -0.04), 1.32, 1], [0, 0, 0], 1, DARK);
    }
    // Raked audience seating along both side walls, upstage: empty red velvet rows.
    const seats = () => psxMaterial({ map: assets.texture('tex.seats'), color: 0x9a7468, wrap: 0.4 });
    for (const s of [-1, 1]) {
      const rake = new THREE.PlaneGeometry(2.5, 1.63);
      scaleUv(rake, 1.2, 1);
      const m = new THREE.Matrix4()
        .makeTranslation(s * 2.675, 0.75, -0.85)
        .multiply(new THREE.Matrix4().makeRotationZ(s * -0.41))
        .multiply(new THREE.Matrix4().makeRotationY(s * -Math.PI / 2));
      b.add('seats', seats, rake, m);
    }
    const backHi = new THREE.PlaneGeometry(6, 4.2);
    scaleUv(backHi, 3, 2);
    b.add('plaster', plaster, backHi, new THREE.Matrix4().makeTranslation(0, 2.1, -2.3));
    const front = new THREE.PlaneGeometry(6, 4.2);
    scaleUv(front, 4, 2);
    b.add('wall', wall, front, new THREE.Matrix4().compose(new THREE.Vector3(0, 2.1, 5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)), new THREE.Vector3(1, 1, 1)));
    const ceil = new THREE.PlaneGeometry(6, 8);
    b.add('vc', vc, ceil, new THREE.Matrix4().compose(new THREE.Vector3(0, 4.2, 1), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)), DARK);
    // Lighting truss with dead stage cans.
    b.box('vc', vc, [5.6, 0.08, 0.08], [0, 3.6, 0.6], [0, 0, 0], 1, METAL);
    b.box('vc', vc, [5.6, 0.08, 0.08], [0, 3.6, 0.9], [0, 0, 0], 1, METAL);
    for (let i = 0; i < 6; i++) {
      const x = -2.4 + i * 0.96;
      const can = new THREE.CylinderGeometry(0.12, 0.16, 0.3, 6);
      b.add('vc', vc, can, new THREE.Matrix4().compose(new THREE.Vector3(x, 3.38, 0.75), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5 + (i % 2) * 0.3, 0, (i - 2.5) * 0.08)), new THREE.Vector3(1, 1, 1)), DARK);
    }
    // Contestant console (the desk with Tray + Vault) and the chair arms.
    const cab = () => psxMaterial({ map: assets.texture('tex.cabinet_wood'), color: 0xa07850 });
    b.box('cab', cab, [1.7, 0.08, 0.6], [0, 0.6, 2.45]);
    b.box('cab', cab, [1.7, 0.56, 0.06], [0, 0.28, 2.16]);
    b.box('vc', vc, [1.72, 0.03, 0.04], [0, 0.645, 2.15], [0, 0, 0], 1, GOLD);
    const leather = () => psxMaterial({ map: assets.texture('tex.leather'), color: 0x9a4030 });
    b.box('leather', leather, [0.12, 0.12, 0.5], [-0.62, 0.7, 3.0]);
    b.box('leather', leather, [0.12, 0.12, 0.5], [0.62, 0.7, 3.0]);
    // Side tables (phone left, debt board post right).
    b.box('cab', cab, [0.6, 0.06, 0.6], [-1.65, 0.78, 1.95]);
    b.box('cab', cab, [0.06, 0.78, 0.06], [-1.65, 0.39, 1.95]);
    // Prop junk in the dark: old camera on a tripod, sandbags.
    b.box('vc', vc, [0.4, 0.3, 0.6], [-2.2, 1.55, -1.4], [0, 0.5, 0], 1, DARK);
    b.add('vc', vc, new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), new THREE.Matrix4().makeTranslation(-2.2, 0.7, -1.4), METAL);
    b.box('leather', leather, [0.5, 0.2, 0.3], [2.4, 0.1, -1.6], [0, 0.3, 0]);
    // Trapdoor frame under the chair.
    b.box('vc', vc, [1.2, 0.02, 0.05], [0, 0.005, 2.3], [0, 0, 0], 1, DARK);
    b.box('vc', vc, [1.2, 0.02, 0.05], [0, 0.005, 3.5], [0, 0, 0], 1, DARK);
    b.build(g);

    // Trapdoor leaves (animated on Game Over).
    const leaf = () => new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 1.2), psxMaterial({ map: assets.texture('tex.stage_wood'), color: 0x806040 }));
    const l = leaf();
    l.position.x = 0.3;
    this.trapL.add(l);
    this.trapL.position.set(-0.6, 0.015, 2.9);
    const r = leaf();
    r.position.x = -0.3;
    this.trapR.add(r);
    this.trapR.position.set(0.6, 0.015, 2.9);
    g.add(this.trapL, this.trapR);

    // Sagging curtain behind the wheel (one mesh, displaced folds).
    const cg = new THREE.PlaneGeometry(6, 3.8, 24, 6);
    const pos = cg.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i);
      const sag = Math.pow(Math.abs(x) / 3, 2) * 0.0 + (y > 1.6 ? Math.sin((x / 6) * TAU * 2) * 0.12 : 0);
      pos.setZ(i, Math.sin(x * 5.2) * 0.12 + sag);
      pos.setY(i, y - (y > 1.5 ? Math.cos((x / 6) * Math.PI) * 0.25 : 0));
    }
    cg.computeVertexNormals();
    scaleUv(cg, 6, 2);
    const curtain = new THREE.Mesh(cg, psxMaterial({ map: assets.texture('tex.curtain'), color: 0xd06070, wrap: 0.5, side: THREE.DoubleSide }));
    curtain.position.set(0, 1.9, -2.1);
    g.add(curtain);

    // Swinging bare bulb above and in front of the wheel.
    this.bulbPivot.position.set(0.6, 4.2, 1.4);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.6, 3), psxMaterial({ color: 0x111111 }));
    cord.position.y = -0.8;
    this.bulbPivot.add(cord);
    const socket = assets.fitted('mdl.socket', 0.12);
    socket.position.y = -1.7;
    this.bulbPivot.add(socket);
    this.bulbMesh = assets.fitted('mdl.bulb', 0.13);
    this.bulbMesh.rotation.x = Math.PI;
    this.bulbMesh.position.y = -1.64;
    this.bulbMesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = m.material as THREE.ShaderMaterial;
        mat.uniforms.uLit.value = 0;
        mat.uniforms.uEmissive.value.setRGB(0.4, 0.3, 0.1);
        this.bulbMat = mat;
      }
    });
    this.bulbPivot.add(this.bulbMesh);
    g.add(this.bulbPivot);

    // Fluorescent tube over the phone table.
    const tube = assets.fitted('mdl.fluorescent', 1.1);
    tube.position.set(-1.6, 2.35, 2.5);
    tube.rotation.y = Math.PI / 2;
    tube.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) this.tubeMats.push(m.material as THREE.ShaderMaterial);
    });
    g.add(tube);

    // Dust motes in the spotlight cone.
    const N = 140;
    const dp = new Float32Array(N * 3);
    this.dustVel = new Float32Array(N * 3);
    const rng = (a: number, b2: number) => a + Math.random() * (b2 - a);
    for (let i = 0; i < N; i++) {
      dp[i * 3] = rng(-1.6, 1.6);
      dp[i * 3 + 1] = rng(0.4, 3.6);
      dp[i * 3 + 2] = rng(-0.6, 1.8);
      this.dustVel[i * 3] = rng(-0.02, 0.02);
      this.dustVel[i * 3 + 1] = rng(-0.03, 0.01);
      this.dustVel[i * 3 + 2] = rng(-0.02, 0.02);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(
      dg,
      new THREE.PointsMaterial({ color: 0xd8c8a0, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    g.add(this.dust);
  }

  /** Kick the bulb (after a Bankrupt). */
  swingBulb(amount = 0.35): void {
    this.swingV += amount * (Math.random() < 0.5 ? -1 : 1);
  }

  openTrapdoor(t: number): void {
    const a = Math.min(1, t) * 1.5;
    this.trapL.rotation.z = -a;
    this.trapR.rotation.z = a;
  }

  update(dt: number, time: number): void {
    // Pendulum: θ'' = −(g/L) sin θ − damping.
    const L = 1.64;
    this.swingV += (-9.81 / L) * Math.sin(this.swing) * dt - this.swingV * 0.15 * dt;
    this.swing += this.swingV * dt;
    if (Math.abs(this.swing) < 0.02 && Math.abs(this.swingV) < 0.05) this.swingV += 0.03 * dt * Math.sin(time * 0.7);
    this.bulbPivot.rotation.z = this.swing;
    this.bulbPivot.rotation.x = this.swing * 0.35;

    const bp = new THREE.Vector3();
    this.bulbMesh.getWorldPosition(bp);
    const S = PSX_SHARED;
    const lv = this.lightLevel;
    // Warm bulb.
    S.uLightPos.value[0].copy(bp);
    S.uLightColor.value[0].setRGB(1.5 * lv * this.bulbWarmth, 1.05 * lv * this.bulbWarmth, 0.55 * lv * this.bulbWarmth);
    S.uLightRange.value[0] = 6.5;
    if (this.bulbMat) this.bulbMat.uniforms.uEmissive.value.setRGB(1.0 * lv, 0.82 * lv, 0.45 * lv);
    // Fluorescent tube (cold, flickering).
    this.flickerT -= dt;
    if (this.flickerT <= 0) {
      const bad = this.fluoFlicker > 0 ? 0.6 : 0.08;
      this.flickerOn = Math.random() < bad ? (Math.random() < 0.5 ? 0.1 : 0.6) : 1;
      this.flickerT = this.flickerOn < 1 ? 0.03 + Math.random() * 0.08 : 0.1 + Math.random() * 1.6;
    }
    this.fluoFlicker = Math.max(0, this.fluoFlicker - dt);
    const fl = this.flickerOn * lv;
    S.uLightPos.value[1].set(-1.6, 2.2, 2.5);
    S.uLightColor.value[1].setRGB(0.8 * fl, 1.0 * fl, 1.1 * fl);
    S.uLightRange.value[1] = 3.8;
    for (const m of this.tubeMats) m.uniforms.uEmissive.value.setRGB(0.5 * fl, 0.65 * fl, 0.7 * fl);
    // Prize cabinet glow (dim, greenish), always weak.
    S.uLightPos.value[2].set(1.2, 2.0, 2.4);
    S.uLightColor.value[2].setRGB(0.95 * lv, 0.8 * lv, 0.5 * lv);
    S.uLightRange.value[2] = 3.2;
    // Accent light (phone / jackpot moments).
    S.uLightPos.value[3].copy(this.accent.pos);
    S.uLightColor.value[3].copy(this.accent.color).multiplyScalar(lv);
    S.uLightRange.value[3] = 4;
    // Hard spotlight on the wheel.
    const sp = this.spotLevel * lv;
    S.uSpotPos.value.set(0, 3.8, 2.6);
    S.uSpotDir.value.set(0, -0.62, -0.78);
    S.uSpotColor.value.setRGB(1.7 * sp, 1.6 * sp, 1.35 * sp);
    S.uSpotCos.value.set(0.9, 0.955);
    S.uSpotRange.value = 8;

    // Dust drifts and wraps.
    const p = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    for (let i = 0; i < a.length; i += 3) {
      a[i] += this.dustVel[i] * dt + Math.sin(time * 0.5 + i) * 0.002;
      a[i + 1] += this.dustVel[i + 1] * dt;
      a[i + 2] += this.dustVel[i + 2] * dt;
      if (a[i + 1] < 0.3) a[i + 1] = 3.6;
    }
    p.needsUpdate = true;
    (this.dust.material as THREE.PointsMaterial).opacity = 0.5 * this.spotLevel * lv;
  }
}
