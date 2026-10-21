const CACHE = 'shorts-studio-v2';
const SHELL = '/';
const PRECACHE = [SHELL, '/icons/icon.svg'];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
);
self.addEventListener('activate', e =>
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()))
);
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API responses (auth, uploads, analytics) must always come from the network.
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    // Network-first so deploys show up immediately; the cached shell is only an offline fallback.
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok && url.pathname === SHELL) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(SHELL, clone));
        }
        return res;
      }).catch(() => caches.match(req).then(cached => cached || caches.match(SHELL)))
    );
    return;
  }

  // Hashed build assets and icons are immutable per URL, so cache-first is safe.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }))
    );
  }
  // Everything else falls through to the network untouched.
});
