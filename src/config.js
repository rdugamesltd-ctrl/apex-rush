// Central game configuration. Rename the game here.
export const GAME_TITLE = 'Apex Rush';
export const VERSION = '1.0.0';
export const SAVE_KEY = 'apexrush.save.v1';

export const PHYSICS_DT = 1 / 60;
export const PX_TO_KMH = 0.32;
export const KMH_TO_MPH = 0.621371;

// Car size in world pixels (sprite height = length, width follows the image aspect).
export const CAR_LENGTH = 96;
export const CAR_RADIUS = 24; // each car uses two collision circles of this radius

export const BASE_STATS = {
  topSpeed: 860, // px/s  (~275 km/h)
  accel: 330, // px/s^2
  brake: 1000, // px/s^2
  turnRate: 2.5, // rad/s, max yaw rate at low speed
  aLat: 560, // px/s^2, lateral grip limit
  grip: 9, // lateral slip decay per second
  aero: 0, // extra lateral grip at top speed (fraction)
};

export const UPGRADES = [
  { id: 'engine', name: 'Engine', desc: 'Higher top speed', icon: 'icon_engine' },
  { id: 'turbo', name: 'Turbo', desc: 'Faster acceleration', icon: 'icon_turbo' },
  { id: 'tires', name: 'Tyres', desc: 'More grip in corners', icon: 'icon_tires' },
  { id: 'brakes', name: 'Brakes', desc: 'Brake later and harder', icon: 'icon_brakes' },
  { id: 'aero', name: 'Aero', desc: 'Faster high-speed corners', icon: 'icon_aero' },
];
export const MAX_LEVEL = 5;
export const UPGRADE_COSTS = [300, 700, 1300, 2200, 3500];

export function computeStats(lv) {
  const b = BASE_STATS;
  return {
    topSpeed: b.topSpeed * (1 + 0.045 * lv.engine),
    accel: b.accel * (1 + 0.09 * lv.turbo),
    brake: b.brake * (1 + 0.12 * lv.brakes),
    turnRate: b.turnRate * (1 + 0.03 * lv.tires),
    aLat: b.aLat * (1 + 0.07 * lv.tires),
    grip: b.grip * (1 + 0.08 * lv.tires),
    aero: 0.07 * lv.aero,
  };
}

export const PLAYER_COLORS = [
  '#e63946', '#ff7a1a', '#ffd31a', '#7ed957', '#18b26b', '#00c2d6',
  '#3a7bff', '#1d3fbf', '#8a4dff', '#e83a8e', '#ffffff', '#4a4a58',
];

export const AI_COLORS = [
  '#3a7bff', '#ff8a1f', '#18b26b', '#ffd31a', '#e83a8e', '#8a4dff',
  '#00c2d6', '#f2f2f2', '#c0392b', '#a5e635', '#7a8a99', '#1d3fbf', '#ff5c8a',
];

export const AI_DRIVERS = [
  'Jet Navarro', 'Kai Brenner', 'Sofia Marchetti', 'Leo Valtari', 'Nina Kowal',
  'Ravi Menon', 'Emma Duval', 'Tomas Reyes', 'Aiko Tanaka', 'Finn Halvorsen',
  'Zara Okafor', 'Milo Petrov', 'Ines Cardoso',
];

// Every track has one fixed difficulty. aiLevel = rivals' upgrade level (0-5),
// trackPrice = what a track of this difficulty costs unless its def sets `price`.
export const DIFFICULTIES = {
  easy: { label: 'Easy', skill: 0.86, aiLevel: 0, reward: 0.75, rubber: 1, trackPrice: 800 },
  medium: { label: 'Medium', skill: 0.94, aiLevel: 1.4, reward: 1, rubber: 0.5, trackPrice: 1500 },
  hard: { label: 'Hard', skill: 0.99, aiLevel: 3, reward: 1.5, rubber: 0, trackPrice: 3500 },
  insane: { label: 'Insane', skill: 1.02, aiLevel: 4.6, reward: 2.2, rubber: 0, trackPrice: 7000 },
};
export const LAP_OPTIONS = [1, 3, 5];
export const LAP_REWARD = { 1: 0.5, 3: 1, 5: 1.5 };
export const OPPONENT_OPTIONS = [3, 5, 7, 11];

export const POSITION_REWARDS = [500, 380, 300, 240, 200, 170, 140, 115, 95, 75, 55, 40];
export const OVERTAKE_BONUS = 25;
export const MAX_OVERTAKE_BONUS = 12;
export const DRIFT_POINTS_PER_COIN = 60;
export const MAX_DRIFT_BONUS = 150;

export const BOOSTER_BONUS = 0.5; // Coin Booster perk: +50% of the race total

// perks: { booster, driftCap } from the shop (see shop.js perksOf)
export function raceReward({ position, cars, difficulty, laps, overtakes, drift = 0 }, perks = {}) {
  const base = POSITION_REWARDS[Math.min(position - 1, POSITION_REWARDS.length - 1)];
  const field = 0.6 + (0.4 * (cars - 1)) / 11;
  const mult = DIFFICULTIES[difficulty].reward * (LAP_REWARD[laps] ?? 1) * field;
  const placeCoins = Math.round((base * mult) / 5) * 5;
  const overtakeCoins = Math.min(overtakes, MAX_OVERTAKE_BONUS) * OVERTAKE_BONUS;
  const driftCoins = Math.min(perks.driftCap ?? MAX_DRIFT_BONUS, Math.floor(drift / DRIFT_POINTS_PER_COIN / 5) * 5);
  const sum = placeCoins + overtakeCoins + driftCoins;
  const boostCoins = perks.booster ? Math.round((sum * BOOSTER_BONUS) / 5) * 5 : 0;
  return { placeCoins, overtakeCoins, driftCoins, boostCoins, total: sum + boostCoins };
}

// Gear ratios as fractions of top speed, used for the HUD gear and engine pitch.
export const GEARS = [0.17, 0.3, 0.42, 0.54, 0.65, 0.76, 0.88, 1.0];

export function gearInfo(speed, topSpeed) {
  const r = Math.max(0, speed) / topSpeed;
  let g = GEARS.findIndex((f) => r <= f);
  if (g < 0) g = GEARS.length - 1;
  const lo = g === 0 ? 0 : GEARS[g - 1];
  const t = Math.min(1, (r - lo) / (GEARS[g] - lo));
  return { gear: g + 1, rpm: (g === 0 ? 0.2 : 0.45) + t * (g === 0 ? 0.8 : 0.55) };
}
