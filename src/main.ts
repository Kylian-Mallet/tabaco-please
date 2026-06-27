// Boot entry point: wires the visible canvas + a 480x270 offscreen backbuffer,
// the engine and scenes into the game loop. The game renders into the low-res
// backbuffer; we upscale it (integer, no smoothing) into the viewport-filling
// visible canvas with dark letterbox bars -> chunky pixel-art look.

import type { GameState, GameContext } from './game/types';
import { STARTING_CASH } from './game/types';
import { PAL } from './engine/palette';
import { Renderer, VW, VH } from './engine/renderer';
import { Input } from './engine/input';
import { StateMachine, type Scene } from './engine/stateMachine';
import { load } from './engine/save';
import { TitleScene } from './scenes/title';
import { ControlsOverlay } from './engine/controls';
import { SettingsMenu } from './engine/settingsMenu';
import { initRadio, resumeRadio } from './engine/radio';
import { initSfx, resumeSfx } from './engine/sfx';
import { updateFx, fxShake, fxFlash, drawFxWorld } from './engine/fx';
import { unlockedGroupsForDay } from './game/content/days';
import { START_CLOCK } from './game/content/matches';

/** Fresh run state (campaign reset). Exported so "Nouvelle partie" can reset. */
export function freshState(): GameState {
  return {
    day: 1,
    cash: STARTING_CASH,
    warnings: 0,
    activeRules: [],
    dayRevenue: 0,
    // Campaign / narrative fields (entered at onboarding, accrued over the run).
    playerName: '',
    sellerLook: { skin: PAL.skin, hair: PAL.woodDark, coat: PAL.franceBlue, hat: 'none', beard: false },
    totalFaults: 0,
    story: {},
    unseenFaults: [],
    unlockedGroups: ['base'],
    clock: START_CLOCK,
  };
}

function boot(): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Canvas #game not found.');
  }
  const cv: HTMLCanvasElement = canvas;
  const visibleCtx = cv.getContext('2d');
  if (!visibleCtx) {
    throw new Error('2D context unavailable.');
  }
  const vctx: CanvasRenderingContext2D = visibleCtx;

  // Offscreen low-res backbuffer: the whole game is drawn here at 480x270.
  const offscreen = document.createElement('canvas');
  offscreen.width = VW;
  offscreen.height = VH;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) {
    throw new Error('Backbuffer 2D context unavailable.');
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
  document.addEventListener('fullscreenchange', resize);
  resize();

  // Audio (radio + procedural SFX) — created now, started on the first gesture.
  initRadio();
  initSfx();

  function toggleFullscreen(): void {
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void document.documentElement.requestFullscreen();
      }
    } catch {
      /* fullscreen unsupported — ignore */
    }
  }
  const state: GameState = load() ?? freshState();
  // Respect the unlock field on load: reconcile it from the (possibly restored)
  // day so it always matches the day-derived authoritative set — this also
  // back-fills old saves that predate the field.
  state.unlockedGroups = [...unlockedGroupsForDay(state.day)];

  const ctx: GameContext = {
    state,
    renderer,
    sm,
    goTo(scene: Scene): void {
      sm.set(scene);
    },
  };

  // Settings overlay: drawn last, consumes all clicks while open.
  const settings = new SettingsMenu(ctx, {
    goHome: () => sm.set(new TitleScene(ctx)),
  });

  const controls = new ControlsOverlay({
    toggleFullscreen,
    isFullscreen: () => document.fullscreenElement != null,
    onSettings: () => settings.toggle(),
    isSettingsOpen: () => settings.isOpen(),
  });

  // First user gesture unlocks Web Audio (autoplay policy).
  let audioArmed = false;
  function armAudio(): void {
    if (audioArmed) return;
    audioArmed = true;
    resumeSfx();
    resumeRadio();
  }

  // Forward clicks: arm audio, let the controls bar consume first, else the scene.
  input.onClick((p) => {
    armAudio();
    if (settings.onClick(p)) return;
    if (controls.onClick(p)) return;
    sm.onClick(p);
  });

  // Initial scene.
  sm.set(new TitleScene(ctx));

  // requestAnimationFrame loop with dt in seconds.
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = (now - last) / 1000;
    last = now;

    sm.update(dt);
    updateFx(dt); // advance screen effects (shake / flash / floating texts)
    renderer.clear();
    sm.render(renderer);
    drawFxWorld(renderer); // floating texts INTO the backbuffer (world space)
    controls.render(renderer); // persistent control bar on top of every scene
    settings.draw(renderer); // settings overlay drawn LAST (above everything)

    // Blit the backbuffer: dark bars, then upscaled chunky pixels. The camera
    // shake offset (in backbuffer px) is scaled to device px so the whole frame
    // jolts as one.
    const shk = fxShake();
    vctx.imageSmoothingEnabled = false;
    vctx.fillStyle = '#0c0b0a';
    vctx.fillRect(0, 0, cv.width, cv.height);
    vctx.drawImage(
      offscreen,
      offXDev + Math.round(shk.x * scaleDev),
      offYDev + Math.round(shk.y * scaleDev),
      VW * scaleDev,
      VH * scaleDev,
    );

    // Full-screen colour flash overlay (e.g. red on a fine).
    const fl = fxFlash();
    if (fl) {
      vctx.globalAlpha = fl.alpha;
      vctx.fillStyle = fl.color;
      vctx.fillRect(0, 0, cv.width, cv.height);
      vctx.globalAlpha = 1;
    }

    // Scene cross-fade cover (black), drawn over everything including the bars.
    const cover = sm.coverAlpha;
    if (cover > 0) {
      vctx.globalAlpha = cover;
      vctx.fillStyle = '#0c0b0a';
      vctx.fillRect(0, 0, cv.width, cv.height);
      vctx.globalAlpha = 1;
    }

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
