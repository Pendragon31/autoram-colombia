/* global __ASSETS__ */
/* Generated after build. Only public, static app files are cached here. */
const APP_CACHE = 'autoram-app-__VERSION__';
const ASSETS = __ASSETS__;
const FONT_CACHE = 'autoram-map-fonts-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('autoram-app-') && key !== APP_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization') || /^\/(api|auth|rest|storage)\//.test(url.pathname) || url.pathname.endsWith('.pmtiles')) return;
  if (url.pathname.startsWith('/maps/fonts/')) {
    event.respondWith(caches.open(FONT_CACHE).then(async cache => (await cache.match(request)) || (await caches.match(request)) || fetch(request)));
    return;
  }
  if (request.mode === 'navigate' && (url.pathname === '/' || /^\/mapas(?:\.html|\/)?$/.test(url.pathname))) {
    event.respondWith((async () => {
      try {
        // Do not cache responses from signed-in sessions: the offline fallback
        // is the public shell installed at build time, never runtime HTML.
        return await fetch(request, { signal: AbortSignal.timeout(4000) });
      } catch {
        const cache = await caches.open(APP_CACHE);
        return (await cache.match(url.pathname.startsWith('/mapas') ? '/mapas' : '/')) || Response.error();
      }
    })());
    return;
  }
  if (!url.search && ASSETS.includes(url.pathname)) event.respondWith(caches.open(APP_CACHE).then(async cache => (await cache.match(request)) || fetch(request)));
});
