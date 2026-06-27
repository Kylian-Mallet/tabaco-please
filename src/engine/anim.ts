// Frame-based sprite animation, stepped at a deliberately LOW fps for the
// chunky, stop-motion look of Papers-Please-style pixel art. Each frame is just
// a draw callback into the backbuffer, so frames stay procedural (no assets).

import type { Renderer } from './renderer';

/** One animation frame: draws itself at the given top-left (x,y). */
export type Frame = (r: Renderer, x: number, y: number) => void;

export interface AnimatedSpriteOpts {
  /** Frames per second to step through the frame list. Default 6 (chunky). */
  fps?: number;
  /** Loop back to frame 0 after the last frame. Default true. */
  loop?: boolean;
}

/** Plays a list of procedural frames at a fixed, low fps. */
export class AnimatedSprite {
  private readonly frames: Frame[];
  private readonly frameTime: number;
  private readonly loop: boolean;

  private acc = 0;
  private index = 0;
  private _done = false;

  constructor(frames: Frame[], o?: AnimatedSpriteOpts) {
    this.frames = frames;
    const fps = o?.fps ?? 6;
    this.frameTime = fps > 0 ? 1 / fps : Infinity;
    this.loop = o?.loop ?? true;
  }

  /** Advance the playhead by `dt` seconds. */
  update(dt: number): void {
    if (this._done || this.frames.length <= 1 || dt <= 0) return;

    this.acc += dt;
    while (this.acc >= this.frameTime) {
      this.acc -= this.frameTime;
      if (this.index >= this.frames.length - 1) {
        if (this.loop) {
          this.index = 0;
        } else {
          this.index = this.frames.length - 1;
          this._done = true;
          this.acc = 0;
          break;
        }
      } else {
        this.index++;
      }
    }
  }

  /** Draw the current frame at (x,y). */
  draw(r: Renderer, x: number, y: number): void {
    const frame = this.frames[this.index];
    if (frame) frame(r, Math.round(x), Math.round(y));
  }

  /** Restart from the first frame. */
  reset(): void {
    this.acc = 0;
    this.index = 0;
    this._done = false;
  }

  /** True once a non-looping animation has reached its last frame. */
  get done(): boolean {
    return this._done;
  }
}

/**
 * Integer sine offset for idle bob / sway. `t` is accumulated seconds, `amp` the
 * peak offset in pixels, `period` the full cycle length in seconds. The result
 * is rounded so animated sprites stay on whole pixels.
 */
export function wobble(t: number, amp: number, period: number): number {
  if (period <= 0 || amp === 0) return 0;
  return Math.round(Math.sin((t / period) * Math.PI * 2) * amp);
}
