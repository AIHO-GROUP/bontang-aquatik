/**
 * ===================================================================
 * admin/jadwal.js — Tab Jadwal
 * ===================================================================
 * Jadwal grup dibuat OTOMATIS ketika pembayaran dikonfirmasi, dan status
 * sesi mengikuti waktu WITA tanpa intervensi harian. Yang tersisa untuk
 * admin adalah pengecualian:
 *   • menimpa status sesi (Aktif / Pending / Cancel) bila kondisi lapangan
 *     berbeda dari rencana,
 *   • membuat jadwal personal di luar sesi grup,
 *   • koordinator mendelegasikan sesi kepada pelatih tertentu.
 */
const AdminJadwal = (function () {
  'use strict';

  const Icons = Admin.Icons;
  const VIEW_KEY = 'swim_admin_jadwal_view';
  let cache = [];
  let filtered = [];
  let pager = null;
  let calMonth = null;

  const view = () => {
    try { return localStorage.getItem(VIEW_KEY) || 'list'; } catch (e) { return 'list'; }
  };
  const setView = (v) => {
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* abaikan */ }
    applyFilters();
  };

  function load() {
    const res = BizLogic.getAllJadwal();
    if (!res.success) { UI.toast(res.message, 'error'); return; }
    cache = res.data || [];
    applyFilters();
  }

  /* ---------------- Filter ---------------- */
  function applyFilters() {
    const q = (document.getElementById('search-jadwal')?.value || '').toLowerCase();
    const fKelas = document.getElementById('filter-kelas-jadwal')?.value || 'all';
    const fStatus = document.getElementById('filter-status-jadwal')?.value || 'all';
    const fTipe = document.getElementById('filter-tipe-jadwal')?.value || 'all';

    let rows = cache.filter((j) => {
      if (q) {
        const hay = [j.Tanggal, WITA.formatDate(j.Tanggal), j.Lokasi, j.jam_label,
                     j.nama_pelatih, j.nama_peserta_personal].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fKelas !== 'all' && j.Kelas !== fKelas) return false;
      if (fStatus !== 'all' && j.Status !== fStatus) return false;
      if (fTipe === 'kelas' && j.is_personal) return false;
      if (fTipe === 'personal' && !j.is_personal) return false;
      if (fTipe === 'mine' && !j.is_mine) return false;
      return true;
    });

    /* ---------------------------------------------------------------
       URUTAN DEFAULT
       Yang dibutuhkan admin adalah sesi yang AKAN datang, bukan arsip.
       Karena itu:
         1. Hari ini & mendatang, dari yang paling dekat
         2. Sesi yang sudah lewat, dari yang paling baru
       Sesi lampau tetap dapat ditelusuri, hanya tidak lagi menutupi
       jadwal yang masih relevan.
       --------------------------------------------------------------- */
    const today = WITA.todayISO();
    rows.sort((a, b) => {
      const sisaA = WITA.diffDays(today, a.Tanggal);   // >= 0 berarti belum lewat
      const sisaB = WITA.diffDays(today, b.Tanggal);
      const lewatA = sisaA < 0, lewatB = sisaB < 0;
      if (lewatA !== lewatB) return lewatA ? 1 : -1;
      // Mendatang: menaik (terdekat dulu). Lampau: menurun (terbaru dulu).
      return lewatA ? (sisaB - sisaA) : (sisaA - sisaB);
    });

    filtered = rows;
    const isCal = view() === 'calendar';
    document.getElementById('jadwal-table-wrap').hidden = isCal;
    document.getElementById('jadwal-calendar-view').hidden = !isCal;
    document.getElementById('pager-jadwal').hidden = isCal;

    document.querySelectorAll('#jadwal-view-toggle button').forEach((b) =>
      b.classList.toggle('active', b.dataset.val === view()));

    if (isCal) renderCalendar(rows);
    else pager.setData(rows);
  }

  /* ---------------- Tabel ---------------- */
  function render(rows) {
    if (!rows.length) { Admin.emptyRow('tbody-jadwal', 7, 'Tidak ada jadwal yang cocok'); return; }

    document.getElementById('tbody-jadwal').innerHTML = rows.map((j) =>
      '<tr>' +
        '<td><div class="cell-primary">' + WITA.formatDate(j.Tanggal) + '</div>' +
          '<div class="cell-sub">' + WITA.DAY_LONG[WITA.dayOfWeek(j.Tanggal)] + '</div></td>' +
        '<td><div class="cell-primary">' + Utils.escapeHtml(j.jam_label) + '</div>' +
          '<div class="cell-sub">' + Utils.escapeHtml(j.countdown) + '</div></td>' +
        '<td><span class="kelas-tag">' + Utils.escapeHtml(j.Kelas || '-') + '</span></td>' +
        '<td>' + (j.is_personal
          ? '<span class="status-badge personal">' + Icons.star() + ' ' +
            Utils.escapeHtml(j.nama_peserta_personal || 'Personal') + '</span>'
          : '<span class="status-badge info">Grup</span>') + '</td>' +
        '<td>' + (j.nama_pelatih
          ? Utils.escapeHtml(j.nama_pelatih) + (j.is_mine ? ' <span class="status-badge success">Anda</span>' : '')
          : '<em class="text-muted">belum ditentukan</em>') + '</td>' +
        '<td>' + Admin.statusBadge(j.Status) +
          (j.is_manual ? '<span class="manual-flag" title="Status ditentukan manual">manual</span>' : '') + '</td>' +
        '<td><div class="action-btns">' +
          '<button class="icon-btn view" data-act="attendees" data-id="' + j.Id_Jadwal + '" ' +
            'title="Daftar hadir" aria-label="Daftar hadir">' + Icons.eye() + '</button>' +
          '<button class="icon-btn edit" data-act="edit" data-id="' + j.Id_Jadwal + '" ' +
            'title="Ubah jadwal" aria-label="Ubah jadwal">' + Icons.pencil() + '</button>' +
          '<button class="icon-btn delete" data-act="delete" data-id="' + j.Id_Jadwal + '" ' +
            'title="Hapus jadwal" aria-label="Hapus jadwal">' + Icons.trash() + '</button>' +
        '</div></td>' +
      '</tr>').join('');
  }

  /* ---------------- Kalender ---------------- */
  function renderCalendar(rows) {
    const wrap = document.getElementById('jadwal-calendar-view');
    if (!calMonth) calMonth = WITA.todayISO().slice(0, 7);

    const byDate = {};
    rows.forEach((j) => { (byDate[j.Tanggal] = byDate[j.Tanggal] || []).push(j); });

    const [year, month] = calMonth.split('-').map(Number);
    const firstDow = WITA.dayOfWeek(calMonth + '-01');
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const todayISO = WITA.todayISO();

    let cells = '';
    for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell cal-cell--empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = calMonth + '-' + String(d).padStart(2, '0');
      const items = (byDate[iso] || []).sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai));
      const chips = items.slice(0, 4).map((j) =>
        '<button type="button" class="cal-chip ' + String(j.Status).toLowerCase() + '" ' +
          'data-act="edit" data-id="' + j.Id_Jadwal + '" ' +
          'title="' + Utils.escapeHtml((j.Kelas || 'Personal') + ' ' + j.jam_label + ' — ' + j.Lokasi) + '">' +
          Utils.escapeHtml((j.Kelas || 'Personal') + ' · ' + j.jam_mulai) + '</button>').join('');
      const more = items.length > 4 ? '<span class="cal-more">+' + (items.length - 4) + ' lagi</span>' : '';
      cells += '<div class="cal-cell ' + (iso === todayISO ? 'is-today' : '') + ' ' +
        (items.length ? 'has-items' : '') + '">' +
        '<div class="cal-date">' + d + '</div>' +
        '<div class="cal-chips">' + chips + more + '</div></div>';
    }

    wrap.innerHTML =
      '<div class="cal-header">' +
        '<button type="button" class="icon-btn" data-cal="-1" aria-label="Bulan sebelumnya">‹</button>' +
        '<h3 class="cal-title">' + WITA.MONTH_LONG[month - 1] + ' ' + year + '</h3>' +
        '<button type="button" class="icon-btn" data-cal="1" aria-label="Bulan berikutnya">›</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-cal="today">Hari ini</button>' +
      '</div>' +
      '<div class="cal-weekdays">' + WITA.DAY_SHORT.map((l) => '<div>' + l + '</div>').join('') + '</div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="cal-legend">' +
        '<span><i class="dot aktif"></i> Berlangsung</span>' +
        '<span><i class="dot pending"></i> Belum dibuka</span>' +
        '<span><i class="dot selesai"></i> Selesai</span>' +
        '<span><i class="dot cancel"></i> Dibatalkan</span>' +
      '</div>';

    wrap.querySelectorAll('[data-cal]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.cal === 'today') calMonth = WITA.todayISO().slice(0, 7);
      else {
        const d = new Date(Date.UTC(year, month - 1 + Number(b.dataset.cal), 1));
        calMonth = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
      }
      renderCalendar(filtered);
    }));
  }

  /* ---------------- Daftar hadir ---------------- */
  function openAttendees(idJadwal) {
    const res = BizLogic.getJadwalAttendees({ id_jadwal: idJadwal });
    if (!res.success) { UI.toast(res.message, 'error'); return; }
    const { data, jadwal } = res;

    const stat = {
      hadir: data.filter((d) => d.status === 'hadir').length,
      izin: data.filter((d) => d.status === 'izin').length,
      belum: data.filter((d) => d.status === 'belum').length
    };

    const list = data.map((d) =>
      '<li class="attendees-item status-' + d.status + '">' +
        '<div class="attendees-item__info">' +
          '<strong>' + Utils.escapeHtml(d.nama) + '</strong>' +
          '<small><code>' + Utils.escapeHtml(d.nomor_peserta || '-') + '</code>' +
            (d.catatan ? ' • ' + Utils.escapeHtml(d.catatan) : '') + '</small>' +
        '</div>' +
        '<div class="attendees-item__actions">' +
          '<div class="ui-segment ui-segment--sm" data-peserta="' + d.id_peserta + '">' +
            '<button type="button" data-val="hadir" class="' + (d.status === 'hadir' ? 'active' : '') + '">Hadir</button>' +
            '<button type="button" data-val="izin" class="' + (d.status === 'izin' ? 'active' : '') + '">Izin</button>' +
            '<button type="button" data-val="belum" class="' + (d.status === 'belum' ? 'active' : '') + '">—</button>' +
          '</div>' +
        '</div>' +
      '</li>').join('');

    const body =
      '<div class="attendees-info">' + WITA.formatDateFull(jadwal.Tanggal) + ' • ' +
        Utils.escapeHtml(jadwal.jam_label) + ' • ' + Utils.escapeHtml(jadwal.Lokasi) +
        ' <span class="kelas-tag">' + Utils.escapeHtml(jadwal.Kelas) + '</span></div>' +
      '<div class="attendees-status">' + Admin.statusBadge(jadwal.Status) +
        ' <span class="text-muted">' + Utils.escapeHtml(jadwal.countdown) + '</span></div>' +
      '<div class="attendees-stats">' +
        '<div class="attendees-stat success"><span>' + stat.hadir + '</span><label>Hadir</label></div>' +
        '<div class="attendees-stat warning"><span>' + stat.izin + '</span><label>Izin</label></div>' +
        '<div class="attendees-stat muted"><span>' + stat.belum + '</span><label>Belum</label></div>' +
      '</div>' +
      (data.length
        ? '<p class="form-helper">Ketuk tombol di samping nama untuk mencatat kehadiran secara manual ' +
          '(mis. peserta hadir tetapi lupa absen lewat aplikasi).</p>' +
          '<ul class="attendees-list">' + list + '</ul>'
        : '<div class="ui-empty"><div class="ui-empty__icon">👥</div>' +
          '<div class="ui-empty__title">Belum ada peserta</div>' +
          '<div>Tidak ada peserta aktif pada grup ini di tanggal tersebut.</div></div>');

    const m = UI.modal({
      title: 'Daftar Hadir',
      size: 'md',
      body,
      actions: [{ label: 'Tutup', variant: 'secondary' }]
    });

    m.el.querySelectorAll('[data-peserta]').forEach((seg) => {
      seg.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-val]');
        if (!btn || btn.classList.contains('active')) return;

        seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
        const r = await BizLogic.setKehadiranManual({
          id_jadwal: idJadwal,
          id_peserta: seg.dataset.peserta,
          status: btn.dataset.val
        });
        if (!r.success) { UI.toast(r.message, 'error'); return; }
        UI.toast('Kehadiran diperbarui', 'success', { duration: 1600 });
        Admin.refresh(['kehadiran', 'peserta']);
      });
    });
  }

  /* ---------------- Ubah jadwal ---------------- */
  function openEdit(id) {
    const j = cache.find((x) => x.Id_Jadwal === id);
    if (!j) return;

    const manualOpts = ScheduleEngine.MANUAL_OPTIONS.map((o) =>
      '<option value="' + o.value + '"' + (j.status_manual === o.value ? ' selected' : '') + '>' +
      o.label + '</option>').join('');

    const pelatihList = BizLogic.getPelatihList().data;
    const pelatihOpts = '<option value="">- Belum ditentukan -</option>' +
      pelatihList.map((p) =>
        '<option value="' + p.id + '"' + (j.Id_Pelatih === p.id ? ' selected' : '') + '>' +
        Utils.escapeHtml(p.nama) + ' (' + CONFIG.ROLE_LABEL[p.role] + ')</option>').join('');

    const body =
      (j.is_personal
        ? '<div class="info-banner"><div aria-hidden="true">⭐</div><p>Jadwal personal untuk <strong>' +
          Utils.escapeHtml(j.nama_peserta_personal) + '</strong></p></div>'
        : '') +
      '<div class="form-grid-2">' +
        '<div class="form-group"><label for="je-tanggal">Tanggal</label>' +
          '<input id="je-tanggal" type="date" class="form-control" value="' + j.Tanggal + '"></div>' +
        '<div class="form-group"><label for="je-jam">Jam Mulai (WITA)</label>' +
          '<input id="je-jam" type="time" class="form-control" value="' + j.jam_mulai + '"></div>' +
        '<div class="form-group"><label for="je-lokasi">Lokasi</label>' +
          '<input id="je-lokasi" class="form-control" value="' + Utils.escapeHtml(j.Lokasi) + '"></div>' +
        '<div class="form-group"><label for="je-durasi">Durasi Sesi (menit)</label>' +
          '<input id="je-durasi" type="number" min="30" max="480" step="15" class="form-control" ' +
            'value="' + (j.Durasi_Menit || CONFIG.SESI_DURASI_MENIT) + '"></div>' +
      '</div>' +

      '<h4 class="form-section-title">Status Sesi</h4>' +
      '<div class="info-banner info-banner--soft"><div aria-hidden="true">🕐</div>' +
        '<p>Secara otomatis sesi ini <strong>' + Utils.escapeHtml(j.status_auto) + '</strong> — ' +
        Utils.escapeHtml(j.countdown) + '. Pilih penimpaan hanya bila kondisi lapangan berbeda.</p></div>' +
      '<div class="form-group"><label for="je-manual">Penimpaan Manual</label>' +
        '<select id="je-manual" class="form-control">' + manualOpts + '</select></div>' +

      (Auth.can('delegasiJadwal')
        ? '<h4 class="form-section-title">Delegasi Pelatih</h4>' +
          '<p class="form-helper">Pelatih yang ditunjuk bertanggung jawab memantau absensi, ' +
            'melatih, dan memberi penilaian pada sesi ini.</p>' +
          '<div class="form-group"><label for="je-pelatih">Pelatih Penanggung Jawab</label>' +
            '<select id="je-pelatih" class="form-control">' + pelatihOpts + '</select></div>'
        : '<p class="form-helper">Pelatih penanggung jawab: <strong>' +
          (Utils.escapeHtml(j.nama_pelatih) || 'belum ditentukan') + '</strong></p>');

    const m = UI.modal({
      title: 'Ubah Jadwal',
      size: 'sm',
      body,
      actions: [{ label: 'Batal', variant: 'secondary' }]
    });

    const save = document.createElement('button');
    save.className = 'btn btn-primary btn-block';
    save.style.marginTop = '12px';
    save.textContent = 'Simpan Perubahan';
    save.addEventListener('click', async () => {
      const payload = {
        id,
        tanggal: m.el.querySelector('#je-tanggal').value,
        jam_mulai: m.el.querySelector('#je-jam').value,
        durasi_menit: parseInt(m.el.querySelector('#je-durasi').value, 10),
        lokasi: m.el.querySelector('#je-lokasi').value.trim(),
        status_manual: m.el.querySelector('#je-manual').value
      };
      const pelatihEl = m.el.querySelector('#je-pelatih');
      if (pelatihEl) payload.id_pelatih = pelatihEl.value;

      save.disabled = true;
      Utils.showLoader(true);
      const res = await BizLogic.updateJadwal(payload);
      Utils.showLoader(false);
      save.disabled = false;

      if (!res.success) { UI.toast(res.message, 'error'); return; }
      UI.toast(res.message, 'success');
      m.close();
      Admin.refresh(['jadwal', 'kehadiran']);
    });
    m.el.querySelector('.modal-body').appendChild(save);
  }

  /* ---------------- Jadwal personal ---------------- */
  function openCreate() {
    const lokasiOpts = CONFIG.LOCATIONS.map((l) =>
      '<option value="' + Utils.escapeHtml(l.name) + '">' + Utils.escapeHtml(l.name) + '</option>').join('');
    const pelatihList = BizLogic.getPelatihList().data;
    const pelatihOpts = pelatihList.map((p) =>
      '<option value="' + p.id + '"' + (p.id === Auth.getId() ? ' selected' : '') + '>' +
      Utils.escapeHtml(p.nama) + '</option>').join('');

    const body =
      '<div class="info-banner"><div aria-hidden="true">ℹ️</div>' +
        '<p><strong>Jadwal personal</strong> dipakai untuk sesi tambahan di luar jadwal grup, ' +
        'misalnya latihan privat atau persiapan lomba.</p></div>' +
      '<div class="form-group"><label>Peserta <span class="text-muted" id="j-peserta-count">(0 dipilih)</span></label>' +
        '<div class="peserta-picker" id="j-peserta-picker">' +
          '<div class="peserta-picker__chips" id="j-peserta-chips"></div>' +
          '<input type="text" id="j-peserta-search" class="search-input" autocomplete="off" ' +
            'placeholder="Ketik nama peserta untuk mencari..." aria-label="Cari peserta">' +
          '<div class="peserta-picker__dropdown" id="j-peserta-dropdown"></div>' +
        '</div></div>' +
      '<div class="form-grid-2">' +
        '<div class="form-group"><label for="j-tanggal">Tanggal</label>' +
          '<input id="j-tanggal" type="date" class="form-control" value="' + WITA.todayISO() + '"></div>' +
        '<div class="form-group"><label for="j-jam">Jam Mulai (WITA)</label>' +
          '<input id="j-jam" type="time" class="form-control" value="16:00"></div>' +
        '<div class="form-group"><label for="j-lokasi">Lokasi</label>' +
          '<select id="j-lokasi" class="form-control">' + lokasiOpts + '</select></div>' +
        '<div class="form-group"><label for="j-pelatih">Pelatih</label>' +
          '<select id="j-pelatih" class="form-control">' + pelatihOpts + '</select></div>' +
      '</div>' +
      '<p class="form-helper">Sesi otomatis terbuka pada jam mulai dan tertutup ' +
        CONFIG.SESI_DURASI_MENIT + ' menit kemudian.</p>';

    const m = UI.modal({
      title: 'Tambah Jadwal Personal',
      size: 'md',
      body,
      actions: [{ label: 'Batal', variant: 'secondary' }]
    });

    const picker = createPesertaPicker(m.el);

    const save = document.createElement('button');
    save.className = 'btn btn-primary btn-block';
    save.style.marginTop = '12px';
    save.textContent = 'Buat Jadwal';
    save.addEventListener('click', async () => {
      const ids = picker.ids();
      if (!ids.length) { UI.toast('Pilih minimal 1 peserta', 'warning'); return; }

      save.disabled = true;
      Utils.showLoader(true);
      const res = await BizLogic.createJadwalBatch({
        peserta: ids,
        tanggal: m.el.querySelector('#j-tanggal').value,
        jam_mulai: m.el.querySelector('#j-jam').value,
        lokasi: m.el.querySelector('#j-lokasi').value,
        id_pelatih: m.el.querySelector('#j-pelatih').value
      });
      Utils.showLoader(false);
      save.disabled = false;

      if (!res.success) { UI.toast(res.message, 'error'); return; }
      UI.toast(res.message, 'success');
      m.close();
      Admin.refresh('jadwal');
    });
    m.el.querySelector('.modal-body').appendChild(save);
  }

  /**
   * Pemilih peserta: hanya peserta dengan periode berjalan yang sudah lunas
   * yang dapat dijadwalkan, dan tidak bisa dipilih dua kali.
   */
  function createPesertaPicker(root) {
    const selected = [];
    const search = root.querySelector('#j-peserta-search');
    const dropdown = root.querySelector('#j-peserta-dropdown');
    const chips = root.querySelector('#j-peserta-chips');
    const count = root.querySelector('#j-peserta-count');
    let list = [];

    const eligible = () => Store.peserta().filter((p) => BizLogic.currentEnrollment(p.Id_Peserta));

    function renderChips() {
      chips.innerHTML = selected.map((s) =>
        '<span class="peserta-chip">' + Utils.escapeHtml(s.nama) +
        '<button type="button" data-remove="' + s.id + '" aria-label="Hapus ' +
        Utils.escapeHtml(s.nama) + '">×</button></span>').join('');
      count.textContent = '(' + selected.length + ' dipilih)';
      chips.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
        const i = selected.findIndex((s) => s.id === b.dataset.remove);
        if (i !== -1) selected.splice(i, 1);
        renderChips();
      }));
    }

    function renderDropdown(query) {
      const q = (query || '').trim().toLowerCase();
      const chosen = new Set(selected.map((s) => s.id));
      list = eligible()
        .filter((p) => !chosen.has(p.Id_Peserta))
        .filter((p) => !q || (p.Nama_Lengkap + ' ' + p.Kelas).toLowerCase().includes(q))
        .slice(0, 50);

      dropdown.innerHTML = list.length
        ? list.map((p, i) =>
            '<div class="peserta-option" data-i="' + i + '"><span>' +
            Utils.escapeHtml(p.Nama_Lengkap) + '</span><small>' +
            Utils.escapeHtml(p.Kelas || '-') + '</small></div>').join('')
        : '<div class="peserta-option peserta-option--empty">' +
          (q ? 'Peserta tidak ditemukan' : 'Semua peserta aktif sudah dipilih') + '</div>';

      dropdown.classList.add('show');
      dropdown.querySelectorAll('[data-i]').forEach((opt) => {
        opt.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const p = list[Number(opt.dataset.i)];
          selected.push({ id: p.Id_Peserta, nama: p.Nama_Lengkap });
          search.value = '';
          renderChips();
          renderDropdown('');
        });
      });
    }

    search.addEventListener('input', () => renderDropdown(search.value));
    search.addEventListener('focus', () => renderDropdown(search.value));
    document.addEventListener('mousedown', (e) => {
      const picker = root.querySelector('#j-peserta-picker');
      if (picker && !picker.contains(e.target)) dropdown.classList.remove('show');
    });

    renderChips();
    return { ids: () => selected.map((s) => s.id) };
  }

  /* ---------------- Hapus ----------------
     Dua lapis konfirmasi: konfirmasi biasa, lalu peringatan tambahan bila
     jadwal ini sudah memiliki catatan kehadiran peserta. */
  async function confirmRemove(id) {
    const ok = await UI.confirm('Hapus jadwal ini?', {
      title: 'Hapus Jadwal', confirmLabel: 'Ya, hapus', variant: 'danger'
    });
    if (!ok) return;

    Utils.showLoader(true);
    let res = await BizLogic.deleteJadwal({ id });
    Utils.showLoader(false);

    if (!res.success && res.code === 'HAS_ATTENDANCE') {
      const lanjut = await UI.confirm(
        res.message + ' Lanjutkan menghapus jadwal beserta catatan kehadirannya?',
        { title: 'Jadwal Memiliki Riwayat Absensi', confirmLabel: 'Ya, hapus juga', variant: 'danger' }
      );
      if (!lanjut) return;
      Utils.showLoader(true);
      res = await BizLogic.deleteJadwal({ id, force: true });
      Utils.showLoader(false);
    }

    if (res.success) { UI.toast(res.message, 'success'); Admin.refresh(['jadwal', 'kehadiran']); }
    else UI.toast(res.message, 'error');
  }

  /* ---------------- Inisialisasi ---------------- */
  function init() {
    pager = new Paginator({
      mountId: 'pager-jadwal',
      storageKey: 'pgsize_admin_jadwal',
      label: 'jadwal',
      onRender: render
    });

    ['search-jadwal', 'filter-kelas-jadwal', 'filter-status-jadwal', 'filter-tipe-jadwal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.addEventListener('input', applyFilters); el.addEventListener('change', applyFilters); }
    });

    document.getElementById('jadwal-view-toggle').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-val]');
      if (b) setView(b.dataset.val);
    });

    document.getElementById('btn-tambah-jadwal').addEventListener('click', openCreate);

    const onAction = (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'attendees') return openAttendees(btn.dataset.id);
      if (btn.dataset.act === 'edit') return openEdit(btn.dataset.id);
      if (btn.dataset.act === 'delete') return confirmRemove(btn.dataset.id);
    };
    document.getElementById('tbody-jadwal').addEventListener('click', onAction);
    document.getElementById('jadwal-calendar-view').addEventListener('click', onAction);
  }

  return { init, load, openAttendees, openEdit };
})();

Admin.register('jadwal', AdminJadwal);
