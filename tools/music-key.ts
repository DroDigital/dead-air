/**
 * Music key alignment: estimate each track's key and tuning, pick one key signature for the
 * whole score, and write the per-track pitch shift into assets/music.json (the asset pipeline
 * applies it with ffmpeg's rubberband filter, tempo unchanged). Crossfades between the title,
 * the wheel, the Cabinet, the phone and the deadline then stay in one key.
 *
 *   npx tsx tools/music-key.ts          analyse and print
 *   npx tsx tools/music-key.ts --write  also store key/shift in assets/music.json
 *
 * Key: a chromagram (55 Hz–4 kHz, 16k-point frames at 11.025 kHz) correlated with the
 * Krumhansl–Schmuckler major/minor profiles for all 24 keys. Tuning: the circular mean of
 * spectral-peak deviations from the A440 grid (parabolic peak interpolation), so a track that
 * sits a few cents sharp or flat is brought onto the same grid as the others.
 * Needs ffmpeg.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SR = 11025;
const N = 16384;
const HOP = 8192;
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function decode(file: string): Float32Array {
  const buf = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang),
      wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k,
          b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

function corr(a: number[], b: number[]): number {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

export interface KeyResult {
  tonic: number;
  mode: 'major' | 'minor';
  name: string;
  confidence: number;
  runnerUp: string;
  /** Tuning offset from A440 in cents (positive = sharp). */
  cents: number;
}

