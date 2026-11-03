// Service worker: makes Apex Rush installable, playable offline, and fast on
// return visits.
// - Files with a content hash in their name (e.g. car.e02d76fa.webp, and every
//   file of a `npm run build`) never change: served straight from the cache.
// - Everything else is network first (so updates show up straight away), with
//   the cache as the fallback when offline or when the network is too slow.
// `npm run build` replaces CACHE and PRECACHE in dist/sw.js.
const CACHE = 'apex-rush-v2';
const PRECACHE = ['./', 'index.html', 'css/style.css', 'lib/phaser.min.js', 'src/main.js', 'manifest.webmanifest'];
const NETWORK_TIMEOUT = 4000;
const HASHED = /\.[0-9a-f]{8}\.[a-z0-9]+$/;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {}) // a missing file must not block the install
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (HASHED.test(url.pathname)) {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }
      const network = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      });
      const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (!cached) return network;
      // slow or offline: answer from the cache, the fetch still refreshes it
      const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT));
      return Promise.race([network.catch(() => cached), timeout]);
    })()
  );
});
