// Tiny, zero-dependency, dt-driven tweening for the pixel-art game.
//
// Everything is advanced by elapsed seconds (`dt`), matching the rAF loop in
// main.ts. Tweens can SNAP their emitted value to whole integers so that sprite
// positions never land on a fractional pixel (which would look blurry once the
// backbuffer is nearest-neighbour upscaled).

/** Easing curve: maps normalized time t in [0,1] to an eased fraction. */
export type Easing = (t: number) => number;

/** Standard easing set. All map [0,1] -> roughly [0,1] (overshoot allowed). */
export const Ease: {
  linear: Easing;
  easeInQuad: Easing;
  easeOutQuad: Easing;
  easeInOutQuad: Easing;
  easeOutBack: Easing;
  easeOutBounce: Easing;
} = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  },
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) {
      const u = t - 1.5 / d1;
      return n1 * u * u + 0.75;
    }
    if (t < 2.5 / d1) {
      const u = t - 2.25 / d1;
      return n1 * u * u + 0.9375;
    }
    const u = t - 2.625 / d1;
    return n1 * u * u + 0.984375;
  },
};

export interface TweenOpts {
  from: number;
  to: number;
  /** Duration in seconds. Values <= 0 complete on the first update. */
  duration: number;
  easing?: Easing;
  /** Delay in seconds before the tween starts emitting. */
  delay?: number;
  /** Round the emitted value to an integer (keeps sprites pixel-crisp). */
  snap?: boolean;
  onUpdate: (v: number) => void;
  onComplete?: () => void;
}

/** A single dt-driven interpolation. */
export class Tween {
  private readonly from: number;
  private readonly to: number;
  private readonly duration: number;
  private readonly easing: Easing;
  private readonly snap: boolean;
  private readonly onUpdate: (v: number) => void;
  private readonly onComplete?: () => void;

  private delayLeft: number;
  private elapsed = 0;
  private _value: number;
  private _done = false;
  private completed = false;

  constructor(o: TweenOpts) {
    this.from = o.from;
    this.to = o.to;
    this.duration = o.duration;
    this.easing = o.easing ?? Ease.linear;
    this.snap = o.snap ?? false;
    this.delayLeft = Math.max(0, o.delay ?? 0);
    this.onUpdate = o.onUpdate;
    this.onComplete = o.onComplete;
    this._value = this.emit(this.from);
  }

  /** Snap (if enabled) and store a value before handing it to onUpdate. */
  private emit(raw: number): number {
    return this.snap ? Math.round(raw) : raw;
  }

  /** Advance by `dt` seconds. No-op once done. */
  update(dt: number): void {
    if (this._done) return;
    if (dt < 0) dt = 0;

    // Burn the delay first; carry any overflow into the active phase.
    if (this.delayLeft > 0) {
      this.delayLeft -= dt;
      if (this.delayLeft > 0) return;
      dt = -this.delayLeft;
      this.delayLeft = 0;
    }

    this.elapsed += dt;

    let t: number;
    if (this.duration <= 0) {
      t = 1;
    } else {
      t = this.elapsed / this.duration;
      if (t > 1) t = 1;
    }

    const eased = this.easing(t);
    this._value = this.emit(this.from + (this.to - this.from) * eased);
    this.onUpdate(this._value);

    if (t >= 1) {
      this._done = true;
      if (!this.completed) {
        this.completed = true;
        this.onComplete?.();
      }
    }
  }

  /** True once the tween has reached its end (or was cancelled). */
  get done(): boolean {
    return this._done;
  }

  /** Stop the tween immediately without firing onComplete. */
  cancel(): void {
    this._done = true;
  }

  /** Last emitted value (already snapped when snap is on). */
  get value(): number {
    return this._value;
  }
}

/** Manages a pool of tweens, dropping them as they finish. */
export class TweenGroup {
  private tweens: Tween[] = [];

  /** Track an existing tween and return it. */
  add(t: Tween): Tween {
    this.tweens.push(t);
    return t;
  }

  /** Build a tween from opts, track it and return it. */
  tween(o: TweenOpts): Tween {
    return this.add(new Tween(o));
  }

  /** Advance every live tween, then purge completed ones. */
  update(dt: number): void {
    for (const t of this.tweens) t.update(dt);
    if (this.tweens.some((t) => t.done)) {
      this.tweens = this.tweens.filter((t) => !t.done);
    }
  }

  /** Cancel and drop all tweens. */
  clear(): void {
    for (const t of this.tweens) t.cancel();
    this.tweens.length = 0;
  }

  /** True when no tween is currently running. */
  get idle(): boolean {
    return this.tweens.length === 0;
  }
}
