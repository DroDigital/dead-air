# DEAD AIR: GPT image prompts

Everything the new look needs, as copy-paste prompts for GPT image generation. Generate the
sheets, drop the PNGs into `assets-src/art/` with the file names below, and I'll slice them,
wire them into the game, and rebuild the HUD, menus and itch.io art around them.

## How to use these

1. **Generate sheet 1 (the host model sheet) first.** Regenerate until the character is exactly right.
2. **Attach that model sheet as a reference image to every later prompt** that shows the host
   ("Use the attached character exactly as designed").
3. Paste the **STYLE BLOCK** at the top of every prompt, then the sheet's own prompt.
4. Ask for a **transparent background** on every sheet except the backgrounds
   (in the API: `background: "transparent"`, `output_format: "png"`).
5. Sizes: GPT image only does 1024×1024, 1536×1024 (landscape) and 1024×1536 (portrait). Each prompt says which.
6. **Grids don't have to be perfect.** I slice by the empty space between items, so items only need to be
   separated and not touching. No grid lines, labels or text unless a prompt asks for text.
7. If a sheet comes back with one bad cell, regenerate just that item alone. Same prompt; replace the
   item list with the one you need.

The prompts deliberately don't name any existing game or studio. They describe the style
instead, which keeps the results original and stops the model copying someone's characters.

---

## STYLE BLOCK (paste at the top of every prompt)

```
Style: polished 1930s rubber-hose cartoon, hand-drawn and hand-inked, with a cursed, slightly wrong
undertone. Confident brush-ink outlines with thick-to-thin line weight; noodle limbs with no elbows or
knees; white four-finger cartoon gloves with puffy cuffs; pie-cut eyes (black ovals with a wedge cut
out); bouncy squash-and-stretch. Flat gouache/cel fills in a faded vintage palette: cream #f4e6c6,
ink black #170c06, tomato red #b3291a, mustard #d99a2b, teal #2c6e66, with old-paper warmth. Soft
watercolor shading in one darker tone, a small white highlight on round shapes. Clean, crisp and
professional, like a restored animation cel: no blur, no photo textures, no 3D rendering, no modern
vector gloss. The cursed note comes from small details only: a grin with too many teeth, eyes that
don't quite match, a drip of ink, a stain. Never gore.
```

## CHARACTER BLOCK: the Host (paste into every host prompt)

The default keeps the game's current lore: the host has a television for a head.

```
Character: "the Host", a cheerful-sinister game-show emcee whose head is a 1930s-style wooden
television set with rounded corners, two rabbit-ear antennas with small red bulbs, two brass knobs and a
little red tally lamp on the right side of the cabinet. The TV screen is his face: a pale mint-green
glowing glass screen. His body is a skinny rubber-hose cartoon man in a black tuxedo with tails, a crisp
white shirt front, a huge red bow tie, white four-finger gloves and big round shiny black shoes. Noodle
arms and legs. He is always performing for the audience: chest out, big theatrical gestures.
```

