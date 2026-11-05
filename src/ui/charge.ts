import { meterValue } from '../game/wheel';

/** The meter's current release power and the last power used for a landing preview. */
export interface ChargeMeter {
  t: number;
  power: number;
  peek: boolean;
  previewAt: number | null;
}

/** Advance the meter; return true when its landing preview needs to be refreshed. */
export function advanceCharge(c: ChargeMeter, dt: number): boolean {
  c.t += dt;
  if (!c.peek) {
    c.power = meterValue(c.t);
    return false;
  }
  // Lock may require hundreds of simulations per preview. While waiting for the next
  // preview, hold the needle and release power at the value behind the visible highlight.
  if (c.previewAt !== null && c.t - c.previewAt < 0.1) return false;
  c.power = meterValue(c.t);
  c.previewAt = c.t;
  return true;
}
