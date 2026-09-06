/**
 * ===================================================================
 * domain/content.js — Berita/informasi & pengaturan sistem
 * ===================================================================
 * Setiap berita mencatat admin pembuatnya sehingga koordinator dapat
 * melihat siapa yang paling aktif menyampaikan informasi. Berita juga
 * mendukung satu lampiran (JPG/JPEG/PNG/PDF/PPTX, maksimal 10 MB).
 */

/** Target audiens berita. */
const BERITA_STATUS = ['Publik', 'Semua Peserta', 'Peserta Grup A', 'Peserta Grup B', 'Peserta Grup C'];

Object.assign(BizLogic, {

  /* =================================================================
     1. BERITA
     ================================================================= */

  /** Nilai kosong/warisan diperlakukan sebagai 'Publik'. */
  normBeritaStatus(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return 'Publik';
    return BERITA_STATUS.find((opt) => BizUtil.norm(opt) === BizUtil.norm(s)) || 'Publik';
  },

  /**
   * @param status   status berita (sudah dinormalisasi)
   * @param audience 'public' | 'admin' | nama kelas ('Grup A', ...)
   */
  beritaVisibleFor(status, audience) {
    if (audience === 'admin')  return true;
    if (audience === 'public') return status === 'Publik';
    if (status === 'Publik' || status === 'Semua Peserta') return true;
    return status === 'Peserta ' + String(audience || '').trim();
  },

  /**
   * Daftar berita.
   *   • tanpa parameter        : SEMUA berita (panel admin)
   *   • { audience: 'public' } : hanya berita Publik (halaman depan)
   *   • { kelas: 'Grup A' }    : Publik + Semua Peserta + Peserta Grup A
   */
  getAllBerita(p) {
    const opts = p || {};
    let audience = 'admin';
    if (opts.audience === 'public') audience = 'public';
    else if (opts.kelas) audience = String(opts.kelas).trim();

    const data = Store.berita()
      .map((b) => {
        const status = this.normBeritaStatus(b.Status);
        const penulis = b.Id_Pelatih ? Store.findPelatih(b.Id_Pelatih) : null;
        return Object.assign({}, b, {
          Tanggal: WITA.toISODate(b.Tanggal),
          Status: status,
          // Nama penulis diambil dari snapshot agar riwayat tetap terbaca
          // meski akun pelatihnya kemudian dinonaktifkan atau berganti nama.
          nama_penulis: b.Nama_Penulis || (penulis ? (penulis.Nama || penulis.Username) : ''),
          peran_penulis: b.Peran_Penulis || (penulis ? CONFIG.ROLE_LABEL[penulis.Role] : ''),
          has_file: !!b.File_Url,
          file_label: this.fileLabel(b)
        });
      })
      .filter((b) => this.beritaVisibleFor(b.Status, audience))
      .sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)));

    return BizUtil.ok('', { data });
  },

  /** Khusus halaman publik. */
  getActiveBerita() { return this.getAllBerita({ audience: 'public' }); },

  fileLabel(b) {
    if (!b || !b.File_Url) return '';
    const tipe = String(b.File_Tipe || '');
    const kb = Number(b.File_Ukuran || 0);
    const ukuran = kb > 1048576 ? (kb / 1048576).toFixed(1) + ' MB'
                 : kb > 0 ? Math.max(1, Math.round(kb / 1024)) + ' KB' : '';
    let jenis = 'Berkas';
    if (tipe.startsWith('image/')) jenis = 'Gambar';
    else if (tipe.includes('pdf')) jenis = 'PDF';
    else if (tipe.includes('presentation') || tipe.includes('powerpoint')) jenis = 'Presentasi';
    return ukuran ? jenis + ' • ' + ukuran : jenis;
  },

  /** Validasi lampiran sebelum diunggah (tipe & ukuran). */
  validateBeritaFile(file) {
    if (!file) return { valid: true };
    const cfg = CONFIG.BERITA_UPLOAD;
    if (file.size > cfg.maxBytes) {
      return { valid: false, message: 'Ukuran berkas maksimal 10 MB. Berkas Anda ' +
        (file.size / 1048576).toFixed(1) + ' MB.' };
    }
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    const tipeOk = cfg.mimeTypes.includes(file.type) || cfg.accept.split(',').includes(ext);
    if (!tipeOk) {
      return { valid: false, message: 'Format berkas tidak didukung. Gunakan JPG, JPEG, PNG, PDF, atau PPTX.' };
    }
    return { valid: true };
  },

  async createBerita(p) {
    if (!Auth.can('kelolaBerita')) return BizUtil.fail('Anda tidak memiliki akses ini.');

    const judul = String(p.judul || '').trim();
    const deskripsi = String(p.deskripsi || '').trim();
    if (!judul || !deskripsi) return BizUtil.fail('Judul dan deskripsi wajib diisi.');

    const penulis = Store.findPelatih(Auth.getId());
    const row = {
      Id_Berita: BizUtil.genId('BRT'),
      Judul: judul,
      Tanggal: WITA.toISODate(p.tanggal) || WITA.todayISO(),
      Deskripsi: deskripsi,
      Link: String(p.link || '').trim(),
      Status: this.normBeritaStatus(p.status),
      Id_Pelatih: Auth.getId() || '',
      Nama_Penulis: penulis ? (penulis.Nama || penulis.Username) : '',
      Peran_Penulis: penulis ? (CONFIG.ROLE_LABEL[penulis.Role] || '') : '',
      File_Url: p.file_url || '',
      File_Nama: p.file_nama || '',
      File_Tipe: p.file_tipe || '',
      File_Ukuran: p.file_ukuran || 0,
      Created_At: BizUtil.nowIso(),
      Updated_At: BizUtil.nowIso()
    };

    const r = await persist('berita', 'create', row);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal membuat berita');

    Store.berita().push(row);
    await cachePut('Berita', row);
    return BizUtil.ok('Berita dipublikasikan', { id: row.Id_Berita });
  },

  async updateBerita(p) {
    if (!Auth.can('kelolaBerita')) return BizUtil.fail('Anda tidak memiliki akses ini.');
    const berita = Store.berita().find((x) => x.Id_Berita === p.id);
    if (!berita) return BizUtil.fail('Berita tidak ditemukan');

    // Pelatih hanya boleh menyunting beritanya sendiri; koordinator bebas.
    if (!Auth.isSuperadmin() && berita.Id_Pelatih && berita.Id_Pelatih !== Auth.getId()) {
      return BizUtil.fail('Berita ini dibuat oleh pelatih lain. Hubungi koordinator bila perlu diubah.');
    }

    const patch = { id: p.id, Updated_At: BizUtil.nowIso() };
    if (p.judul !== undefined)     patch.Judul = String(p.judul).trim();
    if (p.tanggal !== undefined)   patch.Tanggal = WITA.toISODate(p.tanggal);
    if (p.deskripsi !== undefined) patch.Deskripsi = String(p.deskripsi).trim();
    if (p.link !== undefined)      patch.Link = String(p.link).trim();
    if (p.status !== undefined)    patch.Status = this.normBeritaStatus(p.status);

    if (p.file_url !== undefined) {
      patch.File_Url = p.file_url || '';
      patch.File_Nama = p.file_nama || '';
      patch.File_Tipe = p.file_tipe || '';
      patch.File_Ukuran = p.file_ukuran || 0;
    }

    const r = await persist('berita', 'update', patch);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal memperbarui berita');

    // Lampiran lama dibuang dari storage agar kuota tidak terus bertambah.
    if (p.file_url !== undefined && berita.File_Url && berita.File_Url !== patch.File_Url) {
      const path = CrudApi.pathFromPublicUrl(berita.File_Url, CONFIG.BERITA_UPLOAD.bucket);
      if (path) CrudApi.removeFile(CONFIG.BERITA_UPLOAD.bucket, path);
    }

    Object.assign(berita, patch);
    delete berita.id;
    await cachePut('Berita', berita);
    return BizUtil.ok('Berita diperbarui');
  },

  async deleteBerita(p) {
    if (!Auth.can('kelolaBerita')) return BizUtil.fail('Anda tidak memiliki akses ini.');
    const idx = Store.berita().findIndex((x) => x.Id_Berita === p.id);
    if (idx === -1) return BizUtil.fail('Berita tidak ditemukan');

    const berita = Store.berita()[idx];
    if (!Auth.isSuperadmin() && berita.Id_Pelatih && berita.Id_Pelatih !== Auth.getId()) {
      return BizUtil.fail('Berita ini dibuat oleh pelatih lain. Hubungi koordinator bila perlu dihapus.');
    }

    const r = await persist('berita', 'delete', { id: p.id });
    if (!r.success) return BizUtil.fail(r.message || 'Gagal menghapus berita');

    if (berita.File_Url) {
      const path = CrudApi.pathFromPublicUrl(berita.File_Url, CONFIG.BERITA_UPLOAD.bucket);
      if (path) CrudApi.removeFile(CONFIG.BERITA_UPLOAD.bucket, path);
    }

    Store.berita().splice(idx, 1);
    await cacheRemove('Berita', p.id);
    return BizUtil.ok('Berita dihapus');
  },

  /** Statistik keaktifan pelatih dalam menyampaikan informasi. */
  getBeritaStatsByPenulis() {
    const map = new Map();
    Store.berita().forEach((b) => {
      const id = b.Id_Pelatih || '_';
      if (!map.has(id)) {
        const s = id === '_' ? null : Store.findPelatih(id);
        map.set(id, {
          id,
          nama: b.Nama_Penulis || (s ? (s.Nama || s.Username) : 'Tidak diketahui'),
          peran: b.Peran_Penulis || (s ? CONFIG.ROLE_LABEL[s.Role] : ''),
          jumlah: 0,
          terakhir: ''
        });
      }
      const row = map.get(id);
      row.jumlah += 1;
      const tgl = WITA.toISODate(b.Tanggal);
      if (tgl > row.terakhir) row.terakhir = tgl;
    });
    return Array.from(map.values()).sort((a, b) => b.jumlah - a.jumlah);
  },

  /* =================================================================
     2. PENGATURAN SISTEM
     ================================================================= */

  getSettings() {
    const s = Store.settings();
    return BizUtil.ok('', {
      data: {
        nomor_seq: parseInt(s[Numbering.SEQ_KEY], 10) || 0,
        signer_id: s.RAPOR_SIGNER_ID || '',
        signer_nama: s.RAPOR_SIGNER_NAMA || '',
        signer_jabatan: s.RAPOR_SIGNER_JABATAN || 'Koordinator Pelatih',
        horizon_hari: parseInt(s.JADWAL_HORIZON_HARI, 10) || CONFIG.JADWAL_HORIZON_HARI,
        durasi_menit: parseInt(s.SESI_DURASI_MENIT, 10) || CONFIG.SESI_DURASI_MENIT
      }
    });
  },

  async updateSettings(p) {
    if (!Auth.can('kelolaPengaturanSistem')) {
      return BizUtil.fail('Hanya koordinator yang dapat mengubah pengaturan sistem.');
    }
    const patch = {};

    if (p.nomor_seq !== undefined) {
      const n = parseInt(p.nomor_seq, 10);
      if (isNaN(n) || n < 0) return BizUtil.fail('Nomor urut terakhir harus berupa angka 0 atau lebih.');
      patch[Numbering.SEQ_KEY] = String(n);
    }
    if (p.signer_id !== undefined) {
      if (p.signer_id && !Store.findPelatih(p.signer_id)) {
        return BizUtil.fail('Penandatangan yang dipilih tidak ditemukan.');
      }
      patch.RAPOR_SIGNER_ID = p.signer_id || '';
    }
    if (p.signer_nama !== undefined)    patch.RAPOR_SIGNER_NAMA = String(p.signer_nama).trim();
    if (p.signer_jabatan !== undefined) patch.RAPOR_SIGNER_JABATAN = String(p.signer_jabatan).trim();

    if (p.horizon_hari !== undefined) {
      const n = parseInt(p.horizon_hari, 10);
      if (isNaN(n) || n < 30 || n > 730) {
        return BizUtil.fail('Horizon pembuatan jadwal harus antara 30 dan 730 hari.');
      }
      patch.JADWAL_HORIZON_HARI = String(n);
      CONFIG.JADWAL_HORIZON_HARI = n;
    }
    if (p.durasi_menit !== undefined) {
      const n = parseInt(p.durasi_menit, 10);
      if (isNaN(n) || n < 30 || n > 480) {
        return BizUtil.fail('Durasi sesi harus antara 30 dan 480 menit.');
      }
      patch.SESI_DURASI_MENIT = String(n);
      CONFIG.SESI_DURASI_MENIT = n;
    }

    const res = await Sync.pushSettings(patch);
    if (!res || !res.success) {
      await Sync.queue('settings', 'update', patch);
      Object.assign(Store.settings(), patch);
    }
    return BizUtil.ok('Pengaturan disimpan', { data: this.getSettings().data });
  },

  /** Terapkan pengaturan server ke CONFIG runtime setelah sinkronisasi. */
  applyRuntimeSettings() {
    const s = Store.settings();
    const horizon = parseInt(s.JADWAL_HORIZON_HARI, 10);
    const durasi = parseInt(s.SESI_DURASI_MENIT, 10);
    if (!isNaN(horizon) && horizon >= 30) CONFIG.JADWAL_HORIZON_HARI = horizon;
    if (!isNaN(durasi) && durasi >= 30)   CONFIG.SESI_DURASI_MENIT = durasi;
  },

  /* =================================================================
     3. PEMERIKSAAN KEBERSIHAN DATA (khusus koordinator)
     ================================================================= */

  /**
   * Temuan yang perlu keputusan manusia — TIDAK ada yang dibersihkan
   * otomatis, karena setiap baris berpotensi berisi riwayat peserta.
   */
  getDataHealth() {
    const peserta = Store.peserta();
    const jadwal = Store.jadwal();

    const idPeserta = new Set(peserta.map((p) => p.Id_Peserta));
    const idJadwal = new Set(jadwal.map((j) => j.Id_Jadwal));

    // Kandidat akun ganda: nama + tanggal lahir sama.
    const byIdentity = new Map();
    peserta.forEach((p) => {
      const key = BizUtil.normName(p.Nama_Lengkap) + '|' + WITA.toISODate(p.Tanggal_Lahir);
      if (!byIdentity.has(key)) byIdentity.set(key, []);
      byIdentity.get(key).push(p);
    });
    const duplikat = Array.from(byIdentity.values())
      .filter((g) => g.length > 1)
      .map((g) => ({
        nama: g[0].Nama_Lengkap,
        tanggal_lahir: WITA.toISODate(g[0].Tanggal_Lahir),
        akun: g.map((p) => ({
          id: p.Id_Peserta, username: p.Username, kelas: p.Kelas,
          nomor: p.Nomor_Peserta, dibuat: WITA.toISODate(p.Created_At),
          jumlah_kehadiran: Store.kehadiranOfPeserta(p.Id_Peserta).length
        }))
      }));

    /* Nomor urut yang dipakai lebih dari satu peserta.
       Nomor peserta LENGKAP tetap unik (tanggal lahirnya berbeda), jadi ini
       tidak mengganggu operasional — tetapi urutan pendaftaran jadi tidak
       benar-benar berurutan. Sisa dari data lama yang formatnya sudah benar
       sehingga sengaja tidak ikut dinormalisasi. */
    const urutTerpakai = new Map();
    peserta.forEach((p) => {
      const n = parseInt(p.Nomor_Urut, 10);
      if (isNaN(n)) return;
      if (!urutTerpakai.has(n)) urutTerpakai.set(n, []);
      urutTerpakai.get(n).push(p.Nama_Lengkap);
    });
    const nomorUrutGanda = Array.from(urutTerpakai.values()).filter((v) => v.length > 1).length;

    return {
      duplikat,
      nomorUrutGanda,
      nomorTidakSesuai: Numbering.nonConforming(peserta).length,
      passwordLemah: peserta.filter((p) => !PasswordPolicy.isStrong(p.Password, p.Username)).length,
      tanpaEmail: peserta.filter((p) => !BizUtil.isEmail(p.Email)).length,
      jadwalYatim: jadwal.filter((j) => j.Id_Peserta && !idPeserta.has(j.Id_Peserta)).length,
      kehadiranYatim: Store.kehadiran().filter((k) =>
        !idPeserta.has(k.Id_Peserta) || !idJadwal.has(k.Id_Jadwal)).length,
      // Periode yang pesertanya sudah tidak ada. Umumnya sisa akun yang
      // dihapus lewat aplikasi versi lama, yang belum mengenal tabel
      // Enrollment sehingga tidak ikut membersihkannya.
      enrollmentYatim: Store.enrollment().filter((e) => !idPeserta.has(e.Id_Peserta)).length
    };
  }
});
