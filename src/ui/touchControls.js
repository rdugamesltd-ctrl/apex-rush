// On-screen pedals and steering pads. Each finger is tracked separately and can
// slide between pads (e.g. from left to right) without lifting.
import { ICON } from './util.js';

export const touchState = { left: false, right: false, gas: false, brake: false, handbrake: false };

const pointers = new Map(); // pointerId -> control name
let root = null;
let touchVibration = true;

function controlAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const pad = el && el.closest ? el.closest('[data-tc]') : null;
  return pad && root.contains(pad) ? pad.dataset.tc : null;
}

function refresh() {
  for (const k in touchState) touchState[k] = false;
  for (const c of pointers.values()) if (c) touchState[c] = true;
  root.querySelectorAll('[data-tc]').forEach((el) => el.classList.toggle('on', touchState[el.dataset.tc]));
}

export function createTouchControls(parent) {
  root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div class="tc-steer">
      <div class="tc-pad" data-tc="left">${ICON.left}</div>
      <div class="tc-pad" data-tc="right">${ICON.right}</div>
    </div>
    <div class="tc-pedals">
      <div class="tc-pedal drift" data-tc="handbrake"><b>DRIFT</b></div>
      <div class="tc-pedal brake" data-tc="brake"><span class="pedal-face"></span><b>BRAKE</b></div>
      <div class="tc-pedal gas" data-tc="gas"><span class="pedal-face"></span><b>GAS</b></div>
    </div>`;
  parent.appendChild(root);

  const down = (e) => {
    const c = controlAt(e.clientX, e.clientY);
    if (!c) return;
    e.preventDefault();
    pointers.set(e.pointerId, c);
    if (e.target.releasePointerCapture) {
      try {
        e.target.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
    }
    if (touchVibration && e.pointerType === 'touch') navigator.vibrate?.(8);
    refresh();
  };
  const move = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const c = controlAt(e.clientX, e.clientY);
    if (c !== pointers.get(e.pointerId)) {
      pointers.set(e.pointerId, c);
      refresh();
    }
  };
  const up = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    refresh();
  };
  root.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('blur', () => {
    pointers.clear();
    refresh();
  });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  return root;
}

export function setTouchOptions({ leftHanded, vibration }) {
  touchVibration = vibration;
  if (root) root.classList.toggle('left-handed', !!leftHanded);
}

export function resetTouch() {
  pointers.clear();
  if (root) refresh();
}
