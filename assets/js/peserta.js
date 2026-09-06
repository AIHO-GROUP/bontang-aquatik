/**
 * =====================================================================
 * peserta.js — Dashboard peserta
 * =====================================================================
 * Alur utama:
 *   • Peserta selalu boleh masuk. Bila pembayaran belum dikonfirmasi,
 *     bagian jadwal digantikan panel terkunci berisi penjelasan dan
 *     tombol WhatsApp berisi identitas peserta.
 *   • Status setiap sesi dihitung dari waktu WITA (buka tepat jam mulai,
 *     tutup 2 jam kemudian) — tidak menunggu admin menekan tombol apa pun.
 *   • Riwayat periode pelatihan tampil lengkap, beserta tombol
 *     perpanjangan / bergabung kembali tanpa membuat akun baru.
 */

let cacheJadwalPeserta = [];
let lastFilteredJadwal = [];
let pesertaLengkapCache = null;
let raporCache = null;
let jadwalPager = null;
let tickTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireRole(CONFIG.ROLES.PESERTA)) return;
  Utils.mountNavbar('peserta');

  const user = Auth.getUser();
  document.getElementById('user-nama').textContent = user.nama || 'Peserta';
  document.getElementById('user-kelas').textContent = user.kelas || 'Belum ditentukan';

  document.getElementById('btn-rapor').addEventListener('click', openRaporModal);

  // Aksi yang menulis data disembunyikan saat mode "lihat sebagai" (baca-saja).
  const btnPerpanjang = document.getElementById('btn-perpanjang');
  if (Auth.isReadOnlyView()) btnPerpanjang.hidden = true;
  else btnPerpanjang.addEventListener('click', openPerpanjangModal);
  document.addEventListener('app:opensettings', () => PesertaSettings.open());

  [
    'search-jadwal-peserta', 'filter-jadwal-peserta-status',
    'filter-jadwal-peserta-kehadiran', 'sort-jadwal-peserta'
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', applyJadwalPesertaFilters);
    el.addEventListener('change', applyJadwalPesertaFilters);
  });

  document.addEventListener('jadwalviewchange', () => applyJadwalPesertaFilters());
  setupJadwalViewToggle();

  jadwalPager = new Paginator({
    mountId: 'jadwal-pager',
    storageKey: 'pgsize_jadwal_peserta',
    label: 'jadwal',
    onRender: (rows) => renderJadwalView(rows)
  });

  await Sync.init(
    ['Peserta', 'Jadwal', 'Kehadiran', 'Rapor', 'Berita', 'Pelatih', 'Enrollment'],
    () => loadDashboard()
  );
  loadDashboard();

  Utils.mountChangeNotice();
  Utils.mountPasswordNag();

  // Status sesi bergantung pada waktu berjalan, jadi tampilan disegarkan
  // setiap menit agar tombol absen terbuka/tertutup tepat waktu tanpa
  // pengguna perlu memuat ulang halaman.
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => loadDashboard({ silent: true }), 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadDashboard({ silent: true });
  });
});

/* =====================================================================
   PEMUATAN DASHBOARD
   ===================================================================== */
function loadDashboard() {
  const user = Auth.getUser();
  if (!user) return;

  const jadwalRes = BizLogic.getJadwalPeserta({ id_peserta: user.id });
  const hadirRes = BizLogic.getKehadiranPeserta({ id_peserta: user.id });

  // Sesi bisa berubah (mis. koordinator memperbarui grup); segarkan label.
  const peserta = Store.findPeserta(user.id);
  if (peserta) {
    document.getElementById('user-kelas').textContent = peserta.Kelas || 'Belum ditentukan';
    Auth.patchUser({ kelas: peserta.Kelas, nomor_peserta: peserta.Nomor_Peserta });
  }

  renderLockPanel(jadwalRes.akses);
  renderEnrollments();

  if (hadirRes.success) {
    const d = hadirRes.data;
    document.getElementById('stat-total').textContent = d.total_jadwal;
    document.getElementById('stat-hadir').textContent = d.total_hadir;
    document.getElementById('stat-hadir-sub').textContent =
      d.sesi_berlalu > 0 ? 'dari ' + d.sesi_berlalu + ' sesi yang sudah berlalu' : 'Belum ada sesi berlalu';
    document.getElementById('stat-persen').textContent = d.persentase + '%';
    document.getElementById('progress-fill').style.width = d.persentase + '%';
  }

  const locked = !!jadwalRes.locked;
  document.getElementById('jadwal-section').hidden = locked;
  document.getElementById('stats-grid').hidden = locked;

  cacheJadwalPeserta = jadwalRes.data || [];
  applyJadwalPesertaFilters();
  renderUpcomingReminder();
  loadBeritaPeserta();
}

/* =====================================================================
   PANEL TERKUNCI (payment-gated access)
   ===================================================================== */
