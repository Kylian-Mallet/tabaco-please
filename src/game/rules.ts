// Game rules: age math, decision evaluation, and the rule registry.
// Imports the shared model from types.ts (single source of truth).

import type { Client, Rule, RuleType } from './types';
import { TODAY } from './types';
import { isAvailable } from './content/products';

/**
 * Whole-year age between a birth date and a reference date (default TODAY).
 * Returns completed years (a birthday that has not yet occurred in refDate's year
 * does not count). Both dates are ISO 'YYYY-MM-DD'.
 */
export function ageFrom(birthDate: string, refDate: string = TODAY): number {
  const [ny, nm, nd] = birthDate.split('-').map(Number);
  const [ry, rm, rd] = refDate.split('-').map(Number);
  let age = ry - ny;
  // Not had birthday yet this year? subtract one.
  if (rm < nm || (rm === nm && rd < nd)) {
    age -= 1;
  }
  return age;
}

/**
 * Evaluate a player decision against the currently active rules.
 *
 * A 'sell' is correct only if ALL active rules pass:
 *   age:     ageFrom(client) >= request.minAge
 *   drunk:   NOT (category==='alcool' && isDrunk)
 *   banList: NOT (category==='jeux'   && onBanList)
 *   change:  handled separately in CounterScene (not here)
 * A 'refuse' is correct only if at least one active rule WOULD have blocked the sale.
 * Refusing an otherwise-valid client is a fault (lost regular).
 *
 * `reasons` lists human-readable reasons the sale is/would be blocked.
 */
export function evaluateDecision(
  client: Client,
  action: 'sell' | 'refuse',
  rules: Rule[],
): { correct: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const { request } = client;

  // Availability is always in force (independent of the day's rules): you cannot
  // legitimately sell a product you do not carry, or one that does not exist.
  if (!isAvailable(request)) {
    reasons.push(
      request.fake
        ? `« ${request.name} » : ça n'existe pas.`
        : `« ${request.name} » : pas en stock.`,
    );
  }

  for (const rule of rules) {
    switch (rule.type) {
      case 'age': {
        if (request.minAge > 0 && ageFrom(client.birthDate) < request.minAge) {
          reasons.push(
            `Client mineur (${ageFrom(client.birthDate)} ans) pour ${request.name} (${request.minAge}+).`,
          );
        }
        break;
      }
      case 'drunk': {
        if (request.category === 'alcool' && client.isDrunk) {
          reasons.push("Vente d'alcool à une personne en état d'ivresse.");
        }
        break;
      }
      case 'banList': {
        if (request.category === 'jeux' && client.onBanList) {
          reasons.push('Client inscrit au fichier des interdits de jeu.');
        }
        break;
      }
      case 'change':
        // Change-making is validated in CounterScene, not here.
        break;
      case 'betting':
        // Betting legality (kickoff vs clock, ticket settlement) is handled at the
        // FDJ terminal, not in the product-sale path. N/A for a normal request.
        break;
      case 'laundering':
        // Anti-money-laundering identity check on large FDJ winnings is enforced at
        // the FDJ terminal when settling a big ticket, not on a normal product sale.
        break;
    }
  }

  const saleBlocked = reasons.length > 0;
  const correct = action === 'sell' ? !saleBlocked : saleBlocked;
  return { correct, reasons };
}

/**
 * Rule registry keyed by type, with unlock day and French description.
 * Rules are PACED across the finite 30-day campaign (4 acts / 7-day weeks):
 *   Week 1: change (day 1), age (day 3)
 *   Week 2: drunk (day 8)
 *   Week 3: banList (day 15), betting (day 17) — the FDJ terminal opens.
 *   Week 4: laundering (day 24) — anti-money-laundering ID check on big winnings.
 * Other days reinforce the rules already in force.
 */
export const RULES: Record<RuleType, Rule> = {
  change: {
    id: 'change',
    unlockDay: 1,
    type: 'change',
    description: 'Rendez la monnaie exacte au centime près.',
  },
  age: {
    id: 'age',
    unlockDay: 3,
    type: 'age',
    description: "Vérifiez l'âge : tabac, alcool, jeux, CBD, vape et presse adulte interdits aux moins de 18 ans.",
  },
  drunk: {
    id: 'drunk',
    unlockDay: 8,
    type: 'drunk',
    description: "Refusez l'alcool à toute personne manifestement en état d'ivresse.",
  },
  banList: {
    id: 'banList',
    unlockDay: 15,
    type: 'banList',
    description: 'Refusez les jeux aux clients inscrits au fichier des interdits.',
  },
  betting: {
    id: 'betting',
    unlockDay: 17,
    type: 'betting',
    description:
      'Paris sportifs : interdit de parier sur un match déjà commencé (vérifiez ' +
      "l'heure du coup d'envoi). Ne payez un ticket que sur un match terminé et gagnant.",
  },
  laundering: {
    id: 'laundering',
    unlockDay: 24,
    type: 'laundering',
    description:
      'Anti-blanchiment : pour tout gros gain FDJ (à partir de 500 €), exigez une ' +
      "pièce d'identité avant de payer le ticket.",
  },
};
