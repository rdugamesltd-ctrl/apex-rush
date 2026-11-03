import { PLAYER_COLORS, UPGRADES, UPGRADE_COSTS, MAX_LEVEL, computeStats, PX_TO_KMH, KMH_TO_MPH } from '../../config.js';
import { drawTintedCar } from '../carPreview.js';
import { ICON, esc, fmtCoins } from '../util.js';
import { SMOKES, buy, owns, priceOf } from '../../shop.js';

// Line icons for the hexagon buttons and the stat strip.
const svg = (body) =>
  `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const GLYPH = {
  engine: svg('<path d="M7 11h4l1-2h7l2 2h3v4h2v-2h2v8h-2v-2h-2v4l-3 3H12l-3-3H7z"/><path d="M4 14v6M4 17h3M13 15h6M16 13v4"/>'),
  turbo: svg('<path d="M18 26a9 9 0 1 1 8-13"/><path d="M18 21a4.5 4.5 0 1 1 4-6.5"/><circle cx="18" cy="17" r="1.2"/><path d="M26 13V6h-6M26 6l-5 5"/>'),
  tires: svg('<ellipse cx="13" cy="16" rx="6" ry="10"/><ellipse cx="13" cy="16" rx="2.5" ry="4.5"/><path d="M13 6h7c3.3 0 6 4.5 6 10s-2.7 10-6 10h-7M19 8.5l-3 3M21 13l-3 3M21 18l-3 3M19 23l-2 2"/>'),
  brakes: svg('<circle cx="15" cy="17" r="9"/><circle cx="15" cy="17" r="3"/><path d="M15 9.5v1M22.5 17h-1M15 24.5v-1M7.5 17h1M10 12l.7.7M20 22l-.7-.7M10 22l.7-.7"/><path d="M19 6.5a11 11 0 0 1 7.5 6.5l-4 2a6.5 6.5 0 0 0-4-4z"/>'),
  aero: svg('<path d="M5 12h22l-2 6H7z"/><path d="M5 12V8M27 12V8M10 18v6M22 18v6M8 24h4M20 24h4M16 9v3"/>'),
};

const STAT_GLYPH = {
  top: svg('<path d="M6 23a11 11 0 1 1 20 0"/><path d="M16 19l5-6"/><circle cx="16" cy="19" r="1.6"/><path d="M8 17h2M16 9v2M22 11l-1 1.5M24 17h-2"/>'),
  accel: svg('<circle cx="16" cy="18" r="9"/><path d="M16 18l4-4M13 5h6M16 5v4M24 9l2-2"/>'),
  grip: svg('<circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="5"/><path d="M16 6v4M16 22v4M6 16h4M22 16h4"/><path d="M23 9l3-3M26 6v3M26 6h-3"/>'),
  brake: svg('<path d="M11 5h10l6 6v10l-6 6H11l-6-6V11z"/><path d="M10 16h12"/>'),
};

// Where each upgrade's leader line lands on the car image (fraction of the
// sprite box, nose up) and which column its hexagon sits in.
const PARTS = {
  brakes: { side: 'l', row: 0, at: [0.12, 0.28] },
  engine: { side: 'l', row: 1, at: [0.5, 0.72] },
  aero: { side: 'r', row: 0, at: [0.74, 0.07] },
  turbo: { side: 'r', row: 1, at: [0.74, 0.56] },
  tires: { side: 'r', row: 2, at: [0.88, 0.92] },
};

let selected = 'engine';
let armed = null; // shop id waiting for a second tap to buy
let bought = null;
let resizeObs = null;

// Readable numbers derived from the same physics as Car.js.
const PX_TO_M = PX_TO_KMH / 3.6;
function figures(lv, mph) {
  const st = computeStats(lv);
  const dt = 1 / 120;
  // standing start to 200 km/h (120 mph) at full throttle
  const target = (mph ? 120 / KMH_TO_MPH : 200) / PX_TO_KMH;
  let v = 0;
  let t = 0;
  while (v < target && t < 30) {
    const r = v / st.topSpeed;
    v += st.accel * Math.max(0, 1 - r * r) * (r < 0.2 ? 1.15 : 1) * dt - v * 0.04 * dt;
    t += dt;
  }
  // full braking from 300 km/h (180 mph)
  v = (mph ? 180 / KMH_TO_MPH : 300) / PX_TO_KMH;
  let d = 0;
  while (v > 0) {
    v = Math.max(0, v - st.brake * dt - v * 0.32 * dt);
    d += v * dt;
  }
  return {
    top: st.topSpeed * PX_TO_KMH * (mph ? KMH_TO_MPH : 1),
    accel: t,
    grip: (st.aLat * (1 + st.aero) * PX_TO_M) / 9.81,
    brake: d * PX_TO_M,
  };
}

const STAT_DEFS = (mph) => [
  { id: 'top', unit: mph ? 'mph' : 'km/h', label: 'Top speed', short: 'Top speed', fmt: (v) => Math.round(v), dfmt: (d) => Math.round(d), better: 1 },
  { id: 'accel', unit: 's', label: mph ? '0-120 mph' : '0-200 km/h', short: 'Acceleration', fmt: (v) => v.toFixed(2), dfmt: (d) => d.toFixed(2), better: -1 },
  { id: 'grip', unit: 'g', label: 'Cornering grip', short: 'Grip', fmt: (v) => v.toFixed(1), dfmt: (d) => d.toFixed(2), better: 1 },
  { id: 'brake', unit: 'm', label: mph ? 'Braking 180-0 mph' : 'Braking 300-0 km/h', short: 'Braking', fmt: (v) => v.toFixed(1), dfmt: (d) => d.toFixed(1), better: -1 },
];

export function render(el, ui) {
  const sd = ui.save.data;
  const lv = sd.upgrades;
  const mph = sd.settings.units === 'mph';
  if (!PARTS[selected]) selected = 'engine';
  const selLevel = lv[selected];
  const now = figures(lv, mph);
  const next = selLevel < MAX_LEVEL ? figures({ ...lv, [selected]: selLevel + 1 }, mph) : null;

  const hexes = UPGRADES.map((u) => {
    const p = PARTS[u.id];
    const l = lv[u.id];
    const ready = l < MAX_LEVEL && sd.coins >= UPGRADE_COSTS[l];
    const cls = ['hex', `hex-${p.side}`, `row-${p.row}`, u.id === selected && 'on', ready && 'ready', u.id === bought && 'pop']
      .filter(Boolean)
      .join(' ');
    return `<button class="${cls}" data-act="sel" data-id="${u.id}" aria-label="${u.name}, level ${l} of ${MAX_LEVEL}" aria-pressed="${u.id === selected}">
        <span class="hex-face">${GLYPH[u.id]}</span>
        <span class="hex-lv">${l >= MAX_LEVEL ? 'MAX' : `${l}/${MAX_LEVEL}`}</span>
      </button>`;
  }).join('');

  const statRow = STAT_DEFS(mph).map((s) => {
    const d = next ? next[s.id] - now[s.id] : 0;
    const show = Math.abs(d) > (s.id === 'top' ? 0.5 : 0.004);
    const delta = show ? `<em class="${d * s.better > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${s.dfmt(Math.abs(d))}</em>` : '';
    return `<div class="gx-stat ${show ? 'hit' : ''}" title="${s.label}">
        <i>${STAT_GLYPH[s.id]}</i>
        <b>${s.fmt(now[s.id])}<small>${s.unit}</small>${delta}</b>
        <span>${s.label}</span>
      </div>`;
  }).join('');

  const swatches = PLAYER_COLORS.map((c) => {
    const id = `paint:${c.toLowerCase()}`;
    const lock = !owns(sd, id);
    const cls = ['sw', c.toLowerCase() === sd.car.color.toLowerCase() && 'on', lock && 'locked', armed === id && 'arm'].filter(Boolean).join(' ');
    const label = lock ? `Colour ${c}, ${priceOf(id)} coins` : `Colour ${c}`;
    return `<button class="${cls}" style="--c:${c}" data-act="color" data-color="${c}" aria-label="${label}">${lock ? ICON.lock : ''}</button>`;
  }).join('');
  const mixer = owns(sd, 'perk:mixer')
    ? `<label class="sw custom" style="--c:${sd.car.color}" title="Custom colour"><input type="color" data-field="color" value="${sd.car.color}"><span>+</span></label>`
    : `<button class="sw custom locked" data-act="mixer" title="Paint Mixer (Shop)" aria-label="Custom colour, needs Paint Mixer">${ICON.lock}</button>`;
  const smokes = SMOKES.map((m) => {
    const id = `smoke:${m.id}`;
    const lock = !owns(sd, id);
    const cls = ['sw smoke', sd.car.smoke === m.id && 'on', lock && 'locked', armed === id && 'arm'].filter(Boolean).join(' ');
    return `<button class="${cls}" style="--c:${m.color}" data-act="smoke" data-id="${m.id}" title="${m.name}${lock ? ` · ${m.price} coins` : ''}" aria-label="${m.name} smoke${lock ? `, ${m.price} coins` : ''}">${lock ? ICON.lock : ''}</button>`;
  }).join('');
  const hint = armed ? `<div class="gx-arm">Tap again to buy for ${ui.icon('icon_coin')} ${fmtCoins(priceOf(armed))}</div>` : '';

  el.innerHTML = `
    <div class="gx">
      <div class="gx-top">
        <header class="gx-head">
          <button class="gx-back" data-act="back" aria-label="Back"><i>${ICON.back}</i></button>
          <h2>Garage</h2>
          <div class="spacer"></div>
          <div class="gx-coins">${ui.icon('icon_coin')}<b>${fmtCoins(sd.coins)}</b></div>
        </header>
        <div class="gx-bays">
          <section class="gx-bay gx-side gx-driver">
            <h3>Driver</h3>
            <div class="fields">
              <label>Name<input type="text" maxlength="12" data-field="name" value="${esc(sd.car.name)}"></label>
              <label class="num">No.<input type="number" min="1" max="99" data-field="number" value="${sd.car.number}"></label>
            </div>
            <h3>Paint</h3>
            <div class="swatches">${swatches}${mixer}</div>
            <h3>Tyre smoke</h3>
            <div class="swatches">${smokes}</div>
            ${hint}
          </section>
          <section class="gx-bay gx-main">
            <svg class="gx-lines" aria-hidden="true"></svg>
            <canvas class="car-cv"></canvas>
            ${hexes}
            <div class="gx-tab">Your car</div>
          </section>
          <section class="gx-bay gx-side gx-detail">${detail(ui, mph, now, next)}</section>
        </div>
      </div>
      <div class="gx-bottom">
        <div class="gx-team"><span>Driver</span><b>${esc(sd.car.name)} <em>#${sd.car.number}</em></b></div>
        <div class="gx-stats">${statRow}</div>
        <button class="gx-play" data-act="race" aria-label="Race">${ICON.play}</button>
      </div>
    </div>`;
  bought = null;

  requestAnimationFrame(() => layout(el, sd.car.color));
  resizeObs?.disconnect();
  if (window.ResizeObserver) {
    const bay = el.querySelector('.gx-main');
    let last = 0;
    resizeObs = new ResizeObserver(() => {
      const h = bay.clientHeight;
      if (Math.abs(h - last) > 1) layout(el, ui.save.data.car.color);
      last = h;
    });
    resizeObs.observe(bay);
  }
}

