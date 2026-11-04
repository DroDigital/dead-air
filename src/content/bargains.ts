/**
 * The Phone — devil's bargains offered by The Producer.
 *
 * Tiers:
 *  - normal:  offered when the phone rings between Deadlines.
 *  - deadAir: offered on a DEAD AIR (Bankrupt while the Tray held more than the Debt).
 *  - secret:  "The Other Line". Unlocked by hanging up on The Producer three times in one
 *             run; the next call comes from the Previous Contestant instead.
 */
import { BALANCE } from '../game/balance';
import type { GameOps } from '../game/hooks';
import type { Rarity, RunState } from '../game/types';

export type BargainTier = 'normal' | 'deadAir' | 'secret';

export interface BargainDef {
  id: string;
  tier: BargainTier;
  /** What the caller says. */
  line: string;
  /** The deal, plainly. {x} placeholders are filled from params. */
  deal: string;
  weight: number;
  available?(run: RunState): boolean;
  roll?(ops: GameOps): Record<string, string | number>;
  apply(ops: GameOps, params: Record<string, string | number>): void;
}

/** "This Debt": the current one during a DEAD AIR call, else the next one. */
function debtUp(ops: GameOps, mult: number): void {
  if (ops.run.phase === 'PhoneCall' && ops.run.phone?.reason === 'deadAir') {
    ops.run.marks.curDebtMult = (ops.run.marks.curDebtMult ?? 1) * mult;
    ops.recomputeDebt();
  } else {
    ops.run.nextMods.debtMult *= mult;
  }
}


function rollArtifact(ops: GameOps, rarity: Rarity): Record<string, string | number> {
  const id = ops.randomArtifactId(rarity, ops.run.artifacts.map((a) => a.id));
  return { artifact: id ?? '' };
}

