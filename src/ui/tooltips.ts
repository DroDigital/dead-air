/**
 * In-world hover tooltip text for every pickable thing.
 */
import { artifactDef } from '../content/artifacts';
import { mutatorDef } from '../content/mutators';
import { scratchDef } from '../content/scratchCards';
import { WEDGES } from '../content/wedges';
import { BALANCE } from '../game/balance';
import type { Game } from '../game/run';
import { sellValue } from '../game/shop';
import type { Segment } from '../game/types';
import { mod360, segmentAt, ringSegmentAt } from '../game/wheel';
import { SERVICE_BUTTONS, type ServiceButton } from '../render/scene/cabinet';
import type { PickHit } from '../render/stage';

export function segmentLabel(g: Game, s: Segment): string {
  if (s.kind === 'cash' || s.kind === 'cursedCash' || s.kind === 'jackpot') return `$${Math.round(g.cashValueOf(s))}`;
  if (s.kind === 'token') return `+${Math.round(2 * (1 + BALANCE.gildMult * s.gild))} TOK`;
  return WEDGES[s.kind].glyph;
}

export function segmentTooltip(g: Game, s: Segment): string {
  const def = WEDGES[s.kind];
  const width = (s.end - s.start).toFixed(1);
  const val = def.cashLike && s.kind !== 'wild' ? ` $${Math.round(g.cashValueOf(s))}` : '';
  const gild = s.gild ? ` (GILDED ×${s.gild})` : '';
  const bonus = s.bonus ? ` +$${s.bonus} HOT` : '';
  const tmp = s.overridden ? '\n(TEMPORARY)' : '';
  return `${def.name.toUpperCase()}${val}${gild}${bonus}\n${def.text}\n${width}° WIDE${tmp}`;
}

/** Wheel-local angle from a UV hit on the wheel face. */
export function uvToLocalAngle(u: number, v: number): number {
  const x = u * 2 - 1,
    y = v * 2 - 1;
  return mod360((Math.atan2(x, y) * 180) / Math.PI);
}

export function tooltipFor(hit: PickHit, g: Game | null): string | null {
  const id = hit.id;
  if (!g) return null;
  const r = g.run;
  if (id === 'wheel' && hit.uv) {
    const L = g.layout();
    const s = L.segments[segmentAt(L, uvToLocalAngle(hit.uv.x, hit.uv.y))];
    return segmentTooltip(g, s);
  }
  if (id === 'ring' && hit.uv) {
    const ring = g.effectiveRing();
    const a = uvToLocalAngle(hit.uv.x, hit.uv.y);
    const i = ringSegmentAt(ring.length, -a);
    return `INNER RING ×${ring[i]}\nMultiplies Cash (with Boost) before the Streak.\nRING: ${ring.map((m) => `×${m}`).join(' ')}`;
  }
  if (id === 'tray') return `THE TRAY $${r.tray}\nAt-risk winnings. A Bankrupt empties it.\nSTREAK ×${r.streak.toFixed(2)} (cash only)`;
  if (id === 'vault') return `THE VAULT $${r.vault}\nSafe money. Pays the Debt.\nDEBT DUE $${r.debt}`;
  if (id === 'deposit') return `DEPOSIT [ENTER]\nSweep the Tray into the Vault.\nFree, costs no spin — resets your Streak.`;
  if (id.startsWith('scratch:')) {
    const i = Number(id.split(':')[1]);
    const card = r.scratch[i];
    if (!card) return 'EMPTY CARD SLOT';
    const d = scratchDef(card);
    return `${d.name.toUpperCase()} [${i + 1}]\n${d.text}\n${g.canUseScratch(i) ? 'CLICK TO SCRATCH' : 'NOT USABLE NOW'}`;
  }
  if (id.startsWith('artifact:')) {
    const i = Number(id.split(':')[1]);
    const a = r.artifacts[i];
    if (!a) return `EMPTY SHELF SLOT ${i + 1}`;
    const d = artifactDef(a.id);
    return `${d.name.toUpperCase()} (${d.rarity.toUpperCase()})\n${d.text}\n"${d.flavor}"\nSLOT ${i + 1} — SELL ${sellValue(d.cost, g.sellMult())} TOK`;
  }
  if (id === 'phone') return r.phase === 'PhoneCall' ? 'THE PHONE IS RINGING\n[ENTER] to answer' : 'A ROTARY PHONE\nIt only rings when the Producer wants something.';
  if (id === 'host') return 'YOUR HOST\nAlways smiling. Always.';
  if (id === 'lever') return `THE LEVER [SPACE]\nPull it to spin. Where the wheel lands is down to chance.\nSPINS LEFT ${r.spinsLeft}`;
  if (id === 'crank') return r.shop ? `THE CRANK [R]\nRotate new stock into view.\nCOST ${r.shop.freeRerolls > 0 ? 'FREE' : `${r.shop.rerollCost} TOK`}` : 'THE CRANK\nThe cabinet is closed.';
  if (id === 'services' && hit.uv) {
    const b: ServiceButton = SERVICE_BUTTONS[Math.min(5, (Math.min(2, Math.floor((1 - hit.uv.y) * 3)) * 2 + (hit.uv.x < 0.5 ? 0 : 1)))];
    const desc: Record<ServiceButton, string> = {
      remove: `REMOVE [X] — ${g.serviceCost('remove')} TOK\nTurn a wedge into a Dud. (Not Bankrupts: Network property.)`,
      gild: `GILD [G] — ${g.serviceCost('gild')} TOK\n+50% value on a Cash/Token/Interest wedge.`,
      widen: `WIDEN [+] — ${g.serviceCost('resize')} TOK\nA wedge gets 5° wider.`,
      narrow: `NARROW [-] — ${g.serviceCost('resize')} TOK\nA wedge gets 5° narrower.`,
      reroll: `REROLL [R]\nSame as the crank.`,
      done: 'DONE [N]\nClose the cabinet. On to the next Deadline.',
    };
    return desc[b];
  }
  if (id.startsWith('shop:')) {
    const i = Number(id.split(':')[1]);
    const it = r.shop?.items[i];
    if (!it) return 'EMPTY';
    if (it.sold) return 'SOLD';
    if (it.type === 'artifact') {
      const d = artifactDef(it.id);
      return `${d.name.toUpperCase()} — ${it.cost} TOK\n(${d.rarity.toUpperCase()}) ${d.text}\n"${d.flavor}"`;
    }
    if (it.type === 'scratch') {
      const d = scratchDef(it.id);
      return `SCRATCH CARD: ${d.name.toUpperCase()} — ${it.cost} TOK\n${d.text}`;
    }
    const wd = WEDGES[it.wedge!.kind];
    const v = it.wedge!.kind === 'cash' ? ` $${it.wedge!.value}` : '';
    const halves = it.wedge!.halves ? `\nHALVES: ${it.wedge!.halves.map((h) => WEDGES[h.kind].name + (h.kind === 'cash' ? ` $${h.value}` : '')).join(' | ')}` : '';
    return `WEDGE: ${wd.name.toUpperCase()}${v} — ${it.cost} TOK\n${wd.text}${halves}\nYou choose which wedge it replaces.`;
  }
  if (id === 'debtboard') {
    const m = mutatorDef(r.mutator);
    return `THE NETWORK\nDEBT DUE $${r.debt} — DEADLINE ${r.deadline}\nSPINS LEFT ${r.spinsLeft}${m ? `\nSWEEPS: ${m.name} — ${m.text}` : ''}`;
  }
  return null;
}
