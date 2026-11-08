/**
 * The run: one Game instance owns a serialisable RunState plus live RNG streams, and
 * exposes every player action. Pure logic — no DOM, no Three.js. The renderer/audio
 * subscribe to `bus` and replay the outcomes returned from actions.
 */
import { ARTIFACTS, artifactDef } from '../content/artifacts';
import { BARGAINS, PRODUCER_INTROS, bargainDef, type BargainTier } from '../content/bargains';
import { MUTATORS, mutatorDef } from '../content/mutators';
import { SCRATCH_CARDS, scratchDef } from '../content/scratchCards';
import { WEDGES } from '../content/wedges';
import { startingWheel } from '../content/wheels';
import { EventBus } from '../core/events';
import { CHALLENGES, type ChallengeDef, type ChallengeEvent } from '../content/challenges';
import { makeStreams, restoreStreams, streamStates, type RngStreams } from '../core/rng';
import { BALANCE, baseDebt, round50 } from './balance';
import type {
  ActiveArtifact,
  ArtifactDef,
  ChargeCtx,
  DeadlineEndCtx,
  DepositCtx,
  HookCtx,
  HookName,
  ShopCtx,
} from './hooks';
import { resolvePayout, type PayoutHost, type PayoutResult } from './payout';
import { makeWedge, newShopState, rollArtifacts, sellValue, SERVICE_COSTS } from './shop';
import type {
  HorrorEvent,
  ArtifactInstance,
  ComboId,
  Layout,
  PackageId,
  PendingSpin,
  PhoneOffer,
  Rarity,
  RunConfig,
  RunPhase,
  RunState,
  Segment,
  Trigger,
  Wedge,
  WedgeKind,
} from './types';
import {
  angleForSegment,
  computeLayout,
  emptyWidthMods,
  mod360,
  noPhysicsMods,
  simulateRingOnly,
  simulateSpin,
  type PhysicsMods,
  type SpinSim,
  type WidthMods,
} from './wheel';

export const RUN_VERSION = 3;

// ---------------------------------------------------------------------------------------
// Events for presentation
// ---------------------------------------------------------------------------------------
export interface GameEvents extends Record<string, unknown> {
  trigger: Trigger;
  note: string;
  tokens: { delta: number; why: string };
  vault: { delta: number; why: string };
  tray: { delta: number; why: string };
  spins: { delta: number; why: string };
  streak: { value: number };
  phase: { from: RunPhase; to: RunPhase };
  deadlineStart: { deadline: number; debt: number; mutator: string | null };
  challenge: { id: string };
  deadlineEnd: DeadlineEndResult;
  deposit: DepositResult;
  artifactGained: { id: string; slot: number };
  artifactLost: { id: string; slot: number };
  wheelChanged: { reason: string };
  phone: { reason: string };
  changed: { action: string };
  /** Horror beats the stage acts out (wedge models, the collateral cutscene, the audience). */
  horror: HorrorEvent;
}

export type { HorrorEvent };

export interface RingJumpResult {
  innerIndex: number;
  innerMult: number;
  trace: Float32Array;
  duration: number;
  payout: PayoutResult | null;
  segIdx: number;
}

export interface SpinOutcome {
  spinNo: number;
  power: number;
  free: boolean;
  locked: boolean;
  peeked: boolean;
  sim: SpinSim;
  layout: Layout;
  ring: number[];
  /** Filled once resolved (null while awaiting a Nudge). */
  resolution: SpinResolution | null;
}

export interface SpinResolution {
  segIdx: number;
  nudge: number;
  seg: Segment;
  neighbor: Segment | null;
  innerIndex: number;
  innerMult: number;
  payout: PayoutResult;
  triggers: Trigger[];
  notes: string[];
  ringJump: RingJumpResult | null;
  streakAfter: number;
  deadlineEnd: DeadlineEndResult | null;
  combos: ComboId[];
}

export interface DepositResult {
  amount: number;
  lost: number;
  bonus: number;
  keptStreak: boolean;
  auto: boolean;
  triggers: Trigger[];
}

export interface DeadlineEndResult {
  deadline: number;
  debt: number;
  paid: boolean;
  saved: boolean;
  vaultBefore: number;
  vaultAfter: number;
  deposit: DepositResult | null;
  triggers: Trigger[];
  /** Short, but the Producer is calling to take payment in kind. */
  collateral?: boolean;
  /** Round economy: Tokens from leftover cash, and interest on Tokens held. */
  surplusTokens?: number;
  interestTokens?: number;
  /** The collateral call ended: what was paid, or whether it was refused. */
  inKind?: 'finger' | 'eye';
  refused?: boolean;
}

export interface ShopResult {
  ok: boolean;
  reason?: string;
}

function emptyStats(): RunState['stats'] {
  return {
    spins: 0,
    bankrupts: 0,
    trayAtBankrupt: [],
    maxTray: 0,
    maxStreak: 1,
    deposits: 0,
    jackpots: 0,
    combos: { echo: 0, hatTrick: 0, neighbors: 0, deadAir: 0 },
    cashEarned: 0,
    tokensEarned: 0,
    artifactsBought: [],
    bargainsTaken: [],
    phoneCalls: 0,
    hungUp: 0,
    biggestPayout: 0,
  };
}

export class Game implements PayoutHost {
  run: RunState;
  rng: RngStreams;
  readonly bus = new EventBus<GameEvents>();
  triggerSink: Trigger[] = [];
  private notes: string[] = [];
  private ringJumpResult: RingJumpResult | null = null;

  private constructor(run: RunState, rng: RngStreams) {
    this.run = run;
    this.rng = rng;
  }

  // =====================================================================================
  // Construction / persistence
  // =====================================================================================
  static newRun(cfg: RunConfig): Game {
    const rng = makeStreams(cfg.seed);
    const sw = startingWheel(cfg.startWheel);
    const run: RunState = {
      v: RUN_VERSION,
      seed: cfg.seed,
      rng: streamStates(rng),
      stake: cfg.stake,
      startWheel: sw.id,
      endless: !!cfg.endless,
      unlockedArtifacts: cfg.unlockedArtifacts ?? null,
      unlockedWedges: cfg.unlockedWedges ?? null,
      phase: 'PackageSelect',
      deadline: 0,
      debt: 0,
      mutator: null,
      pkg: null,
      spinsLeft: 0,
      spinsThisDeadline: 0,
      tray: 0,
      vault: BALANCE.startVault,
      tokens: BALANCE.startTokens,
      streak: BALANCE.streakStart,
      boost: 0,
      wheel: [],
      ring: [...sw.ring],
      wheelAngle: 0,
      ringAngle: 0,
      nextUid: 1,
      artifacts: [],
      scratch: [],
      flags: {
        vaultKey: 0,
        insurance: 0,
        doubler: 0,
        lock: false,
        peek: 0,
        freeze: false,
        nudge: false,
        staticBurst: false,
        safeDeposit: false,
        trapdoorUsed: false,
      },
      overrides: [],
      history: [],
      cashRun: 0,
      pending: null,
      pendingQueue: [],
      shop: null,
      phone: null,
      stats: emptyStats(),
      deadlines: [],
      nextMods: { spinsDelta: 0, debtMult: 1 },
      marks: {},
      victoryShown: false,
      endedAt: null,
      resume: 'AwaitAction',
      pendingSpin: null,
    };
    const g = new Game(run, rng);
    run.wheel = sw.wedges.map((s) =>
      g.newWedge(s.kind, s.value ?? WEDGES[s.kind].defaultValue, s.width ?? (s.kind === 'jackpot' ? BALANCE.jackpotWidth : BALANCE.baseWidth)),
    );
    const extra = BALANCE.stakeExtraBankrupt[cfg.stake] ?? 0;
    for (let i = 0; i < extra; i++) g.insertWedgeRandom('bankrupt', 0, (k) => k === 'dud' || k === 'cash');
    g.runHook('onRunStart');
    g.startDeadline(1);
    return g;
  }

