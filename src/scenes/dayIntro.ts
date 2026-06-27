import type { GameContext } from '../game/types';
import type { Scene } from '../engine/stateMachine';
import type { Renderer } from '../engine/renderer';
import { Button, Panel } from '../engine/ui';
import { PAL } from '../engine/palette';
import { VW, VH } from '../engine/layout';
import { drawPresentoir } from '../engine/sprites';
import { configJour } from '../game/content/jours';
import { CounterScene } from './counter';

/**
 * DayIntroScene — daily briefing.
 * Shows the JourConfig for the current day: a rule card with the newly unlocked
 * rule's description (if any) plus the day's intro text. The "Ouvrir le comptoir"
 * button activates the new rule (idempotent) and moves to CounterScene.
 */
export class DayIntroScene implements Scene {
  private readonly ctx: GameContext;
  private readonly config = { panel: { x: 80, y: 40, w: 320, h: 180 } };
  private readonly panel: Panel;
  private readonly bouton: Button;
  /** Ambient mur-de-paquets behind the briefing card. */
  private readonly packs: { x: number; y: number; color: string }[] = [];

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    const cfg = configJour(ctx.state.jour);
    const p = this.config.panel;
    this.panel = new Panel(
      { x: p.x, y: p.y, w: p.w, h: p.h },
      { title: `Jour ${cfg.jour}`, color: PAL.paper }
    );
    this.bouton = new Button(
      { x: p.x + p.w / 2 - 70, y: p.y + p.h - 28, w: 140, h: 20 },
      'Ouvrir le comptoir',
      () => this.ouvrir(),
      { color: PAL.vertMuted }
    );

    // Build a dim mur-de-paquets for ambiance behind the card.
    const packColors = [
      PAL.rougeTabac,
      PAL.vertMuted,
      PAL.fdjRouge,
      PAL.wood,
      PAL.woodDark,
      PAL.fdjJaune,
      PAL.wallDark,
      PAL.peauOmbre,
    ];
    const shelfYs = [28, 56, 84, 112, 140];
    let i = 0;
    for (const sy of shelfYs) {
      for (let x = 4; x < VW - 14; x += 16) {
        this.packs.push({ x, y: sy - 23, color: packColors[i % packColors.length] });
        i++;
      }
    }
  }

  private ouvrir(): void {
    const cfg = configJour(this.ctx.state.jour);
    const regle = cfg.nouvelleRegle;
    if (regle && !this.ctx.state.reglesActives.some((r) => r.id === regle.id)) {
      this.ctx.state.reglesActives.push(regle);
    }
    this.ctx.goTo(new CounterScene(this.ctx));
  }

  render(r: Renderer): void {
    const cfg = configJour(this.ctx.state.jour);

    r.clear(PAL.bg);

    // Dim glimpse of the pack wall behind the briefing.
    drawPresentoir(r, this.packs);
    // 50% dither dimming so the ambiance recedes behind the paper card.
    for (let yy = 0; yy < VH; yy += 2) r.hline(0, yy, VW, PAL.ombre);

    // The paper briefing card.
    this.panel.draw(r);

    const px = this.config.panel.x;
    const py = this.config.panel.y;
    const pw = this.config.panel.w;
    const cx = px + 8;
    const cw = pw - 16;

    let y = py + 18;

    if (cfg.nouvelleRegle) {
      // Highlighted "new rule" card on the paper.
      const lines = this.wrapLines(r, cfg.nouvelleRegle.description, cw - 12);
      const cardH = 15 + lines.length * 9 + 5;
      r.rect(cx, y, cw, cardH, PAL.woodDark);
      r.stroke(cx, y, cw, cardH, PAL.fdjJaune, 1);
      r.text('NOUVELLE RÈGLE', cx + 6, y + 5, { color: PAL.fdjJaune, scale: 1, align: 'left' });
      let ly = y + 15;
      for (const line of lines) {
        r.text(line, cx + 6, ly, { color: PAL.paper, scale: 1, align: 'left' });
        ly += 9;
      }
      y += cardH + 8;
    } else {
      r.text("Pas de nouvelle règle aujourd'hui.", cx, y, {
        color: PAL.peauOmbre,
        scale: 1,
        align: 'left',
      });
      y += 14;
    }

    // Briefing / intro text (paragraphs split on newlines, then word-wrapped).
    const buttonTop = this.bouton.rect.y - 4;
    for (const para of cfg.intro.split('\n')) {
      for (const line of this.wrapLines(r, para, cw)) {
        if (y > buttonTop) break;
        r.text(line, cx, y, { color: PAL.ink, scale: 1, align: 'left' });
        y += 9;
      }
    }

    this.bouton.draw(r);
  }

  onClick(p: { x: number; y: number }): void {
    if (this.bouton.hit(p)) this.bouton.click();
  }

  /** Naive word-wrap using renderer.measure; returns the wrapped lines. */
  private wrapLines(r: Renderer, s: string, maxW: number): string[] {
    const words = s.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (r.measure(test, 1) > maxW && cur) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }
}
