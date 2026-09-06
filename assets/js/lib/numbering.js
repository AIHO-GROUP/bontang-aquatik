/**
 * ===================================================================
 * numbering.js — Nomor peserta otomatis (DDMMYY + urut 4 digit)
 * ===================================================================
 * Aturan:
 *   • 6 digit pertama  = tanggal lahir peserta dalam format DDMMYY.
 *     Bagian ini DITENTUKAN SISTEM dan tidak dapat diubah admin.
 *   • 4 digit terakhir = nomor urut pendaftaran yang ditetapkan sistem.
 *     Admin boleh mengoreksinya secara manual; bila nomor urut tersebut
 *     sudah dipakai peserta lain, sistem menolak dan menunjukkan peserta
 *     mana yang memakainya agar bisa diperbaiki.
 *
 * Contoh: lahir 05-03-2015, pendaftar ke-12  ->  0503150012
 *
 * Tidak ada tombol "Generate" di mana pun: nomor dibuat otomatis saat
 * peserta mendaftar, dan dapat dinormalisasi massal oleh koordinator
 * untuk data lama yang formatnya belum sesuai.
 */
const Numbering = (function () {
  'use strict';

  const SEQ_KEY = 'NOMOR_SEQ';
  const PATTERN = /^[0-9]{10}$/;

  /** Bagian DDMMYY dari tanggal lahir. '' bila tanggal tidak valid. */
  function prefixOf(tanggalLahir) {
    const iso = WITA.toISODate(tanggalLahir);
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return d + m + y.slice(-2);
  }

  function padUrut(n) { return String(Math.max(0, parseInt(n, 10) || 0)).padStart(4, '0'); }

  /** Rakit nomor lengkap dari tanggal lahir + nomor urut. */
  function compose(tanggalLahir, urut) {
    const p = prefixOf(tanggalLahir);
    return p ? p + padUrut(urut) : '';
  }

  /** Pecah nomor lengkap menjadi { prefix, urut }. */
  function parse(nomor) {
    const s = String(nomor || '').trim();
    if (!PATTERN.test(s)) return null;
    return { prefix: s.slice(0, 6), urut: parseInt(s.slice(6), 10) };
  }

  /** Apakah nomor sudah sesuai format DDMMYY + 4 digit untuk peserta ini? */
  function isValidFor(nomor, tanggalLahir) {
    const parsed = parse(nomor);
    if (!parsed) return false;
    const expected = prefixOf(tanggalLahir);
    return !!expected && parsed.prefix === expected;
  }

  /** Nomor urut tertinggi yang sedang dipakai di seluruh data peserta. */
  function maxUrut(pesertaList) {
    let max = 0;
    (pesertaList || []).forEach((p) => {
      const n = parseInt(p.Nomor_Urut, 10);
      if (!isNaN(n) && n > max) max = n;
      const parsed = parse(p.Nomor_Peserta);
      if (parsed && parsed.urut > max) max = parsed.urut;
    });
    return max;
  }

  /**
   * Nomor urut berikutnya yang bebas pakai.
   * Counter Settings dipakai sebagai titik awal, lalu digeser sampai
   * benar-benar tidak bentrok dengan data peserta yang ada.
   */
  function nextUrut(pesertaList, settings, excludeId) {
    const used = usedUrutSet(pesertaList, excludeId);
    let seq = parseInt((settings || {})[SEQ_KEY], 10);
    if (isNaN(seq) || seq < 0) seq = 0;
    const ceiling = Math.max(seq, maxUrut(pesertaList));
    let candidate = ceiling + 1;
    let guard = 0;
    while (used.has(candidate) && guard++ < 100000) candidate += 1;
    return candidate;
  }

  /** Himpunan nomor urut yang sudah dipakai. */
  function usedUrutSet(pesertaList, excludeId) {
    const set = new Set();
    (pesertaList || []).forEach((p) => {
      if (excludeId && p.Id_Peserta === excludeId) return;
      const n = parseInt(p.Nomor_Urut, 10);
      if (!isNaN(n)) set.add(n);
      const parsed = parse(p.Nomor_Peserta);
      if (parsed) set.add(parsed.urut);
    });
    return set;
  }

  /**
   * Cari peserta lain yang sudah memakai nomor urut tertentu.
   * Dipakai untuk menampilkan tombol "Buka data peserta tersebut".
   * @returns {object|null} record Peserta pemilik nomor, bila ada
   */
  function findConflict(pesertaList, urut, excludeId) {
    const target = parseInt(urut, 10);
    if (isNaN(target)) return null;
    return (pesertaList || []).find((p) => {
      if (excludeId && p.Id_Peserta === excludeId) return false;
      if (parseInt(p.Nomor_Urut, 10) === target) return true;
      const parsed = parse(p.Nomor_Peserta);
      return !!parsed && parsed.urut === target;
    }) || null;
  }

  /** Peserta yang nomornya belum mengikuti format resmi (butuh normalisasi). */
  function nonConforming(pesertaList) {
    return (pesertaList || []).filter((p) => !isValidFor(p.Nomor_Peserta, p.Tanggal_Lahir));
  }

  /**
   * Rencana normalisasi massal: memberi nomor sesuai format kepada semua
   * peserta yang belum punya, mengikuti urutan pendaftaran. Nomor lama
   * dikembalikan agar pemanggil dapat mengarsipkannya (tidak dibuang).
   * @returns {Array<{id, nama, lama, baru, urut}>}
   */
  function planNormalization(pesertaList, settings) {
    const used = usedUrutSet(pesertaList, null);
    let seq = Math.max(parseInt((settings || {})[SEQ_KEY], 10) || 0, maxUrut(pesertaList));

    return nonConforming(pesertaList)
      .slice()
      .sort((a, b) => new Date(a.Created_At || 0) - new Date(b.Created_At || 0))
      .map((p) => {
        const prefix = prefixOf(p.Tanggal_Lahir);
        if (!prefix) {
          return {
            id: p.Id_Peserta, nama: p.Nama_Lengkap,
            lama: p.Nomor_Peserta || '', baru: '', urut: null,
            error: 'Tanggal lahir tidak valid'
          };
        }
        do { seq += 1; } while (used.has(seq));
        used.add(seq);
        return {
          id: p.Id_Peserta,
          nama: p.Nama_Lengkap,
          lama: p.Nomor_Peserta || '',
          baru: prefix + padUrut(seq),
          urut: seq
        };
      });
  }

  return {
    SEQ_KEY, PATTERN,
    prefixOf, padUrut, compose, parse, isValidFor,
    maxUrut, nextUrut, usedUrutSet, findConflict, nonConforming, planNormalization
  };
})();
