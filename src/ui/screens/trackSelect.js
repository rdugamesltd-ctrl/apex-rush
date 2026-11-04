import { TRACK_DEFS, getTrack, isUnlocked, trackPrice } from '../../game/tracks/index.js';
import { THEMES } from '../../game/themes.js';
import { cornerNotes, guideProfile } from '../../game/RaceGuide.js';
import { BASE_STATS, DIFFICULTIES, LAP_OPTIONS, OPPONENT_OPTIONS, PX_TO_KMH, raceReward } from '../../config.js';
import { ICON, esc, fmtCoins, fmtTime, ordinal } from '../util.js';
import { buy, gridOpen, lapsOpen, perksOf } from '../../shop.js';

// A locked track the player tapped: shown selected with an unlock button.
let preview = null;

// Length (km) and number of corners, for the card captions.
const facts = new Map();
function trackFacts(def) {
  if (!facts.has(def.id)) {
    const t = getTrack(def.id);
    const km = (t.length * PX_TO_KMH) / 3.6 / 1000;
    const turns = cornerNotes(t, guideProfile(t, BASE_STATS), BASE_STATS.topSpeed).length;
    facts.set(def.id, `${km.toFixed(1)} km · ${turns} turns`);
  }
  return facts.get(def.id);
}

const hex = (v) => `#${v.toString(16).padStart(6, '0')}`;

function seg(name, options, current, open = () => true) {
  return `<div class="seg">${options
    .map((v) => {
      const lock = !open(v);
      return `<button class="${v === current ? 'on' : ''} ${lock ? 'locked' : ''}" data-act="${name}" data-v="${v}">${lock ? ICON.lock : ''}${v}</button>`;
    })
    .join('')}</div>`;
}

export const diffTag = (key) => `<span class="tag t-${key}">${DIFFICULTIES[key].label}</span>`;

