// Boot entry point: wires the visible canvas + a 480x270 offscreen backbuffer,
// the engine and scenes into the game loop. The game renders into the low-res
// backbuffer; we upscale it (integer, no smoothing) into the viewport-filling
// visible canvas with dark letterbox bars -> chunky pixel-art look.

import type { EtatPartie, GameContext } from './game/types';
import { TRESORERIE_INITIALE } from './game/types';
import { Renderer, VW, VH } from './engine/renderer';
import { Input } from './engine/input';
import { StateMachine, type Scene } from './engine/stateMachine';
import { load } from './engine/save';
import { TitleScene } from './scenes/title';

/** Fresh run state. */
function nouvelEtat(): EtatPartie {
  return {
    jour: 1,
    tresorerie: TRESORERIE_INITIALE,
    avertissements: 0,
    reglesActives: [],
    recetteDuJour: 0,
    fautesNonVues: [],
  };
}

function boot(): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Canvas #game introuvable.');
  }
  const cv: HTMLCanvasElement = canvas;
  const visibleCtx = cv.getContext('2d');
  if (!visibleCtx) {
    throw new Error('Contexte 2D indisponible.');
  }
  const vctx: CanvasRenderingContext2D = visibleCtx;

  // Offscreen low-res backbuffer: the whole game is drawn here at 480x270.
  const offscreen = document.createElement('canvas');
  offscreen.width = VW;
  offscreen.height = VH;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) {
    throw new Error('Backbuffer 2D indisponible.');
  }

  const renderer = new Renderer(offCtx);
  const input = new Input(cv);
  const sm = new StateMachine();

  // Upscale + letterbox offset, in DEVICE pixels (used for the blit).
  let scaleDev = 1;
  let offXDev = 0;
  let offYDev = 0;

  /** Size backing store to the window (dpr aware) and recompute integer scale. */
  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    cv.width = Math.max(1, Math.round(cssW * dpr));
    cv.height = Math.max(1, Math.round(cssH * dpr));
    vctx.imageSmoothingEnabled = false;

    // Fractional fit: fill the window as much as possible (no integer-floor
    // letterbox). Nearest-neighbor upscale keeps pixels chunky; only thin bars
    // from the 16:9 aspect mismatch remain.
    scaleDev = Math.max(1, Math.min(cv.width / VW, cv.height / VH));
    offXDev = Math.round((cv.width - VW * scaleDev) / 2);
    offYDev = Math.round((cv.height - VH * scaleDev) / 2);

    // Input works in CSS pixels (getBoundingClientRect), so convert by dpr.
    input.setViewport(scaleDev / dpr, offXDev / dpr, offYDev / dpr);
  }

  window.addEventListener('resize', resize);
  resize();

  const state: EtatPartie = load() ?? nouvelEtat();

  const ctx: GameContext = {
    state,
    renderer,
    sm,
    goTo(scene: Scene): void {
      sm.set(scene);
    },
  };

  // Forward clicks (already in virtual coords) to the active scene.
  input.onClick((p) => sm.onClick(p));

  // Initial scene.
  sm.set(new TitleScene(ctx));

  // requestAnimationFrame loop with dt in seconds.
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = (now - last) / 1000;
    last = now;

    sm.update(dt);
    renderer.clear();
    sm.render(renderer);

    // Blit the backbuffer: dark bars, then upscaled chunky pixels.
    vctx.imageSmoothingEnabled = false;
    vctx.fillStyle = '#0c0b0a';
    vctx.fillRect(0, 0, cv.width, cv.height);
    vctx.drawImage(offscreen, offXDev, offYDev, VW * scaleDev, VH * scaleDev);

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