function detail(ui, mph, now, next) {
  const sd = ui.save.data;
  const u = UPGRADES.find((x) => x.id === selected);
  const l = sd.upgrades[u.id];
  const maxed = l >= MAX_LEVEL;
  const cost = maxed ? 0 : UPGRADE_COSTS[l];
  const can = !maxed && sd.coins >= cost;
  const pips = Array.from({ length: MAX_LEVEL }, (_, k) => `<i class="${k < l ? 'on' : k === l && !maxed ? 'next' : ''}"></i>`).join('');
  const gains = next
    ? STAT_DEFS(mph)
        .filter((s) => Math.abs(next[s.id] - now[s.id]) > (s.id === 'top' ? 0.5 : 0.004))
        .map((s) => `<div class="gain"><span>${s.short}</span><b>${s.fmt(now[s.id])} <i>→</i> ${s.fmt(next[s.id])}<small>${s.unit}</small></b></div>`)
        .join('')
    : '';
  return `
    <h3>Upgrade</h3>
    <div class="dt-head">
      <span class="dt-glyph">${GLYPH[u.id]}</span>
      <div><b>${u.name}</b><small>${u.desc}</small></div>
    </div>
    <div class="dt-pips">${pips}<span>Lv ${l}</span></div>
    <div class="gains">${gains}</div>
    <button class="gx-buy ${can ? '' : 'off'}" data-act="buy" data-id="${u.id}" ${maxed ? 'disabled' : ''}>
      <span>${maxed ? 'Maxed out' : `Upgrade ${ui.icon('icon_coin')} ${fmtCoins(cost)}`}</span>
    </button>`;
}