Alternative hosts (swap the character block if you'd rather):

```
Character: "the Host", a ventriloquist dummy who runs the show by himself: oversized carved wooden head
with painted glossy black hair, rosy painted cheeks, heavy-lidded googly eyes, a hinged jaw with two
carved slot lines down the chin, a red bow tie, tiny tuxedo, white gloves, dangling noodle legs.
```

```
Character: "the Host", a living 1930s ribbon microphone as a game-show emcee: chrome microphone head with
a grille face, pie-cut eyes and a wide grin on the grille, a curly black cord for a tail, black tuxedo,
red bow tie, white four-finger gloves, round shoes, noodle limbs.
```

---

## 1 · Host model sheet (reference only, not used in game)

File: `assets-src/art/host-model-sheet.png` · **1536×1024** · plain cream background

```
[STYLE BLOCK]
[CHARACTER BLOCK]
A clean character model sheet of the Host on a plain flat cream background: four full-body views in a
row, all the same height and scale, standing on one shared baseline: front view, three-quarter view,
side profile, back view. The screen shows a simple smiling face (pie-cut eyes, a wide grin) in the front
and three-quarter views. Below the row, three small close-ups: one white glove, the bow tie, one shoe.
No text, no labels, no arrows.
```

## 2 · Host poses (animated on twos: two drawings per pose)

File: `assets-src/art/host-poses.png` · **1536×1024** · transparent

```
[STYLE BLOCK]
[CHARACTER BLOCK]
Use the attached character exactly as designed. A sprite sheet of the Host, full body, on a transparent
background: 12 drawings in a 4-column × 3-row grid, each centered in its cell with empty space around it,
all at the same scale with the feet on the same baseline in every cell, facing three-quarter toward the
viewer. The TV screen is left BLANK in every drawing: flat solid pale mint green (#9fe8c0), no face, no
reflections. Drawings come in pairs (A then B). B is the same pose one beat later, with a slight bounce,
squash or arm/hand shift, so the pair loops as a two-drawing animation:
Row 1: IDLE A (standing, hands clasped, weight on one leg) · IDLE B (same, a small bounce up) ·
PRESENT A (one arm sweeping out to his right, presenting something off-frame) · PRESENT B (same, arm
further out, fingers spread).
Row 2: CHEER A (both arms thrown up, one knee lifted) · CHEER B (arms higher, body stretched tall) ·
POINT A (pointing straight at the viewer, other hand on hip) · POINT B (same, leaning in closer).
Row 3: SHRUG A (palms up, shoulders raised) · SHRUG B (shoulders higher, head tilted) ·
SLUMP A (defeated, arms hanging, antennas drooping) · SLUMP B (slumped lower, one antenna bent).
No text, no labels, no grid lines, no shadows on the ground.
```

## 3 · Host faces (the TV screen)

File: `assets-src/art/host-faces.png` · **1024×1024** · transparent

```
[STYLE BLOCK]
A sprite sheet of 16 cartoon faces for the Host's TV screen, on a transparent background, in a 4 × 4
grid. Each face fills a rounded-square mint-green glowing screen (#9fe8c0, a faint scanline texture and a
soft glass highlight in the top-left corner), drawn straight-on, every screen the same size and
shape. The faces are drawn in black ink: pie-cut eyes, expressive eyebrows, a big mouth.
Row 1: SMILE A (friendly grin) · SMILE B (same grin, slightly different drawing, for line boil) · GRIN
(far too many teeth, eyes too wide) · WINK.
Row 2: SHOCK (eyes popped huge, mouth a tall O) · SAD (droopy eyes, wobbly frown) · DEAD (X eyes,
tongue out) · SIDE-EYE (pupils looking hard to the left, flat mouth).
Row 3: BLINK (eyes closed as curved lines, smile) · TALK-M (mouth closed, lips pressed, for M/B/P) ·
TALK-E (mouth slightly open, teeth showing) · TALK-A (mouth wide open, tongue visible).
Row 4: TALK-O (mouth a round O) · STATIC (no face, the screen full of black-and-white TV snow) · MELT (the
smile sliding down the glass, ink dripping from the eyes) · ANGRY (furrowed brows, gritted teeth).
No text, no labels, no grid lines.
```

## 4 · Title lettering plate

GPT makes the ornamental plate. The title lettering goes on top in the game, so it stays exact and
editable; the optional prompt below has GPT letter it instead.

File: `assets-src/art/title-plate.png` · **1536×1024** · transparent

```
[STYLE BLOCK]
An ornate 1930s cartoon title card frame on a transparent background, centered: a wide arched cream
plaque with a thick double ink border, scalloped corners and little curls, a red ribbon banner across the
lower third, small gold stars and sparkles around the edge, and two white cartoon gloves holding the
plaque from the sides. One ink drip running down from the bottom edge. The plaque and the ribbon are
completely EMPTY: no letters, no words, no symbols on them.
```

Optional, if you want GPT's own lettering to compare (same file name with `-lettered`):

```
[STYLE BLOCK]
The words "DEAD AIR" as a 1930s cartoon title logo on a transparent background: bouncy, whimsical
hand-lettered serif letters with flared, curly terminals, tomato-red fill with a cream inline highlight, a
thick black outline and a hard black drop shadow, arched slightly upward. Exactly the two words "DEAD AIR",
spelled correctly, nothing else.
```

## 5 · Menu and panel kit

File: `assets-src/art/ui-panels.png` · **1536×1024** · transparent

Panels get stretched to fit text, so their middles must be plain. All the decoration goes in the corners and edges.

```
[STYLE BLOCK]
A UI kit sheet on a transparent background for a 1930s cartoon game, all items separated by empty space,
all EMPTY (no text, letters, numbers or icons on any of them). Every panel has a thick hand-inked
double border, cream paper fill, decoration only in the corners, and a plain flat middle so it can be
stretched:
1. a large rectangular menu panel with rounded scalloped corners;
2. a menu button, pill-shaped, cream, idle;
3. the same button highlighted in mustard with a small sparkle;
4. the same button pressed (squashed slightly, darker);
5. a speech balloon with a tail pointing down-right;
6. a small red name tag ribbon;
7. a playing-card-shaped deal card with ornate corners, cream;
8. the same deal card in a darker, aged, stained version (for "hang up");
9. a small tooltip card with a tiny pin at the top;
10. a wide ribbon banner, red, with folded tails on both ends;
11. a narrow cream plaque for a sponsor message, with a small gold star in one corner;
12. a round checkbox: one empty, one with a hand-drawn ink tick.
```

## 6 · HUD kit

File: `assets-src/art/ui-hud.png` · **1536×1024** · transparent

```
[STYLE BLOCK]
A HUD element sheet on a transparent background for a 1930s cartoon game-show broadcast, all items
separated by empty space, no text or numbers anywhere:
1. a long horizontal broadcast bar: a left end cap, a plain repeatable middle section and a right end
cap, as three separate pieces, cream with an ink border and a thin gold trim line;
2. an "ON AIR" style tally lamp, round red bulb in a brass socket: one lit and glowing, one unlit;
3. a small round light bulb for counting spins: one lit, one burnt out;
4. a gold token coin with a plain empty center, slightly tilted, with a shine;
5. a small iron safe (the Vault), front view;
6. a small glass tray full of coins and bills;
7. a flame-shaped badge for a streak multiplier, empty center;
8. four white cartoon glove hands pointing: left, right, up, down;
9. two mouse cursors: a white glove pointing, and the same glove grabbing;
10. a gold film-reel shaped frame for announcement numbers, empty center;
11. a ticket stub, cream, perforated edge, empty;
12. a small red telephone, ringing, with motion lines.
```

## 7 · Wedge icons (the prize wheel)

File: `assets-src/art/icons-wedges.png` · **1024×1024** · transparent

```
[STYLE BLOCK]
A sheet of 25 small game icons in a 5 × 5 grid on a transparent background, each a single bold, simple
object readable at small size, centered in its cell with empty space around it, no text unless listed:
Cash (a stack of bills with a $), Respin (a curly arrow), Token (a gold token coin), Boost (a rocket), Artifact
(a small treasure chest), Bankrupt (a cracked black piggy bank), Jackpot (a pile of gold coins with
sparkles), Mystery (a question mark on a gift box), Dud (a deflated balloon), Tax (a taxman's top hat with
a bite out of a coin), Splitter (a coin split in two), Wild (a jester's playing card), Haunted (a small
sheet ghost), Cursed Cash (a dollar bill with evil eyes), Interest (a coin growing a sprout), Thief (a
burglar's mask), Vault Key (an old iron key), Overtime (an alarm clock ringing), Charge (a lightning
bolt), Ring Jump (a hoop with a jumping arrow), Doubler (two overlapping coins with ×2), Scratcher (a
scratch-off card with a coin), Payday (an envelope bursting with bills), plus two spares: a lucky
horseshoe and a black cat.
```

## 8 · Artifact icons (shelf items, 50)

Files: `assets-src/art/icons-artifacts-1.png` and `-2.png` · **1024×1024** each · transparent

Run the same prompt twice, with the two lists.

```
[STYLE BLOCK]
A sheet of 25 small game item icons in a 5 × 5 grid on a transparent background, each a single prop
object drawn like a cartoon prop, slightly creepy, readable at small size, centered with empty space
around it, no text:
```

Sheet 1: Lucky Penny, Piggy Bank, Stopwatch, Tooth Fairy (a tooth with tiny wings), House Edge (a toy house
on a cliff), Rubber Band Ball, Coffee Ring (a stained mug), Pocket Lint, Bent Nail, Cue Card, Tip Jar,
Spare Bulb, Lucky Sock, Lint Roller, Hollow Tooth, Snake Eyes (dice showing ones), Neighbor's Envy (a
green-eyed fence), Iron Nerve (an iron heart), Hot Hand (a glove on fire), Glass Eye, Gilded Clapper (a
gold bell), Loaded Flapper (a wheel flapper with a weight), Metronome, Applause Sign (a lit sign with no
text), TV Dinner.

