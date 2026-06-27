// Day configuration: week structure, paced rule progression, product-group
// unlocks, briefing text and the (randomly sized) client roster.

import type { Client, Rule, ProductGroup } from '../types';
import { RULES } from '../rules';
import { dayRoster } from './clients';

export interface DayConfig {
  day: number;
  /** Rule unlocked this day, if any. */
  newRule?: Rule;
  /** Briefing text shown in DayIntroScene. */
  intro: string;
  /** Ordered queue of clients for the day. */
  queue: Client[];
}

/**
 * A week is several days; new content is paced across weeks, not days. The
 * 30-day campaign is split into 4 acts of 7 days, with weekly reckonings on days
 * 7/14/21/28 and the finale on day 30.
 */
export const DAYS_PER_WEEK: number = 7;

/**
 * The scripted "big inspection" day: the inspection-rumor subplot pays off here
 * with a guaranteed audit of every pending risky sale (see DayEndScene). Lands on
 * the fourth weekly reckoning (day 28), matching INTRO_OF_DAY[28].
 */
export const INSPECTION_DAY: number = 28;

/** 1-based week number for a given 1-based day. */
export function weekOf(day: number): number {
  return Math.ceil(day / DAYS_PER_WEEK);
}

/**
 * Product groups unlocked by the START of the given day (authoritative, derived
 * from the day so it survives save/reload and run resets):
 *   - 'base'   : always
 *   - 'cbd'    : from week 2 (after week 1)
 *   - 'presse' : from week 3
 *   - 'vape'   : from week 4
 */
export function unlockedGroupsForDay(day: number): Set<ProductGroup> {
  const groups = new Set<ProductGroup>(['base']);
  const week = weekOf(day);
  if (week >= 2) groups.add('cbd');
  if (week >= 3) groups.add('presse');
  if (week >= 4) groups.add('vape');
  return groups;
}

/** The group newly unlocked on this exact day (only on the first day of a week). */
function groupUnlockedToday(day: number): ProductGroup | undefined {
  if (day % DAYS_PER_WEEK !== 1) return undefined; // only the first day of a week
  const prev = unlockedGroupsForDay(day - 1);
  for (const g of unlockedGroupsForDay(day)) {
    if (!prev.has(g)) return g;
  }
  return undefined;
}

/**
 * Rule unlocked on a given day. Paced ~twice per week across the first two weeks
 * (matches each rule's unlockDay in the registry). Other days reinforce.
 */
function ruleOfDay(day: number): Rule | undefined {
  return Object.values(RULES).find((r) => r.unlockDay === day);
}

/** French announcement when a product group becomes available. */
const GROUP_ANNOUNCE: Record<ProductGroup, string> = {
  base: '',
  cbd:
    'ARRIVAGE — Le rayon CBD ouvre aujourd\'hui (fleurs, huiles, pollen).\n' +
    'Produits réservés aux majeurs : vérifie la carte comme pour le tabac.',
  presse:
    'ARRIVAGE — Le présentoir presse est installé (journaux et magazines).\n' +
    'La plupart sont en vente libre, mais certains magazines sont interdits aux mineurs.',
  vape:
    'ARRIVAGE — Les puffs et la vape arrivent en rayon.\n' +
    'Vape et e-cigarette : interdites aux moins de 18 ans.',
};

/**
 * Scripted briefings for the campaign's key beat days. Written as flowing prose:
 * DayIntroScene word-wraps each line, so '\n' is used ONLY for a deliberate
 * paragraph break, never to fit the width. Days without an entry fall back to a
 * generic intro (see buildIntro). The arc threads rule unlocks, group arrivals,
 * the recurring cast and the inspection-rumor subplot toward the day-28 audit and
 * the day-30 finale.
 */
