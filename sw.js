const CACHE_NAME = 'trouve-tout-v86';

// Relative paths: this app is served from a GitHub Pages subpath
// (/trouve-tout/), so root-absolute URLs like '/css/style.css' would
// resolve to the domain root and 404.
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install - cache app assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        // Cache each asset individually so one bad URL cannot abort the
        // whole install (cache.addAll rejects atomically).
        const results = await Promise.allSettled(
          ASSETS.map(asset => cache.add(new Request(asset, { cache: 'reload' })))
        );
        results.forEach((result, i) => {
          if (result.status === 'rejected') {
            console.warn('SW: failed to cache', ASSETS[i], result.reason);
          }
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch - stale-while-revalidate for app assets
// Data is stored in user's Google Drive, not static files
self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Navigations: fall back to the cached app shell when offline so the
  // PWA still opens without a network connection.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(request)) ||
                 (await cache.match('./index.html')) ||
                 (await cache.match('./'));
        })
    );
    return;
  }

  // Stale-while-revalidate for app assets
  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
