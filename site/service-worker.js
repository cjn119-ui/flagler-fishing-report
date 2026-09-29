const CACHE = 'flagler-fishing-shell-1';
const SHELL = ['./', 'index.html', 'style.css', 'main.js', 'icons/icon-192.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
// Drop only the previous root app's caches; other versions manage their own.
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => /^fishing-pwa-(shell|report)-/.test(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Live data is never cached. Everything else is network-first so updates always show; cache is the offline fallback.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET' || u.pathname.includes('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});
