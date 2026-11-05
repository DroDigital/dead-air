/**
 * Headless bot policies for the balance simulator. Bots only use the public Game API —
 * the same actions a player has — and real wheel physics.
 */
import { artifactDef } from '../src/content/artifacts';
import { bargainDef } from '../src/content/bargains';
import { scratchDef } from '../src/content/scratchCards';
import { WEDGES } from '../src/content/wedges';
import { BALANCE } from '../src/game/balance';
import type { Game } from '../src/game/run';
import type { PackageId, Segment } from '../src/game/types';

export type DepositRule = 'every' | 'rideN' | 'ev';

export interface Policy {
  name: string;
  deposit: DepositRule;
  rideN?: number;
  /** EV bot risk factor (>1 = more cautious). */
  caution?: number;
  shop: boolean;
  convertFrac: number;
  pkg: PackageId | 'auto';
}

export const POLICIES: Record<string, Policy> = {
  'deposit-every-spin': { name: 'deposit-every-spin', deposit: 'every', shop: true, convertFrac: 0.5, pkg: 'standard' },
  'ride-to-3': { name: 'ride-to-3', deposit: 'rideN', rideN: 3, shop: true, convertFrac: 0.5, pkg: 'standard' },
  'ride-to-5': { name: 'ride-to-5', deposit: 'rideN', rideN: 5, shop: true, convertFrac: 0.5, pkg: 'standard' },
  ev: { name: 'ev', deposit: 'ev', caution: 1, shop: true, convertFrac: 0.5, pkg: 'auto' },
  'ev-noshop': { name: 'ev-noshop', deposit: 'ev', caution: 1, shop: false, convertFrac: 0, pkg: 'standard' },
};

// ---------------------------------------------------------------------------------------
// Wheel statistics from the current layout
// ---------------------------------------------------------------------------------------
interface WheelStats {
  pBankrupt: number;
  expCash: number;
  ringMean: number;
}

function wheelStats(g: Game): WheelStats {
  const L = g.layout();
  const ring = g.effectiveRing();
  const ringMean = ring.reduce((a, b) => a + b, 0) / ring.length + g.run.boost;
  let pB = 0;
  let cash = 0;
  const best = g.bestCashValue();
  for (const s of L.segments) {
    const p = (s.end - s.start) / 360;
    if (s.kind === 'bankrupt') pB += p;
    if (s.kind === 'mystery') pB += p * (g.has('black_cat') ? 1 : g.has('lint_roller') ? 0 : 0.25);
    if (s.kind === 'haunted') pB += p * 0.13;
    if (s.kind === 'cash' || s.kind === 'cursedCash' || s.kind === 'jackpot') cash += p * g.cashValueOf(s);
    if (s.kind === 'wild') cash += p * best;
    if (s.kind === 'mystery') cash += p * 0.22 * 300;
  }
  if (g.run.flags.vaultKey + g.run.flags.insurance > 0) pB = 0;
  if (g.has('hollow_tooth')) pB *= 0.5;
  return { pBankrupt: pB, expCash: cash * ringMean, ringMean };
}

// ---------------------------------------------------------------------------------------
// Artifact / wedge valuation (simple heuristics)
// ---------------------------------------------------------------------------------------
const ARTIFACT_SCORE: Record<string, number> = {
  lucky_penny: 7,
  piggy_bank: 6,
  tooth_fairy: 4,
  house_edge: 4,
  rubber_band: 3,
  coffee_ring: 3,
  pocket_lint: 3,
  bent_nail: 6,
  cue_card: 8,
  tip_jar: 4,
  spare_bulb: 4,
  lucky_sock: 4,
  lint_roller: 5,
  hollow_tooth: 9,
  snake_eyes: 8,
  neighbors_envy: 8,
  iron_nerve: 6,
  hot_hand: 7,
  gilded_clapper: 6,
  loaded_flapper: 7,
  metronome: 8,
  applause_sign: 5,
  tv_dinner: 6,
  velvet_rope: 5,
  horseshoe_magnet: 8,
  receipt: 5,
  ventriloquist: 4,
  pawn_ticket: 2,
  understudy: 7,
  static: 6,
  cracked_mirror: 6,
  second_ring: 9,
  golden_mic: 6,
  trapdoor_lever: 7,
  laugh_track: 8,
  producers_pen: 6,
  crystal_tube: 5,
  rabbit_ears: 8,
  missing_letter: 8,
  rabbits_foot: 7,
  collectors_card: 8,
  monkey_paw: 8,
  black_cat: 5,
  ouija_board: 4,
  mannequin_hand: 6,
  cracked_vhs: 5,
  dead_mans_watch: 6,
  severance_check: 5,
};

