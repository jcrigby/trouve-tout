const CACHE_NAME = 'trouve-tout-v30';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/data/inventory.json',
  '/data/photosets.json',
  '/manifest.json',
  '/images/1a.jpg',
  '/images/1b.jpg',
  '/images/2a.jpg',
  '/images/2b.jpg',
  '/images/3a.jpg',
  '/images/3b.jpg',
  '/images/3c.jpg',
  '/images/3d.jpg',
  '/images/3e.jpg',
  '/images/4a.jpg',
  '/images/4b.jpg'
];

// Install - cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
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

// Fetch - network first for data, stale-while-revalidate for assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network first for data files (always get fresh data if online)
  if (url.pathname.endsWith('inventory.json') || url.pathname.endsWith('photosets.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Stale-while-revalidate for other assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
      return cached || fetchPromise;
    })
  );
});
