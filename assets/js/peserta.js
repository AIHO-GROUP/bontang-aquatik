// =====================================================================
// Dashboard Peserta — Gabungan:
//   • LOGIKA   : kode pertama (rapor tabel 4 gaya × 2 jarak + PDF,
//                jadwal personal, cache data peserta lengkap)
//   • TAMPILAN : kode kedua (grid card jadwal + modal absen
//                lengkap dengan checklist equipment + counter jadwal)
//
// Filter & sort lengkap (tidak ada yang dihilangkan):
//   - Search           : tanggal / pukul / lokasi / kelas
//   - Filter status    : Aktif / Pending / Cancel        (status jadwal)
//   - Filter kehadiran : hadir / izin / belum             (status saya)
//   - Filter tipe      : kelas / personal                 (is_personal)
//   - Sort tanggal     : newest / oldest / upcoming
// =====================================================================

let cacheJadwalPeserta = [];
let pesertaLengkapCache = null;
let raporCache = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Auth guard — toleran terhadap dua gaya API (Auth.requireRole atau Auth.getSession)
  if (typeof Auth.requireRole === 'function') {
    if (!Auth.requireRole('peserta')) return;
  } else {
    const session = Auth.getSession();
    if (!session || session.role !== 'peserta') {
      window.location.href = 'login.html';
      return;
    }
  }
  Utils.mountNavbar('peserta');

  const user = getCurrentUser();
  document.getElementById('user-nama').textContent = user.nama;
  document.getElementById('user-kelas').textContent = user.kelas || 'Belum ditentukan';

  document.getElementById('btn-rapor').addEventListener('click', openRaporModal);

  // Bind semua kontrol toolbar (defensive: tiap elemen dicek dulu agar
  // tidak error kalau ada satu yang belum ada di HTML).
  [
    'search-jadwal-peserta',
    'filter-jadwal-peserta-status',
    'filter-jadwal-peserta-kehadiran',
    'filter-jadwal-peserta-tipe',
    'sort-jadwal-peserta'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', applyJadwalPesertaFilters);
    el.addEventListener('change', applyJadwalPesertaFilters);
  });

  // Re-render saat mode tampilan jadwal diubah (toggle di section jadwal / Pengaturan)
  document.addEventListener('jadwalviewchange', () => {
    if (cacheJadwalPeserta.length || lastFilteredJadwal.length) applyJadwalPesertaFilters();
  });

  setupJadwalViewToggle();

  // Sinkronkan seluruh cache yang dibutuhkan dashboard peserta dalam 1 gelombang,
  // lalu seluruh render/filter/kalkulasi memakai data lokal (Store) — tanpa
  // request tambahan ke Apps Script tiap berpindah tab/modal di halaman ini.
  await Sync.init(['Peserta', 'Jadwal', 'Kehadiran', 'Rapor', 'Berita', 'Pelatih'], () => loadDashboard());

  await loadDashboard();
});

/** Button toggle Grid / Kalender pada section-head "Jadwal Pelatihan". */
function setupJadwalViewToggle() {
  const group = document.getElementById('jadwal-view-toggle');
  if (!group) return;
  const buttons = group.querySelectorAll('button[data-val]');

  const syncActiveState = () => {
    const mode = (window.PesertaSettings && PesertaSettings.getViewMode()) ? PesertaSettings.getViewMode() : 'grid';
    buttons.forEach(b => {
      const active = b.dataset.val === mode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };

  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-val]');
    if (!btn || btn.classList.contains('active')) return;
    if (window.PesertaSettings && typeof PesertaSettings.setViewMode === 'function') {
      PesertaSettings.setViewMode(btn.dataset.val);
    } else {
      // Fallback bila PesertaSettings tidak tersedia
      syncActiveState();
      renderJadwalView(lastFilteredJadwal.length ? lastFilteredJadwal : cacheJadwalPeserta);
    }
  });

  document.addEventListener('jadwalviewchange', syncActiveState);
  syncActiveState();
}

