// Canonical COUNTER scene zones, all in the 480x270 virtual space.
// Scenes import LAYOUT so geometry stays consistent across the title/day/
// counter screens and matches what sprites.ts draws.

import { VW, VH } from './renderer';

export { VW, VH };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const LAYOUT = {
  /** Pack wall behind the counter: top band, full width. */
  shelf: { x: 0, y: 0, w: VW, h: 150 } as Rect,

  /** Wooden counter in the foreground: bottom band, full width. */
  counter: { x: 0, y: 210, w: VW, h: VH - 210 } as Rect,

  /** Mid wall strip between shelf and counter (where the window sits). */
  back: { x: 0, y: 150, w: VW, h: 60 } as Rect,

  /** Client window (the shopkeeper sees the client framed here). */
  clientWindow: { x: 168, y: 40, w: 144, h: 120 } as Rect,

  /** Anchor point for the client speech bubble (top-left of bubble). */
  speechBubble: { x: 300, y: 36, w: 168, h: 46 } as Rect,

  /** CNI / ID document slot on the counter, shown on demand. */
  cniSlot: { x: 20, y: 148, w: 152, h: 88 } as Rect,

  /** FDJ terminal seat on the right of the counter. */
  terminalFDJ: { x: 392, y: 150, w: 76, h: 60 } as Rect,

  /** Bottom strip reserved for action buttons. */
  toolBar: { x: 0, y: 244, w: VW, h: VH - 244 } as Rect,

  /** Money tray on the counter, bottom-right. */
  moneyTray: { x: 360, y: 220, w: 108, h: 22 } as Rect,

  /** Patience / mood bar, top-right under the HUD strip (clear of the control bar). */
  patienceBar: { x: 316, y: 19, w: 152, h: 9 } as Rect,
} as const;

export type LayoutZone = keyof typeof LAYOUT;
