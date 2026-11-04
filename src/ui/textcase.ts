/**
 * Display case for the menus' title face. Many menu strings are written in capitals for the pixel
 * font ("QUIT TO TITLE (SAVED)"); Henny Penny reads much better in title case. Strings that
 * already contain lowercase letters are left exactly as written.
 */

/** Tokens that stay in capitals: keys, pad buttons, initialisms. */
const KEEP = new Set(['ESC', 'WASD', 'LB', 'RB', 'LT', 'RT', 'TV', 'OK', 'CRT', 'VHS', 'PS1', 'UI', 'FX', 'SFX', 'BGM', 'HP', 'ID', 'OFL', 'MIT', 'CC', 'CC0', 'GSAP', 'RPG', 'URL', 'HTML', 'USB', 'B', 'X', 'Y', 'E', 'F', 'D', 'G', 'N', 'R', 'II', 'III', 'IV']);
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);

export function displayCase(s: string): string {
  if (/[a-z]/.test(s) || !/[A-Z]{2}/.test(s)) return s;
  return s.replace(/[A-Z][A-Z'’]*/g, (word, offset: number) => {
    const prev = s[offset - 1];
    // Part of a token with digits or symbols (D1/8, X2, 3TOK): leave it.
    if (prev && /[0-9×$/]/.test(prev)) return word;
    const next = s[offset + word.length];
    if (next && /[0-9]/.test(next)) return word;
    // First word of the string, or of a sentence (after "." "!" "?" or ":").
    const before = s.slice(0, offset);
    const atStart = !/[A-Za-z0-9]/.test(before) || /[.!?:]\s+$/.test(before);
    if (KEEP.has(word) && (word.length > 1 || !atStart)) return word;
    const lower = word.toLowerCase();
    if (!atStart && SMALL.has(lower) && prev !== '"' && prev !== '“') return lower;
    return lower[0].toUpperCase() + lower.slice(1);
  });
}
