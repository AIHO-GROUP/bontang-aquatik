/**
 * ===================================================================
 * schedule-engine.js — Aturan jadwal, pembuatan otomatis & status waktu
 * ===================================================================
 * Dua tanggung jawab, keduanya murni kalkulasi (tidak menulis apa pun):
 *
 * 1. PEMBUATAN JADWAL OTOMATIS
 *    Dipicu ketika status pembayaran sebuah periode pelatihan menjadi
 *    LUNAS. Jadwal kelas dibuat dari SCHEDULE_RULES sepanjang periode
 *    pendaftaran, dibatasi horizon (default 120 hari) agar pendaftaran
 *    berdurasi 1-2 tahun tidak menghasilkan ribuan baris sekaligus.
 *    Sisanya ditambahkan bertahap (top-up) saat aplikasi dibuka.
 *
 * 2. KONTROL WAKTU OTOMATIS
 *    Status jadwal TIDAK lagi diubah manual oleh admin setiap hari.
 *    Status dihitung dari jam dinding WITA:
 *        sebelum jam mulai            -> Pending
 *        jam mulai s.d +2 jam         -> Aktif   (absensi terbuka)
 *        setelah itu                  -> Selesai (absensi tertutup)
 *    Admin/koordinator tetap dapat menimpa lewat kolom Status_Manual
 *    (Aktif / Pending / Cancel), dan mengembalikannya ke mode otomatis.
 */

/** Aturan hari-jam-lokasi tiap grup (0 = Minggu ... 6 = Sabtu). */
const SCHEDULE_RULES = {
  'Grup A': {
    location: 'Kenari Waterpark Bontang',
    sessions: [
      { day: 1, startTime: '16:00', endTime: '17:45' },
      { day: 3, startTime: '16:00', endTime: '17:45' },
      { day: 6, startTime: '16:00', endTime: '17:45' }
    ]
  },
  'Grup B': {
    location: 'Kenari Waterpark Bontang',
    sessions: [
      { day: 2, startTime: '16:00', endTime: '17:45' },
      { day: 4, startTime: '16:00', endTime: '17:45' },
      { day: 6, startTime: '07:00', endTime: '08:45' }
    ]
  },
  'Grup C': {
    location: 'Grand Equator Hotel Bontang',
    sessions: [
      { day: 6, startTime: '16:00', endTime: '17:45' },
      { day: 0, startTime: '08:00', endTime: '09:30' }
    ]
  }
};

