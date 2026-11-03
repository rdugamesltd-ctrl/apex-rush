// Minimal static file server for local play and testing (no dependencies).
// Compresses text files (gzip / brotli) and lets browsers cache content-hashed
// files forever, like a well-configured host would.
// Usage: node tools/server.mjs [port] [--dist]   (--dist serves the `npm run build` output)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};
const COMPRESS = /^(text\/|application\/(json|manifest\+json)|image\/svg)/;
const HASHED = /\.[0-9a-f]{8}\.[a-z0-9]+$/;

export function startServer(port = 8080, { dir = PROJECT } = {}) {
  const root = path.resolve(dir);
  const packed = new Map(); // file + encoding -> { mtime, data }
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const file = path.resolve(root, `.${urlPath}`);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const headers = {
        'Content-Type': type,
        'Cache-Control': HASHED.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
        Vary: 'Accept-Encoding',
      };
      const accept = req.headers['accept-encoding'] || '';
      const enc = !COMPRESS.test(type) ? null : /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
      fs.readFile(file, (err2, data) => {
        if (err2) {
          res.writeHead(500).end();
          return;
        }
        if (enc && data.length > 1024) {
          const key = `${file}|${enc}`;
          let hit = packed.get(key);
          if (!hit || hit.mtime !== st.mtimeMs) {
            const out =
              enc === 'br'
                ? zlib.brotliCompressSync(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } })
                : zlib.gzipSync(data, { level: 9 });
            hit = { mtime: st.mtimeMs, data: out };
            packed.set(key, hit);
          }
          headers['Content-Encoding'] = enc;
          data = hit.data;
        }
        res.writeHead(200, headers);
        res.end(req.method === 'HEAD' ? undefined : data);
      });
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a))) || 8080;
  const useDist = process.argv.includes('--dist');
  const dir = useDist ? path.join(PROJECT, 'dist') : PROJECT;
  if (useDist && !fs.existsSync(dir)) {
    console.error('No dist/ folder yet. Run `npm run build` first.');
    process.exit(1);
  }
  await startServer(port, { dir });
  console.log(`Apex Rush${useDist ? ' (dist build)' : ''} running at:\n  http://localhost:${port}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  http://${a.address}:${port}   (phones on the same Wi-Fi)`);
    }
  }
  console.log('Press Ctrl+C to stop.');
}
