import { ICON, esc, fmtCoins, fmtTime, ordinal } from '../util.js';
import { isUnlocked, trackDef, trackPrice } from '../../game/tracks/index.js';
import { DIFFICULTIES } from '../../config.js';
import { previewTrack } from './trackSelect.js';

export function render(el, ui, d) {
  const winner = d.rows[0].time;
  const rows = d.rows
    .map((r) => {
      const gap = r.position === 1 ? fmtTime(r.time) : `+${(r.time - winner).toFixed(3)}${r.estimated ? '*' : ''}`;
      const name = r.isPlayer ? `${r.name} (you)` : r.name;
      return `<tr class="${r.isPlayer ? 'me' : ''}"><td class="p">${r.position}</td><td><span class="dot" style="background:${r.color}"></span>${esc(name)}</td><td class="t">${gap}</td><td class="t muted">${r.bestLap ? fmtTime(r.bestLap) : '--'}</td></tr>`;
    })
    .join('');
  const podium = d.position <= 3;
  const title = d.position === 1 ? 'Victory!' : podium ? 'Podium!' : 'Finished';
  const def = trackDef(d.cfg.trackId);
  const next = d.nextTrack ? trackDef(d.nextTrack) : null;
  const nextOpen = next && isUnlocked(next, ui.save.data);
  el.innerHTML = `
    <div class="results-wrap">
      <div class="res-head ${podium ? `gold p${d.position}` : ''}">
        ${podium ? ui.icon('icon_trophy', 'res-trophy') : ''}
        <div>
          <div class="res-place">${ordinal(d.position)} <small>of ${d.cars}</small></div>
          <div class="res-title">${title}</div>
          <div class="muted">${esc(def.name)} · ${d.cfg.laps} lap${d.cfg.laps > 1 ? 's' : ''} · ${DIFFICULTIES[d.difficulty].label}</div>
        </div>
      </div>
      <div class="res-body scroll">
        <div class="card res-table-card">
          <table class="res-table"><thead><tr><th>#</th><th>Driver</th><th>Time</th><th>Best lap</th></tr></thead><tbody>${rows}</tbody></table>
        </div>
        <div class="card res-earn">
          <div class="earn-row"><span>Finished ${ordinal(d.position)}</span><b>+${fmtCoins(d.reward.placeCoins)}</b></div>
          <div class="earn-row"><span>Overtakes × ${d.overtakes}</span><b>+${fmtCoins(d.reward.overtakeCoins)}</b></div>
          ${d.drift ? `<div class="earn-row"><span>Drift ${fmtCoins(d.drift)} pts${d.bestDrift ? ` · best ${fmtCoins(d.bestDrift)}` : ''}</span><b>+${fmtCoins(d.reward.driftCoins)}</b></div>` : ''}
          ${d.reward.boostCoins ? `<div class="earn-row boost"><span>Coin Booster +50%</span><b>+${fmtCoins(d.reward.boostCoins)}</b></div>` : ''}
          <div class="earn-total">${ui.icon('icon_coin')}<b class="count">+0</b></div>
          ${d.newBest ? `<div class="banner best">New best lap ${fmtTime(d.bestLap)}</div>` : ''}
          ${next && !nextOpen ? `<div class="banner unlock">${ICON.lock} ${esc(next.name)} · ${DIFFICULTIES[next.difficulty].label} · ${ui.icon('icon_coin')} ${fmtCoins(trackPrice(next))}</div>` : ''}
        </div>
      </div>
      <div class="res-actions">
        <button class="btn" data-act="menu"><span>${ICON.home} Menu</span></button>
        <button class="btn" data-act="garage"><span>${ICON.wrench} Garage</span></button>
        <button class="btn" data-act="again"><span>${ICON.restart} Race again</span></button>
        ${next ? `<button class="btn btn-primary" data-act="next"><span>${nextOpen ? `Next track ${ICON.next}` : `${ICON.lock} Unlock next`}</span></button>` : ''}
      </div>
    </div>`;
  if (podium) confetti(el);
  const count = el.querySelector('.count');
  const to = d.reward.total;
  const t0 = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / 1200);
    count.textContent = `+${fmtCoins(to * (1 - Math.pow(1 - k, 3)))}`;
    if (k < 1 && count.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// A short burst of falling confetti for a podium finish.
function confetti(el) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  el.appendChild(layer);
  const colors = ['#ff7a1a', '#ffc531', '#ffffff', '#19c3b4', '#e83a8e', '#3a7bff'];
  const fall = window.innerHeight + 40;
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.background = colors[i % colors.length];
    p.style.left = `${Math.random() * 100}%`;
    layer.appendChild(p);
    const dx = (Math.random() - 0.5) * 220;
    const spin = (Math.random() - 0.5) * 1440;
    p.animate(
      [
        { transform: 'translate3d(0, -24px, 0) rotate(0deg)' },
        { transform: `translate3d(${dx}px, ${fall}px, 0) rotate(${spin}deg)` },
      ],
      {
        duration: 2200 + Math.random() * 1600,
        delay: Math.random() * 600,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fill: 'both',
      }
    );
  }
  setTimeout(() => layer.remove(), 4600);
}

export function action(act, t, ui, d) {
  if (act === 'menu') ui.emit('ui:quit');
  else if (act === 'garage') ui.emit('ui:quit', { to: 'garage' });
  else if (act === 'again') ui.emit('ui:restart');
  else if (act === 'next' && d.nextTrack) {
    if (!isUnlocked(trackDef(d.nextTrack), ui.save.data)) {
      previewTrack(d.nextTrack);
      ui.emit('ui:quit', { to: 'tracks' });
      return;
    }
    ui.save.data.lastRace.trackId = d.nextTrack;
    ui.save.persist();
    ui.startRace({ ...ui.save.data.lastRace });
  }
}
