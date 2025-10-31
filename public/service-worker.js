const STATIC_CACHE = 'hookd-static-v1';
const TILE_CACHE = 'hookd-tiles-v1';
const API_CACHE = 'hookd-api-v1';
const PRECACHE_URLS = ['/', '/logo.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, TILE_CACHE, API_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ).then(() => self.clients.claim())
    )
  );
});

const TILE_HOST_PATTERNS = [
  'tile.openstreetmap.',
  'api.maptiler.com',
  'tiles.openseamap.org',
];

const FORECAST_PATH_PATTERN = /\/api\/(forecasts|open-meteo)/;
const CATCHES_PATH_PATTERN = /\/api\/catches/;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  const isNavigationRequest = request.mode === 'navigate';
  if (isNavigationRequest) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/')))
    );
    return;
  }

  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        return response;
      }))
    );
    return;
  }

  if (TILE_HOST_PATTERNS.some((pattern) => url.hostname.includes(pattern))) {
    event.respondWith(
      caches.open(TILE_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request)
            .then((response) => {
              if (response.ok) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached ?? networkFetch;
        })
      )
    );
    return;
  }

  if (FORECAST_PATH_PATTERN.test(url.pathname) || CATCHES_PATH_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) =>
        fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cache.match(request))
      )
    );
    return;
  }
});
