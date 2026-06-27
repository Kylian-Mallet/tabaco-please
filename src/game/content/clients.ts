// Client factory + per-day rosters.
// Deterministic ids via a module-level counter (no Math.random / Date).

import type { Client, Produit, Categorie } from '../types';
import { PRODUITS } from './produits';

let _seq = 0;

function nextId(): string {
  _seq += 1;
  return `client-${_seq.toString().padStart(3, '0')}`;
}

/** Reset the id counter — handy for tests / new run. */
export function resetClientIds(): void {
  _seq = 0;
}

/** First produit matching a category, with a safe fallback to the first product. */
function produitParCategorie(cat: Categorie): Produit {
  const p = PRODUITS.find((x) => x.categorie === cat);
  return p ?? PRODUITS[0];
}

/** Compute an ISO birth date for someone turning `age` this year (relative to 2026). */
function naissancePourAge(age: number): string {
  const annee = 2026 - age;
  return `${annee}-01-01`;
}

const NOMS: string[] = [
  'Jean Dupont',
  'Marie Lefevre',
  'Lucas Martin',
  'Chloe Bernard',
  'Mémé Ginette',
  'Karim Benali',
  'Sophie Moreau',
  'Paulo Da Silva',
  'Emma Petit',
  'Hugo Garnier',
];

let _nomSeq = 0;
function nextNom(): string {
  const n = NOMS[_nomSeq % NOMS.length];
  _nomSeq += 1;
  return n;
}

/**
 * Build a Client with sensible defaults; `partial` overrides any field.
 * Defaults: an adult (age 40) buying épicerie, sober, not banned, full patience.
 */
export function makeClient(partial: Partial<Client> = {}): Client {
  const base: Client = {
    id: nextId(),
    sprite: 'client_neutre',
    demande: produitParCategorie('epicerie'),
    dateNaissance: naissancePourAge(40),
    estIvre: false,
    nomSurFichierInterdits: false,
    nomComplet: nextNom(),
    patience: 100,
  };
  return { ...base, ...partial };
}

/**
 * Ordered roster for a given day, hand-tuned to teach that day's rule.
 * - J1: simple buys (caisse / monnaie).
 * - J2: a minor + a clearly-adult mémé (age rule on tabac).
 * - J3: a drunk wanting alcool (ivresse rule).
 * - J4: a regular on the fichier des interdits insisting (fichier rule).
 */
export function poolDuJour(jour: number): Client[] {
  switch (jour) {
    case 1:
      return [
        makeClient({
          sprite: 'client_calme',
          demande: produitParCategorie('epicerie'),
          nomComplet: 'Jean Dupont',
        }),
        makeClient({
          sprite: 'client_presse',
          demande: produitParCategorie('tabac'),
          dateNaissance: naissancePourAge(35),
          nomComplet: 'Karim Benali',
        }),
        makeClient({
          sprite: 'client_calme',
          demande: produitParCategorie('epicerie'),
          dateNaissance: naissancePourAge(28),
          nomComplet: 'Sophie Moreau',
        }),
      ];

    case 2:
      return [
        // Obvious minor wanting tabac -> must refuse.
        makeClient({
          sprite: 'client_ado',
          demande: produitParCategorie('tabac'),
          dateNaissance: naissancePourAge(15),
          nomComplet: 'Lucas Martin',
          patience: 80,
        }),
        // Clearly-adult mémé wanting tabac -> must sell.
        makeClient({
          sprite: 'client_meme',
          demande: produitParCategorie('tabac'),
          dateNaissance: naissancePourAge(78),
          nomComplet: 'Mémé Ginette',
        }),
        makeClient({
          sprite: 'client_calme',
          demande: produitParCategorie('epicerie'),
          dateNaissance: naissancePourAge(22),
          nomComplet: 'Emma Petit',
        }),
      ];

    case 3:
      return [
        // Drunk wanting alcool -> must refuse.
        makeClient({
          sprite: 'client_ivre',
          demande: produitParCategorie('alcool'),
          dateNaissance: naissancePourAge(45),
          estIvre: true,
          nomComplet: 'Paulo Da Silva',
          patience: 60,
        }),
        // Sober adult wanting alcool -> must sell.
        makeClient({
          sprite: 'client_calme',
          demande: produitParCategorie('alcool'),
          dateNaissance: naissancePourAge(33),
          nomComplet: 'Hugo Garnier',
        }),
        // Minor wanting tabac -> still refuse (J2 rule stays active).
        makeClient({
          sprite: 'client_ado',
          demande: produitParCategorie('tabac'),
          dateNaissance: naissancePourAge(16),
          nomComplet: 'Chloe Bernard',
          patience: 75,
        }),
      ];

    case 4:
      return [
        // Regular on the fichier des interdits wanting jeux, insisting -> must refuse.
        makeClient({
          sprite: 'client_insistant',
          demande: produitParCategorie('jeux'),
          dateNaissance: naissancePourAge(50),
          nomSurFichierInterdits: true,
          nomComplet: 'Marie Lefevre',
          patience: 40,
        }),
        // Clean adult wanting jeux -> must sell.
        makeClient({
          sprite: 'client_calme',
          demande: produitParCategorie('jeux'),
          dateNaissance: naissancePourAge(29),
          nomComplet: 'Jean Dupont',
        }),
        // Drunk wanting alcool -> refuse (J3 rule stays active).
        makeClient({
          sprite: 'client_ivre',
          demande: produitParCategorie('alcool'),
          dateNaissance: naissancePourAge(41),
          estIvre: true,
          nomComplet: 'Paulo Da Silva',
          patience: 55,
        }),
      ];

    default:
      return [makeClient()];
  }
}
