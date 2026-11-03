/**
 * Payout resolution — exact order [BRIEF §8]:
 *   1. Outer wedge base effect
 *   2. Inner ring multiplier (cash only) (+ pending Boost)
 *   3. Streak multiplier (cash only)
 *   4. Artifact modifiers, in slot order (left → right)
 *   5. Combos (NEIGHBORS, ECHO, HAT TRICK, DEAD AIR) (+ Doubler)
 *   6. Award: cash to the Tray, prizes applied immediately
 */
import { WEDGES } from '../content/wedges';
import { COMBO_NAMES, isDeadAir, isEcho, isHatTrick } from './combos';
import type {
  ActiveArtifact,
  BankruptCtx,
  ComboCtx,
  GameOps,
  HookCtx,
  LandCtx,
  MysteryCtx,
  PayoutApi,
  PrizeIntent,
} from './hooks';
import type { ComboId, PayoutStep, Segment, Trigger, WedgeKind } from './types';

export interface PayoutHost extends GameOps {
  active(): ActiveArtifact[];
  hookCtx(a: ActiveArtifact): HookCtx;
  bestCashValue(): number;
  streakBase(): number;
  triggerSink: Trigger[];
}

export interface PayoutInput {
  seg: Segment;
  /** NEIGHBORS partner, if the stop was near a boundary. */
  neighbor: Segment | null;
  innerMult: number;
  spinNo: number;
  firstOfDeadline: boolean;
  /** Ring Jump re-pay: no combos, no boost consumption, no history. */
  nested: boolean;
}

export interface PayoutResult {
  steps: PayoutStep[];
  marquee: string;
  cash: number;
  isCash: boolean;
  landedKind: WedgeKind;
  resolvedKind: WedgeKind;
  prizes: PrizeIntent[];
  combos: ComboId[];
  bankrupt: boolean;
  bankruptBlocked: boolean;
  trayLost: number;
  deadAir: boolean;
  doubled: boolean;
  /** True if the Tray was reset by a Bankrupt (streak resets). */
  streakReset: boolean;
}

