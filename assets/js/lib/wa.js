/**
 * ===================================================================
 * wa.js — Pesan WhatsApp ke admin, selalu membawa identitas peserta
 * ===================================================================
 * Aturan produk: SETIAP tautan ke WhatsApp admin harus sudah berisi
 * identitas peserta yang bersangkutan, sehingga admin tidak perlu lagi
 * bertanya "ini peserta yang mana?".
 *
 * Semua template dibangun lewat modul ini agar formatnya konsisten,
 * profesional, dan mudah diubah di satu tempat.
 */
const WA = (function () {
  'use strict';

  const ADMIN = () => (CONFIG.CONTACT && CONFIG.CONTACT.whatsapp) || '';

  function digits(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }

  /** Bangun URL wa.me lengkap dengan pesan ter-encode. */
  function link(message, phone) {
    const target = digits(phone || ADMIN());
    return 'https://wa.me/' + target + '?text=' + encodeURIComponent(message);
  }

  /** Buka WhatsApp di tab baru. */
  function open(message, phone) {
    window.open(link(message, phone), '_blank', 'noopener');
  }

  /**
   * Blok identitas standar. Menerima record Peserta (kolom database) atau
   * objek sesi ringkas — keduanya dipetakan ke bentuk yang sama.
   */
  function identityLines(peserta) {
    const p = peserta || {};
    const nama    = p.Nama_Lengkap   || p.nama          || '-';
    const nomor   = p.Nomor_Peserta  || p.nomor_peserta || '';
    const kelas   = p.Kelas          || p.kelas         || '';
    const user    = p.Username       || p.username      || '';
    const wa      = p.Nomor_Whatsapp || p.nomor_whatsapp || '';
    const mulai   = p.Tanggal_Mulai  || p.tanggal_mulai || '';
    const akhir   = p.Tanggal_Akhir  || p.tanggal_akhir || '';

    const lines = ['*Data Peserta*', 'Nama          : ' + nama];
    if (nomor) lines.push('No. Peserta   : ' + nomor);
    if (kelas) lines.push('Grup Latihan  : ' + kelas);
    if (user)  lines.push('Username      : ' + user);
    if (wa)    lines.push('No. WhatsApp  : ' + wa);
    if (mulai && akhir) {
      lines.push('Periode       : ' + WITA.formatDate(mulai) + ' s.d ' + WITA.formatDate(akhir));
    }
    return lines.join('\n');
  }

  function compose(salam, isi, peserta, penutup) {
    const parts = [salam, '', identityLines(peserta), '', isi];
    if (penutup) parts.push('', penutup);
    return parts.join('\n');
  }

  /* =================================================================
     TEMPLATE PER KEPERLUAN
     ================================================================= */
  const Templates = {
    /** Setelah registrasi berhasil — peserta diarahkan ke admin untuk pembayaran. */
    registrasi(peserta) {
      return compose(
        'Halo Admin Bontang Akuatik,',
        'Saya baru saja menyelesaikan pendaftaran pelatihan renang melalui aplikasi. ' +
        'Mohon informasi mengenai proses pembayaran agar akun saya dapat segera diaktifkan. Terima kasih.',
        peserta
      );
    },

    /** Peserta sudah login tetapi pembayaran belum dikonfirmasi. */
    konfirmasiPembayaran(peserta) {
      return compose(
        'Halo Admin Bontang Akuatik,',
        'Saya ingin mengonfirmasi status pembayaran pelatihan renang saya. ' +
        'Saat ini akun saya masih tercatat *belum lunas* sehingga jadwal latihan belum dapat diakses. ' +
        'Mohon dibantu proses verifikasinya. Terima kasih.',
        peserta
      );
    },

    /** Perpanjangan / bergabung kembali. */
    perpanjangan(peserta, opts) {
      const o = opts || {};
      const detail = [];
      if (o.durasi) detail.push('Durasi diminta : ' + o.durasi + ' bulan');
      if (o.kelas)  detail.push('Grup diminta   : ' + o.kelas);
      if (o.mulai)  detail.push('Mulai dari     : ' + WITA.formatDate(o.mulai));
      return compose(
        'Halo Admin Bontang Akuatik,',
        'Saya ingin *memperpanjang / melanjutkan* periode pelatihan renang saya.' +
        (detail.length ? '\n\n*Permintaan*\n' + detail.join('\n') : '') +
        '\n\nMohon dibantu proses konfirmasi dan pembayarannya. Terima kasih.',
        peserta
      );
    },

    /** Peserta butuh bantuan reset password (fallback bila email OTP bermasalah). */
    bantuanPassword(peserta) {
      return compose(
        'Halo Admin Bontang Akuatik,',
        'Saya mengalami kendala saat melakukan reset password melalui aplikasi ' +
        '(kode OTP tidak diterima di email). Mohon dibantu untuk memulihkan akses akun saya. Terima kasih.',
        peserta
      );
    },

    /** Pengaduan / pertanyaan umum. */
    pengaduan(peserta, pesan) {
      const isi = String(pesan || '').trim() || '(mohon dijelaskan kebutuhan Anda)';
      return compose(
        'Halo Admin Bontang Akuatik,',
        'Saya ingin menyampaikan hal berikut:\n\n' + isi,
        peserta,
        'Terima kasih atas bantuannya.'
      );
    },

    /** Admin menghubungi peserta (dipakai dari panel admin). */
    adminKePeserta(peserta, pesan) {
      const nama = (peserta && (peserta.Nama_Lengkap || peserta.nama)) || 'Bapak/Ibu';
      const isi  = String(pesan || '').trim() ||
        'Kami ingin menyampaikan informasi terkait pelatihan renang putra/putri Bapak/Ibu.';
      return [
        'Halo, selamat siang.',
        '',
        'Kami dari *' + CONFIG.BRAND_CLUB + '*.',
        'Terkait peserta atas nama *' + nama + '*' +
          ((peserta && (peserta.Nomor_Peserta || peserta.nomor_peserta))
            ? ' (No. Peserta ' + (peserta.Nomor_Peserta || peserta.nomor_peserta) + ')' : '') + ':',
        '',
        isi,
        '',
        'Terima kasih atas perhatiannya.'
      ].join('\n');
    },

    /** Calon peserta dari halaman publik (belum punya identitas peserta). */
    calonPeserta() {
      return [
        'Halo Admin Bontang Akuatik,',
        '',
        'Saya tertarik untuk bergabung dengan kelas pelatihan renang. ' +
        'Mohon informasi mengenai jadwal, kelompok latihan, dan proses pendaftarannya. Terima kasih.'
      ].join('\n');
    },

    /** Rekomendasi ke teman (dikirim ke nomor mana pun). */
    rekomendasi() {
      return 'Saya merekomendasikan pelatihan renang di *' + CONFIG.BRAND_CLUB + '*. ' +
             'Kunjungi bontangaquatik.com untuk informasi jadwal dan pendaftaran.';
    }
  };

  /** Shortcut: bangun URL langsung dari nama template. */
  function url(templateName, ...args) {
    const fn = Templates[templateName];
    if (typeof fn !== 'function') return link('Halo Admin Bontang Akuatik,');
    return link(fn.apply(Templates, args));
  }

  return { link, open, url, identityLines, compose, Templates, digits };
})();
