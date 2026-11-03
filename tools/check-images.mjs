// Fails if an image in assets/images/ was added or changed after the last
// `npm run optimize` (the game would keep showing the old version).
// Compares file contents (sha256), not dates: git checkouts (e.g. on Vercel) reset dates.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ASSETS, IMAGE_DIR } from '../src/assets/manifest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const pngHash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);

// -> list of problems, empty when everything is up to date
export async function staleImages() {
  const { BUILT, BUILT_DIR } = await import(`${pathToFileURL(path.join(root, 'src/assets/built.js')).href}?t=${Date.now()}`);
  const stale = [];
  for (const a of ASSETS) {
    const file = path.join(root, IMAGE_DIR, `${a.key}.png`);
    const b = BUILT[a.key];
    if (!fs.existsSync(file)) {
      if (b) stale.push(`${a.key}: PNG removed`);
      continue;
    }
    if (!b) stale.push(`${a.key}: new image`);
    else if (!fs.existsSync(path.join(root, BUILT_DIR, b.file))) stale.push(`${a.key}: ${b.file} missing`);
    else if (b.src.sha ? b.src.sha !== pngHash(file) : b.src.size !== fs.statSync(file).size) stale.push(`${a.key}: changed`);
  }
  return stale;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stale = await staleImages();
  if (stale.length) {
    console.log(`images out of date (run \`npm run optimize\`):\n  ${stale.join('\n  ')}`);
    process.exit(1);
  }
  console.log('images: all optimized and up to date');
}
