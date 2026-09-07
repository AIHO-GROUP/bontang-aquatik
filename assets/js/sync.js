/**
 * ===================================================================
 * sync.js — Orkestrasi cache lokal (offline-first)
 * ===================================================================
 * Store : representasi in-memory seluruh data yang sudah di-cache.
 *         Inilah yang dibaca lapisan domain/*.js untuk pencarian,
 *         filter, sortir, pagination, dan kalkulasi — TANPA request
 *         ulang ke server.
 * Sync  : mengambil data dari Supabase lalu menyimpannya ke IndexedDB
 *         sebagai cache utama + memperbarui Store.
 *
 * Request ke server HANYA terjadi saat:
 *   1) halaman dibuka (Sync.init) — berjalan di latar belakang setelah
 *      cache lokal langsung ditampilkan, sehingga UI tidak pernah
 *      menunggu jaringan;
 *   2) operasi Create/Update/Delete.
 * Di luar itu semua interaksi (ganti tab, filter, pindah halaman
 * pagination) memakai data lokal.
 */
const Store = {
  data: {
    Peserta: [], Jadwal: [], Kehadiran: [], Rapor: [],
    Berita: [], Pelatih: [], Enrollment: [], Settings: {}
  },

  peserta()    { return this.data.Peserta; },
  jadwal()     { return this.data.Jadwal; },
  kehadiran()  { return this.data.Kehadiran; },
  rapor()      { return this.data.Rapor; },
  berita()     { return this.data.Berita; },
  pelatih()    { return this.data.Pelatih; },
  enrollment() { return this.data.Enrollment; },
  settings()   { return this.data.Settings; },

  setEntity(name, items) { this.data[name] = items || []; },
  setSettings(obj) { this.data.Settings = obj || {}; },

  /* ---------- Indeks ringan, dibangun ulang setiap sinkronisasi ----------
     Menghindari pencarian linier berulang (find di dalam map) yang menjadi
     O(n*m) saat jumlah peserta & jadwal bertambah. */
  _index: null,

  buildIndex() {
    const byPeserta = new Map();
    this.data.Peserta.forEach((p) => byPeserta.set(p.Id_Peserta, p));

    const byPelatih = new Map();
    this.data.Pelatih.forEach((p) => byPelatih.set(p.Id_Pelatih, p));

    const enrollByPeserta = new Map();
    this.data.Enrollment.forEach((e) => {
      if (!enrollByPeserta.has(e.Id_Peserta)) enrollByPeserta.set(e.Id_Peserta, []);
      enrollByPeserta.get(e.Id_Peserta).push(e);
    });
    enrollByPeserta.forEach((list) => {
      list.sort((a, b) => String(a.Tanggal_Mulai).localeCompare(String(b.Tanggal_Mulai)));
    });

    const kehadiranByJadwal = new Map();
    const kehadiranByPeserta = new Map();
    this.data.Kehadiran.forEach((k) => {
      if (!kehadiranByJadwal.has(k.Id_Jadwal)) kehadiranByJadwal.set(k.Id_Jadwal, []);
      kehadiranByJadwal.get(k.Id_Jadwal).push(k);
      if (!kehadiranByPeserta.has(k.Id_Peserta)) kehadiranByPeserta.set(k.Id_Peserta, []);
      kehadiranByPeserta.get(k.Id_Peserta).push(k);
    });

    /* Rapor kini berupa RIWAYAT: satu peserta dapat memiliki banyak baris,
       satu per tanggal penilaian. Indeks menyimpan seluruh baris (urut dari
       terlama ke terbaru) agar grafik perkembangan tidak perlu memindai
       ulang tabel, sementara raporOf() tetap mengembalikan penilaian
       TERBARU — itulah yang dimaksud "rapor peserta" di seluruh UI lama. */
    const raporByPeserta = new Map();
    this.data.Rapor.forEach((r) => {
      if (!raporByPeserta.has(r.Id_Peserta)) raporByPeserta.set(r.Id_Peserta, []);
      raporByPeserta.get(r.Id_Peserta).push(r);
    });
    raporByPeserta.forEach((list) => {
      list.sort((a, b) => String(a.Tanggal_Rapor || '').localeCompare(String(b.Tanggal_Rapor || '')));
    });

    this._index = { byPeserta, byPelatih, enrollByPeserta, kehadiranByJadwal, kehadiranByPeserta, raporByPeserta };
    return this._index;
  },

  index() { return this._index || this.buildIndex(); },

  findPeserta(id) { return this.index().byPeserta.get(id) || null; },
  findPelatih(id) { return this.index().byPelatih.get(id) || null; },
  enrollmentsOf(idPeserta) { return this.index().enrollByPeserta.get(idPeserta) || []; },
  kehadiranOfJadwal(idJadwal) { return this.index().kehadiranByJadwal.get(idJadwal) || []; },
  kehadiranOfPeserta(idPeserta) { return this.index().kehadiranByPeserta.get(idPeserta) || []; },
  /** Seluruh riwayat penilaian peserta, terlama -> terbaru. */
  raporListOf(idPeserta) { return this.index().raporByPeserta.get(idPeserta) || []; },
  /** Penilaian TERBARU peserta; null bila belum pernah dinilai. */
  raporOf(idPeserta) {
    const list = this.raporListOf(idPeserta);
    return list.length ? list[list.length - 1] : null;
  },

  /** Panggil setelah mutasi lokal agar indeks tidak basi. */
  invalidate() { this._index = null; },

  async loadFromLocalDB() {
    const entities = ['Peserta', 'Jadwal', 'Kehadiran', 'Rapor', 'Berita', 'Pelatih', 'Enrollment'];
    await Promise.all(entities.map(async (name) => {
      try { this.data[name] = await LocalDB.getAll(name); }
      catch (e) { this.data[name] = this.data[name] || []; }
    }));
    this.invalidate();
  }
};

