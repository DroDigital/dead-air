/**
 * LEFT station: the artifact shelf (6 slots) — objects jiggle and glow when they trigger.
 */
import * as THREE from 'three';
import type { Assets } from '../../assets/loader';
import { artifactDef } from '../../content/artifacts';
import type { ArtifactInstance } from '../../game/types';
import { drawText } from '../../ui/bitfont';
import { psxMaterial } from '../psxMaterial';
import { Batcher, CanvasPanel, panelMesh, pickable } from './util';
import { buildProp } from './props';

export const SHELF_SLOTS = 6;

interface Slot {
  anchor: THREE.Group;
  prop: THREE.Object3D | null;
  id: string | null;
  uid: number;
  jiggle: number;
  glow: number;
}

export class ShelfView {
  readonly group = new THREE.Group();
  private slots: Slot[] = [];
  private label: CanvasPanel;
  selected = -1;

  constructor(private assets: Assets) {
    const g = this.group;
    const b = new Batcher();
    const wood = () => psxMaterial({ map: assets.texture('tex.cabinet_wood'), color: 0x9a7050 });
    // Shelf runs along z on the left wall; slot 0 is leftmost from the player's view (highest z).
    b.box('wood', wood, [0.3, 0.04, 1.75], [-2.05, 1.2, 2.8]);
    b.box('wood', wood, [0.3, 0.04, 1.75], [-2.05, 1.62, 2.8]);
    b.box('wood', wood, [0.04, 0.5, 1.75], [-2.19, 1.42, 2.8]);
    b.box('wood', wood, [0.3, 0.46, 0.04], [-2.05, 1.42, 3.66]);
    b.box('wood', wood, [0.3, 0.46, 0.04], [-2.05, 1.42, 1.94]);
    b.build(g);
    for (let i = 0; i < SHELF_SLOTS; i++) {
      const anchor = new THREE.Group();
      anchor.position.set(-2.03, 1.22, 3.5 - i * 0.27);
      anchor.rotation.y = Math.PI / 2;
      g.add(anchor);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), psxMaterial({ transparent: true, opacity: 0 }));
      hit.position.y = 0.09;
      hit.layers.set(1); // pick-only: not rendered, still raycast
      pickable(hit, `artifact:${i}`);
      anchor.add(hit);
      this.slots.push({ anchor, prop: null, id: null, uid: -1, jiggle: 0, glow: 0 });
    }
    this.label = new CanvasPanel(96, 10);
    this.label.draw((ctx, w, h) => {
      ctx.fillStyle = '#1a0e08';
      ctx.fillRect(0, 0, w, h);
      drawText(ctx, 'ARTIFACTS  1-6', w / 2, 1, { align: 'center', color: '#d8b070' });
    });
    const lm = panelMesh(this.label, 0.5, 0.052, { lit: true });
    lm.position.set(-1.89, 1.68, 2.8);
    lm.rotation.y = Math.PI / 2;
    g.add(lm);
  }

  setArtifacts(arts: ArtifactInstance[]): void {
    for (let i = 0; i < SHELF_SLOTS; i++) {
      const s = this.slots[i];
      const a = arts[i];
      if (s.uid === (a?.uid ?? -1) && s.id === (a?.id ?? null)) continue;
      if (s.prop) s.anchor.remove(s.prop);
      s.prop = null;
      s.id = a?.id ?? null;
      s.uid = a?.uid ?? -1;
      if (a) {
        const def = artifactDef(a.id);
        s.prop = buildProp(def.prop, def.color, this.assets);
        s.anchor.add(s.prop);
        s.jiggle = 0.6;
      }
    }
  }

  trigger(slot: number): void {
    const s = this.slots[slot];
    if (!s) return;
    s.jiggle = 1;
    s.glow = 1;
  }

  /** World position above a slot (for floating text). */
  slotWorld(slot: number): THREE.Vector3 {
    const v = new THREE.Vector3(0, 0.25, 0);
    this.slots[Math.max(0, Math.min(SHELF_SLOTS - 1, slot))].anchor.localToWorld(v);
    return v;
  }

  update(dt: number, time: number): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s.prop) continue;
      s.jiggle = Math.max(0, s.jiggle - dt * 2.2);
      s.glow = Math.max(0, s.glow - dt * 1.6);
      const j = s.jiggle;
      s.prop.rotation.z = Math.sin(time * 40) * 0.25 * j;
      s.prop.position.y = Math.abs(Math.sin(time * 25)) * 0.04 * j + (i === this.selected ? 0.03 + Math.sin(time * 4) * 0.01 : 0);
      s.prop.scale.setScalar(1 + 0.3 * j);
      s.prop.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) (m.material as THREE.ShaderMaterial).uniforms.uEmissive.value.setRGB(0.7 * s.glow + (i === this.selected ? 0.15 : 0), 0.55 * s.glow + (i === this.selected ? 0.12 : 0), 0.1 * s.glow);
      });
    }
  }
}
