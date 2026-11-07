/**
 * Hook pipeline: typed contexts that content (wedges, artifacts, cards, bargains) uses to
 * act on the run. Artifact hooks run strictly in shelf-slot order, left to right.
 */
import type { RngStreams } from '../core/rng';
import type { WidthMods, PhysicsMods } from './wheel';
import type {
  HorrorEvent,
  Layout,
  Wedge,
  ArtifactInstance,
  ComboId,
  PackageId,
  Rarity,
  RunState,
  Segment,
  Trigger,
  WedgeKind,
} from './types';

// ---------------------------------------------------------------------------------------
// Game operations exposed to content (implemented by Game in run.ts)
// ---------------------------------------------------------------------------------------
export interface GameOps {
  readonly run: RunState;
  readonly rng: RngStreams;
  addTokens(n: number, why: string): void;
  addSpins(n: number, why: string): void;
  addVault(n: number, why: string): void;
  addTray(n: number, why: string): void;
  addBoost(n: number): void;
  addStreak(n: number): void;
  addScratch(id?: string): boolean;
  queueArtifactPick(source: string, count?: number, rarity?: Rarity): void;
  grantArtifact(id: string): boolean;
  /** Replace the kind of a wedge (by uid). */
  setWedgeKind(uid: number, kind: WedgeKind, value?: number): void;
  /** Add a brand new wedge by replacing a random wedge matching `pred` (or any). */
  insertWedgeRandom(kind: WedgeKind, value: number, pred?: (k: WedgeKind) => boolean): number | null;
  removeKind(kind: WedgeKind, replaceWith: WedgeKind, count?: number): number;
  randomArtifactId(rarity?: Rarity, exclude?: string[]): string | null;
  ringJump(): void;
  note(text: string): void;
  layout(): Layout;
  recomputeDebt(): void;
  cashValueOf(seg: Segment): number;
  wedgeByUid(uid: number): Wedge | undefined;
  /** Tell the stage about a horror beat (presented with the spin's result). */
  horror(e: HorrorEvent): void;
}

// ---------------------------------------------------------------------------------------
// Artifact hook contexts
// ---------------------------------------------------------------------------------------
export interface HookCtx {
  ops: GameOps;
  run: RunState;
  rng: RngStreams;
  slot: number;
  inst: ArtifactInstance;
  /** The *effective* definition (for The Understudy: the copied artifact). */
  def: ArtifactDef;
  trigger(text: string): void;
}

/** The physics a spin runs with. Artifacts (Loaded Flapper) reshape it through `onSpinCharge`. */
export interface ChargeCtx {
  physics: PhysicsMods;
  segments: Segment[];
  /** Glass Eye or Peek permits a live landing preview. */
  preview: boolean;
}

export interface PayoutApi {
  readonly cash: number;
  readonly isCash: boolean;
  readonly seg: Segment;
  readonly landedKind: WedgeKind;
  readonly innerMult: number;
  readonly spinNo: number;
  readonly firstOfDeadline: boolean;
  readonly neighbors: boolean;
  readonly prizes: PrizeIntent[];
  mult(x: number, label: string): void;
  add(x: number, label: string): void;
  prize(kind: WedgeKind, amount: number, text: string): void;
}

export interface PrizeIntent {
  kind: WedgeKind;
  amount: number;
  text: string;
  /** Source weight (0.5 for a NEIGHBORS half). */
  weight: number;
  /** Tokens/etc that the streak multiplier may also scale (Crystal Tube). */
  scalable?: boolean;
}

export interface ComboCtx extends PayoutApi {
  combo: ComboId;
  /** Multiplier the combo will apply to cash (mutable — Snake Eyes). */
  comboMult: number;
}

export interface DepositCtx {
  amount: number;
  auto: boolean;
  keepStreak: boolean;
  /** Fraction of the Tray lost on the way (Ouija Board / Mannequin Hand). */
  lossFrac: number;
  bonusVault: number;
  firstThisDeadline: boolean;
}

export interface BankruptCtx {
  tray: number;
  /** Fraction of the Tray that will be lost (1 = everything). */
  lossFrac: number;
  /** Fraction of the loss refunded (Hollow Tooth). */
  keepFrac: number;
  blocked: boolean;
}

export interface SpinResolvedCtx {
  seg: Segment;
  landedKind: WedgeKind;
  cash: number;
  bankrupt: boolean;
  combos: ComboId[];
  spinNo: number;
}

