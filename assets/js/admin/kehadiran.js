/**
 * ===================================================================
 * admin/kehadiran.js — Tab Kehadiran
 * ===================================================================
 * Dua tampilan:
 *   • List  — satu baris per catatan kehadiran, dengan pagination.
 *   • Tabel — matriks peserta x tanggal, mengikuti format buku absensi
 *             dan hasil export Excel.
 */
const AdminKehadiran = (function () {
  'use strict';

  const Icons = Admin.Icons;
  const VIEW_KEY = 'swim_admin_kehadiran_view';
  let cache = [];
  let filtered = [];
  let pager = null;

  const view = () => {
    try { return localStorage.getItem(VIEW_KEY) || 'list'; } catch (e) { return 'list'; }
  };
  const setView = (v) => {
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* abaikan */ }
    applyFilters();
  };

  function load() {
    const periode = document.getElementById('filter-periode')?.value || 'all';
    const res = BizLogic.getAllKehadiran({ periode });
    if (!res.success) { UI.toast(res.message, 'error'); return; }
    cache = res.data || [];
    applyFilters();
  }

  function applyFilters() {
    const q = (document.getElementById('search-kehadiran')?.value || '').toLowerCase();
    const fKelas = document.getElementById('filter-kelas-kehadiran')?.value || 'all';
    const fStatus = document.getElementById('filter-status-kehadiran')?.value || 'all';

    filtered = cache.filter((k) => {
      if (q && !String(k.nama_peserta).toLowerCase().includes(q)) return false;
      if (fKelas !== 'all' && k.kelas !== fKelas) return false;
      if (fStatus !== 'all' && k.status_label !== fStatus) return false;
      return true;
    });

    const isTable = view() === 'table';
    document.getElementById('kehadiran-table-wrap').hidden = isTable;
    document.getElementById('kehadiran-pivot-view').hidden = !isTable;
    document.getElementById('pager-kehadiran').hidden = isTable;

    document.querySelectorAll('#kehadiran-view-toggle button').forEach((b) =>
      b.classList.toggle('active', b.dataset.val === view()));

    if (isTable) renderPivot(filtered);
    else pager.setData(filtered);
  }

  function render(rows) {
    if (!rows.length) { Admin.emptyRow('tbody-kehadiran', 7, 'Tidak ada data kehadiran'); return; }

    document.getElementById('tbody-kehadiran').innerHTML = rows.map((k) =>
      '<tr>' +
        '<td>' + WITA.formatDate(k.tanggal) + '</td>' +
        '<td><div class="cell-primary">' + Utils.escapeHtml(k.nama_peserta) + '</div>' +
          '<div class="cell-sub"><code>' + Utils.escapeHtml(k.nomor_peserta || '-') + '</code></div></td>' +
        '<td><span class="kelas-tag">' + Utils.escapeHtml(k.kelas) + '</span></td>' +
        '<td>' + Utils.escapeHtml(k.pukul) + '</td>' +
        '<td><span class="status-badge ' + (k.status_label === 'hadir' ? 'success' : 'warning') + '">' +
          (k.status_label === 'hadir' ? Icons.check() + ' Hadir' : Icons.mail() + ' Izin') + '</span></td>' +
        '<td class="truncate-cell">' + Utils.escapeHtml(k.Catatan || '-') + '</td>' +
        '<td><div class="action-btns">' +
          '<button class="icon-btn edit" data-act="edit" data-id="' + k.Id_Kehadiran + '" ' +
            'title="Ubah catatan" aria-label="Ubah catatan">' + Icons.pencil() + '</button>' +
          '<button class="icon-btn delete" data-act="delete" data-id="' + k.Id_Kehadiran + '" ' +
            'title="Hapus catatan" aria-label="Hapus catatan">' + Icons.trash() + '</button>' +
        '</div></td>' +
      '</tr>').join('');
  }

  /** Matriks peserta x tanggal, sesuai format buku absensi. */
  function renderPivot(rows) {
    const wrap = document.getElementById('kehadiran-pivot-view');
    if (!rows.length) {
      UI.emptyState(wrap, {
        title: 'Tidak ada data kehadiran',
        message: 'Tidak ada catatan kehadiran pada filter ini.'
      });
      return;
    }

    const dateSet = new Set();
    const byPeserta = new Map();
    rows.forEach((k) => {
      if (!k.tanggal) return;
      dateSet.add(k.tanggal);
      if (!byPeserta.has(k.nama_peserta)) {
        byPeserta.set(k.nama_peserta, { kelas: k.kelas || '-', byDate: {} });
      }
      byPeserta.get(k.nama_peserta).byDate[k.tanggal] = (k.status_label === 'hadir') ? 'H' : 'I';
    });

    const dates = Array.from(dateSet).sort();
    const names = Array.from(byPeserta.keys()).sort((a, b) => a.localeCompare(b));

    const head = dates.map((iso) => {
      const [, m, d] = iso.split('-');
      return '<th class="pivot-date" title="' + iso + '"><span>' + Number(d) + '</span>' +
             '<small>' + WITA.MONTH_SHORT[Number(m) - 1] + '</small></th>';
    }).join('');

    const body = names.map((nama, i) => {
      const info = byPeserta.get(nama);
      const cells = dates.map((iso) => {
        const v = info.byDate[iso] || '';
        const cls = v === 'H' ? 'hadir' : v === 'I' ? 'izin' : 'kosong';
        return '<td class="pivot-cell ' + cls + '">' + v + '</td>';
      }).join('');
      return '<tr><td class="pivot-no">' + (i + 1) + '</td>' +
             '<td class="pivot-nama">' + Utils.escapeHtml(nama) + '</td>' +
             '<td><span class="kelas-tag">' + Utils.escapeHtml(info.kelas) + '</span></td>' +
             cells + '</tr>';
    }).join('');

    wrap.innerHTML =
      '<div class="pivot-legend">' +
        '<span><i class="dot hadir"></i> H = Hadir</span>' +
        '<span><i class="dot izin"></i> I = Izin</span>' +
        '<span><i class="dot kosong"></i> – = Tidak ada catatan</span>' +
      '</div>' +
      '<div class="pivot-scroll"><table class="pivot-table">' +
        '<thead><tr><th class="pivot-no">No.</th><th class="pivot-nama">Nama Peserta</th>' +
        '<th>Grup</th>' + head + '</tr></thead>' +
        '<tbody>' + body + '</tbody></table></div>';
  }

  /* ---------------- Aksi ---------------- */
  function openEdit(id) {
    const k = cache.find((x) => x.Id_Kehadiran === id);
    if (!k) return;

    const body =
      '<div class="detail-card">' +
        '<div class="detail-row"><span>Peserta</span><strong>' +
          Utils.escapeHtml(k.nama_peserta) + '</strong></div>' +
        '<div class="detail-row"><span>Sesi</span><strong>' +
          WITA.formatDate(k.tanggal) + ' • ' + Utils.escapeHtml(k.pukul) + '</strong></div>' +
      '</div>' +
      '<div class="form-group"><label for="ke-status">Status</label>' +
        '<select id="ke-status" class="form-control">' +
          '<option value="true"' + (k.status_label === 'hadir' ? ' selected' : '') + '>Hadir</option>' +
          '<option value="false"' + (k.status_label === 'izin' ? ' selected' : '') + '>Izin</option>' +
        '</select></div>' +
      '<div class="form-group"><label for="ke-catatan">Catatan</label>' +
        '<textarea id="ke-catatan" class="form-control" rows="3">' +
          Utils.escapeHtml(k.Catatan || '') + '</textarea></div>';

    const m = UI.modal({
      title: 'Ubah Catatan Kehadiran',
      size: 'sm',
      body,
      actions: [{ label: 'Batal', variant: 'secondary' }]
    });

    const save = document.createElement('button');
    save.className = 'btn btn-primary btn-block';
    save.style.marginTop = '10px';
    save.textContent = 'Simpan';
    save.addEventListener('click', async () => {
      save.disabled = true;
      const res = await BizLogic.updateKehadiran({
        id,
        status: m.el.querySelector('#ke-status').value === 'true',
        catatan: m.el.querySelector('#ke-catatan').value.trim()
      });
      save.disabled = false;
      if (!res.success) { UI.toast(res.message, 'error'); return; }
      UI.toast(res.message, 'success');
      m.close();
      Admin.refresh(['kehadiran', 'peserta']);
    });
    m.el.querySelector('.modal-body').appendChild(save);
  }

  async function confirmRemove(id) {
    const ok = await UI.confirm('Hapus catatan kehadiran ini?', {
      title: 'Hapus Kehadiran', confirmLabel: 'Ya, hapus', variant: 'danger'
    });
    if (!ok) return;
    Utils.showLoader(true);
    const res = await BizLogic.deleteKehadiran({ id });
    Utils.showLoader(false);
    if (res.success) { UI.toast(res.message, 'success'); Admin.refresh(['kehadiran', 'peserta']); }
    else UI.toast(res.message, 'error');
  }

  /* ---------------- Export Excel ---------------- */
  function openExport() {
    const kelasOpts = CONFIG.KELAS_OPTIONS.map((k) =>
      '<option value="' + k + '">' + k + '</option>').join('');
    const today = WITA.todayISO();
    const bulanLalu = WITA.addMonths(today, -1);

    const body =
      '<div class="form-group"><label for="ex-kelas">Grup Latihan *</label>' +
        '<select id="ex-kelas" class="form-control"><option value="">- Pilih grup -</option>' +
        kelasOpts + '</select></div>' +
      '<div class="form-grid-2">' +
        '<div class="form-group"><label for="ex-dari">Dari Tanggal *</label>' +
          '<input id="ex-dari" type="date" class="form-control" value="' + bulanLalu + '"></div>' +
        '<div class="form-group"><label for="ex-sampai">Sampai Tanggal *</label>' +
          '<input id="ex-sampai" type="date" class="form-control" value="' + today + '"></div>' +
      '</div>';

    const m = UI.modal({
      title: 'Export Kehadiran ke Excel',
      size: 'sm',
      body,
      actions: [{ label: 'Batal', variant: 'secondary' }]
    });

    const go = document.createElement('button');
    go.className = 'btn btn-primary btn-block';
    go.style.marginTop = '10px';
    go.innerHTML = Icons.download() + ' Unduh Excel';
    go.addEventListener('click', () => {
      const kelas = m.el.querySelector('#ex-kelas').value;
      const dari = m.el.querySelector('#ex-dari').value;
      const sampai = m.el.querySelector('#ex-sampai').value;

      if (!kelas || !dari || !sampai) { UI.toast('Mohon lengkapi semua kolom', 'warning'); return; }
      if (WITA.diffDays(dari, sampai) < 0) { UI.toast('Tanggal "dari" harus sebelum "sampai"', 'warning'); return; }

      const res = BizLogic.getKehadiranForExport({ kelas, tanggal_dari: dari, tanggal_sampai: sampai });
      if (!res.success) { UI.toast(res.message, 'error'); return; }
      ExcelExport.kehadiran(res.data);
      m.close();
    });
    m.el.querySelector('.modal-body').appendChild(go);
  }

  /* ---------------- Inisialisasi ---------------- */
  function init() {
    pager = new Paginator({
      mountId: 'pager-kehadiran',
      storageKey: 'pgsize_admin_kehadiran',
      label: 'catatan',
      onRender: render
    });

    ['search-kehadiran', 'filter-kelas-kehadiran', 'filter-status-kehadiran'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.addEventListener('input', applyFilters); el.addEventListener('change', applyFilters); }
    });
    document.getElementById('filter-periode').addEventListener('change', load);

    document.getElementById('kehadiran-view-toggle').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-val]');
      if (b) setView(b.dataset.val);
    });

    document.getElementById('btn-export-kehadiran').addEventListener('click', openExport);

    document.getElementById('tbody-kehadiran').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'edit') return openEdit(btn.dataset.id);
      if (btn.dataset.act === 'delete') return confirmRemove(btn.dataset.id);
    });
  }

  return { init, load };
})();

Admin.register('kehadiran', AdminKehadiran);