function renderLockPanel(akses) {
  const panel = document.getElementById('lock-panel');
  if (!akses || akses.allowed) {
    // Periode habis tetap ditampilkan sebagai ajakan, bukan penguncian.
    if (akses && akses.expired) {
      renderExpiredPanel(akses);
      return;
    }
    panel.hidden = true;
    return;
  }

  const peserta = Store.findPeserta(Auth.getId());
  panel.hidden = false;
  panel.classList.remove('is-expired');
  document.getElementById('lock-title').textContent = 'Jadwal Latihan Masih Terkunci';
  document.getElementById('lock-message').textContent = akses.message;

  const pending = akses.pendingEnrollment;
  document.getElementById('lock-meta').innerHTML = pending
    ? '<div class="lock-meta__row"><span>Grup diajukan</span><strong>' +
        Utils.escapeHtml(pending.Kelas || '-') + '</strong></div>' +
      '<div class="lock-meta__row"><span>Periode diajukan</span><strong>' +
        WITA.formatDate(pending.Tanggal_Mulai) + ' s.d ' + WITA.formatDate(pending.Tanggal_Akhir) + '</strong></div>' +
      '<div class="lock-meta__row"><span>Nomor peserta</span><strong>' +
        Utils.escapeHtml((peserta && peserta.Nomor_Peserta) || '-') + '</strong></div>'
    : '';

  const actions = document.getElementById('lock-actions');
  actions.innerHTML = '<button type="button" class="btn btn-success btn-lg" id="lock-wa">' +
    'Konfirmasi Pembayaran via WhatsApp</button>';
  document.getElementById('lock-wa').addEventListener('click', () => {
    WA.open(WA.Templates.konfirmasiPembayaran(peserta || Auth.getUser()));
  });
}

function renderExpiredPanel(akses) {
  const panel = document.getElementById('lock-panel');
  const peserta = Store.findPeserta(Auth.getId());
  panel.hidden = false;
  panel.classList.add('is-expired');
  document.getElementById('lock-title').textContent = 'Periode Pelatihan Anda Telah Berakhir';
  document.getElementById('lock-message').textContent = akses.message;
  document.getElementById('lock-meta').innerHTML =
    '<div class="lock-meta__row"><span>Periode terakhir</span><strong>' +
      WITA.formatDate(akses.lastEnrollment.Tanggal_Mulai) + ' s.d ' +
      WITA.formatDate(akses.lastEnrollment.Tanggal_Akhir) + '</strong></div>';

  const actions = document.getElementById('lock-actions');
  if (Auth.isReadOnlyView()) {
    // Mode "lihat sebagai" tidak boleh membuat pengajuan atas nama peserta.
    actions.innerHTML = '<span class="text-muted">Mode lihat sebagai (baca-saja)</span>';
    return;
  }
  actions.innerHTML =
    '<button type="button" class="btn btn-accent btn-lg" id="lock-extend">Ajukan Perpanjangan</button>';
  document.getElementById('lock-extend').addEventListener('click', openPerpanjangModal);
}

/* =====================================================================
   RIWAYAT PERIODE PELATIHAN
   ===================================================================== */
function renderEnrollments() {
  const list = document.getElementById('enrollment-list');
  const items = BizLogic.getEnrollments(Auth.getId());

  if (!items.length) {
    UI.emptyState(list, {
      icon: '📄',
      title: 'Belum ada periode pelatihan',
      message: 'Periode pelatihan akan muncul di sini setelah pendaftaran Anda tercatat.'
    });
    return;
  }

  const today = WITA.todayISO();
  list.innerHTML = items.slice().reverse().map((e, idx) => {
    const meta = CONFIG.ENROLLMENT_STATUS[e.Status] || { label: e.Status, tone: 'muted' };
    const berjalan = e.Status !== 'pending' &&
      WITA.diffDays(e.Tanggal_Mulai, today) >= 0 && WITA.diffDays(today, e.Tanggal_Akhir) >= 0;
    const sisaHari = WITA.diffDays(today, e.Tanggal_Akhir);

    return '<article class="enrollment-card' + (berjalan ? ' is-current' : '') + '">' +
      '<div class="enrollment-card__head">' +
        '<span class="enrollment-card__seq">Periode ' + (items.length - idx) + '</span>' +
        '<span class="status-badge ' + meta.tone + '">' + meta.label + '</span>' +
      '</div>' +
      '<div class="enrollment-card__range">' +
        WITA.formatDate(e.Tanggal_Mulai) + ' — ' + WITA.formatDate(e.Tanggal_Akhir) +
      '</div>' +
      '<div class="enrollment-card__meta">' +
        '<span>' + Utils.escapeHtml(e.Kelas || '-') + '</span>' +
        '<span>' + (e.Durasi_Bulan || 1) + ' bulan</span>' +
        '<span>' + (BizUtil.isTrue(e.Status_Pembayaran) ? 'Lunas' : 'Belum lunas') + '</span>' +
      '</div>' +
      (berjalan && sisaHari >= 0
        ? '<div class="enrollment-card__note">Tersisa ' + sisaHari + ' hari latihan</div>' : '') +
      (e.Catatan ? '<div class="enrollment-card__catatan">' + Utils.escapeHtml(e.Catatan) + '</div>' : '') +
    '</article>';
  }).join('');
}

/**
 * Pengajuan perpanjangan / bergabung kembali.
 * Tidak pernah membuat akun baru — hanya menambah periode pada akun yang sama.
 */
