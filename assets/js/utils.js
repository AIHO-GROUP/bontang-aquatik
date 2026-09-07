/* ============================== TEMA ============================== */
const Theme = {
  KEY: 'swim_theme',

  get() {
    try { return localStorage.getItem(this.KEY) || 'light'; } catch (e) { return 'light'; }
  },

  apply(theme) {
    const current = (theme === 'dark') ? 'dark' : 'light';
    const isDark = current === 'dark';
    document.documentElement.setAttribute('data-theme', current);
    try { localStorage.setItem(this.KEY, current); } catch (e) { /* mode privat */ }

    document.querySelectorAll('.theme-switch').forEach((sw) => {
      sw.classList.toggle('is-dark', isDark);
      sw.setAttribute('aria-checked', String(isDark));
    });

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = isDark ? '#0B0F12' : '#FFFFFF';
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: current } }));
  },

  toggle() {
    this.apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  },

  init() { this.apply(this.get()); }
};
Theme.init();

/* ============================== UTILS ============================== */
const Utils = {

  /* -------------------- Notifikasi & loader -------------------- */
  // Ditingkatkan oleh components/ui.js menjadi toast; implementasi di sini
  // adalah fallback bila ui.js belum termuat.
  notify(msg, type = 'info', duration = 4000) {
    let container = document.getElementById('notif-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notif-container';
      document.body.appendChild(container);
    }
    const notif = document.createElement('div');
    notif.className = 'notif ' + type;
    notif.textContent = msg;
    container.appendChild(notif);
    setTimeout(() => {
      notif.classList.add('fadeout');
      setTimeout(() => notif.remove(), 300);
    }, duration);
  },

  _loaderTimer: null,
  showLoader(show = true) {
    let loader = document.getElementById('loader-overlay');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'loader-overlay';
      loader.className = 'loader-overlay';
      loader.innerHTML = '<div class="spinner"></div>';
      document.body.appendChild(loader);
    }
    if (this._loaderTimer) { clearTimeout(this._loaderTimer); this._loaderTimer = null; }
    loader.classList.toggle('active', show);
    if (show) {
      // Jaring pengaman: loader tidak boleh menggantung selamanya bila ada
      // jalur kode yang lupa memanggil showLoader(false).
      this._loaderTimer = setTimeout(() => {
        loader.classList.remove('active');
        this._loaderTimer = null;
      }, 15000);
    }
  },

  /* -------------------- Tanggal (delegasi ke WITA) -------------------- */
  formatDate(d)      { return WITA.formatDate(d); },
  formatDateLong(d)  { return WITA.formatDateLong(d); },
  formatDateFull(d)  { return WITA.formatDateFull(d); },
  formatDateInput(d) { return WITA.toISODate(d); },
  addMonths(iso, n)  { return WITA.addMonths(iso, n); },
  today()            { return WITA.todayISO(); },

  calculateUsia(tgl)         { return BizUtil.usia(tgl); },
  calculateKelompokUmur(tgl) { return BizUtil.kelompokUmur(tgl); },

  /** Validasi & normalisasi waktu renang mm.ss.ms */
  normalizeWaktu(input) {
    if (!input) return '';
    const cleaned = String(input).trim();
    if (cleaned === '' || cleaned === '-') return '';
    const parts = cleaned.split(/[:.]/);
    if (parts.length < 2) return cleaned;
    const mm = String(parts[0] || '00').padStart(2, '0');
    const ss = String(parts[1] || '00').padStart(2, '0');
    const ms = String(parts[2] || '00').padStart(2, '0');
    return mm + '.' + ss + '.' + ms;
  },

  formatBool(v) { return BizUtil.isTrue(v) ? 'TRUE' : 'FALSE'; },

  /** Dipakai UI lama; diganti UI.confirm bila components/ui.js termuat. */
  confirm(message) {
    return new Promise((resolve) => {
      const html =
        '<div class="modal-backdrop active" id="confirm-modal">' +
          '<div class="modal modal-sm">' +
            '<div class="modal-body"><p style="font-size:15px;">' + message + '</p></div>' +
            '<div class="modal-footer">' +
              '<button class="btn btn-secondary" data-confirm="no">Batal</button>' +
              '<button class="btn btn-danger" data-confirm="yes">Ya, Lanjutkan</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.insertAdjacentHTML('beforeend', html);
      const modal = document.getElementById('confirm-modal');
      modal.querySelectorAll('[data-confirm]').forEach((b) => {
        b.addEventListener('click', () => {
          modal.remove();
          resolve(b.dataset.confirm === 'yes');
        });
      });
    });
  },

  /* -------------------- Keamanan output -------------------- */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  },

  /** Tautan WhatsApp — pakai WA.Templates agar identitas peserta ikut terkirim. */
  waLink(phone, message) { return WA.link(message, phone); },

  /**
   * Nomor Indonesia menjadi bentuk yang enak dibaca: "62816679671"
   * -> "+62 816-679-671".
   *
   * Digit setelah kode negara dipecah bertiga dari BELAKANG, supaya tidak
   * pernah menyisakan kelompok satu-dua digit yang menggantung seperti
   * "+62 816-6796-71".
   */
  formatPhone(nomor) {
    const d = BizUtil.digits(nomor);
    if (!d) return '';
    const negara = d.startsWith('62') ? '62' : '';
    const sisa = negara ? d.slice(2) : d;

    const bagian = [];
    let i = sisa.length;
    while (i > 0) { bagian.unshift(sisa.slice(Math.max(0, i - 3), i)); i -= 3; }
    // Kelompok pertama boleh 1-2 digit; gabungkan ke tetangganya agar rapi.
    if (bagian.length > 1 && bagian[0].length < 3) {
      bagian[1] = bagian[0] + bagian[1];
      bagian.shift();
    }
    return (negara ? '+' + negara + ' ' : '') + bagian.join('-');
  },

  initial(nama) {
    const s = String(nama || '?').trim();
    if (!s) return '?';
    const parts = s.split(/\s+/);
    return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  },

  /* ============================== NAVBAR ==============================
     Pengaturan TIDAK lagi menjadi tab utama dashboard; ia berada di menu
     profil (avatar) bersama tema, ganti password, dan logout. Navigasi
     utama tetap fokus pada fungsi operasional.
     ================================================================== */
  mountNavbar(activeRoute = '') {
    const session = Auth.getSession();
    const isDark = Theme.get() === 'dark';

    let links = '<a href="index.html" class="nav-link ' + (activeRoute === 'home' ? 'active' : '') + '">Beranda</a>';
    let right = '';
    let aksi = '';

    if (session) {
      const isPeserta = session.role === CONFIG.ROLES.PESERTA;
      const home = Auth.homeFor(session.role);
      const nama = (session.data && (session.data.nama || session.data.username)) || 'Pengguna';
      const peran = Auth.roleLabel(session.role);

      links +=
        '<a href="' + home + '" class="nav-link ' +
          (['dashboard', 'peserta', 'admin'].includes(activeRoute) ? 'active' : '') + '">Dashboard</a>';

      const menuItems = [];
      if (isPeserta) {
        menuItems.push('<a href="profile.html" class="usermenu__item' +
          (activeRoute === 'profile' ? ' is-active' : '') + '">' + ICON.user + ' Profil Saya</a>');
      }
      menuItems.push('<a href="update-password.html" class="usermenu__item">' + ICON.key + ' Ganti Password</a>');
      menuItems.push('<button type="button" class="usermenu__item" data-usermenu="settings">' +
        ICON.gear + ' Pengaturan</button>');
      menuItems.push('<div class="usermenu__sep" role="separator"></div>');
      menuItems.push('<button type="button" class="usermenu__item usermenu__item--danger" data-usermenu="logout">' +
        ICON.logout + ' Keluar</button>');

      right =
        '<div class="usermenu" id="usermenu">' +
          '<button type="button" class="usermenu__trigger" id="usermenu-trigger" ' +
                  'aria-haspopup="true" aria-expanded="false" aria-controls="usermenu-panel">' +
            '<span class="usermenu__avatar" aria-hidden="true">' + this.escapeHtml(this.initial(nama)) + '</span>' +
            '<span class="usermenu__meta">' +
              '<span class="usermenu__name">' + this.escapeHtml(nama) + '</span>' +
              '<span class="usermenu__role">' + this.escapeHtml(peran) + '</span>' +
            '</span>' +
            '<svg class="usermenu__caret" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
          '</button>' +
          '<div class="usermenu__panel" id="usermenu-panel" role="menu" hidden>' +
            '<div class="usermenu__header">' +
              '<strong>' + this.escapeHtml(nama) + '</strong>' +
              '<span>' + this.escapeHtml(peran) + '</span>' +
            '</div>' +
            '<div class="usermenu__theme">' +
              '<span>Tema</span>' +
              '<div class="ui-segment ui-segment--sm" data-usermenu-theme>' +
                '<button type="button" data-val="light" class="' + (isDark ? '' : 'active') + '">Terang</button>' +
                '<button type="button" data-val="dark" class="' + (isDark ? 'active' : '') + '">Gelap</button>' +
              '</div>' +
            '</div>' +
            menuItems.join('') +
          '</div>' +
        '</div>';
    } else {
      /* Pengunjung yang belum masuk.
         Tautan "Pendaftaran" sengaja TIDAK ditambahkan di daftar menu:
         tombol ajakan "Daftar Sekarang" sudah menuju halaman yang sama, dan
         dua tautan dengan tujuan identik membuat navigasi terasa berulang.

         "Masuk" dan "Daftar Sekarang" ditaruh DI DALAM panel menu, bukan di
         bilah kanan. Pada layar ponsel, logo + nama klub + dua tombol itu +
         tombol tema + tombol menu tidak muat dalam satu baris, sehingga
         bilahnya melebar melewati lebar layar. Di panel menu keduanya
         mendapat lebar penuh dan lebih mudah ditekan; pada layar >=768px
         panel menu memang dirender sebagai baris mendatar, jadi tampilannya
         di desktop tetap sama persis seperti sebelumnya.

         Tombol tema tetap di bilah kanan supaya dapat dijangkau tanpa
         membuka menu — ia hanya selebar satu ikon dan tidak membuat sesak. */
      aksi =
        '<div class="navbar-actions">' +
          '<a href="login.html" class="nav-link ' + (activeRoute === 'login' ? 'active' : '') + '">Masuk</a>' +
          '<a href="registrasi.html" class="btn btn-accent btn-sm nav-cta">Daftar Sekarang</a>' +
        '</div>';
      right =
        '<button type="button" id="theme-switch" class="theme-switch ' + (isDark ? 'is-dark' : '') + '" ' +
                'aria-label="Ganti tema" aria-checked="' + isDark + '" role="switch">' + ICON.sun + ICON.moon + '</button>';
    }

    const html =
      '<nav class="navbar">' +
        '<div class="navbar-aura" aria-hidden="true"></div>' +
        '<div class="navbar-inner">' +
          '<a href="index.html" class="navbar-brand">' +
            '<div class="navbar-brand-logo">' +
              '<img src="assets/images/logo.png" alt="' + CONFIG.BRAND_NAME + '" ' +
                   'onerror="this.style.display=\'none\';this.parentElement.textContent=\'🏊\';">' +
            '</div>' +
            '<span>' + CONFIG.BRAND_NAME + '</span>' +
          '</a>' +
          '<div class="navbar-menu" id="navbar-menu">' +
            '<div class="navbar-links">' + links + '</div>' + aksi +
          '</div>' +
          '<div class="navbar-end">' + right +
            '<button class="navbar-toggle" id="navbar-toggle" aria-label="Menu" aria-expanded="false">☰</button>' +
          '</div>' +
        '</div>' +
      '</nav>';

    document.body.insertAdjacentHTML('afterbegin', html);
    this._bindNavbar();
    Auth.mountImpersonationBanner();
  },

  _bindNavbar() {
    const toggleBtn = document.getElementById('navbar-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const menu = document.getElementById('navbar-menu');
        const shown = menu.classList.toggle('show');
        toggleBtn.setAttribute('aria-expanded', shown ? 'true' : 'false');
      });
    }

    const themeSwitch = document.getElementById('theme-switch');
    if (themeSwitch) themeSwitch.addEventListener('click', () => Theme.toggle());

    const trigger = document.getElementById('usermenu-trigger');
    const panel = document.getElementById('usermenu-panel');
    if (trigger && panel) {
      const close = () => { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = panel.hidden;
        panel.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', (e) => {
        if (!panel.hidden && !panel.contains(e.target) && !trigger.contains(e.target)) close();
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

      panel.querySelectorAll('[data-usermenu-theme] button').forEach((b) => {
        b.addEventListener('click', () => {
          panel.querySelectorAll('[data-usermenu-theme] button')
               .forEach((x) => x.classList.toggle('active', x === b));
          Theme.apply(b.dataset.val);
        });
      });

      panel.addEventListener('click', (e) => {
        const item = e.target.closest('[data-usermenu]');
        if (!item) return;
        close();
        if (item.dataset.usermenu === 'logout') Auth.logout();
        if (item.dataset.usermenu === 'settings') {
          document.dispatchEvent(new CustomEvent('app:opensettings'));
        }
      });
    }
  },

  /* ============================== FOOTER ============================== */
  mountFooter() {
    const locs = CONFIG.LOCATIONS;
    const slides = locs.map((loc, i) =>
      '<div class="map-slide" data-index="' + i + '">' +
        '<div class="map-frame">' +
          '<iframe src="' + loc.embedSrc + '" loading="lazy" ' +
                  'referrerpolicy="no-referrer-when-downgrade" title="' + this.escapeHtml(loc.name) + '"></iframe>' +
          '<a href="' + loc.mapsUrl + '" target="_blank" rel="noopener" class="map-open-btn">📍 Buka di Google Maps</a>' +
        '</div>' +
        '<div class="map-caption"><strong>' + this.escapeHtml(loc.name) + '</strong>' +
          '<span>' + this.escapeHtml(loc.address) + '</span></div>' +
      '</div>').join('');

    const dots = locs.map((_, i) =>
      '<button class="map-dot ' + (i === 0 ? 'active' : '') + '" data-target="' + i +
      '" aria-label="Lokasi ' + (i + 1) + '"></button>').join('');

    // Informasi kontak dibangun dari CONFIG.CONTACT agar nomor/email cukup
    // diubah di satu tempat bila kelak berganti.
    const waTampil = this.formatPhone(CONFIG.CONTACT.whatsapp);
    const kontak =
      '<div class="footer-contact">' +
        '<h4>Hubungi Kami</h4>' +
        '<ul class="footer-contact__list">' +
          '<li>' +
            '<span class="footer-contact__icon" aria-hidden="true">💬</span>' +
            '<div><span class="footer-contact__label">WhatsApp / Telepon</span>' +
              '<a href="' + WA.url('calonPeserta') + '" target="_blank" rel="noopener">' +
              this.escapeHtml(waTampil) + '</a></div>' +
          '</li>' +
          '<li>' +
            '<span class="footer-contact__icon" aria-hidden="true">✉️</span>' +
            '<div><span class="footer-contact__label">Email</span>' +
              '<a href="mailto:' + CONFIG.CONTACT.email + '">' +
              this.escapeHtml(CONFIG.CONTACT.email) + '</a></div>' +
          '</li>' +
          '<li>' +
            '<span class="footer-contact__icon" aria-hidden="true">📍</span>' +
            '<div><span class="footer-contact__label">Sekretariat</span>' +
              '<span>' + this.escapeHtml(CONFIG.CONTACT.alamat_lengkap) + '</span></div>' +
          '</li>' +
          '<li>' +
            '<span class="footer-contact__icon" aria-hidden="true">🏊</span>' +
            '<div><span class="footer-contact__label">Kolam Latihan</span>' +
              '<span>' + locs.map((l) => this.escapeHtml(l.name)).join('<br>') + '</span></div>' +
          '</li>' +
        '</ul>' +
      '</div>';

    const html =
      '<footer class="footer"><div class="container">' +
        '<div class="footer-grid">' +
          '<div class="footer-about">' +
            '<h4>' + CONFIG.BRAND_NAME + '</h4>' +
            '<p>Klub pelatihan renang profesional di Bontang dengan pelatih berpengalaman. ' +
            'Latihan lebih terstruktur dan menyenangkan bersama Bontang Akuatik Swimming Club.</p>' +
          '</div>' +
          kontak +
          '<div class="footer-maps">' +
            '<h4>📍 Lokasi Latihan</h4>' +
            '<div class="maps-carousel" id="maps-carousel">' + slides + '</div>' +
            '<div class="map-dots" id="map-dots">' + dots + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="footer-bottom">© ' + new Date().getFullYear() + ' ' + CONFIG.BRAND_NAME +
        ' • Klub Renang Bontang • All rights reserved.</div>' +
      '</div></footer>';

    document.body.insertAdjacentHTML('beforeend', html);

    const carousel = document.getElementById('maps-carousel');
    const dotEls = document.querySelectorAll('#map-dots .map-dot');
    if (carousel && dotEls.length) {
      dotEls.forEach((dot) => dot.addEventListener('click', () => {
        const slide = carousel.querySelector('.map-slide[data-index="' + dot.dataset.target + '"]');
        if (slide) carousel.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
      }));
      carousel.addEventListener('scroll', () => {
        const idx = Math.round(carousel.scrollLeft / carousel.clientWidth);
        dotEls.forEach((d, i) => d.classList.toggle('active', i === idx));
      });
    }
  },

  /* ==================== BANNER PEMBERITAHUAN PERUBAHAN ====================
     Persyaratan produk: setiap perubahan besar pada alur atau database
     HARUS diinformasikan kepada pengguna lewat tampilan aplikasi.
     Banner muncul satu kali per versi per perangkat.
     ====================================================================== */
  mountChangeNotice() {
    const notice = CONFIG.NOTICE;
    if (!notice) return;
    const key = 'swim_notice_seen_v' + notice.version;
    try { if (localStorage.getItem(key)) return; } catch (e) { return; }

    // Baris pertama = pembuka, baris terakhir = penutup, sisanya = poin daftar.
    const lines = notice.body;
    const intro = lines.length ? '<p>' + lines[0] + '</p>' : '';
    const outro = lines.length > 1 ? '<p class="notice-card__outro">' + lines[lines.length - 1] + '</p>' : '';
    const points = lines.slice(1, -1);
    const bullets = points.length
      ? '<ul>' + points.map((line) => '<li>' + line + '</li>').join('') + '</ul>'
      : '';

    const html =
      '<div class="notice-backdrop" id="change-notice">' +
        '<div class="notice-card" role="dialog" aria-modal="true" aria-labelledby="notice-title">' +
          '<div class="notice-card__icon" aria-hidden="true">✨</div>' +
          '<h2 id="notice-title">' + this.escapeHtml(notice.title) + '</h2>' +
          '<div class="notice-card__body">' + intro + bullets + outro + '</div>' +
          '<button type="button" class="btn btn-primary btn-block" id="notice-ok">Saya Mengerti</button>' +
        '</div>' +
      '</div>';

    document.body.insertAdjacentHTML('beforeend', html);
    const el = document.getElementById('change-notice');
    const dismiss = () => {
      try { localStorage.setItem(key, '1'); } catch (e) { /* mode privat */ }
      el.classList.add('is-closing');
      setTimeout(() => el.remove(), 200);
    };
    document.getElementById('notice-ok').addEventListener('click', dismiss);
    el.addEventListener('click', (e) => { if (e.target === el) dismiss(); });
  },

  /* ==================== BANNER PERBARUI PASSWORD ====================
     Akun lama yang passwordnya belum memenuhi kebijakan baru diberi
     banner dengan tombol yang langsung menuju halaman ganti password.
     ================================================================= */
  mountPasswordNag() {
    const session = Auth.getSession();
    if (!session) return;
    if (window.location.pathname.includes('update-password')) return;

    const perlu = BizLogic.needsPasswordUpdate(session.data && session.data.id, session.role);
    const existing = document.getElementById('password-nag');
    if (!perlu) { if (existing) existing.remove(); return; }
    if (existing) return;

    const key = 'swim_pwnag_snooze';
    try {
      const until = parseInt(localStorage.getItem(key), 10);
      if (until && Date.now() < until) return;
    } catch (e) { /* abaikan */ }

    const html =
      '<div class="app-banner app-banner--warning" id="password-nag" role="status">' +
        '<div class="app-banner__icon" aria-hidden="true">🔐</div>' +
        '<div class="app-banner__body">' +
          '<strong>Perbarui password Anda</strong>' +
          '<span>Password akun Anda belum memenuhi standar keamanan terbaru ' +
          '(minimal 6 karakter dengan huruf kapital, angka, dan karakter unik).</span>' +
        '</div>' +
        '<div class="app-banner__actions">' +
          '<a class="btn btn-primary btn-sm" href="update-password.html">Perbarui Sekarang</a>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-nag="later">Nanti</button>' +
        '</div>' +
      '</div>';

    // Selector dicoba SATU PER SATU sesuai prioritas. querySelector dengan
    // daftar berkoma mengembalikan elemen pertama dalam URUTAN DOKUMEN, bukan
    // selector pertama yang cocok — itu membuat banner mendarat di <body>
    // (sebelum navbar sticky) dan merusak tata letak halaman.
    const anchor = ['.dashboard > .container', '.admin-page > .container', 'main']
      .map((sel) => document.querySelector(sel))
      .find(Boolean) || document.body;
    anchor.insertAdjacentHTML('afterbegin', html);
    document.querySelector('#password-nag [data-nag="later"]').addEventListener('click', () => {
      // Ditunda 24 jam, lalu diingatkan lagi.
      try { localStorage.setItem(key, String(Date.now() + 86400000)); } catch (e) { /* abaikan */ }
      document.getElementById('password-nag').remove();
    });
  }
};

/* ---------------- Ikon inline yang dipakai navbar ---------------- */
const ICON = {
  sun: '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
       '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>' +
       '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>' +
       '<line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>' +
       '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  moon: '<svg class="icon-moon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 109.8 9.8z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
       '<path d="M21 2l-2 2m-7.6 7.6a5 5 0 1 1-7.1 7.1 5 5 0 0 1 7.1-7.1zm0 0L15 8m0 0l3 3 3-3-3-3"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
};