const ScheduleEngine = (function () {
  'use strict';

  const STATUS = { PENDING: 'Pending', AKTIF: 'Aktif', SELESAI: 'Selesai', CANCEL: 'Cancel' };

  const MANUAL_OPTIONS = [
    { value: '',        label: 'Otomatis (mengikuti waktu)' },
    { value: 'Aktif',   label: 'Aktif — absensi dibuka paksa' },
    { value: 'Pending', label: 'Pending — absensi ditahan' },
    { value: 'Cancel',  label: 'Cancel — sesi dibatalkan' }
  ];

  function durasiMenit() {
    const n = parseInt((typeof CONFIG !== 'undefined' && CONFIG.SESI_DURASI_MENIT), 10);
    return isNaN(n) ? 120 : n;
  }

  function horizonHari() {
    const n = parseInt((typeof CONFIG !== 'undefined' && CONFIG.JADWAL_HORIZON_HARI), 10);
    return isNaN(n) ? 120 : n;
  }

  /** Jam mulai sebuah baris jadwal, dengan fallback membaca kolom "Pukul". */
  function jamMulai(jadwal) {
    return WITA.toHHMM(jadwal.Jam_Mulai) || WITA.startTimeOf(jadwal.Pukul) || '00:00';
  }

  /** Rentang waktu absensi sebuah jadwal dalam epoch ms absolut. */
  function windowOf(jadwal) {
    const start = WITA.epochOf(jadwal.Tanggal, jamMulai(jadwal));
    if (isNaN(start)) return null;
    const menit = parseInt(jadwal.Durasi_Menit, 10) || durasiMenit();
    return { start, end: start + menit * 60000, menit };
  }

  /**
   * Status efektif sebuah jadwal pada saat ini (atau pada `atMs` tertentu).
   * @returns {{status:string, auto:string, manual:string, isManual:boolean,
   *            canAttend:boolean, opensAt:number, closesAt:number, countdown:string}}
   */
  function evaluate(jadwal, atMs) {
    const now = (typeof atMs === 'number') ? atMs : Date.now();
    const manual = String(jadwal.Status_Manual || '').trim();
    const win = windowOf(jadwal);

    let auto = STATUS.PENDING;
    if (win) {
      if (now >= win.end) auto = STATUS.SELESAI;
      else if (now >= win.start) auto = STATUS.AKTIF;
    }

    const status = manual || auto;
    const isCancel = status === STATUS.CANCEL;

    return {
      status,
      auto,
      manual,
      isManual: !!manual,
      canAttend: !isCancel && status === STATUS.AKTIF,
      opensAt: win ? win.start : NaN,
      closesAt: win ? win.end : NaN,
      countdown: win ? countdownLabel(win, now, status) : ''
    };
  }

  function countdownLabel(win, now, status) {
    if (status === STATUS.CANCEL) return 'Sesi dibatalkan';
    if (now < win.start) {
      const mins = Math.round((win.start - now) / 60000);
      if (mins > 1440) return 'Dibuka ' + Math.round(mins / 1440) + ' hari lagi';
      if (mins > 60)   return 'Dibuka ' + Math.floor(mins / 60) + ' jam lagi';
      if (mins > 0)    return 'Dibuka ' + mins + ' menit lagi';
      return 'Segera dibuka';
    }
    if (now < win.end) {
      const mins = Math.round((win.end - now) / 60000);
      if (mins > 60) return 'Absensi tutup ' + Math.floor(mins / 60) + ' jam lagi';
      return 'Absensi tutup ' + Math.max(mins, 1) + ' menit lagi';
    }
    return 'Absensi sudah ditutup';
  }

  /** Label rentang jam yang ditampilkan ke pengguna, mis. "16:00 - 18:00 WITA". */
  function jamLabel(jadwal) {
    const start = jamMulai(jadwal);
    const win = windowOf(jadwal);
    if (!win) return jadwal.Pukul || '-';
    const endClock = WITA.toWitaClock(win.end);
    const end = String(endClock.getUTCHours()).padStart(2, '0') + ':' +
                String(endClock.getUTCMinutes()).padStart(2, '0');
    return start + ' - ' + end + ' ' + CONFIG.TIMEZONE_LABEL;
  }

  /* =================================================================
     PEMBUATAN JADWAL
     ================================================================= */

  /** Kunci unik sebuah sesi kelas: kelas + tanggal + jam mulai. */
  function keyOf(kelas, isoDate, hhmm) { return kelas + '|' + isoDate + '|' + hhmm; }

  /** Indeks jadwal kelas yang sudah ada, untuk mencegah duplikasi. */
  function existingKeys(allJadwal) {
    const set = new Set();
    (allJadwal || []).forEach((j) => {
      if (j.Id_Peserta) return;                       // jadwal personal tidak dihitung
      const iso = WITA.toISODate(j.Tanggal);
      if (!iso) return;
      set.add(keyOf(j.Kelas, iso, jamMulai(j)));
    });
    return set;
  }

  function genId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * Bangun baris Jadwal kelas yang BELUM ada untuk satu periode pelatihan.
   * Murni kalkulasi; pemanggil yang bertanggung jawab menyimpannya.
   *
   * @param {object}   periode        { Kelas, Tanggal_Mulai, Tanggal_Akhir, Id_Enrollment }
   * @param {object[]} allJadwal      seluruh jadwal yang sudah ada (dari cache lokal)
   * @param {string}   idPelatih      pelatih default untuk baris baru
   * @param {object}   opts           { horizonHari, keys } — keys dipakai saat batch
   * @returns {object[]} baris Jadwal baru
   */
  function build(periode, allJadwal, idPelatih, opts) {
    const o = opts || {};
    if (!periode || !periode.Kelas) return [];

    const rules = SCHEDULE_RULES[periode.Kelas];
    if (!rules) return [];

    const startISO = WITA.toISODate(periode.Tanggal_Mulai);
    const endISO   = WITA.toISODate(periode.Tanggal_Akhir);
    if (!startISO || !endISO) return [];

    // Mulai dari hari ini bila periode sudah berjalan — tidak ada gunanya
    // membuat jadwal untuk tanggal yang sudah lewat.
    const todayISO = WITA.todayISO();
    const from = (WITA.diffDays(startISO, todayISO) > 0) ? todayISO : startISO;

    // Batasi seberapa jauh ke depan jadwal dibuat sekaligus.
    const horizonISO = WITA.addDays(todayISO, o.horizonHari || horizonHari());
    const to = (WITA.diffDays(endISO, horizonISO) < 0) ? horizonISO : endISO;

    if (WITA.diffDays(from, to) < 0) return [];

    const keys = o.keys || existingKeys(allJadwal);
    const rows = [];

    let cursor = from;
    let guard = 0;
    while (WITA.diffDays(cursor, to) >= 0 && guard++ < 3000) {
      const dow = WITA.dayOfWeek(cursor);
      rules.sessions.forEach((s) => {
        if (s.day !== dow) return;
        const k = keyOf(periode.Kelas, cursor, s.startTime);
        if (keys.has(k)) return;
        keys.add(k);
        rows.push({
          Id_Jadwal: genId('JDW'),
          Id_Pelatih: idPelatih || '',
          Id_Peserta: '',
          Tanggal: cursor,
          Pukul: s.startTime + ' - ' + s.endTime,
          Jam_Mulai: s.startTime,
          Durasi_Menit: durasiMenit(),
          Lokasi: rules.location,
          Kelas: periode.Kelas,
          Status: STATUS.PENDING,
          Status_Manual: '',
          Id_Enrollment: periode.Id_Enrollment || ''
        });
      });
      cursor = WITA.addDays(cursor, 1);
    }
    return rows;
  }

  /**
   * Bangun jadwal untuk BANYAK periode sekaligus tanpa duplikasi antar
   * periode (dipakai saat top-up berkala di panel admin).
   */
  function buildMany(periodeList, allJadwal, idPelatih, opts) {
    const keys = existingKeys(allJadwal);
    const out = [];
    (periodeList || []).forEach((p) => {
      build(p, allJadwal, idPelatih, Object.assign({}, opts, { keys })).forEach((r) => out.push(r));
    });
    return out;
  }

  /**
   * Grup mana saja yang berlatih pada satu tanggal, menurut SCHEDULE_RULES.
   *
   * Dipakai untuk menentukan tampilan default panel admin: pelatih hampir
   * selalu bekerja dengan grup yang berlatih HARI ITU, jadi grup tersebut
   * ditampilkan lebih dulu tanpa perlu memfilter manual.
   * Contoh: Senin -> Grup A, Selasa -> Grup B, Sabtu -> ketiganya,
   * Jumat -> tidak ada (mengembalikan array kosong).
   *
   * @param {string} isoDate default: hari ini menurut WITA
   * @returns {string[]} nama grup, terurut sesuai urutan aturan
   */
  function groupsOnDay(isoDate) {
    const dow = WITA.dayOfWeek(isoDate || WITA.todayISO());
    if (dow < 0) return [];
    return Object.keys(SCHEDULE_RULES)
      .filter((kelas) => SCHEDULE_RULES[kelas].sessions.some((s) => s.day === dow));
  }

  /**
   * Apakah sebuah jadwal kelas berada di dalam periode pelatihan tertentu?
   * Inilah yang menjamin peserta hanya melihat jadwal sesuai durasi yang
   * ia daftarkan — termasuk ketika ia punya beberapa periode terpisah.
   */
  function inPeriode(jadwal, periode) {
    const tgl = WITA.toISODate(jadwal.Tanggal);
    if (!tgl) return false;
    if (periode.Kelas && jadwal.Kelas !== periode.Kelas) return false;
    const start = WITA.toISODate(periode.Tanggal_Mulai);
    const end   = WITA.toISODate(periode.Tanggal_Akhir);
    if (start && WITA.diffDays(start, tgl) < 0) return false;
    if (end   && WITA.diffDays(tgl, end)   < 0) return false;
    return true;
  }

  return {
    STATUS, MANUAL_OPTIONS, RULES: SCHEDULE_RULES,
    evaluate, windowOf, jamMulai, jamLabel, durasiMenit, horizonHari,
    build, buildMany, existingKeys, inPeriode, groupsOnDay, genId
  };
})();
