// Consequences of player decisions: warnings, fines, and end-of-day inspections.
// No Math.random / Date — any "chance" is derived deterministically from state counters.

import type { GameState, Decision, Client } from './types';

export interface GameEvent {
  type: 'warning' | 'fine' | 'inspection' | 'patience';
  amount?: number;
  message: string;
  /**
   * Finer-grained tag for the insistence-standoff / police outcomes, so scenes can
   * branch (gyrophare + shake on a call, "Abus de pouvoir" styling, reputation
   * delta toast) WITHOUT widening `type` — which is an exhaustive colour key in the
   * counter scene. For these events `amount` carries the (signed) reputation delta.
   * Absent on the ordinary warning/fine/inspection/patience events.
   *
   * 'policeBonus' is the satirical snitch-reward path: `amount` carries the EURO
   * cash bonus added to the takings (NOT a reputation delta) — see applyPoliceBonus.
   */
  kind?: 'policeJustified' | 'policeAbuse' | 'reputationDing' | 'policeBonus';
}

/** Starting reputation for a fresh run (also the on-load fallback). */
export const REPUTATION_START: number = 50;

/** Reputation deltas for the insisting-standoff / police outcomes. */
const REP_POLICE_JUSTIFIED: number = 8; // a fair call: hauling off a real troublemaker
const REP_POLICE_ABUSE: number = 18; // calling the cops on a harmless insister
const REP_PUBLIC_SCENE: number = 4; // letting an esclandre play out in public
const REP_CAVE_IN: number = 6; // folding to an insister's illegal demand

/** Clamp a reputation value into the legal 0..100 band. */
function clampReputation(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Current reputation, tolerating older saves where the field is absent. */
function currentReputation(state: GameState): number {
  return typeof state.reputation === 'number' ? state.reputation : REPUTATION_START;
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
 * The 3rd verb: APPELER LA POLICE on an insisting client.
 *   justified === true  — the troublemaker (aggressive fraudster / threatening
 *     banned person) is hauled off cleanly: reputation rises, a positive event.
 *   justified === false — calling the cops on a harmless insister is an ABUSE of
 *     power: reputation drops and an « Abus de pouvoir » event is shown.
 * Reputation is always clamped to 0..100. No fine here — the cost is reputational.
 */
export function applyPoliceCall(state: GameState, justified: boolean): GameEvent[] {
  const before = currentReputation(state);
  if (justified) {
    state.reputation = clampReputation(before + REP_POLICE_JUSTIFIED);
    return [
      {
        type: 'warning', // neutral toast colour; scene branches on `kind`
        kind: 'policeJustified',
        amount: state.reputation - before,
        message: 'La police embarque le fauteur de trouble. Le quartier vous remercie.',
      },
    ];
  }
  state.reputation = clampReputation(before - REP_POLICE_ABUSE);
  return [
    {
      type: 'warning',
      kind: 'policeAbuse',
      amount: state.reputation - before,
      message: 'Abus de pouvoir : la police pour ça ? Le quartier ne vous le pardonne pas.',
    },
  ];
}

/**
 * The satirical "snitch reward" police path. Some special clients carry a
 * `policeBonus`: calling the police on them pays this flat CASH bonus to the day's
 * takings INSTEAD of the normal reputation outcome (applyPoliceCall). Reputation
 * is left untouched. When the client carries no bonus, this transparently falls
 * back to the normal applyPoliceCall (using client.policeWorthy). The counter
 * scene can therefore always route insister police calls through this helper.
 */
export function applyPoliceBonus(state: GameState, client: Client): GameEvent[] {
  const bonus = client.policeBonus && client.policeBonus > 0 ? client.policeBonus : 0;
  if (bonus <= 0) {
    return applyPoliceCall(state, Boolean(client.policeWorthy));
  }
  state.dayRevenue = cents(state.dayRevenue + bonus);
  return [
    {
      type: 'warning', // neutral toast colour; scene branches on `kind`
      kind: 'policeBonus',
      amount: bonus,
      message: `Prime de dénonciation : +${bonus.toFixed(0)} € versés à la caisse.`,
    },
  ];
}

/**
 * Reputation ding for letting an insisting client's public "esclandre" run its
 * course (IGNORER / tenir bon). No fault, just a small public-image hit.
 */
export function applyPublicSceneDing(state: GameState): GameEvent[] {
  const before = currentReputation(state);
  state.reputation = clampReputation(before - REP_PUBLIC_SCENE);
  return [
    {
      type: 'patience', // mild orange toast, no red flash
      kind: 'reputationDing',
      amount: state.reputation - before,
      message: 'Esclandre au comptoir : la scène a fait jaser dans la file.',
    },
  ];
}

/**
 * Reputation ding for CAVING IN to an insister — handing over the illegal sale to
 * make them leave. The illegal-sale fault itself is applied separately by the
 * caller (the existing applyConsequence on a wrong 'sell'); this only adds the
 * reputational cost of folding under pressure.
 */
export function applyCaveInDing(state: GameState): GameEvent[] {
  const before = currentReputation(state);
  state.reputation = clampReputation(before - REP_CAVE_IN);
  return [
    {
      type: 'patience',
      kind: 'reputationDing',
      amount: state.reputation - before,
      message: 'Vous avez cédé sous la pression. Mauvais signal.',
    },
  ];
}

/**
 * The illegal sale handed over when the player CAVES IN to an insister. Unlike an
 * ordinary wrong 'sell' (a hidden risky sale stashed for a later probabilistic
 * inspection), a public capitulation in front of the esclandre crowd is WITNESSED:
 * it is a confirmed, immediately-visible fault. 1st fault of the run is the grace
 * warning; later ones are an immediate fine. Always increments totalFaults so the
 * scene can never record NO fault on an unaudited cede.
 */
export function applyCedeSale(state: GameState, client: Client): GameEvent[] {
  const events: GameEvent[] = [];
  const decision: Decision = { client, action: 'sell', correct: false };
  if (state.warnings === 0) {
    // Match the grace-warning convention of the other visible faults: the very
    // first fault of the run is a warning only (no fine, no totalFaults bump).
    state.warnings += 1;
    events.push({
      type: 'warning',
      message: 'Avertissement : vente illégale sous la pression. La prochaine sera sanctionnée.',
    });
    return events;
  }
  const amount = fineAmount(decision);
  state.dayRevenue = cents(state.dayRevenue - amount);
  state.totalFaults += 1;
  events.push({
    type: 'fine',
    amount,
    message: `Vente illégale cédée : amende de ${amount.toFixed(2)} € sur la recette.`,
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
