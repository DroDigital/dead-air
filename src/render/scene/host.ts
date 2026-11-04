/**
 * The host: a rigged 2D cut-out of the owner's model sheet, standing in the 3D studio as a
 * billboard. Parts (TV head, tailcoat torso, bow tie, gloves, shoes) are sprites; arms and legs
 * are rubber-hose strokes between joints, the antennae are springy stems, and the face on the
 * TV is one of the 16 cells of the face sheet, swapped by expression and lip-synced to the
 * voice. Joints follow pose targets on underdamped springs (so gestures overshoot and settle),
 * and the canvas is redrawn at 12 fps for a stepped, hand-animated feel.
 */
import * as THREE from 'three';
import type { Assets } from '../../assets/loader';
import { art } from '../../assets/art';
import { psxMaterial, type PsxMaterial } from '../psxMaterial';
import { pickable } from './util';

export type HostFace = 'smile' | 'talk' | 'shock' | 'wink' | 'grin' | 'sad' | 'static' | 'dead' | 'eyes' | 'laugh' | 'nervous' | 'angry' | 'melt' | 'stitched';
export type HostPose = 'idle' | 'present' | 'cheer' | 'point' | 'shrug' | 'slump';

const STEP = 1 / 12;

/** Face sheet cells (4×4, row-major), as laid out in docs/art-prompts.md. */
const CELL = { smileA: 0, smileB: 1, grin: 2, wink: 3, shock: 4, sad: 5, dead: 6, side: 7, blink: 8, talkM: 9, talkE: 10, talkA: 11, talkO: 12, static: 13, melt: 14, angry: 15 } as const;
/**
 * Per expression: the resting face, then what the mouth does while the voice plays. `null`
 * means lip-sync with the shared mouth shapes (M/E/O/A); otherwise [half open, wide open].
 */
const FACES: Record<HostFace, { rest: number; talk: [number, number] | null }> = {
  smile: { rest: CELL.smileA, talk: null },
  talk: { rest: CELL.smileA, talk: null },
  grin: { rest: CELL.grin, talk: null },
  wink: { rest: CELL.wink, talk: null },
  laugh: { rest: CELL.blink, talk: [CELL.talkE, CELL.talkA] },
  shock: { rest: CELL.shock, talk: [CELL.talkO, CELL.shock] },
  sad: { rest: CELL.sad, talk: [CELL.sad, CELL.talkO] },
  nervous: { rest: CELL.talkE, talk: [CELL.talkE, CELL.talkO] },
  angry: { rest: CELL.angry, talk: [CELL.angry, CELL.angry] },
  melt: { rest: CELL.melt, talk: [CELL.melt, CELL.melt] },
  static: { rest: CELL.static, talk: [CELL.static, CELL.static] },
  dead: { rest: CELL.dead, talk: [CELL.dead, CELL.dead] },
  eyes: { rest: CELL.side, talk: [CELL.side, CELL.side] },
  stitched: { rest: CELL.talkM, talk: [CELL.talkM, CELL.talkM] },
};

// Canvas and rig space. The rig is laid out in model-sheet pixels with the origin between the
// feet on the floor (y up is negative); K scales it into the canvas.
const CW = 288,
  CH = 352,
  K = 0.5,
  FLOOR_Y = 340;
/** World metres per canvas pixel. */
const M = 0.006;

const NECK = { x: 0, y: -340 };
const SHOULDER = { x: 36, y: -316 };
const HIP = { x: 14, y: -122 };
const ANKLE = { x: 50, y: -56 };
const PELVIS_Y = -118;

interface HandDef {
  id: string;
  /** Wrist anchor in sprite pixels. */
  ax: number;
  ay: number;
  /** Direction the fingers point in the sprite (radians, screen space). */
  a0: number;
  scale: number;
}
const HANDS: Record<'open' | 'point', HandDef> = {
  open: { id: 'host.glove', ax: 140, ay: 100, a0: Math.atan2(-15, -100), scale: 0.55 },
  point: { id: 'ui.handPoint', ax: 128, ay: 162, a0: Math.atan2(-155, -115), scale: 0.5 },
};

/**
 * One arm in "outward-left" space (x < 0 is away from the body); the right arm is mirrored.
 * Wrist and elbow-bulge are relative to the shoulder; `ang` is where the fingers point.
 */
