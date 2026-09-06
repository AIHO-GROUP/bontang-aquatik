/**
 * registrasi.js — Pendaftaran peserta baru (4 langkah)
 *
 * Poin penting:
 *   • Password divalidasi real-time dengan checklist (lib/password.js);
 *     tombol lanjut hanya aktif bila seluruh syarat terpenuhi.
 *   • Email wajib diisi — inilah kanal pemulihan akun berbasis OTP.
 *   • Satu orang = satu akun: bila identitas sudah terdaftar, pendaftar
 *     TIDAK membuat akun baru melainkan diarahkan ke alur re-aktivasi.
 *   • Nomor peserta dibuat otomatis oleh sistem (tanpa tombol generate).
 */
let currentStep = 1;
const TOTAL_STEPS = 4;
let pwGuard = null;

document.addEventListener('DOMContentLoaded', async () => {
  Utils.mountNavbar('registrasi');

  // Cache Peserta & Settings dibutuhkan untuk cek duplikat username/identitas
  // dan pembuatan nomor peserta secara lokal saat submit.
  await Sync.init(['Peserta', 'Enrollment', '__settings__']);

  const passInput = document.getElementById('reg-password');
  const passToggle = document.getElementById('togglePassword');
  if (passInput && passToggle) UI.passwordToggle(passInput, passToggle);

  pwGuard = PasswordPolicy.attach({
    input: passInput,
    checklist: document.getElementById('reg-pass-checklist'),
    usernameInput: document.getElementById('reg-username')
  });

  // Tanggal mulai default hari ini (WITA), tidak boleh mundur ke masa lalu.
  const todayStr = WITA.todayISO();
  const startInput = document.getElementById('tanggal_mulai');
  startInput.value = todayStr;
  startInput.min = todayStr;

  // Batas usia minimum.
  const tglLahirInput = document.getElementById('tanggal_lahir');
  tglLahirInput.max = WITA.addMonths(todayStr, -12 * CONFIG.MIN_AGE);

  tglLahirInput.addEventListener('change', () => {
    const tgl = tglLahirInput.value;
    const preview = document.getElementById('kelompok-umur-preview');
    if (!tgl) { preview.textContent = ''; return; }
    const usia = BizUtil.usia(tgl);
    if (usia < CONFIG.MIN_AGE) {
      preview.innerHTML = '<span class="text-danger">Usia minimal ' + CONFIG.MIN_AGE + ' tahun</span>';
      return;
    }
    const kelompok = BizUtil.kelompokUmur(tgl);
    preview.innerHTML = 'Kelompok Umur: <strong>' + kelompok + '</strong> (' +
      (CONFIG.KELOMPOK_UMUR_INFO[kelompok] || '') + ') • Usia ' + usia + ' tahun';
  });

  renderClassInfo();
  renderDurasiOptions();

  const durasiInput = document.getElementById('durasi');
  const endDisplay = document.getElementById('tanggal_akhir_display');
  function recalcEnd() {
    const start = startInput.value;
    const durasi = parseInt(durasiInput.value, 10) || 0;
    if (!start || durasi <= 0) { endDisplay.value = ''; endDisplay.dataset.iso = ''; return; }
    const iso = WITA.addMonths(start, durasi);
    endDisplay.value = WITA.formatDateLong(iso);
    endDisplay.dataset.iso = iso;
  }
  startInput.addEventListener('change', recalcEnd);
  durasiInput.addEventListener('change', recalcEnd);
  recalcEnd();

  document.getElementById('btn-next').addEventListener('click', goNextStep);
  document.getElementById('btn-prev').addEventListener('click', goPrevStep);
  document.getElementById('form-registrasi').addEventListener('submit', submitForm);
});

function renderDurasiOptions() {
  const sel = document.getElementById('durasi');
  sel.innerHTML = CONFIG.DURASI_OPTIONS
    .map((n) => '<option value="' + n + '">' + n + ' bulan</option>')
    .join('');
  sel.value = String(CONFIG.DURASI_OPTIONS[0]);
}

