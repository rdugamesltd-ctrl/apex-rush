// Production build: writes dist/, the folder to upload to a web server.
// - all game code bundled and minified into one file (one request, not ~50)
// - CSS minified; Phaser, code and CSS get content-hashed names, so browsers
//   and the service worker can cache them forever and still see every update
// - only the optimized WebP art is copied (not the multi-MB source PNGs)
// - service worker with the exact file list, plus cache/compression rules for
//   Netlify / Cloudflare Pages (_headers) and Apache (.htaccess)
// Usage: npm run build
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const rel = (...p) => path.join(root, ...p);
const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
const write = (file, data) => {
  const out = path.join(dist, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, data);
  return file;
};

// 1. art: re-run the optimizer for any changed PNG (needs Chrome / Edge)
try {
  execFileSync(process.execPath, [rel('tools/optimize-images.mjs')], { stdio: ['ignore', 'ignore', 'inherit'] });
} catch {
  console.warn('! Could not run the image optimizer; using the WebPs from the last `npm run optimize`.');
}
const { BUILT, BUILT_DIR } = await import(`file:///${rel('src/assets/built.js').replace(/\\/g, '/')}?t=${Date.now()}`);

fs.rmSync(dist, { recursive: true, force: true });
const files = [];

// 2. code
const js = await esbuild.build({
  entryPoints: [rel('src/main.js')],
  bundle: true,
  format: 'esm',
  target: ['es2022', 'safari15'],
  minify: true,
  legalComments: 'none',
  write: false,
});
const code = js.outputFiles[0].contents;
const jsFile = write(`game.${hash(code)}.js`, code);
files.push(jsFile);

// 3. styles (url()s stay relative to css/, where the file stays)
const cssSrc = fs.readFileSync(rel('css/style.css'), 'utf8');
const css = (await esbuild.transform(cssSrc, { loader: 'css', minify: true, target: ['safari15', 'chrome100'] })).code;
const cssFile = write(`css/style.${hash(css)}.css`, css);
files.push(cssFile);

// 4. Phaser
const phaser = fs.readFileSync(rel('lib/phaser.min.js'));
const phaserFile = write(`lib/phaser.${hash(phaser)}.min.js`, phaser);
files.push(phaserFile);

// 5. static files
const copy = (from, to = from) => {
  write(to, fs.readFileSync(rel(from)));
  files.push(to);
};
for (const f of fs.readdirSync(rel('assets/fonts'))) copy(`assets/fonts/${f}`);
for (const f of fs.readdirSync(rel('assets'))) if (/^icon.*\.(png|svg)$/.test(f)) copy(`assets/${f}`);
for (const b of Object.values(BUILT)) copy(`${BUILT_DIR}${b.file}`);
copy('manifest.webmanifest');

// 6. page
let html = fs.readFileSync(rel('index.html'), 'utf8');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`index.html: "${from}" not found`);
  html = html.split(from).join(to);
};
swap('<link rel="modulepreload" href="src/main.js">', `<link rel="modulepreload" href="${jsFile}">\n  <link rel="preload" href="${phaserFile}" as="script">`);
swap('<script type="module" src="src/main.js"></script>', `<script type="module" src="${jsFile}"></script>`);
swap('href="css/style.css"', `href="${cssFile}"`);
swap('src="lib/phaser.min.js"', `src="${phaserFile}"`);
html = html.replace(/\n\s*<!-- images:(start|end)[^>]*-->/g, '');
write('index.html', html);
files.push('index.html', './');

// 7. service worker: this build's cache name and file list
const buildId = hash(Buffer.from(files.join() + hash(code) + hash(css)));
let sw = fs.readFileSync(rel('sw.js'), 'utf8');
sw = sw
  .replace(/const CACHE = '[^']*';/, `const CACHE = 'apex-rush-${buildId}';`)
  .replace(/const PRECACHE = \[[^\]]*\];/, `const PRECACHE = ${JSON.stringify(files.filter((f) => !/icon-(512|maskable)/.test(f)))};`);
write('sw.js', sw);

// 8. hosting rules
write(
  '_headers',
  `# Netlify / Cloudflare Pages: hashed files never change
/*.js
  Cache-Control: public, max-age=31536000, immutable
/css/*
  Cache-Control: public, max-age=31536000, immutable
/lib/*
  Cache-Control: public, max-age=31536000, immutable
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
`
);
write(
  '.htaccess',
  `# Apache: compress text files, cache hashed files for a year
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript application/json application/manifest+json image/svg+xml
</IfModule>
<IfModule mod_mime.c>
  AddType application/manifest+json .webmanifest
  AddType image/webp .webp
  AddType font/woff2 .woff2
</IfModule>
<IfModule mod_headers.c>
  <FilesMatch "\\.[0-9a-f]{8}\\.(js|css|webp)$|\\.woff2$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "^(index\\.html|sw\\.js)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
`
);

// report
let total = 0;
let gz = 0;
const rows = [];
for (const f of files.filter((f) => f !== './')) {
  const buf = fs.readFileSync(path.join(dist, f));
  const z = /\.(js|css|html|svg|webmanifest|txt)$/.test(f) ? zlib.gzipSync(buf, { level: 9 }).length : buf.length;
  total += buf.length;
  gz += z;
  rows.push([f, buf.length, z]);
}
rows.sort((a, b) => b[2] - a[2]);
for (const [f, b, z] of rows.slice(0, 8)) console.log(`  ${f.padEnd(44)} ${(b / 1024).toFixed(0).padStart(6)} KB  (${(z / 1024).toFixed(0)} KB gzipped)`);
console.log(`\ndist/: ${files.length - 1} files, ${(total / 1048576).toFixed(2)} MB (${(gz / 1048576).toFixed(2)} MB with gzip). Upload the contents of dist/.`);
