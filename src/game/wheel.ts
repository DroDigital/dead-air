/**
 * Wheel layout + deterministic headless physics.
 *
 * Conventions (all angles in degrees):
 *  - Wheel-local angles run 0..360 around the rim. Segment i spans [start, end).
 *  - θ is the wheel's world rotation. A peg at local angle b sits at world angle b + θ.
 *  - The flapper/pointer is at world angle 0 (top). The local angle under the pointer is
 *    L = mod(−θ, 360).
 *  - The flapper tip deflection ψ is measured in rim-degrees (same axis as the pegs).
 *
 * The simulation integrates at a fixed 240 Hz frame rate. When the wheel is slow enough for
 * individual peg contacts to matter, each frame is sub-stepped (a deterministic function of
 * the state) and pegs interact with a spring-damped flapper through penalty contacts.
 * When it is fast, peg passes are applied as discrete energy impulses (the flapper just
 * chatters). The renderer replays the recorded trace exactly.
 */
import type { Rng } from '../core/rng';
import { BALANCE } from './balance';
import type { Layout, Segment, TempOverride, Wedge, WedgeKind } from './types';

// --------------------------------------------------------------------------------------
// Layout
// --------------------------------------------------------------------------------------

export interface WidthMods {
  add: Partial<Record<WedgeKind, number>>;
  mult: Partial<Record<WedgeKind, number>>;
}

export function emptyWidthMods(): WidthMods {
  return { add: {}, mult: {} };
}

export function mod360(a: number): number {
  const r = a % 360;
  return r < 0 ? r + 360 : r + 0;
}

export function wrap180(a: number): number {
  let r = mod360(a);
  if (r >= 180) r -= 360;
  return r;
}

function findOverride(overrides: readonly TempOverride[], uid: number, half: -1 | 0 | 1): TempOverride | undefined {
  // Later overrides win (a per-spin Static jackpot beats a per-deadline Marathon bankrupt).
  for (let i = overrides.length - 1; i >= 0; i--) {
    const o = overrides[i];
    if (o.uid === uid && (o.half === half || o.half === -1)) return o;
  }
  return undefined;
}

export function effectiveWidth(kind: WedgeKind, nominal: number, mods: WidthMods): number {
  const add = mods.add[kind] ?? 0;
  const mult = mods.mult[kind] ?? 1;
  return Math.min(BALANCE.maxWidth, Math.max(BALANCE.minWidth, (nominal + add) * mult));
}

export function computeLayout(wheel: readonly Wedge[], overrides: readonly TempOverride[], mods: WidthMods): Layout {
  const raw: { w: Wedge; idx: number; width: number; kind: WedgeKind; ov?: TempOverride }[] = [];
  let sum = 0;
  wheel.forEach((w, idx) => {
    const ov = findOverride(overrides, w.uid, -1);
    const kind = ov ? ov.kind : w.kind;
    const width = effectiveWidth(kind, w.width, mods);
    raw.push({ w, idx, width, kind, ov });
    sum += width;
  });
  const scale = sum > 0 ? 360 / sum : 1;
  const segments: Segment[] = [];
  let a = 0;
  for (const r of raw) {
    const width = r.width * scale;
    if (r.kind === 'splitter' && r.w.halves) {
      for (let h = 0 as 0 | 1; h <= 1; h = (h + 1) as 0 | 1) {
        const half = r.w.halves[h];
        const hov = findOverride(overrides, r.w.uid, h);
        segments.push({
          idx: segments.length,
          wedgeIdx: r.idx,
          half: h,
          uid: r.w.uid,
          kind: hov ? hov.kind : half.kind,
          value: hov ? hov.value : half.value,
          gild: r.w.gild,
          bonus: r.w.bonus,
          start: a,
          end: a + width / 2,
          overridden: !!hov,
        });
        a += width / 2;
        if (h === 1) break;
      }
    } else {
      segments.push({
        idx: segments.length,
        wedgeIdx: r.idx,
        half: -1,
        uid: r.w.uid,
        kind: r.kind,
        value: r.ov ? r.ov.value : r.w.value,
        gild: r.w.gild,
        bonus: r.w.bonus,
        start: a,
        end: a + width,
        overridden: !!r.ov,
      });
      a += width;
    }
  }
  // Snap the last end exactly to 360 to avoid float gaps.
  if (segments.length) segments[segments.length - 1].end = 360;
  return { segments, pegs: segments.map((s) => s.start) };
}

