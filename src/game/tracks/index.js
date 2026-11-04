import { Track } from '../Track.js';
import { DIFFICULTIES } from '../../config.js';
import harbor from './harbor.js';
import maple from './maple.js';
import coral from './coral.js';
import pine from './pine.js';
import savanna from './savanna.js';
import frost from './frost.js';
import docks from './docks.js';
import dunes from './dunes.js';
import canyon from './canyon.js';
import glacier from './glacier.js';
import riviera from './riviera.js';
import metro from './metro.js';
import volcano from './volcano.js';
import containers from './containers.js';
import wildwood from './wildwood.js';

// In unlock order: easiest first, grouped by difficulty.
export const TRACK_DEFS = [
  harbor, maple, coral,
  pine, savanna, frost, docks,
  dunes, canyon, glacier, riviera,
  metro, volcano, containers, wildwood,
];

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