  static fromState(state: RunState): Game {
    const s = structuredClone(state);
    return new Game(s, restoreStreams(s.rng));
  }

  /** Serialisable snapshot (RNG states synced). */
  snapshot(): RunState {
    this.run.rng = streamStates(this.rng);
    return structuredClone(this.run);
  }

  newWedge(kind: WedgeKind, value: number, width: number): Wedge {
    const w = makeWedge(kind, this.run.nextUid++, this.rng.shop, value);
    w.width = width;
    return w;
  }

  // =====================================================================================
  // GameOps (exposed to content)
  // =====================================================================================
  /** Token ceiling: Severance Check caps the purse at 6; otherwise unlimited. */
  tokenCap(): number {
    return this.has('severance_check') ? 6 : Number.POSITIVE_INFINITY;
  }
  addTokens(n: number, why: string): void {
    if (n === 0) return;
    const before = this.run.tokens;
    this.run.tokens = Math.max(0, Math.min(this.tokenCap(), before + n));
    const delta = this.run.tokens - before;
    if (delta > 0) this.run.stats.tokensEarned += delta;
    if (delta !== 0) this.bus.emit('tokens', { delta, why });
  }
  addSpins(n: number, why: string): void {
    this.run.spinsLeft = Math.max(0, this.run.spinsLeft + n);
    this.bus.emit('spins', { delta: n, why });
  }
  addVault(n: number, why: string): void {
    if (n === 0) return;
    this.run.vault = Math.max(0, Math.round(this.run.vault + n));
    this.bus.emit('vault', { delta: n, why });
  }
  addTray(n: number, why: string): void {
    if (n === 0) return;
    this.run.tray = Math.max(0, Math.round(this.run.tray + n));
    this.run.stats.maxTray = Math.max(this.run.stats.maxTray, this.run.tray);
    this.bus.emit('tray', { delta: n, why });
  }
  addBoost(n: number): void {
    this.run.boost += n;
    this.note(`BOOST +×${n}`);
  }
  addStreak(n: number): void {
    this.run.streak = Math.round((this.run.streak + n) * 100) / 100;
    this.run.stats.maxStreak = Math.max(this.run.stats.maxStreak, this.run.streak);
    this.bus.emit('streak', { value: this.run.streak });
  }
  addScratch(id?: string): boolean {
    if (this.run.scratch.length >= BALANCE.maxScratch) return false;
    const card = id ?? this.rng.loot.pick(SCRATCH_CARDS).id;
    this.run.scratch.push(card);
    this.note(`CARD: ${scratchDef(card).name.toUpperCase()}`);
    return true;
  }
  queueArtifactPick(source: string, count = 1, rarity?: Rarity): void {
    for (let i = 0; i < count; i++) {
      const options = rollArtifacts(this.run, this.rng.loot, 3, rarity);
      if (options.length === 0) {
        this.addTokens(3, 'no artifacts left');
        continue;
      }
      this.run.pendingQueue.push({ type: 'artifactPick', options, source });
    }
  }
  /** Shelf slots: one fewer for every finger the Network has taken. */
  maxArtifacts(): number {
    return Math.max(1, BALANCE.maxArtifacts - (this.run.marks.fingers ?? 0));
  }

  grantArtifact(id: string): boolean {
    if (this.run.artifacts.length >= this.maxArtifacts()) return false;
    const inst: ArtifactInstance = { uid: this.run.nextUid++, id, state: {} };
    this.run.artifacts.push(inst);
    const slot = this.run.artifacts.length - 1;
    if (id === 'severance_check') this.run.tokens = Math.min(this.run.tokens, this.tokenCap());
    const a = this.active().find((x) => x.slot === slot);
    if (a?.def.hooks.onAcquire) a.def.hooks.onAcquire(this.hookCtx(a));
    this.bus.emit('artifactGained', { id, slot });
    this.recomputeDebt();
    return true;
  }
  setWedgeKind(uid: number, kind: WedgeKind, value?: number): void {
    const w = this.wedgeByUid(uid);
    if (!w) return;
    const wasJackpot = w.kind === 'jackpot';
    const fresh = makeWedge(kind, w.uid, this.rng.shop, value ?? WEDGES[kind].defaultValue);
    w.kind = fresh.kind;
    w.value = fresh.value;
    w.halves = fresh.halves;
    w.bonus = 0;
    for (const k of Object.keys(this.run.marks)) if (k.endsWith(`:${uid}`)) delete this.run.marks[k];
    if (!WEDGES[kind].gildable) w.gild = 0;
    if (kind === 'jackpot') w.width = BALANCE.jackpotWidth;
    else if (wasJackpot) w.width = BALANCE.baseWidth;
    this.bus.emit('wheelChanged', { reason: `set ${kind}` });
  }
  insertWedgeRandom(kind: WedgeKind, value: number, pred?: (k: WedgeKind) => boolean): number | null {
    const ok = (w: Wedge) => w.kind !== 'jackpot' && w.kind !== kind && (pred ? pred(w.kind) : w.kind !== 'bankrupt');
    let cands = this.run.wheel.filter(ok);
    if (!cands.length) cands = this.run.wheel.filter((w) => w.kind !== 'jackpot' && w.kind !== kind);
    if (!cands.length) return null;
    // Prefer the lowest-value candidates (Duds, small cash) so additions are not brutal.
    cands.sort((a, b) => (a.kind === 'dud' ? -1 : 0) - (b.kind === 'dud' ? -1 : 0) || a.value - b.value);
    const pool = cands.slice(0, Math.max(1, Math.ceil(cands.length / 2)));
    const w = this.rng.events.pick(pool);
    this.setWedgeKind(w.uid, kind, value);
    return w.uid;
  }
  removeKind(kind: WedgeKind, replaceWith: WedgeKind, count = 99): number {
    let n = 0;
    for (const w of this.run.wheel) {
      if (n >= count) break;
      if (w.kind === kind) {
        this.setWedgeKind(w.uid, replaceWith, replaceWith === 'cash' ? 50 : undefined);
        n++;
      }
    }
    return n;
  }
  randomArtifactId(rarity?: Rarity, exclude: string[] = []): string | null {
    return rollArtifacts(this.run, this.rng.events, 1, rarity, exclude)[0] ?? null;
  }
  horror(e: HorrorEvent): void {
    this.bus.emit('horror', e);
  }

  note(text: string): void {
    this.notes.push(text);
    this.bus.emit('note', text);
  }
  wedgeByUid(uid: number): Wedge | undefined {
    return this.run.wheel.find((w) => w.uid === uid);
  }

  // =====================================================================================
  // Artifacts / hooks
  // =====================================================================================
  /** Active artifacts in slot order, with The Understudy resolved to what it copies. */
  active(): ActiveArtifact[] {
    const arts = this.run.artifacts;
    const out: ActiveArtifact[] = [];
    for (let slot = 0; slot < arts.length; slot++) {
      let j = slot;
      let def: ArtifactDef | null = artifactDef(arts[slot].id);
      let guard = 0;
      while (def && def.id === 'understudy' && guard++ < BALANCE.maxArtifacts) {
        j++;
        def = j < arts.length ? artifactDef(arts[j].id) : null;
      }
      if (!def || def.id === 'understudy') continue;
      // Hooks see the copied artifact's own instance (state such as "used this Deadline" is shared),
      // while triggers still light up the Understudy's slot.
      out.push({ slot, inst: arts[j], def, physicalId: arts[slot].id });
    }
    return out;
  }

  hookCtx(a: ActiveArtifact): HookCtx {
    return {
      ops: this,
      run: this.run,
      rng: this.rng,
      slot: a.slot,
      inst: a.inst,
      def: a.def,
      trigger: (text: string) => {
        const t: Trigger = { slot: a.slot, artifactId: a.physicalId, text };
        this.triggerSink.push(t);
        this.bus.emit('trigger', t);
      },
    };
  }

