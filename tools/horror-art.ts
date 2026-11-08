/**
 * Icons for the horror wedges, drawn here as SVG in the art pack's rubber-hose style (thick
 * brown-black ink, cream / oxblood / mustard fills, grinning faces on objects) and rasterised
 * to 128 px PNGs by sharp. Called from tools/art.ts, so `npm run assets` rebuilds them.
 */
type Sharp = typeof import('sharp').default;

const INK = '#1c0a04';
const CREAM = '#f3dfb0';
const RED = '#b8241c';
const DARK_RED = '#6a0c08';
const MUSTARD = '#e2a52e';
const FLESH = '#e8a48c';
const STEEL = '#c4c8cc';
const STEEL_DARK = '#7a8086';
const WOOD = '#8a4a22';
const GREEN = '#5c8a46';

const stroke = `stroke="${INK}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"`;
const thin = `stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;

/** A blood drop hanging from (x, y). */
const drop = (x: number, y: number, s = 1) =>
  `<path d="M${x} ${y} C ${x - 9 * s} ${y + 14 * s}, ${x - 11 * s} ${y + 26 * s}, ${x} ${y + 30 * s} C ${x + 11 * s} ${y + 26 * s}, ${x + 9 * s} ${y + 14 * s}, ${x} ${y} Z" fill="${RED}" ${thin}/>` +
  `<ellipse cx="${x - 3 * s}" cy="${y + 20 * s}" rx="${2.5 * s}" ry="${4 * s}" fill="#ff9a88"/>`;

/** The highlight blob every icon on the sheet has. */
const shine = (x: number, y: number, rx = 10, ry = 5, rot = -30) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity="0.55" transform="rotate(${rot} ${x} ${y})"/>`;

