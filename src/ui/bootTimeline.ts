/**
 * Timing for the boot screens, kept free of the DOM so it can be tested: how the loading banner is
 * scrubbed to the real progress, and how the intro's camera pushes in on the host's last raise.
 */

/** The banner's own "tuning the signal" bar: 0% at `start` seconds into the video, 100% at `full`. */
export const LOADING_BAR = { start: 0.2, full: 5.1 } as const;

/** The most the shown progress may climb, per second: a fast load still plays the banner through. */
export const LOADING_RATE = 0.42;

/** The intro's camera push: from `at` seconds it eases in over `ease` seconds to `scale` and `blur` (px), then holds. */
export interface CameraPush {
  at: number;
  ease: number;
  scale: number;
  blur: number;
  /** Where the push zooms to, as fractions of the frame: the host's raised hand. */
  origin: readonly [number, number];
}

/** The host's last raise as the curtain is revealed (about 13.6 s in): the push starts on it. */
export const INTRO_PUSH: CameraPush = { at: 13.6, ease: 0.7, scale: 1.16, blur: 2.2, origin: [0.72, 0.42] };

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** The video time that shows a progress on the banner's own bar. */
export function loadingTime(progress: number, bar: { start: number; full: number } = LOADING_BAR): number {
  return bar.start + clamp01(progress) * (bar.full - bar.start);
}

/**
 * The progress the loader shows: it climbs toward the real progress at no more than `rate` a second and
 * never passes it, and it never moves back.
 */
export function followProgress(shown: number, real: number, dt: number, rate = LOADING_RATE): number {
  const target = clamp01(real);
  const from = clamp01(shown);
  return Math.max(from, Math.min(target, from + Math.max(0, dt) * rate));
}

export function smoothstep(a: number, b: number, x: number): number {
  const u = clamp01((x - a) / Math.max(1e-6, b - a));
  return u * u * (3 - 2 * u);
}

/** The camera at video time `t`: the push's scale and blur (1 and 0 before it starts). */
export function cameraAt(t: number, push: CameraPush = INTRO_PUSH): { scale: number; blur: number } {
  const k = smoothstep(push.at, push.at + push.ease, t);
  return { scale: 1 + (push.scale - 1) * k, blur: push.blur * k };
}