Sheet 2: Velvet Rope, Horseshoe Magnet, Crumpled Receipt, Ventriloquist's Dummy (head only), Pawn Ticket,
The Understudy (a theater mask), Static (a little TV full of snow), Cracked Mirror, Second Ring (two nested
rings), Golden Mic, Trapdoor Lever, Laugh Track (a reel of film with a grin), Producer's Pen (a fountain
pen), Crystal Tube (a glowing vacuum tube), Rabbit Ears (TV antenna), The Missing 'A' (a wooden letter A
with a bite out of it), Rabbit's Foot, Collector's Card, Monkey's Paw, Black Cat, Ouija Board (planchette
only), Mannequin Hand, Cracked VHS, Dead Man's Watch (a stopped pocket watch), Severance Check (an
envelope with a black ribbon).

## 9 · Scratch cards (12)

File: `assets-src/art/icons-scratch.png` · **1536×1024** · transparent

```
[STYLE BLOCK]
A sheet of 12 scratch-off lottery cards in a 4 × 3 grid on a transparent background, each a small
cream card with a scalloped edge, a silver scratch area half scratched off revealing a bold picture,
no text: Nudge (a small hand pushing an arrow), Insurance (an umbrella), Lock (a padlock), Hot Streak (a
flame), Reroll (a pair of dice), Freeze (an ice cube), Peek (an eye through a keyhole), Polish (a sparkling
cloth), Lucky Coin (a four-leaf-clover coin), Safe Deposit (a small safe), Static Burst (a TV-snow star),
Rebate (a coin bouncing back on an arrow).
```

