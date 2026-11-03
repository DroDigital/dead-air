/**
 * Lore notes — found in the Collection (the dusty prop room). Each unlocks on a condition.
 */
import type { MetaState } from '../game/meta';

export interface LoreNote {
  id: string;
  title: string;
  text: string;
  /** Human-readable unlock hint shown while locked. */
  hint: string;
  unlocked(meta: MetaState): boolean;
}

export const LORE: readonly LoreNote[] = [
  {
    id: 'call_sheet',
    title: 'Call Sheet, Ep. 1',
    text: 'CALL TIME 6:00 PM. CONTESTANT: TBD. HOST: CONFIRMED. AUDIENCE: CONFIRMED (DO NOT FEED). WHEEL: OILED. FLOOR: TESTED.',
    hint: 'Start a broadcast.',
    unlocked: (m) => m.runs >= 1,
  },
  {
    id: 'memo_ratings',
    title: 'Memo: Ratings',
    text: 'To all staff — our numbers are flat. We need more tension. Effective immediately, the trapdoor is live. Nobody needs to know it was ever not live. — Programming',
    hint: 'Survive a Deadline.',
    unlocked: (m) => m.bestDeadline >= 1,
  },
  {
    id: 'host_contract',
    title: "Host's Contract (Page 3)",
    text: 'The Talent agrees to remain cheerful in perpetuity. "Perpetuity" is defined as the period beginning on the signing date and ending never. The Talent has initialled every page with a thumbprint. The Talent did not have thumbs at the time.',
    hint: 'Play 3 broadcasts.',
    unlocked: (m) => m.runs >= 3,
  },
  {
    id: 'audience_notice',
    title: 'Notice to Studio Audience',
    text: 'Please remain seated for the duration of the broadcast. The duration of the broadcast has been extended. Please remain seated.',
    hint: 'Reach Deadline 3.',
    unlocked: (m) => m.bestDeadline >= 3,
  },
  {
    id: 'wheel_invoice',
    title: 'Invoice: One (1) Wheel',
    text: '24 wedges, gold leaf, chrome trim, 96 marquee bulbs, one leather flapper (genuine). Flapper sourced locally. Do not ask the supplier where. Do not ask the supplier anything.',
    hint: 'Land 5 Bankrupts (lifetime).',
    unlocked: (m) => m.lifetime.bankrupts >= 5,
  },
  {
    id: 'jackpot_bell',
    title: 'Polaroid: The Bell',
    text: 'A photo of a brass bell on a rope. Someone has written on the back: "We rang it for every Jackpot. In 1979 it rang by itself. We took it down. It still rings, sometimes, in the prop room."',
    hint: 'Hit a Jackpot.',
    unlocked: (m) => m.lifetime.jackpots >= 1,
  },
  {
    id: 'producer_voicemail',
    title: 'Transcript: Voicemail',
    text: '"Hi, it\'s me. The Producer. Your Producer. I just wanted to say I believe in you. The Network believes in you. Pick up. Pick up. I can see you. Pick up."',
    hint: 'Take a call from the Producer.',
    unlocked: (m) => m.lifetime.phoneCalls >= 1,
  },
  {
    id: 'deadair_policy',
    title: 'Policy 7: Dead Air',
    text: 'Any silence longer than four seconds will be considered Dead Air. Dead Air is a breach of contract. Breaches of contract are resolved in the basement. The basement is resolved in the sub-basement.',
    hint: 'Trigger DEAD AIR.',
    unlocked: (m) => m.lifetime.deadAir >= 1,
  },
  {
    id: 'cue_card_stack',
    title: 'Stack of Cue Cards',
    text: 'SMILE. / SMILE. / SMILE WIDER. / DO NOT LOOK AT THE CEILING. / SMILE. / THEY CAN TELL WHEN YOU ARE NOT SMILING.',
    hint: 'Own 6 artifacts at once.',
    unlocked: (m) => m.lifetime.fullShelf >= 1,
  },
  {
    id: 'carpet_sample',
    title: 'Carpet Sample (Stained)',
    text: 'Swatch #44, "Showtime Burgundy". The stain was already there when it arrived. The stain is larger now. Nobody has spilled anything.',
    hint: 'Reach Deadline 5.',
    unlocked: (m) => m.bestDeadline >= 5,
  },
  {
    id: 'previous_contestant',
    title: 'Contestant Release Form',
    text: 'NAME: [scratched out]. I agree to play until my debt is paid. I understand the debt grows. I understand the debt grows. I understand the debt grows. (repeated to the bottom of the page, in smaller and smaller writing)',
    hint: 'Lose a broadcast.',
    unlocked: (m) => m.runs - m.wins >= 1,
  },
  {
    id: 'sweeps_week',
    title: 'Sweeps Week Schedule',
    text: 'MON: Double Bankrupts. TUE: No Safe Bets. WED: The Audit. THU: Null Signal. FRI: Blackout. SAT: [REDACTED]. SUN: We do not broadcast on Sunday. We broadcast on Sunday.',
    hint: 'Survive a Sweep.',
    unlocked: (m) => m.bestDeadline >= 4,
  },
  {
    id: 'lighting_rig',
    title: "Electrician's Log",
    text: 'Replaced bulb over the wheel again. It keeps swinging. There is no draft in here. Replaced bulb over the phone. It flickers in a pattern. I wrote the pattern down. It spells my name.',
    hint: 'Reach a ×3 Streak.',
    unlocked: (m) => m.lifetime.maxStreak >= 3,
  },
  {
    id: 'network_letter',
    title: 'Letter from the Network',
    text: 'Dear Contestant, congratulations on your continued employment. Your debt has been restructured into a more exciting format. Please do not attempt to contact the Network. The Network will contact you.',
    hint: 'Reach Deadline 7.',
    unlocked: (m) => m.bestDeadline >= 7,
  },
  {
    id: 'finale_script',
    title: 'Script: The Finale',
    text: 'HOST: And with that payment, you are free! (Beat.) (Longer beat.) HOST: …Free to play again! (Applause sign. The applause sign does not turn off.)',
    hint: 'Pay all 8 Deadlines.',
    unlocked: (m) => m.wins >= 1,
  },
  {
    id: 'endless_reel',
    title: 'Reel 9 of ∞',
    text: 'A film can labelled "RERUNS". It is warm. Holding it, you can hear a crowd laughing at a joke that has not been told yet.',
    hint: 'Survive a Deadline in Endless.',
    unlocked: (m) => m.bestDeadline >= 9,
  },
  {
    id: 'mannequin_parts',
    title: 'Props Inventory',
    text: 'Mannequins: 14. Mannequin hands: 29. Mannequin hands accounted for: 28. If found, do not hold hands with the missing mannequin hand.',
    hint: 'Collect 15 different artifacts.',
    unlocked: (m) => m.seenArtifacts.length >= 15,
  },
  {
    id: 'basement_map',
    title: 'Map of the Basement',
    text: 'A hand-drawn floor plan. Directly below the contestant chair: a square labelled "THE AUDIENCE (OVERFLOW)". An arrow points down. Beneath it, another square. Another arrow.',
    hint: 'Win on Late Night stake or higher.',
    unlocked: (m) => m.bestStakeWon >= 1,
  },
  {
    id: 'other_line',
    title: 'Note Taped Under the Phone',
    text: '"If you hang up on him enough times, the line clicks. That\'s me. I\'m still in the building. I\'m under the floor. I can help. Hang up on him." — the last one',
    hint: 'Find the Other Line.',
    unlocked: (m) => m.secretFound,
  },
  {
    id: 'the_truth',
    title: 'The Cards on the Floor',
    text: 'Read in order: THE / SHOW / IS / NOT / BROADCAST / ANYWHERE. / THERE / IS / NO / NETWORK. / THERE / IS / ONLY / THE / WHEEL. / AND / THE / WHEEL / IS / HUNGRY.',
    hint: 'Ask the Other Line for the truth.',
    unlocked: (m) => m.truthFound,
  },
  {
    id: 'test_pattern',
    title: 'Test Pattern Card',
    text: 'The colour bars are in the wrong order. In the centre circle, where the station logo should be, there is a small photograph of the chair you are sitting in. You are in it.',
    hint: 'Play 10 broadcasts.',
    unlocked: (m) => m.runs >= 10,
  },
  {
    id: 'graveyard_shift',
    title: 'Timecard: Graveyard Shift',
    text: 'IN: 11:58 PM. OUT: — . IN: 11:58 PM. OUT: — . IN: 11:58 PM. OUT: — . The card has been punched so many times it is mostly holes.',
    hint: 'Win on Graveyard Shift stake or higher.',
    unlocked: (m) => m.bestStakeWon >= 2,
  },
];
