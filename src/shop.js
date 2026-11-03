// Shop catalog: everything that is bought with coins besides car upgrades.
// Purchases are stored as ids in save.data.owned ('perk:booster', 'paint:#8a4dff',
// 'smoke:cyan'); tracks keep their own list in save.data.unlocked.
import { MAX_DRIFT_BONUS, PLAYER_COLORS } from './config.js';
import { TRACK_DEFS, isUnlocked, trackPrice } from './game/tracks/index.js';

export const PERKS = [
  { id: 'booster', name: 'Coin Booster', desc: '+50% coins from every race', price: 5000, glyph: 'coins' },
  { id: 'grid', name: 'Full Grid', desc: 'Race against 11 rivals for bigger rewards', price: 1200, glyph: 'grid' },
  { id: 'endurance', name: 'Endurance', desc: '5-lap races that pay 1.5× coins', price: 900, glyph: 'laps' },
  { id: 'drift', name: 'Drift King', desc: 'Drift bonus cap 150 → 400 coins', price: 2000, glyph: 'drift' },
  { id: 'mixer', name: 'Paint Mixer', desc: 'Mix any custom colour in the garage', price: 1500, glyph: 'mixer' },
];

export const DRIFT_KING_CAP = 400;

// The first six paints are free, the rest are sold one by one.
const FREE_PAINTS = ['#e63946', '#ff7a1a', '#ffd31a', '#3a7bff', '#ffffff', '#4a4a58'];
export const PAINT_PRICE = 250;

export const SMOKES = [
  { id: 'white', name: 'Classic', color: '#e8ecf4', price: 0 },
  { id: 'orange', name: 'Blaze', color: '#ff7a1a', price: 400 },
  { id: 'gold', name: 'Gold', color: '#ffc531', price: 400 },
  { id: 'cyan', name: 'Ice', color: '#2ee6ff', price: 400 },
  { id: 'pink', name: 'Neon Pink', color: '#ff4fb3', price: 400 },
  { id: 'lime', name: 'Toxic', color: '#9dff3a', price: 400 },
  { id: 'violet', name: 'Violet', color: '#9b6bff', price: 600 },
];

export const paintPrice = (c) => (FREE_PAINTS.includes(c.toLowerCase()) ? 0 : PAINT_PRICE);
export const smokeDef = (id) => SMOKES.find((s) => s.id === id) || SMOKES[0];

// Price of any shop id, or null for unknown ids.
export function priceOf(id) {
  const [kind, key] = id.split(':');
  if (kind === 'track') {
    const def = TRACK_DEFS.find((d) => d.id === key);
    return def ? trackPrice(def) : null;
  }
  if (kind === 'perk') return PERKS.find((p) => p.id === key)?.price ?? null;
  if (kind === 'paint') return PLAYER_COLORS.some((c) => c.toLowerCase() === key) ? paintPrice(key) : null;
  if (kind === 'smoke') return SMOKES.find((s) => s.id === key)?.price ?? null;
  return null;
}

export function owns(sd, id) {
  const [kind, key] = id.split(':');
  if (kind === 'track') {
    const def = TRACK_DEFS.find((d) => d.id === key);
    return !!def && isUnlocked(def, sd);
  }
  return priceOf(id) === 0 || sd.owned.includes(id);
}

// Spend coins on an item. Returns 'ok', 'owned', 'poor' or 'unknown'.
export function buy(sd, id) {
  const price = priceOf(id);
  if (price === null) return 'unknown';
  if (owns(sd, id)) return 'owned';
  if (sd.coins < price) return 'poor';
  sd.coins -= price;
  if (id.startsWith('track:')) sd.unlocked.push(id.slice(6));
  else sd.owned.push(id);
  return 'ok';
}

// Perk effects consumed by the race reward.
export function perksOf(sd) {
  return {
    booster: owns(sd, 'perk:booster'),
    driftCap: owns(sd, 'perk:drift') ? DRIFT_KING_CAP : MAX_DRIFT_BONUS,
  };
}

// Colour of the player's tyre smoke, or null for the standard smoke.
export function playerSmoke(sd) {
  const s = smokeDef(sd.car.smoke);
  return s.price && owns(sd, `smoke:${s.id}`) ? s.color : null;
}

// Race options that need a perk.
export const lapsOpen = (sd, laps) => laps < 5 || owns(sd, 'perk:endurance');
export const gridOpen = (sd, n) => n < 11 || owns(sd, 'perk:grid');