interface ArmPose {
  wx: number;
  wy: number;
  ex: number;
  ey: number;
  ang: number;
  hand: 'open' | 'point';
}
interface Pose {
  a: ArmPose;
  b: ArmPose;
  crouch: number;
  lean: number;
  shrug: number;
  tilt: number;
  drop: number;
}
const deg = (d: number) => (d * Math.PI) / 180;
const SIDE: ArmPose = { wx: -52, wy: 92, ex: -26, ey: -4, ang: deg(112), hand: 'open' };
const HIP_HAND: ArmPose = { wx: 6, wy: 116, ex: -46, ey: -6, ang: deg(28), hand: 'open' };
const POSES: Record<HostPose, Pose> = {
  idle: { a: SIDE, b: HIP_HAND, crouch: 0, lean: 0, shrug: 0, tilt: 0.04, drop: 0 },
  present: { a: { wx: -114, wy: -20, ex: 0, ey: 20, ang: deg(-172), hand: 'open' }, b: HIP_HAND, crouch: 2, lean: -0.05, shrug: 2, tilt: -0.08, drop: 0 },
  cheer: { a: { wx: -126, wy: -96, ex: -18, ey: 18, ang: deg(-112), hand: 'open' }, b: { wx: -126, wy: -96, ex: -18, ey: 18, ang: deg(-112), hand: 'open' }, crouch: -4, lean: 0, shrug: 8, tilt: 0, drop: 0 },
  point: { a: { wx: -120, wy: -30, ex: 0, ey: 12, ang: deg(-168), hand: 'point' }, b: HIP_HAND, crouch: 4, lean: -0.08, shrug: 0, tilt: -0.12, drop: 0 },
  shrug: { a: { wx: -78, wy: -6, ex: -4, ey: 40, ang: deg(-150), hand: 'open' }, b: { wx: -78, wy: -6, ex: -4, ey: 40, ang: deg(-150), hand: 'open' }, crouch: 6, lean: 0, shrug: 16, tilt: 0.16, drop: 4 },
  slump: { a: { wx: -12, wy: 112, ex: -6, ey: 0, ang: deg(100), hand: 'open' }, b: { wx: -12, wy: 112, ex: -6, ey: 0, ang: deg(100), hand: 'open' }, crouch: 26, lean: 0.06, shrug: -8, tilt: 0.34, drop: 14 },
};

