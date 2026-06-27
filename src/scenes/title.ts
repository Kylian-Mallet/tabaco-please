import type { GameContext } from '../game/types';
import type { Scene } from '../engine/stateMachine';
import type { Renderer } from '../engine/renderer';
import { VW, VH } from '../engine/renderer';
import { PAL } from '../engine/palette';
import { Button } from '../engine/ui';
import { drawCigarettePack } from '../engine/sprites';
import { load } from '../engine/save';
import { freshState } from '../main';
import { DayIntroScene } from './dayIntro';
import { OnboardingScene } from './onboarding';

// Small deterministic noise so textures look hand-placed, not random.
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

// Warm-lit pack colors for the glowing pack wall in the window.
const PACK_COLS = [
  PAL.tobaccoRed,
  PAL.mutedGreen,
  PAL.fdjYellow,
  PAL.wood,
  PAL.offWhite,
  PAL.fdjRed,
  PAL.woodLight,
];

/** Title screen: moody pixel-art facade of the tabac with a chunky Start button. */
export class TitleScene implements Scene {
  private readonly ctx: GameContext;
  private readonly newGame: Button;
  /** Present only when a saved run exists. */
  private readonly continueBtn: Button | null;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    const bw = 132;
    const bh = 20;
    const cx = Math.round((VW - bw) / 2);
    // Offer "Continuer" only when a persisted run is on disk.
    const hasSave = load() != null;

    this.continueBtn = hasSave
      ? new Button(
          { x: cx, y: 222, w: bw, h: bh },
          'CONTINUER',
          () => this.continueSaved(),
          { color: PAL.mutedGreen },
        )
      : null;

