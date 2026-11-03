import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { psxMaterial, psxTexture, type PsxMaterial, type PsxOptions } from '../psxMaterial';

/** A canvas-backed texture with a redraw helper. */
export class CanvasPanel {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.texture = psxTexture(new THREE.CanvasTexture(this.canvas), false);
  }
  draw(fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
    this.ctx.imageSmoothingEnabled = false;
    fn(this.ctx, this.w, this.h);
    this.texture.needsUpdate = true;
  }
}

/** A flat quad showing a CanvasPanel. */
export function panelMesh(panel: CanvasPanel, width: number, height: number, opts: PsxOptions = {}): THREE.Mesh<THREE.PlaneGeometry, PsxMaterial> {
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), psxMaterial({ map: panel.texture, lit: false, fog: 0.4, ...opts }));
}

/**
 * Collects static geometry per material and merges it into one mesh per material,
 * keeping the draw-call count low.
 */
export class Batcher {
  private groups = new Map<string, { mat: PsxMaterial; geos: THREE.BufferGeometry[] }>();
  add(key: string, mat: () => PsxMaterial, geo: THREE.BufferGeometry, m: THREE.Matrix4 | THREE.Object3D, color?: number): void {
    let g = this.groups.get(key);
    if (!g) {
      g = { mat: mat(), geos: [] };
      this.groups.set(key, g);
    }
    const geom = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!geom.getAttribute('uv')) geom.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((geom.getAttribute('position').count) * 2), 2));
    if (m instanceof THREE.Object3D) {
      m.updateMatrix();
      geom.applyMatrix4(m.matrix);
    } else geom.applyMatrix4(m);
    for (const name of Object.keys(geom.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geom.deleteAttribute(name);
    if (color !== undefined) {
      const c = new THREE.Color(color);
      const n = geom.getAttribute('position').count;
      const cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
      geom.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    }
    g.geos.push(geom);
  }
  box(key: string, mat: () => PsxMaterial, size: [number, number, number], pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], uvScale = 1, color?: number): void {
    const geo = new THREE.BoxGeometry(...size);
    if (uvScale !== 1) scaleUv(geo, uvScale * size[0], uvScale * size[1]);
    this.add(key, mat, geo, at(pos, rot), color);
  }
  build(parent: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const { mat, geos } of this.groups.values()) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      parent.add(mesh);
      out.push(mesh);
    }
    this.groups.clear();
    return out;
  }
}

export function at(pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
}

export function scaleUv(geo: THREE.BufferGeometry, su: number, sv: number): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
}

export function hexCss(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

/** Tag an object as pickable for the input system. */
export function pickable(o: THREE.Object3D, id: string, tooltip?: () => string): THREE.Object3D {
  o.userData.pick = id;
  if (tooltip) o.userData.tooltip = tooltip;
  return o;
}

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
