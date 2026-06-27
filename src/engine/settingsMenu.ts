// In-game settings overlay. A centered pixel Panel drawn ON TOP of everything
// (after the scene and the control bar). While open it dims the screen and
// consumes ALL clicks so nothing behind it reacts.
//
// Offers: save the run, return to the title screen, and two volume sliders
// (radio + SFX). Built from the shared pixel UI widgets and the PAL palette.
// User-facing string LITERALS stay in FRENCH; identifiers/comments in ENGLISH.

import type { Renderer } from './renderer';
import { VW, VH } from './renderer';
import { PAL } from './palette';
import { Button, Panel, inRect, type Rect } from './ui';
import type { GameContext } from '../game/types';
import { save } from './save';
import * as radio from './radio';
import { getSfxVolume, setSfxVolume, playSfx } from './sfx';

/** One labelled volume slider (0..1). Click anywhere on its track to set it. */
interface Slider {
  label: string;
  track: Rect;
  get: () => number;
  set: (v: number) => void;
}

export class SettingsMenu {
  private readonly ctx: GameContext;
  private readonly goHome: () => void;
  private open = false;

  // Timestamp (ms) of the last save, to flash a brief confirmation.
  private savedAt = -Infinity;

  private readonly panel: Panel;
  private readonly panelRect: Rect;
  private readonly closeBox: Rect;
  private readonly saveBtn: Button;
  private readonly homeBtn: Button;
  private readonly radioSlider: Slider;
  private readonly sfxSlider: Slider;

  constructor(ctx: GameContext, opts: { goHome: () => void }) {
    this.ctx = ctx;
    this.goHome = opts.goHome;

    const w = 210;
    const h = 150;
    const x = Math.round((VW - w) / 2);
    const y = Math.round((VH - h) / 2);
    this.panelRect = { x, y, w, h };
    this.panel = new Panel(this.panelRect, { title: 'PARAMÈTRES' });

    // Close "X" box in the title band, top-right.
    this.closeBox = { x: x + w - 14, y: y + 2, w: 12, h: 11 };

    const contentX = x + 8;
    const contentW = w - 16;

    this.radioSlider = {
      label: 'Volume radio',
      track: { x: contentX, y: y + 30, w: contentW, h: 6 },
      get: () => radio.getVolume(),
      set: (v) => radio.setVolume(v),
    };
    this.sfxSlider = {
      label: 'Effets sonores',
      track: { x: contentX, y: y + 54, w: contentW, h: 6 },
      get: () => getSfxVolume(),
      set: (v) => setSfxVolume(v),
    };

    this.saveBtn = new Button(
      { x: contentX, y: y + 96, w: contentW, h: 16 },
      'Sauvegarder la partie',
      () => {
        save(this.ctx.state);
        this.savedAt = performance.now();
        playSfx('coin');
      },
      { color: PAL.mutedGreen },
    );
    this.homeBtn = new Button(
      { x: contentX, y: y + 116, w: contentW, h: 16 },
      "Retour à l'accueil",
      () => {
        this.open = false;
        playSfx('click');
        this.goHome();
      },
      { color: PAL.tobaccoRed },
    );
  }

  isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open = !this.open;
    playSfx('click');
  }

  close(): void {
    this.open = false;
  }

  /**
   * Handle a click. Returns true while the menu is open (it consumes EVERY
   * click so the scene/controls behind it never react), false when closed.
   */
  onClick(p: { x: number; y: number }): boolean {
    if (!this.open) return false;

    if (inRect(p, this.closeBox)) {
      this.open = false;
      playSfx('click');
      return true;
    }

    if (this.handleSlider(p, this.radioSlider)) return true;
    if (this.handleSlider(p, this.sfxSlider)) return true;

    if (this.saveBtn.hit(p)) {
      this.saveBtn.click();
      return true;
    }
    if (this.homeBtn.hit(p)) {
      this.homeBtn.click();
      return true;
    }

    // Click outside the panel while open: dismiss the menu (so the control-bar
    // gear, which sits outside the panel, can close it too — clicks never reach
    // controls.onClick while we are open). Still consume the click so the scene
    // behind never sees this same press.
    if (!inRect(p, this.panelRect)) {
      this.open = false;
      playSfx('click');
      return true;
    }

    // Click inside the panel but on no widget: ignore it, but still consume.
    return true;
  }

  /** Set the slider's value from the click x if it falls on the (padded) track. */
  private handleSlider(p: { x: number; y: number }, s: Slider): boolean {
    const t = s.track;
    // Generous vertical hit area around the thin track.
    const hit: Rect = { x: t.x - 2, y: t.y - 4, w: t.w + 4, h: t.h + 8 };
    if (!inRect(p, hit)) return false;
    const v = (p.x - t.x) / t.w;
    s.set(v < 0 ? 0 : v > 1 ? 1 : v);
    playSfx('click');
    return true;
  }

  draw(r: Renderer): void {
    if (!this.open) return;

    // Dim the whole screen behind the panel.
    const c = r.ctx;
    c.save();
    c.globalAlpha = 0.6;
    c.fillStyle = PAL.bg;
    c.fillRect(0, 0, VW, VH);
    c.restore();

    this.panel.draw(r);
    this.drawCloseBox(r);

    this.drawSlider(r, this.radioSlider);
    this.drawSlider(r, this.sfxSlider);

    this.saveBtn.draw(r);
    this.homeBtn.draw(r);

    // Brief "Partie sauvegardée" confirmation under the save button.
    if (performance.now() - this.savedAt < 1500) {
      r.text('Partie sauvegardée', this.panelRect.x + this.panelRect.w / 2, this.saveBtn.rect.y - 9, {
        color: PAL.fdjYellow,
        scale: 1,
        align: 'center',
      });
    }
  }

  private drawCloseBox(r: Renderer): void {
    const b = this.closeBox;
    r.stroke(b.x, b.y, b.w, b.h, PAL.offWhite, 1);
    // X mark.
    for (let i = 0; i < 5; i++) {
      r.px(b.x + 3 + i, b.y + 3 + i, PAL.offWhite);
      r.px(b.x + 7 - i, b.y + 3 + i, PAL.offWhite);
    }
  }

  private drawSlider(r: Renderer, s: Slider): void {
    const t = s.track;
    const v = Math.min(1, Math.max(0, s.get()));

    // Label + percentage.
    r.text(s.label, t.x, t.y - 9, { color: PAL.paper, scale: 1, align: 'left' });
    r.text(`${Math.round(v * 100)}%`, t.x + t.w, t.y - 9, {
      color: PAL.fdjYellow,
      scale: 1,
      align: 'right',
    });

    // Track groove.
    r.rect(t.x, t.y, t.w, t.h, PAL.shadow);
    r.stroke(t.x, t.y, t.w, t.h, PAL.ink, 1);
    // Filled portion.
    const fillW = Math.round(t.w * v);
    if (fillW > 0) r.rect(t.x, t.y, fillW, t.h, PAL.mutedGreen);

    // Knob.
    const knobX = Math.round(t.x + t.w * v) - 2;
    r.rect(knobX, t.y - 2, 4, t.h + 4, PAL.fdjYellow);
    r.stroke(knobX, t.y - 2, 4, t.h + 4, PAL.ink, 1);
  }
}
