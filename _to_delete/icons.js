/**
 * ===================================================================
 * lib/icons.js — Pustaka ikon SVG tunggal untuk seluruh aplikasi
 * ===================================================================
 * Menggantikan emoji yang sebelumnya tersebar di markup. Emoji dirender
 * berbeda di tiap sistem operasi (Windows, Android, iOS punya bentuk dan
 * warna sendiri), tidak mewarisi warna teks, tidak menyesuaikan tema
 * gelap, dan pada pembaca layar dibacakan sebagai nama karakter yang
 * membingungkan. Ikon SVG di sini memakai `currentColor` sehingga selalu
 * senada dengan teks di sekitarnya dan tajam pada resolusi berapa pun.
 *
 * Pemakaian:
 *   Ikon.get('kalender')            -> <svg> ukuran default (18px)
 *   Ikon.get('kalender', 22)        -> ukuran khusus
 *   Ikon.get('kalender', 18, 'cls') -> dengan kelas CSS tambahan
 *
 * Maskot grup latihan (lumba-lumba, hiu, kura-kura) TIDAK ada di sini:
 * ketiganya sengaja tetap memakai emoji karena berfungsi sebagai ilustrasi
 * berwarna yang ramah anak pada halaman depan, bukan sebagai ikon antarmuka.
 *
 * Seluruh ikon: garis tunggal, stroke 1.8, viewBox 24x24, tanpa fill —
 * satu bahasa visual dengan sprite ikon di admin.html.
 */
