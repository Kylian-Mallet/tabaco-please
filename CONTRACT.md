# Tabaco Please — API CONTRACT (MVP, 4 days / 6 rules)

This file is the **source of truth** for every exported signature. All agents code
against these signatures in parallel. Match names, params and return types EXACTLY.
Shared model lives in `src/game/types.ts` (do not redefine it elsewhere — import it).

Stack: vanilla TypeScript, canvas 2D, Vite, ESM, strict TS, no extra deps.
Sprites are pixel-art **placeholders**: colored rects + text labels, no asset files.

---

## MODEL — `src/game/types.ts`

```ts
type Categorie = 'tabac' | 'alcool' | 'epicerie' | 'jeux'

interface Produit { id: string; nom: string; categorie: Categorie; prix: number; ageMin: number }

interface Client {
  id: string
  sprite: string
  demande: Produit
  dateNaissance: string          // ISO 'YYYY-MM-DD'
  estIvre: boolean
  nomSurFichierInterdits: boolean
  nomComplet: string
  patience: number               // 0..100
}

type TypeRegle = 'monnaie' | 'age' | 'ivresse' | 'fichier'

interface Regle { id: string; jourDeblocage: number; type: TypeRegle; description: string }

interface Decision { client: Client; action: 'vendre' | 'refuser'; correcte: boolean }

interface EtatPartie {
  jour: number
  tresorerie: number
  avertissements: number
  reglesActives: Regle[]
  recetteDuJour: number
  fautesNonVues: Decision[]
}

const JOUR_COURANT: string          // in-game "today" (ISO) for age math = '2026-06-27'
const LOYER: number                 // weekly rent
const COMMANDE_FOURNISSEUR: number  // weekly supplier cost
const TRESORERIE_INITIALE: number   // starting cash
const DENOMINATIONS: number[]       // [50,20,10,5,2,1,0.5,0.2,0.1]

interface GameContext {
  state: EtatPartie
  renderer: Renderer        // type-import from engine/renderer
  sm: StateMachine          // type-import from engine/stateMachine
  goTo(scene: Scene): void  // Scene type-import from engine/stateMachine
}
```

---

## ENGINE

### `src/engine/renderer.ts`
Thin wrapper over `CanvasRenderingContext2D`. Default font monospace; pixelated.

```ts
export class Renderer {
  constructor(ctx: CanvasRenderingContext2D)
  clear(color?: string): void
  rect(x: number, y: number, w: number, h: number, color: string): void
  stroke(x: number, y: number, w: number, h: number, color: string, lw?: number): void
  text(s: string, x: number, y: number,
       opts?: { color?: string; size?: number; align?: CanvasTextAlign; font?: string }): void
  sprite(name: string, x: number, y: number, w: number, h: number, label?: string): void
  measure(s: string, size?: number): number
  readonly ctx: CanvasRenderingContext2D
}
```

### `src/engine/input.ts`
Maps DOM coords to canvas coords accounting for CSS scaling (canvas internal 960x540
may be displayed smaller). `pointer` is the latest known position.

```ts
export interface Pointer { x: number; y: number }
export class Input {
  constructor(canvas: HTMLCanvasElement)
  get pointer(): Pointer
  onClick(cb: (p: Pointer) => void): void
}
```

### `src/engine/ui.ts`
Reusable widgets. Each visible widget has `draw(r: Renderer): void`; clickable widgets
also have `hit(p): boolean`.

```ts
export interface Rect { x: number; y: number; w: number; h: number }
export function inRect(p: { x: number; y: number }, r: Rect): boolean

export class Button {
  constructor(r: Rect, label: string, onClick: () => void,
              opts?: { color?: string; disabled?: boolean })
  draw(r: Renderer): void
  hit(p: { x: number; y: number }): boolean
  click(): void           // invokes onClick only if not disabled
  disabled: boolean
}

export class Panel {
  constructor(r: Rect, opts?: { title?: string; color?: string })
  draw(r: Renderer): void
}

// CNI-like identity document card.
export class DocumentCard {
  constructor(r: Rect, lines: { label: string; value: string }[],
              opts?: { title?: string; photo?: boolean })
  draw(r: Renderer): void
}

// Scrollable/filterable name list (used for fichier des interdits).
export class ListView {
  constructor(r: Rect, items: string[], opts?: { title?: string })
  draw(r: Renderer): void
  setQuery(q: string): void          // filter displayed items
  contains(name: string): boolean    // exact membership test against full item set
}

// Clickable denomination tray; click adds a coin/bill, tracks running total.
export class MoneyTray {
  constructor(r: Rect, denoms: number[], onChange: (total: number) => void)
  draw(r: Renderer): void
  hit(p: { x: number; y: number }): boolean
  click(p: { x: number; y: number }): void  // add denom under pointer, fire onChange
  total: number
  reset(): void
}
```

### `src/engine/stateMachine.ts`
```ts
export interface Scene {
  enter?(): void
  update?(dt: number): void
  render(r: Renderer): void
  onClick?(p: { x: number; y: number }): void
}
export class StateMachine {
  set(s: Scene): void           // calls current.enter? on switch
  get current(): Scene | null
  update(dt: number): void      // delegates to current
  render(r: Renderer): void     // delegates to current
  onClick(p: { x: number; y: number }): void  // delegates to current
}
```