  runHook(name: HookName, payload?: unknown): void {
    for (const a of this.active()) {
      const h = a.def.hooks[name] as ((c: HookCtx, e?: unknown) => void) | undefined;
      if (h) h(this.hookCtx(a), payload);
    }
  }

  has(id: string): boolean {
    return this.active().some((a) => a.def.id === id);
  }

  private staticSum(key: 'spinsPerDeadline' | 'streakStepAdd'): number {
    let s = 0;
    for (const a of this.active()) s += a.def.statics?.[key] ?? 0;
    return s;
  }
  private staticProd(key: 'debtMult' | 'cashBaseMult' | 'sellMult'): number {
    let p = 1;
    for (const a of this.active()) p *= a.def.statics?.[key] ?? 1;
    return p;
  }

  // =====================================================================================
  // Derived state
  // =====================================================================================
  widthMods(): WidthMods {
    const m = emptyWidthMods();
    mutatorDef(this.run.mutator)?.widthMods?.(m);
    for (const a of this.active()) a.def.statics?.widthMods?.(m, this.run);
    // The late show: the Network's Bankrupts grow wider every Deadline past the fourth.
    const late = Math.max(0, this.run.deadline - 4);
    if (late > 0) m.mult.bankrupt = (m.mult.bankrupt ?? 1) * (1 + BALANCE.lateBankruptWidth * late);
    return m;
  }

  layout(): Layout {
    return computeLayout(this.run.wheel, this.run.overrides, this.widthMods());
  }

  effectiveRing(): number[] {
    let ring = [...this.run.ring];
    const mut = mutatorDef(this.run.mutator);
    if (mut?.ringMod) ring = mut.ringMod(ring);
    for (const a of this.active()) if (a.def.statics?.ringMod) ring = a.def.statics.ringMod(ring, this.run);
    return ring.length ? ring : [1];
  }

  cashValueOf(seg: Segment): number {
    let v = seg.value * (1 + BALANCE.gildMult * seg.gild) + seg.bonus;
    v *= this.staticProd('cashBaseMult');
    const mut = mutatorDef(this.run.mutator);
    if (mut?.cashMult) v *= mut.cashMult;
    if (seg.kind === 'jackpot' && mut?.jackpotMult) v *= mut.jackpotMult;
    return v;
  }

  bestCashValue(): number {
    let best = 0;
    for (const s of this.layout().segments) if (s.kind === 'cash' || s.kind === 'cursedCash') best = Math.max(best, this.cashValueOf(s));
    return best || 100;
  }

  streakBase(): number {
    return this.run.marks.warmStart ? 1.5 : BALANCE.streakStart;
  }

  streakStep(): number {
    return BALANCE.streakStep + this.staticSum('streakStepAdd') + (mutatorDef(this.run.mutator)?.streakStepAdd ?? 0);
  }

  isSweep(d: number): boolean {
    if (d <= BALANCE.deadlinesPerRun) return BALANCE.sweepDeadlines.includes(d);
    return (d - BALANCE.deadlinesPerRun) % BALANCE.endlessSweepEvery === 0;
  }

  computeDebt(d: number): number {
    const stake = BALANCE.stakeDebtMult[this.run.stake] ?? 1;
    const mut = mutatorDef(this.run.mutator)?.debtMult ?? 1;
    const cur = this.run.marks.curDebtMult ?? 1;
    const late = Math.pow(BALANCE.lateDebtGrowth, Math.max(0, d - 4));
    return round50(baseDebt(d) * late * stake * this.staticProd('debtMult') * mut * cur);
  }

  recomputeDebt(): void {
    if (this.run.deadline > 0) this.run.debt = this.computeDebt(this.run.deadline);
  }

  spinsForPackage(pkg: PackageId): number {
    const base = BALANCE.packages[pkg].spins;
    const mut = mutatorDef(this.run.mutator)?.spinsDelta ?? 0;
    // A missing eye costs a spin every Deadline.
    const eye = this.run.marks.eyeLost ? 1 : 0;
    return Math.max(1, base + this.staticSum('spinsPerDeadline') + this.run.nextMods.spinsDelta + mut - eye);
  }

  tokensForPackage(pkg: PackageId): number {
    const mult = mutatorDef(this.run.mutator)?.tokenPackageMult ?? 1;
    return Math.round(BALANCE.packages[pkg].tokens * mult);
  }

  sellMult(): number {
    return this.staticProd('sellMult');
  }

  /** The physics a spin runs with. Artifacts (Loaded Flapper) reshape it through `onSpinCharge`. */
  chargeContext(layout = this.layout()): ChargeCtx {
    const ctx: ChargeCtx = { physics: noPhysicsMods(layout), segments: layout.segments, preview: this.run.flags.peek > 0 };
    this.runHook('onSpinCharge', ctx);
    // Nothing to see with.
    if (this.run.marks.eyeLost) ctx.preview = false;
    return ctx;
  }

  canPeek(): boolean {
    return this.run.phase === 'AwaitAction' && this.chargeContext().preview;
  }

  /** Exact landing for a power value, without consuming randomness. */
  previewLanding(power: number): { segIdx: number; innerIndex: number } {
    const layout = this.layout();
    const lockTarget = this.lockTargetIndex(layout);
    const ring = this.effectiveRing();
    const ctx = this.chargeContext(layout);
    const mods = ctx.physics;
    const rng = this.rng.wheel.clone();
    if (lockTarget !== null) {
      const res = this.searchLock(layout, ring.length, power, mods, lockTarget, rng);
      if (res) return { segIdx: res.outerIndex, innerIndex: res.innerIndex };
    }
    const sim = simulateSpin(
      { layout, ringLen: ring.length, power, startAngle: this.run.wheelAngle, ringStartAngle: this.run.ringAngle, mods, noTrace: true },
      rng,
    );
    return { segIdx: sim.outerIndex, innerIndex: sim.innerIndex };
  }

  private lockTargetIndex(layout: Layout): number | null {
    if (!this.run.flags.lock) return null;
    const last = this.run.history[this.run.history.length - 1];
    if (!last) return null;
    const i = layout.segments.findIndex((s) => s.uid === last.uid && s.idx === last.segIdx);
    if (i >= 0) return i;
    const j = layout.segments.findIndex((s) => s.uid === last.uid);
    return j >= 0 ? j : null;
  }

  private searchLock(layout: Layout, ringLen: number, power: number, mods: PhysicsMods, target: number, rng: RngStreams['wheel']): SpinSim | null {
    for (let trial = 0; trial < 400; trial++) {
      const before = rng.getState();
      const sim = simulateSpin(
        { layout, ringLen, power, startAngle: this.run.wheelAngle, ringStartAngle: this.run.ringAngle, mods, noTrace: true },
        rng,
      );
      if (sim.outerIndex === target) {
        rng.setState(before);
        return simulateSpin({ layout, ringLen, power, startAngle: this.run.wheelAngle, ringStartAngle: this.run.ringAngle, mods }, rng);
      }
    }
    return null;
  }

  // =====================================================================================
  // Flow helpers
  // =====================================================================================
  private setPhase(to: RunPhase): void {
    const from = this.run.phase;
    this.run.phase = to;
    if (from !== to) this.bus.emit('phase', { from, to });
  }

  private changed(action: string): void {
    this.run.rng = streamStates(this.rng);
    this.bus.emit('changed', { action });
  }

  private assertPhase(...p: RunPhase[]): void {
    if (!p.includes(this.run.phase)) throw new Error(`Action not allowed in phase ${this.run.phase} (expected ${p.join('/')})`);
  }

