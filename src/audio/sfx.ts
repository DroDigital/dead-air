/**
 * SFX: every sound has an id. If `npm run assets` produced a real file for that id it is
 * decoded and used; otherwise a procedural buffer is synthesised (bitcrushed + lowpassed at
 * 22.05 kHz, matching the asset pipeline). Every playback is varied (pitch/gain jitter) so
 * nothing repeats identically.
 */
import elIndex from '../assets/audio.json';
import index from '../assets/manifest.json';
import type { Mixer } from './mixer';

const RATE = 22050;
type Gen = (t: number, i: number, n: number, st: { r: number; a: number; b: number }) => number;

function rnd(st: { r: number }): number {
  st.r = (st.r * 1664525 + 1013904223) >>> 0;
  return st.r / 4294967296;
}

/** Build a crunchy buffer from a generator, then lowpass + 10-bit crush. */
function synth(ctx: AudioContext, seconds: number, gen: Gen, crushBits = 10, lp = 7000): AudioBuffer {
  const n = Math.max(1, Math.floor(seconds * RATE));
  const buf = ctx.createBuffer(1, n, RATE);
  const d = buf.getChannelData(0);
  const st = { r: 12345, a: 0, b: 0 };
  const a = 1 - Math.exp((-2 * Math.PI * lp) / RATE);
  let y = 0;
  const lv = 1 << (crushBits - 1);
  for (let i = 0; i < n; i++) {
    const x = gen(i / RATE, i, n, st);
    y += a * (x - y);
    d[i] = Math.round(Math.max(-1, Math.min(1, y)) * lv) / lv;
  }
  return buf;
}

const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));
const sq = (p: number) => (p % 1 < 0.5 ? 1 : -1);

type SfxId =
  | 'tick'
  | 'clink'
  | 'cascade'
  | 'thunk'
  | 'bankrupt'
  | 'groan'
  | 'cheer'
  | 'applause'
  | 'bell'
  | 'nixie'
  | 'ratchet'
  | 'lever'
  | 'jackpot'
  | 'button'
  | 'scratch'
  | 'crank'
  | 'trapdoor'
  | 'whoosh'
  | 'blip'
  | 'buzz'
  | 'sting'
  | 'pickup'
  | 'hangup'
  | 'error'
  | 'powerup'
  | 'gasp'
  | 'laugh'
  | 'static'
  | 'signoff'
  | 'rimshot'
  | 'register'
  | 'fanfare'
  | 'drumroll'
  | 'heartbeat'
  | 'roomtone'
  | 'tension'
  | 'gameoverCue';

/** ElevenLabs recordings (assets/elevenlabs.json) take precedence over CC0 files and synthesis. */
const EL_IDS: Partial<Record<SfxId, string>> = {
  bankrupt: 'el.bankrupt',
  groan: 'el.groan',
  jackpot: 'el.jackpot',
  applause: 'el.applause',
  cheer: 'el.applause',
  sting: 'el.sting',
  trapdoor: 'el.trapdoor',
  pickup: 'el.pickup',
  hangup: 'el.hangup',
  gasp: 'el.gasp',
  laugh: 'el.laugh',
  static: 'el.static',
  signoff: 'el.signoff',
  rimshot: 'el.rimshot',
  register: 'el.register',
  fanfare: 'el.fanfare',
  drumroll: 'el.drumroll',
  heartbeat: 'el.heartbeat',
  roomtone: 'el.ambience',
  tension: 'track.charge',
  gameoverCue: 'track.gameover',
};

/** Map from manifest ids (real files) to SFX ids. */
const FILE_IDS: Partial<Record<SfxId, string>> = {
  tick: 'sfx.flapper',
  cascade: 'sfx.coins',
  thunk: 'sfx.vault_thunk',
  bankrupt: 'sfx.bankrupt',
  groan: 'sfx.crowd',
  bell: 'sfx.phone_bell',
  lever: 'sfx.lever',
  jackpot: 'sfx.jackpot_bells',
  button: 'sfx.button',
  scratch: 'sfx.scratch',
  crank: 'sfx.crank',
};

export class Sfx {
  private buffers = new Map<SfxId, AudioBuffer>();
  private ringing: { stop: () => void } | null = null;

  constructor(private mixer: Mixer) {
    this.build();
  }

