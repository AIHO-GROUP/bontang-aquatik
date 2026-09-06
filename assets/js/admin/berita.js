/**
 * ===================================================================
 * admin/berita.js — Tab Berita / Informasi
 * ===================================================================
 * Setiap berita mencatat siapa penulisnya, sehingga koordinator dapat
 * melihat pelatih mana yang paling aktif menyampaikan informasi.
 * Satu lampiran berkas didukung: JPG, JPEG, PNG, PDF, atau PPTX,
 * maksimal 10 MB (dibatasi juga di sisi server).
 */
const AdminBerita = (function () {
  'use strict';

  const Icons = Admin.Icons;
  let cache = [];
  let pager = null;

  function load() {
    const res = BizLogic.getAllBerita();
    if (!res.success) { UI.toast(res.message, 'error'); return; }
    cache = res.data || [];
    renderPenulisFilter();
    renderPenulisStats();
    applyFilters();
  }

  function renderPenulisFilter() {
    const sel = document.getElementById('filter-penulis-berita');
    if (!sel) return;
    const current = sel.value;
    const penulis = Array.from(new Set(cache.map((b) => b.nama_penulis).filter(Boolean))).sort();
    sel.innerHTML = '<option value="all">Semua Penulis</option>' +
      penulis.map((n) => '<option value="' + Utils.escapeHtml(n) + '">' + Utils.escapeHtml(n) + '</option>').join('');
    if (current && penulis.includes(current)) sel.value = current;
  }

  /** Ringkasan keaktifan penulis — hanya relevan bagi koordinator. */
  function renderPenulisStats() {
    const wrap = document.getElementById('penulis-stats');
    if (!wrap) return;
    if (!Auth.isSuperadmin() || !cache.length) { wrap.hidden = true; return; }

    const stats = BizLogic.getBeritaStatsByPenulis();
    wrap.hidden = false;
    wrap.innerHTML =
      '<h3 class="penulis-stats__title">Keaktifan Penyampaian Informasi</h3>' +
      '<div class="penulis-stats__grid">' +
      stats.map((s) =>
        '<div class="penulis-stat">' +
          '<div class="penulis-stat__avatar" aria-hidden="true">' +
            Utils.escapeHtml(Utils.initial(s.nama)) + '</div>' +
          '<div class="penulis-stat__body">' +
            '<strong>' + Utils.escapeHtml(s.nama) + '</strong>' +
            '<span>' + Utils.escapeHtml(s.peran || '') + '</span>' +
          '</div>' +
          '<div class="penulis-stat__count">' + s.jumlah +
            '<small>berita</small></div>' +
        '</div>').join('') +
      '</div>';
  }

  function applyFilters() {
    const q = (document.getElementById('search-berita')?.value || '').toLowerCase();
    const fPenulis = document.getElementById('filter-penulis-berita')?.value || 'all';

    const rows = cache.filter((b) => {
      if (q && !(b.Judul + ' ' + (b.Deskripsi || '')).toLowerCase().includes(q)) return false;
      if (fPenulis !== 'all' && b.nama_penulis !== fPenulis) return false;
      return true;
    });
    pager.setData(rows);
  }

  function statusTone(s) {
    if (s === 'Publik') return 'success';
    if (s === 'Semua Peserta') return 'info';
    return 'personal';
  }

  function render(rows) {
    if (!rows.length) { Admin.emptyRow('tbody-berita', 6, 'Belum ada berita'); return; }
    const meId = Auth.getId();

    document.getElementById('tbody-berita').innerHTML = rows.map((b) => {
      const milikSaya = !b.Id_Pelatih || b.Id_Pelatih === meId;
      const bolehUbah = Auth.isSuperadmin() || milikSaya;
      const aksi = bolehUbah
        ? '<button class="icon-btn edit" data-act="edit" data-id="' + b.Id_Berita + '" ' +
            'title="Ubah berita" aria-label="Ubah berita">' + Icons.pencil() + '</button>' +
          '<button class="icon-btn delete" data-act="delete" data-id="' + b.Id_Berita + '" ' +
            'title="Hapus berita" aria-label="Hapus berita">' + Icons.trash() + '</button>'
        : '<span class="text-muted" title="Dibuat pelatih lain">—</span>';

      return '<tr>' +
        '<td>' + WITA.formatDate(b.Tanggal) + '</td>' +
        '<td><div class="cell-primary">' + Utils.escapeHtml(b.Judul) + '</div>' +
          '<div class="cell-sub truncate-cell">' +
            Utils.escapeHtml((b.Deskripsi || '').substring(0, 70)) +
            ((b.Deskripsi || '').length > 70 ? '…' : '') + '</div></td>' +
        '<td>' + (b.nama_penulis
          ? Utils.escapeHtml(b.nama_penulis) +
            (b.peran_penulis ? '<div class="cell-sub">' + Utils.escapeHtml(b.peran_penulis) + '</div>' : '')
          : '<em class="text-muted">-</em>') + '</td>' +
        '<td><span class="status-badge ' + statusTone(b.Status) + '">' +
          Utils.escapeHtml(b.Status) + '</span></td>' +
        '<td>' + (b.has_file
          ? '<a href="' + Utils.escapeHtml(b.File_Url) + '" target="_blank" rel="noopener">' +
            Icons.paperclip() + ' ' + Utils.escapeHtml(b.file_label) + '</a>'
          : (b.Link
            ? '<a href="' + Utils.escapeHtml(b.Link) + '" target="_blank" rel="noopener">' +
              Icons.link() + ' Tautan</a>'
            : '<em class="text-muted">-</em>')) + '</td>' +
        '<td><div class="action-btns">' + aksi + '</div></td>' +
      '</tr>';
    }).join('');
  }

  /* ---------------- Formulir ---------------- */
  function openEditor(id) {
    const b = id ? cache.find((x) => x.Id_Berita === id) : null;
    const cfg = CONFIG.BERITA_UPLOAD;

    const audiensOpts = ['Publik', 'Semua Peserta', 'Peserta Grup A', 'Peserta Grup B', 'Peserta Grup C']
      .map((s) => '<option value="' + s + '"' +
        ((b ? b.Status : 'Publik') === s ? ' selected' : '') + '>' + s + '</option>').join('');

    const body =
      '<div class="form-group"><label for="b-judul">Judul *</label>' +
        '<input id="b-judul" class="form-control" value="' + (b ? Utils.escapeHtml(b.Judul) : '') + '" ' +
        'placeholder="Contoh: Lomba Renang Kaltim 2026"></div>' +
      '<div class="form-grid-2">' +
        '<div class="form-group"><label for="b-tanggal">Tanggal *</label>' +
          '<input id="b-tanggal" type="date" class="form-control" value="' +
          (b ? WITA.toISODate(b.Tanggal) : WITA.todayISO()) + '"></div>' +
        '<div class="form-group"><label for="b-status">Target Audiens *</label>' +
          '<select id="b-status" class="form-control">' + audiensOpts + '</select></div>' +
      '</div>' +
      '<div class="form-group"><label for="b-desc">Deskripsi *</label>' +
        '<textarea id="b-desc" class="form-control" rows="5" ' +
          'placeholder="Ringkasan berita atau informasi penting...">' +
          (b ? Utils.escapeHtml(b.Deskripsi || '') : '') + '</textarea></div>' +
      '<div class="form-group"><label for="b-link">Tautan Sumber <span class="text-muted">(opsional)</span></label>' +
        '<input id="b-link" type="url" class="form-control" value="' +
        (b ? Utils.escapeHtml(b.Link || '') : '') + '" placeholder="https://..."></div>' +

      '<h4 class="form-section-title">Lampiran Berkas</h4>' +
      '<p class="form-helper">Format yang didukung: JPG, JPEG, PNG, PDF, PPTX. Maksimal 10 MB.</p>' +
      '<div class="file-field">' +
        '<input type="file" id="b-file" accept="' + cfg.accept + '" class="file-field__input">' +
        '<label for="b-file" class="file-field__label">' + Icons.paperclip() + ' Pilih Berkas</label>' +
        '<div class="file-field__info" id="b-file-info">' +
          (b && b.has_file
            ? '<a href="' + Utils.escapeHtml(b.File_Url) + '" target="_blank" rel="noopener">' +
              Utils.escapeHtml(b.File_Nama || 'Lampiran') + '</a> <span class="text-muted">(' +
              Utils.escapeHtml(b.file_label) + ')</span>' +
              '<button type="button" class="btn btn-ghost btn-sm" id="b-file-remove">Hapus lampiran</button>'
            : '<span class="text-muted">Belum ada lampiran</span>') +
        '</div>' +
      '</div>';

    const m = UI.modal({
      title: b ? 'Ubah Berita' : 'Tambah Berita',
      size: 'md',
      body,
      actions: [{ label: 'Batal', variant: 'secondary' }]
    });

    // State lampiran: berkas baru, dipertahankan, atau dihapus.
    let fileState = b && b.has_file
      ? { mode: 'keep', url: b.File_Url, nama: b.File_Nama, tipe: b.File_Tipe, ukuran: b.File_Ukuran }
      : { mode: 'none' };

    const info = m.el.querySelector('#b-file-info');
    const fileInput = m.el.querySelector('#b-file');

    const bindRemove = () => {
      const rm = m.el.querySelector('#b-file-remove');
      if (rm) rm.addEventListener('click', () => {
        fileState = { mode: 'remove' };
        fileInput.value = '';
        info.innerHTML = '<span class="text-muted">Lampiran akan dihapus saat disimpan</span>';
      });
    };
    bindRemove();

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const check = BizLogic.validateBeritaFile(file);
      if (!check.valid) {
        UI.toast(check.message, 'error', { duration: 6000 });
        fileInput.value = '';
        return;
      }
      fileState = { mode: 'new', file };
      info.innerHTML = '<strong>' + Utils.escapeHtml(file.name) + '</strong> <span class="text-muted">(' +
        (file.size / 1048576).toFixed(2) + ' MB)</span>';
    });

    const save = document.createElement('button');
    save.className = 'btn btn-primary btn-block';
    save.style.marginTop = '12px';
    save.textContent = b ? 'Simpan Perubahan' : 'Publikasikan';
    save.addEventListener('click', async () => {
      const judul = m.el.querySelector('#b-judul').value.trim();
      const deskripsi = m.el.querySelector('#b-desc').value.trim();
      if (!judul || !deskripsi) { UI.toast('Judul dan deskripsi wajib diisi', 'warning'); return; }

      save.disabled = true;
      Utils.showLoader(true);

      const payload = {
        judul,
        deskripsi,
        tanggal: m.el.querySelector('#b-tanggal').value,
        status: m.el.querySelector('#b-status').value,
        link: m.el.querySelector('#b-link').value.trim()
      };

      if (fileState.mode === 'new') {
        const up = await CrudApi.uploadFile(CONFIG.BERITA_UPLOAD.bucket, fileState.file, { prefix: 'berita' });
        if (!up.success) {
          Utils.showLoader(false);
          save.disabled = false;
          UI.toast(up.message, 'error', { duration: 6000 });
          return;
        }
        payload.file_url = up.url;
        payload.file_nama = up.name;
        payload.file_tipe = up.type;
        payload.file_ukuran = up.size;
      } else if (fileState.mode === 'remove') {
        payload.file_url = '';
        payload.file_nama = '';
        payload.file_tipe = '';
        payload.file_ukuran = 0;
      }

      if (id) payload.id = id;
      const res = id ? await BizLogic.updateBerita(payload) : await BizLogic.createBerita(payload);

      Utils.showLoader(false);
      save.disabled = false;

      if (!res.success) { UI.toast(res.message, 'error', { duration: 5000 }); return; }
      UI.toast(res.message, 'success');
      m.close();
      Admin.refresh('berita');
    });
    m.el.querySelector('.modal-body').appendChild(save);
  }

  async function confirmRemove(id) {
    const b = cache.find((x) => x.Id_Berita === id);
    const ok = await UI.confirm(
      'Hapus berita "' + (b ? b.Judul : '') + '"?' + (b && b.has_file ? ' Lampirannya juga akan dihapus.' : ''),
      { title: 'Hapus Berita', confirmLabel: 'Ya, hapus', variant: 'danger' }
    );
    if (!ok) return;
    Utils.showLoader(true);
    const res = await BizLogic.deleteBerita({ id });
    Utils.showLoader(false);
    if (res.success) { UI.toast(res.message, 'success'); Admin.refresh('berita'); }
    else UI.toast(res.message, 'error');
  }

  function init() {
    pager = new Paginator({
      mountId: 'pager-berita',
      storageKey: 'pgsize_admin_berita',
      label: 'berita',
      onRender: render
    });

    ['search-berita', 'filter-penulis-berita'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.addEventListener('input', applyFilters); el.addEventListener('change', applyFilters); }
    });

    document.getElementById('btn-tambah-berita').addEventListener('click', () => openEditor(null));

    document.getElementById('tbody-berita').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'edit') return openEditor(btn.dataset.id);
      if (btn.dataset.act === 'delete') return confirmRemove(btn.dataset.id);
    });
  }

  return { init, load };
})();

Admin.register('berita', AdminBerita);
