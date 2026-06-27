// Day configuration: rule progression, briefing text and client roster.

import type { Client, Regle } from '../types';
import { REGLES } from '../rules';
import { poolDuJour } from './clients';

export interface JourConfig {
  jour: number;
  /** Rule unlocked this day, if any. */
  nouvelleRegle?: Regle;
  /** Briefing text shown in DayIntroScene. */
  intro: string;
  /** Ordered queue of clients for the day. */
  file: Client[];
}

/** Last playable day of the week. */
export const DERNIER_JOUR: number = 4;

/** Rule unlocked on each day (J1 has no new restriction beyond the caisse). */
const REGLE_DU_JOUR: Record<number, Regle | undefined> = {
  1: REGLES.monnaie,
  2: REGLES.age,
  3: REGLES.ivresse,
  4: REGLES.fichier,
};

/** French briefing shown at the start of each day. */
const INTRO_DU_JOUR: Record<number, string> = {
  1:
    'Jour 1 — Premier jour au comptoir.\n' +
    'Encaisse les clients et rends la monnaie au centime près.\n' +
    'La caisse doit toujours tomber juste.',
  2:
    'Jour 2 — Nouvelle consigne : le tabac.\n' +
    'Interdit de vendre du tabac aux mineurs.\n' +
    'Vérifie la date de naissance sur la carte d\'identité (18 ans minimum).',
  3:
    'Jour 3 — Attention à l\'alcool.\n' +
    'Refuse de vendre de l\'alcool aux personnes visiblement ivres.\n' +
    'Et toujours pas d\'alcool ni de tabac aux mineurs.',
  4:
    'Jour 4 — Le fichier des interdits de jeux.\n' +
    'Certains clients n\'ont plus le droit de jouer.\n' +
    'Vérifie chaque nom sur le fichier avant de vendre un jeu.',
};

/**
 * Build the configuration for a given day: the rule unlocked, the briefing
 * text and the deterministic-ish roster of clients to serve.
 */
export function configJour(jour: number): JourConfig {
  const nouvelleRegle = REGLE_DU_JOUR[jour];
  const intro =
    INTRO_DU_JOUR[jour] ?? `Jour ${jour} — Bonne journée au comptoir.`;
  return {
    jour,
    ...(nouvelleRegle ? { nouvelleRegle } : {}),
    intro,
    file: poolDuJour(jour),
  };
}