  /** Move to the next pending choice, a pending phone call, or back to `resume`. */
  private advance(): void {
    const q = this.run.pendingQueue.shift();
    if (q) {
      this.run.pending = q;
      this.setPhase(q.type === 'artifactPick' ? 'ArtifactPick' : q.type === 'nudge' ? 'Nudge' : 'WedgeReplace');
      return;
    }
    this.run.pending = null;
    if (this.run.phone && this.run.phase !== 'PhoneCall') {
      this.setPhase('PhoneCall');
      return;
    }
    this.setPhase(this.run.resume);
    if (this.run.resume === 'AwaitAction') this.maybeEndDeadline();
  }

  private maybeEndDeadline(): DeadlineEndResult | null {
    if (this.run.phase === 'AwaitAction' && this.run.spinsLeft <= 0) return this.endDeadline();
    return null;
  }

  // =====================================================================================
  // Deadline lifecycle
  // =====================================================================================
  startDeadline(d: number): void {
    const run = this.run;
    run.deadline = d;
    run.mutator = this.isSweep(d) ? this.rng.events.pick(MUTATORS).id : null;
    run.marks.curDebtMult = run.nextMods.debtMult;
    run.nextMods.debtMult = 1;
    run.debt = this.computeDebt(d);
    run.pkg = null;
    run.spinsLeft = 0;
    run.spinsThisDeadline = 0;
    run.history = [];
    run.cashRun = 0;
    run.tray = 0;
    run.streak = this.streakBase();
    run.boost = 0;
    run.overrides = [];
    run.marks.depositedThisDeadline = 0;
    run.marks.bleeding = 0;
    // The Sponsor's Challenge for this Deadline (events stream, so it is part of the replay).
    run.marks.chal = this.rng.events.int(CHALLENGES.length) + 1;
    run.marks.chalProg = 0;
    run.marks.chalDone = 0;
    run.phone = null;
    run.shop = null;
    this.triggerSink = [];
    this.runHook('onDeadlineStart');
    this.setPhase('PackageSelect');
    run.resume = 'AwaitAction';
    this.bus.emit('deadlineStart', { deadline: d, debt: run.debt, mutator: run.mutator });
    this.changed('deadlineStart');
  }

  choosePackage(pkg: PackageId): void {
    this.assertPhase('PackageSelect');
    const run = this.run;
    run.pkg = pkg;
    run.spinsLeft = this.spinsForPackage(pkg);
    run.nextMods.spinsDelta = 0;
    this.addTokens(this.tokensForPackage(pkg), 'package');
    if (BALANCE.packages[pkg].marathonBankrupt) {
      const cands = this.layout().segments.filter((s) => s.kind !== 'bankrupt' && s.kind !== 'jackpot');
      if (cands.length) {
        const s = this.rng.events.pick(cands);
        run.overrides.push({ uid: s.uid, half: s.half, kind: 'bankrupt', value: 0, scope: 'deadline', reason: 'marathon' });
        this.bus.emit('wheelChanged', { reason: 'marathon' });
      }
    }
    this.runHook('onPackageChosen', { pkg, spins: run.spinsLeft });
    this.setPhase('AwaitAction');
    this.prepareNextSpin();
    this.changed('package');
  }

  /** Per-spin overrides (Static, Static Burst) are decided before charging so they are visible. */
  private prepareNextSpin(): void {
    const run = this.run;
    run.overrides = run.overrides.filter((o) => o.scope !== 'spin');
    if (this.has('static') && (run.stats.spins + 1) % 5 === 0) this.addSpinJackpot('static');
    if (run.flags.staticBurst) this.addSpinJackpot('burst');
  }

  private addSpinJackpot(reason: string): void {
    if (this.run.overrides.some((o) => o.scope === 'spin' && o.reason === reason)) return;
    const cands = this.layout().segments.filter((s) => s.kind !== 'jackpot');
    if (!cands.length) return;
    const s = this.rng.events.pick(cands);
    this.run.overrides.push({ uid: s.uid, half: s.half, kind: 'jackpot', value: BALANCE.jackpotValue, scope: 'spin', reason });
    this.bus.emit('wheelChanged', { reason });
  }

  // =====================================================================================
  // Spinning
  // =====================================================================================
  /** Spin with player-controlled power. Hand spins can supply their release angle. */
  spin(power: number, opts: { peek?: boolean; startAngle?: number; omega?: number } = {}): SpinOutcome {
    this.assertPhase('AwaitAction');
    const run = this.run;
    if (run.spinsLeft <= 0) throw new Error('No spins left');
    if (opts.startAngle !== undefined && Number.isFinite(opts.startAngle)) run.wheelAngle = mod360(opts.startAngle);
    this.triggerSink = [];
    this.notes = [];
    const layout = this.layout();
    const ring = this.effectiveRing();
    const ctx = this.chargeContext(layout);
    const mods = ctx.physics;
    let peeked = false;
    if (opts.peek && ctx.preview) {
      peeked = true;
      if (run.flags.peek > 0) run.flags.peek -= 1;
      else {
        const eye = this.active().find((a) => a.def.id === 'glass_eye' && !a.inst.state.used);
        if (eye) eye.inst.state.used = 1;
      }
    }

    const free = run.flags.freeze;
    if (free) run.flags.freeze = false;
    else run.spinsLeft -= 1;
    run.spinsThisDeadline += 1;
    run.stats.spins += 1;
    const spinNo = run.stats.spins;

    let sim: SpinSim | null = null;
    let locked = false;
    const lockTarget = this.lockTargetIndex(layout);
    if (lockTarget !== null) {
      sim = this.searchLock(layout, ring.length, power, mods, lockTarget, this.rng.wheel);
      locked = !!sim;
    }
    run.flags.lock = false;
    if (!sim) {
      sim = simulateSpin(
        { layout, ringLen: ring.length, power, startAngle: run.wheelAngle, ringStartAngle: run.ringAngle, mods, omega0: opts.omega },
        this.rng.wheel,
      );
    }
    run.wheelAngle = mod360(sim.finalAngle);
    run.ringAngle = mod360(sim.finalRingAngle);
    run.flags.staticBurst = false;

    const ps: PendingSpin = {
      outerIndex: sim.outerIndex,
      innerIndex: sim.innerIndex,
      boundaryDist: sim.boundaryDist,
      neighborIndex: sim.neighborIndex,
      power,
      spinNo,
      free,
    };
    const outcome: SpinOutcome = { spinNo, power, free, locked, peeked, sim, layout, ring, resolution: null };
    if (run.flags.nudge) {
      run.flags.nudge = false;
      run.pendingSpin = ps;
      run.pending = { type: 'nudge', options: [-1, 0, 1] };
      this.setPhase('Nudge');
      this.changed('spin');
      return outcome;
    }
    outcome.resolution = this.resolvePending(ps, 0);
    this.changed('spin');
    return outcome;
  }

  /**
   * Test/debug helper: resolve a spin with a forced landing (no physics). Performs the same
   * bookkeeping as spin(). Not reachable from the UI.
   */
  spinForced(segIdx: number, innerIndex: number, opts: { boundaryDist?: number; neighborIndex?: number } = {}): SpinResolution {
    this.assertPhase('AwaitAction');
    const run = this.run;
    if (run.spinsLeft <= 0) throw new Error('No spins left');
    this.triggerSink = [];
    this.notes = [];
    const free = run.flags.freeze;
    if (free) run.flags.freeze = false;
    else run.spinsLeft -= 1;
    run.spinsThisDeadline += 1;
    run.stats.spins += 1;
    run.flags.staticBurst = false;
    const layout = this.layout();
    const n = layout.segments.length;
    const r = this.resolvePending(
      {
        outerIndex: segIdx,
        innerIndex,
        boundaryDist: opts.boundaryDist ?? 99,
        neighborIndex: opts.neighborIndex ?? (segIdx + 1) % n,
        power: 0.5,
        spinNo: run.stats.spins,
        free,
      },
      0,
    );
    this.changed('spin');
    return r;
  }

