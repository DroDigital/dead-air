/**
 * Voice-over: ElevenLabs-voiced lines (custom voices, eleven_v4) played through per-speaker
 * effect chains, so each character sounds like where they are:
 *
 *   host     — a voice coming out of a CRT television head: band-limited, a little saturated,
 *              speaker-grille resonance, studio slap-back. Degrades with the Deadline (tape wow,
 *              grit) and glitches (dropouts, stutters) when the show starts going wrong.
 *   producer — a late-night phone line: 300–3.4 kHz, hard clipping, line hiss and crackle.
 *   secret   — a crossed line: thinner, noisier, signal dropouts, a long dark tail.
 *   archive  — an old reel-to-reel: dull top end, wow and flutter, tape hiss.
 *
 * Lines without a clip fall back to the gibberish synth (see voice.ts).
 */
import voIndex from '../assets/vo.json';
import type { Mixer } from './mixer';
import { voId } from './voId';

export type VoSpeaker = 'host' | 'producer' | 'secret' | 'archive';
const INDEX = voIndex as Record<string, number>;

export interface VoMood {
  /** 0..1: tape wear, wow and saturation (rises with the Deadline). */
  wear: number;
  /** 0..1: chance and depth of dropouts/stutters. */
  glitch: number;
  /** Slow the tape down at the end of the line (dying broadcast). */
  powerDown?: boolean;
}

function curve(k: number): Float32Array {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) {
    const x = (i / (c.length - 1)) * 2 - 1;
    c[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  return c;
}

/** Exponentially decaying noise impulse = a cheap room. */
function impulse(ctx: BaseAudioContext, seconds: number, decay: number, bright: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      lp += (w - lp) * bright;
      d[i] = lp * Math.pow(1 - i / n, decay);
    }
  }
  return b;
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, crackle: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.5 + (Math.random() < crackle ? (Math.random() * 2 - 1) * 4 : 0);
  return b;
}

export class VoPlayer {
  private cache = new Map<string, Promise<AudioBuffer | null>>();
  private current: { src: AudioBufferSourceNode; nodes: AudioNode[]; stopAt: number } | null = null;
  private analyser: AnalyserNode;
  private level = new Uint8Array(256);
  private rooms: Partial<Record<VoSpeaker, AudioBuffer>> = {};
  private noise: AudioBuffer | null = null;
  enabled = true;

  constructor(private mixer: Mixer) {
    this.analyser = mixer.ctx.createAnalyser();
    this.analyser.fftSize = 256;
  }

  has(speaker: VoSpeaker, text: string): boolean {
    return this.enabled && voId(speaker, text) in INDEX;
  }

  /** Clip length in seconds, or 0 if the line isn't voiced. */
  duration(speaker: VoSpeaker, text: string): number {
    return INDEX[voId(speaker, text)] ?? 0;
  }