export function segmentAt(layout: Layout, local: number): number {
  const L = mod360(local);
  const segs = layout.segments;
  // Binary search on start angles.
  let lo = 0,
    hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].start <= L) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Wheel rotation θ that puts the centre of segment i under the pointer. */
export function angleForSegment(layout: Layout, i: number): number {
  const s = layout.segments[i];
  return mod360(-(s.start + s.end) / 2);
}

export function ringSegmentAt(ringLen: number, ringAngle: number): number {
  const L = mod360(-ringAngle);
  const w = 360 / ringLen;
  return Math.min(ringLen - 1, Math.floor(L / w));
}

// --------------------------------------------------------------------------------------
// Physics
// --------------------------------------------------------------------------------------

export const PHYS = {
  frameHz: 240,
  sampleHz: 60,
  maxTime: 45,
  // Outer wheel
  inertia: 1,
  linDrag: 0.3,
  coulomb: 60,
  staticFrac: 0.2,
  frictionKnee: 25,
  omegaMin: 520,
  omegaRange: 980,
  /** Hand-feel: a little wobble so no two pulls are identical, small enough that force is what you get. */
  omegaJitter: 0.025,
  /** The fastest a hand can throw it (deg/s). */
  omegaHandMax: 2400,
  fastThreshold: 260,
  fastPegLoss: 20,
  // Flapper
  flapInertia: 0.05,
  flapK: 10,
  flapC: 1.1,
  flapSlip: 2.0,
  pegRadius: 0.9,
  contactK: 200,
  contactC: 6,
  maxSubstepTravel: 0.35,
  // Inner ring
  ringOmegaMin: 260,
  ringOmegaRange: 320,
  ringJitter: 0.12,
  ringLinDrag: 0.32,
  ringCoulomb: 30,
  ringCouple: 0.6,
  ringDetent: 55,
  // Loaded flapper
  stickySlipMult: 0.55,
  // Settle
  settleOmega: 0.8,
  settleTime: 0.18,
};

export interface PhysicsMods {
  /** Pegs (by index) that let the wheel slip past more easily (Loaded Flapper). */
  slippery: boolean[];
  /** Segments the wheel glides through (Loaded Flapper: Bankrupt). */
  glide: boolean[];
}

export function noPhysicsMods(layout: Layout): PhysicsMods {
  const n = layout.segments.length;
  return {
    slippery: new Array(n).fill(false),
    glide: new Array(n).fill(false),
  };
}

export interface PegTick {
  t: number;
  peg: number;
  speed: number;
}

export interface SpinTrace {
  sampleDt: number;
  outer: Float32Array;
  inner: Float32Array;
  flapper: Float32Array;
  ticks: PegTick[];
  duration: number;
  /** Time at which the outer wheel came to rest. */
  outerStop: number;
}

export interface SpinSim {
  outerIndex: number;
  innerIndex: number;
  finalAngle: number;
  finalRingAngle: number;
  pointerLocal: number;
  /** Distance (deg) to the nearest segment boundary. */
  boundaryDist: number;
  /** Segment on the other side of the nearest boundary. */
  neighborIndex: number;
  /** True when the stop was near a boundary (presentation: flapper hang). */
  hang: boolean;
  trace: SpinTrace;
  omega0: number;
}

export interface SpinParams {
  layout: Layout;
  ringLen: number;
  power: number;
  startAngle: number;
  ringStartAngle: number;
  mods?: PhysicsMods;
  /** Skip recording a trace (fast headless search). */
  noTrace?: boolean;
  /**
   * A hand throw: the wheel leaves the hand at exactly this angular speed (deg/s), no jitter.
   * Without it, `power` (the lever) maps onto the launch speed.
   */
  omega0?: number;
}

/**
 * simulateSpin(wheel, ring, power, rng) → { outerIndex, innerIndex, trace }
 * Consumes exactly 3 floats from `rng` regardless of outcome (keeps streams aligned).
 */
