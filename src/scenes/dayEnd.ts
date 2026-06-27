import type { GameContext } from '../game/types';
import type { Scene } from '../engine/stateMachine';
import type { Renderer } from '../engine/renderer';
import { Button, Panel } from '../engine/ui';
import { PAL } from '../engine/palette';
import { VW } from '../engine/layout';
import { drawCounter, drawShelf, drawCoin } from '../engine/sprites';
import { randomInspection } from '../game/consequence';
import type { GameEvent } from '../game/consequence';
import { isWeekEnd, isCampaignEnd, bankRevenue } from '../game/economy';
import { INSPECTION_DAY } from '../game/content/days';
import { WeekEndScene } from './weekEnd';
import { DayIntroScene } from './dayIntro';
import { EpilogueScene } from './epilogue';

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

// Static decorative pack wall behind the summary sheet (deterministic placement).
function buildPacks(): { x: number; y: number; color: string }[] {
  const cols = [PAL.tobaccoRed, PAL.mutedGreen, PAL.fdjYellow, PAL.wood, PAL.woodDark, PAL.fdjRed];
  const packs: { x: number; y: number; color: string }[] = [];
  const shelfStep = 28;
  let n = 0;
  for (let sy = shelfStep - 24; sy < 150 - 22; sy += shelfStep) {
    for (let x = 6; x < VW - 14; x += 16) {
      packs.push({ x, y: sy, color: cols[(n * 7 + (sy >> 2)) % cols.length] });
      n++;
    }
  }
  return packs;
}

export class DayEndScene implements Scene {
  private readonly ctx: GameContext;
  private readonly button: Button;
  private readonly packs = buildPacks();
  private events: GameEvent[] = [];
  private revenue = 0;
  private faults = 0;
  private fine = 0;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    const campaignEnd = isCampaignEnd(ctx.state.day);
    const weekEnd = isWeekEnd(ctx.state.day);
    this.button = new Button(
      { x: VW / 2 - 80, y: 248, w: 160, h: 18 },
      campaignEnd ? 'Épilogue →' : weekEnd ? 'Fin de semaine →' : 'Jour suivant →',
      () => this.continueNext(),
    );
  }

  enter(): void {
    const state = this.ctx.state;
    // Snapshot the day's takings & faults before the random inspection mutates them.
    this.revenue = state.dayRevenue;
    this.faults = state.unseenFaults.length;
    // The scripted day-28 control is the payoff of the inspection-rumor subplot:
    // it always audits everything pending, and records whether the shop came out
    // clean (story.passedInspection, tolerating a single slip) for the endings.
    const scripted = state.day === INSPECTION_DAY;
    if (scripted) {
      state.story.passedInspection = this.faults <= 1;
    }
    // Run the day's inspection exactly once here, and total the fines it returns
    // (events may be of type 'inspection' or 'fine' — sum amount either way).
    this.events = randomInspection(state, scripted);
    this.fine = this.events.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  }

  private continueNext(): void {
    const state = this.ctx.state;
    // Day 30 was the last day of the campaign -> the finale, not another day.
    if (isCampaignEnd(state.day)) {
      // No further weekly reckoning after day 28: bank the remaining (days 29-30)
      // takings into cash so the epilogue + chooseEnding reflect them.
      bankRevenue(state);
      this.ctx.goTo(new EpilogueScene(this.ctx));
    } else if (isWeekEnd(state.day)) {
      this.ctx.goTo(new WeekEndScene(this.ctx));
    } else {
      // Do NOT zero dayRevenue here: it accumulates across the week and is folded
      // into cash once, at the weekly reckoning ("Recette de la semaine").
      state.day += 1;
      this.ctx.goTo(new DayIntroScene(this.ctx));
    }
  }

  render(r: Renderer): void {
    const state = this.ctx.state;

    // --- Ambient counter backdrop, dimmed behind the summary sheet ---
    r.clear(PAL.bg);
    drawShelf(r, this.packs);
    drawCounter(r);

    // Title band across the top.
    r.text(`FIN DU JOUR ${state.day}`, VW / 2, 12, {
      color: PAL.fdjYellow,
      scale: 2,
      align: 'center',
    });

    // --- Summary paper panel ---
    const panel = { x: VW / 2 - 150, y: 32, w: 300, h: 188 };
    new Panel(panel, { title: 'Bilan', color: PAL.paper }).draw(r);

    const lx = panel.x + 12;
    const rx = panel.x + panel.w - 12;
    let y = panel.y + 22;
    const step = 22;

    const line = (label: string, value: string, color: string = PAL.ink) => {
      r.text(label, lx, y, { color: PAL.skinShadow, scale: 1, align: 'left' });
      r.text(value, rx, y, { color, scale: 1, align: 'right' });
      y += step;
    };

    // Revenue row — week-to-date takings (folded into cash at the reckoning),
    // value tinted green, with a little stack of pixel coins.
    const revenueVal = `${this.revenue.toFixed(2)} €`;
    r.text('Recette de la semaine', lx, y, { color: PAL.skinShadow, scale: 1, align: 'left' });
    r.text(revenueVal, rx, y, { color: PAL.mutedGreen, scale: 1, align: 'right' });
    const coinVals = [2, 1, 0.5];
    let cx = rx - r.measure(revenueVal, 1) - 8 - 14;
    for (const v of coinVals) {
      drawCoin(r, cx, y - 4, v);
      cx -= 9;
    }
    y += step;

    line(
      'Avertissements',
      `${state.warnings}`,
      state.warnings > 0 ? PAL.fdjYellow : PAL.ink,
    );
    line('Fautes non vues', `${this.faults}`, this.faults > 0 ? PAL.fdjYellow : PAL.ink);
    line(
      'Contrôle / amende',
      this.fine > 0 ? `-${this.fine.toFixed(2)} €` : '—',
      this.fine > 0 ? PAL.tobaccoRed : PAL.ink,
    );

    // Divider rule under the figures.
    r.hline(panel.x + 8, y - 6, panel.w - 16, PAL.skinShadow);

    // --- Inspection events log ---
    let ey = y + 2;
    if (this.events.length === 0) {
      r.text("Aucun controle aujourd'hui.", VW / 2, ey, {
        color: PAL.skinShadow,
        scale: 1,
        align: 'center',
      });
    } else {
      const maxY = panel.y + panel.h - 10;
      const maxChars = Math.max(8, Math.floor((panel.w - 20) / 6));
      for (const e of this.events) {
        const wrapped = wrapText(`- ${e.message}`, maxChars);
        for (let i = 0; i < wrapped.length; i++) {
          if (ey > maxY) break;
          // Indent continuation lines so the bullet stays readable.
          const x = panel.x + 10 + (i === 0 ? 0 : 6);
          r.text(wrapped[i], x, ey, { color: PAL.ink, scale: 1, align: 'left' });
          ey += 9;
        }
        if (ey > maxY) break;
        ey += 2;
      }
    }

    this.button.draw(r);
  }

  onClick(p: { x: number; y: number }): void {
    if (this.button.hit(p)) this.button.click();
  }
}
