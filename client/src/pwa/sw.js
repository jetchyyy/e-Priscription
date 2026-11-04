/* E-Prescription service worker. Emitted to /sw.js at build time by vite.config.js, which stamps the
 * cache name with a build id so every deploy installs a fresh worker and drops the previous caches.
 *
 * It keeps only the app shell and Vite's hashed /assets files. Supabase calls go to another origin and are never
 * touched, so no prescription or patient data is ever stored here. */
const CACHE = 'eprx-__BUILD_ID__';
const SHELL = '/';
const PRECACHE = [SHELL, '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always try the network so a deploy shows up at once. Offline, fall back to the saved app shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(SHELL, copy));
          }
          return res;
        })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }

  // Hashed build files never change, so the saved copy is always right.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })),
    );
  }
});
