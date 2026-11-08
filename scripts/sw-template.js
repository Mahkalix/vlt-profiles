// Build injects a content hash and an explicit list of public, static assets.
const CACHE_NAME = 'vlt-public-__VERSION__';
const PUBLIC_ASSETS = __ASSETS__;
const ALLOWED = new Set(PUBLIC_ASSETS);
function cacheKey(request) {
  if (request.method !== 'GET' || request.headers.has('authorization')) return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  const key = ['/docs', '/docs/'].includes(url.pathname) ? '/docs.html' : url.pathname;
  return ALLOWED.has(key) ? key : null;
}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('vlt-public-') && key !== CACHE_NAME) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const key = cacheKey(event.request);
  // Never intercept the connector API, pairing redirects, downloads, or Riot requests.
  if (!key) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(key);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && !response.redirected && response.type !== 'opaque') await cache.put(key, response.clone());
    return response;
  })());
});
