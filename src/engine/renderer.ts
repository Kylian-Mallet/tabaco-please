// Pixel-art renderer. Everything is drawn into a 480x270 OFFSCREEN backbuffer
// (main.ts upscales it with integer scaling and imageSmoothing OFF -> chunky
// pixels). Hard pixel edges only: no rounded corners, no anti-aliasing.
//
// Public API kept stable for existing callers: clear, rect, stroke, text,
// sprite, measure, ctx. Plus low-level pixel helpers used by sprites.ts:
// px, hline, vline, fillRectPx.

import { PAL } from './palette';

/** Virtual (logical) resolution. ALL scene/UI coordinates live in this space. */
export const VW = 480;
export const VH = 270;

// ---------------------------------------------------------------------------
// Embedded 5x7 bitmap font. Each glyph is 7 rows of 5 chars ('#' = pixel on).
// Glyph cell is 5 wide; advance is 6 (5 + 1px spacing). Uppercase only; the
// renderer up-cases input and accented letters are drawn as base glyph + accent.
// ---------------------------------------------------------------------------
const GW = 5;
const GH = 7;
const ADV = GW + 1; // 6px advance per glyph at scale 1

const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '####.', '#...#', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.#.#.', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '\\': ['#....', '#....', '.#...', '..#..', '...#.', '....#', '....#'],
  '(': ['..##.', '.#...', '.#...', '.#...', '.#...', '.#...', '..##.'],
  ')': ['.##..', '...#.', '...#.', '...#.', '...#.', '...#.', '.##..'],
  '[': ['..##.', '..#..', '..#..', '..#..', '..#..', '..#..', '..##.'],
  ']': ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.##..'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '%': ['##..#', '##.#.', '..#..', '.#...', '#.##.', '...##', '#..##'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.', '.....'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '€': ['..###', '.#...', '####.', '.#...', '####.', '.#...', '..###'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

// Accent overlay marks drawn ABOVE the glyph (2 rows, at y-2..y-1).
type Accent = 'acute' | 'grave' | 'circ' | 'cedilla' | 'trema';
const ACCENT_TOP: Record<Exclude<Accent, 'cedilla'>, string[]> = {
  acute: ['...#.', '..#..'],
  grave: ['.#...', '..#..'],
  circ: ['..#..', '.#.#.'],
  trema: ['.#.#.', '.....'],
};
// Cedilla mark drawn BELOW the glyph (2 rows, at y+GH .. y+GH+1).
const CEDILLA: string[] = ['..#..', '.##..'];

// Map accented French chars (lower + upper) to {base letter, accent}.
const ACCENTED: Record<string, { base: string; accent: Accent }> = {
  é: { base: 'E', accent: 'acute' }, É: { base: 'E', accent: 'acute' },
  è: { base: 'E', accent: 'grave' }, È: { base: 'E', accent: 'grave' },
  ê: { base: 'E', accent: 'circ' }, Ê: { base: 'E', accent: 'circ' },
  ë: { base: 'E', accent: 'trema' }, Ë: { base: 'E', accent: 'trema' },
  à: { base: 'A', accent: 'grave' }, À: { base: 'A', accent: 'grave' },
  â: { base: 'A', accent: 'circ' }, Â: { base: 'A', accent: 'circ' },
  ù: { base: 'U', accent: 'grave' }, Ù: { base: 'U', accent: 'grave' },
  û: { base: 'U', accent: 'circ' }, Û: { base: 'U', accent: 'circ' },
  ü: { base: 'U', accent: 'trema' }, Ü: { base: 'U', accent: 'trema' },
  î: { base: 'I', accent: 'circ' }, Î: { base: 'I', accent: 'circ' },
  ï: { base: 'I', accent: 'trema' }, Ï: { base: 'I', accent: 'trema' },
  ô: { base: 'O', accent: 'circ' }, Ô: { base: 'O', accent: 'circ' },
  ö: { base: 'O', accent: 'trema' }, Ö: { base: 'O', accent: 'trema' },
  ç: { base: 'C', accent: 'cedilla' }, Ç: { base: 'C', accent: 'cedilla' },
};

/** Palette colors used for sprite() fallback fills, indexed by name hash. */
const SPRITE_FILLS = [
  PAL.wood, PAL.wall, PAL.tobaccoRed, PAL.mutedGreen, PAL.fdjYellow, PAL.skin, PAL.woodLight, PAL.wallDark,
];

function fillFromName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return SPRITE_FILLS[((h % SPRITE_FILLS.length) + SPRITE_FILLS.length) % SPRITE_FILLS.length];
}

export interface TextOpts {
  color?: string;
  /** Pixel scale of the bitmap font (1 => ~7px tall). */
  scale?: number;
  /** Legacy: target pixel height; converted to scale if `scale` absent. */
  size?: number;
  align?: CanvasTextAlign;
  /** Ignored (kept for API compatibility). */
  font?: string;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;

