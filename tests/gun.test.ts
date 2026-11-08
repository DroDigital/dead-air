import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/run';
import { BALANCE } from '../src/game/balance';
import { makeWedge } from '../src/game/shop';
import { RING, k, makeGame, wheelWith } from './helpers';

describe('the gun', () => {
  it('places a narrow gun wedge on the standard wheel', () => {
    const g = Game.newRun({ seed: 'width', stake: 0, startWheel: 'standard' });
    expect(g.run.wheel.find((w) => w.kind === 'gun')?.width).toBe(BALANCE.jackpotWidth);
    expect(makeWedge('gun', 1, g.rng.shop).width).toBe(BALANCE.jackpotWidth);
    expect(g.layout().segments.reduce((total, s) => total + s.end - s.start, 0)).toBeCloseTo(360);
  });
  it('ends the run on a loaded chamber, including on the last spin', () => {
    const g = makeGame(wheelWith(k('gun')));
    g.run.spinsLeft = 1;
    const events: unknown[] = [];
    g.bus.on('horror', (e) => events.push(e));
    g.rng.events.float = () => 0;
    g.spinForced(0, RING.x1);
    expect(events).toContainEqual({ type: 'gunshot', hit: true, afterJump: false });
    expect(g.run.phase).toBe('GameOver');
    expect(g.run.endedAt).toBe(g.run.deadline);
    expect(g.run.deadlines).toHaveLength(0);
  });

  it('survives an empty chamber and resumes play', () => {
    const g = makeGame(wheelWith(k('gun')));
    const events: unknown[] = [];
    g.bus.on('horror', (e) => events.push(e));
    g.rng.events.float = () => 1 / 6;
    g.spinForced(0, RING.x1);
    expect(events).toContainEqual({ type: 'gunshot', hit: false, afterJump: false });
    expect(g.run.phase).toBe('AwaitAction');
  });

  it('replays the same chamber from a saved random state', () => {
    const g = makeGame(wheelWith(k('gun')), { seed: 'gun replay' });
    const restored = Game.fromState(g.snapshot());
    const a: unknown[] = [], b: unknown[] = [];
    g.bus.on('horror', (e) => a.push(e));
    restored.bus.on('horror', (e) => b.push(e));
    g.spinForced(0, RING.x1);
    restored.spinForced(0, RING.x1);
    expect(a).toEqual(b);
    expect(restored.snapshot()).toEqual(g.snapshot());
  });

  it('does not resolve a neighboring prize or queued choice after a fatal shot', () => {
    const g = makeGame(wheelWith(k('gun'), k('artifact')));
    g.rng.events.float = () => 0;
    g.spinForced(0, RING.x1, { boundaryDist: 0, neighborIndex: 1 });
    expect(g.run.phase).toBe('GameOver');
    expect(g.run.pending).toBeNull();
    expect(g.run.pendingQueue).toHaveLength(0);
  });

  it('pulls the trigger only once when a Doubler is active', () => {
    const g = makeGame(wheelWith(k('gun')));
    g.run.flags.doubler = 1;
    const events: unknown[] = [];
    g.bus.on('horror', (e) => events.push(e));
    g.rng.events.float = () => 0.9;
    g.spinForced(0, RING.x1);
    expect(events.filter((e) => (e as { type: string }).type === 'gunshot')).toHaveLength(1);
    expect(g.run.flags.doubler).toBe(1);
  });

  it('marks a Ring Jump shot as after the jump for presentation ordering', () => {
    const g = makeGame(wheelWith(k('gun'), k('ringJump')));
    g.rng.events.float = () => 0.9;
    const events: unknown[] = [];
    g.bus.on('horror', (e) => events.push(e));
    g.spinForced(0, RING.x1);
    g.spinForced(1, RING.x1);
    expect(events).toContainEqual({ type: 'gunshot', hit: false, afterJump: true });
  });
});
