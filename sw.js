// Service worker: makes Apex Rush installable and playable offline.
// Network first (so updates show up straight away), the cache as the fallback
// when offline or when the network is too slow. Every file the game loads is
// cached on first use; the shell is cached at install.
const CACHE = 'apex-rush-v1';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'lib/phaser.min.js',
  'src/main.js',
  'manifest.webmanifest',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/fonts/exo2-latin.woff2',
  'assets/fonts/exo2-latin-italic.woff2',
];
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
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
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
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