  chooseNudge(dir: -1 | 0 | 1): SpinResolution {
    this.assertPhase('Nudge');
    const ps = this.run.pendingSpin;
    if (!ps) throw new Error('No pending spin');
    const layout = this.layout();
    const n = layout.segments.length;
    if (dir !== 0) {
      // Pointer local angle increases when the wheel rotates backwards: +1 = next segment.
      ps.outerIndex = (ps.outerIndex + dir + n) % n;
      ps.boundaryDist = 99;
      this.run.wheelAngle = angleForSegment(layout, ps.outerIndex);
    }
    this.run.pending = null;
    this.run.pendingSpin = null;
    this.setPhase('AwaitAction');
    this.triggerSink = [];
    this.notes = [];
    const r = this.resolvePending(ps, dir);
    this.changed('nudge');
    return r;
  }

  private resolvePending(ps: PendingSpin, nudge: number): SpinResolution {
    const run = this.run;
    const layout = this.layout();
    const ring = this.effectiveRing();
    const seg = layout.segments[ps.outerIndex];
    const nb = layout.segments[ps.neighborIndex];
    const neighbor = ps.boundaryDist < BALANCE.neighborsThreshold && nb && nb.idx !== seg.idx ? nb : null;
    const innerIndex = Math.min(ps.innerIndex, ring.length - 1);
    const innerMult = ring[innerIndex];
    this.ringJumpResult = null;

    // A Bleeder's wound: the Tray drains a little every spin until it is deposited.
    if (run.marks.bleeding && run.tray > 0) {
      const drain = Math.max(1, Math.floor(run.tray * BALANCE.bleedRate));
      this.addTray(-drain, 'bleed');
      this.note(`BLEEDING −$${drain}`);
      this.bus.emit('horror', { type: 'bleed', amount: drain });
    }

    const payout = resolvePayout(this, {
      seg,
      neighbor,
      innerMult,
      spinNo: ps.spinNo,
      firstOfDeadline: run.spinsThisDeadline === 1,
      nested: false,
    });

    run.history.push({ kind: seg.kind, uid: seg.uid, segIdx: seg.idx, wasCash: payout.isCash, cash: payout.cash, innerMult });
    this.horrorUpkeep(seg);
    if (payout.streakReset) {
      run.streak = this.streakBase();
      this.bus.emit('streak', { value: run.streak });
    } else this.addStreak(this.streakStep());

    this.runHook('onSpinResolved', {
      seg,
      landedKind: seg.kind,
      cash: payout.cash,
      bankrupt: payout.bankrupt && !payout.bankruptBlocked,
      combos: payout.combos,
      spinNo: ps.spinNo,
    });

    this.challengeEvent({ type: 'spin', kind: seg.kind, cash: payout.cash, combos: payout.combos, streak: run.streak, tray: run.tray });
    if (payout.deadAir) this.openPhone('deadAir', 'AwaitAction');
    this.prepareNextSpin();

    const resolution: SpinResolution = {
      segIdx: seg.idx,
      nudge,
      seg,
      neighbor,
      innerIndex,
      innerMult,
      payout,
      triggers: this.triggerSink,
      notes: this.notes,
      ringJump: this.ringJumpResult,
      streakAfter: run.streak,
      deadlineEnd: null,
      combos: payout.combos,
    };
    run.resume = 'AwaitAction';
    if (run.pendingQueue.length || run.phone) {
      this.advance();
    } else {
      resolution.deadlineEnd = this.maybeEndDeadline();
    }
    return resolution;
  }

  /**
   * Wedges that act on spins that miss them: the Mouth feeds on the Tray, an open Eye counts
   * down to blinking shut (and becomes a Bankrupt).
   */
  private horrorUpkeep(landed: Segment): void {
    const run = this.run;
    for (const w of run.wheel) {
      if (w.kind !== 'mouth' || w.uid === landed.uid) continue;
      const bite = Math.floor(run.tray * BALANCE.mouthBite);
      if (bite <= 0) continue;
      this.addTray(-bite, 'mouth');
      run.marks[`belly:${w.uid}`] = (run.marks[`belly:${w.uid}`] ?? 0) + bite;
      this.note(`THE MOUTH EATS $${bite}`);
      this.bus.emit('horror', { type: 'mouthEat', uid: w.uid, amount: bite });
    }
    for (const k of Object.keys(run.marks)) {
      if (!k.startsWith('eye:')) continue;
      const uid = Number(k.slice(4));
      // The spin that opened (or re-landed) the Eye doesn't count against it.
      if (uid === landed.uid) continue;
      run.marks[k] -= 1;
      if (run.marks[k] > 0) continue;
      delete run.marks[k];
      if (this.wedgeByUid(uid)?.kind !== 'eye') continue;
      this.setWedgeKind(uid, 'bankrupt');
      this.note('THE EYE BLINKS SHUT');
      this.bus.emit('horror', { type: 'eyeShut', uid });
    }
  }

  /**
   * Policy 7: a silence at the wheel late in the show is Dead Air. The breach is only counted
   * (the studio rots a little faster); what moves in the dark is the stage's business.
   */
  recordSilence(): number {
    const n = (this.run.marks.silences ?? 0) + 1;
    this.run.marks.silences = n;
    this.bus.emit('horror', { type: 'silence', count: n });
    this.changed('silence');
    return n;
  }

  /** The Producer will take payment in kind: a finger first, then an eye. */
  canCollateral(): boolean {
    const n = this.run.marks.collateral ?? 0;
    if (n >= BALANCE.collateralMax) return false;
    // A body part covers a near miss, not a rout.
    return this.run.debt - this.run.vault <= this.run.debt * (BALANCE.collateralCover[n] ?? 0);
  }

  /** Ring Jump: re-spin only the inner ring and pay the previous outer wedge again. */
  private ringJumpDepth = 0;

  ringJump(): void {
    if (this.ringJumpDepth > 0) {
      this.note('RING JUMP FIZZLES');
      return;
    }
    const run = this.run;
    const prev = run.history[run.history.length - 1];
    const ring = this.effectiveRing();
    const rj = simulateRingOnly(ring.length, run.ringAngle, this.rng.wheel);
    run.ringAngle = mod360(rj.finalRingAngle);
    const result: RingJumpResult = {
      innerIndex: rj.innerIndex,
      innerMult: ring[rj.innerIndex],
      trace: rj.trace,
      duration: rj.duration,
      payout: null,
      segIdx: -1,
    };
    this.ringJumpResult = result;
    if (!prev || prev.kind === 'ringJump') {
      this.note('NOTHING TO JUMP');
      return;
    }
    const layout = this.layout();
    const seg = layout.segments.find((s) => s.uid === prev.uid && s.idx === prev.segIdx) ?? layout.segments.find((s) => s.uid === prev.uid);
    if (!seg) {
      this.note('WEDGE GONE');
      return;
    }
    result.segIdx = seg.idx;
    this.ringJumpDepth++;
    try {
      result.payout = resolvePayout(this, {
      seg,
      neighbor: null,
      innerMult: result.innerMult,
      spinNo: run.stats.spins,
      firstOfDeadline: false,
        nested: true,
      });
    } finally {
      this.ringJumpDepth--;
    }
    // resolvePayout may have overwritten ringJumpResult through a nested call; restore.
    this.ringJumpResult = result;
  }

