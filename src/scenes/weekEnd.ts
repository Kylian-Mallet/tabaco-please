// WeekEndScene — "the reckoning": fold the week's revenue into the cash balance,
// then deduct RENT + SUPPLIER_ORDER. Bankruptcy -> GameOver,
// else continue -> next day's DayIntro.

import type { Scene } from '../engine/stateMachine';
import type { Renderer } from '../engine/renderer';
import type { GameContext } from '../game/types';
import { RENT, SUPPLIER_ORDER } from '../game/types';
import { weeklyReckoning, isCampaignEnd } from '../game/economy';
import { Button, Panel } from '../engine/ui';
import { PAL } from '../engine/palette';
import { VW } from '../engine/layout';
import { DayIntroScene } from './dayIntro';
import { GameOverScene } from './gameOver';
import { EpilogueScene } from './epilogue';

export class WeekEndScene implements Scene {
  private readonly ctx: GameContext;

  // Captured snapshot of the books for display, set in enter().
  private weekRevenue = 0;
  private cashBefore = 0;
  private cashAfter = 0;
  private bankrupt = false;
  private detail = '';

  private readonly buttons: Button[] = [];
  private panel!: Panel;

  // Paper ledger plaque geometry (480x270 space).
  private readonly panelRect = { x: VW / 2 - 150, y: 50, w: 300, h: 152 };

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  enter(): void {
    const state = this.ctx.state;
    // Snapshot pre-reckoning figures for the summary (revenue folds into cash).
    this.weekRevenue = state.dayRevenue;
    this.cashBefore = state.cash;

    const res = weeklyReckoning(state);
    this.bankrupt = res.bankrupt;
    this.detail = res.detail;
    this.cashAfter = state.cash;

    this.panel = new Panel(this.panelRect, { title: 'COMPTES DU BUREAU DE TABAC' });

    const btnRect = { x: VW / 2 - 92, y: 246, w: 184, h: 20 };
    if (this.bankrupt) {
      this.buttons.push(
        new Button(btnRect, 'FERMETURE DÉFINITIVE', () => {
          this.ctx.goTo(new GameOverScene(this.ctx));
        }, { color: PAL.tobaccoRed })
      );
    } else {
      this.buttons.push(
        new Button(btnRect, 'SEMAINE SUIVANTE', () => {
          // Defensive: if this reckoning closed the final campaign day, go to the
          // finale rather than rolling into another week.
          if (isCampaignEnd(state.day)) {
            this.ctx.goTo(new EpilogueScene(this.ctx));
            return;
          }
          state.day += 1;
          this.ctx.goTo(new DayIntroScene(this.ctx));
        }, { color: PAL.mutedGreen })
      );
    }
  }

  render(r: Renderer): void {
    // --- Dramatic dim backdrop -------------------------------------------
    r.clear(PAL.bg);
    // Faint tobacco-brown haze in the middle so the plaque sits in a pool of light.
    r.rect(0, 30, VW, 200, PAL.shadow);
    r.rect(20, 44, VW - 40, 172, PAL.woodDark);
    // Top + bottom shadow bands frame the screen.
    for (let i = 0; i < 6; i++) {
      if (i % 2 === 0) {
        r.hline(0, i, VW, PAL.bg);
        r.hline(0, 28 - i, VW, PAL.shadow);
      }
    }

    // --- Title -----------------------------------------------------------
    r.text('LE COUPERET', VW / 2, 10, {
      color: PAL.fdjYellow,
      scale: 2,
      align: 'center',
    });
    r.text('BILAN DE FIN DE SEMAINE', VW / 2, 32, {
      color: PAL.skin,
      scale: 1,
      align: 'center',
    });

    // --- Ledger plaque ---------------------------------------------------
    this.panel.draw(r);

    const px = this.panelRect.x;
    const py = this.panelRect.y;
    const pw = this.panelRect.w;
    const lx = px + 12;
    const rx = px + pw - 12;

    let y = py + 22;
    const line = (label: string, value: string, color: string = PAL.offWhite) => {
      r.text(label, lx, y, { color: PAL.skin, scale: 1, align: 'left' });
      r.text(value, rx, y, { color, scale: 1, align: 'right' });
      y += 18;
    };

    line('Trésorerie début', euros(this.cashBefore));
    line('Recette de la semaine', '+ ' + euros(this.weekRevenue), PAL.mutedGreen);
    line('Loyer du local', '- ' + euros(RENT), PAL.tobaccoRed);
    line('Commande fournisseur', '- ' + euros(SUPPLIER_ORDER), PAL.tobaccoRed);

    // Separator rule (hard pixel edges).
    r.hline(lx, y - 4, rx - lx, PAL.ink);
    r.hline(lx, y - 3, rx - lx, PAL.woodLight);
    y += 6;

    // Balance — the bottom line.
    const balanceColor = this.cashAfter < 0 ? PAL.tobaccoRed : PAL.mutedGreen;
    r.text('SOLDE', lx, y, { color: PAL.offWhite, scale: 1, align: 'left' });
    r.text(euros(this.cashAfter), rx, y, {
      color: balanceColor,
      scale: 1,
      align: 'right',
    });

    // --- Verdict banner --------------------------------------------------
    const verdict = this.bankrupt ? 'FAILLITE' : 'SEMAINE BOUCLÉE';
    const vColor = this.bankrupt ? PAL.tobaccoRed : PAL.mutedGreen;
    const bannerY = py + this.panelRect.h + 6;
    const bw = r.measure(verdict, 2) + 16;
    const bx = Math.round(VW / 2 - bw / 2);
    r.rect(bx, bannerY, bw, 16, PAL.ink);
    r.stroke(bx, bannerY, bw, 16, vColor, 1);
    r.text(verdict, VW / 2, bannerY + 2, { color: vColor, scale: 2, align: 'center' });

    if (this.detail) {
      r.text(this.detail, VW / 2, bannerY + 22, {
        color: PAL.skin,
        scale: 1,
        align: 'center',
      });
    }

    for (const b of this.buttons) b.draw(r);
  }

  onClick(p: { x: number; y: number }): void {
    for (const b of this.buttons) {
      if (b.hit(p)) {
        b.click();
        return;
      }
    }
  }
}

function euros(n: number): string {
  return `${n.toFixed(2)} €`;
}
