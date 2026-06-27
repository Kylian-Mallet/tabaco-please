import type { GameContext, ClientLook } from '../game/types';
import type { Scene } from '../engine/stateMachine';
import type { Renderer } from '../engine/renderer';
import { VW, VH } from '../engine/renderer';
import { PAL } from '../engine/palette';
import { Button, Panel } from '../engine/ui';
import { drawClient } from '../engine/sprites';
import { playSfx } from '../engine/sfx';
import { DayIntroScene } from './dayIntro';

/** Hard cap on the typed seller name. */
const MAX_NAME = 16;

/** The first cards set the scene; the rest brief the player on the mechanics. */
const SCENE_CARD_COUNT = 3;

/** Scripted intro cards (FR) — scene-setting, then a how-it-works briefing. */
const INTRO_CARDS: string[] = [
  // --- Scene (0..SCENE_CARD_COUNT-1) ---
  "Aussonne, Haute-Garonne. Aux portes de la métropole toulousaine, le tabac-presse du centre cherche un repreneur. C'est vous.",
  "L'État vous nomme préposé au guichet : tabac, presse, jeux. Vous encaissez, vous rendez la monnaie, vous faites respecter la loi.",
  "Un mois d'essai. 30 jours pour faire vos preuves... ou mettre la clé sous la porte. Bonne chance, préposé.",
  // --- Mechanics briefing ---
  "AU COMPTOIR. Chaque client demande un produit : à vous de VENDRE ou de REFUSER. Sur une vente, encaissez et rendez la monnaie au centime près — la caisse doit toujours tomber juste.",
  "LES PAPIERS (le froid). Tabac, alcool et jeux sont interdits aux moins de 18  ans : demandez la CARTE D'IDENTITÉ et vérifiez la date de naissance. Les interdits de jeu figurent au FICHIER : recoupez le nom.",
  "LE FLAIR (le chaud). L'ivresse ne se lit sur aucun papier : observez le client avant de servir de l'alcool. Et s'il réclame un produit qu'on n'a pas, vous pouvez REFUSER... ou BLUFFER en refourguant autre chose, s'il ne vous crame pas.",
  "L'AUTORITÉ. Un client refusé peut s'entêter et faire un esclandre. Vous pouvez APPELER LA POLICE — mais à bon escient : la lancer sur un client légitime, c'est un abus de pouvoir qui ternit votre réputation.",
  "AU FIL DU MOIS. De nouvelles règles, de nouveaux rayons (CBD, presse, vape) et les PARIS SPORTIFS au terminal FDJ se débloquent semaine après semaine. Tenez 30 jours et soignez vos comptes.",
];

// Avatar trait options (PAL colors only). Indices map 1:1 to ClientLook fields.
const SKINS: string[] = [PAL.skin, PAL.skinShadow, PAL.wood, PAL.paper];
const HAIRS: string[] = [PAL.woodDark, PAL.ink, PAL.wood, PAL.fdjYellow, PAL.tobaccoRed, PAL.offWhite];
const COATS: string[] = [PAL.franceBlue, PAL.wallDark, PAL.mutedGreen, PAL.tobaccoRed, PAL.woodDark];
const HATS: NonNullable<ClientLook['hat']>[] = ['none', 'cap', 'hat', 'beanie'];
const HAT_LABELS: string[] = ['Aucun', 'Casquette', 'Chapeau', 'Bonnet'];
const TRAIT_LABELS: string[] = ['Peau', 'Cheveux', 'Manteau', 'Chapeau', 'Barbe'];

/**
 * OnboardingScene — new-game setup in three short steps:
 *   0) intro cards (click/keys to advance),
 *   1) name entry (scene-local window keydown listener),
 *   2) avatar customizer (cycle ClientLook traits, live drawClient preview).
 * Leaving the scene (Commencer) stores playerName + sellerLook and opens the
 * first day. The keydown listener is removed on teardown.
 */
export class OnboardingScene implements Scene {
  private readonly ctx: GameContext;
  private readonly panel: Panel;

  /** 0 = intro, 1 = name, 2 = avatar. */
  private step = 0;
  private cardIdx = 0;

  /** Typed seller name + blinking caret timer. */
  private name = '';
  private caretT = 0;

  /** Avatar trait selection indices [skin, hair, coat, hat, beard]. */
  private readonly idx: number[];
  private readonly counts = [SKINS.length, HAIRS.length, COATS.length, HATS.length, 2];

  private readonly suivant: Button;
  private readonly valider: Button;
  private readonly commencer: Button;
  private readonly leftBtns: Button[] = [];
  private readonly rightBtns: Button[] = [];

  /** Bound so add/removeEventListener reference the same function. */
  private readonly keyHandler = (e: KeyboardEvent): void => this.onKey(e);