  // =====================================================================================
  // Deposit / Scratch
  // =====================================================================================
  deposit(auto = false): DepositResult {
    if (!auto) this.assertPhase('AwaitAction');
    const run = this.run;
    const before = this.triggerSink;
    this.triggerSink = [];
    const ctx: DepositCtx = {
      amount: run.tray,
      auto,
      keepStreak: false,
      lossFrac: 0,
      bonusVault: 0,
      firstThisDeadline: !run.marks.depositedThisDeadline,
    };
    if (!auto && run.flags.safeDeposit) {
      run.flags.safeDeposit = false;
      ctx.keepStreak = true;
    }
    this.runHook('onDeposit', ctx);
    const lost = Math.floor(ctx.amount * Math.min(1, ctx.lossFrac));
    const amount = run.tray;
    this.addTray(-amount, 'deposit');
    this.addVault(amount - lost + ctx.bonusVault, 'deposit');
    run.marks.bleeding = 0;
    if (!auto) this.challengeEvent({ type: 'deposit', amount });
    if (!auto) {
      run.marks.depositedThisDeadline = 1;
      run.stats.deposits += 1;
      if (!ctx.keepStreak) {
        run.streak = this.streakBase();
        run.cashRun = 0;
        this.bus.emit('streak', { value: run.streak });
      }
    }
    const res: DepositResult = { amount, lost, bonus: ctx.bonusVault, keptStreak: ctx.keepStreak, auto, triggers: this.triggerSink };
    this.triggerSink = before.concat(this.triggerSink);
    this.bus.emit('deposit', res);
    if (!auto) this.changed('deposit');
    return res;
  }

  /** Double or Nothing is offered once per Deadline when the Tray holds at least BALANCE.gambleMin. */
  canGamble(): boolean {
    const r = this.run;
    return r.phase === 'AwaitAction' && r.tray >= BALANCE.gambleMin && r.marks.gambledAt !== r.deadline;
  }

  /**
   * Stake the whole Tray on an even-odds flip (the events stream, so replays stay deterministic).
   * Win: the Tray doubles and the Streak stands. Lose: the Tray empties and the Streak resets.
   * Expected value is exactly zero; it trades certainty for variance.
   */
  gamble(): { won: boolean; stake: number; tray: number } {
    this.assertPhase('AwaitAction');
    if (!this.canGamble()) throw new Error('Double or Nothing is not available');
    const run = this.run;
    const stake = run.tray;
    run.marks.gambledAt = run.deadline;
    const won = this.rng.events.chance(0.5);
    if (won) this.addTray(stake, 'gamble');
    else {
      this.addTray(-stake, 'gamble');
      run.streak = this.streakBase();
      run.cashRun = 0;
      this.bus.emit('streak', { value: run.streak });
    }
    this.changed('gamble');
    return { won, stake, tray: run.tray };
  }

  /** This Deadline's Sponsor's Challenge, if any. */
  challenge(): { def: ChallengeDef; target: number; progress: number; done: boolean } | null {
    const i = this.run.marks.chal;
    if (!i) return null;
    const def = CHALLENGES[i - 1];
    if (!def) return null;
    return { def, target: def.target(this.run), progress: this.run.marks.chalProg ?? 0, done: !!this.run.marks.chalDone };
  }

  private challengeEvent(e: ChallengeEvent): void {
    const c = this.challenge();
    if (!c || c.done) return;
    if (e.type === 'deposit' && c.def.resetOnDeposit) {
      this.run.marks.chalProg = 0;
      return;
    }
    const v = c.def.progress(e, this.run);
    const prog = c.def.mode === 'count' ? c.progress + v : Math.max(c.progress, v);
    this.run.marks.chalProg = prog;
    if (prog >= c.target) {
      this.run.marks.chalDone = 1;
      this.addTokens(c.def.reward, 'challenge');
      this.note(`SPONSOR'S CHALLENGE: +${c.def.reward} TOKEN${c.def.reward > 1 ? 'S' : ''}`);
      this.bus.emit('challenge', { id: c.def.id });
    }
  }

  canUseScratch(i: number): boolean {
    const id = this.run.scratch[i];
    if (!id) return false;
    const def = scratchDef(id);
    if (def.when === 'spin' && this.run.phase !== 'AwaitAction') return false;
    if (def.when === 'shop' && this.run.phase !== 'Shop') return false;
    if (def.when === 'any' && !['AwaitAction', 'Shop', 'PackageSelect'].includes(this.run.phase)) return false;
    return def.usable(this.run);
  }

  useScratch(i: number): boolean {
    if (!this.canUseScratch(i)) return false;
    const id = this.run.scratch[i];
    this.run.scratch.splice(i, 1);
    this.notes = [];
    scratchDef(id).use(this);
    if (this.run.flags.staticBurst) this.addSpinJackpot('burst');
    this.changed('scratch');
    return true;
  }

  discardScratch(i: number): void {
    if (this.run.scratch[i]) this.run.scratch.splice(i, 1);
    this.changed('discard');
  }

  // =====================================================================================
  // Choices
  // =====================================================================================
  /** Pick an artifact from a pending 1-of-3. `id = null` skips. If the shelf is full, pass `replaceSlot`. */
  pickArtifact(id: string | null, replaceSlot?: number): boolean {
    this.assertPhase('ArtifactPick');
    const p = this.run.pending;
    if (!p || p.type !== 'artifactPick') return false;
    if (id !== null) {
      if (!p.options.includes(id)) return false;
      if (this.run.artifacts.length >= this.maxArtifacts()) {
        if (replaceSlot === undefined) return false;
        this.removeArtifact(replaceSlot);
      }
      this.grantArtifact(id);
    }
    this.advance();
    this.changed('pickArtifact');
    return true;
  }

  private removeArtifact(slot: number): ArtifactInstance | null {
    const inst = this.run.artifacts[slot];
    if (!inst) return null;
    const a = this.active().find((x) => x.slot === slot);
    if (a?.def.hooks.onRemove) a.def.hooks.onRemove(this.hookCtx(a));
    this.run.artifacts.splice(slot, 1);
    this.bus.emit('artifactLost', { id: inst.id, slot });
    this.recomputeDebt();
    return inst;
  }

  sellArtifact(slot: number): number {
    this.assertPhase('Shop', 'AwaitAction', 'PackageSelect', 'Conversion');
    const inst = this.run.artifacts[slot];
    if (!inst) return 0;
    const v = sellValue(artifactDef(inst.id).cost, this.sellMult());
    this.removeArtifact(slot);
    this.addTokens(v, 'sell');
    this.changed('sell');
    return v;
  }

  moveArtifact(from: number, to: number): void {
    const a = this.run.artifacts;
    if (from < 0 || from >= a.length || to < 0 || to >= a.length || from === to) return;
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
    this.changed('move');
  }

  // =====================================================================================
  // End of Deadline
  // =====================================================================================
  endDeadline(): DeadlineEndResult {
    const run = this.run;
    const before = this.triggerSink;
    this.triggerSink = [];
    const dep = run.tray > 0 ? this.deposit(true) : null;
    const vaultBefore = run.vault;
    let paid = run.vault >= run.debt;
    let saved = false;
    if (!paid) {
      const ctx: DeadlineEndCtx = { debt: run.debt, vault: run.vault, paid: false, surplus: 0 };
      for (const a of this.active()) {
        const h = a.def.hooks.onMissedPayment;
        if (h && h(this.hookCtx(a), ctx)) {
          saved = true;
          // The lever breaks.
          const slot = run.artifacts.indexOf(a.inst);
          if (a.def.id === 'trapdoor_lever' && slot >= 0) this.removeArtifact(slot);
          run.flags.trapdoorUsed = true;
          break;
        }
      }
      if (saved) {
        this.addVault(run.debt - run.vault, 'trapdoor');
        paid = true;
      }
    }
    if (!paid && this.canCollateral()) {
      // Short. Before the floor opens, the Producer calls with an offer.
      const part = (run.marks.collateral ?? 0) === 0 ? 'finger' : 'eye';
      run.phone = {
        reason: 'collateral',
        offers: [{ bargainId: `collateral_${part}`, params: { short: run.debt - run.vault } }],
        returnTo: 'Conversion',
        intro: this.rng.events.pick(PRODUCER_INTROS.collateral),
      };
      run.stats.phoneCalls += 1;
      run.marks.collateralVaultBefore = vaultBefore;
      const res: DeadlineEndResult = {
        deadline: run.deadline,
        debt: run.debt,
        paid: false,
        saved: false,
        vaultBefore,
        vaultAfter: run.vault,
        deposit: dep,
        triggers: this.triggerSink,
        collateral: true,
      };
      this.triggerSink = before.concat(this.triggerSink);
      this.setPhase('PhoneCall');
      this.bus.emit('phone', { reason: 'collateral' });
      this.bus.emit('deadlineEnd', res);
      this.changed('deadlineEnd');
      return res;
    }
    const res = this.settleDeadline(paid, saved, vaultBefore, dep);
    this.triggerSink = before.concat(this.triggerSink);
    this.bus.emit('deadlineEnd', res);
    this.changed('deadlineEnd');
    return res;
  }