/** Peta nama entitas Store -> nama resource di CrudApi. */
const ENTITY_RESOURCE = {
  Peserta: 'peserta', Jadwal: 'jadwal', Kehadiran: 'kehadiran',
  Rapor: 'rapor', Berita: 'berita', Pelatih: 'pelatih', Enrollment: 'enrollment'
};

const Sync = {
  /** Ambil data terbaru satu entitas dari server & perbarui cache + Store. */
  async pull(entityName, opts = {}) {
    const resource = ENTITY_RESOURCE[entityName];
    if (!resource) return { success: false, message: 'Entitas tidak dikenal: ' + entityName };
    const res = await CrudApi.read(resource, { silent: opts.silent });
    if (res && res.success) {
      Store.setEntity(entityName, res.data || []);
      Store.invalidate();
      try { await LocalDB.replaceAll(entityName, res.data || []); }
      catch (e) { /* IndexedDB tidak tersedia — lanjut dengan in-memory */ }
    }
    return res;
  },

  /** Sinkronkan beberapa entitas paralel (satu gelombang request). */
  async pullMany(entityNames, opts = {}) {
    const results = await Promise.all(entityNames.map((name) => this.pull(name, opts)));
    Store.invalidate();
    const failed = entityNames.filter((_, i) => !(results[i] && results[i].success));
    return { success: failed.length === 0, failed };
  },

  async pullSettings(opts = {}) {
    const res = await CrudApi.read('settings', { silent: opts.silent });
    if (res && res.success) {
      Store.setSettings(res.data || {});
      try { await this._persistSettingsLocal(); } catch (e) { /* abaikan */ }
    }
    return res;
  },

  async pushSettings(partial) {
    const res = await CrudApi.update('settings', partial, { silent: true });
    if (res && res.success) {
      Store.setSettings(res.data || Object.assign({}, Store.settings(), partial));
      try { await this._persistSettingsLocal(); } catch (e) { /* abaikan */ }
    }
    return res;
  },

  async _persistSettingsLocal() {
    const db = await LocalDB.open();
    const tx = db.transaction('Settings', 'readwrite');
    const os = tx.objectStore('Settings');
    os.clear();
    const s = Store.settings();
    Object.keys(s).forEach((k) => os.put({ _key: k, _settingsKey: k, value: s[k] }));
  },

  async _loadSettingsFromLocal() {
    try {
      const rows = await LocalDB.getAll('Settings');
      const obj = {};
      rows.forEach((r) => { if (r && r._settingsKey) obj[r._settingsKey] = r.value; });
      if (Object.keys(obj).length) Store.setSettings(obj);
    } catch (e) { /* abaikan */ }
  },

  /**
   * Inisialisasi halaman: tampilkan cache lokal SEGERA (mendukung offline
   * penuh dan tidak menunggu jaringan). Promise selesai begitu cache lokal
   * termuat. Sinkronisasi server berjalan di latar belakang lalu memanggil
   * onUpdated() agar caller dapat merender ulang dengan data terbaru.
   *
   * @param {string[]} entityNames  mis. ['Peserta','Jadwal']; sertakan
   *                                '__settings__' bila Settings dibutuhkan.
   * @param {function} onUpdated    dipanggil setelah sinkronisasi selesai.
   */
  async init(entityNames, onUpdated) {
    this._lastEntities  = entityNames.slice();
    this._lastOnUpdated = onUpdated;
    const needSettings = entityNames.includes('__settings__');
    const real = entityNames.filter((e) => e !== '__settings__');

    await Store.loadFromLocalDB();
    if (needSettings) await this._loadSettingsFromLocal();

    // Keputusan menarik data TIDAK memakai navigator.onLine: nilainya bisa
    // keliru false (pindah Wi-Fi/seluler, VPN, bangun dari tidur) sehingga
    // halaman tampak "beku" pada data lama padahal koneksi sehat. Net hanya
    // menahan bila ketidakterhubungan sudah terbukti lewat verifikasi.
    if (typeof Net === 'undefined' || Net.isOnline()) {
      // Sengaja TIDAK di-await: caller sudah bisa merender dari cache lokal
      // sekarang, hasil server disusulkan lewat onUpdated().
      Promise.all([
        this.pullMany(real, { silent: true }),
        needSettings ? this.pullSettings({ silent: true }) : Promise.resolve()
      ]).then(([pullRes]) => {
        Store.invalidate();
        if (typeof Auth !== 'undefined' && Auth.syncRoleFromStore) {
          try { Auth.syncRoleFromStore(); } catch (e) { /* abaikan */ }
        }
        if (typeof onUpdated === 'function') onUpdated(pullRes);
        this.flushOutbox();
      }).catch(() => { /* abaikan — tetap pakai cache lokal */ });
    }

    if (!this._onlineBound) {
      this._onlineBound = true;
      if (typeof Net !== 'undefined' && Net.onChange) {
        // Pulih menurut VERIFIKASI, bukan menurut peristiwa 'online' peramban
        // yang sering tidak terpicu setelah gangguan singkat.
        Net.onChange((state, prev) => {
          if (state === 'online' && prev !== 'online') { this.flushOutbox(); this.resync(); }
        });
      } else {
        window.addEventListener('online', () => this.flushOutbox());
      }
    }
  },

  /**
   * Tarik ulang entitas yang terakhir diminta halaman ini. Dipanggil saat
   * koneksi terbukti pulih supaya layar tidak tertinggal pada data lama
   * tanpa perlu pengguna memuat ulang halaman.
   */
  async resync() {
    const names = this._lastEntities;
    if (!names || !names.length) return;
    if (typeof Net !== 'undefined' && !Net.isOnline()) return;
    const real = names.filter((e) => e !== '__settings__');
    const needSettings = names.indexOf('__settings__') !== -1;
    try {
      const [pullRes] = await Promise.all([
        this.pullMany(real, { silent: true }),
        needSettings ? this.pullSettings({ silent: true }) : Promise.resolve()
      ]);
      Store.invalidate();
      if (typeof Auth !== 'undefined' && Auth.syncRoleFromStore) {
        try { Auth.syncRoleFromStore(); } catch (e) { /* abaikan */ }
      }
      if (typeof this._lastOnUpdated === 'function') this._lastOnUpdated(pullRes);
    } catch (e) { /* abaikan — cache lokal tetap dipakai */ }
  },

  /** Antrekan operasi yang gagal terkirim (mis. sedang offline). */
  async queue(resource, op, payload) {
    try { await LocalDB.outboxAdd({ resource, op, payload }); }
    catch (e) { /* IndexedDB tidak tersedia */ }
  },

  /** Kirim ulang seluruh antrean Outbox begitu koneksi tersedia kembali. */
  async flushOutbox() {
    if (typeof Net !== 'undefined' && !Net.isOnline()) return;
    if (this._flushing) return;
    this._flushing = true;
    try {
      let items = [];
      try { items = await LocalDB.outboxAll(); } catch (e) { return; }
      for (const item of items) {
        const res = await CrudApi._request(item.resource, item.op, item.payload, { silent: true });
        if (res && res.success) {
          try { await LocalDB.outboxRemove(item._outboxId); } catch (e) { /* abaikan */ }
        } else if (res && res.offline) {
          // Kegagalan transport ATAU server sibuk (5xx/429): jangan dibuang,
          // coba lagi nanti dengan urutan operasi tetap terjaga.
          break;
        } else {
          // Ditolak server (mis. baris sudah dihapus di perangkat lain).
          // Membiarkannya di antrean akan memblokir selamanya, jadi dibuang.
          console.warn('Outbox item ditolak server, dibuang:', item, res && res.message);
          try { await LocalDB.outboxRemove(item._outboxId); } catch (e) { /* abaikan */ }
        }
      }
    } finally {
      this._flushing = false;
    }
  }
};
