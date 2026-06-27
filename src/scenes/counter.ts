// CounterScene — the core gameplay loop at the tabac counter.
// Draws the client + speech bubble + presentoir, exposes the tools gated by the
// day's active rules (CNI / observe drunk / fichier des interdits), and handles the
// VENDRE (with a money-making change sub-step) / REFUSER actions. Patience drains
// over time; when it hits zero the client walks out (lost regular). When the queue
// empties we run a random end-of-day inspection then hand over to the DayEndScene.
//
// VISUAL: everything is laid out in the 480x270 pixel-art space using LAYOUT
// zones, PAL colors, sprites.ts procedural art and the repainted ui.ts widgets.

import type { GameContext } from '../game/types';
import type { Client, Regle, TypeRegle, Decision } from '../game/types';
import { DENOMINATIONS } from '../game/types';
import type { Scene } from '../engine/stateMachine';
import type { Renderer } from '../engine/renderer';
import { Button, Panel, DocumentCard, ListView, MoneyTray } from '../engine/ui';
import { PAL } from '../engine/palette';
import { LAYOUT, VW, VH } from '../engine/layout';
import {
  drawComptoir,
  drawPresentoir as paintPresentoir,
  drawCigarettePack,
  drawClient as paintClient,
  drawSpeechBubble,
  drawCNI,
  drawTerminalFDJ,
  drawTicket,
  drawPatience as paintPatience,
} from '../engine/sprites';

import { evalDecision, ageDepuis } from '../game/rules';
import { appliquer } from '../game/consequence';
import type { Evt } from '../game/consequence';
import { encaisser } from '../game/economy';
import { configJour } from '../game/content/jours';
import { DayEndScene } from './dayEnd';

const PATIENCE_DRAIN_PER_SEC = 5; // base patience lost per second while waiting
const CNI_COST = 15; // patience lost each time we ask for the ID card
const TOAST_TTL = 3.4; // seconds a feedback toast stays on screen

type SousEtape = 'service' | 'monnaie';

interface Toast {
  message: string;
  color: string;
  t: number;
}

interface Pack {
  x: number;
  y: number;
  color: string;
}

/** A few plausible names always on the banned list, to make the lookup non-trivial. */
const FICHIER_LEURRES = ['Bernard Tapie', 'Robert Dupond', 'Alain Prost'];

/** Procedural "mur de paquets" — deterministic pack grid for the presentoir. */
function buildPacks(): Pack[] {
  const packs: Pack[] = [];
  const colors = [
    PAL.rougeTabac,
    PAL.vertMuted,
    PAL.fdjJaune,
    PAL.fdjRouge,
    PAL.woodLight,
    PAL.blancCasse,
    PAL.wood,
    PAL.peauOmbre,
  ];
  const rowsY = [4, 32, 60, 88, 116];
  let k = 0;
  for (const ry of rowsY) {
    for (let x = 6; x + 14 <= 474; x += 18) {
      packs.push({ x, y: ry, color: colors[k++ % colors.length] });
    }
  }
  return packs;
}

export class CounterScene implements Scene {
  private readonly ctx: GameContext;

  private file: Client[] = [];
  private index = 0;
  private etape: SousEtape = 'service';

  private readonly toasts: Toast[] = [];
  private readonly packs: Pack[] = buildPacks();

  // Per-client tool state.
  private showDoc = false;
  private showFichier = false;
  private observed = false;
  private docCard: DocumentCard | null = null;

  // Change sub-step state.
  private billet = 0;
  private aRendre = 0;

  // Widgets.
  private readonly tray: MoneyTray;
  private fichier: ListView;

  private readonly btnCNI: Button;
  private readonly btnObserver: Button;
  private readonly btnFichier: Button;
  private readonly btnVendre: Button;
  private readonly btnRefuser: Button;
  private readonly btnValider: Button;
  private readonly btnReset: Button;
  private readonly btnAnnuler: Button;

