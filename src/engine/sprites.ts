// Procedural PIXEL-ART for the COUNTER scene. Every function draws ONLY with
// the Renderer pixel helpers (rect / px / hline / vline / text) using colors
// from PAL. Hard pixel edges, flat fills, no AA, readable at 480x270.
//
// Public API matches ART.md §6 exactly — do not change the signatures.

import type { Renderer } from './renderer';
import { PAL } from './palette';
import { LAYOUT } from './layout';

// --- small deterministic noise so the wall / wood look hand-placed, not random
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

// ---------------------------------------------------------------------------
// Counter — wooden counter across the bottom band.
// ---------------------------------------------------------------------------
export function drawCounter(r: Renderer): void {
  const { x, y, w, h } = LAYOUT.counter;

  // Base wood.
  r.rect(x, y, w, h, PAL.wood);

  // Worn top lip: a lit highlight then a hard shadow line below it.
  r.hline(x, y, w, PAL.woodLight);
  r.hline(x, y + 1, w, PAL.woodLight);
  r.hline(x, y + 2, w, PAL.woodDark);

  // Vertical plank seams.
  const plank = 64;
  for (let px = x + plank; px < x + w; px += plank) {
    r.vline(px, y + 3, h - 3, PAL.woodDark);
    r.vline(px + 1, y + 3, h - 3, PAL.woodLight);
  }

  // Horizontal grain streaks (sparse, dim).
  for (let gy = y + 6; gy < y + h - 2; gy += 4) {
    for (let gx = x; gx < x + w; gx += 6) {
      if (hash2(gx, gy) > 0.62) {
        const len = 3 + ((gx + gy) % 3);
        r.hline(gx, gy, len, hash2(gx + 1, gy) > 0.5 ? PAL.woodDark : PAL.woodLight);
      }
    }
  }

  // Bottom shadow to ground the counter.
  r.hline(x, y + h - 1, w, PAL.woodDark);
}

// ---------------------------------------------------------------------------
// Shelf — the "pack wall" backdrop behind the counter.
// ---------------------------------------------------------------------------
export function drawShelf(
  r: Renderer,
  packs: { x: number; y: number; color: string }[]
): void {
  const { x, y, w, h } = LAYOUT.shelf;

  // Dim ochre plaster wall.
  r.rect(x, y, w, h, PAL.wall);

  // Grime / mottling in the recesses.
  for (let gy = y; gy < y + h; gy += 3) {
    for (let gx = x; gx < x + w; gx += 3) {
      if (hash2(gx, gy) > 0.82) r.px(gx, gy, PAL.wallDark);
    }
  }

  // Shelf rails: a dark lip with a lit top edge, every 28px.
  const shelfStep = 28;
  for (let sy = y + shelfStep; sy < y + h; sy += shelfStep) {
    r.hline(x, sy - 2, w, PAL.wallDark);
    r.hline(x, sy - 1, w, PAL.woodLight);
    r.hline(x, sy, w, PAL.woodDark);
  }

  // Top recess shadow so the wall reads as lit from the counter.
  r.hline(x, y, w, PAL.wallDark);
  r.hline(x, y + 1, w, PAL.wallDark);

  // The packs themselves, drawn where the caller placed them.
  for (const p of packs) {
    drawCigarettePack(r, p.x, p.y, p.color);
  }

  // Overall dimming vignette at the very top edge.
  for (let i = 0; i < 4; i++) {
    if (i % 2 === 0) r.hline(x, y + i, w, PAL.shadow);
  }
}

// ---------------------------------------------------------------------------
// Cigarette pack — ~14x22 px. Colored body, cream band, dark cap, tiny label.
// ---------------------------------------------------------------------------
export function drawCigarettePack(
  r: Renderer,
  x: number,
  y: number,
  color: string,
  label?: string
): void {
  const W = 14;
  const H = 22;

  // Body.
  r.rect(x, y, W, H, color);

  // Dark cap / lid at the top.
  r.rect(x, y, W, 5, PAL.ink);
  r.hline(x, y + 5, W, PAL.shadow);

  // Cream health-warning band across the middle.
  r.rect(x, y + 11, W, 5, PAL.offWhite);
  // Tiny ink label text inside the band.
  r.hline(x + 2, y + 12, W - 4, PAL.ink);
  r.hline(x + 3, y + 14, W - 6, PAL.skinShadow);

  // Brand mark dot above the band.
  r.rect(x + 4, y + 7, W - 8, 3, PAL.offWhite);

  // Left highlight, right + bottom shadow.
  r.vline(x + 1, y + 6, H - 7, PAL.woodLight);
  r.vline(x + W - 2, y + 6, H - 7, PAL.shadow);
  r.hline(x + 1, y + H - 2, W - 2, PAL.shadow);

  // Hard ink outline.
  r.stroke(x, y, W, H, PAL.ink, 1);

  // Optional single-letter brand initial under the cap (rare, kept subtle).
  if (label && label.length > 0) {
    r.px(x + W - 4, y + 18, PAL.offWhite);
  }
}

