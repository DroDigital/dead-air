/** Stable id for a voiced line: FNV-1a of "speaker|text", base36. Shared by the VO tool and the game. */
export function voId(speaker: string, text: string): string {
  let h = 0x811c9dc5;
  const s = `${speaker}|${text}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
