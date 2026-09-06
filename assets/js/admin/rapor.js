/**
 * ===================================================================
 * admin/rapor.js — Tab Rapor
 * ===================================================================
 * Pelatih mengisi capaian & penilaian peserta. Penanda tangan rapor
 * SELALU identitas koordinator klub (lihat BizLogic.getRaporSigner),
 * bukan pelatih yang memberi nilai — sesuai kebijakan kelembagaan.
 *
 * Koordinator juga dapat mengunduh seluruh rapor sekaligus sebagai
 * arsip ZIP.
 */
const AdminRapor = (function () {
  'use strict';

  const Icons = Admin.Icons;
  let rows = [];
  let pager = null;

  function load() {
    const raporRes = BizLogic.getAllRapor();
    const pesertaRes = BizLogic.getAllPeserta();
    if (!raporRes.success || !pesertaRes.success) return;

    const byPeserta = {};
    (raporRes.data || []).forEach((r) => { byPeserta[r.Id_Peserta] = r; });

    // Hanya peserta yang pernah membayar yang berhak punya rapor.
    rows = (pesertaRes.data || [])
      .filter((p) => p.lunas)
      .map((p) => {
        const r = byPeserta[p.Id_Peserta] || null;
        return {
          id_peserta: p.Id_Peserta,
          id_rapor: r ? r.Id_Rapor : null,
          nama: p.Nama_Lengkap,
          nomor: p.Nomor_Peserta,
          kelas: p.Kelas,
          predikat: r ? (r.Predikat || '') : '',
          catatan: r ? (r.Catatan || '') : '',
          pelatih: r ? (r.nama_pelatih || '') : '',
          tanggal_update: r ? r.Tanggal_Rapor : '',
          has_rapor: !!r
        };
      });

    const sel = document.getElementById('filter-predikat-rapor');
    if (sel && sel.options.length <= 1) {
      sel.insertAdjacentHTML('beforeend',
        CONFIG.PREDIKAT_OPTIONS.map((p) => '<option value="' + p + '">' + p + '</option>').join(''));
    }

    applyDefaultGrup();
    applyFilters();
  }

  /**
   * Secara default tampilkan GRUP YANG BERLATIH HARI INI, bukan seluruh
   * peserta. Pelatih memberi penilaian tepat setelah sesi, jadi grup hari
   * itulah yang ia butuhkan — Senin Grup A, Selasa Grup B, dan seterusnya.
   *
   * Hanya diterapkan sekali per pemuatan halaman; setelah pengguna memilih
   * grup lain sendiri, pilihannya tidak ditimpa lagi.
   */
  let defaultSudahDipakai = false;
  function applyDefaultGrup() {
    if (defaultSudahDipakai) return;
    const sel = document.getElementById('filter-kelas-rapor');
    if (!sel) return;

    const grupHariIni = ScheduleEngine.groupsOnDay(WITA.todayISO());
    // Sabtu ketiga grup berlatih, dan hari libur tidak ada sama sekali:
    // dalam dua keadaan itu menyaring satu grup justru menyembunyikan data.
    if (grupHariIni.length === 1) sel.value = grupHariIni[0];
    defaultSudahDipakai = true;
  }

  /** Keterangan singkat mengapa daftar tersaring seperti ini. */
  function renderHint(jumlah) {
    const el = document.getElementById('rapor-hint');
    if (!el) return;
    const grupHariIni = ScheduleEngine.groupsOnDay(WITA.todayISO());
    const dipilih = document.getElementById('filter-kelas-rapor')?.value || 'all';

    if (!grupHariIni.length) {
      el.innerHTML = '<span aria-hidden="true">📅</span> Tidak ada grup yang berlatih hari ini.';
      return;
    }
    const cocok = dipilih !== 'all' && grupHariIni.includes(dipilih);
    el.innerHTML = '<span aria-hidden="true">📅</span> Hari ini <strong>' +
      grupHariIni.join(', ') + '</strong> berlatih. ' +
      (cocok
        ? 'Menampilkan ' + jumlah + ' peserta ' + dipilih + '.'
        : 'Menampilkan ' + jumlah + ' peserta sesuai filter yang Anda pilih.');
  }

  function applyFilters() {
    const q = (document.getElementById('search-rapor')?.value || '').toLowerCase();
    const fKelas = document.getElementById('filter-kelas-rapor')?.value || 'all';
    const fStatus = document.getElementById('filter-status-rapor')?.value || 'all';
    const fPredikat = document.getElementById('filter-predikat-rapor')?.value || 'all';
    const sort = document.getElementById('sort-rapor')?.value || 'update_desc';

    let list = rows.filter((x) => {
      if (q && !(x.nama + ' ' + x.nomor).toLowerCase().includes(q)) return false;
      if (fKelas !== 'all' && x.kelas !== fKelas) return false;
      if (fStatus === 'sudah' && !x.has_rapor) return false;
      if (fStatus === 'belum' && x.has_rapor) return false;
      if (fPredikat !== 'all' && x.predikat !== fPredikat) return false;
      return true;
    });

    renderHint(list.length);

    list.sort((a, b) => {
      if (sort === 'nama_asc') return String(a.nama).localeCompare(String(b.nama));
      const ta = a.tanggal_update ? new Date(a.tanggal_update).getTime() : 0;
      const tb = b.tanggal_update ? new Date(b.tanggal_update).getTime() : 0;
      return sort === 'update_asc' ? (ta - tb) : (tb - ta);
    });

    pager.setData(list);
  }

  function render(list) {
    if (!list.length) { Admin.emptyRow('tbody-rapor', 6, 'Tidak ada peserta yang cocok'); return; }

    document.getElementById('tbody-rapor').innerHTML = list.map((x) => {
      const aksi = x.has_rapor
        ? '<button class="icon-btn view" data-act="pdf" data-id="' + x.id_peserta + '" ' +
            'title="Unduh PDF rapor" aria-label="Unduh PDF rapor">' + Icons.download() + '</button>' +
          '<button class="icon-btn edit" data-act="edit" data-id="' + x.id_peserta + '" ' +
            'title="Ubah rapor" aria-label="Ubah rapor">' + Icons.pencil() + '</button>' +
          '<button class="icon-btn delete" data-act="delete" data-id="' + x.id_rapor + '" ' +
            'title="Hapus rapor" aria-label="Hapus rapor">' + Icons.trash() + '</button>'
        : '<button class="btn btn-primary btn-sm btn-icon" data-act="edit" data-id="' + x.id_peserta + '">' +
            Icons.plus() + ' <span>Buat Rapor</span></button>';

      return '<tr>' +
        '<td><div class="cell-primary">' + Utils.escapeHtml(x.nama) + '</div>' +
          '<div class="cell-sub"><span class="kelas-tag">' + Utils.escapeHtml(x.kelas || '-') + '</span> ' +
          '<code>' + Utils.escapeHtml(x.nomor || '-') + '</code></div></td>' +
        '<td>' + (x.predikat
          ? '<span class="status-badge info">' + Utils.escapeHtml(x.predikat) + '</span>'
          : '<em class="text-muted">-</em>') + '</td>' +
        '<td class="truncate-cell">' + (x.catatan
          ? Utils.escapeHtml(x.catatan.substring(0, 60)) + (x.catatan.length > 60 ? '…' : '')
          : '<em class="text-muted">-</em>') + '</td>' +
        '<td>' + (x.tanggal_update
          ? WITA.formatDate(x.tanggal_update) +
            (x.pelatih ? '<div class="cell-sub">oleh ' + Utils.escapeHtml(x.pelatih) + '</div>' : '')
          : '<em class="text-muted">-</em>') + '</td>' +
        '<td>' + (x.has_rapor
          ? '<span class="rapor-status sudah"><span class="dot"></span>Sudah</span>'
          : '<span class="rapor-status belum"><span class="dot"></span>Belum</span>') + '</td>' +
        '<td><div class="action-btns">' + aksi + '</div></td>' +
      '</tr>';
    }).join('');
  }

  /* ---------------- Formulir rapor ---------------- */
  function openEdit(idPeserta) {
    const peserta = Store.findPeserta(idPeserta);
    if (!peserta) return;
    const existing = Store.raporOf(idPeserta);
    const signer = BizLogic.getRaporSigner();

    const waktuRows = CONFIG.GAYA_RENANG.map((gaya, i) => {
      const k = gaya.key.toLowerCase();
      const get = (f) => Utils.escapeHtml((existing && existing[f]) || '');
      return '<tr><td>' + (i + 1) + '</td><td><strong>' + gaya.label + '</strong></td>' +
        '<td><input class="form-control rapor-input" id="rp-25p-' + k + '" ' +
          'value="' + get('Waktu_25_' + gaya.key + '_Pelampung') + '" placeholder="mm.ss.ms"></td>' +
        '<td><input class="form-control rapor-input" id="rp-25-' + k + '" ' +
          'value="' + get('Waktu_25_' + gaya.key) + '" placeholder="mm.ss.ms"></td>' +
        '<td><input class="form-control rapor-input" id="rp-50-' + k + '" ' +
          'value="' + get('Waktu_50_' + gaya.key) + '" placeholder="mm.ss.ms"></td></tr>';
    }).join('');

    const predikatOpts = '<option value="">- Pilih predikat -</option>' +
      CONFIG.PREDIKAT_OPTIONS.map((p) =>
        '<option value="' + p + '"' + (existing && existing.Predikat === p ? ' selected' : '') + '>' +
        p + '</option>').join('');

    const body =
      '<div class="detail-card">' +
        '<div class="detail-row"><span>Peserta</span><strong>' +
          Utils.escapeHtml(peserta.Nama_Lengkap) + '</strong></div>' +
        '<div class="detail-row"><span>Nomor Peserta</span><strong><code>' +
          Utils.escapeHtml(peserta.Nomor_Peserta || '-') + '</code></strong></div>' +
        '<div class="detail-row"><span>Grup</span><strong>' +
          Utils.escapeHtml(peserta.Kelas || '-') + '</strong></div>' +
      '</div>' +
      '<h4 class="form-section-title">Capaian Waktu Latihan</h4>' +
      '<p class="form-helper">Format waktu <code>mm.ss.ms</code> (contoh <code>01.08.12</code>). ' +
        'Kosongkan bila belum ada data.</p>' +
      '<table class="rapor-input-table"><thead><tr><th>No.</th><th>Gaya Renang</th>' +
        '<th>25 M<br><small>(Pelampung)</small></th>' +
        '<th>25 M<br><small>(Tanpa Pelampung)</small></th><th>50 M</th></tr></thead>' +
        '<tbody>' + waktuRows + '</tbody></table>' +
      '<h4 class="form-section-title">Penilaian</h4>' +
      '<div class="form-group"><label for="rp-predikat">Predikat *</label>' +
        '<select id="rp-predikat" class="form-control">' + predikatOpts + '</select></div>' +
      '<div class="form-group"><label for="rp-catatan">Deskripsi / Catatan</label>' +
        '<textarea id="rp-catatan" class="form-control" rows="3" ' +
          'placeholder="Contoh: mampu berenang 50m gaya bebas, dada, dan kupu">' +
          Utils.escapeHtml((existing && existing.Catatan) || '') + '</textarea></div>' +
      '<div class="info-banner info-banner--soft"><div aria-hidden="true">✍️</div>' +
        '<p>Rapor akan ditandatangani atas nama <strong>' + Utils.escapeHtml(signer.nama) + '</strong> ' +
        '(' + Utils.escapeHtml(signer.jabatan) + '). Nama Anda tercatat sebagai pelatih penilai.</p></div>';

    const m = UI.modal({
      title: existing ? 'Ubah Rapor' : 'Buat Rapor',
      size: 'md',
      body,
      actions: [{ label: 'Batal', variant: 'secondary' }]
    });

    const save = document.createElement('button');
    save.className = 'btn btn-primary btn-block';
    save.style.marginTop = '12px';
    save.textContent = existing ? 'Simpan Perubahan' : 'Buat Rapor';
    save.addEventListener('click', async () => {
      const predikat = m.el.querySelector('#rp-predikat').value;
      if (!predikat) { UI.toast('Mohon pilih predikat', 'warning'); return; }

      const payload = {
        id_peserta: idPeserta,
        predikat,
        catatan: m.el.querySelector('#rp-catatan').value.trim(),
        id_pelatih: Auth.getId()
      };
      CONFIG.GAYA_RENANG.forEach((g) => {
        const k = g.key.toLowerCase();
        payload['waktu_25_' + k + '_pelampung'] = Utils.normalizeWaktu(m.el.querySelector('#rp-25p-' + k).value);
        payload['waktu_25_' + k] = Utils.normalizeWaktu(m.el.querySelector('#rp-25-' + k).value);
        payload['waktu_50_' + k] = Utils.normalizeWaktu(m.el.querySelector('#rp-50-' + k).value);
      });

      save.disabled = true;
      Utils.showLoader(true);
      const res = await BizLogic.upsertRapor(payload);
      Utils.showLoader(false);
      save.disabled = false;

      if (!res.success) { UI.toast(res.message, 'error'); return; }
      UI.toast(res.message, 'success');
      m.close();
      Admin.refresh('rapor');
    });
    m.el.querySelector('.modal-body').appendChild(save);
  }

  async function confirmRemove(id) {
    const ok = await UI.confirm('Hapus rapor ini? Data capaian dan penilaian akan hilang.', {
      title: 'Hapus Rapor', confirmLabel: 'Ya, hapus', variant: 'danger'
    });
    if (!ok) return;
    Utils.showLoader(true);
    const res = await BizLogic.deleteRapor({ id });
    Utils.showLoader(false);
    if (res.success) { UI.toast(res.message, 'success'); Admin.refresh('rapor'); }
    else UI.toast(res.message, 'error');
  }

  /* ---------------- Unduh PDF ---------------- */
  async function downloadPdf(idPeserta, btn) {
    if (typeof PDFRapor === 'undefined' || typeof window.jspdf === 'undefined') {
      UI.toast('Modul PDF belum termuat. Mohon tunggu sebentar atau muat ulang halaman.', 'error');
      return;
    }
    if (btn) btn.classList.add('is-loading');
    Utils.showLoader(true);
    try {
      const p = BizLogic.getDataLengkapPeserta({ id_peserta: idPeserta });
      const r = BizLogic.getRaporPeserta({ id_peserta: idPeserta });
      if (!p.success) { UI.toast('Gagal memuat data peserta', 'error'); return; }
      if (!r.data) { UI.toast('Rapor peserta belum tersedia', 'warning'); return; }
      await PDFRapor.generate(p.data, r.data);
    } catch (err) {
      console.error(err);
      UI.toast('Gagal membuat PDF: ' + err.message, 'error');
    } finally {
      Utils.showLoader(false);
      if (btn) btn.classList.remove('is-loading');
    }
  }

  /* ---------------- Arsip ZIP (koordinator) ---------------- */
  function openArsipModal() {
    if (!Auth.can('unduhArsipRapor')) return;

    const kelasOpts = '<option value="all">Semua Grup</option>' +
      CONFIG.KELAS_OPTIONS.map((k) => '<option value="' + k + '">' + k + '</option>').join('');

    const body =
      '<p class="form-helper">Seluruh rapor akan diunduh sebagai satu berkas ZIP untuk arsip klub. ' +
        'Peserta yang belum memiliki rapor otomatis dilewati.</p>' +
      '<div class="form-group"><label for="zip-kelas">Grup Latihan</label>' +
        '<select id="zip-kelas" class="form-control">' + kelasOpts + '</select></div>' +
      '<div id="zip-progress" class="zip-progress" hidden>' +
        '<div class="zip-progress__bar"><div id="zip-bar"></div></div>' +
        '<div class="zip-progress__label" id="zip-label"></div>' +
      '</div>';

    const m = UI.modal({
      title: 'Unduh Arsip Rapor',
      size: 'sm',
      body,
      actions: [{ label: 'Tutup', variant: 'secondary' }]
    });

    const go = document.createElement('button');
    go.className = 'btn btn-primary btn-block';
    go.style.marginTop = '10px';
    go.innerHTML = Icons.download() + ' Buat & Unduh ZIP';
    go.addEventListener('click', () => generateZip(m, go));
    m.el.querySelector('.modal-body').appendChild(go);
  }

  async function generateZip(m, btn) {
    if (typeof JSZip === 'undefined' || typeof window.jspdf === 'undefined') {
      UI.toast('Modul arsip belum termuat. Mohon tunggu sebentar lalu coba lagi.', 'error');
      return;
    }

    const kelas = m.el.querySelector('#zip-kelas').value;
    const target = rows.filter((x) => x.has_rapor && (kelas === 'all' || x.kelas === kelas));
    if (!target.length) { UI.toast('Tidak ada rapor pada grup tersebut', 'warning'); return; }

    const progress = m.el.querySelector('#zip-progress');
    const bar = m.el.querySelector('#zip-bar');
    const label = m.el.querySelector('#zip-label');
    progress.hidden = false;
    btn.disabled = true;

    const zip = new JSZip();
    let gagal = 0;

    for (let i = 0; i < target.length; i++) {
      const x = target[i];
      label.textContent = 'Membuat rapor ' + (i + 1) + ' dari ' + target.length + ' — ' + x.nama;
      bar.style.width = Math.round(((i) / target.length) * 100) + '%';

      try {
        const p = BizLogic.getDataLengkapPeserta({ id_peserta: x.id_peserta });
        const r = BizLogic.getRaporPeserta({ id_peserta: x.id_peserta });
        if (!p.success || !r.data) { gagal++; continue; }

        const blob = await PDFRapor.generate(p.data, r.data, { output: 'blob' });
        const safeNama = String(x.nama).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
        const folder = String(x.kelas || 'Tanpa_Grup').replace(/\s+/g, '_');
        zip.file(folder + '/Rapor_' + safeNama + '_' + (x.nomor || x.id_peserta) + '.pdf', blob);
      } catch (err) {
        console.error('ZIP rapor gagal untuk', x.nama, err);
        gagal++;
      }
      // Beri napas ke browser agar UI tetap responsif saat memproses banyak PDF.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    label.textContent = 'Mengemas arsip...';
    bar.style.width = '100%';

    const blob = await zip.generateAsync({ type: 'blob' });
    // Format nama sesuai kebijakan arsip: Rapor_<Grup>_<Tanggal>
    const namaGrup = (kelas === 'all' ? 'Semua-Grup' : kelas).replace(/\s+/g, '-');
    const filename = 'Rapor_' + namaGrup + '_' + WITA.todayISO() + '.zip';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    btn.disabled = false;
    progress.hidden = true;
    m.close();
    UI.toast(
      (target.length - gagal) + ' rapor diarsipkan sebagai ' + filename +
      (gagal ? ' (' + gagal + ' gagal dibuat)' : ''),
      gagal ? 'warning' : 'success',
      { duration: 6000 }
    );
  }

  /* ---------------- Inisialisasi ---------------- */
  function init() {
    pager = new Paginator({
      mountId: 'pager-rapor',
      storageKey: 'pgsize_admin_rapor',
      label: 'peserta',
      onRender: render
    });

    ['search-rapor', 'filter-kelas-rapor', 'filter-status-rapor',
     'filter-predikat-rapor', 'sort-rapor'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.addEventListener('input', applyFilters); el.addEventListener('change', applyFilters); }
    });

    document.getElementById('btn-arsip-rapor').addEventListener('click', openArsipModal);

    document.getElementById('tbody-rapor').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'edit') return openEdit(btn.dataset.id);
      if (btn.dataset.act === 'pdf') return downloadPdf(btn.dataset.id, btn);
      if (btn.dataset.act === 'delete') return confirmRemove(btn.dataset.id);
    });
  }

  return { init, load };
})();

Admin.register('rapor', AdminRapor);