  constructor(ctx: GameContext) {
    this.ctx = ctx;

    // Change tray + validate/cancel controls (money sub-step). Sized as an
    // interactive caisse overlay panel centered on the comptoir.
    this.tray = new MoneyTray({ x: 108, y: 178, w: 284, h: 48 }, DENOMINATIONS, () => {
      /* running total tracked on the tray itself */
    });
    this.fichier = new ListView({ x: 290, y: 84, w: 184, h: 120 }, [], {
      title: 'Fichier des interdits',
    });

    // Tool buttons (toolbar zone). Created once; gated by active rules at draw time.
    this.btnCNI = new Button(
      { x: 6, y: 250, w: 80, h: 16 },
      'Demander CNI',
      () => this.demanderCNI(),
      { color: PAL.wood },
    );
    this.btnObserver = new Button(
      { x: 90, y: 250, w: 62, h: 16 },
      'Observer',
      () => {
        this.observed = !this.observed;
      },
      { color: PAL.wood },
    );
    this.btnFichier = new Button(
      { x: 156, y: 250, w: 54, h: 16 },
      'Fichier',
      () => {
        this.showFichier = !this.showFichier;
      },
      { color: PAL.wood },
    );

    // Action buttons (right of the toolbar).
    this.btnVendre = new Button(
      { x: 326, y: 248, w: 68, h: 18 },
      'VENDRE',
      () => this.onVendre(),
      { color: PAL.vertMuted },
    );
    this.btnRefuser = new Button(
      { x: 398, y: 248, w: 76, h: 18 },
      'REFUSER',
      () => this.onRefuser(),
      { color: PAL.rougeTabac },
    );

    // Money sub-step controls (inside the caisse panel).
    this.btnReset = new Button({ x: 108, y: 234, w: 54, h: 16 }, 'Vider', () => this.tray.reset(), {
      color: PAL.wallDark,
    });
    this.btnAnnuler = new Button(
      { x: 166, y: 234, w: 72, h: 16 },
      'Annuler',
      () => this.annulerMonnaie(),
      { color: PAL.rougeTabac },
    );
    this.btnValider = new Button(
      { x: 300, y: 234, w: 92, h: 16 },
      'Valider',
      () => this.validerMonnaie(),
      { color: PAL.vertMuted },
    );
  }

  enter(): void {
    const cfg = configJour(this.ctx.state.jour);
    this.file = cfg.file.slice();
    this.index = 0;
    this.buildFichier();
    this.setupClient();
  }

  // --- per-client setup ------------------------------------------------------

  private get client(): Client | undefined {
    return this.file[this.index];
  }

  private setupClient(): void {
    this.etape = 'service';
    this.showDoc = false;
    this.showFichier = false;
    this.observed = false;
    this.tray.reset();
    const c = this.client;
    if (!c) return;
    this.docCard = new DocumentCard(
      { x: LAYOUT.cniSlot.x, y: LAYOUT.cniSlot.y, w: LAYOUT.cniSlot.w, h: LAYOUT.cniSlot.h },
      [
        { label: 'Nom', value: c.nomComplet },
        { label: 'Date de naissance', value: formatDate(c.dateNaissance) },
      ],
      { title: 'CARTE NATIONALE D’IDENTITÉ' },
    );
  }

  /** Build the banned-name list from this day's roster plus a few decoys. */
  private buildFichier(): void {
    const names = new Set<string>(FICHIER_LEURRES);
    for (const c of this.file) {
      if (c.nomSurFichierInterdits) names.add(c.nomComplet);
    }
    this.fichier = new ListView({ x: 290, y: 84, w: 184, h: 120 }, [...names].sort(), {
      title: 'Fichier des interdits',
    });
  }

  // --- rule helpers ----------------------------------------------------------

  private get regles(): Regle[] {
    return this.ctx.state.reglesActives;
  }

  private has(type: TypeRegle): boolean {
    return this.regles.some((r) => r.type === type);
  }

  // --- actions ---------------------------------------------------------------

  private demanderCNI(): void {
    this.showDoc = !this.showDoc;
    if (this.showDoc && this.client) {
      // Asking for papers annoys the customer (and is a faute of time if needless).
      this.client.patience = clamp(this.client.patience - CNI_COST);
    }
  }

