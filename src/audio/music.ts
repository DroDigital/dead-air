/**
 * A cheerful procedural game-show loop that detunes, slows and warbles more each Deadline.
 * Also the ambience bed: room tone, HVAC rumble, fluorescent buzz.
 */
import type { Mixer } from './mixer';

const PROG = [
  [0, 4, 7],
  [9, 12, 16],
  [5, 9, 12],
  [7, 11, 14],
]; // I – vi – IV – V (semitones from C)
const MELODY = [12, 16, 19, 16, 21, 19, 16, 14, 12, 14, 16, 12, 9, 12, 14, 7];
const BASS = [0, 7, 9, 4, 5, 0, 7, 2];

export class Music {
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private out: GainNode;
  private wow: OscillatorNode;
  private wowGain: GainNode;
  private intensity = 0;
  private tempo = 126;
  private detune = 0;
  playing = false;
  private wantPlaying = false;
  private amb: { stop: () => void } | null = null;
  private buzzGain: GainNode | null = null;

  constructor(private mixer: Mixer) {
    const c = mixer.ctx;
    this.out = c.createGain();
    this.out.gain.value = 0.5;
    this.out.connect(mixer.buses.music);
    // Tape wow: an LFO shared by every voice's detune.
    this.wow = c.createOscillator();
    this.wow.frequency.value = 0.6;
    this.wowGain = c.createGain();
    this.wowGain.gain.value = 0;
    this.wow.connect(this.wowGain);
    this.wow.start();
  }

  /** Deadline 1 is clean; each Deadline adds detune, slows the tempo and deepens the warble. */
  setDeadline(d: number): void {
    const k = Math.max(0, Math.min(12, d - 1));
    this.intensity = k;
    this.tempo = 126 - k * 4.5;
    this.detune = k * 9;
    this.wow.frequency.setTargetAtTime(0.5 + k * 0.12, this.mixer.ctx.currentTime, 0.5);
    this.wowGain.gain.setTargetAtTime(4 + k * 7, this.mixer.ctx.currentTime, 0.5);
  }

  start(): void {
    this.wantPlaying = true;
    if (this.playing || !this.mixer.running) return;
    this.playing = true;
    this.nextTime = this.mixer.ctx.currentTime + 0.1;
    const tick = () => {
      const c = this.mixer.ctx;
      while (this.nextTime < c.currentTime + 0.2) {
        this.schedule(this.step, this.nextTime);
        this.step++;
        this.nextTime += 60 / this.tempo / 2;
      }
    };
    this.timer = window.setInterval(tick, 50);
  }

  /** Starts a loop that was requested before the browser unlocked audio. */
  kick(): void {
    if (this.wantPlaying && !this.playing) this.start();
  }

  stop(): void {
    this.wantPlaying = false;
    this.playing = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  setLevel(v: number, seconds = 0.4): void {
    this.out.gain.setTargetAtTime(0.5 * v, this.mixer.ctx.currentTime, seconds / 3);
  }

  private voice(type: OscillatorType, midi: number, t: number, dur: number, gain: number, detune = 0): void {
    const c = this.mixer.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    o.detune.value = detune + (Math.random() * 2 - 1) * this.detune;
    this.wowGain.connect(o.detune);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
    o.onended = () => {
      try {
        this.wowGain.disconnect(o.detune);
      } catch {
        /* already gone */
      }
    };
  }

  private schedule(step: number, t: number): void {
    const bar = Math.floor(step / 8) % PROG.length;
    const pos = step % 8;
    const root = 48;
    const chord = PROG[bar];
    const eighth = 60 / this.tempo / 2;
    // Bass on every quarter.
    if (pos % 2 === 0) this.voice('triangle', root - 12 + chord[0] + (BASS[(step / 2) % BASS.length | 0] === 7 && pos === 4 ? 7 : 0), t, eighth * 1.8, 0.22);
    // Organ stabs on the off-beats.
    if (pos % 2 === 1) for (const n of chord) this.voice('square', root + 12 + n, t, eighth * 0.8, 0.035);
    // Glockenspiel melody.
    const m = MELODY[(step + bar * 3) % MELODY.length];
    if (pos !== 7 || bar % 2) this.voice('sine', root + 24 + m, t, eighth * 2.5, 0.07, this.intensity > 4 ? -20 * Math.sin(step) : 0);
    // Wrong notes creep in later.
    if (this.intensity > 3 && Math.random() < this.intensity * 0.02) this.voice('sawtooth', root + 24 + m + 1, t, eighth, 0.02);
    // Brush hat.
    if (pos % 2 === 0) this.noiseHit(t, 0.03, 0.04);
  }

  private noiseHit(t: number, dur: number, gain: number): void {
    const c = this.mixer.ctx;
    const n = Math.floor(c.sampleRate * dur);
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource();
    s.buffer = b;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = c.createGain();
    g.gain.value = gain;
    s.connect(f).connect(g).connect(this.out);
    s.start(t);
  }

  /** Room tone + HVAC + fluorescent buzz on the ambience bus. */
  startAmbience(): void {
    if (this.amb || !this.mixer.running) return;
    const c = this.mixer.ctx;
    const len = c.sampleRate * 4;
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const noise = c.createBufferSource();
    noise.buffer = b;
    noise.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const hvacLfo = c.createOscillator();
    hvacLfo.frequency.value = 0.08;
    const hvacDepth = c.createGain();
    hvacDepth.gain.value = 120;
    hvacLfo.connect(hvacDepth).connect(lp.frequency);
    const ng = c.createGain();
    ng.gain.value = 0.5;
    noise.connect(lp).connect(ng).connect(this.mixer.buses.ambience);
    const buzz = c.createOscillator();
    buzz.type = 'sawtooth';
    buzz.frequency.value = 120;
    const bf = c.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 2400;
    bf.Q.value = 3;
    this.buzzGain = c.createGain();
    this.buzzGain.gain.value = 0.025;
    buzz.connect(bf).connect(this.buzzGain).connect(this.mixer.buses.ambience);
    noise.start();
    hvacLfo.start();
    buzz.start();
    this.amb = {
      stop: () => {
        noise.stop();
        hvacLfo.stop();
        buzz.stop();
      },
    };
  }

  /** Fluorescent buzz follows the tube's flicker. */
  setBuzz(level: number): void {
    if (this.buzzGain) this.buzzGain.gain.setTargetAtTime(0.025 * level, this.mixer.ctx.currentTime, 0.01);
  }
}