export function simulateSpin(p: SpinParams, rng: Rng): SpinSim {
  const { layout } = p;
  const mods = p.mods ?? noPhysicsMods(layout);
  const P = PHYS;
  const pegs = layout.pegs;
  const nPeg = pegs.length;
  const segs = layout.segments;

  const j1 = rng.float(),
    j2 = rng.float(),
    j3 = rng.float();
  const power = Math.min(1, Math.max(0, p.power));
  const omega0 =
    p.omega0 !== undefined && Number.isFinite(p.omega0)
      ? Math.min(P.omegaHandMax, Math.max(0, p.omega0))
      : (P.omegaMin + P.omegaRange * power) * (1 + P.omegaJitter * (j1 * 2 - 1));
  const gamma0 = -(P.ringOmegaMin + P.ringOmegaRange * power) * (1 + P.ringJitter * (j2 * 2 - 1));

  let theta = p.startAngle;
  let omega = omega0;
  let alpha = p.ringStartAngle;
  let gamma = gamma0;
  let psi = 0;
  let psiV = (j3 * 2 - 1) * 4; // flapper starts with a tiny wobble

  // Per-peg contact state: 0 = outside zone; ±1 = side; ±2 = lifted after slipping (side = sign).
  const pegSide = new Int8Array(nPeg);
  const pegOrigSide = new Int8Array(nPeg);

  const dtFrame = 1 / P.frameHz;
  const framesPerSample = Math.round(P.frameHz / P.sampleHz);
  const maxFrames = Math.ceil(P.maxTime * P.frameHz);
  const outerS: number[] = [];
  const innerS: number[] = [];
  const flapS: number[] = [];
  const ticks: PegTick[] = [];
  const record = !p.noTrace;

  let t = 0;
  let settleTimer = 0;
  let outerStop = -1;
  let frame = 0;
  // Index of the last peg crossing check in fast mode: track the pointer segment.
  let lastPointerSeg = segmentAt(layout, -theta);

  const ringLen = Math.max(1, p.ringLen);
  const ringW = 360 / ringLen;

  for (; frame < maxFrames; frame++) {
    if (record && frame % framesPerSample === 0) {
      outerS.push(theta);
      innerS.push(alpha);
      flapS.push(psi);
    }
    const fast = Math.abs(omega) > P.fastThreshold;
    if (fast) {
      // ---- Fast regime: one step, pegs as impulses ----
      const dt = dtFrame;
      const acc = -P.linDrag * omega - P.coulomb * Math.sign(omega);
      omega += acc * dt;
      theta += omega * dt;
      // Count pegs crossed: pointer local moves opposite to theta.
      const segNow = segmentAt(layout, -theta);
      if (segNow !== lastPointerSeg) {
        // Walk segment boundaries crossed (direction by sign of omega).
        let s = lastPointerSeg;
        const dir = omega > 0 ? -1 : 1; // pointer local decreases when theta increases
        let guard = 0;
        while (s !== segNow && guard++ < nPeg + 2) {
          const pegIdx = dir < 0 ? s : (s + 1) % nPeg;
          s = (s + dir + nPeg) % nPeg;
          const loss = P.fastPegLoss * (mods.slippery[pegIdx] ? P.stickySlipMult : 1);
          const ke = 0.5 * P.inertia * omega * omega - loss;
          omega = Math.sign(omega) * Math.sqrt(Math.max(0, (2 * ke) / P.inertia));
          if (record) ticks.push({ t, peg: pegIdx, speed: Math.abs(omega) });
          psiV += Math.sign(omega) * 55;
        }
        lastPointerSeg = segNow;
      }
      // Flapper free oscillation.
      const fa = (-P.flapK * psi - P.flapC * psiV) / P.flapInertia;
      psiV += fa * dt;
      psi += psiV * dt;
      if (psi > P.flapSlip * 1.6) {
        psi = P.flapSlip * 1.6;
        psiV = Math.min(psiV, 0);
      } else if (psi < -P.flapSlip * 1.6) {
        psi = -P.flapSlip * 1.6;
        psiV = Math.max(psiV, 0);
      }
      // Reset contact state when leaving the fast regime.
      if (Math.abs(omega) <= P.fastThreshold) {
        pegSide.fill(0);
      }
    } else {
      // ---- Slow regime: sub-stepped penalty contacts ----
      const travel = Math.abs(omega) * dtFrame;
      const sub = Math.max(1, Math.min(12, Math.ceil(travel / P.maxSubstepTravel)));
      const dt = dtFrame / sub;
      for (let k = 0; k < sub; k++) {
        let Fw = 0;
        let Ff = -P.flapK * psi - P.flapC * psiV;
        // Pegs near the flapper. Find candidates via pointer segment (pegs are segment starts).
        const L = mod360(-theta);
        const sIdx = segmentAt(layout, L);
        // Check the pegs around the pointer (a window of up to 8 pegs).
        const span = Math.min(nPeg, 8);
        for (let q = 0; q < span; q++) {
          const j = (sIdx - 3 + q + nPeg * 4) % nPeg;
          const x = wrap180(pegs[j] + theta);
          const rel = x - psi;
          if (Math.abs(rel) > 8) {
            pegSide[j] = 0;
            continue;
          }
          let st = pegSide[j];
          if (st === 0) {
            // Entering the zone.
            if (Math.abs(rel) < P.pegRadius) {
              st = rel < 0 ? -2 : 2; // overlapping on entry -> pass under
              pegOrigSide[j] = rel < 0 ? 1 : -1;
            } else st = rel < 0 ? -1 : 1;
            pegSide[j] = st;
          }
          if (st === 2 || st === -2) {
            const s = st > 0 ? 1 : -1;
            if (s * rel > P.pegRadius) pegSide[j] = s as -1 | 1; // fully on new side
            else if (-s * rel > P.pegRadius && pegOrigSide[j] === -s) pegSide[j] = -s as -1 | 1; // rolled back
            continue;
          }
          const s = st as -1 | 1;
          const gap = s * rel;
          const pen = P.pegRadius - gap;
          if (pen > 0) {
            const vRel = omega - psiV;
            let F = P.contactK * pen - P.contactC * s * vRel;
            if (F < 0) F = 0;
            Fw += s * F;
            Ff -= s * F;
            const slip = P.flapSlip * (mods.slippery[j] ? P.stickySlipMult : 1);
            if (-s * psi > slip) {
              // Flapper tip rides over the peg: the peg passes.
              pegSide[j] = (-s * 2) as -2 | 2;
              pegOrigSide[j] = s;
              if (record) ticks.push({ t, peg: j, speed: Math.abs(omega) });
            }
          }
        }
        // Wheel dynamics.
        const segHere = segs[sIdx];
        let coul = P.coulomb * (P.staticFrac + (1 - P.staticFrac) * Math.min(1, Math.abs(omega) / P.frictionKnee));
        if (mods.glide[segHere.idx]) coul *= 0.45;
        const drive = Fw / P.inertia - P.linDrag * omega;
        // Coulomb friction with sticking.
        const vNext = omega + drive * dt;
        if (Math.abs(omega) < 1e-6 && Math.abs(drive) <= coul) {
          omega = 0;
        } else {
          const fr = -Math.sign(omega !== 0 ? omega : drive) * coul;
          const v2 = vNext + fr * dt;
          if (omega !== 0 && Math.sign(v2) !== Math.sign(omega) && Math.abs(drive) <= coul) omega = 0;
          else omega = v2;
        }
        theta += omega * dt;
        // Flapper.
        psiV += (Ff / P.flapInertia) * dt;
        psi += psiV * dt;
      }
      lastPointerSeg = segmentAt(layout, -theta);
    }

    // ---- Inner ring (coupled, own drag, detents near the end) ----
    {
      const dt = dtFrame;
      let acc = -P.ringLinDrag * gamma + P.ringCouple * (omega * -0.15 - gamma) * (Math.abs(omega) < 40 ? 1 : 0.15);
      if (Math.abs(gamma) < 70) {
        const L = mod360(-alpha);
        const u = ((L % ringW) - ringW / 2) / (ringW / 2); // -1..1, 0 at segment centre
        acc += P.ringDetent * u;
      }
      const coul = P.ringCoulomb;
      const v2 = gamma + acc * dt;
      if (Math.abs(gamma) < 1e-6 && Math.abs(acc) <= coul) gamma = 0;
      else {
        const fr = -Math.sign(gamma !== 0 ? gamma : acc) * coul;
        const v3 = v2 + fr * dt;
        if (gamma !== 0 && Math.sign(v3) !== Math.sign(gamma) && Math.abs(acc) <= coul) gamma = 0;
        else gamma = v3;
      }
      alpha += gamma * dt;
    }

    t += dtFrame;
    const outerResting = Math.abs(omega) < P.settleOmega && Math.abs(psiV) < 6;
    if (outerResting && outerStop < 0) outerStop = t;
    if (!outerResting) outerStop = -1;
    if (outerResting && Math.abs(gamma) < P.settleOmega) {
      settleTimer += dtFrame;
      if (settleTimer >= P.settleTime) break;
    } else settleTimer = 0;
  }
  // Final sample.
  if (record) {
    outerS.push(theta);
    innerS.push(alpha);
    flapS.push(psi);
  }

  const finalAngle = theta;
  const pointerLocal = mod360(-theta);
  const outerIndex = segmentAt(layout, pointerLocal);
  const seg = segs[outerIndex];
  const dStart = pointerLocal - seg.start;
  const dEnd = seg.end - pointerLocal;
  const boundaryDist = Math.min(dStart, dEnd);
  const neighborIndex = dStart < dEnd ? (outerIndex - 1 + segs.length) % segs.length : (outerIndex + 1) % segs.length;
  const innerIndex = ringSegmentAt(ringLen, alpha);

  return {
    outerIndex,
    innerIndex,
    finalAngle,
    finalRingAngle: alpha,
    pointerLocal,
    boundaryDist,
    neighborIndex,
    hang: boundaryDist < BALANCE.neighborsThreshold,
    omega0,
    trace: {
      sampleDt: 1 / P.sampleHz,
      outer: new Float32Array(outerS),
      inner: new Float32Array(innerS),
      flapper: new Float32Array(flapS),
      ticks,
      duration: t,
      outerStop: outerStop < 0 ? t : outerStop,
    },
  };
}

