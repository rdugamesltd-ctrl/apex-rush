// Shop: tracks, perks, tyre smoke and paints, all bought with race coins.
// Buying takes two taps (the first arms the button) so nothing is spent by accident.
import { PLAYER_COLORS } from '../../config.js';
import { TRACK_DEFS, isUnlocked, trackPrice } from '../../game/tracks/index.js';
import { PERKS, SMOKES, buy, owns, paintPrice, priceOf } from '../../shop.js';
import { ICON, esc, fmtCoins } from '../util.js';
import { diffTag, drawThumb, previewTrack } from './trackSelect.js';

const svg = (body) =>
  `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const GLYPH = {
  coins: svg('<ellipse cx="13" cy="10" rx="8" ry="3.5"/><path d="M5 10v5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-5"/><path d="M11 18.3V22c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-5c0-1.7-2.8-3.1-6.6-3.4"/><path d="M27 7v6M24 10h6"/>'),
  grid: svg('<rect x="5" y="5" width="8" height="10" rx="2"/><rect x="19" y="9" width="8" height="10" rx="2"/><rect x="5" y="19" width="8" height="10" rx="2"/><path d="M23 23v6M20 26h6"/>'),
  laps: svg('<path d="M24 9a10 10 0 1 0 2.5 9"/><path d="M26 4v6h-6"/><text x="16" y="20.5" fill="currentColor" stroke="none" font-size="10" font-weight="900" text-anchor="middle">5</text>'),
  drift: svg('<path d="M6 25c4-1 6-4 8-8s5-8 12-9"/><path d="M4 20c3 0 5-2 6-4M9 28c3 0 6-1 8-3"/><circle cx="25" cy="8" r="2.5"/>'),
  mixer: svg('<path d="M16 4c5 6 9 10 9 15a9 9 0 0 1-18 0c0-5 4-9 9-15z"/><path d="M11 19a5 5 0 0 0 5 5"/>'),
};

let armed = null;

function buyButton(ui, sd, id, { equip = false, equipped = false } = {}) {
  if (owns(sd, id)) {
    if (equipped) return `<button class="shop-btn own" disabled><span>${ICON.check} Equipped</span></button>`;
    if (equip) return `<button class="shop-btn equip" data-act="equip" data-id="${id}"><span>Equip</span></button>`;
    return `<button class="shop-btn own" disabled><span>${ICON.check} Owned</span></button>`;
  }
  const price = priceOf(id);
  const can = sd.coins >= price;
  const label = armed === id ? 'Tap to confirm' : `${ui.icon('icon_coin')} ${fmtCoins(price)}`;
  return `<button class="shop-btn ${can ? '' : 'off'} ${armed === id ? 'arm' : ''}" data-act="buy" data-id="${id}"><span>${label}</span></button>`;
}

export function render(el, ui) {
  const sd = ui.save.data;

  const tracks = TRACK_DEFS.filter((d) => trackPrice(d) > 0)
    .map((def) => {
      const open = isUnlocked(def, sd);
      return `<div class="shop-item track ${open ? 'is-own' : ''}">
        <canvas class="shop-thumb" data-thumb="${def.id}"></canvas>
        <div class="si-row">
          <div class="si-text"><b>${esc(def.name)}</b><small>${diffTag(def.difficulty)}</small></div>
          ${open ? `<button class="shop-btn equip" data-act="race" data-id="${def.id}"><span>Race ${ICON.next}</span></button>` : buyButton(ui, sd, `track:${def.id}`)}
        </div>
      </div>`;
    })
    .join('');

  const perks = PERKS.map(
    (p) => `<div class="shop-item perk ${owns(sd, `perk:${p.id}`) ? 'is-own' : ''}">
        <i class="si-glyph">${GLYPH[p.glyph]}</i>
        <div class="si-text"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></div>
        ${buyButton(ui, sd, `perk:${p.id}`)}
      </div>`
  ).join('');

  const smokes = SMOKES.map(
    (s) => `<div class="shop-item mini ${owns(sd, `smoke:${s.id}`) ? 'is-own' : ''}">
        <i class="si-smoke" style="--c:${s.color}"></i>
        <div class="si-text"><b>${esc(s.name)}</b></div>
        ${buyButton(ui, sd, `smoke:${s.id}`, { equip: true, equipped: sd.car.smoke === s.id })}
      </div>`
  ).join('');

  const paints = PLAYER_COLORS.filter((c) => paintPrice(c) > 0)
    .map((c) => {
      const id = `paint:${c.toLowerCase()}`;
      return `<div class="shop-item mini ${owns(sd, id) ? 'is-own' : ''}">
        <i class="sw" style="--c:${c}"></i>
        ${buyButton(ui, sd, id, { equip: true, equipped: sd.car.color.toLowerCase() === c.toLowerCase() })}
      </div>`;
    })
    .join('');

  el.innerHTML = `
    ${ui.header('Shop')}
    <div class="scroll shop">
      <section class="card"><h3>Tracks</h3><div class="shop-grid tracks">${tracks}</div></section>
      <section class="card"><h3>Perks</h3><div class="shop-grid">${perks}</div></section>
      <section class="card"><h3>Tyre smoke</h3><div class="shop-grid minis">${smokes}</div></section>
      <section class="card"><h3>Paints</h3><div class="shop-grid minis">${paints}</div></section>
    </div>`;
  requestAnimationFrame(() =>
    el.querySelectorAll('[data-thumb]').forEach((c) => drawThumb(c, TRACK_DEFS.find((d) => d.id === c.dataset.thumb)))
  );
}

export function leave() {
  armed = null;
}

export function action(act, t, ui) {
  const sd = ui.save.data;
  const id = t.dataset.id;
  if (act === 'buy') {
    if (sd.coins < priceOf(id)) {
      armed = null;
      ui.toast('Not enough coins - win races to earn more!');
      ui.sfx.tone(180, 0.15, { type: 'square', vol: 0.08 });
      ui.refresh();
      return;
    }
    if (armed !== id) {
      armed = id;
      ui.refresh();
      return;
    }
    armed = null;
    if (buy(sd, id) === 'ok') {
      ui.sfx.coin();
      ui.toast('Purchased!');
      if (id.startsWith('smoke:')) sd.car.smoke = id.slice(6);
      if (id.startsWith('paint:')) sd.car.color = id.slice(6);
    }
  } else if (act === 'equip') {
    armed = null;
    if (!owns(sd, id)) return;
    if (id.startsWith('smoke:')) sd.car.smoke = id.slice(6);
    else if (id.startsWith('paint:')) sd.car.color = id.slice(6);
  } else if (act === 'race') {
    sd.lastRace.trackId = id;
    ui.save.persist();
    previewTrack(null);
    ui.show('tracks');
    return;
  } else return;
  ui.save.persist();
  ui.refresh();
}
