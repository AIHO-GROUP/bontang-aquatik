/**
 * ===================================================================
 * db.js — Lapisan penyimpanan lokal (IndexedDB) untuk arsitektur offline-first
 * ===================================================================
 * Menyimpan seluruh data yang diperoleh dari operasi Read (Peserta, Jadwal,
 * Kehadiran, Rapor, Berita, Pelatih, Settings) sebagai CACHE UTAMA di
 * perangkat, plus antrean "Outbox" untuk operasi Create/Update/Delete yang
 * gagal terkirim saat perangkat sedang offline.
 *
 * File ini TIDAK berisi business logic apa pun — murni get/put/delete
 * key-value per "store" (mirip tabel). Dipakai oleh sync.js.
 */
const LocalDB = (() => {
  const DB_NAME = 'swim_offline_db';
  const DB_VERSION = 1;
  const STORES = ['Peserta', 'Jadwal', 'Kehadiran', 'Rapor', 'Berita', 'Pelatih', 'Settings', 'Outbox'];

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB tidak didukung perangkat ini')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach(name => {
          if (db.objectStoreNames.contains(name)) return;
          if (name === 'Outbox') db.createObjectStore(name, { keyPath: '_outboxId', autoIncrement: true });
          else db.createObjectStore(name, { keyPath: '_key' });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function store(storeName, mode) {
    const db = await open();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  /** Cari nama kolom Id_... untuk dipakai sebagai kunci lokal; fallback ke kolom pertama. */
  function keyOf(item) {
    const idField = Object.keys(item).find(k => /^Id_/.test(k)) || Object.keys(item)[0];
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

  /** Ganti SELURUH isi store dengan array baru (dipakai setelah Read dari server). */
  async function replaceAll(storeName, items) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readwrite');
      const os = t.objectStore(storeName);
      os.clear();
      (items || []).forEach((item, i) => {
        const k = keyOf(item) || ('row' + i);
        os.put(Object.assign({ _key: k }, item));
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

  return { open, replaceAll, getAll, put, remove, outboxAdd, outboxAll, outboxRemove, STORES };
})();