// ---------------------------------------------------------------------------
// Client — pixel-art bust framed at the window.
// ---------------------------------------------------------------------------
export function drawClient(
  r: Renderer,
  x: number,
  y: number,
  opts: {
    drunk?: boolean;
    mood?: 'neutral' | 'angry' | 'happy';
    look?: import('../game/types').ClientLook;
  }
): void {
  const mood = opts.mood ?? 'neutral';
  const droop = opts.drunk ? 2 : 0;

  // Look overrides (all optional; absent => exact original appearance).
  const look = opts.look ?? {};
  const headColor = look.skin ?? PAL.skin;
  const neckColor = look.skin ?? PAL.skinShadow;
  const hairColor = look.hair ?? PAL.woodDark;
  const coatColor = look.coat ?? PAL.wallDark;
  const hat = look.hat ?? 'none';

  // --- Torso / coat (behind the head) ---
  const coatW = 56;
  const coatH = 30;
  const coatX = x - coatW / 2;
  const coatY = y + 26 + droop;
  r.rect(coatX, coatY, coatW, coatH, coatColor);
  r.stroke(coatX, coatY, coatW, coatH, PAL.ink, 1);
  // Collar / shoulders highlight.
  r.hline(coatX + 2, coatY + 1, coatW - 4, PAL.wood);
  // Coat opening V.
  r.rect(x - 1, coatY + 2, 2, coatH - 2, PAL.ink);
  r.px(x - 4, coatY + 6, PAL.woodLight);
  r.px(x + 3, coatY + 6, PAL.woodLight);

  // --- Neck ---
  r.rect(x - 5, y + 20 + droop, 10, 8, neckColor);

  // --- Head ---
  const hw = 28;
  const hh = 30;
  const hx = x - hw / 2;
  const hy = y - 2 + droop;
  r.rect(hx, hy, hw, hh, headColor);
  r.stroke(hx, hy, hw, hh, PAL.skinShadow, 1);
  // Cheek/jaw shadow on the right side.
  r.vline(hx + hw - 2, hy + 6, hh - 8, PAL.skinShadow);
  r.hline(hx + 3, hy + hh - 2, hw - 6, PAL.skinShadow);

  // --- Hair ---
  r.rect(hx - 1, hy - 4, hw + 2, 7, hairColor);
  r.rect(hx - 2, hy - 1, 3, 12, hairColor);
  r.rect(hx + hw - 1, hy - 1, 3, 12, hairColor);
  // Hair texture flecks.
  r.px(hx + 6, hy - 2, PAL.wood);
  r.px(hx + 16, hy - 3, PAL.wood);

  // --- Hat (drawn over the hair) ---
  if (hat !== 'none') {
    if (hat === 'cap') {
      // Flat cap: low crown + a forward visor over the brow.
      r.rect(hx - 2, hy - 6, hw + 4, 8, PAL.wallDark);
      r.hline(hx - 1, hy - 6, hw + 2, PAL.wood); // lit top edge
      r.stroke(hx - 2, hy - 6, hw + 4, 8, PAL.ink, 1);
      // Visor jutting out to the left/front.
      r.rect(hx - 6, hy + 1, 14, 3, PAL.woodDark);
      r.hline(hx - 6, hy + 1, 14, PAL.ink);
      r.hline(hx - 6, hy + 3, 14, PAL.ink);
    } else if (hat === 'hat') {
      // Brimmed hat: wide flat brim + a tall crown with a band.
      r.rect(hx + 2, hy - 9, hw - 4, 10, PAL.woodDark); // crown
      r.rect(hx + 2, hy + 1, hw - 4, 3, PAL.ink); // crown band
      r.rect(hx - 7, hy + 2, hw + 14, 3, PAL.woodDark); // brim
      r.hline(hx - 7, hy + 2, hw + 14, PAL.wood);
      r.stroke(hx - 7, hy + 2, hw + 14, 3, PAL.ink, 1);
      r.stroke(hx + 2, hy - 9, hw - 4, 11, PAL.ink, 1);
    } else {
      // Beanie (knit cap): snug cap with a ribbed fold.
      r.rect(hx - 2, hy - 6, hw + 4, 10, PAL.tobaccoRed);
      r.rect(hx - 2, hy + 2, hw + 4, 3, PAL.woodDark); // folded brim
      // Knit rib ticks on the fold.
      for (let kx = hx; kx < hx + hw; kx += 4) r.vline(kx, hy + 2, 3, PAL.shadow);
      r.px(hx + hw / 2, hy - 8, PAL.tobaccoRed); // tiny pom
      r.px(hx + hw / 2 - 1, hy - 7, PAL.tobaccoRed);
      r.stroke(hx - 2, hy - 6, hw + 4, 11, PAL.ink, 1);
    }
  }

  // --- Eyes ---
  const eyeY = hy + 11 + droop;
  const lex = hx + 7;
  const rex = hx + hw - 9;
  // Whites.
  r.rect(lex, eyeY, 5, 4, PAL.offWhite);
  r.rect(rex, eyeY, 5, 4, PAL.offWhite);
  // Pupils.
  r.rect(lex + (opts.drunk ? 1 : 2), eyeY + 1, 2, 2, PAL.ink);
  r.rect(rex + 1, eyeY + 1, 2, 2, PAL.ink);

  // --- Brows (mood) ---
  if (mood === 'angry') {
    // Angled down toward the nose.
    r.px(lex + 4, eyeY - 2, PAL.ink);
    r.px(lex + 3, eyeY - 1, PAL.ink);
    r.px(rex, eyeY - 2, PAL.ink);
    r.px(rex + 1, eyeY - 1, PAL.ink);
    r.hline(lex, eyeY - 2, 3, PAL.ink);
    r.hline(rex + 2, eyeY - 2, 3, PAL.ink);
  } else if (mood === 'happy') {
    // Raised, relaxed.
    r.hline(lex, eyeY - 3, 5, PAL.woodDark);
    r.hline(rex, eyeY - 3, 5, PAL.woodDark);
  } else {
    r.hline(lex, eyeY - 2, 5, PAL.woodDark);
    r.hline(rex, eyeY - 2, 5, PAL.woodDark);
  }

  // --- Nose ---
  r.vline(x, eyeY + 3, 4, PAL.skinShadow);
  r.px(x - 1, eyeY + 6, PAL.skinShadow);

  // --- Mouth (mood) ---
  const my = hy + 23 + droop;
  if (mood === 'happy') {
    // Smile.
    r.hline(x - 4, my, 8, PAL.ink);
    r.px(x - 5, my - 1, PAL.ink);
    r.px(x + 4, my - 1, PAL.ink);
  } else if (mood === 'angry') {
    // Frown.
    r.hline(x - 4, my, 8, PAL.ink);
    r.px(x - 5, my + 1, PAL.ink);
    r.px(x + 4, my + 1, PAL.ink);
  } else {
    // Flat line.
    r.hline(x - 4, my, 8, PAL.ink);
  }

  // --- Beard / stubble (darker skin tone on the lower jaw + around the mouth) ---
  if (look.beard) {
    // Jaw band along the bottom of the head.
    r.rect(hx + 2, hy + hh - 7, hw - 4, 6, PAL.skinShadow);
    // Sideburns up the cheeks.
    r.vline(hx + 2, hy + 16, hh - 18, PAL.skinShadow);
    r.vline(hx + hw - 3, hy + 16, hh - 18, PAL.skinShadow);
    // Moustache framing the mouth.
    r.hline(x - 5, my - 2, 10, PAL.skinShadow);
    // Stubble flecks so it reads as hair, not a flat shadow.
    for (let by = hy + hh - 7; by < hy + hh - 1; by++) {
      for (let bx = hx + 3; bx < hx + hw - 3; bx += 2) {
        if (hash2(bx, by) > 0.55) r.px(bx, by, PAL.ink);
      }
    }
    // Re-stamp the mouth so the beard frames but never hides it.
    r.hline(x - 4, my, 8, PAL.ink);
  }

  // --- Drunk: red cheeks + nose flush ---
  if (opts.drunk) {
    r.rect(hx + 3, eyeY + 5, 4, 3, PAL.tobaccoRed);
    r.rect(hx + hw - 7, eyeY + 5, 4, 3, PAL.tobaccoRed);
    r.px(x - 1, eyeY + 5, PAL.tobaccoRed);
    r.px(x, eyeY + 5, PAL.tobaccoRed);
  }
}

