// Minimal scene state machine. Swaps the active scene and delegates the
// per-frame lifecycle (update/render) plus click handling to it.
//
// Scene swaps are wrapped in a quick black cross-fade (fade-out the old scene,
// swap, fade-in the new one) so navigation never hard-cuts. main.ts reads
// `coverAlpha` to draw the black overlay on the visible canvas. Clicks are
// swallowed while a transition is running so half-faded buttons can't fire.

import type { Renderer } from './renderer';
import { Tween, Ease } from './tween';

/** Seconds for each half of the cross-fade (out, then in). */
const FADE = 0.2;

export interface Scene {
  enter?(): void;
  /** Called on the outgoing scene just before it is swapped out (resource cleanup). */
  exit?(): void;
  update?(dt: number): void;
  render(r: Renderer): void;
  onClick?(p: { x: number; y: number }): void;
}

export class StateMachine {
  private _current: Scene | null = null;
  private _pending: Scene | null = null;
  private _tween: Tween | null = null;
  private _phase: 'idle' | 'out' | 'in' = 'idle';
  /** Black cover opacity, 0 (clear) .. 1 (opaque), driven by the fade tweens. */
  private _cover = 0;

  /** Swap the active scene behind a quick black cross-fade. */
  set(s: Scene): void {
    // First scene (nothing on screen yet): swap instantly, no fade.
    if (this._current === null) {
      this._current = s;
      s.enter?.();
      return;
    }
    // Queue the next scene; the swap happens at the bottom of the fade-out.
    this._pending = s;
    if (this._phase === 'out') return; // already fading out — just retarget.
    this.beginFadeOut();
  }

  /** Kick off (or restart) the fade-out half of a cross-fade toward `_pending`. */
  private beginFadeOut(): void {
    this._phase = 'out';
    this._tween = new Tween({
      from: this._cover,
      to: 1,
      duration: FADE,
      easing: Ease.easeInQuad,
      onUpdate: (v) => {
        this._cover = v;
      },
      onComplete: () => this.swap(),
    });
  }

  /** Bottom of the fade-out: exit the old scene, enter the new, fade back in. */
  private swap(): void {
    const next = this._pending;
    this._pending = null;
    if (!next) {
      this._phase = 'idle';
      this._tween = null;
      this._cover = 0;
      return;
    }
    this._current?.exit?.();
    this._current = next;
    next.enter?.();
    this._phase = 'in';
    this._tween = new Tween({
      from: 1,
      to: 0,
      duration: FADE,
      easing: Ease.easeOutQuad,
      onUpdate: (v) => {
        this._cover = v;
      },
      onComplete: () => {
        this._tween = null;
        this._cover = 0;
        // A scene queued during the new scene's enter() (while _phase was still
        // 'out') would otherwise be silently dropped — run another cross-fade
        // for it instead of latching idle, so it can never soft-lock.
        if (this._pending) {
          this.beginFadeOut();
        } else {
          this._phase = 'idle';
        }
      },
    });
  }

  get current(): Scene | null {
    return this._current;
  }

  /** True while a scene cross-fade is in progress. */
  get inTransition(): boolean {
    return this._phase !== 'idle';
  }

  /** Black overlay alpha (0..1) for main.ts to draw over the visible canvas. */
  get coverAlpha(): number {
    return this._cover;
  }

  update(dt: number): void {
    if (this._tween && !this._tween.done) this._tween.update(dt);
    this._current?.update?.(dt);
  }

  render(r: Renderer): void {
    this._current?.render(r);
  }

  onClick(p: { x: number; y: number }): void {
    if (this._phase !== 'idle') return; // swallow clicks mid-transition.
    this._current?.onClick?.(p);
  }
}
