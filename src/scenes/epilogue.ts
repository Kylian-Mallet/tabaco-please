// EpilogueScene — the day-30 finale of the 30-day campaign.
//
// Reached from DayEndScene (and, defensively, WeekEndScene) once
// isCampaignEnd(state.day) is true. Shows the FRENCH epilogue picked by
// chooseEnding(state): a title + word-wrapped multi-line closing text on a
// pixel Panel, framed as "Le tabac de {playerName}…", with the final figures
// (trésorerie, avertissements, fautes). A button resets the run and returns to
// the TitleScene. Visuals match the ending tone: a lowered shutter for the
// grim outcomes (faillite / licence), a warm lit counter for the good ones.

import type { Scene } from '../engine/stateMachine';
import type { Renderer } from '../engine/renderer';
import type { GameContext } from '../game/types';
import { chooseEnding, type Ending } from '../game/economy';
import { freshState } from '../main';
import { Button, Panel, type Rect } from '../engine/ui';
import { PAL } from '../engine/palette';
import { VW, VH } from '../engine/layout';
import { drawCounter, drawClient } from '../engine/sprites';
import { Tween, Ease } from '../engine/tween';
import { shake } from '../engine/fx';
import { TitleScene } from './title';

/** Word-wrap a string to a maximum character count per line (font is ~6px/char). */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (test.length <= maxChars || cur === '') cur = test;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

export class EpilogueScene implements Scene {
  private readonly ctx: GameContext;
  private readonly restartBtn: Button;

  // Snapshot of the run, captured before the restart button resets state.
  private readonly ending: Ending;
  private readonly playerName: string;
  private readonly finalCash: number;
  private readonly warnings: number;
  private readonly faults: number;
  /** True for the grim outcomes — drives the lowered-shutter backdrop. */
  private readonly grim: boolean;

  // Intro animation state. Grim: an iron shutter slams down (reveal 0..1) then
  // the screen jolts. Good: a warm dark wash lifts (warmFade 1..0). In both the
  // panel + figures fade up (contentAlpha 0..1) once the backdrop has settled.
  private reveal = 0;
  private warmFade = 1;
  private contentAlpha = 0;
  private readonly tweens: Tween[] = [];

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    const s = ctx.state;
    this.ending = chooseEnding(s);
    this.playerName =
      s.playerName && s.playerName.trim().length > 0 ? s.playerName : 'Gérant';
    this.finalCash = s.cash;
    this.warnings = s.warnings ?? 0;
    this.faults = s.totalFaults ?? 0;
    this.grim = this.ending.id === 'faillite' || this.ending.id === 'licence';

