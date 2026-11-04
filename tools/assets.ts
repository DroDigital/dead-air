/**
 * Asset pipeline: `npm run assets` (convert) / `npm run assets -- --fetch` (download, then convert).
 *
 *   /assets/manifest.json  → source of truth (id, src, out, licence, author, modifications)
 *   /assets-src/**         → raw downloaded sources
 *   /public/assets/**      → PS1-conformed outputs
 *   src/assets/manifest.json → runtime index of ids that have a real file
 *   CREDITS.md, ASSETS_TODO.md → generated
 *
 * Conversions:
 *   texture: downscale to 64/128 px, quantise to 15-bit colour, PNG (sampled nearest at runtime)
 *   model:   drop normal/ARM maps, weld + decimate with meshoptimizer, downscale base colour → GLB
 *   audio:   (WAV PCM16) resample to 22.05 kHz, one-pole lowpass, bitcrush → WAV
 *   font:    copied as-is
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets-src');
const OUT = join(ROOT, 'public', 'assets');

interface Entry {
  id: string;
  type: 'texture' | 'model' | 'audio' | 'font';
  src: string;
  out: string;
  size?: number;
  targetTris?: number;
  texSize?: number;
  fetch: { polyhaven?: string; kind?: 'texture' | 'model'; url?: string } | null;
  sourceUrl: string;
  author: string;
  license: string;
  modifications: string;
}

/** OWNER: art made for and provided by the project owner. */
const ALLOWED_LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'OFL-1.1', 'OWNER'];

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function download(url: string, to: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(dirname(to), { recursive: true });
  await writeFile(to, Buffer.from(await res.arrayBuffer()));
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------------------
async function fetchEntry(e: Entry): Promise<void> {
  const dst = join(SRC, e.src);
  if (await exists(dst)) return;
  if (!e.fetch) throw new Error('no fetch source');
  if (e.fetch.url) return download(e.fetch.url, dst);
  const ph = e.fetch.polyhaven!;
  type Files = Record<string, Record<string, Record<string, { url: string; include?: Record<string, { url: string }> }>>>;
  const files = await getJson<Files>(`https://api.polyhaven.com/files/${ph}`);
  const info = await getJson<{ authors?: Record<string, string> }>(`https://api.polyhaven.com/info/${ph}`);
  if (info.authors) e.author = `${Object.keys(info.authors).join(', ')} (Poly Haven)`;
  if (e.fetch.kind === 'texture') {
    const diff = files.Diffuse?.['1k']?.jpg ?? files.diffuse?.['1k']?.jpg;
    if (!diff) throw new Error('no diffuse map');
    return download(diff.url, dst);
  }
  // Model: download the glTF + bin + base-colour textures only; strip other maps.
  const g = files.gltf['1k'].gltf;
  const gltfDir = dirname(dst);
  await mkdir(gltfDir, { recursive: true });
  const json = (await getJson<Record<string, unknown>>(g.url)) as {
    images?: { uri: string }[];
    textures?: { source: number }[];
    materials?: Record<string, unknown>[];
  };
  const keepImages = new Set<number>();
  for (const m of json.materials ?? []) {
    const pbr = m.pbrMetallicRoughness as { baseColorTexture?: { index: number }; metallicRoughnessTexture?: unknown } | undefined;
    if (pbr?.baseColorTexture && json.textures) keepImages.add(json.textures[pbr.baseColorTexture.index].source);
    if (pbr) delete pbr.metallicRoughnessTexture;
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
  }
  // Re-index images/textures so only base colour remains.
  const imgMap = new Map<number, number>();
  const newImages: { uri: string }[] = [];
  (json.images ?? []).forEach((img, i) => {
    if (keepImages.has(i)) {
      imgMap.set(i, newImages.length);
      newImages.push(img);
    }
  });
  const texMap = new Map<number, number>();
  const newTex: { source: number }[] = [];
  (json.textures ?? []).forEach((t, i) => {
    if (imgMap.has(t.source)) {
      texMap.set(i, newTex.length);
      newTex.push({ ...t, source: imgMap.get(t.source)! });
    }
  });
  for (const m of json.materials ?? []) {
    const pbr = m.pbrMetallicRoughness as { baseColorTexture?: { index: number } } | undefined;
    if (pbr?.baseColorTexture) {
      const ni = texMap.get(pbr.baseColorTexture.index);
      if (ni === undefined) delete pbr.baseColorTexture;
      else pbr.baseColorTexture.index = ni;
    }
  }
  json.images = newImages;
  json.textures = newTex;
  const wanted = new Set(newImages.map((i) => i.uri));
  for (const [rel, f] of Object.entries(g.include ?? {})) {
    if (rel.endsWith('.bin') || wanted.has(rel)) await download(f.url, join(gltfDir, rel));
  }
  await writeFile(dst, JSON.stringify(json));
}

// ---------------------------------------------------------------------------------------
// Convert
// ---------------------------------------------------------------------------------------
async function convertTexture(e: Entry): Promise<void> {
  const sharp = (await import('sharp')).default;
  const size = e.size ?? 64;
  const { data, info } = await sharp(join(SRC, e.src)).resize(size, size, { fit: 'cover', kernel: 'cubic' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // 15-bit quantise (5 bits per channel).
  for (let i = 0; i < data.length; i++) data[i] = (data[i] >> 3) * 8 + 4;
  const out = join(OUT, e.out);
  await mkdir(dirname(out), { recursive: true });
  await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toFile(out);
}

async function convertModel(e: Entry): Promise<number> {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { dedup, weld, simplify, prune, textureCompress } = await import('@gltf-transform/functions');
  const { MeshoptSimplifier } = await import('meshoptimizer');
  const sharp = (await import('sharp')).default;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(join(SRC, e.src));
  const countTris = () => {
    let t = 0;
    for (const m of doc.getRoot().listMeshes())
      for (const p of m.listPrimitives()) {
        const idx = p.getIndices();
        t += idx ? idx.getCount() / 3 : (p.getAttribute('POSITION')?.getCount() ?? 0) / 3;
      }
    return t;
  };
  await doc.transform(dedup(), weld());
  const before = countTris();
  const ratio = Math.min(1, (e.targetTris ?? 500) / Math.max(1, before));
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.5, lockBorder: false }), prune());
  const s = e.texSize ?? 64;
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'png', resize: [s, s] }));
  const out = join(OUT, e.out);
  await mkdir(dirname(out), { recursive: true });
  await io.write(out, doc);
  return countTris();
}

