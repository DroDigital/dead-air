/**
 * The lever on the chair arm, and the little display under it that counts the spins left.
 */
import * as THREE from 'three';
import { drawText } from '../../ui/bitfont';
import { psxMaterial } from '../psxMaterial';
import { CanvasPanel, panelMesh, pickable } from './util';
import { PropBuilder } from './props';

export class LeverView {
  readonly group = new THREE.Group();
  private arm = new THREE.Group();
  private display: CanvasPanel;
  pull = 0;

  constructor() {
    const g = this.group;
    g.position.set(0.74, 0.64, 2.24);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.2), psxMaterial({ color: 0x3a3a3a }));
    base.position.y = 0.04;
    g.add(base);
    const arm = new PropBuilder().cyl(0xc8c8c8, 0.012, 0.012, 0.3, [0, 0.15, 0], [0, 0, 0], 5).sphere(0xd02018, 0.04, [0, 0.31, 0]).build();
    this.arm.add(arm);
    pickable(arm, 'lever');
    this.arm.position.y = 0.06;
    this.arm.rotation.x = -0.35;
    g.add(this.arm);
    pickable(base, 'lever');
    this.display = new CanvasPanel(64, 40);
    const dm = panelMesh(this.display, 0.22, 0.1375, { lit: false });
    dm.position.set(-0.2, 0.36, -0.02);
    dm.rotation.set(-0.15, 0.35, 0);
    g.add(dm);
    pickable(dm, 'lever');
    this.drawDisplay('');
  }

  /** The display under the lever: the spins left, or a dash when the lever is not live. */
  drawDisplay(label: string): void {
    this.display.draw((ctx, w, h) => {
      ctx.fillStyle = '#100a06';
      ctx.fillRect(0, 0, w, h);
      drawText(ctx, label, w / 2, h - 6, { align: 'center', color: '#c8b080' });
    });
  }

  update(dt: number): void {
    const target = -0.35 + this.pull * 1.1;
    this.arm.rotation.x += (target - this.arm.rotation.x) * Math.min(1, dt * 18);
  }
}
