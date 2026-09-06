/**
 * ===================================================================
 * db.js — Penyimpanan lokal (IndexedDB) untuk arsitektur offline-first
 * ===================================================================
 * Menyimpan seluruh data hasil operasi Read sebagai CACHE UTAMA di
 * perangkat, plus antrean "Outbox" untuk operasi Create/Update/Delete
 * yang gagal terkirim saat perangkat sedang offline.
 *
 * File ini TIDAK berisi business logic — murni get/put/delete per store.
 *
 * VERSI 2: menambahkan store "Enrollment" (riwayat periode pelatihan).
 * Kenaikan versi memicu onupgradeneeded yang HANYA membuat store baru;
 * seluruh data yang sudah ada di perangkat pengguna tetap utuh.
 */
const LocalDB = (() => {
  const DB_NAME = 'swim_offline_db';
  const DB_VERSION = 2;
  const STORES = [
    'Peserta', 'Jadwal', 'Kehadiran', 'Rapor', 'Berita',
    'Pelatih', 'Enrollment', 'Settings', 'Outbox'
  ];

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB tidak didukung perangkat ini')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((name) => {
          if (db.objectStoreNames.contains(name)) return;   // jangan sentuh store lama
          if (name === 'Outbox') db.createObjectStore(name, { keyPath: '_outboxId', autoIncrement: true });
          else db.createObjectStore(name, { keyPath: '_key' });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database lokal sedang dipakai tab lain'));
    });
    return dbPromise;
  }

  async function store(storeName, mode) {
    const db = await open();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  /** Cari kolom Id_... untuk dipakai sebagai kunci lokal; fallback ke kolom pertama. */
  function keyOf(item) {
    const idField = Object.keys(item).find((k) => /^Id_/.test(k)) || Object.keys(item)[0];
    return item[idField] != null ? String(item[idField]) : '';
  }

  function stripKey(item) {
    if (item && typeof item === 'object' && '_key' in item) {
      const clone = Object.assign({}, item);
      delete clone._key;
      return clone;
    }
    return item;
  }

  /** Ganti SELURUH isi store dengan array baru (setelah Read dari server). */
  async function replaceAll(storeName, items) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readwrite');
      const os = t.objectStore(storeName);
      os.clear();
      (items || []).forEach((item, i) => {
        os.put(Object.assign({ _key: keyOf(item) || ('row' + i) }, item));
      });
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
    });
  }

  async function getAll(storeName) {
    const os = await store(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const req = os.getAll();
      req.onsuccess = () => resolve((req.result || []).map(stripKey));
      req.onerror = () => reject(req.error);
    });
  }

  async function put(storeName, item) {
    const os = await store(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = os.put(Object.assign({ _key: keyOf(item) }, item));
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  /** Simpan banyak baris dalam SATU transaksi (jauh lebih cepat dari put berulang). */
  async function putMany(storeName, items) {
    if (!items || !items.length) return true;
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readwrite');
      const os = t.objectStore(storeName);
      items.forEach((item) => os.put(Object.assign({ _key: keyOf(item) }, item)));
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
    });
  }

  async function remove(storeName, key) {
    const os = await store(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = os.delete(String(key));
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  /** Antrean Outbox: operasi Create/Update/Delete yang tertunda (mode offline). */
  async function outboxAdd(op) {
    const os = await store('Outbox', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = os.add(Object.assign({ createdAt: Date.now() }, op));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function outboxAll() {
    const os = await store('Outbox', 'readonly');
    return new Promise((resolve, reject) => {
      const req = os.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function outboxRemove(outboxId) {
    const os = await store('Outbox', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = os.delete(outboxId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  return { open, replaceAll, getAll, put, putMany, remove, outboxAdd, outboxAll, outboxRemove, STORES };
})();
