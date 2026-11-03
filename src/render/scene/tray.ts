/**
 * The Tray: a glass coin hopper holding at-risk winnings, with the LET IT RIDE marquee.
 * Coins physically pour in (simple per-coin ballistic drop onto a heap).
 */
import * as THREE from 'three';
import { drawText } from '../../ui/bitfont';
import { psxMaterial, type PsxMaterial } from '../psxMaterial';
import { CanvasPanel, panelMesh, pickable } from './util';

const MAX_COINS = 220;
const BOX = { w: 0.5, h: 0.26, d: 0.3 };

interface Coin {
  x: number;
  z: number;
  y: number;
  vy: number;
  target: number;
  rot: number;
  live: boolean;
}

export class TrayView {
  readonly group = new THREE.Group();
  private coins: THREE.InstancedMesh;
  private coinState: Coin[] = [];
  private glassMat: PsxMaterial;
  private marquee: CanvasPanel;
  private heights = new Float32Array(10 * 6);
  private shown = 0;
  heat = 0;
  onCoinLand?: () => void;

  constructor() {
    const g = this.group;
    g.position.set(-0.5, 0.64, 2.45);
    this.glassMat = psxMaterial({ color: 0x9fd0d0, transparent: true, opacity: 0.28, emissive: 0x000000, side: THREE.DoubleSide, depthWrite: false });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(BOX.w, BOX.h, BOX.d), this.glassMat);
    glass.position.y = BOX.h / 2;
    glass.renderOrder = 2;
    pickable(glass, 'tray');
    g.add(glass);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(BOX.w + 0.04, 0.03, BOX.d + 0.04), psxMaterial({ color: 0xc8a030, emissive: 0x100800 }));
    g.add(frame);
    this.coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 7), psxMaterial({ color: 0xf0c040, emissive: 0x281a00 }), MAX_COINS);
    this.coins.count = 0;
    g.add(this.coins);
    this.marquee = new CanvasPanel(128, 16);
    const mq = panelMesh(this.marquee, 0.48, 0.06);
    mq.position.set(0, 0.035, BOX.d / 2 + 0.012);
    g.add(mq);
    this.setStreak(1, 0);
  }

  setStreak(streak: number, tray: number): void {
    this.heat = Math.min(1, (streak - 1) / 2);
    this.marquee.draw((ctx, w, h) => {
      ctx.fillStyle = '#120804';
      ctx.fillRect(0, 0, w, h);
      const col = streak >= 2.5 ? '#ff5030' : streak >= 1.5 ? '#ffb040' : '#ffe8a0';
      drawText(ctx, `LET IT RIDE ×${streak.toFixed(2)}`, w / 2, 1, { align: 'center', color: col });
      drawText(ctx, `$${tray}`, w / 2, 9, { align: 'center', color: '#c0ffc0', scale: 1 }).toString();
    });
  }

  /** Number of coins for a given tray value. */
  static coinsFor(tray: number): number {
    return Math.min(MAX_COINS, Math.ceil(tray / 15));
  }

  /** Animate coins toward a target count. */
  setAmount(tray: number, pour: boolean): void {
    const target = TrayView.coinsFor(tray);
    if (target < this.shown) {
      // Remove instantly (Bankrupt / Deposit handle their own drama).
      this.coinState.length = target;
      this.heights.fill(0);
      for (const c of this.coinState) {
        const cell = this.cellOf(c.x, c.z);
        c.target = this.heights[cell];
        c.y = c.target;
        c.vy = 0;
        this.heights[cell] += 0.007;
      }
      this.shown = target;
    }
    while (this.coinState.length < target) {
      const x = (Math.random() - 0.5) * (BOX.w - 0.06);
      const z = (Math.random() - 0.5) * (BOX.d - 0.06);
      const cell = this.cellOf(x, z);
      const base = this.heights[cell];
      this.heights[cell] = Math.min(BOX.h - 0.02, base + 0.007);
      const delay = pour ? (this.coinState.length - this.shown) * 0.012 : 0;
      this.coinState.push({ x, z, y: pour ? BOX.h + 0.3 + delay * 3 : base, vy: 0, target: base + 0.004, rot: Math.random() * 6, live: pour });
    }
    this.shown = target;
  }

  private cellOf(x: number, z: number): number {
    const cx = Math.max(0, Math.min(9, Math.floor((x / (BOX.w - 0.06) + 0.5) * 10)));
    const cz = Math.max(0, Math.min(5, Math.floor((z / (BOX.d - 0.06) + 0.5) * 6)));
    return cz * 10 + cx;
  }

  update(dt: number, time: number): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < this.coinState.length; i++) {
      const c = this.coinState[i];
      if (c.live) {
        c.vy -= 9.8 * dt;
        c.y += c.vy * dt;
        if (c.y <= c.target) {
          c.y = c.target;
          if (Math.abs(c.vy) > 0.6) {
            c.vy = -c.vy * 0.25;
            if (i % 3 === 0) this.onCoinLand?.();
          } else {
            c.vy = 0;
            c.live = false;
          }
        }
      }
      e.set(Math.sin(c.rot) * 0.4, c.rot, Math.cos(c.rot * 1.3) * 0.4);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(c.x, c.y, c.z), q, new THREE.Vector3(1, 1, 1));
      this.coins.setMatrixAt(i, m);
    }
    this.coins.count = this.coinState.length;
    this.coins.instanceMatrix.needsUpdate = true;
    // The glass glows hotter as the Streak climbs.
    const h = this.heat * (0.7 + 0.3 * Math.sin(time * 6));
    this.glassMat.uniforms.uEmissive.value.setRGB(0.6 * h, 0.18 * h, 0.02 * h);
    this.glassMat.uniforms.uOpacity.value = 0.28 + 0.25 * this.heat;
  }
}
