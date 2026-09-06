/**
 * update-password.js — Halaman ganti password untuk pengguna yang sudah masuk
 *
 * Menjadi tujuan tombol pada banner "Perbarui password Anda" yang muncul
 * bagi akun lama dengan password yang belum memenuhi kebijakan baru.
 * Berlaku untuk ketiga peran (peserta, pelatih, koordinator).
 */
(function () {
  'use strict';

  let guard = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const session = Auth.getSession();
    if (!session) { window.location.replace('login.html'); return; }

    Utils.mountNavbar('');

    const isPeserta = session.role === CONFIG.ROLES.PESERTA;
    await Sync.init(isPeserta ? ['Peserta'] : ['Pelatih'], render);
    render();

    function render() {
      const nama = (session.data && (session.data.nama || session.data.username)) || '';
      const username = (session.data && session.data.username) || '';
      document.getElementById('up-nama').textContent = nama;
      document.getElementById('up-peran').textContent = Auth.roleLabel(session.role);
      document.getElementById('up-username').textContent = username;

      const perlu = BizLogic.needsPasswordUpdate(session.data.id, session.role);
      const alert = document.getElementById('up-alert');
      alert.hidden = !perlu;

      if (!guard) {
        guard = PasswordPolicy.attach({
          input: document.getElementById('up-new'),
          confirmInput: document.getElementById('up-confirm'),
          checklist: document.getElementById('up-checklist'),
          usernameValue: () => username,
          submitButton: document.getElementById('up-submit')
        });
      } else {
        guard.refresh();
      }
    }

    document.getElementById('form-update-password').addEventListener('submit', async (e) => {
      e.preventDefault();
      const current = document.getElementById('up-current').value;
      const next = document.getElementById('up-new').value;
      const confirm = document.getElementById('up-confirm').value;

      if (!current) { UI.toast('Masukkan password Anda saat ini', 'warning'); return; }
      if (next !== confirm) { UI.toast('Konfirmasi password tidak cocok', 'warning'); return; }
      if (!guard.isValid()) {
        UI.toast(PasswordPolicy.firstError(next, session.data.username), 'warning');
        return;
      }

      const btn = document.getElementById('up-submit');
      btn.disabled = true;
      Utils.showLoader(true);
      const res = await BizLogic.changePassword({
        id: session.data.id,
        role: session.role,
        current_password: current,
        new_password: next
      });
      Utils.showLoader(false);
      btn.disabled = false;

      if (!res.success) { UI.toast(res.message, 'error', { duration: 5000 }); return; }

      // Segarkan penanda pada sesi agar banner tidak muncul lagi.
      Auth.patchUser({ needs_password_update: false });
      try { localStorage.removeItem('swim_pwnag_snooze'); } catch (err) { /* abaikan */ }

      UI.toast('Password berhasil diperbarui.', 'success');
      document.getElementById('form-update-password').reset();
      guard.refresh();
      setTimeout(() => { window.location.href = Auth.homeFor(session.role); }, 1200);
    });

    document.getElementById('up-cancel').addEventListener('click', () => {
      window.location.href = Auth.homeFor(session.role);
    });
  });
})();