  private onVendre(): void {
    const c = this.client;
    if (!c) return;
    if (this.has('monnaie')) {
      this.demarrerMonnaie(c);
    } else {
      this.conclureVente(c, true);
    }
  }

  private onRefuser(): void {
    const c = this.client;
    if (!c) return;
    const evalR = evalDecision(c, 'refuser', this.regles);
    const decision: Decision = { client: c, action: 'refuser', correcte: evalR.correcte };
    const evts = appliquer(this.ctx.state, decision);
    if (evalR.correcte) {
      this.pushToast('Refus justifié.', '#9ccc65');
    }
    this.afficherEvts(evts);
    this.avancer();
  }

  // --- change-making sub-step ------------------------------------------------

  private demarrerMonnaie(c: Client): void {
    this.etape = 'monnaie';
    this.showDoc = false;
    this.showFichier = false;
    this.tray.reset();
    this.billet = choisirBillet(c.demande.prix);
    this.aRendre = round2(this.billet - c.demande.prix);
  }

  private annulerMonnaie(): void {
    this.etape = 'service';
    this.tray.reset();
  }

  private validerMonnaie(): void {
    const c = this.client;
    if (!c) return;
    const rendu = round2(this.tray.total);
    const monnaieOK = rendu === this.aRendre;
    if (!monnaieOK) {
      this.pushToast(
        `Monnaie incorrecte : rendu ${rendu.toFixed(2)} € au lieu de ${this.aRendre.toFixed(2)} €.`,
        '#e57373',
      );
    }
    this.etape = 'service';
    this.conclureVente(c, monnaieOK);
  }

  /** Finalise a sale: take the money, evaluate legality + change, apply consequences. */
  private conclureVente(c: Client, monnaieOK: boolean): void {
    const evalR = evalDecision(c, 'vendre', this.regles);
    const correcte = evalR.correcte && monnaieOK;
    encaisser(this.ctx.state, c.demande.prix);
    const decision: Decision = { client: c, action: 'vendre', correcte };
    const evts = appliquer(this.ctx.state, decision);
    if (correcte) {
      this.pushToast(`Vente conclue : +${c.demande.prix.toFixed(2)} €.`, '#9ccc65');
    }
    this.afficherEvts(evts);
    this.avancer();
  }

  // --- queue progression -----------------------------------------------------

  private avancer(): void {
    this.index += 1;
    if (this.index >= this.file.length) {
      this.finDeJournee();
      return;
    }
    this.setupClient();
  }

  private clientParti(c: Client): void {
    // A walk-out only counts as a faute (lost regular) if the sale was legitimate.
    const legit = evalDecision(c, 'vendre', this.regles).correcte;
    if (legit) {
      const decision: Decision = { client: c, action: 'refuser', correcte: false };
      const evts = appliquer(this.ctx.state, decision);
      this.pushToast('Le client s’impatiente et s’en va ! Client régulier perdu.', '#e57373');
      this.afficherEvts(evts);
    } else {
      this.pushToast('Le client s’impatiente et s’en va.', '#ffd54f');
    }
    this.avancer();
  }

  private finDeJournee(): void {
    // The end-of-day inspection runs exactly once, inside DayEndScene.enter().
    this.ctx.goTo(new DayEndScene(this.ctx));
  }

  // --- feedback toasts -------------------------------------------------------

  private afficherEvts(evts: Evt[]): void {
    for (const e of evts) this.pushToast(e.message, couleurEvt(e.type));
  }

  private pushToast(message: string, color: string): void {
    this.toasts.push({ message, color, t: TOAST_TTL });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  // --- loop ------------------------------------------------------------------

  update(dt: number): void {
    const sec = Math.min(dt, 0.1); // dt is already in seconds; clamp huge frame gaps

    for (const toast of this.toasts) toast.t -= sec;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      if (this.toasts[i].t <= 0) this.toasts.splice(i, 1);
    }

    if (this.etape !== 'service') return;
    const c = this.client;
    if (!c) return;
    c.patience = clamp(c.patience - PATIENCE_DRAIN_PER_SEC * sec);
    if (c.patience <= 0) this.clientParti(c);
  }

