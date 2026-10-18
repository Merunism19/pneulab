/* PneuLab offline copy.
   When the page is served from a web address, this worker keeps a copy of every file, so the workshop
   still opens with no connection. Online it always asks the network first, so a new version shows at once. */
const CACHE = 'pneulab-2';
const FILES = ['./', 'index.html', 'view3d.html', 'manifest.webmanifest', 'css/style.css',
  'js/components.js', 'js/engine.js', 'js/lessons.js', 'js/practice.js', 'js/app.js', 'js/gl3d.js', 'js/view3d.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, {cache: 'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const rq = e.request, url = new URL(rq.url);
  if (rq.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(rq, {cache: 'no-cache'}).then(rs => {
      if (rs.ok) { const copy = rs.clone(); caches.open(CACHE).then(c => c.put(new Request(url.origin + url.pathname), copy)); }     // stored without the ?v= tag
      return rs;
    }).catch(() => caches.match(new Request(url.origin + url.pathname)).then(hit => hit || (rq.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
