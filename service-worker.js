/* ================================================================
   SERVICE WORKER — Bontang Akuatik
   Strategi cache:
   - Aset statis (HTML/CSS/JS/icons) → Cache First + revalidate
   - Request lain (HTML pages)      → Network First, fallback cache
   - Offline fallback ke index.html
   ================================================================ */

const VERSION       = 'v1.2.0'; // dinaikkan saat migrasi ke Supabase agar cache lama (berisi crud-api.js versi Apps Script) tidak terus dipakai pengguna existing
const STATIC_CACHE  = `akuatik-static-${VERSION}`;
const RUNTIME_CACHE = `akuatik-runtime-${VERSION}`;

/* Daftar aset yang dipra-cache saat install. Sesuaikan dengan struktur file Anda. */
const PRECACHE_URLS = [
  './',
  './index.html',
  './global.css',
  './home.css',
  './pwa.css',
  './pwa.js',
  '/manifest.json',
  './assets/images/logo.png',
  './assets/images/logo.webp',
  '/assets/images/logo.png',
  '/assets/images/logo.webp',
];

/* ============== INSTALL ============== */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Precache failed:', err))
  );
});

/* ============== ACTIVATE ============== */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ============== MESSAGE (skip waiting trigger dari pwa.js) ============== */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ============== FETCH ============== */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Skip non-GET dan request lintas-origin yang tidak perlu di-cache
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigasi (HTML pages) → Network First
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Aset statis → Cache First + background revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});