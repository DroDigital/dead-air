/**
 * WebAudio mixer: master → (music, sfx, voice, ambience) buses. A gentle lowpass + soft clip
 * on the master gives everything the same "old studio PA" colour.
 */

export type Bus = 'music' | 'sfx' | 'voice' | 'ambience';

export class Mixer {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly buses: Record<Bus, GainNode>;
  private tone: BiquadFilterNode;
  private muffle: BiquadFilterNode;
  private started = false;

  constructor() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.tone = this.ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 9000;
    this.muffle = this.ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    const clip = this.ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.4) / Math.tanh(1.4);
    }
    clip.curve = curve;
    this.master.connect(this.muffle).connect(this.tone).connect(clip).connect(this.ctx.destination);
    const mk = () => {
      const g = this.ctx.createGain();
      g.connect(this.master);
      return g;
    };
    this.buses = { music: mk(), sfx: mk(), voice: mk(), ambience: mk() };
  }

  /** Browsers require a user gesture before audio starts. */
  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.started = true;
  }

  get running(): boolean {
    return this.started && this.ctx.state === 'running';
  }

  setVolumes(v: { masterVolume: number; music: number; sfx: number; voice: number; ambience: number }): void {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.masterVolume, t, 0.05);
    this.buses.music.gain.setTargetAtTime(v.music * 0.55, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.buses.voice.gain.setTargetAtTime(v.voice * 0.8, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(v.ambience * 0.6, t, 0.05);
  }

  /** Muffle everything (lights-out / phone call / game over). */
  setMuffle(amount: number): void {
    this.muffle.frequency.setTargetAtTime(20000 * Math.pow(0.03, amount), this.ctx.currentTime, 0.08);
  }

  duck(bus: Bus, to: number, seconds: number): void {
    const g = this.buses[bus].gain;
    const t = this.ctx.currentTime;
    const cur = g.value;
    g.cancelScheduledValues(t);
    g.setValueAtTime(cur, t);
    g.linearRampToValueAtTime(cur * to, t + 0.05);
    g.linearRampToValueAtTime(cur, t + seconds);
  }
}
