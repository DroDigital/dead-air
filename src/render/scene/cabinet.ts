/**
 * RIGHT station: the Prize Cabinet (glass case, crank, token counter, service board) and the
 * Network debt board (flip-clock of spins left + placard of the amount due, which drips).
 */
import * as THREE from 'three';
import type { Assets } from '../../assets/loader';
import { artifactDef } from '../../content/artifacts';
import { scratchDef } from '../../content/scratchCards';
import { WEDGES } from '../../content/wedges';
import type { ShopState } from '../../game/types';
import { drawText, wrapText } from '../../ui/bitfont';
import { psxMaterial, type PsxMaterial } from '../psxMaterial';
import { PropBuilder, buildProp } from './props';
import { CanvasPanel, hexCss, panelMesh, pickable } from './util';
import { worldNumber } from './worldNumbers';

export const SERVICE_BUTTONS = ['remove', 'gild', 'widen', 'narrow', 'reroll', 'done'] as const;
export type ServiceButton = (typeof SERVICE_BUTTONS)[number];

export class CabinetView {
  readonly group = new THREE.Group();
  private itemAnchors: THREE.Group[] = [];
  private itemObjs: (THREE.Object3D | null)[] = [];
  private itemKeys: string[] = [];
  private tags: CanvasPanel;
  private services: CanvasPanel;
  private flip: CanvasPanel;
  private placard: CanvasPanel;
  private crank = new THREE.Group();
  private crankSpin = 0;
  private glassMat: PsxMaterial;
  private drips: THREE.InstancedMesh;
  private dripState: { x: number; y: number; v: number }[] = [];
  open = false;
  selectedService: ServiceButton | null = null;
  dripping = 0;
  private lastFlip = -1;
  private tokenCount = 0;
  private flipAnim = 0;