    const btnRect: Rect = { x: VW / 2 - 70, y: 248, w: 140, h: 18 };
    this.restartBtn = new Button(btnRect, 'REJOUER', () => this.restart(), {
      color: this.grim ? PAL.tobaccoRed : PAL.mutedGreen,
    });
  }

  /** Reset the run to a fresh campaign and go back to the title screen. */
  private restart(): void {
    Object.assign(this.ctx.state, freshState());
    this.ctx.goTo(new TitleScene(this.ctx));
  }

  enter(): void {
    if (this.grim) {
      // "Rideau de fer": the shutter accelerates down, then the frame jolts.
      this.tweens.push(
        new Tween({
          from: 0,
          to: 1,
          duration: 0.6,
          easing: Ease.easeInQuad,
          onUpdate: (v) => {
            this.reveal = v;
          },
          onComplete: () => shake(4, 0.45),
        }),
      );
      this.tweens.push(this.contentFade(0.6));
    } else {
      // Warm fade-up: the dark wash over the lit counter lifts away.
      this.tweens.push(
        new Tween({
          from: 1,
          to: 0,
          duration: 0.9,
          easing: Ease.easeOutQuad,
          onUpdate: (v) => {
            this.warmFade = v;
          },
        }),
      );
      this.tweens.push(this.contentFade(0.3));
    }
  }

  /** Tween that fades the panel + figures up after `delay` seconds. */
  private contentFade(delay: number): Tween {
    return new Tween({
      from: 0,
      to: 1,
      duration: 0.45,
      delay,
      easing: Ease.easeOutQuad,
      onUpdate: (v) => {
        this.contentAlpha = v;
      },
    });
  }

  update(dt: number): void {
    for (const t of this.tweens) t.update(dt);
  }

  render(r: Renderer): void {
    if (this.grim) {
      this.renderShutter(r, this.reveal);
    } else {
      this.renderWarmCounter(r);
      // Warm dark wash lifting away (fade-up).
      if (this.warmFade > 0) {
        const prev = r.ctx.globalAlpha;
        r.ctx.globalAlpha = this.warmFade;
        r.rect(0, 0, VW, VH, PAL.bg);
        r.ctx.globalAlpha = prev;
      }
    }

    // The text/figures block fades up once the backdrop has settled.
    const prevAlpha = r.ctx.globalAlpha;
    r.ctx.globalAlpha = this.contentAlpha;

    // --- Headline band ---------------------------------------------------
    r.text(`Le tabac de ${this.playerName}…`, VW / 2, 8, {
      color: PAL.offWhite,
      scale: 1,
      align: 'center',
    });
    const tColor = this.grim ? PAL.tobaccoRed : PAL.fdjYellow;
    r.text(this.ending.title, VW / 2 + 1, 19, { color: PAL.ink, scale: 2, align: 'center' });
    r.text(this.ending.title, VW / 2, 18, { color: tColor, scale: 2, align: 'center' });

    // --- Epilogue paper panel -------------------------------------------
    const panel = { x: VW / 2 - 160, y: 42, w: 320, h: 150 };
    new Panel(panel, { title: 'ÉPILOGUE', color: PAL.paper }).draw(r);

    const maxChars = Math.max(8, Math.floor((panel.w - 24) / 6));
    const lines = wrapText(this.ending.text, maxChars);
    let y = panel.y + 22;
    for (const ln of lines) {
      if (y > panel.y + panel.h - 14) break;
      r.text(ln, panel.x + 12, y, { color: PAL.ink, scale: 1, align: 'left' });
      y += 10;
    }

    // --- Final figures plaque -------------------------------------------
    const fy = panel.y + panel.h + 8;
    const fw = 320;
    const fx = Math.round(VW / 2 - fw / 2);
    r.rect(fx, fy, fw, 38, PAL.woodDark);
    r.stroke(fx, fy, fw, 38, PAL.ink, 1);
    r.hline(fx + 1, fy + 1, fw - 2, PAL.wood);

    r.text('BILAN FINAL', VW / 2, fy + 4, { color: PAL.skin, scale: 1, align: 'center' });
    const cashColor = this.finalCash > 0 ? PAL.mutedGreen : PAL.tobaccoRed;
    r.text(`Trésorerie : ${this.finalCash.toFixed(2)} €`, fx + 10, fy + 18, {
      color: cashColor,
      scale: 1,
      align: 'left',
    });
    r.text(`Avertissements : ${this.warnings}`, fx + fw - 10, fy + 18, {
      color: this.warnings > 0 ? PAL.fdjYellow : PAL.offWhite,
      scale: 1,
      align: 'right',
    });
    r.text(`Fautes cumulées : ${this.faults}`, VW / 2, fy + 28, {
      color: this.faults > 0 ? PAL.fdjYellow : PAL.offWhite,
      scale: 1,
      align: 'center',
    });

    this.restartBtn.draw(r);

    r.ctx.globalAlpha = prevAlpha;
  }

  /**
   * Grim backdrop: a metal shutter dropping closed. `reveal` (0..1) is how far
   * the shutter has descended, so it visibly slams shut on entry.
   */
  private renderShutter(r: Renderer, reveal: number): void {
    r.clear(PAL.bg);
    const sx = 30;
    const sy = 36;
    const sw = VW - sx * 2;
    const sh = VH - sy - 30;
    // Current dropped height (at least a sliver so the rails read immediately).
    const drop = Math.max(1, Math.round(sh * Math.min(1, Math.max(0, reveal))));
    r.rect(sx, sy, sw, drop, PAL.wall);
    r.stroke(sx, sy, sw, drop, PAL.ink, 1);
    // Corrugated horizontal slats (only down to the current bottom edge).
    for (let yy = sy + 2; yy < sy + drop - 1; yy += 6) {
      r.hline(sx + 1, yy, sw - 2, PAL.woodLight);
      r.hline(sx + 1, yy + 1, sw - 2, PAL.wall);
      r.hline(sx + 1, yy + 2, sw - 2, PAL.wallDark);
      r.hline(sx + 1, yy + 3, sw - 2, PAL.shadow);
    }
    // Heavy bottom lip on the descending edge.
    r.hline(sx, sy + drop - 1, sw, PAL.ink);
    // Side guide rails.
    r.rect(sx, sy, 3, drop, PAL.woodDark);
    r.rect(sx + sw - 3, sy, 3, drop, PAL.woodDark);
  }

  /** Warm backdrop: the lit shop counter, with the seller bust behind it. */
  private renderWarmCounter(r: Renderer): void {
    r.clear(PAL.bg);
    // Warm wall wash so the good ending feels lit.
    r.rect(0, 0, VW, 150, PAL.woodDark);
    r.rect(20, 30, VW - 40, 110, PAL.wood);
    // The seller, chosen at onboarding, smiling behind the counter.
    drawClient(r, VW / 2, 60, { mood: 'happy', look: this.ctx.state.sellerLook });
    drawCounter(r);
  }

  onClick(p: { x: number; y: number }): void {
    // Don't accept clicks until the button has faded in.
    if (this.contentAlpha < 0.99) return;
    if (this.restartBtn.hit(p)) this.restartBtn.click();
  }
}
