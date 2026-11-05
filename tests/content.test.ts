import { describe, expect, it } from 'vitest';
import { ARTIFACTS } from '../src/content/artifacts';
import { HOST_LINES, allHostLines } from '../src/content/hostLines';
import { LORE } from '../src/content/lore';
import { MUTATORS } from '../src/content/mutators';
import { SCRATCH_CARDS } from '../src/content/scratchCards';
import { WEDGES, WEDGE_KINDS } from '../src/content/wedges';
import { STARTING_WHEELS } from '../src/content/wheels';
import { newMeta } from '../src/game/meta';
import { Game } from '../src/game/run';

describe('content integrity', () => {
  it('has at least 45 artifacts with unique ids and all four rarities', () => {
    expect(ARTIFACTS.length).toBeGreaterThanOrEqual(45);
    expect(new Set(ARTIFACTS.map((a) => a.id)).size).toBe(ARTIFACTS.length);
    for (const r of ['common', 'uncommon', 'rare', 'cursed']) expect(ARTIFACTS.some((a) => a.rarity === r)).toBe(true);
    for (const a of ARTIFACTS) {
      expect(a.text.length).toBeGreaterThan(5);
      expect(a.cost).toBeGreaterThan(0);
    }
  });

  it('includes every artifact the brief requires', () => {
    const ids = new Set(ARTIFACTS.map((a) => a.id));
    for (const id of [
      'lucky_penny', 'hollow_tooth', 'rabbits_foot', 'loaded_flapper', 'snake_eyes',
      'neighbors_envy', 'iron_nerve', 'piggy_bank', 'static', 'tooth_fairy', 'understudy', 'gilded_clapper',
      'cracked_mirror', 'collectors_card', 'hot_hand', 'house_edge', 'second_ring',
    ])
      expect(ids.has(id)).toBe(true);
  });

  it('has at least 20 wedge types', () => {
    expect(WEDGE_KINDS.length).toBeGreaterThanOrEqual(20);
    for (const k of WEDGE_KINDS) expect(WEDGES[k].kind).toBe(k);
  });

  it('has at least 6 scratch cards and several mutators', () => {
    expect(SCRATCH_CARDS.length).toBeGreaterThanOrEqual(6);
    expect(MUTATORS.length).toBeGreaterThanOrEqual(4);
  });

  it('has at least 80 host quips covering the required triggers', () => {
    expect(allHostLines().length).toBeGreaterThanOrEqual(80);
    for (const t of ['bankrupt', 'jackpot', 'streak', 'deposit', 'debtPaid', 'debtMissed', 'idle', 'artifact'] as const)
      expect(HOST_LINES[t].length).toBeGreaterThan(2);
  });

  it('has at least 20 lore notes, all evaluable', () => {
    expect(LORE.length).toBeGreaterThanOrEqual(20);
    const m = newMeta();
    for (const n of LORE) expect(typeof n.unlocked(m)).toBe('boolean');
  });

  it('every starting wheel has 24 wedges and builds a run', () => {
    for (const w of STARTING_WHEELS) {
      expect(w.wedges).toHaveLength(24);
      const g = Game.newRun({ seed: w.id, stake: 0, startWheel: w.id });
      expect(g.layout().segments.length).toBeGreaterThanOrEqual(24);
    }
  });
});
