# ART — Tabaco Please pixel-art pipeline

Visual contract for the rendering layer. Logic (rules / consequence / economy /
content) is untouched — this is a visual pipeline only.

## 1. Virtual-resolution pipeline

- The whole game is drawn into a **480x270** (16:9) **offscreen backbuffer**.
  `VW = 480`, `VH = 270` are exported from `src/engine/renderer.ts`.
- `src/main.ts` creates an offscreen `<canvas>` at 480x270 and passes its 2d ctx
  to `Renderer`. `imageSmoothingEnabled = false` everywhere.
- Every frame: `sm.update(dt)` → `renderer.clear()` → `sm.render(renderer)` →
  the backbuffer is **integer-upscaled** and centered (letterbox dark bars) into
  the viewport-filling visible `#game` canvas via `drawImage`, smoothing OFF.
- Integer scale = `max(1, floor(min(winW/480, winH/270)))`, computed in device
  pixels (`devicePixelRatio` aware) on load and `resize`.
- **All scene/UI coordinates are in the 480x270 space** (not 960x540).

## 2. Input mapping

`src/engine/input.ts` maps DOM click/pointer coords → virtual 480x270:
subtract the letterbox offset, divide by scale. Clicks in the letterbox bars are
ignored. `main.ts` feeds the viewport with `input.setViewport(scale, offX, offY)`
(CSS-pixel units) on every resize. `onClick(cb)` / `pointer` getter unchanged;
callbacks receive virtual coords.

## 3. Renderer API (`src/engine/renderer.ts`)

Public (stable) API:

- `clear(color?)` — fill backbuffer.
- `rect(x,y,w,h,color)` — filled, integer-aligned, hard edges.
- `stroke(x,y,w,h,color,lw=1)` — outline drawn as 4 crisp fills (no rounded
  corners, no AA).
- `text(s,x,y,{color,scale,size?,align})` — **chunky 5x7 bitmap font**. `scale`
  defaults to 1 (~7px tall). `size` (legacy) is converted to a scale. `align` =
  `left|center|right` around `x`. Input is up-cased; lowercase falls back to the
  uppercase glyph. French accents `é è ê ë à â ä ù û ü î ï ô ö ç` render as base
  glyph + a pixel accent mark (cedilla below).
- `sprite(name,x,y,w,h,label?)` — pixel-style fallback: flat palette fill + 1px
  ink border + centered bitmap label. Placeholder only; real art = `sprites.ts`.
- `measure(s,scale=1)` — pixel advance width, consistent with the bitmap font
  (6px advance per glyph, minus the trailing gap).
- `ctx` — raw 2d context of the backbuffer.

Low-level pixel helpers for `sprites.ts`:

- `px(x,y,color)` — single 1x1 pixel block (the fundamental art primitive).
- `hline(x,y,len,color)` / `vline(x,y,len,color)` — 1px lines.
- `fillRectPx(x,y,w,h,color)` — alias for `rect`.

Font metrics: glyph cell 5w x 7h, advance 6px. `measure` = `len*6 - 1` × scale.

## 4. Palette (`src/engine/palette.ts`)

`PAL` — the ONLY colors art should use (restricted, desaturated tabac/bourg):

`bg`, `woodDark`, `wood`, `woodLight`, `wall`, `wallDark`, `paper`, `ink`,
`rougeTabac`, `fdjRouge`, `fdjJaune`, `vertMuted`, `peau`, `peauOmbre`,
`blancCasse`, `ombre`.

## 5. Layout zones (`src/engine/layout.ts`)

`LAYOUT` — scene zones in 480x270 coords (each `{x,y,w,h}` unless noted):

- `presentoir` — mur de paquets, top band full width (y 0..150).
- `arriere` — mid wall strip (y 150..210), holds the window.
- `comptoir` — wooden counter, bottom band (y 210..270).
- `clientWindow` — client framed in the window (center-upper).
- `speechBubble` — speech bubble anchor (top-left + size).
- `cniSlot` — CNI/ID slot on the counter, left, shown on demand.
- `terminalFDJ` — FDJ terminal seat, right.
- `toolBar` — bottom strip for action buttons.
- `moneyTray` — money tray, bottom-right.
- `patienceBar` — patience/mood bar along the top.

`VW` / `VH` are re-exported from `layout.ts` too.

## 6. sprites.ts API (NEXT agent implements)

The art module `src/engine/sprites.ts` must expose these functions, drawing only
with `PAL` colors via the renderer pixel helpers, positioned with `LAYOUT`:

```ts
drawComptoir(r: Renderer): void;
drawPresentoir(r: Renderer, packs: { x: number; y: number; color: string }[]): void;
drawCigarettePack(r: Renderer, x: number, y: number, color: string, label?: string): void;
drawClient(r: Renderer, x: number, y: number, opts: { ivre?: boolean; mood?: 'neutre' | 'fache' | 'content' }): void;
drawSpeechBubble(r: Renderer, x: number, y: number, w: number, text: string): void;
drawCNI(r: Renderer, x: number, y: number, fields: { nom: string; naissance: string }): void;
drawTerminalFDJ(r: Renderer, x: number, y: number): void;
drawTicket(r: Renderer, x: number, y: number, color: string): void;
drawPiece(r: Renderer, x: number, y: number, valeur: number): void;
drawPatience(r: Renderer, x: number, y: number, w: number, frac: number): void;
```
