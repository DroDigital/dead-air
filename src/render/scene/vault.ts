/**
 * The Vault: a riveted safe with a nixie counter, the big red DEPOSIT button, and the
 * Scratch Card slot (3 cards).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Assets } from '../../assets/loader';
import { scratchDef } from '../../content/scratchCards';
import { drawText, wrapText } from '../../ui/bitfont';
import { psxMaterial, type PsxMaterial } from '../psxMaterial';
import { CanvasPanel, hexCss, panelMesh, pickable } from './util';
import { worldNumber } from './worldNumbers';

export class VaultView {
  readonly group = new THREE.Group();
  private nixie: CanvasPanel;
  private shown = 0;
  private target = 0;
  private button: THREE.Mesh;
  private buttonMat: PsxMaterial;
  private press = 0;
  private cards: { mesh: THREE.Mesh; panel: CanvasPanel; mat: PsxMaterial; id: string | null }[] = [];
  onTick?: () => void;
  private tickAcc = 0;
  shake = 0;

  constructor(assets: Assets) {
    const g = this.group;
    g.position.set(0.42, 0.64, 2.45);
    const metal = psxMaterial({ map: assets.texture('tex.metal'), color: 0x5a6a6a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.3), metal);
    body.position.y = 0.14;
    pickable(body, 'vault');
    g.add(body);
    // Rivets (one merged geometry).
    const rivets: THREE.BufferGeometry[] = [];
    for (const x of [-0.18, 0.18]) for (const y of [0.03, 0.25]) {
      const r = new THREE.SphereGeometry(0.012, 4, 3);
      r.translate(x, y, 0.151);
      rivets.push(r);
    }
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), psxMaterial({ color: 0xb0b0b0 }));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0.12, 0.1, 0.16);
    g.add(dial);
    g.add(new THREE.Mesh(mergeGeometries(rivets)!, metal));
    // Nixie counter on the front.
    this.nixie = new CanvasPanel(96, 24);
    const nx = panelMesh(this.nixie, 0.32, 0.08);
    nx.position.set(-0.04, 0.2, 0.153);
    g.add(nx);
    // DEPOSIT button (to the left of the vault, on the desk).
    this.buttonMat = psxMaterial({ color: 0xd02018, emissive: 0x300000 });
    this.button = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.05, 10), this.buttonMat);
    this.button.position.set(-0.34, 0.03, 0.05);
    pickable(this.button, 'deposit');
    g.add(this.button);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 10), psxMaterial({ color: 0x202020 }));
    ring.position.set(-0.34, 0.005, 0.05);
    g.add(ring);
    const lbl = new CanvasPanel(64, 10);
    lbl.draw((ctx, w, h) => {
      ctx.fillStyle = '#100808';
      ctx.fillRect(0, 0, w, h);
      drawText(ctx, 'DEPOSIT', w / 2, 1, { align: 'center', color: '#ffd0a0' });
    });
    const lm = panelMesh(lbl, 0.2, 0.031);
    lm.rotation.x = -Math.PI / 2;
    lm.position.set(-0.34, 0.005, 0.16);
    g.add(lm);
    // Scratch card slot: three cards lying in front of the console.
    for (let i = 0; i < 3; i++) {
      const panel = new CanvasPanel(32, 48);
      const mat = psxMaterial({ map: panel.texture, lit: true, wrap: 0.6 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.15), mat);
      mesh.rotation.x = -Math.PI / 2 + 0.25;
      mesh.position.set(-0.66 + i * 0.12, 0.01, 0.2);
      pickable(mesh, `scratch:${i}`);
      g.add(mesh);
      this.cards.push({ mesh, panel, mat, id: null });
    }
    this.setVault(0, true);
  }

  setVault(v: number, instant = false): void {
    this.target = v;
    if (instant) {
      this.shown = v;
      this.drawNixie(v);
    }
  }

  private drawNixie(v: number): void {
    this.nixie.draw((ctx, w, h) => {
      ctx.fillStyle = '#0a0503';
      ctx.fillRect(0, 0, w, h);
      const amount = worldNumber(v, 7);
      const digits = amount.padStart(7, amount.startsWith('~') || amount === '∞' || amount === '?' ? ' ' : '0');
      for (let i = 0; i < digits.length; i++) {
        const x = 4 + i * 13;
        ctx.fillStyle = '#1a0c06';
        ctx.fillRect(x - 1, 2, 11, 20);
        const lit = i >= digits.length - amount.length;
        drawText(ctx, digits[i], x + 5, 5, { align: 'center', scale: 2, color: lit ? '#ff9a30' : '#3a1a08', shadow: lit ? '#a02000' : null });
      }
    });
  }

  setCards(ids: string[], usable: boolean[]): void {
    this.cards.forEach((c, i) => {
      const id = ids[i] ?? null;
      c.id = id;
      c.mesh.visible = !!id;
      if (!id) return;
      const def = scratchDef(id);
      c.panel.draw((ctx, w, h) => {
        ctx.fillStyle = '#e8dcc0';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = hexCss(def.color);
        ctx.fillRect(2, 2, w - 4, 14);
        const lines = wrapText(def.name.toUpperCase(), 5);
        lines.forEach((l, k) => drawText(ctx, l, w / 2, 20 + k * 8, { align: 'center', color: '#201810' }));
        ctx.fillStyle = '#a8a8a8';
        ctx.fillRect(3, h - 12, w - 6, 9);
      });
      c.mat.uniforms.uEmissive.value.setRGB(usable[i] ? 0.08 : 0, usable[i] ? 0.07 : 0, usable[i] ? 0.03 : 0);
    });
  }

  pressButton(): void {
    this.press = 1;
  }

  update(dt: number, _time: number, speed: number): void {
    if (this.shown !== this.target) {
      const diff = this.target - this.shown;
      const step = Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, dt * 6 * speed));
      this.shown = Math.abs(step) >= Math.abs(diff) ? this.target : this.shown + step;
      this.drawNixie(this.shown);
      this.tickAcc += dt;
      if (this.tickAcc > 0.04) {
        this.tickAcc = 0;
        this.onTick?.();
      }
    }
    this.press = Math.max(0, this.press - dt * 4);
    this.button.position.y = 0.03 - this.press * 0.025;
    this.buttonMat.uniforms.uEmissive.value.setRGB(0.2 + this.press * 0.6, 0.0, 0.0);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.group.position.x = 0.42 + Math.sin(_time * 80) * 0.006 * this.shake;
    }
  }
}
