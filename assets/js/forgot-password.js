/**
 * Lupa Password — alur 2 langkah (tanpa pertanyaan keamanan):
 *   1. Verifikasi identitas: Nama Lengkap + Tanggal Lahir + No WhatsApp
 *      -> action 'verifyResetIdentity' (cek tanpa mengubah apa pun)
 *   2. Buat password baru -> action 'resetPassword' (kirim ulang validator + password)
 *
 * Semua data verifikasi disimpan sementara di state agar dikirim bersama
 * password baru pada langkah terakhir.
 */
(function () {
  'use strict';

  const state = { nama_lengkap: '', tanggal_lahir: '', nomor_whatsapp: '' };

  function showStep(id) {
    document.querySelectorAll('.fp-step').forEach(f => f.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    const card = document.querySelector('.auth-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- STEP 1: verifikasi identitas ----
  async function handleVerify(e) {
    e.preventDefault();
    const nama = document.getElementById('fp-nama').value.trim();
    const tglLahir = document.getElementById('fp-tgl-lahir').value;
    const wa = document.getElementById('fp-wa').value.replace(/[^0-9]/g, '');

    if (!nama) { UI.toast('Masukkan nama lengkap Anda', 'warning'); return; }
    if (!tglLahir) { UI.toast('Masukkan tanggal lahir Anda', 'warning'); return; }
    if (!/^[0-9]{8,15}$/.test(wa)) { UI.toast('Nomor WhatsApp tidak valid (8-15 digit)', 'warning'); return; }

    const payload = { nama_lengkap: nama, tanggal_lahir: tglLahir, nomor_whatsapp: wa };
    const res = BizLogic.verifyResetIdentity(payload);
    if (!res.success) { UI.toast(res.message || 'Verifikasi gagal', 'error'); return; }

    Object.assign(state, payload);
    UI.toast('Identitas terverifikasi. Silakan buat password baru.', 'success');
    showStep('form-newpass');
  }

  // ---- STEP 2: simpan password baru ----
  async function handleNewPass(e) {
    e.preventDefault();
    const p1 = document.getElementById('fp-pass1').value;
    const p2 = document.getElementById('fp-pass2').value;
    if (p1.length < 6) { UI.toast('Password baru minimal 6 karakter', 'warning'); return; }
    if (p1 !== p2) { UI.toast('Konfirmasi password tidak cocok', 'warning'); return; }

    const res = await BizLogic.resetPassword({ ...state, new_password: p1 });
    if (res.success) {
      UI.toast(res.message || 'Password berhasil diperbarui. Silakan login.', 'success', { duration: 3500 });
      setTimeout(() => { window.location.href = 'login.html'; }, 1600);
    } else {
      UI.toast(res.message || 'Gagal menyimpan password', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    // Sinkronkan cache Peserta (dibutuhkan untuk verifikasi identitas & reset password secara lokal).
    await Sync.init(['Peserta']);

    document.getElementById('form-verify').addEventListener('submit', handleVerify);
    document.getElementById('form-newpass').addEventListener('submit', handleNewPass);
    document.getElementById('fp-back-1').addEventListener('click', () => showStep('form-verify'));
    // Password toggles otomatis di-bind oleh UI (data-password-toggle).
  });
})();
