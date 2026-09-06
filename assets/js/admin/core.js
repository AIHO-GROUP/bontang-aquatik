/**
 * ===================================================================
 * admin/core.js — Kerangka panel admin
 * ===================================================================
 * Berisi hal yang dipakai bersama oleh seluruh modul tab:
 *   • ikon inline, helper modal & alert
 *   • navigasi tab (atas untuk desktop, bawah untuk mobile)
 *   • state global panel + registry modul tab
 *
 * Modul tab (peserta.js, jadwal.js, ...) mendaftarkan dirinya lewat
 * Admin.register() sehingga core tidak perlu tahu detail masing-masing.
 */
const Admin = (function () {
  'use strict';

  /* ---------------- Ikon ---------------- */
  const wrap = (paths, sw) =>
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="' + (sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    paths + '</svg>';

  const Icons = {
    pencil:   () => wrap('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
    trash:    () => wrap('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>'),
    eye:      () => wrap('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    link:     () => wrap('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'),
    plus:     () => wrap('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 2),
    check:    () => wrap('<polyline points="20 6 9 17 4 12"/>', 2.2),
    x:        () => wrap('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 2),
    clock:    () => wrap('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    info:     () => wrap('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'),
    download: () => wrap('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    mail:     () => wrap('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
    wallet:   () => wrap('<path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/>'),
    user:     () => wrap('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    users:    () => wrap('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    school:   () => wrap('<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>'),
    pool:     () => wrap('<path d="M2 20c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1"/><path d="M2 16c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1"/><path d="M6 12V6a4 4 0 0 1 4-4M18 12V6a4 4 0 0 0-4-4"/>'),
    whatsapp: () => wrap('<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.2-5.2A8.5 8.5 0 1 1 21 11.5z"/>'),
    swap:     () => wrap('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
    star:     () => wrap('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
    calendar: () => wrap('<rect x="3" y="4" width="18" height="18" rx="2.5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    paperclip:() => wrap('<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>')
  };

  /* ---------------- Registry modul tab ---------------- */
  const modules = {};
  let activeTab = 'peserta';

  function register(name, mod) { modules[name] = mod; }

  /** Muat ulang seluruh tab dari cache lokal (dipanggil setelah sinkronisasi). */
  function refreshAll() {
    Object.keys(modules).forEach((k) => {
      try { if (modules[k].load) modules[k].load(); }
      catch (err) { console.error('[Admin] gagal memuat tab ' + k, err); }
    });
    renderTasks();
  }

  function refresh(names) {
    (Array.isArray(names) ? names : [names]).forEach((k) => {
      if (modules[k] && modules[k].load) modules[k].load();
    });
    renderTasks();
  }

  /* ---------------- Navigasi tab ---------------- */

  function visibleTabs() {
    return Array.from(document.querySelectorAll('#admin-tabs .tab')).filter((t) => !t.hidden);
  }

  function selectTab(name) {
    activeTab = name;
    document.querySelectorAll('#admin-tabs .tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    const panel = document.getElementById('tab-' + name);
    if (panel) panel.classList.add('active');

    document.querySelectorAll('#bottom-nav .bottom-nav__item').forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
    });

    try { sessionStorage.setItem('admin_tab', name); } catch (e) { /* abaikan */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Navigasi bawah untuk mobile dibangun dari daftar tab desktop sehingga
   * keduanya tidak pernah berbeda isi. Ibu jari lebih mudah menjangkau
   * bagian bawah layar, jadi menu utama dipindahkan ke sana pada breakpoint
   * mobile; desktop tetap memakai tab bar di atas.
   */
  function buildBottomNav() {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    nav.innerHTML = visibleTabs().map((t) =>
      '<button type="button" class="bottom-nav__item' + (t.dataset.tab === activeTab ? ' is-active' : '') + '" ' +
              'data-tab="' + t.dataset.tab + '">' +
        '<svg class="ic" aria-hidden="true"><use href="#' + t.dataset.icon + '"/></svg>' +
        '<span>' + t.querySelector('span').textContent + '</span>' +
      '</button>').join('');
  }

  function setupTabs() {
    document.getElementById('admin-tabs').addEventListener('click', (e) => {
      const t = e.target.closest('.tab');
      if (t) selectTab(t.dataset.tab);
    });
    document.getElementById('bottom-nav').addEventListener('click', (e) => {
      const b = e.target.closest('.bottom-nav__item');
      if (b) selectTab(b.dataset.tab);
    });

    let restored = 'peserta';
    try {
      const saved = sessionStorage.getItem('admin_tab');
      if (saved && document.getElementById('tab-' + saved)) restored = saved;
    } catch (e) { /* abaikan */ }
    selectTab(restored);
  }

  /** Tampilkan/sembunyikan elemen yang khusus untuk koordinator. */
  function applyRoleVisibility() {
    const isSuper = Auth.isSuperadmin();
    document.querySelectorAll('[data-role="superadmin"]').forEach((el) => { el.hidden = !isSuper; });
    document.body.classList.toggle('is-superadmin', isSuper);
    document.body.classList.toggle('is-admin', !isSuper);
  }

  /* ---------------- Helper UI ---------------- */

  function alert(title, htmlMessage, opts) {
    return UI.modal({
      title,
      size: 'sm',
      body: '<p style="font-size:15px;line-height:1.55;">' + htmlMessage + '</p>',
      actions: [{ label: (opts && opts.okLabel) || 'Mengerti', variant: 'primary' }]
    });
  }

  function skeleton(tbodyId, cols, rows) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    let html = '';
    for (let i = 0; i < (rows || 5); i++) {
      let tds = '';
      for (let c = 0; c < (cols || 6); c++) {
        tds += '<td><div class="skel-bar" style="width:' + (40 + Math.random() * 50) + '%"></div></td>';
      }
      html += '<tr class="skeleton-row">' + tds + '</tr>';
    }
    tbody.innerHTML = html;
  }

  function emptyRow(tbodyId, colspan, message) {
    const tbody = document.getElementById(tbodyId);
    if (tbody) tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="empty-cell">' + message + '</td></tr>';
  }

  const statusBadge = (status) => {
    const tone = status === 'Aktif' ? 'success'
               : status === 'Pending' ? 'warning'
               : status === 'Selesai' ? 'muted' : 'danger';
    return '<span class="status-badge ' + tone + '">' + Utils.escapeHtml(status) + '</span>';
  };

  /* ---------------- Kartu tugas ---------------- */

  function computeTasks() {
    const tasks = [];
    const isSuper = Auth.isSuperadmin();

    // Konfirmasi pembayaran adalah wewenang koordinator, bukan pelatih.
    if (isSuper) {
      Store.enrollment()
        .filter((e) => e.Status === 'pending')
        .forEach((e) => {
          const p = Store.findPeserta(e.Id_Peserta);
          if (!p) return;
          tasks.push({
            type: 'payment',
            id: e.Id_Enrollment,
            icon: Icons.wallet(),
            tag: 'Konfirmasi Pembayaran',
            title: p.Nama_Lengkap,
            meta: [
              (e.Kelas || '-') + ' • ' + (e.Durasi_Bulan || 1) + ' bulan',
              WITA.formatDate(e.Tanggal_Mulai) + ' s.d ' + WITA.formatDate(e.Tanggal_Akhir)
            ],
            cta: 'Tinjau & konfirmasi'
          });
        });
    }

    // Sesi hari ini yang menjadi tanggung jawab pengguna yang sedang login.
    const today = WITA.todayISO();
    const meId = Auth.getId();
    Store.jadwal()
      .filter((j) => WITA.toISODate(j.Tanggal) === today)
      .filter((j) => isSuper || j.Id_Pelatih === meId)
      .forEach((j) => {
        const st = ScheduleEngine.evaluate(j);
        if (st.status === 'Cancel') return;
        const hadir = Store.kehadiranOfJadwal(j.Id_Jadwal);
        tasks.push({
          type: 'jadwal',
          id: j.Id_Jadwal,
          icon: Icons.clock(),
          tag: 'Sesi Hari Ini',
          title: j.Id_Peserta ? 'Sesi Personal' : (j.Kelas || 'Sesi Grup'),
          meta: [ScheduleEngine.jamLabel(j) + ' • ' + j.Lokasi, st.countdown + ' • ' + hadir.length + ' respons'],
          cta: 'Buka daftar hadir'
        });
      });

    return tasks;
  }

  function renderTasks() {
    const section = document.getElementById('task-section');
    const scroller = document.getElementById('task-scroller');
    const badge = document.getElementById('task-count');
    const title = document.getElementById('task-title');
    if (!section || !scroller) return;

    title.textContent = Auth.isSuperadmin() ? 'Tugas Koordinator' : 'Tugas Pelatih Hari Ini';

    const tasks = computeTasks();
    if (!tasks.length) { section.hidden = true; scroller.innerHTML = ''; return; }
    section.hidden = false;
    badge.textContent = tasks.length;

    scroller.innerHTML = tasks.map((t) =>
      '<div class="task-card" data-type="' + t.type + '" data-id="' + t.id + '" role="button" tabindex="0">' +
        '<span class="task-card__tag">' + t.icon + ' ' + t.tag + '</span>' +
        '<div class="task-card__title">' + Utils.escapeHtml(t.title) + '</div>' +
        '<div class="task-card__meta">' + t.meta.map((m) => '<span>' + Utils.escapeHtml(m) + '</span>').join('') + '</div>' +
        '<div class="task-card__cta">' + t.cta + ' ›</div>' +
      '</div>').join('');

    scroller.querySelectorAll('.task-card').forEach((card) => {
      const open = () => {
        if (card.dataset.type === 'payment') AdminPeserta.openEnrollmentReview(card.dataset.id);
        else AdminJadwal.openAttendees(card.dataset.id);
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  return {
    Icons, register, refreshAll, refresh, setupTabs, selectTab, buildBottomNav,
    applyRoleVisibility, alert, skeleton, emptyRow, statusBadge, renderTasks,
    get activeTab() { return activeTab; }
  };
})();
