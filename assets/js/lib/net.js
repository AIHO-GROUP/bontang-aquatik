/**
 * ===================================================================
 * lib/net.js — Sumber kebenaran tunggal status koneksi
 * ===================================================================
 * MASALAH YANG DISELESAIKAN
 * navigator.onLine hanya menjawab "apakah perangkat punya sambungan
 * jaringan", BUKAN "apakah server dapat dihubungi". Nilainya kerap
 * berubah menjadi false secara keliru saat berpindah Wi-Fi/seluler,
 * saat VPN aktif, saat layar baru bangun dari tidur, atau saat peramban
 * menyalahartikan perubahan antarmuka jaringan. Akibatnya aplikasi
 * memasang label "offline" padahal koneksi pengguna sehat, dan label
 * itu bertahan karena peristiwa 'online' penyeimbangnya tidak selalu
 * ikut terpicu.
 *
 * CARA KERJA
 * Status TIDAK PERNAH ditentukan oleh navigator.onLine sendirian.
 * Peristiwa jaringan hanya memicu VERIFIKASI: satu permintaan sangat
 * ringan ke server. Aplikasi baru dinyatakan tidak terhubung bila
 * permintaan itu benar-benar gagal.
 *
 * Tiga status yang dibedakan — pesan ke pengguna jadi jujur:
 *   'online'  : server terjangkau (status awal, optimistis).
 *   'server'  : internet perangkat hidup, tetapi server tidak menjawab.
 *   'offline' : perangkat memang tidak terhubung ke jaringan apa pun.
 *
 * Pemulihan tidak menunggu peristiwa 'online' peramban: setiap
 * permintaan aplikasi yang berhasil langsung memulihkan status, dan
 * selama status buruk verifikasi diulang dengan jeda menaik.
 *
 * Modul ini bersifat PENASIHAT — tidak memblokir operasi apa pun.
 * Bila gagal dimuat, seluruh pemanggilnya kembali ke perilaku lama.
 *
 * Dimuat SETELAH config.js dan SEBELUM supabase-client.js.
 */