  /** ctx MUST be the 2d context of the 480x270 offscreen backbuffer. */
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  // -- Core API -------------------------------------------------------------

  /** Fill the whole backbuffer with a solid color. */
  clear(color: string = PAL.bg): void {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  /** Filled rectangle, integer-aligned hard pixel edges. */
  rect(x: number, y: number, w: number, h: number, color: string): void {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /**
   * Outline rectangle drawn as 4 crisp 1px-thick fills (no AA, no rounded
   * corners). `lw` thickens the border inward.
   */
  stroke(x: number, y: number, w: number, h: number, color: string, lw: number = 1): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rw = Math.round(w);
    const rh = Math.round(h);
    const t = Math.max(1, Math.round(lw));
    this.rect(rx, ry, rw, t, color); // top
    this.rect(rx, ry + rh - t, rw, t, color); // bottom
    this.rect(rx, ry, t, rh, color); // left
    this.rect(rx + rw - t, ry, t, rh, color); // right
  }

  /**
   * Chunky bitmap text. Uppercased, accents rendered as base glyph + mark.
   * scale 1 => ~7px tall. align left/center/right around x.
   */
  text(s: string, x: number, y: number, opts?: TextOpts): void {
    const color = opts?.color ?? PAL.offWhite;
    const scale = opts?.scale ?? (opts?.size ? Math.max(1, Math.round(opts.size / GH)) : 1);
    const align = opts?.align ?? 'left';

    const widthPx = this.measure(s, scale);
    let startX = Math.round(x);
    if (align === 'center') startX = Math.round(x - widthPx / 2);
    else if (align === 'right') startX = Math.round(x - widthPx);
    const startY = Math.round(y);

    let cx = startX;
    for (const ch of s) {
      this.drawGlyph(ch, cx, startY, scale, color);
      cx += ADV * scale;
    }
  }

  /**
   * Pixel-style fallback sprite: flat palette fill + 1px ink border + centered
   * bitmap label. Real art lives in sprites.ts; this is only a placeholder.
   */
  sprite(name: string, x: number, y: number, w: number, h: number, label?: string): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rw = Math.round(w);
    const rh = Math.round(h);
    this.rect(rx, ry, rw, rh, fillFromName(name));
    this.stroke(rx, ry, rw, rh, PAL.ink, 1);
    const text = label ?? name;
    if (text) {
      this.text(text, rx + rw / 2, ry + rh / 2 - 3, { color: PAL.ink, scale: 1, align: 'center' });
    }
  }

  /** Pixel width of `s` rendered by the bitmap font at `scale`. */
  measure(s: string, scale: number = 1): number {
    if (s.length === 0) return 0;
    // Each char advances ADV; drop the trailing inter-glyph gap.
    return (s.length * ADV - 1) * scale;
  }

  // -- Low-level pixel helpers (used by sprites.ts) -------------------------

  /** Single pixel block at (x,y). The fundamental art primitive. */
  px(x: number, y: number, color: string): void {
    this.rect(x, y, 1, 1, color);
  }

  /** Horizontal 1px line of length `len` starting at (x,y). */
  hline(x: number, y: number, len: number, color: string): void {
    this.rect(x, y, len, 1, color);
  }

  /** Vertical 1px line of length `len` starting at (x,y). */
  vline(x: number, y: number, len: number, color: string): void {
    this.rect(x, y, 1, len, color);
  }

  /** Alias for rect(): a filled block of pixels. */
  fillRectPx(x: number, y: number, w: number, h: number, color: string): void {
    this.rect(x, y, w, h, color);
  }

  // -- Internals ------------------------------------------------------------

  private drawGlyph(ch: string, x: number, y: number, scale: number, color: string): void {
    let glyphKey = ch;
    let accent: Accent | undefined;

    const acc = ACCENTED[ch];
    if (acc) {
      glyphKey = acc.base;
      accent = acc.accent;
    } else {
      const up = ch.toUpperCase();
      if (FONT[up]) glyphKey = up;
    }

    const rows = FONT[glyphKey];
    if (rows) {
      for (let r = 0; r < GH; r++) {
        const row = rows[r];
        for (let c = 0; c < GW; c++) {
          if (row[c] === '#') this.rect(x + c * scale, y + r * scale, scale, scale, color);
        }
      }
    }

    if (accent) {
      if (accent === 'cedilla') {
        this.drawMark(CEDILLA, x, y + GH * scale, scale, color);
      } else {
        this.drawMark(ACCENT_TOP[accent], x, y - 2 * scale, scale, color);
      }
    }
  }

  private drawMark(rows: string[], x: number, y: number, scale: number, color: string): void {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < GW; c++) {
        if (row[c] === '#') this.rect(x + c * scale, y + r * scale, scale, scale, color);
      }
    }
  }
}