/** An underdamped spring: overshoots a little and settles, like a cartoon gesture. */
class Spring {
  v = 0;
  constructor(
    public x: number,
    public k = 150,
    public d = 13,
  ) {}
  step(target: number, dt: number): number {
    this.v += (this.k * (target - this.x) - this.d * this.v) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

type ArmSprings = Record<'wx' | 'wy' | 'ex' | 'ey' | 'ang', Spring>;
const armSprings = (p: ArmPose): ArmSprings => ({ wx: new Spring(p.wx), wy: new Spring(p.wy), ex: new Spring(p.ex), ey: new Spring(p.ey), ang: new Spring(p.ang, 110, 12) });

export class HostView {
  readonly group = new THREE.Group();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private mat: PsxMaterial;
  expression: HostFace = 'smile';
  pose: HostPose = 'idle';
  talking = 0;
  /** Live voice amplitude 0..1 from the VO player (−1 = no recording; flap procedurally). */
  mouthAmp = -1;
  /** 0..1 twitch when the broadcast glitches (late Deadlines). */
  twitch = 0;
  /** Studio light level 0..1 (the stage dims the host with the room). */
  light = 1;
  silent = false;
  private energy = 0;
  private faceTimer = 0;
  private lastStep = -1;
  private glance = 0;
  private nextGlance = 5;
  private cell: number = CELL.smileA;
  private blinkT = 0;
  private hand: { a: 'open' | 'point'; b: 'open' | 'point' } = { a: 'open', b: 'open' };
  private arms: { a: ArmSprings; b: ArmSprings };
  private body = { crouch: new Spring(0, 120, 10), lean: new Spring(0, 90, 9), shrug: new Spring(0, 160, 12), tilt: new Spring(0, 80, 8), drop: new Spring(0, 120, 11) };
  /** Whole-body squash (+ = squashed) and the hop height, both kicked by pose changes. */
  private squash = new Spring(0, 260, 9);
  private hop = 0;
  private hopV = 0;
  private antenna = new Spring(0, 70, 3.2);
  private lastTilt = 0;

  constructor(_assets: Assets) {
    const g = this.group;
    g.position.set(1.95, 0.18, -0.25);
    // Face the contestant's chair.
    g.rotation.y = Math.atan2(0 - 1.95, 3.05 - -0.25);
    this.canvas = document.createElement('canvas');
    this.canvas.width = CW;
    this.canvas.height = CH;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.mat = psxMaterial({ map: this.texture, lit: false, alphaTest: 0.45, fog: 0.5, side: THREE.DoubleSide });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(CW * M, CH * M), this.mat);
    quad.position.y = (FLOOR_Y - CH / 2) * M;
    g.add(quad);
    pickable(quad, 'host');
    const p = POSES.idle;
    this.arms = { a: armSprings(p.a), b: armSprings(p.b) };
    this.draw(0);
  }

  say(expression: HostFace, talkSeconds: number): void {
    this.expression = expression;
    this.talking = talkSeconds;
    this.faceTimer = talkSeconds + 1.5;
    // A little take: the body pops on a reaction face.
    if (expression === 'shock' || expression === 'angry') this.squash.v -= 3;
    else if (expression === 'laugh') this.squash.v += 2;
  }

  setPose(p: HostPose): void {
    if (p !== this.pose) {
      // Anticipation squash, and a hop into a cheer.
      this.squash.v += p === 'slump' ? 2.5 : -2.2;
      if (p === 'cheer' && this.hop <= 0) this.hopV = 300;
    }
    this.pose = p;
  }

  update(dt: number, time: number): void {
    dt = Math.min(dt, 0.05);
    this.talking = Math.max(0, this.talking - dt);
    this.faceTimer -= dt;
    if (this.faceTimer <= 0 && this.expression !== 'smile' && this.expression !== 'dead') this.expression = 'smile';
    // Idle glances off-screen when nothing's happening.
    this.nextGlance -= dt;
    this.glance = Math.max(0, this.glance - dt);
    if (this.nextGlance <= 0) {
      this.nextGlance = 4 + Math.random() * 7;
      if (this.talking <= 0 && this.expression === 'smile') this.glance = 0.7 + Math.random() * 0.5;
    }
    this.blinkT = Math.max(0, this.blinkT - dt);
    if (Math.random() < dt * 0.3) this.blinkT = 0.15;
    const amp = Math.max(0, this.mouthAmp);
    this.energy += (amp - this.energy) * Math.min(1, dt * 10);
    const e = this.energy;
    const pose = POSES[this.pose];
    // Procedural life on top of the pose: breathing, a talk bounce, gesture beats.
    const breathe = Math.sin(time * 2.1);
    const beat = Math.sin(time * 6.5);
    for (const side of ['a', 'b'] as const) {
      const t = pose[side];
      const s = this.arms[side];
      // The free hand (not on the hip) gestures with the voice.
      const free = t !== HIP_HAND;
      const g = free ? e * 22 * (side === 'a' ? beat : Math.sin(time * 5.3 + 1)) : 0;
      s.wx.step(t.wx + (free ? Math.sin(time * 1.7 + (side === 'a' ? 0 : 2)) * 4 : 0), dt);
      s.wy.step(t.wy + g + breathe * 2, dt);
      s.ex.step(t.ex, dt);
      s.ey.step(t.ey, dt);
      s.ang.step(t.ang + (free ? e * 0.35 * beat : 0), dt);
      this.hand[side] = t.hand;
    }
    const b = this.body;
    b.crouch.step(pose.crouch + breathe * 2.5 + e * 7 * Math.abs(Math.sin(time * 7)), dt);
    b.lean.step(pose.lean + Math.sin(time * 1.3) * 0.025, dt);
    b.shrug.step(pose.shrug + e * 4 * beat, dt);
    const tw = this.twitch > 0 && Math.random() < this.twitch * 0.3 ? (Math.random() - 0.5) * 0.6 * this.twitch : 0;
    b.tilt.step(pose.tilt + Math.sin(time * 0.9) * 0.05 + e * 0.1 * Math.sin(time * 9) + tw, dt);
    b.drop.step(pose.drop, dt);
    this.squash.step(0, dt);
    // Cheering keeps him bouncing on his toes.
    if (this.pose === 'cheer' && this.hop <= 0 && this.hopV <= 0 && Math.random() < dt * (0.8 + e * 2)) this.hopV = 220 + Math.random() * 80;
    if (this.hop > 0 || this.hopV > 0) {
      this.hopV -= 1500 * dt;
      this.hop += this.hopV * dt;
      if (this.hop <= 0) {
        this.hop = 0;
        this.hopV = 0;
        this.squash.v += 3.2;
      }
    }
    // Antennae lag the head's swing.
    const tilt = b.tilt.x;
    this.antenna.v -= ((tilt - this.lastTilt) / Math.max(dt, 1e-3)) * 0.9 * dt * 60;
    this.antenna.v += (this.hopV > 0 ? -0.02 : 0) + this.squash.v * 0.02;
    this.antenna.step(0, dt);
    this.lastTilt = tilt;
    this.mat.uniforms.uColor.value.setScalar(0.35 + 0.65 * Math.max(0, Math.min(1, this.light)));
    // Stepped redraw (12 fps): the canvas, the face swap and lip flap.
    const step = Math.floor(time / STEP);
    if (step === this.lastStep) return;
    this.lastStep = step;
    this.pickFace(step * STEP);
    this.draw(step * STEP);
  }

  private pickFace(t: number): void {
    const expr: HostFace = this.silent && this.expression !== 'dead' && this.expression !== 'static' ? 'stitched' : this.expression;
    const f = FACES[expr];
    // Mouth: 0 shut (M), 1 half (E/O), 2 wide (A).
    let open = -1;
    if (this.mouthAmp >= 0) open = this.mouthAmp > 0.36 ? 2 : this.mouthAmp > 0.14 ? 1 : 0;
    else if (this.talking > 0) open = Math.sin(t * 22) > 0 ? 2 : Math.sin(t * 13) > 0.3 ? 1 : 0;
    let cell: number = f.rest;
    const step = Math.round(t / STEP);
    if (open >= 0 && !this.silent) {
      if (f.talk) cell = open === 0 ? f.rest : f.talk[open - 1];
      else cell = open === 2 ? CELL.talkA : open === 1 ? ((step >> 1) % 3 === 0 ? CELL.talkO : CELL.talkE) : CELL.talkM;
    } else if (expr === 'smile' || expr === 'talk') {
      // Idle: the smile boils between its two drawings (on twos), blinks, and glances away.
      cell = (step >> 2) % 2 ? CELL.smileB : CELL.smileA;
      if (this.blinkT > 0) cell = CELL.blink;
      else if (this.glance > 0) cell = CELL.side;
    }
    // The broadcast tears: a frame of static, a melt, a sewn mouth, a flash of anger.
    if (this.twitch > 0 && Math.random() < this.twitch * 0.2) cell = [CELL.static, CELL.melt, CELL.talkM, CELL.angry][Math.floor(Math.random() * 4)];
    this.cell = cell;
  }

  private draw(t: number): void {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, CW, CH);
    c.imageSmoothingEnabled = true;
    const head = art.img('host.head');
    if (!head) {
      this.drawFallback(c);
      this.texture.needsUpdate = true;
      return;
    }
    const b = this.body;
    const sq = this.squash.x;
    c.translate(CW / 2, FLOOR_Y);
    c.scale(K, K);
    // Squash & stretch about the feet, and the hop.
    c.scale(1 + sq * 0.07, 1 - sq * 0.1);
    c.translate(0, -this.hop);
    const crouch = b.crouch.x;
    const lean = b.lean.x;
    // Body transform: pivot at the pelvis, lowered by the crouch, leaning.
    const px = 0,
      py = PELVIS_Y + crouch;
    const toWorld = (x: number, y: number) => {
      const dx = x,
        dy = y - PELVIS_Y;
      return { x: px + dx * Math.cos(lean) - dy * Math.sin(lean), y: py + dx * Math.sin(lean) + dy * Math.cos(lean) };
    };
    // Legs: bowed rubber hoses from the hips to the ankles.
    for (const s of [-1, 1]) {
      const hip = toWorld(s * HIP.x, HIP.y);
      const ank = { x: s * ANKLE.x, y: ANKLE.y };
      const bow = 6 + Math.max(0, crouch) * 0.9;
      const cx = (hip.x + ank.x) / 2 + s * bow * 2,
        cy = (hip.y + ank.y) / 2;
      this.hose(c, hip.x, hip.y, cx, cy, ank.x, ank.y, 24);
    }
    // Shoes (toes outward).
    const shoe = art.img('host.shoe');
    if (shoe) {
      const sw = 128,
        sh = (shoe.height / shoe.width) * sw;
      for (const s of [-1, 1]) {
        c.save();
        c.translate(s * ANKLE.x, 0);
        c.scale(s, 1);
        c.drawImage(shoe, -36, -sh + 2, sw, sh);
        c.restore();
      }
    }
    // Torso and everything above it.
    c.save();
    c.translate(px, py);
    c.rotate(lean);
    c.translate(0, -PELVIS_Y);
    const torso = art.img('host.torso');
    if (torso) {
      // Clip off the sheet's arm stubs at the shoulders: the hose arms replace them.
      c.save();
      c.beginPath();
      c.rect(-44, -370, 88, 84);
      c.rect(-110, -288, 220, 200);
      c.clip();
      c.drawImage(torso, -100, -363);
      c.restore();
    }
    const shrug = b.shrug.x;
    // Arms: hip-hand first (it sits against the coat), then the gesturing one.
    for (const side of ['b', 'a'] as const) this.drawArm(c, side, shrug);
    // Head (pivots at the neck), with springy antennae.
    c.save();
    c.translate(NECK.x, NECK.y - shrug * 0.4 + b.drop.x);
    c.rotate(b.tilt.x);
    const hs = 1 - sq * 0.04;
    c.scale(1 / hs, hs);
    this.drawAntennae(c);
    c.save();
    c.beginPath();
    c.rect(-139, -230, 282, 192);
    c.clip();
    c.drawImage(head, -139, -307);
    c.restore();
    this.drawScreen(c, t);
    c.restore();
    // Bow tie over the collar, bobbing with the voice.
    const bow = art.img('host.bowtie');
    if (bow) {
      c.save();
      c.translate(NECK.x, NECK.y + 2 - shrug * 0.3);
      c.rotate(Math.sin(t * 5) * 0.05 * (0.3 + this.energy) + b.tilt.x * 0.3);
      const bw = 118 * (1 + this.energy * 0.12),
        bh = (bow.height / bow.width) * bw;
      c.drawImage(bow, -bw / 2, -bh / 2, bw, bh);
      c.restore();
    }
    c.restore();
    this.texture.needsUpdate = true;
  }

