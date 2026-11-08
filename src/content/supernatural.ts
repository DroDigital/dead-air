import type { SupernaturalOption } from '../game/types';

/** Copy is shared by the choice screen and the rules it describes. */
export const SUPERNATURAL_OPTIONS: Record<SupernaturalOption, { name: string; text: string }> = {
  fortune: { name: 'Fortune', text: 'Gain $5,000 in the Vault.' },
  time: { name: 'Time', text: 'Gain 6 spins now and every Deadline.' },
  power: { name: 'Power', text: 'Double all Cash payouts for the rest of the run.' },
  grace: { name: 'Grace', text: 'Gain $3,000 in the Vault.' },
  mercy: { name: 'Mercy', text: 'Gain 3 spins now and every Deadline.' },
  radiance: { name: 'Radiance', text: 'Multiply all Cash payouts by 1.5 for the rest of the run.' },
};

export const SUPERNATURAL_CHOICES: Record<'pact' | 'blessing', SupernaturalOption[]> = {
  pact: ['fortune', 'time', 'power'],
  blessing: ['grace', 'mercy', 'radiance'],
};