const Net = (function (global) {
  'use strict';

  const ONLINE  = 'online';
  const SERVER  = 'server';
  const OFFLINE = 'offline';

  /* Ambang waktu (ms). Sengaja longgar: verifikasi harus murah dan tidak
     pernah menjadi beban di jaringan lambat. */
  const PROBE_TIMEOUT = 7000;   // batas satu kali verifikasi
  const FAIL_DEBOUNCE = 900;    // jeda setelah kegagalan sebelum verifikasi
  const BACKOFF       = [4000, 8000, 15000, 30000, 60000];

  /* Pola pesan kegagalan TRANSPORT lintas peramban (Chrome, Firefox,
     Safari, WebView Android). Dipakai karena Supabase membungkus
     kegagalan fetch menjadi objek error biasa tanpa kode HTTP. */
  const TRANSPORT_RE = new RegExp(
    'failed to fetch|networkerror|network error|network request failed|' +
    'load failed|connection (was )?(lost|closed|refused|reset)|' +
    'internet connection appears to be offline|err_internet|err_network|' +
    'err_connection|timed? ?out|aborted',
    'i'
  );

  let state       = ONLINE;   // optimistis: jangan pernah menuduh offline tanpa bukti
  let attempt     = 0;
  let probing     = null;
  let retryTimer  = null;
  let debounceId  = null;
  const listeners = [];

  /* ================= Utilitas internal ================= */

  function clearRetry() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  }

  function emit(prev) {
    listeners.forEach((fn) => { try { fn(state, prev); } catch (e) { /* abaikan */ } });
  }

  function setState(next) {
    if (next === state) return;
    const prev = state;
    state = next;
    emit(prev);
  }

  /** fetch dengan batas waktu; selalu resolve/reject, tidak menggantung. */
  function timedFetch(url, opts) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('fetch tidak tersedia'));
    if (typeof AbortController === 'undefined') return fetch(url, opts);
    const ac = new AbortController();
    const t  = setTimeout(() => ac.abort(), PROBE_TIMEOUT);
    const o  = Object.assign({}, opts, { signal: ac.signal });
    return fetch(url, o).then(
      (res) => { clearTimeout(t); return res; },
      (err) => { clearTimeout(t); throw err; }
    );
  }

  /**
   * Verifikasi ke server aplikasi (Supabase).
   * mode 'no-cors' dipakai SENGAJA: yang diuji hanyalah "apakah server
   * menjawab", bukan isi jawabannya. Dengan begitu balasan 401/404 pun
   * dihitung sebagai terhubung, dan kebijakan CORS tidak pernah membuat
   * verifikasi salah menyimpulkan offline.
   */
  function probeServer() {
    // CONFIG dideklarasikan dengan const di config.js sehingga TIDAK menempel
    // pada window — rujuk namanya langsung, bukan lewat objek global.
    const cfg  = (typeof CONFIG !== 'undefined') ? CONFIG : null;
    const base = (cfg && cfg.SUPABASE_URL) || '';
    if (!base) return Promise.resolve(false);
    const url = base.replace(/\/+$/, '') + '/rest/v1/?_probe=1&_=' + Date.now();
    return timedFetch(url, {
      method: 'GET', mode: 'no-cors', cache: 'no-store',
      credentials: 'omit', redirect: 'follow'
    }).then(() => true, () => false);
  }

  /** Verifikasi ke asal aplikasi sendiri — memisahkan "server mati" dari
      "perangkat offline". Cache-buster + no-store agar tidak dijawab cache. */
  function probeOrigin() {
    let url;
    // _probe menandai permintaan ini agar Service Worker melewatkannya
    // (lihat service-worker.js) sehingga hasilnya benar-benar dari jaringan.
    try { url = new URL('manifest.json?_probe=1&_=' + Date.now(), document.baseURI).href; }
    catch (e) { return Promise.resolve(false); }
    // Kode status TIDAK diperiksa: 404 pun membuktikan ada server yang
    // menjawab, dan itulah satu-satunya yang sedang diuji di sini. Hanya
    // kegagalan transport (fetch ditolak) yang dihitung sebagai putus.
    return timedFetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit' })
      .then(() => true, () => false);
  }

  function scheduleRetry() {
    clearRetry();
    const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    attempt += 1;
    retryTimer = setTimeout(() => { retryTimer = null; verify(); }, delay);
  }

  /* ================= API publik ================= */

  /** Verifikasi nyata; hanya satu yang berjalan pada satu waktu. */
  function verify() {
    if (probing) return probing;
    probing = probeServer()
      .then((ok) => {
        if (ok) { markOnline(); return state; }
        return probeOrigin().then((netOk) => {
          setState(netOk ? SERVER : OFFLINE);
          scheduleRetry();
          return state;
        });
      })
      .catch(() => state)
      .then((s) => { probing = null; return s; });
    return probing;
  }

  /** Dipanggil setiap kali sebuah permintaan aplikasi benar-benar dijawab. */
  function markOnline() {
    attempt = 0;
    clearRetry();
    if (debounceId) { clearTimeout(debounceId); debounceId = null; }
    setState(ONLINE);
  }

  /**
   * Klasifikasi kegagalan — inti perbaikan.
   *   'transport'   : jaringan/transport gagal, server tidak pernah dijawab.
   *   'server-busy' : server menjawab tetapi sedang bermasalah (5xx/429).
   *   'rejected'    : server menolak dengan sadar (RLS, validasi, 4xx).
   * Hanya 'transport' yang boleh disebut "offline" kepada pengguna.
   */
  function classify(err) {
    if (!err) return 'rejected';
    const name   = String(err.name || '');
    const msg    = String(err.message || err || '');
    const status = Number(err.status || err.statusCode || err.originalStatus || 0);

    if (name === 'AbortError' || name === 'TimeoutError') return 'transport';
    if (typeof TypeError !== 'undefined' && err instanceof TypeError) return 'transport';
    if (!status && TRANSPORT_RE.test(msg)) return 'transport';
    if (!status && global.navigator && global.navigator.onLine === false) return 'transport';
    if (status === 408 || status === 425 || status === 429 || status >= 500) return 'server-busy';
    return 'rejected';
  }

  /** Laporkan kegagalan transport; verifikasi dijadwalkan (dengan jeda). */
  function reportFailure(err) {
    if (err && classify(err) !== 'transport') return;
    if (debounceId) return;
    debounceId = setTimeout(() => { debounceId = null; verify(); }, FAIL_DEBOUNCE);
  }

  /** Status saat ini apa adanya. */
  function current() { return state; }

  /**
   * Boleh mencoba menghubungi server?
   * SENGAJA optimistis: hanya status 'offline' yang sudah terbukti yang
   * menahan permintaan. Status 'server' tetap boleh dicoba — itulah yang
   * membuat aplikasi pulih sendiri begitu server hidup kembali.
   */
  function isOnline() { return state !== OFFLINE; }

  /** Daftarkan pendengar perubahan status: fn(stateBaru, stateLama). */
  function onChange(fn) {
    if (typeof fn === 'function' && listeners.indexOf(fn) === -1) listeners.push(fn);
    return function off() {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  /* ================= Pemicu ================= */

  if (global.addEventListener) {
    // Peristiwa peramban hanya MEMICU verifikasi, tidak menetapkan status.
    global.addEventListener('online',  () => { attempt = 0; verify(); });
    global.addEventListener('offline', () => { verify(); });
    // Kembali ke tab / bangun dari tidur: pulihkan status secepatnya.
    global.addEventListener('pageshow', () => { if (state !== ONLINE) verify(); });
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state !== ONLINE) verify();
    });
  }
  // Bila saat halaman dibuka peramban mengaku offline, verifikasi dulu —
  // jangan langsung menampilkan label offline kepada pengguna.
  if (global.navigator && global.navigator.onLine === false) {
    setTimeout(verify, 0);
  }

  const api = {
    ONLINE, SERVER, OFFLINE,
    state: current,
    isOnline,
    verify,
    classify,
    reportSuccess: markOnline,
    reportFailure,
    onChange
  };
  // Ditempelkan ke window juga: berkas lain yang dibungkus IIFE (mis.
  // components/ui.js) merujuknya lewat objek global.
  try { global.Net = api; } catch (e) { /* abaikan */ }
  return api;
})(window);
