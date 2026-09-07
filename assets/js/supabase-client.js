/**
 * ===================================================================
 * supabase-client.js — Inisialisasi koneksi ke Supabase
 * ===================================================================
 * File BARU (pengganti peran "URL Apps Script" pada arsitektur lama).
 * Wajib dimuat SETELAH config.js dan SEBELUM crud-api.js (lihat urutan
 * <script> di setiap file .html).
 *
 * Membutuhkan SDK resmi Supabase (@supabase/supabase-js) yang dimuat
 * lewat CDN pada setiap file .html:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
 *
 * Tidak ada business logic di file ini — murni membuat 1 instance klien
 * yang dipakai ulang oleh crud-api.js (pola singleton, sama seperti
 * CONFIG.API_URL yang dulu dipakai berulang di crud-api.js lama).
 */
const SupabaseClient = (() => {
  if (typeof window.supabase === 'undefined') {
    console.error(
      '[SupabaseClient] SDK @supabase/supabase-js belum dimuat. ' +
      'Pastikan <script src=".../supabase.min.js"> ada SEBELUM supabase-client.js pada file HTML.'
    );
    return null;
  }
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY ||
      CONFIG.SUPABASE_URL.indexOf('GANTI_') === 0 || CONFIG.SUPABASE_ANON_KEY.indexOf('GANTI_') === 0) {
    console.error(
      '[SupabaseClient] CONFIG.SUPABASE_URL / CONFIG.SUPABASE_ANON_KEY belum diisi. ' +
      'Buka assets/js/config.js dan isi dengan kredensial project Supabase Anda.'
    );
  }
  /* ---------------------------------------------------------------
     fetch dengan BATAS WAKTU.
     Tanpa ini, satu permintaan yang menggantung (jaringan berpindah,
     sinyal timbul-tenggelam) tidak pernah selesai: pemuat berputar
     selamanya dan status koneksi tidak pernah dievaluasi ulang. Dengan
     batas waktu, permintaan gagal cepat, dikenali sebagai kegagalan
     transport, lalu Net memverifikasi dan memulihkan status sendiri.

     Unggahan berkas diberi batas jauh lebih longgar agar lampiran
     berukuran besar di jaringan lambat tidak ikut terpotong.
     --------------------------------------------------------------- */
  const TIMEOUT_REST    = 25000;
  const TIMEOUT_STORAGE = 180000;

  function fetchWithTimeout(input, init) {
    const opts = init || {};
    // Hormati AbortSignal milik pemanggil — jangan pernah menimpanya.
    if (opts.signal || typeof AbortController === 'undefined') return fetch(input, opts);
    const url = typeof input === 'string' ? input : ((input && input.url) || '');
    const ms  = /\/storage\/v1\//.test(url) ? TIMEOUT_STORAGE : TIMEOUT_REST;
    const ac  = new AbortController();
    const t   = setTimeout(() => ac.abort(), ms);
    return fetch(input, Object.assign({}, opts, { signal: ac.signal })).then(
      (res) => { clearTimeout(t); return res; },
      (err) => { clearTimeout(t); throw err; }
    );
  }

  // createClient dari window.supabase (nama global yang diekspos UMD bundle).
  return window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    global: { fetch: fetchWithTimeout },
    auth: {
      // Aplikasi ini TIDAK memakai Supabase Auth (autentikasi ditangani
      // sendiri oleh domain/people.js terhadap tabel Peserta/Pelatih,
      // persis seperti sebelumnya) — session persistence dimatikan agar
      // tidak ada state auth tersembunyi yang tidak dipakai.
      persistSession: false,
      autoRefreshToken: false
    }
  });
})();
