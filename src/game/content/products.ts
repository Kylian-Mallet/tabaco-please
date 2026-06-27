// Catalogue: products sold at the tabac counter.
// Mix of tabac / alcool / epicerie / jeux (+ later cbd / presse / vape) with
// prices (euros), legal min age and an UNLOCK GROUP. Clients only ever request
// products whose group is currently unlocked (see content/days.ts).

import type { Product, ProductGroup } from '../types';

export const PRODUCTS: Product[] = [
  // --- Tabac (18+) — base group ---
  { id: 'marlboro-red', name: 'Marlboro Red', category: 'tabac', group: 'base', price: 12.0, minAge: 18, color: '#9c3b2e' },
  { id: 'marlboro-gold', name: 'Marlboro Gold', category: 'tabac', group: 'base', price: 12.0, minAge: 18, color: '#c9a23b' },
  { id: 'camel-blue', name: 'Camel Blue', category: 'tabac', group: 'base', price: 11.5, minAge: 18, color: '#34507e' },
  { id: 'camel', name: 'Camel', category: 'tabac', group: 'base', price: 11.5, minAge: 18, color: '#b78a63' },
  { id: 'chesterfield', name: 'Chesterfield', category: 'tabac', group: 'base', price: 11.0, minAge: 18, color: '#5f7348' },
  { id: 'fleur-du-pays', name: 'Fleur du Pays', category: 'tabac', group: 'base', price: 10.5, minAge: 18, color: '#7d5631' },
  { id: 'lucky-strike', name: 'Lucky Strike', category: 'tabac', group: 'base', price: 11.5, minAge: 18, color: '#b1322f' },
  { id: 'tabac-amsterdamer', name: 'Amsterdamer', category: 'tabac', group: 'base', price: 16.5, minAge: 18, color: '#473720' },
  { id: 'feuilles-ocb', name: 'Feuilles OCB Slim', category: 'tabac', group: 'base', price: 1.2, minAge: 18, color: '#e7ddc4' },

  // --- Alcool (18+) — base group ---
  { id: 'biere-1664', name: 'Kronenbourg 1664', category: 'alcool', group: 'base', price: 2.2, minAge: 18, color: '#34507e' },
  { id: 'biere-heineken', name: 'Heineken', category: 'alcool', group: 'base', price: 2.4, minAge: 18, color: '#5f7348' },
  { id: 'biere-8-6', name: '8.6', category: 'alcool', group: 'base', price: 1.8, minAge: 18, color: '#c9a23b' },
  { id: 'pack-biere', name: 'Pack Desperados', category: 'alcool', group: 'base', price: 9.9, minAge: 18, color: '#5f7348' },
  { id: 'vin-bordeaux', name: 'Bordeaux rouge', category: 'alcool', group: 'base', price: 7.5, minAge: 18, color: '#9c3b2e' },
  { id: 'pastis-51', name: 'Pastis 51', category: 'alcool', group: 'base', price: 18.9, minAge: 18, color: '#c9a23b' },

  // --- Epicerie / soft drinks (no age restriction) — base group ---
  { id: 'ciao-kombucha', name: 'Ciao Kombucha', category: 'epicerie', group: 'base', price: 3.5, minAge: 0, color: '#5f7348' },
  { id: 'capri-sun', name: 'Capri-Sun', category: 'epicerie', group: 'base', price: 1.2, minAge: 0, color: '#b1322f' },
  { id: 'chewing-gum', name: 'Chewing-gum Hollywood', category: 'epicerie', group: 'base', price: 1.3, minAge: 0 },
  { id: 'journal-equipe', name: "Journal L'Equipe", category: 'epicerie', group: 'base', price: 1.6, minAge: 0 },
  { id: 'briquet-bic', name: 'Briquet Bic', category: 'epicerie', group: 'base', price: 1.5, minAge: 0 },
  { id: 'barre-chocolat', name: 'Barre Twix', category: 'epicerie', group: 'base', price: 1.1, minAge: 0 },
  { id: 'bouteille-eau', name: "Bouteille d'eau Cristaline", category: 'epicerie', group: 'base', price: 1.0, minAge: 0 },
  { id: 'timbre-poste', name: 'Timbre Lettre Verte', category: 'epicerie', group: 'base', price: 1.4, minAge: 0 },

  // --- Jeux / FDJ (18+) — base group ---
  { id: 'ticket-cash', name: 'Ticket Cash', category: 'jeux', group: 'base', price: 5.0, minAge: 18 },
  { id: 'ticket-banco', name: 'Ticket Banco', category: 'jeux', group: 'base', price: 2.0, minAge: 18 },
  { id: 'ticket-millionnaire', name: 'Ticket Millionnaire', category: 'jeux', group: 'base', price: 10.0, minAge: 18 },
  { id: 'grille-euromillions', name: 'Grille EuroMillions', category: 'jeux', group: 'base', price: 2.5, minAge: 18 },
  { id: 'grille-loto', name: 'Grille Loto', category: 'jeux', group: 'base', price: 2.2, minAge: 18 },

  // --- CBD (18+) — 'cbd' group, unlocks after week 1 ---
  { id: 'fleur-cbd', name: 'Fleur CBD', category: 'cbd', group: 'cbd', price: 9.5, minAge: 18, color: '#5f7348' },
  { id: 'huile-cbd', name: 'Huile CBD', category: 'cbd', group: 'cbd', price: 24.0, minAge: 18, color: '#c9a23b' },
  { id: 'pollen-cbd', name: 'Pollen CBD', category: 'cbd', group: 'cbd', price: 12.0, minAge: 18, color: '#7d5631' },
  { id: 'resine-cbd', name: 'Résine CBD', category: 'cbd', group: 'cbd', price: 14.0, minAge: 18, color: '#473720' },

  // --- Presse / magazines — 'presse' group, unlocks later. Some 0+, some 18+ ---
  { id: 'la-depeche', name: 'La Dépêche', category: 'presse', group: 'presse', price: 1.3, minAge: 0, color: '#34507e' },
  { id: 'paris-match', name: 'Paris Match', category: 'presse', group: 'presse', price: 3.2, minAge: 0, color: '#b1322f' },
  { id: 'le-monde', name: 'Le Monde', category: 'presse', group: 'presse', price: 3.0, minAge: 0, color: '#e7ddc4' },
  { id: 'playboy', name: 'Playboy', category: 'presse', group: 'presse', price: 6.9, minAge: 18, color: '#9c3b2e' },
  { id: 'union-magazine', name: 'Union', category: 'presse', group: 'presse', price: 5.5, minAge: 18, color: '#473720' },

  // --- Vape / e-cigarette (18+) — 'vape' group, unlocks later ---
  { id: 'puff-mangue', name: 'Puff Mangue', category: 'vape', group: 'vape', price: 8.9, minAge: 18, color: '#c9a23b' },
  { id: 'puff-menthe', name: 'Puff Menthe Glaciale', category: 'vape', group: 'vape', price: 8.9, minAge: 18, color: '#5f7348' },
  { id: 'kit-vape', name: 'Kit Vape', category: 'vape', group: 'vape', price: 29.9, minAge: 18, color: '#34507e' },
  { id: 'e-liquide', name: 'E-liquide', category: 'vape', group: 'vape', price: 5.9, minAge: 18, color: '#b1322f' },
];