export const BARGAINS: readonly BargainDef[] = [
  // ------------------------------------------------------------------------ NORMAL --
  {
    id: 'cash_for_bankrupt',
    tier: 'normal',
    line: 'Eight hundred dollars, friend. All I need is one more little black slice on that wheel.',
    deal: '+$800 in the Vault. Add a Bankrupt wedge.',
    weight: 10,
    apply: (ops) => {
      ops.addVault(800, 'bargain');
      ops.insertWedgeRandom('bankrupt', 0, (k) => k === 'dud' || k === 'cash');
    },
  },
  {
    id: 'purge_duds',
    tier: 'normal',
    line: "Those Duds are embarrassing us on air. The paint crew works slow, so you'll lose a little time.",
    deal: 'Every Dud becomes $75 Cash. −2 spins next Deadline.',
    weight: 8,
    available: (r) => r.wheel.some((w) => w.kind === 'dud'),
    apply: (ops) => {
      for (const w of ops.run.wheel) if (w.kind === 'dud') ops.setWedgeKind(w.uid, 'cash', 75);
      ops.run.nextMods.spinsDelta -= 2;
    },
  },
  {
    id: 'rare_for_debt',
    tier: 'normal',
    line: "I've got something in the prop room with your name on it. The Network will want a little extra, of course.",
    deal: 'Gain {artifact}. This Debt +25%.',
    weight: 9,
    available: (r) => r.artifacts.length < 6,
    roll: (ops) => rollArtifact(ops, 'rare'),
    apply: (ops, p) => {
      if (p.artifact) ops.grantArtifact(String(p.artifact));
      debtUp(ops, 1.25);
    },
  },
  {
    id: 'tokens_for_tax',
    tier: 'normal',
    line: "Six shiny Tokens. I just need you to sign here, acknowledging the Network's right to a modest... administrative slice.",
    deal: '+6 Tokens. Add a Tax wedge.',
    weight: 9,
    apply: (ops) => {
      ops.addTokens(6, 'bargain');
      ops.insertWedgeRandom('tax', 0, (k) => k === 'dud' || k === 'cash' || k === 'respin');
    },
  },
  {
    id: 'gild_all',
    tier: 'normal',
    line: 'Gold leaf on every dollar sign. Of course, the black slices will want to feel included.',
    deal: 'Gild every Cash wedge. Every Bankrupt is 5° wider.',
    weight: 7,
    apply: (ops) => {
      for (const w of ops.run.wheel) {
        if (w.kind === 'cash') w.gild += 1;
        if (w.kind === 'bankrupt') w.width += 5;
      }
    },
  },
  {
    id: 'jackpot_for_artifact',
    tier: 'normal',
    line: "Two Jackpots. I'll just need the trinket on the far left of your shelf.",
    deal: 'Add a second Jackpot. Lose your leftmost artifact.',
    weight: 7,
    available: (r) => r.artifacts.length > 0,
    apply: (ops) => {
      ops.insertWedgeRandom('jackpot', 1000, (k) => k === 'dud' || k === 'cash');
      const a = ops.run.artifacts[0];
      if (a) ops.run.artifacts.splice(0, 1);
    },
  },
  {
    id: 'spins_for_debt',
    tier: 'normal',
    line: 'Three extra spins next show. The Network will bill you for the union.',
    deal: '+3 spins next Deadline. This Debt +15%.',
    weight: 9,
    apply: (ops) => {
      ops.run.nextMods.spinsDelta += 3;
      debtUp(ops, 1.15);
    },
  },
  {
    id: 'double_vault',
    tier: 'normal',
    line: "I'll double whatever's in that safe of yours. All I ask is your little Token collection.",
    deal: 'Double your Vault (max +$1500). Lose all Tokens.',
    weight: 7,
    available: (r) => r.vault > 100,
    apply: (ops) => {
      ops.addVault(Math.min(1500, ops.run.vault), 'bargain');
      ops.run.tokens = 0;
    },
  },
  {
    id: 'scratch_haunt',
    tier: 'normal',
    line: 'Free scratch cards! They came from a wedge we had to retire.',
    deal: 'Fill your Scratch Card slots. Add a Haunted wedge.',
    weight: 7,
    available: (r) => r.scratch.length < 3,
    apply: (ops) => {
      while (ops.run.scratch.length < 3) if (!ops.addScratch()) break;
      ops.insertWedgeRandom('haunted', 0, (k) => k === 'cash' || k === 'dud');
    },
  },
  {
    id: 'remove_bankrupt_zero',
    tier: 'normal',
    line: 'I can take a Bankrupt off your wheel. The inner ring will need something in return.',
    deal: 'Remove a Bankrupt (becomes $50). Add a ×0 to the inner ring.',
    weight: 8,
    available: (r) => r.wheel.some((w) => w.kind === 'bankrupt'),
    apply: (ops) => {
      ops.removeKind('bankrupt', 'cash', 1);
      ops.run.ring.push(0);
    },
  },
  {
    id: 'ring_three',
    tier: 'normal',
    line: 'Very exciting for the viewers. They also enjoy a Bankrupt.',
    deal: 'Add a ×3 to the inner ring. Add a Bankrupt.',
    weight: 8,
    apply: (ops) => {
      ops.run.ring.push(3);
      ops.insertWedgeRandom('bankrupt', 0, (k) => k === 'dud' || k === 'cash');
    },
  },
  {
    id: 'sell_soul',
    tier: 'normal',
    line: 'Fifteen hundred dollars. Right now.',
    deal: '+$1500 in the Vault. This Debt +40%.',
    weight: 7,
    apply: (ops) => {
      ops.addVault(1500, 'bargain');
      debtUp(ops, 1.4);
    },
  },
  {
    id: 'widen_jackpot',
    tier: 'normal',
    line: 'Your Jackpot is so thin. Three hundred dollars and our carpenter will fatten it right up.',
    deal: 'Every Jackpot is 6° wider. −$300 from the Vault.',
    weight: 7,
    available: (r) => r.vault >= 300 && r.wheel.some((w) => w.kind === 'jackpot'),
    apply: (ops) => {
      ops.addVault(-300, 'bargain');
      for (const w of ops.run.wheel) if (w.kind === 'jackpot') w.width += 6;
    },
  },
  {
    id: 'cursed_gift',
    tier: 'normal',
    line: 'No strings. Well — some strings.',
    deal: 'Gain {artifact} (cursed) and +3 Tokens.',
    weight: 8,
    available: (r) => r.artifacts.length < 6,
    roll: (ops) => rollArtifact(ops, 'cursed'),
    apply: (ops, p) => {
      if (p.artifact) ops.grantArtifact(String(p.artifact));
      ops.addTokens(3, 'bargain');
    },
  },
  {
    id: 'shrink_bankrupts',
    tier: 'normal',
    line: 'I know a guy with a saw. He charges in Tokens.',
    deal: 'Every Bankrupt is 5° narrower. −4 Tokens.',
    weight: 7,
    available: (r) => r.tokens >= 4 && r.wheel.some((w) => w.kind === 'bankrupt'),
    apply: (ops) => {
      ops.run.tokens -= 4;
      for (const w of ops.run.wheel) if (w.kind === 'bankrupt') w.width = Math.max(BALANCE.bankruptMinWidth, w.width - 5);
    },
  },
  {
    id: 'overtime_tax',
    tier: 'normal',
    line: 'An Overtime wedge, installed tonight. The installers will leave a Tax wedge behind.',
    deal: 'Install an Overtime wedge. Install a Tax wedge.',
    weight: 7,
    apply: (ops) => {
      ops.insertWedgeRandom('overtime', 0, (k) => k === 'dud' || k === 'cash');
      ops.insertWedgeRandom('tax', 0, (k) => k === 'dud' || k === 'cash');
    },
  },
  {
    id: 'small_change_mystery',
    tier: 'normal',
    line: "Your small bills are boring the audience. Let's make them... interesting.",
    deal: 'Every Cash wedge worth $50 or less becomes a Mystery.',
    weight: 6,
    available: (r) => r.wheel.some((w) => w.kind === 'cash' && w.value <= 50),
    apply: (ops) => {
      for (const w of ops.run.wheel) if (w.kind === 'cash' && w.value <= 50) ops.setWedgeKind(w.uid, 'mystery', 0);
    },
  },
  {
    id: 'raise_all_cash',
    tier: 'normal',
    line: "Twenty-five more dollars on every Cash wedge. For that kind of generosity I'll need one more black slice.",
    deal: '+$25 to every Cash wedge. Add a Bankrupt.',
    weight: 8,
    apply: (ops) => {
      for (const w of ops.run.wheel) if (w.kind === 'cash') w.value += 25;
      ops.insertWedgeRandom('bankrupt', 0, (k) => k === 'dud' || k === 'cash');
    },
  },
  {
    id: 'free_rerolls',
    tier: 'normal',
    line: 'The Prize Cabinet owes me a favour. They cost you two hundred dollars — the favours, not the cabinet.',
    deal: '3 free Prize Cabinet rerolls next time. −$200 from the Vault.',
    weight: 6,
    available: (r) => r.vault >= 200,
    apply: (ops) => {
      ops.addVault(-200, 'bargain');
      ops.run.marks.freeRerolls = (ops.run.marks.freeRerolls ?? 0) + 3;
    },
  },
  {
    id: 'insurance_policy',
    tier: 'normal',
    line: 'Two policies, two hundred fifty dollars. The fine print is in a language we invented.',
    deal: 'Gain 2 Insurance cards (if room). −$250 from the Vault.',
    weight: 6,
    available: (r) => r.vault >= 250 && r.scratch.length < 3,
    apply: (ops) => {
      ops.addVault(-250, 'bargain');
      ops.addScratch('insurance');
      ops.addScratch('insurance');
    },
  },
  {
    id: 'tokens_to_cash',
    tier: 'normal',
    line: "Tokens are just plastic, friend. I'll buy every one off you at a hundred dollars apiece.",
    deal: 'Convert all Tokens into $100 each in the Vault.',
    weight: 6,
    available: (r) => r.tokens >= 3,
    roll: (ops) => ({ n: ops.run.tokens }),
    apply: (ops) => {
      const n = ops.run.tokens;
      ops.run.tokens = 0;
      ops.addVault(n * 100, 'bargain');
    },
  },
  {
    id: 'buy_spins',
    tier: 'normal',
    line: "I'm being nice tonight. Don't get used to it.",
    deal: '+2 spins next Deadline. −3 Tokens.',
    weight: 7,
    available: (r) => r.tokens >= 3,
    apply: (ops) => {
      ops.run.tokens -= 3;
      ops.run.nextMods.spinsDelta += 2;
    },
  },
  {
    id: 'ring_purge',
    tier: 'normal',
    line: "I can make it disappear. Time disappears with it — three spins' worth.",
    deal: 'Remove a ×0 from the inner ring. −3 spins next Deadline.',
    weight: 6,
    available: (r) => r.ring.includes(0) && r.ring.length > 2,
    apply: (ops) => {
      const i = ops.run.ring.indexOf(0);
      if (i >= 0) ops.run.ring.splice(i, 1);
      ops.run.nextMods.spinsDelta -= 3;
    },
  },
  {
    id: 'thief_payday',
    tier: 'normal',
    line: 'Two new wedges: one that steals from you, and one that saves you from yourself. The Network loves balance.',
    deal: 'Install a Thief and a Payday wedge (replacing Cash or Duds).',
    weight: 6,
    apply: (ops) => {
      ops.insertWedgeRandom('thief', 0, (k) => k === 'dud' || k === 'cash');
      ops.insertWedgeRandom('payday', 0, (k) => k === 'dud' || k === 'cash');
    },
  },
  {
    id: 'echo_contract',
    tier: 'normal',
    line: 'ECHOs pay triple, for the rest of your contract. The Network will charge a modest syndication fee.',
    deal: 'ECHO pays ×3 base for the rest of the run. This Debt +20%.',
    weight: 6,
    available: (r) => !r.marks.echoTriple,
    apply: (ops) => {
      ops.run.marks.echoTriple = 1;
      debtUp(ops, 1.2);
    },
  },
  {
    id: 'warm_start',
    tier: 'normal',
    line: 'Every Deadline, your Streak will begin at ×1.5. The Bankrupts will hear about this and get jealous.',
    deal: 'Streak starts each Deadline at ×1.5. Every Bankrupt is 3° wider.',
    weight: 6,
    available: (r) => !r.marks.warmStart,
    apply: (ops) => {
      ops.run.marks.warmStart = 1;
      for (const w of ops.run.wheel) if (w.kind === 'bankrupt') w.width += 3;
    },
  },
  {
    id: 'tax_immunity',
    tier: 'normal',
    line: 'I know people at the Revenue. Two hundred dollars and your Vault becomes... invisible to them.',
    deal: 'Tax wedges can never touch your Vault again. −$200.',
    weight: 5,
    available: (r) => r.vault >= 200 && !r.marks.taxImmune,
    apply: (ops) => {
      ops.addVault(-200, 'bargain');
      ops.run.marks.taxImmune = 1;
    },
  },
  {
    id: 'swap_artifact',
    tier: 'normal',
    line: 'Let me take one of your little treasures off your hands. In exchange, a rare one.',
    deal: 'Lose a random artifact. Gain {artifact}.',
    weight: 6,
    available: (r) => r.artifacts.length > 0,
    roll: (ops) => rollArtifact(ops, 'rare'),
    apply: (ops, p) => {
      const i = ops.rng.events.int(ops.run.artifacts.length);
      ops.run.artifacts.splice(i, 1);
      if (p.artifact) ops.grantArtifact(String(p.artifact));
    },
  },
  {
    id: 'vault_key_debt',
    tier: 'normal',
    line: 'Two Vault Keys. The Network will add a little something to the bill for the locksmith.',
    deal: 'Your next 2 Bankrupts are blocked. This Debt +10%.',
    weight: 7,
    apply: (ops) => {
      ops.run.flags.vaultKey += 2;
      debtUp(ops, 1.1);
    },
  },
  {
    id: 'charge_wedge',
    tier: 'normal',
    line: "A Charge wedge, freshly wired. Nobody's been electrocuted in weeks.",
    deal: 'A Respin becomes a Charge wedge, and a Dud becomes a Boost.',
    weight: 6,
    available: (r) => r.wheel.some((w) => w.kind === 'respin'),
    apply: (ops) => {
      const r = ops.run.wheel.find((w) => w.kind === 'respin');
      if (r) ops.setWedgeKind(r.uid, 'charge', 0);
      const d = ops.run.wheel.find((w) => w.kind === 'dud');
      if (d) ops.setWedgeKind(d.uid, 'boost', 0);
    },
  },
  // ---------------------------------------------------------------------- DEAD AIR --
  {
    id: 'deadair_refund',
    tier: 'deadAir',
    line: "Listen — the audience didn't see it. I can put half of it back in your Vault.",
    deal: 'Half the lost Tray (${amount}) goes to the Vault. This Debt +20%.',
    weight: 10,
    roll: (ops) => ({ amount: Math.floor((ops.run.marks.lastBankruptLoss ?? 0) / 2) }),
    apply: (ops, p) => {
      ops.addVault(Number(p.amount), 'dead air');
      debtUp(ops, 1.2);
    },
  },
  {
    id: 'deadair_spins',
    tier: 'deadAir',
    line: 'Three more spins, right now, on the house. The house will also be adding a Bankrupt.',
    deal: '+3 spins now. Add a Bankrupt.',
    weight: 10,
    apply: (ops) => {
      ops.addSpins(3, 'dead air');
      ops.insertWedgeRandom('bankrupt', 0, (k) => k === 'dud' || k === 'cash');
    },
  },
  {
    id: 'deadair_tokens',
    tier: 'deadAir',
    line: "Money's gone, but memories are forever. I'll turn that lovely memory into Tokens.",
    deal: '+{tokens} Tokens. Your Streak starts at ×2 now.',
    weight: 10,
    roll: (ops) => ({ tokens: Math.max(2, Math.floor((ops.run.marks.lastBankruptLoss ?? 0) / 100)) }),
    apply: (ops, p) => {
      ops.addTokens(Number(p.tokens), 'dead air');
      ops.run.streak = Math.max(ops.run.streak, 2);
    },
  },
  // ------------------------------------------------------------------------ SECRET --
  {
    id: 'secret_seat',
    tier: 'secret',
    line: "(a whisper) I sat in that chair before you. I can tear out your next page — but they'll take your things.",
    deal: 'Your next Debt is $0. Lose every artifact.',
    weight: 10,
    apply: (ops) => {
      ops.run.nextMods.debtMult = 0;
      ops.run.artifacts.splice(0, ops.run.artifacts.length);
      ops.run.marks.secretSeat = 1;
    },
  },
  {
    id: 'secret_trapdoor',
    tier: 'secret',
    line: "(static) Take it. And take my winnings — I won't need them where I am.",
    deal: 'Gain the Trapdoor Lever and +$666.',
    weight: 10,
    available: (r) => r.artifacts.length < 6 && !r.artifacts.some((a) => a.id === 'trapdoor_lever'),
    apply: (ops) => {
      ops.grantArtifact('trapdoor_lever');
      ops.addVault(666, 'secret');
    },
  },
  {
    id: 'secret_cut_feed',
    tier: 'secret',
    line: '(breathing) Cut the feed. The host will stop smiling.',
    deal: 'Every Bankrupt becomes a Dud, permanently. The Host goes silent.',
    weight: 10,
    available: (r) => r.wheel.some((w) => w.kind === 'bankrupt'),
    apply: (ops) => {
      for (const w of ops.run.wheel) if (w.kind === 'bankrupt') ops.setWedgeKind(w.uid, 'dud', 0);
      ops.run.marks.hostSilent = 1;
    },
  },
  {
    id: 'secret_truth',
    tier: 'secret',
    line: '(a long pause) You want to know what the Network is? Pick up the cards on the floor by the camera.',
    deal: '+10 Tokens. The truth (a lore note) is unlocked.',
    weight: 10,
    apply: (ops) => {
      ops.addTokens(10, 'secret');
      ops.run.marks.truthUnlocked = 1;
    },
  },
];

