// Client factory + per-day rosters.
// Rosters are now GENERATED RANDOMLY each day, but composed to respect the rules
// active that day (D1 simple sales, D2 adds age dilemmas, D3 drunkenness, D4 ban list),
// plus the occasional bluff (fake / out-of-stock) opportunity. Runtime randomness
// uses Math.random — fine in the browser; only the build sandbox forbids it.

import type { Client, Product, Category, ClientLook, RuleType, BetPick, MatchInfo, Country } from '../types';
import { TODAY } from '../types';
import { PRODUCTS, FAKE_PRODUCTS, productsInGroups } from './products';
import { RULES } from '../rules';
import { unlockedGroupsForDay, weekOf } from './days';
import { matchesForDay, outcomeFromScore, hasStarted, nextClock, START_CLOCK } from './matches';
import { GAMBLER, GINETTE, TEEN, FRAUDSTER, recurringIdsForDay } from './characters';
import {
  BEN_LADEN,
  ZUCKERBERG,
  TRUMP,
  DEPARDIEU,
  GRETA,
  KIRK,
  MACRON,
  HANOUNA,
  satireIdsForDay,
} from './characters';

/** Truly random client-count bounds: each day's roster size is in [MIN, MAX]. */
export const MIN_CLIENTS: number = 4;
export const MAX_CLIENTS: number = 9;

let _seq = 0;

function nextId(): string {
  _seq += 1;
  return `client-${_seq.toString().padStart(3, '0')}`;
}

/** Reset the id counter — handy for tests / new run. */
export function resetClientIds(): void {
  _seq = 0;
}

/** Find a product (real or fake) by id, with a safe fallback. */
function productById(id: string): Product {
  return [...PRODUCTS, ...FAKE_PRODUCTS].find((p) => p.id === id) ?? PRODUCTS[0];
}

// --- tiny random helpers -----------------------------------------------------

