// CounterScene — the core gameplay loop at the tabac counter.
// Draws the client + speech bubble + shelf, exposes the tools gated by the
// day's active rules (CNI / observe drunk / ban list), and handles the
// VENDRE (with a change-making sub-step) / REFUSER actions. Patience drains
// over time; when it hits zero the client walks out (lost regular). When the queue
// empties we run a random end-of-day inspection then hand over to the DayEndScene.
//
// VISUAL: everything is laid out in the 480x270 pixel-art space using LAYOUT
// zones, PAL colors, sprites.ts procedural art and the repainted ui.ts widgets.

import type { GameContext } from '../game/types';
import type { Client, Rule, RuleType, Decision, MatchInfo, BetPick } from '../game/types';
import { DENOMINATIONS } from '../game/types';
import type { Scene } from '../engine/stateMachine';
import { Renderer } from '../engine/renderer';
import { Button, Panel, DocumentCard, ListView, MoneyTray, inRect } from '../engine/ui';
import type { Rect } from '../engine/ui';
import { PAL } from '../engine/palette';
import { LAYOUT, VW, VH } from '../engine/layout';
import {
  drawCounter,
  drawShelf as paintShelf,
  drawCigarettePack,
  drawCan,
  drawFakeRelic,
  drawClient as paintClient,
  drawSpeechBubble,
  drawCNI,
  drawTerminalFDJ,
  drawTicket,
  drawPatience as paintPatience,
  drawBetSlip,
  drawMatchRow,
  drawScoreEntry,
} from '../engine/sprites';
// Namespace import so the new expansion sprites (drawCBD / drawMagazine /
// drawVape) can be looked up defensively at runtime: they are added by the
// sprites phase and may not exist yet, so we never reference them statically.
import * as Sprites from '../engine/sprites';

import { evaluateDecision, ageFrom } from '../game/rules';
import { applyConsequence, applyChangeError, applyBettingError } from '../game/consequence';
import type { GameEvent } from '../game/consequence';
import { cashIn, payout, oddsForPick } from '../game/economy';
import { isAvailable } from '../game/content/products';
import { dayConfig, unlockedGroupsForDay } from '../game/content/days';
import { recurringCharacterFor } from '../game/content/characters';
import {
  matchesForDay,
  matchById,
  hasStarted,
  nextClock,
  START_CLOCK,
  outcomeFromScore,
} from '../game/content/matches';
import { playSfx } from '../engine/sfx';
import { TweenGroup, Ease } from '../engine/tween';
import { wobble } from '../engine/anim';
import { shake, flash, floatText } from '../engine/fx';
import { DayEndScene } from './dayEnd';

const PATIENCE_DRAIN_PER_SEC = 5; // base patience lost per second while waiting
const CNI_COST = 15; // patience lost each time we ask for the ID card
const TOAST_TTL = 3.4; // seconds a feedback toast stays on screen

/** Clickable rules icon: a small clipboard sitting under the HUD strip, top-left. */
const RULES_ICON: Rect = { x: 8, y: 18, w: 15, h: 14 };

/** Shared product-sprite signature (r, x, y, color). */
type ProductSprite = (r: Renderer, x: number, y: number, color: string) => void;

/** Defensive registry: resolves a sprite fn by name, or undefined if absent. */
const spriteFns = Sprites as unknown as Record<string, ProductSprite | undefined>;