  /** Pay (or miss) the Debt and move on: Conversion, Victory or Game Over. */
  private settleDeadline(paid: boolean, saved: boolean, vaultBefore: number, dep: DepositResult | null): DeadlineEndResult {
    const run = this.run;
    if (paid) this.addVault(-run.debt, 'debt');
    // Tokens held at payment earn interest (counted before anything is added this Deadline).
    const interestTokens = paid && BALANCE.vaultResets ? this.tokenInterest() : 0;
    const ctx: DeadlineEndCtx = { debt: run.debt, vault: run.vault, paid, surplus: paid ? run.vault : 0 };
    this.runHook('onDeadlineEnd', ctx);
    let surplusTokens = 0;
    if (paid && BALANCE.vaultResets) {
      if (interestTokens) this.addTokens(interestTokens, 'interest');
      // The Vault does not carry over: what is left becomes Tokens at this Deadline's rate.
      surplusTokens = this.surplusTokensFor(run.vault);
      if (surplusTokens) this.addTokens(surplusTokens, 'surplus');
      if (run.vault > 0) this.addVault(-run.vault, 'reset');
    }
    run.deadlines.push({ deadline: run.deadline, debt: run.debt, paid, vaultAfter: run.vault, pkg: run.pkg });
    const res: DeadlineEndResult = {
      deadline: run.deadline,
      debt: run.debt,
      paid,
      saved,
      vaultBefore,
      vaultAfter: run.vault,
      deposit: dep,
      triggers: this.triggerSink,
      surplusTokens,
      interestTokens,
    };
    if (!paid) {
      run.endedAt = run.deadline;
      this.setPhase('GameOver');
    } else if (run.deadline === BALANCE.deadlinesPerRun && !run.endless) {
      run.endedAt = run.deadline;
      this.setPhase('Victory');
    } else if (BALANCE.vaultResets) {
      // Nothing to convert any more: straight to the Prize Cabinet.
      this.openShop();
    } else {
      this.setPhase('Conversion');
    }
    return res;
  }

  /** Dollars per Token for this Deadline's leftover cash (scales with the Debt). */
  surplusRate(): number {
    return Math.max(BALANCE.surplusTokenFloor, Math.round(this.run.debt / BALANCE.surplusTokenDivisor));
  }

  /** Tokens the current Vault would turn into if the Debt were paid now (for the HUD and bots). */
  surplusTokensFor(leftover: number): number {
    return Math.min(BALANCE.surplusTokenCap, Math.floor(Math.max(0, leftover) / this.surplusRate()));
  }

  /** Interest a Token balance earns at the end of a Deadline. */
  tokenInterest(tokens = this.run.tokens): number {
    return Math.min(BALANCE.tokenInterestCap, Math.floor(tokens / BALANCE.tokenInterestPer));
  }

  /** The collateral call ends: payment in kind (the Debt is settled) or the floor. */
  private closeCollateral(accepted: boolean): void {
    const run = this.run;
    const vaultBefore = run.marks.collateralVaultBefore ?? run.vault;
    delete run.marks.collateralVaultBefore;
    const part = run.phone?.offers[0]?.bargainId === 'collateral_eye' ? 'eye' : 'finger';
    run.phone = null;
    if (accepted) {
      run.marks.collateral = (run.marks.collateral ?? 0) + 1;
      this.addVault(Math.max(0, run.debt - run.vault), 'collateral');
      // Fewer fingers, fewer shelf slots: whatever no longer fits slips from your grip.
      while (run.artifacts.length > this.maxArtifacts()) this.removeArtifact(run.artifacts.length - 1);
    }
    const res = this.settleDeadline(accepted, false, vaultBefore, null);
    if (accepted) res.inKind = part;
    else res.refused = true;
    this.bus.emit('deadlineEnd', res);
  }

  /** After Victory: keep going into Endless. */
  continueEndless(): void {
    this.assertPhase('Victory');
    this.run.endless = true;
    this.run.victoryShown = true;
    this.run.endedAt = null;
    if (BALANCE.vaultResets) this.openShop();
    else this.setPhase('Conversion');
    this.changed('endless');
  }

  maxConvertible(): number {
    return Math.floor(this.run.vault / BALANCE.tokenRate);
  }

  interestPreview(tokens: number): number {
    const left = this.run.vault - tokens * BALANCE.tokenRate;
    return Math.min(BALANCE.interestCap(this.run.deadline), Math.floor(Math.max(0, left) * BALANCE.interestRate));
  }

  /** Convert surplus to Tokens; the rest earns capped interest. Then the Prize Cabinet opens. */
  convert(tokens: number): { tokens: number; interest: number } {
    this.assertPhase('Conversion');
    const n = Math.max(0, Math.min(Math.floor(tokens), this.maxConvertible()));
    this.addVault(-n * BALANCE.tokenRate, 'convert');
    this.addTokens(n, 'convert');
    const interest = this.interestPreview(0);
    this.addVault(interest, 'interest');
    this.openShop();
    this.changed('convert');
    return { tokens: n, interest };
  }

  // =====================================================================================
  // Prize Cabinet
  // =====================================================================================
  private openShop(): void {
    const run = this.run;
    run.shop = newShopState(run, this.rng.shop, () => run.nextUid++);
    run.shop.freeRerolls += run.marks.freeRerolls ?? 0;
    run.marks.freeRerolls = 0;
    const ctx: ShopCtx = { freeRerolls: 0, discount: 0 };
    this.runHook('onShopOpen', ctx);
    run.shop.freeRerolls += ctx.freeRerolls;
    run.resume = 'Shop';
    this.setPhase('Shop');
  }

  shopBuy(slot: number): ShopResult {
    this.assertPhase('Shop');
    const shop = this.run.shop!;
    const item = shop.items.find((i) => i.slot === slot);
    if (!item || item.sold) return { ok: false, reason: 'sold out' };
    if (this.run.tokens < item.cost) return { ok: false, reason: 'not enough tokens' };
    if (item.type === 'artifact') {
      if (this.run.artifacts.length >= this.maxArtifacts()) return { ok: false, reason: 'shelf full' };
      this.addTokens(-item.cost, 'buy');
      item.sold = true;
      this.grantArtifact(item.id);
      this.run.stats.artifactsBought.push(item.id);
    } else if (item.type === 'scratch') {
      if (this.run.scratch.length >= BALANCE.maxScratch) return { ok: false, reason: 'card slots full' };
      this.addTokens(-item.cost, 'buy');
      item.sold = true;
      this.addScratch(item.id);
    } else {
      this.run.pending = { type: 'wedgeReplace', wedge: structuredClone(item.wedge!), cost: item.cost, source: `shop:${slot}` };
      this.run.resume = 'Shop';
      this.setPhase('WedgeReplace');
    }
    this.changed('buy');
    return { ok: true };
  }

