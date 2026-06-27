// Canonical COMPTOIR scene zones, all in the 480x270 virtual space.
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
  /** Mur de paquets behind the counter: top band, full width. */
  presentoir: { x: 0, y: 0, w: VW, h: 150 } as Rect,

  /** Wooden comptoir in the foreground: bottom band, full width. */
  comptoir: { x: 0, y: 210, w: VW, h: VH - 210 } as Rect,

  /** Mid wall strip between presentoir and comptoir (where the window sits). */
  arriere: { x: 0, y: 150, w: VW, h: 60 } as Rect,

  /** Client window (the buraliste sees the client framed here). */
  clientWindow: { x: 168, y: 40, w: 144, h: 120 } as Rect,

  /** Anchor point for the client speech bubble (top-left of bubble). */
  speechBubble: { x: 300, y: 36, w: 168, h: 46 } as Rect,

  /** CNI / ID document slot on the comptoir, shown on demand. */
  cniSlot: { x: 20, y: 148, w: 152, h: 88 } as Rect,

  /** FDJ terminal seat on the right of the comptoir. */
  terminalFDJ: { x: 392, y: 150, w: 76, h: 60 } as Rect,

  /** Bottom strip reserved for action buttons. */
  toolBar: { x: 0, y: 244, w: VW, h: VH - 244 } as Rect,

  /** Money tray on the comptoir, bottom-right. */
  moneyTray: { x: 360, y: 220, w: 108, h: 22 } as Rect,

  /** Patience / mood bar along the very top. */
  patienceBar: { x: 8, y: 6, w: 200, h: 8 } as Rect,
} as const;

export type LayoutZone = keyof typeof LAYOUT;
