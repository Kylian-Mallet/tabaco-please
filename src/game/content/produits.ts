// Catalogue MVP : produits vendus au comptoir du tabac.
// Mix tabac / alcool / epicerie / jeux avec prix (euros) et age minimum legal.

import type { Produit } from '../types';

export const PRODUITS: Produit[] = [
  // --- Tabac (18+) ---
  { id: 'marlboro-red', nom: 'Marlboro Red (paquet)', categorie: 'tabac', prix: 12.0, ageMin: 18 },
  { id: 'marlboro-gold', nom: 'Marlboro Gold (paquet)', categorie: 'tabac', prix: 12.0, ageMin: 18 },
  { id: 'camel-blue', nom: 'Camel Blue (paquet)', categorie: 'tabac', prix: 11.5, ageMin: 18 },
  { id: 'lucky-strike', nom: 'Lucky Strike (paquet)', categorie: 'tabac', prix: 11.5, ageMin: 18 },
  { id: 'tabac-amsterdamer', nom: 'Amsterdamer (tabac a rouler)', categorie: 'tabac', prix: 16.5, ageMin: 18 },
  { id: 'feuilles-ocb', nom: 'Feuilles OCB Slim', categorie: 'tabac', prix: 1.2, ageMin: 18 },

  // --- Alcool (18+) ---
  { id: 'biere-1664', nom: 'Kronenbourg 1664 (33cl)', categorie: 'alcool', prix: 2.2, ageMin: 18 },
  { id: 'biere-heineken', nom: 'Heineken (33cl)', categorie: 'alcool', prix: 2.4, ageMin: 18 },
  { id: 'pack-biere', nom: 'Pack 6 bieres Desperados', categorie: 'alcool', prix: 9.9, ageMin: 18 },
  { id: 'vin-bordeaux', nom: 'Bouteille Bordeaux rouge', categorie: 'alcool', prix: 7.5, ageMin: 18 },
  { id: 'pastis-51', nom: 'Pastis 51 (1L)', categorie: 'alcool', prix: 18.9, ageMin: 18 },

  // --- Epicerie (sans restriction d'age) ---
  { id: 'chewing-gum', nom: 'Chewing-gum Hollywood', categorie: 'epicerie', prix: 1.3, ageMin: 0 },
  { id: 'journal-equipe', nom: "Journal L'Equipe", categorie: 'epicerie', prix: 1.6, ageMin: 0 },
  { id: 'briquet-bic', nom: 'Briquet Bic', categorie: 'epicerie', prix: 1.5, ageMin: 0 },
  { id: 'barre-chocolat', nom: 'Barre chocolatee Twix', categorie: 'epicerie', prix: 1.1, ageMin: 0 },
  { id: 'bouteille-eau', nom: "Bouteille d'eau Cristaline (50cl)", categorie: 'epicerie', prix: 1.0, ageMin: 0 },
  { id: 'timbre-poste', nom: 'Timbre Lettre Verte', categorie: 'epicerie', prix: 1.39, ageMin: 0 },

  // --- Jeux / FDJ (18+) ---
  { id: 'ticket-cash', nom: 'Ticket Cash (FDJ)', categorie: 'jeux', prix: 5.0, ageMin: 18 },
  { id: 'ticket-banco', nom: 'Ticket Banco (FDJ)', categorie: 'jeux', prix: 2.0, ageMin: 18 },
  { id: 'ticket-millionnaire', nom: 'Ticket Millionnaire (FDJ)', categorie: 'jeux', prix: 10.0, ageMin: 18 },
  { id: 'grille-euromillions', nom: 'Grille EuroMillions', categorie: 'jeux', prix: 2.5, ageMin: 18 },
  { id: 'grille-loto', nom: 'Grille Loto', categorie: 'jeux', prix: 2.2, ageMin: 18 },
];
