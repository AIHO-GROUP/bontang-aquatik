/**
 * ===================================================================
 * auth.js — Sesi, peran, dan izin akses
 * ===================================================================
 * Sesi disimpan di localStorage agar pengguna tidak perlu login ulang
 * setiap membuka PWA. Migrasi otomatis dari sessionStorage lama tetap
 * dipertahankan supaya pengguna existing tidak terputus.
 *
 * Tiga peran:
 *   superadmin — Koordinator/pemilik klub. Akses penuh ke seluruh fitur
 *                dan data, termasuk konfirmasi pembayaran, kelola akun
 *                pelatih, dan mengubah data diri peserta.
 *   admin      — Pelatih operasional. Melatih, memantau absensi jadwal
 *                yang didelegasikan kepadanya, dan memberi penilaian.
 *                TIDAK boleh mengubah data diri peserta maupun status
 *                pembayaran.
 *   peserta    — Pengguna akhir.
 *
 * Peran lama 'admin' pada sesi yang tersimpan di perangkat pengguna
 * tetap dikenali; peran sebenarnya diselaraskan dari database saat
 * sinkronisasi berikutnya (lihat Auth.syncRoleFromStore).
 */
const Auth = {
  KEY: 'swim_session',
  ROOT_KEY: 'swim_session_root',   // sesi asli saat sedang "lihat sebagai"

  /* ============================ SESI DASAR ============================ */

  setSession(role, data) {
    const payload = JSON.stringify({ role, data, timestamp: Date.now() });
    try { localStorage.setItem(this.KEY, payload); } catch (e) { /* kuota penuh */ }
    try { sessionStorage.removeItem(this.KEY); } catch (e) { /* abaikan */ }
  },

  getSession() {
    let raw = null;
    try { raw = localStorage.getItem(this.KEY); } catch (e) { /* abaikan */ }
    if (!raw) {
      // Migrasi sesi lama berbasis sessionStorage.
      try {
        const legacy = sessionStorage.getItem(this.KEY);
        if (legacy) {
          localStorage.setItem(this.KEY, legacy);
          sessionStorage.removeItem(this.KEY);
          raw = legacy;
        }
      } catch (e) { /* abaikan */ }
    }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  },

  isLoggedIn() { return this.getSession() !== null; },
  getRole()    { const s = this.getSession(); return s ? s.role : null; },
  getUser()    { const s = this.getSession(); return s ? s.data : null; },
  getId()      { const u = this.getUser(); return u ? u.id : null; },

  /** Perbarui sebagian data sesi tanpa login ulang (mis. setelah edit profil). */
  patchUser(partial) {
    const s = this.getSession();
    if (!s) return;
    s.data = Object.assign({}, s.data, partial);
    this.setSession(s.role, s.data);
  },

  logout() {
    try { localStorage.removeItem(this.KEY); } catch (e) { /* abaikan */ }
    try { localStorage.removeItem(this.ROOT_KEY); } catch (e) { /* abaikan */ }
    try { sessionStorage.removeItem(this.KEY); } catch (e) { /* abaikan */ }
    window.location.href = 'index.html';
  },

  /* ============================== PERAN ============================== */

  isSuperadmin()  { return this.getRole() === CONFIG.ROLES.SUPERADMIN; },
  isAdmin()       { return this.getRole() === CONFIG.ROLES.ADMIN; },
  isPeserta()     { return this.getRole() === CONFIG.ROLES.PESERTA; },
  /** Superadmin ATAU admin — keduanya memakai panel admin. */
  isStaff()       { const r = this.getRole(); return r === CONFIG.ROLES.SUPERADMIN || r === CONFIG.ROLES.ADMIN; },

  roleLabel(role) { return CONFIG.ROLE_LABEL[role || this.getRole()] || 'Pengguna'; },

  /** Halaman dashboard sesuai peran. */
  homeFor(role) {
    return (role || this.getRole()) === CONFIG.ROLES.PESERTA ? 'peserta.html' : 'admin.html';
  },

  /**
   * Matriks izin. Satu tempat untuk seluruh keputusan "boleh atau tidak",
   * sehingga UI dan business logic tidak pernah berbeda pendapat.
   */
  can(action) {
    const role = this.getRole();
    const isSuper = role === CONFIG.ROLES.SUPERADMIN;
    const isAdmin = role === CONFIG.ROLES.ADMIN;
    switch (action) {
      // Hanya koordinator (pemilik bisnis)
      case 'konfirmasiPembayaran':
      case 'editDataDiriPeserta':
      case 'hapusPeserta':
      case 'kelolaPelatih':
      case 'delegasiJadwal':
      case 'normalisasiNomor':
      case 'unduhArsipRapor':
      case 'editNomorPeserta':
      case 'kelolaPengaturanSistem':
        return isSuper;
      // Pelatih operasional + koordinator
      // "Lihat sebagai" bersifat BACA-SAJA (lihat isReadOnlyView), jadi aman
      // diberikan kepada pelatih untuk menelusuri keluhan peserta tanpa
      // melanggar aturan bahwa pelatih tidak boleh mengubah data peserta.
      case 'lihatSebagaiPengguna':
      case 'lihatPeserta':
      case 'kelolaJadwal':
      case 'kelolaKehadiran':
      case 'kelolaRapor':
      case 'kelolaBerita':
      case 'exportKehadiran':
        return isSuper || isAdmin;
      default:
        return isSuper;
    }
  },

  /**
   * Selaraskan peran pada sesi dengan data terbaru dari tabel Pelatih.
   * Dipanggil setelah sinkronisasi agar promosi/demosi peran langsung
   * berlaku tanpa memaksa pengguna login ulang.
   * @returns {boolean} true bila peran berubah
   */
  syncRoleFromStore() {
    const s = this.getSession();
    if (!s || s.role === CONFIG.ROLES.PESERTA) return false;
    if (this.isImpersonating()) return false;
    if (typeof Store === 'undefined') return false;

    const row = Store.pelatih().find((p) => p.Id_Pelatih === (s.data && s.data.id));
    if (!row) return false;

    if (row.Aktif === false) { this.logout(); return true; }

    const actual = row.Role === CONFIG.ROLES.SUPERADMIN ? CONFIG.ROLES.SUPERADMIN : CONFIG.ROLES.ADMIN;
    const changed = actual !== s.role;
    s.data = Object.assign({}, s.data, {
      nama: row.Nama || row.Username,
      username: row.Username,
      jabatan: row.Jabatan || '',
      role: actual
    });
    this.setSession(actual, s.data);
    return changed;
  },

  /* ========================= LIHAT SEBAGAI (IMPERSONASI) =========================
     Koordinator dapat membuka dashboard peserta atau pelatih tertentu untuk
     menelusuri keluhan tanpa meminta password mereka. Sesi asli disimpan,
     sebuah banner selalu tampil, dan satu klik mengembalikannya.
     ============================================================================= */

  isImpersonating() {
    try { return !!localStorage.getItem(this.ROOT_KEY); } catch (e) { return false; }
  },

  /**
   * Mode "lihat sebagai" bersifat BACA-SAJA.
   *
   * Alasannya dua, dan keduanya penting:
   *   • Pelatih tidak boleh mengubah data diri peserta. Tanpa aturan ini,
   *     pelatih bisa menembus larangan tersebut hanya dengan membuka
   *     dashboard peserta lalu menyunting profilnya.
   *   • Perubahan yang dibuat sambil menyamar akan tercatat seolah-olah
   *     dilakukan oleh peserta sendiri — menyesatkan bagi siapa pun yang
   *     kelak menelusuri riwayat data.
   * Untuk mengubah data peserta, koordinator memakai panel admin sebagai
   * dirinya sendiri.
   */
  isReadOnlyView() { return this.isImpersonating(); },

  getRootSession() {
    try {
      const raw = localStorage.getItem(this.ROOT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  /** Mulai melihat aplikasi sebagai pengguna lain. */
  impersonate(role, data) {
    const current = this.getSession();
    if (!current) return false;
    if (!this.isImpersonating()) {
      try { localStorage.setItem(this.ROOT_KEY, JSON.stringify(current)); } catch (e) { return false; }
    }
    this.setSession(role, Object.assign({}, data, { _impersonated: true }));
    return true;
  },

  /** Kembali ke akun asli. */
  stopImpersonation(redirect) {
    const root = this.getRootSession();
    try { localStorage.removeItem(this.ROOT_KEY); } catch (e) { /* abaikan */ }
    if (root) {
      this.setSession(root.role, root.data);
      if (redirect !== false) window.location.href = this.homeFor(root.role);
      return true;
    }
    return false;
  },

  /** Banner permanen saat mode "lihat sebagai" aktif. */
  mountImpersonationBanner() {
    if (!this.isImpersonating()) return;
    if (document.getElementById('impersonation-banner')) return;
    const user = this.getUser() || {};
    const root = this.getRootSession();
    const asName = user.nama || user.username || 'pengguna';
    const rootName = (root && root.data && (root.data.nama || root.data.username)) || 'akun Anda';

    const el = document.createElement('div');
    el.id = 'impersonation-banner';
    el.className = 'impersonation-banner';
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<span class="impersonation-banner__dot" aria-hidden="true"></span>' +
      '<span class="impersonation-banner__text">Anda sedang melihat sebagai <strong>' +
        Utils.escapeHtml(asName) + '</strong> (' + Utils.escapeHtml(this.roleLabel(this.getRole())) + ')</span>' +
      '<button type="button" class="impersonation-banner__btn">Kembali ke ' + Utils.escapeHtml(rootName) + '</button>';
    document.body.appendChild(el);
    document.body.classList.add('has-impersonation-banner');
    el.querySelector('button').addEventListener('click', () => this.stopImpersonation());
  },

  /* ============================ PENJAGA HALAMAN ============================ */

  /**
   * @param {string|string[]} roles peran yang diizinkan
   * @returns {boolean} false bila akses ditolak (pemanggil harus berhenti)
   */
  requireRole(roles) {
    const allowed = Array.isArray(roles) ? roles : [roles];
    const s = this.getSession();
    if (!s) {
      window.location.replace('login.html');
      return false;
    }
    if (!allowed.includes(s.role)) {
      // Sudah login tetapi salah halaman — arahkan ke dashboard yang benar
      // alih-alih memaksa login ulang.
      window.location.replace(this.homeFor(s.role));
      return false;
    }
    return true;
  }
};
