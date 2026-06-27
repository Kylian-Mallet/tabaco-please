// Procedural retro (8-bit style) sound effects via the Web Audio API.
// No audio asset files: every sound is synthesized on the fly from
// OscillatorNodes and/or a short noise buffer shaped by GainNode envelopes.
// Singleton module: one AudioContext + one master GainNode.

export type SfxName =
  | 'click'      // small UI blip (short square beep)
  | 'sale'       // cash register cha-ching (two-tone bright bell, ascending)
  | 'coin'       // coin clink (short high metallic ping)
  | 'refuse'     // refusal buzzer (low square/saw, descending, harsh)
  | 'stamp'      // stamp / ID slap (very short noise burst, thocky)
  | 'client'     // a client steps up (soft two-note doorbell-ish)
  | 'patience'   // patience low warning (urgent repeated beep, mid)
  | 'fine'       // fine / penalty (descending minor tones, ominous)
  | 'day'        // end of day (gentle resolved chime)
  | 'bluffOk'    // bluff succeeded (sneaky upward arpeggio)
  | 'bluffFail'  // bluff caught (error klaxon, dissonant)
  | 'radio';     // radio toggle click

const MUTE_KEY = 'tabaco-sfx-muted';
const VOL_KEY = 'tabaco-sfx-vol';
const DEFAULT_VOLUME = 0.5;

// ---------------------------------------------------------------------------
// Module-level singleton state
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let volume = DEFAULT_VOLUME;

// Cache for the AudioContext constructor lookup (handles webkit prefix).
type AudioCtxCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtxCtor | null {
  try {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as {
      AudioContext?: AudioCtxCtor;
      webkitAudioContext?: AudioCtxCtor;
    };
    return w.AudioContext ?? w.webkitAudioContext ?? null;
  } catch {
    return null;
  }
}

// Effective master gain given mute + volume.
function effectiveGain(): number {
  return muted ? 0 : volume;
}

function applyMasterGain(): void {
  try {
    if (ctx && master) {
      master.gain.setValueAtTime(effectiveGain(), ctx.currentTime);
    }
  } catch {
    /* no-op */
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadPersisted(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const m = localStorage.getItem(MUTE_KEY);
    if (m !== null) muted = m === 'true' || m === '1';
    const v = localStorage.getItem(VOL_KEY);
    if (v !== null) {
      const parsed = parseFloat(v);
      if (!Number.isNaN(parsed)) {
        volume = Math.min(1, Math.max(0, parsed));
      }
    }
  } catch {
    /* no-op */
  }
}

// ---------------------------------------------------------------------------
// Public lifecycle
// ---------------------------------------------------------------------------

export function initSfx(): void {
  try {
    loadPersisted();
    if (ctx) {
      applyMasterGain();
      return;
    }
    const Ctor = getAudioContextCtor();
    if (!Ctor) return; // no AudioContext available => no-op
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.setValueAtTime(effectiveGain(), ctx.currentTime);
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
}

export function resumeSfx(): void {
  try {
    if (!ctx) initSfx();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  } catch {
    /* no-op */
  }
}

// ---------------------------------------------------------------------------
// Mute / volume getters & setters
// ---------------------------------------------------------------------------

export function setSfxMuted(m: boolean): void {
  muted = m;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MUTE_KEY, m ? 'true' : 'false');
    }
  } catch {
    /* no-op */
  }
  applyMasterGain();
}

export function isSfxMuted(): boolean {
  return muted;
}

export function setSfxVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(VOL_KEY, String(volume));
    }
  } catch {
    /* no-op */
  }
  applyMasterGain();
}

export function getSfxVolume(): number {
  return volume;
}

// ---------------------------------------------------------------------------
// Synthesis helpers
// ---------------------------------------------------------------------------

