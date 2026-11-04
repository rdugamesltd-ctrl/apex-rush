// Pre-race controls briefing: a centred card that holds the start lights until
// the player presses UNDERSTAND (or Enter).
import { ICON } from './util.js';

const KEYS = [
  [['↑', 'W'], 'Gas'],
  [['↓', 'S'], 'Brake / reverse'],
  [['←', '→'], 'Steer'],
  [['Space'], 'Handbrake (drift)'],
  [['↑', '↑'], 'Re-tap gas while steering: drift'],
  [['↑'], 'Gas as the lights go out: perfect start'],
  [['R'], 'Reset car'],
  [['Esc'], 'Pause'],
];

const TOUCH = [
  ['<span class="brief-pedal gas">GAS</span>', 'Accelerate'],
  ['<span class="brief-pedal">BRAKE</span>', 'Brake / reverse'],
  [`<span class="brief-icon">${ICON.left}</span><span class="brief-icon">${ICON.right}</span>`, 'Steer'],
  ['<span class="brief-pedal gas">GAS</span><span class="brief-pedal gas">GAS</span>', 'Re-tap gas while steering: drift'],
  ['<span class="brief-pedal gas">GAS</span>', 'Gas as the lights go out: perfect start'],
  [`<span class="brief-icon round">${ICON.restart}</span>`, 'Reset car'],
  [`<span class="brief-icon round">${ICON.pause}</span>`, 'Pause'],
];

const row = (keys, label, i) => `<li style="--i:${i}"><span class="brief-keys">${keys}</span><b>${label}</b></li>`;

export function createBriefing(parent) {
  const el = document.createElement('div');
  el.id = 'brief';
  el.className = 'layer';
  el.hidden = true;
  parent.appendChild(el);

  let onOk = null;
  let closing = false;

  const onKey = (e) => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      briefing.close();
    }
  };

  const briefing = {
    show({ touch, onDone }) {
      onOk = onDone;
      closing = false;
      const rows = touch
        ? TOUCH.map(([k, l], i) => row(k, l, i))
        : KEYS.map(([k, l], i) => row(k.map((c) => `<kbd>${c}</kbd>`).join(''), l, i));
      el.innerHTML = `
        <div class="brief-card">
          <div class="brief-tag">Before you race</div>
          <h2>How to drive</h2>
          <ul class="brief-list">${rows.join('')}</ul>
          <button class="btn btn-primary btn-xl brief-ok" data-act="brief-ok" style="--i:${rows.length}"><span>${ICON.check} Understand</span></button>
          ${touch ? '' : '<div class="brief-foot">or press <kbd>Enter</kbd></div>'}
        </div>`;
      el.className = 'layer';
      el.hidden = false;
      window.addEventListener('keydown', onKey);
    },
    close() {
      if (el.hidden || closing) return;
      closing = true;
      window.removeEventListener('keydown', onKey);
      el.classList.add('out');
      setTimeout(() => {
        if (!closing) return; // hidden meanwhile (left the race)
        briefing.hide();
        const cb = onOk;
        onOk = null;
        cb?.();
      }, 220);
    },
    hide() {
      window.removeEventListener('keydown', onKey);
      el.hidden = true;
      el.innerHTML = '';
      closing = false;
    },
  };
  return briefing;
}
