/**
 * ===================================================================
 * sync.js — Orkestrasi cache lokal (offline-first)
 * ===================================================================
 * Store : representasi in-memory dari seluruh data yang sudah di-cache
 *         (dimuat dari IndexedDB). Ini yang dibaca oleh business-logic.js
 *         untuk searching/filtering/sorting/kalkulasi — TANPA request
 *         ulang ke Apps Script.
 * Sync  : mengambil data dari backend (operasi Read) lalu menyimpannya ke
 *         IndexedDB sebagai cache utama + memperbarui Store.
 *
 * Sinkronisasi ke server HANYA terjadi saat:
 *   1) Aplikasi dibuka / melakukan proses sinkronisasi (Sync.init di tiap
 *      halaman) — mengambil data terbaru via operasi Read, dijalankan di
 *      latar belakang setelah cache lokal langsung ditampilkan.
 *   2) Operasi Create / Update / Delete (lihat business-logic.js).
 * Di luar itu, seluruh pencarian/filter/sort/hitung memakai data lokal.
 */
const Store = {
  data: { Peserta: [], Jadwal: [], Kehadiran: [], Rapor: [], Berita: [], Pelatih: [], Settings: {} },

  peserta()   { return this.data.Peserta; },
  jadwal()    { return this.data.Jadwal; },
  kehadiran() { return this.data.Kehadiran; },
  rapor()     { return this.data.Rapor; },
  berita()    { return this.data.Berita; },
  pelatih()   { return this.data.Pelatih; },
  settings()  { return this.data.Settings; },

  setEntity(name, items) { this.data[name] = items || []; },
  setSettings(obj) { this.data.Settings = obj || {}; },

  async loadFromLocalDB() {
    const entities = ['Peserta', 'Jadwal', 'Kehadiran', 'Rapor', 'Berita', 'Pelatih'];
    await Promise.all(entities.map(async (name) => {
      try { this.data[name] = await LocalDB.getAll(name); } catch (e) { this.data[name] = this.data[name] || []; }
    }));
    try {
      const rows = await LocalDB.getAll('Settings');
      const obj = {};
      rows.forEach(r => { if (r && r._settingsKey) obj[r._settingsKey] = r.value; });
      if (Object.keys(obj).length) this.data.Settings = obj;
    } catch (e) { /* IndexedDB tidak tersedia — lanjut pakai default {} */ }
  }
};

/** Peta nama Store -> nama resource REST di backend. */
const ENTITY_RESOURCE = {
  Peserta: 'peserta', Jadwal: 'jadwal', Kehadiran: 'kehadiran',
  Rapor: 'rapor', Berita: 'berita', Pelatih: 'pelatih'
};

const Sync = {
  /** Ambil data terbaru 1 entitas dari server & perbarui cache lokal + Store. */
  async pull(entityName, opts = {}) {
    const resource = ENTITY_RESOURCE[entityName];
    if (!resource) return { success: false, message: 'Entitas tidak dikenal: ' + entityName };
    const res = await CrudApi.read(resource, { silent: opts.silent });
    if (res && res.success) {
      Store.setEntity(entityName, res.data || []);
      try { await LocalDB.replaceAll(entityName, res.data || []); } catch (e) { /* lanjut pakai in-memory saja */ }
    }
    return res;
  },

  /** Sinkronkan beberapa entitas sekaligus secara paralel (1 gelombang request per sinkronisasi). */
  async pullMany(entityNames, opts = {}) {
    const results = await Promise.all(entityNames.map(name => this.pull(name, opts)));
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
    Object.keys(Store.settings()).forEach(k => os.put({ _key: k, _settingsKey: k, value: Store.settings()[k] }));
  },

  async _loadSettingsFromLocal() {
    try {
      const rows = await LocalDB.getAll('Settings');
      const obj = {};
      rows.forEach(r => { if (r && r._settingsKey) obj[r._settingsKey] = r.value; });
      Store.setSettings(obj);
    } catch (e) { /* abaikan */ }
  },

  /**
   * Inisialisasi tiap halaman: tampilkan cache lokal SEGERA (mendukung mode
   * offline penuh & TIDAK menunggu jaringan) — promise ini selesai begitu
   * cache lokal termuat. Sinkronisasi ke server (bila perangkat online)
   * berjalan di latar belakang sesudahnya dan memanggil onUpdated() begitu
   * selesai, agar caller bisa me-render ulang dengan data terbaru tanpa
   * memblokir tampilan awal.
   * @param {string[]} entityNames  mis. ['Peserta','Jadwal']; sertakan '__settings__' bila perlu Settings.
   * @param {function} onUpdated    dipanggil setelah sinkronisasi latar belakang selesai (silent, tanpa loader).
   */
  async init(entityNames, onUpdated) {
    const needSettings = entityNames.includes('__settings__');
    const real = entityNames.filter(e => e !== '__settings__');

    await Store.loadFromLocalDB();
    if (needSettings) await this._loadSettingsFromLocal();

    if (navigator.onLine) {
      // Sengaja TIDAK di-await — caller sudah bisa render dari cache lokal
      // sekarang; hasil sinkronisasi server disusulkan lewat onUpdated().
      Promise.all([
        this.pullMany(real, { silent: true }),
        needSettings ? this.pullSettings({ silent: true }) : Promise.resolve()
      ]).then(([pullRes]) => {
        if (typeof onUpdated === 'function') onUpdated(pullRes);
        this.flushOutbox();
      }).catch(() => { /* abaikan — tetap pakai cache lokal */ });
    }
    window.addEventListener('online', () => this.flushOutbox());
  },

  /** Antrekan operasi Create/Update/Delete yang gagal terkirim (mis. sedang offline). */
  async queue(resource, op, payload) {
    try { await LocalDB.outboxAdd({ resource, op, payload }); } catch (e) { /* IndexedDB tidak tersedia */ }
  },

  /** Kirim ulang seluruh antrean Outbox begitu koneksi tersedia kembali. */
  async flushOutbox() {
    if (!navigator.onLine) return;
    let items = [];
    try { items = await LocalDB.outboxAll(); } catch (e) { return; }
    for (const item of items) {
      const res = await CrudApi._request(item.resource, item.op, item.payload, { silent: true });
      if (res && res.success) {
        try { await LocalDB.outboxRemove(item._outboxId); } catch (e) { /* abaikan */ }
      } else {
        break; // masih gagal (mis. masih offline) — coba lagi di kesempatan berikutnya
      }
    }
  }
};
