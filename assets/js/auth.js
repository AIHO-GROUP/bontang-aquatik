/**
 * AUTH — sesi disimpan di localStorage agar TIDAK perlu login ulang
 * setiap membuka PWA. Sesi bertahan sampai user logout atau menghapus data.
 * Migrasi otomatis dari sessionStorage lama agar pengguna existing mulus.
 */
const Auth = {
  KEY: 'swim_session',

  setSession(role, data) {
    const payload = JSON.stringify({ role, data, timestamp: Date.now() });
    try { localStorage.setItem(this.KEY, payload); } catch (e) { /* ignore quota */ }
    // Bersihkan sesi lama berbasis sessionStorage jika ada.
    try { sessionStorage.removeItem(this.KEY); } catch (e) {}
  },

  getSession() {
    let raw = null;
    try { raw = localStorage.getItem(this.KEY); } catch (e) {}
    // Fallback: migrasikan sesi lama dari sessionStorage.
    if (!raw) {
      try {
        const legacy = sessionStorage.getItem(this.KEY);
        if (legacy) { localStorage.setItem(this.KEY, legacy); sessionStorage.removeItem(this.KEY); raw = legacy; }
      } catch (e) {}
    }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  isLoggedIn() { return this.getSession() !== null; },
  getRole() { const s = this.getSession(); return s ? s.role : null; },
  getUser() { const s = this.getSession(); return s ? s.data : null; },

  /** Perbarui sebagian data sesi tanpa login ulang (mis. setelah update profil). */
  patchUser(partial) {
    const s = this.getSession();
    if (!s) return;
    s.data = { ...s.data, ...partial };
    this.setSession(s.role, s.data);
  },

  logout() {
    try { localStorage.removeItem(this.KEY); } catch (e) {}
    try { sessionStorage.removeItem(this.KEY); } catch (e) {}
    window.location.href = 'index.html';
  },

  requireRole(role) {
    const s = this.getSession();
    if (!s || s.role !== role) {
      Utils.notify('Anda harus login terlebih dahulu', 'warning');
      setTimeout(() => window.location.href = 'login.html', 1200);
      return false;
    }
    return true;
  }
};