// ---------------------------------------------------------------------------
// Speech bubble — blocky cream bubble with a tail, French text wrapped inside.
// ---------------------------------------------------------------------------
export function drawSpeechBubble(
  r: Renderer,
  x: number,
  y: number,
  w: number,
  text: string
): void {
  const padX = 6;
  const padY = 6;
  const lineH = 9;
  const innerW = w - padX * 2;

  // Word-wrap against the bitmap font advance.
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (r.measure(test, 1) <= innerW || cur === '') {
      cur = test;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length === 0) lines.push('');

  const h = padY * 2 + lines.length * lineH;

  // Drop shadow.
  r.rect(x + 2, y + 2, w, h, PAL.shadow);

  // Bubble body (cream) with a blocky "rounded enough" corner notch.
  r.rect(x, y, w, h, PAL.paper);
  // Knock out the 4 corner pixels to fake rounding.
  r.px(x, y, PAL.bg);
  r.px(x + w - 1, y, PAL.bg);
  r.px(x, y + h - 1, PAL.bg);
  r.px(x + w - 1, y + h - 1, PAL.bg);

  // Ink frame.
  r.stroke(x, y, w, h, PAL.ink, 1);
  // Inner highlight on the top edge.
  r.hline(x + 2, y + 1, w - 4, PAL.offWhite);

  // Tail pointing down-left toward the client.
  const tx = x + 12;
  const ty = y + h;
  r.rect(tx, ty, 6, 1, PAL.paper);
  r.rect(tx + 1, ty + 1, 4, 1, PAL.paper);
  r.rect(tx + 2, ty + 2, 2, 1, PAL.paper);
  r.px(tx, ty, PAL.ink);
  r.px(tx + 5, ty, PAL.ink);
  r.px(tx + 1, ty + 1, PAL.ink);
  r.px(tx + 4, ty + 1, PAL.ink);
  r.px(tx + 2, ty + 3, PAL.ink);
  r.px(tx + 3, ty + 3, PAL.ink);

  // Text.
  let ty2 = y + padY;
  for (const line of lines) {
    r.text(line, x + padX, ty2, { color: PAL.ink, scale: 1, align: 'left' });
    ty2 += lineH;
  }
}

