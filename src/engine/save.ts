// LocalStorage persistence of the run.
// storageAvailable feature-detects localStorage (Claude artifacts have none).

import type { EtatPartie } from '../game/types';

const STORAGE_KEY = 'tabaco-please';

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
export function save(s: EtatPartie): void {
  if (!storageAvailable()) return;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Quota or serialization failure: silently ignore for MVP.
  }
}

/** Load the saved run, or null if nothing saved / unavailable / corrupt. */
export function load(): EtatPartie | null {
  if (!storageAvailable()) return null;
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    return JSON.parse(raw) as EtatPartie;
  } catch {
    return null;
  }
}