export function artifactScore(id: string): number {
  return ARTIFACT_SCORE[id] ?? 4;
}

/** Value of a wedge for "which one should I replace / remove" decisions (lower = worse). */
function wedgeWorth(g: Game, s: Segment): number {
  switch (s.kind) {
    case 'bankrupt':
      return -300;
    case 'tax':
      return -g.run.vault * 0.1 - 20;
    case 'dud':
      return 0;
    case 'cash':
    case 'cursedCash':
    case 'jackpot':
      return g.cashValueOf(s) * 1.3;
    case 'wild':
      return g.bestCashValue() * 1.3;
    case 'token':
      return 90;
    case 'respin':
    case 'overtime':
      return 110;
    case 'boost':
    case 'charge':
      return 80;
    case 'mystery':
      return 40;
    default:
      return 60;
  }
}

// ---------------------------------------------------------------------------------------
// The bot
// ---------------------------------------------------------------------------------------
export class Bot {
  private ridden = 0;
  constructor(readonly policy: Policy) {}

  shouldDeposit(g: Game): boolean {
    const r = g.run;
    if (r.tray <= 0) return false;
    const p = this.policy;
    if (p.deposit === 'every') return true;
    if (p.deposit === 'rideN') return this.ridden >= (p.rideN ?? 3) || r.spinsLeft <= 0;
    // EV rule.
    const ws = wheelStats(g);
    const left = r.spinsLeft;
    if (left <= 0) return true;
    const secure = r.vault < r.debt && r.vault + r.tray >= r.debt;
    const needed = r.debt - r.vault;
    // Expected benefit of keeping the streak alive for the remaining spins.
    const k = Math.min(left, 3);
    const gain = ws.expCash * (r.streak - g.streakBase() + g.streakStep()) * k;
    const loss = ws.pBankrupt * r.tray * (p.caution ?? 1);
    if (secure && left <= 3) return true;
    if (needed > 0 && r.tray > needed * 1.2 && ws.pBankrupt > 0.05) return true;
    return loss > gain;
  }

  /** Perform one decision. Returns false when the run is over. */
  step(g: Game): boolean {
    const r = g.run;
    switch (r.phase) {
      case 'GameOver':
        return false;
      case 'Victory':
        return false;
      case 'PackageSelect': {
        let pkg: PackageId = this.policy.pkg === 'auto' ? 'standard' : this.policy.pkg;
        if (this.policy.pkg === 'auto') {
          const ws = wheelStats(g);
          const need = r.debt - r.vault;
          const per = ws.expCash * 1.6;
          if (need > per * g.spinsForPackage('standard') * 1.1) pkg = 'marathon';
          else if (need <= 0) pkg = 'short';
        }
        g.choosePackage(pkg);
        this.ridden = 0;
        return true;
      }
      case 'AwaitAction': {
        // Scratch cards: use when sensible.
        for (let i = r.scratch.length - 1; i >= 0; i--) {
          const id = r.scratch[i];
          if (!g.canUseScratch(i)) continue;
          const d = scratchDef(id);
          const useful =
            id === 'insurance' ? r.tray > 200 : id === 'hot_streak' || id === 'freeze' || id === 'polish' || id === 'lucky_coin' || id === 'rebate' || id === 'static_burst' ? true : id === 'safe_deposit' ? r.streak > 1.5 : false;
          if (useful && d) g.useScratch(i);
        }
        if (this.shouldDeposit(g)) {
          g.deposit();
          this.ridden = 0;
          return true;
        }
        if (r.spinsLeft <= 0) return true;
        g.spin();
        this.ridden++;
        if (g.run.streak <= g.streakBase()) this.ridden = 0;
        return true;
      }
      case 'Nudge': {
        const ps = r.pendingSpin!;
        const L = g.layout();
        const n = L.segments.length;
        const opts = [-1, 0, 1] as const;
        let best: -1 | 0 | 1 = 0,
          bv = -Infinity;
        for (const d of opts) {
          const v = wedgeWorth(g, L.segments[(ps.outerIndex + d + n) % n]);
          if (v > bv) {
            bv = v;
            best = d;
          }
        }
        g.chooseNudge(best);
        return true;
      }
      case 'ArtifactPick': {
        const p = r.pending;
        if (p?.type !== 'artifactPick') return true;
        const ranked = [...p.options].sort((a, b) => artifactScore(b) - artifactScore(a));
        if (r.artifacts.length >= BALANCE.maxArtifacts) {
          const worst = r.artifacts.map((a, i) => ({ i, s: artifactScore(a.id) })).sort((a, b) => a.s - b.s)[0];
          if (artifactScore(ranked[0]) > worst.s + 1) g.pickArtifact(ranked[0], worst.i);
          else g.pickArtifact(null);
        } else g.pickArtifact(ranked[0]);
        return true;
      }
      case 'Conversion': {
        const surplus = r.vault;
        g.convert(Math.floor((surplus * this.policy.convertFrac) / BALANCE.tokenRate));
        return true;
      }
      case 'Shop':
        if (this.policy.shop) this.shop(g);
        if (g.run.phase === 'Shop') g.leaveShop();
        return true;
      case 'WedgeReplace':
        g.replaceWedge(null);
        return true;
      case 'PhoneCall': {
        const ph = r.phone!;
        const good = new Set([
          'cash_for_bankrupt',
          'purge_duds',
          'tokens_for_tax',
          'gild_all',
          'spins_for_debt',
          'double_vault',
          'raise_all_cash',
          'remove_bankrupt_zero',
          'vault_key_debt',
          'deadair_refund',
          'deadair_spins',
          'deadair_tokens',
          'secret_trapdoor',
          'secret_truth',
          'buy_spins',
          'cursed_gift',
          'rare_for_debt',
          'insurance_policy',
        ]);
        const idx = ph.offers.findIndex((o) => good.has(o.bargainId) && (!bargainDef(o.bargainId).available || bargainDef(o.bargainId).available!(r)));
        if (idx >= 0) g.phoneAccept(idx);
        else g.phoneHangUp();
        return true;
      }
    }
    return true;
  }