// Size the car to its bay and draw the leader lines from each hexagon to its part.
function layout(el, color) {
  const bay = el.querySelector('.gx-main');
  const cv = el.querySelector('.gx-main .car-cv');
  const lines = el.querySelector('.gx-lines');
  if (!bay || !cv || !lines || !bay.clientHeight) return;
  drawTintedCar(cv, color, Math.max(110, bay.clientHeight * 0.8));

  const o = lines.getBoundingClientRect();
  const c = cv.getBoundingClientRect();
  lines.setAttribute('viewBox', `0 0 ${o.width} ${o.height}`);
  lines.innerHTML = UPGRADES.map((u) => {
    const hex = bay.querySelector(`.hex[data-id="${u.id}"]`).getBoundingClientRect();
    const p = PARTS[u.id];
    const ax = c.left - o.left + p.at[0] * c.width;
    const ay = c.top - o.top + p.at[1] * c.height;
    const hx = (p.side === 'l' ? hex.right : hex.left) - o.left;
    const hy = hex.top + hex.height / 2 - o.top;
    const kx = hx + (ax - hx) * 0.45;
    return `<g class="${u.id === selected ? 'on' : ''}"><path d="M${hx} ${hy}H${kx}L${ax} ${ay}"/><circle cx="${ax}" cy="${ay}" r="3.2"/></g>`;
  }).join('');
}