// A single oscillator tone with a quick-attack / exponential-decay envelope.
function tone(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  peakGain: number,
  endFreq?: number,
): void {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq !== undefined && endFreq > 0) {
    // Slide the pitch for a richer chiptune feel (used by sirens/buzzers).
    osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  }
  const attack = Math.min(0.005, dur * 0.2);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(Math.max(peakGain, 0.0001), start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(env);
  env.connect(master);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

// Shared deterministic pseudo-noise buffer (filled once, reused).
let noiseBuffer: AudioBuffer | null = null;

function getNoiseBuffer(): AudioBuffer | null {
  if (!ctx) return null;
  if (noiseBuffer) return noiseBuffer;
  try {
    const len = Math.floor(ctx.sampleRate * 0.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Deterministic LCG-based pseudo-noise (no Math.random for repeatability).
    let seed = 0x1234abcd;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    noiseBuffer = buf;
    return noiseBuffer;
  } catch {
    return null;
  }
}

// A short white-noise burst with an exponential-decay envelope.
function noise(start: number, dur: number, peakGain: number): void {
  if (!ctx || !master) return;
  const buf = getNoiseBuffer();
  if (!buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const env = ctx.createGain();
  env.gain.setValueAtTime(Math.max(peakGain, 0.0001), start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(env);
  env.connect(master);
  src.start(start);
  src.stop(start + dur + 0.02);
}

// ---------------------------------------------------------------------------
// Sound definitions
// ---------------------------------------------------------------------------

function render(name: SfxName, t: number): void {
  switch (name) {
    case 'click':
      // Tiny UI blip: one short square beep.
      tone(880, t, 0.05, 'square', 0.35);
      break;

    case 'sale':
      // Cash register cha-ching: two bright bell tones ascending.
      tone(1046, t, 0.12, 'triangle', 0.4);
      tone(1318, t + 0.09, 0.22, 'triangle', 0.4);
      tone(1568, t + 0.09, 0.22, 'square', 0.12); // sparkle overtone
      break;

    case 'coin':
      // Coin clink: short high metallic ping (two close partials).
      tone(1760, t, 0.08, 'square', 0.3);
      tone(2637, t, 0.1, 'triangle', 0.18);
      break;

    case 'refuse':
      // Refusal buzzer: harsh low saw, descending.
      tone(220, t, 0.28, 'sawtooth', 0.32, 110);
      tone(233, t, 0.28, 'square', 0.12, 116); // beating dissonance
      break;

    case 'stamp':
      // Stamp / ID slap: very short thocky noise burst + low thud.
      noise(t, 0.06, 0.45);
      tone(140, t, 0.07, 'square', 0.3, 70);
      break;

    case 'client':
      // Soft two-note doorbell-ish (descending major third).
      tone(659, t, 0.18, 'triangle', 0.3);
      tone(523, t + 0.14, 0.28, 'triangle', 0.3);
      break;

    case 'patience':
      // Urgent repeated mid beep (three pulses).
      tone(587, t, 0.07, 'square', 0.3);
      tone(587, t + 0.12, 0.07, 'square', 0.3);
      tone(587, t + 0.24, 0.07, 'square', 0.3);
      break;

    case 'fine':
      // Fine / penalty: ominous descending minor tones.
      tone(440, t, 0.18, 'sawtooth', 0.3);
      tone(370, t + 0.16, 0.2, 'sawtooth', 0.3);
      tone(294, t + 0.34, 0.34, 'sawtooth', 0.32);
      break;

    case 'day':
      // End of day: gentle resolved major chime (arpeggio C-E-G).
      tone(523, t, 0.3, 'triangle', 0.28);
      tone(659, t + 0.12, 0.3, 'triangle', 0.28);
      tone(784, t + 0.24, 0.45, 'triangle', 0.3);
      break;

    case 'bluffOk':
      // Bluff succeeded: sneaky upward arpeggio.
      tone(392, t, 0.08, 'square', 0.26);
      tone(494, t + 0.07, 0.08, 'square', 0.26);
      tone(587, t + 0.14, 0.08, 'square', 0.26);
      tone(784, t + 0.21, 0.16, 'triangle', 0.3);
      break;

    case 'bluffFail':
      // Bluff caught: dissonant error klaxon (two clashing tones).
      tone(330, t, 0.3, 'sawtooth', 0.3);
      tone(349, t, 0.3, 'square', 0.22); // semitone clash
      tone(330, t + 0.18, 0.22, 'sawtooth', 0.3, 220);
      break;

    case 'radio':
      // Radio toggle click: dry low blip + tiny noise tick.
      tone(440, t, 0.04, 'square', 0.25);
      noise(t, 0.02, 0.2);
      break;
  }
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

export function playSfx(name: SfxName): void {
  try {
    if (muted) return;
    if (!ctx) initSfx();
    if (!ctx || !master) return;
    // Resume opportunistically in case we were suspended by autoplay policy.
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    render(name, now);
  } catch {
    /* no-op */
  }
}