// ---------------------------------------------------------------------------
// CNI — French national ID card look.
// ---------------------------------------------------------------------------
export function drawCNI(
  r: Renderer,
  x: number,
  y: number,
  fields: { name: string; birth: string }
): void {
  const w = 152;
  const h = 88;

  // Drop shadow + cream card.
  r.rect(x + 2, y + 2, w, h, PAL.shadow);
  r.rect(x, y, w, h, PAL.paper);
  r.stroke(x, y, w, h, PAL.ink, 1);
  // Paper sheen.
  r.hline(x + 1, y + 1, w - 2, PAL.offWhite);

  // Header band (full width). 'REPUBLIQUE FRANCAISE' = 119px @ scale 1, fits.
  r.rect(x + 1, y + 1, w - 2, 11, PAL.tobaccoRed);
  r.text('REPUBLIQUE FRANCAISE', x + 4, y + 3, { color: PAL.offWhite, scale: 1, align: 'left' });
  // Tricolore tab at the far right, clear of the header text: blue / white / red.
  r.rect(x + w - 11, y + 2, 3, 9, PAL.franceBlue);
  r.rect(x + w - 8, y + 2, 3, 9, PAL.offWhite);
  r.rect(x + w - 5, y + 2, 3, 9, PAL.fdjRed);

  // Sub-title line.
  r.text("CARTE D'IDENTITE", x + 4, y + 16, { color: PAL.ink, scale: 1, align: 'left' });

  // Photo box (skin block, framed).
  const pw = 30;
  const ph = 42;
  const px0 = x + 6;
  const py0 = y + 28;
  r.rect(px0, py0, pw, ph, PAL.skin);
  r.stroke(px0, py0, pw, ph, PAL.ink, 1);
  // Simple head silhouette in the photo.
  r.rect(px0 + 9, py0 + 6, 12, 12, PAL.skinShadow);
  r.rect(px0 + 6, py0 + 20, 18, ph - 20, PAL.skinShadow);

  // Label / value rows, right of the photo.
  const tx = px0 + pw + 8;
  const avail = x + w - 5 - tx; // pixels available for a value before the edge
  let ry = y + 28;
  const rows: { label: string; value: string }[] = [
    { label: 'NOM', value: fields.name },
    { label: 'NE(E) LE', value: fields.birth },
  ];
  for (const row of rows) {
    r.text(row.label, tx, ry, { color: PAL.skinShadow, scale: 1, align: 'left' });
    r.text(clampToWidth(row.value, avail), tx, ry + 9, { color: PAL.ink, scale: 1, align: 'left' });
    // Underline rule.
    r.hline(tx, ry + 18, w - (tx - x) - 5, PAL.skinShadow);
    ry += 26;
  }
}

/** Truncate a string with an ellipsis dot so it fits `widthPx` at scale 1 (6px/char). */
function clampToWidth(s: string, widthPx: number): string {
  const max = Math.max(1, Math.floor((widthPx + 1) / 6));
  return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)) + '.';
}

// ---------------------------------------------------------------------------
// FDJ terminal — small lottery terminal with a glowing screen + ticket slot.
// ---------------------------------------------------------------------------
export function drawTerminalFDJ(r: Renderer, x: number, y: number): void {
  const w = 56;
  const h = 52;

  // Shadow + dark plastic body.
  r.rect(x + 2, y + 2, w, h, PAL.shadow);
  r.rect(x, y, w, h, PAL.woodDark);
  r.stroke(x, y, w, h, PAL.ink, 1);
  // Bevel highlight on top/left.
  r.hline(x + 1, y + 1, w - 2, PAL.wood);
  r.vline(x + 1, y + 1, h - 2, PAL.wood);

  // Screen recess.
  const sx = x + 6;
  const sy = y + 6;
  const sw = w - 12;
  const sh = 22;
  r.rect(sx, sy, sw, sh, PAL.ink);
  // FDJ red/yellow screen.
  r.rect(sx + 1, sy + 1, sw - 2, sh - 2, PAL.fdjRed);
  r.rect(sx + 1, sy + 1, sw - 2, 6, PAL.fdjYellow);
  r.text('FDJ', sx + 3, sy + 1, { color: PAL.ink, scale: 1, align: 'left' });
  // Scanlines.
  for (let i = sy + 9; i < sy + sh - 1; i += 3) r.hline(sx + 1, i, sw - 2, PAL.shadow);

  // Keypad: 3x2 buttons.
  const kx = x + 7;
  const ky = y + 32;
  for (let rrow = 0; rrow < 2; rrow++) {
    for (let c = 0; c < 3; c++) {
      const bx = kx + c * 10;
      const by = ky + rrow * 8;
      r.rect(bx, by, 7, 5, PAL.wall);
      r.px(bx, by, PAL.woodLight);
    }
  }

  // Ticket slot on the right side.
  r.rect(x + w - 10, y + 34, 7, 12, PAL.ink);
  r.hline(x + w - 9, y + 35, 5, PAL.fdjYellow);
}

// ---------------------------------------------------------------------------
// Scratch ticket — colored card with a silver scratch panel.
// ---------------------------------------------------------------------------
export function drawTicket(r: Renderer, x: number, y: number, color: string): void {
  const w = 40;
  const h = 26;

  // Shadow + colored body.
  r.rect(x + 1, y + 1, w, h, PAL.shadow);
  r.rect(x, y, w, h, color);
  r.stroke(x, y, w, h, PAL.ink, 1);
  // Top banner.
  r.rect(x + 1, y + 1, w - 2, 6, PAL.fdjRed);
  r.text('FDJ', x + 3, y + 1, { color: PAL.fdjYellow, scale: 1, align: 'left' });

  // Silver scratch panel.
  const px0 = x + 4;
  const py0 = y + 10;
  const pw = w - 8;
  const ph = h - 14;
  r.rect(px0, py0, pw, ph, PAL.skinShadow);
  r.rect(px0 + 1, py0 + 1, pw - 2, ph - 2, PAL.wall);
  // Scratch scuff texture.
  for (let gy = py0 + 1; gy < py0 + ph - 1; gy += 2) {
    for (let gx = px0 + 1; gx < px0 + pw - 1; gx += 2) {
      if (hash2(gx, gy) > 0.6) r.px(gx, gy, PAL.woodLight);
    }
  }
  // A couple of "stars" to scratch.
  r.px(px0 + 5, py0 + 3, PAL.fdjYellow);
  r.px(px0 + pw - 6, py0 + 3, PAL.fdjYellow);
}