  /** A rubber-hose limb: a dark outline stroke with a sheen, through a quadratic bend. */
  private hose(c: CanvasRenderingContext2D, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number): void {
    // Control point that makes the curve pass through (cx, cy).
    const qx = 2 * cx - (x0 + x1) / 2,
      qy = 2 * cy - (y0 + y1) / 2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo(qx, qy, x1, y1);
    c.strokeStyle = '#0b0605';
    c.lineWidth = w + 6;
    c.stroke();
    c.strokeStyle = '#231815';
    c.lineWidth = w;
    c.stroke();
    c.beginPath();
    c.moveTo(x0 - w * 0.18, y0);
    c.quadraticCurveTo(qx - w * 0.18, qy, x1 - w * 0.18, y1);
    c.strokeStyle = 'rgba(150,110,90,0.28)';
    c.lineWidth = w * 0.22;
    c.stroke();
  }

  private drawArm(c: CanvasRenderingContext2D, side: 'a' | 'b', shrug: number): void {
    const s = this.arms[side];
    const m = side === 'a' ? 1 : -1; // 'a' is the viewer's left; 'b' mirrors it.
    const sx = -m * SHOULDER.x,
      sy = SHOULDER.y - shrug;
    const wx = sx + m * s.wx.x,
      wy = sy + s.wy.x;
    const ex = (sx + wx) / 2 + m * s.ex.x,
      ey = (sy + wy) / 2 + s.ey.x;
    this.hose(c, sx, sy, ex, ey, wx, wy, 19);
    const def = HANDS[this.hand[side]];
    const img = art.img(def.id) ?? art.img('host.glove');
    if (!img) return;
    c.save();
    c.translate(wx, wy);
    c.scale(m, 1);
    c.rotate(s.ang.x - def.a0);
    c.drawImage(img, -def.ax * def.scale, -def.ay * def.scale, img.width * def.scale, img.height * def.scale);
    c.restore();
  }