  private build(): void {
    const c = this.mixer.ctx;
    const B = (id: SfxId, s: number, g: Gen, bits?: number, lp?: number) => this.buffers.set(id, synth(c, s, g, bits, lp));
    B('tick', 0.05, (t, _i, _n, st) => (rnd(st) * 2 - 1) * env(t, 0.0005, 0.006) * 0.9 + Math.sin(t * 2 * Math.PI * 1800) * env(t, 0.0005, 0.01) * 0.5);
    B('clink', 0.25, (t) => (Math.sin(t * 2 * Math.PI * 3150) * 0.6 + Math.sin(t * 2 * Math.PI * 4720) * 0.4 + Math.sin(t * 2 * Math.PI * 6900) * 0.2) * env(t, 0.001, 0.05) * 0.7);
    B('cascade', 1.2, (t, _i, _n, st) => {
      // Many tiny clinks with random timing.
      const k = Math.floor(t * 40);
      const ph = t * 40 - k;
      const f = 2600 + ((k * 2654435761) % 1000) * 2.5;
      return Math.sin(ph * 2 * Math.PI * f * 0.025) * Math.exp(-ph * 9) * (1 - t / 1.2) * 0.6 + (rnd(st) - 0.5) * 0.05 * (1 - t / 1.2);
    });
    B('thunk', 0.6, (t, _i, _n, st) => Math.sin(2 * Math.PI * (60 * t + 40 * t * Math.exp(-t * 20))) * env(t, 0.002, 0.12) + (rnd(st) - 0.5) * env(t, 0.001, 0.02) * 0.8 + Math.sin(t * 2 * Math.PI * 880) * env(t, 0.003, 0.2) * 0.15, 9, 3000);
    B('bankrupt', 1.6, (t, _i, _n, st) => {
      const crash = (rnd(st) * 2 - 1) * env(t, 0.002, 0.35);
      const tone = sq(t * (220 - t * 110)) * env(t, 0.01, 0.6) * 0.35;
      const tone2 = sq(t * (233 - t * 120)) * env(t, 0.01, 0.6) * 0.25;
      return crash * 0.7 + tone + tone2;
    }, 8, 4500);
    B('groan', 1.8, (t, _i, _n, st) => {
      st.a += ((rnd(st) * 2 - 1) - st.a) * 0.08;
      const voice = Math.sin(2 * Math.PI * (140 - t * 30) * t) * 0.3 + Math.sin(2 * Math.PI * (210 - t * 50) * t) * 0.2;
      return (st.a * 1.5 + voice * 0.4) * Math.sin(Math.min(1, t / 1.8) * Math.PI) * 0.8;
    }, 9, 1500);
    B('cheer', 2.0, (t, _i, _n, st) => {
      st.a += ((rnd(st) * 2 - 1) - st.a) * 0.25;
      const whoo = Math.sin(2 * Math.PI * (500 + 200 * Math.sin(t * 3)) * t) * 0.15;
      return (st.a + whoo) * Math.sin(Math.min(1, t / 2) * Math.PI) * 0.9;
    }, 9, 5000);
    B('applause', 2.4, (t, _i, _n, st) => {
      const clap = rnd(st) < 0.012 ? 1 : 0;
      st.b = clap ? 1 : st.b * 0.9;
      return (rnd(st) * 2 - 1) * st.b * Math.sin(Math.min(1, t / 2.4) * Math.PI) * 0.9;
    }, 9, 6000);
    B('bell', 1.0, (t) => {
      const on = Math.floor(t * 24) % 2 === 0 ? 1 : 0.6;
      const f = 1150;
      return (Math.sin(2 * Math.PI * f * t + 2.2 * Math.sin(2 * Math.PI * f * 1.41 * t)) * 0.5 + Math.sin(2 * Math.PI * 1720 * t) * 0.2) * on * (t < 0.95 ? 1 : (1 - t) * 20);
    }, 10, 6000);
    B('nixie', 0.03, (t) => sq(t * 2400) * env(t, 0.0005, 0.005) * 0.25);
    B('ratchet', 0.04, (t, _i, _n, st) => ((rnd(st) * 2 - 1) * 0.6 + sq(t * 900) * 0.3) * env(t, 0.0005, 0.008));
    B('lever', 0.5, (t, _i, _n, st) => {
      const clack = (rnd(st) * 2 - 1) * env(t, 0.001, 0.03);
      const spring = Math.sin(2 * Math.PI * 180 * t) * env(t, 0.005, 0.15) * 0.4;
      const late = t > 0.08 ? (rnd(st) * 2 - 1) * env(t - 0.08, 0.001, 0.02) * 0.6 : 0;
      return clack + spring + late;
    });
    B('jackpot', 2.2, (t) => {
      let s = 0;
      for (let k = 0; k < 6; k++) {
        const tt = t - k * 0.12;
        if (tt < 0) continue;
        const f = [1046, 1318, 1568, 2093, 1568, 2093][k];
        s += (Math.sin(2 * Math.PI * f * tt) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * tt)) * env(tt, 0.002, 0.5) * 0.3;
      }
      return s;
    });
    B('button', 0.12, (t, _i, _n, st) => (rnd(st) * 2 - 1) * env(t, 0.001, 0.01) + Math.sin(2 * Math.PI * 300 * t) * env(t, 0.002, 0.04) * 0.5);
    B('scratch', 0.35, (t, _i, _n, st) => (rnd(st) * 2 - 1) * (0.5 + 0.5 * Math.sin(t * 90)) * env(t, 0.02, 0.15) * 0.6, 9, 5000);
    B('crank', 0.6, (t, _i, _n, st) => {
      const k = Math.floor(t * 20);
      const ph = t * 20 - k;
      return ((rnd(st) * 2 - 1) * Math.exp(-ph * 40) * 0.8 + sq(t * 700) * Math.exp(-ph * 30) * 0.2) * (1 - t / 0.6);
    });
    B('trapdoor', 1.5, (t, _i, _n, st) => {
      const creak = Math.sin(2 * Math.PI * (90 + 40 * Math.sin(t * 13)) * t) * (t < 0.4 ? t / 0.4 : 0) * 0.3;
      const slam = t > 0.45 ? ((rnd(st) * 2 - 1) * 0.8 + Math.sin(2 * Math.PI * 50 * (t - 0.45))) * env(t - 0.45, 0.002, 0.25) : 0;
      return creak + slam;
    }, 8, 2500);
    B('whoosh', 0.4, (t, _i, _n, st) => {
      st.a += ((rnd(st) * 2 - 1) - st.a) * (0.05 + 0.4 * Math.sin((t / 0.4) * Math.PI));
      return st.a * Math.sin((t / 0.4) * Math.PI) * 0.8;
    });
    B('blip', 0.08, (t) => sq(t * 880) * env(t, 0.001, 0.03) * 0.3);
    B('buzz', 0.5, (t) => (sq(t * 120) * 0.3 + sq(t * 240) * 0.15) * (t < 0.45 ? 1 : (0.5 - t) * 20) * 0.5);
    B('sting', 1.4, (t) => {
      const notes = [523, 659, 784, 1046];
      let s = 0;
      notes.forEach((f, k) => {
        const tt = t - k * 0.09;
        if (tt > 0) s += sq(tt * f) * env(tt, 0.005, 0.35) * 0.15 + Math.sin(2 * Math.PI * f * tt) * env(tt, 0.005, 0.6) * 0.15;
      });
      return s;
    });
    B('pickup', 0.6, (t, _i, _n, st) => (rnd(st) * 2 - 1) * env(t, 0.001, 0.03) * 0.5 + Math.sin(2 * Math.PI * 70 * t) * env(t, 0.005, 0.1) * 0.5);
    B('hangup', 0.3, (t, _i, _n, st) => (rnd(st) * 2 - 1) * env(t, 0.001, 0.04) + Math.sin(2 * Math.PI * 90 * t) * env(t, 0.002, 0.08));
    B('error', 0.25, (t) => sq(t * 140) * env(t, 0.002, 0.1) * 0.4);
    B('gasp', 0.8, (t, _i, _n, st) => (rnd(st) * 2 - 1) * Math.sin(Math.min(1, t / 0.8) * Math.PI) * 0.5, 9, 3000);
    B('laugh', 1.2, (t, _i, _n, st) => (rnd(st) * 2 - 1) * (0.5 + 0.5 * Math.sin(t * 40)) * Math.sin(Math.min(1, t / 1.2) * Math.PI) * 0.4, 9, 2500);
    B('static', 0.6, (t, _i, _n, st) => (rnd(st) * 2 - 1) * env(t, 0.002, 0.3) * 0.6, 6, 8000);
    B('signoff', 2.5, (t) => Math.sin(2 * Math.PI * 1000 * t) * (t < 2.2 ? 0.25 : (2.5 - t) * 0.8));
    B('rimshot', 0.4, (t, _i, _n, st) => (rnd(st) * 2 - 1) * env(t, 0.001, 0.05) * 0.7 + (t > 0.15 ? (rnd(st) * 2 - 1) * env(t - 0.15, 0.001, 0.12) * 0.5 : 0));
    B('register', 0.6, (t) => Math.sin(2 * Math.PI * 2100 * t) * env(t, 0.002, 0.25) * 0.4);
    B('fanfare', 1.6, (t) => {
      let s = 0;
      [523, 659, 784, 1046].forEach((f, k) => {
        const tt = t - k * 0.15;
        if (tt > 0) s += sq(tt * f) * env(tt, 0.01, 0.8) * 0.12;
      });
      return s;
    });
    B('drumroll', 1, (t, _i, _n, st) => (rnd(st) * 2 - 1) * (0.4 + 0.6 * Math.abs(Math.sin(t * 90))) * 0.35, 9, 6000);
    B('heartbeat', 1, (t) => Math.sin(2 * Math.PI * 50 * t) * (env(t, 0.005, 0.08) + (t > 0.25 ? env(t - 0.25, 0.005, 0.1) * 0.7 : 0)) * 0.8);
    B('roomtone', 2, (_t, _i, _n, st) => {
      st.a += ((rnd(st) * 2 - 1) - st.a) * 0.02;
      return st.a * 0.8;
    }, 10, 600);
    B('tension', 2, (t, _i, _n, st) => (rnd(st) * 2 - 1) * (0.2 + 0.8 * (t / 2)) * 0.25 + Math.sin(2 * Math.PI * (80 + 200 * t) * t) * 0.15, 9, 4000);
    B('gameoverCue', 1.6, (t) => {
      let s = 0;
      [392, 370, 349, 262].forEach((f, k) => {
        const tt = t - k * 0.3;
        if (tt > 0) s += sq(tt * f) * env(tt, 0.01, 0.4) * 0.12;
      });
      return s;
    });
    B('powerup', 0.9, (t, _i, _n, st) => {
      const hum = sq(t * 60) * 0.15 + sq(t * 120) * 0.1;
      const clunk = (rnd(st) * 2 - 1) * env(t, 0.001, 0.03);
      return clunk + hum * Math.min(1, t * 4) * (1 - t / 0.9);
    }, 8, 3000);
  }

  /** Replace procedural buffers with real files where available: ElevenLabs first, then CC0. */
  async loadFiles(): Promise<void> {
    const idx = (index as { assets: Record<string, { type: string; url: string }> }).assets;
    const el = elIndex as Record<string, string>;
    const ids = new Set([...Object.keys(FILE_IDS), ...Object.keys(EL_IDS)] as SfxId[]);
    await Promise.all(
      [...ids].map(async (sid) => {
        const elUrl = EL_IDS[sid] ? el[EL_IDS[sid]!] : undefined;
        const e = FILE_IDS[sid] ? idx[FILE_IDS[sid]!] : undefined;
        const url = elUrl ?? (e && e.type === 'audio' ? e.url : undefined);
        if (!url) return;
        try {
          const res = await fetch(url);
          const buf = await this.mixer.ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(sid, buf);
        } catch {
          /* keep procedural */
        }
      }),
    );
  }

  /** A looping bed (drumroll, heartbeat, room tone). Returns a handle that fades it out. */
  loop(id: SfxId, gain = 0.6, bus: 'sfx' | 'ambience' = 'sfx', fadeIn = 0.15, repeat = true): { stop: (fade?: number) => void; gain: GainNode } | null {
    if (!this.mixer.running) return null;
    const buf = this.buffers.get(id);
    if (!buf) return null;
    const c = this.mixer.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = repeat;
    const g = c.createGain();
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(gain, c.currentTime + fadeIn);
    src.connect(g).connect(this.mixer.buses[bus]);
    src.start();
    return {
      gain: g,
      stop: (fade = 0.25) => {
        const t = c.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + fade);
        try {
          src.stop(t + fade + 0.05);
        } catch {
          /* already ended */
        }
      },
    };
  }

  play(id: SfxId, o: { pitch?: number; gain?: number; jitter?: number; delay?: number; pan?: number } = {}): AudioBufferSourceNode | null {
    if (!this.mixer.running) return null;
    const buf = this.buffers.get(id);
    if (!buf) return null;
    const c = this.mixer.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    const j = o.jitter ?? 0.06;
    src.playbackRate.value = (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * j);
    const g = c.createGain();
    g.gain.value = (o.gain ?? 1) * (1 + (Math.random() * 2 - 1) * j * 0.5);
    let node: AudioNode = src.connect(g);
    if (o.pan !== undefined && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = o.pan;
      node = node.connect(p);
    }
    node.connect(this.mixer.buses.sfx);
    src.start(c.currentTime + (o.delay ?? 0));
    return src;
  }

  /** Flapper tick: pitch rises as the wheel slows (speed in deg/s). */
  tick(speed: number): void {
    const slow = 1 - Math.min(1, speed / 700);
    this.play('tick', { pitch: 0.8 + slow * 0.9, gain: 0.35 + slow * 0.5, jitter: 0.1 });
  }

  startRinging(): void {
    if (this.ringing || !this.mixer.running) return;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      this.play('bell', { gain: 0.7, jitter: 0.01, pan: -0.6 });
      timer = window.setTimeout(loop, 2400);
    };
    let timer = window.setTimeout(loop, 0);
    this.ringing = {
      stop: () => {
        alive = false;
        clearTimeout(timer);
      },
    };
  }

  stopRinging(): void {
    this.ringing?.stop();
    this.ringing = null;
  }
}

export type { SfxId };