  // Avatar layout constants (shared by render + buttons).
  private static readonly ROW_Y0 = 86;
  private static readonly ROW_DY = 26;
  private static readonly CTRL_X = 230;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.panel = new Panel({ x: 50, y: 34, w: 380, h: 202 }, { color: PAL.woodDark });

    // Seed the avatar selection from the current sellerLook (default otherwise).
    const look = ctx.state.sellerLook ?? {};
    this.idx = [
      Math.max(0, SKINS.indexOf(look.skin ?? SKINS[0])),
      Math.max(0, HAIRS.indexOf(look.hair ?? HAIRS[0])),
      Math.max(0, COATS.indexOf(look.coat ?? COATS[0])),
      Math.max(0, HATS.indexOf(look.hat ?? HATS[0])),
      look.beard ? 1 : 0,
    ];

    this.suivant = new Button(
      { x: VW / 2 - 60, y: 206, w: 120, h: 22 },
      'Suivant',
      () => this.advanceIntro(),
      { color: PAL.tobaccoRed }
    );
    this.valider = new Button(
      { x: VW / 2 - 60, y: 206, w: 120, h: 22 },
      'Valider',
      () => this.confirmName(),
      { color: PAL.mutedGreen }
    );
    this.commencer = new Button(
      { x: VW / 2 - 60, y: 210, w: 120, h: 22 },
      'Commencer',
      () => this.commence(),
      { color: PAL.mutedGreen }
    );

