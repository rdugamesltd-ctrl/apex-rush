// Entry point: creates the Phaser game, keeps the canvas sharp on hi-DPI
// screens, and routes UI events to the race scene.
import { save } from './save.js';
import { display } from './display.js';
import { bus } from './events.js';
import { sfx } from './audio/Sfx.js';
import { UI } from './ui/ui.js';
import { BootScene } from './scenes/BootScene.js';
import { RaceScene } from './scenes/RaceScene.js';
import { initPerf, loadPerf, effectiveQuality, resolutionScale, setFrameMode, refreshFrozen } from './perf.js';

save.load();
loadPerf();
const params = new URLSearchParams(location.search);

// Banners and painted logos are drawn into canvases at boot, so wait (briefly) for the display font.
await Promise.race([
  Promise.all(['italic 900 40px "Exo 2"', '700 16px "Exo 2"'].map((f) => document.fonts?.load(f))),
  new Promise((resolve) => setTimeout(resolve, 1500)),
]).catch(() => {});

function measure() {
  const dev = window.devicePixelRatio || 1;
  display.scale = resolutionScale();
  // render resolution: capped at 2x, scaled down by the adaptive "Auto" setting
  display.dpr = effectiveQuality() === 'low' ? Math.min(1, dev) : Math.max(Math.min(1, dev) * 0.7, Math.min(dev, 2) * display.scale);
  display.cssWidth = window.innerWidth;
  display.cssHeight = window.innerHeight;
  return [Math.max(1, Math.round(window.innerWidth * display.dpr)), Math.max(1, Math.round(window.innerHeight * display.dpr))];
}

const [w, h] = measure();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: w,
  height: h,
  backgroundColor: '#14172e',
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / display.dpr },
  render: { antialias: true, powerPreference: 'high-performance' },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  audio: { noAudio: true },
  banner: false,
  scene: [BootScene, RaceScene],
});
window.apexRush = { game, save };

function onResize() {
  const [cw, ch] = measure();
  if (cw !== game.scale.width || ch !== game.scale.height) game.scale.resize(cw, ch);
  game.scale.setZoom(1 / display.dpr);
  refreshFrozen();
}
initPerf(game, { onResolution: onResize });

// Frame pacing per screen: nothing is drawn behind opaque or blurred screens,
// the menu's background race runs at 30 fps on phones.
const FROZEN = new Set(['garage', 'tracks', 'settings', 'pause']);
bus.on('ui:screen', (name) => setFrameMode(!name ? 'full' : FROZEN.has(name) ? 'frozen' : 'menu'));
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(onResize, 60);
});
// mobile browsers resize the visual viewport when toolbars show or hide
window.visualViewport?.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(onResize, 60);
});

// Browsers only allow audio after a user gesture.
const unlockAudio = () => sfx.unlock();
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });
window.addEventListener('touchend', unlockAudio, { capture: true });

// Pause automatically when the tab is hidden, and let the audio hardware sleep.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    bus.emit('ui:pause');
    sfx.ctx?.suspend?.().catch(() => {});
  } else if (sfx.ctx?.state === 'suspended') {
    sfx.ctx.resume().catch(() => {});
  }
});

const raceScene = () => game.scene.getScene('race');
let lastCfg = null;

function startScene(cfg) {
  // scenes only start during a game step, so the loop must be awake
  setFrameMode(cfg.mode === 'race' ? 'full' : 'menu');
  const scene = raceScene();
  if (scene.sys.isActive() || scene.sys.isPaused()) scene.scene.restart(cfg);
  else game.scene.start('race', cfg);
}

function startAttract() {
  startScene({ mode: 'attract', trackId: save.data.lastRace.trackId });
}

bus.on('boot:done', () => {
  if (params.has('race')) {
    lastCfg = {
      mode: 'race',
      trackId: params.get('race'),
      laps: Number(params.get('laps')) || 3,
      opponents: Number(params.get('opp')) || 7,
      difficulty: params.get('diff') || undefined, // dev override of the track's difficulty
      autopilot: params.has('autopilot'),
      timescale: Number(params.get('timescale')) || 1,
      debug: params.has('debug'),
    };
    startScene(lastCfg);
  } else {
    startAttract();
    UI.show('menu');
  }
});

bus.on('ui:start', (cfg) => {
  lastCfg = { mode: 'race', ...cfg, debug: params.has('debug') };
  startScene(lastCfg);
});
bus.on('ui:pause', () => raceScene()?.pauseRace?.());
bus.on('ui:resume', () => raceScene()?.resumeRace?.());
bus.on('ui:respawn', () => raceScene()?.rm?.playerRespawn());
bus.on('ui:restart', () => {
  if (lastCfg) startScene(lastCfg);
});
bus.on('ui:quit', (d) => {
  UI.leaveRace();
  startAttract();
  UI.show(d?.to || 'menu');
});
bus.on('ui:settings', () => {
  if (game.isBooted) onResize();
});

// Offline play and "Add to Home Screen" (needs https or localhost).
if ('serviceWorker' in navigator && window.isSecureContext && !params.has('nosw')) {
  const register = () => navigator.serviceWorker.register('sw.js').catch(() => {});
  // this module awaits the fonts first, so the page may already be loaded
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}

if (params.has('debug')) {
  const el = document.createElement('div');
  el.id = 'fps';
  document.body.appendChild(el);
  setInterval(() => (el.textContent = `${Math.round(game.loop.actualFps)} fps`), 500);
}