export function leave() {
  armed = null;
  resizeObs?.disconnect();
  resizeObs = null;
}

export function action(act, t, ui) {
  const sd = ui.save.data;
  if (act !== 'color' && act !== 'smoke') armed = null;
  if (act === 'sel') {
    selected = t.dataset.id;
    ui.refresh();
    return;
  }
  if (act === 'race') {
    ui.show('tracks');
    return;
  }
  if (act === 'color' || act === 'smoke') {
    const id = act === 'color' ? `paint:${t.dataset.color.toLowerCase()}` : `smoke:${t.dataset.id}`;
    if (!owns(sd, id)) {
      if (sd.coins < priceOf(id)) {
        armed = null;
        ui.toast(`Costs ${fmtCoins(priceOf(id))} coins - win races to earn more!`);
        ui.sfx.tone(180, 0.15, { type: 'square', vol: 0.08 });
        ui.refresh();
        return;
      }
      if (armed !== id) {
        armed = id;
        ui.refresh();
        return;
      }
      buy(sd, id);
      ui.sfx.coin();
      ui.toast(act === 'color' ? 'New paint unlocked!' : 'New tyre smoke unlocked!');
    }
    armed = null;
    if (act === 'color') sd.car.color = t.dataset.color;
    else sd.car.smoke = t.dataset.id;
  } else if (act === 'mixer') {
    ui.toast('Unlock the Paint Mixer in the Shop to mix custom colours');
    return;
  } else if (act === 'buy') {
    const id = t.dataset.id;
    const l = sd.upgrades[id];
    if (l >= MAX_LEVEL) return;
    const cost = UPGRADE_COSTS[l];
    if (sd.coins < cost) {
      ui.toast('Not enough coins - win races to earn more!');
      ui.sfx.tone(180, 0.15, { type: 'square', vol: 0.08 });
      return;
    }
    sd.coins -= cost;
    sd.upgrades[id] = l + 1;
    bought = id;
    ui.sfx.coin();
    ui.toast(`${UPGRADES.find((u) => u.id === id).name} upgraded to level ${l + 1}!`);
  } else return;
  ui.save.persist();
  ui.refresh();
}

export function input(e, ui) {
  const f = e.target.dataset.field;
  const sd = ui.save.data;
  const el = ui.currentEl;
  if (f === 'color') {
    sd.car.color = e.target.value;
    e.target.parentElement.style.setProperty('--c', e.target.value);
    layout(el, sd.car.color);
    el.querySelectorAll('.sw.on').forEach((s) => s.classList.remove('on'));
  } else if (f === 'name') {
    sd.car.name = e.target.value.trim().slice(0, 12) || 'Player';
    const b = el.querySelector('.gx-team b');
    if (b) b.innerHTML = `${esc(sd.car.name)} <em>#${sd.car.number}</em>`;
  } else if (f === 'number') {
    const n = Math.max(1, Math.min(99, Math.round(Number(e.target.value) || 1)));
    sd.car.number = n;
    const em = el.querySelector('.gx-team em');
    if (em) em.textContent = `#${n}`;
  } else return;
  ui.save.persist();
}
