# Tabaco Please

A small browser game in the spirit of *Papers, Please*, set behind the counter
of a French *tabac* (tobacconist / press / FDJ lottery / convenience shop). You
serve a queue of clients, make exact change, check IDs, refuse illegal sales
(minors, drunk customers, banned gamblers, fake / out-of-stock products) and try
to stay solvent against weekly rent and supplier charges.

- **Live (GitHub Pages):** https://kylian-mallet.github.io/tabaco-please/
- Whole game is drawn as procedural pixel art into a low-res backbuffer — there
  are **no asset files** (no PNG/sprites/fonts on disk).

## Stack

- **Vanilla TypeScript** (strict), no framework.
- **Canvas 2D** rendering only.
- **Vite** for dev/build.
- **npm** for package management and CI. We use npm, **not pnpm**: pnpm 11 blocks
  esbuild's install build script, which breaks the Vite build, so the GitHub
  Actions workflow (`.github/workflows/deploy.yml`) runs `npm ci` / `npm run build`.

## Run / build commands

```bash
# Dev server (hot reload)
./node_modules/.bin/vite

# Type-check only
./node_modules/.bin/tsc --noEmit

# Production build -> dist/
./node_modules/.bin/vite build
```

**IMPORTANT:** call `tsc` and `vite` **directly via `./node_modules/.bin/`**.
Do NOT use the `npm run` / pnpm script wrappers for build checks in this
environment — the script wrappers abort on a dependency precheck. (The `dev`,
`build`, `typecheck` scripts in `package.json` are kept for normal local use and
CI; the direct-binary form is the reliable path here.)

**Deploy is automatic:** pushing to `main` triggers `deploy.yml`, which builds
and publishes `dist/` to GitHub Pages. `vite.config.ts` sets
`base: '/tabaco-please/'` for the production build (and `'/'` for dev), so assets
resolve under the Pages project path.

## Architecture

The game renders into a fixed **480x270** offscreen backbuffer (`VW`x`VH` in
`src/engine/renderer.ts`). `src/main.ts` upscales that backbuffer into the
viewport-filling visible `<canvas>` with **integer, no-smoothing** nearest-
neighbour scaling and dark letterbox bars — that gives the chunky pixel-art look.
All gameplay coordinates are in backbuffer pixels; input is mapped back from CSS
pixels in `main.ts` / `engine/input.ts`.

### `src/engine/` — reusable, game-agnostic layer
- `renderer.ts` — backbuffer drawing API: `rect`, `stroke`, `text` (chunky bitmap
  font), `sprite`, `px`/`hline`/`vline`/`fillRectPx`, `measure`. Exports `VW`/`VH`.
- `input.ts` — pointer/click handling, viewport mapping (`Pointer`, `Input`).
- `ui.ts` — widgets: `Button`, `Panel`, `DocumentCard`, `ListView`, `MoneyTray`,
  `inRect`.
- `stateMachine.ts` — `Scene` interface + `StateMachine` (swap scene, delegate
  `update`/`render`/`onClick`).
- `save.ts` — `localStorage` persistence (`save`/`load`/`storageAvailable`).
- `palette.ts` — `PAL`, the restricted ~16-colour palette (see conventions).
- `layout.ts` — `LAYOUT` named screen zones (shelf, counter, clientWindow,
  speechBubble, cniSlot, terminalFDJ, toolBar, moneyTray, patienceBar, …).
- `sprites.ts` — procedural sprite draw helpers (`drawCounter`, `drawShelf`,
  `drawCigarettePack`, `drawClient`, `drawSpeechBubble`, `drawCNI`,
  `drawTerminalFDJ`, `drawTicket`, `drawCoin`, `drawPatience`, `drawRadio`,
  `drawCan`, `drawFakeRelic`, …).
- `radio.ts` — in-game radio (procedural Web Audio stations).
- `sfx.ts` — procedural sound effects.
- `controls.ts` — persistent on-screen control bar (`ControlsOverlay`:
  fullscreen, audio toggles) rendered on top of every scene.

(There is no `settings.ts` module; settings live inside `radio.ts`/`sfx.ts`/
`controls.ts`.)

### `src/game/` — domain logic / data
- `types.ts` — canonical data model & constants (single source of truth).
- `rules.ts` — age math (`ageFrom`), `evaluateDecision`, and the `RULES` registry.
- `consequence.ts` — `applyConsequence` (warnings/fines per decision) and
  `randomInspection` (end-of-day audit of risky sales).
- `economy.ts` — daily takings, `weeklyReckoning` (rent + supplier), `isWeekEnd`.
- `content/` — concrete data: `products.ts` (catalogue + fakes/out-of-stock),
  `clients.ts` (client generation / daily roster), `days.ts` (per-day rule
  progression, briefing text, queue).

### `src/scenes/` — the state machine flow
`TITLE → DAY_INTRO → COUNTER → DAY_END → (WEEK_END) → GAME_OVER`
- `title.ts` `TitleScene` → start a run.
- `dayIntro.ts` `DayIntroScene` → briefing, activates the day's new rule.
- `counter.ts` `CounterScene` → the main loop: serve clients, sell/refuse, make
  change; runs the end-of-day inspection then goes to day end.
