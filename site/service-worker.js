const CACHE = 'flagler-fishing-shell-6';
const SHELL = ['./', 'index.html', 'style.css', 'main.js?v=catch-20260930b', 'v2/logic.js?v=catch-20260930b', 'shared/week.js?v=catch-20260930b', 'shared/catch.js?v=catch-20260930b', 'manifest.webmanifest', 'icons/fishing.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && (/^flagler-fishing-shell-/.test(k) || /^fishing-pwa-(shell|report)-/.test(k))).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// API data is handled by the app with explicit freshness and saved-data labels.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET' || u.pathname.includes('/api/')) return;
  e.respondWith(fetch(e.request, { cache: 'no-store' }).then(r => {
    if (r.ok) { const c = r.clone(); e.waitUntil(caches.open(CACHE).then(x => x.put(e.request, c))); }
    return r;
  }).catch(async () => {
    const saved = await caches.match(e.request);
    if (saved) return saved;
    // Never return HTML for a missing script, stylesheet or image.
    if (e.request.mode === 'navigate') return (await caches.match(new URL('index.html', self.registration.scope))) || Response.error();
    return Response.error();
  }));
});