function rint(n: number): number {
  return Math.floor(Math.random() * n);
}
function pick<T>(a: readonly T[]): T {
  return a[rint(a.length)];
}
function chance(p: number): boolean {
  return Math.random() < p;
}
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rint(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- nationality -------------------------------------------------------------
// CNI nationality for ordinary (generated) clients. INFORMATIONAL only — no rule
// reads it. Distribution: 80% France, the remaining 20% split evenly among the
// four others (US, IL, SA, PS).

const OTHER_COUNTRIES: readonly Country[] = ['US', 'IL', 'SA', 'PS'];

function randomCountry(): Country {
  return chance(0.8) ? 'FR' : pick(OTHER_COUNTRIES);
}

// --- appearance variety ------------------------------------------------------

const SKINS = ['#b78a63', '#8a6244', '#c79a72', '#a87a54', '#6e4a30'];
const HAIRS = ['#2b1d12', '#473720', '#7d5631', '#c9a23b', '#e7ddc4', '#9c3b2e'];
const COATS = ['#473720', '#34507e', '#5f7348', '#9c3b2e', '#2b1d12', '#6b5638'];
const HATS: NonNullable<ClientLook['hat']>[] = ['none', 'none', 'cap', 'hat', 'beanie', 'none'];

/** Random varied look. */
function autoLook(): ClientLook {
  return {
    skin: pick(SKINS),
    hair: pick(HAIRS),
    coat: pick(COATS),
    hat: pick(HATS),
    beard: chance(0.28),
  };
}

// --- insistence pleas --------------------------------------------------------
// FRENCH lines shown while a refused client digs in (the insisting standoff).
// Generic insisters are sympathetic (calling the cops on them is an abuse);
// aggressive ones threaten the counter (a police call is justified).

const GENERIC_PLEAS = [
    'Tout ce que je peux te dire, c\'est que je peux pas te dire',
  'Allez, soyez sympa, juste cette fois !',
  'Quoi ? Vous plaisantez ? Servez-moi, enfin !',
  "J'aime les hommes, ne me faites pas ça…",
  'Faites une exception, ça restera entre nous.',
  "Tout le monde fait ça, où est le problème ?",
    "Génération de tahan fahan, s'il te plait"
];
const AGGRESSIVE_PLEAS = [
    "GamixTreize était plus gentil",
    'Ton gros crane sah dépêche toi…',
    'Je vais te faire bouffer mes couilles !',
  'Tu vas me servir, oui ? Sinon ça va chauffer !',
  'Refuse encore et tu vas le regretter, crois-moi.',
  "Donne-moi ça tout de suite, j'ai pas que ça à faire !",
];

// --- names -------------------------------------------------------------------

const FIRST_NAMES = [
  'Jean', 'Marie', 'Lucas', 'Chloé', 'Karim', 'Sophie', 'Paulo', 'Emma', 'Hugo', 'Léa',
  'Kevin', 'Fatima', 'Dylan', 'Nadia', 'Bernard', 'Ginette', 'Mohamed', 'Camille', 'Yanis', 'Josette',
  'Mathéo', 'Sabrina', 'Robert', 'Inès', 'Bryan', 'Aurélie', 'Tom', 'Guillaume', 'Gwen', 'Joan'
];
const LAST_NAMES = [
  'Dupont', 'Lefevre', 'Martin', 'Bernard', 'Benali', 'Moreau', 'Da Silva', 'Petit', 'Garnier', 'Trotignon',
  'Mercier', 'Bonnet', 'Faure', 'Rousseau', 'Lopez', 'Nguyen', 'Marchand', 'Charpentier', 'Da Costa', 'Fontaine',
  'Pereira'
];

/** A unique full name within the given day's roster. */
function genName(used: Set<string>): string {
  for (let k = 0; k < 40; k++) {
    const n = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  const n = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${used.size}`;
  used.add(n);
  return n;
}

// --- ages --------------------------------------------------------------------

/** Reference year for age math, derived from TODAY so the bands never desync. */
const BASE_YEAR: number = Number(TODAY.split('-')[0]);

/** ISO birth date for someone turning `age` this year (relative to TODAY). */
function birthDateForAge(age: number): string {
  return `${BASE_YEAR - age}-01-01`;
}
function minorAge(): string {
  return birthDateForAge(14 + rint(4)); // 14..17
}
function borderlineAge(): string {
  return birthDateForAge(17 + rint(3)); // 17..19 (CNI worth a look)
}
function adultAge(): string {
  return birthDateForAge(24 + rint(48)); // 24..71
}

// --- products ----------------------------------------------------------------

const RESTRICTED: Category[] = ['tabac', 'alcool', 'jeux'];

/**
 * Pick a real product for the day, restricted to products whose unlock group is
 * available on `day`. Optionally constrained to a category. Falls back to the
 * full unlocked pool (then to the whole catalogue) so we always return something.
 */
function pickProduct(day: number, cat?: Category): Product {
  const groups = unlockedGroupsForDay(day);
  const unlocked = productsInGroups(groups);
  const pool = cat ? unlocked.filter((p) => p.category === cat) : unlocked;
  if (pool.length) return pick(pool);
  if (unlocked.length) return pick(unlocked);
  // Last resort: never leak a locked-group product into a request; fall back to
  // the always-available base group rather than the whole catalogue.
  return PRODUCTS.find((p) => p.group === 'base') ?? PRODUCTS[0];
}

// --- factory -----------------------------------------------------------------

/**
 * Build a Client with sensible defaults; `partial` overrides any field.
 * Defaults: an adult (age 40) buying épicerie, sober, not banned, full patience.
 */
export function makeClient(partial: Partial<Client> = {}): Client {
  const base: Client = {
    id: nextId(),
    sprite: 'client_neutral',
    request: PRODUCTS.find((p) => p.category === 'epicerie' && p.group === 'base') ?? PRODUCTS[0],
    birthDate: birthDateForAge(40),
    isDrunk: false,
    onBanList: false,
    fullName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    patience: 100,
    look: autoLook(),
    gullibility: 50,
  };
  return { ...base, ...partial };
}

/** Kept for API compatibility (look/name rotation is now stateless). */
export function resetClientLooks(): void {
  /* no-op: variety is random per client now */
}

// --- random per-day generation ----------------------------------------------

/** Rule types in force on a given day (cumulative, derived from the registry). */
function activeTypes(day: number): Set<RuleType> {
  const s = new Set<RuleType>();
  for (const rule of Object.values(RULES)) {
    if (day >= rule.unlockDay) s.add(rule.type);
  }
  return s;
}

interface Spec {
  cat?: Category;
  minor?: boolean; // force an under-18
  drunk?: boolean; // force drunk
  banned?: boolean; // force on the ban list
  fake?: boolean; // force a fake / out-of-stock request
  sellable?: boolean; // force a clean, legitimate sale
}

/** Generate one client, honoring the active rules and any forced traits. */
function genClient(day: number, used: Set<string>, forced: Spec = {}): Client {
  const active = activeTypes(day);

  // Product.
  let request: Product;
  if (forced.fake) request = pick(FAKE_PRODUCTS);
  else if (forced.cat) request = pickProduct(day, forced.cat);
  else request = pickProduct(day);
  const restricted = request.minAge > 0;

  let birthDate = adultAge();
  let isDrunk = false;
  let banned = false;

  if (forced.fake) {
    // A fake/out-of-stock request: keep the person an ordinary adult; the dilemma
    // is availability (refuse vs bluff), not age/drunkenness/ban list.
    birthDate = adultAge();
  } else if (forced.sellable) {
    // Guaranteed clean sale: clearly adult, sober, not banned.
    birthDate = birthDateForAge(50 + rint(35));
  } else {
    // Age. A FORCED minor must always be under 18 (the guaranteed "refuse"
    // teaching case): borderlineAge() can return 18/19, which would be a legal
    // sale, so use minorAge() (14..17) exclusively here.
    if (forced.minor) birthDate = minorAge();
    else if (active.has('age') && restricted && chance(0.25))
      birthDate = chance(0.5) ? minorAge() : borderlineAge();

    // Drunkenness (only matters once the rule is in force).
    if (active.has('drunk')) {
      if (forced.drunk) isDrunk = true;
      else if (request.category === 'alcool' && chance(0.22)) isDrunk = true;
      else if (chance(0.05)) isDrunk = true; // drunk buying something harmless -> still a sale
    }

    // Ban list (only matters for jeux once the rule is in force).
    if (active.has('banList') && request.category === 'jeux') {
      if (forced.banned) banned = true;
      else if (chance(0.25)) banned = true;
    }
  }

  const gullibility = forced.fake
    ? chance(0.5)
      ? 60 + rint(30)
      : 20 + rint(25)
    : 40 + rint(30);

  // Occasional insistence: a refused client may dig in instead of leaving. More
  // likely for the dodgy cases (minor/drunk/banned/bluff), where refusing is the
  // correct call and the standoff actually has teeth. Drunk/banned troublemakers
  // can turn aggressive — which makes a police call justified; ordinary insisters
  // are merely sympathetic, so calling the cops on them is an abuse of power.
  const dodgy = Boolean(forced.minor || forced.drunk || forced.banned || forced.fake) || isDrunk || banned;
  let insists = false;
  let plea: string | undefined;
  let policeWorthy: boolean | undefined;
  if (chance(dodgy ? 0.5 : 0.12)) {
    insists = true;
    if ((isDrunk || banned) && chance(0.5)) {
      policeWorthy = true;
      plea = pick(AGGRESSIVE_PLEAS);
    } else {
      policeWorthy = false;
      plea = pick(GENERIC_PLEAS);
    }
  }

  return makeClient({
    request,
    birthDate,
    isDrunk,
    onBanList: banned,
    fullName: genName(used),
    country: randomCountry(),
    gullibility,
    patience: 60 + rint(41), // 60..100
    insists,
    plea,
    policeWorthy,
  });
}

// --- betting clients ---------------------------------------------------------

/** A different (not `actual`) outcome — used to build a guaranteed-losing claim. */
function wrongPick(actual: BetPick): BetPick {
  const others: BetPick[] = (['A', 'draw', 'B'] as BetPick[]).filter((p) => p !== actual);
  return pick(others);
}

/**
 * Build a betting client. Mode 'place' presents a betRequest on an UPCOMING match
 * (legal to register while still upcoming; a fraudster will try to leave without
 * paying). Mode 'settle' presents a ticket on a finished match: honest clients
 * claim the real winning outcome, fraudsters claim a losing pick — or a ticket on
 * a match that is not finished. The named match always exists in the day's card.
 */
function genBettingClient(
  day: number,
  used: Set<string>,
  mode: 'place' | 'settle',
  fraud: boolean,
): Client {
  const matches: MatchInfo[] = matchesForDay(day);
  const upcoming = matches.filter((m) => m.status === 'upcoming');
  const done = matches.filter((m) => m.status === 'done');

  // Placeholder counter request (betting happens at the terminal, not by sale):
  // an ordinary, legal base-group purchase so no product rule interferes.
  const request =
    PRODUCTS.find((p) => p.category === 'jeux' && p.group === 'base') ??
    PRODUCTS.find((p) => p.group === 'base') ??
    PRODUCTS[0];

  const stake = (1 + rint(10)) * 2; // 2..20 €
  const client = makeClient({
    request,
    birthDate: birthDateForAge(28 + rint(40)), // clearly adult
    isDrunk: false,
    onBanList: false,
    fullName: genName(used),
    country: randomCountry(),
    gullibility: 40 + rint(30),
    patience: 60 + rint(41),
    fraudster: fraud,
  });

  if (mode === 'place') {
    let pool = upcoming;
    if (!fraud && upcoming.length) {
      // Legal-to-register case: the clock advances ~CLOCK_STEP_MIN per client and
      // the roster is capped at MAX_CLIENTS, so this client could be served as late
      // as `latestServe`. Restrict to matches whose kickoff is still ahead of that
      // worst-case time, so the correct action stays "take" whatever the queue order
      // (an early kickoff could otherwise have started by serve time -> flips to refuse).
      let latestServe = START_CLOCK;
      for (let i = 0; i < MAX_CLIENTS - 1; i++) latestServe = nextClock(latestServe);
      const safe = upcoming.filter((m) => !hasStarted(m.kickoff, latestServe));
      pool = safe.length ? safe : upcoming;
    }
    const m = pick(pool.length ? pool : matches);
    client.betRequest = { matchId: m.id, pick: pick(['A', 'draw', 'B'] as BetPick[]), stake };
  } else {
    if (fraud && (chance(0.4) || done.length === 0)) {
      // Fraud variant: a ticket on a match that is NOT finished yet.
      const m = pick(upcoming.length ? upcoming : matches);
      client.ticket = { matchId: m.id, pick: pick(['A', 'draw', 'B'] as BetPick[]), stake };
    } else {
      const m = pick(done.length ? done : matches);
      const actual: BetPick = m.finalScore ? outcomeFromScore(m.finalScore) : 'draw';
      client.ticket = { matchId: m.id, pick: fraud ? wrongPick(actual) : actual, stake };
    }
  }
  return client;
}

// --- recurring narrative cast -----------------------------------------------
// Build the per-day Client for each scheduled recurring character. They are
// identified downstream ONLY by their fixed fullName (see content/characters.ts),
// so the look and name are forced here and never randomized.

/** The gambling-addict regular: on the ban list, comes back for jeux, begs. */
function makeGamblerClient(day: number, used: Set<string>): Client {
  used.add(GAMBLER.fullName);
  // Scheduled only on ban-active days (>= banList unlock), so he is always banned.
  const banned = day >= RULES.banList.unlockDay;
  return makeClient({
    request: pickProduct(day, 'jeux'),
    birthDate: birthDateForAge(57),
    isDrunk: false,
    onBanList: banned,
    fullName: GAMBLER.fullName,
    look: GAMBLER.look,
    gullibility: 75, // pleads hard
    patience: 100,
    // He never takes a refusal: he begs. Calling the police on a desperate addict
    // is cruel, never justified (policeWorthy: false) — a dark epilogue beat.
    insists: true,
    plea: 'Allez, juste un dernier grattage, je vous en supplie… je me refais et j\'arrête, promis !',
    policeWorthy: false,
  });
}

/** Mémé Ginette: warm regular, always a clean and legal sale. */
function makeGinetteClient(day: number, used: Set<string>): Client {
  used.add(GINETTE.fullName);
  const groups = unlockedGroupsForDay(day);
  // A newspaper once the press rack exists, otherwise simple groceries. Clearly
  // an old lady, so any request stays a legitimate sale.
  const request = groups.has('presse') ? pickProduct(day, 'presse') : pickProduct(day, 'epicerie');
  return makeClient({
    request,
    birthDate: birthDateForAge(74),
    isDrunk: false,
    onBanList: false,
    fullName: GINETTE.fullName,
    look: GINETTE.look,
    gullibility: 30,
    patience: 100,
    // If wrongly turned away, she gently insists — never grounds for the police.
    insists: true,
    plea: 'Oh, mon petit, ne soyez pas méchant avec une vieille dame… servez-moi donc.',
    policeWorthy: false,
  });
}

/** The persistent teen: keeps retrying age-restricted goods (refuse correctly). */
function makeTeenClient(day: number, used: Set<string>): Client {
  used.add(TEEN.fullName);
  const groups = unlockedGroupsForDay(day);
  // Goes for whatever forbidden novelty is in reach: vape once it lands, else CBD,
  // else the classic pack of cigarettes.
  let cat: Category = 'tabac';
  if (groups.has('vape')) cat = 'vape';
  else if (groups.has('cbd') && chance(0.5)) cat = 'cbd';
  return makeClient({
    request: pickProduct(day, cat),
    birthDate: minorAge(), // 14..17, always under 18
    isDrunk: false,
    onBanList: false,
    fullName: TEEN.fullName,
    look: TEEN.look,
    gullibility: 35,
    patience: 80,
  });
}

/** The returning fraudster: a betting scammer (fake ticket / unpaid stake). */
function makeFraudsterClient(day: number, used: Set<string>): Client {
  used.add(FRAUDSTER.fullName);
  const mode: 'place' | 'settle' = chance(0.5) ? 'place' : 'settle';
  const client = genBettingClient(day, used, mode, true);
  client.fullName = FRAUDSTER.fullName;
  client.look = FRAUDSTER.look;
  // A returning scammer who turns aggressive when caught: refusing him triggers a
  // standoff, and calling the police on him is fully JUSTIFIED.
  client.insists = true;
  client.plea = 'Tu vas me payer ce ticket, oui ?! Fais pas le malin avec moi !';
  client.policeWorthy = true;
  return client;
}

/** Build the Client objects for every recurring character scheduled on `day`. */
function recurringClientsForDay(day: number, used: Set<string>): Client[] {
  const out: Client[] = [];
  for (const id of recurringIdsForDay(day)) {
    if (id === GAMBLER.id) out.push(makeGamblerClient(day, used));
    else if (id === GINETTE.id) out.push(makeGinetteClient(day, used));
    else if (id === TEEN.id) out.push(makeTeenClient(day, used));
    else if (id === FRAUDSTER.id) out.push(makeFraudsterClient(day, used));
  }
  return out;
}

// --- satire caricatures ------------------------------------------------------
// Real-name public-figure parody clients (identity/look/schedule in
// content/characters.ts). Each maps to one mechanic; they are tagged with
// Client.satireId so the sprite draws the caricature and the scenes branch.

/** 1. Ben Laden: legal kombucha, but won't leave even after the sale; snitching pays. */
function makeBenLadenClient(_day: number, used: Set<string>): Client {
  used.add(BEN_LADEN.fullName);
  return makeClient({
    satireId: BEN_LADEN.id,
    request: productById('ciao-kombucha'),
    birthDate: birthDateForAge(60),
    fullName: BEN_LADEN.fullName,
    look: BEN_LADEN.look,
    country: BEN_LADEN.country,
    gullibility: 20,
    patience: 100,
    // Insists BEFORE and AFTER the sale; calling the police pays a +500 € bonus
    // (satirical snitch reward) instead of the normal reputation outcome.
    insists: true,
    insistsAfterSale: true,
    policeWorthy: true,
    policeBonus: 500,
    plea: 'Je ne bouge pas d\'ici tant que vous ne m\'avez pas livré toute la réserve de kombucha.',
  });
}

/** 2. Zuckerberg: wants to buy the whole shelf / pay in data — a fake product to refuse. */
function makeZuckerbergClient(_day: number, used: Set<string>): Client {
  used.add(ZUCKERBERG.fullName);
  return makeClient({
    satireId: ZUCKERBERG.id,
    request: productById('virgam-sacre'), // fake -> REFUSER ou BLUFFER
    birthDate: birthDateForAge(40),
    fullName: ZUCKERBERG.fullName,
    look: ZUCKERBERG.look,
    country: ZUCKERBERG.country,
    gullibility: 70, // easy to bluff
    patience: 90,
    insists: true,
    policeWorthy: false,
    plea: 'Je rachète tout le rayon. Je vous paie en données personnelles, c\'est bien mieux que de l\'argent.',
  });
}

/** 3. Trump: fraudster on a fake product, bluffs / tries to leave without paying. */
function makeTrumpClient(_day: number, used: Set<string>): Client {
  used.add(TRUMP.fullName);
  return makeClient({
    satireId: TRUMP.id,
    request: productById('ticket-couilles'), // fake jeux -> refuse / bluff
    birthDate: birthDateForAge(78),
    fullName: TRUMP.fullName,
    look: TRUMP.look,
    country: TRUMP.country,
    gullibility: 30,
    patience: 80,
    fraudster: true,
    insists: true,
    policeWorthy: true, // a real fraudster: a fair police call
    plea: 'C\'est offert par la maison, non ? Je suis quelqu\'un de très important, je paierai plus tard.',
  });
}

/** 4. Depardieu: drunk, wants alcohol — the ivresse refusal (cops would be abuse). */
function makeDepardieuClient(day: number, used: Set<string>): Client {
  used.add(DEPARDIEU.fullName);
  return makeClient({
    satireId: DEPARDIEU.id,
    request: pickProduct(day, 'alcool'),
    birthDate: birthDateForAge(77),
    isDrunk: true,
    fullName: DEPARDIEU.fullName,
    look: DEPARDIEU.look,
    country: DEPARDIEU.country,
    gullibility: 40,
    patience: 90,
    insists: true,
    policeWorthy: false, // just drunk -> calling the cops is an abuse
    plea: 'Allez, un dernier verre, je tiens parfaitement debout, regarde !',
  });
}

/** 5. Greta: an eco esclandre — a sympathetic insister (cops would be abuse). */
function makeGretaClient(_day: number, used: Set<string>): Client {
  used.add(GRETA.fullName);
  return makeClient({
    satireId: GRETA.id,
    request: productById('bouteille-eau'), // legal sale; the trap is refusing her
    birthDate: birthDateForAge(23),
    fullName: GRETA.fullName,
    look: GRETA.look,
    country: GRETA.country,
    gullibility: 25,
    patience: 100,
    insists: true,
    policeWorthy: false,
    plea: 'Comment osez-vous ?! Vous vendez du poison pendant que la planète brûle !',
  });
}

/** 6. Charlie Kirk: aggressive political harangue — a justified police call. */
function makeKirkClient(_day: number, used: Set<string>): Client {
  used.add(KIRK.fullName);
  return makeClient({
    satireId: KIRK.id,
    request: productById('marlboro-gold'),
    birthDate: birthDateForAge(35),
    fullName: KIRK.fullName,
    look: KIRK.look,
    country: KIRK.country,
    gullibility: 30,
    patience: 70,
    insists: true,
    policeWorthy: true, // aggressive harangue: a fair call
    plea: 'Tu vas me servir, oui ?! C\'est ça, ta liberté ? Débats-toi si tu l\'oses, petit !',
  });
}

/** 7. Macron: clean tabac sale with the « en même temps » gag (no special mechanic). */
function makeMacronClient(_day: number, used: Set<string>): Client {
  used.add(MACRON.fullName);
  return makeClient({
    satireId: MACRON.id,
    request: productById('marlboro-red'),
    birthDate: birthDateForAge(48),
    fullName: MACRON.fullName,
    look: MACRON.look,
    country: MACRON.country,
    gullibility: 50,
    patience: 100,
    plea: 'Je veux du tabac, et en même temps je l\'interdis. Les deux à la fois, vous me suivez ?',
  });
}

/** 8. Hanouna: a loud, expensive purchase — a big-change test (no special mechanic). */
function makeHanounaClient(_day: number, used: Set<string>): Client {
  used.add(HANOUNA.fullName);
  return makeClient({
    satireId: HANOUNA.id,
    request: productById('kit-vape'), // 29,90 € -> large change to compose
    birthDate: birthDateForAge(52),
    fullName: HANOUNA.fullName,
    look: HANOUNA.look,
    country: HANOUNA.country,
    gullibility: 50,
    patience: 100,
    plea: 'Allez allez allez, je prends tout, et au prix fort ! TPMP au comptoir !',
  });
}

/** Build the Client objects for every satire caricature scheduled on `day`. */
function satireClientsForDay(day: number, used: Set<string>): Client[] {
  const out: Client[] = [];
  for (const id of satireIdsForDay(day)) {
    if (id === BEN_LADEN.id) out.push(makeBenLadenClient(day, used));
    else if (id === ZUCKERBERG.id) out.push(makeZuckerbergClient(day, used));
    else if (id === TRUMP.id) out.push(makeTrumpClient(day, used));
    else if (id === DEPARDIEU.id) out.push(makeDepardieuClient(day, used));
    else if (id === GRETA.id) out.push(makeGretaClient(day, used));
    else if (id === KIRK.id) out.push(makeKirkClient(day, used));
    else if (id === MACRON.id) out.push(makeMacronClient(day, used));
    else if (id === HANOUNA.id) out.push(makeHanounaClient(day, used));
  }
  return out;
}

/**
 * Randomized roster for a given day. Size is TRULY RANDOM in [MIN_CLIENTS,
 * MAX_CLIENTS]. The guaranteed teaching cases for each active rule are always
 * included (one to refuse, one to sell), but the total is hard-capped at
 * MAX_CLIENTS (essential cases first) and padded up to the random target so the
 * count always lands within the bounds.
 */
export function dayRoster(day: number): Client[] {
  const active = activeTypes(day);
  const used = new Set<string>();
  const roster: Client[] = [];

  // Random target size in [MIN_CLIENTS, MAX_CLIENTS].
  const target = MIN_CLIENTS + rint(MAX_CLIENTS - MIN_CLIENTS + 1);

  // Recurring narrative cast first (fixed identities), within the hard cap. They
  // count toward the day's size; random fill tops up the rest as usual.
  for (const c of recurringClientsForDay(day, used)) {
    if (roster.length < MAX_CLIENTS) roster.push(c);
  }

  // Satire caricatures scheduled today (fixed identities, special mechanics),
  // injected like the recurring cast and counted toward the day's size.
  for (const c of satireClientsForDay(day, used)) {
    if (roster.length < MAX_CLIENTS) roster.push(c);
  }

  // Add a client only while we stay under the hard cap.
  const add = (forced: Spec = {}): void => {
    if (roster.length < MAX_CLIENTS) roster.push(genClient(day, used, forced));
  };
  // Add a betting client only while we stay under the hard cap.
  const addBet = (mode: 'place' | 'settle', fraud: boolean): void => {
    if (roster.length < MAX_CLIENTS) roster.push(genBettingClient(day, used, mode, fraud));
  };

  // Essential betting cases once the FDJ terminal is open (one to place, one to
  // settle), plus an occasional fraudster (leaves without paying / fake ticket).
  if (active.has('betting')) {
    addBet('place', false); // legal bet to register + collect
    addBet('settle', false); // winning ticket to pay out
    if (chance(0.5)) addBet(chance(0.5) ? 'place' : 'settle', true); // a scammer
  }

  // Essential teaching cases for each active rule (one to refuse, one to sell).
  if (active.has('age')) {
    add({ minor: true, cat: pick(RESTRICTED) }); // refuse
    add({ sellable: true, cat: pick(RESTRICTED) }); // sell
  }
  if (active.has('drunk')) {
    add({ drunk: true, cat: 'alcool' }); // refuse
  }
  if (active.has('banList')) {
    add({ banned: true, cat: 'jeux' }); // refuse
    add({ sellable: true, cat: 'jeux' }); // sell
  }

  // Optional flavour cases, only if there's still room under the target.
  if (active.has('drunk') && roster.length < target && chance(0.5)) {
    add({ drunk: true, cat: 'epicerie' }); // drunk but harmless -> sell
  }
  if (roster.length < target && chance(weekOf(day) >= 2 ? 0.5 : 0.25)) {
    add({ fake: true }); // occasional bluff opportunity
  }

  // Pad up to the random target with assorted clients honoring the active rules.
  while (roster.length < target) add();

  return shuffle(roster);
}
