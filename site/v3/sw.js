const SHELL_CACHE = 'fishing-pwa-v3-shell-4';
const REPORT_CACHE = 'fishing-pwa-v3-report-1';
const REPORT_PATH = new URL('../api/report.json', self.location).pathname;
const SHELL = ['./', 'index.html', 'styles.css', 'theme.css', 'app.js', 'week.js?v=calc-20260930', '../shared/week.js?v=calc-20260930', '../v2/logic.js?v=calc-20260930', 'manifest.webmanifest', '../icons/fishing.svg', '../icons/icon-192.png', '../icons/icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => /^fishing-pwa-v3-(shell|report)-/.test(key) && ![SHELL_CACHE, REPORT_CACHE].includes(key)).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  if (url.pathname === REPORT_PATH) {
    event.respondWith((async () => {
      const cache = await caches.open(REPORT_CACHE);
      try {
        const fresh = await fetch(event.request);
        if (fresh.ok) await cache.put('report', fresh.clone());
        return fresh;
      } catch {
        const saved = await cache.match('report');
        if (!saved) return new Response(JSON.stringify({ok:false,error:'offline',message:'Offline and no saved report.'}), {status:503, headers:{'Content-Type':'application/json'}});
        const headers = new Headers(saved.headers); headers.set('X-Report-Cache', 'offline');
        return new Response(await saved.blob(), {status:saved.status, statusText:saved.statusText, headers});
      }
    })());
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(saved => saved || fetch(event.request)));
});
