/**
 * ===================================================================
 * business-logic.js — SELURUH business logic yang dipindahkan dari Code.gs
 * ===================================================================
 * Backend (Code.gs) sekarang hanya CRUD polos. Semua yang sebelumnya
 * berjalan di Apps Script — autentikasi, validasi, filtering, searching,
 * sorting, penggabungan data, perhitungan statistik, nomor peserta,
 * jadwal, berita, dsb. — dijalankan di sini, memakai data lokal (Store)
 * dari sync.js. Bentuk & pesan setiap fungsi SENGAJA dibuat identik
 * dengan fungsi asli di Code.gs agar tampilan & alur UI tidak berubah.
 */

/* ============================== UTIL DASAR (setara helper Code.gs) ============================== */
const BizUtil = {
  /** Setara formatDate() di Code.gs: Date -> 'YYYY-MM-DD'. */
  formatDate(d) {
    if (!d) return '';
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  },
  isTrue(v) { return v === true || String(v).toUpperCase() === 'TRUE'; },
  norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); },
  genId(prefix) { return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000); }
};

/**
 * Kirim operasi Create/Update/Delete ke backend. Bila gagal karena TIDAK
 * ADA KONEKSI (offline), operasi diantre ke Outbox & tetap dianggap
 * berhasil secara lokal (optimistic) — data sudah benar di cache & akan
 * tersinkron begitu online kembali. Kegagalan LAIN (mis. data tidak
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

const BERITA_STATUS = ['Publik', 'Semua Peserta', 'Peserta Grup A', 'Peserta Grup B', 'Peserta Grup C'];

const BizLogic = {

  // ====================== AUTH ======================
  async registerPeserta(p) {
    if (Store.peserta().some(x => x.Username === p.username)) {
      return { success: false, message: 'Username sudah digunakan' };
    }
    const id = BizUtil.genId('PST');
    const kelompokUmur = Utils.calculateKelompokUmur(p.tanggal_lahir);

    // Nomor_Peserta digenerate otomatis saat pendaftaran (ddmmyy + urut) agar admin
    // tidak perlu men-generate manual lagi saat Tindak Lanjut Pembayaran.
    let nomorPeserta = '';
    const nomorGen = await this.reserveNomorPeserta(p.tanggal_lahir, p.kelas, null);
    if (nomorGen.success) nomorPeserta = nomorGen.nomor;

    const row = {
      Id_Peserta: id, Nama_Lengkap: p.nama_lengkap, Username: p.username, Password: p.password,
      Nomor_Whatsapp: p.nomor_whatsapp, Jenis_Kelamin: p.jenis_kelamin || '', Tempat_Lahir: p.tempat_lahir || '',
      Tanggal_Lahir: p.tanggal_lahir || '', NISNAS: p.nisnas || '', Asal_Sekolah: p.asal_sekolah || '',
      Kelas_Sekolah: p.kelas_sekolah || '', Wali_Kelas: p.wali_kelas || '', Kelompok_Umur: kelompokUmur,
      Kelas: p.kelas || '', Tanggal_Mulai: p.tanggal_mulai || '', Tanggal_Akhir: p.tanggal_akhir || '',
      Status_Pembayaran: false, Nomor_Peserta: nomorPeserta
    };
    const r = await persist('peserta', 'create', row);
    if (!r.success) return { success: false, message: r.message || 'Gagal mendaftar, silakan coba lagi.' };
    Store.peserta().push(row);
    try { await LocalDB.put('Peserta', row); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Registrasi berhasil. Lanjutkan via WhatsApp untuk pembayaran.', id };
  },

  login(p) {
    const admin = Store.pelatih().find(a => a.Username === p.username && String(a.Password) === String(p.password));
    if (admin) return { success: true, role: 'admin', data: { id: admin.Id_Pelatih, nama: admin.Nama || admin.Username, username: admin.Username } };

    const peserta = Store.peserta().find(x => x.Username === p.username && String(x.Password) === String(p.password));
    if (peserta) {
      if (!BizUtil.isTrue(peserta.Status_Pembayaran)) return { success: false, message: 'Pembayaran belum dikonfirmasi admin. Hubungi admin via WhatsApp.' };
      return { success: true, role: 'peserta', data: {
        id: peserta.Id_Peserta, nama: peserta.Nama_Lengkap, username: peserta.Username,
        kelas: peserta.Kelas, nomor_peserta: peserta.Nomor_Peserta || '',
        tanggal_mulai: BizUtil.formatDate(peserta.Tanggal_Mulai), tanggal_akhir: BizUtil.formatDate(peserta.Tanggal_Akhir)
      } };
    }
    return { success: false, message: 'Username atau password salah' };
  },

  /** Wajib cocok SEMUA: Nama_Lengkap + Tanggal_Lahir + Nomor_Whatsapp + NISNAS. */
  findPesertaByIdentity(p) {
    const waInput = String(p.nomor_whatsapp || '').replace(/[^0-9]/g, '');
    const nisnInput = String(p.nisnas || '').replace(/[^0-9A-Za-z]/g, '');
    return Store.peserta().find(x =>
      BizUtil.norm(x.Nama_Lengkap) === BizUtil.norm(p.nama_lengkap) &&
      BizUtil.formatDate(x.Tanggal_Lahir) === String(p.tanggal_lahir || '').trim() &&
      String(x.Nomor_Whatsapp).replace(/[^0-9]/g, '') === waInput &&
      String(x.NISNAS).replace(/[^0-9A-Za-z]/g, '') === nisnInput
    );
  },

  verifyResetIdentity(p) {
    if (!p.nama_lengkap || !p.tanggal_lahir || !p.nomor_whatsapp) {
      return { success: false, message: 'Nama lengkap, tanggal lahir, dan nomor WhatsApp wajib diisi.' };
    }
    const peserta = this.findPesertaByIdentity(p);
    if (!peserta) return { success: false, message: 'Data tidak cocok. Pastikan semua data sesuai dengan saat pendaftaran.' };
    return { success: true, message: 'Identitas terverifikasi.', data: { id_peserta: peserta.Id_Peserta, username: peserta.Username } };
  },

  async resetPassword(p) {
    if (!p.nama_lengkap || !p.tanggal_lahir || !p.nomor_whatsapp || !p.nisnas) {
      return { success: false, message: 'Semua data verifikasi wajib diisi.' };
    }
    const peserta = this.findPesertaByIdentity(p);
    if (!peserta) return { success: false, message: 'Data tidak cocok. Pastikan semua data sesuai dengan saat pendaftaran.' };
    if (!p.new_password || String(p.new_password).length < 6) return { success: false, message: 'Password baru minimal 6 karakter' };

    const r = await persist('peserta', 'update', { id: peserta.Id_Peserta, Password: p.new_password });
    if (!r.success) return { success: false, message: r.message || 'Gagal memperbarui password' };
    peserta.Password = p.new_password;
    try { await LocalDB.put('Peserta', peserta); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Password berhasil diperbarui. Silakan login.' };
  },

  // ====================== PESERTA - DASHBOARD ======================
  /**
   * Filter jadwal milik seorang peserta:
   *   - Jadwal personal (Id_Peserta terisi) -> hanya miliknya sendiri.
   *   - Jadwal kelas (Id_Peserta kosong) -> harus berada di dalam rentang
   *     periode pendaftaran peserta (Tanggal_Mulai s.d Tanggal_Akhir).
   */
  filterJadwalByPeserta(allJadwal, peserta, idPeserta) {
    let start = peserta.Tanggal_Mulai ? new Date(peserta.Tanggal_Mulai) : null;
    let end = peserta.Tanggal_Akhir ? new Date(peserta.Tanggal_Akhir) : null;
    if (start && isNaN(start.getTime())) start = null;
    if (end && isNaN(end.getTime())) end = null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    return allJadwal.filter(j => {
      if (j.Id_Peserta) return j.Id_Peserta === idPeserta;
      if (j.Kelas !== peserta.Kelas) return false;
      if (!start || !end) return true;
      const tgl = new Date(j.Tanggal);
      if (isNaN(tgl.getTime())) return true;
      return tgl >= start && tgl <= end;
    });
  },

  getJadwalPeserta(p) {
    const peserta = Store.peserta().find(x => x.Id_Peserta === p.id_peserta);
    if (!peserta) return { success: false, message: 'Peserta tidak ditemukan' };
    const allJadwal = Store.jadwal();
    const jadwal = this.filterJadwalByPeserta(allJadwal, peserta, p.id_peserta);
    const kehadiran = Store.kehadiran().filter(k => k.Id_Peserta === p.id_peserta);
    const result = jadwal.map(j => {
      const k = kehadiran.find(x => x.Id_Jadwal === j.Id_Jadwal);
      return Object.assign({}, j, {
        Tanggal: BizUtil.formatDate(j.Tanggal),
        is_personal: !!j.Id_Peserta,
        sudah_absen: !!k,
        status_kehadiran: k ? (BizUtil.isTrue(k.Status) ? 'hadir' : 'izin') : null,
        catatan_izin: k ? (k.Catatan || '') : ''
      });
    });
    return { success: true, data: result, kelas: peserta.Kelas };
  },

  async absen(p) {
    const jadwal = Store.jadwal().find(j => j.Id_Jadwal === p.id_jadwal);
    if (!jadwal) return { success: false, message: 'Jadwal tidak ditemukan' };
    if (String(jadwal.Status).toLowerCase() !== 'aktif') return { success: false, message: 'Absensi belum dibuka. Status: ' + jadwal.Status };
    if (Store.kehadiran().find(k => k.Id_Jadwal === p.id_jadwal && k.Id_Peserta === p.id_peserta)) {
      return { success: false, message: 'Anda sudah memberikan respons untuk jadwal ini' };
    }
    const row = { Id_Kehadiran: BizUtil.genId('KHD'), Id_Jadwal: p.id_jadwal, Id_Peserta: p.id_peserta, Status: true, Catatan: '' };
    const r = await persist('kehadiran', 'create', row);
    if (!r.success) return { success: false, message: r.message || 'Gagal mencatat absensi' };
    Store.kehadiran().push(row);
    try { await LocalDB.put('Kehadiran', row); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Absensi berhasil dicatat' };
  },

  async izin(p) {
    const jadwal = Store.jadwal().find(j => j.Id_Jadwal === p.id_jadwal);
    if (!jadwal) return { success: false, message: 'Jadwal tidak ditemukan' };
    if (Store.kehadiran().find(k => k.Id_Jadwal === p.id_jadwal && k.Id_Peserta === p.id_peserta)) {
      return { success: false, message: 'Anda sudah memberikan respons untuk jadwal ini' };
    }
    const row = { Id_Kehadiran: BizUtil.genId('KHD'), Id_Jadwal: p.id_jadwal, Id_Peserta: p.id_peserta, Status: false, Catatan: p.catatan || 'Tidak ada keterangan' };
    const r = await persist('kehadiran', 'create', row);
    if (!r.success) return { success: false, message: r.message || 'Gagal mengirim izin' };
    Store.kehadiran().push(row);
    try { await LocalDB.put('Kehadiran', row); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Izin berhasil dikirim ke pelatih' };
  },

  getKehadiranPeserta(p) {
    const peserta = Store.peserta().find(x => x.Id_Peserta === p.id_peserta);
    if (!peserta) return { success: false, message: 'Peserta tidak ditemukan' };
    const allJadwal = this.filterJadwalByPeserta(Store.jadwal(), peserta, p.id_peserta);
    const kehadiran = Store.kehadiran().filter(k => k.Id_Peserta === p.id_peserta);
    const totalHadir = kehadiran.filter(k => BizUtil.isTrue(k.Status)).length;
    const totalIzin = kehadiran.filter(k => !BizUtil.isTrue(k.Status)).length;
    const persentase = allJadwal.length > 0 ? Math.round((totalHadir / allJadwal.length) * 100) : 0;
    return { success: true, data: { total_jadwal: allJadwal.length, total_hadir: totalHadir, total_izin: totalIzin, persentase } };
  },

  getDataLengkapPeserta(p) {
    const peserta = Store.peserta().find(x => x.Id_Peserta === p.id_peserta);
    if (!peserta) return { success: false, message: 'Peserta tidak ditemukan' };
    return { success: true, data: Object.assign({}, peserta, {
      Tanggal_Mulai: BizUtil.formatDate(peserta.Tanggal_Mulai),
      Tanggal_Akhir: BizUtil.formatDate(peserta.Tanggal_Akhir),
      Tanggal_Lahir: BizUtil.formatDate(peserta.Tanggal_Lahir)
    }) };
  },

  async updateProfilePeserta(p) {
    const peserta = Store.peserta().find(x => x.Id_Peserta === p.id_peserta);
    if (!peserta) return { success: false, message: 'Peserta tidak ditemukan' };
    const patch = { id: p.id_peserta };
    if (p.nama_lengkap !== undefined) patch.Nama_Lengkap = p.nama_lengkap;
    if (p.nomor_whatsapp !== undefined) patch.Nomor_Whatsapp = p.nomor_whatsapp;
    if (p.jenis_kelamin !== undefined) patch.Jenis_Kelamin = p.jenis_kelamin;
    if (p.tempat_lahir !== undefined) patch.Tempat_Lahir = p.tempat_lahir;
    if (p.tanggal_lahir !== undefined && p.tanggal_lahir !== '') {
      patch.Tanggal_Lahir = p.tanggal_lahir;
      patch.Kelompok_Umur = Utils.calculateKelompokUmur(p.tanggal_lahir);
    }
    if (p.nisnas !== undefined) patch.NISNAS = p.nisnas;
    if (p.asal_sekolah !== undefined) patch.Asal_Sekolah = p.asal_sekolah;
    if (p.kelas_sekolah !== undefined) patch.Kelas_Sekolah = p.kelas_sekolah;
    if (p.wali_kelas !== undefined) patch.Wali_Kelas = p.wali_kelas;
    if (p.password !== undefined && p.password !== '') patch.Password = p.password;

    const r = await persist('peserta', 'update', patch);
    if (!r.success) return { success: false, message: r.message || 'Gagal memperbarui profil' };
    Object.assign(peserta, patch);
    delete peserta.id;
    try { await LocalDB.put('Peserta', peserta); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Profil berhasil diperbarui' };
  },

  getRaporPeserta(p) {
    const rapor = Store.rapor().find(r => r.Id_Peserta === p.id_peserta);
    if (!rapor) return { success: true, data: null, message: 'Rapor belum diunggah pelatih' };
    let namaPelatih = '';
    if (rapor.Id_Pelatih) {
      const pelatih = Store.pelatih().find(x => x.Id_Pelatih === rapor.Id_Pelatih);
      if (pelatih) namaPelatih = pelatih.Nama || pelatih.Username;
    }
    return { success: true, data: Object.assign({}, rapor, { Tanggal_Rapor: BizUtil.formatDate(rapor.Tanggal_Rapor), Nama_Pelatih: namaPelatih }) };
  },

  // ====================== ADMIN - PESERTA ======================
  getAllPeserta() {
    const pesertas = Store.peserta();
    const allJadwal = Store.jadwal();
    const allKehadiran = Store.kehadiran();
    const data = pesertas.map(p => {
      const totalJadwal = this.filterJadwalByPeserta(allJadwal, p, p.Id_Peserta).length;
      const totalHadir = allKehadiran.filter(k => k.Id_Peserta === p.Id_Peserta && BizUtil.isTrue(k.Status)).length;
      const persentase = totalJadwal > 0 ? Math.round((totalHadir / totalJadwal) * 100) : 0;
      let usia = '';
      if (p.Tanggal_Lahir) {
        const lahir = new Date(p.Tanggal_Lahir);
        if (!isNaN(lahir.getTime())) {
          const now = new Date();
          usia = now.getFullYear() - lahir.getFullYear();
          const m = now.getMonth() - lahir.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < lahir.getDate())) usia--;
        }
      }
      return Object.assign({}, p, {
        Tanggal_Mulai: BizUtil.formatDate(p.Tanggal_Mulai),
        Tanggal_Akhir: BizUtil.formatDate(p.Tanggal_Akhir),
        Tanggal_Lahir: BizUtil.formatDate(p.Tanggal_Lahir),
        Usia: usia, total_jadwal: totalJadwal, total_hadir: totalHadir, persentase: persentase
      });
    });
    return { success: true, data };
  },

  async updatePeserta(p) {
    const peserta = Store.peserta().find(x => x.Id_Peserta === p.id);
    if (!peserta) return { success: false, message: 'Peserta tidak ditemukan' };

    const prevPaid = BizUtil.isTrue(peserta.Status_Pembayaran);
    const newPaid = (p.status_pembayaran === true || p.status_pembayaran === 'true');

    const nomorPeserta = (p.nomor_peserta !== undefined)
      ? String(p.nomor_peserta).trim()
      : String(peserta.Nomor_Peserta || '').trim();

    // GUARD: tidak boleh LUNAS tanpa Nomor_Peserta
    if (newPaid && !nomorPeserta) {
      return { success: false, code: 'NOMOR_PESERTA_REQUIRED', message: 'Nomor Peserta wajib diisi sebelum status diubah menjadi LUNAS.' };
    }

    const patch = { id: p.id };
    if (p.nama_lengkap !== undefined) patch.Nama_Lengkap = p.nama_lengkap;
    if (p.username !== undefined) patch.Username = p.username;
    if (p.password !== undefined && p.password !== '') patch.Password = p.password;
    if (p.nomor_whatsapp !== undefined) patch.Nomor_Whatsapp = p.nomor_whatsapp;
    if (p.jenis_kelamin !== undefined) patch.Jenis_Kelamin = p.jenis_kelamin;
    if (p.tempat_lahir !== undefined) patch.Tempat_Lahir = p.tempat_lahir;
    if (p.tanggal_lahir !== undefined) {
      patch.Tanggal_Lahir = p.tanggal_lahir;
      patch.Kelompok_Umur = Utils.calculateKelompokUmur(p.tanggal_lahir);
    }
    if (p.nisnas !== undefined) patch.NISNAS = p.nisnas;
    if (p.asal_sekolah !== undefined) patch.Asal_Sekolah = p.asal_sekolah;
    if (p.kelas_sekolah !== undefined) patch.Kelas_Sekolah = p.kelas_sekolah;
    if (p.wali_kelas !== undefined) patch.Wali_Kelas = p.wali_kelas;
    if (p.kelas !== undefined) patch.Kelas = p.kelas;
    if (p.tanggal_mulai !== undefined) patch.Tanggal_Mulai = p.tanggal_mulai;
    if (p.tanggal_akhir !== undefined) patch.Tanggal_Akhir = p.tanggal_akhir;
    if (p.nomor_peserta !== undefined) patch.Nomor_Peserta = nomorPeserta;
    if (p.status_pembayaran !== undefined) patch.Status_Pembayaran = newPaid;

    const r = await persist('peserta', 'update', patch);
    if (!r.success) return { success: false, message: r.message || 'Gagal memperbarui data peserta' };

    Object.assign(peserta, patch);
    delete peserta.id;
    try { await LocalDB.put('Peserta', peserta); } catch (e) { /* abaikan */ }

    let extra = '';
    if (newPaid && !prevPaid) {
      const gen = await this.generateScheduleForPeserta(p.id);
      if (gen.success) extra = ' • ' + gen.count + ' jadwal kelas di-generate otomatis';
    }
    return { success: true, message: 'Data peserta diperbarui' + extra };
  },

  async deletePeserta(p) {
    const idx = Store.peserta().findIndex(x => x.Id_Peserta === p.id);
    if (idx === -1) return { success: false, message: 'Peserta tidak ditemukan' };
    const r = await persist('peserta', 'delete', { id: p.id });
    if (!r.success) return { success: false, message: r.message || 'Gagal menghapus peserta' };
    Store.peserta().splice(idx, 1);
    try { await LocalDB.remove('Peserta', p.id); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Peserta dihapus' };
  },

  /** Generate jadwal kelas otomatis untuk peserta yang baru LUNAS (lihat schedule.js). */
  async generateScheduleForPeserta(idPeserta) {
    const peserta = Store.peserta().find(x => x.Id_Peserta === idPeserta);
    if (!peserta || !peserta.Kelas || !peserta.Tanggal_Mulai || !peserta.Tanggal_Akhir) return { success: false };
    const admins = Store.pelatih();
    const idPelatih = admins.length > 0 ? admins[0].Id_Pelatih : 'PLT-001';
    const newRows = buildScheduleForPeserta(peserta, Store.jadwal(), idPelatih);
    if (newRows.length === 0) return { success: true, count: 0 };

    const r = await persist('jadwal', 'create', { items: newRows });
    if (!r.success) return { success: false };
    newRows.forEach(row => Store.jadwal().push(row));
    try { await Promise.all(newRows.map(row => LocalDB.put('Jadwal', row))); } catch (e) { /* abaikan */ }
    return { success: true, count: newRows.length };
  },

  // ====================== ADMIN - JADWAL ======================
  getAllJadwal() {
    const jadwals = Store.jadwal();
    const pesertas = Store.peserta();
    const data = jadwals.map(j => {
      let namaPeserta = '';
      if (j.Id_Peserta) {
        const ps = pesertas.find(x => x.Id_Peserta === j.Id_Peserta);
        if (ps) namaPeserta = ps.Nama_Lengkap;
      }
      return Object.assign({}, j, { Tanggal: BizUtil.formatDate(j.Tanggal), nama_peserta_personal: namaPeserta, is_personal: !!j.Id_Peserta });
    });
    return { success: true, data };
  },

  async createJadwal(p) {
    let kelas = p.kelas || '';
    if (p.id_peserta) {
      const peserta = Store.peserta().find(x => x.Id_Peserta === p.id_peserta);
      if (peserta) kelas = peserta.Kelas;
    }
    const id = BizUtil.genId('JDW');
    const row = { Id_Jadwal: id, Id_Pelatih: p.id_pelatih, Id_Peserta: p.id_peserta || '', Tanggal: p.tanggal, Pukul: p.pukul, Lokasi: p.lokasi, Kelas: kelas, Status: p.status || 'Pending' };
    const r = await persist('jadwal', 'create', row);
    if (!r.success) return { success: false, message: r.message || 'Gagal membuat jadwal' };
    Store.jadwal().push(row);
    try { await LocalDB.put('Jadwal', row); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Jadwal dibuat', id };
  },

  /** Buat jadwal personal untuk banyak peserta sekaligus (1x panggilan batch ke backend). */
  async createJadwalBatch(p) {
    const pesertaIds = Array.isArray(p.peserta) ? p.peserta.filter(Boolean) : [];
    if (pesertaIds.length === 0) return { success: false, message: 'Minimal pilih 1 peserta' };
    if (!p.tanggal || !p.pukul || !p.lokasi) return { success: false, message: 'Tanggal, pukul, dan lokasi wajib diisi' };

    const pesertaMap = {};
    Store.peserta().forEach(x => pesertaMap[x.Id_Peserta] = x);

    const rows = pesertaIds.map((idPeserta, i) => {
      const ps = pesertaMap[idPeserta];
      const kelas = ps ? ps.Kelas : (p.kelas || '');
      return { Id_Jadwal: BizUtil.genId('JDW') + '-' + i, Id_Pelatih: p.id_pelatih, Id_Peserta: idPeserta, Tanggal: p.tanggal, Pukul: p.pukul, Lokasi: p.lokasi, Kelas: kelas, Status: p.status || 'Pending' };
    });

    const r = await persist('jadwal', 'create', { items: rows });
    if (!r.success) return { success: false, message: r.message || 'Gagal membuat jadwal' };
    rows.forEach(row => Store.jadwal().push(row));
    try { await Promise.all(rows.map(row => LocalDB.put('Jadwal', row))); } catch (e) { /* abaikan */ }
    return { success: true, message: rows.length + ' jadwal personal berhasil dibuat', count: rows.length };
  },

  async updateJadwal(p) {
    const jadwal = Store.jadwal().find(x => x.Id_Jadwal === p.id);
    if (!jadwal) return { success: false, message: 'Jadwal tidak ditemukan' };
    const patch = { id: p.id };
    if (p.id_peserta !== undefined) patch.Id_Peserta = p.id_peserta || '';
    if (p.tanggal !== undefined) patch.Tanggal = p.tanggal;
    if (p.pukul !== undefined) patch.Pukul = p.pukul;
    if (p.lokasi !== undefined) patch.Lokasi = p.lokasi;
    if (p.kelas !== undefined) patch.Kelas = p.kelas;
    if (p.status !== undefined) patch.Status = p.status;
    const r = await persist('jadwal', 'update', patch);
    if (!r.success) return { success: false, message: r.message || 'Gagal memperbarui jadwal' };
    Object.assign(jadwal, patch);
    delete jadwal.id;
    try { await LocalDB.put('Jadwal', jadwal); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Jadwal diperbarui' };
  },

  async deleteJadwal(p) {
    const idx = Store.jadwal().findIndex(x => x.Id_Jadwal === p.id);
    if (idx === -1) return { success: false, message: 'Jadwal tidak ditemukan' };
    const r = await persist('jadwal', 'delete', { id: p.id });
    if (!r.success) return { success: false, message: r.message || 'Gagal menghapus jadwal' };
    Store.jadwal().splice(idx, 1);
    try { await LocalDB.remove('Jadwal', p.id); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Jadwal dihapus' };
  },

  getJadwalAttendees(p) {
    const jadwal = Store.jadwal().find(j => j.Id_Jadwal === p.id_jadwal);
    if (!jadwal) return { success: false, message: 'Jadwal tidak ditemukan' };
    const pesertas = Store.peserta();
    let attendees;
    if (jadwal.Id_Peserta) attendees = pesertas.filter(x => x.Id_Peserta === jadwal.Id_Peserta);
    else attendees = pesertas.filter(x => x.Kelas === jadwal.Kelas && BizUtil.isTrue(x.Status_Pembayaran));
    const kehadiran = Store.kehadiran().filter(k => k.Id_Jadwal === p.id_jadwal);
    const data = attendees.map(ps => {
      const k = kehadiran.find(x => x.Id_Peserta === ps.Id_Peserta);
      let status = 'belum';
      if (k) status = BizUtil.isTrue(k.Status) ? 'hadir' : 'izin';
      return { id_peserta: ps.Id_Peserta, nama: ps.Nama_Lengkap, kelas: ps.Kelas, status, catatan: k ? (k.Catatan || '') : '' };
    });
    return { success: true, data, jadwal: Object.assign({}, jadwal, { Tanggal: BizUtil.formatDate(jadwal.Tanggal), is_personal: !!jadwal.Id_Peserta }) };
  },

  // ====================== ADMIN - KEHADIRAN ======================
  getAllKehadiran(p) {
    const kehadirans = Store.kehadiran();
    const pesertas = Store.peserta();
    const jadwals = Store.jadwal();
    let enriched = kehadirans.map(k => {
      const ps = pesertas.find(x => x.Id_Peserta === k.Id_Peserta);
      const jd = jadwals.find(j => j.Id_Jadwal === k.Id_Jadwal);
      return Object.assign({}, k, {
        nama_peserta: ps ? ps.Nama_Lengkap : '-',
        tanggal: jd ? BizUtil.formatDate(jd.Tanggal) : '-',
        tanggal_raw: jd ? jd.Tanggal : null,
        pukul: jd ? jd.Pukul : '-', kelas: jd ? jd.Kelas : '-', lokasi: jd ? jd.Lokasi : '-',
        status_label: BizUtil.isTrue(k.Status) ? 'hadir' : 'izin'
      });
    });
    if (p && p.periode && p.periode !== 'all') {
      const now = new Date();
      enriched = enriched.filter(k => {
        if (!k.tanggal_raw) return false;
        const tgl = new Date(k.tanggal_raw);
        if (p.periode === 'minggu') return (now - tgl) <= 7 * 86400000 && (now - tgl) >= 0;
        if (p.periode === 'bulan') return tgl.getMonth() === now.getMonth() && tgl.getFullYear() === now.getFullYear();
        if (p.periode === 'tahun') return tgl.getFullYear() === now.getFullYear();
        return true;
      });
    }
    return { success: true, data: enriched };
  },

  async updateKehadiran(p) {
    const kehadiran = Store.kehadiran().find(x => x.Id_Kehadiran === p.id);
    if (!kehadiran) return { success: false, message: 'Kehadiran tidak ditemukan' };
    const patch = { id: p.id };
    if (p.status !== undefined) patch.Status = (p.status === true || p.status === 'true');
    if (p.catatan !== undefined) patch.Catatan = p.catatan;
    const r = await persist('kehadiran', 'update', patch);
    if (!r.success) return { success: false, message: r.message || 'Gagal memperbarui kehadiran' };
    Object.assign(kehadiran, patch);
    delete kehadiran.id;
    try { await LocalDB.put('Kehadiran', kehadiran); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Kehadiran diperbarui' };
  },

  async deleteKehadiran(p) {
    const idx = Store.kehadiran().findIndex(x => x.Id_Kehadiran === p.id);
    if (idx === -1) return { success: false, message: 'Kehadiran tidak ditemukan' };
    const r = await persist('kehadiran', 'delete', { id: p.id });
    if (!r.success) return { success: false, message: r.message || 'Gagal menghapus kehadiran' };
    Store.kehadiran().splice(idx, 1);
    try { await LocalDB.remove('Kehadiran', p.id); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Kehadiran dihapus' };
  },

  getKehadiranForExport(p) {
    if (!p.kelas || !p.tanggal_dari || !p.tanggal_sampai) return { success: false, message: 'Kelas dan periode wajib diisi' };
    const dari = new Date(p.tanggal_dari); dari.setHours(0, 0, 0, 0);
    const sampai = new Date(p.tanggal_sampai); sampai.setHours(23, 59, 59, 999);

    const allPeserta = Store.peserta().filter(x => x.Kelas === p.kelas);
    const allJadwal = Store.jadwal().filter(j => {
      if (j.Id_Peserta) return false;
      if (j.Kelas !== p.kelas) return false;
      const tgl = new Date(j.Tanggal);
      return tgl >= dari && tgl <= sampai;
    });
    const allKehadiran = Store.kehadiran();

    const dateSet = new Set();
    allJadwal.forEach(j => dateSet.add(BizUtil.formatDate(j.Tanggal)));
    const dates = Array.from(dateSet).sort();

    const peserta = allPeserta.map(ps => {
      const attendance = {};
      dates.forEach(d => {
        const jadwalsForDate = allJadwal.filter(j => BizUtil.formatDate(j.Tanggal) === d);
        if (jadwalsForDate.length === 0) { attendance[d] = ''; return; }
        let status = 'A';
        for (const j of jadwalsForDate) {
          const k = allKehadiran.find(x => x.Id_Jadwal === j.Id_Jadwal && x.Id_Peserta === ps.Id_Peserta);
          if (k) { status = BizUtil.isTrue(k.Status) ? 'H' : 'I'; break; }
        }
        attendance[d] = status;
      });
      return { id: ps.Id_Peserta, nama: ps.Nama_Lengkap, attendance };
    });
    return { success: true, data: { dates, peserta, kelas: p.kelas, periode: { dari: p.tanggal_dari, sampai: p.tanggal_sampai } } };
  },

  // ====================== ADMIN - RAPOR ======================
  getAllRapor() {
    const rapors = Store.rapor();
    const pesertas = Store.peserta();
    const data = rapors.map(r => {
      const ps = pesertas.find(x => x.Id_Peserta === r.Id_Peserta);
      return Object.assign({}, r, { nama_peserta: ps ? ps.Nama_Lengkap : '-', Tanggal_Rapor: BizUtil.formatDate(r.Tanggal_Rapor) });
    });
    return { success: true, data };
  },

  async upsertRapor(p) {
    const fieldMap = {
      predikat: 'Predikat', catatan: 'Catatan',
      waktu_25_bebas: 'Waktu_25_Bebas', waktu_25_dada: 'Waktu_25_Dada', waktu_25_kupu: 'Waktu_25_Kupu', waktu_25_punggung: 'Waktu_25_Punggung',
      waktu_50_bebas: 'Waktu_50_Bebas', waktu_50_dada: 'Waktu_50_Dada', waktu_50_kupu: 'Waktu_50_Kupu', waktu_50_punggung: 'Waktu_50_Punggung',
      waktu_25_bebas_pelampung: 'Waktu_25_Bebas_Pelampung', waktu_25_dada_pelampung: 'Waktu_25_Dada_Pelampung',
      waktu_25_kupu_pelampung: 'Waktu_25_Kupu_Pelampung', waktu_25_punggung_pelampung: 'Waktu_25_Punggung_Pelampung'
    };
    const existing = Store.rapor().find(r => r.Id_Peserta === p.id_peserta);
    const nowIso = new Date().toISOString();

    if (existing) {
      const patch = { id: existing.Id_Rapor };
      Object.keys(fieldMap).forEach(k => { if (p[k] !== undefined) patch[fieldMap[k]] = p[k]; });
      patch.Tanggal_Rapor = nowIso;
      if (p.id_pelatih) patch.Id_Pelatih = p.id_pelatih;
      const r = await persist('rapor', 'update', patch);
      if (!r.success) return { success: false, message: r.message || 'Gagal memperbarui rapor' };
      Object.assign(existing, patch);
      delete existing.id;
      try { await LocalDB.put('Rapor', existing); } catch (e) { /* abaikan */ }
      return { success: true, message: 'Rapor diperbarui' };
    }

    const row = {
      Id_Rapor: BizUtil.genId('RPR'), Id_Peserta: p.id_peserta, Predikat: p.predikat || '', Catatan: p.catatan || '',
      Waktu_25_Bebas: p.waktu_25_bebas || '', Waktu_25_Dada: p.waktu_25_dada || '', Waktu_25_Kupu: p.waktu_25_kupu || '', Waktu_25_Punggung: p.waktu_25_punggung || '',
      Waktu_50_Bebas: p.waktu_50_bebas || '', Waktu_50_Dada: p.waktu_50_dada || '', Waktu_50_Kupu: p.waktu_50_kupu || '', Waktu_50_Punggung: p.waktu_50_punggung || '',
      Tanggal_Rapor: nowIso, Id_Pelatih: p.id_pelatih || '',
      Waktu_25_Bebas_Pelampung: p.waktu_25_bebas_pelampung || '', Waktu_25_Dada_Pelampung: p.waktu_25_dada_pelampung || '',
      Waktu_25_Kupu_Pelampung: p.waktu_25_kupu_pelampung || '', Waktu_25_Punggung_Pelampung: p.waktu_25_punggung_pelampung || ''
    };
    const r = await persist('rapor', 'create', row);
    if (!r.success) return { success: false, message: r.message || 'Gagal membuat rapor' };
    Store.rapor().push(row);
    try { await LocalDB.put('Rapor', row); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Rapor dibuat' };
  },

  async deleteRapor(p) {
    const idx = Store.rapor().findIndex(x => x.Id_Rapor === p.id);
    if (idx === -1) return { success: false, message: 'Rapor tidak ditemukan' };
    const r = await persist('rapor', 'delete', { id: p.id });
    if (!r.success) return { success: false, message: r.message || 'Gagal menghapus rapor' };
    Store.rapor().splice(idx, 1);
    try { await LocalDB.remove('Rapor', p.id); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Rapor dihapus' };
  },

  // ====================== BERITA ======================
  /** Normalisasi status berita; nilai kosong/legacy diperlakukan sebagai 'Publik'. */
  normBeritaStatus(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return 'Publik';
    const found = BERITA_STATUS.find(opt => BizUtil.norm(opt) === BizUtil.norm(s));
    return found || 'Publik';
  },

  /**
   * @param status   status berita (sudah dinormalisasi)
   * @param audience 'public' | 'peserta' | nama kelas ('Grup A' dst.) | 'admin'
   */
  beritaVisibleFor(status, audience) {
    if (audience === 'admin') return true;
    if (audience === 'public') return status === 'Publik';
    if (status === 'Publik' || status === 'Semua Peserta') return true;
    const kelas = String(audience || '').trim();
    return status === 'Peserta ' + kelas;
  },

  /**
   *   - admin (default, tanpa param)   : SEMUA berita (untuk panel admin).
   *   - p.audience='public'            : hanya berita Publik (index.html).
   *   - p.kelas='Grup A' (peserta)     : Publik + Semua Peserta + Peserta Grup A.
   */
  getAllBerita(p) {
    p = p || {};
    let audience = 'admin';
    if (p.audience === 'public') audience = 'public';
    else if (p.kelas) audience = String(p.kelas).trim();

    const berita = Store.berita().map(b => {
      const status = this.normBeritaStatus(b.Status);
      return Object.assign({}, b, { Tanggal: BizUtil.formatDate(b.Tanggal), Status: status });
    }).filter(b => this.beritaVisibleFor(b.Status, audience));

    berita.sort((a, b) => new Date(b.Tanggal) - new Date(a.Tanggal));
    return { success: true, data: berita };
  },

  /** Khusus index.html (publik) — hanya berita berstatus Publik. */
  getActiveBerita() {
    return this.getAllBerita({ audience: 'public' });
  },

  async createBerita(p) {
    const id = BizUtil.genId('BRT');
    const status = this.normBeritaStatus(p.status);
    const row = { Id_Berita: id, Judul: p.judul, Tanggal: p.tanggal || new Date().toISOString(), Deskripsi: p.deskripsi || '', Link: p.link || '', Status: status };
    const r = await persist('berita', 'create', row);
    if (!r.success) return { success: false, message: r.message || 'Gagal membuat berita' };
    Store.berita().push(row);
    try { await LocalDB.put('Berita', row); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Berita dibuat', id };
  },

  async updateBerita(p) {
    const berita = Store.berita().find(x => x.Id_Berita === p.id);
    if (!berita) return { success: false, message: 'Berita tidak ditemukan' };
    const patch = { id: p.id };
    if (p.judul !== undefined) patch.Judul = p.judul;
    if (p.tanggal !== undefined) patch.Tanggal = p.tanggal;
    if (p.deskripsi !== undefined) patch.Deskripsi = p.deskripsi;
    if (p.link !== undefined) patch.Link = p.link;
    if (p.status !== undefined) patch.Status = this.normBeritaStatus(p.status);
    const r = await persist('berita', 'update', patch);
    if (!r.success) return { success: false, message: r.message || 'Gagal memperbarui berita' };
    Object.assign(berita, patch);
    delete berita.id;
    try { await LocalDB.put('Berita', berita); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Berita diperbarui' };
  },

  async deleteBerita(p) {
    const idx = Store.berita().findIndex(x => x.Id_Berita === p.id);
    if (idx === -1) return { success: false, message: 'Berita tidak ditemukan' };
    const r = await persist('berita', 'delete', { id: p.id });
    if (!r.success) return { success: false, message: r.message || 'Gagal menghapus berita' };
    Store.berita().splice(idx, 1);
    try { await LocalDB.remove('Berita', p.id); } catch (e) { /* abaikan */ }
    return { success: true, message: 'Berita dihapus' };
  },

  // ====================== SETTINGS (nomor peserta) ======================
  getSettings() {
    const s = Store.settings();
    const ac = parseInt(s.NOMOR_SEQ_AC, 10);
    const b = parseInt(s.NOMOR_SEQ_B, 10);
    return { success: true, data: { seq_ac: isNaN(ac) ? 0 : ac, seq_b: isNaN(b) ? 0 : b } };
  },

  async updateSettings(p) {
    const patch = {};
    if (p.seq_ac !== undefined) {
      const n = parseInt(p.seq_ac, 10);
      if (isNaN(n) || n < 0) return { success: false, message: 'Nomor urut Grup A/C harus berupa angka ≥ 0.' };
      patch.NOMOR_SEQ_AC = String(n);
    }
    if (p.seq_b !== undefined) {
      const n = parseInt(p.seq_b, 10);
      if (isNaN(n) || n < 0) return { success: false, message: 'Nomor urut Grup B harus berupa angka ≥ 0.' };
      patch.NOMOR_SEQ_B = String(n);
    }
    const res = await Sync.pushSettings(patch);
    if (!res || !res.success) { await Sync.queue('settings', 'update', patch); Object.assign(Store.settings(), patch); }
    return { success: true, message: 'Pengaturan nomor peserta disimpan', data: this.getSettings().data };
  },

  /** Counter key (ac/b) berdasarkan kelas peserta. */
  counterKeyForKelas(kelas) { return (String(kelas).trim() === 'Grup B') ? 'B' : 'AC'; },

  /** Bagian ddmmyy (6 digit) dari tanggal lahir. */
  ddmmyyFromDate(tanggalLahir) {
    const d = new Date(tanggalLahir);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return dd + mm + yy;
  },

  /** Semua Nomor_Peserta yang sudah terpakai (untuk jaminan unik), dari cache lokal. */
  existingNomorSet(excludeId) {
    const set = {};
    Store.peserta().forEach(p => {
      if (excludeId && p.Id_Peserta === excludeId) return;
      const n = String(p.Nomor_Peserta || '').trim();
      if (n) set[n] = true;
    });
    return set;
  },

  /**
   * Inti logika pembuatan Nomor_Peserta otomatis: format = ddmmyy(6) + urut(4).
   * Counter diambil dari Settings (disinkronkan ke server), di-increment,
   * dijamin unik terhadap Nomor_Peserta yang sudah terpakai di cache lokal.
   */
  async reserveNomorPeserta(tanggalLahir, kelas, excludeId) {
    const ddmmyy = this.ddmmyyFromDate(tanggalLahir);
    if (!ddmmyy) return { success: false, message: 'Tanggal lahir peserta tidak valid sehingga nomor tidak dapat dibuat.' };

    const which = this.counterKeyForKelas(kelas); // 'AC' | 'B'
    const propKey = which === 'B' ? 'NOMOR_SEQ_B' : 'NOMOR_SEQ_AC';

    let seq = parseInt(Store.settings()[propKey], 10);
    if (isNaN(seq) || seq < 0) seq = 0;

    const used = this.existingNomorSet(excludeId);
    let nomor = '';
    for (let i = 0; i < 100000; i++) {
      seq += 1;
      const urut = String(seq).padStart(4, '0');
      nomor = ddmmyy + urut;
      if (!used[nomor]) break;
    }

    const patch = {}; patch[propKey] = String(seq);
    const res = await Sync.pushSettings(patch);
    if (!res || !res.success) { await Sync.queue('settings', 'update', patch); Object.assign(Store.settings(), patch); }

    return { success: true, nomor, counter: which.toLowerCase(), seq };
  },

  /** Generate Nomor_Peserta untuk SEORANG PESERTA YANG SUDAH ADA (tombol "Generate" di admin). */
  async generateNomorPeserta(p) {
    const peserta = Store.peserta().find(x => x.Id_Peserta === p.id_peserta);
    if (!peserta) return { success: false, message: 'Peserta tidak ditemukan' };

    const r = await this.reserveNomorPeserta(peserta.Tanggal_Lahir, peserta.Kelas, p.id_peserta);
    if (!r.success) return r;

    const persisted = await persist('peserta', 'update', { id: p.id_peserta, Nomor_Peserta: r.nomor });
    if (!persisted.success) return { success: false, message: persisted.message || 'Gagal menyimpan nomor peserta' };
    peserta.Nomor_Peserta = r.nomor;
    try { await LocalDB.put('Peserta', peserta); } catch (e) { /* abaikan */ }

    return { success: true, message: 'Nomor peserta dibuat: ' + r.nomor, data: { nomor_peserta: r.nomor, counter: r.counter, seq: r.seq } };
  },

  getPelatihList() {
    const list = Store.pelatih().map(p => ({ id: p.Id_Pelatih, nama: p.Nama || p.Username, username: p.Username }));
    return { success: true, data: list };
  }
};