export interface DeadlineEndCtx {
  debt: number;
  vault: number;
  paid: boolean;
  surplus: number;
}

export interface ShopCtx {
  /** Additional free rerolls granted. */
  freeRerolls: number;
  discount: number;
}

export interface MysteryCtx {
  allowBankrupt: boolean;
  forceBankrupt: boolean;
}

export interface ArtifactHooks {
  onAcquire?(c: HookCtx): void;
  onRemove?(c: HookCtx): void;
  onRunStart?(c: HookCtx): void;
  onDeadlineStart?(c: HookCtx): void;
  onPackageChosen?(c: HookCtx, e: { pkg: PackageId; spins: number }): void;
  onSpinCharge?(c: HookCtx, e: ChargeCtx): void;
  onCashPaid?(c: HookCtx, e: PayoutApi): void;
  onPrizeAwarded?(c: HookCtx, e: PayoutApi): void;
  onCombo?(c: HookCtx, e: ComboCtx): void;
  onDeposit?(c: HookCtx, e: DepositCtx): void;
  onBankrupt?(c: HookCtx, e: BankruptCtx): void;
  onSpinResolved?(c: HookCtx, e: SpinResolvedCtx): void;
  onDeadlineEnd?(c: HookCtx, e: DeadlineEndCtx): void;
  onShopOpen?(c: HookCtx, e: ShopCtx): void;
  onMystery?(c: HookCtx, e: MysteryCtx): void;
  /** Return true to prevent Game Over once (consumes itself). */
  onMissedPayment?(c: HookCtx, e: DeadlineEndCtx): boolean;
}

export interface ArtifactStatics {
  widthMods?(m: WidthMods, run: RunState): void;
  ringMod?(ring: number[], run: RunState): number[];
  debtMult?: number;
  spinsPerDeadline?: number;
  streakStepAdd?: number;
  sellMult?: number;
  /** Multiplies the value of every cash wedge before any pipeline step. */
  cashBaseMult?: number;
}

export interface ArtifactDef {
  id: string;
  name: string;
  rarity: Rarity;
  cost: number;
  text: string;
  flavor: string;
  /** Procedural prop shape id used by the renderer. */
  prop: string;
  color: number;
  /** Not offered until unlocked by Ratings (meta). */
  locked?: boolean;
  hooks: ArtifactHooks;
  statics?: ArtifactStatics;
}

export type HookName = keyof ArtifactHooks;

export interface ActiveArtifact {
  slot: number;
  inst: ArtifactInstance;
  def: ArtifactDef;
  /** The id of the artifact physically in this slot (differs for Understudy). */
  physicalId: string;
}

export type TriggerSink = (t: Trigger) => void;

// ---------------------------------------------------------------------------------------
// Wedge landing contexts (used by content/wedges.ts)
// ---------------------------------------------------------------------------------------
export interface LandCtx {
  ops: GameOps;
  run: RunState;
  rng: RngStreams;
  seg: Segment;
  /** 1 for a direct landing, 0.5 for each half of a NEIGHBORS split. */
  weight: number;
  /** Cash value of a segment incl. gild and bonus. */
  cashValue(seg: Segment): number;
  cash(amount: number, label: string): void;
  prize(kind: WedgeKind, amount: number, text: string, scalable?: boolean): void;
  bankrupt(frac: number): void;
  nothing(label: string): void;
  /** Re-dispatch as another kind (Mystery, Haunted, Wild); `weightMult` scales it (Stitches). */
  resolveAs(kind: WedgeKind, value: number, label: string, weightMult?: number): void;
  bestCashValue(): number;
  mystery(): MysteryCtx;
}

export type PatternId = 'solid' | 'stripes' | 'dots' | 'checker' | 'zigzag' | 'cross' | 'rings' | 'grid' | 'diag';

export interface WedgeDef {
  kind: WedgeKind;
  name: string;
  /** ≤ 8 chars, drawn on the wedge. */
  glyph: string;
  text: string;
  rarity: Rarity | 'starter';
  cost: number;
  /** Can appear in the Prize Cabinet. */
  shop: boolean;
  cashLike: boolean;
  gildable: boolean;
  defaultValue: number;
  color: number;
  ink: number;
  pattern: PatternId;
  /** ECHO repeats this prize. */
  repeatable: boolean;
  locked?: boolean;
  land(l: LandCtx): void;
  apply?(ops: GameOps, intent: PrizeIntent): void;
}
