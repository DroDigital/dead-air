/**
 * The host: a CRT-headed mannequin. Its face is an animated pixel screen; body poses are
 * stepped at 12 fps for that PS1 animation feel.
 */
import * as THREE from 'three';
import type { Assets } from '../../assets/loader';
import { psxMaterial, type PsxMaterial } from '../psxMaterial';
import { PropBuilder } from './props';
import { CanvasPanel, pickable } from './util';

export type HostFace = 'smile' | 'talk' | 'shock' | 'wink' | 'grin' | 'sad' | 'static' | 'dead' | 'eyes';
export type HostPose = 'idle' | 'present' | 'cheer' | 'point' | 'shrug' | 'slump';

const STEP = 1 / 12;

export class HostView {
  readonly group = new THREE.Group();
  private face: CanvasPanel;
  private faceMat: PsxMaterial;
  private head = new THREE.Group();
  private armL = { upper: new THREE.Group(), lower: new THREE.Group() };
  private armR = { upper: new THREE.Group(), lower: new THREE.Group() };
  private torso = new THREE.Group();
  expression: HostFace = 'smile';
  pose: HostPose = 'idle';
  talking = 0;
  /** Live voice amplitude 0..1 from the VO player (−1 = no recording; flap procedurally). */
  mouthAmp = -1;
  private mouthOpen = 0;
  private faceTimer = 0;
  private lastStep = -1;
  private blink = 0;
  silent = false;