/** Word-wrap a string to a maximum character count per line (font is ~6px/char). */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (test.length <= maxChars || cur === '') {
      cur = test;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

type SubStep = 'service' | 'change' | 'betting';

/** Seconds a fraudster waits after their bet is registered before fleeing unpaid. */
const BET_LEAVE_TIME = 7;

/** Geometry of the FDJ betting sub-panel (modal over the lower half). */
const BET_PANEL: Rect = { x: 92, y: 28, w: 296, h: 214 };

/** A bet client carries exactly one betting intent. */
function isBettingClient(c: Client | undefined): boolean {
  return !!c && (!!c.betRequest || !!c.ticket);
}

/** French label for a bet pick, naming the team where relevant. */
function pickLabel(pick: BetPick, m?: MatchInfo): string {
  if (pick === 'A') return m ? `1 (${m.teamA})` : '1';
  if (pick === 'B') return m ? `2 (${m.teamB})` : '2';
  return 'N (match nul)';
}

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

/** How a leaving client departs — drives the exit animation + screen fx. */
type ExitKind = 'neutral' | 'happy' | 'angry';

/** A client currently sliding out of the window (purely cosmetic). */
interface OutClient {
  client: Client;
  offsetX: number;
  alpha: number;
  nod: number;
  mood: 'neutral' | 'angry' | 'happy';
  drunk: boolean;
}

/** A few plausible names always on the banned list, to make the lookup non-trivial. */
const BAN_LIST_DECOYS = ['Bernard Tapie', 'Robert Dupond', 'Alain Prost'];

/** Procedural "pack wall" — deterministic pack grid for the shelf. */
function buildPacks(): Pack[] {
  const packs: Pack[] = [];
  const colors = [
    PAL.tobaccoRed,
    PAL.mutedGreen,
    PAL.fdjYellow,
    PAL.fdjRed,
    PAL.woodLight,
    PAL.offWhite,
    PAL.wood,
    PAL.skinShadow,
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

  private queue: Client[] = [];
  private index = 0;
  private step: SubStep = 'service';

  private readonly toasts: Toast[] = [];
  private readonly packs: Pack[] = buildPacks();

  // --- cosmetic animation state (never affects gameplay logic or timing) ---
  private readonly tweens = new TweenGroup();
  private animTime = 0; // accumulated seconds, drives idle bob / sway / fidget
  private clientOffsetX = 0; // horizontal slide of the current client (entrance)
  private clientAlpha = 1; // fade-in of the current client
  private clientNod = 0; // brief vertical nod offset on the current client
  private blinkTimer = 2; // seconds until the next blink
  private blinking = 0; // remaining seconds of the active blink
  private docSlam = 0; // CNI "stamp slam" vertical offset
  private outgoing: OutClient | null = null; // a client sliding out of frame
  // Offscreen backbuffer used to FLATTEN an alpha-faded bust before blitting it:
  // drawing the multi-layer client straight to the screen with a fractional
  // globalAlpha double-blends overlapping fills/outlines (ghosted seams), so we
  // render it opaque here once, then blit the flat image with the fade alpha.
  private scratch: Renderer | null = null;
  private scratchCanvas: HTMLCanvasElement | null = null;

  // Per-client tool state.
  private showDoc = false;
  private showBanList = false;
  private observed = false;
  private docCard: DocumentCard | null = null;

  // Rules popup (modal overlay opened from the clipboard icon).
  private showRules = false;

  // Change sub-step state.
  private bill = 0;
  private changeDue = 0;

  // Betting sub-step state (FDJ terminal).
  private betMode: 'place' | 'settle' = 'place';
  private betMatches: MatchInfo[] = [];
  private betSelectedId: string | null = null;
  private betRegistered = false;
  private betLeaveTimer = 0;
  private scoreA = 0;
  private scoreB = 0;

  // Widgets.
  private readonly tray: MoneyTray;
  private banList: ListView;

  private readonly btnCNI: Button;
  private readonly btnObserve: Button;
  private readonly btnBanList: Button;
  private readonly btnSell: Button;
  private readonly btnBluff: Button;
  private readonly btnRefuse: Button;
  private readonly btnConfirm: Button;
  private readonly btnReset: Button;
  private readonly btnCancel: Button;

  // Betting widgets.
  private readonly btnOpenTerminal: Button;
  private readonly btnTakeBet: Button;
  private readonly btnRefuseBet: Button;
  private readonly btnCashIn: Button;
  private readonly btnCancelBet: Button;
  private readonly btnPay: Button;
  private readonly btnRefusePay: Button;
  private readonly btnScoreAUp: Button;
  private readonly btnScoreADown: Button;
  private readonly btnScoreBUp: Button;
  private readonly btnScoreBDown: Button;

  constructor(ctx: GameContext) {
    this.ctx = ctx;

    // Change tray + confirm/cancel controls (change sub-step). Sized as an
    // interactive register overlay panel centered on the counter.
    this.tray = new MoneyTray({ x: 108, y: 178, w: 284, h: 48 }, DENOMINATIONS, () => {
      /* running total tracked on the tray itself */
    });
    this.banList = new ListView({ x: 290, y: 84, w: 184, h: 120 }, [], {
      title: 'Fichier des interdits',
    });

    // Tool buttons (toolbar zone). Created once; gated by active rules at draw time.
    this.btnCNI = new Button(
      { x: 6, y: 250, w: 80, h: 16 },
      'Demander CNI',
      () => this.askId(),
      { color: PAL.wood },
    );
    this.btnObserve = new Button(
      { x: 90, y: 250, w: 62, h: 16 },
      'Observer',
      () => {
        this.observed = !this.observed;
      },
      { color: PAL.wood },
    );
    this.btnBanList = new Button(
      { x: 156, y: 250, w: 54, h: 16 },
      'Fichier',
      () => {
        this.showBanList = !this.showBanList;
      },
      { color: PAL.wood },
    );

    // Action buttons (right of the toolbar).
    this.btnSell = new Button(
      { x: 326, y: 248, w: 68, h: 18 },
      'VENDRE',
      () => this.onSell(),
      { color: PAL.mutedGreen },
    );
    // Shown in place of VENDRE when the request is a fake / out-of-stock product.
    this.btnBluff = new Button(
      { x: 326, y: 248, w: 68, h: 18 },
      'BLUFFER',
      () => this.onBluff(),
      { color: PAL.fdjYellow },
    );
    this.btnRefuse = new Button(
      { x: 398, y: 248, w: 76, h: 18 },
      'REFUSER',
      () => this.onRefuse(),
      { color: PAL.tobaccoRed },
    );

    // Change sub-step controls (inside the register panel).
    this.btnReset = new Button({ x: 108, y: 234, w: 54, h: 16 }, 'Vider', () => this.tray.reset(), {
      color: PAL.wallDark,
    });
    this.btnCancel = new Button(
      { x: 166, y: 234, w: 72, h: 16 },
      'Annuler',
      () => this.cancelChange(),
      { color: PAL.tobaccoRed },
    );
    this.btnConfirm = new Button(
      { x: 300, y: 234, w: 92, h: 16 },
      'Valider',
      () => this.confirmChange(),
      { color: PAL.mutedGreen },
    );

    // Betting controls. The terminal button replaces VENDRE/REFUSER for a bet client.
    this.btnOpenTerminal = new Button(
      { x: 326, y: 248, w: 148, h: 18 },
      'Terminal FDJ',
      () => this.openTerminal(),
      { color: PAL.fdjRed },
    );
    // Bottom-row actions inside the betting panel (two columns).
    const betLeft: Rect = { x: 104, y: 224, w: 130, h: 16 };
    const betRight: Rect = { x: 252, y: 224, w: 124, h: 16 };
    this.btnTakeBet = new Button({ ...betLeft }, 'PRENDRE LE PARI', () => this.takeBet(), {
      color: PAL.mutedGreen,
    });
    this.btnRefuseBet = new Button({ ...betRight }, 'REFUSER', () => this.refuseBet(), {
      color: PAL.tobaccoRed,
    });
    this.btnCashIn = new Button({ ...betLeft }, 'ENCAISSER', () => this.cashInBet(), {
      color: PAL.mutedGreen,
    });
    this.btnCancelBet = new Button({ ...betRight }, 'ANNULER', () => this.cancelBet(), {
      color: PAL.fdjYellow,
    });
    this.btnPay = new Button({ ...betLeft }, 'PAYER', () => this.payTicket(), {
      color: PAL.mutedGreen,
    });
    this.btnRefusePay = new Button({ ...betRight }, 'REFUSER', () => this.refusePay(), {
      color: PAL.tobaccoRed,
    });
    // Score steppers (Mode B): +/- over each digit cell of the score box.
    this.btnScoreAUp = new Button({ x: 195, y: 100, w: 16, h: 12 }, '+', () => this.bumpScore('a', 1), {
      color: PAL.wood,
    });
    this.btnScoreADown = new Button({ x: 195, y: 144, w: 16, h: 12 }, '-', () => this.bumpScore('a', -1), {
      color: PAL.wood,
    });
    this.btnScoreBUp = new Button({ x: 218, y: 100, w: 16, h: 12 }, '+', () => this.bumpScore('b', 1), {
      color: PAL.wood,
    });
    this.btnScoreBDown = new Button({ x: 218, y: 144, w: 16, h: 12 }, '-', () => this.bumpScore('b', -1), {
      color: PAL.wood,
    });
  }

  enter(): void {
    // Keep the tracked unlock set current with the day (clients are generated
    // from the same day-derived set, so this stays in sync as the run advances).
    this.ctx.state.unlockedGroups = [...unlockedGroupsForDay(this.ctx.state.day)];
    // Reset the counter clock each morning so the day's betting card (with its
    // morning kickoffs) stays aligned with the advancing clock.
    this.ctx.state.clock = START_CLOCK;
    const cfg = dayConfig(this.ctx.state.day);
    this.queue = cfg.queue.slice();
    this.index = 0;
    // Drop any animation state left over from a previous day.
    this.tweens.clear();
    this.outgoing = null;
    this.docSlam = 0;
    this.clientNod = 0;
    this.buildBanList();
    this.setupClient();
  }

  // --- per-client setup ------------------------------------------------------

  private get client(): Client | undefined {
    return this.queue[this.index];
  }

  private setupClient(): void {
    this.step = 'service';
    this.showDoc = false;
    this.showBanList = false;
    this.observed = false;
    this.tray.reset();
    this.betSelectedId = null;
    this.betRegistered = false;
    this.betLeaveTimer = 0;
    this.scoreA = 0;
    this.scoreB = 0;
    // Reset per-client cosmetic state.
    this.docSlam = 0;
    this.clientNod = 0;
    this.blinking = 0;
    this.blinkTimer = 1.6 + Math.random() * 2;
    const c = this.client;
    if (!c) return;
    playSfx('client');
    this.startEntrance();
    this.docCard = new DocumentCard(
      { x: LAYOUT.cniSlot.x, y: LAYOUT.cniSlot.y, w: LAYOUT.cniSlot.w, h: LAYOUT.cniSlot.h },
      [
        { label: 'Nom', value: c.fullName },
        { label: 'Date de naissance', value: formatDate(c.birthDate) },
      ],
      { title: 'CARTE NATIONALE D’IDENTITÉ' },
    );
  }

  /** New client slides in from the side and fades up (~0.25s, pixel-snapped). */
  private startEntrance(): void {
    this.clientAlpha = 0;
    this.clientOffsetX = -46;
    this.tweens.tween({
      from: -46,
      to: 0,
      duration: 0.26,
      easing: Ease.easeOutQuad,
      snap: true,
      onUpdate: (v) => {
        this.clientOffsetX = v;
      },
    });
    this.tweens.tween({
      from: 0,
      to: 1,
      duration: 0.22,
      easing: Ease.linear,
      onUpdate: (v) => {
        this.clientAlpha = v;
      },
    });
  }

  /**
   * Capture the leaving client and start its slide-out (cosmetic only — the
   * queue has already advanced in game state). 'happy' adds a small nod,
   * 'angry' a quick camera shake for a walkout.
   */
  private startExit(kind: ExitKind): void {
    const c = this.client; // index not yet incremented: this is the leaving client
    if (!c) return;
    const out: OutClient = {
      client: c,
      offsetX: this.clientOffsetX,
      alpha: 1,
      nod: 0,
      mood: kind === 'angry' ? 'angry' : kind === 'happy' ? 'happy' : 'neutral',
      drunk: this.has('drunk') && !!c.isDrunk,
    };
    this.outgoing = out;
    this.tweens.tween({
      from: out.offsetX,
      to: out.offsetX + 70,
      duration: 0.3,
      easing: Ease.easeInQuad,
      snap: true,
      onUpdate: (v) => {
        out.offsetX = v;
      },
    });
    this.tweens.tween({
      from: 1,
      to: 0,
      duration: 0.3,
      easing: Ease.linear,
      onUpdate: (v) => {
        out.alpha = v;
      },
      onComplete: () => {
        if (this.outgoing === out) this.outgoing = null;
      },
    });
    if (kind === 'happy') {
      this.tweens.tween({
        from: 0,
        to: 3,
        duration: 0.12,
        easing: Ease.easeOutQuad,
        snap: true,
        onUpdate: (v) => {
          out.nod = v;
        },
        onComplete: () => {
          this.tweens.tween({
            from: 3,
            to: 0,
            duration: 0.12,
            snap: true,
            onUpdate: (v) => {
              out.nod = v;
            },
          });
        },
      });
    } else if (kind === 'angry') {
      shake(3, 0.28);
    }
  }

  /** Build the banned-name list from this day's roster plus a few decoys. */
  private buildBanList(): void {
    const names = new Set<string>(BAN_LIST_DECOYS);
    for (const c of this.queue) {
      if (c.onBanList) names.add(c.fullName);
    }
    this.banList = new ListView({ x: 290, y: 84, w: 184, h: 120 }, [...names].sort(), {
      title: 'Fichier des interdits',
    });
  }

  // --- rule helpers ----------------------------------------------------------

  private get rules(): Rule[] {
    return this.ctx.state.activeRules;
  }

  private has(type: RuleType): boolean {
    return this.rules.some((r) => r.type === type);
  }

  // --- actions ---------------------------------------------------------------

  /**
   * Raise the narrative flag for a resolved recurring-character decision.
   * Recurring cast is recognized by their fixed fullName (see content/characters).
   * `outcome` is 'sell' when the player served the client (legal or not) and
   * 'refuse' when they correctly turned them away. Serving the gambler only counts
   * as `enabledGambler` when he is actually on the ban list.
   */
  private tagStory(c: Client | undefined, outcome: 'sell' | 'refuse'): void {
    if (!c) return;
    const rc = recurringCharacterFor(c);
    if (!rc) return;
    const flag = outcome === 'sell' ? rc.storyOnSell : rc.storyOnRefuse;
    if (!flag) return;
    if (flag === 'enabledGambler' && !c.onBanList) return;
    this.ctx.state.story[flag] = true;
  }

  /** A bluff is offered only when we don't actually have what's asked for. */
  private canBluff(c: Client | undefined): boolean {
    return !!c && !isAvailable(c.request);
  }

  private askId(): void {
    this.showDoc = !this.showDoc;
    playSfx('stamp');
    if (this.showDoc && this.client) {
      // Asking for papers annoys the customer (and is a fault of time if needless).
      this.client.patience = clamp(this.client.patience - CNI_COST);
      // "Stamp slam": the CNI drops into its slot with a quick overshoot.
      this.docSlam = -10;
      this.tweens.tween({
        from: -10,
        to: 0,
        duration: 0.22,
        easing: Ease.easeOutBack,
        snap: true,
        onUpdate: (v) => {
          this.docSlam = v;
        },
      });
      shake(2, 0.12);
    }
  }

  /** Try to pass off a substitute for a fake / out-of-stock request. */
  private onBluff(): void {
    const c = this.client;
    if (!c) return;
    const s = this.ctx.state;
    // Deterministic "roll" (no Math.random): folded from client + state counters.
    const seed =
      seqOf(c) * 31 + s.day * 17 + Math.round(Math.abs(s.dayRevenue)) + Math.round(c.patience);
    const roll = ((seed % 100) + 100) % 100;
    const gullibility = c.gullibility ?? 50;

    let exit: ExitKind;
    if (roll < gullibility) {
      // Mark fooled: pocket the price, nobody noticed.
      cashIn(s, c.request.price);
      playSfx('bluffOk');
      this.floatMoney(`+${c.request.price.toFixed(2)} €`, PAL.mutedGreen);
      this.pushToast(`Bluff réussi ! +${c.request.price.toFixed(2)} € (ni vu ni connu).`, '#9ccc65');
      exit = 'happy';
    } else {
      // Caught red-handed: immediate fine + scene.
      const fine = Math.max(20, Math.round(c.request.price * 3));
      s.dayRevenue = round2(s.dayRevenue - fine);
      playSfx('bluffFail');
      flash(PAL.tobaccoRed, 0.28);
      shake(4, 0.34);
      this.pushToast(`Le client a cramé l'arnaque ! Amende ${fine} € + esclandre.`, '#e57373');
      exit = 'angry';
    }
    this.advance(exit);
  }

  private onSell(): void {
    const c = this.client;
    if (!c) return;
    if (this.has('change')) {
      this.startChange(c);
    } else {
      this.finalizeSale(c, true);
    }
  }

  private onRefuse(): void {
    const c = this.client;
    if (!c) return;
    const evalR = evaluateDecision(c, 'refuse', this.rules);
    const decision: Decision = { client: c, action: 'refuse', correct: evalR.correct };
    const events = applyConsequence(this.ctx.state, decision);
    playSfx('refuse');
    if (evalR.correct) {
      this.pushToast('Refus justifié.', '#9ccc65');
      // A correct refusal of a recurring character raises its storyOnRefuse flag
      // (e.g. refusing the banned gambler -> protectedGambler).
      this.tagStory(c, 'refuse');
    }
    this.showEvents(events);
    this.advance();
  }

  // --- change-making sub-step ------------------------------------------------

  private startChange(c: Client): void {
    this.step = 'change';
    this.showDoc = false;
    this.showBanList = false;
    this.tray.reset();
    this.bill = chooseBill(c.request.price);
    this.changeDue = round2(this.bill - c.request.price);
  }

  private cancelChange(): void {
    this.step = 'service';
    this.tray.reset();
  }

  private confirmChange(): void {
    const c = this.client;
    if (!c) return;
    const given = round2(this.tray.total);
    const changeOK = given === this.changeDue;
    if (!changeOK) {
      this.pushToast(
        `Monnaie incorrecte : rendu ${given.toFixed(2)} € au lieu de ${this.changeDue.toFixed(2)} €.`,
        '#e57373',
      );
    }
    this.step = 'service';
    this.finalizeSale(c, changeOK);
  }

  /** Finalise a sale: take the money, evaluate legality + change, apply consequences. */
  private finalizeSale(c: Client, changeOK: boolean): void {
    const evalR = evaluateDecision(c, 'sell', this.rules);
    cashIn(this.ctx.state, c.request.price);
    playSfx('sale');
    this.floatMoney(`+${c.request.price.toFixed(2)} €`, PAL.mutedGreen);

    if (!evalR.correct) {
      // Illegal sale slipped through -> hidden risky sale, audited later by an inspection.
      const decision: Decision = { client: c, action: 'sell', correct: false };
      this.showEvents(applyConsequence(this.ctx.state, decision));
    } else if (!changeOK) {
      // Legal sale but wrong change -> immediate, visible till discrepancy (not "risky").
      this.showEvents(applyChangeError(this.ctx.state, c));
    } else {
      this.pushToast(`Vente conclue : +${c.request.price.toFixed(2)} €.`, '#9ccc65');
    }
    // Serving a recurring character raises its storyOnSell flag (e.g. selling jeux
    // to the banned gambler -> enabledGambler, selling to the teen -> soldToMinor).
    this.tagStory(c, 'sell');
    this.advance(evalR.correct && changeOK ? 'happy' : 'neutral');
  }

  // --- betting sub-step (FDJ terminal) ---------------------------------------

  /** The current client's clock, defaulting to the day's opening time. */
  private get clock(): string {
    return this.ctx.state.clock ?? START_CLOCK;
  }

  /** Open the FDJ terminal for a betting client (Mode A place / Mode B settle). */
  private openTerminal(): void {
    const c = this.client;
    if (!c) return;
    this.betMode = c.betRequest ? 'place' : 'settle';
    this.betMatches = matchesForDay(this.ctx.state.day);
    this.betSelectedId = null;
    this.betRegistered = false;
    this.betLeaveTimer = 0;
    this.scoreA = 0;
    this.scoreB = 0;
    this.step = 'betting';
    playSfx('click');
  }

  /** Mode A: click a match row in the list (only the named match selects). */
  private selectMatch(id: string): void {
    const c = this.client;
    if (!c || !c.betRequest) return;
    if (id !== c.betRequest.matchId) {
      this.pushToast("Ce n'est pas le match demandé par le client.", '#ffd54f');
      return;
    }
    this.betSelectedId = id;
    playSfx('click');
  }

  /** Mode A: register the bet — legal only while the match is still upcoming. */
  private takeBet(): void {
    const c = this.client;
    if (!c || !c.betRequest) return;
    if (this.betSelectedId !== c.betRequest.matchId) {
      this.pushToast("Sélectionnez d'abord le match nommé.", '#ffd54f');
      return;
    }
    const m = matchById(this.ctx.state.day, c.betRequest.matchId);
    if (m && hasStarted(m.kickoff, this.clock)) {
      // Match already kicked off -> betting is illegal; registering is a fault.
      playSfx('fine');
      this.pushToast('Pari illégal : le match a déjà commencé !', '#e57373');
      this.showEvents(applyBettingError(this.ctx.state, 0));
      this.advance();
      return;
    }
    this.betRegistered = true;
    if (c.fraudster) this.betLeaveTimer = BET_LEAVE_TIME;
    playSfx('stamp');
    this.pushToast('Pari enregistré. Encaissez la mise !', '#9ccc65');
  }

  /** Mode A: refuse the bet — correct only when the named match has started. */
  private refuseBet(): void {
    const c = this.client;
    if (!c || !c.betRequest) return;
    const m = matchById(this.ctx.state.day, c.betRequest.matchId);
    const started = m ? hasStarted(m.kickoff, this.clock) : false;
    playSfx('refuse');
    if (started) {
      this.pushToast('Refus justifié : match déjà commencé.', '#9ccc65');
    } else {
      this.pushToast('Pari légal refusé à tort.', '#e57373');
      this.showEvents(applyBettingError(this.ctx.state, 0));
    }
    this.advance();
  }

  /** Mode A: collect the wagered stake after registration (the enforced order). */
  private cashInBet(): void {
    const c = this.client;
    if (!c || !c.betRequest || !this.betRegistered) return;
    cashIn(this.ctx.state, c.betRequest.stake);
    playSfx('sale');
    this.floatMoney(`+${c.betRequest.stake.toFixed(2)} €`, PAL.mutedGreen);
    this.pushToast(`Mise encaissée : +${c.betRequest.stake.toFixed(2)} €.`, '#9ccc65');
    this.advance('happy');
  }

  /** Mode A: cancel a registered bet (the safe response to a non-payer). */
  private cancelBet(): void {
    if (!this.betRegistered) return;
    this.betRegistered = false;
    this.betLeaveTimer = 0;
    playSfx('refuse');
    this.pushToast('Pari annulé.', '#ffd54f');
    this.advance();
  }

  /** A fraudster fled after registration without ever paying the stake. */
  private betScammed(): void {
    const c = this.client;
    if (!c || !c.betRequest) return;
    playSfx('fine');
    this.pushToast('Le parieur a filé sans payer ! Arnaque.', '#e57373');
    this.showEvents(applyBettingError(this.ctx.state, c.betRequest.stake));
    // Letting the fraudster leave without paying = complicit -> enabledFraud.
    this.tagStory(c, 'sell');
    this.advance('angry');
  }

  /** Mode B: nudge an entered score digit (0..20). */
  private bumpScore(which: 'a' | 'b', delta: number): void {
    if (which === 'a') this.scoreA = Math.max(0, Math.min(20, this.scoreA + delta));
    else this.scoreB = Math.max(0, Math.min(20, this.scoreB + delta));
    playSfx('click');
  }

  /** Mode B: pay the claimed win — correct only for a real, finished, winning ticket. */
  private payTicket(): void {
    const c = this.client;
    if (!c || !c.ticket) return;
    const m = matchById(this.ctx.state.day, c.ticket.matchId);
    // The player must transcribe the official score: the terminal settles from
    // the ENTERED score, so for a finished match it refuses to pay out a result
    // that contradicts the official one (forces a correct transcription).
    const realOutcome =
      m && m.status === 'done' && m.finalScore ? outcomeFromScore(m.finalScore) : null;
    const enteredOutcome = outcomeFromScore({ a: this.scoreA, b: this.scoreB });
    if (realOutcome !== null && enteredOutcome !== realOutcome) {
      playSfx('click');
      this.pushToast('Saisie incohérente avec le score officiel.', '#ffd54f');
      return; // no advance — let the player correct the entered score
    }

    const gain = m ? payout(c.ticket, m) : 0;
    if (gain > 0) {
      // Legitimate winning payout (finished match, score transcribed, pick wins):
      // the gain leaves the till.
      this.ctx.state.dayRevenue = round2(this.ctx.state.dayRevenue - gain);
      playSfx('sale');
      this.floatMoney(`-${gain.toFixed(2)} €`, PAL.tobaccoRed);
      this.pushToast(`Ticket gagnant payé : -${gain.toFixed(2)} €.`, '#9ccc65');
    } else {
      // Losing / fake / unfinished ticket paid out -> loss + fault.
      const loss = m ? round2(c.ticket.stake * oddsForPick(m.odds, c.ticket.pick)) : c.ticket.stake;
      playSfx('fine');
      this.pushToast('Ticket non gagnant payé !', '#e57373');
      this.showEvents(applyBettingError(this.ctx.state, loss));
      // Paying out the fraudster's bad ticket = complicit -> enabledFraud.
      this.tagStory(c, 'sell');
    }
    this.advance(gain > 0 ? 'happy' : 'neutral');
  }

  /** Mode B: refuse the payout — correct for a losing / fake / unfinished ticket. */
  private refusePay(): void {
    const c = this.client;
    if (!c || !c.ticket) return;
    const m = matchById(this.ctx.state.day, c.ticket.matchId);
    const gain = m ? payout(c.ticket, m) : 0;
    playSfx('refuse');
    if (gain > 0) {
      this.pushToast('Ticket gagnant refusé à tort.', '#e57373');
      this.showEvents(applyBettingError(this.ctx.state, 0));
    } else {
      this.pushToast('Refus justifié : ticket non gagnant.', '#9ccc65');
    }
    this.advance();
  }

  // --- queue progression -----------------------------------------------------

  private advance(exitKind: ExitKind = 'neutral'): void {
    // Kick off the leaving client's slide-out before the index moves on.
    this.startExit(exitKind);
    // The counter clock ticks forward with every client served, so upcoming
    // matches cross their kickoff into "started" as the day goes on.
    this.ctx.state.clock = nextClock(this.ctx.state.clock ?? START_CLOCK);
    this.index += 1;
    if (this.index >= this.queue.length) {
      this.endOfDay();
      return;
    }
    this.setupClient();
  }

  private clientLeft(c: Client): void {
    // A betting client carries a placeholder product, so it must NOT be scored via
    // the product-sale channel: an impatient punter who leaves before their bet is
    // even placed/settled is just a lost punter (no completed bet to fault).
    if (isBettingClient(c)) {
      this.pushToast('Le parieur s’impatiente et s’en va.', '#ffd54f');
      this.advance('angry');
      return;
    }
    // A walk-out only counts as a fault (lost regular) if the sale was legitimate.
    const legit = evaluateDecision(c, 'sell', this.rules).correct;
    if (legit) {
      const decision: Decision = { client: c, action: 'refuse', correct: false };
      const events = applyConsequence(this.ctx.state, decision);
      this.pushToast('Le client s’impatiente et s’en va ! Client régulier perdu.', '#e57373');
      this.showEvents(events);
    } else {
      this.pushToast('Le client s’impatiente et s’en va.', '#ffd54f');
    }
    this.advance('angry');
  }

  private endOfDay(): void {
    playSfx('day');
    // The end-of-day inspection runs exactly once, inside DayEndScene.enter().
    this.ctx.goTo(new DayEndScene(this.ctx));
  }

  // --- feedback toasts -------------------------------------------------------

  private showEvents(events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'fine' || e.type === 'inspection') {
        playSfx('fine');
        // Punchy "you got caught" feedback: red flash + camera shake.
        flash(PAL.tobaccoRed, 0.28);
        shake(4, 0.34);
      }
      this.pushToast(e.message, eventColor(e.type));
    }
  }

  /** Spawn a rising "+X €" / "-X €" float above the counter on a money move. */
  private floatMoney(text: string, color: string): void {
    floatText(text, 234, 198, color);
  }

  private pushToast(message: string, color: string): void {
    this.toasts.push({ message, color, t: TOAST_TTL });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  // --- loop ------------------------------------------------------------------

  update(dt: number): void {
    const sec = Math.min(dt, 0.1); // dt is already in seconds; clamp huge frame gaps

    // Cosmetic animation clocks tick in every sub-step (never gate gameplay).
    this.tweens.update(sec);
    this.animTime += sec;
    if (this.blinking > 0) {
      this.blinking -= sec;
    } else {
      this.blinkTimer -= sec;
      if (this.blinkTimer <= 0) {
        this.blinking = 0.11;
        this.blinkTimer = 1.8 + Math.random() * 2.6;
      }
    }

    for (const toast of this.toasts) toast.t -= sec;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      if (this.toasts[i].t <= 0) this.toasts.splice(i, 1);
    }

    // A fraudster who registered a bet flees if not collected/cancelled in time.
    if (this.step === 'betting' && this.betRegistered && this.betLeaveTimer > 0) {
      this.betLeaveTimer -= sec;
      if (this.betLeaveTimer <= 0) this.betScammed();
      return;
    }

    if (this.step !== 'service') return;
    const c = this.client;
    if (!c) return;
    c.patience = clamp(c.patience - PATIENCE_DRAIN_PER_SEC * sec);
    if (c.patience <= 0) this.clientLeft(c);
  }

  onClick(p: { x: number; y: number }): void {
    // The rules popup is a scene-level modal: while open it swallows only
    // scene-level clicks (so nothing falls through to VENDRE/REFUSER). The
    // control bar stays live above it (clicks are dispatched here after
    // controls.onClick). Only its close button or the icon itself dismisses it.
    if (this.showRules) {
      if (inRect(p, this.rulesPopupGeom().close) || inRect(p, RULES_ICON)) {
        this.showRules = false;
        playSfx('click');
      }
      return;
    }
    // The clipboard icon toggles the popup open, in any sub-step.
    if (inRect(p, RULES_ICON)) {
      this.showRules = true;
      playSfx('click');
      return;
    }

    if (this.step === 'change') {
      this.clickChange(p);
      return;
    }
    if (this.step === 'betting') {
      this.clickBetting(p);
      return;
    }
    this.clickService(p);
  }

  private clickService(p: { x: number; y: number }): void {
    // Tool buttons (only react when their rule is active).
    if (this.has('age') && this.btnCNI.hit(p)) return this.btnCNI.click();
    if (this.has('drunk') && this.btnObserve.hit(p)) {
      playSfx('click');
      return this.btnObserve.click();
    }
    if (this.has('banList') && this.btnBanList.hit(p)) {
      playSfx('click');
      return this.btnBanList.click();
    }
    // A betting client offers only the FDJ terminal (no plain sale / refuse).
    if (isBettingClient(this.client)) {
      if (this.btnOpenTerminal.hit(p)) return this.btnOpenTerminal.click();
      return;
    }
    // VENDRE is replaced by BLUFFER when we don't actually carry the request.
    if (this.canBluff(this.client)) {
      if (this.btnBluff.hit(p)) return this.btnBluff.click();
    } else if (this.btnSell.hit(p)) {
      return this.btnSell.click();
    }
    if (this.btnRefuse.hit(p)) return this.btnRefuse.click();
  }

  private clickBetting(p: { x: number; y: number }): void {
    if (this.betMode === 'place') {
      if (!this.betRegistered) {
        // Select a match by clicking its row in the list.
        const rowH = 12;
        const listX = 104;
        const listW = 248;
        const listY = 70;
        for (let i = 0; i < this.betMatches.length; i++) {
          const ry = listY + i * rowH;
          if (inRect(p, { x: listX, y: ry, w: listW, h: rowH - 1 })) {
            return this.selectMatch(this.betMatches[i].id);
          }
        }
        if (this.btnTakeBet.hit(p)) return this.btnTakeBet.click();
        if (this.btnRefuseBet.hit(p)) return this.btnRefuseBet.click();
        return;
      }
      if (this.btnCashIn.hit(p)) return this.btnCashIn.click();
      if (this.btnCancelBet.hit(p)) return this.btnCancelBet.click();
      return;
    }
    // Mode B (settle a ticket).
    if (this.btnScoreAUp.hit(p)) return this.btnScoreAUp.click();
    if (this.btnScoreADown.hit(p)) return this.btnScoreADown.click();
    if (this.btnScoreBUp.hit(p)) return this.btnScoreBUp.click();
    if (this.btnScoreBDown.hit(p)) return this.btnScoreBDown.click();
    if (this.btnPay.hit(p)) return this.btnPay.click();
    if (this.btnRefusePay.hit(p)) return this.btnRefusePay.click();
  }

  private clickChange(p: { x: number; y: number }): void {
    if (this.tray.hit(p)) {
      this.tray.click(p);
      playSfx('coin');
      return;
    }
    if (this.btnReset.hit(p)) return this.btnReset.click();
    if (this.btnCancel.hit(p)) return this.btnCancel.click();
    if (this.btnConfirm.hit(p)) return this.btnConfirm.click();
  }

  // --- render ----------------------------------------------------------------

  render(r: Renderer): void {
    r.clear(PAL.bg);

    // 1. Pack wall across the back wall.
    paintShelf(r, this.packs);

    // 2. Client framed at the window (behind the counter).
    const c = this.client;
    if (c) this.drawWindow(r, c);

    // 3. Wooden counter in the foreground + the FDJ terminal on the back ledge.
    drawCounter(r);
    drawTerminalFDJ(r, LAYOUT.terminalFDJ.x + 8, LAYOUT.terminalFDJ.y + 2);

    // 4. Speech bubble with the French request.
    if (c) this.drawBubble(r, c);

    // 5. Top HUD (patience bar + counters) and the day's rules notice.
    this.drawTopBar(r);
    if (c)
      paintPatience(
        r,
        LAYOUT.patienceBar.x,
        LAYOUT.patienceBar.y,
        LAYOUT.patienceBar.w,
        clamp(c.patience) / 100,
      );

    // 6. Step-specific layer.
    if (this.step === 'change') {
      this.drawChange(r, c);
    } else if (this.step === 'betting') {
      this.drawBetting(r);
    } else if (isBettingClient(c)) {
      // Betting client at the counter: a bet coupon (gently bobbing) + terminal button.
      drawBetSlip(r, 216, 210 + wobble(this.animTime, 1, 1.4), c?.ticket ? PAL.fdjYellow : PAL.fdjRed);
      this.drawTools(r);
      this.drawOverlays(r);
      this.btnOpenTerminal.draw(r);
    } else {
      if (c) this.drawProduct(r, c);
      this.drawTools(r);
      this.drawOverlays(r);
      if (this.canBluff(c)) this.btnBluff.draw(r);
      else this.btnSell.draw(r);
      this.btnRefuse.draw(r);
    }

    // 7. Feedback toasts on top.
    this.drawToasts(r);

    // 8. Rules popup is a modal overlay drawn above everything else.
    if (this.showRules) this.drawRulesPopup(r);
  }

  /** The client window: framed recess carved into the pack wall, client inside. */
  private drawWindow(r: Renderer, c: Client): void {
    const w = LAYOUT.clientWindow;

    // Frame + recess.
    r.rect(w.x - 4, w.y - 4, w.w + 8, w.h + 8, PAL.woodDark);
    r.stroke(w.x - 4, w.y - 4, w.w + 8, w.h + 8, PAL.ink, 1);
    r.rect(w.x, w.y, w.w, w.h, PAL.shadow);
    r.hline(w.x, w.y, w.w, PAL.wallDark);
    r.hline(w.x + 1, w.y + 1, w.w - 2, PAL.wall);
    // Window mullion lip at the bottom (a little sill).
    r.hline(w.x, w.y + w.h - 1, w.w, PAL.woodLight);

    const cx = w.x + w.w / 2;
    const baseY = w.y + 34;
    const ctx = r.ctx;

    // Clip every animated bust to the window recess so slides never spill onto
    // the frame / pack wall.
    ctx.save();
    ctx.beginPath();
    ctx.rect(w.x, w.y, w.w, w.h);
    ctx.clip();

    // Outgoing client sliding out of frame (cosmetic; already left the queue).
    const out = this.outgoing;
    if (out && out.alpha > 0) {
      this.flatten(r, out.alpha, (rr) => {
        paintClient(rr, cx + out.offsetX, baseY + out.nod, {
          drunk: out.drunk,
          mood: out.mood,
          look: out.client.look,
        });
      });
    }

    // Current client: idle bob, drunk sway, impatience fidget, blink + fade-in.
    const drunk = this.has('drunk') && !!c.isDrunk;
    const bob = wobble(this.animTime, 1, 1.7);
    const sway = drunk ? wobble(this.animTime, 2, 1.2) : 0;
    const p = clamp(c.patience);
    const anxiety = p < 50 ? (50 - p) / 50 : 0; // 0 (calm) .. 1 (frantic)
    const fidget = anxiety > 0 ? wobble(this.animTime, 1 + Math.round(anxiety * 2), 0.16) : 0;
    const mood: 'neutral' | 'angry' | 'happy' =
      c.patience < 30 ? 'angry' : c.patience > 80 ? 'happy' : 'neutral';
    const drawX = cx + this.clientOffsetX + sway + fidget;
    const drawY = baseY + bob + this.clientNod;

    this.flatten(r, this.clientAlpha, (rr) => {
      paintClient(rr, drawX, drawY, { drunk, mood, look: c.look });
    });
    // Blink is drawn directly: it only fires once the fade has settled (alpha 1).
    if (this.blinking > 0) this.drawBlink(r, drawX, drawY, c, drunk);

    ctx.restore();
  }

  /**
   * Paint a bust at `alpha`. At full opacity it draws straight to the screen.
   * While fading it renders opaque into an offscreen backbuffer and blits the
   * flat result once, so overlapping fills never double-blend into ghosted seams.
   * Falls back to a plain globalAlpha blend if no offscreen canvas is available.
   */
  private flatten(dest: Renderer, alpha: number, paint: (rr: Renderer) => void): void {
    const a = Math.max(0, Math.min(1, alpha));
    if (a <= 0) return;
    if (a >= 1) {
      paint(dest);
      return;
    }
    if (!this.scratch) {
      try {
        const cv = document.createElement('canvas');
        cv.width = VW;
        cv.height = VH;
        const sctx = cv.getContext('2d');
        if (sctx) {
          this.scratchCanvas = cv;
          this.scratch = new Renderer(sctx);
        }
      } catch {
        this.scratch = null;
      }
    }
    if (!this.scratch || !this.scratchCanvas) {
      // No offscreen buffer: fall back to a direct (slightly seamed) alpha blend.
      const prev = dest.ctx.globalAlpha;
      dest.ctx.globalAlpha = a;
      paint(dest);
      dest.ctx.globalAlpha = prev;
      return;
    }
    this.scratch.ctx.clearRect(0, 0, VW, VH);
    paint(this.scratch);
    const prev = dest.ctx.globalAlpha;
    dest.ctx.globalAlpha = a;
    // Respects dest's active window clip; the scratch is the same 480x270 space.
    dest.ctx.drawImage(this.scratchCanvas, 0, 0);
    dest.ctx.globalAlpha = prev;
  }

  /** Overlay shut eyelids on the current bust during a blink (matches drawClient). */
  private drawBlink(r: Renderer, drawX: number, drawY: number, c: Client, drunk: boolean): void {
    const droop = drunk ? 2 : 0;
    const hy = Math.round(drawY) - 2 + droop;
    const eyeY = hy + 11 + droop;
    const hx = Math.round(drawX) - 14; // head width 28 => hx = x - hw/2
    const lex = hx + 7;
    const rex = hx + 19; // hx + hw - 9
    const skin = c.look?.skin ?? PAL.skin;
    r.rect(lex, eyeY, 5, 4, skin);
    r.rect(rex, eyeY, 5, 4, skin);
    r.hline(lex, eyeY + 2, 5, PAL.ink);
    r.hline(rex, eyeY + 2, 5, PAL.ink);
  }

  private drawBubble(r: Renderer, c: Client): void {
    const sb = LAYOUT.speechBubble;
    drawSpeechBubble(r, sb.x, sb.y, sb.w, this.bubbleText(c));
  }

  /** Speech text: a betting client states their bet/ticket, others their product. */
  private bubbleText(c: Client): string {
    if (c.betRequest) {
      const m = matchById(this.ctx.state.day, c.betRequest.matchId);
      const teams = m ? `${m.teamA}-${m.teamB}` : 'le match';
      return `Je mise ${c.betRequest.stake} € sur ${pickLabel(c.betRequest.pick, m)} — ${teams}.`;
    }
    if (c.ticket) {
      const m = matchById(this.ctx.state.day, c.ticket.matchId);
      const teams = m ? `${m.teamA}-${m.teamB}` : 'mon match';
      return `J'ai un ticket gagnant sur ${teams}, je viens encaisser !`;
    }
    return `Bonjour, je voudrais ${c.request.name}.`;
  }

  /** The requested product shown as a sprite on the counter, with a price tag. */
  private drawProduct(r: Renderer, c: Client): void {
    // Typed as string so new expansion categories ('cbd' / 'presse' / 'vape')
    // can be matched even before they are added to the Category union.
    const cat: string = c.request.category;
    const tint = c.request.color;
    const baseY = 212;
    const cx = 232;
    let rightEdge = cx + 14;

    if (c.request.id === 'virgam-sacre') {
      // The dubious "sacred relic" joke product.
      drawFakeRelic(r, cx - 2, baseY);
      rightEdge = cx + 16;
    } else if (c.request.id === 'biere-8-6' || c.request.id === 'ciao-kombucha') {
      // Tall cans.
      drawCan(r, cx + 1, baseY + 2, tint ?? PAL.mutedGreen);
      rightEdge = cx + 11;
    } else if (cat === 'jeux') {
      drawTicket(r, cx - 12, baseY + 2, tint ?? PAL.mutedGreen);
      rightEdge = cx - 12 + 40;
    } else if (cat === 'alcool') {
      // Simple bottle.
      r.rect(cx + 4, baseY, 4, 6, PAL.mutedGreen);
      r.rect(cx + 5, baseY - 2, 2, 2, PAL.ink);
      r.rect(cx, baseY + 6, 12, 22, PAL.mutedGreen);
      r.stroke(cx, baseY + 6, 12, 22, PAL.ink, 1);
      r.rect(cx + 1, baseY + 14, 10, 8, PAL.paper);
      r.hline(cx + 2, baseY + 16, 8, PAL.tobaccoRed);
      r.hline(cx + 2, baseY + 19, 8, PAL.skinShadow);
      r.vline(cx + 1, baseY + 8, 6, PAL.woodLight);
      rightEdge = cx + 12;
    } else if (cat === 'epicerie') {
      // Boxed grocery item.
      r.rect(cx, baseY + 4, 20, 22, PAL.wood);
      r.stroke(cx, baseY + 4, 20, 22, PAL.ink, 1);
      r.hline(cx + 1, baseY + 5, 18, PAL.woodLight);
      r.rect(cx + 3, baseY + 9, 14, 9, PAL.paper);
      r.hline(cx + 4, baseY + 11, 12, PAL.ink);
      r.hline(cx + 4, baseY + 14, 12, PAL.tobaccoRed);
      rightEdge = cx + 20;
    } else if (cat === 'cbd') {
      // CBD product — shared sprite drawCBD(r,x,y,color), else a small jar.
      const fn = spriteFns.drawCBD;
      if (fn) {
        fn(r, cx, baseY, tint ?? PAL.mutedGreen);
      } else {
        r.rect(cx + 1, baseY + 6, 12, 20, tint ?? PAL.mutedGreen);
        r.stroke(cx + 1, baseY + 6, 12, 20, PAL.ink, 1);
        r.rect(cx + 3, baseY + 2, 8, 5, PAL.woodDark); // lid
        r.stroke(cx + 3, baseY + 2, 8, 5, PAL.ink, 1);
        r.rect(cx + 3, baseY + 12, 8, 7, PAL.offWhite); // label
      }
      rightEdge = cx + 14;
    } else if (cat === 'presse') {
      // Magazine / newspaper — shared sprite drawMagazine, else a paper booklet.
      const fn = spriteFns.drawMagazine;
      if (fn) {
        fn(r, cx - 6, baseY, tint ?? PAL.offWhite);
      } else {
        r.rect(cx - 6, baseY + 2, 26, 24, tint ?? PAL.offWhite);
        r.stroke(cx - 6, baseY + 2, 26, 24, PAL.ink, 1);
        r.vline(cx - 6, baseY + 2, 24, PAL.skinShadow); // spine
        r.hline(cx - 2, baseY + 7, 16, PAL.ink); // headline
        r.hline(cx - 2, baseY + 11, 16, PAL.skinShadow);
        r.hline(cx - 2, baseY + 14, 12, PAL.skinShadow);
      }
      rightEdge = cx - 6 + 26;
    } else if (cat === 'vape') {
      // Vape / e-cigarette — shared sprite drawVape, else a slim pen.
      const fn = spriteFns.drawVape;
      if (fn) {
        fn(r, cx + 2, baseY, tint ?? PAL.fdjRed);
      } else {
        r.rect(cx + 4, baseY + 3, 6, 23, tint ?? PAL.fdjRed);
        r.stroke(cx + 4, baseY + 3, 6, 23, PAL.ink, 1);
        r.rect(cx + 5, baseY, 4, 4, PAL.ink); // mouthpiece
        r.px(cx + 7, baseY + 23, PAL.offWhite); // LED tip
      }
      rightEdge = cx + 12;
    } else {
      // Tabac — cigarette pack (brand tint).
      drawCigarettePack(r, cx, baseY, tint ?? PAL.tobaccoRed);
      rightEdge = cx + 14;
    }

    // Hanging paper price tag to the right of the product.
    const txt = `${c.request.price.toFixed(2)} €`;
    const tagX = rightEdge + 6;
    const tagY = baseY + 8;
    const tw = r.measure(txt, 1) + 6;
    r.px(tagX - 2, tagY + 4, PAL.ink);
    r.px(tagX - 1, tagY + 4, PAL.ink);
    r.rect(tagX, tagY, tw, 11, PAL.paper);
    r.stroke(tagX, tagY, tw, 11, PAL.ink, 1);
    r.hline(tagX + 1, tagY + 1, tw - 2, PAL.offWhite);
    r.text(txt, tagX + 3, tagY + 2, { color: PAL.ink, scale: 1, align: 'left' });
  }

  /** Top HUD: dark ledger strip with the counters + the day's rules notice. */
  private drawTopBar(r: Renderer): void {
    const s = this.ctx.state;

    // HUD strip.
    r.rect(0, 0, VW, 16, PAL.woodDark);
    r.hline(0, 15, VW, PAL.ink);

    const total = this.queue.length;
    const num = Math.min(this.index + 1, total);
    const hud =
      `JOUR ${s.day}   REC ${s.dayRevenue.toFixed(0)}€   ` +
      `CAISSE ${s.cash.toFixed(0)}€   AV ${s.warnings}   ${num}/${total}`;
    r.text(hud, VW - 6, 5, { color: PAL.fdjYellow, scale: 1, align: 'right' });

    // Day's rules — a small clickable clipboard icon (opens the rules popup).
    // Keeps the HUD compact as the rule set grows.
    this.drawRulesIcon(r);
  }

  /** Clipboard icon (beveled button) used to open the day's rules popup. */
  private drawRulesIcon(r: Renderer): void {
    const { x, y, w, h } = RULES_ICON;
    // Beveled button plate so it reads as clickable, like the other buttons.
    r.rect(x, y, w, h, PAL.wood);
    r.hline(x + 1, y + 1, w - 2, PAL.woodLight);
    r.vline(x + 1, y + 1, h - 2, PAL.woodLight);
    r.hline(x + 1, y + h - 2, w - 2, PAL.shadow);
    r.vline(x + w - 2, y + 1, h - 2, PAL.shadow);
    r.stroke(x, y, w, h, PAL.ink, 1);

    // Inset clipboard glyph.
    const ix = x + 3;
    const iy = y + 3;
    const iw = w - 6;
    const ih = h - 5;
    r.rect(ix, iy, iw, ih, PAL.paper);
    r.stroke(ix, iy, iw, ih, PAL.ink, 1);
    // Printed rule lines.
    r.hline(ix + 2, iy + 2, iw - 4, PAL.ink);
    r.hline(ix + 2, iy + 4, iw - 5, PAL.skinShadow);
    r.hline(ix + 2, iy + 6, iw - 4, PAL.ink);
    // Yellow clip at the very top so it pops.
    r.rect(x + Math.round(w / 2) - 2, y - 1, 4, 3, PAL.fdjYellow);
    r.stroke(x + Math.round(w / 2) - 2, y - 1, 4, 3, PAL.ink, 1);
  }

  /** Geometry of the centered rules popup, derived from the active rules. */
  private rulesPopupGeom(): { rect: Rect; lines: string[]; close: Rect } {
    const W = 448;
    const X = 16;
    const pad = 8;
    const lineH = 10;
    const btnH = 16;
    const maxChars = Math.max(8, Math.floor((W - pad * 2) / 6));

    const lines: string[] = [];
    if (this.rules.length === 0) {
      lines.push("Aucune règle active aujourd'hui.");
    } else {
      let n = 1;
      for (const rule of this.rules) {
        for (const wl of wrapText(`${n}. ${rule.description}`, maxChars)) lines.push(wl);
        n++;
      }
    }

    const h = 16 + lines.length * lineH + 6 + btnH + 4;
    const y = Math.round((VH - h) / 2);
    const rect: Rect = { x: X, y, w: W, h };
    const close: Rect = { x: X + W / 2 - 32, y: y + h - btnH - 4, w: 64, h: btnH };
    return { rect, lines, close };
  }

  /** Modal popup listing every active rule (data-driven from rule.description). */
  private drawRulesPopup(r: Renderer): void {
    const { rect, lines, close } = this.rulesPopupGeom();
    new Panel(rect, { title: 'RÈGLES DU JOUR' }).draw(r);

    let ty = rect.y + 16;
    for (const line of lines) {
      r.text(line, rect.x + 8, ty, { color: PAL.offWhite, scale: 1, align: 'left' });
      ty += 10;
    }

    // Close button.
    r.rect(close.x, close.y, close.w, close.h, PAL.tobaccoRed);
    r.stroke(close.x, close.y, close.w, close.h, PAL.ink, 1);
    r.hline(close.x + 1, close.y + 1, close.w - 2, PAL.offWhite);
    r.text('FERMER', close.x + close.w / 2, close.y + close.h / 2 - 3, {
      color: PAL.offWhite,
      scale: 1,
      align: 'center',
    });
  }

  private drawTools(r: Renderer): void {
    if (this.has('age')) {
      this.btnCNI.disabled = false;
      this.btnCNI.draw(r);
    }
    if (this.has('drunk')) {
      this.btnObserve.disabled = false;
      this.btnObserve.draw(r);
    }
    if (this.has('banList')) {
      this.btnBanList.disabled = false;
      this.btnBanList.draw(r);
    }
  }

  private drawOverlays(r: Renderer): void {
    const c = this.client;

    // CNI document in its slot on the counter.
    if (this.showDoc && c) {
      const dy = LAYOUT.cniSlot.y + Math.round(this.docSlam);
      drawCNI(r, LAYOUT.cniSlot.x, dy, {
        name: c.fullName,
        birth: formatDate(c.birthDate),
      });
      const age = ageFrom(c.birthDate);
      r.text(`${age} ans aujourd'hui`, LAYOUT.cniSlot.x, dy + LAYOUT.cniSlot.h + 2, {
        color: PAL.offWhite,
        scale: 1,
        align: 'left',
      });
    }

    // Ban list (fichier des interdits) panel. No auto-verdict: the player must
    // read the list and decide whether the client's name is in it.
    if (this.showBanList) {
      this.banList.draw(r);
    }

    // Observation result banner.
    if (this.has('drunk') && this.observed && c) {
      const msg = c.isDrunk
        ? 'Il titube et sent fortement l’alcool.'
        : 'Regard clair. Il a l’air sobre.';
      const col = c.isDrunk ? PAL.tobaccoRed : PAL.mutedGreen;
      const w = Math.min(VW - 40, r.measure(msg, 1) + 10);
      const x = Math.round((VW - w) / 2);
      const y = 196;
      r.rect(x, y, w, 12, PAL.ink);
      r.stroke(x, y, w, 12, col, 1);
      r.text(msg, x + 5, y + 3, { color: col, scale: 1, align: 'left' });
    }
  }

  private drawChange(r: Renderer, c: Client | undefined): void {
    new Panel({ x: 100, y: 148, w: 300, h: 112 }, { title: 'CAISSE — RENDEZ LA MONNAIE' }).draw(r);
    if (c) {
      r.text(`Paie ${c.request.price.toFixed(2)}€ avec ${this.bill}€`, 108, 162, {
        color: PAL.offWhite,
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
    this.btnCancel.draw(r);
    this.btnConfirm.draw(r);
  }

  /** The FDJ betting sub-panel: Mode A (place a bet) or Mode B (settle a ticket). */
  private drawBetting(r: Renderer): void {
    new Panel(BET_PANEL, { title: 'TERMINAL FDJ — PARIS SPORTIFS' }).draw(r);

    // Current counter clock (the judge-the-clock channel).
    r.text(`Horloge : ${this.clock}`, BET_PANEL.x + 8, BET_PANEL.y + 14, {
      color: PAL.fdjYellow,
      scale: 1,
      align: 'left',
    });

    if (this.betMode === 'place') this.drawBettingPlace(r);
    else this.drawBettingSettle(r);
  }

  /** Mode A panel: the day's match list (or the registered-bet collection view). */
  private drawBettingPlace(r: Renderer): void {
    const c = this.client;

    if (!this.betRegistered) {
      r.text('Sélectionnez le match nommé, puis prenez le pari.', BET_PANEL.x + 8, BET_PANEL.y + 26, {
        color: PAL.offWhite,
        scale: 1,
        align: 'left',
      });
      const rowH = 12;
      const listX = 104;
      const listW = 248;
      const listY = 70;
      this.betMatches.forEach((m, i) => {
        const ry = listY + i * rowH;
        drawMatchRow(r, listX, ry, listW, {
          teamA: m.teamA,
          teamB: m.teamB,
          kickoff: m.kickoff,
          started: hasStarted(m.kickoff, this.clock),
        });
        // Selection highlight frame around the chosen row.
        if (m.id === this.betSelectedId) {
          r.stroke(listX - 1, ry - 1, listW + 2, rowH, PAL.fdjYellow, 1);
        }
      });
      this.btnTakeBet.draw(r);
      this.btnRefuseBet.draw(r);
      return;
    }

    // Registered: a coupon + the plea, awaiting collection.
    drawBetSlip(r, 120, 80, PAL.fdjRed);
    const m = c?.betRequest ? matchById(this.ctx.state.day, c.betRequest.matchId) : undefined;
    const stake = c?.betRequest?.stake ?? 0;
    const tx = 168;
    r.text('Pari enregistré :', tx, 84, { color: PAL.offWhite, scale: 1, align: 'left' });
    if (m) r.text(`${m.teamA} - ${m.teamB}`, tx, 96, { color: PAL.paper, scale: 1, align: 'left' });
    if (c?.betRequest)
      r.text(`Choix : ${pickLabel(c.betRequest.pick, m)}`, tx, 106, {
        color: PAL.paper,
        scale: 1,
        align: 'left',
      });
    r.text(`Mise à encaisser : ${stake.toFixed(2)} €`, tx, 116, {
      color: PAL.fdjYellow,
      scale: 1,
      align: 'left',
    });
    const plea = c?.fraudster
      ? 'Le client : « Je file, je reviens payer après le match ! »'
      : 'Encaissez la mise pour conclure le pari.';
    r.text(plea, BET_PANEL.x + 8, 150, { color: PAL.tobaccoRed, scale: 1, align: 'left' });
    if (this.betLeaveTimer > 0) {
      r.text(`Le client s'impatiente : ${Math.ceil(this.betLeaveTimer)}s`, BET_PANEL.x + 8, 162, {
        color: PAL.fdjRed,
        scale: 1,
        align: 'left',
      });
    }
    this.btnCashIn.draw(r);
    this.btnCancelBet.draw(r);
  }

  /** Mode B panel: the ticket, the official result, and the score-entry box. */
  private drawBettingSettle(r: Renderer): void {
    const c = this.client;
    const ticket = c?.ticket;
    const m = ticket ? matchById(this.ctx.state.day, ticket.matchId) : undefined;

    drawBetSlip(r, 104, 50, PAL.fdjYellow);
    const tx = 150;
    r.text('Ticket présenté :', tx, 44, { color: PAL.offWhite, scale: 1, align: 'left' });
    if (m) r.text(`${m.teamA} - ${m.teamB}`, tx, 54, { color: PAL.paper, scale: 1, align: 'left' });
    if (ticket)
      r.text(`Pari : ${pickLabel(ticket.pick, m)}  Mise : ${ticket.stake} €`, tx, 64, {
        color: PAL.paper,
        scale: 1,
        align: 'left',
      });

    const done = !!m && m.status === 'done' && !!m.finalScore;
    if (done && m && m.finalScore) {
      r.text(
        `Match terminé — score officiel : ${m.finalScore.a} - ${m.finalScore.b}`,
        BET_PANEL.x + 8,
        82,
        { color: PAL.mutedGreen, scale: 1, align: 'left' },
      );
    } else {
      r.text('Match NON terminé — aucun score officiel.', BET_PANEL.x + 8, 82, {
        color: PAL.fdjRed,
        scale: 1,
        align: 'left',
      });
    }

    r.text('Saisissez le score final :', BET_PANEL.x + 8, 92, {
      color: PAL.offWhite,
      scale: 1,
      align: 'left',
    });
    drawScoreEntry(r, 197, 122, this.scoreA, this.scoreB);
    this.btnScoreAUp.draw(r);
    this.btnScoreADown.draw(r);
    this.btnScoreBUp.draw(r);
    this.btnScoreBDown.draw(r);

    // Terminal verdict computed live from the ENTERED score (no auto-reveal).
    // Only a finished match can be settled: an unfinished ticket shows no
    // win/lose verdict, so a fraudster's "ticket gagnant" can't be lured into PAYER.
    if (ticket && done) {
      const entered = outcomeFromScore({ a: this.scoreA, b: this.scoreB });
      const win = entered === ticket.pick;
      r.text(
        `Issue saisie : ${pickLabel(entered, m)} — ${win ? 'TICKET GAGNANT' : 'TICKET PERDANT'}`,
        BET_PANEL.x + 8,
        165,
        { color: win ? PAL.mutedGreen : PAL.tobaccoRed, scale: 1, align: 'left' },
      );
    } else if (ticket) {
      r.text('Règlement impossible : match non terminé.', BET_PANEL.x + 8, 165, {
        color: PAL.tobaccoRed,
        scale: 1,
        align: 'left',
      });
    }

    this.btnPay.draw(r);
    this.btnRefusePay.draw(r);
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

/** Numeric sequence parsed from a client id like 'client-007' -> 7. */
function seqOf(c: Client): number {
  const m = /(\d+)/.exec(c.id);
  return m ? parseInt(m[1], 10) : 0;
}

/** Smallest sensible bill/coin a customer hands over for a given price. */
function chooseBill(price: number): number {
  const bills = [5, 10, 20, 50];
  for (const b of bills) {
    if (b >= price) return b;
  }
  return Math.ceil(price / 50) * 50;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const EVENT_COLORS: Record<GameEvent['type'], string> = {
  warning: '#ffd54f',
  fine: '#e57373',
  inspection: '#ef5350',
  patience: '#ffb74d',
};

function eventColor(type: GameEvent['type']): string {
  return EVENT_COLORS[type];
}