function validateStep(step) {
  const stepEl = document.querySelector('.form-step[data-step="' + step + '"]');
  for (const inp of stepEl.querySelectorAll('input[required], select[required]')) {
    if (!inp.value || !inp.value.trim()) {
      inp.focus();
      const label = stepEl.querySelector('label[for="' + inp.id + '"]');
      const nama = label ? label.textContent.replace('*', '').trim() : 'kolom ini';
      UI.toast('Mohon lengkapi: ' + nama, 'warning');
      return false;
    }
  }

  if (step === 1) {
    const username = document.getElementById('reg-username').value.trim();
    if (username.length < 3) { UI.toast('Username minimal 3 karakter', 'warning'); return false; }

    if (!pwGuard.isValid()) {
      const pw = document.getElementById('reg-password').value;
      UI.toast(PasswordPolicy.firstError(pw, username), 'warning');
      document.getElementById('reg-password').focus();
      return false;
    }

    const email = document.getElementById('reg-email').value.trim();
    if (!BizUtil.isEmail(email)) {
      UI.toast('Format email tidak valid', 'warning');
      document.getElementById('reg-email').focus();
      return false;
    }

    const waInput = document.getElementById('reg-wa');
    const wa = waInput.value.trim();
    if (wa.startsWith('+62') || wa.replace(/\D/g, '').startsWith('0') || wa.replace(/\D/g, '').startsWith('62')) {
      UI.toast('Awali nomor dengan angka 8 (tanpa 0 atau +62)', 'warning');
      waInput.focus();
      return false;
    }
    const waNumber = wa.replace(/\D/g, '');
    if (!waNumber.startsWith('8')) { UI.toast('Nomor WhatsApp tidak valid', 'warning'); waInput.focus(); return false; }
    if (waNumber.length < 9 || waNumber.length > 12) {
      UI.toast('Nomor WhatsApp harus 9-12 digit', 'warning');
      waInput.focus();
      return false;
    }
  }

  if (step === 2) {
    const tglLahir = document.querySelector('[name="tanggal_lahir"]').value;
    if (BizUtil.usia(tglLahir) < CONFIG.MIN_AGE) {
      UI.toast('Usia minimal ' + CONFIG.MIN_AGE + ' tahun', 'warning');
      return false;
    }
    // Cek duplikat sedini mungkin, sebelum pendaftar mengisi 2 langkah lagi.
    const kandidat = BizLogic.findPesertaByIdentity({
      nama_lengkap: document.getElementById('reg-nama').value,
      tanggal_lahir: tglLahir,
      nomor_whatsapp: document.getElementById('reg-wa').value
    });
    if (kandidat) { showAccountExistsModal(kandidat); return false; }
  }
  return true;
}

/**
 * Peserta lama tidak boleh membuat akun kedua. Modal ini menjelaskan
 * situasinya dan menawarkan dua jalan keluar yang jelas.
 */
function showAccountExistsModal(peserta) {
  const body =
    '<p>Kami menemukan akun yang sudah terdaftar dengan identitas ini:</p>' +
    '<div class="detail-card">' +
      '<div class="detail-row"><span>Nama</span><strong>' + Utils.escapeHtml(peserta.Nama_Lengkap) + '</strong></div>' +
      '<div class="detail-row"><span>Username</span><strong>' + Utils.escapeHtml(peserta.Username) + '</strong></div>' +
      '<div class="detail-row"><span>Grup</span><strong>' + Utils.escapeHtml(peserta.Kelas || '-') + '</strong></div>' +
    '</div>' +
    '<p>Agar <strong>riwayat latihan dan rapor Anda tidak terpecah</strong>, silakan masuk dengan akun ini ' +
    'lalu ajukan <strong>perpanjangan / bergabung kembali</strong> dari dashboard. ' +
    'Tidak perlu membuat akun baru.</p>';

  const m = UI.modal({
    title: 'Akun Anda Sudah Terdaftar',
    size: 'sm',
    body,
    actions: [
      { label: 'Lupa Password', variant: 'secondary', onClick: () => { window.location.href = 'forgot-password.html'; } },
      { label: 'Masuk ke Akun Saya', variant: 'primary', onClick: () => { window.location.href = 'login.html'; } }
    ]
  });

  const wa = document.createElement('button');
  wa.type = 'button';
  wa.className = 'btn btn-success btn-block';
  wa.style.marginTop = '12px';
  wa.textContent = 'Hubungi Admin via WhatsApp';
  wa.addEventListener('click', () => {
    WA.open(WA.Templates.perpanjangan(peserta, { kelas: peserta.Kelas }));
    m.close();
  });
  m.el.querySelector('.modal-body').appendChild(wa);
}

function goNextStep() {
  if (!validateStep(currentStep)) return;
  if (currentStep < TOTAL_STEPS) { currentStep++; updateStepUI(); }
}
function goPrevStep() { if (currentStep > 1) { currentStep--; updateStepUI(); } }

