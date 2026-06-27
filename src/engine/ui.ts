// Reusable canvas UI widgets for Tabaco Please — PIXEL-ART style.
// Each visible widget exposes draw(r: Renderer); clickable widgets also have hit(p).
// Chunky beveled blocks, double pixel borders, paper/wood looks. Colors from PAL,
// text via the renderer bitmap font. NO rounded corners, NO anti-aliasing.
// Public signatures are unchanged so scenes/tests keep compiling.

import type { Renderer } from './renderer';
import { PAL } from './palette';
import { drawPiece } from './sprites';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Point-in-rectangle test (inclusive of the top-left edges). */
export function inRect(p: { x: number; y: number }, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Clickable button with hover + disabled states and a centered label. */
export class Button {
  readonly rect: Rect;
  readonly label: string;
  private readonly onClick: () => void;
  private readonly baseColor: string;
  disabled: boolean;
  /** Visually depressed state (scenes may toggle for click feedback). */
  pressed = false;
  /** Last known pointer, fed via hit(); drives hover styling. */
  private hovered = false;

  constructor(
    r: Rect,
    label: string,
    onClick: () => void,
    opts?: { color?: string; disabled?: boolean }
  ) {
    this.rect = r;
    this.label = label;
    this.onClick = onClick;
    this.baseColor = opts?.color ?? PAL.vertMuted;
    this.disabled = opts?.disabled ?? false;
  }

  draw(r: Renderer): void {
    const { x, y, w, h } = this.rect;

    let fill = this.baseColor;
    let textColor: string = PAL.blancCasse;
    if (this.disabled) {
      fill = PAL.wallDark;
      textColor = PAL.peauOmbre;
    } else if (this.pressed) {
      fill = darken(this.baseColor);
    } else if (this.hovered) {
      fill = darken(this.baseColor);
    }

    // Block body.
    r.rect(x, y, w, h, fill);

    // Hard ink frame.
    r.stroke(x, y, w, h, PAL.ink, 1);

    // Bevel: light top/left, dark bottom/right (inverted when pressed).
    const sunk = this.pressed && !this.disabled;
    const tl = this.disabled ? PAL.wall : sunk ? PAL.ink : PAL.blancCasse;
    const br = this.disabled ? PAL.woodDark : sunk ? PAL.blancCasse : PAL.ombre;
    r.hline(x + 1, y + 1, w - 2, tl);
    r.vline(x + 1, y + 1, h - 2, tl);
    r.hline(x + 1, y + h - 2, w - 2, br);
    r.vline(x + w - 2, y + 1, h - 2, br);

    // Centered label, nudged down a pixel when pressed.
    const off = sunk ? 1 : 0;
    r.text(this.label, x + w / 2 + off, y + h / 2 - 3 + off, {
      color: textColor,
      scale: 1,
      align: 'center',
    });
  }

  hit(p: { x: number; y: number }): boolean {
    this.hovered = !this.disabled && inRect(p, this.rect);
    return inRect(p, this.rect);
  }

  /** Invokes onClick only if not disabled. */
  click(): void {
    if (!this.disabled) this.onClick();
  }
}

/** Titled box / framed container with a double pixel border. */
export class Panel {
  readonly rect: Rect;
  private readonly title?: string;
  private readonly color: string;

  constructor(r: Rect, opts?: { title?: string; color?: string }) {
    this.rect = r;
    this.title = opts?.title;
    this.color = opts?.color ?? PAL.woodDark;
  }

  draw(r: Renderer): void {
    const { x, y, w, h } = this.rect;

    // Body.
    r.rect(x, y, w, h, this.color);

    // Double pixel border: dark outer, lit inner.
    r.stroke(x, y, w, h, PAL.ink, 1);
    r.stroke(x + 1, y + 1, w - 2, h - 2, PAL.woodLight, 1);

    if (this.title) {
      const barH = 11;
      r.rect(x + 2, y + 2, w - 4, barH, PAL.rougeTabac);
      r.hline(x + 2, y + 2, w - 4, PAL.blancCasse);
      r.text(this.title, x + 5, y + 4, {
        color: PAL.blancCasse,
        scale: 1,
        align: 'left',
      });
    }
  }
}

/** CNI-like identity document card with a photo placeholder + label/value rows. */
export class DocumentCard {
  readonly rect: Rect;
  private readonly lines: { label: string; value: string }[];
  private readonly title: string;
  private readonly photo: boolean;

  constructor(
    r: Rect,
    lines: { label: string; value: string }[],
    opts?: { title?: string; photo?: boolean }
  ) {
    this.rect = r;
    this.lines = lines;
    this.title = opts?.title ?? "CARTE NATIONALE D'IDENTITE";
    this.photo = opts?.photo ?? true;
  }

  draw(r: Renderer): void {
    const { x, y, w, h } = this.rect;

    // Cream card with shadow + ink frame.
    r.rect(x + 2, y + 2, w, h, PAL.ombre);
    r.rect(x, y, w, h, PAL.paper);
    r.stroke(x, y, w, h, PAL.ink, 1);
    r.hline(x + 1, y + 1, w - 2, PAL.blancCasse);

    // Header band.
    const bandH = 11;
    r.rect(x + 1, y + 1, w - 2, bandH, PAL.rougeTabac);
    r.text(this.title, x + 4, y + 3, { color: PAL.blancCasse, scale: 1, align: 'left' });

    // Tricolore hint, top-right.
    r.rect(x + w - 13, y + 1, 3, bandH, PAL.vertMuted);
    r.rect(x + w - 10, y + 1, 3, bandH, PAL.paper);
    r.rect(x + w - 7, y + 1, 3, bandH, PAL.fdjRouge);

    const padX = 5;
    let textX = x + padX;
    const contentTop = y + bandH + 6;

    // Photo placeholder (skin block with head silhouette).
    if (this.photo) {
      const pw = 28;
      const ph = Math.min(34, h - bandH - 12);
      const px0 = x + padX;
      const py0 = contentTop;
      r.rect(px0, py0, pw, ph, PAL.peau);
      r.stroke(px0, py0, pw, ph, PAL.ink, 1);
      r.rect(px0 + 9, py0 + 4, 10, 10, PAL.peauOmbre);
      r.rect(px0 + 5, py0 + 15, 18, ph - 15, PAL.peauOmbre);
      textX = px0 + pw + 6;
    }

    // Label / value rows.
    let ry = contentTop;
    for (const line of this.lines) {
      r.text(line.label.toUpperCase(), textX, ry, {
        color: PAL.peauOmbre,
        scale: 1,
        align: 'left',
      });
      r.text(line.value, textX, ry + 8, {
        color: PAL.ink,
        scale: 1,
        align: 'left',
      });
      r.hline(textX, ry + 16, w - (textX - x) - padX, PAL.peauOmbre);
      ry += 20;
    }
  }
}

/** Scrollable / filterable name list (used for the fichier des interdits). */
export class ListView {
  readonly rect: Rect;
  private readonly items: string[];
  private readonly title?: string;
  private query = '';
  private filtered: string[];

  constructor(r: Rect, items: string[], opts?: { title?: string }) {
    this.rect = r;
    this.items = items.slice();
    this.title = opts?.title;
    this.filtered = this.items.slice();
  }

  /** Filter displayed items by a case-insensitive substring query. */
  setQuery(q: string): void {
    this.query = q;
    const needle = q.trim().toLowerCase();
    this.filtered = needle === ''
      ? this.items.slice()
      : this.items.filter((it) => it.toLowerCase().includes(needle));
  }

  /** Exact (case-insensitive) membership test against the full item set. */
  contains(name: string): boolean {
    const target = name.trim().toLowerCase();
    return this.items.some((it) => it.trim().toLowerCase() === target);
  }

  draw(r: Renderer): void {
    const { x, y, w, h } = this.rect;

    // Paper sheet with ink frame.
    r.rect(x, y, w, h, PAL.paper);
    r.stroke(x, y, w, h, PAL.ink, 1);
    r.hline(x + 1, y + 1, w - 2, PAL.blancCasse);

    let listTop = y + 4;
    if (this.title) {
      const barH = 11;
      r.rect(x + 1, y + 1, w - 2, barH, PAL.ink);
      r.text(this.title, x + 4, y + 3, { color: PAL.blancCasse, scale: 1, align: 'left' });
      listTop = y + barH + 4;
    }
    if (this.query) {
      r.text('> ' + this.query, x + 4, listTop, {
        color: PAL.vertMuted,
        scale: 1,
        align: 'left',
      });
      listTop += 10;
    }

    const rowH = 10;
    const maxRows = Math.max(0, Math.floor((y + h - listTop - 4) / rowH));
    const visible = this.filtered.slice(0, maxRows);
    let ry = listTop;
    for (let i = 0; i < visible.length; i++) {
      // Zebra striping for readability.
      if (i % 2 === 1) r.rect(x + 1, ry - 1, w - 2, rowH, PAL.blancCasse);
      r.text(visible[i], x + 5, ry, { color: PAL.ink, scale: 1, align: 'left' });
      ry += rowH;
    }
    if (this.filtered.length > maxRows) {
      r.text(`... +${this.filtered.length - maxRows}`, x + 5, y + h - 9, {
        color: PAL.peauOmbre,
        scale: 1,
        align: 'left',
      });
    }
  }
}

/** Clickable denomination tray; each click adds a coin/bill to a running total. */
export class MoneyTray {
  /** Height reserved at the bottom of the tray for the TOTAL readout. */
  private static readonly TOTAL_BAND = 12;
  readonly rect: Rect;
  private readonly denoms: number[];
  private readonly onChange: (total: number) => void;
  total = 0;
  private readonly cells: Rect[] = [];
  private hoveredIndex = -1;

  constructor(r: Rect, denoms: number[], onChange: (total: number) => void) {
    this.rect = r;
    this.denoms = denoms.slice();
    this.onChange = onChange;
    this.layout();
  }

  private layout(): void {
    const { x, y, w, h } = this.rect;
    const cols = Math.min(this.denoms.length, 5);
    const rows = Math.ceil(this.denoms.length / cols);
    const gap = 2;
    // Reserve a bottom band for the TOTAL readout so cells never sit under it.
    const grid = h - MoneyTray.TOTAL_BAND;
    const cellW = (w - gap * (cols + 1)) / cols;
    const cellH = (grid - gap * (rows + 1)) / rows;
    this.cells.length = 0;
    for (let i = 0; i < this.denoms.length; i++) {
      const c = i % cols;
      const rr = Math.floor(i / cols);
      this.cells.push({
        x: x + gap + c * (cellW + gap),
        y: y + gap + rr * (cellH + gap),
        w: cellW,
        h: cellH,
      });
    }
  }

  draw(r: Renderer): void {
    const { x, y, w, h } = this.rect;

    // Wooden tray with a recessed felt floor.
    r.rect(x, y, w, h, PAL.wood);
    r.stroke(x, y, w, h, PAL.ink, 1);
    r.hline(x + 1, y + 1, w - 2, PAL.woodLight);
    r.hline(x + 1, y + h - 2, w - 2, PAL.woodDark);

    for (let i = 0; i < this.denoms.length; i++) {
      const cell = this.cells[i];
      const denom = this.denoms[i];
      const hovered = i === this.hoveredIndex;

      if (denom >= 5) {
        // Billet — paper note.
        const bx = cell.x;
        const by = cell.y + Math.max(0, (cell.h - 12) / 2);
        const bw = cell.w;
        const bh = Math.min(12, cell.h);
        r.rect(bx, by, bw, bh, hovered ? PAL.blancCasse : PAL.vertMuted);
        r.stroke(bx, by, bw, bh, PAL.ink, 1);
        r.text(formatDenom(denom), bx + bw / 2, by + bh / 2 - 3, {
          color: hovered ? PAL.ink : PAL.blancCasse,
          scale: 1,
          align: 'center',
        });
      } else {
        // Coin sprite centered in the cell.
        const cx = cell.x + cell.w / 2 - 7;
        const cy = cell.y + cell.h / 2 - 7;
        if (hovered) r.rect(cell.x, cell.y, cell.w, cell.h, PAL.woodLight);
        drawPiece(r, cx, cy, denom);
      }
    }

    // Running total readout, in the reserved bottom band (below all cells).
    const bandY = y + h - MoneyTray.TOTAL_BAND;
    r.rect(x + 1, bandY, w - 2, MoneyTray.TOTAL_BAND - 1, PAL.woodDark);
    r.hline(x + 1, bandY, w - 2, PAL.ink);
    r.text(`TOTAL ${this.total.toFixed(2)} €`, x + 4, bandY + 3, {
      color: PAL.fdjJaune,
      scale: 1,
      align: 'left',
    });
  }

  hit(p: { x: number; y: number }): boolean {
    this.hoveredIndex = -1;
    for (let i = 0; i < this.cells.length; i++) {
      if (inRect(p, this.cells[i])) {
        this.hoveredIndex = i;
        return true;
      }
    }
    return false;
  }

  /** Add the denomination under the pointer and fire onChange. */
  click(p: { x: number; y: number }): void {
    for (let i = 0; i < this.cells.length; i++) {
      if (inRect(p, this.cells[i])) {
        this.total = round2(this.total + this.denoms[i]);
        this.onChange(this.total);
        return;
      }
    }
  }

  reset(): void {
    this.total = 0;
    this.onChange(this.total);
  }
}

// --- helpers ---------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatDenom(d: number): string {
  return d >= 1 ? `${d}€` : `${Math.round(d * 100)}c`;
}

/** Darken a #rrggbb hex color for hover / pressed feedback. */
function darken(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const r = Math.max(0, ((v >> 16) & 0xff) - 34);
  const g = Math.max(0, ((v >> 8) & 0xff) - 34);
  const b = Math.max(0, (v & 0xff) - 34);
  return `rgb(${r},${g},${b})`;
}
