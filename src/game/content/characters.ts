// Recurring narrative cast.
//
// Four identifiable characters reappear across the 30-day campaign, each with a
// FIXED id, full name and look so the player recognizes them day to day. Their
// per-day Client objects are built in content/clients.ts; this module owns their
// identity, their appearance schedule and the story flags their key decisions
// should raise.
//
// IDENTIFICATION FOR THE SCENES (no Client type change was possible here):
//   Recurring clients are tagged ONLY by their fixed `fullName`. The counter /
//   consequence scene can call `recurringCharacterFor(client)` to recognize one
//   and, when the player resolves it, apply `storyOnRefuse` / `storyOnSell` to
//   GameState.story. Last names ('Roca', 'Lemoine', 'Pinto', 'Vasseur') are NOT
//   in the random LAST_NAMES pool, so a generated client can never collide with a
//   recurring identity.

import type { ClientLook } from '../types';

export interface RecurringCharacter {
  /** Stable internal id (used by the roster scheduler). */
  id: string;
  /** Fixed display name — the ONLY signal the scenes use to recognize the cast. */
  fullName: string;
  /** Fixed bust appearance (reused by drawClient via Client.look). */
  look: ClientLook;
  /** Story flag to set when the player correctly REFUSES this character. */
  storyOnRefuse?: string;
  /** Story flag to set when the player SELLS to / serves this character. */
  storyOnSell?: string;
  /** Short human note for the integration agent (not shown on screen). */
  role: string;
}

/**
 * The gambling-addict regular: on the ban list once it exists, keeps coming back
 * for jeux and begs to be served. Emotional through-line of the campaign.
 * Refusing him correctly = `protectedGambler`; serving the banned man =
 * `enabledGambler` (treated as a serious offence by the endings). The integration
 * should only raise `enabledGambler` when he is actually `onBanList`.
 */
export const GAMBLER: RecurringCharacter = {
  id: 'reg-gambler',
  fullName: 'Didier Roca',
  look: { skin: '#a87a54', hair: '#473720', coat: '#2b1d12', hat: 'none', beard: true },
  storyOnRefuse: 'protectedGambler',
  storyOnSell: 'enabledGambler',
  role: 'Joueur interdit de jeu qui supplie qu\'on le serve — fil rouge émotionnel.',
};

/** Mémé Ginette: warm daily regular, always a clean and simple sale. */
export const GINETTE: RecurringCharacter = {
  id: 'reg-meme',
  fullName: 'Ginette Lemoine',
  look: { skin: '#c79a72', hair: '#e7ddc4', coat: '#6b5638', hat: 'beanie', beard: false },
  role: 'Habituée chaleureuse — vente propre, présence rassurante.',
};

/** The persistent teen: keeps retrying to buy age-restricted goods. */
export const TEEN: RecurringCharacter = {
  id: 'reg-teen',
  fullName: 'Bryan Pinto',
  look: { skin: '#b78a63', hair: '#2b1d12', coat: '#34507e', hat: 'cap', beard: false },
  storyOnSell: 'soldToMinor',
  role: 'Mineur têtu qui retente tabac/CBD/vape — refus correct dès la règle d\'âge.',
};

/** The returning fraudster: betting bluffs (fake tickets / leaves without paying). */
export const FRAUDSTER: RecurringCharacter = {
  id: 'reg-fraud',
  fullName: 'Marco Vasseur',
  look: { skin: '#8a6244', hair: '#2b1d12', coat: '#9c3b2e', hat: 'hat', beard: false },
  // Being complicit (paying the bad ticket / letting him leave) raises enabledFraud,
  // which the endings read as a serious offence. Catching him raises nothing.
  storyOnSell: 'enabledFraud',
  role: 'Arnaqueur récurrent au terminal FDJ — faux tickets, mises impayées.',
};

export const RECURRING_CHARACTERS: readonly RecurringCharacter[] = [
  GAMBLER,
  GINETTE,
  TEEN,
  FRAUDSTER,
];

/**
 * Scheduled appearances, keyed by character id -> the days they show up.
 * The gambler only appears once the ban list exists (day >= 15) so that serving
 * him is always the banned, flaggable case. The fraudster only appears once the
 * FDJ terminal is open (day >= 17). Ginette and the teen recur from week 1/2.
 */
const SCHEDULE: Record<string, readonly number[]> = {
  [GINETTE.id]: [2, 6, 11, 16, 21, 27],
  [TEEN.id]: [4, 8, 12, 18, 22, 26],
  [GAMBLER.id]: [15, 20, 25, 28],
  [FRAUDSTER.id]: [17, 21, 26, 28],
};

/** Recurring character ids scheduled to appear on a given day. */
export function recurringIdsForDay(day: number): string[] {
  const ids: string[] = [];
  for (const c of RECURRING_CHARACTERS) {
    if (SCHEDULE[c.id]?.includes(day)) ids.push(c.id);
  }
  return ids;
}

/** Recognize the recurring character a client represents (by fixed full name). */
export function recurringCharacterFor(client: { fullName: string }): RecurringCharacter | undefined {
  return RECURRING_CHARACTERS.find((c) => c.fullName === client.fullName);
}
