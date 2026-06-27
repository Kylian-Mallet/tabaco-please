// Persistent on-canvas control bar (top-left), drawn over every scene in the
// backbuffer so it pixelates with the rest. Holds: fullscreen toggle, SFX mute,
// and the radio (play/pause + prev/next station + station name).
// Clicks are hit-tested here BEFORE the active scene sees them.

import type { Renderer } from './renderer';
import { PAL } from './palette';
import { wobble } from './anim';
import * as radio from './radio';
import { isSfxMuted, setSfxMuted, playSfx } from './sfx';

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

  // Order: settings gear FIRST, then fullscreen, sfx, radio play/prev/next.
  private readonly gear: Box = { x: 3, y: Y, w: 12, h: H };
  private readonly fs: Box = { x: 17, y: Y, w: 12, h: H };
  private readonly sfx: Box = { x: 31, y: Y, w: 12, h: H };
  private readonly play: Box = { x: 45, y: Y, w: 12, h: H };
  private readonly prev: Box = { x: 59, y: Y, w: 10, h: H };
  private readonly next: Box = { x: 71, y: Y, w: 10, h: H };
  private readonly nameX = 87;

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
      setSfxMuted(!isSfxMuted());
      if (!isSfxMuted()) playSfx('click');
      return true;
    }
    if (inBox(p, this.play)) {
      radio.toggle();
      playSfx('radio');
      return true;
    }
    if (inBox(p, this.prev)) {
      radio.prev();
      playSfx('radio');
      return true;
    }
    if (inBox(p, this.next)) {
      radio.next();
      playSfx('radio');
      return true;
    }
    if (inBox(p, this.gear)) {
      this.onSettings();
      return true;
    }
    return false;
  }

  // EQ bars: 4 bars, each 1px wide on a 2px pitch, shown only while playing.
  private static readonly EQ_BARS = 4;
  private static readonly EQ_W = ControlsOverlay.EQ_BARS * 2;

  render(r: Renderer): void {
    const playing = radio.isPlaying();
    // EQ bars track ACTUAL audio output, not just the play intent, so they stay
    // still while a stream is buffering / stalled / blocked by autoplay policy.
    const audible = radio.isAudible();
    const station = radio.getStation().name;
    const nameW = r.measure(station, 1);
    const eqW = audible ? ControlsOverlay.EQ_W + 3 : 0;
    const plaqueW = this.nameX + nameW + 6 + eqW;

    // Backing plaque so the bar reads on any scene.
    r.rect(1, 1, plaqueW, H + 2, PAL.ink);
    r.stroke(1, 1, plaqueW, H + 2, PAL.woodDark, 1);

    this.drawBtn(r, this.fs, false);
    this.icoFullscreen(r, this.fs, this.isFullscreen());

    this.drawBtn(r, this.sfx, false);
    this.icoSpeaker(r, this.sfx, !isSfxMuted());

    this.drawBtn(r, this.play, playing);
    this.icoPlayPause(r, this.play, playing);

    this.drawBtn(r, this.prev, false);
    this.icoTriangle(r, this.prev, 'left');
    this.drawBtn(r, this.next, false);
    this.icoTriangle(r, this.next, 'right');

    this.drawBtn(r, this.gear, this.isSettingsOpen());
    this.icoGear(r, this.gear, this.isSettingsOpen());

    // Station name (lit when playing).
    r.text(station, this.nameX, 5, {
      color: playing ? PAL.fdjYellow : PAL.paper,
      scale: 1,
      align: 'left',
    });

    // Little radio EQ bars that bounce only while sound is actually playing.
    if (audible) this.drawEq(r, this.nameX + nameW + 3);
  }

  /** Bouncing equaliser bars next to the station name (wobble-driven). */
  private drawEq(r: Renderer, x: number): void {
    const t = performance.now() / 1000;
    const baseY = Y + H - 2; // bottom of the bars
    for (let i = 0; i < ControlsOverlay.EQ_BARS; i++) {
      // Phase-shift each bar so they bounce out of sync; clamp to 1..6 px.
      const h = Math.min(6, Math.max(1, 4 + wobble(t + i * 0.21, 3, 0.42 + i * 0.05)));
      const col = i % 2 === 0 ? PAL.fdjYellow : PAL.mutedGreen;
      r.vline(x + i * 2, baseY - h + 1, h, col);
    }
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

  private icoPlayPause(r: Renderer, b: Box, playing: boolean): void {
    const x = b.x + 4;
    const y = b.y + 3;
    if (playing) {
      // Pause bars.
      r.rect(x, y, 2, 6, PAL.fdjYellow);
      r.rect(x + 4, y, 2, 6, PAL.fdjYellow);
    } else {
      // Play triangle.
      for (let i = 0; i < 6; i++) {
        const len = 3 - Math.abs(i - 2.5) * 1.0;
        r.vline(x + i, y + Math.round(3 - len), Math.max(1, Math.round(len * 2)), PAL.mutedGreen);
      }
    }
  }

  private icoTriangle(r: Renderer, b: Box, dir: 'left' | 'right'): void {
    const c = PAL.offWhite;
    const cx = b.x + b.w / 2;
    const y = b.y + 3;
    for (let i = 0; i < 5; i++) {
      const len = i + 1 > 3 ? 6 - (i + 1) : i + 1;
      const h = Math.max(1, len);
      const px = dir === 'right' ? cx - 2 + i : cx + 2 - i;
      r.vline(px, y + Math.round(3 - h / 2), Math.round(h), c);
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