/** Spin only the inner ring (Ring Jump). Consumes exactly 1 float. */
export function simulateRingOnly(ringLen: number, startAngle: number, rng: Rng): { innerIndex: number; finalRingAngle: number; trace: Float32Array; duration: number } {
  const P = PHYS;
  const j = rng.float();
  let gamma = -(P.ringOmegaMin + P.ringOmegaRange * 0.6) * (1 + P.ringJitter * (j * 2 - 1));
  let alpha = startAngle;
  const dt = 1 / P.frameHz;
  const ringW = 360 / ringLen;
  const samples: number[] = [];
  let t = 0;
  let still = 0;
  for (let f = 0; f < P.maxTime * P.frameHz; f++) {
    if (f % Math.round(P.frameHz / P.sampleHz) === 0) samples.push(alpha);
    let acc = -P.ringLinDrag * gamma - P.ringCouple * gamma * 0.6;
    if (Math.abs(gamma) < 70) {
      const L = mod360(-alpha);
      acc += P.ringDetent * (((L % ringW) - ringW / 2) / (ringW / 2));
    }
    const v2 = gamma + acc * dt;
    if (Math.abs(gamma) < 1e-6 && Math.abs(acc) <= P.ringCoulomb) gamma = 0;
    else {
      const v3 = v2 - Math.sign(gamma !== 0 ? gamma : acc) * P.ringCoulomb * dt;
      if (gamma !== 0 && Math.sign(v3) !== Math.sign(gamma) && Math.abs(acc) <= P.ringCoulomb) gamma = 0;
      else gamma = v3;
    }
    alpha += gamma * dt;
    t += dt;
    if (Math.abs(gamma) < P.settleOmega) {
      still += dt;
      if (still > P.settleTime) break;
    } else still = 0;
  }
  samples.push(alpha);
  return { innerIndex: ringSegmentAt(ringLen, alpha), finalRingAngle: alpha, trace: new Float32Array(samples), duration: t };
}

/** The lever meter value at time t (triangle wave 0..1). */
export function meterValue(t: number, period = BALANCE.meterPeriod): number {
  const ph = (t / period) % 1;
  return ph < 0.5 ? ph * 2 : 2 - ph * 2;
}
