/**
 * Wedge types — the "cards" of the wheel deck. Stable ids are the WedgeKind strings.
 */
import { BALANCE } from '../game/balance';
import type { LandCtx, WedgeDef } from '../game/hooks';
import type { WedgeKind } from '../game/types';

const HAUNTED_POOL: { kind: WedgeKind; value: number; w: number }[] = [
  { kind: 'cash', value: 250, w: 30 },
  { kind: 'token', value: 0, w: 15 },
  { kind: 'boost', value: 0, w: 12 },
  { kind: 'respin', value: 0, w: 12 },
  { kind: 'charge', value: 0, w: 8 },
  { kind: 'bankrupt', value: 0, w: 13 },
  { kind: 'tax', value: 0, w: 6 },
  { kind: 'jackpot', value: 0, w: 4 },
];

const MYSTERY_POOL: { kind: WedgeKind; value: number; w: number }[] = [
  { kind: 'cash', value: 300, w: 22 },
  { kind: 'token', value: 0, w: 14 },
  { kind: 'respin', value: 0, w: 12 },
  { kind: 'boost', value: 0, w: 10 },
  { kind: 'artifact', value: 0, w: 6 },
  { kind: 'scratch', value: 0, w: 8 },
  { kind: 'jackpot', value: 0, w: 3 },
];
const MYSTERY_BANKRUPT_CHANCE = 0.25;

/** Rare reveals shared by Mystery and Haunted: 0.5% each of a pact, a blessing and the Gun. */
const RARE_REVEALS: { below: number; kind: WedgeKind; name: string }[] = [
  { below: 0.005, kind: 'crossroads', name: 'CROSSROADS' },
  { below: 0.01, kind: 'angel', name: 'ANGEL' },
  { below: 0.015, kind: 'gun', name: 'THE GUN' },
];
function rareReveal(l: LandCtx, roll: number, prefix: string): boolean {
  const hit = RARE_REVEALS.find((r) => roll < r.below);
  if (hit) l.resolveAs(hit.kind, 0, `${prefix} → ${hit.name}`);
  return !!hit;
}

function cashLand(l: LandCtx): void {
  const v = l.cashValue(l.seg);
  l.cash(v, `$${Math.round(v)}`);
}

