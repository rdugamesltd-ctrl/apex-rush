// Frame governor and adaptive quality.
// - Frame pacing per UI state: full rate in races, 30 fps for the menu's
//   background race on phones, and no rendering at all behind opaque or
//   blurred screens (garage, track select, settings, pause).
// - "Auto" graphics: if a race keeps missing frames, the render resolution is
//   lowered step by step, and as a last resort the extra effects are switched
//   off. What was learnt is saved, and the next session starts one step higher
//   to check whether the device has headroom after all.
import { save } from './save.js';
import { display, isCoarsePointer } from './display.js';
import { bus } from './events.js';

const SCALES = [1, 0.85, 0.72, 0.6];
const WINDOW = 90; // frames per measurement
const SLOW_MS = 18.6; // median frame time that counts as "missing frames" (~54 fps)
const SETTLE_MS = 2500; // ignore frames this long after a change (loading, shader warm-up)

let game = null;
let applyResolution = () => {};
let mode = 'full';
let wakeTimer = 0;
const samples = new Float32Array(WINDOW);
let sampleCount = 0;
let settleUntil = 0;
let lastNow = 0;

export const perf = {
  level: 0, // index into SCALES
  low: false, // auto-lowered effects
};

// Effective graphics quality for the current device ('high' or 'low').
export function effectiveQuality(settings = save.data.settings) {
  if (settings.quality === 'low') return 'low';
  if (settings.quality === 'auto' && perf.low) return 'low';
  return 'high';
}

export function resolutionScale(settings = save.data.settings) {
  return settings.quality === 'auto' ? SCALES[perf.level] : 1;
}

function setLimit(fps) {
  const loop = game.loop;
  const limit = fps || 0;
  if (loop.fpsLimit === limit) return;
  loop.fpsLimit = limit;
  loop.hasFpsLimit = limit > 0;
  loop._limitRate = limit > 0 ? 1000 / limit : 0;
  // the loop picks its step function when it starts
  if (loop.running) {
    loop.sleep();
    loop.wake(true);
  }
}

// 'full' | 'menu' | 'frozen'
export function setFrameMode(next) {
  if (!game) return;
  mode = next;
  clearTimeout(wakeTimer);
  if (next === 'frozen') {
    // let the current frame (e.g. a just-opened screen's backdrop) finish first
    wakeTimer = setTimeout(() => mode === 'frozen' && game.loop.sleep(), 120);
    return;
  }
  if (!game.loop.running) game.loop.wake(true);
  // 31 rather than 30: rAF jitter would otherwise sometimes skip three frames
  setLimit(next === 'menu' && isCoarsePointer() ? 31 : 0);
  settleUntil = performance.now() + SETTLE_MS;
  sampleCount = 0;
}

// Draw a few frames while frozen (after a resize, the canvas is blank until redrawn).
export function refreshFrozen() {
  if (!game || mode !== 'frozen') return;
  game.loop.wake(true);
  clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => mode === 'frozen' && game.loop.sleep(), 250);
}

function persist() {
  save.data.perf = { level: perf.level, low: perf.low };
  save.persist();
}

function stepDown() {
  if (perf.level < SCALES.length - 1) {
    perf.level++;
    applyResolution();
  } else if (!perf.low) {
    perf.low = true;
    applyResolution();
    bus.emit('ui:settings', save.data.settings); // turns the extra effects off
    bus.emit('perf:lowered');
  } else return;
  persist();
  settleUntil = performance.now() + SETTLE_MS;
  sampleCount = 0;
}

function onStep() {
  const now = performance.now();
  const dt = now - lastNow;
  lastNow = now;
  if (mode !== 'full' || save.data.settings.quality !== 'auto' || document.hidden) return;
  if (now < settleUntil || dt > 250) return;
  const scene = game.scene.getScene('race');
  if (!scene?.isRace || scene.paused) return;
  samples[sampleCount++] = dt;
  if (sampleCount < WINDOW) return;
  sampleCount = 0;
  const sorted = Array.from(samples).sort((a, b) => a - b);
  if (sorted[WINDOW >> 1] > SLOW_MS) stepDown();
}

// Forget what was learnt (the player picked "Auto" again).
export function resetAdaptive() {
  perf.level = 0;
  perf.low = false;
  persist();
  applyResolution();
}

export function initPerf(g, { onResolution }) {
  game = g;
  applyResolution = onResolution;
  game.events.on('step', onStep);
  bus.on('race:start', () => {
    settleUntil = performance.now() + SETTLE_MS;
    sampleCount = 0;
  });
}

// Restore the saved state; probe one step better than last time.
export function loadPerf() {
  const p = save.data.perf || {};
  perf.low = false;
  perf.level = Math.max(0, Math.min(SCALES.length - 1, (p.level | 0) - (p.low ? 0 : 1)));
  if (p.low) perf.level = SCALES.length - 1;
  display.scale = resolutionScale();
}
