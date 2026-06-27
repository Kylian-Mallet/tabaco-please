// WeekEndScene — "le couperet": fold the week's recette into trésorerie,
// then deduct LOYER + COMMANDE_FOURNISSEUR. Faillite -> GameOver,
// else continue -> next day's DayIntro.

import type { Scene } from '../engine/stateMachine';
import type { Renderer } from '../engine/renderer';
import type { GameContext } from '../game/types';
import { LOYER, COMMANDE_FOURNISSEUR } from '../game/types';
import { couperetSemaine } from '../game/economy';
import { Button, Panel } from '../engine/ui';
import { PAL } from '../engine/palette';
import { VW } from '../engine/layout';
import { DayIntroScene } from './dayIntro';
import { GameOverScene } from './gameOver';

export class WeekEndScene implements Scene {
  private readonly ctx: GameContext;

  // Captured snapshot of the books for display, set in enter().
  private recetteSemaine = 0;
  private tresorerieAvant = 0;
  private tresorerieApres = 0;
  private faillite = false;
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
    // Snapshot pre-couperet figures for the bilan (recette folds into trésorerie).
    this.recetteSemaine = state.recetteDuJour;
    this.tresorerieAvant = state.tresorerie;

    const res = couperetSemaine(state);
    this.faillite = res.faillite;
    this.detail = res.detail;
    this.tresorerieApres = state.tresorerie;

    this.panel = new Panel(this.panelRect, { title: 'COMPTES DU BUREAU DE TABAC' });

    const btnRect = { x: VW / 2 - 92, y: 246, w: 184, h: 20 };
    if (this.faillite) {
      this.buttons.push(
        new Button(btnRect, 'FERMETURE DÉFINITIVE', () => {
          this.ctx.goTo(new GameOverScene(this.ctx));
        }, { color: PAL.rougeTabac })
      );
    } else {
      this.buttons.push(
        new Button(btnRect, 'SEMAINE SUIVANTE', () => {
          state.jour += 1;
          this.ctx.goTo(new DayIntroScene(this.ctx));
        }, { color: PAL.vertMuted })
      );
    }
  }

  render(r: Renderer): void {
    // --- Dramatic dim backdrop -------------------------------------------
    r.clear(PAL.bg);
    // Faint tobacco-brown haze in the middle so the plaque sits in a pool of light.
    r.rect(0, 30, VW, 200, PAL.ombre);
    r.rect(20, 44, VW - 40, 172, PAL.woodDark);
    // Top + bottom shadow bands frame the screen.
    for (let i = 0; i < 6; i++) {
      if (i % 2 === 0) {
        r.hline(0, i, VW, PAL.bg);
        r.hline(0, 28 - i, VW, PAL.ombre);
      }
    }

    // --- Title -----------------------------------------------------------
    r.text('LE COUPERET', VW / 2, 10, {
      color: PAL.fdjJaune,
      scale: 2,
      align: 'center',
    });
    r.text('BILAN DE FIN DE SEMAINE', VW / 2, 32, {
      color: PAL.peau,
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
    const line = (label: string, value: string, color: string = PAL.blancCasse) => {
      r.text(label, lx, y, { color: PAL.peau, scale: 1, align: 'left' });
      r.text(value, rx, y, { color, scale: 1, align: 'right' });
      y += 18;
    };

    line('Trésorerie début', euros(this.tresorerieAvant));
    line('Recette de la semaine', '+ ' + euros(this.recetteSemaine), PAL.vertMuted);
    line('Loyer du local', '- ' + euros(LOYER), PAL.rougeTabac);
    line('Commande fournisseur', '- ' + euros(COMMANDE_FOURNISSEUR), PAL.rougeTabac);

    // Separator rule (hard pixel edges).
    r.hline(lx, y - 4, rx - lx, PAL.ink);
    r.hline(lx, y - 3, rx - lx, PAL.woodLight);
    y += 6;

    // Solde — the bottom line.
    const soldeColor = this.tresorerieApres < 0 ? PAL.rougeTabac : PAL.vertMuted;
    r.text('SOLDE', lx, y, { color: PAL.blancCasse, scale: 1, align: 'left' });
    r.text(euros(this.tresorerieApres), rx, y, {
      color: soldeColor,
      scale: 1,
      align: 'right',
    });

    // --- Verdict banner --------------------------------------------------
    const verdict = this.faillite ? 'FAILLITE' : 'SEMAINE BOUCLÉE';
    const vColor = this.faillite ? PAL.rougeTabac : PAL.vertMuted;
    const bannerY = py + this.panelRect.h + 6;
    const bw = r.measure(verdict, 2) + 16;
    const bx = Math.round(VW / 2 - bw / 2);
    r.rect(bx, bannerY, bw, 16, PAL.ink);
    r.stroke(bx, bannerY, bw, 16, vColor, 1);
    r.text(verdict, VW / 2, bannerY + 2, { color: vColor, scale: 2, align: 'center' });

    if (this.detail) {
      r.text(this.detail, VW / 2, bannerY + 22, {
        color: PAL.peau,
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
