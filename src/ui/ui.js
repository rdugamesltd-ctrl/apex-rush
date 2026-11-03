// DOM UI root: screen router, HUD, touch controls, toasts and shared widgets.
import { save } from '../save.js';
import { bus } from '../events.js';
import { sfx } from '../audio/Sfx.js';
import { createHud } from './hud.js';
import { createTouchControls, setTouchOptions, resetTouch } from './touchControls.js';
import { ICON, esc, fmtCoins } from './util.js';
import { isCoarsePointer, isMobile } from '../display.js';
import * as mainMenu from './screens/mainMenu.js';
import * as trackSelect from './screens/trackSelect.js';
import * as garage from './screens/garage.js';
import * as settings from './screens/settings.js';
import * as pause from './screens/pause.js';
import * as results from './screens/results.js';
import * as shop from './screens/shop.js';

const SCREENS = { menu: mainMenu, tracks: trackSelect, garage, shop, settings, pause, results };

export const UI = {
  save,
  sfx,
  assets: { icons: {}, logo: null },
  current: null,
  currentEl: null,
  data: null,
  sawTouch: false,
  racing: false,

  init(assets) {
    this.assets = assets;
    const root = document.getElementById('ui');
    this.root = root;
    this.hud = createHud(root);
    this.touch = createTouchControls(root);
    root.insertAdjacentHTML(
      'beforeend',
      `<div id="screen" class="layer" hidden></div>
       <div id="toast"></div>
       <div id="rotate" class="layer">${ICON.rotate}<p>Rotate your device to landscape</p></div>`
    );
    this.screenEl = root.querySelector('#screen');
    this.toastEl = root.querySelector('#toast');
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    root.addEventListener('change', (e) => this.onInput(e));
    window.addEventListener(
      'touchstart',
      () => {
        this.sawTouch = true;
        document.body.classList.add('touch');
        if (this.racing) this.touch.classList.add('on');
      },
      { once: true, passive: true }
    );
    if (isCoarsePointer()) document.body.classList.add('touch');
    // iOS Safari ignores user-scalable=no; block pinch zoom (touch-action: none covers double-tap)
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('input')) e.preventDefault();
    });
    this.applySettings();
    bus.on('perf:lowered', () => this.toast('Graphics lowered for smoother play'));
  },

  show(name, data) {
    SCREENS[this.current]?.leave?.();
    this.current = name;
    this.data = data;
    this.screenEl.className = `layer scr-${name}`;
    bus.emit('ui:screen', name);
    this.screenEl.hidden = false;
    this.currentEl = this.screenEl;
    SCREENS[name].render(this.screenEl, this, data);
    // entrance transition for a newly shown screen (not for refreshes of the same one)
    this.screenEl.classList.add('enter');
    clearTimeout(this.enterTimer);
    this.enterTimer = setTimeout(() => this.screenEl.classList.remove('enter'), 320);
  },

  hideScreen() {
    SCREENS[this.current]?.leave?.();
    this.current = null;
    this.data = null;
    this.screenEl.hidden = true;
    this.screenEl.className = 'layer';
    this.screenEl.innerHTML = '';
    bus.emit('ui:screen', null);
  },

  refresh() {
    if (!this.current) return;
    const sc = this.screenEl.querySelector('.scroll');
    const top = sc ? sc.scrollTop : 0;
    SCREENS[this.current].render(this.screenEl, this, this.data);
    const sc2 = this.screenEl.querySelector('.scroll');
    if (sc2) sc2.scrollTop = top;
  },

  onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t || !this.root.contains(t) || t.disabled) return;
    const act = t.dataset.act;
    sfx.click();
    if (act === 'back') this.show('menu');
    else if (act === 'fullscreen') this.toggleFullscreen();
    else if (act === 'pause') this.emit('ui:pause');
    else if (act === 'respawn') this.emit('ui:respawn');
    else SCREENS[this.current]?.action?.(act, t, this, this.data);
  },

  onInput(e) {
    SCREENS[this.current]?.input?.(e, this);
  },

  emit(type, detail) {
    bus.emit(type, detail);
  },

  startRace(cfg) {
    // phones: go fullscreen and lock landscape for the race (needs this tap's user gesture)
    if (isMobile() && document.fullscreenEnabled && !document.fullscreenElement) this.toggleFullscreen();
    bus.emit('ui:start', cfg);
  },

  // ---------- shared widgets ----------
  header(title) {
    return `<header class="scr-head">
      <button class="icon-btn back" data-act="back" aria-label="Back">${ICON.back}</button>
      <h2>${esc(title)}</h2><div class="spacer"></div>${this.coinBadge()}
    </header>`;
  },

  coinBadge() {
    return `<div class="coin-badge">${this.icon('icon_coin')}<b>${fmtCoins(save.data.coins)}</b></div>`;
  },

  icon(key, cls = '') {
    const src = this.assets.icons[key];
    return src ? `<img class="ico ${cls}" src="${src}" alt="" draggable="false">` : '';
  },

  fullscreenButton(cls = 'icon-btn') {
    if (!document.fullscreenEnabled) return '';
    const label = cls === 'chip' ? (document.fullscreenElement ? ' Exit fullscreen' : ' Fullscreen') : '';
    return `<button class="${cls}" data-act="fullscreen" aria-label="Fullscreen">${ICON.fullscreen}${label}</button>`;
  },

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        if (screen.orientation?.lock && isCoarsePointer()) screen.orientation.lock('landscape').catch(() => {});
      }
    } catch {
      /* fullscreen refused */
    }
    setTimeout(() => this.refresh(), 150);
  },

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('on');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('on'), 2200);
  },

  applySettings() {
    const s = save.data.settings;
    sfx.setVolume(s.volume, s.muted);
    setTouchOptions(s);
    bus.emit('ui:settings', s);
  },

  // ---------- race mode ----------
  enterRace(info) {
    this.racing = true;
    document.body.classList.add('racing');
    this.hideScreen();
    this.hud.init(info);
    this.hud.el.classList.add('on');
    this.touch.classList.toggle('on', isCoarsePointer() || this.sawTouch);
    resetTouch();
    if (navigator.wakeLock?.request) {
      navigator.wakeLock
        .request('screen')
        .then((l) => (this.wakeLock = l))
        .catch(() => {});
    }
  },

  leaveRace() {
    this.racing = false;
    document.body.classList.remove('racing');
    this.hud.el.classList.remove('on');
    this.touch.classList.remove('on');
    resetTouch();
    this.wakeLock?.release?.().catch(() => {});
    this.wakeLock = null;
  },

  showPause() {
    resetTouch();
    this.show('pause');
  },

  hidePause() {
    if (this.current === 'pause') this.hideScreen();
  },

  showResults(d) {
    this.hud.el.classList.remove('on');
    this.touch.classList.remove('on');
    resetTouch();
    this.show('results', d);
  },
};