/** WAV → mono, 22.05 kHz, one-pole lowpass at 7 kHz, 10-bit crush. Reads 8/16/24/32-bit PCM and 32/64-bit float. */
async function convertAudio(e: Entry): Promise<void> {
  const buf = await readFile(join(SRC, e.src));
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV');
  let off = 12;
  let fmt: { tag: number; ch: number; rate: number; bits: number } | null = null;
  let pcm: Buffer | null = null;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4);
    const len = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { tag: buf.readUInt16LE(off + 8), ch: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') pcm = buf.subarray(off + 8, Math.min(buf.length, off + 8 + len));
    off += 8 + len + (len & 1);
  }
  if (!fmt || !pcm) throw new Error('WAV has no fmt/data chunk');
  const bytes = fmt.bits / 8;
  const isFloat = fmt.tag === 3;
  const sample = (at: number): number => {
    if (isFloat) return fmt!.bits === 64 ? pcm!.readDoubleLE(at) : pcm!.readFloatLE(at);
    switch (fmt!.bits) {
      case 8: return (pcm![at] - 128) / 128;
      case 16: return pcm!.readInt16LE(at) / 32768;
      case 24: return pcm!.readIntLE(at, 3) / 8388608;
      case 32: return pcm!.readInt32LE(at) / 2147483648;
      default: throw new Error(`unsupported sample size ${fmt!.bits}`);
    }
  };
  const frames = Math.floor(pcm.length / (bytes * fmt.ch));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.ch; c++) s += sample((i * fmt.ch + c) * bytes);
    mono[i] = s / fmt.ch;
  }
  const outRate = 22050;
  const n = Math.floor((frames * outRate) / fmt.rate);
  const out = Buffer.alloc(44 + n * 2);
  const a = 1 - Math.exp((-2 * Math.PI * 7000) / outRate);
  let y = 0;
  const levels = 1 << 9; // 10-bit
  for (let i = 0; i < n; i++) {
    const x = mono[Math.min(frames - 1, Math.floor((i * fmt.rate) / outRate))];
    y += a * (x - y);
    const q = Math.round(y * levels) / levels;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(q * 32767))), 44 + i * 2);
  }
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + n * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(outRate, 24);
  out.writeUInt32LE(outRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(n * 2, 40);
  const dst = join(OUT, e.out);
  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, out);
}

