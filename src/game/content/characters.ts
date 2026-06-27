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

import type { ClientLook, Country } from '../types';

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

// === SATIRE caricatures ======================================================
//
// Real-name public-figure PARODY clients (the project owner's explicit creative
// choice). Each appears once on a scripted day, recognizable by look + French
// lines, and is tied to a game mechanic. They are identified downstream by the
// Client.satireId field (NOT the fullName), so a sprite can draw the caricature
// accessory and the scenes can branch on the special mechanic.
//
// Their per-day Client objects are built in content/clients.ts; this module owns
// their identity, appearance and appearance schedule.

export interface SatireCharacter {
  /** Stable satire id — mirrored into Client.satireId; drives the sprite accessory. */
  id: string;
  /** Real public-figure name shown on screen (the caricature). */
  fullName: string;
  /** Fixed bust appearance (reused by drawClient via Client.look). */
  look: ClientLook;
  /** Nationality shown on the CNI (fitting the caricature; FR is the safe default). */
  country: Country;
  /** Short human note for the integration agent (not shown on screen). */
  role: string;
}

/** 1. Oussama Ben Laden — turban + long dark beard, robe. Snitch-reward gag. */
export const BEN_LADEN: SatireCharacter = {
  id: 'ben-laden',
  fullName: 'Oussama Ben Laden',
  look: { skin: '#a87a54', hair: '#1a120b', coat: '#cabfa0', hat: 'none', beard: true },
  country: 'SA',
  role: 'Réclame un kombucha (légal), insiste AVANT et APRÈS la vente ; appeler la police = prime +500 €.',
};

/** 2. Mark Zuckerberg — pale skin, grey hoodie. Fake product / paiement douteux. */
export const ZUCKERBERG: SatireCharacter = {
  id: 'zuckerberg',
  fullName: 'Mark Zuckerberg',
  look: { skin: '#d8c4ad', hair: '#5a4632', coat: '#9aa0a6', hat: 'none', beard: false },
  country: 'US',
  role: 'Veut racheter tout le rayon / payer en données — produit fictif, REFUSER ou BLUFFER.',
};

/** 3. Donald Trump — orange skin, blond comb-over, suit. Fraudster / bluff. */
export const TRUMP: SatireCharacter = {
  id: 'trump',
  fullName: 'Donald Trump',
  look: { skin: '#d98a4e', hair: '#e8d27a', coat: '#243046', hat: 'none', beard: false },
  country: 'US',
  role: 'Arnaqueur : produit fictif, bluffe / part sans payer ; insiste, police JUSTIFIÉE.',
};

/** 4. Gérard Depardieu — large, red face. Ivresse refusal. */
export const DEPARDIEU: SatireCharacter = {
  id: 'depardieu',
  fullName: 'Gérard Depardieu',
  look: { skin: '#c87a5e', hair: '#9a8a78', coat: '#5f5347', hat: 'none', beard: false },
  country: 'FR',
  role: 'Ivre, réclame de l\'alcool — refus pour ivresse ; insiste, police = ABUS (juste saoul).',
};

/** 5. Greta Thunberg — braids + yellow raincoat. Eco esclandre. */
export const GRETA: SatireCharacter = {
  id: 'greta',
  fullName: 'Greta Thunberg',
  look: { skin: '#d6b48f', hair: '#7d5631', coat: '#d8b53a', hat: 'none', beard: false },
  country: 'IL', // not in the supported list -> safe default
  role: 'Esclandre écolo : insiste, police = ABUS (sympathique).',
};

/** 6. Charlie Kirk — suit, cap. Aggressive political harangue. */
export const KIRK: SatireCharacter = {
  id: 'kirk',
  fullName: 'Charlie Kirk',
  look: { skin: '#c79a72', hair: '#3a2a1a', coat: '#2b3a4a', hat: 'cap', beard: false },
  country: 'US',
  role: 'Harangue politique agressive : insiste, police JUSTIFIÉE.',
};

/** 7. Emmanuel Macron — dark suit. « En même temps » gag, no special mechanic. */
export const MACRON: SatireCharacter = {
  id: 'macron',
  fullName: 'Emmanuel Macron',
  look: { skin: '#c79a72', hair: '#3a2a1a', coat: '#1f2733', hat: 'none', beard: false },
  country: 'IL',
  role: 'Veut le tabac « en même temps » qu\'il l\'interdit — gag, vente propre, aucun mécanisme.',
};

/** 8. Cyril Hanouna — casual. Buys loudly half the shelf (big-change test). */
export const HANOUNA: SatireCharacter = {
  id: 'hanouna',
  fullName: 'Cyril Hanouna',
  look: { skin: '#a87a54', hair: '#1a120b', coat: '#5f7348', hat: 'none', beard: true },
  country: 'IL',
  role: 'Achète bruyamment un gros article — test de grosse monnaie ; gag, vente propre.',
};

export const SATIRE_CHARACTERS: readonly SatireCharacter[] = [
  BEN_LADEN,
  ZUCKERBERG,
  TRUMP,
  DEPARDIEU,
  GRETA,
  KIRK,
  MACRON,
  HANOUNA,
];

/**
 * Scheduled satire appearances, keyed by satire id -> the days they show up.
 * Spread across the 30-day campaign (one every ~2-4 days), avoiding the weekly
 * reckonings (7/14/21/28), the inspection day (28) and the finale (29-30).
 * Depardieu only lands once the drunkenness rule is active (day >= 8) so the
 * ivresse refusal is enforceable.
 */
const SATIRE_SCHEDULE: Record<string, readonly number[]> = {
  [GRETA.id]: [3],
  [BEN_LADEN.id]: [5],
  [ZUCKERBERG.id]: [9],
  [DEPARDIEU.id]: [11],
  [TRUMP.id]: [13],
  [MACRON.id]: [16],
  [KIRK.id]: [19],
  [HANOUNA.id]: [23],
};

/** Satire character ids scheduled to appear on a given day. */
export function satireIdsForDay(day: number): string[] {
  const ids: string[] = [];
  for (const c of SATIRE_CHARACTERS) {
    if (SATIRE_SCHEDULE[c.id]?.includes(day)) ids.push(c.id);
  }
  return ids;
}

/** Recognize the satire caricature a client represents (by Client.satireId). */
export function satireCharacterFor(client: { satireId?: string }): SatireCharacter | undefined {
  if (!client.satireId) return undefined;
  return SATIRE_CHARACTERS.find((c) => c.id === client.satireId);
}