  private drawAntennae(c: CanvasRenderingContext2D): void {
    // Sprite-space bases on the dome and ball positions, relative to the neck pivot.
    const ox = -139,
      oy = -307;
    const stems: [number, number, number, number, number][] = [
      [134, 86, 87, 22, 1],
      [156, 86, 218, 14, 1.25],
    ];
    for (const [bx, by, tx, ty, k] of stems) {
      const a = this.antenna.x * k;
      const x0 = ox + bx,
        y0 = oy + by;
      const dx = tx - bx,
        dy = ty - by;
      const x1 = x0 + dx * Math.cos(a) - dy * Math.sin(a),
        y1 = y0 + dx * Math.sin(a) + dy * Math.cos(a);
      const mx = (x0 + x1) / 2 - a * 30,
        my = (y0 + y1) / 2;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0, y0);
      c.quadraticCurveTo(mx, my, x1, y1);
      c.strokeStyle = '#1a0f08';
      c.lineWidth = 9;
      c.stroke();
      c.strokeStyle = '#7a5528';
      c.lineWidth = 4.5;
      c.stroke();
      c.beginPath();
      c.arc(x1, y1, 16, 0, Math.PI * 2);
      c.fillStyle = '#1a0f08';
      c.fill();
      c.beginPath();
      c.arc(x1, y1, 12.5, 0, Math.PI * 2);
      c.fillStyle = '#b8302a';
      c.fill();
      c.beginPath();
      c.arc(x1 - 4, y1 - 4, 4.5, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,220,200,0.7)';
      c.fill();
    }
  }

  /** The face cell inside the TV screen, with scanlines and a rolling bar. */
  private drawScreen(c: CanvasRenderingContext2D, t: number): void {
    const faces = art.img('host.faces');
    // Screen rectangle in head-sprite pixels, then relative to the neck pivot.
    const x = -139 + 46,
      y = -307 + 121,
      w = 173,
      h = 148;
    c.save();
    c.beginPath();
    c.roundRect(x, y, w, h, 40);
    c.clip();
    c.fillStyle = '#9fd8b0';
    c.fillRect(x, y, w, h);
    if (faces) {
      const cs = faces.width / 4;
      const col = this.cell % 4,
        row = Math.floor(this.cell / 4);
      // The cell's own screen sits at ~(7..121, 14..122) of 128; map it onto the TV's screen.
      const f = cs / 128;
      let jx = 0,
        jy = 0;
      if (this.cell === CELL.static || (this.twitch > 0 && Math.random() < this.twitch * 0.15)) {
        jx = (Math.random() - 0.5) * 16;
        jy = (Math.random() - 0.5) * 10;
      }
      const talkStretch = 1 + this.energy * 0.05;
      const dh = (h + 8) * talkStretch;
      c.drawImage(faces, col * cs + 6 * f, row * cs + 12 * f, 116 * f, 112 * f, x - 4 + jx, y - 4 + jy + (h + 8 - dh), w + 8, dh);
    }
    // CRT: scanlines, a slow rolling bar, a glass highlight.
    c.fillStyle = 'rgba(0,30,10,0.13)';
    for (let yy = y; yy < y + h; yy += 5) c.fillRect(x, yy, w, 2);
    const bar = y + (((t * 40) % (h + 40)) - 20);
    c.fillStyle = 'rgba(220,255,230,0.10)';
    c.fillRect(x, bar, w, 14);
    if (this.cell === CELL.dead) {
      c.fillStyle = `rgba(0,0,0,${0.25 + Math.random() * 0.2})`;
      c.fillRect(x, y, w, h);
    }
    c.restore();
  }

  /** Without the art pack: a plain silhouette with a green screen, so nothing breaks. */
  private drawFallback(c: CanvasRenderingContext2D): void {
    c.fillStyle = '#221616';
    c.fillRect(CW / 2 - 30, 120, 60, 210);
    c.fillStyle = '#5a3418';
    c.fillRect(CW / 2 - 50, 40, 100, 80);
    c.fillStyle = '#7dffa8';
    c.fillRect(CW / 2 - 38, 50, 76, 58);
  }
}
