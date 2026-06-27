// Canonical data model for Tabaco Please.
// Single source of truth for shared types & constants.

import type { Renderer } from '../engine/renderer';
import type { StateMachine, Scene } from '../engine/stateMachine';

export type Category = 'tabac' | 'alcool' | 'epicerie' | 'jeux' | 'cbd' | 'presse' | 'vape';

/**
 * Unlock group a product belongs to. Clients only ever request products whose
 * group is currently unlocked. 'base' is always available; the others unlock at
 * later week boundaries (see content/days.ts).
 */
export type ProductGroup = 'base' | 'cbd' | 'presse' | 'vape';

export interface Product {
  id: string;
  name: string;
  category: Category;
  price: number;
  /** Unlock group; clients only request products from unlocked groups. */
  group: ProductGroup;
  /** Minimum legal age to buy this product (0 = no restriction). */
  minAge: number;
  /** Tint used when drawing this product (defaults per category). */
  color?: string;
  /** False = not carried at the counter right now (out of stock). */
  inStock?: boolean;
  /** True = an invented / non-existent product (e.g. Virgam Sacré). */
  fake?: boolean;
}

/** Visual variety for a client bust (all colors are PAL values). */
export interface ClientLook {
  skin?: string;
  hair?: string;
  coat?: string;
  hat?: 'cap' | 'hat' | 'beanie' | 'none';
  beard?: boolean;
}

export interface Client {
  id: string;
  /** Placeholder sprite name (no asset files for MVP). */
  sprite: string;
  request: Product;
  /** ISO date of birth, e.g. '2005-04-12'. */
  birthDate: string;
  isDrunk: boolean;
  /** True if this client appears on the "fichier des interdits" (banned list). */
  onBanList: boolean;
  fullName: string;
  /** Patience 0..100; drains while waiting. */
  patience: number;
  /** Optional appearance overrides for visual variety. */
  look?: ClientLook;
  /** 0..100 — how easily this client is fooled by a bluff (default 50). */
  gullibility?: number;
  /**
   * Betting intents (a betting client carries exactly one of the two):
   *   betRequest — Mode A: wants to PLACE this bet at the terminal.
   *   ticket     — Mode B: presents this (claimed-winning) ticket to be SETTLED.
   */
  betRequest?: BetTicket;
  ticket?: BetTicket;
  /** True if this client will try to scam (leave before paying / claim a loss). */
  fraudster?: boolean;
}

/**
 * A football/sports fixture offered at the FDJ betting terminal.
 * `status` is the data-level state; the terminal also derives a live "started"
 * flag by comparing `kickoff` to the current GameState.clock (judge-the-clock).
 */
export interface MatchInfo {
  id: string;
  teamA: string;
  teamB: string;
  /** Kick-off time of day, 'HH:MM'. */
  kickoff: string;
  status: 'upcoming' | 'live' | 'done';
  /** Present only when status === 'done'. */
  finalScore?: { a: number; b: number };
  /** Decimal odds for a home win / draw / away win. */
  odds: { a: number; draw: number; b: number };
}

/** A bet pick: home win, draw, or away win. */
export type BetPick = 'A' | 'draw' | 'B';

/** A bet on a single match: the picked outcome and the wagered stake (euros). */
export interface BetTicket {
  matchId: string;
  pick: BetPick;
  stake: number;
}

export type RuleType = 'change' | 'age' | 'drunk' | 'banList' | 'betting' | 'laundering';

export interface Rule {
  id: string;
  /** Day on which this rule becomes active. */
  unlockDay: number;
  type: RuleType;
  description: string;
}

export interface Decision {
  client: Client;
  action: 'sell' | 'refuse';
  correct: boolean;
}

export interface GameState {
  day: number;
  cash: number;
  warnings: number;
  activeRules: Rule[];
  dayRevenue: number;
  /** Player name entered at onboarding (shown across the campaign). */
  playerName: string;
  /** Seller bust appearance chosen at onboarding (reuses ClientLook/drawClient). */
  sellerLook: ClientLook;
  /** Cumulative count of real faults over the whole run (drives the endings). */
  totalFaults: number;
  /**
   * Narrative flags set by scripted beats / recurring-character choices
   * (e.g. protectedGambler, enabledGambler, enabledFraud, passedInspection).
   * Optional keys; absence means "not yet triggered".
   */
  story: Record<string, boolean>;
  /** Risky sales that may be audited later by randomInspection. */
  unseenFaults: Decision[];
  /**
   * Product groups unlocked so far (starts as ['base']). Optional for save/back
   * compat; the authoritative, day-derived set lives in content/days.ts
   * (unlockedGroupsForDay). When absent, treat it as ['base'].
   */
  unlockedGroups?: ProductGroup[];
  /**
   * Current counter time, 'HH:MM'; advances ~7 min per client through the day.
   * Used by the FDJ betting terminal to judge whether a match has already kicked
   * off. Optional for save/back compat: when absent, treat it as START_CLOCK.
   * The fresh-state factory must initialize it (see content/matches.START_CLOCK).
   */
  clock?: string;
}

/** Total length of the campaign, in days (finite 30-day run). */
export const TOTAL_DAYS: number = 30;

/** The in-game "today" used for all age math. */
export const TODAY: string = '2026-06-27';

/** Weekly rent charged at the weekly reckoning. */
export const RENT: number = 600;

/** Fixed supplier order cost charged at the weekly reckoning. */
export const SUPPLIER_ORDER: number = 250;

/** Starting cash. */
export const STARTING_CASH: number = 1000;

/** Euro denominations (bills + coins) for change-making, descending. */
export const DENOMINATIONS: number[] = [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];

export interface GameContext {
  state: GameState;
  renderer: Renderer;
  sm: StateMachine;
  goTo(scene: Scene): void;
}
