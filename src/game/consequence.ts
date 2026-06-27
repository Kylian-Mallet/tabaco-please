// Consequences of player decisions: warnings, fines, and end-of-day inspections.
// No Math.random / Date — any "chance" is derived deterministically from state counters.

import type { EtatPartie, Decision } from './types';

export interface Evt {
  type: 'avertissement' | 'amende' | 'controle' | 'patience';
  montant?: number;
  message: string;
}

/** Round to cents to avoid float drift on euro maths. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Fine amount for a faulty decision, scaled by the product price. */
function montantAmende(decision: Decision): number {
  const prix = decision.client.demande.prix;
  // Base fine plus the value of the (mis)handled goods, floored to a sensible minimum.
  return cents(Math.max(20, 15 + prix * 2));
}

/**
 * Apply a player decision to state; returns events to show.
 * - 1st faute of the run = avertissement (grace, no fine), increments state.avertissements
 * - later VISIBLE fautes = immediate amende deducted from recetteDuJour
 * - hidden risky sales (a wrong 'vendre' that slipped through) are pushed to
 *   state.fautesNonVues to be audited later by controleAleatoire
 */
export function appliquer(state: EtatPartie, decision: Decision): Evt[] {
  const evts: Evt[] = [];

  // Correct decisions have no consequence here.
  if (decision.correcte) {
    return evts;
  }

  // A wrong 'vendre' is a risky sale that nobody saw at the counter: it may surface
  // during a later inspection. Stash it instead of fining immediately.
  if (decision.action === 'vendre') {
    state.fautesNonVues.push(decision);
    return evts;
  }

  // A wrong 'refuser' (turning away a valid customer) is immediately visible.
  if (state.avertissements === 0) {
    state.avertissements += 1;
    evts.push({
      type: 'avertissement',
      message: 'Avertissement : première faute. La prochaine sera sanctionnée.',
    });
    return evts;
  }

  const montant = montantAmende(decision);
  state.recetteDuJour = cents(state.recetteDuJour - montant);
  evts.push({
    type: 'amende',
    montant,
    message: `Amende de ${montant.toFixed(2)} € déduite de la recette.`,
  });
  return evts;
}

/**
 * End-of-day inspection. Deterministically decides whether the inspector audits the
 * pending risky sales (state.fautesNonVues). If audited, each is fined and the list
 * is cleared. Chance is derived from state counters — no randomness.
 */
export function controleAleatoire(state: EtatPartie): Evt[] {
  const evts: Evt[] = [];
  const enAttente = state.fautesNonVues;

  if (enAttente.length === 0) {
    return evts;
  }

  // Pseudo-random-but-deterministic trigger: the more pending faults and the later the
  // day, the likelier an inspection. Combine counters into a 0..99 score and threshold.
  const seed =
    state.jour * 37 +
    enAttente.length * 53 +
    state.avertissements * 29 +
    Math.round(Math.abs(state.recetteDuJour));
  const score = seed % 100;
  // Audit probability grows with the number of pending faults (cap at ~90%).
  const seuil = Math.min(90, 25 + enAttente.length * 20);

  if (score >= seuil) {
    // No inspection today; risky sales stay pending for a future day.
    return evts;
  }

  let total = 0;
  for (const faute of enAttente) {
    total = cents(total + montantAmende(faute));
  }
  state.recetteDuJour = cents(state.recetteDuJour - total);

  const n = enAttente.length;
  // Clear audited faults.
  state.fautesNonVues = [];

  evts.push({
    type: 'controle',
    montant: total,
    message: `Contrôle ! ${n} vente${n > 1 ? 's' : ''} à risque détectée${
      n > 1 ? 's' : ''
    }. Amende totale de ${total.toFixed(2)} €.`,
  });
  return evts;
}