const Ikon = (function () {
  'use strict';

  /* Jalur setiap ikon; dibungkus <svg> saat diminta agar ukuran & kelas
     dapat ditentukan pemanggil tanpa menduplikasi markup.

     Daftar ini sengaja hanya berisi ikon yang benar-benar dipanggil di
     suatu tempat. Menyimpan ikon "untuk berjaga-jaga" membuat berkas ini
     tumbuh tanpa batas dan menyulitkan penelusuran ikon mana yang
     sebenarnya tampil di layar. */
  const PATHS = {
    kalender:   '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
    jam:        '<circle cx="12" cy="12" r="9.2"/><path d="M12 6.8V12l3.4 2"/>',
    lokasi:     '<path d="M12 21.5s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10.5" r="2.6"/>',
    info:       '<circle cx="12" cy="12" r="9.2"/><path d="M12 11v5.4M12 7.7v.2"/>',
    peringatan: '<path d="M12 3.4 21.3 19.6H2.7L12 3.4z"/><path d="M12 9.6v4.3M12 16.8v.2"/>',
    dokumen:    '<path d="M14 2.8H6.8A2 2 0 0 0 4.8 4.8v14.4a2 2 0 0 0 2 2h10.4a2 2 0 0 0 2-2V8z"/><path d="M14 2.8V8h5.2"/><path d="M8.8 13h6.4M8.8 16.6h4.4"/>',
    rapor:      '<path d="M5 4.2A2 2 0 0 1 7 2.2h11.2v19.6H7a2 2 0 0 1-2-2z"/><path d="M5 17.8h13.2"/><path d="M9 6.6h5.6M9 10h5.6"/>',
    grafik:     '<path d="M3.5 3.5v17h17"/><path d="M7 15.5l3.6-4.4 3.2 2.6 4.6-6"/>',
    history:    '<path d="M3.4 12a8.6 8.6 0 1 0 2.6-6.1"/><path d="M3.2 3.6v4.6h4.6"/><path d="M12 7.6V12l3 1.8"/>',
    unduh:      '<path d="M21 15.2v3.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3.6"/><path d="M7.4 10.2 12 14.8l4.6-4.6"/><path d="M12 14.8V3.4"/>',
    lampiran:   '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    tautan:     '<path d="M10.6 13.4a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1.2 1.2"/><path d="M13.4 10.6a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1.2-1.2"/>',
    cek:        '<path d="M20 6.5 9.5 17 4.4 12"/>',
    gembok:     '<rect x="4.4" y="10.4" width="15.2" height="11.2" rx="2.4"/><path d="M8 10.4V7.6a4 4 0 0 1 8 0v2.8"/>',
    pengguna2:  '<path d="M16.5 21v-1.8a4 4 0 0 0-4-4H6.4a4 4 0 0 0-4 4V21"/><circle cx="9.45" cy="7.2" r="3.8"/><path d="M21.6 21v-1.8a4 4 0 0 0-3-3.87M16.2 3.5a4 4 0 0 1 0 7.75"/>',
    cari:       '<circle cx="11" cy="11" r="7.2"/><path d="M21 21l-4.35-4.35"/>',
    kirim:      '<path d="M21.5 2.5 11 13"/><path d="M21.5 2.5 14.8 21.5l-3.8-8.5-8.5-3.8z"/>',
    catatan:    '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    obrolan:    '<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.2-5.2A8.5 8.5 0 1 1 21 11.5z"/>',
    amplop:     '<rect x="2.8" y="4.6" width="18.4" height="14.8" rx="2"/><path d="M3.4 6.2 12 12.6l8.6-6.4"/>',
    bintang:    '<path d="M12 2.8l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.65l-5.81 3.05L7.3 14.23 2.6 9.65l6.5-.95z"/>',
    grid:       '<rect x="3.2" y="3.2" width="7.4" height="7.4" rx="1.6"/><rect x="13.4" y="3.2" width="7.4" height="7.4" rx="1.6"/><rect x="3.2" y="13.4" width="7.4" height="7.4" rx="1.6"/><rect x="13.4" y="13.4" width="7.4" height="7.4" rx="1.6"/>',
    daftar:     '<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12"/><path d="M3.6 6.5h.2M3.6 12h.2M3.6 17.5h.2"/>',
    tabel:      '<rect x="3.2" y="4.4" width="17.6" height="15.2" rx="2"/><path d="M3.2 9.6h17.6M3.2 14.6h17.6M9.6 4.4v15.2"/>',
    terang:     '<circle cx="12" cy="12" r="4.4"/><path d="M12 2.4v2.6M12 19v2.6M4.2 4.2l1.85 1.85M17.95 17.95 19.8 19.8M2.4 12H5M19 12h2.6M4.2 19.8l1.85-1.85M17.95 6.05 19.8 4.2"/>',
    gelap:      '<path d="M20.5 14.4A8.6 8.6 0 0 1 9.6 3.5a8.6 8.6 0 1 0 10.9 10.9z"/>',
    kotak_masuk:'<path d="M3.2 12.8h4.6l1.6 2.8h5.2l1.6-2.8h4.6"/><path d="M5.3 4.6h13.4l2.5 8.2v4.6a2 2 0 0 1-2 2H4.8a2 2 0 0 1-2-2v-4.6z"/>',
    corong:     '<path d="M3.4 9.6v4.8h3.6l6.4 4.2V5.4L7 9.6z"/><path d="M17.4 8.6a5 5 0 0 1 0 6.8"/><path d="M20.2 6.2a8.6 8.6 0 0 1 0 11.6"/>',
    piala:      '<path d="M7.6 3.6h8.8v5a4.4 4.4 0 1 1-8.8 0z"/><path d="M7.6 5.4H4.8a2.6 2.6 0 0 0 2.8 4.4"/><path d="M16.4 5.4h2.8a2.6 2.6 0 0 1-2.8 4.4"/><path d="M12 13v4M8.8 20.4h6.4"/>',
    ombak:      '<path d="M2.4 16.8c2 0 2-1.2 4-1.2s2 1.2 4 1.2 2-1.2 4-1.2 2 1.2 4 1.2 2-1.2 3.2-1.2"/><path d="M2.4 11.6c2 0 2-1.2 4-1.2s2 1.2 4 1.2 2-1.2 4-1.2 2 1.2 4 1.2 2-1.2 3.2-1.2"/><path d="M2.4 6.4c2 0 2-1.2 4-1.2s2 1.2 4 1.2 2-1.2 4-1.2 2 1.2 4 1.2 2-1.2 3.2-1.2"/>',
    hadir:      '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
    mata:       '<path d="M2.2 12C4.2 7.6 7.8 5.2 12 5.2s7.8 2.4 9.8 6.8c-2 4.4-5.6 6.8-9.8 6.8S4.2 16.4 2.2 12z"/><circle cx="12" cy="12" r="3.1"/>'
  };

  /**
   * @param {string} nama kunci pada PATHS
   * @param {number} [ukuran=18] lebar & tinggi dalam px
   * @param {string} [kelas] kelas CSS tambahan
   * @returns {string} markup <svg>; string kosong bila nama tidak dikenal
   */
  function get(nama, ukuran, kelas) {
    const d = PATHS[nama];
    if (!d) return '';
    const s = ukuran || 18;
    return '<svg class="ikon' + (kelas ? ' ' + kelas : '') + '" width="' + s + '" height="' + s + '" ' +
      'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
  }

  function has(nama) { return Object.prototype.hasOwnProperty.call(PATHS, nama); }

  return { get, has };
})();

if (typeof window !== 'undefined') window.Ikon = Ikon;