  private shop(g: Game): void {
    const r = g.run;
    for (let guard = 0; guard < 12; guard++) {
      const shop = r.shop;
      if (!shop) return;
      // 1. Remove a Bankrupt if affordable.
      const bkIdx = r.wheel.findIndex((w) => w.kind === 'bankrupt');
      if (BALANCE.bankruptRemovable && bkIdx >= 0 && r.tokens >= g.serviceCost('remove') + 1 && g.shopRemove(bkIdx).ok) continue;
      // 2. Best affordable artifact.
      const arts = shop.items.filter((i) => i.type === 'artifact' && !i.sold && i.cost <= r.tokens).sort((a, b) => artifactScore(b.id) - artifactScore(a.id));
      if (arts.length && r.artifacts.length < BALANCE.maxArtifacts && artifactScore(arts[0].id) >= 5) {
        g.shopBuy(arts[0].slot);
        continue;
      }
      // 3. A good wedge replacing the worst wedge.
      const L = g.layout();
      const worstSeg = [...L.segments].filter((x) => x.kind !== 'bankrupt').sort((a, b) => wedgeWorth(g, a) - wedgeWorth(g, b))[0];
      const wedges = shop.items.filter((i) => i.type === 'wedge' && !i.sold && i.cost <= r.tokens);
      let bought = false;
      for (const it of wedges) {
        const w = it.wedge!;
        const val = w.kind === 'cash' || w.kind === 'cursedCash' ? w.value * 1.3 : WEDGES[w.kind].cashLike ? 200 : 100;
        if (val > wedgeWorth(g, worstSeg) + 60 && w.kind !== 'cursedCash') {
          g.shopBuy(it.slot);
          if (r.phase === 'WedgeReplace' && !g.replaceWedge(worstSeg.wedgeIdx).ok) g.replaceWedge(null);
          bought = true;
          break;
        }
      }
      if (bought) continue;
      // 4. Gild the best cash wedge.
      if (r.tokens >= g.serviceCost('gild') + 2) {
        const cashIdx = r.wheel.map((w, i) => ({ w, i })).filter((x) => x.w.kind === 'cash' && x.w.gild < BALANCE.maxGild).sort((a, b) => b.w.value * (1 + b.w.gild) - a.w.value * (1 + a.w.gild))[0];
        if (cashIdx && g.shopGild(cashIdx.i).ok) continue;
      }
      // 5. Narrow the remaining bankrupts.
      const bk2 = r.wheel.findIndex((w) => w.kind === 'bankrupt' && w.width > 5);
      if (bk2 >= 0 && r.tokens >= g.serviceCost('resize') + 3 && g.shopResize(bk2, -1).ok) continue;
      // 6. Cheap reroll if rich.
      if (r.tokens >= 10 && shop.rerolls < 2) {
        g.shopReroll();
        continue;
      }
      break;
    }
    void artifactDef;
  }
}