// ---------------------------------------------------------------------------
// Euro coin — gold/silver ring with the value digit.
// ---------------------------------------------------------------------------
export function drawCoin(r: Renderer, x: number, y: number, value: number): void {
  // Coins under 1€ read as gold (cents), 1€+ as bicolour silver/gold.
  const small = value < 1;
  const ring = small ? PAL.fdjYellow : PAL.skinShadow;
  const core = small ? PAL.woodLight : PAL.fdjYellow;
  const D = 14;
  const cx = x + D / 2;
  const cy = y + D / 2;

  // Circle approximated as a blocky pixel disc (12px wide).
  // Row widths for a tidy 12-tall coin.
  const spans = [4, 8, 10, 12, 12, 12, 12, 12, 12, 10, 8, 4];
  for (let i = 0; i < spans.length; i++) {
    const len = spans[i];
    const ox = x + (D - len) / 2;
    r.hline(ox, y + 1 + i, len, ring);
  }
  // Inner core (lighter), inset by 2px disc.
  const core2 = [4, 6, 8, 8, 8, 8, 6, 4];
  for (let i = 0; i < core2.length; i++) {
    const len = core2[i];
    const ox = x + (D - len) / 2;
    r.hline(ox, y + 3 + i, len, core);
  }
  // Top-left sheen + bottom-right shadow on the rim.
  r.px(x + 3, y + 2, PAL.offWhite);
  r.px(x + D - 4, y + D - 3, PAL.shadow);

  // Value digit centered.
  const label = small ? String(Math.round(value * 100)) : String(value);
  r.text(label, cx + 0.5, cy - 3, { color: PAL.ink, scale: 1, align: 'center' });
}

// ---------------------------------------------------------------------------
// Patience bar — segmented gauge; fills mutedGreen -> fdjRed as frac drops.
// ---------------------------------------------------------------------------
export function drawPatience(
  r: Renderer,
  x: number,
  y: number,
  w: number,
  frac: number
): void {
  const h = 8;
  const f = Math.max(0, Math.min(1, frac));

  // Recessed track.
  r.rect(x, y, w, h, PAL.ink);
  r.rect(x + 1, y + 1, w - 2, h - 2, PAL.wallDark);

  // Segments.
  const segs = 10;
  const gap = 1;
  const segW = (w - 2 - (segs - 1) * gap) / segs;
  const filled = Math.round(f * segs);
  for (let i = 0; i < segs; i++) {
    const sx = x + 1 + i * (segW + gap);
    if (i < filled) {
      // Color shifts from red (low fill index) to green (high) so a dropping
      // patience reveals the red segments first.
      const t = i / (segs - 1);
      const col = t < 0.34 ? PAL.fdjRed : t < 0.67 ? PAL.fdjYellow : PAL.mutedGreen;
      r.rect(sx, y + 1, segW, h - 2, col);
      r.hline(sx, y + 1, Math.max(1, Math.round(segW)), PAL.offWhite);
    } else {
      r.rect(sx, y + 1, segW, h - 2, PAL.shadow);
    }
  }

  // Frame.
  r.stroke(x, y, w, h, PAL.ink, 1);
}

// ---------------------------------------------------------------------------
// Transistor radio — ~34x22 px wood/plastic body, speaker grille, dial, antenna.
// ---------------------------------------------------------------------------
export function drawRadio(
  r: Renderer,
  x: number,
  y: number,
  opts: { playing: boolean }
): void {
  const w = 34;
  const h = 22;

  // Antenna sticking up to the right (drawn first, behind the body top edge).
  r.vline(x + w - 4, y - 9, 10, PAL.skinShadow);
  r.px(x + w - 3, y - 10, PAL.skinShadow);
  r.px(x + w - 4, y - 10, PAL.offWhite); // tip glint

  // Shadow + wooden body.
  r.rect(x + 2, y + 2, w, h, PAL.shadow);
  r.rect(x, y, w, h, PAL.wood);
  r.stroke(x, y, w, h, PAL.ink, 1);
  // Bevel: lit top/left, dark bottom/right.
  r.hline(x + 1, y + 1, w - 2, PAL.woodLight);
  r.vline(x + 1, y + 1, h - 2, PAL.woodLight);
  r.hline(x + 1, y + h - 2, w - 2, PAL.woodDark);
  r.vline(x + w - 2, y + 1, h - 2, PAL.woodDark);

  // Speaker grille: recessed panel with columns of dark dots.
  const gx = x + 4;
  const gy = y + 5;
  const gw = 16;
  const gh = h - 9;
  r.rect(gx, gy, gw, gh, PAL.woodDark);
  r.stroke(gx, gy, gw, gh, PAL.ink, 1);
  for (let cx = gx + 2; cx < gx + gw - 1; cx += 3) {
    for (let cy = gy + 2; cy < gy + gh - 1; cy += 2) {
      r.px(cx, cy, PAL.shadow);
    }
  }

  // Tuning dial knob on the right (small disc).
  const kx = x + w - 9;
  const ky = y + 6;
  r.rect(kx, ky, 6, 6, PAL.skinShadow);
  r.stroke(kx, ky, 6, 6, PAL.ink, 1);
  r.px(kx + 1, ky + 1, PAL.offWhite); // sheen
  r.hline(kx + 2, ky + 3, 3, PAL.ink); // pointer notch

  // Status LED below the knob: green glow when playing, dim when off.
  const lx = x + w - 8;
  const ly = y + h - 5;
  if (opts.playing) {
    r.rect(lx, ly, 2, 2, PAL.mutedGreen);
    r.px(lx - 1, ly, PAL.mutedGreen);
    r.px(lx + 2, ly + 1, PAL.mutedGreen);
  } else {
    r.rect(lx, ly, 2, 2, PAL.shadow);
  }
}

