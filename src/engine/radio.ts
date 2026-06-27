// Radio player for the game.
// Backed by a hidden DOM <audio> element because the canvas can't play audio.
// Singleton module: lazily create the <audio>, persist state to localStorage.
// All DOM/localStorage access is wrapped in try/catch so importing this module
// is safe in non-browser contexts (SSR, tests, build-time).

/** A radio station. `url` null means "Silence" (no stream, stays paused). */
export interface Station {
  name: string;
  url: string | null;
}

/** Curated French stations. Silence first so "do not play" is the default. */
export const STATIONS: Station[] = [
  { name: 'Silence', url: null },
  { name: 'NRJ', url: 'https://streaming.nrjaudio.fm/oumvmk8fnozc?origine=mytuner' },
  { name: 'France Inter', url: 'https://icecast.radiofrance.fr/franceinter-midfi.mp3' },
  { name: 'FIP', url: 'https://icecast.radiofrance.fr/fip-midfi.mp3' },
  { name: 'France Info', url: 'https://icecast.radiofrance.fr/franceinfo-midfi.mp3' },
  { name: 'RFM', url: 'https://rfm.lmn.fm/rfm.mp3' },
];

const STORAGE_KEY = 'tabaco-radio';

/** Persisted shape stored under STORAGE_KEY. */
interface RadioState {
  index: number;
  playing: boolean;
  volume: number;
}

// Module-level singleton state (defaults: Silence, paused, volume 0.6).
let audio: HTMLAudioElement | null = null;
let index = 0;
let playing = false;
let volume = 0.6;
let initialized = false;

/** Clamp a number into the 0..1 range. */
function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Keep `index` within bounds of STATIONS (wrapping). */
function normalizeIndex(i: number): number {
  const n = STATIONS.length;
  return ((i % n) + n) % n;
}

/** Persist the current state to localStorage (best-effort). */
function persist(): void {
  try {
    const state: RadioState = { index, playing, volume };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore (no localStorage / quota / private mode)
  }
}

/** Restore saved state from localStorage, if any. */
function restore(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<RadioState>;
    if (typeof parsed.index === 'number') index = normalizeIndex(parsed.index);
    if (typeof parsed.playing === 'boolean') playing = parsed.playing;
    if (typeof parsed.volume === 'number') volume = clamp01(parsed.volume);
  } catch {
    // ignore malformed/unavailable storage
  }
}

/**
 * Lazily create the hidden <audio> element (once) and restore saved
 * station + volume. Safe to call multiple times; guards for no-DOM contexts.
 */
export function initRadio(): void {
  if (initialized) return;
  initialized = true;

  restore();

  try {
    if (typeof document === 'undefined') return;
    audio = document.createElement('audio');
    audio.preload = 'none';
    // Visually hidden, but still attached so playback works.
    audio.style.display = 'none';
    audio.volume = volume;
    document.body.appendChild(audio);
  } catch {
    audio = null;
  }
}

/** Set audio.src to the current station's url if it isn't already. */
function ensureSrc(): boolean {
  if (!audio) return false;
  const station = STATIONS[index];
  if (!station.url) return false;
  if (audio.src !== station.url) {
    audio.src = station.url;
  }
  return true;
}

/**
 * Call on the first user gesture: if the saved state says we should be
 * playing, actually start playback now (browser autoplay policy needs a
 * gesture before audio can start).
 */
export function resumeRadio(): void {
  if (!initialized) initRadio();
  if (playing && STATIONS[index].url) {
    play();
  }
}

/**
 * Start playback if the current station has a url. Silence stays paused.
 * Persists playing=true.
 */
export function play(): void {
  if (!initialized) initRadio();
  if (!STATIONS[index].url) {
    // Silence: nothing to play.
    playing = false;
    persist();
    return;
  }
  playing = true;
  try {
    if (audio && ensureSrc()) {
      audio.volume = volume;
      // play() may reject (autoplay policy); ignore the rejection.
      const p = audio.play() as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    }
  } catch {
    // ignore playback errors
  }
  persist();
}

/** Pause playback; persists playing=false. */
export function pause(): void {
  if (!initialized) initRadio();
  playing = false;
  try {
    if (audio) audio.pause();
  } catch {
    // ignore
  }
  persist();
}

/**
 * Toggle play/pause. On Silence there is nothing to play, so it just stays
 * paused.
 */
export function toggle(): void {
  if (!initialized) initRadio();
  if (playing) {
    pause();
  } else {
    play();
  }
}

/** Apply playback rules after a station change (used by next/prev/setStation). */
function applyStationChange(wasPlaying: boolean): void {
  if (!STATIONS[index].url) {
    // New station is Silence: pause.
    pause();
    return;
  }
  if (wasPlaying) {
    // Was playing and new station has a stream: start it.
    play();
  } else {
    // Not playing: just remember the index, don't auto-start.
    persist();
  }
}

/** Move to the next station (wraps), applying playback rules. */
export function next(): void {
  if (!initialized) initRadio();
  const wasPlaying = playing;
  index = normalizeIndex(index + 1);
  applyStationChange(wasPlaying);
}

/** Move to the previous station (wraps), applying playback rules. */
export function prev(): void {
  if (!initialized) initRadio();
  const wasPlaying = playing;
  index = normalizeIndex(index - 1);
  applyStationChange(wasPlaying);
}

/** Jump to a specific station index, applying playback rules. */
export function setStation(i: number): void {
  if (!initialized) initRadio();
  const wasPlaying = playing;
  index = normalizeIndex(i);
  applyStationChange(wasPlaying);
}

/** The currently selected station. */
export function getStation(): Station {
  return STATIONS[index];
}

/** The currently selected station index. */
export function getIndex(): number {
  return index;
}

/** Whether the radio is currently playing (intent flag; may be buffering). */
export function isPlaying(): boolean {
  return playing;
}

/**
 * Whether sound is ACTUALLY coming out right now: intent is "play", the element
 * exists, is not paused/ended/errored, and has enough buffered data to advance.
 * Used to gate the EQ bars so they don't dance while a stream is buffering,
 * stalled, or blocked by autoplay policy.
 */
export function isAudible(): boolean {
  if (!playing || !audio) return false;
  try {
    return (
      !audio.paused &&
      !audio.ended &&
      audio.error == null &&
      audio.readyState >= 3 // HAVE_FUTURE_DATA: data is flowing
    );
  } catch {
    return false;
  }
}

/** Set volume (0..1, clamped); persists and applies to the audio element. */
export function setVolume(v: number): void {
  volume = clamp01(v);
  try {
    if (audio) audio.volume = volume;
  } catch {
    // ignore
  }
  persist();
}

/** Current volume (0..1). */
export function getVolume(): number {
  return volume;
}
