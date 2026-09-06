/**
 * ===================================================================
 * domain/base.js — Fondasi lapisan business logic
 * ===================================================================
 * Business logic berjalan di perangkat pengguna terhadap cache lokal
 * (Store), bukan di server. File ini menyediakan:
 *   • BizUtil  — helper murni yang dipakai seluruh service.
 *   • persist  — satu jalur tulis ke server, dengan dukungan offline.
 *   • BizLogic — objek fasad kosong yang diisi oleh domain/*.js
 *                berikutnya (people.js, training.js, content.js).
 *
 * Urutan pemuatan di HTML WAJIB:
 *   base.js -> people.js -> training.js -> content.js
 */

const BizUtil = {
  /** Tanggal ISO 'YYYY-MM-DD' dari nilai apa pun (lihat lib/wita.js). */
  formatDate(d) { return WITA.toISODate(d) || (d ? String(d) : ''); },

  /** Boolean toleran: menerima true asli maupun string 'TRUE' warisan Sheets. */
  isTrue(v) { return v === true || String(v).toUpperCase() === 'TRUE'; },

  /** Normalisasi teks untuk perbandingan (nama, username). */
  norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); },

  /** Normalisasi nama: rapatkan spasi ganda + huruf kecil. */
  normName(v) { return this.norm(v).replace(/\s+/g, ' '); },

  /** Hanya digit — untuk membandingkan nomor WhatsApp lintas format. */
  digits(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); },

  /** Normalisasi nomor WhatsApp Indonesia ke format 62xxxxxxxxx. */
  normPhone(v) {
    let d = this.digits(v);
    if (!d) return '';
    if (d.startsWith('0')) d = '62' + d.slice(1);
    else if (d.startsWith('8')) d = '62' + d;
    return d;
  },

  isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); },

  genId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  },

  nowIso() { return new Date().toISOString(); },

  /** Usia (tahun) pada hari ini, memakai kalender WITA. */
  usia(tanggalLahir) {
    const iso = WITA.toISODate(tanggalLahir);
    if (!iso) return 0;
    const months = WITA.diffMonths(iso, WITA.todayISO());
    return Math.max(0, Math.floor(months / 12));
  },

  /** Kelompok umur klub, dihitung per 1 Januari tahun berjalan. */
  kelompokUmur(tanggalLahir) {
    const iso = WITA.toISODate(tanggalLahir);
    if (!iso) return '';
    const refYear = Number(WITA.todayISO().slice(0, 4));
    const months = WITA.diffMonths(iso, refYear + '-01-01');
    const umur = Math.floor(months / 12);
    if (umur > 19) return 'Senior';
    if (umur >= 16) return 'Group 1';
    if (umur >= 14) return 'Group 2';
    if (umur >= 12) return 'Group 3';
    if (umur >= 10) return 'Group 4';
    if (umur >= 8)  return 'Group 5';
    return 'Group 6';
  },

  ok(message, extra)   { return Object.assign({ success: true,  message: message || '' }, extra || {}); },
  fail(message, extra) { return Object.assign({ success: false, message: message || '' }, extra || {}); }
};

/**
 * Kirim operasi Create/Update/Delete ke server.
 *
 * Bila gagal karena TIDAK ADA KONEKSI, operasi diantre ke Outbox dan
 * dianggap berhasil secara lokal (optimistik) — data sudah benar di cache
 * dan akan tersinkron begitu online. Kegagalan LAIN (mis. baris tidak
 * ditemukan di server) tetap dikembalikan sebagai kegagalan asli.
 */
async function persist(resource, op, payload) {
  const res = await CrudApi[op](resource, payload);
  if (res && res.success) return { success: true, queued: false, raw: res };
  if (res && res.offline) {
    await Sync.queue(resource, op, payload);
    return { success: true, queued: true, raw: res };
  }
  return { success: false, queued: false, raw: res, message: res && res.message };
}

/** Tulis satu baris ke cache lokal & invalidasi indeks Store. */
async function cachePut(storeName, row) {
  try { await LocalDB.put(storeName, row); } catch (e) { /* IndexedDB tidak tersedia */ }
  Store.invalidate();
}

async function cachePutMany(storeName, rows) {
  try { await LocalDB.putMany(storeName, rows); } catch (e) { /* IndexedDB tidak tersedia */ }
  Store.invalidate();
}

async function cacheRemove(storeName, key) {
  try { await LocalDB.remove(storeName, key); } catch (e) { /* IndexedDB tidak tersedia */ }
  Store.invalidate();
}

/** Objek fasad; diisi oleh domain/people.js, training.js, content.js. */
const BizLogic = {};
