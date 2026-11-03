import { GAME_TITLE, VERSION } from '../../config.js';
import { ICON, esc } from '../util.js';
import { drawTintedCar } from '../carPreview.js';
import { isCoarsePointer } from '../../display.js';

export function render(el, ui) {
  const car = ui.save.data.car;
  const logo = ui.assets.logo
    ? `<img class="logo-img" src="${ui.assets.logo}" alt="${esc(GAME_TITLE)}">`
    : `<h1 class="logo-text">${GAME_TITLE.split(' ')
        .map((w) => `<span>${esc(w)}</span>`)
        .join('')}</h1>`;
  const hint = isCoarsePointer()
    ? '<span>Hold GAS, steer with the arrows</span>'
    : '<span class="keys"><kbd>WASD</kbd> or <kbd>Arrows</kbd> drive <kbd>Space</kbd> drift <kbd>Esc</kbd> pause</span>';
  el.innerHTML = `
    <div class="topbar">
      ${ui.fullscreenButton()}
      <div class="spacer"></div>
      ${ui.coinBadge()}
    </div>
    <div class="mm-center">
      <div class="logo">${logo}</div>
      <div class="mm-buttons">
        <button class="btn btn-primary btn-xl" data-act="play"><span>${ICON.flag} Race</span></button>
        <button class="btn btn-xl" data-act="garage"><span>${ICON.wrench} Garage</span></button>
        <button class="btn btn-xl btn-shop" data-act="shop"><span>${ICON.cart} Shop</span></button>
        <button class="btn btn-xl" data-act="settings"><span>${ICON.gear} Settings</span></button>
      </div>
    </div>
    <div class="mm-foot">
      <div>${hint}<div class="mm-ver">v${VERSION}</div></div>
      <div class="mm-driver">
        <canvas aria-hidden="true"></canvas>
        <div><small>Your car</small><b>${esc(car.name)}<em>#${car.number}</em></b></div>
      </div>
    </div>`;
  requestAnimationFrame(() => {
    const cv = el.querySelector('.mm-driver canvas');
    if (cv) drawTintedCar(cv, car.color, 58, Math.PI / 2);
  });
}

export function action(act, t, ui) {
  if (act === 'play') ui.show('tracks');
  else if (act === 'garage') ui.show('garage');
  else if (act === 'shop') ui.show('shop');
  else if (act === 'settings') ui.show('settings');
}