function updateStepUI() {
  document.querySelectorAll('.form-step').forEach((s) => s.classList.remove('active'));
  document.querySelector('.form-step[data-step="' + currentStep + '"]').classList.add('active');
  document.querySelectorAll('.step').forEach((s) => {
    const n = Number(s.dataset.step);
    s.classList.toggle('active', n === currentStep);
    s.classList.toggle('completed', n < currentStep);
  });
  document.getElementById('btn-prev').disabled = (currentStep === 1);
  document.getElementById('btn-next').classList.toggle('hidden', currentStep === TOTAL_STEPS);
  document.getElementById('btn-submit').classList.toggle('hidden', currentStep !== TOTAL_STEPS);
  document.getElementById('form-stepper').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submitForm(e) {
  e.preventDefault();
  if (!validateStep(currentStep)) return;

  const fd = new FormData(e.target);
  const data = {
    nama_lengkap: String(fd.get('nama_lengkap') || '').trim(),
    username: String(fd.get('username') || '').trim(),
    password: fd.get('password'),
    email: String(fd.get('email') || '').trim().toLowerCase(),
    nomor_whatsapp: '62' + String(fd.get('nomor_whatsapp') || '').replace(/\D/g, ''),
    jenis_kelamin: fd.get('jenis_kelamin'),
    tempat_lahir: String(fd.get('tempat_lahir') || '').trim(),
    tanggal_lahir: fd.get('tanggal_lahir'),
    nisnas: String(fd.get('nisnas') || '').trim(),
    asal_sekolah: String(fd.get('asal_sekolah') || '').trim(),
    kelas_sekolah: String(fd.get('kelas_sekolah') || '').trim(),
    wali_kelas: String(fd.get('wali_kelas') || '').trim(),
    kelas: fd.get('kelas'),
    tanggal_mulai: fd.get('tanggal_mulai'),
    durasi: parseInt(fd.get('durasi'), 10) || 1,
    tanggal_akhir: document.getElementById('tanggal_akhir_display').dataset.iso || ''
  };

  const submitBtn = document.getElementById('btn-submit');
  submitBtn.disabled = true;
  Utils.showLoader(true);
  const res = await BizLogic.registerPeserta(data);
  Utils.showLoader(false);
  submitBtn.disabled = false;

  if (!res.success) {
    if (res.code === 'ACCOUNT_EXISTS' && res.data) {
      const peserta = Store.findPeserta(res.data.id_peserta);
      if (peserta) { showAccountExistsModal(peserta); return; }
    }
    UI.toast(res.message || 'Registrasi gagal', 'error', { duration: 6000 });
    return;
  }

  // Sesi langsung dibuat: peserta boleh masuk walau pembayaran belum lunas.
  Auth.setSession(CONFIG.ROLES.PESERTA, BizLogic.sessionDataFor(res.data));
  e.target.reset();
  showSuccessModal(res.data);
}

function showSuccessModal(peserta) {
  const body =
    '<div class="success-hero"><div class="success-hero__icon" aria-hidden="true">🎉</div>' +
    '<h3>Pendaftaran Berhasil</h3></div>' +
    '<div class="detail-card">' +
      '<div class="detail-row"><span>Nama</span><strong>' + Utils.escapeHtml(peserta.Nama_Lengkap) + '</strong></div>' +
      '<div class="detail-row"><span>Nomor Peserta</span><strong>' + Utils.escapeHtml(peserta.Nomor_Peserta) + '</strong></div>' +
      '<div class="detail-row"><span>Grup</span><strong>' + Utils.escapeHtml(peserta.Kelas) + '</strong></div>' +
      '<div class="detail-row"><span>Periode</span><strong>' +
        WITA.formatDate(peserta.Tanggal_Mulai) + ' s.d ' + WITA.formatDate(peserta.Tanggal_Akhir) + '</strong></div>' +
    '</div>' +
    '<p>Langkah terakhir: <strong>konfirmasi pembayaran ke admin</strong> lewat WhatsApp. ' +
    'Jadwal latihan Anda akan terbuka otomatis setelah pembayaran diverifikasi.</p>';

  const m = UI.modal({
    title: 'Selamat Datang di Bontang Akuatik',
    size: 'sm',
    body,
    closeOnBackdrop: false,
    actions: [
      { label: 'Nanti Saja', variant: 'secondary', onClick: () => { window.location.href = 'peserta.html'; } }
    ]
  });

  const waBtn = document.createElement('button');
  waBtn.type = 'button';
  waBtn.className = 'btn btn-success btn-block';
  waBtn.style.marginTop = '12px';
  waBtn.textContent = 'Konfirmasi Pembayaran via WhatsApp';
  waBtn.addEventListener('click', () => {
    WA.open(WA.Templates.registrasi(peserta));
    setTimeout(() => { window.location.href = 'peserta.html'; }, 800);
  });
  m.el.querySelector('.modal-body').appendChild(waBtn);
}

function renderClassInfo() {
  const container = document.getElementById('class-info-list');
  if (container) {
    container.innerHTML = Object.entries(CONFIG.KELAS_DETAIL).map(([nama, d]) =>
      '<div class="class-info-item ' + (d.recommended ? 'recommended' : '') + '">' +
        '<div class="class-info-head">' +
          '<span class="class-info-mascot">' + d.mascot + '</span>' +
          '<strong>' + nama + '</strong>' +
          (d.recommended ? '<span class="class-info-badge">⭐ Rekomendasi</span>' : '') +
        '</div>' +
        '<div class="class-info-body">' +
          '<div>📍 ' + d.lokasi + '</div>' +
          '<div>📅 ' + d.jadwal_label + '</div>' +
          '<div>🕐 ' + d.jam_label + '</div>' +
        '</div>' +
      '</div>').join('');
  }

  const select = document.getElementById('kelas');
  if (select) {
    select.innerHTML = '<option value="">- Pilih grup latihan -</option>' +
      Object.keys(CONFIG.KELAS_DETAIL).map((k) =>
        '<option value="' + k + '">' + k + ' • ' + CONFIG.KELAS_DETAIL[k].jadwal_label +
        ' • ' + CONFIG.KELAS_DETAIL[k].lokasi + '</option>').join('');
  }
}
