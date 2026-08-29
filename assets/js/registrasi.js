let currentStep = 1;
const TOTAL_STEPS = 4;

document.addEventListener('DOMContentLoaded', async () => {
  Utils.mountNavbar('registrasi');

  // Sinkronkan cache Peserta & Settings (dibutuhkan untuk cek username &
  // pembuatan Nomor Peserta otomatis secara lokal saat submit).
  await Sync.init(['Peserta', '__settings__']);

  // Password toggle (SVG eye reusable)
  const passInput = document.getElementById('password');
  const passToggle = document.getElementById('togglePassword');
  if (passInput && passToggle) UI.passwordToggle(passInput, passToggle);

  // Default tanggal mulai = hari ini
  const todayStr = Utils.formatDateInput(new Date());
  const startInput = document.getElementById('tanggal_mulai');
  startInput.value = todayStr;
  startInput.min = todayStr;

  // Max tanggal lahir: hari ini - MIN_AGE tahun
  const tglLahirInput = document.getElementById('tanggal_lahir');
  const maxLahir = new Date(); maxLahir.setFullYear(maxLahir.getFullYear() - CONFIG.MIN_AGE);
  tglLahirInput.max = Utils.formatDateInput(maxLahir);

  tglLahirInput.addEventListener('change', () => {
    const tgl = tglLahirInput.value;
    const preview = document.getElementById('kelompok-umur-preview');
    if (!tgl) { preview.textContent = ''; return; }
    const usia = Utils.calculateUsia(tgl);
    if (usia < CONFIG.MIN_AGE) {
      preview.innerHTML = `<span style="color:var(--color-danger);">⚠️ Usia minimal ${CONFIG.MIN_AGE} tahun</span>`;
      return;
    }
    const kelompok = Utils.calculateKelompokUmur(tgl);
    const info = CONFIG.KELOMPOK_UMUR_INFO[kelompok] || '';
    preview.innerHTML = `Kelompok Umur: <strong style="color:var(--color-primary);">${kelompok}</strong> (${info}) • Usia ${usia} tahun`;
  });

  renderClassInfo();

  // Auto-calc end date
  const durasiInput = document.getElementById('durasi');
  const endDisplay = document.getElementById('tanggal_akhir_display');
  function recalcEnd() {
    const start = startInput.value;
    const durasi = parseInt(durasiInput.value) || 0;
    if (!start || durasi <= 0) { endDisplay.value = ''; return; }
    const endDate = Utils.addMonths(new Date(start), durasi);
    endDisplay.value = Utils.formatDate(endDate);
    endDisplay.dataset.iso = Utils.formatDateInput(endDate);
  }
  startInput.addEventListener('change', recalcEnd);
  durasiInput.addEventListener('input', recalcEnd);
  recalcEnd();

  document.getElementById('btn-next').addEventListener('click', goNextStep);
  document.getElementById('btn-prev').addEventListener('click', goPrevStep);
  document.getElementById('form-registrasi').addEventListener('submit', submitForm);
});

function validateStep(step) {
  const stepEl = document.querySelector(`.form-step[data-step="${step}"]`);
  const inputs = stepEl.querySelectorAll('input[required], select[required]');
  // Validasi field wajib
  for (const inp of inputs) {
    if (!inp.value || inp.value.trim() === '') {
      inp.focus();
      const label = inp.previousElementSibling
        ? inp.previousElementSibling.textContent.replace('*', '').trim()
        : 'field ini';
      UI.toast(`Mohon lengkapi: ${label}`, 'warning');
      return false;
    }
  }

  if (step === 1) {
    const username = stepEl.querySelector('[name="username"]').value.trim();
    const password = stepEl.querySelector('[name="password"]').value;
    if (password.length < 6) {
      UI.toast('Password minimal 6 karakter', 'warning');
      return false;
    }
    if (password.toLowerCase() === username.toLowerCase()) {
      UI.toast('Password tidak boleh sama dengan username', 'warning');
      return false;
    }

    const waInput = stepEl.querySelector('[name="nomor_whatsapp"]');
    const wa = waInput.value.trim();
    if (wa.startsWith('+62')) {
      UI.toast('Awali nomor dengan angka 8', 'warning');
      waInput.focus();
      return false;
    }
    const waNumber = wa.replace(/\D/g, '');
    if (waNumber.startsWith('0') || waNumber.startsWith('62')) {
      UI.toast('Awali nomor dengan angka 8', 'warning');
      waInput.focus();
      return false;
    }
    if (!waNumber.startsWith('8')) {
      UI.toast('Nomor Anda tidak valid', 'warning');
      waInput.focus();
      return false;
    }
    if (waNumber.length < 9 || waNumber.length > 12) {
      UI.toast('Nomor WhatsApp harus terdiri dari 9-12 digit', 'warning');
      waInput.focus();
      return false;
    }
  }

  if (step === 2) {
    const tglLahir = stepEl.querySelector('[name="tanggal_lahir"]').value;
    if (Utils.calculateUsia(tglLahir) < CONFIG.MIN_AGE) {
      UI.toast(`Usia minimal ${CONFIG.MIN_AGE} tahun`, 'warning');
      return false;
    }
  }
  return true;
}

