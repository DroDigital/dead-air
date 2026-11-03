/**
 * The pull lever on the chair arm, with its power meter gauge (oscillating needle, sweet band).
 */
import * as THREE from 'three';
import { drawText } from '../../ui/bitfont';
import { psxMaterial } from '../psxMaterial';
import { CanvasPanel, panelMesh, pickable } from './util';

export class LeverView {
  readonly group = new THREE.Group();
  private arm = new THREE.Group();
  private gauge: CanvasPanel;
  pull = 0;

  constructor() {
    const g = this.group;
    g.position.set(0.74, 0.64, 2.24);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.2), psxMaterial({ color: 0x3a3a3a }));
    base.position.y = 0.04;
    g.add(base);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), psxMaterial({ color: 0xc8c8c8 }));
    shaft.position.y = 0.15;
    this.arm.add(shaft);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), psxMaterial({ color: 0xc81818, emissive: 0x200000 }));
    ball.position.y = 0.31;
    this.arm.add(ball);
    pickable(ball, 'lever');
    pickable(shaft, 'lever');
    this.arm.position.y = 0.06;
    this.arm.rotation.x = -0.35;
    g.add(this.arm);
    pickable(base, 'lever');
    this.gauge = new CanvasPanel(64, 40);
    const gm = panelMesh(this.gauge, 0.22, 0.1375, { lit: false });
    gm.position.set(-0.2, 0.36, -0.02);
    gm.rotation.set(-0.15, 0.35, 0);
    g.add(gm);
    pickable(gm, 'lever');
    this.drawGauge(0, 0.76, 0.055, false, false);
  }

  drawGauge(power: number, sweetCenter: number, sweetHalf: number, charging: boolean, peek: boolean, label?: string): void {
    this.gauge.draw((ctx, w, h) => {
      ctx.fillStyle = '#100a06';
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2,
        cy = h - 6,
        r = 26;
      // Arc ticks.
      for (let i = 0; i <= 20; i++) {
        const a = Math.PI + (i / 20) * Math.PI;
        const p = i / 20;
        const inSweet = Math.abs(p - sweetCenter) <= sweetHalf + 0.025;
        ctx.fillStyle = inSweet ? '#40ff60' : '#c8b080';
        const x = cx + Math.cos(a) * r,
          y = cy + Math.sin(a) * r;
        ctx.fillRect(Math.round(x), Math.round(y), inSweet ? 2 : 1, inSweet ? 2 : 1);
      }
      // Sweet band arc.
      ctx.strokeStyle = '#20a040';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, Math.PI + (sweetCenter - sweetHalf) * Math.PI, Math.PI + (sweetCenter + sweetHalf) * Math.PI);
      ctx.stroke();
      // Needle.
      const a = Math.PI + power * Math.PI;
      ctx.strokeStyle = charging ? '#ff3020' : '#806050';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(Math.round(cx + Math.cos(a) * (r - 2)), Math.round(cy + Math.sin(a) * (r - 2)));
      ctx.stroke();
      ctx.fillStyle = '#d0a030';
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
      drawText(ctx, label ?? (charging ? 'RELEASE!' : 'HOLD'), cx, h - 6, { align: 'center', color: charging ? '#ffd040' : '#806850' });
      if (peek) drawText(ctx, 'EYE', 4, 2, { color: '#80c0ff' });
    });
  }

  update(dt: number): void {
    const target = -0.35 + this.pull * 1.1;
    this.arm.rotation.x += (target - this.arm.rotation.x) * Math.min(1, dt * 18);
  }
}
