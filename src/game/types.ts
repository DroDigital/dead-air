/**
 * Shared, serialisable types for the rules core. No DOM, no Three.js.
 */
import type { RngStreamStates } from '../core/rng';

export type WedgeKind =
  | 'cash'
  | 'respin'
  | 'token'
  | 'boost'
  | 'artifact'
  | 'bankrupt'
  | 'jackpot'
  | 'mystery'
  | 'dud'
  | 'tax'
  | 'splitter'
  | 'wild'
  | 'haunted'
  | 'cursedCash'
  | 'interest'
  | 'thief'
  | 'vaultKey'
  | 'overtime'
  | 'charge'
  | 'ringJump'
  | 'doubler'
  | 'scratch'
  | 'payday'
  | 'mouth'
  | 'cleaver'
  | 'stump'
  | 'bleeder'
  | 'eye'
  | 'stitches'
  | 'crossroads'
  | 'angel'
  | 'gun';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'cursed';

/** A wedge on the wheel ("a card in the deck"). */
export interface Wedge {
  uid: number;
  kind: WedgeKind;
  /** Base cash value for cash-like wedges; ignored otherwise. */
  value: number;
  /** Nominal width in degrees. The layout normalises all widths to 360°. */
  width: number;
  /** Number of times gilded (+50% value each). */
  gild: number;
  /** Permanent flat bonus (e.g. Hot Hand). */
  bonus: number;
  /** Splitter only: the two halves. */
  halves?: [HalfWedge, HalfWedge];
}

export interface HalfWedge {
  kind: WedgeKind;
  value: number;
}

/** One landable arc on the wheel after layout (a splitter yields two). */
export interface Segment {
  idx: number;
  wedgeIdx: number;
  /** -1 for a whole wedge, 0/1 for a splitter half. */
  half: -1 | 0 | 1;
  uid: number;
  kind: WedgeKind;
  value: number;
  gild: number;
  bonus: number;
  start: number;
  end: number;
  /** True if this segment's kind was temporarily overridden (Marathon, Static…). */
  overridden: boolean;
}

export interface Layout {
  segments: Segment[];
  /** Local angles (deg, ascending, [0,360)) of each peg = segment start. */
  pegs: number[];
}

export type PackageId = 'short' | 'standard' | 'marathon';

export interface ArtifactInstance {
  uid: number;
  id: string;
  /** Free-form per-instance state (counters, once-per-deadline flags). */
  state: Record<string, number>;
}

export type ComboId = 'echo' | 'hatTrick' | 'neighbors' | 'deadAir';

export interface PayoutStep {
  op: 'base' | 'mult' | 'add' | 'combo' | 'note';
  label: string;
  /** Running cash total after this step (for marquee display). */
  total: number;
  /** Artifact slot that produced it, if any. */
  slot?: number;
  source?: string;
}

/** A visible artifact trigger (jiggle + floating text). */
export interface Trigger {
  slot: number;
  artifactId: string;
  text: string;
}

export interface PrizeAward {
  kind: WedgeKind | 'combo' | 'artifact-effect';
  text: string;
}

export type SupernaturalOption = 'fortune' | 'time' | 'power' | 'grace' | 'mercy' | 'radiance';

export type PendingChoice =
  | { type: 'supernatural'; source: 'pact' | 'blessing'; options: SupernaturalOption[] }
  | { type: 'artifactPick'; options: string[]; source: string }
  | { type: 'nudge'; options: number[] }
  | { type: 'wedgeReplace'; wedge: Wedge; cost: number; source: string };

export interface SpinRecord {
  kind: WedgeKind;
  uid: number;
  segIdx: number;
  wasCash: boolean;
  cash: number;
  innerMult: number;
}

export interface ShopItem {
  slot: number;
  type: 'artifact' | 'wedge' | 'scratch';
  id: string;
  /** For wedges: the instance to insert. */
  wedge?: Wedge;
  cost: number;
  sold: boolean;
}

export interface ShopState {
  items: ShopItem[];
  rerolls: number;
  rerollCost: number;
  freeRerolls: number;
  crank: number;
}

export interface PhoneOffer {
  bargainId: string;
  /** Pre-rolled parameters (e.g., chosen artifact) so the offer is stable on reload. */
  params: Record<string, string | number>;
}

export type PhoneReason = 'deadline' | 'deadAir' | 'secret' | 'collateral';