  constructor(assets: Assets) {
    const g = this.group;
    g.position.set(1.95, 0.18, -0.25);
    g.rotation.y = -0.55;
    const suit = 0x3a2a4a,
      skin = 0xd8c8b0,
      shirt = 0xe0e0d0;
    // Legs + hips (static, one mesh).
    const legs = new PropBuilder()
      .cyl(suit, 0.06, 0.05, 0.85, [-0.09, 0.43, 0])
      .cyl(suit, 0.06, 0.05, 0.85, [0.09, 0.43, 0])
      .box(0x111111, [0.1, 0.05, 0.2], [-0.09, 0.02, 0.04])
      .box(0x111111, [0.1, 0.05, 0.2], [0.09, 0.02, 0.04])
      .box(suit, [0.32, 0.18, 0.2], [0, 0.92, 0])
      .build();
    g.add(legs);
    // Torso (sways), with shirt, bow tie, lapels.
    const torso = new PropBuilder()
      .box(suit, [0.42, 0.5, 0.24], [0, 0.26, 0])
      .box(shirt, [0.12, 0.42, 0.02], [0, 0.3, 0.12])
      .box(0xc01818, [0.12, 0.04, 0.03], [0, 0.5, 0.135])
      .cyl(skin, 0.05, 0.05, 0.1, [0, 0.55, 0])
      .box(0xd8a830, [0.04, 0.04, 0.02], [0.14, 0.4, 0.125])
      .build();
    this.torso.add(torso);
    this.torso.position.y = 1.0;
    g.add(this.torso);
    pickable(torso, 'host');
    // Arms.
    const mkArm = (side: number, arm: { upper: THREE.Group; lower: THREE.Group }) => {
      arm.upper.position.set(side * 0.25, 0.46, 0);
      const up = new PropBuilder().cyl(suit, 0.045, 0.04, 0.32, [0, -0.16, 0]).build();
      arm.upper.add(up);
      arm.lower.position.y = -0.32;
      const lo = new PropBuilder().cyl(suit, 0.04, 0.035, 0.3, [0, -0.15, 0]).box(shirt, [0.08, 0.04, 0.08], [0, -0.3, 0]).sphere(0xf0f0f0, 0.05, [0, -0.35, 0]).build();
      arm.lower.add(lo);
      arm.upper.add(arm.lower);
      this.torso.add(arm.upper);
    };
    mkArm(-1, this.armL);
    mkArm(1, this.armR);
    // CRT head.
    const tv = assets.fitted('mdl.tv_head', 0.5);
    tv.position.y = -0.2;
    this.head.add(tv);
    this.face = new CanvasPanel(32, 24);
    this.faceMat = psxMaterial({ map: this.face.texture, lit: false, fog: 0.2, emissiveDims: true });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.225), this.faceMat);
    // Put the screen on the front face of whatever head model we have.
    const box = new THREE.Box3().setFromObject(tv);
    screen.position.set((box.min.x + box.max.x) / 2 - 0.02, (box.min.y + box.max.y) / 2 + 0.02, box.max.z + 0.005);
    this.head.add(screen);
    pickable(screen, 'host');
    this.head.position.y = 0.82;
    this.torso.add(this.head);
    this.drawFace(0);
  }

  say(expression: HostFace, talkSeconds: number): void {
    this.expression = expression;
    this.talking = talkSeconds;
    this.faceTimer = talkSeconds + 1.5;
  }

  setPose(p: HostPose): void {
    this.pose = p;
  }

  private drawFace(time: number): void {
    const e = this.silent ? 'eyes' : this.expression;
    this.face.draw((ctx, w, h) => {
      ctx.fillStyle = '#071a10';
      ctx.fillRect(0, 0, w, h);
      if (e === 'static' || e === 'dead') {
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const v = Math.random() * (e === 'dead' ? 60 : 200);
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.fillRect(x, y, 1, 1);
          }
        return;
      }
      const fg = '#7dffa8';
      ctx.fillStyle = fg;
      const blink = this.blink > 0;
      // Eyes.
      const eye = (x: number, kind: 'open' | 'closed' | 'wide' | 'x') => {
        if (kind === 'closed' || blink) ctx.fillRect(x - 2, 8, 5, 1);
        else if (kind === 'wide') {
          ctx.fillRect(x - 2, 5, 5, 5);
          ctx.fillStyle = '#071a10';
          ctx.fillRect(x - 1, 6, 3, 3);
          ctx.fillStyle = fg;
          ctx.fillRect(x, 7, 1, 1);
        } else ctx.fillRect(x - 1, 6, 3, 4);
      };
      const lx = 10,
        rx = 22;
      if (e === 'wink') {
        eye(lx, 'open');
        eye(rx, 'closed');
      } else if (e === 'shock') {
        eye(lx, 'wide');
        eye(rx, 'wide');
      } else if (e === 'eyes') {
        eye(lx, 'open');
        eye(rx, 'open');
        return;
      } else {
        eye(lx, 'open');
        eye(rx, 'open');
      }
      // Mouth.
      const open = this.mouthOpen;
      if (e === 'shock') {
        ctx.fillRect(13, 14, 6, 6);
        ctx.fillStyle = '#071a10';
        ctx.fillRect(14, 15, 4, 4);
      } else if (e === 'sad') {
        // Still smiling — but the eyebrows know.
        ctx.fillRect(9, 15, 14, 1);
        ctx.fillRect(8, 14, 1, 1);
        ctx.fillRect(23, 14, 1, 1);
        ctx.fillRect(8, 4, 4, 1);
        ctx.fillRect(21, 4, 4, 1);
      } else {
        const wide = e === 'grin' ? 18 : 14;
        const x0 = 16 - wide / 2;
        ctx.fillRect(x0, 14, wide, 1);
        ctx.fillRect(x0 - 1, 13, 1, 1);
        ctx.fillRect(x0 + wide, 13, 1, 1);
        if (open > 0.5 || e === 'grin') {
          ctx.fillRect(x0 + 1, 15, wide - 2, Math.round(1 + open * 3));
          ctx.fillStyle = '#071a10';
          ctx.fillRect(x0 + 2, 15, wide - 4, Math.max(0, Math.round(open * 3) - 1));
        }
      }
      // Scanline flicker.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      const sy = Math.floor((time * 20) % h);
      ctx.fillRect(0, sy, w, 1);
    });
  }

  update(dt: number, time: number): void {
    this.talking = Math.max(0, this.talking - dt);
    this.faceTimer -= dt;
    if (this.faceTimer <= 0 && this.expression !== 'smile' && this.expression !== 'dead') this.expression = 'smile';
    if (Math.random() < dt * 0.3) this.blink = 0.12;
    this.blink = Math.max(0, this.blink - dt);
    // Stepped animation (12 fps).
    const step = Math.floor(time / STEP);
    if (step === this.lastStep) return;
    this.lastStep = step;
    const t = step * STEP;
    if (this.mouthAmp >= 0) this.mouthOpen = this.silent ? 0 : this.mouthAmp > 0.34 ? 1 : this.mouthAmp > 0.12 ? 0.6 : 0;
    else this.mouthOpen = this.talking > 0 && !this.silent ? (Math.sin(t * 22) > 0 ? 1 : Math.sin(t * 13) > 0.3 ? 0.6 : 0) : 0;
    this.drawFace(t);
    const sway = Math.sin(t * 1.3) * 0.04;
    this.torso.rotation.z = sway;
    this.head.rotation.z = Math.sin(t * 0.9) * 0.06 + (this.talking > 0 ? Math.sin(t * 9) * 0.04 : 0);
    this.head.rotation.x = this.pose === 'slump' ? 0.5 : 0;
    // Arm poses (rotation.z lifts sideways, rotation.x forward).
    const set = (arm: { upper: THREE.Group; lower: THREE.Group }, side: number, uz: number, ux: number, lx: number) => {
      arm.upper.rotation.z = side * uz;
      arm.upper.rotation.x = ux;
      arm.lower.rotation.x = lx;
    };
    const wob = Math.sin(t * 3) * 0.08;
    switch (this.pose) {
      case 'present':
        set(this.armL, -1, 1.1 + wob, -0.3, -0.4);
        set(this.armR, 1, 0.2, 0, -0.2);
        break;
      case 'cheer':
        set(this.armL, -1, 2.6 + wob, 0, -0.3);
        set(this.armR, 1, 2.6 - wob, 0, -0.3);
        break;
      case 'point':
        set(this.armL, -1, 0.15, 0, -0.2);
        set(this.armR, 1, 0.3, -1.4 + wob, -0.1);
        break;
      case 'shrug':
        set(this.armL, -1, 0.6, -0.4, -1.4 + wob);
        set(this.armR, 1, 0.6, -0.4, -1.4 - wob);
        break;
      case 'slump':
        set(this.armL, -1, 0.05, 0.1, 0);
        set(this.armR, 1, 0.05, 0.1, 0);
        break;
      default:
        set(this.armL, -1, 0.15 + wob * 0.5, 0, -0.25);
        set(this.armR, 1, 0.15 - wob * 0.5, 0, -0.25);
    }
  }
}