export function analyse(file: string): KeyResult {
  const x = decode(file);
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const chroma = new Array(12).fill(0);
  let tx = 0,
    ty = 0;
  const re = new Float64Array(N),
    im = new Float64Array(N);
  for (let s = 0; s + N <= x.length; s += HOP) {
    for (let i = 0; i < N; i++) {
      re[i] = x[s + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float64Array(N / 2);
    for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    let peak = 0;
    for (let k = 1; k < N / 2; k++) peak = Math.max(peak, mag[k]);
    for (let k = 2; k < N / 2 - 1; k++) {
      const f = (k * SR) / N;
      if (f < 55 || f > 4000) continue;
      // Spectral peaks only: they carry the notes, and give sub-bin tuning by interpolation.
      if (mag[k] < mag[k - 1] || mag[k] < mag[k + 1] || mag[k] < peak * 0.05) continue;
      const a = Math.log(mag[k - 1] + 1e-12),
        b = Math.log(mag[k] + 1e-12),
        c = Math.log(mag[k + 1] + 1e-12);
      const d = (0.5 * (a - c)) / (a - 2 * b + c);
      const fp = ((k + d) * SR) / N;
      const midi = 69 + 12 * Math.log2(fp / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      const w = mag[k];
      chroma[pc] += w;
      if (fp > 100 && fp < 2000) {
        const dev = (midi - Math.round(midi)) * 2 * Math.PI; // ±π for ±50 cents
        tx += w * Math.cos(dev);
        ty += w * Math.sin(dev);
      }
    }
  }
  const scores: { tonic: number; mode: 'major' | 'minor'; r: number }[] = [];
  for (let t = 0; t < 12; t++) {
    const rot = (p: number[]) => p.map((_, i) => p[(i - t + 12) % 12]);
    scores.push({ tonic: t, mode: 'major', r: corr(chroma, rot(MAJOR)) });
    scores.push({ tonic: t, mode: 'minor', r: corr(chroma, rot(MINOR)) });
  }
  scores.sort((a, b) => b.r - a.r);
  const nm = (s: { tonic: number; mode: string }) => `${NAMES[s.tonic]} ${s.mode}`;
  return {
    tonic: scores[0].tonic,
    mode: scores[0].mode,
    name: nm(scores[0]),
    confidence: Math.round(scores[0].r * 1000) / 1000,
    runnerUp: nm(scores[1]),
    cents: Math.round((Math.atan2(ty, tx) / (2 * Math.PI)) * 100),
  };
}

/** Key signature index: a minor key shares its signature with the major key a minor third up. */
const signature = (k: { tonic: number; mode: string }) => (k.mode === 'major' ? k.tonic : (k.tonic + 3) % 12);
const wrap = (s: number) => ((((s + 6) % 12) + 12) % 12) - 6;

if (process.argv[1]?.endsWith('music-key.ts')) {
  const ROOT = join(import.meta.dirname, '..');
  const manifest = JSON.parse(readFileSync(join(ROOT, 'assets', 'music.json'), 'utf8')) as {
    target?: { signature: string; why: string };
    tracks: { id: string; file: string; kind: string; title: string; weight?: number; key?: string; shift?: number; cents?: number }[];
  };
  const el = JSON.parse(readFileSync(join(ROOT, 'assets', 'elevenlabs.json'), 'utf8')) as { audio: { id: string; file: string; kind: string }[] };
  // Tonal music the player hears crossfading: the owner's tracks plus the phone lounge (ElevenLabs).
  const items = [
    // Cues (spin tension, game over) sit on top of or right after the score, so they follow it too.
    ...manifest.tracks.map((t) => ({ id: t.id, path: join(ROOT, 'assets-src', 'music', t.file), weight: t.id === 'track.main' ? 3 : t.kind === 'music' ? 2 : 1 })),
    ...el.audio.filter((a) => a.id === 'el.music_lounge').map((a) => ({ id: a.id, path: join(ROOT, 'assets-src', 'elevenlabs', a.file), weight: 1 })),
  ];
  const res = items.map((it) => ({ ...it, key: analyse(it.path) }));
  for (const r of res) console.log(`${r.id.padEnd(16)} ${r.key.name.padEnd(9)} r=${r.key.confidence}  (runner-up ${r.key.runnerUp})  tuning ${r.key.cents >= 0 ? '+' : ''}${r.key.cents}¢`);
  // Pick the key signature that needs the least weighted shifting (smaller shifts sound cleaner).
  let best = { sig: 0, cost: Infinity };
  for (let sig = 0; sig < 12; sig++) {
    const cost = res.reduce((s, r) => s + r.weight * Math.abs(wrap(sig - signature(r.key))) ** 1.5, 0);
    if (cost < best.cost) best = { sig, cost };
  }
  const allMinor = res.every((r) => r.key.mode === 'minor');
  const sigName = allMinor ? `${NAMES[(best.sig + 9) % 12]} minor` : `${NAMES[best.sig]} major / ${NAMES[(best.sig + 9) % 12]} minor`;
  console.log(`\ntarget key signature: ${sigName}`);
  const shifts = res.map((r) => ({ id: r.id, semis: wrap(best.sig - signature(r.key)), cents: -r.key.cents, key: r.key.name }));
  for (const s of shifts) console.log(`${s.id.padEnd(16)} ${s.key.padEnd(9)} → shift ${s.semis >= 0 ? '+' : ''}${s.semis} semitones ${s.cents >= 0 ? '+' : ''}${s.cents}¢`);
  if (process.argv.includes('--write')) {
    manifest.target = { signature: sigName, why: 'Least total shift across the score (weighted toward the wheel theme), so crossfades stay in one key.' };
    for (const t of manifest.tracks) {
      const s = shifts.find((x) => x.id === t.id);
      if (s) Object.assign(t, { key: s.key, shift: s.semis, cents: s.cents });
    }
    writeFileSync(join(ROOT, 'assets', 'music.json'), JSON.stringify(manifest, null, 2) + '\n');
    const lounge = shifts.find((x) => x.id === 'el.music_lounge');
    if (lounge) {
      const elm = JSON.parse(readFileSync(join(ROOT, 'assets', 'elevenlabs.json'), 'utf8'));
      for (const a of elm.audio) if (a.id === 'el.music_lounge') Object.assign(a, { key: lounge.key, shift: lounge.semis, cents: lounge.cents });
      writeFileSync(join(ROOT, 'assets', 'elevenlabs.json'), JSON.stringify(elm, null, 2) + '\n');
    }
    console.log('written to assets/music.json and assets/elevenlabs.json');
  }
}
