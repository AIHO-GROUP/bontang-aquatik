/**
 * ===================================================================
 * domain/training.js — Jadwal, absensi, dan rapor
 * ===================================================================
 * Mencakup:
 *   • Pembuatan jadwal otomatis setelah pembayaran dikonfirmasi
 *   • Akses jadwal yang dibatasi status pembayaran (payment-gated)
 *   • Status sesi berbasis waktu WITA + penimpaan manual oleh admin
 *   • Delegasi jadwal ke pelatih tertentu
 *   • Absensi, rekap kehadiran, dan rapor
 */
Object.assign(BizLogic, {

  /* =================================================================
     1. JADWAL MILIK PESERTA
     ================================================================= */

  /**
   * Jadwal yang menjadi hak seorang peserta:
   *   • Jadwal personal (Id_Peserta terisi) -> hanya miliknya sendiri.
   *   • Jadwal kelas (Id_Peserta kosong)    -> hanya bila tanggalnya jatuh
   *     di dalam salah satu periode pelatihan yang SUDAH DIBAYAR.
   *
   * Aturan kedua inilah yang menjamin peserta hanya mengikuti jadwal
   * sesuai durasi pendaftarannya, termasuk saat ia punya beberapa periode
   * terpisah (mis. 1 bulan, berhenti, lalu bergabung lagi 3 bulan).
   */
  jadwalUntukPeserta(allJadwal, idPeserta) {
    const periodes = this.paidEnrollments(idPeserta);
    return (allJadwal || []).filter((j) => {
      if (j.Id_Peserta) return j.Id_Peserta === idPeserta;
      if (!periodes.length) return false;
      return periodes.some((e) => ScheduleEngine.inPeriode(j, e));
    });
  },

  /**
   * Jadwal untuk dashboard peserta, LENGKAP dengan penjagaan pembayaran.
   * Peserta yang belum lunas tetap dapat login, tetapi menerima daftar
   * kosong beserta alasan dan ajakan menghubungi admin.
   */
  getJadwalPeserta(p) {
    const peserta = Store.findPeserta(p.id_peserta);
    if (!peserta) return BizUtil.fail('Peserta tidak ditemukan');

    const akses = this.accessState(p.id_peserta);
    if (!akses.allowed) {
      return BizUtil.ok('', {
        data: [], locked: true, akses,
        kelas: peserta.Kelas
      });
    }

    const jadwal = this.jadwalUntukPeserta(Store.jadwal(), p.id_peserta);
    const kehadiran = Store.kehadiranOfPeserta(p.id_peserta);
    const now = Date.now();

    const data = jadwal.map((j) => {
      const k = kehadiran.find((x) => x.Id_Jadwal === j.Id_Jadwal);
      const st = ScheduleEngine.evaluate(j, now);
      return Object.assign({}, j, {
        Tanggal: WITA.toISODate(j.Tanggal),
        Status: st.status,
        status_auto: st.auto,
        status_manual: st.manual,
        can_attend: st.canAttend,
        countdown: st.countdown,
        jam_label: ScheduleEngine.jamLabel(j),
        is_personal: !!j.Id_Peserta,
        sudah_absen: !!k,
        status_kehadiran: k ? (BizUtil.isTrue(k.Status) ? 'hadir' : 'izin') : null,
        catatan_izin: k ? (k.Catatan || '') : ''
      });
    });

    return BizUtil.ok('', { data, locked: false, akses, kelas: peserta.Kelas });
  },

  /** Rekap kehadiran seorang peserta. */
  getKehadiranPeserta(p) {
    const peserta = Store.findPeserta(p.id_peserta);
    if (!peserta) return BizUtil.fail('Peserta tidak ditemukan');

    const jadwal = this.jadwalUntukPeserta(Store.jadwal(), p.id_peserta);
    const kehadiran = Store.kehadiranOfPeserta(p.id_peserta);
    const totalHadir = kehadiran.filter((k) => BizUtil.isTrue(k.Status)).length;
    const totalIzin  = kehadiran.filter((k) => !BizUtil.isTrue(k.Status)).length;

    // Persentase dihitung terhadap sesi yang SUDAH berlalu saja, agar
    // peserta baru tidak terlihat "0%" hanya karena jadwalnya masih di depan.
    const now = Date.now();
    const sudahLewat = jadwal.filter((j) => {
      const win = ScheduleEngine.windowOf(j);
      return win && now >= win.end;
    }).length;

    return BizUtil.ok('', {
      data: {
        total_jadwal: jadwal.length,
        sesi_berlalu: sudahLewat,
        total_hadir: totalHadir,
        total_izin: totalIzin,
        persentase: sudahLewat > 0 ? Math.round((totalHadir / sudahLewat) * 100) : 0
      }
    });
  },

  /* =================================================================
     2. ABSENSI
     ================================================================= */

  async _catatKehadiran(p, hadir, catatan) {
    const jadwal = Store.jadwal().find((j) => j.Id_Jadwal === p.id_jadwal);
    if (!jadwal) return BizUtil.fail('Jadwal tidak ditemukan');

    // Absensi harus datang dari peserta sendiri. Pelatih yang ingin
    // mencatatkan kehadiran memakai daftar hadir di panel admin
    // (setKehadiranManual), yang tercatat sebagai tindakan pelatih.
    if (Auth.isReadOnlyView()) {
      return BizUtil.fail(
        'Absensi tidak dapat dilakukan dari mode "lihat sebagai". ' +
        'Gunakan daftar hadir di panel admin untuk mencatat kehadiran peserta.',
        { code: 'READ_ONLY_VIEW' }
      );
    }

    const akses = this.accessState(p.id_peserta);
    if (!akses.allowed) {
      return BizUtil.fail(akses.message, { code: 'PAYMENT_REQUIRED', akses });
    }

    const st = ScheduleEngine.evaluate(jadwal);
    if (st.status === ScheduleEngine.STATUS.CANCEL) {
      return BizUtil.fail('Sesi ini dibatalkan oleh pelatih.');
    }
    // Izin boleh diajukan sebelum sesi dibuka; kehadiran hanya saat sesi aktif.
    if (hadir && !st.canAttend) {
      return BizUtil.fail(
        st.status === ScheduleEngine.STATUS.SELESAI
          ? 'Absensi untuk sesi ini sudah ditutup.'
          : 'Absensi belum dibuka. ' + st.countdown + '.'
      );
    }
    if (!hadir && st.status === ScheduleEngine.STATUS.SELESAI) {
      return BizUtil.fail('Sesi ini sudah selesai, izin tidak dapat diajukan lagi.');
    }

    const sudah = Store.kehadiran().find((k) =>
      k.Id_Jadwal === p.id_jadwal && k.Id_Peserta === p.id_peserta);
    if (sudah) return BizUtil.fail('Anda sudah memberikan respons untuk jadwal ini');

    const row = {
      Id_Kehadiran: BizUtil.genId('KHD'),
      Id_Jadwal: p.id_jadwal,
      Id_Peserta: p.id_peserta,
      Status: hadir,
      Catatan: hadir ? '' : (catatan || 'Tidak ada keterangan')
    };
    const r = await persist('kehadiran', 'create', row);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal menyimpan absensi');

    Store.kehadiran().push(row);
    await cachePut('Kehadiran', row);
    return BizUtil.ok(hadir ? 'Absensi berhasil dicatat' : 'Izin berhasil dikirim ke pelatih');
  },

  absen(p) { return this._catatKehadiran(p, true); },
  izin(p)  { return this._catatKehadiran(p, false, p.catatan); },

  /* =================================================================
     3. PEMBUATAN JADWAL OTOMATIS
     ================================================================= */

  /** Pelatih default untuk baris jadwal baru: koordinator aktif pertama. */
  _defaultPelatihId() {
    const list = Store.pelatih();
    const superadmin = list.find((p) => p.Role === CONFIG.ROLES.SUPERADMIN && p.Aktif !== false);
    return (superadmin || list[0] || {}).Id_Pelatih || '';
  },

  /**
   * Buat jadwal kelas untuk satu periode pelatihan yang sudah LUNAS.
   * Idempoten: sesi yang sudah ada (kelas + tanggal + jam) tidak dibuat ulang,
   * sehingga tidak pernah terjadi duplikasi walau dipanggil berkali-kali.
   */
  async generateScheduleForEnrollment(enrollment) {
    if (!enrollment || !BizUtil.isTrue(enrollment.Status_Pembayaran)) {
      return { success: true, count: 0 };
    }
    const rows = ScheduleEngine.build(enrollment, Store.jadwal(), this._defaultPelatihId());
    if (!rows.length) return { success: true, count: 0 };

    const r = await persist('jadwal', 'create', { items: rows });
    if (!r.success) return { success: false, count: 0, message: r.message };

    rows.forEach((row) => Store.jadwal().push(row));
    await cachePutMany('Jadwal', rows);
    return { success: true, count: rows.length };
  },

  /**
   * Isi ulang jadwal ke depan untuk SEMUA periode aktif yang sudah lunas.
   * Dipanggil diam-diam saat panel admin dibuka: karena pembuatan dibatasi
   * horizon (default 120 hari), fungsi inilah yang memastikan peserta
   * berdurasi panjang selalu punya jadwal tanpa membanjiri database.
   */
  async topUpSchedules() {
    const today = WITA.todayISO();
    const aktif = Store.enrollment().filter((e) =>
      BizUtil.isTrue(e.Status_Pembayaran) &&
      ['active', 'rejoined'].includes(e.Status) &&
      e.Tanggal_Akhir && WITA.diffDays(today, e.Tanggal_Akhir) >= 0
    );
    if (!aktif.length) return { success: true, count: 0 };

    const rows = ScheduleEngine.buildMany(aktif, Store.jadwal(), this._defaultPelatihId());
    if (!rows.length) return { success: true, count: 0 };

    const r = await persist('jadwal', 'create', { items: rows });
    if (!r.success) return { success: false, count: 0 };

    rows.forEach((row) => Store.jadwal().push(row));
    await cachePutMany('Jadwal', rows);
    return { success: true, count: rows.length };
  },

  /* =================================================================
     4. PANEL ADMIN — JADWAL
     ================================================================= */

  /**
   * Seluruh jadwal untuk panel admin, sudah dilengkapi status terhitung,
   * nama pelatih penanggung jawab, dan ringkasan absensi.
   * @param {object} p { mine: true } -> hanya jadwal yang didelegasikan
   *                                     kepada pengguna yang sedang login
   */
  getAllJadwal(p) {
    const opts = p || {};
    const now = Date.now();
    const meId = Auth.getId();

    let rows = Store.jadwal();
    if (opts.mine && meId) rows = rows.filter((j) => j.Id_Pelatih === meId);

    const data = rows.map((j) => {
      const st = ScheduleEngine.evaluate(j, now);
      const pelatih = j.Id_Pelatih ? Store.findPelatih(j.Id_Pelatih) : null;
      const hadirRows = Store.kehadiranOfJadwal(j.Id_Jadwal);

      let namaPeserta = '';
      if (j.Id_Peserta) {
        const ps = Store.findPeserta(j.Id_Peserta);
        namaPeserta = ps ? ps.Nama_Lengkap : '(peserta tidak ditemukan)';
      }

      return Object.assign({}, j, {
        Tanggal: WITA.toISODate(j.Tanggal),
        Status: st.status,
        status_auto: st.auto,
        status_manual: st.manual,
        is_manual: st.isManual,
        countdown: st.countdown,
        jam_label: ScheduleEngine.jamLabel(j),
        jam_mulai: ScheduleEngine.jamMulai(j),
        nama_pelatih: pelatih ? (pelatih.Nama || pelatih.Username) : '',
        nama_peserta_personal: namaPeserta,
        is_personal: !!j.Id_Peserta,
        is_mine: !!meId && j.Id_Pelatih === meId,
        total_hadir: hadirRows.filter((k) => BizUtil.isTrue(k.Status)).length,
        total_izin: hadirRows.filter((k) => !BizUtil.isTrue(k.Status)).length
      });
    });
    return BizUtil.ok('', { data });
  },

  /** Buat jadwal personal untuk satu atau banyak peserta sekaligus. */
  async createJadwalBatch(p) {
    if (!Auth.can('kelolaJadwal')) return BizUtil.fail('Anda tidak memiliki akses ini.');

    const ids = Array.isArray(p.peserta) ? p.peserta.filter(Boolean) : [];
    if (!ids.length) return BizUtil.fail('Minimal pilih 1 peserta');

    const tanggal = WITA.toISODate(p.tanggal);
    const jam = WITA.toHHMM(p.jam_mulai);
    if (!tanggal || !jam || !p.lokasi) {
      return BizUtil.fail('Tanggal, jam mulai, dan lokasi wajib diisi');
    }

    const durasi = ScheduleEngine.durasiMenit();
    const selesai = WITA.toWitaClock(WITA.epochOf(tanggal, jam) + durasi * 60000);
    const jamAkhir = String(selesai.getUTCHours()).padStart(2, '0') + ':' +
                     String(selesai.getUTCMinutes()).padStart(2, '0');

    const rows = ids.map((idPeserta) => {
      const ps = Store.findPeserta(idPeserta);
      return {
        Id_Jadwal: ScheduleEngine.genId('JDW'),
        Id_Pelatih: p.id_pelatih || this._defaultPelatihId(),
        Id_Peserta: idPeserta,
        Tanggal: tanggal,
        Pukul: jam + ' - ' + jamAkhir,
        Jam_Mulai: jam,
        Durasi_Menit: durasi,
        Lokasi: p.lokasi,
        Kelas: ps ? ps.Kelas : (p.kelas || ''),
        Status: ScheduleEngine.STATUS.PENDING,
        Status_Manual: p.status_manual || '',
        Id_Enrollment: ''
      };
    });

    const r = await persist('jadwal', 'create', { items: rows });
    if (!r.success) return BizUtil.fail(r.message || 'Gagal membuat jadwal');

    rows.forEach((row) => Store.jadwal().push(row));
    await cachePutMany('Jadwal', rows);
    return BizUtil.ok(rows.length + ' jadwal personal berhasil dibuat', { count: rows.length });
  },

  /**
   * Perbarui jadwal. Penimpaan status (Status_Manual) selalu menang atas
   * status otomatis; mengisinya dengan string kosong mengembalikan sesi
   * ke mode otomatis berbasis waktu.
   */
  async updateJadwal(p) {
    if (!Auth.can('kelolaJadwal')) return BizUtil.fail('Anda tidak memiliki akses ini.');
    const jadwal = Store.jadwal().find((x) => x.Id_Jadwal === p.id);
    if (!jadwal) return BizUtil.fail('Jadwal tidak ditemukan');

    const patch = { id: p.id };

    if (p.tanggal !== undefined) patch.Tanggal = WITA.toISODate(p.tanggal);
    if (p.lokasi !== undefined)  patch.Lokasi = p.lokasi;
    if (p.kelas !== undefined)   patch.Kelas = p.kelas;

    if (p.jam_mulai !== undefined) {
      const jam = WITA.toHHMM(p.jam_mulai);
      if (!jam) return BizUtil.fail('Format jam mulai tidak valid (contoh: 16:00).');
      const durasi = parseInt(p.durasi_menit, 10) || jadwal.Durasi_Menit || ScheduleEngine.durasiMenit();
      const tgl = patch.Tanggal || WITA.toISODate(jadwal.Tanggal);
      const selesai = WITA.toWitaClock(WITA.epochOf(tgl, jam) + durasi * 60000);
      patch.Jam_Mulai = jam;
      patch.Durasi_Menit = durasi;
      patch.Pukul = jam + ' - ' +
        String(selesai.getUTCHours()).padStart(2, '0') + ':' +
        String(selesai.getUTCMinutes()).padStart(2, '0');
    }

    if (p.status_manual !== undefined) {
      const allowed = ['', 'Aktif', 'Pending', 'Cancel'];
      if (!allowed.includes(p.status_manual)) return BizUtil.fail('Status manual tidak dikenal.');
      patch.Status_Manual = p.status_manual;
      // Kolom Status lama tetap disinkronkan agar kompatibel dengan
      // perangkat yang belum memuat versi terbaru aplikasi.
      patch.Status = p.status_manual || ScheduleEngine.evaluate(
        Object.assign({}, jadwal, patch, { Status_Manual: '' })).auto;
    }

    // Delegasi pelatih penanggung jawab — wewenang koordinator.
    if (p.id_pelatih !== undefined) {
      if (!Auth.can('delegasiJadwal')) {
        return BizUtil.fail('Hanya koordinator yang dapat mendelegasikan jadwal ke pelatih.');
      }
      const target = Store.findPelatih(p.id_pelatih);
      if (p.id_pelatih && !target) return BizUtil.fail('Pelatih tujuan tidak ditemukan.');
      patch.Id_Pelatih = p.id_pelatih || '';
    }

    const r = await persist('jadwal', 'update', patch);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal memperbarui jadwal');

    Object.assign(jadwal, patch);
    delete jadwal.id;
    await cachePut('Jadwal', jadwal);
    return BizUtil.ok('Jadwal diperbarui');
  },

  /** Delegasikan banyak jadwal sekaligus ke seorang pelatih. */
  async delegasiJadwalBatch(p) {
    if (!Auth.can('delegasiJadwal')) {
      return BizUtil.fail('Hanya koordinator yang dapat mendelegasikan jadwal.');
    }
    const ids = Array.isArray(p.ids) ? p.ids.filter(Boolean) : [];
    if (!ids.length) return BizUtil.fail('Pilih minimal satu jadwal.');
    const target = Store.findPelatih(p.id_pelatih);
    if (!target) return BizUtil.fail('Pelatih tujuan tidak ditemukan.');

    const items = ids.map((id) => ({ id, Id_Pelatih: p.id_pelatih }));
    const r = await persist('jadwal', 'update', { items });
    if (!r.success) return BizUtil.fail(r.message || 'Gagal mendelegasikan jadwal.');

    const touched = [];
    ids.forEach((id) => {
      const j = Store.jadwal().find((x) => x.Id_Jadwal === id);
      if (j) { j.Id_Pelatih = p.id_pelatih; touched.push(j); }
    });
    await cachePutMany('Jadwal', touched);

    return BizUtil.ok(ids.length + ' jadwal didelegasikan kepada ' + (target.Nama || target.Username) + '.');
  },

  async deleteJadwal(p) {
    if (!Auth.can('kelolaJadwal')) return BizUtil.fail('Anda tidak memiliki akses ini.');
    const idx = Store.jadwal().findIndex((x) => x.Id_Jadwal === p.id);
    if (idx === -1) return BizUtil.fail('Jadwal tidak ditemukan');

    const jumlahAbsen = Store.kehadiranOfJadwal(p.id).length;
    if (jumlahAbsen > 0 && !p.force) {
      return BizUtil.fail(
        'Jadwal ini sudah memiliki ' + jumlahAbsen + ' catatan kehadiran. ' +
        'Menghapusnya akan menghilangkan riwayat absensi peserta.',
        { code: 'HAS_ATTENDANCE', count: jumlahAbsen }
      );
    }

    const r = await persist('jadwal', 'delete', { id: p.id });
    if (!r.success) return BizUtil.fail(r.message || 'Gagal menghapus jadwal');

    Store.jadwal().splice(idx, 1);
    await cacheRemove('Jadwal', p.id);
    return BizUtil.ok('Jadwal dihapus');
  },

  /** Daftar peserta beserta status absensinya untuk satu jadwal. */
  getJadwalAttendees(p) {
    const jadwal = Store.jadwal().find((j) => j.Id_Jadwal === p.id_jadwal);
    if (!jadwal) return BizUtil.fail('Jadwal tidak ditemukan');

    let attendees;
    if (jadwal.Id_Peserta) {
      const one = Store.findPeserta(jadwal.Id_Peserta);
      attendees = one ? [one] : [];
    } else {
      // Peserta kelas ini yang periodenya mencakup tanggal jadwal tersebut.
      attendees = Store.peserta().filter((ps) =>
        this.paidEnrollments(ps.Id_Peserta).some((e) => ScheduleEngine.inPeriode(jadwal, e)));
    }

    const kehadiran = Store.kehadiranOfJadwal(p.id_jadwal);
    const data = attendees.map((ps) => {
      const k = kehadiran.find((x) => x.Id_Peserta === ps.Id_Peserta);
      return {
        id_peserta: ps.Id_Peserta,
        id_kehadiran: k ? k.Id_Kehadiran : null,
        nama: ps.Nama_Lengkap,
        nomor_peserta: ps.Nomor_Peserta || '',
        kelas: ps.Kelas,
        nomor_whatsapp: ps.Nomor_Whatsapp || '',
        status: k ? (BizUtil.isTrue(k.Status) ? 'hadir' : 'izin') : 'belum',
        catatan: k ? (k.Catatan || '') : ''
      };
    }).sort((a, b) => a.nama.localeCompare(b.nama));

    const st = ScheduleEngine.evaluate(jadwal);
    return BizUtil.ok('', {
      data,
      jadwal: Object.assign({}, jadwal, {
        Tanggal: WITA.toISODate(jadwal.Tanggal),
        Status: st.status,
        countdown: st.countdown,
        jam_label: ScheduleEngine.jamLabel(jadwal),
        is_personal: !!jadwal.Id_Peserta
      })
    });
  },

  /**
   * Pelatih menandai kehadiran peserta secara manual dari daftar hadir
   * (mis. peserta datang tetapi lupa absen di aplikasi).
   */
  async setKehadiranManual(p) {
    if (!Auth.can('kelolaKehadiran')) return BizUtil.fail('Anda tidak memiliki akses ini.');
    const existing = Store.kehadiran().find((k) =>
      k.Id_Jadwal === p.id_jadwal && k.Id_Peserta === p.id_peserta);

    // 'belum' berarti menghapus catatan yang ada.
    if (p.status === 'belum') {
      if (!existing) return BizUtil.ok('Tidak ada perubahan');
      return this.deleteKehadiran({ id: existing.Id_Kehadiran });
    }

    const hadir = p.status === 'hadir';
    const catatan = hadir ? '' : (p.catatan || 'Dicatat oleh pelatih');

    if (existing) {
      return this.updateKehadiran({ id: existing.Id_Kehadiran, status: hadir, catatan });
    }

    const row = {
      Id_Kehadiran: BizUtil.genId('KHD'),
      Id_Jadwal: p.id_jadwal,
      Id_Peserta: p.id_peserta,
      Status: hadir,
      Catatan: catatan
    };
    const r = await persist('kehadiran', 'create', row);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal menyimpan kehadiran');
    Store.kehadiran().push(row);
    await cachePut('Kehadiran', row);
    return BizUtil.ok('Kehadiran diperbarui');
  },

  /* =================================================================
     5. KEHADIRAN — rekap admin
     ================================================================= */

  getAllKehadiran(p) {
    const opts = p || {};
    const today = WITA.todayISO();

    let rows = Store.kehadiran().map((k) => {
      const ps = Store.findPeserta(k.Id_Peserta);
      const jd = Store.jadwal().find((j) => j.Id_Jadwal === k.Id_Jadwal);
      const tanggal = jd ? WITA.toISODate(jd.Tanggal) : '';
      return Object.assign({}, k, {
        nama_peserta: ps ? ps.Nama_Lengkap : '(peserta dihapus)',
        nomor_peserta: ps ? (ps.Nomor_Peserta || '') : '',
        tanggal,
        pukul: jd ? ScheduleEngine.jamLabel(jd) : '-',
        kelas: jd ? jd.Kelas : '-',
        lokasi: jd ? jd.Lokasi : '-',
        id_pelatih: jd ? jd.Id_Pelatih : '',
        status_label: BizUtil.isTrue(k.Status) ? 'hadir' : 'izin'
      });
    });

    if (opts.mine && Auth.getId()) {
      rows = rows.filter((k) => k.id_pelatih === Auth.getId());
    }

    if (opts.periode && opts.periode !== 'all') {
      rows = rows.filter((k) => {
        if (!k.tanggal) return false;
        const selisih = WITA.diffDays(k.tanggal, today);
        if (opts.periode === 'minggu') return selisih >= 0 && selisih <= 7;
        if (opts.periode === 'bulan')  return k.tanggal.slice(0, 7) === today.slice(0, 7);
        if (opts.periode === 'tahun')  return k.tanggal.slice(0, 4) === today.slice(0, 4);
        return true;
      });
    }

    rows.sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
    return BizUtil.ok('', { data: rows });
  },

  async updateKehadiran(p) {
    if (!Auth.can('kelolaKehadiran')) return BizUtil.fail('Anda tidak memiliki akses ini.');
    const kehadiran = Store.kehadiran().find((x) => x.Id_Kehadiran === p.id);
    if (!kehadiran) return BizUtil.fail('Kehadiran tidak ditemukan');

    const patch = { id: p.id };
    if (p.status !== undefined)  patch.Status = (p.status === true || p.status === 'true');
    if (p.catatan !== undefined) patch.Catatan = p.catatan;

    const r = await persist('kehadiran', 'update', patch);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal memperbarui kehadiran');

    Object.assign(kehadiran, patch);
    delete kehadiran.id;
    await cachePut('Kehadiran', kehadiran);
    return BizUtil.ok('Kehadiran diperbarui');
  },

  async deleteKehadiran(p) {
    if (!Auth.can('kelolaKehadiran')) return BizUtil.fail('Anda tidak memiliki akses ini.');
    const idx = Store.kehadiran().findIndex((x) => x.Id_Kehadiran === p.id);
    if (idx === -1) return BizUtil.fail('Kehadiran tidak ditemukan');

    const r = await persist('kehadiran', 'delete', { id: p.id });
    if (!r.success) return BizUtil.fail(r.message || 'Gagal menghapus kehadiran');

    Store.kehadiran().splice(idx, 1);
    await cacheRemove('Kehadiran', p.id);
    return BizUtil.ok('Kehadiran dihapus');
  },

  /** Matriks kehadiran (peserta x tanggal) untuk export Excel & tampilan tabel. */
  getKehadiranForExport(p) {
    if (!p.kelas || !p.tanggal_dari || !p.tanggal_sampai) {
      return BizUtil.fail('Kelas dan periode wajib diisi');
    }
    const dari = WITA.toISODate(p.tanggal_dari);
    const sampai = WITA.toISODate(p.tanggal_sampai);

    const jadwalKelas = Store.jadwal().filter((j) => {
      if (j.Id_Peserta) return false;
      if (j.Kelas !== p.kelas) return false;
      const tgl = WITA.toISODate(j.Tanggal);
      return tgl && WITA.diffDays(dari, tgl) >= 0 && WITA.diffDays(tgl, sampai) >= 0;
    });

    const dates = Array.from(new Set(jadwalKelas.map((j) => WITA.toISODate(j.Tanggal)))).sort();

    // Hanya peserta yang periodenya benar-benar mencakup rentang ini.
    const pesertaKelas = Store.peserta().filter((ps) =>
      this.paidEnrollments(ps.Id_Peserta).some((e) =>
        e.Kelas === p.kelas &&
        WITA.diffDays(WITA.toISODate(e.Tanggal_Mulai), sampai) >= 0 &&
        WITA.diffDays(dari, WITA.toISODate(e.Tanggal_Akhir)) >= 0
      )
    ).sort((a, b) => String(a.Nama_Lengkap).localeCompare(String(b.Nama_Lengkap)));

    const peserta = pesertaKelas.map((ps) => {
      const periodes = this.paidEnrollments(ps.Id_Peserta);
      const attendance = {};
      dates.forEach((d) => {
        const sesi = jadwalKelas.filter((j) => WITA.toISODate(j.Tanggal) === d);
        // Tanggal di luar periode peserta ini dibiarkan kosong, bukan 'A'.
        const terdaftar = sesi.some((j) => periodes.some((e) => ScheduleEngine.inPeriode(j, e)));
        if (!terdaftar) { attendance[d] = ''; return; }

        let status = 'A';
        for (const j of sesi) {
          const k = Store.kehadiranOfJadwal(j.Id_Jadwal).find((x) => x.Id_Peserta === ps.Id_Peserta);
          if (k) { status = BizUtil.isTrue(k.Status) ? 'H' : 'I'; break; }
        }
        attendance[d] = status;
      });
      return { id: ps.Id_Peserta, nama: ps.Nama_Lengkap, nomor: ps.Nomor_Peserta || '', attendance };
    });

    return BizUtil.ok('', {
      data: { dates, peserta, kelas: p.kelas, periode: { dari, sampai } }
    });
  },

  /* =================================================================
     6. RAPOR
     ================================================================= */

  getRaporPeserta(p) {
    const rapor = Store.raporOf(p.id_peserta);
    if (!rapor) return BizUtil.ok('Rapor belum diunggah pelatih', { data: null });

    const pelatih = rapor.Id_Pelatih ? Store.findPelatih(rapor.Id_Pelatih) : null;
    const signer = this.getRaporSigner();
    return BizUtil.ok('', {
      data: Object.assign({}, rapor, {
        Tanggal_Rapor: rapor.Tanggal_Rapor,
        // Pemberi nilai (pelatih) — informasi internal.
        Nama_Pelatih: pelatih ? (pelatih.Nama || pelatih.Username) : '',
        // Penanda tangan rapor SELALU identitas koordinator klub.
        Nama_Penandatangan: signer.nama,
        Jabatan_Penandatangan: signer.jabatan
      })
    });
  },

  /** Daftar rapor untuk panel admin, digabung dengan peserta yang belum punya. */
  getAllRapor() {
    const data = Store.rapor().map((r) => {
      const ps = Store.findPeserta(r.Id_Peserta);
      const pelatih = r.Id_Pelatih ? Store.findPelatih(r.Id_Pelatih) : null;
      return Object.assign({}, r, {
        nama_peserta: ps ? ps.Nama_Lengkap : '(peserta dihapus)',
        kelas: ps ? ps.Kelas : '',
        nama_pelatih: pelatih ? (pelatih.Nama || pelatih.Username) : ''
      });
    });
    return BizUtil.ok('', { data });
  },

  async upsertRapor(p) {
    if (!Auth.can('kelolaRapor')) return BizUtil.fail('Anda tidak memiliki akses ini.');

    const fieldMap = {
      predikat: 'Predikat', catatan: 'Catatan',
      waktu_25_bebas: 'Waktu_25_Bebas', waktu_25_dada: 'Waktu_25_Dada',
      waktu_25_kupu: 'Waktu_25_Kupu', waktu_25_punggung: 'Waktu_25_Punggung',
      waktu_50_bebas: 'Waktu_50_Bebas', waktu_50_dada: 'Waktu_50_Dada',
      waktu_50_kupu: 'Waktu_50_Kupu', waktu_50_punggung: 'Waktu_50_Punggung',
      waktu_25_bebas_pelampung: 'Waktu_25_Bebas_Pelampung',
      waktu_25_dada_pelampung: 'Waktu_25_Dada_Pelampung',
      waktu_25_kupu_pelampung: 'Waktu_25_Kupu_Pelampung',
      waktu_25_punggung_pelampung: 'Waktu_25_Punggung_Pelampung'
    };

    const existing = Store.raporOf(p.id_peserta);
    const nowIso = BizUtil.nowIso();

    if (existing) {
      const patch = { id: existing.Id_Rapor, Tanggal_Rapor: nowIso };
      Object.keys(fieldMap).forEach((k) => { if (p[k] !== undefined) patch[fieldMap[k]] = p[k]; });
      if (p.id_pelatih) patch.Id_Pelatih = p.id_pelatih;

      const r = await persist('rapor', 'update', patch);
      if (!r.success) return BizUtil.fail(r.message || 'Gagal memperbarui rapor');
      Object.assign(existing, patch);
      delete existing.id;
      await cachePut('Rapor', existing);
      return BizUtil.ok('Rapor diperbarui');
    }

    const row = {
      Id_Rapor: BizUtil.genId('RPR'),
      Id_Peserta: p.id_peserta,
      Predikat: p.predikat || '',
      Catatan: p.catatan || '',
      Tanggal_Rapor: nowIso,
      Id_Pelatih: p.id_pelatih || ''
    };
    Object.keys(fieldMap).forEach((k) => { row[fieldMap[k]] = p[k] || ''; });
    row.Predikat = p.predikat || '';
    row.Catatan = p.catatan || '';

    const r = await persist('rapor', 'create', row);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal membuat rapor');
    Store.rapor().push(row);
    await cachePut('Rapor', row);
    return BizUtil.ok('Rapor dibuat');
  },

  async deleteRapor(p) {
    if (!Auth.can('kelolaRapor')) return BizUtil.fail('Anda tidak memiliki akses ini.');
    const idx = Store.rapor().findIndex((x) => x.Id_Rapor === p.id);
    if (idx === -1) return BizUtil.fail('Rapor tidak ditemukan');

    const r = await persist('rapor', 'delete', { id: p.id });
    if (!r.success) return BizUtil.fail(r.message || 'Gagal menghapus rapor');

    Store.rapor().splice(idx, 1);
    await cacheRemove('Rapor', p.id);
    return BizUtil.ok('Rapor dihapus');
  }
});