  constructor(private assets: Assets) {
    const g = this.group;
    // Cabinet body (imported CC0 model, decimated) facing the player.
    const body = assets.fitted('mdl.prize_cabinet', 1.55);
    body.position.set(2.15, 0, 2.75);
    body.rotation.y = -Math.PI / 2;
    g.add(body);
    // Glass display case on top of / in front of the cabinet.
    this.glassMat = psxMaterial({ color: 0xa0d0c0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.9), this.glassMat);
    glass.position.set(1.85, 1.2, 2.75);
    glass.renderOrder = 2;
    g.add(glass);
    // Display base + debt-board backing (untextured, one mesh).
    g.add(new PropBuilder().box(0x5a3a22, [0.46, 0.05, 0.94], [1.85, 0.88, 2.75]).box(0x3a2a1c, [0.05, 0.82, 0.72], [2.3, 1.62, 1.55]).build());
    // Display slots: row 1 = 3 artifacts, row 2 = 2 wedges + 1 card.
    const slots: [number, number][] = [
      [1.32, 3.02],
      [1.32, 2.75],
      [1.32, 2.48],
      [0.98, 3.0],
      [0.98, 2.72],
      [0.98, 2.46],
    ];
    slots.forEach(([y, z], i) => {
      const a = new THREE.Group();
      a.position.set(1.82, y, z);
      a.rotation.y = -Math.PI / 2;
      g.add(a);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.2), psxMaterial());
      hit.position.y = 0.08;
      hit.layers.set(1);
      pickable(hit, `shop:${i}`);
      a.add(hit);
      this.itemAnchors.push(a);
      this.itemObjs.push(null);
      this.itemKeys.push('');
    });
    // Price tags across the glass front (one panel).
    this.tags = new CanvasPanel(128, 80);
    const tagMesh = panelMesh(this.tags, 0.88, 0.55, { transparent: true, alphaTest: 0.5 });
    tagMesh.position.set(1.62, 1.235, 2.75);
    tagMesh.rotation.y = -Math.PI / 2;
    g.add(tagMesh);
    // The token counter is drawn into the top row of the tags panel.
    // Crank on the side (reroll).
    const crankMesh = new PropBuilder()
      .cyl(0x806040, 0.05, 0.05, 0.04, [0, 0, 0], [Math.PI / 2, 0, 0], 8)
      .box(0xb0b0b0, [0.02, 0.14, 0.02], [0, 0.07, 0])
      .cyl(0xa02020, 0.018, 0.018, 0.06, [0, 0.14, 0.03], [Math.PI / 2, 0, 0], 6)
      .build();
    this.crank.add(crankMesh);
    this.crank.position.set(1.85, 1.15, 2.16);
    pickable(crankMesh, 'crank');
    g.add(this.crank);
    // Service board: one panel, buttons resolved by UV.
    this.services = new CanvasPanel(96, 48);
    const sm = panelMesh(this.services, 0.5, 0.25, { lit: true });
    sm.position.set(1.66, 0.62, 2.75);
    sm.rotation.y = -Math.PI / 2;
    pickable(sm, 'services');
    g.add(sm);

    // Debt board on the right wall: flip clock + placard.
    // Flip clock (top half) and placard (bottom half) share one panel.
    this.flip = new CanvasPanel(64, 64);
    this.placard = this.flip;
    const fm = panelMesh(this.flip, 0.62, 0.62);
    fm.position.set(2.27, 1.62, 1.55);
    fm.rotation.y = -Math.PI / 2;
    pickable(fm, 'debtboard');
    g.add(fm);
    // Drips under the placard (red, like the ink is bleeding).
    this.drips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.02, 0.008), psxMaterial({ color: 0x700808, emissive: 0x200000 }), 12);
    this.drips.count = 0;
    g.add(this.drips);
    this.drawServices();
  }

  setShop(shop: ShopState | null, tokens: number, canAfford: (cost: number) => boolean): void {
    this.open = !!shop;
    this.tokenCount = tokens;
    for (let i = 0; i < this.itemAnchors.length; i++) {
      const it = shop?.items[i];
      const key = it && !it.sold ? `${it.type}:${it.id}:${it.wedge?.uid ?? ''}` : '';
      if (key === this.itemKeys[i]) continue;
      this.itemKeys[i] = key;
      const a = this.itemAnchors[i];
      const old = this.itemObjs[i];
      if (old) a.remove(old);
      this.itemObjs[i] = null;
      if (!it || it.sold) continue;
      let obj: THREE.Object3D;
      if (it.type === 'artifact') {
        const d = artifactDef(it.id);
        obj = buildProp(d.prop, d.color, this.assets);
      } else if (it.type === 'wedge') {
        const p = new CanvasPanel(24, 32);
        const def = WEDGES[it.wedge!.kind];
        p.draw((ctx, w, h) => {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = hexCss(def.color);
          ctx.beginPath();
          ctx.moveTo(w / 2, h);
          ctx.lineTo(0, 0);
          ctx.lineTo(w, 0);
          ctx.closePath();
          ctx.fill();
          const label = it.wedge!.kind === 'cash' ? `$${it.wedge!.value}` : def.glyph;
          wrapText(label, 4).forEach((l, k) => drawText(ctx, l, w / 2, 3 + k * 8, { align: 'center', color: hexCss(def.ink) }));
        });
        obj = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.17), psxMaterial({ map: p.texture, wrap: 0.6 }));
        obj.position.y = 0.09;
      } else {
        const p = new CanvasPanel(24, 32);
        const d = scratchDef(it.id);
        p.draw((ctx, w, h) => {
          ctx.fillStyle = '#e8dcc0';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = hexCss(d.color);
          ctx.fillRect(2, 2, w - 4, 10);
          wrapText(d.name.toUpperCase(), 4).forEach((l, k) => drawText(ctx, l, w / 2, 14 + k * 8, { align: 'center', color: '#201810' }));
        });
        obj = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.14), psxMaterial({ map: p.texture, wrap: 0.6 }));
        obj.position.y = 0.08;
      }
      a.add(obj);
      this.itemObjs[i] = obj;
    }
    this.tags.draw((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0a0503';
      ctx.fillRect(w / 2 - 30, 0, 60, 12);
      drawText(ctx, `TOK ${worldNumber(this.tokenCount, 6)}`, w / 2, 3, { align: 'center', color: '#ffc040' });
      ctx.translate(0, 16);
      if (!shop) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        drawText(ctx, 'CLOSED', w / 2, h / 2 - 3, { align: 'center', color: '#c03020', scale: 2, shadow: '#000' });
        return;
      }
      const pos: [number, number][] = [
        [20, 26],
        [64, 26],
        [108, 26],
        [20, 58],
        [64, 58],
        [108, 58],
      ];
      shop.items.forEach((it, i) => {
        const [x, y] = pos[i] ?? [0, 0];
        if (it.sold) {
          drawText(ctx, 'SOLD', x, y - 6, { align: 'center', color: '#808080', shadow: '#000' });
          return;
        }
        drawText(ctx, `${it.cost}T`, x, y - 6, { align: 'center', color: canAfford(it.cost) ? '#ffe080' : '#a04030', shadow: '#000' });
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    });
    this.drawServices();
  }

  private drawServices(): void {
    this.services.draw((ctx, w, h) => {
      ctx.fillStyle = '#1a120a';
      ctx.fillRect(0, 0, w, h);
      const labels: Record<ServiceButton, string> = { remove: 'REMOVE', gild: 'GILD', widen: 'WIDEN', narrow: 'NARROW', reroll: 'REROLL', done: 'DONE' };
      SERVICE_BUTTONS.forEach((b, i) => {
        const x = (i % 2) * 48,
          y = Math.floor(i / 2) * 16;
        const sel = this.selectedService === b;
        ctx.fillStyle = b === 'done' ? '#3a1010' : sel ? '#806020' : '#30241a';
        ctx.fillRect(x + 1, y + 1, 46, 14);
        drawText(ctx, labels[b], x + 24, y + 4, { align: 'center', color: this.open ? '#f0d8a0' : '#605040' });
      });
    });
  }

  setSelectedService(s: ServiceButton | null): void {
    this.selectedService = s;
    this.drawServices();
  }

  /** Map a UV hit on the service board to a button. */
  static serviceAt(uv: THREE.Vector2): ServiceButton {
    const col = uv.x < 0.5 ? 0 : 1;
    const row = Math.min(2, Math.floor((1 - uv.y) * 3));
    return SERVICE_BUTTONS[row * 2 + col];
  }

  turnCrank(): void {
    this.crankSpin += Math.PI * 2;
  }

  setDebt(spinsLeft: number, debt: number, vault: number, deadline: number, mutator: string | null): void {
    if (spinsLeft !== this.lastFlip) {
      this.lastFlip = spinsLeft;
      this.flipAnim = 1;
    }
    this.flip.draw((ctx, w) => {
      const h = 32;
      ctx.fillStyle = '#080808';
      ctx.fillRect(0, 0, w, h);
      const s = String(Math.max(0, spinsLeft)).padStart(2, '0');
      for (let i = 0; i < 2; i++) {
        const x = 8 + i * 26;
        ctx.fillStyle = '#202020';
        ctx.fillRect(x, 3, 22, 24);
        drawText(ctx, s[i], x + 11, 8, { align: 'center', scale: 2, color: '#f0f0e0' });
        ctx.fillStyle = '#000';
        ctx.fillRect(x, 15, 22, 1);
      }
      drawText(ctx, 'SPINS', w / 2, 27, { align: 'center', color: '#808070' });
    });
    this.placard.draw((ctx, w) => {
      ctx.translate(0, 32);
      const h = 32;
      ctx.fillStyle = '#d8ccb0';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3a0808';
      ctx.fillRect(0, 0, w, 9);
      drawText(ctx, deadline > 8 ? `DUE ∞${worldNumber(deadline, 5)}` : `DUE #${deadline}`, w / 2, 1, { align: 'center', color: '#ffd0c0' });
      drawText(ctx, `$${worldNumber(debt, 9)}`, w / 2, 12, { align: 'center', color: vault >= debt ? '#205020' : '#801010', scale: 1 });
      drawText(ctx, mutator ? 'SWEEPS!' : `V $${worldNumber(vault, 7)}`, w / 2, 22, { align: 'center', color: mutator ? '#a02020' : '#404040' });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    });
  }

  update(dt: number, time: number): void {
    if (this.crankSpin > 0) {
      const d = Math.min(this.crankSpin, dt * 10);
      this.crankSpin -= d;
      this.crank.rotation.x -= d;
    }
    this.flipAnim = Math.max(0, this.flipAnim - dt * 3);
    this.glassMat.uniforms.uEmissive.value.setRGB(0.05 + (this.open ? 0.06 + 0.03 * Math.sin(time * 3) : 0), 0.07, 0.05);
    // Drips when spins run low.
    if (this.dripping > 0 && Math.random() < dt * 2.5 * this.dripping && this.dripState.length < 12) {
      this.dripState.push({ x: 1.3 + Math.random() * 0.5, y: 1.3, v: 0 });
    }
    const m = new THREE.Matrix4();
    this.dripState = this.dripState.filter((d) => {
      d.v += dt * (d.y > 1.28 ? 0.15 : 3);
      d.y -= d.v * dt;
      return d.y > 0.9;
    });
    this.dripState.forEach((d, i) => {
      m.makeTranslation(2.265, d.y, d.x);
      this.drips.setMatrixAt(i, m);
    });
    this.drips.count = this.dripState.length;
    this.drips.visible = this.drips.count > 0;
    this.drips.instanceMatrix.needsUpdate = true;
  }
}
