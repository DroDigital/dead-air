import { expect, it } from 'vitest';
import * as THREE from 'three';
import { StudioView } from '../src/render/scene/studio';

it('keeps drifting dust in the studio volume', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([1.6, 1, 1.8]), 3));
  const studio: StudioView = Object.assign(Object.create(StudioView.prototype), {
    swing: 0.05, swingV: 0, bulbPivot: new THREE.Group(), bulbMesh: new THREE.Group(), bulbMat: null,
    lightLevel: 1, bulbWarmth: 1, spotLevel: 1, fluoFlicker: 0, flickerT: 1, flickerOn: 1,
    tubeMats: [], accent: { color: new THREE.Color(), pos: new THREE.Vector3() },
    dust: new THREE.Points(geometry, new THREE.PointsMaterial()), dustVel: new Float32Array([0.02, 0, 0.02]),
  });
  studio.update(1, 0);
  const p = geometry.getAttribute('position');
  expect(p.getX(0)).toBeGreaterThanOrEqual(-1.6);
  expect(p.getX(0)).toBeLessThanOrEqual(1.6);
  expect(p.getZ(0)).toBeGreaterThanOrEqual(-0.6);
  expect(p.getZ(0)).toBeLessThanOrEqual(1.8);
});
