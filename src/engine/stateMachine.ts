// Minimal scene state machine. Swaps the active scene and delegates the
// per-frame lifecycle (update/render) plus click handling to it.

import type { Renderer } from './renderer';

export interface Scene {
  enter?(): void;
  update?(dt: number): void;
  render(r: Renderer): void;
  onClick?(p: { x: number; y: number }): void;
}

export class StateMachine {
  private _current: Scene | null = null;

  /** Swap the active scene and fire its enter() hook. */
  set(s: Scene): void {
    this._current = s;
    s.enter?.();
  }

  get current(): Scene | null {
    return this._current;
  }

  update(dt: number): void {
    this._current?.update?.(dt);
  }

  render(r: Renderer): void {
    this._current?.render(r);
  }

  onClick(p: { x: number; y: number }): void {
    this._current?.onClick?.(p);
  }
}
