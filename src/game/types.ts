// Canonical data model for Tabaco Please.
// Single source of truth for shared types & constants.

import type { Renderer } from '../engine/renderer';
import type { StateMachine, Scene } from '../engine/stateMachine';

export type Categorie = 'tabac' | 'alcool' | 'epicerie' | 'jeux';

export interface Produit {
  id: string;
  nom: string;
  categorie: Categorie;
  prix: number;
  /** Minimum legal age to buy this product (0 = no restriction). */
  ageMin: number;
}

export interface Client {
  id: string;
  /** Placeholder sprite name (no asset files for MVP). */
  sprite: string;
  demande: Produit;
  /** ISO date of birth, e.g. '2005-04-12'. */
  dateNaissance: string;
  estIvre: boolean;
  /** True if this client appears on the "fichier des interdits" (banned list). */
  nomSurFichierInterdits: boolean;
  nomComplet: string;
  /** Patience 0..100; drains while waiting. */
  patience: number;
}

export type TypeRegle = 'monnaie' | 'age' | 'ivresse' | 'fichier';

export interface Regle {
  id: string;
  /** Day on which this rule becomes active. */
  jourDeblocage: number;
  type: TypeRegle;
  description: string;
}

export interface Decision {
  client: Client;
  action: 'vendre' | 'refuser';
  correcte: boolean;
}

export interface EtatPartie {
  jour: number;
  tresorerie: number;
  avertissements: number;
  reglesActives: Regle[];
  recetteDuJour: number;
  /** Risky sales that may be audited later by controleAleatoire. */
  fautesNonVues: Decision[];
}

/** The in-game "today" used for all age math. */
export const JOUR_COURANT: string = '2026-06-27';

/** Weekly rent charged at the couperet. */
export const LOYER: number = 600;

/** Fixed supplier order cost charged at the couperet. */
export const COMMANDE_FOURNISSEUR: number = 250;

/** Starting cash. */
export const TRESORERIE_INITIALE: number = 1000;

/** Euro denominations (bills + coins) for change-making, descending. */
export const DENOMINATIONS: number[] = [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];

export interface GameContext {
  state: EtatPartie;
  renderer: Renderer;
  sm: StateMachine;
  goTo(scene: Scene): void;
}