export function drawThumb(canvas, def) {
  const track = getTrack(def.id);
  const theme = THEMES[def.theme];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 220;
  const h = canvas.clientHeight || 130;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  // ground: theme colour, sunlit from the top left, darker at the edges
  g.fillStyle = theme.bg;
  g.fillRect(0, 0, W, H);
  const sun = g.createRadialGradient(W * 0.25, H * 0.2, 0, W * 0.25, H * 0.2, W * 0.9);
  sun.addColorStop(0, 'rgba(255,255,230,0.22)');
  sun.addColorStop(1, 'rgba(0,10,30,0.28)');
  g.fillStyle = sun;
  g.fillRect(0, 0, W, H);
  if (theme.mow) {
    g.fillStyle = 'rgba(255,255,255,0.06)';
    const band = 16 * dpr;
    for (let x = -H; x < W; x += band * 2) {
      g.beginPath();
      g.moveTo(x, H);
      g.lineTo(x + H, 0);
      g.lineTo(x + H + band, 0);
      g.lineTo(x + band, H);
      g.fill();
    }
  }
  const c = track.core;
  const pad = 18 * dpr;
  const sc = Math.min((W - pad * 2) / c.w, (H - pad * 2) / c.h);
  const ox = (W - c.w * sc) / 2;
  const oy = (H - c.h * sc) / 2;
  const lake = track.lakeRing(0);
  if (lake.length) {
    const oasis = def.lake.style === 'oasis';
    g.beginPath();
    for (const [x, y] of lake) g.lineTo(ox + (x - c.x) * sc, oy + (y - c.y) * sc);
    g.closePath();
    g.fillStyle = oasis ? '#45c0c2' : '#3f9fcc';
    g.fill();
    g.lineWidth = (oasis ? 4 : 2.5) * dpr;
    g.strokeStyle = oasis ? '#6f9a39' : '#ead9a8';
    g.stroke();
  }
  const path = (dx = 0, dy = 0) => {
    g.beginPath();
    for (let i = 0; i <= track.n; i += 3) {
      const k = i % track.n;
      const x = ox + (track.cx[k] - c.x) * sc + dx;
      const y = oy + (track.cy[k] - c.y) * sc + dy;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
  };
  g.lineJoin = 'round';
  path(2 * dpr, 3 * dpr);
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.lineWidth = 13 * dpr;
  g.stroke();
  path();
  g.strokeStyle = hex(theme.runoff);
  g.lineWidth = 13 * dpr;
  g.stroke();
  path();
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 9 * dpr;
  g.stroke();
  path();
  g.strokeStyle = hex(theme.asphalt);
  g.lineWidth = 6.5 * dpr;
  g.stroke();
  // start / finish
  const sx = ox + (track.cx[0] - c.x) * sc;
  const sy = oy + (track.cy[0] - c.y) * sc;
  g.shadowColor = 'rgba(255,122,26,0.9)';
  g.shadowBlur = 10 * dpr;
  g.fillStyle = '#ff7a1a';
  g.beginPath();
  g.arc(sx, sy, 5 * dpr, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 2 * dpr;
  g.strokeStyle = '#fff';
  g.stroke();
}

export function render(el, ui) {
  const sd = ui.save.data;
  const r = sd.lastRace;
  const selDef = TRACK_DEFS.find((d) => d.id === r.trackId);
  if (!selDef || !isUnlocked(selDef, sd)) r.trackId = TRACK_DEFS[0].id;
  if (!lapsOpen(sd, r.laps)) r.laps = 3;
  if (!gridOpen(sd, r.opponents)) r.opponents = 7;
  const pv = TRACK_DEFS.find((d) => d.id === preview && !isUnlocked(d, sd));
  if (!pv) preview = null;
  const shown = pv || TRACK_DEFS.find((d) => d.id === r.trackId);
  const reward = raceReward(
    { position: 1, cars: r.opponents + 1, difficulty: shown.difficulty, laps: r.laps, overtakes: 0 },
    perksOf(sd)
  );

  const cards = TRACK_DEFS.map((def) => {
    const open = isUnlocked(def, sd);
    const best = sd.bestLaps[def.id];
    const pod = sd.podiums[def.id];
    const price = trackPrice(def);
    return `
      <button class="track-card ${def === shown ? 'sel' : ''} ${open ? '' : 'locked'}" data-act="track" data-id="${def.id}">
        <div class="thumb-wrap">
          <canvas class="thumb" data-thumb="${def.id}"></canvas>
          ${open ? '' : `<div class="lock">${ICON.lock}</div>`}
        </div>
        <div class="tc-info">
          <b>${esc(def.name)}</b>
          <small>${diffTag(def.difficulty)}<span class="tc-meta">${trackFacts(def)}</span>${pod ? `<span class="podium">${ui.icon('icon_trophy')} ${ordinal(pod)}</span>` : ''}</small>
          ${open ? `<small class="muted">Best lap ${best ? fmtTime(best) : '--'}</small>` : `<small class="req price ${sd.coins >= price ? 'can' : ''}">${ui.icon('icon_coin')} ${fmtCoins(price)}</small>`}
        </div>
      </button>`;
  }).join('');

  let foot;
  if (pv) {
    const price = trackPrice(pv);
    const can = sd.coins >= price;
    foot = `
      <div class="reward">${can ? 'Unlock to race' : `Need ${ui.icon('icon_coin')} <b>${fmtCoins(price - sd.coins)}</b> more`}</div>
      <button class="btn btn-primary btn-lg ${can ? '' : 'off'}" data-act="buytrack" data-id="${pv.id}"><span>${ICON.lock} Unlock ${ui.icon('icon_coin')} ${fmtCoins(price)}</span></button>`;
  } else {
    foot = `
      <div class="reward">Win up to ${ui.icon('icon_coin')} <b>${fmtCoins(reward.total)}</b></div>
      <button class="btn btn-primary btn-lg" data-act="start"><span>Start race ${ICON.next}</span></button>`;
  }

  el.innerHTML = `
    ${ui.header('Choose Track')}
    <div class="scroll">
      <div class="race-opts card">
        <div class="opt"><label>Laps</label>${seg('laps', LAP_OPTIONS, r.laps, (v) => lapsOpen(sd, v))}</div>
        <div class="opt"><label>Opponents</label>${seg('opp', OPPONENT_OPTIONS, r.opponents, (v) => gridOpen(sd, v))}</div>
        <div class="opt"><label>Difficulty</label><div class="diff-fixed">${diffTag(shown.difficulty)}<small>Set by the track</small></div></div>
        <div class="opt"><label>Test</label><div class="seg"><button data-act="unlockall">${TRACK_DEFS.every((d) => isUnlocked(d, sd)) ? 'All tracks open' : 'Unlock all tracks'}</button></div></div>
      </div>
      <div class="track-list">${cards}</div>
    </div>
    <footer class="scr-foot">${foot}</footer>`;
  requestAnimationFrame(() =>
    el.querySelectorAll('[data-thumb]').forEach((c) => drawThumb(c, TRACK_DEFS.find((d) => d.id === c.dataset.thumb)))
  );
}

export function leave() {
  preview = null;
}

// Open the screen with a locked track pre-selected (results "Unlock next").
export function previewTrack(id) {
  preview = id;
}

function deny(t, ui, msg) {
  t.classList.remove('shake');
  void t.offsetWidth;
  t.classList.add('shake');
  ui.toast(msg);
  ui.sfx.tone(180, 0.15, { type: 'square', vol: 0.08 });
}

export function action(act, t, ui) {
  const sd = ui.save.data;
  const r = sd.lastRace;
  if (act === 'track') {
    const def = TRACK_DEFS.find((d) => d.id === t.dataset.id);
    if (isUnlocked(def, sd)) {
      preview = null;
      r.trackId = def.id;
    } else preview = def.id;
  } else if (act === 'buytrack') {
    const def = TRACK_DEFS.find((d) => d.id === t.dataset.id);
    const res = buy(sd, `track:${def.id}`);
    if (res === 'poor') return deny(t, ui, 'Not enough coins - win races to earn more!');
    if (res === 'ok') {
      ui.sfx.coin();
      ui.toast(`${def.name} unlocked!`);
    }
    preview = null;
    r.trackId = def.id;
  } else if (act === 'unlockall') {
    // Test helper: open every track without spending coins.
    for (const def of TRACK_DEFS) if (!isUnlocked(def, sd)) sd.unlocked.push(def.id);
    preview = null;
    ui.toast('All tracks unlocked');
  } else if (act === 'laps') {
    const v = Number(t.dataset.v);
    if (!lapsOpen(sd, v)) return deny(t, ui, '5-lap races need Endurance from the Shop');
    r.laps = v;
  } else if (act === 'opp') {
    const v = Number(t.dataset.v);
    if (!gridOpen(sd, v)) return deny(t, ui, '11 rivals need Full Grid from the Shop');
    r.opponents = v;
  } else if (act === 'start') {
    ui.save.persist();
    ui.startRace({ ...r });
    return;
  } else return;
  ui.save.persist();
  ui.refresh();
}
