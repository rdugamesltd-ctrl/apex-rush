// Headless race simulation to tune physics/AI. Usage: node tools/sim.mjs [trackId|all] [difficulty|track] [upgradeLevel]
// 'track' (default) races each track at its own difficulty.
import { TRACK_DEFS, getTrack } from '../src/game/tracks/index.js';
import { RaceManager } from '../src/game/RaceManager.js';
import { PHYSICS_DT, PX_TO_KMH } from '../src/config.js';

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : null;
const diffArg = process.argv[3] && process.argv[3] !== 'track' ? process.argv[3] : undefined;
const lvl = Number(process.argv[4] ?? 0);
let failures = 0;

for (const def of TRACK_DEFS) {
  if (only && def.id !== only) continue;
  const track = getTrack(def.id);
  const stats = { impacts: 0, respawns: 0, bumps: 0, maxSpeed: 0 };
  let results = null;
  const rm = new RaceManager(
    track,
    {
      mode: 'race', laps: 2, opponents: 7, difficulty: diffArg, autopilot: true, seed: 42,
      player: { name: 'Bot', color: '#e63946', upgrades: { engine: lvl, turbo: lvl, tires: lvl, brakes: lvl, aero: lvl } },
    },
    {
      onImpact: (car, v) => { if (v > 150) stats.impacts++; },
      onRespawn: () => stats.respawns++,
      onBump: () => stats.bumps++,
      onResults: (r) => (results = r),
    }
  );
  const ctl = { throttle: 0, brake: 0, steer: 0 };
  let t = 0;
  while (!results && t < 400) {
    rm.update(PHYSICS_DT, ctl);
    for (const c of rm.cars) stats.maxSpeed = Math.max(stats.maxSpeed, c.speed);
    t += PHYSICS_DT;
  }
  if (!results) {
    console.log(`${def.id}: race did not finish in 400s! player dist ${Math.round(rm.player.dist)} / ${Math.round(track.length * 2)}`);
    failures++;
    continue;
  }
  const lapTimes = rm.cars.filter((c) => c.bestLap).map((c) => c.bestLap);
  console.log(
    `${def.id.padEnd(7)} ${rm.difficulty.padEnd(6)} winner ${results.rows[0].time.toFixed(1)}s  player P${results.position}/${results.cars} ` +
      `bestLap ${Math.min(...lapTimes).toFixed(2)}-${Math.max(...lapTimes).toFixed(2)}s  impacts>150 ${stats.impacts}  ` +
      `respawns ${stats.respawns}  bumps ${stats.bumps}  vmax ${Math.round(stats.maxSpeed * PX_TO_KMH)}km/h`
  );
  if (stats.respawns > 3) failures++;
}
process.exit(failures ? 1 : 0);
