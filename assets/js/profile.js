/**
 * profile.js — Peserta melihat & memperbarui data dirinya sendiri
 *
 * Data pelatihan (grup, periode, kelompok umur) bersifat baca-saja karena
 * merupakan wewenang koordinator klub. Password baru divalidasi real-time
 * terhadap kebijakan password yang sama dengan halaman lain.
 */
(function () {
  'use strict';

  const EDITABLE = {
    nama_lengkap: 'pf-nama_lengkap',
    email: 'pf-email',
    nomor_whatsapp: 'pf-nomor_whatsapp',
    jenis_kelamin: 'pf-jenis_kelamin',
    tempat_lahir: 'pf-tempat_lahir',
    tanggal_lahir: 'pf-tanggal_lahir',
    nisnas: 'pf-nisnas',
    asal_sekolah: 'pf-asal_sekolah',
    kelas_sekolah: 'pf-kelas_sekolah',
    wali_kelas: 'pf-wali_kelas'
  };

  let pwGuard = null;

  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? '' : value;
  };
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = (value == null || value === '') ? '-' : value;
  };

  function fill(data) {
    setVal('pf-nama_lengkap', data.Nama_Lengkap);
    setVal('pf-username', data.Username);
    setVal('pf-email', data.Email);
    setVal('pf-nomor_whatsapp', data.Nomor_Whatsapp);
    setVal('pf-jenis_kelamin', data.Jenis_Kelamin || 'Laki-laki');
    setVal('pf-tempat_lahir', data.Tempat_Lahir);
    setVal('pf-tanggal_lahir', WITA.toISODate(data.Tanggal_Lahir));
    setVal('pf-nisnas', data.NISNAS);
    setVal('pf-asal_sekolah', data.Asal_Sekolah);
    setVal('pf-kelas_sekolah', data.Kelas_Sekolah);
    setVal('pf-wali_kelas', data.Wali_Kelas);

    setText('pf-kelas', data.Kelas);
    setText('pf-kelompok_umur', data.Kelompok_Umur);
    setText('pf-tanggal_mulai', WITA.formatDateLong(data.Tanggal_Mulai));
    setText('pf-tanggal_akhir', WITA.formatDateLong(data.Tanggal_Akhir));

    document.getElementById('ph-nama').textContent = data.Nama_Lengkap || 'Saya';
    document.getElementById('ph-nomor').textContent = data.Nomor_Peserta || '-';
    document.getElementById('ph-avatar').textContent = Utils.initial(data.Nama_Lengkap);

    renderEnrollments(data.Id_Peserta);
  }

  function renderEnrollments(idPeserta) {
    const wrap = document.getElementById('pf-enrollments');
    const items = BizLogic.getEnrollments(idPeserta);
    if (!items.length) { wrap.innerHTML = ''; return; }

    wrap.innerHTML =
      '<h3 class="profile-subtitle">Riwayat Periode Pelatihan</h3>' +
      '<ul class="profile-enrollment-list">' +
      items.slice().reverse().map((e) => {
        const meta = CONFIG.ENROLLMENT_STATUS[e.Status] || { label: e.Status, tone: 'muted' };
        return '<li>' +
          '<span class="status-badge ' + meta.tone + '">' + meta.label + '</span>' +
          '<span>' + WITA.formatDate(e.Tanggal_Mulai) + ' — ' + WITA.formatDate(e.Tanggal_Akhir) + '</span>' +
          '<span class="text-muted">' + Utils.escapeHtml(e.Kelas || '-') + ' • ' + (e.Durasi_Bulan || 1) + ' bulan</span>' +
        '</li>';
      }).join('') + '</ul>';
  }

  function load() {
    const user = Auth.getUser();
    if (!user) { window.location.href = 'login.html'; return; }

    const res = BizLogic.getDataLengkapPeserta({ id_peserta: user.id });
    if (!res.success || !res.data) {
      UI.errorState('profile-skeleton', {
        message: 'Gagal memuat data profil. Coba muat ulang halaman.',
        onRetry: () => window.location.reload()
      });
      return;
    }

    fill(res.data);
    document.getElementById('profile-skeleton').classList.add('hidden');
    document.getElementById('profile-form').classList.remove('hidden');

    // Mode "lihat sebagai" bersifat baca-saja: seluruh isian dikunci agar
    // pelatih/koordinator tidak dapat mengubah data atas nama peserta.
    if (Auth.isReadOnlyView()) applyReadOnly();

    if (!pwGuard) {
      const pwInput = document.getElementById('pf-password');
      const checklist = document.getElementById('pf-pass-checklist');
      // Checklist hanya muncul saat pengguna benar-benar mengetik password baru.
      pwInput.addEventListener('input', () => { checklist.hidden = pwInput.value.length === 0; });
      pwGuard = PasswordPolicy.attach({
        input: pwInput,
        confirmInput: document.getElementById('pf-password2'),
        checklist,
        usernameValue: () => res.data.Username
      });
    }
  }

  /** Kunci seluruh isian & tombol simpan saat menyamar sebagai peserta. */
  function applyReadOnly() {
    const form = document.getElementById('profile-form');
    form.querySelectorAll('input, select, textarea, button').forEach((el) => { el.disabled = true; });

    if (document.getElementById('profile-readonly-note')) return;
    form.insertAdjacentHTML('afterbegin',
      '<div class="app-banner app-banner--warning app-banner--inline" id="profile-readonly-note" role="status">' +
        '<div class="app-banner__icon" aria-hidden="true">👁️</div>' +
        '<div class="app-banner__body"><strong>Mode lihat sebagai (baca-saja)</strong>' +
        '<span>Anda sedang melihat halaman ini sebagai peserta. Data tidak dapat diubah dari sini — ' +
        'kembali ke akun Anda untuk melakukan perubahan.</span></div>' +
      '</div>');
  }

  async function save(e) {
    e.preventDefault();
    if (Auth.isReadOnlyView()) {
      UI.toast('Mode lihat sebagai bersifat baca-saja.', 'warning');
      return;
    }

    const nama = document.getElementById('pf-nama_lengkap').value.trim();
    if (!nama) { UI.toast('Nama lengkap wajib diisi', 'warning'); return; }

    const wa = document.getElementById('pf-nomor_whatsapp').value.replace(/[^0-9]/g, '');
    if (wa && !/^[0-9]{8,15}$/.test(wa)) {
      UI.toast('Nomor WhatsApp tidak valid (8-15 digit)', 'warning');
      return;
    }

    const email = document.getElementById('pf-email').value.trim();
    if (email && !BizUtil.isEmail(email)) { UI.toast('Format email tidak valid', 'warning'); return; }

    const payload = { id_peserta: Auth.getId() };
    Object.entries(EDITABLE).forEach(([key, id]) => {
      let v = document.getElementById(id).value;
      if (key === 'nomor_whatsapp') v = wa;
      if (typeof v === 'string') v = v.trim();
      payload[key] = v;
    });

    const p1 = document.getElementById('pf-password').value;
    const p2 = document.getElementById('pf-password2').value;
    if (p1 || p2) {
      if (!pwGuard.isValid()) {
        UI.toast(PasswordPolicy.firstError(p1, document.getElementById('pf-username').value) ||
                 'Konfirmasi password belum cocok', 'warning');
        return;
      }
      if (p1 !== p2) { UI.toast('Konfirmasi password tidak cocok', 'warning'); return; }
      payload.password = p1;
    }

    const btn = document.getElementById('pf-save');
    btn.disabled = true;
    Utils.showLoader(true);
    const res = await BizLogic.updateProfilePeserta(payload);
    Utils.showLoader(false);
    btn.disabled = false;

    if (!res.success) { UI.toast(res.message || 'Gagal menyimpan profil', 'error', { duration: 5000 }); return; }

    UI.toast(res.message, 'success');
    Auth.patchUser({ nama, email });
    document.getElementById('ph-nama').textContent = nama;
    document.getElementById('ph-avatar').textContent = Utils.initial(nama);
    ['pf-password', 'pf-password2'].forEach((id) => setVal(id, ''));
    document.getElementById('pf-pass-checklist').hidden = true;
    load();
    Utils.mountPasswordNag();
  }

  async function cancelEdit() {
    const ok = await UI.confirm(
      'Yakin membatalkan perubahan? Perubahan yang belum disimpan akan hilang dan Anda kembali ke dashboard.',
      { title: 'Batalkan Perubahan', confirmLabel: 'Ya, batalkan', cancelLabel: 'Kembali', variant: 'danger' }
    );
    if (ok) window.location.href = 'peserta.html';
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireRole(CONFIG.ROLES.PESERTA)) return;
    Utils.mountNavbar('profile');

    UI.showSkeleton('profile-skeleton', 'cards', { count: 3, lines: 4 });

    document.getElementById('profile-form').addEventListener('submit', save);
    document.getElementById('pf-reset').addEventListener('click', cancelEdit);
    document.addEventListener('app:opensettings', () => PesertaSettings.open());

    await Sync.init(['Peserta', 'Enrollment'], () => load());
    load();
  });
})();
