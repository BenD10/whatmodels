/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE_NAME = `whatmodels-${version}`;

/**
 * All assets to pre-cache: the built app chunks + static files.
 * This gives full offline support since the site has no runtime API calls.
 */
const ASSETS = [...build, ...files.filter((f) => !f.split('/').pop().startsWith('.'))]; // skip .nojekyll etc.

// Hashed build output and static files never change within a version
const IMMUTABLE = new Set(ASSETS);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Don't cache analytics or external requests
  if (url.origin !== self.location.origin) return;

  // Cache-first for hashed build assets and static files
  if (IMMUTABLE.has(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
    return;
  }

  // Network-first for pages and everything else, so a new deploy shows up on
  // the next visit (and its HTML never references chunks that were deleted).
  // The cached copy is only used offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // Offline fallback for an uncached page: the cached root page
        if (event.request.mode === 'navigate') return caches.match('/');
        return Response.error();
      })
  );
});
