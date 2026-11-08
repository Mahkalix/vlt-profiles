// Build injects a content hash and an explicit list of public, static assets.
const CACHE_NAME = 'vlt-public-6e487eb7dd9d7bff';
const PUBLIC_ASSETS = ["/","/docs.html","/app.js","/workspace-state.js","/i18n.js","/translations.js","/pwa.js","/style.css","/fonts.css","/icon.svg","/manifest.webmanifest","/assets/fonts/font-0.ttf","/assets/fonts/font-1.ttf","/assets/fonts/font-2.ttf","/assets/fonts/font-3.ttf","/assets/fonts/font-4.ttf","/assets/fonts/font-5.ttf","/assets/fonts/font-6.ttf","/assets/icons/icon-180.png","/assets/icons/icon-192.png","/assets/icons/icon-512.png","/assets/riot/ascent.png","/assets/riot/haven.png","/assets/riot/lotus.png","/assets/riot/sunset.png"];
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