    // Build the ◀ ▶ pixel buttons for each avatar trait row.
    for (let t = 0; t < TRAIT_LABELS.length; t++) {
      const y = OnboardingScene.ROW_Y0 + t * OnboardingScene.ROW_DY;
      this.leftBtns.push(
        new Button({ x: OnboardingScene.CTRL_X, y, w: 16, h: 16 }, '<', () => this.cycle(t, -1), {
          color: PAL.wood,
        })
      );
      this.rightBtns.push(
        new Button({ x: OnboardingScene.CTRL_X + 130, y, w: 16, h: 16 }, '>', () => this.cycle(t, 1), {
          color: PAL.wood,
        })
      );
    }
  }

  enter(): void {
    window.addEventListener('keydown', this.keyHandler);
  }

  /** Removes the window keydown listener whichever way the scene is left. */
  exit(): void {
    this.teardown();
  }

  private teardown(): void {
    window.removeEventListener('keydown', this.keyHandler);
  }

  // --- step transitions ------------------------------------------------------

  private advanceIntro(): void {
    playSfx('click');
    if (this.cardIdx < INTRO_CARDS.length - 1) this.cardIdx++;
    else this.step = 1;
  }

  private confirmName(): void {
    if (this.name.trim().length === 0) return;
    playSfx('click');
    this.step = 2;
  }

  private cycle(trait: number, dir: number): void {
    playSfx('click');
    const n = this.counts[trait];
    this.idx[trait] = (this.idx[trait] + dir + n) % n;
  }

  private currentLook(): ClientLook {
    return {
      skin: SKINS[this.idx[0]],
      hair: HAIRS[this.idx[1]],
      coat: COATS[this.idx[2]],
      hat: HATS[this.idx[3]],
      beard: this.idx[4] === 1,
    };
  }

  private commence(): void {
    playSfx('click');
    this.ctx.state.playerName = this.name.trim();
    this.ctx.state.sellerLook = this.currentLook();
    this.teardown();
    this.ctx.goTo(new DayIntroScene(this.ctx));
  }

  // --- keyboard --------------------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    if (this.step === 0) {
      if (e.key === 'Enter' || e.key === ' ') {
        this.advanceIntro();
        e.preventDefault();
      }
      return;
    }
    if (this.step !== 1) return;

    if (e.key === 'Enter') {
      this.confirmName();
      e.preventDefault();
      return;
    }
    if (e.key === 'Backspace') {
      this.name = this.name.slice(0, -1);
      e.preventDefault();
      return;
    }
    // Accept a single printable name character (letters, digits, space, - ').
    if (e.key.length === 1 && this.name.length < MAX_NAME && /[A-Za-z0-9À-ÿ '-]/.test(e.key)) {
      this.name += e.key;
    }
  }

  update(dt: number): void {
    this.caretT += dt;
  }

  // --- render ----------------------------------------------------------------

  render(r: Renderer): void {
    r.clear(PAL.bg);
    // Soft vignette band behind the card.
    r.rect(0, 0, VW, VH, PAL.shadow);
    this.panel.draw(r);

    if (this.step === 0) this.renderIntro(r);
    else if (this.step === 1) this.renderName(r);
    else this.renderAvatar(r);
  }

  private renderIntro(r: Renderer): void {
    const title = this.cardIdx < SCENE_CARD_COUNT ? "MOIS D'ESSAI" : 'COMMENT ÇA MARCHE';
    r.text(title, VW / 2, 48, { color: PAL.fdjYellow, scale: 2, align: 'center' });

    const cx = 70;
    const cw = 340;
    let y = 92;
    for (const line of this.wrap(r, INTRO_CARDS[this.cardIdx], cw)) {
      r.text(line, cx, y, { color: PAL.paper, scale: 1, align: 'left' });
      y += 12;
    }

    r.text(`${this.cardIdx + 1}/${INTRO_CARDS.length}`, VW / 2, 190, {
      color: PAL.skinShadow,
      scale: 1,
      align: 'center',
    });
    this.suivant.draw(r);
  }

  private renderName(r: Renderer): void {
    r.text('VOTRE NOM, PRÉPOSÉ ?', VW / 2, 64, { color: PAL.fdjYellow, scale: 1, align: 'center' });

    // Text field box.
    const fx = 110;
    const fy = 110;
    const fw = 260;
    const fh = 26;
    r.rect(fx, fy, fw, fh, PAL.paper);
    r.stroke(fx, fy, fw, fh, PAL.ink, 1);
    r.hline(fx + 1, fy + 1, fw - 2, PAL.offWhite);

    const tx = fx + 8;
    const ty = fy + fh / 2 - 6;
    r.text(this.name, tx, ty, { color: PAL.ink, scale: 2, align: 'left' });

    // Blinking caret after the typed text.
    if (this.caretT % 1 < 0.5) {
      const caretX = tx + r.measure(this.name, 2) + 1;
      r.rect(caretX, ty, 2, 12, PAL.ink);
    }

    r.text('(Entrée pour valider)', VW / 2, 162, {
      color: PAL.skinShadow,
      scale: 1,
      align: 'center',
    });

    this.valider.disabled = this.name.trim().length === 0;
    this.valider.draw(r);
  }

  private renderAvatar(r: Renderer): void {
    const name = this.ctx.state.playerName || this.name.trim();
    r.text('VOTRE ALLURE', VW / 2, 48, { color: PAL.fdjYellow, scale: 2, align: 'center' });

    // Live bust preview (left side).
    const px = 120;
    const py = 110;
    r.rect(px - 36, py - 18, 72, 86, PAL.wallDark);
    r.stroke(px - 36, py - 18, 72, 86, PAL.ink, 1);
    drawClient(r, px, py, { look: this.currentLook() });
    if (name) {
      r.text(name, px, py + 72, { color: PAL.paper, scale: 1, align: 'center' });
    }

    // Trait rows with ◀ value ▶ controls.
    for (let t = 0; t < TRAIT_LABELS.length; t++) {
      const y = OnboardingScene.ROW_Y0 + t * OnboardingScene.ROW_DY;
      r.text(TRAIT_LABELS[t], OnboardingScene.CTRL_X, y - 10, {
        color: PAL.offWhite,
        scale: 1,
        align: 'left',
      });
      this.leftBtns[t].draw(r);
      this.rightBtns[t].draw(r);

      // Value display, centered between the two arrows.
      const valX = OnboardingScene.CTRL_X + 18;
      const valW = 110;
      this.drawTraitValue(r, t, valX, y, valW);
    }

    this.commencer.draw(r);
  }

  /** Render the current value for a trait row (color swatch / label). */
  private drawTraitValue(r: Renderer, trait: number, x: number, y: number, w: number): void {
    if (trait <= 2) {
      // Color swatch (skin / hair / coat).
      const colors = trait === 0 ? SKINS : trait === 1 ? HAIRS : COATS;
      const col = colors[this.idx[trait]];
      const sw = 40;
      const sx = x + (w - sw) / 2;
      r.rect(sx, y, sw, 14, col);
      r.stroke(sx, y, sw, 14, PAL.ink, 1);
    } else {
      const label = trait === 3 ? HAT_LABELS[this.idx[3]] : this.idx[4] === 1 ? 'Oui' : 'Non';
      r.text(label, x + w / 2, y + 4, { color: PAL.paper, scale: 1, align: 'center' });
    }
  }

  // --- input -----------------------------------------------------------------

  onClick(p: { x: number; y: number }): void {
    if (this.step === 0) {
      // Click the button or anywhere on the card to advance.
      this.advanceIntro();
      return;
    }
    if (this.step === 1) {
      if (this.valider.hit(p)) this.valider.click();
      return;
    }
    for (let t = 0; t < TRAIT_LABELS.length; t++) {
      if (this.leftBtns[t].hit(p)) {
        this.leftBtns[t].click();
        return;
      }
      if (this.rightBtns[t].hit(p)) {
        this.rightBtns[t].click();
        return;
      }
    }
    if (this.commencer.hit(p)) this.commencer.click();
  }

  /** Naive word-wrap using the bitmap font advance. */
  private wrap(r: Renderer, s: string, maxW: number): string[] {
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