function openPerpanjangModal() {
  const id = Auth.getId();
  const peserta = Store.findPeserta(id);
  const current = BizLogic.currentEnrollment(id);
  const mulaiDefault = current ? WITA.addDays(current.Tanggal_Akhir, 1) : WITA.todayISO();
  const isRejoin = !current;

  const kelasOpts = CONFIG.KELAS_OPTIONS.map((k) =>
    '<option value="' + k + '"' + (k === (peserta && peserta.Kelas) ? ' selected' : '') + '>' + k + '</option>'
  ).join('');
  const durasiOpts = CONFIG.DURASI_OPTIONS.map((n) =>
    '<option value="' + n + '">' + n + ' bulan</option>').join('');

  const body =
    '<p class="form-helper">' +
      (isRejoin
        ? 'Anda akan <strong>bergabung kembali</strong> memakai akun yang sama. Seluruh riwayat latihan dan rapor Anda tetap tersimpan.'
        : 'Periode baru akan <strong>menyambung</strong> setelah periode berjalan berakhir. Riwayat lama tidak terhapus.') +
    '</p>' +
    '<div class="form-group"><label for="ext-kelas">Grup Latihan</label>' +
      '<select id="ext-kelas" class="form-control">' + kelasOpts + '</select></div>' +
    '<div class="form-grid-2">' +
      '<div class="form-group"><label for="ext-durasi">Durasi</label>' +
        '<select id="ext-durasi" class="form-control">' + durasiOpts + '</select></div>' +
      '<div class="form-group"><label for="ext-mulai">Mulai</label>' +
        '<input type="date" id="ext-mulai" class="form-control" value="' + mulaiDefault + '"' +
        (isRejoin ? '' : ' readonly') + '></div>' +
    '</div>' +
    '<div class="form-group"><label>Perkiraan Berakhir</label>' +
      '<input type="text" id="ext-akhir" class="form-control" readonly></div>';

  const m = UI.modal({
    title: isRejoin ? 'Bergabung Kembali' : 'Perpanjang Pelatihan',
    size: 'sm',
    body,
    actions: [{ label: 'Batal', variant: 'secondary' }]
  });

  const kelasEl = m.el.querySelector('#ext-kelas');
  const durasiEl = m.el.querySelector('#ext-durasi');
  const mulaiEl = m.el.querySelector('#ext-mulai');
  const akhirEl = m.el.querySelector('#ext-akhir');

  const recalc = () => {
    const iso = WITA.addMonths(mulaiEl.value, parseInt(durasiEl.value, 10) || 1);
    akhirEl.value = WITA.formatDateLong(iso);
    akhirEl.dataset.iso = iso;
  };
  durasiEl.addEventListener('change', recalc);
  mulaiEl.addEventListener('change', recalc);
  recalc();

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'btn btn-accent btn-block';
  submit.style.marginTop = '12px';
  submit.textContent = 'Ajukan & Hubungi Admin';
  submit.addEventListener('click', async () => {
    submit.disabled = true;
    Utils.showLoader(true);
    const res = await BizLogic.requestExtension({
      id_peserta: id,
      kelas: kelasEl.value,
      durasi: parseInt(durasiEl.value, 10),
      mulai: mulaiEl.value
    });
    Utils.showLoader(false);
    submit.disabled = false;

    if (!res.success) {
      UI.toast(res.message, res.code === 'PENDING_EXISTS' ? 'warning' : 'error', { duration: 6000 });
      if (res.code === 'PENDING_EXISTS') {
        WA.open(WA.Templates.perpanjangan(peserta, {
          kelas: res.data.Kelas, durasi: res.data.Durasi_Bulan, mulai: res.data.Tanggal_Mulai
        }));
        m.close();
      }
      return;
    }

    m.close();
    UI.toast(res.message, 'success', { duration: 5000 });
    WA.open(WA.Templates.perpanjangan(peserta, {
      kelas: kelasEl.value, durasi: parseInt(durasiEl.value, 10), mulai: mulaiEl.value
    }));
    loadDashboard();
  });
  m.el.querySelector('.modal-body').appendChild(submit);
}

/* =====================================================================
   FILTER, SORT & PAGINATION JADWAL
   ===================================================================== */
