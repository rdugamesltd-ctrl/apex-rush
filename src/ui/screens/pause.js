import { ICON } from '../util.js';
import { LINE_OPTIONS, CAMERA_OPTIONS } from './settings.js';

const label = (opts, v) => (opts.find((o) => o[0] === v) || opts[0])[1];
const cycle = (opts, v) => opts[(opts.findIndex((o) => o[0] === v) + 1) % opts.length][0];

export function render(el, ui) {
  const s = ui.save.data.settings;
  el.innerHTML = `
    <div class="modal card">
      <h2>Paused</h2>
      <div class="modal-buttons">
        <button class="btn btn-primary btn-lg" data-act="resume"><span>${ICON.play} Resume</span></button>
        <button class="btn btn-lg" data-act="restart"><span>${ICON.restart} Restart</span></button>
        <button class="btn btn-lg" data-act="quit"><span>${ICON.home} Quit race</span></button>
      </div>
      <div class="modal-row">
        <button class="chip" data-act="line">Line: ${label(LINE_OPTIONS, s.racingLine)}</button>
        <button class="chip" data-act="hints">Hints: ${s.cornerHints ? 'On' : 'Off'}</button>
        <button class="chip" data-act="camera">Camera: ${label(CAMERA_OPTIONS, s.camera)}</button>
      </div>
      <div class="modal-row">
        <button class="chip" data-act="mute">Sound: ${s.muted ? 'Off' : 'On'}</button>
        ${ui.fullscreenButton('chip')}
      </div>
    </div>`;
}

export function action(act, t, ui) {
  const s = ui.save.data.settings;
  if (act === 'resume') ui.emit('ui:resume');
  else if (act === 'restart') ui.emit('ui:restart');
  else if (act === 'quit') ui.emit('ui:quit');
  else if (['mute', 'line', 'hints', 'camera'].includes(act)) {
    if (act === 'mute') s.muted = !s.muted;
    else if (act === 'line') s.racingLine = cycle(LINE_OPTIONS, s.racingLine);
    else if (act === 'hints') s.cornerHints = !s.cornerHints;
    else s.camera = cycle(CAMERA_OPTIONS, s.camera);
    ui.save.persist();
    ui.applySettings();
    ui.refresh();
  }
}
