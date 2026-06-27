// Game rules: age math, decision evaluation, and the rule registry.
// Imports the shared model from types.ts (single source of truth).

import type { Client, Regle, TypeRegle } from './types';
import { JOUR_COURANT } from './types';

/**
 * Whole-year age between a birth date and a reference date (default JOUR_COURANT).
 * Returns completed years (a birthday that has not yet occurred in dateRef's year
 * does not count). Both dates are ISO 'YYYY-MM-DD'.
 */
export function ageDepuis(dateNaissance: string, dateRef: string = JOUR_COURANT): number {
  const [ny, nm, nd] = dateNaissance.split('-').map(Number);
  const [ry, rm, rd] = dateRef.split('-').map(Number);
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
 * A 'vendre' is correcte only if ALL active rules pass:
 *   age:      ageDepuis(client) >= demande.ageMin
 *   ivresse:  NOT (categorie==='alcool' && estIvre)
 *   fichier:  NOT (categorie==='jeux'   && nomSurFichierInterdits)
 *   monnaie:  handled separately in CounterScene (not here)
 * A 'refuser' is correcte only if at least one active rule WOULD have blocked the sale.
 * Refusing an otherwise-valid client is a faute (lost regular).
 *
 * `raisons` lists human-readable reasons the sale is/would be blocked.
 */
export function evalDecision(
  client: Client,
  action: 'vendre' | 'refuser',
  regles: Regle[],
): { correcte: boolean; raisons: string[] } {
  const raisons: string[] = [];
  const { demande } = client;

  for (const regle of regles) {
    switch (regle.type) {
      case 'age': {
        if (demande.ageMin > 0 && ageDepuis(client.dateNaissance) < demande.ageMin) {
          raisons.push(
            `Client mineur (${ageDepuis(client.dateNaissance)} ans) pour ${demande.nom} (${demande.ageMin}+).`,
          );
        }
        break;
      }
      case 'ivresse': {
        if (demande.categorie === 'alcool' && client.estIvre) {
          raisons.push("Vente d'alcool à une personne en état d'ivresse.");
        }
        break;
      }
      case 'fichier': {
        if (demande.categorie === 'jeux' && client.nomSurFichierInterdits) {
          raisons.push('Client inscrit au fichier des interdits de jeu.');
        }
        break;
      }
      case 'monnaie':
        // Change-making is validated in CounterScene, not here.
        break;
    }
  }

  const venteBloquee = raisons.length > 0;
  const correcte = action === 'vendre' ? !venteBloquee : venteBloquee;
  return { correcte, raisons };
}

/** Rule registry keyed by type, with unlock day and french description. */
export const REGLES: Record<TypeRegle, Regle> = {
  monnaie: {
    id: 'monnaie',
    jourDeblocage: 1,
    type: 'monnaie',
    description: 'Rendez la monnaie exacte au centime près.',
  },
  age: {
    id: 'age',
    jourDeblocage: 2,
    type: 'age',
    description: "Vérifiez l'âge : tabac, alcool et jeux interdits aux moins de 18 ans.",
  },
  ivresse: {
    id: 'ivresse',
    jourDeblocage: 3,
    type: 'ivresse',
    description: "Refusez l'alcool à toute personne manifestement en état d'ivresse.",
  },
  fichier: {
    id: 'fichier',
    jourDeblocage: 4,
    type: 'fichier',
    description: 'Refusez les jeux aux clients inscrits au fichier des interdits.',
  },
};