## 10 · The callers (phone deal screen)

File: `assets-src/art/callers.png` · **1536×1024** · transparent

```
[STYLE BLOCK]
Two cartoon character portraits, bust shots, on a transparent background, separated by empty space:
LEFT: "the Producer", never seen in full: a big shadowy silhouette of a cigar-chomping network executive in a
pinstripe suit, only his huge toothy grin, gold tooth and the cigar glowing visible, holding a candlestick
telephone receiver to his ear.
RIGHT: "the Other Line", a sad, pale, translucent ghost of a former game-show contestant in a 1930s suit,
holding an old telephone receiver, purple-tinted, with hollow eyes and a contestant number tag.
No text.
```

## 11 · Full-screen cards (title backdrop, loading, end screens)

Files: `assets-src/art/screen-title-bg.png`, `screen-standby.png`, `screen-win.png`, `screen-lose.png` · **1536×1024** each · opaque

```
[STYLE BLOCK]
A full-screen 1930s cartoon title-card background: rays of light bursting from the center in alternating
mustard and cream bands, a dark ink vignette around the edges, old-film grain and faint scratches, a
theater-stage floor at the bottom with footlights. The center third is left calm and plain for a logo and
menu to sit on. No text, no characters.
```

```
[STYLE BLOCK]
A full-screen cartoon "please stand by" broadcast card: the Host's TV head alone, centered, its screen
showing a test pattern, surrounded by a circular ornamental frame on a dark cream background with film
grain. No text.
```

```
[STYLE BLOCK]
[CHARACTER BLOCK]
A full-screen cartoon victory card: the Host cheering in a shower of gold coins and confetti, a ring of
light behind him, spotlight, cream and mustard rays. Space left at the top for a title. No text.
```

```
[STYLE BLOCK]
[CHARACTER BLOCK]
A full-screen cartoon game-over card: a trapdoor open in a stage floor, seen from above, black hole
inside, the Host's white glove waving goodbye from the edge, a single spotlight, a dark cursed mood with
ink drips. Space left at the top for a title. No text.
```

## 12 · Textures for the 3D studio (optional, later)

Tileable textures, so the 3D studio matches the cartoon UI. **1024×1024** each · opaque · "seamless
tileable texture, flat lighting, no perspective" added to the style block:
red stage curtain · checkered stage floor · wallpaper with small TV-and-star motif · dark wood panelling ·
brass trim · audience seats seen from the front, empty.

---

## What I do with them

- Slice each sheet by its transparent gaps and name the pieces.
- **Host:** a 2D sprite in the 3D studio, so he becomes a cut-out on stage, drawn on twos (12 fps) with
  each pose's A/B drawings alternating. The face sheet composites onto the blank mint screen, the TALK
  mouths are driven by the voice, and SMILE A/B boil while idle.
- **UI:** the menus, HUD, captions and phone cards are rebuilt from the panel and HUD kits.
- **itch.io art:** regenerated from the same pieces, plus the screenshots you skipped earlier.