// ---------------------------------------------------------------------------
// Drink can — ~10x18 px. Colored body, pull-tab top, cream label band.
// Used for sodas / strong beer (8.6).
// ---------------------------------------------------------------------------
export function drawCan(r: Renderer, x: number, y: number, color: string): void {
  const w = 10;
  const h = 18;

  // Shadow + body.
  r.rect(x + 1, y + 1, w, h, PAL.shadow);
  r.rect(x, y, w, h, color);

  // Top rim (lighter) + pull-tab.
  r.rect(x, y, w, 3, PAL.offWhite);
  r.hline(x + 1, y + 3, w - 2, PAL.skinShadow); // rim shadow lip
  r.px(x + w / 2 - 1, y + 1, PAL.ink); // tab hole
  r.px(x + w / 2, y + 1, PAL.skinShadow);

  // Cream label band across the middle.
  r.rect(x, y + 7, w, 5, PAL.offWhite);
  r.hline(x + 1, y + 9, w - 2, PAL.skinShadow); // tiny printed line

  // Left highlight, right + bottom shadow.
  r.vline(x + 1, y + 4, h - 6, PAL.offWhite);
  r.vline(x + w - 2, y + 4, h - 6, PAL.shadow);
  r.hline(x + 1, y + h - 2, w - 2, PAL.shadow);

  // Hard ink outline.
  r.stroke(x, y, w, h, PAL.ink, 1);
}

// ---------------------------------------------------------------------------
// Fake "sacred" relic — kitsch golden idol for the joke product "Virgam Sacré".
// Obviously too shiny / dubious. Comedic.
// ---------------------------------------------------------------------------
export function drawFakeRelic(r: Renderer, x: number, y: number): void {
  const w = 16;
  const h = 20;

  // Outer glow halo (a few scattered gold pixels around the idol).
  r.px(x - 2, y + 4, PAL.fdjYellow);
  r.px(x + w + 1, y + 6, PAL.fdjYellow);
  r.px(x - 1, y + h - 4, PAL.fdjYellow);
  r.px(x + w, y + h - 7, PAL.fdjYellow);
  r.px(x + 3, y - 3, PAL.fdjYellow);
  r.px(x + w - 4, y - 2, PAL.fdjYellow);

  // Ornate base box.
  const bx = x + 1;
  const by = y + 11;
  const bw = w - 2;
  const bh = h - 11;
  r.rect(bx, by, bw, bh, PAL.fdjYellow);
  r.stroke(bx, by, bw, bh, PAL.ink, 1);
  r.hline(bx + 1, by + 1, bw - 2, PAL.offWhite); // top sheen
  r.hline(bx + 1, by + bh - 2, bw - 2, PAL.tobaccoRed); // red accent foot

  // Idol / figurine on top of the box.
  const ix = x + 4;
  const iy = y;
  r.rect(ix, iy + 5, w - 8, 7, PAL.fdjYellow); // body
  r.rect(ix + 1, iy, w - 10, 6, PAL.fdjYellow); // head
  r.stroke(ix, iy + 5, w - 8, 7, PAL.ink, 1);
  r.stroke(ix + 1, iy, w - 10, 6, PAL.ink, 1);
  // Halo crown of red accents.
  r.px(ix, iy + 1, PAL.tobaccoRed);
  r.px(ix + w - 9, iy + 1, PAL.tobaccoRed);
  r.hline(ix + 1, iy + 8, w - 10, PAL.tobaccoRed); // sash

  // Over-the-top sparkle pixels (the "too shiny" tell).
  r.px(ix + 2, iy + 2, PAL.offWhite);
  r.px(x + w - 3, y + 3, PAL.offWhite);
  r.px(x + 1, y + 8, PAL.offWhite);
  r.px(bx + 2, by + 2, PAL.offWhite);
  r.px(bx + bw - 3, by + 3, PAL.offWhite);
}

// ---------------------------------------------------------------------------
// CBD product — ~16x20 px wellness pouch/jar: colored body, cream label band,
// a muted-green cannabis-leaf motif. Reads calm / "wellness", age 18+.
// ---------------------------------------------------------------------------
export function drawCBD(r: Renderer, x: number, y: number, color: string): void {
  const w = 16;
  const h = 20;

  // Shadow + colored body (the pouch/jar).
  r.rect(x + 1, y + 1, w, h, PAL.shadow);
  r.rect(x, y, w, h, color);

  // Screw-cap / fold at the top.
  r.rect(x, y, w, 4, PAL.woodDark);
  r.hline(x + 1, y, w - 2, PAL.woodLight); // lit cap edge
  r.hline(x, y + 4, w, PAL.shadow); // shadow under the cap

  // Cream wellness label across the middle.
  const lx = x + 2;
  const ly = y + 6;
  const lw = w - 4;
  const lh = 11;
  r.rect(lx, ly, lw, lh, PAL.offWhite);
  r.stroke(lx, ly, lw, lh, PAL.skinShadow, 1);

  // Cannabis-leaf motif on the label: a central spine + paired leaflets.
  const cx = x + w / 2;
  const leaf = PAL.mutedGreen;
  // Central tall leaflet.
  r.vline(cx, ly + 2, 7, leaf);
  r.px(cx, ly + 1, leaf);
  // Upper paired leaflets angling out.
  r.px(cx - 2, ly + 3, leaf);
  r.px(cx - 3, ly + 4, leaf);
  r.px(cx + 2, ly + 3, leaf);
  r.px(cx + 3, ly + 4, leaf);
  // Lower, longer paired leaflets.
  r.px(cx - 3, ly + 6, leaf);
  r.px(cx - 4, ly + 7, leaf);
  r.px(cx + 3, ly + 6, leaf);
  r.px(cx + 4, ly + 7, leaf);
  // Tiny stem at the base.
  r.px(cx, ly + 9, PAL.woodDark);

  // Left highlight, right + bottom shadow on the body.
  r.vline(x + 1, y + 5, h - 7, PAL.woodLight);
  r.vline(x + w - 2, y + 5, h - 7, PAL.shadow);
  r.hline(x + 1, y + h - 2, w - 2, PAL.shadow);

  // Hard ink outline.
  r.stroke(x, y, w, h, PAL.ink, 1);
}

