/* ============================== THEME ============================== */
const Theme = {
  KEY: 'swim_theme',
  
  get() {
    return localStorage.getItem(this.KEY) || 'light';
  },
  apply(theme) {
    const currentTheme = (theme === 'dark') ? 'dark' : 'light';
    const isDark = currentTheme === 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem(this.KEY, currentTheme);
    document.querySelectorAll('.theme-switch').forEach(sw => {
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
  },
  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    this.apply(current === 'dark' ? 'light' : 'dark');
  },
  init() {
    this.apply(this.get());
  }
};
Theme.init();

/* ============================== UTILS ============================== */
const Utils = {
  /* ============================== NOTIFIKASI ============================== */
  notify(msg, type = 'info', duration = 4000) {
    let container = document.getElementById('notif-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notif-container';
      document.body.appendChild(container);
    }
    const notif = document.createElement('div');
    notif.className = `notif ${type}`;
    notif.textContent = msg;
    container.appendChild(notif);
    setTimeout(() => {
      notif.classList.add('fadeout');
      setTimeout(() => notif.remove(), 300);
    }, duration);
  },

  /* ============================== LOADING ============================== */
  showLoader(show = true) {
    if (!this._loaderTimer) {
      this._loaderTimer = null;
    }
    let loader = document.getElementById('loader-overlay');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'loader-overlay';
      loader.className = 'loader-overlay';
      loader.innerHTML = '<div class="spinner"></div>';
      document.body.appendChild(loader);
    }
    if (this._loaderTimer) {
      clearTimeout(this._loaderTimer);
      this._loaderTimer = null;
    }
    loader.classList.toggle('active', show);
    if (show) {
      this._loaderTimer = setTimeout(() => {
        loader.classList.remove('active');
        this._loaderTimer = null;
      }, 5000);
    }
  },

  /* ============================== FORMAT TANGGAL ============================== */
  formatDate(d) {
    if (!d) return '-';
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return d;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  },

  formatDateLong(d) {
    if (!d) return '-';
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return d;
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  },

  formatDateInput(d) {
    if (!d) return '';
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return '';
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  addMonths(date, months) {
    const d = new Date(date.getTime());
    const targetMonth = d.getMonth() + months;
    d.setMonth(targetMonth);
    if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) d.setDate(0);
    return d;
  },

  /** Hitung usia (tahun) dari tanggal lahir */
  calculateUsia(tanggalLahir) {
    if (!tanggalLahir) return 0;
    const lahir = new Date(tanggalLahir);
    if (isNaN(lahir.getTime())) return 0;
    const now = new Date();
    let usia = now.getFullYear() - lahir.getFullYear();
    const m = now.getMonth() - lahir.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < lahir.getDate())) usia--;
    return usia;
  },

  /** Hitung kelompok umur per 1 Jan tahun ini */
  calculateKelompokUmur(tanggalLahir) {
    if (!tanggalLahir) return '';
    const lahir = new Date(tanggalLahir);
    if (isNaN(lahir.getTime())) return '';
    const refDate = new Date(new Date().getFullYear(), 0, 1);
    let umur = refDate.getFullYear() - lahir.getFullYear();
    const m = refDate.getMonth() - lahir.getMonth();
    if (m < 0 || (m === 0 && refDate.getDate() < lahir.getDate())) umur--;
    if (umur > 19) return 'Senior';
    if (umur >= 16) return 'Group 1';
    if (umur >= 14) return 'Group 2';
    if (umur >= 12) return 'Group 3';
    if (umur >= 10) return 'Group 4';
    if (umur >= 8)  return 'Group 5';
    return 'Group 6';
  },

  /** Validasi & normalisasi waktu mm:ss:ms */
  normalizeWaktu(input) {
    if (!input) return '';
    const cleaned = String(input).trim();
    if (cleaned === '' || cleaned === '-') return '';
    const parts = cleaned.split(/[:.]/);
    if (parts.length < 2) return cleaned;
    const mm = String(parts[0] || '00').padStart(2, '0');
    const ss = String(parts[1] || '00').padStart(2, '0');
    const ms = String(parts[2] || '00').padStart(2, '0');
    return `${mm}.${ss}.${ms}`;
  },

  formatBool(v) { return (v === true || String(v).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE'; },

  confirm(message) {
    return new Promise(resolve => {
      const html = `
        <div class="modal-backdrop active" id="confirm-modal">
          <div class="modal" style="max-width:400px;">
            <div class="modal-body"><p style="font-size:15px;">${message}</p></div>
            <div class="modal-footer">
              <button class="btn btn-secondary" data-confirm="no">Batal</button>
              <button class="btn btn-danger" data-confirm="yes">Ya, Lanjutkan</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      const modal = document.getElementById('confirm-modal');
      modal.querySelectorAll('[data-confirm]').forEach(b => {
        b.addEventListener('click', () => {
          modal.remove();
          resolve(b.dataset.confirm === 'yes');
        });
      });
    });
  },

  /* ============================== MENGHINDARI BUG SQL INJECTION ============================== */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  },

  /* ============================== WHATSAPP LINK HELPER ============================== */
  waLink(phone, message) {
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  },

/* ============================== NAVBAR ============================== */
  mountNavbar(activeRoute = '') {
    const session = Auth.getSession();
    const isDark = Theme.get() === 'dark';
    const themeSwitchHtml = `
      <button type="button" id="theme-switch" class="theme-switch ${isDark ? 'is-dark' : ''}" aria-label="Toggle Theme" title="Toggle Theme">
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <svg class="icon-moon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 109.8 9.8z"/>
        </svg>
      </button>
    `;
    let authLinks = '';
    let actionButtons = '';
    if (session) {
      const dashboardHref = session.role === 'admin' ? 'admin.html' : 'peserta.html';
      authLinks = `
        <a href="${dashboardHref}" class="nav-link ${
          activeRoute === 'dashboard' ||
          activeRoute === 'peserta' ||
          activeRoute === 'admin'
            ? 'active'
            : ''
        }">Dashboard</a>
        ${
          session.role === 'peserta'
            ? `<a href="profile.html" class="nav-link ${activeRoute === 'profile' ? 'active' : ''}">Profile</a>`
            : ''
        }
      `;
      actionButtons = `
        <button class="btn btn-sm btn-secondary" onclick="Auth.logout()">Logout</button>
      `;
    } else {
      actionButtons = `
        <a href="login.html" class="nav-link ${activeRoute === 'login' ? 'active' : ''}">Login</a>
        <a href="registrasi.html" class="btn btn-accent btn-sm nav-cta">Daftar Sekarang</a>
      `;
    }
    const html = `
      <nav class="navbar">
        <div class="navbar-aura" aria-hidden="true"></div>
        <div class="navbar-inner">
          <a href="index.html" class="navbar-brand">
            <div class="navbar-brand-logo">
              <img src="assets/images/logo.png" alt="${CONFIG.BRAND_NAME}" onerror="this.style.display='none';this.parentElement.textContent='🏊';">
            </div>
            <span>${CONFIG.BRAND_NAME}</span>
          </a>
          <div class="navbar-menu" id="navbar-menu">
            <div class="navbar-links">
              <a href="index.html" class="nav-link ${activeRoute === 'home' ? 'active' : ''}">Home</a>
              ${authLinks}
            </div>
            <div class="navbar-actions">
              ${actionButtons}
            </div>
          </div>
          <div class="navbar-end">
            ${themeSwitchHtml}
            <button class="navbar-toggle" id="navbar-toggle" aria-label="Menu" aria-expanded="false">☰</button>
          </div>
        </div>
      </nav>
    `;
    document.body.insertAdjacentHTML('afterbegin', html);
    const toggleBtn = document.getElementById('navbar-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const menu = document.getElementById('navbar-menu');
        const shown = menu.classList.toggle('show');
        toggleBtn.setAttribute('aria-expanded', shown ? 'true' : 'false');
      });
    }
    const themeSwitch = document.getElementById('theme-switch');
    if (themeSwitch) {
      themeSwitch.addEventListener('click', () => Theme.toggle());
    }
  },

/* ============================== FOOTER ============================== */
  mountFooter() {
    const locs = CONFIG.LOCATIONS;
    const slides = locs.map((loc, i) => `
      <div class="map-slide" data-index="${i}">
        <div class="map-frame">
          <iframe src="${loc.embedSrc}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="${loc.name}"></iframe>
          <a href="${loc.mapsUrl}" target="_blank" rel="noopener" class="map-open-btn">
            📍 Buka di Google Maps
          </a>
        </div>
        <div class="map-caption">
          <strong>${loc.name}</strong>
          <span>${loc.address}</span>
        </div>
      </div>`).join('');
    const dots = locs.map((_, i) =>
      `<button class="map-dot ${i === 0 ? 'active' : ''}" data-target="${i}" aria-label="Lokasi ${i + 1}"></button>`
    ).join('');
    const html = `
      <footer class="footer">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-about">
              <h4>${CONFIG.BRAND_NAME}</h4>
              <p>Klub pelatihan renang profesional di Bontang dengan pelatih berpengalaman. Latihan lebih terstruktur dan menyenangkan bersama Bontang Akuatik Swimming Club.</p>
            </div>
            <div class="footer-maps">
              <h4>📍 Lokasi Latihan</h4>
              <div class="maps-carousel" id="maps-carousel">${slides}</div>
              <div class="map-dots" id="map-dots">${dots}</div>
            </div>
          </div>
          <div class="footer-bottom">
            © ${new Date().getFullYear()} ${CONFIG.BRAND_NAME} • Klub Renang Bontang • All rights reserved.
          </div>
        </div>
      </footer>`;
    document.body.insertAdjacentHTML('beforeend', html);
    // Maps carousel logic
    const carousel = document.getElementById('maps-carousel');
    const dotEls = document.querySelectorAll('#map-dots .map-dot');
    if (carousel && dotEls.length) {
      // Klik dot → scroll ke slide
      dotEls.forEach(dot => {
        dot.addEventListener('click', () => {
          const idx = Number(dot.dataset.target);
          const slide = carousel.querySelector(`.map-slide[data-index="${idx}"]`);
          if (slide) carousel.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
        });
      });
      // Update dot saat di-swipe
      carousel.addEventListener('scroll', () => {
        const idx = Math.round(carousel.scrollLeft / carousel.clientWidth);
        dotEls.forEach((d, i) => d.classList.toggle('active', i === idx));
      });
    }
  }
};