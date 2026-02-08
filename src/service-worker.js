/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE_NAME = `whatmodels-${version}`;

/**
 * All assets to pre-cache: the built app chunks + static files.
 * This gives full offline support since the site has no runtime API calls.
 */
const ASSETS = [...build, ...files];

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

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Cache-first for hashed build assets (immutable), network-first for HTML
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Cache successful responses for future offline use
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback: try to return the cached root page for navigation
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
    })
  );
});
