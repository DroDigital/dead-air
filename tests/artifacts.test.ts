import { describe, expect, it } from 'vitest';
import { ARTIFACTS } from '../src/content/artifacts';
import { Game } from '../src/game/run';
import { RING, cash, k, makeGame, wheelWith } from './helpers';

describe('artifacts', () => {
  it('Lucky Penny: first spin of the Deadline pays ×3', () => {
    const g = makeGame(wheelWith(cash(100)), { artifacts: ['lucky_penny'] });
    const r = g.spinForced(0, RING.x1);
    expect(r.payout.cash).toBe(300);
    expect(r.triggers.map((t) => t.artifactId)).toContain('lucky_penny');
    expect(g.spinForced(0, RING.x1).payout.cash).toBeLessThan(300);
  });

  it('modifiers resolve in slot order (left → right)', () => {
    // Bent Nail (+30 for <$100) then Lucky Penny (×3) vs the reverse.
    const a = makeGame(wheelWith(cash(50)), { artifacts: ['bent_nail', 'lucky_penny'] });
    const b = makeGame(wheelWith(cash(50)), { artifacts: ['lucky_penny', 'bent_nail'] });
    expect(a.spinForced(0, RING.x1).payout.cash).toBe((50 + 30) * 3);
    expect(b.spinForced(0, RING.x1).payout.cash).toBe(50 * 3 + 30);
  });

  it('reordering the shelf changes the order', () => {
    const g = makeGame(wheelWith(cash(50)), { artifacts: ['lucky_penny', 'bent_nail'] });
    g.moveArtifact(1, 0);
    expect(g.run.artifacts.map((a) => a.id)).toEqual(['bent_nail', 'lucky_penny']);
    expect(g.spinForced(0, RING.x1).payout.cash).toBe(240);
  });

  it('The Understudy copies the artifact to its right', () => {
    const g = makeGame(wheelWith(cash(100)), { artifacts: ['understudy', 'lucky_penny'] });
    const r = g.spinForced(0, RING.x1);
    expect(r.payout.cash).toBe(900);
    expect(r.triggers.filter((t) => t.text === '×3')).toHaveLength(2);
    expect(r.triggers[0].artifactId).toBe('understudy');
  });

  it('The Understudy at the far right does nothing', () => {
    const g = makeGame(wheelWith(cash(100)), { artifacts: ['lucky_penny', 'understudy'] });
    expect(g.spinForced(0, RING.x1).payout.cash).toBe(300);
  });

  it('Hollow Tooth: bankrupt keeps 50% of the Tray', () => {
    const g = makeGame(wheelWith(k('bankrupt')), { artifacts: ['hollow_tooth'] });
    g.run.tray = 300;
    g.spinForced(0, RING.x1);
    expect(g.run.tray).toBe(150);
  });

  it("Rabbit's Foot: +2 spins and adds a Bankrupt", () => {
    const g = Game.newRun({ seed: 'rf', stake: 0, startWheel: 'standard' });
    const before = g.run.wheel.filter((w) => w.kind === 'bankrupt').length;
    g.grantArtifact('rabbits_foot');
    expect(g.run.wheel.filter((w) => w.kind === 'bankrupt').length).toBe(before + 1);
    g.choosePackage('standard');
    expect(g.run.spinsLeft).toBe(10);
  });

  it('Snake Eyes: ECHO pays ×4', () => {
    const g = makeGame(wheelWith(cash(100), cash(100)), { artifacts: ['snake_eyes'] });
    g.spinForced(0, RING.x1);
    expect(g.spinForced(1, RING.x1).payout.cash).toBe(Math.round(100 * 1.25 * 4));
  });

  it("Neighbor's Envy: cash pays 25% of both cash neighbours", () => {
    const g = makeGame([cash(200), cash(100), cash(200), ...wheelWith().slice(3)], { artifacts: ['neighbors_envy'] });
    expect(g.spinForced(1, RING.x1).payout.cash).toBe(100 + 50 + 50);
  });

  it('Iron Nerve: once per Deadline, deposit keeps the Streak', () => {
    const g = makeGame(wheelWith(cash(100)), { artifacts: ['iron_nerve'] });
    g.spinForced(0, RING.x1);
    g.spinForced(0, RING.x1);
    g.deposit();
    expect(g.run.streak).toBe(1.5);
    g.spinForced(0, RING.x1);
    g.deposit();
    expect(g.run.streak).toBe(1);
  });

  it('Piggy Bank: Vault +1% per spin', () => {
    const g = makeGame(wheelWith(), { artifacts: ['piggy_bank'] });
    g.run.vault = 1000;
    g.spinForced(0, RING.x1);
    expect(g.run.vault).toBe(1010);
  });

  it('Tooth Fairy: +2 Tokens per Bankrupt', () => {
    const g = makeGame(wheelWith(k('bankrupt')), { artifacts: ['tooth_fairy'] });
    const t = g.run.tokens;
    g.spinForced(0, RING.x1);
    expect(g.run.tokens).toBe(t + 2);
  });

  it('Gilded Clapper: Jackpot is 3° wider', () => {
    const specs = wheelWith({ kind: 'jackpot', value: 1000, width: 6 });
    const a = makeGame(specs);
    const b = makeGame(specs, { artifacts: ['gilded_clapper'] });
    const wa = a.layout().segments[0];
    const wb = b.layout().segments[0];
    expect(wb.end - wb.start).toBeGreaterThan(wa.end - wa.start + 2.5);
  });

  it('Cracked Mirror: ×0 → ×2 and ×3 → ×0', () => {
    const g = makeGame(wheelWith(cash(100)), { artifacts: ['cracked_mirror'] });
    expect(g.effectiveRing()).toEqual([1, 2, 1, 2, 1, 0, 1, 2]);
  });

  it('Second Ring adds a ×5 segment', () => {
    const g = makeGame(wheelWith(cash(100)), { artifacts: ['second_ring'] });
    const ring = g.effectiveRing();
    expect(ring).toHaveLength(9);
    expect(g.spinForced(0, 8).payout.cash).toBe(500);
  });

  it("Collector's Card: Debt −20% and Tax triple width", () => {
    const g = Game.newRun({ seed: 'cc', stake: 0, startWheel: 'standard' });
    const d = g.run.debt;
    const taxW = () => {
      const s = g.layout().segments.find((x) => x.kind === 'tax')!;
      return s.end - s.start;
    };
    const w0 = taxW();
    g.grantArtifact('collectors_card');
    expect(g.run.debt).toBe(Math.round((d * 0.8) / 50) * 50);
    expect(taxW()).toBeGreaterThan(w0 * 2.5);
  });

  it('Hot Hand: each cash hit permanently adds +$10', () => {
    const g = makeGame(wheelWith(cash(100)), { artifacts: ['hot_hand'] });
    g.spinForced(0, RING.x1);
    expect(g.run.wheel[0].bonus).toBe(10);
  });

  it('House Edge: respins also pay $25', () => {
    const g = makeGame(wheelWith(k('respin')), { artifacts: ['house_edge'] });
    expect(g.spinForced(0, RING.x1).payout.cash).toBe(25);
  });

  it('Static: every 5th spin a random wedge becomes a Jackpot', () => {
    const g = makeGame(wheelWith(), { artifacts: ['static'] });
    for (let i = 0; i < 3; i++) g.spinForced(5, RING.x1);
    expect(g.run.overrides.some((o) => o.reason === 'static')).toBe(false);
    g.spinForced(5, RING.x1);
    expect(g.run.overrides.some((o) => o.reason === 'static' && o.kind === 'jackpot')).toBe(true);
  });

  it('Lint Roller: Mystery never flips to Bankrupt', () => {
    for (let i = 0; i < 25; i++) {
      const g = makeGame(wheelWith(k('mystery')), { seed: `lr${i}`, artifacts: ['lint_roller'] });
      expect(g.spinForced(0, RING.x1).payout.resolvedKind).not.toBe('bankrupt');
    }
  });

  it('Black Cat: Mystery always flips to Bankrupt, cash +$50', () => {
    const g = makeGame(wheelWith(k('mystery'), cash(100)), { artifacts: ['black_cat'] });
    expect(g.spinForced(1, RING.x1).payout.cash).toBe(150);
    expect(g.spinForced(0, RING.x1).payout.resolvedKind).toBe('bankrupt');
  });

  it('Velvet Rope: Tax pays $100 instead', () => {
    const g = makeGame(wheelWith(k('tax')), { artifacts: ['velvet_rope'] });
    g.run.vault = 1000;
    const r = g.spinForced(0, RING.x1);
    expect(g.run.vault).toBe(1000);
    expect(r.payout.cash).toBe(100);
  });

  it('Trapdoor Lever saves one missed payment and breaks', () => {
    const g = makeGame(wheelWith(), { artifacts: ['trapdoor_lever'], pkg: 'short' });
    while (g.run.phase === 'AwaitAction') g.spinForced(5, RING.x1);
    expect(g.run.phase).toBe('Conversion');
    expect(g.run.artifacts.some((a) => a.id === 'trapdoor_lever')).toBe(false);
  });

  it('every artifact can be granted and survives a spin of every common outcome', () => {
    for (const a of ARTIFACTS) {
      const g = makeGame(wheelWith(cash(100), k('bankrupt'), k('mystery'), k('token'), k('respin'), k('tax'), k('boost')), { seed: a.id });
      expect(g.grantArtifact(a.id)).toBe(true);
      for (let i = 0; i < 7 && g.run.phase === 'AwaitAction'; i++) {
        g.run.spinsLeft = Math.max(g.run.spinsLeft, 2);
        g.spinForced(i, i % 8);
        if (g.run.phase === 'ArtifactPick') g.pickArtifact(null);
        if (g.run.phase === 'PhoneCall') g.phoneHangUp();
      }
      g.deposit();
      expect(Number.isFinite(g.run.vault)).toBe(true);
    }
  });

  it('selling an artifact returns half its cost (Pawn Ticket: full)', () => {
    const g = makeGame(wheelWith(), { artifacts: ['metronome'] });
    const t = g.run.tokens;
    g.sellArtifact(0);
    expect(g.run.tokens).toBe(t + 3);
    const g2 = makeGame(wheelWith(), { artifacts: ['pawn_ticket', 'metronome'] });
    const t2 = g2.run.tokens;
    g2.sellArtifact(1);
    expect(g2.run.tokens).toBe(t2 + 6);
  });

  it('the shelf holds at most 6', () => {
    const g = makeGame(wheelWith());
    for (const id of ['lucky_penny', 'piggy_bank', 'stopwatch', 'tooth_fairy', 'house_edge', 'rubber_band']) expect(g.grantArtifact(id)).toBe(true);
    expect(g.grantArtifact('bent_nail')).toBe(false);
  });
});
