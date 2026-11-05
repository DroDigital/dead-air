/**
 * Prepares the intro cutscene and the loading banner for the web build (public/assets/video/).
 * The originals live in assets-src/video/.
 *
 * Both get the same VHS / CRT treatment baked in (colour fringe, 240-line scanlines, tape grain, a
 * rolling tracking bar, vignette, worn-tape warmth), so the broadcast reads as one tape. The intro keeps
 * its soundtrack (copied, not re-encoded). The loading banner is encoded with a short GOP because the
 * loader scrubs it to the real loading progress.
 *
 *   npx tsx tools/video.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const out = root('public/assets/video');
mkdirSync(out, { recursive: true });

const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });

const vhs = [
  'chromashift=crh=2:cbh=-2',
  "geq=lum='lum(X,Y)*(0.84+0.16*cos(Y*2*PI/3))':cb='cb(X,Y)':cr='cr(X,Y)'",
  'noise=alls=9:allf=t+u',
  "drawbox=x=0:y='mod(t*120\\,ih+40)-40':w=iw:h=6:color=white@0.07:t=fill",
  'vignette=PI/4',
  'eq=saturation=0.92:contrast=1.05:brightness=0.02',
  'colorbalance=rm=0.04:gm=-0.01:bm=-0.05',
  'gblur=sigma=0.45',
].join(',');

// The intro: VHS picture, soundtrack copied.
ff([
  '-i', root('assets-src/video/intro-cutscene.mp4'),
  '-vf', vhs,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-g', '24',
  '-c:a', 'copy',
  '-movflags', '+faststart',
  `${out}/intro-cutscene.mp4`,
]);

// The loading banner: VHS picture, silent, short GOP for scrubbing.
ff([
  '-i', root('assets-src/video/loading-banner.mp4'),
  '-vf', vhs,
  '-an',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-g', '12',
  '-movflags', '+faststart',
  `${out}/loading-banner.mp4`,
]);
console.log(`wrote ${out}`);