const INTRO_OF_DAY: Record<number, string> = {
  // --- Act 1 : prise en main (jours 1-7) ---
  1:
    'Premier jour derrière le comptoir du tabac. Le gérant te laisse les clés et la caisse : ' +
    'encaisse chaque client et rends la monnaie exacte, au centime près. ' +
    'Pas de précipitation — la caisse doit toujours tomber juste.',
  3:
    'Nouvelle consigne : l\'âge. Le tabac, l\'alcool et les jeux sont interdits aux mineurs. ' +
    'Au moindre doute, demande la carte d\'identité et vérifie la date de naissance : ' +
    'dix-huit ans minimum, sans exception.',
  4:
    'Un visage un peu trop juvénile rôde autour du rayon tabac. Demande la carte sans hésiter — ' +
    'mieux vaut un client vexé qu\'une amende. Et la monnaie, toujours juste.',
  7:
    'Fin de la première semaine. Ce soir, le gérant passe encaisser le loyer et la commande du ' +
    'fournisseur : il faut que la trésorerie suive.\n' +
    'Rien de neuf au comptoir aujourd\'hui — juste de la rigueur sur tout ce que tu as appris.',

  // --- Act 2 : la deuxième semaine (jours 8-14) ---
  8:
    'Deuxième semaine, et une consigne de plus : l\'ivresse. Refuse l\'alcool à toute personne ' +
    'manifestement éméchée, même si elle insiste. Le reste des règles tient toujours.',
  11:
    'Une habituée revient presque chaque jour : Mémé Ginette, toujours un sourire et un mot gentil. ' +
    'Avec elle, la vente est simple — rends-lui bien sa monnaie et garde le sourire.',
  12:
    'Un gamin du quartier, casquette vissée sur la tête, retente sa chance au rayon tabac. ' +
    'Il aura beau jurer qu\'il est majeur, c\'est la carte qui dira la vérité. Ne cède pas.',
  14:
    'Fin de la deuxième semaine : le gérant repasse pour les comptes ce soir.\n' +
    'Une rumeur court dans l\'immeuble — une inspection se préparerait. Rien d\'officiel pour ' +
    'l\'instant, mais tiens-toi prêt.',

  // --- Act 3 : la troisième semaine (jours 15-21) ---
  15:
    'Troisième semaine. Nouvelle consigne : le fichier des interdits de jeu. Certains clients ' +
    'n\'ont plus le droit de jouer — vérifie chaque nom avant de vendre un jeu.\n' +
    'Didier Roca, un habitué, y figure désormais. Il viendra quand même, et il suppliera. ' +
    'Le refuser, c\'est le protéger de lui-même.',
  17:
    'Le terminal FDJ ouvre : paris sportifs. Interdit de parier sur un match déjà commencé — ' +
    'compare l\'heure du coup d\'envoi à l\'horloge. Prends le pari, PUIS encaisse la mise. ' +
    'Et ne paie un ticket gagnant qu\'après avoir saisi le score du match terminé.',
  18:
    'La rumeur d\'inspection enfle : on parle d\'un contrôle surprise avant la fin du mois. ' +
    'Garde des comptes nets et ne laisse passer aucune faute évitable — chaque vente douteuse ' +
    'pourrait te retomber dessus.',
  21:
    'Fin de la troisième semaine, comptes ce soir.\n' +
    'Méfie-toi des petits malins au terminal : certains présentent de faux tickets ou filent ' +
    'sans régler leur mise. Vérifie tout, deux fois plutôt qu\'une.',

  // --- Act 4 : la dernière semaine (jours 22-28) ---
  22:
    'Dernière semaine. La ligne d\'arrivée est en vue, mais c\'est maintenant que tout se joue.\n' +
    'Le gamin à la casquette est de retour — cette fois pour une puff. Toujours mineur, ' +
    'toujours non.',
  24:
    'Dernière consigne du mois : l\'anti-blanchiment. Pour tout gros gain FDJ, à partir de ' +
    'cinq cents euros, exige une pièce d\'identité avant de payer le ticket. Pas de carte, ' +
    'pas de paiement.',
  26:
    'L\'inspection est imminente : on la dit prévue d\'un jour à l\'autre. Solde tes fautes en ' +
    'suspens et tiens la caisse impeccable — c\'est le moment de prouver ta valeur.',
  28:
    'Inspection. Les contrôleurs sont là aujourd\'hui et ils épluchent tout : ventes douteuses, ' +
    'fichier des jeux, paris, monnaie.\n' +
    'C\'est aussi la fin de la quatrième semaine, comptes ce soir. Tout ce que tu as laissé ' +
    'passer peut ressortir maintenant.',

  // --- Finale (jours 29-30) ---
  29:
    'Plus que deux jours. L\'inspection est derrière toi ; il ne reste qu\'à finir le mois ' +
    'proprement, sans relâcher.',
  30:
    'Dernier jour. Ce soir, le gérant rend son verdict sur le mois écoulé : il décidera si le ' +
    'bureau de tabac devient le tien.\n' +
    'Fais-en une dernière journée irréprochable.',
};

/** Build the full intro text for a day, prepending any group-unlock announcement. */
function buildIntro(day: number): string {
  const base =
    INTRO_OF_DAY[day] ??
    `Jour ${day} — Semaine ${weekOf(day)}.\n` +
      'Applique toutes les consignes en vigueur et garde la caisse juste.';
  const unlocked = groupUnlockedToday(day);
  if (unlocked && GROUP_ANNOUNCE[unlocked]) {
    return `${GROUP_ANNOUNCE[unlocked]}\n${base}`;
  }
  return base;
}

/**
 * Build the configuration for a given day: the rule unlocked (if any), the
 * briefing text (with unlock announcements) and the randomly sized roster.
 */
export function dayConfig(day: number): DayConfig {
  const newRule = ruleOfDay(day);
  return {
    day,
    ...(newRule ? { newRule } : {}),
    intro: buildIntro(day),
    queue: dayRoster(day),
  };
}