  onClick(p: { x: number; y: number }): void {
    if (this.etape === 'monnaie') {
      this.clicMonnaie(p);
      return;
    }
    this.clicService(p);
  }

  private clicService(p: { x: number; y: number }): void {
    // Tool buttons (only react when their rule is active).
    if (this.has('age') && this.btnCNI.hit(p)) return this.btnCNI.click();
    if (this.has('ivresse') && this.btnObserver.hit(p)) return this.btnObserver.click();
    if (this.has('fichier') && this.btnFichier.hit(p)) return this.btnFichier.click();
    if (this.btnVendre.hit(p)) return this.btnVendre.click();
    if (this.btnRefuser.hit(p)) return this.btnRefuser.click();
  }

  private clicMonnaie(p: { x: number; y: number }): void {
    if (this.tray.hit(p)) {
      this.tray.click(p);
      return;
    }
    if (this.btnReset.hit(p)) return this.btnReset.click();
    if (this.btnAnnuler.hit(p)) return this.btnAnnuler.click();
    if (this.btnValider.hit(p)) return this.btnValider.click();
  }

  // --- render ----------------------------------------------------------------

  render(r: Renderer): void {
    r.clear(PAL.bg);

    // 1. Mur de paquets across the back wall.
    paintPresentoir(r, this.packs);

    // 2. Client framed at the window (behind the comptoir).
    const c = this.client;
    if (c) this.drawWindow(r, c);

    // 3. Wooden comptoir in the foreground + the FDJ terminal on the back ledge.
    drawComptoir(r);
    drawTerminalFDJ(r, LAYOUT.terminalFDJ.x + 8, LAYOUT.terminalFDJ.y + 2);

    // 4. Speech bubble with the French demande.
    if (c) this.drawBubble(r, c);

    // 5. Top HUD (patience bar + counters) and the day's rules affichette.
    this.drawTopBar(r);
    if (c) paintPatience(r, LAYOUT.patienceBar.x, LAYOUT.patienceBar.y, 130, clamp(c.patience) / 100);

    // 6. Step-specific layer.
    if (this.etape === 'monnaie') {
      this.drawMonnaie(r, c);
    } else {
      if (c) this.drawProduit(r, c);
      this.drawTools(r);
      this.drawOverlays(r);
      this.btnVendre.draw(r);
      this.btnRefuser.draw(r);
    }

    // 7. Feedback toasts on top.
    this.drawToasts(r);
  }

  /** The client window: framed recess carved into the pack wall, client inside. */
  private drawWindow(r: Renderer, c: Client): void {
    const w = LAYOUT.clientWindow;

    // Frame + recess.
    r.rect(w.x - 4, w.y - 4, w.w + 8, w.h + 8, PAL.woodDark);
    r.stroke(w.x - 4, w.y - 4, w.w + 8, w.h + 8, PAL.ink, 1);
    r.rect(w.x, w.y, w.w, w.h, PAL.ombre);
    r.hline(w.x, w.y, w.w, PAL.wallDark);
    r.hline(w.x + 1, w.y + 1, w.w - 2, PAL.wall);
    // Window mullion lip at the bottom (a little sill).
    r.hline(w.x, w.y + w.h - 1, w.w, PAL.woodLight);

    const cx = w.x + w.w / 2;
    const mood: 'neutre' | 'fache' | 'content' =
      c.patience < 30 ? 'fache' : c.patience > 80 ? 'content' : 'neutre';
    paintClient(r, cx, w.y + 34, {
      ivre: this.has('ivresse') && c.estIvre,
      mood,
    });
  }

  private drawBubble(r: Renderer, c: Client): void {
    const sb = LAYOUT.speechBubble;
    drawSpeechBubble(r, sb.x, sb.y, sb.w, `Bonjour, je voudrais ${c.demande.nom}.`);
  }

