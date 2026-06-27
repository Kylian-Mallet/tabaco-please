// Procedural PIXEL-ART for the COMPTOIR scene. Every function draws ONLY with
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
// Comptoir — wooden counter across the bottom band.
// ---------------------------------------------------------------------------
export function drawComptoir(r: Renderer): void {
  const { x, y, w, h } = LAYOUT.comptoir;

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
// Présentoir — the "mur de paquets" backdrop behind the counter.
// ---------------------------------------------------------------------------
export function drawPresentoir(
  r: Renderer,
  packs: { x: number; y: number; color: string }[]
): void {
  const { x, y, w, h } = LAYOUT.presentoir;

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
    if (i % 2 === 0) r.hline(x, y + i, w, PAL.ombre);
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
  r.hline(x, y + 5, W, PAL.ombre);

  // Cream health-warning band across the middle.
  r.rect(x, y + 11, W, 5, PAL.blancCasse);
  // Tiny ink label text inside the band.
  r.hline(x + 2, y + 12, W - 4, PAL.ink);
  r.hline(x + 3, y + 14, W - 6, PAL.peauOmbre);

  // Brand mark dot above the band.
  r.rect(x + 4, y + 7, W - 8, 3, PAL.blancCasse);

  // Left highlight, right + bottom shadow.
  r.vline(x + 1, y + 6, H - 7, PAL.woodLight);
  r.vline(x + W - 2, y + 6, H - 7, PAL.ombre);
  r.hline(x + 1, y + H - 2, W - 2, PAL.ombre);

  // Hard ink outline.
  r.stroke(x, y, W, H, PAL.ink, 1);

  // Optional single-letter brand initial under the cap (rare, kept subtle).
  if (label && label.length > 0) {
    r.px(x + W - 4, y + 18, PAL.blancCasse);
  }
}

// ---------------------------------------------------------------------------
// Client — pixel-art bust framed at the window.
// ---------------------------------------------------------------------------
export function drawClient(
  r: Renderer,
  x: number,
  y: number,
  opts: { ivre?: boolean; mood?: 'neutre' | 'fache' | 'content' }
): void {
  const mood = opts.mood ?? 'neutre';
  const droop = opts.ivre ? 2 : 0;

  // --- Torso / coat (behind the head) ---
  const coatW = 56;
  const coatH = 30;
  const coatX = x - coatW / 2;
  const coatY = y + 26 + droop;
  r.rect(coatX, coatY, coatW, coatH, PAL.wallDark);
  r.stroke(coatX, coatY, coatW, coatH, PAL.ink, 1);
  // Collar / shoulders highlight.
  r.hline(coatX + 2, coatY + 1, coatW - 4, PAL.wood);
  // Coat opening V.
  r.rect(x - 1, coatY + 2, 2, coatH - 2, PAL.ink);
  r.px(x - 4, coatY + 6, PAL.woodLight);
  r.px(x + 3, coatY + 6, PAL.woodLight);

  // --- Neck ---
  r.rect(x - 5, y + 20 + droop, 10, 8, PAL.peauOmbre);

  // --- Head ---
  const hw = 28;
  const hh = 30;
  const hx = x - hw / 2;
  const hy = y - 2 + droop;
  r.rect(hx, hy, hw, hh, PAL.peau);
  r.stroke(hx, hy, hw, hh, PAL.peauOmbre, 1);
  // Cheek/jaw shadow on the right side.
  r.vline(hx + hw - 2, hy + 6, hh - 8, PAL.peauOmbre);
  r.hline(hx + 3, hy + hh - 2, hw - 6, PAL.peauOmbre);

  // --- Hair ---
  r.rect(hx - 1, hy - 4, hw + 2, 7, PAL.woodDark);
  r.rect(hx - 2, hy - 1, 3, 12, PAL.woodDark);
  r.rect(hx + hw - 1, hy - 1, 3, 12, PAL.woodDark);
  // Hair texture flecks.
  r.px(hx + 6, hy - 2, PAL.wood);
  r.px(hx + 16, hy - 3, PAL.wood);

  // --- Eyes ---
  const eyeY = hy + 11 + droop;
  const lex = hx + 7;
  const rex = hx + hw - 9;
  // Whites.
  r.rect(lex, eyeY, 5, 4, PAL.blancCasse);
  r.rect(rex, eyeY, 5, 4, PAL.blancCasse);
  // Pupils.
  r.rect(lex + (opts.ivre ? 1 : 2), eyeY + 1, 2, 2, PAL.ink);
  r.rect(rex + 1, eyeY + 1, 2, 2, PAL.ink);

  // --- Brows (mood) ---
  if (mood === 'fache') {
    // Angled down toward the nose.
    r.px(lex + 4, eyeY - 2, PAL.ink);
    r.px(lex + 3, eyeY - 1, PAL.ink);
    r.px(rex, eyeY - 2, PAL.ink);
    r.px(rex + 1, eyeY - 1, PAL.ink);
    r.hline(lex, eyeY - 2, 3, PAL.ink);
    r.hline(rex + 2, eyeY - 2, 3, PAL.ink);
  } else if (mood === 'content') {
    // Raised, relaxed.
    r.hline(lex, eyeY - 3, 5, PAL.woodDark);
    r.hline(rex, eyeY - 3, 5, PAL.woodDark);
  } else {
    r.hline(lex, eyeY - 2, 5, PAL.woodDark);
    r.hline(rex, eyeY - 2, 5, PAL.woodDark);
  }

  // --- Nose ---
  r.vline(x, eyeY + 3, 4, PAL.peauOmbre);
  r.px(x - 1, eyeY + 6, PAL.peauOmbre);

  // --- Mouth (mood) ---
  const my = hy + 23 + droop;
  if (mood === 'content') {
    // Smile.
    r.hline(x - 4, my, 8, PAL.ink);
    r.px(x - 5, my - 1, PAL.ink);
    r.px(x + 4, my - 1, PAL.ink);
  } else if (mood === 'fache') {
    // Frown.
    r.hline(x - 4, my, 8, PAL.ink);
    r.px(x - 5, my + 1, PAL.ink);
    r.px(x + 4, my + 1, PAL.ink);
  } else {
    // Flat line.
    r.hline(x - 4, my, 8, PAL.ink);
  }

  // --- Drunk: red cheeks + nose flush ---
  if (opts.ivre) {
    r.rect(hx + 3, eyeY + 5, 4, 3, PAL.rougeTabac);
    r.rect(hx + hw - 7, eyeY + 5, 4, 3, PAL.rougeTabac);
    r.px(x - 1, eyeY + 5, PAL.rougeTabac);
    r.px(x, eyeY + 5, PAL.rougeTabac);
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
  r.rect(x + 2, y + 2, w, h, PAL.ombre);

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
  r.hline(x + 2, y + 1, w - 4, PAL.blancCasse);

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
  fields: { nom: string; naissance: string }
): void {
  const w = 152;
  const h = 88;

  // Drop shadow + cream card.
  r.rect(x + 2, y + 2, w, h, PAL.ombre);
  r.rect(x, y, w, h, PAL.paper);
  r.stroke(x, y, w, h, PAL.ink, 1);
  // Paper sheen.
  r.hline(x + 1, y + 1, w - 2, PAL.blancCasse);

  // Header band (full width). 'REPUBLIQUE FRANCAISE' = 119px @ scale 1, fits.
  r.rect(x + 1, y + 1, w - 2, 11, PAL.rougeTabac);
  r.text('REPUBLIQUE FRANCAISE', x + 4, y + 3, { color: PAL.blancCasse, scale: 1, align: 'left' });
  // Tricolore tab at the far right, clear of the header text.
  r.rect(x + w - 11, y + 2, 3, 9, PAL.vertMuted);
  r.rect(x + w - 8, y + 2, 3, 9, PAL.blancCasse);
  r.rect(x + w - 5, y + 2, 3, 9, PAL.fdjRouge);

  // Sub-title line.
  r.text("CARTE D'IDENTITE", x + 4, y + 16, { color: PAL.ink, scale: 1, align: 'left' });

  // Photo box (skin block, framed).
  const pw = 30;
  const ph = 42;
  const px0 = x + 6;
  const py0 = y + 28;
  r.rect(px0, py0, pw, ph, PAL.peau);
  r.stroke(px0, py0, pw, ph, PAL.ink, 1);
  // Simple head silhouette in the photo.
  r.rect(px0 + 9, py0 + 6, 12, 12, PAL.peauOmbre);
  r.rect(px0 + 6, py0 + 20, 18, ph - 20, PAL.peauOmbre);

  // Label / value rows, right of the photo.
  const tx = px0 + pw + 8;
  const avail = x + w - 5 - tx; // pixels available for a value before the edge
  let ry = y + 28;
  const rows: { label: string; value: string }[] = [
    { label: 'NOM', value: fields.nom },
    { label: 'NE(E) LE', value: fields.naissance },
  ];
  for (const row of rows) {
    r.text(row.label, tx, ry, { color: PAL.peauOmbre, scale: 1, align: 'left' });
    r.text(clampToWidth(row.value, avail), tx, ry + 9, { color: PAL.ink, scale: 1, align: 'left' });
    // Underline rule.
    r.hline(tx, ry + 18, w - (tx - x) - 5, PAL.peauOmbre);
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
  r.rect(x + 2, y + 2, w, h, PAL.ombre);
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
  r.rect(sx + 1, sy + 1, sw - 2, sh - 2, PAL.fdjRouge);
  r.rect(sx + 1, sy + 1, sw - 2, 6, PAL.fdjJaune);
  r.text('FDJ', sx + 3, sy + 1, { color: PAL.ink, scale: 1, align: 'left' });
  // Scanlines.
  for (let i = sy + 9; i < sy + sh - 1; i += 3) r.hline(sx + 1, i, sw - 2, PAL.ombre);

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
  r.hline(x + w - 9, y + 35, 5, PAL.fdjJaune);
}

// ---------------------------------------------------------------------------
// Scratch ticket — colored card with a silver scratch panel.
// ---------------------------------------------------------------------------
export function drawTicket(r: Renderer, x: number, y: number, color: string): void {
  const w = 40;
  const h = 26;

  // Shadow + colored body.
  r.rect(x + 1, y + 1, w, h, PAL.ombre);
  r.rect(x, y, w, h, color);
  r.stroke(x, y, w, h, PAL.ink, 1);
  // Top banner.
  r.rect(x + 1, y + 1, w - 2, 6, PAL.fdjRouge);
  r.text('FDJ', x + 3, y + 1, { color: PAL.fdjJaune, scale: 1, align: 'left' });

  // Silver scratch panel.
  const px0 = x + 4;
  const py0 = y + 10;
  const pw = w - 8;
  const ph = h - 14;
  r.rect(px0, py0, pw, ph, PAL.peauOmbre);
  r.rect(px0 + 1, py0 + 1, pw - 2, ph - 2, PAL.wall);
  // Scratch scuff texture.
  for (let gy = py0 + 1; gy < py0 + ph - 1; gy += 2) {
    for (let gx = px0 + 1; gx < px0 + pw - 1; gx += 2) {
      if (hash2(gx, gy) > 0.6) r.px(gx, gy, PAL.woodLight);
    }
  }
  // A couple of "stars" to scratch.
  r.px(px0 + 5, py0 + 3, PAL.fdjJaune);
  r.px(px0 + pw - 6, py0 + 3, PAL.fdjJaune);
}

// ---------------------------------------------------------------------------
// Euro coin — gold/silver ring with the value digit.
// ---------------------------------------------------------------------------
export function drawPiece(r: Renderer, x: number, y: number, valeur: number): void {
  // Coins under 1€ read as gold (centimes), 1€+ as bicolour silver/gold.
  const small = valeur < 1;
  const ring = small ? PAL.fdjJaune : PAL.peauOmbre;
  const core = small ? PAL.woodLight : PAL.fdjJaune;
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
  r.px(x + 3, y + 2, PAL.blancCasse);
  r.px(x + D - 4, y + D - 3, PAL.ombre);

  // Value digit centered.
  const label = small ? String(Math.round(valeur * 100)) : String(valeur);
  r.text(label, cx + 0.5, cy - 3, { color: PAL.ink, scale: 1, align: 'center' });
}

// ---------------------------------------------------------------------------
// Patience bar — segmented gauge; fills vertMuted -> fdjRouge as frac drops.
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
      const col = t < 0.34 ? PAL.fdjRouge : t < 0.67 ? PAL.fdjJaune : PAL.vertMuted;
      r.rect(sx, y + 1, segW, h - 2, col);
      r.hline(sx, y + 1, Math.max(1, Math.round(segW)), PAL.blancCasse);
    } else {
      r.rect(sx, y + 1, segW, h - 2, PAL.ombre);
    }
  }

  // Frame.
  r.stroke(x, y, w, h, PAL.ink, 1);
}