  private load(id: string): Promise<AudioBuffer | null> {
    let p = this.cache.get(id);
    if (!p) {
      p = fetch(`assets/vo/${id}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((a) => this.mixer.ctx.decodeAudioData(a))
        .catch(() => null);
      this.cache.set(id, p);
    }
    return p;
  }

  /** Warm the cache for lines likely to play soon (idle-time, a few at a time). */
  preload(lines: { speaker: VoSpeaker; text: string }[]): void {
    let i = 0;
    const next = () => {
      const batch = lines.slice(i, i + 4);
      i += 4;
      if (!batch.length) return;
      void Promise.all(batch.map((l) => (this.has(l.speaker, l.text) ? this.load(voId(l.speaker, l.text)) : null))).then(() => setTimeout(next, 120));
    };
    next();
  }

  /** Current output amplitude 0..1 (drives the host's mouth). */
  amplitude(): number {
    if (!this.current) return 0;
    this.analyser.getByteTimeDomainData(this.level);
    let peak = 0;
    for (let i = 0; i < this.level.length; i++) peak = Math.max(peak, Math.abs(this.level[i] - 128));
    return Math.min(1, peak / 70);
  }

  get speaking(): boolean {
    return !!this.current && this.mixer.ctx.currentTime < this.current.stopAt;
  }

  stop(): void {
    if (!this.current) return;
    const { src, nodes } = this.current;
    const t = this.mixer.ctx.currentTime;
    try {
      src.stop(t + 0.03);
    } catch {
      /* ended */
    }
    setTimeout(() => nodes.forEach((n) => n.disconnect()), 400);
    this.current = null;
  }

  /** Play a voiced line. Returns its duration (seconds), or 0 if there is no clip. */
  play(speaker: VoSpeaker, text: string, mood: VoMood = { wear: 0, glitch: 0 }): number {
    const id = voId(speaker, text);
    const dur = INDEX[id];
    if (!this.enabled || !dur || !this.mixer.running) return 0;
    this.stop();
    const token = {};
    this.pending = token;
    void this.load(id).then((buf) => {
      if (!buf || this.pending !== token) return;
      this.start(speaker, buf, mood);
    });
    return dur;
  }
  private pending: object | null = null;

  private start(speaker: VoSpeaker, buf: AudioBuffer, mood: VoMood): void {
    const c = this.mixer.ctx;
    const t = c.currentTime + 0.02;
    const nodes: AudioNode[] = [];
    const add = <T extends AudioNode>(n: T): T => (nodes.push(n), n);
    const src = add(c.createBufferSource());
    src.buffer = buf;
    const wear = Math.max(0, Math.min(1, mood.wear));

    const bq = (type: BiquadFilterType, f: number, q = 0.7, gain = 0) => {
      const b = add(c.createBiquadFilter());
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      b.gain.value = gain;
      return b;
    };
    const shaper = (k: number) => {
      const s = add(c.createWaveShaper());
      s.curve = curve(k) as Float32Array<ArrayBuffer>;
      s.oversample = '2x';
      return s;
    };
    const gain = (v: number) => {
      const g = add(c.createGain());
      g.gain.value = v;
      return g;
    };
    const lfo = (freq: number, depth: number, target: AudioParam) => {
      const o = add(c.createOscillator());
      o.frequency.value = freq;
      const g = gain(depth);
      o.connect(g).connect(target);
      o.start(t);
      o.stop(t + buf.duration + 3);
    };
    const room = (sp: VoSpeaker, seconds: number, decay: number, bright: number) => (this.rooms[sp] ??= impulse(c, seconds, decay, bright));
    const hiss = (level: number, crackle: number, lo: number, hi: number) => {
      this.noise ??= noiseBuffer(c, 3, 0.0004);
      const n = add(c.createBufferSource());
      n.buffer = crackle > 0.001 ? noiseBuffer(c, 3, crackle) : this.noise;
      n.loop = true;
      const g = gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + 0.08);
      g.gain.setValueAtTime(level, t + buf.duration + 0.1);
      g.gain.linearRampToValueAtTime(0, t + buf.duration + 0.35);
      n.connect(bq('highpass', lo)).connect(bq('lowpass', hi)).connect(g);
      n.start(t);
      n.stop(t + buf.duration + 0.5);
      return g;
    };

    const out = gain(1);
    let chain: AudioNode;
    const env = gain(1);
    if (speaker === 'host') {
      // CRT speaker: grille resonance, a bit of grit that grows with wear, slap-back off the set.
      chain = src.connect(bq('highpass', 170)).connect(bq('peaking', 2600, 1.2, 5)).connect(bq('peaking', 900, 2, 2)).connect(shaper(1.3 + wear * 3)).connect(bq('lowpass', 6800 - wear * 2600)).connect(env);
      const conv = add(c.createConvolver());
      conv.buffer = room('host', 0.7, 3, 0.35);
      const wet = gain(0.14 + wear * 0.08);
      env.connect(out);
      env.connect(conv).connect(wet).connect(out);
      lfo(0.6 + wear * 0.5, 4 + wear * 22, src.detune);
      lfo(6.5, wear * 5, src.detune);
    } else if (speaker === 'producer') {
      // Telephone: narrow band, hard clip, line hiss with crackle.
      chain = src.connect(bq('highpass', 320, 0.9)).connect(bq('peaking', 1800, 1, 6)).connect(shaper(3.2)).connect(bq('lowpass', 3300, 0.9)).connect(env);
      env.connect(out);
      hiss(0.018, 0.0008, 400, 3600).connect(out);
      lfo(0.3, 3, src.detune);
    } else if (speaker === 'secret') {
      // Crossed line: thinner and further away, dropouts, long cold tail.
      src.playbackRate.value = 0.985;
      chain = src.connect(bq('highpass', 480, 1)).connect(shaper(2.2)).connect(bq('lowpass', 2700, 1.2)).connect(env);
      const conv = add(c.createConvolver());
      conv.buffer = room('secret', 2.6, 2, 0.12);
      env.connect(gain(0.8)).connect(out);
      env.connect(conv).connect(gain(0.32)).connect(out);
      hiss(0.03, 0.002, 600, 4200).connect(out);
      lfo(0.17, 9, src.detune);
      mood = { ...mood, glitch: Math.max(mood.glitch, 0.35) };
    } else {
      // Reel-to-reel archive: dull, warbly, hissy.
      chain = src.connect(bq('highpass', 110)).connect(bq('lowpass', 4300, 0.8)).connect(shaper(1.6)).connect(env);
      env.connect(out);
      hiss(0.012, 0, 2000, 9000).connect(out);
      lfo(0.45, 14, src.detune);
      lfo(7.2, 5, src.detune);
    }
    void chain;

    // Glitches: short dropouts and the odd stutter (gain gating), scheduled ahead.
    const g = mood.glitch;
    if (g > 0) {
      const n = Math.floor(buf.duration * g * 1.6 * Math.random() + (g > 0.5 ? 1 : 0));
      for (let i = 0; i < n; i++) {
        const at = t + 0.3 + Math.random() * Math.max(0.1, buf.duration - 0.6);
        const len = 0.03 + Math.random() * 0.09 * g;
        env.gain.setValueAtTime(1, at);
        env.gain.linearRampToValueAtTime(0.02, at + 0.008);
        env.gain.setValueAtTime(0.02, at + len);
        env.gain.linearRampToValueAtTime(1, at + len + 0.01);
      }
    }
    if (mood.powerDown) {
      // A dying tape: the last second sags in pitch and level.
      const end = t + buf.duration;
      src.playbackRate.setValueAtTime(src.playbackRate.value, Math.max(t, end - 1.4));
      src.playbackRate.linearRampToValueAtTime(0.72, end);
    }

    out.connect(this.analyser);
    out.connect(this.mixer.buses.voice);
    src.start(t);
    const stopAt = t + buf.duration / Math.max(0.7, src.playbackRate.value) + 0.1;
    this.current = { src, nodes, stopAt };
    // Keep the music out of the way while someone talks.
    this.mixer.duck('music', 0.55, buf.duration + 0.4);
    src.onended = () => {
      if (this.current?.src === src) this.current = null;
      setTimeout(() => nodes.forEach((n) => n.disconnect()), 600);
    };
  }
}