/** Ambil user dari salah satu API yang tersedia (Auth.getUser / Auth.getSession). */
function getCurrentUser() {
  if (typeof Auth.getUser === 'function') return Auth.getUser();
  const session = Auth.getSession();
  return session ? session.data : {};
}

function loadDashboard() {
  const user = getCurrentUser();
  const jadwalRes = BizLogic.getJadwalPeserta({ id_peserta: user.id });
  const hadirRes = BizLogic.getKehadiranPeserta({ id_peserta: user.id });

  if (hadirRes.success) {
    const d = hadirRes.data;
    document.getElementById('stat-total').textContent = d.total_jadwal;
    document.getElementById('stat-hadir').textContent = d.total_hadir;
    document.getElementById('stat-persen').textContent = d.persentase + '%';
    document.getElementById('progress-fill').style.width = d.persentase + '%';
  }

  if (jadwalRes.success) {
    cacheJadwalPeserta = jadwalRes.data || [];
    applyJadwalPesertaFilters();
    renderUpcomingReminder();
  } else {
    document.getElementById('jadwal-list').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><p>${Utils.escapeHtml(jadwalRes.message || 'Gagal memuat jadwal')}</p></div>`;
    Utils.notify(jadwalRes.message || 'Gagal memuat jadwal', 'error');
  }

  loadBeritaPeserta();
}

/* =====================================================================
   FILTER & SORT JADWAL
   ===================================================================== */
function applyJadwalPesertaFilters() {
  const q          = (document.getElementById('search-jadwal-peserta')?.value || '').toLowerCase();
  const statusF    = document.getElementById('filter-jadwal-peserta-status')?.value || '';
  const kehadiranF = document.getElementById('filter-jadwal-peserta-kehadiran')?.value || '';
  const tipeF      = document.getElementById('filter-jadwal-peserta-tipe')?.value || '';
  const sort       = document.getElementById('sort-jadwal-peserta')?.value || 'newest';

  let list = cacheJadwalPeserta.filter(j => {
    // ---- Search ----
    const haystack = [
      Utils.formatDate(j.Tanggal).toLowerCase(),
      String(j.Tanggal || '').toLowerCase(),
      (j.Pukul  || '').toLowerCase(),
      (j.Lokasi || '').toLowerCase(),
      (j.Kelas  || '').toLowerCase()
    ].join(' ');
    if (q && !haystack.includes(q)) return false;

    // ---- Status jadwal (Aktif/Pending/Cancel) ----
    // Toleran terhadap value "all" maupun "" (keduanya = tidak memfilter).
    if (statusF && statusF !== 'all' && j.Status !== statusF) return false;

    // ---- Status kehadiran saya (hadir/izin/belum) ----
    let myStatus = 'belum';
    if (j.sudah_absen) myStatus = j.status_kehadiran; // 'hadir' atau 'izin'
    if (kehadiranF && kehadiranF !== 'all' && myStatus !== kehadiranF) return false;

    // ---- Tipe (kelas/personal) ----
    if (tipeF === 'kelas'    && j.is_personal) return false;
    if (tipeF === 'personal' && !j.is_personal) return false;

    return true;
  });

  // ---- Sort ----
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  list.sort((a, b) => {
    const da = new Date(a.Tanggal);
    const db = new Date(b.Tanggal);

    // Dukung dua skema penamaan agar kompatibel dengan kode lama:
    //   newest    ≡ tanggal-desc
    //   oldest    ≡ tanggal-asc
    //   upcoming  : jadwal ≥ hari ini di atas (asc), lalu yang lewat (desc)
    if (sort === 'oldest' || sort === 'tanggal-asc') return da - db;
    if (sort === 'upcoming') {
      const aFuture = da >= now;
      const bFuture = db >= now;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      return aFuture ? (da - db) : (db - da);
    }
    return db - da; // default: newest / tanggal-desc
  });

  // Counter
  const counter = document.getElementById('jadwal-count');
  if (counter) {
    const total = cacheJadwalPeserta.length;
    counter.textContent = list.length === total
      ? `${total} jadwal`
      : `${list.length} dari ${total} jadwal`;
  }

  renderJadwalView(list);
}

let lastFilteredJadwal = [];

/** Pilih renderer sesuai mode tampilan (grid / kalender) dari PesertaSettings. */
function renderJadwalView(list) {
  lastFilteredJadwal = list;
  const mode = (window.PesertaSettings && PesertaSettings.getViewMode()) ? PesertaSettings.getViewMode() : 'grid';
  if (mode === 'calendar') renderJadwalCalendar(list);
  else renderJadwalGrid(list);
}

/* =====================================================================
   RENDER GRID CARD (gaya kode kedua + badge PERSONAL dari kode pertama)
   ===================================================================== */
function renderJadwalGrid(jadwals) {
  const container = document.getElementById('jadwal-list');

  if (!jadwals || jadwals.length === 0) {
    const isFiltered = cacheJadwalPeserta.length > 0;
    container.innerHTML = isFiltered
      ? `<div class="empty-state">
          <div class="icon">🔍</div>
          <p>Tidak ada jadwal yang cocok dengan filter Anda.</p>
          <p class="text-muted" style="font-size:13px;margin-top:6px;">Coba ubah kata kunci atau reset filter.</p>
        </div>`
      : `<div class="empty-state">
          <div class="icon">📅</div>
          <p>Belum ada jadwal pelatihan untuk kelas Anda.</p>
          <p class="text-muted" style="font-size:13px;margin-top:6px;">Jadwal akan otomatis terbuat setelah admin mengkonfirmasi pembayaran.</p>
        </div>`;
    return;
  }

  container.innerHTML = `
    <div class="jadwal-grid">
      ${jadwals.map(j => {
        const status = String(j.Status).toLowerCase();
        const badgeClass = status === 'aktif' ? 'badge-success'
                         : status === 'pending' ? 'badge-warning'
                         : 'badge-danger';

        const sudahRespond     = j.sudah_absen;
        const kehadiranStatus  = j.status_kehadiran;

        // Action button — sama persis dengan kode kedua
        let actionHtml;
        if (sudahRespond) {
          actionHtml = (kehadiranStatus === 'hadir')
            ? `<button class="btn btn-sm btn-success" disabled>✓ Sudah Absen</button>`
            : `<button class="btn btn-sm btn-secondary" disabled>📝 Sudah Izin</button>`;
        } else if (status === 'aktif') {
          actionHtml = `<button class="btn btn-sm btn-accent" onclick="openAbsenModal('${j.Id_Jadwal}')">Absen / Izin</button>`;
        } else {
          actionHtml = `<button class="btn btn-sm btn-secondary" disabled>Belum Dibuka</button>`;
        }

        // Badge personal — dipertahankan dari kode pertama agar logika
        // personal tetap terlihat oleh user, tanpa mengubah layout card.
        const personalBadge = j.is_personal
          ? `<span class="badge badge-personal" title="Jadwal personal">⭐ PERSONAL</span>`
          : '';

        return `
          <div class="jadwal-card${j.is_personal ? ' is-personal' : ''}">
            <div class="jadwal-date">
              ${Utils.escapeHtml(Utils.formatDate(j.Tanggal))}
              ${personalBadge}
            </div>
            <h4>${Utils.escapeHtml(j.Kelas)}</h4>
            <div class="jadwal-info">
              <span>🕐 ${Utils.escapeHtml(j.Pukul)}</span>
              <span>📍 ${Utils.escapeHtml(j.Lokasi)}</span>
            </div>
            <div class="jadwal-actions">
              <span class="badge ${badgeClass}">${Utils.escapeHtml(j.Status)}</span>
              ${actionHtml}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

/* =====================================================================
   RENDER KALENDER (req #9) — tampilan bulanan jadwal peserta
   ===================================================================== */
let calMonth = null; // Date (tanggal 1 bulan yang ditampilkan)

function jadwalDateISO(j) { return Utils.formatDateInput(j.Tanggal); }

function renderJadwalCalendar(list) {
  const container = document.getElementById('jadwal-list');
  if (!calMonth) {
    // Default: bulan dari jadwal terdekat yang akan datang, fallback bulan ini.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const upcoming = [...list].filter(j => new Date(j.Tanggal) >= today)
      .sort((a, b) => new Date(a.Tanggal) - new Date(b.Tanggal))[0];
    const base = upcoming ? new Date(upcoming.Tanggal) : new Date();
    calMonth = new Date(base.getFullYear(), base.getMonth(), 1);
  }

  const byDate = {};
  list.forEach(j => { const k = jadwalDateISO(j); (byDate[k] = byDate[k] || []).push(j); });

  const year = calMonth.getFullYear(), month = calMonth.getMonth();
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayISO = Utils.formatDateInput(new Date());

  const dotClass = (s) => { s = String(s).toLowerCase(); return s === 'aktif' ? 'aktif' : s === 'pending' ? 'pending' : 'cancel'; };

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += `<div class="cal-cell cal-cell--empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const items = byDate[iso] || [];
    const isToday = iso === todayISO;
    const dots = items.slice(0, 3).map(j => `<span class="cal-dot ${dotClass(j.Status)}"></span>`).join('');
    const more = items.length > 3 ? `<span class="cal-more">+${items.length - 3}</span>` : '';
    cells += `
      <div class="cal-cell ${items.length ? 'has-events' : ''} ${isToday ? 'is-today' : ''}"
           ${items.length ? `role="button" tabindex="0" onclick="openCalendarDay('${iso}')" onkeydown="if(event.key==='Enter'){openCalendarDay('${iso}')}"` : ''}>
        <span class="cal-daynum">${d}</span>
        ${items.length ? `<span class="cal-dots">${dots}${more}</span>` : ''}
      </div>`;
  }

  container.innerHTML = `
    <div class="cal-wrap">
      <div class="cal-head">
        <button class="cal-nav" aria-label="Bulan sebelumnya" onclick="shiftCalendar(-1)">‹</button>
        <div class="cal-title">${monthNames[month]} ${year}</div>
        <button class="cal-nav" aria-label="Bulan berikutnya" onclick="shiftCalendar(1)">›</button>
      </div>
      <div class="cal-today-row"><button class="btn btn-sm btn-secondary" onclick="calendarToday()">Hari ini</button></div>
      <div class="cal-grid cal-weekdays">
        ${['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(w => `<div class="cal-weekday">${w}</div>`).join('')}
      </div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-legend">
        <span><span class="cal-dot aktif"></span> Aktif</span>
        <span><span class="cal-dot pending"></span> Pending</span>
        <span><span class="cal-dot cancel"></span> Cancel</span>
      </div>
    </div>`;
}

function shiftCalendar(delta) {
  if (!calMonth) calMonth = new Date();
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1);
  renderJadwalCalendar(lastFilteredJadwal);
}
function calendarToday() {
  const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1);
  renderJadwalCalendar(lastFilteredJadwal);
}

/** Modal daftar sesi pada satu tanggal (dari kalender). */
function openCalendarDay(iso) {
  const items = lastFilteredJadwal.filter(j => jadwalDateISO(j) === iso);
  if (!items.length) return;
  const rows = items.map(j => {
    const status = String(j.Status).toLowerCase();
    const badgeClass = status === 'aktif' ? 'badge-success' : status === 'pending' ? 'badge-warning' : 'badge-danger';
    let action = '';
    if (j.sudah_absen) {
      action = j.status_kehadiran === 'hadir'
        ? `<button class="btn btn-sm btn-success" disabled>✓ Sudah Absen</button>`
        : `<button class="btn btn-sm btn-secondary" disabled>📝 Sudah Izin</button>`;
    } else if (status === 'aktif') {
      action = `<button class="btn btn-sm btn-accent" data-absen="${j.Id_Jadwal}">Absen / Izin</button>`;
    } else {
      action = `<button class="btn btn-sm btn-secondary" disabled>Belum Dibuka</button>`;
    }
    return `<li class="cal-day-item ${j.is_personal ? 'is-personal' : ''}">
        <div><strong>${Utils.escapeHtml(j.Kelas)}</strong>${j.is_personal ? ' <span class="badge badge-personal">⭐ Personal</span>' : ''}
          <div class="cal-day-meta">🕐 ${Utils.escapeHtml(j.Pukul)} • 📍 ${Utils.escapeHtml(j.Lokasi)}</div></div>
        <div class="cal-day-action"><span class="badge ${badgeClass}">${Utils.escapeHtml(j.Status)}</span>${action}</div>
      </li>`;
  }).join('');

  const m = UI.modal({
    title: '📅 ' + Utils.formatDateLong(iso),
    size: 'sm',
    body: `<ul class="cal-day-list">${rows}</ul>`
  });
  m.el.querySelectorAll('[data-absen]').forEach(b =>
    b.addEventListener('click', () => { m.close(); openAbsenModal(b.dataset.absen); }));
}

/* =====================================================================
   BERITA & PENGINGAT JADWAL (req #6)
   ===================================================================== */
let beritaCachePeserta = [];

function loadBeritaPeserta() {
  const user = (Auth && Auth.getUser && Auth.getUser()) || {};
  const kelas = user.kelas || user.Kelas || '';
  const res = BizLogic.getAllBerita({ kelas });
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
  if (count) count.textContent = beritaCachePeserta.length;
  list.innerHTML = beritaCachePeserta.map((b, i) => `
    <article class="berita-card" role="button" tabindex="0"
        onclick="openBeritaPesertaModal(${i})" onkeydown="if(event.key==='Enter'){openBeritaPesertaModal(${i})}">
      <div class="berita-card__date">${Utils.formatDate(b.Tanggal)}</div>
      <h4 class="berita-card__title">${Utils.escapeHtml(b.Judul)}</h4>
      <p class="berita-card__excerpt">${Utils.escapeHtml((b.Deskripsi || '').substring(0, 110))}${(b.Deskripsi || '').length > 110 ? '…' : ''}</p>
      <span class="berita-card__cta">Baca selengkapnya →</span>
    </article>`).join('');
}

function openBeritaPesertaModal(i) {
  const b = beritaCachePeserta[i];
  if (!b) return;
  const link = b.Link
    ? `<a href="${Utils.escapeHtml(b.Link)}" target="_blank" rel="noopener" class="btn btn-accent btn-block" style="margin-top:14px;">🔗 Buka Sumber Informasi</a>`
    : '';
  UI.modal({
    title: Utils.escapeHtml(b.Judul),
    size: 'md',
    body: `<div class="berita-modal-date">📅 ${Utils.formatDateLong(b.Tanggal)}</div>
      <p class="berita-modal-desc">${Utils.escapeHtml(b.Deskripsi || '-').replace(/\n/g, '<br>')}</p>${link}`,
    actions: [{ label: 'Tutup', variant: 'secondary' }]
  });
}

/**
 * Pengingat jadwal yang PERLU DITINDAKLANJUTI (belum absen/izin), tampil sebagai
 * kartu bersih ala task-section admin — klik kartu → buka modal absen/izin.
 * Section otomatis tersembunyi bila tidak ada jadwal yang perlu ditindaklanjuti.
 */
function renderUpcomingReminder() {
  const section  = document.getElementById('upcoming-reminder-section');
  const scroller = document.getElementById('reminder-scroller');
  const badge    = document.getElementById('reminder-count');
  if (!section || !scroller) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayISO = Utils.formatDateInput(today);

  const items = cacheJadwalPeserta
    .filter(j => new Date(j.Tanggal) >= today
                 && String(j.Status).toLowerCase() === 'aktif'
                 && !j.sudah_absen)
    .sort((a, b) => new Date(a.Tanggal) - new Date(b.Tanggal))
    .slice(0, 5); // batasi agar scroller tetap ringkas

  if (!items.length) { section.hidden = true; scroller.innerHTML = ''; return; }
  section.hidden = false;
  if (badge) badge.textContent = items.length;

  scroller.innerHTML = items.map(j => {
    const isToday = jadwalDateISO(j) === todayISO;
    const tag = isToday ? '⏰ Hari Ini' : '📅 Akan Datang';
    const personalBadge = j.is_personal
      ? `<span class="badge badge-personal" title="Jadwal personal">⭐</span>`
      : '';
    return `
      <div class="reminder-card${isToday ? ' is-today' : ''}" data-jadwal-id="${j.Id_Jadwal}" role="button" tabindex="0"
          onclick="openAbsenModal('${j.Id_Jadwal}')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openAbsenModal('${j.Id_Jadwal}')}">
        <span class="reminder-card__tag">${tag}</span>
        <div class="reminder-card__title">${Utils.escapeHtml(j.Kelas)} ${personalBadge}</div>
        <div class="reminder-card__meta">
          <span>📅 ${Utils.escapeHtml(Utils.formatDateLong(j.Tanggal))}</span>
          <span>🕐 ${Utils.escapeHtml(j.Pukul)}</span>
          <span>📍 ${Utils.escapeHtml(j.Lokasi)}</span>
        </div>
        <div class="reminder-card__cta">Absen / Izin sekarang ›</div>
      </div>`;
  }).join('');
}

/* =====================================================================
   MODAL ABSEN — full version dari kode kedua (checklist equipment)
   ===================================================================== */
function openAbsenModal(idJadwal) {
  // Defensive: kalau CONFIG.EQUIPMENT_INFO tidak ada, fallback ke list kosong
  const eq = (typeof CONFIG !== 'undefined' && CONFIG.EQUIPMENT_INFO) ? CONFIG.EQUIPMENT_INFO : {
    pemula: [], lanjut: [], lain: [], tambahan: []
  };

  const html = `
    <div class="modal-backdrop active" id="m-absen" data-jadwal-id="${idJadwal}">
      <div class="modal" style="max-width:560px;">
        <div class="modal-header">
          <h3>📋 Konfirmasi Absensi</h3>
          <button class="modal-close" onclick="closeAbsenModal()">×</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom:14px;">Sebelum melakukan absensi, mohon perhatikan informasi peralatan dan persiapan latihan berikut:</p>

          <div class="equipment-section">
            <h4>🏊 Peralatan Pribadi Selama Latihan</h4>

            <details class="equipment-detail" open>
              <summary><strong>A. Pemula</strong></summary>
              <ul>${eq.pemula.map(i => `<li>${Utils.escapeHtml(i)}</li>`).join('')}</ul>
            </details>

            <details class="equipment-detail">
              <summary><strong>B. Tingkat Lanjut</strong> <small>(menguasai ≥ 2 gaya, 25 m)</small></summary>
              <ul>${eq.lanjut.map(i => `<li>${Utils.escapeHtml(i)}</li>`).join('')}</ul>
            </details>

            <details class="equipment-detail">
              <summary><strong>C. Perlengkapan Lain</strong></summary>
              <ul>${eq.lain.map(i => `<li>${Utils.escapeHtml(i)}</li>`).join('')}</ul>
            </details>

            <details class="equipment-detail">
              <summary><strong>D. Informasi Tambahan</strong></summary>
              <ul>${eq.tambahan.map(i => `<li>${Utils.escapeHtml(i)}</li>`).join('')}</ul>
            </details>
          </div>

          <label class="checkbox-row">
            <input type="checkbox" id="agree-checkbox" onchange="toggleAbsenSubmit()">
            <span>Saya telah memahami dan akan mempersiapkan peralatan yang diperlukan untuk latihan.</span>
          </label>

          <div id="izin-section" class="hidden">
            <hr class="divider">
            <label>Alasan tidak hadir <span class="text-muted">(wajib diisi)</span></label>
            <textarea id="catatan-izin" class="form-control" rows="3" placeholder="Contoh: Sakit, ada acara keluarga, dll..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeAbsenModal()">Batal</button>
          <button class="btn btn-warning" id="btn-izin" onclick="toggleIzinForm()">📝 Izin</button>
          <button class="btn btn-primary" id="btn-confirm-absen" data-jadwal-id="${idJadwal}" onclick="submitAbsen('${idJadwal}')" disabled>✓ Ya, Saya Hadir</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function closeAbsenModal() {
  const m = document.getElementById('m-absen');
  if (m) m.remove();
}

function toggleAbsenSubmit() {
  const checked = document.getElementById('agree-checkbox').checked;
  const btn = document.getElementById('btn-confirm-absen');
  const izinActive = !document.getElementById('izin-section').classList.contains('hidden');
  btn.disabled = !(checked && !izinActive);
}

function toggleIzinForm() {
  const sec = document.getElementById('izin-section');
  const btnConfirm = document.getElementById('btn-confirm-absen');
  const btnIzin = document.getElementById('btn-izin');
  const willActivate = sec.classList.contains('hidden');

  sec.classList.toggle('hidden');
  if (willActivate) {
    btnConfirm.textContent = '📤 Kirim Izin';
    btnConfirm.disabled = false;
    btnConfirm.onclick = () => submitIzin();
    btnIzin.textContent = '↩ Kembali';
  } else {
    btnConfirm.textContent = '✓ Ya, Saya Hadir';
    btnIzin.textContent = '📝 Izin';
    const idJadwal = btnConfirm.dataset.jadwalId;
    btnConfirm.onclick = () => submitAbsen(idJadwal);
    toggleAbsenSubmit();
  }
}

async function submitAbsen(idJadwal) {
  if (!document.getElementById('agree-checkbox').checked) {
    Utils.notify('Mohon centang persetujuan peralatan terlebih dahulu', 'warning');
    return;
  }
  Utils.showLoader && Utils.showLoader(true);
  const user = getCurrentUser();
  const res = await BizLogic.absen({ id_jadwal: idJadwal, id_peserta: user.id });
  Utils.showLoader && Utils.showLoader(false);
  if (res.success) {
    Utils.notify(res.message, 'success');
    closeAbsenModal();
    loadDashboard();
  } else {
    Utils.notify(res.message, 'error');
  }
}

async function submitIzin() {
  const catatan = document.getElementById('catatan-izin').value.trim();
  if (!catatan) {
    Utils.notify('Mohon isi alasan tidak hadir', 'warning');
    return;
  }
  const modal = document.getElementById('m-absen');
  const btn = document.getElementById('btn-confirm-absen');
  const idJadwal = (modal && modal.dataset.jadwalId) || (btn && btn.dataset.jadwalId);
  if (!idJadwal) {
    Utils.notify('Gagal mengidentifikasi jadwal', 'error');
    return;
  }
  Utils.showLoader && Utils.showLoader(true);
  const user = getCurrentUser();
  const res = await BizLogic.izin({ id_jadwal: idJadwal, id_peserta: user.id, catatan });
  Utils.showLoader && Utils.showLoader(false);
  if (res.success) {
    Utils.notify(res.message, 'success');
    closeAbsenModal();
    loadDashboard();
  } else {
    Utils.notify(res.message, 'error');
  }
}

/* =====================================================================
   RAPOR — Tabel 4 gaya × 2 jarak + Download PDF (logika dari kode 1)
   ===================================================================== */
async function openRaporModal() {
  const user = getCurrentUser();

  const raporRes = BizLogic.getRaporPeserta({ id_peserta: user.id });
  const pesertaRes = BizLogic.getDataLengkapPeserta({ id_peserta: user.id });

  if (pesertaRes.success) pesertaLengkapCache = pesertaRes.data;
  raporCache = raporRes.success ? raporRes.data : null;

  if (!raporRes.success) {
    Utils.notify(raporRes.message || 'Gagal memuat rapor', 'error');
    return;
  }

  let modalBody;
  if (!raporRes.data) {
    modalBody = `
      <div class="empty-state">
        <div class="icon">📝</div>
        <h3>Rapor Belum Tersedia</h3>
        <p>Rapor akan tersedia setelah pelatih mengisi data evaluasi. Cek kembali nanti.</p>
      </div>`;
  } else {
    const r = raporRes.data;
    const fmt = v => (v && String(v).trim() !== '' && String(v).trim() !== '-') ? String(v).trim() : '-';
    const _periode = (typeof getSemesterPeriode === 'function')
      ? getSemesterPeriode(pesertaRes.data?.Tanggal_Mulai)
      : { start: pesertaRes.data?.Tanggal_Mulai, end: pesertaRes.data?.Tanggal_Akhir };
    const periodeStart = _periode.start;
    const periodeEnd   = _periode.end;

    modalBody = `
      <div class="rapor-display">
        <div class="rapor-section">
          <h4 class="rapor-section-title">📊 Capaian Hasil Latihan Renang</h4>
          <p class="rapor-periode">Periode:
            <em>${Utils.formatDateLong(periodeStart)} s.d ${Utils.formatDateLong(periodeEnd)}</em>
          </p>
          <div class="rapor-table-scroll">
          <table class="rapor-table">
            <thead>
              <tr>
                <th>NO.</th><th>GAYA RENANG</th>
                <th>25 M<br><small>(Dengan Pelampung)</small></th>
                <th>25 M<br><small>(Tanpa Pelampung)</small></th>
                <th>50 M</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>Gaya Bebas</td>    <td>${fmt(r.Waktu_25_Bebas_Pelampung)}</td>    <td>${fmt(r.Waktu_25_Bebas)}</td>    <td>${fmt(r.Waktu_50_Bebas)}</td></tr>
              <tr><td>2</td><td>Gaya Dada</td>     <td>${fmt(r.Waktu_25_Dada_Pelampung)}</td>     <td>${fmt(r.Waktu_25_Dada)}</td>     <td>${fmt(r.Waktu_50_Dada)}</td></tr>
              <tr><td>3</td><td>Gaya Kupu</td>     <td>${fmt(r.Waktu_25_Kupu_Pelampung)}</td>     <td>${fmt(r.Waktu_25_Kupu)}</td>     <td>${fmt(r.Waktu_50_Kupu)}</td></tr>
              <tr><td>4</td><td>Gaya Punggung</td> <td>${fmt(r.Waktu_25_Punggung_Pelampung)}</td> <td>${fmt(r.Waktu_25_Punggung)}</td> <td>${fmt(r.Waktu_50_Punggung)}</td></tr>
            </tbody>
          </table>
          </div>
        </div>

        <div class="rapor-section">
          <div class="rapor-field">
            <label>Predikat</label>
            <div class="rapor-value-box">${Utils.escapeHtml(r.Predikat) || '-'}</div>
          </div>
          <div class="rapor-field">
            <label>Deskripsi</label>
            <div class="rapor-value-box tall">${Utils.escapeHtml(r.Catatan) || '-'}</div>
          </div>
        </div>

        <p class="rapor-pelatih">Pelatih: <strong>${Utils.escapeHtml(r.Nama_Pelatih || '-')}</strong></p>
      </div>`;
  }

  const downloadBtn = raporRes.data
    ? `<button class="btn btn-accent" onclick="downloadRaporPDF()">📥 Download PDF</button>`
    : '';

  const html = `
    <div class="modal-backdrop active" id="rapor-modal">
      <div class="modal modal-md">
        <div class="modal-header">
          <h3>📒 Rapor Latihan</h3>
          <button class="modal-close" onclick="document.getElementById('rapor-modal').remove()">×</button>
        </div>
        <div class="modal-body">${modalBody}</div>
        <div class="modal-footer">
          ${downloadBtn}
          <button class="btn btn-secondary" onclick="document.getElementById('rapor-modal').remove()">Tutup</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function downloadRaporPDF() {
  if (!pesertaLengkapCache) {
    const user = getCurrentUser();
    const res = BizLogic.getDataLengkapPeserta({ id_peserta: user.id });
    if (!res.success) { Utils.notify('Gagal memuat data peserta', 'error'); return; }
    pesertaLengkapCache = res.data;
  }
  if (!raporCache) { Utils.notify('Data rapor tidak tersedia', 'error'); return; }

  Utils.showLoader && Utils.showLoader(true);
  try {
    await PDFRapor.generate(pesertaLengkapCache, raporCache, raporCache.Nama_Pelatih);
  } catch (err) {
    console.error(err);
    Utils.notify('Gagal generate PDF: ' + err.message, 'error');
  }
  Utils.showLoader && Utils.showLoader(false);
}