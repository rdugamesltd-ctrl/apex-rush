// Fails if an image in assets/images/ was added or changed after the last
// `npm run optimize` (the game would keep showing the old version).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS, IMAGE_DIR } from '../src/assets/manifest.js';
import { BUILT, BUILT_DIR } from '../src/assets/built.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stale = [];
for (const a of ASSETS) {
  const file = path.join(root, IMAGE_DIR, `${a.key}.png`);
  const b = BUILT[a.key];
  if (!fs.existsSync(file)) {
    if (b) stale.push(`${a.key}: PNG removed`);
    continue;
  }
  const st = fs.statSync(file);
  if (!b) stale.push(`${a.key}: new image`);
  else if (b.src.size !== st.size || b.src.mtime !== Math.round(st.mtimeMs)) stale.push(`${a.key}: changed`);
  else if (!fs.existsSync(path.join(root, BUILT_DIR, b.file))) stale.push(`${a.key}: ${b.file} missing`);
}
if (stale.length) {
  console.log(`images out of date (run \`npm run optimize\`):\n  ${stale.join('\n  ')}`);
  process.exit(1);
}
console.log(`images: ${Object.keys(BUILT).length} optimized, all up to date`);