  /** The requested product shown as a sprite on the comptoir, with a price tag. */
  private drawProduit(r: Renderer, c: Client): void {
    const cat = c.demande.categorie;
    const baseY = 212;
    const cx = 232;
    let rightEdge = cx + 14;

    if (cat === 'jeux') {
      drawTicket(r, cx - 12, baseY + 2, PAL.vertMuted);
      rightEdge = cx - 12 + 40;
    } else if (cat === 'alcool') {
      // Simple bottle.
      r.rect(cx + 4, baseY, 4, 6, PAL.vertMuted);
      r.rect(cx + 5, baseY - 2, 2, 2, PAL.ink);
      r.rect(cx, baseY + 6, 12, 22, PAL.vertMuted);
      r.stroke(cx, baseY + 6, 12, 22, PAL.ink, 1);
      r.rect(cx + 1, baseY + 14, 10, 8, PAL.paper);
      r.hline(cx + 2, baseY + 16, 8, PAL.rougeTabac);
      r.hline(cx + 2, baseY + 19, 8, PAL.peauOmbre);
      r.vline(cx + 1, baseY + 8, 6, PAL.woodLight);
      rightEdge = cx + 12;
    } else if (cat === 'epicerie') {
      // Boxed grocery item.
      r.rect(cx, baseY + 4, 20, 22, PAL.wood);
      r.stroke(cx, baseY + 4, 20, 22, PAL.ink, 1);
      r.hline(cx + 1, baseY + 5, 18, PAL.woodLight);
      r.rect(cx + 3, baseY + 9, 14, 9, PAL.paper);
      r.hline(cx + 4, baseY + 11, 12, PAL.ink);
      r.hline(cx + 4, baseY + 14, 12, PAL.rougeTabac);
      rightEdge = cx + 20;
    } else {
      // Tabac — cigarette pack.
      drawCigarettePack(r, cx, baseY, PAL.rougeTabac);
      rightEdge = cx + 14;
    }

    // Hanging paper price tag to the right of the product.
    const txt = `${c.demande.prix.toFixed(2)} €`;
    const tagX = rightEdge + 6;
    const tagY = baseY + 8;
    const tw = r.measure(txt, 1) + 6;
    r.px(tagX - 2, tagY + 4, PAL.ink);
    r.px(tagX - 1, tagY + 4, PAL.ink);
    r.rect(tagX, tagY, tw, 11, PAL.paper);
    r.stroke(tagX, tagY, tw, 11, PAL.ink, 1);
    r.hline(tagX + 1, tagY + 1, tw - 2, PAL.blancCasse);
    r.text(txt, tagX + 3, tagY + 2, { color: PAL.ink, scale: 1, align: 'left' });
  }

  /** Top HUD: dark ledger strip with the counters + the day's rules affichette. */
  private drawTopBar(r: Renderer): void {
    const s = this.ctx.state;

    // HUD strip.
    r.rect(0, 0, VW, 16, PAL.woodDark);
    r.hline(0, 15, VW, PAL.ink);

    const total = this.file.length;
    const num = Math.min(this.index + 1, total);
    const hud =
      `JOUR ${s.jour}   REC ${s.recetteDuJour.toFixed(0)}€   ` +
      `CAISSE ${s.tresorerie.toFixed(0)}€   AV ${s.avertissements}   ${num}/${total}`;
    r.text(hud, VW - 6, 5, { color: PAL.fdjJaune, scale: 1, align: 'right' });

    // Règles du jour — posted regulation notice on the wall.
    const txt = this.regles.map((rg) => labelRegle(rg.type)).join(' / ') || 'Aucune règle';
    const w = r.measure(txt, 1) + 8;
    r.rect(8, 18, w, 12, PAL.ombre);
    r.stroke(8, 18, w, 12, PAL.ink, 1);
    r.text(txt, 12, 20, { color: PAL.fdjJaune, scale: 1, align: 'left' });
  }

  private drawTools(r: Renderer): void {
    if (this.has('age')) {
      this.btnCNI.disabled = false;
      this.btnCNI.draw(r);
    }
    if (this.has('ivresse')) {
      this.btnObserver.disabled = false;
      this.btnObserver.draw(r);
    }
    if (this.has('fichier')) {
      this.btnFichier.disabled = false;
      this.btnFichier.draw(r);
    }
  }