// ---------------------------------------------------------------------------
// Magazine / newspaper — ~18x22 px glossy cover: title banner across the top,
// a tinted cover block, a couple of headline lines. `color` tints the cover.
// ---------------------------------------------------------------------------
export function drawMagazine(r: Renderer, x: number, y: number, color: string): void {
  const w = 18;
  const h = 22;

  // Shadow + cream paper base.
  r.rect(x + 1, y + 1, w, h, PAL.shadow);
  r.rect(x, y, w, h, PAL.paper);

  // Title banner across the top (the masthead).
  r.rect(x, y, w, 5, PAL.tobaccoRed);
  r.hline(x + 1, y, w - 2, PAL.fdjRed); // lit masthead edge
  // Masthead lettering ticks.
  for (let mx = x + 2; mx < x + w - 2; mx += 3) r.px(mx, y + 2, PAL.offWhite);

  // Tinted cover photo block.
  const cx = x + 2;
  const cy = y + 7;
  const cw = w - 4;
  const ch = 9;
  r.rect(cx, cy, cw, ch, color);
  r.stroke(cx, cy, cw, ch, PAL.ink, 1);
  // A simple subject silhouette inside the cover.
  r.rect(cx + cw / 2 - 2, cy + 2, 4, 3, PAL.ink); // head
  r.rect(cx + cw / 2 - 3, cy + 5, 6, ch - 6, PAL.ink); // shoulders
  // Glossy sheen streak.
  r.px(cx + 1, cy + 1, PAL.offWhite);
  r.px(cx + 2, cy + 1, PAL.offWhite);

  // Headline lines below the cover.
  r.hline(x + 2, y + 17, w - 4, PAL.ink);
  r.hline(x + 2, y + 19, w - 6, PAL.skinShadow);

  // Left highlight, right + bottom shadow (page edge).
  r.vline(x, y + 6, h - 7, PAL.offWhite);
  r.vline(x + w - 1, y + 6, h - 7, PAL.shadow);
  r.hline(x + 1, y + h - 1, w - 2, PAL.shadow);

  // Hard ink outline.
  r.stroke(x, y, w, h, PAL.ink, 1);
}

// ---------------------------------------------------------------------------
// Vape / puff device — ~18x14 px rounded box: colored body, mouthpiece nub,
// a tiny glowing LED. Age 18+.
// ---------------------------------------------------------------------------
export function drawVape(r: Renderer, x: number, y: number, color: string): void {
  const w = 16;
  const h = 12;

  // Mouthpiece nub sticking up from the top-left (drawn first).
  r.rect(x + 2, y - 3, 4, 4, PAL.woodDark);
  r.hline(x + 2, y - 3, 4, PAL.ink); // mouth opening
  r.px(x + 2, y - 2, PAL.shadow);

  // Shadow + rounded colored body.
  r.rect(x + 1, y + 1, w, h, PAL.shadow);
  r.rect(x, y, w, h, color);
  // Fake the rounded corners by knocking out the 4 corner pixels.
  r.px(x, y, PAL.bg);
  r.px(x + w - 1, y, PAL.bg);
  r.px(x, y + h - 1, PAL.bg);
  r.px(x + w - 1, y + h - 1, PAL.bg);

  // Bevel: lit top/left, dark bottom/right.
  r.hline(x + 1, y + 1, w - 2, PAL.offWhite);
  r.vline(x + 1, y + 1, h - 2, PAL.woodLight);
  r.hline(x + 1, y + h - 2, w - 2, PAL.shadow);
  r.vline(x + w - 2, y + 1, h - 2, PAL.shadow);

  // Slim control/airflow line across the body.
  r.hline(x + 4, y + h / 2, w - 8, PAL.shadow);

  // Tiny glowing LED on the right end.
  const lx = x + w - 3;
  const ly = y + h / 2 - 1;
  r.rect(lx, ly, 2, 2, PAL.mutedGreen);
  r.px(lx, ly, PAL.offWhite); // bright core glint

  // Hard ink outline (corners already knocked out read as rounded).
  r.stroke(x, y, w, h, PAL.ink, 1);
  // Re-knock the corners so the stroke doesn't square them off.
  r.px(x, y, PAL.bg);
  r.px(x + w - 1, y, PAL.bg);
  r.px(x, y + h - 1, PAL.bg);
  r.px(x + w - 1, y + h - 1, PAL.bg);
}

