// In-race HUD: position, lap, speed/gear/RPM, timer + live delta, minimap,
// standings, next-corner card, drift meter, start lights and popups.
// DOM writes only happen when a value changes.
import { ICON, fmtTime, esc, fmtCoins } from './util.js';
import { PX_TO_KMH, KMH_TO_MPH } from '../config.js';

// Corner arrows (right-hand; mirrored for left turns).
const ARROW = {
  kink: '<path d="M11 29V19L21 9"/><path d="M13 8h9v9"/>',
  turn: '<path d="M9 29V16q0-6 6-6h8"/><path d="M19 5l5 5-5 5"/>',
  hairpin: '<path d="M8 29V14a7 7 0 0 1 14 0v8"/><path d="M17 18l5 5 5-5"/>',
};
const arrowSvg = (shape) =>
  `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${ARROW[shape]}</svg>`;
// One fixed message per corner severity.
const ADVICE = { FAST: 'Ease off a little', MEDIUM: 'Slow down', SLOW: 'Slow down', TIGHT: 'Brake hard', HAIRPIN: 'Brake hard' };

export function createHud(parent) {
  const el = document.createElement('div');
  el.id = 'hud';
  el.className = 'layer';
  el.innerHTML = `
    <div class="hud-tl">
      <div class="hud-btns">
        <button class="hud-btn" data-act="pause" aria-label="Pause">${ICON.pause}</button>
        <button class="hud-btn reset" data-act="respawn" aria-label="Reset car to the track">${ICON.restart}</button>
      </div>
      <canvas class="minimap"></canvas>
    </div>
    <div class="hud-tr">
      <div class="hud-row">
        <div class="hud-box pos"><span class="lbl">POS</span><b data-h="pos">1</b><i>/<span data-h="tot">8</span></i></div>
        <div class="hud-box lap"><span class="lbl">LAP</span><b data-h="lap">1</b><i>/<span data-h="laps">3</span></i></div>
      </div>
      <div class="hud-box speed"><span class="gear" data-h="gear">N</span><b data-h="spd">0</b><i data-h="unit">KM/H</i></div>
      <div class="rpm"><div data-h="rpm"></div></div>
      <div class="hud-times"><span data-h="time">0:00.000</span><span data-h="best">BEST --</span><span class="delta" data-h="delta"></span></div>
    </div>
    <div class="hud-corner" data-h="corner">
      <div class="hc-arrow" data-h="cArrow"></div>
      <div class="hc-main">
        <b class="hc-name" data-h="cName"></b>
        <span class="hc-msg" data-h="cMsg"></span>
      </div>
    </div>
    <div class="hud-drift" data-h="drift"><b data-h="dPts">0</b><span data-h="dMult">×1</span></div>
    <ol class="hud-standings" data-h="stand"></ol>
    <div class="hud-lights" data-h="lights"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="hud-pops" data-h="pops"></div>
    <div class="hud-wrong" data-h="wrong">WRONG WAY</div>`;
  parent.appendChild(el);

  const $ = (k) => el.querySelector(`[data-h="${k}"]`);
  const refs = {};
  for (const k of [
    'pos', 'tot', 'lap', 'laps', 'gear', 'spd', 'unit', 'rpm', 'time', 'best', 'delta', 'stand', 'lights', 'pops', 'wrong',
    'corner', 'cArrow', 'cName', 'cMsg', 'drift', 'dPts', 'dMult',
  ]) {
    refs[k] = $(k);
  }
  const last = {};
  const set = (k, v) => {
    if (last[k] !== v) {
      last[k] = v;
      refs[k].textContent = v;
    }
  };

  const mini = el.querySelector('.minimap');
  const miniCtx = mini.getContext('2d');
  let miniBase = null;
  let miniMap = null;
  let units = 'kmh';
  let standTimer = 0;
  let miniTimer = 0;
  let deltaTimer = 0;
  const toUnits = (pxs) => Math.round(pxs * PX_TO_KMH * (units === 'mph' ? KMH_TO_MPH : 1));
  const flag = (k, cls, on) => {
    const key = `${k}.${cls}`;
    if (last[key] !== on) {
      last[key] = on;
      refs[k].classList.toggle(cls, on);
    }
  };

  function buildMinimap(track) {
    const cssSize = mini.clientWidth || 140;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(cssSize * dpr);
    mini.width = size;
    mini.height = size;
    const c = track.core;
    const pad = size * 0.1;
    const sc = (size - pad * 2) / Math.max(c.w, c.h);
    const ox = pad + ((size - pad * 2) - c.w * sc) / 2;
    const oy = pad + ((size - pad * 2) - c.h * sc) / 2;
    miniMap = { sc, ox, oy, x0: c.x, y0: c.y, dpr };
    miniBase = document.createElement('canvas');
    miniBase.width = size;
    miniBase.height = size;
    const g = miniBase.getContext('2d');
    g.lineJoin = 'round';
    const lake = track.lakeRing(0);
    if (lake.length) {
      g.beginPath();
      for (const [x, y] of lake) g.lineTo(ox + (x - c.x) * sc, oy + (y - c.y) * sc);
      g.closePath();
      g.fillStyle = 'rgba(70, 172, 208, 0.5)';
      g.fill();
    }
    const path = () => {
      g.beginPath();
      for (let i = 0; i <= track.n; i += 4) {
        const k = i % track.n;
        const x = ox + (track.cx[k] - c.x) * sc;
        const y = oy + (track.cy[k] - c.y) * sc;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
    };
    path();
    g.strokeStyle = 'rgba(10,12,30,0.85)';
    g.lineWidth = 9 * dpr;
    g.stroke();
    path();
    g.strokeStyle = '#e9ecf5';
    g.lineWidth = 4 * dpr;
    g.stroke();
    // start line
    const sx = ox + (track.cx[0] - c.x) * sc;
    const sy = oy + (track.cy[0] - c.y) * sc;
    g.fillStyle = '#ff7a1a';
    g.beginPath();
    g.arc(sx, sy, 4 * dpr, 0, Math.PI * 2);
    g.fill();
  }

  function drawMinimap(cars, player) {
    if (!miniBase) return;
    const g = miniCtx;
    const m = miniMap;
    g.clearRect(0, 0, mini.width, mini.height);
    g.drawImage(miniBase, 0, 0);
    const dot = (car, r) => {
      const x = m.ox + (car.x - m.x0) * m.sc;
      const y = m.oy + (car.y - m.y0) * m.sc;
      g.beginPath();
      g.arc(x, y, r * m.dpr, 0, Math.PI * 2);
      g.fillStyle = car.color;
      g.fill();
      g.lineWidth = 1.5 * m.dpr;
      g.strokeStyle = car.isPlayer ? '#ffffff' : 'rgba(0,0,0,0.6)';
      g.stroke();
    };
    for (const c of cars) if (c !== player) dot(c, 3.2);
    if (player) dot(player, 5);
  }

  function renderStandings(order, length) {
    const leader = order[0];
    let html = '';
    order.forEach((c, k) => {
      let gap = '';
      if (k === 0) gap = 'LEADER';
      else if (c.finished) gap = 'FIN';
      else gap = `+${Math.max(0, (leader.dist - c.dist) / 620).toFixed(1)}`;
      const name = esc(c.name.split(' ').pop().slice(0, 3).toUpperCase());
      html += `<li class="${c.isPlayer ? 'me' : ''}"><span class="p">${k + 1}</span><span class="dot" style="background:${c.color}"></span><span class="n">${c.isPlayer ? 'YOU' : name}</span><span class="g">${gap}</span></li>`;
    });
    refs.stand.innerHTML = html;
  }

  const hud = {
    el,
    init({ track, laps, total, unitsSetting }) {
      units = unitsSetting;
      set('tot', String(total));
      set('laps', String(laps));
      set('lap', '1');
      set('pos', '-');
      set('unit', units === 'mph' ? 'MPH' : 'KM/H');
      set('best', 'BEST --');
      set('time', fmtTime(0));
      set('delta', '');
      flag('corner', 'on', false);
      flag('drift', 'on', false);
      refs.pops.innerHTML = '';
      refs.stand.innerHTML = '';
      refs.wrong.classList.remove('on');
      refs.lights.className = 'hud-lights';
      refs.lights.querySelectorAll('i').forEach((i) => (i.className = ''));
      requestAnimationFrame(() => buildMinimap(track));
    },
    update(rm, player, dt) {
      deltaTimer -= dt;
      if (player) {
        set('spd', String(toUnits(Math.abs(player.speed))));
        const gi = player.gear;
        const neutral = Math.abs(player.speed) < 8 && !player.throttle;
        set('gear', player.speed < -8 ? 'R' : neutral ? 'N' : String(gi.gear));
        const rpm = neutral ? 0.12 + player.throttle * 0.6 : gi.rpm;
        const pct = Math.round(rpm * 100);
        if (last.rpmPct !== pct) {
          last.rpmPct = pct;
          refs.rpm.style.transform = `scaleX(${rpm.toFixed(2)})`;
          refs.rpm.classList.toggle('hot', rpm > 0.92);
        }
        set('pos', String(player.position));
        const lap = Math.min(rm.laps, Math.max(1, player.lapsDone + 1));
        set('lap', String(lap));
        const t = player.finished ? player.finishTime : rm.time;
        set('time', fmtTime(rm.racing ? t : 0));
        set('best', player.bestLap ? `BEST ${fmtTime(player.bestLap)}` : 'BEST --');
      }
      standTimer -= dt;
      if (standTimer <= 0 && rm.order) {
        standTimer = 0.25;
        renderStandings(rm.order, rm.track.length);
      }
      miniTimer -= dt;
      if (miniTimer <= 0) {
        miniTimer = 1 / 30;
        drawMinimap(rm.cars, player);
      }
    },
    // Live gap to the best lap (seconds, negative = faster), or null to hide.
    delta(v) {
      if (v === null || v === undefined) {
        set('delta', '');
        return;
      }
      if (deltaTimer > 0) return;
      deltaTimer = 0.1;
      const s = `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}`;
      set('delta', s);
      flag('delta', 'neg', v < 0);
    },
    // Next-corner card: direction + one fixed tip per corner; turns red (once)
    // if the car is clearly too fast. a = RaceGuide advice, or null to hide.
    corner(a) {
      const c = a?.corner;
      flag('corner', 'on', !!c);
      if (!c) return;
      set('cName', `${c.dir > 0 ? 'RIGHT' : 'LEFT'} ${c.shape === 'hairpin' ? 'HAIRPIN' : 'TURN'}`);
      const arrowKey = `${c.shape}${c.dir}`;
      if (last.arrow !== arrowKey) {
        last.arrow = arrowKey;
        refs.cArrow.innerHTML = arrowSvg(c.shape);
        refs.cArrow.classList.toggle('left', c.dir < 0);
      }
      if (last.cSev !== c.sev) {
        last.cSev = c.sev;
        refs.corner.dataset.sev = c.sev;
      }
      flag('corner', 'warn', !!a.warn);
      set('cMsg', a.warn ? 'Too fast — brake!' : ADVICE[c.sev] || 'Slow down');
    },
    // Live drift counter while a drift chain is running.
    drift(ds) {
      const on = ds.active && ds.chain > 40;
      flag('drift', 'on', on);
      if (!on || last.dChain === ds.chain) return;
      last.dChain = ds.chain;
      set('dPts', fmtCoins(ds.chain));
      set('dMult', `×${ds.mult}`);
    },
    lights(n) {
      refs.lights.classList.add('show');
      refs.lights.querySelectorAll('i').forEach((i, k) => i.classList.toggle('red', k < n));
    },
    go() {
      refs.lights.querySelectorAll('i').forEach((i) => {
        i.classList.remove('red');
        i.classList.add('green');
      });
      refs.lights.classList.add('out');
      setTimeout(() => refs.lights.classList.remove('show', 'out'), 1200);
      hud.popup('GO!', 'go');
    },
    popup(text, kind = '') {
      const p = document.createElement('div');
      p.className = `pop ${kind}`;
      p.textContent = text;
      refs.pops.appendChild(p);
      while (refs.pops.children.length > 3) refs.pops.firstChild.remove();
      setTimeout(() => p.remove(), 1600);
    },
    wrongWay(on) {
      refs.wrong.classList.toggle('on', on);
    },
    resize(track) {
      if (track) buildMinimap(track);
    },
  };
  return hud;
}