  private drawOverlays(r: Renderer): void {
    const c = this.client;

    // CNI document in its slot on the comptoir.
    if (this.showDoc && c) {
      drawCNI(r, LAYOUT.cniSlot.x, LAYOUT.cniSlot.y, {
        nom: c.nomComplet,
        naissance: formatDate(c.dateNaissance),
      });
      const age = ageDepuis(c.dateNaissance);
      r.text(`${age} ans aujourd'hui`, LAYOUT.cniSlot.x, LAYOUT.cniSlot.y + LAYOUT.cniSlot.h + 2, {
        color: PAL.blancCasse,
        scale: 1,
        align: 'left',
      });
    }

    // Fichier des interdits (banned list) panel.
    if (this.showFichier) {
      this.fichier.draw(r);
      if (c) {
        const banni = this.fichier.contains(c.nomComplet);
        r.text(
          banni ? `${c.nomComplet} : INTERDIT !` : `${c.nomComplet} : absent`,
          290,
          207,
          { color: banni ? PAL.rougeTabac : PAL.vertMuted, scale: 1, align: 'left' },
        );
      }
    }

    // Observation result banner.
    if (this.has('ivresse') && this.observed && c) {
      const msg = c.estIvre
        ? 'Il titube et sent fortement l’alcool.'
        : 'Regard clair. Il a l’air sobre.';
      const col = c.estIvre ? PAL.rougeTabac : PAL.vertMuted;
      const w = Math.min(VW - 40, r.measure(msg, 1) + 10);
      const x = Math.round((VW - w) / 2);
      const y = 196;
      r.rect(x, y, w, 12, PAL.ink);
      r.stroke(x, y, w, 12, col, 1);
      r.text(msg, x + 5, y + 3, { color: col, scale: 1, align: 'left' });
    }
  }

  private drawMonnaie(r: Renderer, c: Client | undefined): void {
    new Panel({ x: 100, y: 148, w: 300, h: 112 }, { title: 'CAISSE — RENDEZ LA MONNAIE' }).draw(r);
    if (c) {
      r.text(`Paie ${c.demande.prix.toFixed(2)}€ avec ${this.billet}€`, 108, 162, {
        color: PAL.blancCasse,
        scale: 1,
        align: 'left',
      });
      r.text('Composez le rendu :', 108, 170, {
        color: PAL.paper,
        scale: 1,
        align: 'left',
      });
    }
    this.tray.draw(r);
    this.btnReset.draw(r);
    this.btnAnnuler.draw(r);
    this.btnValider.draw(r);
  }

  private drawToasts(r: Renderer): void {
    let y = 190;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const toast = this.toasts[i];
      const w = Math.min(VW - 12, r.measure(toast.message, 1) + 12);
      const x = Math.round((VW - w) / 2);
      r.rect(x + 1, y + 1, w, 12, PAL.bg);
      r.rect(x, y, w, 12, PAL.ink);
      r.stroke(x, y, w, 12, toast.color, 1);
      r.text(toast.message, x + 6, y + 3, { color: toast.color, scale: 1, align: 'left' });
      y -= 15;
    }
  }
}

// --- module helpers ----------------------------------------------------------

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Smallest sensible bill/coin a customer hands over for a given price. */
function choisirBillet(prix: number): number {
  const billets = [5, 10, 20, 50];
  for (const b of billets) {
    if (b >= prix) return b;
  }
  return Math.ceil(prix / 50) * 50;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const LABELS_REGLE: Record<TypeRegle, string> = {
  monnaie: 'Monnaie',
  age: 'Âge 18+',
  ivresse: 'Ivresse',
  fichier: 'Fichier jeux',
};

function labelRegle(type: TypeRegle): string {
  return LABELS_REGLE[type];
}

const COULEURS_EVT: Record<Evt['type'], string> = {
  avertissement: '#ffd54f',
  amende: '#e57373',
  controle: '#ef5350',
  patience: '#ffb74d',
};

function couleurEvt(type: Evt['type']): string {
  return COULEURS_EVT[type];
}