// ---------------------------------------------------------------------------
// Bet slip — ~36x30 px sports-betting coupon: cream paper with a colored
// header band, a few printed lines, and a torn (perforated) bottom edge.
// ---------------------------------------------------------------------------
export function drawBetSlip(r: Renderer, x: number, y: number, color: string): void {
  const w = 36;
  const h = 30;

  // Shadow + cream paper body.
  r.rect(x + 1, y + 1, w, h, PAL.shadow);
  r.rect(x, y, w, h, PAL.paper);
  r.stroke(x, y, w, h, PAL.ink, 1);
  // Paper sheen on the top edge.
  r.hline(x + 1, y + 1, w - 2, PAL.offWhite);

  // Colored header band with a tiny FDJ-style mark.
  r.rect(x + 1, y + 1, w - 2, 7, color);
  r.hline(x + 1, y + 1, w - 2, PAL.offWhite); // lit header top edge
  r.text('PARI', x + 3, y + 2, { color: PAL.ink, scale: 1, align: 'left' });
  // Two accent ticks at the far right of the header.
  r.px(x + w - 4, y + 3, PAL.offWhite);
  r.px(x + w - 6, y + 3, PAL.offWhite);

  // Printed body lines (a coupon's match / pick / stake rows).
  r.hline(x + 4, y + 12, w - 12, PAL.ink);
  r.hline(x + 4, y + 16, w - 8, PAL.skinShadow);
  r.hline(x + 4, y + 20, w - 14, PAL.skinShadow);
  // A small boxed "stake" amount on the lower right.
  r.rect(x + w - 12, y + 19, 8, 5, PAL.offWhite);
  r.stroke(x + w - 12, y + 19, 8, 5, PAL.skinShadow, 1);

  // Torn / perforated bottom edge (zig-zag of knocked pixels).
  for (let tx = x; tx < x + w; tx += 2) {
    r.px(tx, y + h - 1, PAL.bg);
    r.px(tx + 1, y + h - 2, PAL.shadow);
  }
}

// ---------------------------------------------------------------------------
// Match row — one line in the terminal's match list: "TEAM-TEAM" on the left,
// kickoff time on the right. No started/LIVE flag: judging whether the kickoff
// has passed the counter clock is the player's call (the judge-the-clock channel),
// so the row prints only the raw fixture and never a verdict hint. The `started`
// field is kept in the type for call-site compatibility but intentionally unread.
// ---------------------------------------------------------------------------
export function drawMatchRow(
  r: Renderer,
  x: number,
  y: number,
  w: number,
  m: { teamA: string; teamB: string; kickoff: string; started: boolean }
): void {
  const h = 11;

  // Row plate: dark recess, lit top edge (identical for every fixture).
  r.rect(x, y, w, h, PAL.wallDark);
  r.hline(x, y, w, PAL.wood);
  r.stroke(x, y, w, h, PAL.ink, 1);

  // Kickoff time on the right edge.
  const timeX = x + w - 3;
  r.text(m.kickoff, timeX, y + 3, { color: PAL.fdjYellow, scale: 1, align: 'right' });

  // Team matchup on the left, clamped so it never collides with the time.
  const timeW = r.measure(m.kickoff, 1);
  const avail = timeX - timeW - (x + 3) - 2;
  const matchup = clampToWidth(m.teamA + '-' + m.teamB, Math.max(6, avail));
  r.text(matchup, x + 3, y + 3, { color: PAL.offWhite, scale: 1, align: 'left' });
}

// ---------------------------------------------------------------------------
// Score entry — a scoreboard box rendering "a : b" for Mode B settlement.
// Two dark digit cells flanking a lit colon, framed like an LED display.
// ---------------------------------------------------------------------------
export function drawScoreEntry(r: Renderer, x: number, y: number, a: number, b: number): void {
  const cellW = 14;
  const cellH = 18;
  const gap = 9; // space for the colon between the two cells
  const w = cellW * 2 + gap;
  const h = cellH;

  // Shadow + dark housing.
  r.rect(x + 1, y + 1, w + 4, h + 4, PAL.shadow);
  r.rect(x - 2, y - 2, w + 4, h + 4, PAL.woodDark);
  r.stroke(x - 2, y - 2, w + 4, h + 4, PAL.ink, 1);
  r.hline(x - 1, y - 1, w + 2, PAL.wood); // bevel top
  r.vline(x - 1, y - 1, h + 2, PAL.wood); // bevel left

  // Helper: one recessed digit cell with a centered glyph.
  const cell = (cx: number, value: number): void => {
    r.rect(cx, y, cellW, cellH, PAL.ink);
    r.rect(cx + 1, y + 1, cellW - 2, cellH - 2, PAL.shadow);
    // Faint scanlines so the cell reads like an LED display.
    for (let sy = y + 2; sy < y + cellH - 1; sy += 3) {
      r.hline(cx + 1, sy, cellW - 2, PAL.bg);
    }
    // Digit centered (clamped to a single character for the cell).
    const label = String(Math.max(0, Math.min(99, Math.round(value))));
    r.text(label, cx + cellW / 2 + 0.5, y + cellH / 2 - 3, {
      color: PAL.fdjYellow,
      scale: 1,
      align: 'center',
    });
  };

  cell(x, a);
  cell(x + cellW + gap, b);

  // Lit colon between the cells.
  const colonX = x + cellW + Math.floor(gap / 2);
  r.rect(colonX, y + 4, 2, 2, PAL.fdjYellow);
  r.rect(colonX, y + cellH - 6, 2, 2, PAL.fdjYellow);
}