export interface PhoneState {
  reason: PhoneReason;
  offers: PhoneOffer[];
  /** Phase to return to after the call. */
  returnTo: RunPhase;
  intro: string;
}

export type RunPhase =
  | 'PackageSelect'
  | 'AwaitAction'
  | 'Nudge'
  | 'ArtifactPick'
  | 'SupernaturalChoice'
  | 'WedgeReplace'
  | 'Conversion'
  | 'Shop'
  | 'PhoneCall'
  | 'GameOver'
  | 'Victory';

export interface PendingSpin {
  outerIndex: number;
  innerIndex: number;
  boundaryDist: number;
  neighborIndex: number;
  power: number;
  spinNo: number;
  free: boolean;
}

export interface RunFlags {
  vaultKey: number;
  insurance: number;
  doubler: number;
  lock: boolean;
  peek: number;
  freeze: boolean;
  nudge: boolean;
  staticBurst: boolean;
  safeDeposit: boolean;
  trapdoorUsed: boolean;
}

export interface TempOverride {
  uid: number;
  half: -1 | 0 | 1;
  kind: WedgeKind;
  value: number;
  scope: 'deadline' | 'spin';
  reason: string;
}

export interface RunStats {
  spins: number;
  bankrupts: number;
  trayAtBankrupt: number[];
  maxTray: number;
  maxStreak: number;
  deposits: number;
  jackpots: number;
  combos: Record<ComboId, number>;
  cashEarned: number;
  tokensEarned: number;
  artifactsBought: string[];
  bargainsTaken: string[];
  phoneCalls: number;
  hungUp: number;
  biggestPayout: number;
}

export interface NextDeadlineMods {
  spinsDelta: number;
  debtMult: number;
}

export interface DeadlineRecord {
  deadline: number;
  debt: number;
  paid: boolean;
  vaultAfter: number;
  pkg: PackageId | null;
}

export interface RunConfig {
  seed: string;
  stake: number;
  startWheel: string;
  endless?: boolean;
  /** Content ids unlocked by meta progression (if omitted: everything). */
  unlockedArtifacts?: string[];
  unlockedWedges?: WedgeKind[];
}

export interface RunState {
  v: number;
  seed: string;
  rng: RngStreamStates;
  stake: number;
  startWheel: string;
  endless: boolean;
  unlockedArtifacts: string[] | null;
  unlockedWedges: WedgeKind[] | null;
  phase: RunPhase;
  deadline: number;
  debt: number;
  mutator: string | null;
  pkg: PackageId | null;
  spinsLeft: number;
  spinsThisDeadline: number;
  tray: number;
  vault: number;
  tokens: number;
  streak: number;
  boost: number;
  wheel: Wedge[];
  ring: number[];
  wheelAngle: number;
  ringAngle: number;
  nextUid: number;
  artifacts: ArtifactInstance[];
  scratch: string[];
  flags: RunFlags;
  overrides: TempOverride[];
  history: SpinRecord[];
  cashRun: number;
  pending: PendingChoice | null;
  /** Queue of pending choices that follow the current one. */
  pendingQueue: PendingChoice[];
  shop: ShopState | null;
  phone: PhoneState | null;
  stats: RunStats;
  deadlines: DeadlineRecord[];
  nextMods: NextDeadlineMods;
  /** Free-form persistent run flags (secret line, bargain bookkeeping). */
  marks: Record<string, number>;
  victoryShown: boolean;
  /** Phase to return to once pending choices / calls are resolved. */
  resume: RunPhase;
  /** A spin that has stopped but not yet resolved (Nudge). */
  pendingSpin: PendingSpin | null;
  /** The deadline number at which the run ended, if ended. */
  endedAt: number | null;
}

/** Horror beats the stage acts out (wedge models, the collateral cutscene, the audience). */
export type HorrorEvent =
  | { type: 'gunshot'; hit: boolean; nested: boolean; afterJump: boolean }
  | { type: 'mouthEat'; uid: number; amount: number }
  | { type: 'mouthVomit'; uid: number; amount: number }
  | { type: 'cleave'; uid: number; target: number }
  | { type: 'bleed'; amount: number }
  | { type: 'eyeOpen'; uid: number }
  | { type: 'eyeShut'; uid: number }
  | { type: 'stitchStrain'; uid: number; wear: number }
  | { type: 'stitchTear'; uid: number }
  | { type: 'collateral'; part: 'finger' | 'eye' }
  | { type: 'silence'; count: number };
