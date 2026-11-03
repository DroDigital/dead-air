/**
 * The host: a CRT-headed mannequin who is cheerful no matter what.
 * Lines are tagged by trigger. The voice synth turns each caption into gibberish syllables.
 */

export type HostTrigger =
  | 'intro'
  | 'bankrupt'
  | 'jackpot'
  | 'streak'
  | 'deposit'
  | 'debtPaid'
  | 'debtMissed'
  | 'idle'
  | 'artifact'
  | 'combo'
  | 'phone'
  | 'shop'
  | 'bigWin'
  | 'dud'
  | 'tax'
  | 'victory'
  | 'package'
  | 'sweep'
  | 'mystery';

export const HOST_LINES: Record<HostTrigger, readonly string[]> = {
  intro: [
    'Gooood evening, contestant! You are LIVE!',
    'Welcome back to the only show still on the air!',
    'Our studio audience is dying to meet you. Some of them already have!',
    "You look wonderful. The restraints really bring out your eyes!",
    "Remember: the Network loves you. The Network is listening.",
    'Lights! Camera! Debt!',
  ],
  bankrupt: [
    'Oooh! So close to having money!',
    "BANKRUPT! Don't worry, it's only everything!",
    "The tray is empty, but your heart is full! Of what, we can't say!",
    'Ha-ha! The wheel giveth, and the wheel… mostly taketh!',
    "Tough break! Our insurance doesn't cover breaks!",
    'Let it ride, they said! Who said that? I said that!',
    'Bankrupt! Smile for camera three! Camera three is the one with the teeth!',
    "That's showbusiness, baby! Mostly the business part!",
    "Easy come, easy go! Mostly go!",
    'The audience groans with you! Collectively! Forever!',
  ],
  jackpot: [
    'JACKPOT! Somebody ring the bell! Somebody find the bell!',
    'A thousand dollars! The Network is SO proud of you!',
    'JACKPOT! Ding ding ding! That noise is coming from inside my head!',
    "You hit the sliver! Nobody hits the sliver! The last one who hit the sliver is still here!",
    'Confetti! We are out of confetti! Imagine confetti!',
  ],
  streak: [
    "Let it ride! Let it RIDE! Let it ride all the way down!",
    "You're on fire! Not literally! The sprinklers don't work!",
    'Ooh, the marquee is getting hot! So is the carpet, for some reason!',
    "Don't stop now! Stopping is for people with nothing to lose!",
    "What a streak! I haven't seen one like this since the incident!",
    'The tray is glowing! Is that normal? It is now!',
    'Riding high! The higher you ride, the further the floor!',
    "The audience is on the edge of their seats! They're bolted there!",
  ],
  deposit: [
    'Safe and sound in the vault! Well — sound!',
    "Banking it! How responsible! How boring! I love it!",
    'Into the vault it goes! The vault says thank you! The vault never says thank you!',
    'A cautious contestant! Our sponsors hate this one simple trick!',
    'Deposited! Your streak goes back to one! Like a little baby!',
    'Ka-THUNK! Music to my speaker grille!',
  ],
  debtPaid: [
    'Paid in full! The Network will see you again… very soon!',
    'Another deadline survived! You get to keep your floor!',
    "Debt paid! Now it's bigger! That's how growth works!",
    "The Network thanks you for your continued participation!",
    'Payment received! Interest has been… invented!',
    "You did it! You get to do it again!",
  ],
  debtMissed: [
    'Oh no. Oh no no no. Well — goodnight, everybody!',
    "Short! You're short! The floor isn't!",
    "That's our show! Thank you for playing! Mind the gap!",
    'The Network is disappointed. The Network has a trapdoor.',
    "We'll be right back! You won't!",
  ],
  idle: [
    "Take your time! We have all the time in the world! We have nothing BUT time!",
    'Still there? Blink twice if you can blink!',
    "The lever won't pull itself! I've asked it!",
    'Dead air is very expensive, contestant!',
    "Psst. The wheel is lonely.",
    'Spin, spin, spin! Spinning is what we do here!',
    "I'll just stand here! Smiling! It's what I'm for!",
    'Our viewers at home are on the edge of their graves!',
  ],
  artifact: [
    'Ooh, a prize from the prop room! Mind the dust! Mind the teeth!',
    "What a lovely trinket! It belonged to someone lovely!",
    'Put it on the shelf! It likes the shelf! It told me!',
    "Every artifact tells a story! Don't listen to it!",
    'Collectible! Cursed! Collectible AND cursed!',
  ],
  combo: [
    'COMBO! The marquee is so happy it might short out!',
    'Look at those numbers go! Up! Mostly up!',
    'A combo! I felt that one in my vacuum tubes!',
    "ECHO-echo-echo! That's a little joke! It's also a combo!",
    'Hat trick! Where did you get that hat! Give it back!',
  ],
  phone: [
    "Oh! That's the Producer! You should take it! You must take it!",
    'Ring ring! It might be for you! It is for you!',
    'The phone! Nobody has called that phone since the war!',
    "Ooh, a call from upstairs! There is no upstairs!",
  ],
  shop: [
    'Welcome to the Prize Cabinet! Everything must go! Everyone must go!',
    'Turn the crank! New prizes! Old prizes, rotated!',
    "Tokens accepted! Souls accepted! Mostly tokens!",
    'Window shopping is free! Breaking the window is not!',
  ],
  bigWin: [
    "LOOK at that tray! I'd faint if I had a body!",
    'Big money! BIG MONEY! No whammies! What is a whammy!',
    "Oh, the Network is going to LOVE this rerun!",
    "You're rich! For a moment! Enjoy the moment!",
  ],
  dud: [
    'A dud! Like my old co-host!',
    "Nothing! Nothing is still something! No it isn't!",
    'Ha! The wheel is shy today!',
    "Dud! Don't worry, it's not personal! It's a little personal!",
  ],
  tax: [
    'The tax man cometh! He has a key to the vault! Why does he have a key!',
    "Taxes! The only certainty! Well, that and the floor!",
    "A little off the top for the Network! And the sides!",
  ],
  victory: [
    "You paid it ALL! Eight deadlines! You're FREE! Ha-ha! Free to keep playing!",
    'A winner! A real winner! The first since — well! The first!',
    "The Network thanks you! The Network will now renew your contract!",
  ],
  package: [
    "Choose your broadcast! Short and sweet, or long and sour!",
    'Pick a package! Any package! Not that one! Okay, that one!',
    'Marathon! The ratings love a marathon! The contestants less so!',
  ],
  sweep: [
    "It's SWEEPS WEEK! New rules! Same floor!",
    'Sweeps! The ratings are watching! So is something else!',
    'Special episode tonight! Very special! Extra special! Different!',
  ],
  mystery: [
    'Mystery! What could it be! Even I don\'t know! I never know!',
    "The question mark spins! The question mark always spins!",
    'Ooh, mystery! My favourite flavour of dread!',
  ],
};

export function allHostLines(): string[] {
  return Object.values(HOST_LINES).flat();
}

/** Silent mode (secret bargain "Cut the feed"). */
export const HOST_SILENT_LINES: readonly string[] = ['...', '. . .', '(static)', '(the screen shows only your face)'];
