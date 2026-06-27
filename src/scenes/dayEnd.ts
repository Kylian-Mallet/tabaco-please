import type { GameContext } from '../game/types';
import type { Scene } from '../engine/stateMachine';
import type { Renderer } from '../engine/renderer';
import { Button, Panel } from '../engine/ui';
import { PAL } from '../engine/palette';
import { VW } from '../engine/layout';
import { drawComptoir, drawPresentoir, drawPiece } from '../engine/sprites';
import { controleAleatoire } from '../game/consequence';
import type { Evt } from '../game/consequence';
import { estFinSemaine } from '../game/economy';
import { WeekEndScene } from './weekEnd';
import { DayIntroScene } from './dayIntro';

// Static decorative pack wall behind the bilan sheet (deterministic placement).
function buildPacks(): { x: number; y: number; color: string }[] {
  const cols = [PAL.rougeTabac, PAL.vertMuted, PAL.fdjJaune, PAL.wood, PAL.woodDark, PAL.fdjRouge];
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
  private readonly bouton: Button;
  private readonly packs = buildPacks();
  private evenements: Evt[] = [];
  private recette = 0;
  private fautes = 0;
  private amende = 0;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    const finSemaine = estFinSemaine(ctx.state.jour);
    this.bouton = new Button(
      { x: VW / 2 - 80, y: 248, w: 160, h: 18 },
      finSemaine ? 'Fin de semaine →' : 'Jour suivant →',
      () => this.continuer(),
    );
  }

  enter(): void {
    const state = this.ctx.state;
    // Snapshot the day's takings & faults before the random inspection mutates them.
    this.recette = state.recetteDuJour;
    this.fautes = state.fautesNonVues.length;
    // Run the day's inspection exactly once here, and total the fines it returns
    // (events may be of type 'controle' or 'amende' — sum montant either way).
    this.evenements = controleAleatoire(state);
    this.amende = this.evenements.reduce((sum, e) => sum + (e.montant ?? 0), 0);
  }

  private continuer(): void {
    const state = this.ctx.state;
    if (estFinSemaine(state.jour)) {
      this.ctx.goTo(new WeekEndScene(this.ctx));
    } else {
      state.jour += 1;
      state.recetteDuJour = 0;
      this.ctx.goTo(new DayIntroScene(this.ctx));
    }
  }

  render(r: Renderer): void {
    const state = this.ctx.state;

    // --- Ambient comptoir backdrop, dimmed behind the bilan sheet ---
    r.clear(PAL.bg);
    drawPresentoir(r, this.packs);
    drawComptoir(r);

    // Title band across the top.
    r.text(`FIN DU JOUR ${state.jour}`, VW / 2, 12, {
      color: PAL.fdjJaune,
      scale: 2,
      align: 'center',
    });

    // --- Bilan paper panel ---
    const panel = { x: VW / 2 - 150, y: 32, w: 300, h: 188 };
    new Panel(panel, { title: 'Bilan', color: PAL.paper }).draw(r);

    const lx = panel.x + 12;
    const rx = panel.x + panel.w - 12;
    let y = panel.y + 22;
    const step = 22;

    const ligne = (label: string, value: string, color: string = PAL.ink) => {
      r.text(label, lx, y, { color: PAL.peauOmbre, scale: 1, align: 'left' });
      r.text(value, rx, y, { color, scale: 1, align: 'right' });
      y += step;
    };

    // Recette row — value tinted green, with a little stack of pixel coins.
    const recetteVal = `${this.recette.toFixed(2)} €`;
    r.text('Recette du jour', lx, y, { color: PAL.peauOmbre, scale: 1, align: 'left' });
    r.text(recetteVal, rx, y, { color: PAL.vertMuted, scale: 1, align: 'right' });
    const coinVals = [2, 1, 0.5];
    let cx = rx - r.measure(recetteVal, 1) - 8 - 14;
    for (const v of coinVals) {
      drawPiece(r, cx, y - 4, v);
      cx -= 9;
    }
    y += step;

    ligne(
      'Avertissements',
      `${state.avertissements}`,
      state.avertissements > 0 ? PAL.fdjJaune : PAL.ink,
    );
    ligne('Fautes non vues', `${this.fautes}`, this.fautes > 0 ? PAL.fdjJaune : PAL.ink);
    ligne(
      'Contrôle / amende',
      this.amende > 0 ? `-${this.amende.toFixed(2)} €` : '—',
      this.amende > 0 ? PAL.rougeTabac : PAL.ink,
    );

    // Divider rule under the figures.
    r.hline(panel.x + 8, y - 6, panel.w - 16, PAL.peauOmbre);

    // --- Inspection events log ---
    let ey = y + 2;
    if (this.evenements.length === 0) {
      r.text("Aucun controle aujourd'hui.", VW / 2, ey, {
        color: PAL.peauOmbre,
        scale: 1,
        align: 'center',
      });
    } else {
      const maxY = panel.y + panel.h - 10;
      for (const e of this.evenements) {
        if (ey > maxY) break;
        r.text(`- ${e.message}`, panel.x + 10, ey, {
          color: PAL.ink,
          scale: 1,
          align: 'left',
        });
        ey += 10;
      }
    }

    this.bouton.draw(r);
  }

  onClick(p: { x: number; y: number }): void {
    if (this.bouton.hit(p)) this.bouton.click();
  }
}
