// Economy: daily takings, weekly couperet (rent + supplier), week-end check.

import type { EtatPartie } from './types';
import { LOYER, COMMANDE_FOURNISSEUR } from './types';
import { DERNIER_JOUR } from './content/jours';

/** Round a euro amount to cents to avoid float drift. */
function arrondiCentimes(montant: number): number {
  return Math.round(montant * 100) / 100;
}

/** Add a sale amount to the day's takings. */
export function encaisser(state: EtatPartie, montant: number): void {
  state.recetteDuJour = arrondiCentimes(state.recetteDuJour + montant);
}

/**
 * End-of-week couperet: fold the day's takings into the treasury, then deduct
 * the weekly rent (LOYER) and supplier order (COMMANDE_FOURNISSEUR).
 * Faillite if the treasury falls to zero or below.
 */
export function couperetSemaine(state: EtatPartie): { faillite: boolean; detail: string } {
  state.tresorerie = arrondiCentimes(state.tresorerie + state.recetteDuJour);
  state.recetteDuJour = 0;

  const charges = arrondiCentimes(LOYER + COMMANDE_FOURNISSEUR);
  state.tresorerie = arrondiCentimes(state.tresorerie - charges);

  const faillite = state.tresorerie <= 0;
  const detail =
    `Loyer -${LOYER} €, commande fournisseur -${COMMANDE_FOURNISSEUR} €. ` +
    `Trésorerie : ${state.tresorerie} €.` +
    (faillite ? ' FAILLITE.' : '');

  return { faillite, detail };
}

/** True at the end of the week (last day of the 4-day MVP). */
export function estFinSemaine(jour: number): boolean {
  return jour >= DERNIER_JOUR;
}