- `dayEnd.ts` `DayEndScene` → day summary; next day or week end.
- `weekEnd.ts` `WeekEndScene` → weekly reckoning; game over if bankrupt.
- `gameOver.ts` `GameOverScene` → back to title.

## Conventions (READ THIS)

- **Language split (strict):**
  - **ALL** code identifiers (types, fields, functions, variables, file names)
    and **ALL** comments are in **English**.
  - **ONLY** user-facing string *literals* drawn on the canvas stay in **French**
    (with accents): toasts, button captions (`'VENDRE'`, `'REFUSER'`,
    `'Demander CNI'`, …), rule descriptions, scene/briefing text, radio station
    names, popup/menu labels. **Never** translate those to English.
- **Procedural pixel art only** — no asset files. New visuals are draw helpers in
  `engine/sprites.ts`, built from `renderer` primitives.
- **`PAL` is the only palette.** All colours come from `engine/palette.ts`; do not
  introduce raw hex outside it (product tints reference PAL values).
- **Double-channel design** — gameplay reads two independent signals: the *papier*
  (the document/request: product, CNI date of birth, FDJ ban list, change owed)
  vs. the *visage* (the client bust: looks, drunkenness, patience). A correct
  decision usually cross-checks both channels.
- **MVP scope discipline** — keep features minimal and self-contained; the run is
  a short 4-day week (`LAST_DAY = 4`).

## Data model summary (`src/game/types.ts`)

- **`Product`** — `id`, `name`, `category` (`'tabac' | 'alcool' | 'epicerie' |
  'jeux'`), `price`, `minAge` (0 = no restriction), optional `color` (PAL tint),
  `inStock`, `fake`.
- **`Client`** — `id`, `sprite`, `request: Product`, `birthDate` (ISO), `isDrunk`,
  `onBanList`, `fullName`, `patience` (0..100), optional `look`, `gullibility`.
- **`Rule`** — `id`, `unlockDay`, `type` (`'change' | 'age' | 'drunk' |
  'banList'`), `description` (French).
- **`GameState`** — `day`, `cash`, `warnings`, `activeRules`, `dayRevenue`,
  `unseenFaults` (risky sales the inspection may audit later).
- Constants: `TODAY` (age math reference), `RENT`, `SUPPLIER_ORDER`,
  `STARTING_CASH`, `DENOMINATIONS` (change-making).

### How to add a product
Add an entry to `PRODUCTS` in `src/game/content/products.ts` (or `FAKE_PRODUCTS`
for invented / out-of-stock items). Give it a unique `id`, a French display
`name`, a `category`, `price`, correct `minAge`, and a PAL-based `color`.
A product `id` is an internal DATA key (not a code identifier): it is a stable
slug that may mirror the French `name` (e.g. `vin-bordeaux`, `grille-loto`). The
English-only rule covers code identifiers, not these data slug values.
`isAvailable(p)` already gates `inStock`/`fake`. Clients only request products
that the roster picks from these lists.

### How to add a rule
1. Add the `RuleType` to the union in `types.ts`.
2. Register it in `RULES` in `src/game/rules.ts` with `unlockDay` and a French
   `description`, and add its check to `evaluateDecision`.
3. Wire its unlock day into `RULE_OF_DAY` / `INTRO_OF_DAY` in
   `src/game/content/days.ts`.

### How to add a sprite
Add a `drawXxx(r: Renderer, x, y, …)` helper in `src/engine/sprites.ts` using only
`renderer` primitives and `PAL` colours; call it from the relevant scene. No asset
files.

## Expansion contract (new product categories)

A shared, agreed contract for the current expansion (some pieces land across
phases — match whatever names already exist in the code before editing):
- New categories: `'cbd'` (18+, `drawCBD`), `'presse'` (magazines/newspapers,
  mixed ages, `drawMagazine`), `'vape'` (18+, `drawVape`). Existing categories
  (`tabac`/`alcool`/`epicerie`/`jeux`) stay.
- **Unlock model:** each product carries an unlock group; `GameState` tracks
  unlocked groups; clients only ever request unlocked products. Group ids:
  `'base'` (always), `'cbd'`, `'presse'`, `'vape'`. CBD unlocks after week 1;
  magazines and vape unlock in later weeks.

## Gotchas

- **`localStorage` may be unavailable** in some embeds/sandboxes — all access is
  guarded by `storageAvailable()` in `engine/save.ts`; saving/loading is a no-op
  when absent.
- **Audio is gated by autoplay policy** — radio and SFX are created at boot but
  only resumed on the **first user gesture** (`armAudio` in `main.ts`).
- **`Math.random` at runtime is fine, but the build sandbox must not call it.**
  Client generation (`content/clients.ts`) uses `Math.random` in the browser;
  gameplay rolls that need to stay reproducible (e.g. the end-of-day inspection in
  `counter.ts`) are deterministic, folded from client + state counters instead.
