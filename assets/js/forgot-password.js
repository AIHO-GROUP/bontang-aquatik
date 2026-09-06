/**
 * forgot-password.js — Pemulihan password dengan OTP email
 *
 * Alur tiga langkah, dirancang agar tidak ada peserta yang terkunci:
 *
 *   1. VERIFIKASI IDENTITAS  (nama + tanggal lahir + nomor WhatsApp)
 *      Membuktikan kepemilikan AKUN. Data ini hanya diketahui pemilik
 *      akun dan admin klub.
 *
 *   2. KODE OTP KE EMAIL
 *      Membuktikan kepemilikan EMAIL. Peserta lama yang belum punya email
 *      terdaftar dapat mendaftarkan emailnya di langkah ini — aman, karena
 *      identitasnya sudah terbukti di langkah 1.
 *
 *   3. PASSWORD BARU
 *      Divalidasi real-time terhadap kebijakan password (lihat lib/password.js).
 *
 * Bila email tidak kunjung datang, tersedia tombol bantuan ke WhatsApp
 * admin yang otomatis membawa identitas peserta.
 */
(function () {
  'use strict';

  const state = {
    nama_lengkap: '', tanggal_lahir: '', nomor_whatsapp: '',
    id_peserta: '', username: '', email: '', email_masked: ''
  };
  let pwGuard = null;
  let resendTimer = null;

  const STEP_INDEX = { 'form-verify': 1, 'form-email': 2, 'form-otp': 3 };

  function showStep(id) {
    document.querySelectorAll('.fp-step').forEach((f) => f.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    const current = STEP_INDEX[id] || 1;
    document.querySelectorAll('.fp-steps__item').forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle('is-active', n === current);
      li.classList.toggle('is-done', n < current);
    });

    const card = document.querySelector('.auth-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function pesertaUntukWA() {
    const p = Store.findPeserta(state.id_peserta);
    return p || {
      Nama_Lengkap: state.nama_lengkap,
      Nomor_Whatsapp: state.nomor_whatsapp,
      Username: state.username
    };
  }

  function bindWaBantuan() {
    document.querySelectorAll('[data-wa-bantuan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        WA.open(WA.Templates.bantuanPassword(pesertaUntukWA()));
      });
    });
  }

  /* ---------------- LANGKAH 1: verifikasi identitas ---------------- */
  function handleVerify(e) {
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

    Object.assign(state, payload, res.data);

    // Tampilkan email terdaftar (tersamarkan) atau minta email baru.
    const info = document.getElementById('fp-email-info');
    const input = document.getElementById('fp-email');
    if (state.email) {
      info.innerHTML = 'Kode akan dikirim ke email terdaftar: <strong>' +
        Utils.escapeHtml(state.email_masked) + '</strong>. ' +
        'Anda juga boleh mengganti alamat email di bawah ini.';
      input.value = state.email;
    } else {
      info.innerHTML = 'Akun Anda <strong>belum memiliki email terdaftar</strong>. ' +
        'Masukkan alamat email aktif Anda — email ini sekaligus akan disimpan ' +
        'untuk pemulihan akun di kemudian hari.';
      input.value = '';
    }

    UI.toast('Identitas terverifikasi.', 'success');
    showStep('form-email');
    input.focus();
  }

  /* ---------------- LANGKAH 2: kirim OTP ---------------- */
  async function handleSendOtp(e) {
    e.preventDefault();
    const email = document.getElementById('fp-email').value.trim().toLowerCase();
    const btn = document.getElementById('fp-send-otp');

    btn.disabled = true;
    btn.classList.add('is-loading');
    Utils.showLoader(true);
    const res = await BizLogic.requestPasswordOtp({ id_peserta: state.id_peserta, email });
    Utils.showLoader(false);
    btn.classList.remove('is-loading');
    btn.disabled = false;

    if (!res.success) {
      UI.toast(res.message, 'error', { duration: 6000 });
      if (res.code === 'OTP_SEND_FAILED') document.getElementById('fp-wa-fallback').hidden = false;
      return;
    }

    state.email = email;
    document.getElementById('fp-otp-target').textContent = BizLogic.maskEmail(email);
    UI.toast(res.message, 'success', { duration: 5000 });
    showStep('form-otp');
    startResendCooldown();
    document.getElementById('fp-otp').focus();
  }

  function startResendCooldown() {
    const btn = document.getElementById('fp-resend');
    let sisa = 60;
    if (resendTimer) clearInterval(resendTimer);
    btn.disabled = true;
    const tick = () => {
      btn.textContent = sisa > 0 ? 'Kirim ulang kode (' + sisa + 's)' : 'Kirim ulang kode';
      if (sisa <= 0) { btn.disabled = false; clearInterval(resendTimer); resendTimer = null; }
      sisa -= 1;
    };
    tick();
    resendTimer = setInterval(tick, 1000);
  }

  async function handleResend() {
    const btn = document.getElementById('fp-resend');
    btn.disabled = true;
    const res = await BizLogic.requestPasswordOtp({ id_peserta: state.id_peserta, email: state.email });
    if (res.success) { UI.toast('Kode baru telah dikirim.', 'success'); startResendCooldown(); }
    else { UI.toast(res.message, 'error', { duration: 6000 }); btn.disabled = false; }
  }

  /* ---------------- LANGKAH 3: verifikasi OTP + password baru ---------------- */
  async function handleReset(e) {
    e.preventDefault();
    const token = document.getElementById('fp-otp').value.trim();
    const p1 = document.getElementById('fp-pass1').value;
    const p2 = document.getElementById('fp-pass2').value;

    if (!/^\d{6}$/.test(token)) { UI.toast('Kode OTP harus 6 digit angka', 'warning'); return; }
    if (!pwGuard || !pwGuard.isValid()) {
      UI.toast(PasswordPolicy.firstError(p1, state.username) || 'Konfirmasi password belum cocok', 'warning');
      return;
    }
    if (p1 !== p2) { UI.toast('Konfirmasi password tidak cocok', 'warning'); return; }

    const btn = document.getElementById('fp-submit');
    btn.disabled = true;
    Utils.showLoader(true);
    const res = await BizLogic.verifyOtpAndReset({
      id_peserta: state.id_peserta,
      email: state.email,
      token,
      new_password: p1
    });
    Utils.showLoader(false);
    btn.disabled = false;

    if (res.success) {
      UI.toast(res.message, 'success', { duration: 3500 });
      setTimeout(() => { window.location.href = 'login.html'; }, 1600);
    } else {
      UI.toast(res.message, 'error', { duration: 5000 });
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    Utils.mountNavbar('');
    // Verifikasi identitas dijalankan lokal, jadi cache Peserta wajib ada.
    await Sync.init(['Peserta']);

    document.getElementById('form-verify').addEventListener('submit', handleVerify);
    document.getElementById('form-email').addEventListener('submit', handleSendOtp);
    document.getElementById('form-otp').addEventListener('submit', handleReset);
    document.getElementById('fp-resend').addEventListener('click', handleResend);
    document.getElementById('fp-back-email').addEventListener('click', () => showStep('form-verify'));
    document.getElementById('fp-back-otp').addEventListener('click', () => showStep('form-email'));
    bindWaBantuan();

    pwGuard = PasswordPolicy.attach({
      input: document.getElementById('fp-pass1'),
      confirmInput: document.getElementById('fp-pass2'),
      checklist: document.getElementById('fp-pass-checklist'),
      usernameValue: () => state.username,
      submitButton: document.getElementById('fp-submit')
    });
  });
})();