export const BARGAIN_MAP: Record<string, BargainDef> = Object.fromEntries(BARGAINS.map((b) => [b.id, b]));

export function bargainDef(id: string): BargainDef {
  const b = BARGAIN_MAP[id];
  if (!b) throw new Error(`Unknown bargain ${id}`);
  return b;
}

export function fillDeal(text: string, params: Record<string, string | number>, nameOf: (id: string) => string): string {
  return text.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = params[k];
    if (k === 'artifact') return v ? nameOf(String(v)) : 'a rare artifact';
    return v === undefined ? '' : String(v);
  });
}

export const PRODUCER_INTROS: Record<BargainTier, readonly string[]> = {
  normal: [
    'Producer here. Big fan. Bigger offer.',
    "Don't hang up. Nobody hangs up on me. Well. Some people. Once.",
    'Good news! I have two deals and only one of them is a trap. Probably.',
    "You're doing great. The numbers are... numbers. Let's talk.",
    "Hello? Hello. I can hear you breathing, it's fine, everybody breathes.",
    'The Network asked me to check in. The Network is very caring.',
  ],
  deadAir: [
    'DEAD AIR. Do you know what DEAD AIR costs us? I do. Let me help.',
    'Wow. Wow wow wow. Okay. Okay. I have an idea. Two ideas.',
    "That's going in the blooper reel. Unless... you and I come to an arrangement.",
  ],
  secret: ["Don't talk. Just listen. I'm not the Producer, and this line isn't here."],
};