// ---------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------
async function main(): Promise<void> {
  const doFetch = process.argv.includes('--fetch');
  const manifestPath = join(ROOT, 'assets', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { assets: Entry[] };
  const index: Record<string, { type: string; url: string }> = {};
  const todo: string[] = [];
  for (const e of manifest.assets) {
    if (!ALLOWED_LICENSES.includes(e.license)) {
      todo.push(`- \`${e.id}\`: licence ${e.license} not allowed — skipped.`);
      continue;
    }
    try {
      if (doFetch && e.fetch) await fetchEntry(e);
      if (!(await exists(join(SRC, e.src)))) throw new Error(`source missing (${e.src})`);
      let extra = '';
      if (e.type === 'texture') await convertTexture(e);
      else if (e.type === 'model') extra = ` (${await convertModel(e)} tris)`;
      else if (e.type === 'audio') await convertAudio(e);
      else {
        await mkdir(dirname(join(OUT, e.out)), { recursive: true });
        await copyFile(join(SRC, e.src), join(OUT, e.out));
      }
      index[e.id] = { type: e.type, url: `assets/${e.out}` };
      console.log(`✓ ${e.id}${extra}`);
    } catch (err) {
      console.log(`· ${e.id}: procedural fallback (${(err as Error).message})`);
      todo.push(`- \`${e.id}\` (${e.type}) — intended source: ${e.sourceUrl} — ${(err as Error).message}. A procedural stand-in with the same id is used at runtime; drop the file at \`assets-src/${e.src}\` and run \`npm run assets\`.`);
    }
  }
  if (doFetch) await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await mkdir(join(ROOT, 'src', 'assets'), { recursive: true });
  await writeFile(join(ROOT, 'src', 'assets', 'manifest.json'), JSON.stringify({ generated: 'npm run assets', assets: index }, null, 2) + '\n');

  // CREDITS.md
  const lines = [
    '# Credits',
    '',
    '_Generated from `assets/manifest.json` by `npm run assets`. Do not edit by hand._',
    '',
    '## Game',
    '',
    'DEAD AIR — design, code, writing, procedural art, procedural audio and music: original work for this project.',
    '',
    '## Third-party assets',
    '',
    '| Asset | Source | Author | Licence | Modifications |',
    '|---|---|---|---|---|',
  ];
  for (const e of manifest.assets) {
    if (!index[e.id]) continue;
    lines.push(`| \`${e.id}\` | ${e.sourceUrl} | ${e.author} | ${e.license} | ${e.modifications} |`);
  }
  // ElevenLabs-generated audio (voice-over, SFX, music) — see assets/elevenlabs.json.
  const el = JSON.parse(await readFile(join(ROOT, 'assets', 'elevenlabs.json'), 'utf8')) as {
    voices: { speaker: string; name: string; voiceId: string; design: string }[];
    audio: { id: string; file: string; kind: string; model: string; prompt: string; replaces?: string; shift?: number; cents?: number }[];
  };
  const elIndex: Record<string, string> = {};
  const elOut = join(ROOT, 'public', 'assets', 'audio', 'el');
  await mkdir(elOut, { recursive: true });
  await mkdir(join(ROOT, 'public', 'assets', 'audio', 'music'), { recursive: true });
  const ff = (args: string[]) => new Promise<boolean>((res) => execFile('ffmpeg', args, (err) => res(!err)));
  // Music provided by the project owner (assets/music.json) goes through the same conversion.
  const music = JSON.parse(await readFile(join(ROOT, 'assets', 'music.json'), 'utf8')) as {
    author: string;
    target?: { signature: string };
    tracks: { id: string; file: string; kind: string; title: string; use: string; key?: string; shift?: number; cents?: number }[];
  };
  const jobs = [
    ...el.audio.map((a) => ({ ...a, dir: 'elevenlabs' })),
    ...music.tracks.map((t) => ({ id: t.id, file: t.file, kind: t.kind, dir: 'music', shift: t.shift, cents: t.cents })),
  ];
  // Outputs are rebuilt whenever their processing changes (stamp = the filter chain used).
  const stampPath = join(ROOT, 'public', 'assets', 'audio', 'stamps.json');
  const stamps: Record<string, string> = existsSync(stampPath) ? JSON.parse(await readFile(stampPath, 'utf8')) : {};
  for (const a of jobs) {
    const src = join(ROOT, 'assets-src', a.dir, a.file);
    const name = a.id.replace(/^(el|track)\./, '') + '.mp3';
    const sub = a.dir === 'music' ? 'music' : 'el';
    const dst = join(ROOT, 'public', 'assets', 'audio', sub, name);
    if (!existsSync(src)) continue;
    // PS1-era crunch: mono 22.05 kHz with a 9 kHz top for effects; music keeps stereo at 32 kHz.
    const af =
      a.kind === 'music'
        ? 'highpass=f=30,lowpass=f=12000,loudnorm=I=-19:TP=-1.5:LRA=11'
        : a.kind === 'loop'
          ? 'highpass=f=30,lowpass=f=9000,loudnorm=I=-22:TP=-2:LRA=11'
          : 'silenceremove=start_periods=1:start_threshold=-50dB,highpass=f=40,lowpass=f=9000,loudnorm=I=-16:TP=-1.5:LRA=11';
    const fmt = a.kind === 'music' ? ['-ac', '2', '-ar', '32000', '-b:a', '96k'] : ['-ac', '1', '-ar', '22050', '-b:a', '64k'];
    // Key alignment (tools/music-key.ts): pitch-shift into the score's key, tempo unchanged.
    const semis = (a.shift ?? 0) + (a.cents ?? 0) / 100;
    const pitch = Math.abs(semis) > 0.005 ? `rubberband=pitch=${Math.pow(2, semis / 12).toFixed(6)}:pitchq=quality:transients=smooth,` : '';
    const chain = pitch + af;
    const key = `${a.file}|${chain}|${fmt.join(' ')}`;
    const ok = (existsSync(dst) && stamps[name] === key) || (await ff(['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-af', chain, ...fmt, dst]));
    if (ok) stamps[name] = key;
    if (ok) elIndex[a.id] = `assets/audio/${sub}/${name}`;
    else console.warn(`· ${a.id}: ffmpeg not available or failed; skipped`);
  }
  await writeFile(join(ROOT, 'src', 'assets', 'audio.json'), JSON.stringify(elIndex, null, 2) + '\n');
  await writeFile(stampPath, JSON.stringify(stamps, null, 1) + '\n');
  // Procedural stand-ins that an ElevenLabs recording now replaces are no longer outstanding.
  const replaced = el.audio.filter((a) => a.replaces && elIndex[a.id]).map((a) => a.replaces!);
  for (let i = todo.length - 1; i >= 0; i--) if (replaced.some((r) => todo[i].includes(r))) todo.splice(i, 1);
  lines.push('', '## Music', '', `Provided for this project by ${music.author}. Sources in \`assets-src/music\`. Every tonal track is pitched into ${music.target?.signature ?? 'one key'} (tempo unchanged) so crossfades stay in key; see \`tools/music-key.ts\`.`, '', '| Track | Used for | Original key | Shift |', '|---|---|---|---|');
  for (const t of music.tracks) if (elIndex[t.id]) lines.push(`| ${t.title} | ${t.use} | ${t.key ?? '—'} | ${t.shift ? (t.shift > 0 ? '+' : '') + t.shift + ' st' : '0'}${t.cents ? ` ${t.cents > 0 ? '+' : ''}${t.cents}¢` : ''} |`);
  lines.push('', '## Generated with ElevenLabs', '', 'Voice-over (custom-designed voices, `eleven_v4`), sound effects (`eleven_text_to_sound_v2`) and music (`eleven_music_v2_5`) were generated for this project with ElevenLabs. Prompts are listed in `assets/elevenlabs.json`; the voice script is `assets-src/vo/script.json`.', '');
  lines.push('| Voice | Speaker | Design |', '|---|---|---|');
  for (const v of el.voices) lines.push(`| ${v.name} | ${v.speaker} | ${v.design} |`);
  lines.push('', '| Id | Kind | Model | Prompt |', '|---|---|---|---|');
  for (const a of el.audio) if (elIndex[a.id]) lines.push(`| \`${a.id}\` | ${a.kind} | ${a.model} | ${a.prompt} |`);
  lines.push('', '## Libraries', '', '- three.js (MIT), GSAP (Standard "No Charge" licence), gltf-transform (MIT), sharp (Apache-2.0), meshoptimizer (MIT), Vite (MIT), Vitest (MIT).', '');
  await writeFile(join(ROOT, 'CREDITS.md'), lines.join('\n'));
  const todoDoc = [
    '# Assets TODO',
    '',
    '_Generated by `npm run assets`. These ids currently resolve to procedural stand-ins. Assets resolve by id, so dropping real files into `/assets-src` and re-running the pipeline needs no code changes._',
    '',
    ...(todo.length ? todo : ['Nothing outstanding.']),
    '',
  ];
  await writeFile(join(ROOT, 'ASSETS_TODO.md'), todoDoc.join('\n'));
  console.log(`\n${Object.keys(index).length} assets converted, ${todo.length} procedural fallbacks.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
