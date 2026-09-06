/**
 * ===================================================================
 * admin/peserta.js — Tab Peserta
 * ===================================================================
 * Pembagian wewenang:
 *   • Pelatih (admin)    : MELIHAT data peserta, menghubungi via WhatsApp,
 *                          dan membuka dashboard peserta dalam mode
 *                          "lihat sebagai" yang BACA-SAJA. Tidak dapat
 *                          mengubah data diri maupun status pembayaran.
 *   • Koordinator (super): mengubah seluruh data, mengelola periode
 *                          pelatihan, mengonfirmasi pembayaran, dan
 *                          mengoreksi nomor peserta.
 */
const AdminPeserta = (function () {
  'use strict';

  const Icons = Admin.Icons;
  let cache = [];
  let pager = null;

  function load() {
    const res = BizLogic.getAllPeserta();
    if (!res.success) { UI.toast(res.message, 'error'); return; }
    cache = res.data || [];
    renderNomorNotice();
    applyFilters();
  }

  /* ---------------- Peringatan nomor peserta belum sesuai format ---------------- */
  function renderNomorNotice() {
    const el = document.getElementById('nomor-notice');
    if (!el) return;
    const bermasalah = cache.filter((p) => !p.nomor_valid).length;
    if (!bermasalah || !Auth.can('normalisasiNomor')) { el.hidden = true; return; }

    el.hidden = false;
    el.innerHTML =
      '<div class="notice-strip__body">' +
        '<strong>' + bermasalah + ' peserta</strong> memiliki nomor yang belum mengikuti format ' +
        '<code>DDMMYY + 4 digit urut</code>. Nomor lama akan tetap diarsipkan.' +
      '</div>' +
      '<button type="button" class="btn btn-primary btn-sm" id="btn-normalisasi">Normalisasi Sekarang</button>';
    document.getElementById('btn-normalisasi').addEventListener('click', openNormalisasiModal);
  }

  function openNormalisasiModal() {
    const plan = BizLogic.previewNormalisasiNomor();
    const valid = plan.filter((x) => x.baru && !x.error);
    const gagal = plan.filter((x) => x.error);

    const rows = valid.map((x) =>
      '<tr><td>' + Utils.escapeHtml(x.nama) + '</td>' +
      '<td><code>' + Utils.escapeHtml(x.lama || '(kosong)') + '</code></td>' +
      '<td><code class="text-success">' + x.baru + '</code></td></tr>').join('');

    const body =
      '<p>Nomor peserta akan dibuat ulang mengikuti format resmi: ' +
      '<code>DDMMYY</code> dari tanggal lahir + nomor urut pendaftaran 4 digit.</p>' +
      '<div class="info-banner info-banner--soft"><div aria-hidden="true">🗄️</div>' +
        '<p>Nomor lama <strong>tidak dihapus</strong>. Nilainya diarsipkan dan tetap terlihat ' +
        'pada detail peserta sebagai "Nomor lama".</p></div>' +
      (gagal.length
        ? '<div class="info-banner info-banner--warning"><div aria-hidden="true">⚠️</div><p>' +
          gagal.length + ' peserta dilewati karena tanggal lahirnya belum valid.</p></div>'
        : '') +
      '<div class="pivot-scroll" style="max-height:320px;">' +
        '<table class="data-table data-table--compact"><thead><tr>' +
          '<th>Peserta</th><th>Nomor Lama</th><th>Nomor Baru</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';

    const m = UI.modal({
      title: 'Normalisasi ' + valid.length + ' Nomor Peserta',
      size: 'md',
      body,
      actions: [{ label: 'Batal', variant: 'secondary' }]
    });

    const go = document.createElement('button');
    go.className = 'btn btn-primary btn-block';
    go.style.marginTop = '12px';
    go.textContent = 'Terapkan ke ' + valid.length + ' peserta';
    go.addEventListener('click', async () => {
      go.disabled = true;
      Utils.showLoader(true);
      const res = await BizLogic.applyNormalisasiNomor();
      Utils.showLoader(false);
      m.close();
      UI.toast(res.message, res.success ? 'success' : 'error', { duration: 5000 });
      Admin.refresh(['peserta', 'rapor']);
    });
    m.el.querySelector('.modal-body').appendChild(go);
  }

  /* ---------------- Filter & tabel ---------------- */
  function applyFilters() {
    const q = (document.getElementById('search-peserta')?.value || '').toLowerCase();
    const fKelas = document.getElementById('filter-kelas-peserta')?.value || 'all';
    const fStatus = document.getElementById('filter-status-peserta')?.value || 'all';
    const today = WITA.todayISO();

    let rows = cache.filter((p) => {
      if (q) {
        const hay = [p.Nama_Lengkap, p.Username, p.Nomor_Peserta, p.Nomor_Whatsapp, p.Email]
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fKelas !== 'all' && p.Kelas !== fKelas) return false;

      if (fStatus === 'paid')    return p.lunas;
      if (fStatus === 'unpaid')  return !p.lunas;
      if (fStatus === 'pending') return !!p.periode_pending;
      if (fStatus === 'expired') return p.lunas && !p.periode_aktif &&
                                        WITA.diffDays(p.Tanggal_Akhir, today) > 0;
      return true;
    });

    /* ---------------------------------------------------------------
       URUTAN DEFAULT
       Pelatih & koordinator hampir selalu bekerja dengan peserta yang
       BERLATIH HARI INI. Karena itu urutannya:
         1. Peserta aktif dari grup yang berlatih hari ini
         2. Peserta aktif dari grup lain
         3. Peserta yang periodenya sudah berakhir / belum lunas
       Di dalam tiap kelompok, urut abjad.
       --------------------------------------------------------------- */
    const grupHariIni = ScheduleEngine.groupsOnDay(today);
    const prioritas = (p) => {
      if (!p.periode_aktif) return 2;                       // tidak aktif -> paling bawah
      return grupHariIni.includes(p.Kelas) ? 0 : 1;
    };
    rows.sort((a, b) => {
      const d = prioritas(a) - prioritas(b);
      if (d !== 0) return d;
      return String(a.Nama_Lengkap).localeCompare(String(b.Nama_Lengkap));
    });

    renderHintGrupHariIni(grupHariIni, rows);
    pager.setData(rows);
  }

  /** Keterangan singkat tentang grup yang sedang diprioritaskan. */
  function renderHintGrupHariIni(grupHariIni, rows) {
    const el = document.getElementById('peserta-hint');
    if (!el) return;
    const aktifHariIni = rows.filter((p) => p.periode_aktif && grupHariIni.includes(p.Kelas)).length;

    if (!grupHariIni.length) {
      el.innerHTML = '<span aria-hidden="true">📅</span> Tidak ada grup yang berlatih hari ini. ' +
        'Daftar diurutkan berdasarkan peserta aktif.';
      return;
    }
    el.innerHTML = '<span aria-hidden="true">📅</span> Hari ini <strong>' +
      grupHariIni.join(', ') + '</strong> berlatih — ' + aktifHariIni +
      ' peserta aktif ditampilkan lebih dulu.';
  }

  function render(rows) {
    if (!rows.length) { Admin.emptyRow('tbody-peserta', 5, 'Tidak ada peserta yang cocok'); return; }
    const tbody = document.getElementById('tbody-peserta');

    tbody.innerHTML = rows.map((p) => {
      const bayar = p.periode_pending
        ? '<span class="status-badge warning">' + Icons.clock() + ' Menunggu</span>'
        : p.lunas
          ? '<span class="status-badge success">' + Icons.check() + ' Lunas</span>'
          : '<span class="status-badge danger">Belum Lunas</span>';

      // Penanda periode berakhir membantu admin membedakan peserta yang
      // masih berlatih dari yang tinggal riwayat.
      const nonaktif = !p.periode_aktif
        ? ' <span class="status-badge muted">Periode berakhir</span>' : '';

      // Ubah & hapus: hanya koordinator.
      // Lihat sebagai: koordinator & pelatih (mode baca-saja).
      const aksi =
        (Auth.can('editDataDiriPeserta')
          ? '<button class="icon-btn edit" data-act="edit" data-id="' + p.Id_Peserta + '" ' +
                'title="Ubah data peserta" aria-label="Ubah data peserta">' + Icons.pencil() + '</button>'
          : '') +
        (Auth.can('lihatSebagaiPengguna')
          ? '<button class="icon-btn view" data-act="masuk" data-id="' + p.Id_Peserta + '" ' +
                'title="Lihat sebagai peserta ini" aria-label="Lihat sebagai peserta ini">' + Icons.swap() + '</button>'
          : '') +
        (Auth.can('hapusPeserta')
          ? '<button class="icon-btn delete" data-act="hapus" data-id="' + p.Id_Peserta + '" ' +
                'title="Hapus peserta permanen" aria-label="Hapus peserta permanen">' + Icons.trash() + '</button>'
          : '');

      return '<tr class="row-clickable' + (p.periode_aktif ? '' : ' is-inactive') + '" ' +
             'data-act="detail" data-id="' + p.Id_Peserta + '">' +
        '<td><div class="cell-primary">' + Utils.escapeHtml(p.Nama_Lengkap) + nonaktif + '</div>' +
          '<div class="cell-sub">@' + Utils.escapeHtml(p.Username) + '</div></td>' +
        '<td>' + (p.Usia || '-') + '</td>' +
        '<td><span class="kelas-tag">' + Utils.escapeHtml(p.Kelas || '-') + '</span></td>' +
        '<td>' + bayar + '</td>' +
        '<td data-stop><div class="action-btns">' +
          '<button class="icon-btn" data-act="wa" data-id="' + p.Id_Peserta + '" ' +
              'title="Hubungi via WhatsApp" aria-label="Hubungi via WhatsApp">' + Icons.whatsapp() + '</button>' +
          aksi +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  /* ---------------- Hapus permanen (khusus koordinator) ---------------- */
  function openHapusModal(id) {
    if (!Auth.can('hapusPeserta')) return;
    const p = Store.findPeserta(id);
    if (!p) return;
    const ringkas = BizLogic.previewHapusPeserta(id);

    const baris = (label, n) => n > 0
      ? '<li><strong>' + n + '</strong> ' + label + '</li>' : '';

    const body =
      '<div class="info-banner info-banner--warning"><div aria-hidden="true">⚠️</div>' +
        '<p><strong>Tindakan ini tidak dapat dibatalkan.</strong> Seluruh data berikut ' +
        'akan hilang permanen dari sistem.</p></div>' +
      '<div class="detail-card">' +
        '<div class="detail-row"><span>Peserta</span><strong>' +
          Utils.escapeHtml(p.Nama_Lengkap) + '</strong></div>' +
        '<div class="detail-row"><span>Nomor Peserta</span><strong><code>' +
          Utils.escapeHtml(p.Nomor_Peserta || '-') + '</code></strong></div>' +
      '</div>' +
      (ringkas.kehadiran + ringkas.rapor + ringkas.jadwalPersonal + ringkas.enrollment > 0
        ? '<p class="form-helper">Data yang ikut terhapus:</p><ul class="hapus-ringkas">' +
          baris('catatan kehadiran', ringkas.kehadiran) +
          baris('rapor', ringkas.rapor) +
          baris('jadwal personal', ringkas.jadwalPersonal) +
          baris('periode pelatihan', ringkas.enrollment) +
          '</ul>'
        : '') +
      '<div class="info-banner info-banner--soft"><div aria-hidden="true">💡</div>' +
        '<p>Bila peserta hanya berhenti latihan, lebih baik <strong>nonaktifkan akunnya</strong> ' +
        'lewat menu Ubah Data agar riwayatnya tetap tersimpan.</p></div>' +
      '<div class="form-group"><label for="del-konfirmasi">' +
        'Ketik nama peserta untuk mengonfirmasi</label>' +
        '<input id="del-konfirmasi" class="form-control" autocomplete="off" ' +
        'placeholder="' + Utils.escapeHtml(p.Nama_Lengkap) + '"></div>';

    const m = UI.modal({
      title: 'Hapus Peserta Permanen',
      size: 'sm',
      body,
      actions: [{ label: 'Batal', variant: 'secondary' }]
    });

    const input = m.el.querySelector('#del-konfirmasi');
    const hapus = document.createElement('button');
    hapus.className = 'btn btn-danger btn-block';
    hapus.style.marginTop = '10px';
    hapus.textContent = 'Hapus Permanen';
    hapus.disabled = true;

    // Tombol baru hidup ketika nama diketik persis — pengaman dari salah klik.
    input.addEventListener('input', () => {
      hapus.disabled = BizUtil.normName(input.value) !== BizUtil.normName(p.Nama_Lengkap);
    });

    hapus.addEventListener('click', async () => {
      hapus.disabled = true;
      Utils.showLoader(true);
      const res = await BizLogic.deletePesertaPermanen({ id, konfirmasi_nama: input.value });
      Utils.showLoader(false);

      if (!res.success) {
        hapus.disabled = false;
        UI.toast(res.message, 'error', { duration: 6000 });
        return;
      }
      m.close();
      UI.toast(res.message, 'success', { duration: 6000 });
      Admin.refreshAll();
    });
    m.el.querySelector('.modal-body').appendChild(hapus);
  }

  /* ---------------- Detail peserta ---------------- */
  function openDetail(id) {
    const p = cache.find((x) => x.Id_Peserta === id);
    if (!p) return;
    const row = (label, value) =>
      '<div class="detail-row"><span>' + label + '</span><strong>' + (value || '-') + '</strong></div>';

    const enrollments = BizLogic.getEnrollments(id);
    const periodeHtml = enrollments.length
      ? enrollments.slice().reverse().map((e) => {
          const meta = CONFIG.ENROLLMENT_STATUS[e.Status] || { label: e.Status, tone: 'muted' };
          return '<li><span class="status-badge ' + meta.tone + '">' + meta.label + '</span>' +
            '<span>' + WITA.formatDate(e.Tanggal_Mulai) + ' — ' + WITA.formatDate(e.Tanggal_Akhir) + '</span>' +
            '<span class="text-muted">' + Utils.escapeHtml(e.Kelas || '-') + ' • ' +
              (e.Durasi_Bulan || 1) + ' bln</span>' +
            (Auth.isSuperadmin()
              ? '<button class="btn btn-ghost btn-sm" data-enr="' + e.Id_Enrollment + '">Kelola</button>' : '') +
          '</li>';
        }).join('')
      : '<li class="text-muted">Belum ada periode pelatihan</li>';

    const body =
      '<div class="detail-grid">' +
        '<div class="detail-section"><h4>' + Icons.user() + ' Identitas</h4>' +
          row('Nama Lengkap', Utils.escapeHtml(p.Nama_Lengkap)) +
          row('Username', Utils.escapeHtml(p.Username)) +
          row('Nomor Peserta', '<code>' + Utils.escapeHtml(p.Nomor_Peserta || '-') + '</code>' +
            (p.nomor_valid ? '' : ' <span class="status-badge warning">format lama</span>')) +
          (p.Nomor_Peserta_Legacy ? row('Nomor Lama (arsip)', '<code>' +
            Utils.escapeHtml(p.Nomor_Peserta_Legacy) + '</code>') : '') +
          row('Email', Utils.escapeHtml(p.Email) || '<em class="text-muted">belum diisi</em>') +
          row('WhatsApp', Utils.escapeHtml(p.Nomor_Whatsapp)) +
          row('Jenis Kelamin', Utils.escapeHtml(p.Jenis_Kelamin)) +
          row('Tempat, Tanggal Lahir',
            Utils.escapeHtml(p.Tempat_Lahir) + ', ' + WITA.formatDate(p.Tanggal_Lahir)) +
          row('Usia', p.Usia + ' tahun') +
          row('Kelompok Umur', Utils.escapeHtml(p.Kelompok_Umur)) +
          row('NISNAS', Utils.escapeHtml(p.NISNAS)) +
        '</div>' +
        '<div class="detail-section"><h4>' + Icons.school() + ' Sekolah</h4>' +
          row('Asal Sekolah', Utils.escapeHtml(p.Asal_Sekolah)) +
          row('Kelas Sekolah', Utils.escapeHtml(p.Kelas_Sekolah)) +
          row('Wali Kelas', Utils.escapeHtml(p.Wali_Kelas)) +
        '</div>' +
        '<div class="detail-section"><h4>' + Icons.pool() + ' Pelatihan</h4>' +
          row('Grup', Utils.escapeHtml(p.Kelas)) +
          row('Periode Berjalan', p.periode_aktif
            ? WITA.formatDate(p.periode_aktif.Tanggal_Mulai) + ' — ' + WITA.formatDate(p.periode_aktif.Tanggal_Akhir)
            : '<em class="text-muted">tidak ada periode berjalan</em>') +
          row('Total Jadwal', p.total_jadwal) +
          row('Total Hadir', p.total_hadir) +
          row('Persentase', p.persentase + '%') +
          (p.password_lemah
            ? row('Keamanan', '<span class="status-badge warning">password belum kuat</span>') : '') +
        '</div>' +
      '</div>' +
      '<h4 class="form-section-title">Riwayat Periode Pelatihan</h4>' +
      '<ul class="enrollment-inline-list">' + periodeHtml + '</ul>';

    const actions = [{ label: 'Tutup', variant: 'secondary' }];
    const m = UI.modal({ title: 'Detail Peserta', size: 'md', body, actions });

    m.el.querySelectorAll('[data-enr]').forEach((b) =>
      b.addEventListener('click', () => { m.close(); openEnrollmentReview(b.dataset.enr); }));

    const bar = document.createElement('div');
    bar.className = 'modal-inline-actions';

    const wa = document.createElement('button');
    wa.className = 'btn btn-success btn-sm';
    wa.innerHTML = Icons.whatsapp() + ' Hubungi';
    wa.addEventListener('click', () => contactPeserta(id));
    bar.appendChild(wa);

    if (Auth.isSuperadmin()) {
      const edit = document.createElement('button');
      edit.className = 'btn btn-primary btn-sm';
      edit.innerHTML = Icons.pencil() + ' Ubah Data';
      edit.addEventListener('click', () => { m.close(); openEdit(id); });
      bar.appendChild(edit);

      const tambah = document.createElement('button');
      tambah.className = 'btn btn-accent btn-sm';
      tambah.innerHTML = Icons.plus() + ' Tambah Periode';
      tambah.addEventListener('click', () => { m.close(); openAddEnrollment(id); });
      bar.appendChild(tambah);

      const hapus = document.createElement('button');
      hapus.className = 'btn btn-danger btn-sm';
      hapus.innerHTML = Icons.trash() + ' Hapus Permanen';
      hapus.addEventListener('click', () => { m.close(); openHapusModal(id); });
      bar.appendChild(hapus);
    }
    m.el.querySelector('.modal-body').appendChild(bar);
  }

  /* ---------------- Ubah data peserta (koordinator) ---------------- */
  function openEdit(id) {
    if (!Auth.isSuperadmin()) {
      Admin.alert('Akses Terbatas',
        'Sebagai <strong>pelatih</strong>, Anda tidak dapat mengubah data diri peserta. ' +
        'Hubungi koordinator klub bila ada data yang perlu diperbaiki.');
      return;
    }
    const p = cache.find((x) => x.Id_Peserta === id);
    if (!p) return;

    const kelasOpts = CONFIG.KELAS_OPTIONS.map((k) =>
      '<option value="' + k + '"' + (p.Kelas === k ? ' selected' : '') + '>' + k + '</option>').join('');
    const jkOpts = CONFIG.JENIS_KELAMIN_OPTIONS.map((k) =>
      '<option value="' + k + '"' + (p.Jenis_Kelamin === k ? ' selected' : '') + '>' + k + '</option>').join('');

    const prefix = Numbering.prefixOf(p.Tanggal_Lahir) || '------';
    const urut = p.Nomor_Urut || (Numbering.parse(p.Nomor_Peserta) || {}).urut || '';

    const body =
      '<h4 class="form-section-title">Identitas</h4>' +
      '<div class="form-grid-2">' +
        '<div class="form-group"><label for="e-nama">Nama Lengkap</label>' +
          '<input id="e-nama" class="form-control" value="' + Utils.escapeHtml(p.Nama_Lengkap) + '"></div>' +
        '<div class="form-group"><label for="e-username">Username</label>' +
          '<input id="e-username" class="form-control" value="' + Utils.escapeHtml(p.Username) + '"></div>' +
        '<div class="form-group"><label for="e-email">Email</label>' +
          '<input id="e-email" type="email" class="form-control" value="' + Utils.escapeHtml(p.Email || '') + '"></div>' +
        '<div class="form-group"><label for="e-wa">WhatsApp</label>' +
          '<input id="e-wa" class="form-control" value="' + Utils.escapeHtml(p.Nomor_Whatsapp) + '" inputmode="numeric"></div>' +
        '<div class="form-group"><label for="e-jk">Jenis Kelamin</label>' +
          '<select id="e-jk" class="form-control">' + jkOpts + '</select></div>' +
        '<div class="form-group"><label for="e-tempat">Tempat Lahir</label>' +
          '<input id="e-tempat" class="form-control" value="' + Utils.escapeHtml(p.Tempat_Lahir) + '"></div>' +
        '<div class="form-group"><label for="e-lahir">Tanggal Lahir</label>' +
          '<input id="e-lahir" type="date" class="form-control" value="' + WITA.toISODate(p.Tanggal_Lahir) + '"></div>' +
        '<div class="form-group"><label for="e-nisn">NISNAS</label>' +
          '<input id="e-nisn" class="form-control" value="' + Utils.escapeHtml(p.NISNAS) + '"></div>' +
      '</div>' +

      '<h4 class="form-section-title">Nomor Peserta</h4>' +
      '<p class="form-helper">Enam digit pertama diambil otomatis dari tanggal lahir dan tidak dapat diubah. ' +
        'Anda hanya dapat mengoreksi nomor urut.</p>' +
      '<div class="nomor-editor">' +
        '<span class="nomor-editor__prefix" id="e-nomor-prefix">' + prefix + '</span>' +
        '<input id="e-nomor-urut" class="form-control nomor-editor__urut" type="number" min="1" max="9999" ' +
          'value="' + urut + '" inputmode="numeric" aria-label="Nomor urut peserta">' +
        '<button type="button" class="btn btn-secondary btn-sm" id="e-nomor-save">Simpan Nomor</button>' +
      '</div>' +
      '<div id="e-nomor-feedback"></div>' +

      '<h4 class="form-section-title">Sekolah</h4>' +
      '<div class="form-grid-2">' +
        '<div class="form-group"><label for="e-sekolah">Asal Sekolah</label>' +
          '<input id="e-sekolah" class="form-control" value="' + Utils.escapeHtml(p.Asal_Sekolah) + '"></div>' +
        '<div class="form-group"><label for="e-kelas-sekolah">Kelas Sekolah</label>' +
          '<input id="e-kelas-sekolah" class="form-control" value="' + Utils.escapeHtml(p.Kelas_Sekolah) + '"></div>' +
        '<div class="form-group"><label for="e-wali">Wali Kelas</label>' +
          '<input id="e-wali" class="form-control" value="' + Utils.escapeHtml(p.Wali_Kelas) + '"></div>' +
        '<div class="form-group"><label for="e-kelas">Grup Latihan</label>' +
          '<select id="e-kelas" class="form-control">' + kelasOpts + '</select></div>' +
      '</div>' +

      '<h4 class="form-section-title">Akun</h4>' +
      '<div class="form-grid-2">' +
        '<div class="form-group"><label for="e-password">Password Baru <span class="text-muted">(opsional)</span></label>' +
          '<input id="e-password" class="form-control" placeholder="Kosongkan bila tidak diubah"></div>' +
        '<div class="form-group"><label for="e-status-akun">Status Akun</label>' +
          '<select id="e-status-akun" class="form-control">' +
            '<option value="active"' + (p.Status_Akun !== 'nonaktif' ? ' selected' : '') + '>Aktif</option>' +
            '<option value="nonaktif"' + (p.Status_Akun === 'nonaktif' ? ' selected' : '') + '>Nonaktif</option>' +
          '</select></div>' +
      '</div>';

    const m = UI.modal({
      title: 'Ubah Data Peserta',
      size: 'md',
      body,
      actions: [{ label: 'Batal', variant: 'secondary' }]
    });

    // Prefix nomor mengikuti tanggal lahir secara langsung.
    m.el.querySelector('#e-lahir').addEventListener('change', (e) => {
      m.el.querySelector('#e-nomor-prefix').textContent = Numbering.prefixOf(e.target.value) || '------';
    });

    m.el.querySelector('#e-nomor-save').addEventListener('click', async () => {
      const val = m.el.querySelector('#e-nomor-urut').value;
      const fb = m.el.querySelector('#e-nomor-feedback');
      fb.innerHTML = '';
      const res = await BizLogic.setNomorUrut({ id_peserta: id, urut: val });

      if (res.success) {
        UI.toast(res.message, 'success');
        Admin.refresh('peserta');
        return;
      }
      if (res.code === 'NOMOR_URUT_CONFLICT') {
        fb.innerHTML =
          '<div class="conflict-box">' +
            '<div><strong>Nomor urut sudah dipakai</strong>' +
            '<p>' + Utils.escapeHtml(res.message) + '</p></div>' +
            '<button type="button" class="btn btn-secondary btn-sm" id="goto-conflict">' +
              'Buka data ' + Utils.escapeHtml(res.data.nama) + '</button>' +
          '</div>';
        fb.querySelector('#goto-conflict').addEventListener('click', () => {
          m.close();
          openEdit(res.data.id_peserta);
        });
        return;
      }
      UI.toast(res.message, 'error');
    });

    const save = document.createElement('button');
    save.className = 'btn btn-primary btn-block';
    save.style.marginTop = '14px';
    save.textContent = 'Simpan Perubahan';
    save.addEventListener('click', async () => {
      const payload = {
        id,
        nama_lengkap: m.el.querySelector('#e-nama').value,
        username: m.el.querySelector('#e-username').value,
        email: m.el.querySelector('#e-email').value,
        nomor_whatsapp: m.el.querySelector('#e-wa').value,
        jenis_kelamin: m.el.querySelector('#e-jk').value,
        tempat_lahir: m.el.querySelector('#e-tempat').value,
        tanggal_lahir: m.el.querySelector('#e-lahir').value,
        nisnas: m.el.querySelector('#e-nisn').value,
        asal_sekolah: m.el.querySelector('#e-sekolah').value,
        kelas_sekolah: m.el.querySelector('#e-kelas-sekolah').value,
        wali_kelas: m.el.querySelector('#e-wali').value,
        kelas: m.el.querySelector('#e-kelas').value,
        status_akun: m.el.querySelector('#e-status-akun').value
      };
      const pw = m.el.querySelector('#e-password').value;
      if (pw) {
        const check = PasswordPolicy.evaluate(pw, payload.username);
        if (!check.valid) {
          UI.toast('Password baru belum memenuhi syarat: ' +
            PasswordPolicy.firstError(pw, payload.username), 'warning', { duration: 5000 });
          return;
        }
        payload.password = pw;
      }

      save.disabled = true;
      Utils.showLoader(true);
      const res = await BizLogic.updatePeserta(payload);
      Utils.showLoader(false);
      save.disabled = false;

      if (!res.success) { UI.toast(res.message, 'error', { duration: 5000 }); return; }
      UI.toast(res.message, 'success');
      m.close();
      Admin.refresh(['peserta', 'jadwal', 'rapor']);
    });
    m.el.querySelector('.modal-body').appendChild(save);
  }

  /* ---------------- Periode pelatihan ---------------- */

  /** Tinjau & konfirmasi satu periode (dipakai dari kartu tugas & detail). */
  function openEnrollmentReview(idEnrollment) {
    if (!Auth.can('konfirmasiPembayaran')) {
      Admin.alert('Akses Terbatas',
        'Konfirmasi pembayaran adalah wewenang <strong>koordinator klub</strong>. ' +
        'Silakan teruskan ke koordinator untuk diverifikasi.');
      return;
    }
    const e = Store.enrollment().find((x) => x.Id_Enrollment === idEnrollment);
    if (!e) return;
    const p = Store.findPeserta(e.Id_Peserta);
    if (!p) return;

    const statusOpts = Object.entries(CONFIG.ENROLLMENT_STATUS).map(([k, v]) =>
      '<option value="' + k + '"' + (e.Status === k ? ' selected' : '') + '>' + v.label + '</option>').join('');
    const kelasOpts = CONFIG.KELAS_OPTIONS.map((k) =>
      '<option value="' + k + '"' + (e.Kelas === k ? ' selected' : '') + '>' + k + '</option>').join('');

    const body =
      '<div class="detail-card">' +
        '<div class="detail-row"><span>Peserta</span><strong>' + Utils.escapeHtml(p.Nama_Lengkap) + '</strong></div>' +
        '<div class="detail-row"><span>Nomor Peserta</span><strong><code>' +
          Utils.escapeHtml(p.Nomor_Peserta || '-') + '</code></strong></div>' +
        '<div class="detail-row"><span>WhatsApp</span><strong>' + Utils.escapeHtml(p.Nomor_Whatsapp) + '</strong></div>' +
        (e.Catatan ? '<div class="detail-row"><span>Catatan</span><strong>' +
          Utils.escapeHtml(e.Catatan) + '</strong></div>' : '') +
      '</div>' +
      '<div class="form-grid-2">' +
        '<div class="form-group"><label for="er-kelas">Grup</label>' +
          '<select id="er-kelas" class="form-control">' + kelasOpts + '</select></div>' +
        '<div class="form-group"><label for="er-status">Status Periode</label>' +
          '<select id="er-status" class="form-control">' + statusOpts + '</select></div>' +
        '<div class="form-group"><label for="er-mulai">Tanggal Mulai</label>' +
          '<input id="er-mulai" type="date" class="form-control" value="' + WITA.toISODate(e.Tanggal_Mulai) + '"></div>' +
        '<div class="form-group"><label for="er-akhir">Tanggal Akhir</label>' +
          '<input id="er-akhir" type="date" class="form-control" value="' + WITA.toISODate(e.Tanggal_Akhir) + '"></div>' +
      '</div>' +
      '<label class="checkbox-row"><input type="checkbox" id="er-lunas"' +
        (BizUtil.isTrue(e.Status_Pembayaran) ? ' checked' : '') + '>' +
        '<span><strong>Pembayaran sudah lunas</strong> — jadwal latihan peserta akan ' +
        'dibuat &amp; dibuka otomatis setelah ini disimpan.</span></label>';

    const m = UI.modal({
      title: 'Tinjau Periode Pelatihan',
      size: 'sm',
      body,
      actions: [{ label: 'Tutup', variant: 'secondary' }]
    });

    const bar = document.createElement('div');
    bar.className = 'modal-inline-actions';

    const wa = document.createElement('button');
    wa.className = 'btn btn-success btn-sm';
    wa.innerHTML = Icons.whatsapp() + ' Hubungi Peserta';
    wa.addEventListener('click', () => contactPeserta(p.Id_Peserta));
    bar.appendChild(wa);

    const save = document.createElement('button');
    save.className = 'btn btn-primary btn-sm';
    save.textContent = 'Simpan';
    save.addEventListener('click', async () => {
      save.disabled = true;
      Utils.showLoader(true);
      const res = await BizLogic.updateEnrollment({
        id: idEnrollment,
        kelas: m.el.querySelector('#er-kelas').value,
        status: m.el.querySelector('#er-status').value,
        mulai: m.el.querySelector('#er-mulai').value,
        akhir: m.el.querySelector('#er-akhir').value,
        status_pembayaran: m.el.querySelector('#er-lunas').checked
      });
      Utils.showLoader(false);
      save.disabled = false;

      if (!res.success) { UI.toast(res.message, 'error', { duration: 5000 }); return; }
      UI.toast(res.message, 'success', { duration: 5000 });
      m.close();
      Admin.refresh(['peserta', 'jadwal', 'rapor']);
    });
    bar.appendChild(save);
    m.el.querySelector('.modal-body').appendChild(bar);
  }

  function openAddEnrollment(idPeserta) {
    const p = Store.findPeserta(idPeserta);
    if (!p) return;
    const current = BizLogic.currentEnrollment(idPeserta);
    const mulai = current ? WITA.addDays(current.Tanggal_Akhir, 1) : WITA.todayISO();

    const kelasOpts = CONFIG.KELAS_OPTIONS.map((k) =>
      '<option value="' + k + '"' + (p.Kelas === k ? ' selected' : '') + '>' + k + '</option>').join('');
    const durasiOpts = CONFIG.DURASI_OPTIONS.map((n) =>
      '<option value="' + n + '">' + n + ' bulan</option>').join('');

    const body =
      '<p class="form-helper">Periode baru ditambahkan ke akun yang sama — riwayat lama tetap tersimpan.</p>' +
      '<div class="form-grid-2">' +
        '<div class="form-group"><label for="ae-kelas">Grup</label>' +
          '<select id="ae-kelas" class="form-control">' + kelasOpts + '</select></div>' +
        '<div class="form-group"><label for="ae-durasi">Durasi</label>' +
          '<select id="ae-durasi" class="form-control">' + durasiOpts + '</select></div>' +
        '<div class="form-group"><label for="ae-mulai">Mulai</label>' +
          '<input id="ae-mulai" type="date" class="form-control" value="' + mulai + '"></div>' +
        '<div class="form-group"><label for="ae-akhir">Berakhir</label>' +
          '<input id="ae-akhir" type="date" class="form-control" readonly></div>' +
      '</div>' +
      '<label class="checkbox-row"><input type="checkbox" id="ae-lunas">' +
        '<span>Pembayaran sudah lunas (jadwal langsung dibuat)</span></label>';

    const m = UI.modal({
      title: 'Tambah Periode — ' + p.Nama_Lengkap,
      size: 'sm',
      body,
      actions: [{ label: 'Batal', variant: 'secondary' }]
    });

    const recalc = () => {
      m.el.querySelector('#ae-akhir').value =
        WITA.addMonths(m.el.querySelector('#ae-mulai').value,
          parseInt(m.el.querySelector('#ae-durasi').value, 10) || 1);
    };
    m.el.querySelector('#ae-mulai').addEventListener('change', recalc);
    m.el.querySelector('#ae-durasi').addEventListener('change', recalc);
    recalc();

    const save = document.createElement('button');
    save.className = 'btn btn-primary btn-block';
    save.style.marginTop = '12px';
    save.textContent = 'Tambah Periode';
    save.addEventListener('click', async () => {
      save.disabled = true;
      Utils.showLoader(true);
      const res = await BizLogic.addEnrollmentByAdmin({
        id_peserta: idPeserta,
        kelas: m.el.querySelector('#ae-kelas').value,
        durasi: parseInt(m.el.querySelector('#ae-durasi').value, 10),
        mulai: m.el.querySelector('#ae-mulai').value,
        akhir: m.el.querySelector('#ae-akhir').value,
        status_pembayaran: m.el.querySelector('#ae-lunas').checked
      });
      Utils.showLoader(false);
      save.disabled = false;

      if (!res.success) { UI.toast(res.message, 'error', { duration: 5000 }); return; }
      UI.toast(res.message, 'success', { duration: 5000 });
      m.close();
      Admin.refresh(['peserta', 'jadwal']);
    });
    m.el.querySelector('.modal-body').appendChild(save);
  }

  /* ---------------- Aksi lain ---------------- */

  function contactPeserta(id) {
    const p = Store.findPeserta(id);
    if (!p) return;

    const body =
      '<p class="form-helper">Pesan akan dikirim ke <strong>' +
        Utils.escapeHtml(p.Nama_Lengkap) + '</strong> (' + Utils.escapeHtml(p.Nomor_Whatsapp) + '). ' +
        'Identitas peserta otomatis disertakan.</p>' +
      '<div class="form-group"><label for="ct-msg">Pesan</label>' +
        '<textarea id="ct-msg" class="form-control" rows="4" ' +
          'placeholder="Contoh: mengingatkan latihan besok pukul 16.00 WITA"></textarea></div>';

    const m = UI.modal({ title: 'Hubungi Peserta', size: 'sm', body, actions: [{ label: 'Batal', variant: 'secondary' }] });

    const send = document.createElement('button');
    send.className = 'btn btn-success btn-block';
    send.style.marginTop = '10px';
    send.textContent = 'Buka WhatsApp';
    send.addEventListener('click', () => {
      WA.open(WA.Templates.adminKePeserta(p, m.el.querySelector('#ct-msg').value), p.Nomor_Whatsapp);
      m.close();
    });
    m.el.querySelector('.modal-body').appendChild(send);
  }

  /** Koordinator membuka dashboard peserta untuk menelusuri keluhan. */
  async function loginAsPeserta(id) {
    if (!Auth.can('lihatSebagaiPengguna')) return;
    const p = Store.findPeserta(id);
    if (!p) return;

    const ok = await UI.confirm(
      'Anda akan membuka dashboard sebagai ' + p.Nama_Lengkap + '. ' +
      'Mode ini bersifat BACA-SAJA: data peserta, absensi, dan password tidak dapat diubah dari sana. ' +
      'Sebuah banner akan tampil selama mode aktif, dan Anda bisa kembali kapan saja.',
      { title: 'Lihat Sebagai Peserta', confirmLabel: 'Ya, lanjutkan', variant: 'primary' }
    );
    if (!ok) return;

    Auth.impersonate(CONFIG.ROLES.PESERTA, BizLogic.sessionDataFor(p));
    window.location.href = 'peserta.html';
  }

  /* ---------------- Inisialisasi ---------------- */
  function init() {
    pager = new Paginator({
      mountId: 'pager-peserta',
      storageKey: 'pgsize_admin_peserta',
      label: 'peserta',
      onRender: render
    });

    ['search-peserta', 'filter-kelas-peserta', 'filter-status-peserta'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.addEventListener('input', applyFilters); el.addEventListener('change', applyFilters); }
    });

    document.getElementById('tbody-peserta').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const stop = e.target.closest('[data-stop]');
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      if (act === 'detail' && !stop) return openDetail(id);
      if (act === 'edit') return openEdit(id);
      if (act === 'wa') return contactPeserta(id);
      if (act === 'masuk') return loginAsPeserta(id);
      if (act === 'hapus') return openHapusModal(id);
    });
  }

  return { init, load, openDetail, openEdit, openEnrollmentReview, openAddEnrollment, contactPeserta, openHapusModal };
})();

Admin.register('peserta', AdminPeserta);
