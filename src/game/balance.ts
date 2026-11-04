/**
 * Every tunable number lives here. The simulator (npm run sim) is used to tune these;
 * results are logged in BALANCE.md. Values fixed by the design brief are marked [BRIEF].
 */

export const BALANCE = {
  // ---- Debt ---------------------------------------------------------------------------
  debtBase: 450, // [BRIEF]
  debtGrowth: 1.7, // [BRIEF]
  deadlinesPerRun: 8, // [BRIEF]
  sweepDeadlines: [4, 8] as readonly number[], // [BRIEF]
  /** Endless: a Sweep every Nth deadline after 8. */
  endlessSweepEvery: 2,

  // ---- Packages [BRIEF] ---------------------------------------------------------------
  packages: {
    short: { spins: 6, tokens: 4, marathonBankrupt: false },
    standard: { spins: 8, tokens: 2, marathonBankrupt: false },
    marathon: { spins: 11, tokens: 0, marathonBankrupt: true },
  },

  // ---- Streak / Tray ------------------------------------------------------------------
  streakStart: 1.0, // [BRIEF]
  streakStep: 0.25, // [BRIEF]

  // ---- Economy ------------------------------------------------------------------------
  startTokens: 2,
  /** A small float so Deadline 1 is survivable (tuned: EV bot D1 ≥ 95%). */
  startVault: 200,
  tokenRate: 50, // $ per token on conversion [BRIEF]
  interestRate: 0.1, // [BRIEF]
  /** Interest cap grows with the deadline you just paid. */
  interestCap: (deadline: number): number => 30 + 20 * deadline,
  taxRate: 0.1, // [BRIEF]
  jackpotValue: 1000, // [BRIEF]
  cursedCashValue: 600, // [BRIEF]
  interestWedgeRate: 0.05, // [BRIEF]
  thiefRate: 0.2, // [BRIEF]
  gildMult: 0.5, // +50% per gild [BRIEF]
  houseEdgeRespinCash: 25, // [BRIEF]

  // ---- Wheel geometry -----------------------------------------------------------------
  baseWidth: 15,
  jackpotWidth: 6, // [BRIEF]
  minWidth: 3,
  maxWidth: 60,
  widenStep: 5, // [BRIEF]
  neighborsThreshold: 2, // degrees [BRIEF]

  // ---- Lever / physics bias -------------------------------------------------------------
  meterPeriod: 1.5,
  sweetCenter: 0.76,
  sweetHalfWidth: 0.055,
  sweetBias: 1.0,

  // ---- Shop ---------------------------------------------------------------------------
  /** Added to every artifact's listed cost in the Prize Cabinet. */
  artifactPriceAdd: 3,
  rarityWeights: { common: 50, uncommon: 30, rare: 12, cursed: 10 } as Record<string, number>,
  wedgeCostBase: 3,
  scratchCost: 2,
  removeCost: 3,
  /** Each Remove costs this much more than the last (per run). */
  removeEscalation: 2,
  /** Bankrupt wedges are Network property: they cannot be Removed or overwritten in the Cabinet. */
  bankruptRemovable: false,
  /** A wedge can be gilded at most this many times. */
  maxGild: 2,
  /** Double or Nothing: minimum Tray to stake, once per Deadline, even odds (EV-neutral). */
  gambleMin: 300,
  /** Narrowing cannot take a Bankrupt below this nominal width. */
  bankruptMinWidth: 10,
  gildCost: 3,
  gildEscalation: 2,
  resizeCost: 3,
  rerollBase: 1, // [BRIEF]
  rerollStep: 1, // [BRIEF]
  shopArtifacts: 3, // [BRIEF]
  shopWedges: 2, // [BRIEF]
  shopScratch: 1, // [BRIEF]
  sellFraction: 0.5, // [BRIEF]
  maxArtifacts: 6, // [BRIEF]
  maxScratch: 3, // [BRIEF]

  // ---- Phone --------------------------------------------------------------------------
  phoneChanceByDeadline: [0, 0.35, 0.6, 0.45, 0.6, 0.65, 0.7, 0, 0.6] as readonly number[],
  phoneGuaranteed: [3, 6] as readonly number[],

  // ---- Stakes -------------------------------------------------------------------------
  stakeDebtMult: [1, 1.15, 1.3, 1.3] as readonly number[],
  stakeExtraBankrupt: [0, 0, 1, 1] as readonly number[],
  stakeShopMarkup: [0, 0, 0, 1] as readonly number[],

  // ---- Meta ---------------------------------------------------------------------------
  ratingsPerDeadline: 10,
  ratingsWinBonus: 60,
  ratingsStakeMult: [1, 1.25, 1.5, 2] as readonly number[],
};

export type Balance = typeof BALANCE;

export function round50(x: number): number {
  return Math.round(x / 50) * 50;
}

/** Debt(d) = round50(450 × 1.7^(d−1)) [BRIEF], before stake/artifact modifiers. */
export function baseDebt(deadline: number): number {
  return round50(BALANCE.debtBase * Math.pow(BALANCE.debtGrowth, deadline - 1));
}
