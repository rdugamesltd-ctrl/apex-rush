// Merges keyboard and on-screen touch controls into one control state.
import { touchState } from '../ui/touchControls.js';

const KEYMAP = {
  ArrowUp: 'gas',
  KeyW: 'gas',
  ArrowDown: 'brake',
  KeyS: 'brake',
  Space: 'handbrake',
  ShiftLeft: 'handbrake',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

export class PlayerInput {
  constructor({ onPause, onRespawn } = {}) {
    this.keys = { gas: false, brake: false, handbrake: false, left: false, right: false };
    this.onDown = (e) => {
      const k = KEYMAP[e.code];
      if (k) {
        this.keys[k] = true;
        e.preventDefault();
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        onPause?.();
      } else if (e.code === 'KeyR' && !e.repeat) {
        onRespawn?.();
      }
    };
    this.onUp = (e) => {
      const k = KEYMAP[e.code];
      if (k) this.keys[k] = false;
    };
    this.onBlur = () => {
      for (const k in this.keys) this.keys[k] = false;
    };
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  read() {
    const k = this.keys;
    const t = touchState;
    return {
      throttle: k.gas || t.gas ? 1 : 0,
      brake: k.brake || t.brake ? 1 : 0,
      handbrake: k.handbrake, // keyboard only (Space / Shift); touch has gas and brake
      steer: (k.right || t.right ? 1 : 0) - (k.left || t.left ? 1 : 0),
    };
  }

  destroy() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