function goNextStep() {
  if (!validateStep(currentStep)) return;
  if (currentStep < TOTAL_STEPS) { currentStep++; updateStepUI(); }
}
function goPrevStep() { if (currentStep > 1) { currentStep--; updateStepUI(); } }

function updateStepUI() {
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  document.querySelector(`.form-step[data-step="${currentStep}"]`).classList.add('active');
  document.querySelectorAll('.step').forEach(s => {
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
    nama_lengkap: fd.get('nama_lengkap').trim(),
    username: fd.get('username').trim(),
    password: fd.get('password'),
    nomor_whatsapp: '62' + fd.get('nomor_whatsapp').replace(/\D/g, ''),
    jenis_kelamin: fd.get('jenis_kelamin'),
    tempat_lahir: fd.get('tempat_lahir').trim(),
    tanggal_lahir: fd.get('tanggal_lahir'),
    asal_sekolah: fd.get('asal_sekolah').trim(),
    kelas_sekolah: fd.get('kelas_sekolah').trim(),
    wali_kelas: fd.get('wali_kelas').trim(),
    kelas: fd.get('kelas'),
    tanggal_mulai: fd.get('tanggal_mulai'),
    tanggal_akhir: document.getElementById('tanggal_akhir_display').dataset.iso || '',
  };

  const submitBtn = document.getElementById('btn-submit');
  submitBtn.disabled = true;
  Utils.showLoader(true);
  const res = await BizLogic.registerPeserta(data);
  Utils.showLoader(false);
  submitBtn.disabled = false;

  if (res.success) {
    UI.toast('Registrasi berhasil! Mengarahkan ke WhatsApp admin...', 'success', { duration: 4000 });
    e.target.reset();
    setTimeout(() => {
      window.open(Utils.waLink(CONFIG.CONTACT.whatsapp, CONFIG.WA_REGISTRATION_MESSAGE), '_blank');
      setTimeout(() => window.location.href = 'login.html', 1500);
    }, 1500);
  } else {
    UI.toast(res.message || 'Registrasi gagal', 'error');
  }
}

function renderClassInfo() {
  const container = document.getElementById('class-info-list');
  if (container) {
    container.innerHTML = Object.entries(CONFIG.KELAS_DETAIL).map(([nama, d]) => `
      <div class="class-info-item ${d.recommended ? 'recommended' : ''}">
        <div class="class-info-head">
          <span class="class-info-mascot">${d.mascot}</span>
          <strong>${nama}</strong>
          ${d.recommended ? '<span class="class-info-badge">⭐ Rekomendasi</span>' : ''}
        </div>
        <div class="class-info-body">
          <div>📍 ${d.lokasi}</div>
          <div>📅 ${d.jadwal_label}</div>
        </div>
      </div>`).join('');
  }

  const select = document.getElementById('kelas');
  if (select) {
    select.innerHTML = '<option value="">- Pilih grup kelas -</option>' +
      Object.keys(CONFIG.KELAS_DETAIL).map(k => `<option value="${k}">${k} • ${CONFIG.KELAS_DETAIL[k].jadwal_label} • ${CONFIG.KELAS_DETAIL[k].lokasi}</option>`).join('');
  }
}
