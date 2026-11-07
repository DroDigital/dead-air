/**
 * Engine-level constants and player settings.
 */

export const INTERNAL_W = 320;
export const INTERNAL_H = 180;

export interface Settings {
  v: number;
  /** Internal resolution multiplier (1 = 320×180, 2 = 640×360; the default is 2). */
  resolutionScale: 1 | 2;
  crt: boolean;
  warp: number;
  reducedFlashing: boolean;
  fastMode: boolean;
  colorblind: boolean;
  masterVolume: number;
  music: number;
  sfx: number;
  voice: number;
  ambience: number;
  captions: boolean;
  screenShake: boolean;
  dither: boolean;
  /** Broadcast Standards: Uncut shows the gore; Censored cuts away to static before it. */
  uncut: boolean;
}

export const SETTINGS_VERSION = 2;

export function defaultSettings(): Settings {
  return {
    v: SETTINGS_VERSION,
    resolutionScale: 2,
    crt: true,
    warp: 1,
    reducedFlashing: false,
    fastMode: false,
    colorblind: false,
    masterVolume: 0.8,
    music: 0.6,
    sfx: 0.8,
    voice: 0.7,
    ambience: 0.5,
    captions: true,
    screenShake: true,
    dither: true,
    uncut: true,
  };
}

export function sanitizeSettings(s: Partial<Settings> | null | undefined): Settings {
  const d = defaultSettings();
  if (!s) return d;
  const clamp01 = (x: unknown, def: number) => (typeof x === 'number' && isFinite(x) ? Math.max(0, Math.min(1, x)) : def);
  return {
    v: SETTINGS_VERSION,
    resolutionScale: s.resolutionScale === 1 || s.resolutionScale === 2 ? s.resolutionScale : d.resolutionScale,
    crt: typeof s.crt === 'boolean' ? s.crt : d.crt,
    warp: typeof s.warp === 'number' && isFinite(s.warp) ? Math.max(0, Math.min(2, s.warp)) : d.warp,
    reducedFlashing: !!s.reducedFlashing,
    fastMode: !!s.fastMode,
    colorblind: !!s.colorblind,
    masterVolume: clamp01(s.masterVolume, d.masterVolume),
    music: clamp01(s.music, d.music),
    sfx: clamp01(s.sfx, d.sfx),
    voice: clamp01(s.voice, d.voice),
    ambience: clamp01(s.ambience, d.ambience),
    captions: typeof s.captions === 'boolean' ? s.captions : d.captions,
    screenShake: typeof s.screenShake === 'boolean' ? s.screenShake : d.screenShake,
    dither: typeof s.dither === 'boolean' ? s.dither : d.dither,
    uncut: typeof s.uncut === 'boolean' ? s.uncut : d.uncut,
  };
}

export const IS_DEV = typeof import.meta !== 'undefined' && !!(import.meta as { env?: { DEV?: boolean } }).env?.DEV;
