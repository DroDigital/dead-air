/**
 * Procedural low-poly artifact props. Each prop is built from a few primitives with vertex
 * colours and merged into ONE mesh (one draw call). A few use imported CC0 models.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Assets } from '../../assets/loader';
import { psxMaterial } from '../psxMaterial';

type V3 = [number, number, number];

export class PropBuilder {
  private parts: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, color: number, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.parts.push(g);
    return this;
  }
  box(color: number, size: V3, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): this {
    return this.add(new THREE.BoxGeometry(...size), color, pos, rot);
  }
  cyl(color: number, rTop: number, rBot: number, h: number, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], seg = 7): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, pos, rot);
  }
  sphere(color: number, r: number, pos: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): this {
    return this.add(new THREE.SphereGeometry(r, 6, 4), color, pos, [0, 0, 0], scale);
  }
  cone(color: number, r: number, h: number, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): this {
    return this.add(new THREE.ConeGeometry(r, h, 6), color, pos, rot);
  }
  torus(color: number, r: number, t: number, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], seg = 10, tube = 4): this {
    return this.add(new THREE.TorusGeometry(r, t, tube, seg), color, pos, rot);
  }
  build(): THREE.Mesh {
    const geo = mergeGeometries(this.parts, false)!;
    return new THREE.Mesh(geo, psxMaterial({ vertexColors: true, wrap: 0.4 }));
  }
}

/** Build a prop roughly 0.12–0.16 tall, sitting on y = 0. */
export function buildProp(prop: string, color: number, assets: Assets): THREE.Object3D {
  const b = new PropBuilder();
  const dark = 0x202020,
    bone = 0xe8e0c8,
    gold = 0xd8a830,
    red = 0xb02020;
  switch (prop) {
    case 'watch':
      return assets.fitted('mdl.pocket_watch', 0.13);
    case 'metronome':
      return assets.fitted('mdl.alarm_clock', 0.14);
    case 'coin':
      b.cyl(color, 0.05, 0.05, 0.012, [0, 0.05, 0], [Math.PI / 2, 0, 0], 10).cyl(0x8a4a20, 0.03, 0.03, 0.014, [0, 0.05, 0], [Math.PI / 2, 0, 0], 8);
      break;
    case 'pig':
      b.sphere(color, 0.06, [0, 0.06, 0], [1.3, 1, 1]).sphere(color, 0.025, [0.075, 0.065, 0]).cyl(color, 0.012, 0.012, 0.03, [-0.04, 0.012, 0.02]).cyl(color, 0.012, 0.012, 0.03, [0.04, 0.012, -0.02]).box(dark, [0.03, 0.004, 0.006], [0, 0.12, 0]);
      break;
    case 'fairy':
      b.cone(color, 0.03, 0.09, [0, 0.045, 0]).sphere(bone, 0.02, [0, 0.1, 0]).box(0xffffff, [0.005, 0.06, 0.05], [0.01, 0.08, 0.03], [0, 0, 0.5]).box(0xffffff, [0.005, 0.06, 0.05], [0.01, 0.08, -0.03], [0, 0, 0.5]);
      break;
    case 'house':
      b.box(color, [0.1, 0.07, 0.08], [0, 0.035, 0]).cone(red, 0.08, 0.06, [0, 0.1, 0], [0, Math.PI / 4, 0]);
      break;
    case 'ball':
      b.sphere(color, 0.05, [0, 0.05, 0]).torus(0x6a2010, 0.05, 0.006, [0, 0.05, 0]).torus(0x6a2010, 0.05, 0.006, [0, 0.05, 0], [Math.PI / 2, 0, 0]);
      break;
    case 'cup':
      b.cyl(color, 0.04, 0.032, 0.08, [0, 0.04, 0]).torus(color, 0.022, 0.006, [0.045, 0.045, 0]).cyl(0x2a1408, 0.036, 0.036, 0.004, [0, 0.078, 0]);
      break;
    case 'lint':
      b.sphere(color, 0.04, [0, 0.03, 0], [1.4, 0.7, 1.1]).sphere(color, 0.025, [0.04, 0.04, 0.01]);
      break;
    case 'nail':
      b.cyl(color, 0.004, 0.004, 0.1, [0, 0.03, 0], [0, 0, 1.3]).cyl(color, 0.004, 0.004, 0.06, [-0.03, 0.06, 0], [0, 0, 0.3]).cyl(color, 0.012, 0.012, 0.004, [-0.04, 0.09, 0]);
      break;
    case 'card':
      b.box(color, [0.07, 0.1, 0.004], [0, 0.05, 0], [-0.25, 0, 0]).box(0xffffff, [0.05, 0.03, 0.005], [0, 0.07, 0.006], [-0.25, 0, 0]).box(dark, [0.04, 0.006, 0.005], [0, 0.035, 0.012], [-0.25, 0, 0]);
      break;
    case 'jar':
      b.cyl(color, 0.045, 0.045, 0.1, [0, 0.05, 0]).cyl(0x404040, 0.04, 0.04, 0.012, [0, 0.105, 0]).cyl(gold, 0.03, 0.03, 0.02, [0, 0.02, 0]);
      break;
    case 'bulb':
      b.sphere(color, 0.04, [0, 0.07, 0]).cyl(0x909090, 0.02, 0.02, 0.04, [0, 0.025, 0]);
      break;
    case 'sock':
      b.box(color, [0.04, 0.1, 0.04], [0, 0.05, 0]).box(color, [0.06, 0.03, 0.04], [0.02, 0.015, 0]).box(0xffffff, [0.042, 0.015, 0.042], [0, 0.09, 0]);
      break;
    case 'roller':
      b.cyl(color, 0.03, 0.03, 0.09, [0, 0.05, 0], [0, 0, Math.PI / 2]).cyl(0xf0f0f0, 0.032, 0.032, 0.07, [0, 0.05, 0], [0, 0, Math.PI / 2]).box(dark, [0.012, 0.1, 0.012], [0.05, 0.03, 0], [0, 0, -0.5]);
      break;
    case 'tooth':
      b.box(color, [0.06, 0.05, 0.05], [0, 0.07, 0]).box(color, [0.02, 0.05, 0.03], [-0.018, 0.025, 0]).box(color, [0.02, 0.05, 0.03], [0.018, 0.025, 0]).box(dark, [0.02, 0.02, 0.052], [0, 0.08, 0]);
      break;
    case 'dice':
      b.box(color, [0.05, 0.05, 0.05], [-0.03, 0.025, 0], [0, 0.4, 0]).box(color, [0.05, 0.05, 0.05], [0.035, 0.025, 0.01], [0, -0.3, 0]).sphere(red, 0.009, [-0.03, 0.052, 0]).sphere(red, 0.009, [0.035, 0.052, 0.01]);
      break;
    case 'fence':
      for (let i = 0; i < 4; i++) b.box(color, [0.018, 0.1, 0.01], [-0.045 + i * 0.03, 0.05, 0]);
      b.box(color, [0.12, 0.012, 0.012], [0, 0.07, 0.008]).box(color, [0.12, 0.012, 0.012], [0, 0.03, 0.008]);
      break;
    case 'heart':
      b.sphere(color, 0.035, [-0.022, 0.08, 0]).sphere(color, 0.035, [0.022, 0.08, 0]).cone(color, 0.05, 0.07, [0, 0.035, 0], [Math.PI, 0, 0]).cyl(0x404040, 0.01, 0.01, 0.04, [0, 0.12, 0]);
      break;
    case 'hand':
      b.box(color, [0.06, 0.03, 0.07], [0, 0.015, 0]);
      for (let i = 0; i < 4; i++) b.box(color, [0.012, 0.012, 0.05], [-0.022 + i * 0.015, 0.012, 0.055]);
      b.box(color, [0.012, 0.012, 0.04], [0.04, 0.012, 0.01], [0, 0.8, 0]).cyl(color, 0.025, 0.028, 0.05, [0, 0.02, -0.06], [Math.PI / 2, 0, 0]);
      break;
    case 'eye':
      b.sphere(0xf8f8f0, 0.045, [0, 0.045, 0]).sphere(0x3080c0, 0.02, [0, 0.05, 0.035]).sphere(dark, 0.01, [0, 0.05, 0.048]).cyl(0x803030, 0.03, 0.035, 0.01, [0, 0.005, 0]);
      break;
    case 'bell':
      b.cone(color, 0.05, 0.08, [0, 0.05, 0]).sphere(color, 0.02, [0, 0.09, 0]).sphere(0x806020, 0.012, [0, 0.008, 0]);
      break;
    case 'flapper':
      b.box(color, [0.03, 0.12, 0.008], [0, 0.07, 0], [0, 0, 0.3]).cyl(gold, 0.012, 0.012, 0.03, [0.02, 0.13, 0], [Math.PI / 2, 0, 0]).box(0x606060, [0.06, 0.01, 0.04], [0, 0.005, 0]);
      break;
    case 'sign':
      b.box(dark, [0.13, 0.06, 0.03], [0, 0.04, 0]).box(color, [0.11, 0.04, 0.005], [0, 0.04, 0.016]).box(dark, [0.01, 0.03, 0.01], [0, 0.08, 0]);
      break;
    case 'tray':
      b.box(color, [0.11, 0.015, 0.08], [0, 0.008, 0]).box(0x8a5030, [0.04, 0.01, 0.05], [-0.025, 0.02, 0]).box(0x5a8030, [0.03, 0.01, 0.03], [0.03, 0.02, 0.015]).box(0xd0b060, [0.03, 0.01, 0.03], [0.03, 0.02, -0.02]);
      break;
    case 'rope':
      b.cyl(gold, 0.012, 0.015, 0.11, [-0.05, 0.055, 0]).cyl(gold, 0.012, 0.015, 0.11, [0.05, 0.055, 0]).torus(color, 0.05, 0.008, [0, 0.09, 0], [0, 0, Math.PI]);
      break;
    case 'magnet':
      b.torus(color, 0.04, 0.014, [0, 0.05, 0], [0, 0, 0]).box(0xd0d0d0, [0.026, 0.02, 0.028], [-0.04, 0.012, 0]).box(0xd0d0d0, [0.026, 0.02, 0.028], [0.04, 0.012, 0]);
      break;
    case 'receipt':
      b.box(color, [0.06, 0.11, 0.004], [0, 0.055, 0], [-0.1, 0.2, 0.05]);
      for (let i = 0; i < 5; i++) b.box(0x404040, [0.04, 0.004, 0.005], [0, 0.03 + i * 0.016, 0.004], [-0.1, 0.2, 0.05]);
      break;
    case 'puppet':
      b.box(0x303050, [0.06, 0.06, 0.04], [0, 0.03, 0]).sphere(color, 0.032, [0, 0.09, 0]).box(dark, [0.03, 0.006, 0.01], [0, 0.075, 0.03]).sphere(dark, 0.006, [-0.012, 0.1, 0.03]).sphere(dark, 0.006, [0.012, 0.1, 0.03]);
      break;
    case 'ticket':
      b.box(color, [0.1, 0.05, 0.004], [0, 0.03, 0], [-0.4, 0.3, 0]).box(red, [0.02, 0.05, 0.005], [-0.035, 0.03, 0.002], [-0.4, 0.3, 0]);
      break;
    case 'mask':
      b.sphere(color, 0.05, [0, 0.06, 0], [1, 1.2, 0.5]).sphere(dark, 0.01, [-0.018, 0.075, 0.024]).sphere(dark, 0.01, [0.018, 0.075, 0.024]).box(dark, [0.03, 0.005, 0.01], [0, 0.04, 0.024]);
      break;
    case 'tv':
      b.box(0x5a4a3a, [0.1, 0.08, 0.07], [0, 0.04, 0]).box(color, [0.075, 0.055, 0.005], [0, 0.042, 0.036]).cyl(0x808080, 0.002, 0.002, 0.06, [0.02, 0.1, 0], [0, 0, -0.5]).cyl(0x808080, 0.002, 0.002, 0.06, [-0.02, 0.1, 0], [0, 0, 0.5]);
      break;
    case 'mirror':
      b.cyl(gold, 0.05, 0.05, 0.01, [0, 0.06, 0], [Math.PI / 2 - 0.2, 0, 0], 10).cyl(color, 0.042, 0.042, 0.011, [0, 0.06, 0.002], [Math.PI / 2 - 0.2, 0, 0], 10).box(gold, [0.012, 0.04, 0.012], [0, 0.015, -0.01]);
      break;
    case 'ring':
      b.torus(color, 0.04, 0.01, [0, 0.05, 0]).sphere(0xff3040, 0.015, [0, 0.095, 0]);
      break;
    case 'mic':
      b.sphere(color, 0.03, [0, 0.11, 0]).cyl(color, 0.012, 0.016, 0.08, [0, 0.05, 0]).cyl(dark, 0.03, 0.035, 0.012, [0, 0.006, 0]);
      break;
    case 'lever':
      b.box(0x404040, [0.08, 0.02, 0.05], [0, 0.01, 0]).cyl(color, 0.008, 0.008, 0.1, [0, 0.06, 0], [0, 0, 0.4]).sphere(red, 0.016, [-0.02, 0.11, 0]);
      break;
    case 'reel':
      b.cyl(color, 0.055, 0.055, 0.02, [0, 0.06, 0], [Math.PI / 2, 0, 0], 10).cyl(0x9a9a9a, 0.015, 0.015, 0.024, [0, 0.06, 0], [Math.PI / 2, 0, 0]).box(0x5a3a20, [0.12, 0.012, 0.012], [0, 0.04, 0.012], [0, 0, 0.3]);
      break;
    case 'pen':
      b.cyl(color, 0.008, 0.008, 0.12, [0, 0.01, 0], [0, 0.4, Math.PI / 2]).cone(gold, 0.008, 0.02, [0.07, 0.01, -0.03], [0, 0.4, -Math.PI / 2]);
      break;
    case 'tube':
      b.cyl(color, 0.025, 0.025, 0.09, [0, 0.055, 0]).sphere(color, 0.025, [0, 0.1, 0]).cyl(0x303030, 0.028, 0.028, 0.02, [0, 0.01, 0]).box(0xffe080, [0.01, 0.03, 0.01], [0, 0.06, 0]);
      break;
    case 'antenna':
      b.sphere(0x404040, 0.03, [0, 0.02, 0], [1.4, 0.6, 1]).cyl(color, 0.003, 0.003, 0.14, [-0.03, 0.08, 0], [0, 0, 0.5]).cyl(color, 0.003, 0.003, 0.14, [0.03, 0.08, 0], [0, 0, -0.5]);
      break;
    case 'letter':
      b.box(color, [0.02, 0.11, 0.015], [-0.03, 0.055, 0], [0, 0, -0.3]).box(color, [0.02, 0.11, 0.015], [0.03, 0.055, 0], [0, 0, 0.3]).box(color, [0.05, 0.016, 0.015], [0, 0.045, 0]);
      break;
    case 'foot':
      b.sphere(color, 0.03, [0, 0.03, 0], [1.6, 0.8, 1]).cyl(color, 0.015, 0.02, 0.06, [-0.03, 0.06, 0], [0, 0, 0.5]).cyl(gold, 0.004, 0.004, 0.05, [-0.05, 0.1, 0]);
      break;
    case 'paw':
      b.cyl(color, 0.015, 0.02, 0.07, [0, 0.035, 0]);
      for (let i = 0; i < 3; i++) b.cyl(color, 0.005, 0.007, 0.05, [-0.012 + i * 0.012, 0.09, 0], [0, 0, (i - 1) * 0.3]);
      break;
    case 'cat':
      b.sphere(color, 0.035, [0, 0.035, 0], [1.3, 1, 1]).sphere(color, 0.025, [0.04, 0.07, 0]).cone(color, 0.008, 0.02, [0.033, 0.095, 0.01]).cone(color, 0.008, 0.02, [0.048, 0.095, -0.01]).sphere(0xe0e040, 0.005, [0.062, 0.075, 0.01]).sphere(0xe0e040, 0.005, [0.062, 0.075, -0.01]);
      break;
    case 'board':
      b.box(color, [0.13, 0.008, 0.09], [0, 0.004, 0]).box(dark, [0.03, 0.012, 0.03], [0.02, 0.012, 0.01], [0, 0.4, 0]);
      break;
    case 'vhs':
      b.box(color, [0.1, 0.02, 0.06], [0, 0.01, 0]).box(0xe0e0e0, [0.06, 0.021, 0.03], [0, 0.011, 0.005]);
      break;
    default:
      b.box(color, [0.08, 0.08, 0.08], [0, 0.04, 0]);
  }
  return b.build();
}
