// Singleton screen-effects layer. Scenes FIRE effects (shake/flash/floatText)
// and main.ts READS the resulting state each frame:
//   - fxShake() -> integer offset applied to the backbuffer blit
//   - fxFlash() -> full-screen colour overlay (e.g. red on a fine)
//   - drawFxWorld() -> floating texts drawn INTO the 480x270 backbuffer
//
// Everything snaps to integers; every reader guards against "no effect active".

import type { Renderer } from './renderer';

interface ShakeState {
  intensity: number; // peak offset in pixels
  duration: number;
  elapsed: number;
}

interface FlashState {
  color: string;
  duration: number;
  elapsed: number;
}

interface FloatText {
  text: string;
  x: number; // backbuffer (480-space) origin x
  y: number; // backbuffer origin y
  color: string;
  duration: number;
  elapsed: number;
}

const RISE_PX = 10; // total upward travel of a floating text over its lifetime
const FLASH_PEAK = 0.55; // max flash opacity so a fine never fully blanks the view
const SHAKE_STEP = 1 / 30; // recompute the jitter at a fixed 30Hz, refresh-independent

let shakeState: ShakeState | null = null;
let flashState: FlashState | null = null;
let floats: FloatText[] = [];

// Current integer shake offset, recomputed on a fixed step inside updateFx().
let shakeOffset = { x: 0, y: 0 };
let shakeAccum = 0; // seconds accumulated toward the next jitter recompute

/** Trigger a camera shake. Later, stronger shakes override a weaker one. */
export function shake(intensity: number, duration: number): void {
  if (duration <= 0 || intensity <= 0) return;
  if (shakeState && shakeState.intensity > intensity && remaining(shakeState) > 0) {
    return; // keep the stronger ongoing shake
  }
  shakeState = { intensity, duration, elapsed: 0 };
  shakeAccum = SHAKE_STEP; // force an immediate jolt on the next updateFx()
}

/** Trigger a full-screen colour flash that fades out over `duration`. */
export function flash(color: string, duration: number): void {
  if (duration <= 0) return;
  flashState = { color, duration, elapsed: 0 };
}

/** Spawn a floating text that rises a few px and fades out. */
export function floatText(text: string, x: number, y: number, color: string): void {
  floats.push({
    text,
    x: Math.round(x),
    y: Math.round(y),
    color,
    duration: 1.1,
    elapsed: 0,
  });
}

/** Advance all effects by `dt` seconds. */
export function updateFx(dt: number): void {
  if (dt < 0) dt = 0;

  // Shake: decay amplitude linearly to zero over its duration. The jitter is
  // re-rolled only on a fixed 30Hz step so the chunkiness is the same on any
  // display (60/120/144Hz), instead of buzzing faster on high-refresh screens.
  if (shakeState) {
    shakeState.elapsed += dt;
    if (shakeState.elapsed >= shakeState.duration) {
      shakeState = null;
      shakeOffset = { x: 0, y: 0 };
      shakeAccum = 0;
    } else {
      shakeAccum += dt;
      if (shakeAccum >= SHAKE_STEP) {
        shakeAccum %= SHAKE_STEP;
        const k = 1 - shakeState.elapsed / shakeState.duration; // 1 -> 0
        const amp = shakeState.intensity * k;
        shakeOffset = {
          x: Math.round((Math.random() * 2 - 1) * amp),
          y: Math.round((Math.random() * 2 - 1) * amp),
        };
      }
    }
  }

  // Flash: just age it; alpha is derived in fxFlash().
  if (flashState) {
    flashState.elapsed += dt;
    if (flashState.elapsed >= flashState.duration) flashState = null;
  }

  // Floating texts: age and drop the finished ones.
  if (floats.length > 0) {
    for (const f of floats) f.elapsed += dt;
    if (floats.some((f) => f.elapsed >= f.duration)) {
      floats = floats.filter((f) => f.elapsed < f.duration);
    }
  }
}

/** Current integer shake offset to apply to the blit (zero when idle). */
export function fxShake(): { x: number; y: number } {
  return shakeOffset;
}

/** Current flash overlay, or null when none is active. */
export function fxFlash(): { color: string; alpha: number } | null {
  if (!flashState) return null;
  // Cap the peak so the punctuating flash tints the view instead of blanking it
  // to solid colour (which would hide the toast + scene it is meant to accent).
  const alpha = FLASH_PEAK * (1 - flashState.elapsed / flashState.duration);
  if (alpha <= 0) return null;
  return { color: flashState.color, alpha };
}

/** Draw the floating texts into the backbuffer (call during world render). */
export function drawFxWorld(r: Renderer): void {
  if (floats.length === 0) return;
  const ctx = r.ctx;
  const prevAlpha = ctx.globalAlpha;
  for (const f of floats) {
    const t = f.elapsed / f.duration; // 0 -> 1
    const alpha = Math.max(0, 1 - t);
    const y = Math.round(f.y - RISE_PX * t);
    ctx.globalAlpha = alpha;
    r.text(f.text, f.x, y, { color: f.color, align: 'center' });
  }
  ctx.globalAlpha = prevAlpha;
}

/** Seconds left in a timed effect. */
function remaining(s: { duration: number; elapsed: number }): number {
  return s.duration - s.elapsed;
}
