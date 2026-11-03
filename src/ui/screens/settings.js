import { ICON } from '../util.js';
import { resetAdaptive } from '../../perf.js';

const seg = (name, options, current) =>
  `<div class="seg">${options
    .map(([v, l]) => `<button class="${v === current ? 'on' : ''}" data-act="${name}" data-v="${v}">${l}</button>`)
    .join('')}</div>`;

export const LINE_OPTIONS = [
  ['full', 'Full'],
  ['braking', 'Braking only'],
  ['off', 'Off'],
];
export const CAMERA_OPTIONS = [
  ['fixed', 'Top-down'],
  ['follow', 'Follow car'],
];

let confirmReset = false;

export function render(el, ui) {
  const s = ui.save.data.settings;
  el.innerHTML = `
    ${ui.header('Settings')}
    <div class="scroll">
      <div class="card settings">
        <div class="opt"><label>Volume</label><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-field="volume"></div>
        <div class="opt"><label>Sound</label>${seg('muted', [['0', 'On'], ['1', 'Off']], s.muted ? '1' : '0')}</div>
        <div class="opt"><label>Speed units</label>${seg('units', [['kmh', 'km/h'], ['mph', 'mph']], s.units)}</div>
        <div class="opt"><label>Racing line</label>${seg('line', LINE_OPTIONS, s.racingLine)}</div>
        <div class="opt"><label>Corner hints</label>${seg('hints', [['1', 'On'], ['0', 'Off']], s.cornerHints ? '1' : '0')}</div>
        <div class="opt"><label>Camera</label>${seg('camera', CAMERA_OPTIONS, s.camera)}</div>
        <div class="opt"><label>Camera motion</label>${seg('camMotion', [['full', 'Full'], ['low', 'Reduced']], s.camMotion)}</div>
        <div class="opt"><label>Graphics</label>${seg('quality', [['auto', 'Auto'], ['high', 'High'], ['low', 'Low (faster)']], s.quality)}</div>
        <div class="opt"><label>Touch layout</label>${seg('hand', [['0', 'Steer on left'], ['1', 'Steer on right']], s.leftHanded ? '1' : '0')}</div>
        <div class="opt"><label>Vibration</label>${seg('vib', [['1', 'On'], ['0', 'Off']], s.vibration ? '1' : '0')}</div>
        <div class="opt danger"><label>Progress</label>
          <button class="btn btn-danger" data-act="reset"><span>${ICON.restart} ${confirmReset ? 'Tap again to confirm' : 'Reset all progress'}</span></button>
        </div>
      </div>
    </div>`;
}

export function action(act, t, ui) {
  const s = ui.save.data.settings;
  const v = t.dataset.v;
  if (act !== 'reset') confirmReset = false;
  if (act === 'muted') s.muted = v === '1';
  else if (act === 'units') s.units = v;
  else if (act === 'line') s.racingLine = v;
  else if (act === 'hints') s.cornerHints = v === '1';
  else if (act === 'camera') s.camera = v;
  else if (act === 'camMotion') s.camMotion = v;
  else if (act === 'quality') {
    s.quality = v;
    if (v === 'auto') resetAdaptive();
  }
  else if (act === 'hand') s.leftHanded = v === '1';
  else if (act === 'vib') s.vibration = v === '1';
  else if (act === 'reset') {
    if (!confirmReset) {
      confirmReset = true;
      ui.refresh();
      return;
    }
    confirmReset = false;
    ui.save.reset();
    ui.applySettings();
    ui.toast('Progress reset');
    ui.refresh();
    return;
  } else return;
  ui.save.persist();
  ui.applySettings();
  ui.refresh();
}

export function input(e, ui) {
  if (e.target.dataset.field === 'volume') {
    ui.save.data.settings.volume = Number(e.target.value);
    ui.save.persist();
    ui.applySettings();
  }
}

export function leave() {
  confirmReset = false;
}
