import { describe, expect, it } from 'vitest';
import { ARTIFACTS } from '../src/content/artifacts';
import { BARGAINS, PRODUCER_INTROS } from '../src/content/bargains';
import { DEADLINE_LINES, HOST_LINES, HOST_SILENT_LINES, PRODUCER_ACCEPT, PRODUCER_HANGUP, SECRET_ACCEPT } from '../src/content/hostLines';
import { MUTATORS } from '../src/content/mutators';
import { SCRATCH_CARDS } from '../src/content/scratchCards';
import { WEDGES, WEDGE_KINDS } from '../src/content/wedges';
import { COMBO_TEXT, COMBO_NAMES } from '../src/game/combos';
import { supportsGlyph } from '../src/ui/bitfont';

/** Every string that is drawn with the in-world bitmap font (captions, marquee, tooltips, cards). */
function bitmapStrings(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const k of WEDGE_KINDS) {
    const w = WEDGES[k];
    out.push({ where: `wedge ${k} name`, text: w.name }, { where: `wedge ${k} glyph`, text: w.glyph }, { where: `wedge ${k} text`, text: w.text });
  }
  for (const a of ARTIFACTS) out.push({ where: `artifact ${a.id}`, text: `${a.name} ${a.text} ${a.flavor}` });
  for (const b of BARGAINS) out.push({ where: `bargain ${b.id}`, text: `${b.line} ${b.deal}` });
  for (const s of SCRATCH_CARDS) out.push({ where: `scratch ${s.id}`, text: `${s.name} ${s.text}` });
  for (const m of MUTATORS) out.push({ where: `mutator ${m.id}`, text: `${m.name} ${m.text}` });
  for (const [k, lines] of Object.entries(HOST_LINES)) for (const l of lines) out.push({ where: `host ${k}`, text: l });
  for (const l of HOST_SILENT_LINES) out.push({ where: 'host silent', text: l });
  for (const l of Object.values(PRODUCER_INTROS).flat()) out.push({ where: 'producer intro', text: l });
  for (const l of [...DEADLINE_LINES, ...PRODUCER_ACCEPT, ...PRODUCER_HANGUP, SECRET_ACCEPT]) out.push({ where: 'host/producer extra', text: l });
  for (const [k, v] of Object.entries(COMBO_TEXT)) out.push({ where: `combo ${k}`, text: `${COMBO_NAMES[k as keyof typeof COMBO_NAMES]} ${v}` });
  return out;
}

describe('in-world font coverage', () => {
  it('every character in canvas-drawn content has a glyph (no silent "?" substitutions)', () => {
    const missing: string[] = [];
    for (const { where, text } of bitmapStrings()) {
      // Phone offers fill {placeholders} at runtime; check the rendered result, not the template.
      const rendered = text.replace(/\{\w+\}/g, 'X');
      for (const ch of new Set(rendered)) if (!supportsGlyph(ch)) missing.push(`${where}: "${ch}" (U+${ch.codePointAt(0)!.toString(16)})`);
    }
    expect(missing).toEqual([]);
  });
});
