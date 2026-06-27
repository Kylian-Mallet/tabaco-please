import type { GameContext } from '../game/types';
import type { Scene } from '../engine/stateMachine';
import type { Renderer } from '../engine/renderer';
import { Button, Panel } from '../engine/ui';
import { PAL } from '../engine/palette';
import { VW, VH } from '../engine/layout';
import { drawShelf } from '../engine/sprites';
import { Tween, Ease } from '../engine/tween';
import { dayConfig } from '../game/content/days';
import { save } from '../engine/save';
import { CounterScene } from './counter';

/**
 * DayIntroScene — daily briefing.
 * Shows the DayConfig for the current day: a rule card with the newly unlocked
 * rule's description (if any) plus the day's intro text. The "Ouvrir le comptoir"
 * button activates the new rule (idempotent) and moves to CounterScene.
 */
export class DayIntroScene implements Scene {
  private readonly ctx: GameContext;
  private readonly config = { panel: { x: 80, y: 40, w: 320, h: 180 } };
  private readonly panel: Panel;
  private readonly button: Button;
  /** Ambient pack wall behind the briefing card. */
  private readonly packs: { x: number; y: number; color: string }[] = [];

  // Slide-in animation: the whole briefing block drops from above the screen
  // (easeOutBack overshoot), and the NOUVELLE RÈGLE card pops a touch after.
  private slideY = 0;
  private cardOffset = 0;
  private ready = false;
  private readonly slideTween: Tween;
  private readonly cardTween: Tween;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    const cfg = dayConfig(ctx.state.day);
    const p = this.config.panel;
    this.panel = new Panel(
      { x: p.x, y: p.y, w: p.w, h: p.h },
      { title: `Jour ${cfg.day}`, color: PAL.paper }
    );
    this.button = new Button(
      { x: p.x + p.w / 2 - 70, y: p.y + p.h - 28, w: 140, h: 20 },
      'Ouvrir le comptoir',
      () => this.openCounter(),
      { color: PAL.mutedGreen }
    );

    // Build a dim pack wall for ambiance behind the card.
    const packColors = [
      PAL.tobaccoRed,
      PAL.mutedGreen,
      PAL.fdjRed,
      PAL.wood,
      PAL.woodDark,
      PAL.fdjYellow,
      PAL.wallDark,
      PAL.skinShadow,
    ];
    const shelfYs = [28, 56, 84, 112, 140];
    let i = 0;
    for (const sy of shelfYs) {
      for (let x = 4; x < VW - 14; x += 16) {
        this.packs.push({ x, y: sy - 23, color: packColors[i % packColors.length] });
        i++;
      }
    }

    // Briefing card drops from fully above the screen down to its resting spot.
    this.slideY = -(p.y + p.h);
    this.slideTween = new Tween({
      from: -(p.y + p.h),
      to: 0,
      duration: 0.45,
      easing: Ease.easeOutBack,
      snap: true,
      onUpdate: (v) => {
        this.slideY = v;
      },
    });
    // The rule card pops in slightly once the card has nearly landed.
    this.cardOffset = -9;
    this.cardTween = new Tween({
      from: -9,
      to: 0,
      duration: 0.35,
      delay: 0.3,
      easing: Ease.easeOutBack,
      snap: true,
      onUpdate: (v) => {
        this.cardOffset = v;
      },
      // Enable clicks only once the LATER-finishing card pop has settled, so a
      // fast click can't open the counter while the rule card is still popping.
      onComplete: () => {
        this.ready = true;
      },
    });
  }

  /** Auto-save at the start of every day (the natural campaign checkpoint). */
  enter(): void {
    save(this.ctx.state);
  }

  update(dt: number): void {
    this.slideTween.update(dt);
    this.cardTween.update(dt);
  }

  private openCounter(): void {
    const cfg = dayConfig(this.ctx.state.day);
    const rule = cfg.newRule;
    if (rule && !this.ctx.state.activeRules.some((r) => r.id === rule.id)) {
      this.ctx.state.activeRules.push(rule);
    }
    this.ctx.goTo(new CounterScene(this.ctx));
  }

  render(r: Renderer): void {
    const cfg = dayConfig(this.ctx.state.day);

    r.clear(PAL.bg);

    // Dim glimpse of the pack wall behind the briefing.
    drawShelf(r, this.packs);
    // 50% dither dimming so the ambiance recedes behind the paper card.
    for (let yy = 0; yy < VH; yy += 2) r.hline(0, yy, VW, PAL.shadow);

    // Everything below slides in together from the top.
    r.ctx.save();
    r.ctx.translate(0, this.slideY);

    // The paper briefing card.
    this.panel.draw(r);

    const px = this.config.panel.x;
    const py = this.config.panel.y;
    const pw = this.config.panel.w;
    const cx = px + 8;
    const cw = pw - 16;

    let y = py + 18;

    if (cfg.newRule) {
      // Highlighted "new rule" card on the paper; pops in with a small offset.
      const lines = this.wrapLines(r, cfg.newRule.description, cw - 12);
      const cardH = 15 + lines.length * 9 + 5;
      const cy = y + this.cardOffset;
      r.rect(cx, cy, cw, cardH, PAL.woodDark);
      r.stroke(cx, cy, cw, cardH, PAL.fdjYellow, 1);
      r.text('NOUVELLE RÈGLE', cx + 6, cy + 5, { color: PAL.fdjYellow, scale: 1, align: 'left' });
      let ly = cy + 15;
      for (const line of lines) {
        r.text(line, cx + 6, ly, { color: PAL.paper, scale: 1, align: 'left' });
        ly += 9;
      }
      y += cardH + 8;
    } else {
      r.text("Pas de nouvelle règle aujourd'hui.", cx, y, {
        color: PAL.skinShadow,
        scale: 1,
        align: 'left',
      });
      y += 14;
    }

    // Briefing / intro text (paragraphs split on newlines, then word-wrapped).
    const buttonTop = this.button.rect.y - 4;
    for (const para of cfg.intro.split('\n')) {
      for (const line of this.wrapLines(r, para, cw)) {
        if (y > buttonTop) break;
        r.text(line, cx, y, { color: PAL.ink, scale: 1, align: 'left' });
        y += 9;
      }
    }

    this.button.draw(r);

    r.ctx.restore();
  }

  onClick(p: { x: number; y: number }): void {
    // Ignore clicks until the card has settled (button sits at its final spot).
    if (!this.ready) return;
    if (this.button.hit(p)) this.button.click();
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
