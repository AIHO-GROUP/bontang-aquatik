// =============================================================
// Admin Panel — Refined with Cupertino icons, smooth UX
// =============================================================
let pesertaCache = [], jadwalCache = [], kehadiranCache = [], raporCache = [], beritaCache = [], pesertaListLunas = [];

// =============================================================
// CUPERTINO ICONS — inline SVG helper
// Stroke-based, rounded, currentColor-driven
// =============================================================
const Icons = (() => {
  const wrap = (paths, opts = {}) => {
    const sw = opts.sw || 1.8;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  };
  return {
    pencil: () => wrap(`<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>`),
    trash:  () => wrap(`<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>`),
    eye:    () => wrap(`<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`),
    link:   () => wrap(`<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`),
    plus:   () => wrap(`<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`, { sw: 2 }),
    check:  () => wrap(`<polyline points="20 6 9 17 4 12"/>`, { sw: 2.2 }),
    x:      () => wrap(`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`, { sw: 2 }),
    clock:  () => wrap(`<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`),
    info:   () => wrap(`<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>`),
    star:   () => wrap(`<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`),
    download: () => wrap(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`),
    mail:   () => wrap(`<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>`),
    hourglass: () => wrap(`<path d="M6 2h12M6 22h12M6 2v6a6 6 0 0 0 12 0V2M6 22v-6a6 6 0 0 1 12 0v6"/>`),
    user:   () => wrap(`<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`),
    school: () => wrap(`<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>`),
    pool:   () => wrap(`<path d="M2 20c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1"/><path d="M2 16c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1"/><path d="M6 12V6a4 4 0 0 1 4-4M18 12V6a4 4 0 0 0-4-4"/>`),
    note:   () => wrap(`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>`),
  };
})();

// =============================================================
// MODAL HELPER — keyboard, click-outside, focus management
// =============================================================
const ModalHelper = {
  setup() {
    // Single global ESC listener — closes topmost modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal-backdrop.active');
        if (modals.length) {
          const top = modals[modals.length - 1];
          top.remove();
        }
      }
    });
    // Delegated click-outside to close
    document.addEventListener('mousedown', (e) => {
      if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
        e.target.classList.add('closing');
        setTimeout(() => e.target.remove(), 150);
      }
    });
  },
  focusFirst(modalEl) {
    if (!modalEl) return;
    const first = modalEl.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not(.modal-close)');
    if (first) requestAnimationFrame(() => first.focus());
  },
};

// =============================================================
// RIPPLE EFFECT — delegated, lightweight
// =============================================================
function setupRipple() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn, .icon-btn');
    if (!btn || btn.disabled) return;
    const rect = btn.getBoundingClientRect();
    btn.style.setProperty('--rx', (e.clientX - rect.left) + 'px');
    btn.style.setProperty('--ry', (e.clientY - rect.top) + 'px');
    btn.classList.remove('is-rippling');
    void btn.offsetWidth; // force reflow
    btn.classList.add('is-rippling');
    setTimeout(() => btn.classList.remove('is-rippling'), 600);
  });
}

// =============================================================
// SKELETON LOADER
// =============================================================
function renderSkeleton(tbodyId, cols = 7, rows = 5) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  let html = '';
  for (let i = 0; i < rows; i++) {
    let tds = '';
    for (let c = 0; c < cols; c++) {
      const w = 40 + Math.random() * 50;
      tds += `<td><div class="skel-bar" style="width:${w}%"></div></td>`;
    }
    html += `<tr class="skeleton-row">${tds}</tr>`;
  }
  tbody.innerHTML = html;
}

// =============================================================
// INIT
// =============================================================
document.addEventListener('DOMContentLoaded', async () => {
  Utils.mountNavbar('admin');
  const session = Auth.getSession();
  if (!session || session.role !== 'admin') { window.location.href = 'login.html'; return; }

  ModalHelper.setup();
  setupRipple();
  setupTabs();

  // Show skeletons immediately
  renderSkeleton('tbody-peserta', 7, 6);
  renderSkeleton('tbody-jadwal', 8, 6);
  renderSkeleton('tbody-berita', 5, 4);
  renderSkeleton('tbody-kehadiran', 7, 6);
  renderSkeleton('tbody-rapor', 6, 5);

  // Sinkronkan seluruh cache yang dibutuhkan panel admin dalam 1 gelombang,
  // lalu seluruh tab (Peserta/Jadwal/Kehadiran/Rapor/Berita) memakai data
  // lokal (Store) — tanpa request tambahan ke Apps Script tiap pindah tab.
  const refreshAllTabs = () => {
    loadPeserta(); loadJadwal(); loadKehadiran(); loadRapor(); loadBerita();
    updateStats();
  };
  await Sync.init(['Peserta', 'Jadwal', 'Kehadiran', 'Rapor', 'Berita', 'Pelatih', '__settings__'], refreshAllTabs);
  refreshAllTabs();
  setupFilters();

  // Menu Pengaturan (tema, tampilan jadwal/kehadiran, variabel nomor peserta).
  if (window.AdminSettings) AdminSettings.renderInto('admin-settings-root');
  document.addEventListener('admin:jadwalviewchange', () => applyJadwalFilters());
  document.addEventListener('admin:kehadiranviewchange', () => applyKehadiranFilters());
});

// =============================================================
// TABS
// =============================================================
function setupTabs() {
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => {
      x.classList.remove('active');
      x.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    t.setAttribute('aria-selected', 'true');
    document.getElementById('tab-' + t.dataset.tab).classList.add('active');
  }));
}

function setupFilters() {
  ['search-peserta', 'filter-kelas-peserta', 'filter-status-peserta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', applyPesertaFilters);
  });
  ['search-jadwal', 'filter-kelas-jadwal', 'filter-status-jadwal', 'filter-tipe-jadwal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', applyJadwalFilters);
  });
  ['search-berita'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', applyBeritaFilters);
  });
  ['search-kehadiran', 'filter-kelas-kehadiran', 'filter-status-kehadiran', 'filter-periode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', applyKehadiranFilters);
  });
  document.getElementById('filter-periode')?.addEventListener('change', loadKehadiran);
  // Rapor filters (req #13)
  const predikatSel = document.getElementById('filter-predikat-rapor');
  if (predikatSel && predikatSel.options.length <= 1) {
    predikatSel.insertAdjacentHTML('beforeend',
      CONFIG.PREDIKAT_OPTIONS.map(p => `<option value="${p}">${p}</option>`).join(''));
  }
  ['search-rapor', 'filter-status-rapor', 'filter-predikat-rapor', 'sort-rapor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', applyRaporFilters);
  });
}

function updateStats() {
  document.getElementById('stat-peserta').textContent = pesertaCache.length;
  document.getElementById('stat-jadwal').textContent = jadwalCache.length;
  document.getElementById('stat-kehadiran').textContent = kehadiranCache.length;
  document.getElementById('stat-pending').textContent = pesertaCache.filter(p => !Utils.formatBool(p.Status_Pembayaran).includes('TRUE')).length;
  renderTaskSection();
}

// =============================================================
// PESERTA
// =============================================================
function loadPeserta() {
  const res = BizLogic.getAllPeserta();
  if (!res.success) { Utils.notify(res.message, 'error'); return; }
  pesertaCache = res.data || [];
  pesertaListLunas = pesertaCache.filter(p => Utils.formatBool(p.Status_Pembayaran) === 'TRUE');
  applyPesertaFilters();
  applyRaporFilters();
  renderTaskSection();
}

function applyPesertaFilters() {
  const search = (document.getElementById('search-peserta')?.value || '').toLowerCase();
  const fKelas = document.getElementById('filter-kelas-peserta')?.value || 'all';
  const fStatus = document.getElementById('filter-status-peserta')?.value || 'all';
  let filtered = [...pesertaCache];
  if (search) filtered = filtered.filter(p =>
    String(p.Nama_Lengkap).toLowerCase().includes(search) ||
    String(p.Username).toLowerCase().includes(search) ||
    String(p.Nomor_Whatsapp).toLowerCase().includes(search)
  );
  if (fKelas !== 'all') filtered = filtered.filter(p => p.Kelas === fKelas);
  if (fStatus !== 'all') filtered = filtered.filter(p => {
    const isPaid = Utils.formatBool(p.Status_Pembayaran) === 'TRUE';
    return fStatus === 'paid' ? isPaid : !isPaid;
  });
  renderPeserta(filtered);
}

function renderPeserta(data) {
  const tbody = document.getElementById('tbody-peserta');
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">Tidak ada data peserta</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(p => {
    const isPaid = Utils.formatBool(p.Status_Pembayaran) === 'TRUE';
    const persenColor = p.persentase >= 75 ? 'success' : p.persentase >= 50 ? 'warning' : 'danger';
    return `<tr class="row-clickable" onclick="openPesertaDetailModal('${p.Id_Peserta}')">
      <td>${Utils.escapeHtml(p.Nama_Lengkap)}</td>
      <td>${p.Usia || '-'}</td>
      <td>${Utils.escapeHtml(p.Jenis_Kelamin) || '-'}</td>
      <td><span class="kelas-tag">${Utils.escapeHtml(p.Kelas) || '-'}</span></td>
      <td><span class="status-badge ${isPaid ? 'success' : 'warning'}">${isPaid ? Icons.check() + ' Lunas' : Icons.clock() + ' Belum'}</span></td>
      <td><div class="persen-cell"><div class="persen-bar ${persenColor}" style="width:${p.persentase}%;"></div><span>${p.persentase}%</span></div></td>
      <td onclick="event.stopPropagation();">
        <div class="action-btns">
          <button class="icon-btn edit" title="Edit peserta" aria-label="Edit peserta" onclick="openPesertaEditModal('${p.Id_Peserta}')">${Icons.pencil()}</button>
          <button class="icon-btn delete" title="Hapus peserta" aria-label="Hapus peserta" onclick="deletePesertaConfirm('${p.Id_Peserta}','${Utils.escapeHtml(p.Nama_Lengkap)}')">${Icons.trash()}</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openPesertaDetailModal(id) {
  const p = pesertaCache.find(x => x.Id_Peserta === id);
  if (!p) return;
  const isPaid = Utils.formatBool(p.Status_Pembayaran) === 'TRUE';
  const html = `
    <div class="modal-backdrop active" id="peserta-detail-modal">
      <div class="modal modal-md">
        <div class="modal-header">
          <h3>${Icons.user()} Detail Peserta</h3>
          <button class="modal-close" aria-label="Tutup" onclick="document.getElementById('peserta-detail-modal').remove()">${Icons.x()}</button>
        </div>
        <div class="modal-body">
          <div class="detail-grid">
            <div class="detail-section">
              <h4>${Icons.user()} Identitas</h4>
              <div class="detail-row"><span>Nama Lengkap</span><strong>${Utils.escapeHtml(p.Nama_Lengkap)}</strong></div>
              <div class="detail-row"><span>Username</span><strong>${Utils.escapeHtml(p.Username)}</strong></div>
              <div class="detail-row"><span>Nomor Peserta</span><strong>${Utils.escapeHtml(p.Nomor_Peserta) || '<em class="text-muted">belum diisi</em>'}</strong></div>
              <div class="detail-row"><span>Jenis Kelamin</span><strong>${Utils.escapeHtml(p.Jenis_Kelamin) || '-'}</strong></div>
              <div class="detail-row"><span>Tempat Lahir</span><strong>${Utils.escapeHtml(p.Tempat_Lahir) || '-'}</strong></div>
              <div class="detail-row"><span>Tanggal Lahir</span><strong>${Utils.formatDate(p.Tanggal_Lahir)}</strong></div>
              <div class="detail-row"><span>Usia</span><strong>${p.Usia || '-'} tahun</strong></div>
              <div class="detail-row"><span>Kelompok Umur</span><strong>${Utils.escapeHtml(p.Kelompok_Umur) || '-'}</strong></div>
              <div class="detail-row"><span>NISN</span><strong>${Utils.escapeHtml(p.NISNAS) || '-'}</strong></div>
              <div class="detail-row"><span>WhatsApp</span><strong>${Utils.escapeHtml(p.Nomor_Whatsapp)}</strong></div>
            </div>
            <div class="detail-section">
              <h4>${Icons.school()} Sekolah</h4>
              <div class="detail-row"><span>Asal Sekolah</span><strong>${Utils.escapeHtml(p.Asal_Sekolah) || '-'}</strong></div>
              <div class="detail-row"><span>Kelas Sekolah</span><strong>${Utils.escapeHtml(p.Kelas_Sekolah) || '-'}</strong></div>
              <div class="detail-row"><span>Wali Kelas</span><strong>${Utils.escapeHtml(p.Wali_Kelas) || '-'}</strong></div>
            </div>
            <div class="detail-section">
              <h4>${Icons.pool()} Pelatihan</h4>
              <div class="detail-row"><span>Kelas</span><strong>${Utils.escapeHtml(p.Kelas)}</strong></div>
              <div class="detail-row"><span>Mulai</span><strong>${Utils.formatDate(p.Tanggal_Mulai)}</strong></div>
              <div class="detail-row"><span>Berakhir</span><strong>${Utils.formatDate(p.Tanggal_Akhir)}</strong></div>
              <div class="detail-row"><span>Pembayaran</span><strong><span class="status-badge ${isPaid ? 'success' : 'warning'}">${isPaid ? Icons.check() + ' Lunas' : Icons.clock() + ' Belum'}</span></strong></div>
              <div class="detail-row"><span>Total Jadwal</span><strong>${p.total_jadwal}</strong></div>
              <div class="detail-row"><span>Total Hadir</span><strong>${p.total_hadir}</strong></div>
              <div class="detail-row"><span>Persentase</span><strong>${p.persentase}%</strong></div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('peserta-detail-modal').remove()">Tutup</button>
          <button class="btn btn-primary btn-icon" onclick="document.getElementById('peserta-detail-modal').remove(); openPesertaEditModal('${id}')">${Icons.pencil()} <span>Edit Data</span></button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  ModalHelper.focusFirst(document.getElementById('peserta-detail-modal'));
}

function openPesertaEditModal(id) {
  const p = pesertaCache.find(x => x.Id_Peserta === id);
  if (!p) return;
  const isPaid = Utils.formatBool(p.Status_Pembayaran) === 'TRUE';
  const kelasOpts = CONFIG.KELAS_OPTIONS.map(k => `<option value="${k}" ${p.Kelas === k ? 'selected' : ''}>${k}</option>`).join('');
  const ro = (v) => Utils.escapeHtml(v) || '<em class="text-muted">-</em>';
  const html = `
    <div class="modal-backdrop active" id="peserta-edit-modal">
      <div class="modal modal-md">
        <div class="modal-header">
          <h3>${Icons.pencil()} Edit Data Pelatihan</h3>
          <button class="modal-close" aria-label="Tutup" onclick="document.getElementById('peserta-edit-modal').remove()">${Icons.x()}</button>
        </div>
        <div class="modal-body">
          <div class="info-banner">${Icons.info()}
            <p>Demi keamanan pengguna, Admin tidak dapat mengubah <strong>data diri peserta.</strong></p>
          </div>

          <h4 class="form-section-title">${Icons.user()} Data Diri <span class="lock-note"> (Hanya peserta yang dapat mengubah data ini)</span></h4>
          <div class="form-grid-2">
            <div class="form-group"><label>Nama Lengkap</label><div class="readonly-field">${ro(p.Nama_Lengkap)}</div></div>
            <div class="form-group"><label>Username</label><div class="readonly-field">${ro(p.Username)}</div></div>
            <div class="form-group"><label>WhatsApp</label><div class="readonly-field">${ro(p.Nomor_Whatsapp)}</div></div>
            <div class="form-group"><label>Jenis Kelamin</label><div class="readonly-field">${ro(p.Jenis_Kelamin)}</div></div>
            <div class="form-group"><label>Tanggal Lahir</label><div class="readonly-field">${Utils.formatDate(p.Tanggal_Lahir)}</div></div>
            <div class="form-group"><label>Asal Sekolah</label><div class="readonly-field">${ro(p.Asal_Sekolah)}</div></div>
            </div>
            
            <h4 class="form-section-title" style="margin-top:18px;">${Icons.pool()} Data Pelatihan <span class="lock-note"> (Admin dapat mengubah data berikut)</span></h4>
            <div class="form-grid-2">
            <div class="form-group"><label>Grup Renang *</label><select id="e-kelas" class="form-control">${kelasOpts}</select></div>
            <div class="form-group"><label>Nomor Peserta ${isPaid ? '*' : ''}</label><input id="e-nomor" class="form-control" value="${Utils.escapeHtml(p.Nomor_Peserta || '')}" placeholder="Contoh: 001 / A12" inputmode="numeric"></div>
            <div class="form-group"><label>NISNAS</label><div class="readonly-field">${ro(p.NISNAS)}</div></div>
            <div class="form-group"><label>Tanggal Mulai</label><input id="e-mulai" class="form-control" type="date" value="${Utils.formatDateInput(p.Tanggal_Mulai)}"></div>
            <div class="form-group"><label>Tanggal Akhir</label><input id="e-akhir" class="form-control" type="date" value="${Utils.formatDateInput(p.Tanggal_Akhir)}"></div>
            <div class="form-group"><label>Status Pembayaran</label><select id="e-bayar" class="form-control"><option value="false" ${!isPaid ? 'selected' : ''}>Belum Lunas</option><option value="true" ${isPaid ? 'selected' : ''}>Lunas</option></select></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('peserta-edit-modal').remove()">Batal</button>
          <button class="btn btn-primary" onclick="savePeserta('${id}')">Simpan Perubahan</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  ModalHelper.focusFirst(document.getElementById('peserta-edit-modal'));
}

async function savePeserta(id) {
  const wantLunas = document.getElementById('e-bayar').value === 'true';
  const nomorPeserta = document.getElementById('e-nomor').value.trim();

  // GUARD (client): tidak boleh LUNAS tanpa Nomor Peserta
  if (wantLunas && !nomorPeserta) {
    showAlertModal(
      'Nomor Peserta Wajib Diisi',
      'Anda tidak dapat menyimpan status pembayaran <strong>LUNAS</strong> tanpa mengisi <strong>Nomor Peserta</strong> terlebih dahulu. Mohon lengkapi kolom Nomor Peserta.'
    );
    const el = document.getElementById('e-nomor');
    if (el) { el.focus(); el.classList.add('input-error'); }
    return;
  }

  // Hanya field yang BOLEH diubah admin yang dikirim (req #11).
  const payload = {
    id: id,
    kelas: document.getElementById('e-kelas').value,
    tanggal_mulai: document.getElementById('e-mulai').value,
    tanggal_akhir: document.getElementById('e-akhir').value,
    nomor_peserta: nomorPeserta,
    status_pembayaran: wantLunas
  };

  const res = await BizLogic.updatePeserta(payload);
  if (res.success) {
    Utils.notify(res.message, 'success', 5000);
    document.getElementById('peserta-edit-modal').remove();
    loadPeserta();
    loadJadwal();
    updateStats();
  } else if (res.code === 'NOMOR_PESERTA_REQUIRED') {
    showAlertModal('Nomor Peserta Wajib Diisi', Utils.escapeHtml(res.message));
  } else Utils.notify(res.message, 'error');
}

/** Modal peringatan/alert sederhana (UX lebih baik daripada alert() bawaan). */
function showAlertModal(title, htmlMessage) {
  const existing = document.getElementById('alert-modal');
  if (existing) existing.remove();
  const html = `
    <div class="modal-backdrop active" id="alert-modal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>${Icons.info()} ${Utils.escapeHtml(title)}</h3>
          <button class="modal-close" aria-label="Tutup" onclick="document.getElementById('alert-modal').remove()">${Icons.x()}</button>
        </div>
        <div class="modal-body"><p style="font-size:15px;line-height:1.55;">${htmlMessage}</p></div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="document.getElementById('alert-modal').remove()">Mengerti</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function deletePesertaConfirm(id, nama) {
  const ok = await Utils.confirm(`Hapus peserta <strong>${nama}</strong>?<br>Data akan hilang permanen.`);
  if (!ok) return;
  Utils.showLoader(true);
  const res = await BizLogic.deletePeserta({ id });
  Utils.showLoader(false);
  if (res.success) { Utils.notify(res.message, 'success'); loadPeserta(); updateStats(); }
  else Utils.notify(res.message, 'error');
}

// =============================================================
// JADWAL
// =============================================================
function loadJadwal() {
  const res = BizLogic.getAllJadwal();
  if (!res.success) { Utils.notify(res.message, 'error'); return; }
  jadwalCache = res.data || [];
  applyJadwalFilters();
  renderTaskSection();
}

function applyJadwalFilters() {
  const search = (document.getElementById('search-jadwal')?.value || '').toLowerCase();
  const fKelas = document.getElementById('filter-kelas-jadwal')?.value || 'all';
  const fStatus = document.getElementById('filter-status-jadwal')?.value || 'all';
  const fTipe = document.getElementById('filter-tipe-jadwal')?.value || 'all';
  let filtered = [...jadwalCache];
  if (search) filtered = filtered.filter(j =>
    String(j.Tanggal).toLowerCase().includes(search) ||
    String(j.Lokasi).toLowerCase().includes(search) ||
    String(j.Pukul).toLowerCase().includes(search) ||
    String(j.nama_peserta_personal || '').toLowerCase().includes(search)
  );
  if (fKelas !== 'all') filtered = filtered.filter(j => j.Kelas === fKelas);
  if (fStatus !== 'all') filtered = filtered.filter(j => j.Status === fStatus);
  if (fTipe === 'kelas') filtered = filtered.filter(j => !j.is_personal);
  if (fTipe === 'personal') filtered = filtered.filter(j => j.is_personal);
  // Urutkan berdasarkan jadwal yang waktunya PALING DEKAT dengan hari ini (bisa lampau/mendatang),
  // bukan berdasarkan urutan dibuat atau tanggal terjauh (mis. jadwal tahun depan yang baru dibuat sistem).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  filtered.sort((a, b) => Math.abs(new Date(a.Tanggal) - today) - Math.abs(new Date(b.Tanggal) - today));
  renderJadwal(filtered);
}

function renderJadwal(data) {
  const mode = (window.AdminSettings && AdminSettings.getJadwalView()) || 'list';
  const tableWrap = document.getElementById('jadwal-table-wrap');
  const calWrap = document.getElementById('jadwal-calendar-view');
  if (mode === 'calendar') {
    if (tableWrap) tableWrap.hidden = true;
    if (calWrap) calWrap.hidden = false;
    renderJadwalCalendar(data);
  } else {
    if (calWrap) calWrap.hidden = true;
    if (tableWrap) tableWrap.hidden = false;
    renderJadwalTable(data);
  }
}

function renderJadwalTable(data) {
  const tbody = document.getElementById('tbody-jadwal');
  if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">Tidak ada jadwal</td></tr>`; return; }
  tbody.innerHTML = data.map(j => `
    <tr>
      <td>${Utils.formatDate(j.Tanggal)}</td>
      <td>${Utils.escapeHtml(j.Pukul)}</td>
      <td><span class="kelas-tag">${Utils.escapeHtml(j.Kelas) || '-'}</span></td>
      <td>${j.is_personal ? `<span class="status-badge personal">${Icons.star()} Personal</span>` : `<span class="status-badge info">${Icons.user()} Kelas</span>`}</td>
      <td>${Utils.escapeHtml(j.Lokasi)}</td>
      <td><span class="status-badge ${String(j.Status).toLowerCase()}">${j.Status}</span></td>
      <td>
        <div class="action-btns">
          <button class="icon-btn view" title="Lihat peserta absen" aria-label="Lihat peserta" onclick="openAttendeesModal('${j.Id_Jadwal}')">${Icons.eye()}</button>
          <button class="icon-btn edit" title="Edit jadwal" aria-label="Edit jadwal" onclick="openJadwalEditModal('${j.Id_Jadwal}')">${Icons.pencil()}</button>
          <button class="icon-btn delete" title="Hapus jadwal" aria-label="Hapus jadwal" onclick="deleteJadwalConfirm('${j.Id_Jadwal}')">${Icons.trash()}</button>
        </div>
      </td>
    </tr>`).join('');
}

// ---- Calendar view (admin jadwal) ----
let jadwalCalCursor = null; // bulan yang sedang ditampilkan (Date, tgl 1)

function renderJadwalCalendar(data) {
  const wrap = document.getElementById('jadwal-calendar-view');
  if (!wrap) return;

  // Default ke bulan dengan jadwal terdekat dari hari ini (atau bulan ini).
  if (!jadwalCalCursor) {
    const today = new Date(); today.setDate(1); today.setHours(0, 0, 0, 0);
    jadwalCalCursor = today;
  }

  const year = jadwalCalCursor.getFullYear();
  const month = jadwalCalCursor.getMonth();
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  // Kelompokkan jadwal per tanggal (ISO).
  const byDate = {};
  data.forEach(j => {
    const iso = Utils.formatDateInput(j.Tanggal);
    if (!iso) return;
    (byDate[iso] = byDate[iso] || []).push(j);
  });

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 0=Min
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = Utils.formatDateInput(new Date());
  const dayLabels = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  let cells = '';
  for (let i = 0; i < startWeekday; i++) cells += `<div class="cal-cell cal-cell--empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const items = (byDate[iso] || []).sort((a, b) => String(a.Pukul).localeCompare(String(b.Pukul)));
    const chips = items.slice(0, 4).map(j => {
      const st = String(j.Status || '').toLowerCase();
      const label = `${Utils.escapeHtml(j.Kelas || (j.is_personal ? 'Personal' : '-'))} · ${Utils.escapeHtml(j.Pukul || '')}`;
      return `<button type="button" class="cal-chip ${st}" title="${label} — ${Utils.escapeHtml(j.Lokasi || '')}" onclick="openJadwalEditModal('${j.Id_Jadwal}')">${label}</button>`;
    }).join('');
    const more = items.length > 4 ? `<span class="cal-more">+${items.length - 4} lagi</span>` : '';
    cells += `<div class="cal-cell ${iso === todayIso ? 'is-today' : ''} ${items.length ? 'has-items' : ''}">
        <div class="cal-date">${d}</div>
        <div class="cal-chips">${chips}${more}</div>
      </div>`;
  }

  wrap.innerHTML = `
    <div class="cal-header">
      <button type="button" class="icon-btn" id="cal-prev" aria-label="Bulan sebelumnya">‹</button>
      <h3 class="cal-title">${monthNames[month]} ${year}</h3>
      <button type="button" class="icon-btn" id="cal-next" aria-label="Bulan berikutnya">›</button>
      <button type="button" class="btn btn-secondary btn-sm" id="cal-today">Hari ini</button>
    </div>
    <div class="cal-weekdays">${dayLabels.map(l => `<div>${l}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-legend">
      <span><i class="dot aktif"></i> Aktif</span>
      <span><i class="dot pending"></i> Pending</span>
      <span><i class="dot cancel"></i> Cancel</span>
    </div>`;

  wrap.querySelector('#cal-prev').addEventListener('click', () => { jadwalCalCursor = new Date(year, month - 1, 1); applyJadwalFilters(); });
  wrap.querySelector('#cal-next').addEventListener('click', () => { jadwalCalCursor = new Date(year, month + 1, 1); applyJadwalFilters(); });
  wrap.querySelector('#cal-today').addEventListener('click', () => { const t = new Date(); jadwalCalCursor = new Date(t.getFullYear(), t.getMonth(), 1); applyJadwalFilters(); });
}

function openJadwalModal() {
  const statusOpts = CONFIG.STATUS_JADWAL.map(s => `<option value="${s}">${s}</option>`).join('');
  const locs = CONFIG.LOCATIONS.map(l => `<option value="${l.name}">${l.name}</option>`).join('');
  const html = `
    <div class="modal-backdrop active" id="jadwal-modal">
      <div class="modal modal-md">
        <div class="modal-header">
          <h3>${Icons.plus()} Tambah Jadwal Personal</h3>
          <button class="modal-close" aria-label="Tutup" onclick="document.getElementById('jadwal-modal').remove()">${Icons.x()}</button>
        </div>
        <div class="modal-body">
          <div class="info-banner">${Icons.info()}
            <p><strong>Jadwal Personal:</strong> Digunakan untuk menambahkan jadwal khusus <strong>diluar pelatihan kelas</strong></p>
          </div>
          <div class="form-group">
            <label>Peserta * <span class="text-muted" id="j-peserta-count">(0 dipilih)</span></label>
            <div class="peserta-picker" id="j-peserta-picker">
              <div class="peserta-picker__chips" id="j-peserta-chips"></div>
              <div class="search-wrap" style="width:100%;">
                <svg class="ic search-ic" aria-hidden="true"><use href="#ic-search"/></svg>
                <input type="text" id="j-peserta-search" class="search-input" autocomplete="off"
                  placeholder="Ketik nama peserta untuk mencari..." aria-label="Cari peserta">
              </div>
              <div class="peserta-picker__dropdown" id="j-peserta-dropdown"></div>
            </div>
          </div>
          <div class="form-grid-2">
            <div class="form-group"><label>Tanggal *</label><input id="j-tanggal" class="form-control" type="date"></div>
            <div class="form-group"><label>Pukul *</label><input id="j-pukul" class="form-control" placeholder="contoh: 16:00 - 18:00"></div>
            <div class="form-group"><label>Lokasi *</label><select id="j-lokasi" class="form-control">${locs}</select></div>
            <div class="form-group"><label>Status *</label><select id="j-status" class="form-control">${statusOpts}</select></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('jadwal-modal').remove()">Batal</button>
          <button class="btn btn-primary" onclick="saveJadwalNew()">Simpan</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  PesertaPicker.init();
  ModalHelper.focusFirst(document.getElementById('jadwal-modal'));
}

/* =============================================================
   PESERTA PICKER (req #10) — searchable, no-duplicate, no manual entry.
   Hanya bisa memilih peserta LUNAS dari database (pesertaListLunas).
   ============================================================= */
const PesertaPicker = {
  selected: [],   // array of {id, nama, kelas}
  activeIndex: -1,
  _filtered: [],

  init() {
    this.selected = [];
    this.activeIndex = -1;
    const search = document.getElementById('j-peserta-search');
    const dropdown = document.getElementById('j-peserta-dropdown');
    if (!search || !dropdown) return;

    search.addEventListener('input', () => this.renderDropdown(search.value));
    search.addEventListener('focus', () => this.renderDropdown(search.value));
    search.addEventListener('keydown', (e) => this.onKey(e));
    // Tutup dropdown saat klik di luar
    document.addEventListener('mousedown', this._outside = (e) => {
      const picker = document.getElementById('j-peserta-picker');
      if (picker && !picker.contains(e.target)) dropdown.classList.remove('show');
    });
    this.renderChips();
  },

  available(query) {
    const q = (query || '').trim().toLowerCase();
    const chosen = new Set(this.selected.map(s => s.id));
    return pesertaListLunas
      .filter(p => !chosen.has(p.Id_Peserta))
      .filter(p => !q || String(p.Nama_Lengkap).toLowerCase().includes(q) || String(p.Kelas).toLowerCase().includes(q))
      .slice(0, 50);
  },

  renderDropdown(query) {
    const dropdown = document.getElementById('j-peserta-dropdown');
    if (!dropdown) return;
    this._filtered = this.available(query);
    this.activeIndex = -1;
    if (this._filtered.length === 0) {
      const msg = (query && query.trim())
        ? 'Tidak ditemukan data peserta tersebut'
        : 'Semua peserta lunas sudah dipilih';
      dropdown.innerHTML = `<div class="peserta-option peserta-option--empty">${msg}</div>`;
    } else {
      dropdown.innerHTML = this._filtered.map((p, i) =>
        `<div class="peserta-option" data-i="${i}" onmousedown="event.preventDefault();PesertaPicker.pick(${i})">
           <span>${Utils.escapeHtml(p.Nama_Lengkap)}</span><small>${Utils.escapeHtml(p.Kelas) || '-'}</small>
         </div>`).join('');
    }
    dropdown.classList.add('show');
  },

  onKey(e) {
    const dropdown = document.getElementById('j-peserta-dropdown');
    const opts = dropdown ? dropdown.querySelectorAll('.peserta-option:not(.peserta-option--empty)') : [];
    if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1, opts); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1, opts); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.activeIndex >= 0 && this._filtered[this.activeIndex]) this.pick(this.activeIndex);
    } else if (e.key === 'Escape') { dropdown.classList.remove('show'); }
  },

  move(dir, opts) {
    if (!opts.length) return;
    this.activeIndex = (this.activeIndex + dir + opts.length) % opts.length;
    opts.forEach((o, i) => o.classList.toggle('active', i === this.activeIndex));
    opts[this.activeIndex].scrollIntoView({ block: 'nearest' });
  },

  pick(i) {
    const p = this._filtered[i];
    if (!p) return;
    if (this.selected.some(s => s.id === p.Id_Peserta)) return; // guard duplikat
    this.selected.push({ id: p.Id_Peserta, nama: p.Nama_Lengkap, kelas: p.Kelas });
    const search = document.getElementById('j-peserta-search');
    if (search) { search.value = ''; search.focus(); }
    this.renderChips();
    this.renderDropdown('');
  },

  remove(id) {
    this.selected = this.selected.filter(s => s.id !== id);
    this.renderChips();
  },

  renderChips() {
    const chips = document.getElementById('j-peserta-chips');
    const count = document.getElementById('j-peserta-count');
    if (!chips) return;
    chips.innerHTML = this.selected.map(s =>
      `<span class="peserta-chip">${Utils.escapeHtml(s.nama)}
         <button type="button" aria-label="Hapus ${Utils.escapeHtml(s.nama)}" onclick="PesertaPicker.remove('${s.id}')">${Icons.x()}</button>
       </span>`).join('');
    if (count) count.textContent = `(${this.selected.length} dipilih)`;
  },

  ids() { return this.selected.map(s => s.id); }
};

async function saveJadwalNew() {
  const session = Auth.getSession();
  const ids = PesertaPicker.ids();
  const tanggal = document.getElementById('j-tanggal').value;
  const pukul = document.getElementById('j-pukul').value.trim();
  const lokasi = document.getElementById('j-lokasi').value;
  const status = document.getElementById('j-status').value;

  if (ids.length === 0) { Utils.notify('Mohon pilih minimal 1 peserta dari daftar', 'warning'); return; }
  if (!tanggal || !pukul || !lokasi) { Utils.notify('Mohon lengkapi tanggal, pukul, dan lokasi', 'warning'); return; }

  const res = await BizLogic.createJadwalBatch({
    id_pelatih: session.data.id, peserta: ids, tanggal, pukul, lokasi, status
  });
  if (res.success) {
    Utils.notify(res.message, 'success');
    document.getElementById('jadwal-modal').remove();
    loadJadwal(); updateStats();
  } else Utils.notify(res.message, 'error');
}

function openJadwalEditModal(id) {
  const j = jadwalCache.find(x => x.Id_Jadwal === id);
  if (!j) return;
  const statusOpts = CONFIG.STATUS_JADWAL.map(s => `<option value="${s}" ${j.Status === s ? 'selected' : ''}>${s}</option>`).join('');
  const html = `
    <div class="modal-backdrop active" id="jadwal-edit-modal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>${Icons.pencil()} Edit Jadwal ${j.is_personal ? '(Personal)' : '(Kelas)'}</h3>
          <button class="modal-close" aria-label="Tutup" onclick="document.getElementById('jadwal-edit-modal').remove()">${Icons.x()}</button>
        </div>
        <div class="modal-body">
          ${j.is_personal ? `<div class="info-banner">${Icons.star()}<p>Jadwal personal untuk: <strong>${Utils.escapeHtml(j.nama_peserta_personal)}</strong></p></div>` : ''}
          <div class="form-grid-2">
            <div class="form-group"><label>Tanggal</label><input id="je-tanggal" class="form-control" type="date" value="${Utils.formatDateInput(j.Tanggal)}"></div>
            <div class="form-group"><label>Pukul</label><input id="je-pukul" class="form-control" value="${Utils.escapeHtml(j.Pukul)}"></div>
            <div class="form-group"><label>Lokasi</label><input id="je-lokasi" class="form-control" value="${Utils.escapeHtml(j.Lokasi)}"></div>
            <div class="form-group"><label>Status</label><select id="je-status" class="form-control">${statusOpts}</select></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('jadwal-edit-modal').remove()">Batal</button>
          <button class="btn btn-primary" onclick="saveJadwalEdit('${id}')">Simpan</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  ModalHelper.focusFirst(document.getElementById('jadwal-edit-modal'));
}

async function saveJadwalEdit(id) {
  const payload = {
    id,
    tanggal: document.getElementById('je-tanggal').value,
    pukul: document.getElementById('je-pukul').value.trim(),
    lokasi: document.getElementById('je-lokasi').value.trim(),
    status: document.getElementById('je-status').value
  };
  Utils.showLoader(true);
  const res = await BizLogic.updateJadwal(payload);
  Utils.showLoader(false);
  if (res.success) {
    Utils.notify(res.message, 'success');
    document.getElementById('jadwal-edit-modal').remove();
    loadJadwal();
  } else Utils.notify(res.message, 'error');
}

async function deleteJadwalConfirm(id) {
  const ok = await Utils.confirm('Hapus jadwal ini?');
  if (!ok) return;
  Utils.showLoader(true);
  const res = await BizLogic.deleteJadwal({ id });
  Utils.showLoader(false);
  if (res.success) { Utils.notify(res.message, 'success'); loadJadwal(); updateStats(); }
  else Utils.notify(res.message, 'error');
}

function openAttendeesModal(idJadwal) {
  const res = BizLogic.getJadwalAttendees({ id_jadwal: idJadwal });
  if (!res.success) { Utils.notify(res.message, 'error'); return; }
  const { data, jadwal } = res;
  const stats = {
    hadir: data.filter(d => d.status === 'hadir').length,
    izin: data.filter(d => d.status === 'izin').length,
    belum: data.filter(d => d.status === 'belum').length
  };
  const html = `
    <div class="modal-backdrop active" id="attendees-modal">
      <div class="modal modal-md">
        <div class="modal-header">
          <h3>${Icons.eye()} Peserta Jadwal ${jadwal.is_personal ? '(Personal)' : ''}</h3>
          <button class="modal-close" aria-label="Tutup" onclick="document.getElementById('attendees-modal').remove()">${Icons.x()}</button>
        </div>
        <div class="modal-body">
          <div class="attendees-info">${Utils.formatDate(jadwal.Tanggal)} • ${Utils.escapeHtml(jadwal.Pukul)} • ${Utils.escapeHtml(jadwal.Lokasi)} • <span class="kelas-tag">${Utils.escapeHtml(jadwal.Kelas)}</span></div>
          <div class="attendees-stats">
            <div class="attendees-stat success"><span>${stats.hadir}</span><label>Hadir</label></div>
            <div class="attendees-stat warning"><span>${stats.izin}</span><label>Izin</label></div>
            <div class="attendees-stat muted"><span>${stats.belum}</span><label>Belum</label></div>
          </div>
          <ul class="attendees-list">
            ${data.map(d => `<li class="attendees-item status-${d.status}"><div><strong>${Utils.escapeHtml(d.nama)}</strong>${d.catatan ? `<small>${Utils.escapeHtml(d.catatan)}</small>` : ''}</div><span class="status-badge ${d.status}">${d.status === 'hadir' ? Icons.check() + ' Hadir' : d.status === 'izin' ? Icons.mail() + ' Izin' : Icons.clock() + ' Belum'}</span></li>`).join('')}
          </ul>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('attendees-modal').remove()">Tutup</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

// =============================================================
// BERITA
// =============================================================
function loadBerita() {
  const res = BizLogic.getAllBerita();
  if (!res.success) { Utils.notify(res.message, 'error'); return; }
  beritaCache = res.data || [];
  applyBeritaFilters();
}

function applyBeritaFilters() {
  const search = (document.getElementById('search-berita')?.value || '').toLowerCase();
  let filtered = [...beritaCache];
  if (search) filtered = filtered.filter(b =>
    String(b.Judul).toLowerCase().includes(search) ||
    String(b.Deskripsi || '').toLowerCase().includes(search)
  );
  renderBerita(filtered);
}

function renderBerita(data) {
  const tbody = document.getElementById('tbody-berita');
  if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">Belum ada berita</td></tr>`; return; }
  const statusClass = (s) => {
    const v = String(s || 'Publik');
    if (v === 'Publik') return 'success';
    if (v === 'Semua Peserta') return 'info';
    return 'personal';
  };
  tbody.innerHTML = data.map(b => `
    <tr>
      <td>${Utils.formatDate(b.Tanggal)}</td>
      <td>${Utils.escapeHtml(b.Judul)}</td>
      <td class="truncate-cell">${Utils.escapeHtml((b.Deskripsi || '').substring(0, 80))}${(b.Deskripsi || '').length > 80 ? '…' : ''}</td>
      <td><span class="status-badge ${statusClass(b.Status)}">${Utils.escapeHtml(b.Status || 'Publik')}</span></td>
      <td>${b.Link ? `<a href="${Utils.escapeHtml(b.Link)}" target="_blank" rel="noopener">${Icons.link()} Buka</a>` : '<em class="text-muted">-</em>'}</td>
      <td>
        <div class="action-btns">
          <button class="icon-btn edit" title="Edit berita" aria-label="Edit berita" onclick="openBeritaModal('${b.Id_Berita}')">${Icons.pencil()}</button>
          <button class="icon-btn delete" title="Hapus berita" aria-label="Hapus berita" onclick="deleteBeritaConfirm('${b.Id_Berita}','${Utils.escapeHtml(b.Judul)}')">${Icons.trash()}</button>
        </div>
      </td>
    </tr>`).join('');
}

function openBeritaModal(id) {
  const b = id ? beritaCache.find(x => x.Id_Berita === id) : null;
  const html = `
    <div class="modal-backdrop active" id="berita-modal">
      <div class="modal modal-md">
        <div class="modal-header">
          <h3>${b ? Icons.pencil() + ' Edit Berita' : Icons.plus() + ' Tambah Berita'}</h3>
          <button class="modal-close" aria-label="Tutup" onclick="document.getElementById('berita-modal').remove()">${Icons.x()}</button>
        </div>
        <div class="modal-body">
          <div class="form-group"><label>Judul *</label><input id="b-judul" class="form-control" value="${b ? Utils.escapeHtml(b.Judul) : ''}" placeholder="Contoh: Lomba Renang Kaltim 2025"></div>
          <div class="form-group"><label>Tanggal *</label><input id="b-tanggal" class="form-control" type="date" value="${b ? Utils.formatDateInput(b.Tanggal) : Utils.formatDateInput(new Date())}"></div>
          <div class="form-group"><label>Deskripsi *</label><textarea id="b-desc" class="form-control" rows="4" placeholder="Ringkasan berita atau informasi penting...">${b ? Utils.escapeHtml(b.Deskripsi || '') : ''}</textarea></div>
          <div class="form-group">
            <label>Target Audiens *</label>
            <select id="b-status" class="form-control">
              ${['Publik', 'Semua Peserta', 'Peserta Grup A', 'Peserta Grup B', 'Peserta Grup C']
                .map(s => `<option value="${s}" ${(b ? (b.Status || 'Publik') : 'Publik') === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Link (URL Sumber)</label><input id="b-link" class="form-control" type="url" value="${b ? Utils.escapeHtml(b.Link || '') : ''}" placeholder="https://..."></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('berita-modal').remove()">Batal</button>
          <button class="btn btn-primary" onclick="saveBerita('${id || ''}')">${b ? 'Simpan Perubahan' : 'Buat Berita'}</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  ModalHelper.focusFirst(document.getElementById('berita-modal'));
}

async function saveBerita(id) {
  const judul = document.getElementById('b-judul').value.trim();
  const tanggal = document.getElementById('b-tanggal').value;
  const deskripsi = document.getElementById('b-desc').value.trim();
  const status = document.getElementById('b-status').value || 'Publik';
  const link = document.getElementById('b-link').value.trim();
  if (!judul || !tanggal || !deskripsi) { Utils.notify('Judul, tanggal, dan deskripsi wajib diisi', 'warning'); return; }
  Utils.showLoader(true);
  const payload = { judul, tanggal, deskripsi, link, status };
  if (id) payload.id = id;
  const res = id ? await BizLogic.updateBerita(payload) : await BizLogic.createBerita(payload);
  Utils.showLoader(false);
  if (res.success) {
    Utils.notify(res.message, 'success');
    document.getElementById('berita-modal').remove();
    loadBerita();
  } else Utils.notify(res.message, 'error');
}

async function deleteBeritaConfirm(id, judul) {
  const safeJudul = Utils.escapeHtml(judul);
  const ok = await Utils.confirm(
    `Hapus berita <strong>"${safeJudul}"</strong>?`
  );
  if (!ok) return;
  Utils.showLoader(true);
  const res = await BizLogic.deleteBerita({ id });
  Utils.showLoader(false);
  if (res.success) {
    Utils.notify(res.message, 'success');
    loadBerita();
  } else {
    Utils.notify(res.message, 'error');
  }
}

// =============================================================
// KEHADIRAN + EXPORT EXCEL
// =============================================================
function loadKehadiran() {
  const periode = document.getElementById('filter-periode')?.value || 'all';
  const res = BizLogic.getAllKehadiran({ periode });
  if (!res.success) { Utils.notify(res.message, 'error'); return; }
  kehadiranCache = res.data || [];
  applyKehadiranFilters();
  updateStats();
}

function applyKehadiranFilters() {
  const search = (document.getElementById('search-kehadiran')?.value || '').toLowerCase();
  const fKelas = document.getElementById('filter-kelas-kehadiran')?.value || 'all';
  const fStatus = document.getElementById('filter-status-kehadiran')?.value || 'all';
  let filtered = [...kehadiranCache];
  if (search) filtered = filtered.filter(k => String(k.nama_peserta).toLowerCase().includes(search));
  if (fKelas !== 'all') filtered = filtered.filter(k => k.kelas === fKelas);
  if (fStatus !== 'all') filtered = filtered.filter(k => k.status_label === fStatus);
  filtered.sort((a, b) => new Date(b.tanggal_raw) - new Date(a.tanggal_raw));
  renderKehadiran(filtered);
}

function renderKehadiran(data) {
  const mode = (window.AdminSettings && AdminSettings.getKehadiranView()) || 'list';
  const tableWrap = document.getElementById('kehadiran-table-wrap');
  const pivotWrap = document.getElementById('kehadiran-pivot-view');
  if (mode === 'table') {
    if (tableWrap) tableWrap.hidden = true;
    if (pivotWrap) pivotWrap.hidden = false;
    renderKehadiranPivot(data);
  } else {
    if (pivotWrap) pivotWrap.hidden = true;
    if (tableWrap) tableWrap.hidden = false;
    renderKehadiranList(data);
  }
}

function renderKehadiranList(data) {
  const tbody = document.getElementById('tbody-kehadiran');
  if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">Tidak ada data kehadiran</td></tr>`; return; }
  tbody.innerHTML = data.map(k => `
    <tr>
      <td>${k.tanggal}</td>
      <td>${Utils.escapeHtml(k.nama_peserta)}</td>
      <td><span class="kelas-tag">${Utils.escapeHtml(k.kelas)}</span></td>
      <td>${Utils.escapeHtml(k.pukul)}</td>
      <td><span class="status-badge ${k.status_label}">${k.status_label === 'hadir' ? Icons.check() + ' Hadir' : Icons.mail() + ' Izin'}</span></td>
      <td>${Utils.escapeHtml(k.Catatan || '-')}</td>
      <td>
        <div class="action-btns">
          <button class="icon-btn delete" title="Hapus kehadiran" aria-label="Hapus kehadiran" onclick="deleteKehadiranConfirm('${k.Id_Kehadiran}')">${Icons.trash()}</button>
        </div>
      </td>
    </tr>`).join('');
}

/**
 * Tampilan TABEL kehadiran (mengikuti format download Excel):
 * baris = peserta, kolom = tanggal, sel = H (hadir) / I (izin).
 * Dibangun dari data kehadiran yang sedang ditampilkan (hasil filter).
 */
function renderKehadiranPivot(data) {
  const wrap = document.getElementById('kehadiran-pivot-view');
  if (!wrap) return;
  if (!data || data.length === 0) {
    UI.emptyState(wrap, { title: 'Tidak ada data kehadiran', message: 'Tidak ada record kehadiran pada filter ini.' });
    return;
  }

  // Kumpulkan tanggal unik (ISO) & peserta unik.
  const dateSet = new Set();
  const pesertaMap = {}; // nama -> { kelas, byDate: {iso: 'H'|'I'} }
  data.forEach(k => {
    const iso = Utils.formatDateInput(k.tanggal_raw || k.tanggal);
    if (!iso) return;
    dateSet.add(iso);
    const nama = k.nama_peserta || '-';
    if (!pesertaMap[nama]) pesertaMap[nama] = { kelas: k.kelas || '-', byDate: {} };
    pesertaMap[nama].byDate[iso] = (k.status_label === 'hadir') ? 'H' : 'I';
  });

  const dates = Array.from(dateSet).sort();
  const namaList = Object.keys(pesertaMap).sort((a, b) => a.localeCompare(b));
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

  const headCols = dates.map(iso => {
    const [, m, d] = iso.split('-');
    return `<th class="pivot-date" title="${iso}"><span>${Number(d)}</span><small>${monthShort[Number(m) - 1]}</small></th>`;
  }).join('');

  const rows = namaList.map((nama, idx) => {
    const info = pesertaMap[nama];
    const cells = dates.map(iso => {
      const v = info.byDate[iso] || '';
      const cls = v === 'H' ? 'hadir' : (v === 'I' ? 'izin' : 'kosong');
      return `<td class="pivot-cell ${cls}">${v}</td>`;
    }).join('');
    return `<tr>
        <td class="pivot-no">${idx + 1}</td>
        <td class="pivot-nama">${Utils.escapeHtml(nama)}</td>
        <td><span class="kelas-tag">${Utils.escapeHtml(info.kelas)}</span></td>
        ${cells}
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="pivot-legend">
      <span><i class="dot hadir"></i> H = Hadir</span>
      <span><i class="dot izin"></i> I = Izin</span>
      <span><i class="dot kosong"></i> – = Tidak ada record</span>
    </div>
    <div class="pivot-scroll">
      <table class="pivot-table">
        <thead><tr><th class="pivot-no">No.</th><th class="pivot-nama">Nama Peserta</th><th>Kelas</th>${headCols}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function deleteKehadiranConfirm(id) {
  const ok = await Utils.confirm('Hapus record kehadiran ini?');
  if (!ok) return;
  Utils.showLoader(true);
  const res = await BizLogic.deleteKehadiran({ id });
  Utils.showLoader(false);
  if (res.success) { Utils.notify(res.message, 'success'); loadKehadiran(); }
  else Utils.notify(res.message, 'error');
}

function openExportExcelModal() {
  const kelasOpts = CONFIG.KELAS_OPTIONS.map(k => `<option value="${k}">${k}</option>`).join('');
  const todayStr = Utils.formatDateInput(new Date());
  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
  const html = `
    <div class="modal-backdrop active" id="export-excel-modal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>${Icons.download()} Export Kehadiran ke Excel</h3>
          <button class="modal-close" aria-label="Tutup" onclick="document.getElementById('export-excel-modal').remove()">${Icons.x()}</button>
        </div>
        <div class="modal-body">
          <div class="form-group"><label>Pilih Kelas *</label><select id="ex-kelas" class="form-control"><option value="">- Pilih kelas -</option>${kelasOpts}</select></div>
          <div class="form-grid-2">
            <div class="form-group"><label>Tanggal Dari *</label><input id="ex-dari" class="form-control" type="date" value="${Utils.formatDateInput(lastMonth)}"></div>
            <div class="form-group"><label>Tanggal Sampai *</label><input id="ex-sampai" class="form-control" type="date" value="${todayStr}"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('export-excel-modal').remove()">Batal</button>
          <button class="btn btn-primary btn-icon" onclick="doExportExcel()">${Icons.download()} <span>Download Excel</span></button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  ModalHelper.focusFirst(document.getElementById('export-excel-modal'));
}

async function doExportExcel() {
  const kelas = document.getElementById('ex-kelas').value;
  const dari = document.getElementById('ex-dari').value;
  const sampai = document.getElementById('ex-sampai').value;
  if (!kelas || !dari || !sampai) { Utils.notify('Mohon lengkapi semua field', 'warning'); return; }
  if (new Date(dari) > new Date(sampai)) { Utils.notify('Tanggal dari harus sebelum tanggal sampai', 'warning'); return; }

  const res = BizLogic.getKehadiranForExport({ kelas, tanggal_dari: dari, tanggal_sampai: sampai });
  if (!res.success) { Utils.notify(res.message, 'error'); return; }

  ExcelExport.kehadiran(res.data);
  document.getElementById('export-excel-modal').remove();
}

// =============================================================
// RAPOR
// =============================================================
function loadRapor() {
  const res = BizLogic.getAllRapor();
  if (!res.success) { Utils.notify(res.message, 'error'); return; }
  raporCache = res.data || [];
  applyRaporFilters();
}

function applyRaporFilters() {
  const search = (document.getElementById('search-rapor')?.value || '').toLowerCase();
  const fStatus = document.getElementById('filter-status-rapor')?.value || 'all';
  const fPredikat = document.getElementById('filter-predikat-rapor')?.value || 'all';
  const sort = document.getElementById('sort-rapor')?.value || 'update_desc';

  // Gabungkan SEMUA peserta dengan rapornya (jika ada).
  // Request: peserta dengan status pembayaran BELUM LUNAS tidak ditampilkan di tab rapor.
  const raporByPeserta = {};
  raporCache.forEach(r => { raporByPeserta[r.Id_Peserta] = r; });
  const pesertaLunas = pesertaCache.filter(p => Utils.formatBool(p.Status_Pembayaran) === 'TRUE');
  let rows = pesertaLunas.map(p => {
    const r = raporByPeserta[p.Id_Peserta] || null;
    return {
      id_peserta: p.Id_Peserta,
      id_rapor: r ? r.Id_Rapor : null,
      nama: p.Nama_Lengkap,
      kelas: p.Kelas,
      predikat: r ? (r.Predikat || '') : '',
      catatan: r ? (r.Catatan || '') : '',
      tanggal_update: r ? r.Tanggal_Rapor : '',
      has_rapor: !!r
    };
  });

  if (search) rows = rows.filter(x => String(x.nama).toLowerCase().includes(search));
  if (fStatus === 'sudah') rows = rows.filter(x => x.has_rapor);
  else if (fStatus === 'belum') rows = rows.filter(x => !x.has_rapor);
  if (fPredikat !== 'all') rows = rows.filter(x => x.predikat === fPredikat);

  rows.sort((a, b) => {
    if (sort === 'nama_asc') return String(a.nama).localeCompare(String(b.nama));
    const ta = a.tanggal_update ? new Date(a.tanggal_update).getTime() : 0;
    const tb = b.tanggal_update ? new Date(b.tanggal_update).getTime() : 0;
    return sort === 'update_asc' ? (ta - tb) : (tb - ta);
  });

  renderRapor(rows);
}

function renderRapor(data) {
  const tbody = document.getElementById('tbody-rapor');
  if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">Tidak ada data peserta</td></tr>`; return; }
  tbody.innerHTML = data.map(x => {
    const statusPill = x.has_rapor
      ? `<span class="rapor-status sudah"><span class="dot"></span>Sudah</span>`
      : `<span class="rapor-status belum"><span class="dot"></span>Belum</span>`;
    const aksi = x.has_rapor
      ? `<button class="icon-btn view" title="Unduh PDF rapor" aria-label="Unduh PDF rapor" onclick="downloadAdminRaporPDF('${x.id_peserta}', this)">${Icons.download()}</button>
         <button class="icon-btn edit" title="Edit rapor" aria-label="Edit rapor" onclick="openRaporAdminModal('${x.id_peserta}')">${Icons.pencil()}</button>
         <button class="icon-btn delete" title="Hapus rapor" aria-label="Hapus rapor" onclick="deleteRaporConfirm('${x.id_rapor}')">${Icons.trash()}</button>`
      : `<button class="btn btn-primary btn-sm btn-icon" onclick="openRaporAdminModal('${x.id_peserta}')">${Icons.plus()} <span>Buat Rapor</span></button>`;
    return `<tr>
      <td>${Utils.escapeHtml(x.nama)} <span class="kelas-tag">${Utils.escapeHtml(x.kelas) || '-'}</span></td>
      <td>${x.predikat ? `<span class="status-badge info">${Utils.escapeHtml(x.predikat)}</span>` : '<em class="text-muted">-</em>'}</td>
      <td class="truncate-cell">${x.catatan ? Utils.escapeHtml(x.catatan.substring(0, 60)) + (x.catatan.length > 60 ? '…' : '') : '<em class="text-muted">-</em>'}</td>
      <td>${x.tanggal_update ? Utils.formatDate(x.tanggal_update) : '<em class="text-muted">-</em>'}</td>
      <td>${statusPill}</td>
      <td><div class="action-btns">${aksi}</div></td>
    </tr>`;
  }).join('');
}

function openRaporAdminModal(idPeserta) {
  const existing = idPeserta ? raporCache.find(r => r.Id_Peserta === idPeserta) : null;
  // Hanya peserta LUNAS yang dapat dibuatkan rapor.
  const sourceList = pesertaListLunas.length ? pesertaListLunas : pesertaCache.filter(p => Utils.formatBool(p.Status_Pembayaran) === 'TRUE');
  const pesertaOpts = sourceList.map(p => `<option value="${p.Id_Peserta}" ${idPeserta === p.Id_Peserta ? 'selected' : ''}>${Utils.escapeHtml(p.Nama_Lengkap)} • ${p.Kelas}</option>`).join('');
  const currentPeserta = idPeserta ? pesertaCache.find(p => p.Id_Peserta === idPeserta) : null;
  const currentNomor = currentPeserta ? (currentPeserta.Nomor_Peserta || '') : '';
  const predikatOpts = CONFIG.PREDIKAT_OPTIONS.map(pr => `<option value="${pr}" ${existing && existing.Predikat === pr ? 'selected' : ''}>${pr}</option>`).join('');

  let waktuRows = '';
  CONFIG.GAYA_RENANG.forEach((gaya, idx) => {
    const k = gaya.key.toLowerCase();
    const v25p = existing ? (existing['Waktu_25_' + gaya.key + '_Pelampung'] || '') : '';
    const v25  = existing ? (existing['Waktu_25_' + gaya.key] || '') : '';
    const v50  = existing ? (existing['Waktu_50_' + gaya.key] || '') : '';
    waktuRows += `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${gaya.label}</strong></td>
        <td><input class="form-control rapor-input" id="rp-25p-${k}" value="${Utils.escapeHtml(v25p)}" placeholder="mm.ss.ms"></td>
        <td><input class="form-control rapor-input" id="rp-25-${k}" value="${Utils.escapeHtml(v25)}" placeholder="mm.ss.ms"></td>
        <td><input class="form-control rapor-input" id="rp-50-${k}" value="${Utils.escapeHtml(v50)}" placeholder="mm.ss.ms"></td>
      </tr>`;
  });

  const html = `
    <div class="modal-backdrop active" id="rapor-admin-modal">
      <div class="modal modal-md">
        <div class="modal-header">
          <h3>${existing ? Icons.pencil() + ' Edit Rapor' : Icons.plus() + ' Buat Rapor'}</h3>
          <button class="modal-close" aria-label="Tutup" onclick="document.getElementById('rapor-admin-modal').remove()">${Icons.x()}</button>
        </div>
        <div class="modal-body">
          <div class="form-group"><label>Peserta *</label><select id="rp-peserta" class="form-control" ${existing ? 'disabled' : ''}><option value="">- Pilih peserta -</option>${pesertaOpts}</select></div>

          <h4 class="form-section-title">Capaian Waktu Latihan</h4>
          <p class="form-helper">Format waktu: <code>mm.ss.ms</code> (contoh: <code>01.08.12</code>). Kosongkan jika belum ada data.</p>
          <table class="rapor-input-table">
            <thead><tr><th>No.</th><th>Gaya Renang</th><th>25 M<br><small>(Pelampung)</small></th><th>25 M<br><small>(non-Pelampung)</small></th><th>50 M</th></tr></thead>
            <tbody>${waktuRows}</tbody>
          </table>

          <h4 class="form-section-title">Penilaian</h4>
          <div class="form-group"><label>Predikat *</label><select id="rp-predikat" class="form-control"><option value="">- Pilih predikat -</option>${predikatOpts}</select></div>
          <div class="form-group"><label>Deskripsi / Catatan</label><textarea id="rp-catatan" class="form-control" rows="3" placeholder="Contoh: Mampu berenang 50m gaya bebas, gaya dada & gaya kupu">${existing ? Utils.escapeHtml(existing.Catatan || '') : ''}</textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('rapor-admin-modal').remove()">Batal</button>
          <button class="btn btn-primary" onclick="saveRapor()">${existing ? 'Simpan Perubahan' : 'Buat Rapor'}</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  ModalHelper.focusFirst(document.getElementById('rapor-admin-modal'));

  // Sinkronkan kolom Nomor Peserta saat peserta dipilih (untuk rapor baru).
  const selEl = document.getElementById('rp-peserta');
  const nomorEl = document.getElementById('rp-nomor');
  if (selEl && nomorEl && !existing) {
    selEl.addEventListener('change', () => {
      const ps = pesertaCache.find(p => p.Id_Peserta === selEl.value);
      nomorEl.value = ps ? (ps.Nomor_Peserta || '') : '';
    });
  }
  // Generate nomor peserta otomatis dari backend.
  const genBtn = document.getElementById('rp-generate-nomor');
  if (genBtn) {
    genBtn.addEventListener('click', async () => {
      const pid = selEl ? selEl.value : idPeserta;
      if (!pid) { Utils.notify('Pilih peserta terlebih dahulu', 'warning'); return; }
      genBtn.classList.add('is-loading'); genBtn.disabled = true;
      const res = await BizLogic.generateNomorPeserta({ id_peserta: pid });
      genBtn.classList.remove('is-loading'); genBtn.disabled = false;
      if (res.success && res.data) {
        nomorEl.value = res.data.nomor_peserta;
        Utils.notify(res.message, 'success');
        // Refresh cache nomor agar konsisten di tabel & modal lain.
        const cp = pesertaCache.find(p => p.Id_Peserta === pid);
        if (cp) cp.Nomor_Peserta = res.data.nomor_peserta;
        const lp = pesertaListLunas.find(p => p.Id_Peserta === pid);
        if (lp) lp.Nomor_Peserta = res.data.nomor_peserta;
      } else {
        Utils.notify(res.message || 'Gagal membuat nomor peserta', 'error');
      }
    });
  }
}

async function saveRapor() {
  const session = Auth.getSession();
  const idPeserta = document.getElementById('rp-peserta').value;
  if (!idPeserta) { Utils.notify('Mohon pilih peserta', 'warning'); return; }
  const predikat = document.getElementById('rp-predikat').value;
  if (!predikat) { Utils.notify('Mohon pilih predikat', 'warning'); return; }

  const payload = {
    id_peserta: idPeserta,
    predikat,
    catatan: document.getElementById('rp-catatan').value.trim(),
    id_pelatih: session.data.id,
    waktu_25_bebas: Utils.normalizeWaktu(document.getElementById('rp-25-bebas').value),
    waktu_25_dada: Utils.normalizeWaktu(document.getElementById('rp-25-dada').value),
    waktu_25_kupu: Utils.normalizeWaktu(document.getElementById('rp-25-kupu').value),
    waktu_25_punggung: Utils.normalizeWaktu(document.getElementById('rp-25-punggung').value),
    waktu_25_bebas_pelampung: Utils.normalizeWaktu(document.getElementById('rp-25p-bebas').value),
    waktu_25_dada_pelampung: Utils.normalizeWaktu(document.getElementById('rp-25p-dada').value),
    waktu_25_kupu_pelampung: Utils.normalizeWaktu(document.getElementById('rp-25p-kupu').value),
    waktu_25_punggung_pelampung: Utils.normalizeWaktu(document.getElementById('rp-25p-punggung').value),
    waktu_50_bebas: Utils.normalizeWaktu(document.getElementById('rp-50-bebas').value),
    waktu_50_dada: Utils.normalizeWaktu(document.getElementById('rp-50-dada').value),
    waktu_50_kupu: Utils.normalizeWaktu(document.getElementById('rp-50-kupu').value),
    waktu_50_punggung: Utils.normalizeWaktu(document.getElementById('rp-50-punggung').value)
  };

  Utils.showLoader(true);
  // Simpan Nomor Peserta bila diubah (CRUD nomor peserta di modal rapor).
  const nomorEl = document.getElementById('rp-nomor');
  if (nomorEl) {
    const nomorBaru = nomorEl.value.trim();
    const ps = pesertaCache.find(p => p.Id_Peserta === idPeserta);
    const nomorLama = ps ? String(ps.Nomor_Peserta || '').trim() : '';
    if (nomorBaru !== nomorLama) {
      const upd = await BizLogic.updatePeserta({ id: idPeserta, nomor_peserta: nomorBaru });
      if (!upd.success) {
        Utils.showLoader(false);
        Utils.notify(upd.message || 'Gagal menyimpan nomor peserta', 'error');
        return;
      }
      if (ps) ps.Nomor_Peserta = nomorBaru;
      const lp = pesertaListLunas.find(p => p.Id_Peserta === idPeserta);
      if (lp) lp.Nomor_Peserta = nomorBaru;
    }
  }
  const res = await BizLogic.upsertRapor(payload);
  Utils.showLoader(false);
  if (res.success) {
    Utils.notify(res.message, 'success');
    document.getElementById('rapor-admin-modal').remove();
    loadRapor();
  } else Utils.notify(res.message, 'error');
}

async function deleteRaporConfirm(id) {
  const ok = await Utils.confirm('Hapus rapor ini?');
  if (!ok) return;
  Utils.showLoader(true);
  const res = await BizLogic.deleteRapor({ id });
  Utils.showLoader(false);
  if (res.success) { Utils.notify(res.message, 'success'); loadRapor(); }
  else Utils.notify(res.message, 'error');
}

/**
 * Admin mengunduh PDF rapor peserta — memakai generator yang SAMA dengan peserta
 * (PDFRapor.generate) agar format identik. Mengambil data lengkap + rapor by id_peserta.
 */
async function downloadAdminRaporPDF(idPeserta, btn) {
  if (typeof PDFRapor === 'undefined') {
    Utils.notify('Modul PDF belum termuat. Mohon refresh halaman.', 'error');
    return;
  }
  if (btn) btn.classList.add('is-loading');
  Utils.showLoader(true);
  try {
    const pesertaRes = BizLogic.getDataLengkapPeserta({ id_peserta: idPeserta });
    const raporRes = BizLogic.getRaporPeserta({ id_peserta: idPeserta });
    if (!pesertaRes.success) { Utils.notify('Gagal memuat data peserta', 'error'); return; }
    if (!raporRes.success || !raporRes.data) { Utils.notify('Rapor peserta belum tersedia', 'warning'); return; }
    await PDFRapor.generate(pesertaRes.data, raporRes.data, raporRes.data.Nama_Pelatih);
  } catch (err) {
    console.error(err);
    Utils.notify('Gagal membuat PDF: ' + err.message, 'error');
  } finally {
    Utils.showLoader(false);
    if (btn) btn.classList.remove('is-loading');
  }
}
// =============================================================
// TASK SECTION (req #14) — kartu tindak lanjut (swipe).
//   • Pembayaran belum lunas  -> isi nomor punggung + ubah status
//   • Jadwal hari ini belum aktif -> aktifkan / cancel
// Section disembunyikan bila tidak ada task.
// =============================================================
function computeTasks() {
  const tasks = [];
  // Task pembayaran: peserta belum lunas
  pesertaCache.forEach(p => {
    if (Utils.formatBool(p.Status_Pembayaran) !== 'TRUE') {
      tasks.push({
        type: 'payment', id: p.Id_Peserta,
        title: p.Nama_Lengkap,
        meta: [`${Utils.escapeHtml(p.Kelas) || '-'}`, p.Nomor_Peserta ? `No. ${Utils.escapeHtml(p.Nomor_Peserta)}` : 'Nomor punggung belum diisi']
      });
    }
  });
  // Task jadwal: jadwal HARI INI yang masih Pending (belum diaktifkan)
  const todayISO = Utils.formatDateInput(new Date());
  jadwalCache.forEach(j => {
    if (Utils.formatDateInput(j.Tanggal) === todayISO && String(j.Status).toLowerCase() === 'pending') {
      tasks.push({
        type: 'jadwal', id: j.Id_Jadwal,
        title: `${j.is_personal ? 'Personal' : 'Kelas'} • ${Utils.escapeHtml(j.Kelas) || '-'}`,
        meta: [`${Utils.escapeHtml(j.Pukul)}`, `${Utils.escapeHtml(j.Lokasi)}`]
      });
    }
  });
  return tasks;
}

function renderTaskSection() {
  const section = document.getElementById('task-section');
  const scroller = document.getElementById('task-scroller');
  const badge = document.getElementById('task-count');
  if (!section || !scroller) return;

  const tasks = computeTasks();
  if (tasks.length === 0) { section.hidden = true; scroller.innerHTML = ''; return; }
  section.hidden = false;
  if (badge) badge.textContent = tasks.length;

  scroller.innerHTML = tasks.map(t => {
    const tag = t.type === 'payment'
      ? `${Icons.hourglass()} Pembayaran`
      : `${Icons.clock()} Jadwal`;
    const cta = t.type === 'payment' ? 'Atur pembayaran' : 'Aktifkan jadwal';
    return `<div class="task-card" data-type="${t.type}" role="button" tabindex="0"
        onclick="openTaskModal('${t.type}','${t.id}')"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openTaskModal('${t.type}','${t.id}')}">
        <span class="task-card__tag">${tag}</span>
        <div class="task-card__title">${Utils.escapeHtml(t.title)}</div>
        <div class="task-card__meta">${t.meta.map(m => `<span>${m}</span>`).join('')}</div>
        <div class="task-card__cta">${cta} ${Icons.check()}</div>
      </div>`;
  }).join('');
}

function openTaskModal(type, id) {
  if (type === 'payment') return openTaskPaymentModal(id);
  if (type === 'jadwal') return openTaskJadwalModal(id);
}

/** Task pembayaran — HANYA nomor punggung & status (tidak bisa edit data peserta). */
async function openTaskPaymentModal(idPeserta) {
  const p = pesertaCache.find(x => x.Id_Peserta === idPeserta);
  if (!p) return;

  // Pastikan Nomor Peserta SUDAH TERISI otomatis sebelum modal ditampilkan
  // (fallback untuk peserta lama yang belum punya nomor — peserta baru sudah
  // auto-generate saat registrasi). Memakai fungsi backend yang sama dengan
  // tombol "Generate" di modal Rapor.
  if (!String(p.Nomor_Peserta || '').trim()) {
    Utils.showLoader(true);
    const genRes = await BizLogic.generateNomorPeserta({ id_peserta: idPeserta });
    Utils.showLoader(false);
    if (genRes.success && genRes.data) {
      p.Nomor_Peserta = genRes.data.nomor_peserta;
      const lp = pesertaListLunas.find(x => x.Id_Peserta === idPeserta);
      if (lp) lp.Nomor_Peserta = genRes.data.nomor_peserta;
    } else {
      Utils.notify(genRes.message || 'Nomor peserta belum dapat dibuat otomatis, mohon isi manual.', 'warning');
    }
  }

  const isPaid = Utils.formatBool(p.Status_Pembayaran) === 'TRUE';
  const html = `
    <div class="modal-backdrop active" id="task-modal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>${Icons.hourglass()} Tindak Lanjut Pembayaran</h3>
          <button class="modal-close" aria-label="Tutup" onclick="document.getElementById('task-modal').remove()">${Icons.x()}</button>
        </div>
        <div class="modal-body">
          <div class="info-banner">${Icons.user()}<p>Peserta: <strong>${Utils.escapeHtml(p.Nama_Lengkap)}</strong> • ${Utils.escapeHtml(p.Kelas) || '-'}</p></div>
          <div class="form-group"><label>Status Pembayaran</label>
            <select id="t-bayar" class="form-control">
              <option value="false" ${!isPaid ? 'selected' : ''}>Belum Lunas</option>
              <option value="true" ${isPaid ? 'selected' : ''}>Lunas</option>
            </select></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('task-modal').remove()">Batal</button>
          <button class="btn btn-primary" onclick="saveTaskPayment('${idPeserta}')">Simpan</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  ModalHelper.focusFirst(document.getElementById('task-modal'));

  // Tombol Generate: untuk koreksi manual bila admin ingin membuat ulang nomor.
  const genBtn = document.getElementById('t-generate-nomor');
  const nomorEl = document.getElementById('t-nomor');
  if (genBtn && nomorEl) {
    genBtn.addEventListener('click', async () => {
      genBtn.classList.add('is-loading'); genBtn.disabled = true;
      const res = await BizLogic.generateNomorPeserta({ id_peserta: idPeserta });
      genBtn.classList.remove('is-loading'); genBtn.disabled = false;
      if (res.success && res.data) {
        nomorEl.value = res.data.nomor_peserta;
        Utils.notify(res.message, 'success');
        p.Nomor_Peserta = res.data.nomor_peserta;
        const lp = pesertaListLunas.find(x => x.Id_Peserta === idPeserta);
        if (lp) lp.Nomor_Peserta = res.data.nomor_peserta;
      } else {
        Utils.notify(res.message || 'Gagal membuat nomor peserta', 'error');
      }
    });
  }
}

async function saveTaskPayment(idPeserta) {
  const wantLunas = document.getElementById('t-bayar').value === 'true';
  const nomor = document.getElementById('t-nomor').value.trim();
  if (wantLunas && !nomor) {
    const el = document.getElementById('t-nomor');
    if (el) { el.focus(); el.classList.add('input-error'); }
    Utils.notify('Nomor Peserta wajib diisi sebelum status Lunas.', 'warning');
    return;
  }
  const res = await BizLogic.updatePeserta({ id: idPeserta, nomor_peserta: nomor, status_pembayaran: wantLunas });
  if (res.success) {
    Utils.notify(res.message, 'success');
    document.getElementById('task-modal').remove();
    loadPeserta(); loadJadwal(); updateStats();
  } else if (res.code === 'NOMOR_PESERTA_REQUIRED') {
    showAlertModal('Nomor Peserta Wajib Diisi', Utils.escapeHtml(res.message));
  } else Utils.notify(res.message, 'error');
}

/** Task jadwal — HANYA ubah status aktif/cancel (tidak bisa edit jadwal). */
function openTaskJadwalModal(idJadwal) {
  const j = jadwalCache.find(x => x.Id_Jadwal === idJadwal);
  if (!j) return;
  const html = `
    <div class="modal-backdrop active" id="task-modal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>${Icons.clock()} Aktivasi Jadwal Hari Ini</h3>
          <button class="modal-close" aria-label="Tutup" onclick="document.getElementById('task-modal').remove()">${Icons.x()}</button>
        </div>
        <div class="modal-body">
          <div class="info-banner">${Icons.info()}
            <p><strong>${j.is_personal ? 'Personal' : 'Kelas'} ${Utils.escapeHtml(j.Kelas) || ''}</strong><br>
            ${Utils.formatDate(j.Tanggal)} • ${Utils.escapeHtml(j.Pukul)} • ${Utils.escapeHtml(j.Lokasi)}</p></div>
          <p class="form-helper"><strong>Aktifkan</strong> apabila kelas pelatihan akan di mulai dan <strong>Cancel</strong> apabila jadwal kelas dibatalkan</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('task-modal').remove()">Batal</button>
          <button class="btn btn-danger" onclick="saveTaskJadwal('${idJadwal}','Cancel')">${Icons.x()} <span>Cancel</span></button>
          <button class="btn btn-primary" onclick="saveTaskJadwal('${idJadwal}','Aktif')">${Icons.check()} <span>Aktifkan</span></button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  ModalHelper.focusFirst(document.getElementById('task-modal'));
}

async function saveTaskJadwal(idJadwal, status) {
  const res = await BizLogic.updateJadwal({ id: idJadwal, status });
  if (res.success) {
    Utils.notify('Jadwal diperbarui: ' + status, 'success');
    document.getElementById('task-modal').remove();
    loadJadwal(); updateStats();
  } else Utils.notify(res.message, 'error');
}