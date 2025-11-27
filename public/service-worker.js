const CACHE_VERSION = 'v2';
const STATIC_CACHE = `hookd-static-${CACHE_VERSION}`;
const TILE_CACHE = `hookd-tiles-${CACHE_VERSION}`;
const API_CACHE = `hookd-api-${CACHE_VERSION}`;

const CORE_ASSETS = [
  '/',
  '/offline.html',
  '/logo.svg',
  '/fishing-illustration.svg',
  '/fish_classifier_labels.json',
];

const TILE_HOST_PATTERNS = [
  'tile.openstreetmap.',
  'api.maptiler.com',
  'tiles.openseamap.org',
];

const FORECAST_PATH_PATTERN = /\/api\/(forecasts|open-meteo)/;
const CATCHES_PATH_PATTERN = /\/api\/catches/;
const API_PATH_PATTERN = /\/api\//;
const STATIC_ASSET_PATTERN = /^\/_next\/static\//;
const MEDIA_ASSET_PATTERN = /\.(?:png|jpe?g|gif|svg|webp|mp4|webm|mp3|woff2?)$/i;

async function getBuildAssets() {
  try {
    const buildIdResponse = await fetch('/_next/BUILD_ID');
    if (!buildIdResponse.ok) return [];
    const buildId = (await buildIdResponse.text()).trim();
    const manifestResponse = await fetch(`/_next/static/${buildId}/_buildManifest.js`);
    if (!manifestResponse.ok) return [];
    const manifestText = await manifestResponse.text();
    const match = manifestText.match(/self.__BUILD_MANIFEST\s*=\s*(\{.*\})\s*;self.__BUILD_MANIFEST_CB/);
    if (!match) return [];

    const manifest = JSON.parse(match[1]);
    const assetSet = new Set();

    Object.values(manifest).forEach((assets) => {
      if (!Array.isArray(assets)) return;
      assets.forEach((asset) => {
        if (typeof asset !== 'string') return;
        const normalized = asset.startsWith('/_next/') ? asset : `/_next/${asset}`;
        assetSet.add(normalized);
      });
    });

    assetSet.add(`/_next/static/${buildId}/_buildManifest.js`);
    assetSet.add(`/_next/static/${buildId}/_ssgManifest.js`);

    return Array.from(assetSet);
  } catch (error) {
    console.warn('Failed to load build manifest for precache', error);
    return [];
  }
}

async function precacheAssets() {
  const cache = await caches.open(STATIC_CACHE);
  const buildAssets = await getBuildAssets();
  const urls = [...CORE_ASSETS, ...buildAssets];

  await Promise.allSettled(urls.map((url) => cache.add(url)));
}

async function staleWhileRevalidate(cacheName, request, fallbackUrl) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    void networkFetch.catch(() => undefined);
    return cached;
  }

  const response = await networkFetch;
  if (response) return response;

  if (fallbackUrl) {
    const fallback = await cache.match(fallbackUrl);
    if (fallback) return fallback;
  }

  return Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheAssets()
      .catch((error) => console.warn('Precache failed', error))
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  const isNavigationRequest = request.mode === 'navigate';
  if (isNavigationRequest) {
    event.respondWith(staleWhileRevalidate(STATIC_CACHE, request, '/offline.html'));
    return;
  }

  if (STATIC_ASSET_PATTERN.test(url.pathname) || CORE_ASSETS.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(STATIC_CACHE, request));
    return;
  }

  if (MEDIA_ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(STATIC_CACHE, request));
    return;
  }

  if (TILE_HOST_PATTERNS.some((pattern) => url.hostname.includes(pattern))) {
    event.respondWith(staleWhileRevalidate(TILE_CACHE, request));
    return;
  }

  if (
    FORECAST_PATH_PATTERN.test(url.pathname) ||
    CATCHES_PATH_PATTERN.test(url.pathname) ||
    API_PATH_PATTERN.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(API_CACHE, request));
    return;
  }
});
