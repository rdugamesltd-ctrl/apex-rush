import { Track } from '../Track.js';
import { DIFFICULTIES } from '../../config.js';
import harbor from './harbor.js';
import pine from './pine.js';
import dunes from './dunes.js';
import metro from './metro.js';

export const TRACK_DEFS = [harbor, pine, dunes, metro];

const cache = new Map();

export function trackDef(id) {
  return TRACK_DEFS.find((t) => t.id === id) || TRACK_DEFS[0];
}

export function getTrack(id) {
  const def = trackDef(id);
  if (!cache.has(def.id)) cache.set(def.id, new Track(def));
  return cache.get(def.id);
}

// Tracks are paid by default: a def without `price` costs its difficulty's
// trackPrice. Set `price: 0` to make a track free.
export function trackPrice(def) {
  return def.price ?? DIFFICULTIES[def.difficulty].trackPrice;
}

export function isUnlocked(def, saveData) {
  return trackPrice(def) === 0 || saveData.unlocked.includes(def.id);
}
