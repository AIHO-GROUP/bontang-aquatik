/* ================================================================
   SERVICE WORKER — Bontang Akuatik
   ================================================================
   VERSI 2 — dinaikkan bersamaan rilis besar (peran pengguna, periode
   pelatihan, jadwal otomatis). Menaikkan VERSION membuat seluruh cache
   lama dibuang saat activate, sehingga pengguna PWA yang sudah memasang
   aplikasi TIDAK terjebak memakai kode versi lama.

   Strategi cache — sengaja dibedakan per jenis berkas:
     • Navigasi & kode aplikasi (HTML/JS/CSS)
         -> NETWORK FIRST. Perbaikan business logic harus langsung
            sampai ke pengguna; cache hanya dipakai bila jaringan gagal.
     • Aset statis (gambar, font, ikon)
         -> CACHE FIRST + revalidasi latar belakang. Isinya jarang
            berubah dan inilah yang membuat aplikasi terasa instan.
     • Permintaan ke Supabase & CDN pihak ketiga
         -> TIDAK di-cache sama sekali; data harus selalu segar dan
            sudah punya lapisan cache sendiri di IndexedDB.
   ================================================================ */

const VERSION       = 'v2.1.3';
const STATIC_CACHE  = 'akuatik-static-' + VERSION;
const RUNTIME_CACHE = 'akuatik-runtime-' + VERSION;

/* Kerangka aplikasi yang dipra-cache saat install. */
const PRECACHE_URLS = [
  './',
  './index.html',
  './login.html',
  './manifest.json',
  './assets/css/global.css',
  './assets/css/navbar.css',
  './assets/css/components.css',
  './assets/css/components-v2.css',
  './assets/css/pwa.css',
  './assets/images/logo.png',
  './assets/images/logo.webp'
];

const CODE_EXT = /\.(?:js|css|html)$/i;
const ASSET_EXT = /\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf)$/i;

/* ============== INSTALL ============== */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      // addAll gagal total bila SATU berkas 404; cache satu per satu agar
      // instalasi tetap berhasil walau ada berkas yang belum ter-deploy.
      .then((cache) => Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Precache gagal:', err))
  );
});

/* ============== ACTIVATE ============== */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ============== MESSAGE ============== */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ============== FETCH ============== */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Permintaan VERIFIKASI KONEKSI (lib/net.js) tidak boleh disentuh sama
  // sekali: bila Service Worker sempat menjawabnya dari cache, verifikasi
  // akan menyimpulkan "masih terhubung" padahal jaringan mati — persis
  // kekeliruan yang sedang diperbaiki. Biarkan menembus ke jaringan.
  if (url.searchParams.has('_probe')) return;

  // Lintas-origin (Supabase, CDN) dibiarkan apa adanya — tidak di-cache.
  if (url.origin !== self.location.origin) return;

  // Navigasi halaman: jaringan dulu, cache sebagai jaring pengaman offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Kode aplikasi: jaringan dulu agar pembaruan logika langsung terpakai.
  if (CODE_EXT.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Aset statis: cache dulu, perbarui di latar belakang.
  if (ASSET_EXT.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Sisanya: coba jaringan, jatuh ke cache bila gagal.
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