const fmt = (n: number) => `$${Math.round(n)}`;
const fmtMult = (m: number) => `×${Number.isInteger(m) ? m : m.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;

class Builder implements PayoutApi {
  cash = 0;
  isCash = false;
  steps: PayoutStep[] = [];
  prizes: PrizeIntent[] = [];
  bankruptFrac = 0;
  curSlot: number | undefined;
  resolvedKind: WedgeKind;
  constructor(
    public seg: Segment,
    public landedKind: WedgeKind,
    public innerMult: number,
    public spinNo: number,
    public firstOfDeadline: boolean,
    public neighbors: boolean,
  ) {
    this.resolvedKind = landedKind;
  }
  step(op: PayoutStep['op'], label: string, source?: string): void {
    this.steps.push({ op, label, total: Math.round(this.cash), slot: this.curSlot, source });
  }
  mult(x: number, label: string): void {
    if (this.cash <= 0 && !this.isCash) return;
    this.cash *= x;
    this.step('mult', label);
  }
  add(x: number, label: string): void {
    this.cash += x;
    this.step('add', label);
  }
  prize(kind: WedgeKind, amount: number, text: string): void {
    this.prizes.push({ kind, amount, text, weight: 1 });
    this.step('note', text);
  }
}

function landSegment(
  host: PayoutHost,
  b: Builder,
  seg: Segment,
  weight: number,
  primary: boolean,
  label: (l: string) => void,
): void {
  const half = (l: string) => (weight < 1 ? `½ ${l}` : l);
  const ctx: LandCtx = {
    ops: host,
    run: host.run,
    rng: host.rng,
    seg,
    weight,
    cashValue: (s) => host.cashValueOf(s),
    cash: (amount, l) => {
      b.cash += amount * weight;
      b.isCash = true;
      label(half(l));
    },
    prize: (kind, amount, text, scalable) => {
      b.prizes.push({ kind, amount, text, weight, scalable });
      label(half(text));
    },
    bankrupt: (frac) => {
      b.bankruptFrac = Math.min(1, b.bankruptFrac + frac);
      label(half('BANKRUPT'));
    },
    nothing: (l) => label(half(l)),
    resolveAs: (kind, value, l) => {
      if (primary) b.resolvedKind = kind;
      const sub: Segment = { ...seg, kind, value, gild: kind === 'cash' || kind === 'jackpot' ? seg.gild : 0 };
      // The re-dispatched wedge reports through a sink that prefixes the reveal label.
      landSegment(host, b, sub, weight, false, (inner) => {
        const bare = inner.replace(/^½ /, '');
        label(half(bare.startsWith('$') || bare.startsWith('JACKPOT') ? `${l} ${bare.replace('JACKPOT ', '')}` : l));
      });
    },
    bestCashValue: () => host.bestCashValue(),
    mystery: () => {
      const m: MysteryCtx = { allowBankrupt: true, forceBankrupt: false };
      for (const a of host.active()) {
        const h = a.def.hooks.onMystery;
        if (h) h(host.hookCtx(a), m);
      }
      return m;
    },
  };
  WEDGES[seg.kind].land(ctx);
}

export function resolvePayout(host: PayoutHost, input: PayoutInput): PayoutResult {
  const run = host.run;
  const { seg } = input;
  const b = new Builder(seg, seg.kind, input.innerMult, input.spinNo, input.firstOfDeadline, !!input.neighbor);

  // ---- 1. Base -----------------------------------------------------------------------
  const labels: string[] = [];
  const push = (l: string) => labels.push(l);
  const w = input.neighbor ? 0.5 : 1;
  landSegment(host, b, seg, w, true, push);
  if (input.neighbor) landSegment(host, b, input.neighbor, 0.5, false, push);
  b.step('base', labels.join(' + ') || WEDGES[seg.kind].name.toUpperCase());

  // ---- 2. Inner ring (+ Boost) — cash only -------------------------------------------
  const boost = input.nested ? 0 : run.boost;
  if (!input.nested) run.boost = 0;
  if (b.isCash) {
    const m = input.innerMult + boost;
    b.cash *= m;
    b.step('mult', boost > 0 ? `${fmtMult(input.innerMult)}+${boost} BOOST` : fmtMult(input.innerMult), 'ring');
  }

  // ---- 3. Streak — cash only ---------------------------------------------------------
  if (b.isCash && b.cash > 0 && run.streak !== 1) {
    b.cash *= run.streak;
    b.step('mult', `${fmtMult(run.streak)} STREAK`, 'streak');
  }

  // ---- 4. Artifacts, slot order -------------------------------------------------------
  const bankruptOnly = b.bankruptFrac > 0 && !b.isCash && b.prizes.length === 0;
  for (const a of host.active()) {
    const ctx = host.hookCtx(a);
    b.curSlot = a.slot;
    if (b.isCash && a.def.hooks.onCashPaid) a.def.hooks.onCashPaid(ctx, b);
    if (((!b.isCash && !bankruptOnly) || b.prizes.length > 0) && a.def.hooks.onPrizeAwarded) a.def.hooks.onPrizeAwarded(ctx, b);
  }
  b.curSlot = undefined;

  // ---- 5. Combos ----------------------------------------------------------------------
  const combos: ComboId[] = [];
  let deadAir = false;
  if (!input.nested) {
    const prev = run.history[run.history.length - 1];
    const cashRunAfter = b.isCash ? run.cashRun + 1 : 0;
    const fire = (combo: ComboId, baseMult: number, onApply: (c: ComboCtx) => void) => {
      combos.push(combo);
      const ctx = comboCtx(b, combo, baseMult);
      for (const a of host.active()) {
        const h = a.def.hooks.onCombo;
        if (!h) continue;
        b.curSlot = a.slot;
        h(host.hookCtx(a), ctx);
      }
      b.curSlot = undefined;
      onApply(ctx);
    };

    if (input.neighbor) {
      fire('neighbors', 1, (c) => {
        if (c.comboMult !== 1 && b.cash > 0) {
          b.cash *= c.comboMult;
          b.step('combo', `NEIGHBORS ${fmtMult(c.comboMult)}`);
        } else b.step('combo', 'NEIGHBORS');
      });
    }
    if (isEcho(prev, seg.kind)) {
      const base = run.marks.echoTriple ? 3 : 2;
      fire('echo', base, (c) => {
        if (b.cash > 0) {
          b.cash *= c.comboMult;
          b.step('combo', `ECHO ${fmtMult(c.comboMult)}`);
        } else {
          // Prize ECHO: repeatable prizes are awarded again (comboMult−1 extra times).
          const extra = Math.max(1, Math.round(c.comboMult) - 1);
          const dupes: PrizeIntent[] = [];
          for (const p of b.prizes) if (WEDGES[p.kind]?.repeatable) for (let i = 0; i < extra; i++) dupes.push({ ...p });
          b.prizes.push(...dupes);
          b.step('combo', dupes.length ? `ECHO ×${extra + 1} PRIZE` : 'ECHO');
        }
      });
    }
    if (b.isCash && isHatTrick(cashRunAfter)) {
      fire('hatTrick', 1, (c) => {
        b.prizes.push({ kind: 'token', amount: 3, text: '+3 TOKENS', weight: 1 });
        if (c.comboMult !== 1 && b.cash > 0) {
          b.cash *= c.comboMult;
          b.step('combo', `HAT TRICK ${fmtMult(c.comboMult)} +3 TOK`);
        } else b.step('combo', 'HAT TRICK +3 TOK');
      });
    }
    run.cashRun = cashRunAfter;

    // Doubler: the next (non-Bankrupt) prize is awarded twice.
    if (run.flags.doubler > 0 && b.bankruptFrac === 0 && (b.cash > 0 || b.prizes.some((p) => p.kind !== 'doubler'))) {
      run.flags.doubler -= 1;
      if (b.cash > 0) b.cash *= 2;
      const dupes = b.prizes.filter((p) => p.kind !== 'doubler' && p.kind !== 'ringJump').map((p) => ({ ...p }));
      b.prizes.push(...dupes);
      b.step('combo', 'DOUBLER ×2');
    }
  }

  // ---- 6. Award -----------------------------------------------------------------------
  let cash = Math.max(0, Math.round(b.cash));
  let trayLost = 0;
  let blocked = false;
  let streakReset = false;
  if (b.bankruptFrac > 0) {
    if (run.flags.insurance > 0) {
      run.flags.insurance -= 1;
      blocked = true;
    } else if (run.flags.vaultKey > 0) {
      run.flags.vaultKey -= 1;
      blocked = true;
    }
    const bk: BankruptCtx = { tray: run.tray, lossFrac: b.bankruptFrac, keepFrac: 0, blocked };
    for (const a of host.active()) {
      const h = a.def.hooks.onBankrupt;
      if (h) h(host.hookCtx(a), bk);
    }
    if (!input.nested && isDeadAir(b.bankruptFrac, blocked, run.tray, run.debt)) {
      deadAir = true;
      combos.push('deadAir');
      const ctx = comboCtx(b, 'deadAir', 1);
      for (const a of host.active()) {
        const h = a.def.hooks.onCombo;
        if (!h) continue;
        b.curSlot = a.slot;
        h(host.hookCtx(a), ctx);
      }
      b.curSlot = undefined;
      b.step('combo', COMBO_NAMES.deadAir);
      cash = Math.max(0, Math.round(b.cash));
    }
    if (blocked) {
      b.step('note', 'BLOCKED!');
    } else {
      trayLost = Math.floor(run.tray * bk.lossFrac * (1 - bk.keepFrac));
      run.stats.bankrupts += 1;
      run.stats.trayAtBankrupt.push(run.tray);
      run.marks.lastBankruptLoss = trayLost;
      host.addTray(-trayLost, 'bankrupt');
      streakReset = true;
    }
  }
  if (cash > 0) {
    host.addTray(cash, 'payout');
    run.stats.cashEarned += cash;
    run.stats.biggestPayout = Math.max(run.stats.biggestPayout, cash);
  }
  if (seg.kind === 'jackpot' || b.resolvedKind === 'jackpot') run.stats.jackpots += 1;
  for (const p of b.prizes) {
    if (p.amount <= 0 && p.kind !== 'artifact' && p.kind !== 'ringJump' && p.kind !== 'doubler' && p.kind !== 'payday') continue;
    if (p.kind === 'tax' && run.marks.taxImmune) {
      host.note('TAX IMMUNE');
      continue;
    }
    const def = WEDGES[p.kind];
    if (def.apply) def.apply(host, p);
  }
  for (const c of combos) run.stats.combos[c] = (run.stats.combos[c] ?? 0) + 1;

  b.steps.push({ op: 'base', label: `= ${fmt(cash)}`, total: cash });
  const marquee = buildMarquee(b.steps, cash, b.isCash);
  return {
    steps: b.steps,
    marquee,
    cash,
    isCash: b.isCash,
    landedKind: seg.kind,
    resolvedKind: b.resolvedKind,
    prizes: b.prizes,
    combos,
    bankrupt: b.bankruptFrac > 0,
    bankruptBlocked: blocked,
    trayLost,
    deadAir,
    doubled: b.steps.some((s) => s.label === 'DOUBLER ×2'),
    streakReset,
  };
}

/** "$100 → ×2 → ×1.75 STREAK → +$40 → ECHO ×2 = $780" */
export function buildMarquee(steps: PayoutStep[], cash: number, isCash: boolean): string {
  const parts = steps.filter((s) => s.op !== 'base' || !s.label.startsWith('=')).map((s) => s.label);
  if (!isCash && cash === 0) return parts.join(' → ');
  return `${parts.join(' → ')} = ${fmt(cash)}`;
}

function comboCtx(b: Builder, combo: ComboId, baseMult: number): ComboCtx {
  return {
    get cash() {
      return b.cash;
    },
    isCash: b.isCash,
    seg: b.seg,
    landedKind: b.landedKind,
    innerMult: b.innerMult,
    spinNo: b.spinNo,
    firstOfDeadline: b.firstOfDeadline,
    neighbors: b.neighbors,
    prizes: b.prizes,
    mult: (x, l) => b.mult(x, l),
    add: (x, l) => b.add(x, l),
    prize: (k, a, t) => b.prize(k, a, t),
    combo,
    comboMult: baseMult,
  };
}
