/**
 * ===================================================================
 * lib/rapor-stat.js — Perhitungan riwayat & perkembangan rapor
 * ===================================================================
 * Modul murni: tidak menyentuh DOM, tidak menyentuh jaringan, tidak
 * bergantung pada Store. Menerima daftar baris Rapor apa adanya lalu
 * mengubahnya menjadi deret angka yang siap digambar.
 *
 * Catatan waktu disimpan sebagai teks `mm.ss.ms` (contoh `01.08.12`
 * berarti 1 menit 8 detik 12 perseratus). Format teks dipertahankan agar
 * pelatih dapat menuliskan apa adanya dari stopwatch, jadi konversi ke
 * angka dilakukan di sini — satu tempat, dipakai grafik maupun ringkasan.
 *
 * Arah perbaikan: pada olahraga renang waktu yang LEBIH KECIL berarti
 * LEBIH BAIK. Seluruh perhitungan di file ini mengikuti aturan itu.
 */
const RaporStat = (function () {
  'use strict';

  /** Tiga kategori jarak yang dinilai, sesuai kolom tabel Rapor. */
  const JARAK = [
    { key: 'p25', label: '25 M (Dengan Pelampung)', short: '25 M Pelampung', suffix: '_Pelampung', prefix: 'Waktu_25_' },
    { key: 'm25', label: '25 M (Tanpa Pelampung)', short: '25 M', suffix: '', prefix: 'Waktu_25_' },
    { key: 'm50', label: '50 M', short: '50 M', suffix: '', prefix: 'Waktu_50_' }
  ];

  function kolom(jarakKey, gayaKey) {
    const j = JARAK.find((x) => x.key === jarakKey);
    if (!j) return null;
    return j.prefix + gayaKey + j.suffix;
  }

  /**
   * `mm.ss.ms` -> total detik (angka desimal). Toleran terhadap masukan
   * lama yang memakai titik dua atau hanya berisi detik.
   * @returns {number|null} null bila tidak berisi angka yang masuk akal
   */
  function parseWaktu(teks) {
    if (teks == null) return null;
    const s = String(teks).trim();
    if (!s || s === '-') return null;

    const bagian = s.split(/[:.]/).map((x) => x.trim());
    if (!bagian.length || bagian.some((x) => x !== '' && !/^\d+$/.test(x))) return null;

    let menit = 0, detik = 0, seperseratus = 0;
    if (bagian.length === 1) {
      detik = Number(bagian[0] || 0);
    } else if (bagian.length === 2) {
      menit = Number(bagian[0] || 0);
      detik = Number(bagian[1] || 0);
    } else {
      menit = Number(bagian[0] || 0);
      detik = Number(bagian[1] || 0);
      // Dua digit = perseratus detik; tiga digit = perseribu.
      const raw = bagian[2] || '0';
      seperseratus = raw.length >= 3 ? Number(raw) / 10 : Number(raw);
    }

    const total = menit * 60 + detik + seperseratus / 100;
    if (!isFinite(total) || total <= 0) return null;
    return Math.round(total * 100) / 100;
  }

  /** Kebalikan parseWaktu; dipakai pada sumbu grafik dan label ringkasan. */
  function formatWaktu(detikTotal) {
    if (detikTotal == null || !isFinite(detikTotal)) return '-';
    const bulat = Math.max(0, Math.round(detikTotal * 100));
    const menit = Math.floor(bulat / 6000);
    const detik = Math.floor((bulat % 6000) / 100);
    const ss = bulat % 100;
    const pad = (n) => String(n).padStart(2, '0');
    return pad(menit) + '.' + pad(detik) + '.' + pad(ss);
  }

  /** Selisih waktu yang enak dibaca, mis. "-3,40 dtk". */
  function formatSelisih(detik) {
    if (detik == null || !isFinite(detik)) return '-';
    const tanda = detik > 0 ? '+' : (detik < 0 ? '-' : '');
    return tanda + Math.abs(detik).toFixed(2).replace('.', ',') + ' dtk';
  }

  /**
   * Urutkan baris rapor dari yang paling lama ke paling baru.
   * Baris tanpa tanggal ditaruh paling awal agar tidak menutupi data
   * bertanggal pada ujung kanan grafik.
   */
  function urutkan(daftar) {
    return (daftar || []).slice().sort((a, b) => {
      const ta = String(a && a.Tanggal_Rapor || '');
      const tb = String(b && b.Tanggal_Rapor || '');
      if (!ta && !tb) return 0;
      if (!ta) return -1;
      if (!tb) return 1;
      return ta.localeCompare(tb);
    });
  }

  /**
   * Bangun deret untuk satu kategori jarak.
   *
   * @param {object[]} daftarRapor baris Rapor milik satu peserta
   * @param {string}   jarakKey    'p25' | 'm25' | 'm50'
   * @param {object[]} gayaList    CONFIG.GAYA_RENANG
   * @returns {{labels:string[], tanggal:string[], series:object[], adaData:boolean}}
   *          series[i] = { key, label, values:[number|null], terisi:number }
   */
  function buildSeries(daftarRapor, jarakKey, gayaList) {
    const urut = urutkan(daftarRapor);
    const tanggal = urut.map((r) => String(r.Tanggal_Rapor || ''));

    const series = (gayaList || []).map((g) => {
      const field = kolom(jarakKey, g.key);
      const values = urut.map((r) => parseWaktu(field ? r[field] : null));
      return {
        key: g.key,
        label: g.label,
        values,
        terisi: values.filter((v) => v != null).length
      };
    });

    return {
      tanggal,
      series,
      adaData: series.some((s) => s.terisi > 0)
    };
  }

  /**
   * Ringkasan perkembangan satu deret: catatan pertama, terakhir,
   * terbaik, dan selisih terakhir terhadap yang pertama.
   * @returns {object|null} null bila kurang dari satu catatan
   */
  function ringkasDeret(values) {
    const isi = [];
    (values || []).forEach((v, i) => { if (v != null) isi.push({ i, v }); });
    if (!isi.length) return null;

    const pertama = isi[0];
    const terakhir = isi[isi.length - 1];
    let terbaik = isi[0];
    isi.forEach((x) => { if (x.v < terbaik.v) terbaik = x; });

    // Waktu turun = peserta makin cepat, jadi selisih negatif adalah kemajuan.
    const selisih = isi.length > 1 ? Math.round((terakhir.v - pertama.v) * 100) / 100 : null;
    return {
      jumlah: isi.length,
      pertama: pertama.v,
      terakhir: terakhir.v,
      terbaik: terbaik.v,
      indeksTerbaik: terbaik.i,
      indeksTerakhir: terakhir.i,
      selisih,
      membaik: selisih != null && selisih < 0
    };
  }

  /**
   * Sorotan tingkat peserta: berapa penilaian tercatat, dan pada gaya
   * mana kemajuan waktunya paling besar. Dipakai untuk kartu ringkasan
   * di atas grafik sehingga angka penting terbaca tanpa membaca grafik.
   */
  function sorotan(daftarRapor, jarakKey, gayaList) {
    const bangun = buildSeries(daftarRapor, jarakKey, gayaList);
    let terbaikMembaik = null;

    bangun.series.forEach((s) => {
      const r = ringkasDeret(s.values);
      if (!r || r.selisih == null || r.selisih >= 0) return;
      if (!terbaikMembaik || r.selisih < terbaikMembaik.selisih) {
        terbaikMembaik = { gaya: s.label, selisih: r.selisih, dari: r.pertama, ke: r.terakhir };
      }
    });

    return {
      jumlahPenilaian: (daftarRapor || []).length,
      adaData: bangun.adaData,
      kemajuanTerbaik: terbaikMembaik
    };
  }

  return { JARAK, kolom, parseWaktu, formatWaktu, formatSelisih, urutkan, buildSeries, ringkasDeret, sorotan };
})();

if (typeof window !== 'undefined') window.RaporStat = RaporStat;
