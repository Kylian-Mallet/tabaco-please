// Economy: daily takings, weekly reckoning (rent + supplier), week-end check.

import type { GameState, MatchInfo, BetTicket, BetPick } from './types';
import { RENT, SUPPLIER_ORDER, TOTAL_DAYS } from './types';
import { DAYS_PER_WEEK } from './content/days';
import { outcomeFromScore } from './content/matches';

/** Round a euro amount to cents to avoid float drift. */
function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Add a sale amount to the day's takings. */
export function cashIn(state: GameState, amount: number): void {
  state.dayRevenue = roundCents(state.dayRevenue + amount);
}

/**
 * Fold the accumulated takings (dayRevenue) into the cash balance and zero them.
 * Used at the weekly reckoning and at the campaign finale (days 29-30 have no
 * further reckoning, so their takings must be banked before the epilogue).
 */
export function bankRevenue(state: GameState): void {
  state.cash = roundCents(state.cash + state.dayRevenue);
  state.dayRevenue = 0;
}

/**
 * End-of-week reckoning: fold the day's takings into the cash balance, then deduct
 * the weekly rent (RENT) and supplier order (SUPPLIER_ORDER).
 * Bankruptcy if the cash balance falls to zero or below.
 */
export function weeklyReckoning(state: GameState): { bankrupt: boolean; detail: string } {
  bankRevenue(state);

  const charges = roundCents(RENT + SUPPLIER_ORDER);
  state.cash = roundCents(state.cash - charges);

  const bankrupt = state.cash <= 0;
  const detail =
    `Loyer -${RENT} €, commande fournisseur -${SUPPLIER_ORDER} €. ` +
    `Trésorerie : ${state.cash} €.` +
    (bankrupt ? ' FAILLITE.' : '');

  return { bankrupt, detail };
}

/** True on the last day of each week (every DAYS_PER_WEEK days). */
export function isWeekEnd(day: number): boolean {
  return day % DAYS_PER_WEEK === 0;
}

/** True once the player has reached (or passed) the final day of the campaign. */
export function isCampaignEnd(day: number): boolean {
  return day >= TOTAL_DAYS;
}

/** A campaign epilogue: a stable id, a French title, and the French closing text. */
export interface Ending {
  id: 'titularise' | 'sursis' | 'licence' | 'faillite';
  title: string;
  text: string;
}

/**
 * Pick the campaign epilogue from the player's overall performance.
 * Factors: solvency (cash), accumulated warnings, cumulative faults (totalFaults),
 * and narrative flags. Bankruptcy (cash <= 0) always wins. A revoked license
 * ('licence') is forced by too many faults or by serious illegal sales recorded
 * in the story flags. Otherwise a clean run is tenured ('titularise'); a passable
 * one gets a reprieve ('sursis').
 */
export function chooseEnding(state: GameState): Ending {
  const name = state.playerName && state.playerName.trim().length > 0 ? state.playerName : 'Gérant';
  const faults = state.totalFaults ?? 0;
  const story = state.story ?? {};

  // Bankruptcy: the shop has gone under. Highest-priority outcome.
  if (state.cash <= 0) {
    return {
      id: 'faillite',
      title: 'FAILLITE',
      text:
        `Le rideau de fer reste baissé. La trésorerie n'a pas tenu, ${name}. ` +
        'Le bureau de tabac ferme ses portes et la gérance vous est retirée. ' +
        'Peut-être qu\'ailleurs, la caisse sera plus clémente.',
    };
  }

  // License revoked: too many faults, or a flagged serious offence.
  // (Serving the banned gambler, enabling FDJ fraud, or selling to the minor.)
  const seriousOffence =
    story.enabledFraud === true || story.enabledGambler === true || story.soldToMinor === true;
  if (faults >= 8 || (faults >= 5 && seriousOffence)) {
    return {
      id: 'licence',
      title: 'LICENCE RETIRÉE',
      text:
        `Trop d'irrégularités au comptoir, ${name}. La Douane et la Française des Jeux ` +
        'ont tranché : votre licence de débitant est retirée. ' +
        (seriousOffence
          ? 'Servir un interdit de jeu et fermer les yeux sur la fraude ne pardonnent pas. '
          : '') +
        'Le commerce survivra, mais sans vous derrière la caisse.',
    };
  }

  // Clean tenure: solvent, very few faults (the single grace warning is tolerated),
  // no serious offence, inspection survived.
  if (faults <= 2 && !seriousOffence && story.passedInspection !== false) {
    return {
      id: 'titularise',
      title: 'TITULARISÉ',
      text:
        `Un mois irréprochable, ${name}. Caisse juste, contrôles passés, clients fidèles. ` +
        (story.protectedGambler ? 'Vous avez su protéger ceux qui ne savaient plus s\'arrêter. ' : '') +
        'Le gérant vous confie officiellement le bureau de tabac : il est désormais le vôtre.',
    };
  }

  // Default: a reprieve — you got through it, but it was close.
  return {
    id: 'sursis',
    title: 'SURSIS',
    text:
      `Le mois est bouclé, ${name}. Quelques fautes, quelques amendes, mais la caisse est positive. ` +
      'Le gérant vous garde derrière le comptoir — à l\'essai, pour un mois de plus. ' +
      'Faites mieux la prochaine fois.',
  };
}

/** Decimal odds attached to a given pick on a match. */
export function oddsForPick(odds: MatchInfo['odds'], pick: BetPick): number {
  if (pick === 'A') return odds.a;
  if (pick === 'B') return odds.b;
  return odds.draw;
}

/**
 * Gross payout owed for a settled ticket. Returns 0 (no payout) when the match is
 * not actually finished, or when the ticket's pick does not match the real
 * outcome of the final score. Otherwise returns stake * odds[outcome], in cents.
 * Paying out a 0-result ticket would be a betting fault.
 */
export function payout(ticket: BetTicket, match: MatchInfo): number {
  if (match.status !== 'done' || !match.finalScore) return 0;
  const outcome = outcomeFromScore(match.finalScore);
  if (outcome !== ticket.pick) return 0;
  return roundCents(ticket.stake * oddsForPick(match.odds, outcome));
}
