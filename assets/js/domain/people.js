/**
 * ===================================================================
 * domain/people.js — Akun, identitas, periode pelatihan, dan peran
 * ===================================================================
 * Mencakup:
 *   • Autentikasi (login, registrasi, reset password via OTP email)
 *   • Satu peserta = satu akun: deteksi duplikat + re-aktivasi
 *   • Enrollment: riwayat & perpanjangan periode pelatihan
 *   • Nomor peserta otomatis
 *   • Kelola akun pelatih (khusus koordinator)
 */
Object.assign(BizLogic, {

  /* =================================================================
     1. IDENTITAS PESERTA
     ================================================================= */

  /**
   * Cari peserta berdasarkan identitas alami (bukan username), untuk
   * menjamin satu orang hanya punya SATU akun.
   * Cocok bila: (nama + tanggal lahir) ATAU (WhatsApp + tanggal lahir).
   */
  findPesertaByIdentity(p) {
    const nama  = BizUtil.normName(p.nama_lengkap);
    const lahir = WITA.toISODate(p.tanggal_lahir);
    const wa    = BizUtil.normPhone(p.nomor_whatsapp);
    if (!lahir) return null;

    return Store.peserta().find((x) => {
      if (WITA.toISODate(x.Tanggal_Lahir) !== lahir) return false;
      if (nama && BizUtil.normName(x.Nama_Lengkap) === nama) return true;
      if (wa && BizUtil.normPhone(x.Nomor_Whatsapp) === wa) return true;
      return false;
    }) || null;
  },

  /** Verifikasi ketat untuk alur reset password (semua field wajib cocok). */
  verifyResetIdentity(p) {
    if (!p.nama_lengkap || !p.tanggal_lahir || !p.nomor_whatsapp) {
      return BizUtil.fail('Nama lengkap, tanggal lahir, dan nomor WhatsApp wajib diisi.');
    }
    const nama  = BizUtil.normName(p.nama_lengkap);
    const lahir = WITA.toISODate(p.tanggal_lahir);
    const wa    = BizUtil.normPhone(p.nomor_whatsapp);

    const peserta = Store.peserta().find((x) =>
      BizUtil.normName(x.Nama_Lengkap) === nama &&
      WITA.toISODate(x.Tanggal_Lahir) === lahir &&
      BizUtil.normPhone(x.Nomor_Whatsapp) === wa
    );
    if (!peserta) {
      return BizUtil.fail('Data tidak cocok. Pastikan semua data sesuai dengan saat pendaftaran.');
    }
    return BizUtil.ok('Identitas terverifikasi.', {
      data: {
        id_peserta: peserta.Id_Peserta,
        username: peserta.Username,
        email: peserta.Email || '',
        email_masked: this.maskEmail(peserta.Email)
      }
    });
  },

  /** "budi@gmail.com" -> "bu***@gmail.com" (jangan bocorkan email penuh). */
  maskEmail(email) {
    const s = String(email || '').trim();
    if (!BizUtil.isEmail(s)) return '';
    const [user, domain] = s.split('@');
    const head = user.slice(0, Math.min(2, user.length));
    return head + '***@' + domain;
  },

  /* =================================================================
     2. REGISTRASI
     ================================================================= */

  /**
   * Daftar peserta baru. Menolak bila identitas sudah terdaftar —
   * peserta lama diarahkan ke alur re-aktivasi/perpanjangan, bukan
   * membuat akun kedua.
   */
  async registerPeserta(p) {
    const username = String(p.username || '').trim();
    if (!username) return BizUtil.fail('Username wajib diisi.');

    if (Store.peserta().some((x) => BizUtil.norm(x.Username) === BizUtil.norm(username))) {
      return BizUtil.fail('Username sudah digunakan. Silakan pilih username lain.');
    }
    if (Store.pelatih().some((x) => BizUtil.norm(x.Username) === BizUtil.norm(username))) {
      return BizUtil.fail('Username sudah digunakan. Silakan pilih username lain.');
    }

    const pwCheck = PasswordPolicy.evaluate(p.password, username);
    if (!pwCheck.valid) {
      return BizUtil.fail('Password belum memenuhi syarat: ' + PasswordPolicy.firstError(p.password, username));
    }

    // Satu orang = satu akun.
    const existing = this.findPesertaByIdentity(p);
    if (existing) {
      return BizUtil.fail(
        'Peserta atas nama ini sudah terdaftar. Silakan masuk dengan akun lama, ' +
        'lalu ajukan perpanjangan/bergabung kembali dari dashboard.',
        {
          code: 'ACCOUNT_EXISTS',
          data: {
            id_peserta: existing.Id_Peserta,
            nama: existing.Nama_Lengkap,
            username: existing.Username,
            kelas: existing.Kelas
          }
        }
      );
    }

    const id = BizUtil.genId('PST');
    const tanggalMulai = WITA.toISODate(p.tanggal_mulai) || WITA.todayISO();
    const durasi = Math.max(1, parseInt(p.durasi, 10) || 1);
    const tanggalAkhir = WITA.toISODate(p.tanggal_akhir) || WITA.addMonths(tanggalMulai, durasi);

    // Nomor peserta dibuat otomatis di sini — tidak ada tombol generate.
    const urut = Numbering.nextUrut(Store.peserta(), Store.settings(), null);
    const nomorPeserta = Numbering.compose(p.tanggal_lahir, urut);

    const row = {
      Id_Peserta: id,
      Nama_Lengkap: String(p.nama_lengkap || '').trim(),
      Username: username,
      Password: p.password,
      Email: String(p.email || '').trim().toLowerCase(),
      Nomor_Whatsapp: BizUtil.normPhone(p.nomor_whatsapp),
      Jenis_Kelamin: p.jenis_kelamin || '',
      Tempat_Lahir: p.tempat_lahir || '',
      Tanggal_Lahir: WITA.toISODate(p.tanggal_lahir),
      NISNAS: p.nisnas || '',
      Asal_Sekolah: p.asal_sekolah || '',
      Kelas_Sekolah: p.kelas_sekolah || '',
      Wali_Kelas: p.wali_kelas || '',
      Kelompok_Umur: BizUtil.kelompokUmur(p.tanggal_lahir),
      Kelas: p.kelas || '',
      Tanggal_Mulai: tanggalMulai,
      Tanggal_Akhir: tanggalAkhir,
      Status_Pembayaran: false,
      Nomor_Peserta: nomorPeserta,
      Nomor_Peserta_Legacy: '',
      Nomor_Urut: urut,
      Password_Updated_At: BizUtil.nowIso(),
      Status_Akun: 'active',
      Created_At: BizUtil.nowIso(),
      Updated_At: BizUtil.nowIso()
    };

    const r = await persist('peserta', 'create', row);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal mendaftar, silakan coba lagi.');

    Store.peserta().push(row);
    await cachePut('Peserta', row);
    await this._bumpNomorSeq(urut);

    // Periode pelatihan pertama.
    await this._createEnrollment({
      idPeserta: id,
      kelas: row.Kelas,
      mulai: tanggalMulai,
      akhir: tanggalAkhir,
      durasi,
      status: 'pending',
      catatan: 'Pendaftaran awal melalui aplikasi.',
      urutan: 1
    });

    return BizUtil.ok('Registrasi berhasil. Lanjutkan konfirmasi pembayaran via WhatsApp.', {
      id, data: row
    });
  },

  async _bumpNomorSeq(urut) {
    const current = parseInt(Store.settings()[Numbering.SEQ_KEY], 10) || 0;
    if (urut <= current) return;
    const patch = {}; patch[Numbering.SEQ_KEY] = String(urut);
    const res = await Sync.pushSettings(patch);
    if (!res || !res.success) {
      await Sync.queue('settings', 'update', patch);
      Object.assign(Store.settings(), patch);
    }
  },

  /* =================================================================
     3. LOGIN
     ================================================================= */

  /**
   * Autentikasi username + password terhadap cache lokal.
   *
   * PENTING (perubahan kebijakan): peserta yang pembayarannya BELUM lunas
   * kini TETAP boleh login. Pembatasan dipindahkan ke lapisan otorisasi —
   * modul jadwal yang memeriksa status pembayaran (lihat getJadwalPeserta).
   */
  login(p) {
    const username = String(p.username || '').trim();
    const password = String(p.password == null ? '' : p.password);

    const staff = Store.pelatih().find((a) =>
      BizUtil.norm(a.Username) === BizUtil.norm(username) && String(a.Password) === password
    );
    if (staff) {
      if (staff.Aktif === false) {
        return BizUtil.fail('Akun Anda sedang dinonaktifkan. Hubungi koordinator klub.');
      }
      const role = staff.Role === CONFIG.ROLES.SUPERADMIN ? CONFIG.ROLES.SUPERADMIN : CONFIG.ROLES.ADMIN;
      return BizUtil.ok('', {
        role,
        data: {
          id: staff.Id_Pelatih,
          nama: staff.Nama || staff.Username,
          username: staff.Username,
          jabatan: staff.Jabatan || '',
          role,
          needs_password_update: !PasswordPolicy.isStrong(staff.Password, staff.Username)
        }
      });
    }

    const peserta = Store.peserta().find((x) =>
      BizUtil.norm(x.Username) === BizUtil.norm(username) && String(x.Password) === password
    );
    if (!peserta) return BizUtil.fail('Username atau password salah');

    if (peserta.Status_Akun === 'nonaktif') {
      return BizUtil.fail('Akun Anda sedang dinonaktifkan. Hubungi admin klub via WhatsApp.');
    }

    return BizUtil.ok('', {
      role: CONFIG.ROLES.PESERTA,
      data: this.sessionDataFor(peserta)
    });
  },

  /** Bentuk data sesi peserta (dipakai login maupun mode "lihat sebagai"). */
  sessionDataFor(peserta) {
    const akses = this.accessState(peserta.Id_Peserta);
    return {
      id: peserta.Id_Peserta,
      nama: peserta.Nama_Lengkap,
      username: peserta.Username,
      email: peserta.Email || '',
      kelas: peserta.Kelas,
      nomor_peserta: peserta.Nomor_Peserta || '',
      nomor_whatsapp: peserta.Nomor_Whatsapp || '',
      tanggal_mulai: WITA.toISODate(peserta.Tanggal_Mulai),
      tanggal_akhir: WITA.toISODate(peserta.Tanggal_Akhir),
      status_pembayaran: BizUtil.isTrue(peserta.Status_Pembayaran),
      akses_jadwal: akses.allowed,
      needs_password_update: !PasswordPolicy.isStrong(peserta.Password, peserta.Username)
    };
  },

  /**
   * Apakah pengguna ini perlu diminta memperbarui password?
   * Berlaku untuk akun lama yang dibuat sebelum kebijakan password baru.
   */
  needsPasswordUpdate(idPengguna, role) {
    if (role === CONFIG.ROLES.PESERTA) {
      const p = Store.findPeserta(idPengguna);
      return !!p && !PasswordPolicy.isStrong(p.Password, p.Username);
    }
    const s = Store.findPelatih(idPengguna);
    return !!s && !PasswordPolicy.isStrong(s.Password, s.Username);
  },

  /* =================================================================
     4. RESET PASSWORD — OTP EMAIL
     -----------------------------------------------------------------
     Alur dua lapis, sengaja dirancang agar tidak ada peserta yang
     terkunci:
       Lapis 1 — verifikasi identitas (nama + tanggal lahir + WhatsApp)
                 membuktikan KEPEMILIKAN AKUN.
       Lapis 2 — kode OTP ke email membuktikan KEPEMILIKAN EMAIL.
     Peserta lama yang belum punya email dapat mendaftarkan emailnya di
     langkah ini, setelah identitasnya terbukti.
     ================================================================= */

  /** Kirim kode OTP 6 digit ke email peserta melalui Supabase Auth. */
  async requestPasswordOtp(p) {
    const email = String(p.email || '').trim().toLowerCase();
    if (!BizUtil.isEmail(email)) return BizUtil.fail('Format email tidak valid.');

    const peserta = Store.findPeserta(p.id_peserta);
    if (!peserta) return BizUtil.fail('Peserta tidak ditemukan.');

    // Email yang sudah dipakai akun lain akan membingungkan saat pemulihan.
    const bentrok = Store.peserta().find((x) =>
      x.Id_Peserta !== peserta.Id_Peserta && BizUtil.norm(x.Email) === BizUtil.norm(email)
    );
    if (bentrok) return BizUtil.fail('Email ini sudah terdaftar pada akun peserta lain.');

    try {
      const { error } = await SupabaseClient.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true }
      });
      if (error) throw error;
    } catch (err) {
      console.error('requestPasswordOtp:', err);
      const msg = String((err && err.message) || '');
      if (/rate|limit|too many|seconds/i.test(msg)) {
        return BizUtil.fail(
          'Terlalu banyak permintaan kode. Mohon tunggu sekitar 1 menit sebelum mencoba lagi.',
          { code: 'RATE_LIMIT' }
        );
      }
      return BizUtil.fail(
        'Kode OTP gagal dikirim. Anda tetap dapat memulihkan akun lewat admin.',
        { code: 'OTP_SEND_FAILED' }
      );
    }

    return BizUtil.ok('Kode OTP telah dikirim ke ' + this.maskEmail(email) + '. Berlaku 1 jam.', { email });
  },

  /**
   * Verifikasi OTP lalu simpan password baru.
   * Password disimpan sebagai teks polos di tabel Peserta (kebutuhan
   * operasional admin klub); Supabase Auth di sini murni berperan sebagai
   * kanal verifikasi kepemilikan email.
   */
  async verifyOtpAndReset(p) {
    const email = String(p.email || '').trim().toLowerCase();
    const token = String(p.token || '').replace(/\s/g, '');
    const peserta = Store.findPeserta(p.id_peserta);

    if (!peserta) return BizUtil.fail('Peserta tidak ditemukan.');
    if (!/^\d{6}$/.test(token)) return BizUtil.fail('Kode OTP harus 6 digit angka.');

    const pw = PasswordPolicy.evaluate(p.new_password, peserta.Username);
    if (!pw.valid) {
      return BizUtil.fail('Password baru belum memenuhi syarat: ' +
        PasswordPolicy.firstError(p.new_password, peserta.Username));
    }

    let authUserId = null;
    try {
      const { data, error } = await SupabaseClient.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw error;
      authUserId = (data && data.user && data.user.id) || null;
    } catch (err) {
      console.error('verifyOtp:', err);
      return BizUtil.fail('Kode OTP salah atau sudah kedaluwarsa. Silakan minta kode baru.');
    }

    const patch = {
      id: peserta.Id_Peserta,
      Password: p.new_password,
      Email: email,
      Password_Updated_At: BizUtil.nowIso(),
      Updated_At: BizUtil.nowIso()
    };
    if (authUserId) patch.Auth_User_Id = authUserId;

    const r = await persist('peserta', 'update', patch);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal memperbarui password.');

    Object.assign(peserta, patch);
    delete peserta.id;
    await cachePut('Peserta', peserta);

    // Sesi Supabase Auth tidak dipakai untuk apa pun setelah ini.
    try { await SupabaseClient.auth.signOut(); } catch (e) { /* abaikan */ }

    return BizUtil.ok('Password berhasil diperbarui. Silakan masuk dengan password baru.');
  },

  /** Ganti password dari dalam aplikasi (pengguna sudah login). */
  async changePassword(p) {
    if (Auth.isReadOnlyView()) {
      return BizUtil.fail(
        'Password tidak dapat diubah saat mode "lihat sebagai". ' +
        'Kembali ke akun Anda terlebih dahulu.',
        { code: 'READ_ONLY_VIEW' }
      );
    }
    const role = p.role || CONFIG.ROLES.PESERTA;
    const isPeserta = role === CONFIG.ROLES.PESERTA;
    const row = isPeserta ? Store.findPeserta(p.id) : Store.findPelatih(p.id);
    if (!row) return BizUtil.fail('Akun tidak ditemukan.');

    if (String(row.Password) !== String(p.current_password)) {
      return BizUtil.fail('Password saat ini tidak sesuai.');
    }
    const username = row.Username;
    const pw = PasswordPolicy.evaluate(p.new_password, username);
    if (!pw.valid) {
      return BizUtil.fail('Password baru belum memenuhi syarat: ' +
        PasswordPolicy.firstError(p.new_password, username));
    }
    if (String(p.new_password) === String(row.Password)) {
      return BizUtil.fail('Password baru tidak boleh sama dengan password lama.');
    }

    const resource = isPeserta ? 'peserta' : 'pelatih';
    const idKey = isPeserta ? row.Id_Peserta : row.Id_Pelatih;
    const patch = {
      id: idKey,
      Password: p.new_password,
      Password_Updated_At: BizUtil.nowIso(),
      Updated_At: BizUtil.nowIso()
    };

    const r = await persist(resource, 'update', patch);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal memperbarui password.');

    Object.assign(row, patch);
    delete row.id;
    await cachePut(isPeserta ? 'Peserta' : 'Pelatih', row);
    return BizUtil.ok('Password berhasil diperbarui.');
  },

  /* =================================================================
     5. ENROLLMENT — riwayat & perpanjangan periode pelatihan
     ================================================================= */

  async _createEnrollment(o) {
    const row = {
      Id_Enrollment: BizUtil.genId('ENR'),
      Id_Peserta: o.idPeserta,
      Kelas: o.kelas || '',
      Tanggal_Mulai: WITA.toISODate(o.mulai),
      Tanggal_Akhir: WITA.toISODate(o.akhir),
      Durasi_Bulan: Math.max(1, parseInt(o.durasi, 10) || 1),
      Status: o.status || 'pending',
      Status_Pembayaran: !!o.paid,
      Urutan: o.urutan || (this.getEnrollments(o.idPeserta).length + 1),
      Catatan: o.catatan || '',
      Dibuat_Oleh: o.dibuatOleh || '',
      Created_At: BizUtil.nowIso(),
      Updated_At: BizUtil.nowIso()
    };
    const r = await persist('enrollment', 'create', row);
    if (!r.success) return { success: false, message: r.message };
    Store.enrollment().push(row);
    await cachePut('Enrollment', row);
    return { success: true, data: row };
  },

  /** Seluruh periode pelatihan seorang peserta, terurut dari yang terlama. */
  getEnrollments(idPeserta) {
    return Store.enrollmentsOf(idPeserta).slice();
  },

  /** Periode yang sedang berjalan hari ini (sudah lunas). */
  currentEnrollment(idPeserta) {
    const today = WITA.todayISO();
    const list = this.getEnrollments(idPeserta);
    return list.find((e) =>
      BizUtil.isTrue(e.Status_Pembayaran) &&
      ['active', 'rejoined'].includes(e.Status) &&
      WITA.diffDays(e.Tanggal_Mulai, today) >= 0 &&
      WITA.diffDays(today, e.Tanggal_Akhir) >= 0
    ) || null;
  },

  /** Periode terbaru apa pun statusnya (untuk cermin data di tabel Peserta). */
  latestEnrollment(idPeserta) {
    const list = this.getEnrollments(idPeserta);
    return list.length ? list[list.length - 1] : null;
  },

  /**
   * Seluruh periode yang sudah dibayar — dasar hak akses jadwal.
   *
   * JARING PENGAMAN MIGRASI: kolom lama Peserta.Status_Pembayaran tetap
   * dihormati. Versi aplikasi sebelumnya (yang mungkin masih terpasang di
   * perangkat sebagian admin selama masa transisi) hanya menulis kolom itu
   * dan tidak mengetahui tabel Enrollment. Tanpa jaring ini, peserta yang
   * pembayarannya dikonfirmasi lewat versi lama akan terkunci keluar dari
   * jadwalnya sendiri — persis kegagalan yang paling harus dihindari.
   * Rekonsiliasi permanennya dijalankan di panel koordinator
   * (lihat reconcileLegacyPayments).
   */
  paidEnrollments(idPeserta) {
    const list = this.getEnrollments(idPeserta);
    const paid = list.filter((e) => BizUtil.isTrue(e.Status_Pembayaran) && e.Status !== 'pending');
    if (paid.length) return paid;

    const peserta = Store.findPeserta(idPeserta);
    if (peserta && BizUtil.isTrue(peserta.Status_Pembayaran) && list.length) {
      // Anggap periode terakhir sebagai berbayar, tanpa menulis apa pun di sini.
      return [list[list.length - 1]];
    }
    return [];
  },

  /**
   * Status akses jadwal seorang peserta.
   * Login selalu diizinkan; akses jadwal bergantung pada pembayaran.
   */
  accessState(idPeserta) {
    const peserta = Store.findPeserta(idPeserta);
    if (!peserta) return { allowed: false, reason: 'NOT_FOUND', message: 'Data peserta tidak ditemukan.' };

    const paid = this.paidEnrollments(idPeserta);
    if (paid.length === 0) {
      const pending = this.getEnrollments(idPeserta).find((e) => e.Status === 'pending');
      return {
        allowed: false,
        reason: 'UNPAID',
        pendingEnrollment: pending || null,
        message: 'Pembayaran Anda belum dikonfirmasi. Jadwal latihan akan terbuka otomatis ' +
                 'setelah koordinator memverifikasi pembayaran.'
      };
    }

    const current = this.currentEnrollment(idPeserta);
    if (!current) {
      const last = paid[paid.length - 1];
      return {
        allowed: true,
        expired: true,
        reason: 'EXPIRED',
        lastEnrollment: last,
        message: 'Periode pelatihan Anda telah berakhir pada ' +
                 WITA.formatDate(last.Tanggal_Akhir) +
                 '. Ajukan perpanjangan untuk melanjutkan latihan.'
      };
    }
    return { allowed: true, expired: false, reason: 'OK', enrollment: current, message: '' };
  },

  /**
   * Peserta mengajukan perpanjangan atau bergabung kembali.
   * Akun & identitas TIDAK diduplikasi; hanya periode baru yang dibuat,
   * berstatus 'pending' sampai koordinator mengonfirmasi pembayaran.
   */
  async requestExtension(p) {
    const peserta = Store.findPeserta(p.id_peserta);
    if (!peserta) return BizUtil.fail('Peserta tidak ditemukan.');

    if (Auth.isReadOnlyView()) {
      return BizUtil.fail(
        'Pengajuan tidak dapat dibuat dari mode "lihat sebagai". ' +
        'Koordinator dapat menambah periode langsung dari panel admin.',
        { code: 'READ_ONLY_VIEW' }
      );
    }

    const durasi = Math.max(1, parseInt(p.durasi, 10) || 1);
    const kelas = p.kelas || peserta.Kelas;

    const menunggu = this.getEnrollments(p.id_peserta).find((e) => e.Status === 'pending');
    if (menunggu) {
      return BizUtil.fail(
        'Anda sudah memiliki pengajuan yang menunggu konfirmasi (' +
        WITA.formatDate(menunggu.Tanggal_Mulai) + ' s.d ' + WITA.formatDate(menunggu.Tanggal_Akhir) +
        '). Hubungi admin untuk menyelesaikan pembayaran.',
        { code: 'PENDING_EXISTS', data: menunggu }
      );
    }

    // Perpanjangan menyambung sehari setelah periode berjalan berakhir;
    // bergabung kembali dimulai dari tanggal yang dipilih peserta.
    const current = this.currentEnrollment(p.id_peserta);
    const mulai = WITA.toISODate(p.mulai) ||
                  (current ? WITA.addDays(current.Tanggal_Akhir, 1) : WITA.todayISO());
    const akhir = WITA.addMonths(mulai, durasi);
    const isRejoin = !current;

    const res = await this._createEnrollment({
      idPeserta: p.id_peserta,
      kelas, mulai, akhir, durasi,
      status: 'pending',
      catatan: isRejoin
        ? 'Pengajuan bergabung kembali oleh peserta.'
        : 'Pengajuan perpanjangan oleh peserta.',
      dibuatOleh: p.id_peserta
    });
    if (!res.success) return BizUtil.fail(res.message || 'Gagal membuat pengajuan.');

    return BizUtil.ok(
      isRejoin
        ? 'Pengajuan bergabung kembali terkirim. Lanjutkan konfirmasi pembayaran via WhatsApp.'
        : 'Pengajuan perpanjangan terkirim. Lanjutkan konfirmasi pembayaran via WhatsApp.',
      { data: res.data, rejoin: isRejoin }
    );
  },

  /**
   * Koordinator memperbarui sebuah periode (status, tanggal, pembayaran).
   * Ketika periode berubah menjadi LUNAS, jadwal langsung dibuat otomatis.
   */
  async updateEnrollment(p) {
    if (!Auth.can('konfirmasiPembayaran')) {
      return BizUtil.fail('Hanya koordinator yang dapat mengubah periode pelatihan.');
    }
    const enr = Store.enrollment().find((e) => e.Id_Enrollment === p.id);
    if (!enr) return BizUtil.fail('Periode pelatihan tidak ditemukan.');

    const wasPaid = BizUtil.isTrue(enr.Status_Pembayaran);
    const patch = { id: p.id, Updated_At: BizUtil.nowIso() };

    if (p.kelas !== undefined)  patch.Kelas = p.kelas;
    if (p.mulai !== undefined)  patch.Tanggal_Mulai = WITA.toISODate(p.mulai);
    if (p.akhir !== undefined)  patch.Tanggal_Akhir = WITA.toISODate(p.akhir);
    if (p.catatan !== undefined) patch.Catatan = p.catatan;
    if (p.durasi !== undefined) patch.Durasi_Bulan = Math.max(1, parseInt(p.durasi, 10) || 1);
    if (p.status !== undefined) patch.Status = p.status;
    if (p.status_pembayaran !== undefined) {
      patch.Status_Pembayaran = (p.status_pembayaran === true || p.status_pembayaran === 'true');
    }

    // Konfirmasi pembayaran otomatis menaikkan status periode.
    if (patch.Status_Pembayaran === true && enr.Status === 'pending' && p.status === undefined) {
      const punyaRiwayat = this.getEnrollments(enr.Id_Peserta)
        .some((e) => e.Id_Enrollment !== enr.Id_Enrollment && e.Status === 'completed');
      patch.Status = punyaRiwayat ? 'rejoined' : 'active';
    }

    const r = await persist('enrollment', 'update', patch);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal memperbarui periode pelatihan.');

    Object.assign(enr, patch);
    delete enr.id;
    await cachePut('Enrollment', enr);

    await this.syncPesertaFromEnrollment(enr.Id_Peserta);

    let extra = '';
    if (!wasPaid && BizUtil.isTrue(enr.Status_Pembayaran)) {
      const gen = await this.generateScheduleForEnrollment(enr);
      if (gen.success && gen.count) extra = ' • ' + gen.count + ' jadwal dibuat otomatis';
    }
    return BizUtil.ok('Periode pelatihan diperbarui' + extra);
  },

  /** Koordinator menambahkan periode secara manual dari panel admin. */
  async addEnrollmentByAdmin(p) {
    if (!Auth.can('konfirmasiPembayaran')) {
      return BizUtil.fail('Hanya koordinator yang dapat menambah periode pelatihan.');
    }
    const peserta = Store.findPeserta(p.id_peserta);
    if (!peserta) return BizUtil.fail('Peserta tidak ditemukan.');

    const durasi = Math.max(1, parseInt(p.durasi, 10) || 1);
    const mulai = WITA.toISODate(p.mulai) || WITA.todayISO();
    const akhir = WITA.toISODate(p.akhir) || WITA.addMonths(mulai, durasi);
    const paid = p.status_pembayaran === true || p.status_pembayaran === 'true';
    const punyaRiwayat = this.getEnrollments(p.id_peserta).some((e) => e.Status === 'completed');

    const res = await this._createEnrollment({
      idPeserta: p.id_peserta,
      kelas: p.kelas || peserta.Kelas,
      mulai, akhir, durasi,
      paid,
      status: paid ? (punyaRiwayat ? 'rejoined' : 'active') : 'pending',
      catatan: p.catatan || 'Ditambahkan oleh koordinator.',
      dibuatOleh: Auth.getId() || ''
    });
    if (!res.success) return BizUtil.fail(res.message || 'Gagal menambah periode pelatihan.');

    await this.syncPesertaFromEnrollment(p.id_peserta);

    let extra = '';
    if (paid) {
      const gen = await this.generateScheduleForEnrollment(res.data);
      if (gen.success && gen.count) extra = ' • ' + gen.count + ' jadwal dibuat otomatis';
    }
    return BizUtil.ok('Periode pelatihan ditambahkan' + extra, { data: res.data });
  },

  /**
   * Selaraskan kolom cermin di tabel Peserta (Kelas / Tanggal_Mulai /
   * Tanggal_Akhir / Status_Pembayaran) dengan periode yang relevan.
   * Kolom-kolom ini dipertahankan agar seluruh laporan & tampilan lama
   * tetap berfungsi tanpa perubahan.
   */
  async syncPesertaFromEnrollment(idPeserta) {
    const peserta = Store.findPeserta(idPeserta);
    if (!peserta) return;

    const current = this.currentEnrollment(idPeserta);
    const paid = this.paidEnrollments(idPeserta);
    const ref = current || paid[paid.length - 1] || this.latestEnrollment(idPeserta);
    if (!ref) return;

    const patch = {
      id: idPeserta,
      Kelas: ref.Kelas || peserta.Kelas,
      Tanggal_Mulai: ref.Tanggal_Mulai,
      Tanggal_Akhir: ref.Tanggal_Akhir,
      Status_Pembayaran: paid.length > 0,
      Updated_At: BizUtil.nowIso()
    };

    const unchanged =
      peserta.Kelas === patch.Kelas &&
      WITA.toISODate(peserta.Tanggal_Mulai) === patch.Tanggal_Mulai &&
      WITA.toISODate(peserta.Tanggal_Akhir) === patch.Tanggal_Akhir &&
      BizUtil.isTrue(peserta.Status_Pembayaran) === patch.Status_Pembayaran;
    if (unchanged) return;

    const r = await persist('peserta', 'update', patch);
    if (!r.success) return;
    Object.assign(peserta, patch);
    delete peserta.id;
    await cachePut('Peserta', peserta);
  },

  /**
   * REKONSILIASI PEMBAYARAN WARISAN.
   *
   * Selama masa transisi, versi aplikasi lama hanya menulis kolom
   * Peserta.Status_Pembayaran dan tidak menyentuh tabel Enrollment. Fungsi
   * ini menemukan peserta yang kolom lamanya sudah LUNAS tetapi periode
   * pelatihannya masih tercatat belum dibayar, lalu menaikkan periode
   * tersebut sehingga jadwal peserta terbuka sebagaimana mestinya.
   *
   * Idempoten dan hanya bergerak SATU ARAH (belum lunas -> lunas), jadi
   * aman dijalankan berulang kali dan tidak pernah mencabut akses siapa pun.
   */
  async reconcileLegacyPayments() {
    const today = WITA.todayISO();
    const perbaikan = [];

    Store.peserta().forEach((p) => {
      if (!BizUtil.isTrue(p.Status_Pembayaran)) return;
      const list = this.getEnrollments(p.Id_Peserta);
      if (!list.length) return;
      const sudahAda = list.some((e) => BizUtil.isTrue(e.Status_Pembayaran) && e.Status !== 'pending');
      if (sudahAda) return;

      const target = list[list.length - 1];
      const selesai = target.Tanggal_Akhir && WITA.diffDays(target.Tanggal_Akhir, today) > 0;
      const punyaRiwayat = list.some((e) => e.Id_Enrollment !== target.Id_Enrollment && e.Status === 'completed');
      perbaikan.push({
        row: target,
        patch: {
          id: target.Id_Enrollment,
          Status_Pembayaran: true,
          Status: selesai ? 'completed' : (punyaRiwayat ? 'rejoined' : 'active'),
          Catatan: target.Catatan
            ? target.Catatan + ' • Pembayaran diselaraskan dari data lama.'
            : 'Pembayaran diselaraskan dari data lama.',
          Updated_At: BizUtil.nowIso()
        }
      });
    });

    if (!perbaikan.length) return { success: true, count: 0 };

    const r = await persist('enrollment', 'update', { items: perbaikan.map((x) => x.patch) });
    if (!r.success) return { success: false, count: 0 };

    perbaikan.forEach((x) => { Object.assign(x.row, x.patch); delete x.row.id; });
    await cachePutMany('Enrollment', perbaikan.map((x) => x.row));

    // Jadwal untuk periode yang baru diakui lunas dibuat menyusul.
    for (const x of perbaikan) {
      if (x.row.Status !== 'completed') await this.generateScheduleForEnrollment(x.row);
    }
    return { success: true, count: perbaikan.length };
  },

  /**
   * Tandai periode yang sudah lewat sebagai 'completed'.
   * Dijalankan diam-diam saat panel admin dibuka — tidak ada cron server.
   */
  async closeExpiredEnrollments() {
    const today = WITA.todayISO();
    const stale = Store.enrollment().filter((e) =>
      ['active', 'rejoined'].includes(e.Status) &&
      e.Tanggal_Akhir &&
      WITA.diffDays(e.Tanggal_Akhir, today) > 0
    );
    if (!stale.length) return { success: true, count: 0 };

    const items = stale.map((e) => ({
      id: e.Id_Enrollment, Status: 'completed', Updated_At: BizUtil.nowIso()
    }));
    const r = await persist('enrollment', 'update', { items });
    if (!r.success) return { success: false, count: 0 };

    stale.forEach((e) => { e.Status = 'completed'; });
    await cachePutMany('Enrollment', stale);
    return { success: true, count: stale.length };
  },

  /* =================================================================
     6. PESERTA — data & profil
     ================================================================= */

  getDataLengkapPeserta(p) {
    const peserta = Store.findPeserta(p.id_peserta);
    if (!peserta) return BizUtil.fail('Peserta tidak ditemukan');
    return BizUtil.ok('', {
      data: Object.assign({}, peserta, {
        Tanggal_Mulai: WITA.toISODate(peserta.Tanggal_Mulai),
        Tanggal_Akhir: WITA.toISODate(peserta.Tanggal_Akhir),
        Tanggal_Lahir: WITA.toISODate(peserta.Tanggal_Lahir),
        Usia: BizUtil.usia(peserta.Tanggal_Lahir)
      })
    });
  },

  /** Peserta memperbarui data dirinya sendiri. */
  async updateProfilePeserta(p) {
    const peserta = Store.findPeserta(p.id_peserta);
    if (!peserta) return BizUtil.fail('Peserta tidak ditemukan');

    if (Auth.isReadOnlyView()) {
      return BizUtil.fail(
        'Anda sedang dalam mode "lihat sebagai" yang bersifat baca-saja. ' +
        'Kembali ke akun Anda untuk melakukan perubahan.',
        { code: 'READ_ONLY_VIEW' }
      );
    }

    const patch = { id: p.id_peserta, Updated_At: BizUtil.nowIso() };
    if (p.nama_lengkap !== undefined)   patch.Nama_Lengkap = String(p.nama_lengkap).trim();
    if (p.nomor_whatsapp !== undefined) patch.Nomor_Whatsapp = BizUtil.normPhone(p.nomor_whatsapp);
    if (p.jenis_kelamin !== undefined)  patch.Jenis_Kelamin = p.jenis_kelamin;
    if (p.tempat_lahir !== undefined)   patch.Tempat_Lahir = p.tempat_lahir;
    if (p.nisnas !== undefined)         patch.NISNAS = p.nisnas;
    if (p.asal_sekolah !== undefined)   patch.Asal_Sekolah = p.asal_sekolah;
    if (p.kelas_sekolah !== undefined)  patch.Kelas_Sekolah = p.kelas_sekolah;
    if (p.wali_kelas !== undefined)     patch.Wali_Kelas = p.wali_kelas;

    if (p.email !== undefined) {
      const email = String(p.email).trim().toLowerCase();
      if (email && !BizUtil.isEmail(email)) return BizUtil.fail('Format email tidak valid.');
      const bentrok = email && Store.peserta().find((x) =>
        x.Id_Peserta !== p.id_peserta && BizUtil.norm(x.Email) === BizUtil.norm(email));
      if (bentrok) return BizUtil.fail('Email ini sudah dipakai akun peserta lain.');
      patch.Email = email;
    }

    if (p.tanggal_lahir !== undefined && p.tanggal_lahir !== '') {
      const iso = WITA.toISODate(p.tanggal_lahir);
      patch.Tanggal_Lahir = iso;
      patch.Kelompok_Umur = BizUtil.kelompokUmur(iso);
      // Nomor peserta ikut menyesuaikan karena 6 digit pertamanya adalah
      // tanggal lahir; nomor urut peserta dipertahankan.
      const urut = peserta.Nomor_Urut || (Numbering.parse(peserta.Nomor_Peserta) || {}).urut;
      if (urut) patch.Nomor_Peserta = Numbering.compose(iso, urut);
    }

    if (p.password !== undefined && p.password !== '') {
      const pw = PasswordPolicy.evaluate(p.password, peserta.Username);
      if (!pw.valid) {
        return BizUtil.fail('Password baru belum memenuhi syarat: ' +
          PasswordPolicy.firstError(p.password, peserta.Username));
      }
      patch.Password = p.password;
      patch.Password_Updated_At = BizUtil.nowIso();
    }

    const r = await persist('peserta', 'update', patch);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal memperbarui profil');

    Object.assign(peserta, patch);
    delete peserta.id;
    await cachePut('Peserta', peserta);
    return BizUtil.ok('Profil berhasil diperbarui');
  },

  /* =================================================================
     7. PANEL ADMIN — daftar peserta
     ================================================================= */

  /** Daftar peserta lengkap dengan statistik kehadiran & ringkasan periode. */
  getAllPeserta() {
    const allJadwal = Store.jadwal();
    const data = Store.peserta().map((p) => {
      const jadwal = this.jadwalUntukPeserta(allJadwal, p.Id_Peserta);
      const kehadiran = Store.kehadiranOfPeserta(p.Id_Peserta);
      const totalHadir = kehadiran.filter((k) => BizUtil.isTrue(k.Status)).length;
      const persentase = jadwal.length > 0 ? Math.round((totalHadir / jadwal.length) * 100) : 0;
      const enrollments = this.getEnrollments(p.Id_Peserta);
      const current = this.currentEnrollment(p.Id_Peserta);
      const pending = enrollments.find((e) => e.Status === 'pending') || null;

      return Object.assign({}, p, {
        Tanggal_Mulai: WITA.toISODate(p.Tanggal_Mulai),
        Tanggal_Akhir: WITA.toISODate(p.Tanggal_Akhir),
        Tanggal_Lahir: WITA.toISODate(p.Tanggal_Lahir),
        Usia: BizUtil.usia(p.Tanggal_Lahir),
        total_jadwal: jadwal.length,
        total_hadir: totalHadir,
        persentase,
        lunas: BizUtil.isTrue(p.Status_Pembayaran),
        jumlah_periode: enrollments.length,
        periode_aktif: current,
        periode_pending: pending,
        nomor_valid: Numbering.isValidFor(p.Nomor_Peserta, p.Tanggal_Lahir),
        password_lemah: !PasswordPolicy.isStrong(p.Password, p.Username)
      });
    });
    return BizUtil.ok('', { data });
  },

  /**
   * Perbarui data peserta dari panel admin.
   * Pelatih (admin biasa) TIDAK diizinkan menyentuh data diri peserta
   * maupun status pembayaran — itu wewenang koordinator.
   */
  async updatePeserta(p) {
    const peserta = Store.findPeserta(p.id);
    if (!peserta) return BizUtil.fail('Peserta tidak ditemukan');

    const bolehDataDiri = Auth.can('editDataDiriPeserta');
    const bolehBayar    = Auth.can('konfirmasiPembayaran');
    const patch = { id: p.id, Updated_At: BizUtil.nowIso() };

    if (bolehDataDiri) {
      if (p.nama_lengkap !== undefined)   patch.Nama_Lengkap = String(p.nama_lengkap).trim();
      if (p.username !== undefined) {
        const uname = String(p.username).trim();
        if (!uname) return BizUtil.fail('Username tidak boleh kosong.');
        const bentrok = Store.peserta().some((x) =>
          x.Id_Peserta !== p.id && BizUtil.norm(x.Username) === BizUtil.norm(uname));
        if (bentrok) return BizUtil.fail('Username sudah dipakai peserta lain.');
        patch.Username = uname;
      }
      if (p.password !== undefined && p.password !== '') patch.Password = p.password;
      if (p.email !== undefined)          patch.Email = String(p.email).trim().toLowerCase();
      if (p.nomor_whatsapp !== undefined) patch.Nomor_Whatsapp = BizUtil.normPhone(p.nomor_whatsapp);
      if (p.jenis_kelamin !== undefined)  patch.Jenis_Kelamin = p.jenis_kelamin;
      if (p.tempat_lahir !== undefined)   patch.Tempat_Lahir = p.tempat_lahir;
      if (p.nisnas !== undefined)         patch.NISNAS = p.nisnas;
      if (p.asal_sekolah !== undefined)   patch.Asal_Sekolah = p.asal_sekolah;
      if (p.kelas_sekolah !== undefined)  patch.Kelas_Sekolah = p.kelas_sekolah;
      if (p.wali_kelas !== undefined)     patch.Wali_Kelas = p.wali_kelas;
      if (p.status_akun !== undefined)    patch.Status_Akun = p.status_akun;
      if (p.tanggal_lahir !== undefined && p.tanggal_lahir !== '') {
        const iso = WITA.toISODate(p.tanggal_lahir);
        patch.Tanggal_Lahir = iso;
        patch.Kelompok_Umur = BizUtil.kelompokUmur(iso);
        const urut = peserta.Nomor_Urut || (Numbering.parse(peserta.Nomor_Peserta) || {}).urut;
        if (urut) patch.Nomor_Peserta = Numbering.compose(iso, urut);
      }
    }

    if (p.kelas !== undefined) patch.Kelas = p.kelas;

    if (!Object.keys(patch).some((k) => k !== 'id' && k !== 'Updated_At')) {
      return BizUtil.fail('Tidak ada perubahan yang dapat Anda simpan dengan peran saat ini.');
    }

    const r = await persist('peserta', 'update', patch);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal memperbarui data peserta');

    Object.assign(peserta, patch);
    delete peserta.id;
    await cachePut('Peserta', peserta);

    // Perubahan grup ikut diterapkan ke periode yang sedang berjalan agar
    // jadwal yang dibuat berikutnya memakai aturan grup yang benar.
    if (p.kelas !== undefined) {
      const current = this.currentEnrollment(p.id);
      if (current && current.Kelas !== p.kelas) {
        await this.updateEnrollment({ id: current.Id_Enrollment, kelas: p.kelas });
      }
    }
    return BizUtil.ok('Data peserta diperbarui');
  },

  /**
   * Nonaktifkan peserta (soft delete). Data, riwayat, absensi, dan rapor
   * TIDAK pernah dihapus — peserta yang dinonaktifkan hanya tidak dapat
   * login dan tidak muncul di daftar aktif.
   */
  async setStatusAkunPeserta(p) {
    if (!Auth.can('hapusPeserta')) {
      return BizUtil.fail('Hanya koordinator yang dapat menonaktifkan akun peserta.');
    }
    const peserta = Store.findPeserta(p.id);
    if (!peserta) return BizUtil.fail('Peserta tidak ditemukan');

    const status = p.status === 'nonaktif' ? 'nonaktif' : 'active';
    const patch = { id: p.id, Status_Akun: status, Updated_At: BizUtil.nowIso() };
    const r = await persist('peserta', 'update', patch);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal mengubah status akun');

    Object.assign(peserta, patch);
    delete peserta.id;
    await cachePut('Peserta', peserta);
    return BizUtil.ok(status === 'nonaktif' ? 'Akun peserta dinonaktifkan' : 'Akun peserta diaktifkan kembali');
  },

  /**
   * Ringkasan data yang akan ikut terhapus bila peserta dihapus permanen.
   * Dipakai untuk menampilkan konsekuensinya SEBELUM koordinator memutuskan.
   */
  previewHapusPeserta(idPeserta) {
    const jadwalPersonal = Store.jadwal().filter((j) => j.Id_Peserta === idPeserta);
    return {
      enrollment: this.getEnrollments(idPeserta).length,
      kehadiran: Store.kehadiranOfPeserta(idPeserta).length,
      rapor: Store.raporListOf(idPeserta).length,
      jadwalPersonal: jadwalPersonal.length
    };
  },

  /**
   * HAPUS PERMANEN seorang peserta beserta seluruh data turunannya.
   *
   * Tindakan ini TIDAK DAPAT DIBATALKAN dan hanya boleh dilakukan
   * koordinator. Untuk peserta yang sekadar berhenti latihan, gunakan
   * setStatusAkunPeserta('nonaktif') agar riwayatnya tetap tersimpan.
   *
   * Urutan penghapusan sengaja dari anak ke induk (kehadiran -> rapor ->
   * jadwal personal -> enrollment -> peserta). Bila salah satu langkah
   * gagal, proses dihentikan dan baris induk tetap ada, sehingga tidak
   * pernah tertinggal data yatim yang menggantung tanpa pemiliknya.
   */
  async deletePesertaPermanen(p) {
    if (!Auth.can('hapusPeserta')) {
      return BizUtil.fail('Hanya koordinator yang dapat menghapus peserta secara permanen.');
    }
    const peserta = Store.findPeserta(p.id);
    if (!peserta) return BizUtil.fail('Peserta tidak ditemukan');

    // Konfirmasi nama harus cocok persis — pengaman terakhir dari salah klik.
    if (BizUtil.normName(p.konfirmasi_nama) !== BizUtil.normName(peserta.Nama_Lengkap)) {
      return BizUtil.fail('Nama konfirmasi tidak cocok. Penghapusan dibatalkan.',
        { code: 'CONFIRM_MISMATCH' });
    }

    const kehadiran = Store.kehadiranOfPeserta(p.id).slice();
    // Seluruh riwayat penilaian, bukan hanya yang terbaru — satu peserta
    // kini dapat memiliki banyak baris Rapor.
    const raporList = Store.raporListOf(p.id).slice();
    const jadwalPersonal = Store.jadwal().filter((j) => j.Id_Peserta === p.id);
    const enrollments = this.getEnrollments(p.id).slice();

    for (const k of kehadiran) {
      const r = await persist('kehadiran', 'delete', { id: k.Id_Kehadiran });
      if (!r.success) return BizUtil.fail('Gagal menghapus data kehadiran. Penghapusan dihentikan.');
    }
    for (const rp of raporList) {
      const r = await persist('rapor', 'delete', { id: rp.Id_Rapor });
      if (!r.success) return BizUtil.fail('Gagal menghapus rapor. Penghapusan dihentikan.');
    }
    for (const j of jadwalPersonal) {
      const r = await persist('jadwal', 'delete', { id: j.Id_Jadwal });
      if (!r.success) return BizUtil.fail('Gagal menghapus jadwal personal. Penghapusan dihentikan.');
    }
    for (const e of enrollments) {
      const r = await persist('enrollment', 'delete', { id: e.Id_Enrollment });
      if (!r.success) return BizUtil.fail('Gagal menghapus periode pelatihan. Penghapusan dihentikan.');
    }

    const r = await persist('peserta', 'delete', { id: p.id });
    if (!r.success) return BizUtil.fail(r.message || 'Gagal menghapus peserta.');

    // Bersihkan cache lokal agar tampilan langsung konsisten.
    const buang = (arr, cond) => {
      for (let i = arr.length - 1; i >= 0; i--) if (cond(arr[i])) arr.splice(i, 1);
    };
    buang(Store.kehadiran(), (x) => x.Id_Peserta === p.id);
    buang(Store.rapor(), (x) => x.Id_Peserta === p.id);
    buang(Store.jadwal(), (x) => x.Id_Peserta === p.id);
    buang(Store.enrollment(), (x) => x.Id_Peserta === p.id);
    buang(Store.peserta(), (x) => x.Id_Peserta === p.id);

    await Promise.all([].concat(
      kehadiran.map((k) => cacheRemove('Kehadiran', k.Id_Kehadiran)),
      raporList.map((rp) => cacheRemove('Rapor', rp.Id_Rapor)),
      jadwalPersonal.map((j) => cacheRemove('Jadwal', j.Id_Jadwal)),
      enrollments.map((e) => cacheRemove('Enrollment', e.Id_Enrollment)),
      [cacheRemove('Peserta', p.id)]
    ));

    return BizUtil.ok('Peserta "' + peserta.Nama_Lengkap + '" beserta seluruh datanya dihapus permanen.', {
      dihapus: {
        kehadiran: kehadiran.length,
        rapor: rapor ? 1 : 0,
        jadwalPersonal: jadwalPersonal.length,
        enrollment: enrollments.length
      }
    });
  },

  /* =================================================================
     8. NOMOR PESERTA
     ================================================================= */

  /**
   * Koordinator mengoreksi nomor urut secara manual.
   * 6 digit pertama (DDMMYY) tidak dapat diubah — selalu diturunkan dari
   * tanggal lahir. Bila nomor urut sudah dipakai, permintaan ditolak dan
   * peserta pemilik nomor dikembalikan agar UI dapat menautkannya.
   */
  async setNomorUrut(p) {
    if (!Auth.can('editNomorPeserta')) {
      return BizUtil.fail('Hanya koordinator yang dapat mengubah nomor peserta.');
    }
    const peserta = Store.findPeserta(p.id_peserta);
    if (!peserta) return BizUtil.fail('Peserta tidak ditemukan');

    const urut = parseInt(p.urut, 10);
    if (isNaN(urut) || urut < 1 || urut > 9999) {
      return BizUtil.fail('Nomor urut harus berupa angka 1 sampai 9999.');
    }
    const prefix = Numbering.prefixOf(peserta.Tanggal_Lahir);
    if (!prefix) {
      return BizUtil.fail('Tanggal lahir peserta belum valid, sehingga nomor tidak dapat dibentuk.');
    }

    const conflict = Numbering.findConflict(Store.peserta(), urut, p.id_peserta);
    if (conflict) {
      return BizUtil.fail(
        'Nomor urut ' + Numbering.padUrut(urut) + ' sudah dipakai oleh ' + conflict.Nama_Lengkap + '.',
        {
          code: 'NOMOR_URUT_CONFLICT',
          data: {
            id_peserta: conflict.Id_Peserta,
            nama: conflict.Nama_Lengkap,
            nomor_peserta: conflict.Nomor_Peserta
          }
        }
      );
    }

    const nomor = prefix + Numbering.padUrut(urut);
    const patch = {
      id: p.id_peserta,
      Nomor_Peserta: nomor,
      Nomor_Urut: urut,
      Nomor_Peserta_Legacy: peserta.Nomor_Peserta_Legacy || peserta.Nomor_Peserta || '',
      Updated_At: BizUtil.nowIso()
    };
    const r = await persist('peserta', 'update', patch);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal menyimpan nomor peserta');

    Object.assign(peserta, patch);
    delete peserta.id;
    await cachePut('Peserta', peserta);
    await this._bumpNomorSeq(urut);
    return BizUtil.ok('Nomor peserta diperbarui menjadi ' + nomor, { data: { nomor_peserta: nomor } });
  },

  /** Pratinjau normalisasi nomor untuk seluruh data lama. */
  previewNormalisasiNomor() {
    return Numbering.planNormalization(Store.peserta(), Store.settings());
  },

  /**
   * Terapkan normalisasi nomor peserta secara massal.
   * Nomor lama TIDAK hilang — diarsipkan ke kolom Nomor_Peserta_Legacy
   * dan tetap ditampilkan pada detail peserta.
   */
  async applyNormalisasiNomor() {
    if (!Auth.can('normalisasiNomor')) {
      return BizUtil.fail('Hanya koordinator yang dapat menormalisasi nomor peserta.');
    }
    const plan = this.previewNormalisasiNomor().filter((x) => x.baru && !x.error);
    if (!plan.length) return BizUtil.ok('Semua nomor peserta sudah sesuai format.', { count: 0 });

    const items = plan.map((x) => {
      const peserta = Store.findPeserta(x.id);
      return {
        id: x.id,
        Nomor_Peserta: x.baru,
        Nomor_Urut: x.urut,
        Nomor_Peserta_Legacy: (peserta && peserta.Nomor_Peserta_Legacy) || x.lama || '',
        Updated_At: BizUtil.nowIso()
      };
    });

    const r = await persist('peserta', 'update', { items });
    if (!r.success) return BizUtil.fail(r.message || 'Gagal menerapkan normalisasi nomor.');

    const touched = [];
    items.forEach((item) => {
      const peserta = Store.findPeserta(item.id);
      if (!peserta) return;
      Object.assign(peserta, item);
      delete peserta.id;
      touched.push(peserta);
    });
    await cachePutMany('Peserta', touched);
    await this._bumpNomorSeq(Math.max.apply(null, plan.map((x) => x.urut)));

    return BizUtil.ok(plan.length + ' nomor peserta dinormalisasi. Nomor lama tetap diarsipkan.', {
      count: plan.length
    });
  },

  /* =================================================================
     9. KELOLA AKUN PELATIH (khusus koordinator)
     ================================================================= */

  getAllPelatih() {
    const jadwal = Store.jadwal();
    const data = Store.pelatih().map((s) => Object.assign({}, s, {
      jumlah_jadwal: jadwal.filter((j) => j.Id_Pelatih === s.Id_Pelatih).length,
      is_superadmin: s.Role === CONFIG.ROLES.SUPERADMIN,
      password_lemah: !PasswordPolicy.isStrong(s.Password, s.Username)
    }));
    data.sort((a, b) => (a.Role === b.Role ? String(a.Nama).localeCompare(String(b.Nama))
                                           : (a.Role === CONFIG.ROLES.SUPERADMIN ? -1 : 1)));
    return BizUtil.ok('', { data });
  },

  /** Daftar ringkas untuk dropdown delegasi jadwal. */
  getPelatihList() {
    return BizUtil.ok('', {
      data: Store.pelatih()
        .filter((p) => p.Aktif !== false)
        .map((p) => ({
          id: p.Id_Pelatih,
          nama: p.Nama || p.Username,
          username: p.Username,
          role: p.Role || CONFIG.ROLES.ADMIN
        }))
    });
  },

  async createPelatih(p) {
    if (!Auth.can('kelolaPelatih')) {
      return BizUtil.fail('Hanya koordinator yang dapat menambah akun pelatih.');
    }
    const username = String(p.username || '').trim();
    const nama = String(p.nama || '').trim();
    if (!nama || !username) return BizUtil.fail('Nama dan username wajib diisi.');

    const dipakai =
      Store.pelatih().some((x) => BizUtil.norm(x.Username) === BizUtil.norm(username)) ||
      Store.peserta().some((x) => BizUtil.norm(x.Username) === BizUtil.norm(username));
    if (dipakai) return BizUtil.fail('Username sudah digunakan.');

    const pw = PasswordPolicy.evaluate(p.password, username);
    if (!pw.valid) {
      return BizUtil.fail('Password belum memenuhi syarat: ' + PasswordPolicy.firstError(p.password, username));
    }

    const role = p.role === CONFIG.ROLES.SUPERADMIN ? CONFIG.ROLES.SUPERADMIN : CONFIG.ROLES.ADMIN;
    const row = {
      Id_Pelatih: BizUtil.genId('PLT'),
      Nama: nama,
      Username: username,
      Password: p.password,
      Role: role,
      Jabatan: p.jabatan || (role === CONFIG.ROLES.SUPERADMIN ? 'Koordinator Pelatih' : 'Pelatih'),
      Nomor_Whatsapp: BizUtil.normPhone(p.nomor_whatsapp),
      Email: String(p.email || '').trim().toLowerCase(),
      Aktif: true,
      Created_At: BizUtil.nowIso(),
      Updated_At: BizUtil.nowIso()
    };

    const r = await persist('pelatih', 'create', row);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal menambah akun pelatih.');
    Store.pelatih().push(row);
    await cachePut('Pelatih', row);
    return BizUtil.ok('Akun ' + CONFIG.ROLE_LABEL[role] + ' "' + nama + '" berhasil dibuat.', { data: row });
  },

  async updatePelatih(p) {
    if (!Auth.can('kelolaPelatih')) {
      return BizUtil.fail('Hanya koordinator yang dapat mengubah akun pelatih.');
    }
    const staff = Store.findPelatih(p.id);
    if (!staff) return BizUtil.fail('Akun pelatih tidak ditemukan.');

    const patch = { id: p.id, Updated_At: BizUtil.nowIso() };
    if (p.nama !== undefined)           patch.Nama = String(p.nama).trim();
    if (p.jabatan !== undefined)        patch.Jabatan = p.jabatan;
    if (p.nomor_whatsapp !== undefined) patch.Nomor_Whatsapp = BizUtil.normPhone(p.nomor_whatsapp);
    if (p.email !== undefined)          patch.Email = String(p.email).trim().toLowerCase();

    if (p.username !== undefined) {
      const uname = String(p.username).trim();
      if (!uname) return BizUtil.fail('Username tidak boleh kosong.');
      const dipakai =
        Store.pelatih().some((x) => x.Id_Pelatih !== p.id && BizUtil.norm(x.Username) === BizUtil.norm(uname)) ||
        Store.peserta().some((x) => BizUtil.norm(x.Username) === BizUtil.norm(uname));
      if (dipakai) return BizUtil.fail('Username sudah digunakan.');
      patch.Username = uname;
    }

    if (p.password !== undefined && p.password !== '') {
      const uname = patch.Username || staff.Username;
      const pw = PasswordPolicy.evaluate(p.password, uname);
      if (!pw.valid) {
        return BizUtil.fail('Password belum memenuhi syarat: ' + PasswordPolicy.firstError(p.password, uname));
      }
      patch.Password = p.password;
      patch.Password_Updated_At = BizUtil.nowIso();
    }

    // Klub harus selalu punya minimal satu koordinator aktif.
    const superAktif = Store.pelatih().filter((x) =>
      x.Role === CONFIG.ROLES.SUPERADMIN && x.Aktif !== false);

    if (p.role !== undefined && p.role !== staff.Role) {
      const turun = staff.Role === CONFIG.ROLES.SUPERADMIN && p.role !== CONFIG.ROLES.SUPERADMIN;
      if (turun && superAktif.length <= 1) {
        return BizUtil.fail('Tidak dapat menurunkan peran: klub harus memiliki minimal satu koordinator.');
      }
      patch.Role = p.role === CONFIG.ROLES.SUPERADMIN ? CONFIG.ROLES.SUPERADMIN : CONFIG.ROLES.ADMIN;
    }

    if (p.aktif !== undefined) {
      const aktif = p.aktif === true || p.aktif === 'true';
      if (!aktif && staff.Role === CONFIG.ROLES.SUPERADMIN && superAktif.length <= 1) {
        return BizUtil.fail('Tidak dapat menonaktifkan koordinator terakhir.');
      }
      patch.Aktif = aktif;
    }

    const r = await persist('pelatih', 'update', patch);
    if (!r.success) return BizUtil.fail(r.message || 'Gagal memperbarui akun pelatih.');

    Object.assign(staff, patch);
    delete staff.id;
    await cachePut('Pelatih', staff);
    return BizUtil.ok('Akun pelatih diperbarui.');
  },

  async deletePelatih(p) {
    if (!Auth.can('kelolaPelatih')) {
      return BizUtil.fail('Hanya koordinator yang dapat menghapus akun pelatih.');
    }
    const staff = Store.findPelatih(p.id);
    if (!staff) return BizUtil.fail('Akun pelatih tidak ditemukan.');
    if (p.id === Auth.getId()) return BizUtil.fail('Anda tidak dapat menghapus akun Anda sendiri.');

    const superAktif = Store.pelatih().filter((x) =>
      x.Role === CONFIG.ROLES.SUPERADMIN && x.Aktif !== false);
    if (staff.Role === CONFIG.ROLES.SUPERADMIN && superAktif.length <= 1) {
      return BizUtil.fail('Tidak dapat menghapus koordinator terakhir.');
    }

    // Jadwal & rapor yang pernah ditanganinya tetap ada; menghapus akun
    // hanya menghilangkan akses login, bukan riwayat pekerjaannya.
    const terkait = Store.jadwal().filter((j) => j.Id_Pelatih === p.id).length +
                    Store.rapor().filter((r) => r.Id_Pelatih === p.id).length;
    if (terkait > 0) {
      return BizUtil.fail(
        'Akun ini masih tertaut pada ' + terkait + ' jadwal/rapor. ' +
        'Nonaktifkan akun agar riwayat pekerjaannya tetap utuh.',
        { code: 'HAS_REFERENCES' }
      );
    }

    const r = await persist('pelatih', 'delete', { id: p.id });
    if (!r.success) return BizUtil.fail(r.message || 'Gagal menghapus akun pelatih.');

    const idx = Store.pelatih().findIndex((x) => x.Id_Pelatih === p.id);
    if (idx !== -1) Store.pelatih().splice(idx, 1);
    await cacheRemove('Pelatih', p.id);
    return BizUtil.ok('Akun pelatih dihapus.');
  },

  /**
   * Koordinator penandatangan rapor — identitas pimpinan klub, BUKAN pelatih
   * yang memberi nilai.
   *
   * Urutan prioritas dipilih agar rapor yang sudah terlanjur dicetak tetap
   * konsisten:
   *   1. Koordinator yang ditunjuk eksplisit (RAPOR_SIGNER_ID).
   *   2. Nama yang tersimpan di pengaturan (RAPOR_SIGNER_NAMA) — inilah yang
   *      mempertahankan nama tanda tangan seperti pada rapor terdahulu,
   *      meski nama akun di sistem ditulis lebih singkat.
   *   3. Koordinator aktif pertama.
   */
  getRaporSigner() {
    const s = Store.settings();
    const ditunjuk = s.RAPOR_SIGNER_ID ? Store.findPelatih(s.RAPOR_SIGNER_ID) : null;
    if (ditunjuk) {
      return {
        nama: ditunjuk.Nama,
        jabatan: ditunjuk.Jabatan || s.RAPOR_SIGNER_JABATAN || 'Koordinator Pelatih'
      };
    }
    const cadangan = Store.pelatih().find((x) =>
      x.Role === CONFIG.ROLES.SUPERADMIN && x.Aktif !== false);
    return {
      nama: (s.RAPOR_SIGNER_NAMA || '').trim() || (cadangan && cadangan.Nama) || 'Muhtar Efendi',
      jabatan: (s.RAPOR_SIGNER_JABATAN || '').trim() ||
               (cadangan && cadangan.Jabatan) || 'Koordinator Pelatih'
    };
  }
});
