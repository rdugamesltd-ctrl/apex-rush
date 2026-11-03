// Validates track geometry in Node: lengths, corner radii, barrier clearance, warnings.
// Usage: node tools/check-tracks.mjs
import { TRACK_DEFS, getTrack } from '../src/game/tracks/index.js';
import { BASE_STATS } from '../src/config.js';

let bad = 0;
for (const def of TRACK_DEFS) {
  const t = getTrack(def.id);
  let minR = Infinity;
  for (let i = 0; i < t.n; i++) minR = Math.min(minR, 1 / Math.max(1e-9, Math.abs(t.curvSmooth[i])));
  let minB = Infinity;
  for (let i = 0; i < t.n; i++) minB = Math.min(minB, t.bL[i], t.bR[i]);
  const prof = t.speedProfile(BASE_STATS.aLat, BASE_STATS.brake * 0.8, BASE_STATS.topSpeed);
  let time = 0;
  for (let i = 0; i < t.n; i++) time += t.lineDs[i] / Math.max(60, prof[i]);
  let maxLine = 0;
  for (let i = 0; i < t.n; i++) maxLine = Math.max(maxLine, Math.abs(t.line[i]));
  console.log(
    `${def.id.padEnd(7)} length ${Math.round(t.length)}px  samples ${t.n}  minRadius ${Math.round(minR)}  ` +
      `minBarrier ${Math.round(minB)} (hw ${t.hw})  corners ${t.corners.length}  idealLap ~${time.toFixed(1)}s  ` +
      `lineMax ${Math.round(maxLine)}  bounds ${Math.round(t.bounds.w)}x${Math.round(t.bounds.h)}`
  );
  for (const w of t.warnings) {
    console.log('   WARN', w);
    bad++;
  }
}
process.exit(bad ? 1 : 0);
