/**
 * ===================================================================
 * wita.js — Waktu operasional klub (WITA / UTC+8)
 * ===================================================================
 * Seluruh keputusan berbasis waktu (jadwal buka/tutup, "hari ini",
 * perbandingan periode pelatihan) HARUS memakai helper di sini.
 *
 * Alasannya: pengguna berada di zona waktu perangkat masing-masing
 * (WIB, WITA, WIT, atau bahkan luar negeri saat liburan). Memakai
 * `new Date()` lokal membuat sesi jam 16:00 WITA terbuka pada jam yang
 * berbeda-beda di tiap perangkat. Modul ini memetakan waktu apa pun ke
 * "jam dinding WITA" sehingga hasilnya identik di semua perangkat.
 *
 * Konvensi: seluruh tanggal dipertukarkan sebagai string ISO 'YYYY-MM-DD'
 * dan jam sebagai 'HH:MM' — bukan objek Date — agar tidak ada pergeseran
 * zona waktu saat disimpan ke database.
 */
const WITA = (function () {
  'use strict';

  const OFFSET_MIN = (typeof CONFIG !== 'undefined' && CONFIG.TIMEZONE_OFFSET_MINUTES) || 480;
  const MS_PER_MIN = 60000;
  const MS_PER_DAY = 86400000;

  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  const MONTH_LONG  = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                       'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const DAY_SHORT   = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const DAY_LONG    = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  const pad = (n) => String(n).padStart(2, '0');

  /**
   * Konversi instant apa pun menjadi Date yang komponen UTC-nya berisi
   * jam dinding WITA. Selalu baca hasilnya dengan getUTC*(), bukan get*().
   */
  function toWitaClock(instant) {
    const d = instant instanceof Date ? instant : new Date(instant == null ? Date.now() : instant);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getTime() + OFFSET_MIN * MS_PER_MIN);
  }

  /** Waktu sekarang menurut jam dinding WITA. */
  function now() { return toWitaClock(Date.now()); }

  /** Tanggal hari ini di WITA sebagai 'YYYY-MM-DD'. */
  function todayISO() {
    const w = now();
    return w.getUTCFullYear() + '-' + pad(w.getUTCMonth() + 1) + '-' + pad(w.getUTCDate());
  }

  /**
   * Normalisasi nilai tanggal apa pun ke 'YYYY-MM-DD'.
   * Menerima: 'YYYY-MM-DD', 'M/D/YYYY' (warisan Google Sheets), ISO
   * timestamp, objek Date, atau string kosong.
   */
  function toISODate(value) {
    if (!value) return '';
    if (value instanceof Date) {
      if (isNaN(value.getTime())) return '';
      return value.getFullYear() + '-' + pad(value.getMonth() + 1) + '-' + pad(value.getDate());
    }
    const s = String(value).trim();
    if (!s) return '';

    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];

    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);   // M/D/YYYY
    if (m) return m[3] + '-' + pad(m[1]) + '-' + pad(m[2]);

    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Normalisasi jam ke 'HH:MM'; mengembalikan '' bila tidak terbaca. */
  function toHHMM(value) {
    if (!value) return '';
    const m = String(value).match(/(\d{1,2})[:.](\d{2})/);
    if (!m) return '';
    const h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return '';
    return pad(h) + ':' + pad(min);
  }

  /** Jam mulai dari string "Pukul" bebas format ("16:00 - 17:45", "08.00-10.00"). */
  function startTimeOf(pukul) { return toHHMM(pukul); }

  /**
   * Ubah 'YYYY-MM-DD' + 'HH:MM' (jam dinding WITA) menjadi epoch ms absolut.
   * Inilah jembatan antara jadwal yang tersimpan dan waktu nyata perangkat.
   */
  function epochOf(isoDate, hhmm) {
    const iso = toISODate(isoDate);
    if (!iso) return NaN;
    const t = toHHMM(hhmm) || '00:00';
    return Date.parse(iso + 'T' + t + ':00Z') - OFFSET_MIN * MS_PER_MIN;
  }

  /** Selisih hari kalender (b - a), keduanya 'YYYY-MM-DD'. */
  function diffDays(aISO, bISO) {
    const a = Date.parse(toISODate(aISO) + 'T00:00:00Z');
    const b = Date.parse(toISODate(bISO) + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return NaN;
    return Math.round((b - a) / MS_PER_DAY);
  }

  /** Tambah hari pada tanggal ISO, hasil tetap ISO. */
  function addDays(isoDate, days) {
    const t = Date.parse(toISODate(isoDate) + 'T00:00:00Z');
    if (isNaN(t)) return '';
    const d = new Date(t + days * MS_PER_DAY);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  /**
   * Tambah bulan pada tanggal ISO. Bila tanggal tujuan tidak ada
   * (mis. 31 Jan + 1 bulan), dipakai hari terakhir bulan tersebut.
   */
  function addMonths(isoDate, months) {
    const iso = toISODate(isoDate);
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay));
    return target.getUTCFullYear() + '-' + pad(target.getUTCMonth() + 1) + '-' + pad(target.getUTCDate());
  }

  /** Selisih bulan penuh antara dua tanggal ISO (dipakai menghitung durasi). */
  function diffMonths(startISO, endISO) {
    const a = toISODate(startISO), b = toISODate(endISO);
    if (!a || !b) return 0;
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    let months = (by - ay) * 12 + (bm - am);
    if (bd < ad) months -= 1;
    return months;
  }

  /** Hari dalam minggu (0=Minggu) dari tanggal ISO, bebas zona waktu. */
  function dayOfWeek(isoDate) {
    const t = Date.parse(toISODate(isoDate) + 'T00:00:00Z');
    return isNaN(t) ? -1 : new Date(t).getUTCDay();
  }

  /* ---------------- Format tampilan (Bahasa Indonesia) ---------------- */

  function formatDate(value) {
    const iso = toISODate(value);
    if (!iso) return '-';
    const [y, m, d] = iso.split('-').map(Number);
    return d + ' ' + MONTH_SHORT[m - 1] + ' ' + y;
  }

  function formatDateLong(value) {
    const iso = toISODate(value);
    if (!iso) return '-';
    const [y, m, d] = iso.split('-').map(Number);
    return d + ' ' + MONTH_LONG[m - 1] + ' ' + y;
  }

  function formatDateFull(value) {
    const iso = toISODate(value);
    if (!iso) return '-';
    return DAY_LONG[dayOfWeek(iso)] + ', ' + formatDateLong(iso);
  }

  /** "dalam 2 jam", "3 hari lagi", "kemarin" — untuk kartu pengingat. */
  function relativeLabel(isoDate, hhmm) {
    const target = epochOf(isoDate, hhmm || '00:00');
    if (isNaN(target)) return '';
    const days = diffDays(todayISO(), isoDate);
    if (days === 0) return 'Hari ini';
    if (days === 1) return 'Besok';
    if (days === -1) return 'Kemarin';
    if (days > 1) return days + ' hari lagi';
    return Math.abs(days) + ' hari lalu';
  }

  return {
    OFFSET_MIN, MONTH_SHORT, MONTH_LONG, DAY_SHORT, DAY_LONG,
    toWitaClock, now, todayISO, toISODate, toHHMM, startTimeOf,
    epochOf, diffDays, addDays, addMonths, diffMonths, dayOfWeek,
    formatDate, formatDateLong, formatDateFull, relativeLabel
  };
})();
