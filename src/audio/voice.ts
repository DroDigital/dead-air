/**
 * Gibberish voices generated from caption text. Each syllable becomes a short formant blip
 * whose pitch contour follows punctuation (rises on '?', jumps on '!').
 */
import type { Mixer } from './mixer';

export interface VoiceProfile {
  base: number;
  range: number;
  wave: OscillatorType;
  formants: [number, number];
  rate: number;
  /** Telephone band-limit (Producer). */
  phone: boolean;
}

export const HOST_VOICE: VoiceProfile = { base: 210, range: 90, wave: 'square', formants: [800, 1800], rate: 11, phone: false };
export const PRODUCER_VOICE: VoiceProfile = { base: 105, range: 30, wave: 'sawtooth', formants: [500, 1400], rate: 8, phone: true };
export const SECRET_VOICE: VoiceProfile = { base: 150, range: 15, wave: 'triangle', formants: [400, 900], rate: 6, phone: true };

const VOWEL_F: Record<string, [number, number]> = {
  a: [800, 1200],
  e: [500, 1900],
  i: [320, 2300],
  o: [520, 900],
  u: [350, 800],
  y: [400, 2000],
};

export function syllables(text: string): { vowel: string; stress: number; end: string }[] {
  const out: { vowel: string; stress: number; end: string }[] = [];
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  for (const w of words) {
    const vowels = w.match(/[aeiouy]+/g) ?? ['a'];
    const end = /[!?.,]$/.test(w) ? w[w.length - 1] : '';
    vowels.slice(0, 4).forEach((v, i) => out.push({ vowel: v[0], stress: i === 0 ? 1 : 0.6, end: i === vowels.length - 1 ? end : '' }));
  }
  return out;
}

export class Voice {
  private active: OscillatorNode[] = [];

  constructor(private mixer: Mixer) {}

  /** Speak `text`; returns its duration in seconds. */
  speak(text: string, p: VoiceProfile, speed = 1): number {
    const syl = syllables(text);
    const step = 1 / (p.rate * speed);
    const dur = syl.length * step;
    if (!this.mixer.running) return dur;
    this.stop();
    const c = this.mixer.ctx;
    const out = c.createGain();
    out.gain.value = 0.35;
    let node: AudioNode = out;
    if (p.phone) {
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 400;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2800;
      out.connect(hp).connect(lp);
      node = lp;
    }
    node.connect(this.mixer.buses.voice);
    let t = c.currentTime + 0.02;
    let pitch = p.base;
    syl.forEach((s, i) => {
      const f = VOWEL_F[s.vowel] ?? p.formants;
      const target = p.base + (Math.sin(i * 1.7) * 0.5 + (s.end === '?' ? 0.9 : s.end === '!' ? 0.7 : 0)) * p.range * s.stress;
      pitch += (target - pitch) * 0.6;
      const o = c.createOscillator();
      o.type = p.wave;
      o.frequency.setValueAtTime(pitch, t);
      o.frequency.linearRampToValueAtTime(pitch * (s.end === '?' ? 1.25 : 0.92), t + step * 0.9);
      const f1 = c.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = f[0];
      f1.Q.value = 4;
      const f2 = c.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = f[1];
      f2.Q.value = 6;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.9 * s.stress, t + 0.012);
      g.gain.setValueAtTime(0.9 * s.stress, t + step * 0.6);
      g.gain.linearRampToValueAtTime(0, t + step * 0.9);
      o.connect(f1).connect(g);
      o.connect(f2).connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + step);
      this.active.push(o);
      t += step * (s.end === ',' ? 1.6 : s.end ? 2 : 1);
    });
    return dur;
  }

  stop(): void {
    for (const o of this.active) {
      try {
        o.stop();
      } catch {
        /* ended */
      }
    }
    this.active = [];
  }
}