/**
 * FAKE / out-of-stock products: what a client may ask for without us having it.
 * The safe correct action = REFUSER; attempting a BLUFF may slip through… or get caught.
 * These are always offered as bluff bait regardless of unlocked groups, so they
 * carry the 'base' group.
 */
export const FAKE_PRODUCTS: Product[] = [
  { id: 'virgam-sacre', name: 'Virgam Sacré', category: 'epicerie', group: 'base', price: 6.66, minAge: 0, fake: true, color: '#c9a23b' },
  { id: 'clopes-cbd', name: 'Clopes au CBD "Détente"', category: 'tabac', group: 'base', price: 9.0, minAge: 18, fake: true, color: '#5f7348' },
  { id: 'puff-9000', name: 'Puff Fatia 9K', category: 'tabac', group: 'base', price: 12.0, minAge: 18, inStock: false, color: '#b1322f' },
  { id: 'ticket-ovni', name: "Ticket OVNI d'Aussonne", category: 'jeux', group: 'base', price: 5.0, minAge: 18, fake: true, color: '#34507e' },
];

// Change is made with coins down to 0.10 €, so every REAL price must be a
// multiple of 0.10 (otherwise the rendered change can't be composed). Snap them
// defensively — a no-op for the curated prices, a safety net for future edits.
// Fake products are excluded: they go through the bluff path, never change-making.
for (const p of PRODUCTS) {
  p.price = Math.round(p.price * 10) / 10;
}

/** A product is sellable only if it's carried (in stock) and real (not invented). */
export function isAvailable(p: Product): boolean {
  return p.inStock !== false && p.fake !== true;
}

/** All real products belonging to one of the given unlocked groups. */
export function productsInGroups(groups: ReadonlySet<ProductGroup>): Product[] {
  return PRODUCTS.filter((p) => groups.has(p.group));
}