### `src/engine/save.ts`
LocalStorage persistence of the run.

```ts
export function storageAvailable(): boolean
export function save(s: EtatPartie): void     // no-op if storage unavailable
export function load(): EtatPartie | null     // null if nothing saved / unavailable
```

---

## GAME LOGIC

### `src/game/rules.ts`
```ts
// Whole-year age at dateRef (default JOUR_COURANT).
export function ageDepuis(dateNaissance: string, dateRef?: string): number

// A 'vendre' is correcte only if ALL active rules pass:
//   age:      ageDepuis(client) >= demande.ageMin
//   ivresse:  NOT (demande.categorie==='alcool' && client.estIvre)
//   fichier:  NOT (demande.categorie==='jeux'   && client.nomSurFichierInterdits)
//   monnaie:  handled separately in CounterScene (not here)
// A 'refuser' is correcte only if at least one active rule WOULD have blocked the sale
//   (refusing an otherwise-valid client = faute: lost regular).
// raisons: human-readable reasons the sale is/ would be blocked.
export function evalDecision(client: Client, action: 'vendre' | 'refuser', regles: Regle[]):
  { correcte: boolean; raisons: string[] }

export const REGLES: Record<TypeRegle, Regle>
```
Age min is 18 for `tabac`, `alcool`, `jeux`; `epicerie` has no age limit.

### `src/game/consequence.ts`
```ts
export interface Evt {
  type: 'avertissement' | 'amende' | 'controle' | 'patience'
  montant?: number
  message: string
}

// Apply a player decision to state; returns events to show.
// - 1st faute of the run = avertissement (grace, no fine), increments state.avertissements
// - later VISIBLE fautes = immediate amende deducted from recetteDuJour
// - hidden risky sales (wrong 'vendre' that slipped) are pushed to state.fautesNonVues
export function appliquer(state: EtatPartie, decision: Decision): Evt[]

// Random end-of-day inspection: audits state.fautesNonVues, may fine.
export function controleAleatoire(state: EtatPartie): Evt[]
```

### `src/game/economy.ts`
```ts
export function encaisser(state: EtatPartie, montant: number): void   // add to recetteDuJour
// End-of-week: fold recette into tresorerie, deduct LOYER + COMMANDE_FOURNISSEUR.
export function couperetSemaine(state: EtatPartie): { faillite: boolean; detail: string }
export function estFinSemaine(jour: number): boolean   // true at end of the week (jour >= DERNIER_JOUR)
```

### `src/game/content/produits.ts`
```ts
export const PRODUITS: Produit[]   // mix of tabac/alcool/epicerie/jeux with prix & ageMin
```

### `src/game/content/clients.ts`
```ts
export function makeClient(partial?: Partial<Client>): Client   // random sensible defaults
export function poolDuJour(jour: number): Client[]              // deterministic-ish day roster
```

### `src/game/content/jours.ts`
```ts
export interface JourConfig {
  jour: number
  nouvelleRegle?: Regle     // rule unlocked this day, if any
  intro: string             // briefing text shown in DayIntroScene
  file: Client[]            // ordered queue of clients for the day
}
export function configJour(jour: number): JourConfig
export const DERNIER_JOUR: number   // = 4
```

Day progression of rules:
- **J1**: caisse / monnaie only (`monnaie`)
- **J2**: + age tabac (`age`)
- **J3**: + alcool & ivresse (`ivresse`)
- **J4**: + fichier des interdits (`fichier`)

---

## SCENES — each `implements Scene`, constructed with `GameContext`

```ts
// src/scenes/title.ts
export class TitleScene implements Scene { constructor(ctx: GameContext) }
// src/scenes/dayIntro.ts  — shows new-rule card / briefing
export class DayIntroScene implements Scene { constructor(ctx: GameContext) }
// src/scenes/counter.ts   — main client loop (doc check, money tray, vendre/refuser)
export class CounterScene implements Scene { constructor(ctx: GameContext) }
// src/scenes/dayEnd.ts    — daily bilan + controleAleatoire
export class DayEndScene implements Scene { constructor(ctx: GameContext) }
// src/scenes/weekEnd.ts   — couperet: loyer + commande fournisseur
export class WeekEndScene implements Scene { constructor(ctx: GameContext) }
// src/scenes/gameOver.ts
export class GameOverScene implements Scene { constructor(ctx: GameContext) }
```

Scene flow: Title → DayIntro → Counter → DayEnd → (estFinSemaine ? WeekEnd → next/GameOver
: DayIntro next day). Faillite or too many avertissements → GameOver.

---

## MAIN — `src/main.ts`
Boots: grabs `#game` canvas + 2D ctx, builds `Renderer`, `Input`, `StateMachine`,
assembles `GameContext` (with `goTo` calling `sm.set`), loads save or fresh
`EtatPartie` (tresorerie = TRESORERIE_INITIALE), starts at `TitleScene`, runs a
`requestAnimationFrame` loop computing `dt` and calling `sm.update(dt)` + `sm.render(r)`,
and forwards `Input.onClick` to `sm.onClick`.

---

## CONVENTIONS
- All money in euros as plain numbers; round change comparisons to cents.
- No implicit `any`; everything strict. Import shared types from `src/game/types.ts`.
- Engine must not import from game/scenes (one-way dependency: scenes → game → engine).
