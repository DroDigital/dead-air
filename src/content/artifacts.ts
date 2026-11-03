/**
 * Artifacts — passive relics on the left shelf (max 6). Hooks run in slot order, left to
 * right, so arrangement is strategy. Every effect that changes a number calls c.trigger()
 * so the shelf object jiggles and floats its text.
 */
import { BALANCE } from '../game/balance';
import type { ArtifactDef } from '../game/hooks';
import type { Rarity } from '../game/types';

const A: ArtifactDef[] = [
  // ======================================================================== COMMON ==
  {
    id: 'lucky_penny',
    name: 'Lucky Penny',
    rarity: 'common',
    cost: 4,
    text: 'The first spin of each Deadline pays ×3.',
    flavor: 'Heads on both sides. Tails on the inside.',
    prop: 'coin',
    color: 0xc77b3a,
    hooks: {
      onCashPaid(c, e) {
        if (e.firstOfDeadline && e.isCash && e.cash > 0) {
          e.mult(3, 'PENNY ×3');
          c.trigger('×3');
        }
      },
    },
  },
  {
    id: 'piggy_bank',
    name: 'Piggy Bank',
    rarity: 'common',
    cost: 4,
    text: 'The Vault gains 1% every spin.',
    flavor: 'It oinks when nobody is in the room.',
    prop: 'pig',
    color: 0xe39aa6,
    hooks: {
      onSpinResolved(c) {
        const g = Math.floor(c.run.vault * 0.01);
        if (g > 0) {
          c.ops.addVault(g, 'piggy');
          c.trigger(`+$${g} V`);
        }
      },
    },
  },
  {
    id: 'stopwatch',
    name: 'Stopwatch',
    rarity: 'common',
    cost: 4,
    text: 'The lever sweet spot is much wider.',
    flavor: 'Stopped at 7:42. Every clock in here did.',
    prop: 'watch',
    color: 0xc9c9c9,
    hooks: {
      onSpinCharge(_c, e) {
        e.sweetHalfWidth *= 1.8;
      },
    },
  },
  {
    id: 'tooth_fairy',
    name: 'Tooth Fairy',
    rarity: 'common',
    cost: 3,
    text: 'Every Bankrupt gives +2 Tokens.',
    flavor: 'She pays in brass. She collects in molars.',
    prop: 'fairy',
    color: 0xd8e8ff,
    hooks: {
      onBankrupt(c, e) {
        if (!e.blocked) {
          c.ops.addTokens(2, 'tooth fairy');
          c.trigger('+2 TOK');
        }
      },
    },
  },
  {
    id: 'house_edge',
    name: 'House Edge',
    rarity: 'common',
    cost: 4,
    text: `Respin wedges also pay $${BALANCE.houseEdgeRespinCash}.`,
    flavor: 'The house always wins. You are the house now. Congratulations.',
    prop: 'house',
    color: 0x9c6b3c,
    hooks: {
      onPrizeAwarded(c, e) {
        const n = e.prizes.filter((p) => p.kind === 'respin').length;
        if (n > 0) {
          e.add(BALANCE.houseEdgeRespinCash * n, `HOUSE +$${BALANCE.houseEdgeRespinCash * n}`);
          c.trigger(`+$${BALANCE.houseEdgeRespinCash * n}`);
        }
      },
    },
  },
  {
    id: 'rubber_band',
    name: 'Rubber Band Ball',
    rarity: 'common',
    cost: 3,
    text: 'Dud wedges pay $40.',
    flavor: 'Someone kept every rubber band from every fan letter. There were four.',
    prop: 'ball',
    color: 0xb84a3a,
    hooks: {
      onPrizeAwarded(c, e) {
        if (e.landedKind === 'dud') {
          e.add(40, 'BAND +$40');
          c.trigger('+$40');
        }
      },
    },
  },
  {
    id: 'coffee_ring',
    name: 'Coffee Ring',
    rarity: 'common',
    cost: 3,
    text: 'Your first manual Deposit each Deadline adds +$50 to the Vault.',
    flavor: 'A stain shaped like a mug that was never found.',
    prop: 'cup',
    color: 0x6b4428,
    hooks: {
      onDeposit(c, e) {
        if (!e.auto && e.firstThisDeadline) {
          e.bonusVault += 50;
          c.trigger('+$50 V');
        }
      },
    },
  },
  {
    id: 'pocket_lint',
    name: 'Pocket Lint',
    rarity: 'common',
    cost: 3,
    text: 'Token prizes give +1 extra Token.',
    flavor: 'Warm. Still warm. Why is it still warm.',
    prop: 'lint',
    color: 0x8f8aa0,
    hooks: {
      onPrizeAwarded(c, e) {
        let hit = false;
        for (const p of e.prizes) if (p.kind === 'token') {
          p.amount += 1;
          hit = true;
        }
        if (hit) c.trigger('+1 TOK');
      },
    },
  },
  {
    id: 'bent_nail',
    name: 'Bent Nail',
    rarity: 'common',
    cost: 3,
    text: 'Cash wedges worth less than $100 pay +$30.',
    flavor: 'Pulled from the set of a show that was cancelled during its own pilot.',
    prop: 'nail',
    color: 0x8a8a8a,
    hooks: {
      onCashPaid(c, e) {
        if (e.seg.kind === 'cash' && c.ops.cashValueOf(e.seg) < 100) {
          e.add(30, 'NAIL +$30');
          c.trigger('+$30');
        }
      },
    },
  },
  {
    id: 'cue_card',
    name: 'Cue Card',
    rarity: 'common',
    cost: 4,
    text: '+1 spin every Deadline.',
    flavor: 'It just says SMILE. The ink is newer than the card.',
    prop: 'card',
    color: 0xf1ead0,
    hooks: {},
    statics: { spinsPerDeadline: 1 },
  },
  {
    id: 'tip_jar',
    name: 'Tip Jar',
    rarity: 'common',
    cost: 3,
    text: 'Depositing $200 or more gives +1 Token.',
    flavor: 'Tips for the crew. The crew has not been seen since 1987.',
    prop: 'jar',
    color: 0xa7d0c4,
    hooks: {
      onDeposit(c, e) {
        if (!e.auto && e.amount >= 200) {
          c.ops.addTokens(1, 'tip jar');
          c.trigger('+1 TOK');
        }
      },
    },
  },
  {
    id: 'spare_bulb',
    name: 'Spare Bulb',
    rarity: 'common',
    cost: 3,
    text: 'Boost wedges give +×1.5 instead of +×1.',
    flavor: 'Hums when held. Lights when it wants to.',
    prop: 'bulb',
    color: 0xfff2a8,
    hooks: {
      onPrizeAwarded(c, e) {
        let hit = false;
        for (const p of e.prizes) if (p.kind === 'boost') {
          p.amount += 0.5;
          hit = true;
        }
        if (hit) c.trigger('+×0.5');
      },
    },
  },
  {
    id: 'lucky_sock',
    name: 'Lucky Sock',
    rarity: 'common',
    cost: 3,
    text: 'Every ECHO also gives +1 Token.',
    flavor: 'There was a matching one. There was a matching foot.',
    prop: 'sock',
    color: 0xd04a4a,
    hooks: {
      onCombo(c, e) {
        if (e.combo === 'echo') {
          c.ops.addTokens(1, 'lucky sock');
          c.trigger('+1 TOK');
        }
      },
    },
  },
  {
    id: 'lint_roller',
    name: 'Lint Roller',
    rarity: 'common',
    cost: 4,
    text: 'Mystery wedges never flip to Bankrupt.',
    flavor: 'Rolls up dust, hair, and bad outcomes.',
    prop: 'roller',
    color: 0x4a7fc0,
    hooks: {
      onMystery(c, e) {
        if (e.allowBankrupt) {
          e.allowBankrupt = false;
          c.trigger('SAFE');
        }
      },
    },
  },
  // ====================================================================== UNCOMMON ==
  {
    id: 'hollow_tooth',
    name: 'Hollow Tooth',
    rarity: 'uncommon',
    cost: 6,
    text: 'Bankrupt only takes half of the Tray.',
    flavor: 'Something was hidden in it. Something still is.',
    prop: 'tooth',
    color: 0xf0ead8,
    hooks: {
      onBankrupt(c, e) {
        if (!e.blocked && e.keepFrac < 0.5) {
          e.keepFrac = 0.5;
          c.trigger('KEEP 50%');
        }
      },
    },
  },
  {
    id: 'snake_eyes',
    name: 'Snake Eyes',
    rarity: 'uncommon',
    cost: 6,
    text: 'ECHO pays ×4 instead of ×2.',
    flavor: 'Two dice, both ones, both warm, both watching.',
    prop: 'dice',
    color: 0xf5f5f5,
    hooks: {
      onCombo(c, e) {
        if (e.combo === 'echo') {
          e.comboMult = Math.max(e.comboMult, 4);
          c.trigger('ECHO ×4');
        }
      },
    },
  },
  {
    id: 'neighbors_envy',
    name: "Neighbor's Envy",
    rarity: 'uncommon',
    cost: 6,
    text: 'Cash wedges also pay 25% of both neighbouring Cash wedges.',
    flavor: 'The grass is greener. The grass is also screaming.',
    prop: 'fence',
    color: 0x5fae4a,
    hooks: {
      onCashPaid(c, e) {
        if (!e.isCash) return;
        const L = c.ops.layout();
        const n = L.segments.length;
        const prev = L.segments[(e.seg.idx - 1 + n) % n];
        const next = L.segments[(e.seg.idx + 1) % n];
        let sum = 0;
        for (const s of [prev, next]) if (s.kind === 'cash' || s.kind === 'cursedCash') sum += c.ops.cashValueOf(s) * 0.25;
        sum = Math.round(sum);
        if (sum > 0) {
          e.add(sum, `ENVY +$${sum}`);
          c.trigger(`+$${sum}`);
        }
      },
    },
  },
  {
    id: 'iron_nerve',
    name: 'Iron Nerve',
    rarity: 'uncommon',
    cost: 6,
    text: 'Once per Deadline, depositing keeps your Streak.',
    flavor: 'A tiny iron heart. It does not beat. It does not need to.',
    prop: 'heart',
    color: 0x6a6a72,
    hooks: {
      onDeadlineStart(c) {
        c.inst.state.used = 0;
      },
      onDeposit(c, e) {
        if (!e.auto && !c.inst.state.used && c.run.streak > 1) {
          c.inst.state.used = 1;
          e.keepStreak = true;
          c.trigger('STREAK KEPT');
        }
      },
    },
  },
  {
    id: 'hot_hand',
    name: 'Hot Hand',
    rarity: 'uncommon',
    cost: 6,
    text: 'Each Cash hit permanently adds +$10 to that wedge.',
    flavor: 'The glove is still warm. The glove is always warm.',
    prop: 'hand',
    color: 0xe0612a,
    hooks: {
      onCashPaid(c, e) {
        if (e.seg.kind === 'cash' || e.seg.kind === 'cursedCash') {
          const w = c.ops.wedgeByUid(e.seg.uid);
          if (w && w.kind !== 'splitter') {
            w.bonus += 10;
            c.trigger('+$10 FOREVER');
          }
        }
      },
    },
  },
  {
    id: 'glass_eye',
    name: 'Glass Eye',
    rarity: 'uncommon',
    cost: 7,
    text: 'Once per Deadline, preview where the wheel will land before you release the lever.',
    flavor: 'It sees the future. It is not impressed.',
    prop: 'eye',
    color: 0xdfe8f0,
    hooks: {
      onDeadlineStart(c) {
        c.inst.state.used = 0;
      },
      onSpinCharge(c, e) {
        if (!c.inst.state.used) e.preview = true;
      },
    },
  },
  {
    id: 'gilded_clapper',
    name: 'Gilded Clapper',
    rarity: 'uncommon',
    cost: 6,
    text: 'Jackpot wedges are 3° wider.',
    flavor: 'From the bell they rang for winners. They rang it twice.',
    prop: 'bell',
    color: 0xf2c230,
    hooks: {},
    statics: {
      widthMods(m) {
        m.add.jackpot = (m.add.jackpot ?? 0) + 3;
      },
    },
  },
  {
    id: 'loaded_flapper',
    name: 'Loaded Flapper',
    rarity: 'uncommon',
    cost: 6,
    text: 'The pegs around Bankrupt let the wheel slip past — it tends to drag on through.',
    flavor: 'Weighted with something heavy and wet.',
    prop: 'flapper',
    color: 0x5a3320,
    hooks: {
      onSpinCharge(_c, e) {
        const n = e.segments.length;
        for (const s of e.segments) {
          if (s.kind === 'bankrupt') {
            e.physics.glide[s.idx] = true;
            e.physics.slippery[s.idx] = true; // peg at this segment's start
            e.physics.slippery[(s.idx + 1) % n] = true; // peg at its end
          }
        }
      },
    },
  },
  {
    id: 'metronome',
    name: 'Metronome',
    rarity: 'uncommon',
    cost: 6,
    text: 'Streak grows +0.35 per spin instead of +0.25.',
    flavor: 'Tick. Tick. Tick. It keeps time for the audience.',
    prop: 'metronome',
    color: 0x7a4a2a,
    hooks: {},
    statics: { streakStepAdd: 0.1 },
  },
  {
    id: 'applause_sign',
    name: 'Applause Sign',
    rarity: 'uncommon',
    cost: 5,
    text: 'HAT TRICK also gives +2 Tokens and $100.',
    flavor: 'It lights up on its own. The audience obeys.',
    prop: 'sign',
    color: 0xff4a3a,
    hooks: {
      onCombo(c, e) {
        if (e.combo === 'hatTrick') {
          c.ops.addTokens(2, 'applause');
          e.add(100, 'APPLAUSE +$100');
          c.trigger('+2 TOK +$100');
        }
      },
    },
  },
  {
    id: 'tv_dinner',
    name: 'TV Dinner',
    rarity: 'uncommon',
    cost: 5,
    text: 'Each Deadline starts with +$100 in the Vault.',
    flavor: 'Salisbury steak. Expiry date: TOMORROW (no year given).',
    prop: 'tray',
    color: 0xb0b0b8,
    hooks: {
      onDeadlineStart(c) {
        c.ops.addVault(100, 'tv dinner');
        c.trigger('+$100 V');
      },
    },
  },
  {
    id: 'velvet_rope',
    name: 'Velvet Rope',
    rarity: 'uncommon',
    cost: 5,
    text: 'Tax wedges pay $100 instead of taxing you.',
    flavor: 'VIPs only. You are, apparently, a VIP.',
    prop: 'rope',
    color: 0x8a1a2a,
    hooks: {
      onPrizeAwarded(c, e) {
        let hit = 0;
        for (const p of e.prizes) if (p.kind === 'tax' && p.amount > 0) {
          p.amount = 0;
          hit++;
        }
        if (hit) {
          e.add(100 * hit, `ROPE +$${100 * hit}`);
          c.trigger('TAX → +$100');
        }
      },
    },
  },
  {
    id: 'horseshoe_magnet',
    name: 'Horseshoe Magnet',
    rarity: 'uncommon',
    cost: 6,
    text: 'Cash pays +$15 for every +0.25 of Streak above ×1.',
    flavor: 'It pulls coins. It pulls fillings. It pulls you, slightly, toward the wheel.',
    prop: 'magnet',
    color: 0xc0302a,
    hooks: {
      onCashPaid(c, e) {
        const steps = Math.floor((c.run.streak - 1) / 0.25 + 1e-6);
        if (e.isCash && steps > 0) {
          const add = 15 * steps;
          e.add(add, `MAGNET +$${add}`);
          c.trigger(`+$${add}`);
        }
      },
    },
  },
  {
    id: 'receipt',
    name: 'Crumpled Receipt',
    rarity: 'uncommon',
    cost: 5,
    text: 'After paying a Debt, gain +1 Token per $250 of surplus (max 4).',
    flavor: 'ITEM: 1 SOUL (USED). PAID IN FULL. NO RETURNS.',
    prop: 'receipt',
    color: 0xf4f0e0,
    hooks: {
      onDeadlineEnd(c, e) {
        if (e.paid) {
          const n = Math.min(4, Math.floor(e.surplus / 250));
          if (n > 0) {
            c.ops.addTokens(n, 'receipt');
            c.trigger(`+${n} TOK`);
          }
        }
      },
    },
  },
  {
    id: 'ventriloquist',
    name: "Ventriloquist's Dummy",
    rarity: 'uncommon',
    cost: 5,
    text: 'Respin wedges also give Streak +0.5.',
    flavor: 'Its lips move when the host talks. The host does not have lips.',
    prop: 'puppet',
    color: 0xc08a5a,
    hooks: {
      onPrizeAwarded(c, e) {
        const n = e.prizes.filter((p) => p.kind === 'respin').length;
        if (n > 0) {
          c.ops.addStreak(0.5 * n);
          c.trigger(`STREAK +${0.5 * n}`);
        }
      },
    },
  },
  {
    id: 'pawn_ticket',
    name: 'Pawn Ticket',
    rarity: 'uncommon',
    cost: 5,
    text: 'Artifacts sell for full price instead of half.',
    flavor: 'Claim by: never.',
    prop: 'ticket',
    color: 0xe0c070,
    hooks: {},
    statics: { sellMult: 2 },
  },
  // ========================================================================== RARE ==
  {
    id: 'understudy',
    name: 'The Understudy',
    rarity: 'rare',
    cost: 9,
    text: 'Copies the artifact to its right.',
    flavor: 'Knows every line. Has been waiting a very long time.',
    prop: 'mask',
    color: 0xe8e2d0,
    hooks: {},
  },
  {
    id: 'static',
    name: 'Static',
    rarity: 'rare',
    cost: 8,
    text: 'Every 5th spin, a random wedge becomes a Jackpot for that spin.',
    flavor: 'A jar of snow from channel 0.',
    prop: 'tv',
    color: 0xb0b0b0,
    hooks: {},
  },
  {
    id: 'cracked_mirror',
    name: 'Cracked Mirror',
    rarity: 'rare',
    cost: 7,
    text: 'Inner ring ×0 becomes ×2 — but ×3 becomes ×0.',
    flavor: 'Seven years of bad luck, paid in advance.',
    prop: 'mirror',
    color: 0xcfe0e8,
    hooks: {},
    statics: {
      ringMod: (ring) => ring.map((m) => (m === 0 ? 2 : m === 3 ? 0 : m)),
    },
  },
  {
    id: 'second_ring',
    name: 'Second Ring',
    rarity: 'rare',
    cost: 9,
    text: 'Adds a ×5 segment to the inner ring.',
    flavor: 'Found inside the first ring. The first ring was inside a contestant.',
    prop: 'ring',
    color: 0xf2c230,
    hooks: {},
    statics: {
      ringMod: (ring) => [...ring, 5],
    },
  },
  {
    id: 'golden_mic',
    name: 'Golden Mic',
    rarity: 'rare',
    cost: 8,
    text: 'Jackpots pay ×2.',
    flavor: 'Still picking up a voice. Nobody is speaking.',
    prop: 'mic',
    color: 0xf2c230,
    hooks: {
      onCashPaid(c, e) {
        if (e.seg.kind === 'jackpot') {
          e.mult(2, 'MIC ×2');
          c.trigger('×2');
        }
      },
    },
  },
  {
    id: 'trapdoor_lever',
    name: 'Trapdoor Lever',
    rarity: 'rare',
    cost: 8,
    text: 'Once per run, survive a missed payment. The lever breaks.',
    flavor: 'Pull it the other way.',
    prop: 'lever',
    color: 0xa03020,
    hooks: {
      onMissedPayment(c) {
        if (c.inst.state.used) return false;
        c.inst.state.used = 1;
        c.trigger('SAVED!');
        return true;
      },
    },
  },
  {
    id: 'laugh_track',
    name: 'Laugh Track',
    rarity: 'rare',
    cost: 8,
    text: 'Every combo also multiplies Cash ×1.5 (or pays $50 on a prize spin).',
    flavor: 'A reel of 1962 laughter. Some of them stop laughing partway.',
    prop: 'reel',
    color: 0x3a3a40,
    hooks: {
      onCombo(c, e) {
        if (e.isCash && e.cash > 0) {
          e.comboMult *= 1.5;
          c.trigger('×1.5');
        } else {
          e.add(50, 'LAUGHS +$50');
          c.trigger('+$50');
        }
      },
    },
  },
  {
    id: 'producers_pen',
    name: "Producer's Pen",
    rarity: 'rare',
    cost: 7,
    text: 'Boost wedges give +×2 instead of +×1.',
    flavor: 'Signs anything. Has signed you.',
    prop: 'pen',
    color: 0x202020,
    hooks: {
      onPrizeAwarded(c, e) {
        let hit = false;
        for (const p of e.prizes) if (p.kind === 'boost') {
          p.amount += 1;
          hit = true;
        }
        if (hit) c.trigger('+×1');
      },
    },
  },
  {
    id: 'crystal_tube',
    name: 'Crystal Tube',
    rarity: 'rare',
    cost: 7,
    text: 'Your Streak multiplier also applies to Token prizes.',
    flavor: 'A vacuum tube with a tiny, lit, crystal city inside.',
    prop: 'tube',
    color: 0x9fe0ff,
    hooks: {
      onPrizeAwarded(c, e) {
        if (c.run.streak <= 1) return;
        let hit = false;
        for (const p of e.prizes) if (p.kind === 'token' && p.scalable) {
          p.amount = Math.round(p.amount * c.run.streak);
          hit = true;
        }
        if (hit) c.trigger(`TOK ×${c.run.streak.toFixed(2)}`);
      },
    },
  },
  {
    id: 'rabbit_ears',
    name: 'Rabbit Ears',
    rarity: 'rare',
    cost: 7,
    text: 'Inner ring ×0 segments become ×1.',
    flavor: 'Point them toward the basement for better reception.',
    prop: 'antenna',
    color: 0x9a9aa0,
    hooks: {},
    statics: {
      ringMod: (ring) => ring.map((m) => (m === 0 ? 1 : m)),
    },
  },
  {
    id: 'missing_letter',
    name: "The Missing 'A'",
    rarity: 'rare',
    cost: 8,
    text: 'Cash wedges worth $200 or more pay ×1.5.',
    flavor: 'Fell off the marquee: "DE D AIR". Nobody fixed it. Nobody could reach.',
    prop: 'letter',
    color: 0xffd040,
    hooks: {
      onCashPaid(c, e) {
        if ((e.seg.kind === 'cash' || e.seg.kind === 'cursedCash' || e.seg.kind === 'jackpot') && c.ops.cashValueOf(e.seg) >= 200) {
          e.mult(1.5, "'A' ×1.5");
          c.trigger('×1.5');
        }
      },
    },
  },
  // ======================================================================== CURSED ==
  {
    id: 'rabbits_foot',
    name: "Rabbit's Foot",
    rarity: 'cursed',
    cost: 3,
    text: '+2 spins every Deadline. Adds a Bankrupt wedge.',
    flavor: 'Lucky for you. Not for the rabbit. Not for the next one, either.',
    prop: 'foot',
    color: 0xd8c8b0,
    hooks: {
      onAcquire(c) {
        c.ops.insertWedgeRandom('bankrupt', 0, (k) => k === 'dud' || k === 'cash');
        c.trigger('+BANKRUPT');
      },
    },
    statics: { spinsPerDeadline: 2 },
  },
  {
    id: 'collectors_card',
    name: "Collector's Card",
    rarity: 'cursed',
    cost: 4,
    text: 'Debt −20%. Tax wedges are triple width.',
    flavor: 'Mint condition. The contestant on it is still smiling. Still.',
    prop: 'card',
    color: 0x4a8ad0,
    hooks: {},
    statics: {
      debtMult: 0.8,
      widthMods(m) {
        m.mult.tax = (m.mult.tax ?? 1) * 3;
      },
    },
  },
  {
    id: 'monkey_paw',
    name: "Monkey's Paw",
    rarity: 'cursed',
    cost: 4,
    text: 'All Cash wedges are worth ×1.5. Bankrupt wedges are double width.',
    flavor: 'Three fingers left. You wished for money, didn\'t you.',
    prop: 'paw',
    color: 0x5a4030,
    hooks: {},
    statics: {
      cashBaseMult: 1.5,
      widthMods(m) {
        m.mult.bankrupt = (m.mult.bankrupt ?? 1) * 2;
      },
    },
  },
  {
    id: 'black_cat',
    name: 'Black Cat',
    rarity: 'cursed',
    cost: 3,
    text: 'Cash pays +$50. Mystery always flips to Bankrupt.',
    flavor: 'It crossed your path. Then it crossed it again, slower.',
    prop: 'cat',
    color: 0x151515,
    hooks: {
      onCashPaid(c, e) {
        if (e.isCash) {
          e.add(50, 'CAT +$50');
          c.trigger('+$50');
        }
      },
      onMystery(c, e) {
        e.forceBankrupt = true;
        c.trigger('HISS');
      },
    },
  },
  {
    id: 'ouija_board',
    name: 'Ouija Board',
    rarity: 'cursed',
    cost: 4,
    text: 'Jackpot wedges are 6° wider. Every Deposit loses 10% of the Tray.',
    flavor: 'It spells the same word every night: SPIN.',
    prop: 'board',
    color: 0xc8a060,
    hooks: {
      onDeposit(c, e) {
        if (e.amount > 0) {
          e.lossFrac += 0.1;
          c.trigger('−10%');
        }
      },
    },
    statics: {
      widthMods(m) {
        m.add.jackpot = (m.add.jackpot ?? 0) + 6;
      },
    },
  },
  {
    id: 'mannequin_hand',
    name: 'Mannequin Hand',
    rarity: 'cursed',
    cost: 4,
    text: 'Depositing never resets your Streak — but every Deposit loses 15% of the Tray.',
    flavor: 'It holds yours when you are not looking.',
    prop: 'hand',
    color: 0xe8d0b8,
    hooks: {
      onDeposit(c, e) {
        if (e.auto) return;
        e.keepStreak = true;
        if (e.amount > 0) e.lossFrac += 0.15;
        c.trigger('KEEP STREAK −15%');
      },
    },
  },
  {
    id: 'cracked_vhs',
    name: 'Cracked VHS',
    rarity: 'cursed',
    cost: 3,
    text: '+1 Token every spin. Inner ring ×2 segments become ×1.',
    flavor: 'Label: "DO NOT AIR". Someone aired it.',
    prop: 'vhs',
    color: 0x202028,
    hooks: {
      onSpinResolved(c) {
        c.ops.addTokens(1, 'vhs');
        c.trigger('+1 TOK');
      },
    },
    statics: {
      ringMod: (ring) => ring.map((m) => (m === 2 ? 1 : m)),
    },
  },
  {
    id: 'dead_mans_watch',
    name: "Dead Man's Watch",
    rarity: 'cursed',
    cost: 4,
    text: '+3 spins every Deadline. Debt +15%.',
    flavor: 'Borrowed time. The interest is brutal.',
    prop: 'watch',
    color: 0x8a7040,
    hooks: {},
    statics: { spinsPerDeadline: 3, debtMult: 1.15 },
  },
  {
    id: 'severance_check',
    name: 'Severance Check',
    rarity: 'cursed',
    cost: 2,
    text: 'Gain $300 in the Vault each Deadline. Your Tokens are capped at 6.',
    flavor: 'Pay to the order of: THE CONTESTANT. Memo: for your trouble.',
    prop: 'receipt',
    color: 0x9ad09a,
    hooks: {
      onDeadlineStart(c) {
        c.ops.addVault(300, 'severance');
        if (c.run.tokens > 6) c.run.tokens = 6;
        c.trigger('+$300 V');
      },
      onSpinResolved(c) {
        if (c.run.tokens > 6) {
          c.run.tokens = 6;
          c.trigger('TOK CAP 6');
        }
      },
    },
  },
];

export const ARTIFACTS: readonly ArtifactDef[] = A;
export const ARTIFACT_MAP: Record<string, ArtifactDef> = Object.fromEntries(A.map((a) => [a.id, a]));

export function artifactDef(id: string): ArtifactDef {
  const d = ARTIFACT_MAP[id];
  if (!d) throw new Error(`Unknown artifact ${id}`);
  return d;
}

export function artifactsByRarity(r: Rarity): ArtifactDef[] {
  return A.filter((a) => a.rarity === r);
}

/** Artifacts locked until meta unlocks (see game/meta.ts). */
export const LOCKED_ARTIFACTS: readonly string[] = [
  'understudy',
  'second_ring',
  'golden_mic',
  'laugh_track',
  'missing_letter',
  'crystal_tube',
  'dead_mans_watch',
  'severance_check',
  'static',
  'snake_eyes',
];