const ICONS: Record<string, string> = {
  // Lips peeled back over too many teeth, a tongue lolling out, a coin on the way up.
  mouth: `
    <path d="M40 120 C 60 60, 196 60, 216 120 C 196 196, 60 196, 40 120 Z" fill="${RED}" ${stroke}/>
    <path d="M62 120 C 80 88, 176 88, 194 120 C 176 164, 80 164, 62 120 Z" fill="${DARK_RED}" ${thin}/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${74 + i * 19} ${104 - Math.sin((i / 5) * Math.PI) * 6} l9 20 l9 -20 Z" fill="${CREAM}" ${thin}/>`).join('')}
    ${[0, 1, 2, 3, 4].map((i) => `<path d="M${84 + i * 19} ${144 + Math.sin((i / 4) * Math.PI) * 6} l9 -18 l9 18 Z" fill="${CREAM}" ${thin}/>`).join('')}
    <path d="M118 140 C 112 170, 120 196, 134 200 C 150 204, 158 186, 150 156 Z" fill="#e2627a" ${thin}/>
    <path d="M134 160 L 136 186" stroke="${DARK_RED}" stroke-width="3"/>
    <circle cx="128" cy="44" r="20" fill="${MUSTARD}" ${thin}/>
    <text x="128" y="53" font-family="Georgia, serif" font-weight="bold" font-size="26" text-anchor="middle" fill="${INK}">$</text>
    ${drop(70, 150, 0.8)}
    ${shine(80, 92)}`,

  // A butcher's cleaver with a nasty grin on the blade and blood on the edge.
  cleaver: `
    <path d="M150 150 L 214 214" stroke="${INK}" stroke-width="30" stroke-linecap="round"/>
    <path d="M150 150 L 214 214" stroke="${WOOD}" stroke-width="18" stroke-linecap="round"/>
    <circle cx="186" cy="186" r="4" fill="${CREAM}"/><circle cx="204" cy="204" r="4" fill="${CREAM}"/>
    <path d="M40 60 L 150 30 L 176 132 L 66 162 Z" fill="${STEEL}" ${stroke}/>
    <path d="M66 162 L 176 132 L 172 118 L 62 148 Z" fill="${RED}" stroke="none"/>
    <path d="M66 162 L 176 132" ${stroke} fill="none"/>
    <circle cx="140" cy="56" r="11" fill="${STEEL_DARK}" ${thin}/>
    <ellipse cx="86" cy="92" rx="8" ry="11" fill="#fff" ${thin}/><circle cx="88" cy="95" r="4" fill="${INK}"/>
    <path d="M104 86 l 18 -6" ${thin}/>
    <path d="M84 120 C 98 132, 124 126, 134 108" fill="none" ${thin}/>
    ${drop(98, 152, 0.8)}${drop(150, 138, 0.6)}
    ${shine(70, 74)}`,

  // What the Cleaver left: a severed cross-section, bone in the middle, still leaking.
  stump: `
    <ellipse cx="128" cy="176" rx="90" ry="26" fill="${RED}" ${stroke}/>
    <path d="M58 90 L 58 160 C 70 186, 186 186, 198 160 L 198 90 Z" fill="${FLESH}" ${stroke}/>
    <ellipse cx="128" cy="90" rx="70" ry="30" fill="${RED}" ${stroke}/>
    <ellipse cx="128" cy="90" rx="50" ry="20" fill="#d84a44" stroke="none"/>
    <ellipse cx="128" cy="90" rx="20" ry="10" fill="${CREAM}" ${thin}/>
    <path d="M84 116 C 92 128, 100 124, 104 138" fill="none" stroke="${DARK_RED}" stroke-width="4"/>
    ${drop(76, 116, 0.9)}${drop(180, 112, 0.7)}
    <path d="M86 150 l 10 6 M 160 152 l -10 6" ${thin}/>
    ${shine(170, 78, 8, 4)}`,

  // A banknote with a gash across its grinning face, bleeding.
  bleeder: `
    <rect x="34" y="62" width="188" height="110" rx="10" fill="${GREEN}" ${stroke} transform="rotate(-8 128 117)"/>
    <rect x="52" y="78" width="152" height="78" rx="6" fill="#8ab46a" ${thin} transform="rotate(-8 128 117)"/>
    <circle cx="128" cy="116" r="30" fill="${CREAM}" ${thin}/>
    <circle cx="117" cy="108" r="5" fill="${INK}"/><circle cx="140" cy="106" r="5" fill="${INK}"/>
    <path d="M112 128 C 120 122, 136 122, 144 128" fill="none" ${thin}/>
    <path d="M60 150 L 196 74" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>
    <path d="M60 150 L 196 74" stroke="${RED}" stroke-width="6" stroke-linecap="round"/>
    ${drop(92, 140, 1)}${drop(150, 112, 0.8)}${drop(122, 170, 0.9)}
    ${shine(70, 80)}`,

  // A loose eyeball: bloodshot, red iris, trailing its nerve, staring straight at you.
  eye: `
    <path d="M150 196 C 170 214, 200 216, 226 230" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>
    <path d="M150 196 C 170 214, 200 216, 226 230" fill="none" stroke="#c84a5a" stroke-width="8" stroke-linecap="round"/>
    <circle cx="120" cy="116" r="86" fill="#fbf1dc" ${stroke}/>
    ${[
      'M50 90 C 70 100, 74 112, 88 110',
      'M60 160 C 74 150, 84 152, 92 140',
      'M190 76 C 176 90, 168 90, 158 100',
      'M196 150 C 180 146, 170 152, 160 140',
      'M120 32 C 118 50, 126 60, 122 72',
    ]
      .map((d) => `<path d="${d}" fill="none" stroke="${RED}" stroke-width="3.5"/>`)
      .join('')}
    <circle cx="124" cy="118" r="40" fill="${RED}" ${thin}/>
    <circle cx="124" cy="118" r="18" fill="${INK}"/>
    <circle cx="112" cy="104" r="8" fill="#fff"/>
    ${shine(76, 66, 14, 7)}`,

  // A sewn-up wound: black cross-stitches over a red seam, the needle still hanging off it.
  stitches: `
    <path d="M36 150 C 30 90, 80 40, 150 46 C 214 52, 232 120, 210 170 C 190 214, 60 214, 36 150 Z" fill="${FLESH}" ${stroke}/>
    <path d="M62 170 C 100 130, 150 104, 200 84" fill="none" stroke="${DARK_RED}" stroke-width="12" stroke-linecap="round"/>
    <path d="M62 170 C 100 130, 150 104, 200 84" fill="none" stroke="${RED}" stroke-width="6" stroke-linecap="round"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => {
      const t = i / 5;
      const x = 70 + t * 124,
        y = 164 - t * 76;
      return `<path d="M${x - 12} ${y - 14} L ${x + 12} ${y + 14} M ${x + 12} ${y - 14} L ${x - 12} ${y + 14}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
    }).join('')}
    <path d="M200 84 C 214 70, 222 50, 214 34" fill="none" stroke="${INK}" stroke-width="3"/>
    <path d="M204 40 L 232 12" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
    <path d="M204 40 L 232 12" stroke="${STEEL}" stroke-width="5" stroke-linecap="round"/>
    ${drop(106, 140, 0.7)}
    ${shine(84, 76)}`,

  // A snub revolver with a grin on the cylinder, one chamber glowing red.
  roulette: `
    <path d="M60 96 L 200 96 L 214 116 L 214 132 L 112 132 L 98 150 L 70 150 Z" fill="${STEEL}" ${stroke}/>
    <path d="M70 150 L 98 150 L 92 214 C 80 222, 56 220, 50 210 Z" fill="${WOOD}" ${stroke}/>
    <circle cx="128" cy="128" r="40" fill="${STEEL_DARK}" ${stroke}/>
    ${[0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      return `<circle cx="${128 + Math.cos(a) * 24}" cy="${128 + Math.sin(a) * 24}" r="8" fill="${i === 0 ? RED : INK}"/>`;
    }).join('')}
    <path d="M112 140 C 120 150, 136 150, 144 140" fill="none" stroke="${CREAM}" stroke-width="4" stroke-linecap="round"/>
    <path d="M214 104 L 234 104" ${stroke}/>
    <text x="196" y="72" font-family="Georgia, serif" font-weight="bold" font-size="30" fill="${RED}" stroke="${INK}" stroke-width="2">?</text>
    ${shine(84, 106, 10, 4, 0)}`,

  // A fat envelope of cash with a zipped, grinning mouth.
  hushMoney: `
    <rect x="44" y="72" width="168" height="120" rx="10" fill="${CREAM}" ${stroke}/>
    <path d="M44 82 L 128 142 L 212 82" fill="none" ${stroke}/>
    <rect x="70" y="52" width="120" height="40" rx="6" fill="${GREEN}" ${stroke}/>
    <text x="130" y="82" font-family="Georgia, serif" font-weight="bold" font-size="28" text-anchor="middle" fill="${INK}">$</text>
    <path d="M86 168 L 170 168" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${92 + i * 14} 160 L ${92 + i * 14} 176" stroke="${MUSTARD}" stroke-width="4"/>`).join('')}
    <circle cx="176" cy="168" r="8" fill="${MUSTARD}" ${thin}/>
    ${shine(70, 96)}`,

  // A spotlight on a bouquet thrown at the stage, with a rewind arrow round it.
  encore: `
    <path d="M128 30 A 92 92 0 1 1 46 92" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round"/>
    <path d="M128 30 A 92 92 0 1 1 46 92" fill="none" stroke="${MUSTARD}" stroke-width="7" stroke-linecap="round"/>
    <path d="M28 70 L 50 100 L 74 72 Z" fill="${MUSTARD}" ${stroke}/>
    <path d="M110 120 L 128 196 L 146 120 Z" fill="${GREEN}" ${stroke}/>
    ${[[100, 104], [128, 92], [156, 104], [114, 124], [142, 124]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="16" fill="${RED}" ${thin}/><circle cx="${x}" cy="${y}" r="5" fill="${CREAM}"/>`).join('')}
    <path d="M116 168 L 140 168" stroke="${CREAM}" stroke-width="6"/>
    ${shine(96, 98, 6, 3)}`,

  // Theatre curtains swinging shut on a stage, a gold tassel each side.
  curtainCall: `
    <rect x="34" y="40" width="188" height="176" rx="8" fill="${INK}" ${stroke}/>
    <path d="M34 40 L 128 40 C 118 100, 124 170, 112 216 L 34 216 Z" fill="${RED}" ${stroke}/>
    <path d="M222 40 L 128 40 C 138 100, 132 170, 144 216 L 222 216 Z" fill="${RED}" ${stroke}/>
    ${[60, 86].map((x) => `<path d="M${x} 44 C ${x - 6} 120, ${x + 4} 170, ${x - 4} 212" fill="none" stroke="${DARK_RED}" stroke-width="5"/>`).join('')}
    ${[170, 196].map((x) => `<path d="M${x} 44 C ${x + 6} 120, ${x - 4} 170, ${x + 4} 212" fill="none" stroke="${DARK_RED}" stroke-width="5"/>`).join('')}
    <rect x="30" y="30" width="196" height="22" rx="6" fill="${MUSTARD}" ${stroke}/>
    <circle cx="104" cy="150" r="9" fill="${MUSTARD}" ${thin}/><circle cx="152" cy="150" r="9" fill="${MUSTARD}" ${thin}/>
    ${shine(60, 70)}`,
};

/** Rasterise every horror icon and hand each PNG to `save`. */
export async function horrorIcons(sharp: Sharp, save: (id: string, png: Buffer) => Promise<void>): Promise<number> {
  for (const [id, body] of Object.entries(ICONS)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${body}</svg>`;
    const png = await sharp(Buffer.from(svg)).resize(128, 128).png({ compressionLevel: 9 }).toBuffer();
    await save(id, png);
  }
  return Object.keys(ICONS).length;
}

export const HORROR_ICON_IDS = Object.keys(ICONS);