function applyJadwalPesertaFilters() {
  const q = (document.getElementById('search-jadwal-peserta')?.value || '').toLowerCase();
  const statusF = document.getElementById('filter-jadwal-peserta-status')?.value || '';
  const kehadiranF = document.getElementById('filter-jadwal-peserta-kehadiran')?.value || '';
  const sort = document.getElementById('sort-jadwal-peserta')?.value || 'upcoming';

  let list = cacheJadwalPeserta.filter((j) => {
    if (q) {
      const haystack = [
        WITA.formatDate(j.Tanggal), j.Tanggal, j.jam_label, j.Lokasi, j.Kelas
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (statusF && j.Status !== statusF) return false;

    const myStatus = j.sudah_absen ? j.status_kehadiran : 'belum';
    if (kehadiranF && myStatus !== kehadiranF) return false;
    return true;
  });

  const today = WITA.todayISO();
  list.sort((a, b) => {
    const da = a.Tanggal, db = b.Tanggal;
    if (sort === 'tanggal-asc') return da.localeCompare(db);
    if (sort === 'upcoming') {
      const aFuture = WITA.diffDays(today, da) >= 0;
      const bFuture = WITA.diffDays(today, db) >= 0;
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      return aFuture ? da.localeCompare(db) : db.localeCompare(da);
    }
    return db.localeCompare(da);
  });

  const counter = document.getElementById('jadwal-count');
  if (counter) {
    const total = cacheJadwalPeserta.length;
    counter.textContent = list.length === total
      ? total + ' jadwal'
      : list.length + ' dari ' + total + ' jadwal';
  }

  lastFilteredJadwal = list;
  const mode = viewMode();
  // Kalender selalu menampilkan seluruh bulan, jadi pagination hanya
  // relevan untuk tampilan grid.
  document.getElementById('jadwal-pager').hidden = (mode === 'calendar');
  if (mode === 'calendar') renderJadwalCalendar(list);
  else jadwalPager.setData(list);
}

function viewMode() {
  return (window.PesertaSettings && PesertaSettings.getViewMode()) || 'grid';
}

function setupJadwalViewToggle() {
  const group = document.getElementById('jadwal-view-toggle');
  if (!group) return;
  const buttons = group.querySelectorAll('button[data-val]');

  const sync = () => {
    const mode = viewMode();
    buttons.forEach((b) => {
      const active = b.dataset.val === mode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };

  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-val]');
    if (!btn || btn.classList.contains('active')) return;
    PesertaSettings.setViewMode(btn.dataset.val);
  });

  document.addEventListener('jadwalviewchange', sync);
  sync();
}

function renderJadwalView(rows) {
  if (viewMode() === 'calendar') renderJadwalCalendar(lastFilteredJadwal);
  else renderJadwalGrid(rows);
}

/* =====================================================================
   TAMPILAN GRID
   ===================================================================== */
function statusTone(status) {
  if (status === 'Aktif') return 'badge-success';
  if (status === 'Pending') return 'badge-warning';
  if (status === 'Selesai') return 'badge-muted';
  return 'badge-danger';
}

function actionButtonFor(j) {
  if (j.sudah_absen) {
    return j.status_kehadiran === 'hadir'
      ? '<button class="btn btn-sm btn-success" disabled>✓ Sudah Absen</button>'
      : '<button class="btn btn-sm btn-secondary" disabled>📝 Sudah Izin</button>';
  }
  if (j.can_attend) {
    return '<button class="btn btn-sm btn-accent" data-absen="' + j.Id_Jadwal + '">Absen / Izin</button>';
  }
  if (j.Status === 'Pending') {
    return '<button class="btn btn-sm btn-secondary" data-izin="' + j.Id_Jadwal + '">Ajukan Izin</button>';
  }
  if (j.Status === 'Cancel') return '<button class="btn btn-sm btn-secondary" disabled>Dibatalkan</button>';
  return '<button class="btn btn-sm btn-secondary" disabled>Absensi Ditutup</button>';
}

function renderJadwalGrid(jadwals) {
  const container = document.getElementById('jadwal-list');

  if (!jadwals || jadwals.length === 0) {
    const isFiltered = cacheJadwalPeserta.length > 0;
    container.innerHTML = isFiltered
      ? '<div class="empty-state"><div class="icon">🔍</div>' +
        '<p>Tidak ada jadwal yang cocok dengan filter Anda.</p>' +
        '<p class="text-muted" style="font-size:13px;margin-top:6px;">Coba ubah kata kunci atau atur ulang filter.</p></div>'
      : '<div class="empty-state"><div class="icon">📅</div>' +
        '<p>Belum ada jadwal pelatihan untuk grup Anda.</p>' +
        '<p class="text-muted" style="font-size:13px;margin-top:6px;">Jadwal terbuat otomatis setelah pembayaran dikonfirmasi.</p></div>';
    return;
  }

  container.innerHTML = '<div class="jadwal-grid">' + jadwals.map((j) =>
    '<div class="jadwal-card' + (j.is_personal ? ' is-personal' : '') +
        (j.Status === 'Aktif' ? ' is-live' : '') + '">' +
      '<div class="jadwal-date">' + Utils.escapeHtml(WITA.formatDate(j.Tanggal)) +
        (j.is_personal ? '<span class="badge badge-personal" title="Jadwal personal">⭐ PERSONAL</span>' : '') +
      '</div>' +
      '<h4>' + Utils.escapeHtml(j.Kelas) + '</h4>' +
      '<div class="jadwal-info">' +
        '<span>🕐 ' + Utils.escapeHtml(j.jam_label) + '</span>' +
        '<span>📍 ' + Utils.escapeHtml(j.Lokasi) + '</span>' +
      '</div>' +
      '<div class="jadwal-countdown">' + Utils.escapeHtml(j.countdown) + '</div>' +
      '<div class="jadwal-actions">' +
        '<span class="badge ' + statusTone(j.Status) + '">' + Utils.escapeHtml(j.Status) + '</span>' +
        actionButtonFor(j) +
      '</div>' +
    '</div>').join('') + '</div>';

  bindJadwalActions(container);
}

function bindJadwalActions(root) {
  root.querySelectorAll('[data-absen]').forEach((b) =>
    b.addEventListener('click', () => openAbsenModal(b.dataset.absen, 'hadir')));
  root.querySelectorAll('[data-izin]').forEach((b) =>
    b.addEventListener('click', () => openAbsenModal(b.dataset.izin, 'izin')));
}

/* =====================================================================
   TAMPILAN KALENDER
   ===================================================================== */
let calMonth = null;

function renderJadwalCalendar(list) {
  const container = document.getElementById('jadwal-list');
  if (!calMonth) {
    const today = WITA.todayISO();
    const upcoming = list.filter((j) => WITA.diffDays(today, j.Tanggal) >= 0)
      .sort((a, b) => a.Tanggal.localeCompare(b.Tanggal))[0];
    const base = upcoming ? upcoming.Tanggal : today;
    calMonth = base.slice(0, 7);
  }

  const byDate = {};
  list.forEach((j) => { (byDate[j.Tanggal] = byDate[j.Tanggal] || []).push(j); });

  const [year, month] = calMonth.split('-').map(Number);
  const firstDow = WITA.dayOfWeek(calMonth + '-01');
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const todayISO = WITA.todayISO();

  const dotClass = (s) =>
    s === 'Aktif' ? 'aktif' : s === 'Pending' ? 'pending' : s === 'Selesai' ? 'selesai' : 'cancel';

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell cal-cell--empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = calMonth + '-' + String(d).padStart(2, '0');
    const items = byDate[iso] || [];
    const dots = items.slice(0, 3).map((j) => '<span class="cal-dot ' + dotClass(j.Status) + '"></span>').join('');
    const more = items.length > 3 ? '<span class="cal-more">+' + (items.length - 3) + '</span>' : '';
    cells +=
      '<div class="cal-cell ' + (items.length ? 'has-events' : '') + ' ' + (iso === todayISO ? 'is-today' : '') + '"' +
        (items.length ? ' role="button" tabindex="0" data-day="' + iso + '"' : '') + '>' +
        '<span class="cal-daynum">' + d + '</span>' +
        (items.length ? '<span class="cal-dots">' + dots + more + '</span>' : '') +
      '</div>';
  }

  container.innerHTML =
    '<div class="cal-wrap">' +
      '<div class="cal-head">' +
        '<button class="cal-nav" data-cal="-1" aria-label="Bulan sebelumnya">‹</button>' +
        '<div class="cal-title">' + WITA.MONTH_LONG[month - 1] + ' ' + year + '</div>' +
        '<button class="cal-nav" data-cal="1" aria-label="Bulan berikutnya">›</button>' +
      '</div>' +
      '<div class="cal-today-row"><button class="btn btn-sm btn-secondary" data-cal="today">Hari ini</button></div>' +
      '<div class="cal-grid cal-weekdays">' +
        WITA.DAY_SHORT.map((w) => '<div class="cal-weekday">' + w + '</div>').join('') +
      '</div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="cal-legend">' +
        '<span><span class="cal-dot aktif"></span> Berlangsung</span>' +
        '<span><span class="cal-dot pending"></span> Belum dibuka</span>' +
        '<span><span class="cal-dot selesai"></span> Selesai</span>' +
        '<span><span class="cal-dot cancel"></span> Dibatalkan</span>' +
      '</div>' +
    '</div>';

  container.querySelectorAll('[data-cal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.cal === 'today') calMonth = WITA.todayISO().slice(0, 7);
      else {
        const delta = Number(btn.dataset.cal);
        const d = new Date(Date.UTC(year, month - 1 + delta, 1));
        calMonth = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
      }
      renderJadwalCalendar(lastFilteredJadwal);
    });
  });

  container.querySelectorAll('[data-day]').forEach((cell) => {
    const open = () => openCalendarDay(cell.dataset.day);
    cell.addEventListener('click', open);
    cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

function openCalendarDay(iso) {
  const items = lastFilteredJadwal.filter((j) => j.Tanggal === iso);
  if (!items.length) return;

  const rows = items.map((j) =>
    '<li class="cal-day-item ' + (j.is_personal ? 'is-personal' : '') + '">' +
      '<div><strong>' + Utils.escapeHtml(j.Kelas) + '</strong>' +
        (j.is_personal ? ' <span class="badge badge-personal">⭐ Personal</span>' : '') +
        '<div class="cal-day-meta">🕐 ' + Utils.escapeHtml(j.jam_label) +
        ' • 📍 ' + Utils.escapeHtml(j.Lokasi) + '</div>' +
        '<div class="cal-day-meta">' + Utils.escapeHtml(j.countdown) + '</div>' +
      '</div>' +
      '<div class="cal-day-action">' +
        '<span class="badge ' + statusTone(j.Status) + '">' + Utils.escapeHtml(j.Status) + '</span>' +
        actionButtonFor(j) +
      '</div>' +
    '</li>').join('');

  const m = UI.modal({
    title: WITA.formatDateFull(iso),
    size: 'sm',
    body: '<ul class="cal-day-list">' + rows + '</ul>'
  });
  m.el.querySelectorAll('[data-absen]').forEach((b) =>
    b.addEventListener('click', () => { m.close(); openAbsenModal(b.dataset.absen, 'hadir'); }));
  m.el.querySelectorAll('[data-izin]').forEach((b) =>
    b.addEventListener('click', () => { m.close(); openAbsenModal(b.dataset.izin, 'izin'); }));
}

/* =====================================================================
   PENGINGAT ABSENSI
   ===================================================================== */
function renderUpcomingReminder() {
  const section = document.getElementById('upcoming-reminder-section');
  const scroller = document.getElementById('reminder-scroller');
  const badge = document.getElementById('reminder-count');
  if (!section || !scroller) return;

  const today = WITA.todayISO();
  const items = cacheJadwalPeserta
    .filter((j) => !j.sudah_absen &&
                   WITA.diffDays(today, j.Tanggal) >= 0 &&
                   ['Aktif', 'Pending'].includes(j.Status))
    .sort((a, b) => a.Tanggal.localeCompare(b.Tanggal))
    .slice(0, 6);

  if (!items.length) { section.hidden = true; scroller.innerHTML = ''; return; }
  section.hidden = false;
  badge.textContent = items.length;

  scroller.innerHTML = items.map((j) => {
    const live = j.Status === 'Aktif';
    return '<div class="reminder-card' + (live ? ' is-today' : '') + '" role="button" tabindex="0" ' +
        'data-absen="' + j.Id_Jadwal + '">' +
      '<span class="reminder-card__tag">' + (live ? '🟢 Absensi Dibuka' : '📅 ' + WITA.relativeLabel(j.Tanggal)) + '</span>' +
      '<div class="reminder-card__title">' + Utils.escapeHtml(j.Kelas) +
        (j.is_personal ? ' <span class="badge badge-personal">⭐</span>' : '') + '</div>' +
      '<div class="reminder-card__meta">' +
        '<span>📅 ' + Utils.escapeHtml(WITA.formatDateLong(j.Tanggal)) + '</span>' +
        '<span>🕐 ' + Utils.escapeHtml(j.jam_label) + '</span>' +
        '<span>📍 ' + Utils.escapeHtml(j.Lokasi) + '</span>' +
      '</div>' +
      '<div class="reminder-card__cta">' + Utils.escapeHtml(j.countdown) + ' ›</div>' +
    '</div>';
  }).join('');

  scroller.querySelectorAll('[data-absen]').forEach((card) => {
    const open = () => openAbsenModal(card.dataset.absen);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

/* =====================================================================
   MODAL ABSENSI
   ===================================================================== */
function openAbsenModal(idJadwal, mode) {
  const j = cacheJadwalPeserta.find((x) => x.Id_Jadwal === idJadwal);
  if (!j) return;
  const eq = CONFIG.EQUIPMENT_INFO;

  const body =
    '<div class="absen-summary">' +
      '<strong>' + Utils.escapeHtml(j.Kelas) + '</strong>' +
      '<span>' + Utils.escapeHtml(WITA.formatDateFull(j.Tanggal)) + '</span>' +
      '<span>🕐 ' + Utils.escapeHtml(j.jam_label) + ' • 📍 ' + Utils.escapeHtml(j.Lokasi) + '</span>' +
      '<span class="absen-summary__status">' + Utils.escapeHtml(j.countdown) + '</span>' +
    '</div>' +
    '<div class="equipment-section">' +
      '<h4>🏊 Persiapan Latihan</h4>' +
      '<details class="equipment-detail" open><summary><strong>A. Pemula</strong></summary>' +
        '<ul>' + eq.pemula.map((i) => '<li>' + Utils.escapeHtml(i) + '</li>').join('') + '</ul></details>' +
      '<details class="equipment-detail"><summary><strong>B. Tingkat Lanjut</strong> ' +
        '<small>(menguasai minimal 2 gaya, 25 m)</small></summary>' +
        '<ul>' + eq.lanjut.map((i) => '<li>' + Utils.escapeHtml(i) + '</li>').join('') + '</ul></details>' +
      '<details class="equipment-detail"><summary><strong>C. Perlengkapan Lain</strong></summary>' +
        '<ul>' + eq.lain.map((i) => '<li>' + Utils.escapeHtml(i) + '</li>').join('') + '</ul></details>' +
      '<details class="equipment-detail"><summary><strong>D. Informasi Tambahan</strong></summary>' +
        '<ul>' + eq.tambahan.map((i) => '<li>' + Utils.escapeHtml(i) + '</li>').join('') + '</ul></details>' +
    '</div>' +
    (j.can_attend
      ? '<label class="checkbox-row"><input type="checkbox" id="agree-checkbox">' +
        '<span>Saya telah memahami dan akan mempersiapkan peralatan yang diperlukan.</span></label>'
      : '<div class="info-banner info-banner--soft"><div aria-hidden="true">ℹ️</div>' +
        '<p>Absensi kehadiran belum dibuka. Anda tetap dapat mengajukan <strong>izin</strong> lebih awal.</p></div>') +
    '<div id="izin-section" class="' + (mode === 'izin' || !j.can_attend ? '' : 'hidden') + '">' +
      '<hr class="divider">' +
      '<label for="catatan-izin">Alasan tidak hadir <span class="text-muted">(wajib diisi)</span></label>' +
      '<textarea id="catatan-izin" class="form-control" rows="3" ' +
        'placeholder="Contoh: sakit, ada acara keluarga, ..."></textarea>' +
    '</div>';

  const m = UI.modal({ title: '📋 Konfirmasi Absensi', size: 'sm', body });
  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const izinBtn = document.createElement('button');
  izinBtn.className = 'btn btn-warning';
  izinBtn.textContent = (mode === 'izin' || !j.can_attend) ? '📤 Kirim Izin' : '📝 Izin';

  const hadirBtn = document.createElement('button');
  hadirBtn.className = 'btn btn-primary';
  hadirBtn.textContent = '✓ Ya, Saya Hadir';
  hadirBtn.disabled = true;
  hadirBtn.hidden = !j.can_attend;

  const agree = m.el.querySelector('#agree-checkbox');
  if (agree) agree.addEventListener('change', () => { hadirBtn.disabled = !agree.checked; });

  const izinSection = m.el.querySelector('#izin-section');
  let izinMode = (mode === 'izin' || !j.can_attend);

  izinBtn.addEventListener('click', async () => {
    if (!izinMode) {
      izinMode = true;
      izinSection.classList.remove('hidden');
      izinBtn.textContent = '📤 Kirim Izin';
      hadirBtn.hidden = true;
      m.el.querySelector('#catatan-izin').focus();
      return;
    }
    const catatan = m.el.querySelector('#catatan-izin').value.trim();
    if (!catatan) { UI.toast('Mohon isi alasan tidak hadir', 'warning'); return; }

    izinBtn.disabled = true;
    Utils.showLoader(true);
    const res = await BizLogic.izin({ id_jadwal: idJadwal, id_peserta: Auth.getId(), catatan });
    Utils.showLoader(false);
    izinBtn.disabled = false;

    if (res.success) { UI.toast(res.message, 'success'); m.close(); loadDashboard(); }
    else UI.toast(res.message, 'error');
  });

  hadirBtn.addEventListener('click', async () => {
    hadirBtn.disabled = true;
    Utils.showLoader(true);
    const res = await BizLogic.absen({ id_jadwal: idJadwal, id_peserta: Auth.getId() });
    Utils.showLoader(false);
    hadirBtn.disabled = false;

    if (res.success) { UI.toast(res.message, 'success'); m.close(); loadDashboard(); }
    else UI.toast(res.message, 'error', { duration: 5000 });
  });

  const cancel = document.createElement('button');
  cancel.className = 'btn btn-secondary';
  cancel.textContent = 'Batal';
  cancel.addEventListener('click', () => m.close());

  footer.appendChild(cancel);
  footer.appendChild(izinBtn);
  footer.appendChild(hadirBtn);
  m.el.appendChild(footer);
}

/* =====================================================================
   BERITA
   ===================================================================== */
let beritaCachePeserta = [];

function loadBeritaPeserta() {
  const peserta = Store.findPeserta(Auth.getId());
  const res = BizLogic.getAllBerita({ kelas: (peserta && peserta.Kelas) || '' });
  if (!res.success) return;
  beritaCachePeserta = res.data || [];
  renderBeritaPeserta();
}

function renderBeritaPeserta() {
  const section = document.getElementById('berita-section');
  const list = document.getElementById('berita-list');
  const count = document.getElementById('berita-count');
  if (!section || !list) return;

  if (!beritaCachePeserta.length) { section.hidden = true; return; }
  section.hidden = false;
  count.textContent = beritaCachePeserta.length;

  list.innerHTML = beritaCachePeserta.map((b, i) =>
    '<article class="berita-card" role="button" tabindex="0" data-berita="' + i + '">' +
      '<div class="berita-card__date">' + WITA.formatDate(b.Tanggal) +
        (b.has_file ? ' • 📎 ' + Utils.escapeHtml(b.file_label) : '') + '</div>' +
      '<h4 class="berita-card__title">' + Utils.escapeHtml(b.Judul) + '</h4>' +
      '<p class="berita-card__excerpt">' +
        Utils.escapeHtml((b.Deskripsi || '').substring(0, 110)) +
        ((b.Deskripsi || '').length > 110 ? '…' : '') + '</p>' +
      '<span class="berita-card__cta">Baca selengkapnya →</span>' +
    '</article>').join('');

  list.querySelectorAll('[data-berita]').forEach((card) => {
    const open = () => openBeritaPesertaModal(Number(card.dataset.berita));
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  });
}

function openBeritaPesertaModal(i) {
  const b = beritaCachePeserta[i];
  if (!b) return;

  const lampiran = b.has_file
    ? '<a href="' + Utils.escapeHtml(b.File_Url) + '" target="_blank" rel="noopener" ' +
      'class="btn btn-secondary btn-block" style="margin-top:12px;">📎 Buka Lampiran (' +
      Utils.escapeHtml(b.file_label) + ')</a>'
    : '';
  const link = b.Link
    ? '<a href="' + Utils.escapeHtml(b.Link) + '" target="_blank" rel="noopener" ' +
      'class="btn btn-accent btn-block" style="margin-top:10px;">🔗 Buka Sumber Informasi</a>'
    : '';

  UI.modal({
    title: b.Judul,
    size: 'md',
    body:
      '<div class="berita-modal-date">📅 ' + WITA.formatDateLong(b.Tanggal) +
        (b.nama_penulis ? ' • ✍️ ' + Utils.escapeHtml(b.nama_penulis) : '') + '</div>' +
      '<p class="berita-modal-desc">' +
        Utils.escapeHtml(b.Deskripsi || '-').replace(/\n/g, '<br>') + '</p>' +
      lampiran + link,
    actions: [{ label: 'Tutup', variant: 'secondary' }]
  });
}

/* =====================================================================
   RAPOR
   ===================================================================== */
function openRaporModal() {
  const id = Auth.getId();
  const raporRes = BizLogic.getRaporPeserta({ id_peserta: id });
  const pesertaRes = BizLogic.getDataLengkapPeserta({ id_peserta: id });

  if (pesertaRes.success) pesertaLengkapCache = pesertaRes.data;
  raporCache = raporRes.data || null;

  let body;
  if (!raporCache) {
    body = '<div class="empty-state"><div class="icon">📝</div><h3>Rapor Belum Tersedia</h3>' +
           '<p>Rapor akan tersedia setelah pelatih mengisi data evaluasi Anda.</p></div>';
  } else {
    const r = raporCache;
    const fmt = (v) => (v && String(v).trim() && String(v).trim() !== '-') ? String(v).trim() : '-';
    const periode = getSemesterPeriode(pesertaLengkapCache && pesertaLengkapCache.Tanggal_Mulai);

    const rows = CONFIG.GAYA_RENANG.map((g, i) =>
      '<tr><td>' + (i + 1) + '</td><td>' + g.label + '</td>' +
      '<td>' + fmt(r['Waktu_25_' + g.key + '_Pelampung']) + '</td>' +
      '<td>' + fmt(r['Waktu_25_' + g.key]) + '</td>' +
      '<td>' + fmt(r['Waktu_50_' + g.key]) + '</td></tr>').join('');

    body =
      '<div class="rapor-display">' +
        '<div class="rapor-section">' +
          '<h4 class="rapor-section-title">📊 Capaian Hasil Latihan Renang</h4>' +
          '<p class="rapor-periode">Periode: <em>' +
            WITA.formatDateLong(periode.start) + ' s.d ' + WITA.formatDateLong(periode.end) + '</em></p>' +
          '<div class="rapor-table-scroll"><table class="rapor-table">' +
            '<thead><tr><th>NO.</th><th>GAYA RENANG</th>' +
              '<th>25 M<br><small>(Dengan Pelampung)</small></th>' +
              '<th>25 M<br><small>(Tanpa Pelampung)</small></th>' +
              '<th>50 M</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>' +
        '</div>' +
        '<div class="rapor-section">' +
          '<div class="rapor-field"><label>Predikat</label>' +
            '<div class="rapor-value-box">' + (Utils.escapeHtml(r.Predikat) || '-') + '</div></div>' +
          '<div class="rapor-field"><label>Deskripsi</label>' +
            '<div class="rapor-value-box tall">' + (Utils.escapeHtml(r.Catatan) || '-') + '</div></div>' +
        '</div>' +
        '<p class="rapor-pelatih">Pelatih penilai: <strong>' +
          (Utils.escapeHtml(r.Nama_Pelatih) || '-') + '</strong></p>' +
      '</div>';
  }

  const m = UI.modal({
    title: '📒 Rapor Latihan',
    size: 'md',
    body,
    actions: [{ label: 'Tutup', variant: 'secondary' }]
  });

  if (raporCache) {
    const dl = document.createElement('button');
    dl.className = 'btn btn-accent btn-block';
    dl.style.marginTop = '12px';
    dl.textContent = '📥 Unduh PDF';
    dl.addEventListener('click', () => downloadRaporPDF(dl));
    m.el.querySelector('.modal-body').appendChild(dl);
  }
}

async function downloadRaporPDF(btn) {
  if (!pesertaLengkapCache) {
    const res = BizLogic.getDataLengkapPeserta({ id_peserta: Auth.getId() });
    if (!res.success) { UI.toast('Gagal memuat data peserta', 'error'); return; }
    pesertaLengkapCache = res.data;
  }
  if (!raporCache) { UI.toast('Data rapor tidak tersedia', 'error'); return; }

  if (btn) btn.disabled = true;
  Utils.showLoader(true);
  try {
    await PDFRapor.generate(pesertaLengkapCache, raporCache);
  } catch (err) {
    console.error(err);
    UI.toast('Gagal membuat PDF: ' + err.message, 'error');
  } finally {
    Utils.showLoader(false);
    if (btn) btn.disabled = false;
  }
}
