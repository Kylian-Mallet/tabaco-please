// Persistent on-canvas control bar (top-left), drawn over every scene in the
// backbuffer so it pixelates with the rest. Holds: settings gear, fullscreen
// toggle, SFX mute. (The radio lives on the counter, not here.)
// Clicks are hit-tested here BEFORE the active scene sees them.

import type { Renderer } from './renderer';
import { PAL } from './palette';
import { isSfxMuted, setSfxMuted, playSfx } from './sfx';
import { setMuted as setRadioMuted } from './radio';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function inBox(p: { x: number; y: number }, b: Box): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

const Y = 2;
const H = 12;

export class ControlsOverlay {
  private readonly toggleFullscreen: () => void;
  private readonly isFullscreen: () => boolean;
  private readonly onSettings: () => void;
  private readonly isSettingsOpen: () => boolean;

  // Order: settings gear, fullscreen, SFX mute.
  private readonly gear: Box = { x: 3, y: Y, w: 12, h: H };
  private readonly fs: Box = { x: 17, y: Y, w: 12, h: H };
  private readonly sfx: Box = { x: 31, y: Y, w: 12, h: H };

  constructor(opts: {
    toggleFullscreen: () => void;
    isFullscreen: () => boolean;
    onSettings: () => void;
    isSettingsOpen: () => boolean;
  }) {
    this.toggleFullscreen = opts.toggleFullscreen;
    this.isFullscreen = opts.isFullscreen;
    this.onSettings = opts.onSettings;
    this.isSettingsOpen = opts.isSettingsOpen;
  }

  /** Returns true if the click was consumed by a control (scene must ignore it). */
  onClick(p: { x: number; y: number }): boolean {
    if (inBox(p, this.fs)) {
      playSfx('click');
      this.toggleFullscreen();
      return true;
    }
    if (inBox(p, this.sfx)) {
      // This button is a GLOBAL mute: it silences SFX AND the radio together.
      const m = !isSfxMuted();
      setSfxMuted(m);
      setRadioMuted(m);
      if (!m) playSfx('click');
      return true;
    }
    if (inBox(p, this.gear)) {
      this.onSettings();
      return true;
    }
    return false;
  }

  render(r: Renderer): void {
    const plaqueW = this.sfx.x + this.sfx.w + 2;

    // Backing plaque so the bar reads on any scene.
    r.rect(1, 1, plaqueW, H + 2, PAL.ink);
    r.stroke(1, 1, plaqueW, H + 2, PAL.woodDark, 1);

    this.drawBtn(r, this.gear, this.isSettingsOpen());
    this.icoGear(r, this.gear, this.isSettingsOpen());

    this.drawBtn(r, this.fs, false);
    this.icoFullscreen(r, this.fs, this.isFullscreen());

    this.drawBtn(r, this.sfx, false);
    this.icoSpeaker(r, this.sfx, !isSfxMuted());
  }

  // --- icon helpers ----------------------------------------------------------

  private drawBtn(r: Renderer, b: Box, active: boolean): void {
    r.rect(b.x, b.y, b.w, b.h, active ? PAL.wood : PAL.wallDark);
    r.hline(b.x, b.y, b.w, PAL.woodLight);
    r.stroke(b.x, b.y, b.w, b.h, PAL.shadow, 1);
  }

  private icoFullscreen(r: Renderer, b: Box, on: boolean): void {
    const c = on ? PAL.fdjYellow : PAL.offWhite;
    const x = b.x + 2;
    const y = b.y + 3;
    const w = b.w - 4;
    const h = b.h - 6;
    // Four corner brackets.
    r.hline(x, y, 2, c); r.vline(x, y, 2, c);
    r.hline(x + w - 2, y, 2, c); r.vline(x + w - 1, y, 2, c);
    r.hline(x, y + h - 1, 2, c); r.vline(x, y + h - 2, 2, c);
    r.hline(x + w - 2, y + h - 1, 2, c); r.vline(x + w - 1, y + h - 2, 2, c);
  }

  private icoSpeaker(r: Renderer, b: Box, on: boolean): void {
    const x = b.x + 3;
    const y = b.y + 3;
    const c = PAL.offWhite;
    // Cone.
    r.rect(x, y + 1, 2, 4, c);
    r.px(x + 2, y, c);
    r.px(x + 2, y + 5, c);
    r.rect(x + 2, y + 1, 2, 4, c);
    if (on) {
      // Sound waves.
      r.px(x + 6, y + 1, PAL.fdjYellow);
      r.px(x + 6, y + 4, PAL.fdjYellow);
      r.px(x + 7, y + 2, PAL.fdjYellow);
      r.px(x + 7, y + 3, PAL.fdjYellow);
    } else {
      // Muted cross.
      r.px(x + 6, y + 1, PAL.tobaccoRed);
      r.px(x + 7, y + 2, PAL.tobaccoRed);
      r.px(x + 6, y + 3, PAL.tobaccoRed);
      r.px(x + 7, y + 0, PAL.tobaccoRed);
      r.px(x + 5, y + 4, PAL.tobaccoRed);
    }
  }


  private icoGear(r: Renderer, b: Box, on: boolean): void {
    const c = on ? PAL.fdjYellow : PAL.offWhite;
    const hole = on ? PAL.wood : PAL.wallDark;
    const cx = b.x + 6;
    const cy = b.y + 6;
    // Four teeth (top, bottom, left, right).
    r.px(cx - 1, cy - 4, c); r.px(cx, cy - 4, c);
    r.px(cx - 1, cy + 3, c); r.px(cx, cy + 3, c);
    r.px(cx - 4, cy - 1, c); r.px(cx - 4, cy, c);
    r.px(cx + 3, cy - 1, c); r.px(cx + 3, cy, c);
    // Gear body with a hollow center.
    r.rect(cx - 2, cy - 2, 4, 4, c);
    r.rect(cx - 1, cy - 1, 2, 2, hole);
  }
}
