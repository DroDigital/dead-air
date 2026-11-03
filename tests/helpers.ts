import { WEDGES } from '../src/content/wedges';
import { BALANCE } from '../src/game/balance';
import { Game } from '../src/game/run';
import type { WedgeKind } from '../src/game/types';

export interface Spec {
  kind: WedgeKind;
  value?: number;
  width?: number;
}

/** A fresh run with a custom wheel, already in AwaitAction (STANDARD package). */
export function makeGame(specs?: Spec[], opts: { seed?: string; ring?: number[]; artifacts?: string[]; pkg?: 'short' | 'standard' | 'marathon' } = {}): Game {
  const g = Game.newRun({ seed: opts.seed ?? 'T', stake: 0, startWheel: 'standard' });
  if (specs) {
    g.run.wheel = specs.map((s) =>
      g.newWedge(s.kind, s.value ?? WEDGES[s.kind].defaultValue, s.width ?? (s.kind === 'jackpot' ? BALANCE.jackpotWidth : BALANCE.baseWidth)),
    );
  }
  if (opts.ring) g.run.ring = [...opts.ring];
  for (const a of opts.artifacts ?? []) g.grantArtifact(a);
  g.choosePackage(opts.pkg ?? 'standard');
  return g;
}

/** 24 wedges: index 0 is `first`, the rest Dud. */
export function wheelWith(...first: Spec[]): Spec[] {
  const out: Spec[] = [...first];
  while (out.length < 24) out.push({ kind: 'dud' });
  return out;
}

export const cash = (value: number): Spec => ({ kind: 'cash', value });
export const k = (kind: WedgeKind): Spec => ({ kind });

/** Ring index of a given multiplier in the base ring [1,2,1,0,1,3,1,2]. */
export const RING = { x1: 0, x2: 1, x0: 3, x3: 5 };