  /** Install a bought wedge over wheel index `idx` (or cancel with null). */
  replaceWedge(idx: number | null): ShopResult {
    this.assertPhase('WedgeReplace');
    const p = this.run.pending;
    if (!p || p.type !== 'wedgeReplace') return { ok: false };
    if (idx !== null) {
      const target = this.run.wheel[idx];
      if (!target) return { ok: false, reason: 'no wedge' };
      if (target.kind === 'bankrupt' && !BALANCE.bankruptRemovable) return { ok: false, reason: 'the network owns that one' };
      if (this.run.tokens < p.cost) return { ok: false, reason: 'not enough tokens' };
      this.addTokens(-p.cost, 'buy wedge');
      const w = structuredClone(p.wedge);
      w.uid = this.run.nextUid++;
      if (target.kind === 'jackpot' && w.kind !== 'jackpot') w.width = BALANCE.baseWidth;
      this.run.wheel[idx] = w;
      if (w.kind === 'cursedCash') this.insertWedgeRandom('tax', 0, (k) => k === 'dud' || k === 'cash' || k === 'respin');
      const slot = Number(p.source.split(':')[1]);
      const item = this.run.shop?.items.find((i) => i.slot === slot);
      if (item) item.sold = true;
      this.bus.emit('wheelChanged', { reason: 'install' });
    }
    this.run.pending = null;
    this.setPhase('Shop');
    this.changed('replaceWedge');
    return { ok: true };
  }

  shopReroll(): ShopResult {
    this.assertPhase('Shop');
    const shop = this.run.shop!;
    if (shop.freeRerolls > 0) shop.freeRerolls -= 1;
    else {
      if (this.run.tokens < shop.rerollCost) return { ok: false, reason: 'not enough tokens' };
      this.addTokens(-shop.rerollCost, 'reroll');
      shop.rerollCost += BALANCE.rerollStep;
    }
    shop.rerolls += 1;
    shop.crank += 1;
    const fresh = newShopState(this.run, this.rng.shop, () => this.run.nextUid++);
    shop.items = fresh.items;
    this.changed('reroll');
    return { ok: true };
  }

  serviceCost(kind: 'remove' | 'gild' | 'resize'): number {
    const escalate = kind === 'remove' ? BALANCE.removeEscalation * (this.run.marks.removals ?? 0) : kind === 'gild' ? BALANCE.gildEscalation * (this.run.marks.gilds ?? 0) : 0;
    return SERVICE_COSTS[kind]() + escalate + (BALANCE.stakeShopMarkup[this.run.stake] ?? 0);
  }

  shopRemove(idx: number): ShopResult {
    this.assertPhase('Shop');
    const w = this.run.wheel[idx];
    if (!w || w.kind === 'dud') return { ok: false, reason: 'nothing to remove' };
    if (w.kind === 'bankrupt' && !BALANCE.bankruptRemovable) return { ok: false, reason: 'the network owns that one' };
    const cost = this.serviceCost('remove');
    if (this.run.tokens < cost) return { ok: false, reason: 'not enough tokens' };
    this.addTokens(-cost, 'remove');
    this.run.marks.removals = (this.run.marks.removals ?? 0) + 1;
    this.setWedgeKind(w.uid, 'dud', 0);
    this.changed('remove');
    return { ok: true };
  }

  shopGild(idx: number): ShopResult {
    this.assertPhase('Shop');
    const w = this.run.wheel[idx];
    if (!w || !WEDGES[w.kind].gildable) return { ok: false, reason: 'cannot gild' };
    if (w.gild >= BALANCE.maxGild) return { ok: false, reason: 'fully gilded' };
    const cost = this.serviceCost('gild');
    if (this.run.tokens < cost) return { ok: false, reason: 'not enough tokens' };
    this.addTokens(-cost, 'gild');
    this.run.marks.gilds = (this.run.marks.gilds ?? 0) + 1;
    w.gild += 1;
    this.bus.emit('wheelChanged', { reason: 'gild' });
    this.changed('gild');
    return { ok: true };
  }

  shopResize(idx: number, dir: 1 | -1): ShopResult {
    this.assertPhase('Shop');
    const w = this.run.wheel[idx];
    if (!w) return { ok: false, reason: 'no wedge' };
    const next = w.width + dir * BALANCE.widenStep;
    const min = w.kind === 'bankrupt' ? BALANCE.bankruptMinWidth : BALANCE.minWidth;
    if (next < min || next > BALANCE.maxWidth) return { ok: false, reason: 'limit reached' };
    const cost = this.serviceCost('resize');
    if (this.run.tokens < cost) return { ok: false, reason: 'not enough tokens' };
    this.addTokens(-cost, 'resize');
    w.width = next;
    this.bus.emit('wheelChanged', { reason: 'resize' });
    this.changed('resize');
    return { ok: true };
  }

  /** Leave the cabinet. The phone may ring; otherwise the next Deadline starts. */
  leaveShop(): void {
    this.assertPhase('Shop');
    const run = this.run;
    run.shop = null;
    const next = run.deadline + 1;
    let ring = false;
    let reason: 'deadline' | 'secret' = 'deadline';
    if ((run.marks.hangups ?? 0) >= 3 && !run.marks.secretCalled) {
      ring = true;
      reason = 'secret';
    } else if (BALANCE.phoneGuaranteed.includes(run.deadline)) ring = true;
    else {
      const p = BALANCE.phoneChanceByDeadline[Math.min(run.deadline, BALANCE.phoneChanceByDeadline.length - 1)] ?? 0.5;
      ring = this.rng.events.chance(p);
    }
    if (ring && this.openPhone(reason, 'PackageSelect')) {
      this.setPhase('PhoneCall');
      this.changed('phone');
      return;
    }
    this.startDeadline(next);
  }

  // =====================================================================================
  // Phone
  // =====================================================================================
  private openPhone(reason: 'deadline' | 'deadAir' | 'secret', resume: RunPhase): boolean {
    const run = this.run;
    const tier: BargainTier = reason === 'deadline' ? 'normal' : reason;
    const pool = BARGAINS.filter((b) => b.tier === tier && (!b.available || b.available(run)));
    if (pool.length === 0) return false;
    const chosen: PhoneOffer[] = [];
    let p = [...pool];
    for (let i = 0; i < 2 && p.length; i++) {
      const b = this.rng.events.weighted(p, (x) => x.weight);
      p = p.filter((x) => x.id !== b.id);
      chosen.push({ bargainId: b.id, params: b.roll ? b.roll(this) : {} });
    }
    if (reason === 'secret') run.marks.secretCalled = 1;
    run.phone = {
      reason,
      offers: chosen,
      returnTo: resume,
      intro: this.rng.events.pick(PRODUCER_INTROS[tier]),
    };
    run.stats.phoneCalls += 1;
    this.bus.emit('phone', { reason });
    return true;
  }

  phoneAccept(i: number): void {
    this.assertPhase('PhoneCall');
    const ph = this.run.phone!;
    const offer = ph.offers[i];
    if (!offer) return;
    this.notes = [];
    this.triggerSink = [];
    bargainDef(offer.bargainId).apply(this, offer.params);
    this.run.stats.bargainsTaken.push(offer.bargainId);
    this.bus.emit('wheelChanged', { reason: 'bargain' });
    if (ph.reason === 'collateral') {
      this.bus.emit('horror', { type: 'collateral', part: offer.bargainId === 'collateral_eye' ? 'eye' : 'finger' });
      this.closeCollateral(true);
    } else this.closePhone();
    this.changed('phoneAccept');
  }

  phoneHangUp(): void {
    this.assertPhase('PhoneCall');
    const ph = this.run.phone!;
    if (ph.reason === 'deadline') this.run.marks.hangups = (this.run.marks.hangups ?? 0) + 1;
    this.run.stats.hungUp += 1;
    if (ph.reason === 'collateral') this.closeCollateral(false);
    else this.closePhone();
    this.changed('phoneHangUp');
  }

  private closePhone(): void {
    const ph = this.run.phone!;
    this.run.phone = null;
    if (ph.returnTo === 'PackageSelect') {
      this.startDeadline(this.run.deadline + 1);
    } else {
      this.run.resume = ph.returnTo;
      this.setPhase(ph.returnTo);
      this.advance();
    }
  }
}

export function allArtifactIds(): string[] {
  return ARTIFACTS.map((a) => a.id);
}
