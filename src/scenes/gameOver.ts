// Game over / bankruptcy screen.
// Shows final cash + days survived; a Retry button resets the run state
// (cash -> STARTING_CASH, day -> 1, no active rules) and returns
// to the TitleScene.
//
// VISUAL: a closed-shutter pixel facade (lowered metal shutter) over the tabac,
// a hanging "FERMÉ" plaque, the summary (final cash + days held) and a
// REJOUER button. All in the 480x270 virtual space, PAL colors, hard edges.

import type { Scene } from '../engine/stateMachine';
import type { Renderer } from '../engine/renderer';
import type { GameContext } from '../game/types';
import { Button, type Rect } from '../engine/ui';
import { freshState } from '../main';
import { PAL } from '../engine/palette';
import { VW, VH } from '../engine/layout';
import { shake } from '../engine/fx';
import { TitleScene } from './title';

export class GameOverScene implements Scene {
  private readonly ctx: GameContext;
  private readonly retryBtn: Button;
  /** Snapshot of run results, captured before the retry button resets state. */
  private readonly finalCash: number;
  private readonly daysSurvived: number;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.finalCash = ctx.state.cash;
    // day is 1-based; a bankruptcy on day N means N days were survived.
    this.daysSurvived = Math.max(0, ctx.state.day);

    const btnRect: Rect = { x: VW / 2 - 50, y: 244, w: 100, h: 20 };
    this.retryBtn = new Button(btnRect, 'REJOUER', () => this.retry(), {
      color: PAL.tobaccoRed,
    });
  }

  private retry(): void {
    Object.assign(this.ctx.state, freshState());
    this.ctx.goTo(new TitleScene(this.ctx));
  }

  enter(): void {
    // The shutter slamming shut jolts the frame.
    shake(3, 0.4);
  }

  render(r: Renderer): void {
    // Night-dim street backdrop.
    r.clear(PAL.bg);

    // --- Facade wall around the shop front ---
    const fx = 56;
    const fy = 22;
    const fw = VW - fx * 2;
    const fh = 158;
    r.rect(fx - 8, fy - 8, fw + 16, fh + 24, PAL.wallDark);
    // Plaster mottling.
    for (let gy = fy - 8; gy < fy + fh + 14; gy += 3) {
      for (let gx = fx - 8; gx < fx + fw + 8; gx += 3) {
        if (((gx * 7 + gy * 13) & 31) === 0) r.px(gx, gy, PAL.shadow);
      }
    }

    // --- Shop name fascia (unlit) above the shutter ---
    r.rect(fx - 4, fy - 6, fw + 8, 12, PAL.woodDark);
    r.stroke(fx - 4, fy - 6, fw + 8, 12, PAL.ink, 1);
    r.hline(fx - 4, fy - 6, fw + 8, PAL.wood);
    // The classic red TABAC lozenge sign, dimmed.
    r.rect(VW / 2 - 5, fy - 9, 10, 6, PAL.tobaccoRed);
    r.rect(VW / 2 - 3, fy - 12, 6, 4, PAL.tobaccoRed);
    r.stroke(VW / 2 - 5, fy - 12, 10, 9, PAL.ink, 1);
    r.text('TABAC', VW / 2, fy - 4, {
      color: PAL.skinShadow,
      scale: 1,
      align: 'center',
    });

    // --- Lowered metal shutter (closed) ---
    const sx = fx;
    const sy = fy + 10;
    const sw = fw;
    const sh = fh - 28;
    // Body.
    r.rect(sx, sy, sw, sh, PAL.wall);
    r.stroke(sx, sy, sw, sh, PAL.ink, 1);
    // Corrugated horizontal slats: lit ridge + hard shadow groove, every 6px.
    for (let yy = sy + 2; yy < sy + sh - 1; yy += 6) {
      r.hline(sx + 1, yy, sw - 2, PAL.woodLight);
      r.hline(sx + 1, yy + 1, sw - 2, PAL.wall);
      r.hline(sx + 1, yy + 2, sw - 2, PAL.wallDark);
      r.hline(sx + 1, yy + 3, sw - 2, PAL.shadow);
    }
    // Side guide rails.
    r.rect(sx, sy, 3, sh, PAL.woodDark);
    r.rect(sx + sw - 3, sy, 3, sh, PAL.woodDark);
    r.vline(sx + 1, sy, sh, PAL.woodLight);
    r.vline(sx + sw - 2, sy, sh, PAL.shadow);
    // Bottom locking bar + handles.
    const barY = sy + sh - 6;
    r.rect(sx + 1, barY, sw - 2, 5, PAL.woodDark);
    r.hline(sx + 1, barY, sw - 2, PAL.woodLight);
    r.rect(sx + sw / 2 - 14, barY + 1, 8, 3, PAL.ink);
    r.rect(sx + sw / 2 + 6, barY + 1, 8, 3, PAL.ink);
    // Padlock dead center.
    r.rect(VW / 2 - 3, barY - 3, 6, 6, PAL.ink);
    r.rect(VW / 2 - 2, barY - 6, 4, 4, PAL.skinShadow);
    r.rect(VW / 2 - 1, barY - 1, 2, 2, PAL.fdjYellow);

    // --- Hanging "FERMÉ" plaque on the shutter ---
    const pw = 84;
    const ph = 24;
    const pxp = Math.round(VW / 2 - pw / 2);
    const pyp = sy + 24;
    // Suspension string.
    r.vline(VW / 2, sy + 1, pyp - sy - 1, PAL.ink);
    // Plaque shadow + body.
    r.rect(pxp + 2, pyp + 2, pw, ph, PAL.shadow);
    r.rect(pxp, pyp, pw, ph, PAL.paper);
    r.stroke(pxp, pyp, pw, ph, PAL.ink, 1);
    r.stroke(pxp + 2, pyp + 2, pw - 4, ph - 4, PAL.tobaccoRed, 1);
    r.hline(pxp + 1, pyp + 1, pw - 2, PAL.offWhite);
    r.text('FERME', VW / 2, pyp + 5, {
      color: PAL.tobaccoRed,
      scale: 2,
      align: 'center',
    });
    r.text('FAILLITE', VW / 2, pyp + ph - 7, {
      color: PAL.skinShadow,
      scale: 1,
      align: 'center',
    });

    // --- Title banner ---
    r.text('FIN ANTICIPÉE', VW / 2, fy + fh + 4, {
      color: PAL.offWhite,
      scale: 2,
      align: 'center',
    });

    // --- Summary panel ---
    const bw = 220;
    const bh = 30;
    const bx = Math.round(VW / 2 - bw / 2);
    const by = fy + fh + 22;
    r.rect(bx, by, bw, bh, PAL.woodDark);
    r.stroke(bx, by, bw, bh, PAL.ink, 1);
    r.hline(bx + 1, by + 1, bw - 2, PAL.wood);

    r.text(
      `Trésorerie finale : ${this.finalCash.toFixed(2)} €`,
      VW / 2,
      by + 6,
      { color: PAL.fdjYellow, scale: 1, align: 'center' }
    );
    const dayLabel = this.daysSurvived > 1 ? 'jours' : 'jour';
    r.text(
      `Jours tenus : ${this.daysSurvived} ${dayLabel}`,
      VW / 2,
      by + 20,
      { color: PAL.offWhite, scale: 1, align: 'center' }
    );

    this.retryBtn.draw(r);
  }

  onClick(p: { x: number; y: number }): void {
    if (this.retryBtn.hit(p)) this.retryBtn.click();
  }
}