export const WEDGES: Record<WedgeKind, WedgeDef> = {
  gun: {
    kind: 'gun', name: 'The Gun', glyph: 'GUN',
    text: 'One chamber in six is loaded. A shot ends the run.', rarity: 'cursed', cost: 0, shop: false,
    cashLike: false, gildable: false, defaultValue: 0, color: 0x302a27, ink: 0xe9d6bd,
    pattern: 'stripes', repeatable: false,
    land: (l) => l.prize('gun', 1, 'THE GUN'),
    apply: (ops) => ops.fireGun(),
  },
  crossroads: {
    kind: 'crossroads', name: 'Crossroads', glyph: 'PACT',
    text: 'A wish, at a permanent price.', rarity: 'cursed', cost: 0, shop: false,
    cashLike: false, gildable: false, defaultValue: 0, color: 0x391018, ink: 0xe6c2a8,
    pattern: 'cross', repeatable: false,
    land: (l) => l.prize('crossroads', 1, 'THE CROSSROADS'),
    apply: (ops) => ops.queueSupernatural('pact'),
  },
  angel: {
    kind: 'angel', name: 'Angel', glyph: 'GRACE',
    text: 'Choose a blessing.', rarity: 'rare', cost: 0, shop: false,
    cashLike: false, gildable: false, defaultValue: 0, color: 0xc4c3af, ink: 0x302e28,
    pattern: 'cross', repeatable: false,
    land: (l) => l.prize('angel', 1, 'A QUIET LIGHT'),
    apply: (ops) => ops.queueSupernatural('blessing'),
  },
  cash: {
    kind: 'cash',
    name: 'Cash',
    glyph: '$',
    text: 'Pays its value into the Tray.',
    rarity: 'starter',
    cost: 3,
    shop: true,
    cashLike: true,
    gildable: true,
    defaultValue: 100,
    color: 0x2f7d3a,
    ink: 0xf3e6b0,
    pattern: 'solid',
    repeatable: false,
    land: cashLand,
  },
  respin: {
    kind: 'respin',
    name: 'Respin',
    glyph: 'RESPIN',
    text: 'A free spin: +1 spin this Deadline.',
    rarity: 'starter',
    cost: 3,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x2a5d9c,
    ink: 0xe9eef5,
    pattern: 'rings',
    repeatable: true,
    land: (l) => l.prize('respin', 1, 'RESPIN'),
    apply: (ops, p) => ops.addSpins(Math.max(1, Math.round(p.amount)), 'respin'),
  },
  token: {
    kind: 'token',
    name: 'Token',
    glyph: '+2 TOK',
    text: '+2 Tokens.',
    rarity: 'starter',
    cost: 3,
    shop: true,
    cashLike: false,
    gildable: true,
    defaultValue: 2,
    color: 0xb8862b,
    ink: 0x1d1208,
    pattern: 'dots',
    repeatable: true,
    land: (l) => {
      const n = Math.round(2 * (1 + BALANCE.gildMult * l.seg.gild));
      l.prize('token', Math.max(1, Math.ceil(n * l.weight)), `+${Math.max(1, Math.ceil(n * l.weight))} TOKENS`, true);
    },
    apply: (ops, p) => ops.addTokens(Math.round(p.amount), 'token wedge'),
  },
  boost: {
    kind: 'boost',
    name: 'Boost',
    glyph: 'BOOST',
    text: '+×1 multiplier on your next spin.',
    rarity: 'starter',
    cost: 3,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0xc0472a,
    ink: 0xfff1d0,
    pattern: 'zigzag',
    repeatable: true,
    land: (l) => l.prize('boost', 1, 'BOOST +×1'),
    apply: (ops, p) => ops.addBoost(p.amount),
  },
  artifact: {
    kind: 'artifact',
    name: 'Artifact',
    glyph: 'PRIZE',
    text: 'Pick 1 of 3 artifacts.',
    rarity: 'starter',
    cost: 6,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x6b3a8c,
    ink: 0xf4dcff,
    pattern: 'cross',
    repeatable: false,
    land: (l) => l.prize('artifact', 1, 'ARTIFACT!'),
    apply: (ops) => ops.queueArtifactPick('wedge'),
  },
  bankrupt: {
    kind: 'bankrupt',
    name: 'Bankrupt',
    glyph: 'BANK',
    text: 'Empties the Tray and resets your Streak.',
    rarity: 'starter',
    cost: 0,
    shop: false,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x0b0a0a,
    ink: 0xd8d2c4,
    pattern: 'checker',
    repeatable: false,
    land: (l) => l.bankrupt(l.weight),
  },
  jackpot: {
    kind: 'jackpot',
    name: 'Jackpot',
    glyph: 'JACKPOT',
    text: `A ${BALANCE.jackpotWidth}° sliver worth $${BALANCE.jackpotValue}. Counts as Cash.`,
    rarity: 'rare',
    cost: 10,
    shop: true,
    cashLike: true,
    gildable: true,
    defaultValue: BALANCE.jackpotValue,
    color: 0xf2c230,
    ink: 0x3a1500,
    pattern: 'diag',
    repeatable: false,
    land: (l) => {
      const v = l.cashValue(l.seg);
      l.cash(v, `JACKPOT $${Math.round(v)}`);
    },
  },
  mystery: {
    kind: 'mystery',
    name: 'Mystery',
    glyph: '?',
    text: 'Flips to a random prize — or Bankrupt.',
    rarity: 'starter',
    cost: 3,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x3b3f8f,
    ink: 0xffe46b,
    pattern: 'grid',
    repeatable: false,
    land: (l) => {
      const m = l.mystery();
      const r = l.rng.loot;
      if (m.forceBankrupt || (m.allowBankrupt && r.chance(MYSTERY_BANKRUPT_CHANCE))) {
        l.resolveAs('bankrupt', 0, 'MYSTERY → BANKRUPT');
        return;
      }
      if (rareReveal(l, r.float(), 'MYSTERY')) return;
      const pick = r.weighted(MYSTERY_POOL, (p) => p.w);
      l.resolveAs(pick.kind, pick.kind === 'jackpot' ? BALANCE.jackpotValue : pick.value, `MYSTERY → ${WEDGES[pick.kind].name.toUpperCase()}`);
    },
  },
  dud: {
    kind: 'dud',
    name: 'Dud',
    glyph: 'DUD',
    text: 'Pays nothing.',
    rarity: 'starter',
    cost: 0,
    shop: false,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x5a554c,
    ink: 0x2a2722,
    pattern: 'stripes',
    repeatable: false,
    land: (l) => l.nothing('DUD'),
  },
  tax: {
    kind: 'tax',
    name: 'Tax',
    glyph: 'TAX',
    text: `Lose ${Math.round(BALANCE.taxRate * 100)}% of the Vault.`,
    rarity: 'starter',
    cost: 0,
    shop: false,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x8f1d1d,
    ink: 0xffd9c9,
    pattern: 'cross',
    repeatable: false,
    land: (l) => l.prize('tax', BALANCE.taxRate * l.weight, 'TAX'),
    apply: (ops, p) => {
      const loss = Math.floor(ops.run.vault * p.amount);
      if (loss > 0) ops.addVault(-loss, 'tax');
      ops.note(`TAX −$${loss}`);
    },
  },
  splitter: {
    kind: 'splitter',
    name: 'Splitter',
    glyph: 'SPLIT',
    text: 'Two half-wedges in one slot.',
    rarity: 'uncommon',
    cost: 4,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x4d7f7a,
    ink: 0xffffff,
    pattern: 'diag',
    repeatable: false,
    // A splitter never lands as itself — its halves are separate segments.
    land: (l) => l.nothing('SPLIT'),
  },
  wild: {
    kind: 'wild',
    name: 'Wild',
    glyph: 'WILD',
    text: 'Copies the best Cash wedge on the wheel.',
    rarity: 'uncommon',
    cost: 5,
    shop: true,
    cashLike: true,
    gildable: false,
    defaultValue: 0,
    color: 0xe05aa0,
    ink: 0x200012,
    pattern: 'zigzag',
    repeatable: false,
    land: (l) => {
      const v = l.bestCashValue();
      l.cash(v, `WILD $${Math.round(v)}`);
    },
  },
  haunted: {
    kind: 'haunted',
    name: 'Haunted',
    glyph: 'BOO',
    text: 'A random effect every spin. Usually good.',
    rarity: 'uncommon',
    cost: 3,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x7fa39a,
    ink: 0x0b1714,
    pattern: 'dots',
    repeatable: false,
    land: (l) => {
      if (rareReveal(l, l.rng.events.float(), 'HAUNTED')) return;
      const pick = l.rng.events.weighted(HAUNTED_POOL, (p) => p.w);
      l.resolveAs(pick.kind, pick.kind === 'jackpot' ? BALANCE.jackpotValue : pick.value, `HAUNTED → ${WEDGES[pick.kind].name.toUpperCase()}`);
    },
  },
  cursedCash: {
    kind: 'cursedCash',
    name: 'Cursed Cash',
    glyph: '$600',
    text: `Pays $${BALANCE.cursedCashValue}. Installing it adds a Tax wedge.`,
    rarity: 'cursed',
    cost: 4,
    shop: true,
    cashLike: true,
    gildable: true,
    defaultValue: BALANCE.cursedCashValue,
    color: 0x3d5e1f,
    ink: 0xc9ff7a,
    pattern: 'checker',
    repeatable: false,
    land: cashLand,
  },
  interest: {
    kind: 'interest',
    name: 'Interest',
    glyph: '+5% V',
    text: 'The Vault grows by 5%.',
    rarity: 'common',
    cost: 3,
    shop: true,
    cashLike: false,
    gildable: true,
    defaultValue: 0,
    color: 0x1f6f6a,
    ink: 0xd9fff6,
    pattern: 'rings',
    repeatable: true,
    land: (l) => l.prize('interest', BALANCE.interestWedgeRate * (1 + BALANCE.gildMult * l.seg.gild) * l.weight, 'INTEREST'),
    apply: (ops, p) => {
      const g = Math.floor(ops.run.vault * p.amount);
      ops.addVault(g, 'interest');
      ops.note(`VAULT +$${g}`);
    },
  },
  thief: {
    kind: 'thief',
    name: 'Thief',
    glyph: 'THIEF',
    text: 'Steals 20% of the Tray and fences it into Tokens.',
    rarity: 'common',
    cost: 3,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x3a3a3a,
    ink: 0xf0c94a,
    pattern: 'stripes',
    repeatable: false,
    land: (l) => l.prize('thief', BALANCE.thiefRate * l.weight, 'THIEF'),
    apply: (ops, p) => {
      const stolen = Math.floor(ops.run.tray * p.amount);
      const tokens = Math.max(1, Math.round(stolen / BALANCE.tokenRate));
      ops.addTray(-stolen, 'thief');
      ops.addTokens(tokens, 'thief');
      ops.note(`THIEF −$${stolen} → +${tokens} TOK`);
    },
  },
  vaultKey: {
    kind: 'vaultKey',
    name: 'Vault Key',
    glyph: 'KEY',
    text: 'Your next Bankrupt is blocked.',
    rarity: 'uncommon',
    cost: 4,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x9a9a9a,
    ink: 0x101010,
    pattern: 'cross',
    repeatable: true,
    land: (l) => l.prize('vaultKey', 1, 'VAULT KEY'),
    apply: (ops) => {
      ops.run.flags.vaultKey += 1;
      ops.note('BANKRUPT SHIELD +1');
    },
  },
  overtime: {
    kind: 'overtime',
    name: 'Overtime',
    glyph: '+2 SPN',
    text: '+2 spins this Deadline.',
    rarity: 'uncommon',
    cost: 5,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x26497a,
    ink: 0xffe8a8,
    pattern: 'grid',
    repeatable: true,
    land: (l) => l.prize('overtime', 2, 'OVERTIME +2'),
    apply: (ops, p) => ops.addSpins(Math.max(1, Math.round(p.amount)), 'overtime'),
  },
  charge: {
    kind: 'charge',
    name: 'Charge',
    glyph: 'CHARGE',
    text: 'Streak +1.0.',
    rarity: 'uncommon',
    cost: 4,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0xd97a1e,
    ink: 0x200a00,
    pattern: 'zigzag',
    repeatable: true,
    land: (l) => l.prize('charge', 1, 'CHARGE +1.0'),
    apply: (ops, p) => ops.addStreak(p.amount),
  },
  ringJump: {
    kind: 'ringJump',
    name: 'Ring Jump',
    glyph: 'JUMP',
    text: 'Re-spins only the inner ring and pays your last wedge again.',
    rarity: 'rare',
    cost: 5,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x5f2f7f,
    ink: 0xbfffe0,
    pattern: 'rings',
    repeatable: false,
    land: (l) => l.prize('ringJump', 1, 'RING JUMP'),
    apply: (ops) => ops.ringJump(),
  },
  doubler: {
    kind: 'doubler',
    name: 'Doubler',
    glyph: 'x2 NXT',
    text: 'Your next prize is awarded twice.',
    rarity: 'rare',
    cost: 5,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0xb03b6a,
    ink: 0xfff0f6,
    pattern: 'diag',
    repeatable: false,
    land: (l) => l.prize('doubler', 1, 'DOUBLER'),
    apply: (ops) => {
      ops.run.flags.doubler += 1;
      ops.note('NEXT PRIZE ×2');
    },
  },
  scratch: {
    kind: 'scratch',
    name: 'Scratcher',
    glyph: 'CARD',
    text: 'Gain a random Scratch Card.',
    rarity: 'common',
    cost: 3,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0xd9c9a0,
    ink: 0x3a2a10,
    pattern: 'dots',
    repeatable: true,
    land: (l) => l.prize('scratch', 1, 'SCRATCH CARD'),
    apply: (ops, p) => {
      for (let i = 0; i < Math.max(1, Math.round(p.amount)); i++) ops.addScratch();
    },
  },
  payday: {
    kind: 'payday',
    name: 'Payday',
    glyph: 'PAYDAY',
    text: 'Sweeps the Tray into the Vault without breaking your Streak.',
    rarity: 'uncommon',
    cost: 5,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x1c5c2e,
    ink: 0xfff7c2,
    pattern: 'stripes',
    repeatable: false,
    land: (l) => l.prize('payday', 1, 'PAYDAY'),
    apply: (ops) => {
      const t = ops.run.tray;
      ops.addTray(-t, 'payday');
      ops.addVault(t, 'payday');
      ops.note(`PAYDAY $${t} → VAULT`);
    },
  },
  // ------------------------------------------------------------------ The horror wedges --
  mouth: {
    kind: 'mouth',
    name: 'The Mouth',
    glyph: 'FEED',
    text: `Every spin that misses it, it eats ${Math.round(BALANCE.mouthBite * 100)}% of the Tray. Land on it and it brings everything back up ×${BALANCE.mouthVomit}.`,
    rarity: 'cursed',
    cost: 4,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x7a1c22,
    ink: 0xffd8c8,
    pattern: 'zigzag',
    repeatable: false,
    land: (l) => {
      const belly = l.run.marks[`belly:${l.seg.uid}`] ?? 0;
      if (belly <= 0) {
        l.nothing('THE MOUTH IS EMPTY');
        return;
      }
      l.run.marks.mouthUid = l.seg.uid;
      l.prize('mouth', belly * BALANCE.mouthVomit, `THE MOUTH +$${Math.round(belly * BALANCE.mouthVomit * l.weight)}`);
    },
    apply: (ops, p) => {
      const amount = Math.round(p.amount * p.weight);
      const uid = ops.run.marks.mouthUid;
      if (uid !== undefined) {
        delete ops.run.marks[`belly:${uid}`];
        delete ops.run.marks.mouthUid;
        ops.horror({ type: 'mouthVomit', uid, amount });
      }
      ops.addTray(amount, 'mouth');
      ops.note(`IT BRINGS UP $${amount}`);
    },
  },
  cleaver: {
    kind: 'cleaver',
    name: 'The Cleaver',
    glyph: 'CUT',
    text: `Pays $${BALANCE.cleaverValue}. Counts as Cash. Then it chops a wedge beside it into a Stump.`,
    rarity: 'cursed',
    cost: 4,
    shop: true,
    cashLike: true,
    gildable: true,
    defaultValue: BALANCE.cleaverValue,
    color: 0x6e7378,
    ink: 0x1a0606,
    pattern: 'diag',
    repeatable: false,
    land: (l) => {
      const v = l.cashValue(l.seg);
      l.cash(v, `CUT $${Math.round(v)}`);
      // Pick the victim now (loot stream) so the landing replays exactly.
      const segs = l.ops.layout().segments;
      const i = segs.findIndex((s) => s.idx === l.seg.idx);
      const n = segs.length;
      const sides = [segs[(i - 1 + n) % n], segs[(i + 1) % n]].filter(
        (s) => s && s.uid !== l.seg.uid && !['bankrupt', 'jackpot', 'stump', 'cleaver'].includes(s.kind),
      );
      if (sides.length) {
        l.run.marks.cleaveTarget = l.rng.loot.pick(sides).uid;
        l.run.marks.cleaverUid = l.seg.uid;
      }
      l.prize('cleaver', 1, 'CHOP');
    },
    apply: (ops) => {
      const target = ops.run.marks.cleaveTarget;
      if (target === undefined) return;
      delete ops.run.marks.cleaveTarget;
      ops.horror({ type: 'cleave', uid: ops.run.marks.cleaverUid ?? -1, target });
      delete ops.run.marks.cleaverUid;
      ops.setWedgeKind(target, 'stump');
      ops.note('A WEDGE IS SEVERED');
    },
  },
  stump: {
    kind: 'stump',
    name: 'Stump',
    glyph: 'STUMP',
    text: 'What the Cleaver left. Pays nothing. It is still bleeding.',
    rarity: 'starter',
    cost: 0,
    shop: false,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x4a1410,
    ink: 0xe8c8b0,
    pattern: 'checker',
    repeatable: false,
    land: (l) => l.nothing('STUMP'),
  },
  bleeder: {
    kind: 'bleeder',
    name: 'Bleeder',
    glyph: 'BLEED',
    text: `Pays $${BALANCE.bleederValue}. Counts as Cash. The Tray then loses ${Math.round(BALANCE.bleedRate * 100)}% every spin until you deposit.`,
    rarity: 'uncommon',
    cost: 4,
    shop: true,
    cashLike: true,
    gildable: true,
    defaultValue: BALANCE.bleederValue,
    color: 0x9a1418,
    ink: 0xfff0e0,
    pattern: 'stripes',
    repeatable: false,
    land: (l) => {
      const v = l.cashValue(l.seg);
      l.cash(v, `BLEED $${Math.round(v)}`);
      l.prize('bleeder', 1, 'BLEEDING');
    },
    apply: (ops) => {
      ops.run.marks.bleeding = 1;
      ops.note('THE TRAY IS BLEEDING');
    },
  },
  eye: {
    kind: 'eye',
    name: 'The Eye',
    glyph: 'EYE',
    text: `Shows you where the wheel will land (+${BALANCE.eyePeeks} previews, press E while charging). ${BALANCE.eyePeeks} spins later it blinks shut and becomes a Bankrupt.`,
    rarity: 'rare',
    cost: 5,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0xe8dcc0,
    ink: 0x7a1010,
    pattern: 'rings',
    repeatable: false,
    land: (l) => {
      l.run.marks.eyeUid = l.seg.uid;
      l.prize('eye', BALANCE.eyePeeks, 'THE EYE OPENS');
    },
    apply: (ops, p) => {
      const n = Math.max(1, Math.round(p.amount * p.weight));
      if (ops.run.marks.eyeLost) ops.note('NOTHING TO SEE WITH');
      else {
        ops.run.flags.peek += n;
        ops.note(`+${n} PEEKS (E)`);
      }
      const uid = ops.run.marks.eyeUid;
      if (uid === undefined) return;
      delete ops.run.marks.eyeUid;
      ops.horror({ type: 'eyeOpen', uid });
      if (ops.run.marks[`eye:${uid}`] === undefined) ops.run.marks[`eye:${uid}`] = BALANCE.eyePeeks;
    },
  },
  stitches: {
    kind: 'stitches',
    name: 'Stitches',
    glyph: 'STITCH',
    text: `Sewn to both its neighbours: pays (or costs) each of them at ${Math.round(BALANCE.stitchWeight * 100)}%. Tears open into a Bankrupt on landing ${BALANCE.stitchLife}.`,
    rarity: 'uncommon',
    cost: 4,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0xc89a86,
    ink: 0x2a0a08,
    pattern: 'cross',
    repeatable: false,
    land: (l) => {
      const segs = l.ops.layout().segments;
      const i = segs.findIndex((s) => s.idx === l.seg.idx);
      const n = segs.length;
      for (const nb of [segs[(i - 1 + n) % n], segs[(i + 1) % n]]) {
        if (!nb || nb.uid === l.seg.uid || nb.kind === 'stitches' || nb.kind === 'splitter') continue;
        l.resolveAs(nb.kind, nb.kind === 'jackpot' ? BALANCE.jackpotValue : nb.value, `STITCH → ${WEDGES[nb.kind].name.toUpperCase()}`, BALANCE.stitchWeight);
      }
      l.run.marks.stitchUid = l.seg.uid;
      l.prize('stitches', 1, 'THE THREAD STRAINS');
    },
    apply: (ops) => {
      const uid = ops.run.marks.stitchUid;
      if (uid === undefined) return;
      delete ops.run.marks.stitchUid;
      const wear = (ops.run.marks[`stitch:${uid}`] ?? 0) + 1;
      if (wear >= BALANCE.stitchLife) {
        ops.horror({ type: 'stitchTear', uid });
        ops.setWedgeKind(uid, 'bankrupt');
        ops.note('THE STITCHES TEAR OPEN');
      } else {
        ops.run.marks[`stitch:${uid}`] = wear;
        ops.horror({ type: 'stitchStrain', uid, wear });
        ops.note(`STITCHES ${wear}/${BALANCE.stitchLife}`);
      }
    },
  },
  // ------------------------------------------------------------------ Fun wedges --------
  roulette: {
    kind: 'roulette',
    name: 'Revolver',
    glyph: 'BANG?',
    text: `Pays $${BALANCE.rouletteValue}. Counts as Cash. One chamber in six is loaded: BANG, it's a Bankrupt.`,
    rarity: 'uncommon',
    cost: 4,
    shop: true,
    cashLike: true,
    gildable: true,
    defaultValue: BALANCE.rouletteValue,
    color: 0x3a2a3a,
    ink: 0xffd0a0,
    pattern: 'rings',
    repeatable: false,
    land: (l) => {
      if (l.rng.loot.int(6) === 0) {
        l.resolveAs('bankrupt', 0, 'BANG!');
        return;
      }
      const v = l.cashValue(l.seg);
      l.cash(v, `CLICK $${Math.round(v)}`);
    },
  },
  hushMoney: {
    kind: 'hushMoney',
    name: 'Hush Money',
    glyph: 'HUSH',
    text: `Pays ${Math.round(BALANCE.hushShare * 100)}% of this Deadline's Debt. Counts as Cash. Nobody saw anything.`,
    rarity: 'uncommon',
    cost: 5,
    shop: true,
    cashLike: true,
    gildable: false,
    defaultValue: 0,
    color: 0x2a4a3a,
    ink: 0xf0e8c0,
    pattern: 'stripes',
    repeatable: false,
    land: (l) => {
      const v = Math.max(50, Math.round((l.run.debt * BALANCE.hushShare) / 25) * 25);
      l.cash(v, `HUSH $${v}`);
    },
  },
  encore: {
    kind: 'encore',
    name: 'Encore',
    glyph: 'ENCORE',
    text: 'Plays the wedge you landed last spin again (Cash, prize or Bankrupt).',
    rarity: 'uncommon',
    cost: 4,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x8a2a4a,
    ink: 0xffe8f0,
    pattern: 'diag',
    repeatable: false,
    land: (l) => {
      const prev = l.run.history[l.run.history.length - 1];
      if (!prev || prev.kind === 'encore' || prev.kind === 'splitter') {
        l.nothing('ENCORE: NOTHING TO REPEAT');
        return;
      }
      const w = l.ops.wedgeByUid(prev.uid);
      const value = prev.kind === 'jackpot' ? BALANCE.jackpotValue : (w?.value ?? WEDGES[prev.kind].defaultValue);
      l.resolveAs(prev.kind, value, `ENCORE → ${WEDGES[prev.kind].name.toUpperCase()}`);
    },
  },
  curtainCall: {
    kind: 'curtainCall',
    name: 'Curtain Call',
    glyph: 'CURTAIN',
    text: `Ends the Deadline now: the Tray grows ×${BALANCE.curtainBonus} and goes to the Vault. Any spins left are lost.`,
    rarity: 'rare',
    cost: 5,
    shop: true,
    cashLike: false,
    gildable: false,
    defaultValue: 0,
    color: 0x7a1a1a,
    ink: 0xffd860,
    pattern: 'grid',
    repeatable: false,
    land: (l) => l.prize('curtainCall', 1, 'CURTAIN CALL'),
    apply: (ops) => {
      const bonus = Math.floor(ops.run.tray * (BALANCE.curtainBonus - 1));
      if (bonus > 0) ops.addTray(bonus, 'curtain call');
      if (ops.run.spinsLeft > 0) ops.addSpins(-ops.run.spinsLeft, 'curtain call');
      ops.note(`CURTAIN CALL +$${bonus}`);
    },
  },
};

export const WEDGE_KINDS = Object.keys(WEDGES) as WedgeKind[];

export function wedgeDef(kind: WedgeKind): WedgeDef {
  return WEDGES[kind];
}

/** Halves a Splitter can roll. */
export const SPLITTER_HALVES: { kind: WedgeKind; value: number; w: number }[] = [
  { kind: 'cash', value: 150, w: 40 },
  { kind: 'token', value: 2, w: 18 },
  { kind: 'respin', value: 0, w: 14 },
  { kind: 'boost', value: 0, w: 12 },
  { kind: 'charge', value: 0, w: 8 },
  { kind: 'scratch', value: 0, w: 8 },
];

/** Cash values a shop Cash wedge can roll. */
export const SHOP_CASH_VALUES = [100, 150, 200, 250, 300];