    this.newGame = new Button(
      { x: cx, y: hasSave ? 246 : 228, w: bw, h: bh },
      'NOUVELLE PARTIE',
      () => this.startNewGame(),
      { color: PAL.tobaccoRed },
    );
  }

  /**
   * Resume the persisted run. The in-memory state may have been reset to a fresh
   * day 1 (after a Game Over / Epilogue restart) while a save still sits on disk,
   * so reload it from disk before navigating instead of trusting ctx.state.
   */
  private continueSaved(): void {
    const saved = load();
    if (saved) Object.assign(this.ctx.state, saved);
    this.ctx.goTo(new DayIntroScene(this.ctx));
  }

  /** Reset the run to a fresh campaign, then run onboarding. */
  private startNewGame(): void {
    Object.assign(this.ctx.state, freshState());
    this.ctx.goTo(new OnboardingScene(this.ctx));
  }

  render(r: Renderer): void {
    // --- Night small-town sky ------------------------------------------
    r.clear(PAL.bg);
    r.rect(0, 0, VW, 150, PAL.shadow);
    // Stars + crescent.
    for (let i = 0; i < 26; i++) {
      const sx = (i * 53 + 11) % VW;
      const sy = (i * 29 + 3) % 22;
      if (hash2(sx, sy) > 0.4) r.px(sx, sy, hash2(sx, sy) > 0.85 ? PAL.offWhite : PAL.wallDark);
    }
    r.rect(40, 5, 5, 5, PAL.fdjYellow);
    r.rect(40, 5, 3, 3, PAL.shadow);

    // --- Neighbouring building silhouettes (street depth) ---------------
    r.rect(0, 26, 44, 124, PAL.wallDark);
    r.rect(436, 30, 44, 120, PAL.wallDark);
    r.vline(10, 40, 90, PAL.shadow);
    r.vline(24, 50, 80, PAL.shadow);
    r.vline(450, 44, 86, PAL.shadow);
    r.vline(464, 56, 74, PAL.shadow);

    // --- Tabac facade ---------------------------------------------------
    const fx = 40;
    const fy = 24;
    const fw = 400;
    const fh = 126;
    r.rect(fx, fy, fw, fh, PAL.wall);
    // Plaster grime.
    for (let gy = fy; gy < fy + fh; gy += 3) {
      for (let gx = fx; gx < fx + fw; gx += 3) {
        if (hash2(gx, gy) > 0.84) r.px(gx, gy, PAL.wallDark);
      }
    }
    r.stroke(fx, fy, fw, fh, PAL.ink, 1);
    // Lit top cornice.
    r.hline(fx, fy, fw, PAL.woodLight);
    r.hline(fx, fy + 1, fw, PAL.wood);

    // --- Illuminated "TABAC" sign box -----------------------------------
    const sgw = 150;
    const sgh = 22;
    const sgx = Math.round(VW / 2 - sgw / 2);
    const sgy = 28;
    // Time-based neon flicker: mostly lit, with brief unstable stutters so the
    // sign feels like a humming tube. Two regimes: full bright vs a dim brownout.
    const flickT = performance.now() / 1000;
    const noise =
      Math.sin(flickT * 11.3) + Math.sin(flickT * 6.7) * 0.7 + Math.sin(flickT * 23.1) * 0.3;
    const neonDim = noise < -1.35;
    const tubeRed = neonDim ? PAL.fdjRed : PAL.tobaccoRed;
    const tubeGlow = neonDim ? PAL.wood : PAL.offWhite;
    const bulbCol = neonDim ? PAL.woodDark : PAL.fdjYellow;

    r.rect(sgx, sgy, sgw, sgh, PAL.ink);
    r.rect(sgx + 2, sgy + 2, sgw - 4, sgh - 4, tubeRed);
    r.stroke(sgx, sgy, sgw, sgh, PAL.ink, 1);
    // Marquee bulbs around the sign.
    for (let bx = sgx + 3; bx < sgx + sgw - 2; bx += 8) {
      r.px(bx, sgy + 1, bulbCol);
      r.px(bx, sgy + sgh - 2, bulbCol);
    }
    // Sign text (shadow + glow); the glow layer flickers with the neon.
    r.text('TABAC', sgx + sgw / 2 + 1, sgy + 5, { color: PAL.ink, scale: 2, align: 'center' });
    r.text('TABAC', sgx + sgw / 2, sgy + 4, { color: tubeGlow, scale: 2, align: 'center' });

    // --- Tabac lozenge sign hanging on the left ------------------------
    this.drawTabacSign(r, 54, 58);

    // --- Awning ---------------------------------------------------------
    const awx = 70;
    const awy = 56;
    const aww = 300;
    const awh = 12;
    for (let i = 0; i < aww; i++) {
      const stripe = Math.floor(i / 12) % 2 === 0 ? PAL.tobaccoRed : PAL.offWhite;
      r.vline(awx + i, awy, awh, stripe);
    }
    r.hline(awx, awy, aww, PAL.ink);
    // Scalloped lower edge (little triangles per stripe).
    for (let s = 0; s * 12 < aww; s++) {
      const stripe = s % 2 === 0 ? PAL.tobaccoRed : PAL.offWhite;
      const bx = awx + s * 12;
      for (let row = 0; row < 4; row++) {
        const len = Math.max(0, 12 - row * 4);
        r.hline(bx + row * 2, awy + awh + row, len, stripe);
      }
    }
    r.hline(awx, awy + awh - 1, aww, PAL.shadow);

    // --- Shop window: glowing pack wall ---------------------------------
    const wx = 84;
    const wy = 76;
    const ww = 272;
    const wh = 70;
    r.rect(wx - 3, wy - 3, ww + 6, wh + 6, PAL.woodDark);
    r.stroke(wx - 3, wy - 3, ww + 6, wh + 6, PAL.ink, 1);
    // Warm backlight inside.
    r.rect(wx, wy, ww, wh, PAL.woodDark);
    r.rect(wx, wy, ww, 24, PAL.wood);
    // Pack grid (the wall of cigarette packs the shopkeeper sees).
    for (let row = 0; row < 3; row++) {
      const py = wy + 2 + row * 23;
      for (let col = 0; col < 15; col++) {
        const pxp = wx + 3 + col * 18;
        if (pxp + 14 > wx + ww) break;
        const col0 = PACK_COLS[(row * 5 + col * 3) % PACK_COLS.length];
        drawCigarettePack(r, pxp, py, col0);
      }
    }
    // Window glass reflections (diagonal sheen).
    for (let i = 0; i < 18; i++) {
      r.px(wx + 10 + i * 3, wy + 4 + i, PAL.offWhite);
    }
    // Window mullion cross.
    r.vline(wx + Math.round(ww / 2), wy, wh, PAL.woodDark);
    r.hline(wx, wy + Math.round(wh / 2), ww, PAL.woodDark);
    r.stroke(wx, wy, ww, wh, PAL.ink, 1);

    // --- Foreground: dim counter / pavement band ------------------------
    r.rect(0, 150, VW, VH - 150, PAL.woodDark);
    // Wood ledge lip separating facade from foreground.
    r.hline(0, 150, VW, PAL.woodLight);
    r.hline(0, 151, VW, PAL.wood);
    r.hline(0, 152, VW, PAL.shadow);
    // Sparse grain / grime in the dark band.
    for (let gy = 156; gy < VH; gy += 4) {
      for (let gx = 0; gx < VW; gx += 6) {
        if (hash2(gx, gy) > 0.72) r.px(gx, gy, hash2(gx + 1, gy) > 0.5 ? PAL.wood : PAL.shadow);
      }
    }

    // --- Game name (big chunky bitmap logo) -----------------------------
    const titleY = 166;
    r.text('TABACO PLEASE', VW / 2 + 2, titleY + 2, { color: PAL.ink, scale: 3, align: 'center' });
    r.text('TABACO PLEASE', VW / 2 + 1, titleY + 1, { color: PAL.tobaccoRed, scale: 3, align: 'center' });
    r.text('TABACO PLEASE', VW / 2, titleY, { color: PAL.fdjYellow, scale: 3, align: 'center' });

    // --- Subtitle -------------------------------------------------------
    r.text('Tabac-presse d Aussonne', VW / 2, 200, {
      color: PAL.paper,
      scale: 1,
      align: 'center',
    });
    r.text('- guichet -', VW / 2, 212, { color: PAL.skinShadow, scale: 1, align: 'center' });

    // --- Menu buttons ---------------------------------------------------
    if (this.continueBtn) this.continueBtn.draw(r);
    this.newGame.draw(r);

    // --- Footer ---------------------------------------------------------
    r.text('v0.1', VW - 4, VH - 9, { color: PAL.wallDark, scale: 1, align: 'right' });
  }

  /** Pixel red tabac lozenge: vertical lozenge with a mount bracket + cream band. */
  private drawTabacSign(r: Renderer, x: number, y: number): void {
    // Mount bracket to the wall.
    r.rect(x + 7, y - 6, 2, 6, PAL.ink);
    r.hline(x + 2, y - 6, 12, PAL.woodDark);
    // Lozenge body: symmetric, pointed top & bottom.
    const spans = [2, 4, 6, 10, 14, 16, 16, 16, 16, 16, 14, 10, 6, 4, 2];
    const W = 16;
    for (let i = 0; i < spans.length; i++) {
      const len = spans[i];
      const ox = x + Math.round((W - len) / 2);
      r.hline(ox, y + i, len, PAL.tobaccoRed);
    }
    // Keep flat with a cream brand band across the fat middle.
    r.hline(x, y + 7, W, PAL.offWhite);
    r.hline(x, y + 8, W, PAL.fdjRed);
    // Glow speck.
    r.px(x + 5, y + 4, PAL.offWhite);
  }

  onClick(p: { x: number; y: number }): void {
    if (this.continueBtn && this.continueBtn.hit(p)) {
      this.continueBtn.click();
      return;
    }
    if (this.newGame.hit(p)) this.newGame.click();
  }
}
