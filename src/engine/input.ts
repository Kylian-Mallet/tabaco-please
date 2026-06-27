// Pointer input. DOM event coords (CSS pixels on the visible canvas) are mapped
// into the 480x270 VIRTUAL space: subtract the letterbox offset, divide by the
// integer upscale factor. main.ts feeds the current viewport via setViewport().
// Clicks landing in the letterbox bars are ignored.

import { VW, VH } from './renderer';

export interface Pointer {
  x: number;
  y: number;
}

interface Viewport {
  scale: number;
  offX: number;
  offY: number;
}

export class Input {
  private readonly canvas: HTMLCanvasElement;
  private readonly _pointer: Pointer = { x: 0, y: 0 };
  private readonly clickSubs: Array<(p: Pointer) => void> = [];
  /** Upscale + letterbox offset, in CSS pixels, set by main.resize(). */
  private viewport: Viewport = { scale: 1, offX: 0, offY: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      const p = this.toVirtual(e.clientX, e.clientY);
      if (p) {
        this._pointer.x = p.x;
        this._pointer.y = p.y;
      }
    });

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      const p = this.toVirtual(e.clientX, e.clientY);
      if (p) {
        this._pointer.x = p.x;
        this._pointer.y = p.y;
      }
    });

    canvas.addEventListener('click', (e: MouseEvent) => {
      const p = this.toVirtual(e.clientX, e.clientY);
      if (!p) return; // click landed in a letterbox bar -> ignore
      this._pointer.x = p.x;
      this._pointer.y = p.y;
      for (const cb of this.clickSubs) cb({ x: p.x, y: p.y });
    });
  }

  /** Latest known pointer position in 480x270 virtual coords. */
  get pointer(): Pointer {
    return { x: this._pointer.x, y: this._pointer.y };
  }

  /** Subscribe to clicks; callback receives the position in virtual coords. */
  onClick(cb: (p: Pointer) => void): void {
    this.clickSubs.push(cb);
  }

  /** main.ts calls this on load/resize with the current upscale + letterbox. */
  setViewport(scale: number, offX: number, offY: number): void {
    this.viewport.scale = scale;
    this.viewport.offX = offX;
    this.viewport.offY = offY;
  }

  /**
   * Map client (CSS px) coords to virtual 480x270 coords. Returns null when the
   * point falls outside the upscaled backbuffer (the letterbox bars).
   */
  private toVirtual(clientX: number, clientY: number): Pointer | null {
    const rect = this.canvas.getBoundingClientRect();
    // CSS px relative to the visible canvas top-left.
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    const { scale, offX, offY } = this.viewport;
    const vx = (cssX - offX) / scale;
    const vy = (cssY - offY) / scale;
    if (vx < 0 || vy < 0 || vx >= VW || vy >= VH) return null;
    return { x: vx, y: vy };
  }
}
