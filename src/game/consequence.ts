// Consequences of player decisions: warnings, fines, and end-of-day inspections.
// No Math.random / Date — any "chance" is derived deterministically from state counters.

import type { GameState, Decision, Client } from './types';

export interface GameEvent {
  type: 'warning' | 'fine' | 'inspection' | 'patience';
  amount?: number;
  message: string;
}

/** Round to cents to avoid float drift on euro maths. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Fine amount for a faulty decision, scaled by the product price. */
function fineAmount(decision: Decision): number {
  const price = decision.client.request.price;
  // Base fine plus the value of the (mis)handled goods, floored to a sensible minimum.
  return cents(Math.max(20, 15 + price * 2));
}

/**
 * Apply a player decision to state; returns events to show.
 * - 1st fault of the run = warning (grace, no fine), increments state.warnings
 * - later VISIBLE faults = immediate fine deducted from dayRevenue
 * - hidden risky sales (a wrong 'sell' that slipped through) are pushed to
 *   state.unseenFaults to be audited later by randomInspection
 */
export function applyConsequence(state: GameState, decision: Decision): GameEvent[] {
  const events: GameEvent[] = [];

  // Correct decisions have no consequence here.
  if (decision.correct) {
    return events;
  }

  // A wrong 'sell' is a risky sale that nobody saw at the counter: it may surface
  // during a later inspection. Stash it instead of fining immediately.
  if (decision.action === 'sell') {
    state.unseenFaults.push(decision);
    return events;
  }

  // A wrong 'refuse' (turning away a valid customer) is immediately visible.
  if (state.warnings === 0) {
    state.warnings += 1;
    events.push({
      type: 'warning',
      message: 'Avertissement : première faute. La prochaine sera sanctionnée.',
    });
    return events;
  }

  const amount = fineAmount(decision);
  state.dayRevenue = cents(state.dayRevenue - amount);
  state.totalFaults += 1;
  events.push({
    type: 'fine',
    amount,
    message: `Amende de ${amount.toFixed(2)} € déduite de la recette.`,
  });
  return events;
}

/**
 * A legal sale where the WRONG CHANGE was given: an immediate, visible till
 * discrepancy (caught at the counter), NOT a hidden "risky sale". 1st fault of
 * the run is a warning; later ones are a small immediate fine. This is distinct
 * from an illegal sale, which goes to unseenFaults for a later inspection.
 */
export function applyChangeError(state: GameState, client: Client): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.warnings === 0) {
    state.warnings += 1;
    events.push({
      type: 'warning',
      message: 'Avertissement : erreur de monnaie. La prochaine sera sanctionnée.',
    });
    return events;
  }
  const amount = cents(Math.max(10, 10 + client.request.price));
  state.dayRevenue = cents(state.dayRevenue - amount);
  state.totalFaults += 1;
  events.push({
    type: 'fine',
    amount,
    message: `Erreur de caisse : amende de ${amount.toFixed(2)} € sur la recette.`,
  });
  return events;
}

/**
 * A betting fault caught at the FDJ terminal: paying out a losing/fake ticket,
 * settling a ticket on a match that is not finished, or registering a bet on a
 * match that has already kicked off / letting a fraudster leave without paying.
 * Like applyChangeError, this is an immediate, VISIBLE till discrepancy: 1st
 * fault of the run is a warning; later ones are an immediate fine. `loss` is the
 * money already wrongly handed out (added on top of a base penalty), if any.
 */
export function applyBettingError(state: GameState, loss: number = 0): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.warnings === 0) {
    state.warnings += 1;
    events.push({
      type: 'warning',
      message: 'Avertissement : erreur sur un pari sportif. La prochaine sera sanctionnée.',
    });
    return events;
  }
  const amount = cents(Math.max(20, 20 + loss));
  state.dayRevenue = cents(state.dayRevenue - amount);
  state.totalFaults += 1;
  events.push({
    type: 'fine',
    amount,
    message: `Pari frauduleux : amende de ${amount.toFixed(2)} € sur la recette.`,
  });
  return events;
}

/**
 * End-of-day inspection. Deterministically decides whether the inspector audits the
 * pending risky sales (state.unseenFaults). If audited, each is fined and the list
 * is cleared. Chance is derived from state counters — no randomness.
 */
export function randomInspection(state: GameState, force: boolean = false): GameEvent[] {
  const events: GameEvent[] = [];
  const pending = state.unseenFaults;

  if (pending.length === 0) {
    return events;
  }

  if (!force) {
    // Pseudo-random-but-deterministic trigger: the more pending faults and the later
    // the day, the likelier an inspection. Combine counters into a 0..99 score and
    // threshold. A forced (scripted) inspection skips this and always audits.
    const seed =
      state.day * 37 +
      pending.length * 53 +
      state.warnings * 29 +
      Math.round(Math.abs(state.dayRevenue));
    const score = seed % 100;
    // Audit probability grows with the number of pending faults (cap at ~90%).
    const threshold = Math.min(90, 25 + pending.length * 20);

    if (score >= threshold) {
      // No inspection today; risky sales stay pending for a future day.
      return events;
    }
  }

  let total = 0;
  for (const fault of pending) {
    total = cents(total + fineAmount(fault));
  }
  state.dayRevenue = cents(state.dayRevenue - total);

  const n = pending.length;
  // Each audited risky sale now counts as a confirmed fault for the run.
  state.totalFaults += n;
  // Clear audited faults.
  state.unseenFaults = [];

  events.push({
    type: 'inspection',
    amount: total,
    message: `Contrôle ! ${n} vente${n > 1 ? 's' : ''} à risque détectée${
      n > 1 ? 's' : ''
    }. Amende totale de ${total.toFixed(2)} €.`,
  });
  return events;
}
