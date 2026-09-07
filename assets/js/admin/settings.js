/**
 * ===================================================================
 * admin/settings.js — Pengaturan panel admin
 * ===================================================================
 * DIBUKA DARI MENU PROFIL (avatar) di navbar, bukan sebagai tab dashboard,
 * agar navigasi utama tetap fokus pada fungsi operasional.
 *
 * Pelatih hanya melihat preferensi tampilan; pengaturan sistem
 * (penandatangan rapor, penomoran, aturan jadwal, kebersihan data)
 * hanya tampil untuk koordinator.
 */
const AdminSettings = (function () {
  'use strict';

  function open() {
    const isSuper = Auth.isSuperadmin();
    const s = BizLogic.getSettings().data;
    const theme = Theme.get();

    const seg = (group, value, options) =>
      '<div class="ui-segment" data-seg="' + group + '">' +
        options.map((o) => '<button type="button" data-val="' + o.v + '" class="' +
          (value === o.v ? 'active' : '') + '">' + o.t + '</button>').join('') +
      '</div>';

    const signerOpts = '<option value="">Otomatis (koordinator aktif pertama)</option>' +
      Store.pelatih()
        .filter((p) => p.Role === CONFIG.ROLES.SUPERADMIN)
        .map((p) => '<option value="' + p.Id_Pelatih + '"' +
          (s.signer_id === p.Id_Pelatih ? ' selected' : '') + '>' +
          Utils.escapeHtml(p.Nama) + '</option>').join('');

    const sistem = isSuper
      ? '<hr class="settings-divider">' +
        '<h3 class="settings-card__title">Penandatangan Rapor</h3>' +
        '<p class="form-helper">Rapor selalu ditandatangani atas nama koordinator klub, ' +
          'bukan pelatih yang memberi nilai.</p>' +
        '<div class="form-group"><label for="st-signer">Koordinator Penandatangan</label>' +
          '<select id="st-signer" class="form-control">' + signerOpts + '</select></div>' +
        '<div class="form-group"><label for="st-jabatan">Jabatan pada Rapor</label>' +
          '<input id="st-jabatan" class="form-control" value="' +
          Utils.escapeHtml(s.signer_jabatan) + '"></div>' +

        '<hr class="settings-divider">' +
        '<h3 class="settings-card__title">Penomoran & Jadwal</h3>' +
        '<div class="form-grid-2">' +
          '<div class="form-group"><label for="st-seq">Nomor Urut Terakhir</label>' +
            '<input id="st-seq" type="number" min="0" class="form-control" value="' + s.nomor_seq + '">' +
            '<p class="form-helper">Pendaftar berikutnya memakai nomor setelah ini.</p></div>' +
          '<div class="form-group"><label for="st-durasi">Durasi Sesi (menit)</label>' +
            '<input id="st-durasi" type="number" min="30" max="480" step="15" class="form-control" ' +
              'value="' + s.durasi_menit + '">' +
            '<p class="form-helper">Lama absensi terbuka sejak jam mulai.</p></div>' +
          '<div class="form-group"><label for="st-horizon">Horizon Jadwal (hari)</label>' +
            '<input id="st-horizon" type="number" min="30" max="730" step="10" class="form-control" ' +
              'value="' + s.horizon_hari + '">' +
            '<p class="form-helper">Sejauh mana jadwal dibuat ke depan. Sisanya ditambahkan bertahap.</p></div>' +
        '</div>' +
        '<button type="button" class="btn btn-primary btn-block" id="st-save">Simpan Pengaturan Sistem</button>' +

        '<hr class="settings-divider">' +
        '<h3 class="settings-card__title">Kebersihan Data</h3>' +
        '<div id="st-health"></div>'
      : '';

    const body =
      '<div class="settings-row">' +
        '<div class="settings-row__label"><strong>Tema Tampilan</strong><small>Terang atau gelap</small></div>' +
        seg('theme', theme, [{ v: 'light', t: '☀️ Terang' }, { v: 'dark', t: '🌙 Gelap' }]) +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-row__label"><strong>Tampilan Jadwal</strong><small>List atau kalender</small></div>' +
        seg('jadwal', (localStorage.getItem('swim_admin_jadwal_view') || 'list'),
          [{ v: 'list', t: '☰ List' }, { v: 'calendar', t: '📅 Kalender' }]) +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-row__label"><strong>Tampilan Kehadiran</strong><small>List atau tabel absensi</small></div>' +
        seg('kehadiran', (localStorage.getItem('swim_admin_kehadiran_view') || 'list'),
          [{ v: 'list', t: '☰ List' }, { v: 'table', t: '▦ Tabel' }]) +
      '</div>' +
      '<hr class="settings-divider">' +
      '<a href="update-password.html" class="btn btn-secondary btn-block settings-action">Ganti Password Saya</a>' +
      sistem;

    const m = UI.modal({ title: 'Pengaturan', size: 'md', body, actions: [{ label: 'Tutup', variant: 'secondary' }] });

    /* -------- Preferensi tampilan (per perangkat) -------- */
    const bindSeg = (group, apply) => {
      const el = m.el.querySelector('[data-seg="' + group + '"]');
      if (!el) return;
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-val]');
        if (!btn) return;
        el.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
        apply(btn.dataset.val);
      });
    };

    bindSeg('theme', (v) => Theme.apply(v));
    bindSeg('jadwal', (v) => {
      try { localStorage.setItem('swim_admin_jadwal_view', v); } catch (e) { /* abaikan */ }
      Admin.refresh('jadwal');
      UI.toast('Tampilan jadwal: ' + (v === 'calendar' ? 'Kalender' : 'List'), 'success', { duration: 1600 });
    });
    bindSeg('kehadiran', (v) => {
      try { localStorage.setItem('swim_admin_kehadiran_view', v); } catch (e) { /* abaikan */ }
      Admin.refresh('kehadiran');
      UI.toast('Tampilan kehadiran: ' + (v === 'table' ? 'Tabel' : 'List'), 'success', { duration: 1600 });
    });

    if (!isSuper) return;

    /* -------- Pengaturan sistem -------- */
    m.el.querySelector('#st-save').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const res = await BizLogic.updateSettings({
        signer_id: m.el.querySelector('#st-signer').value,
        signer_jabatan: m.el.querySelector('#st-jabatan').value,
        nomor_seq: m.el.querySelector('#st-seq').value,
        durasi_menit: m.el.querySelector('#st-durasi').value,
        horizon_hari: m.el.querySelector('#st-horizon').value
      });
      btn.disabled = false;
      UI.toast(res.message, res.success ? 'success' : 'error', { duration: 5000 });
      if (res.success) Admin.refreshAll();
    });

    renderHealth(m.el.querySelector('#st-health'), m);
  }

  /**
   * Panel kebersihan data. Sengaja hanya MELAPORKAN temuan; tidak ada yang
   * dibersihkan otomatis karena setiap baris berpotensi memuat riwayat
   * peserta yang tidak boleh hilang.
   */
  function renderHealth(wrap, modal) {
    if (!wrap) return;
    const h = BizLogic.getDataHealth();

    const item = (label, value, tone, hint) =>
      '<div class="health-item ' + (value > 0 ? tone : 'ok') + '">' +
        '<div class="health-item__count">' + value + '</div>' +
        '<div class="health-item__body"><strong>' + label + '</strong>' +
          (hint ? '<span>' + hint + '</span>' : '') + '</div>' +
      '</div>';

    const duplikatHtml = h.duplikat.length
      ? '<div class="health-detail"><strong>Kandidat akun ganda</strong>' +
        '<p class="form-helper">Nama dan tanggal lahir sama. Tinjau manual sebelum mengambil tindakan — ' +
        'setiap akun mungkin menyimpan riwayat absensi berbeda.</p>' +
        '<ul class="health-dupes">' +
        h.duplikat.map((d) =>
          '<li><strong>' + Utils.escapeHtml(d.nama) + '</strong> ' +
          '<span class="text-muted">(' + WITA.formatDate(d.tanggal_lahir) + ')</span>' +
          '<ul>' + d.akun.map((a) =>
            '<li>@' + Utils.escapeHtml(a.username) + ' • ' + Utils.escapeHtml(a.kelas || '-') +
            ' • <code>' + Utils.escapeHtml(a.nomor || '-') + '</code>' +
            ' • ' + a.jumlah_kehadiran + ' absensi ' +
            '<button type="button" class="btn btn-ghost btn-sm" data-open-peserta="' + a.id + '">Buka</button></li>'
          ).join('') + '</ul></li>').join('') +
        '</ul></div>'
      : '';

    wrap.innerHTML =
      '<div class="health-grid">' +
        item('Akun ganda terdeteksi', h.duplikat.length, 'warn', 'Butuh peninjauan koordinator') +
        item('Nomor belum sesuai format', h.nomorTidakSesuai, 'warn', 'Dapat dinormalisasi dari tab Peserta') +
        item('Nomor urut dipakai bersama', h.nomorUrutGanda, 'info',
             'Nomor peserta lengkap tetap unik; hanya urutannya yang tidak berurut') +
        item('Password belum kuat', h.passwordLemah, 'warn', 'Peserta diingatkan otomatis saat masuk') +
        item('Peserta tanpa email', h.tanpaEmail, 'info', 'Email dibutuhkan untuk reset password OTP') +
        item('Jadwal tanpa peserta', h.jadwalYatim, 'info', 'Sisa data peserta yang pernah dihapus') +
        item('Absensi tanpa acuan', h.kehadiranYatim, 'info', 'Sisa data peserta yang pernah dihapus') +
        item('Periode tanpa peserta', h.enrollmentYatim, 'info', 'Sisa akun yang dihapus lewat aplikasi versi lama') +
      '</div>' + duplikatHtml;

    wrap.querySelectorAll('[data-open-peserta]').forEach((b) =>
      b.addEventListener('click', () => {
        modal.close();
        Admin.selectTab('peserta');
        AdminPeserta.openDetail(b.dataset.openPeserta);
      }));
  }

  return { open };
})();
