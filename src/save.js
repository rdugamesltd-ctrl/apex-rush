import { SAVE_KEY, UPGRADES } from './config.js';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function defaults() {
  return {
    version: 2,
    coins: 300,
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    car: { color: '#e63946', number: 7, name: 'Player', smoke: 'white' },
    unlocked: [], // bought tracks (free tracks are always open)
    owned: [], // other shop purchases, see shop.js
    podiums: {}, // trackId -> best finishing position
    bestLaps: {}, // trackId -> seconds
    bestSplits: {}, // trackId -> { time, splits[] } of the best lap, for the live delta
    lastRace: { trackId: 'harbor', laps: 3, opponents: 7 },
    settings: {
      volume: 0.8,
      muted: false,
      units: 'kmh',
      quality: 'auto', // 'auto' (adapts to the device) | 'high' | 'low'
      leftHanded: false,
      vibration: true,
      racingLine: 'full', // 'full' | 'braking' | 'off'
      cornerHints: true,
      camera: 'fixed', // 'fixed' (north up) | 'follow' (rotates with the car)
      camMotion: reducedMotion() ? 'low' : 'full', // lean, rumble, impact jolts, start pan / finish orbit
    },
    stats: { races: 0, wins: 0, podiums: 0, coinsEarned: 0 },
    perf: { level: 0, low: false }, // what "Auto" graphics learnt about this device
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function merge(base, src) {
  const out = { ...base };
  for (const k of Object.keys(src)) {
    out[k] = isObj(base[k]) && isObj(src[k]) ? merge(base[k], src[k]) : src[k];
  }
  return out;
}

export const save = {
  data: defaults(),
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const old = JSON.parse(raw);
        this.data = merge(defaults(), old);
        // v2: "Auto" graphics became the default (v1 only had High / Low, defaulting to High)
        if ((old.version || 1) < 2 && this.data.settings.quality === 'high') this.data.settings.quality = 'auto';
        this.data.version = 2;
      }
      delete this.data.lastRace.difficulty; // difficulty now comes from the track
    } catch (e) {
      console.warn('Save data could not be read, starting fresh.', e);
      this.data = defaults();
    }
  },
  persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch (e) {
      /* storage full or blocked (private mode) - progress stays in memory */
    }
  },
  reset() {
    this.data = defaults();
    this.persist();
  },
};
