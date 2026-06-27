// LocalStorage persistence of the run.
// storageAvailable feature-detects localStorage (Claude artifacts have none).

import type { GameState, Rule, Decision, ProductGroup, ClientLook } from '../game/types';

const STORAGE_KEY = 'tabaco-please-v2';

/** Feature-detect a working localStorage (some sandboxes have none/throw). */
export function storageAvailable(): boolean {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return false;
    const probe = '__tabaco_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Persist the run as JSON. No-op if storage unavailable. */
export function save(s: GameState): void {
  if (!storageAvailable()) return;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Quota or serialization failure: silently ignore for MVP.
  }
}

/** Remove the saved run (e.g. when a campaign ends so "Continuer" won't resume it). */
export function clearSave(): void {
  if (!storageAvailable()) return;
  try {
    globalThis.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Load the saved run, or null if nothing saved / unavailable / corrupt. */
export function load(): GameState | null {
  if (!storageAvailable()) return null;
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    return normalize(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/**
 * Validate parsed JSON into a GameState, defaulting the required arrays.
 * An older or hand-edited save can be valid JSON yet omit `activeRules` /
 * `unseenFaults`; leaving them undefined would crash code that iterates them.
 * Returns null if the core scalar fields are missing/wrong-typed (unusable save).
 */
function normalize(parsed: unknown): GameState | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (
    typeof o.day !== 'number' ||
    typeof o.cash !== 'number' ||
    typeof o.warnings !== 'number' ||
    typeof o.dayRevenue !== 'number'
  ) {
    return null;
  }
  const state: GameState = {
    day: o.day,
    cash: o.cash,
    warnings: o.warnings,
    dayRevenue: o.dayRevenue,
    activeRules: Array.isArray(o.activeRules) ? (o.activeRules as Rule[]) : [],
    unseenFaults: Array.isArray(o.unseenFaults) ? (o.unseenFaults as Decision[]) : [],
    // Campaign / narrative fields — tolerate older saves that predate them.
    playerName: typeof o.playerName === 'string' ? o.playerName : '',
    sellerLook:
      typeof o.sellerLook === 'object' && o.sellerLook !== null ? (o.sellerLook as ClientLook) : {},
    totalFaults: typeof o.totalFaults === 'number' ? o.totalFaults : 0,
    // Reputation is optional: older saves predate it. When present carry it
    // through CLAMPED into the legal 0..100 band (a tampered/corrupt save must not
    // bypass the invariant that economy.ts reads before any mutation re-clamps it);
    // when absent consumers treat the missing field as the 50 default.
    reputation:
      typeof o.reputation === 'number' ? Math.max(0, Math.min(100, o.reputation)) : undefined,
    story:
      typeof o.story === 'object' && o.story !== null
        ? (o.story as Record<string, boolean>)
        : {},
  };
  if (Array.isArray(o.unlockedGroups)) {
    state.unlockedGroups = o.unlockedGroups as ProductGroup[];
  }
  // Carry the counter clock through for parity with newState (the CounterScene
  // resets it each morning, but a loaded mid-state should not read undefined).
  if (typeof o.clock === 'string') {
    state.clock = o.clock;
  }
  return state;
}
