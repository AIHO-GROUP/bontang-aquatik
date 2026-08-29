(function () {
  'use strict';
  const SCRIPT = document.currentScript || (function () {
    const list = document.getElementsByTagName('script');
    return list[list.length - 1];
  })();
  const DS = (SCRIPT && SCRIPT.dataset) ? SCRIPT.dataset : {};
  const PWA = {
    /* ---------- KONFIGURASI ---------- */
    KEY_DISMISSED: 'pwa_install_dismissed',
    KEY_INSTALLED: 'pwa_installed',
    DISMISS_DAYS:  7,
    BANNER_DELAY:  3000,
    SW_PATH:       DS.sw    || '/service-worker.js',
    SW_SCOPE:      DS.scope || null,
    MANIFEST_HREF: DS.manifest || null,
    DEBUG: (function () {
      if (DS.debug != null) return DS.debug !== 'false';
      return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
          || /[?&]pwadebug\b/.test(location.search)
          || true;
    })(),
    /* ---------- STATE ---------- */
    deferredPrompt: null,
    registration:   null,
    lastFocused:    null,
    _installable:   false,
    _env:           null,
    /* ---------- LOGGING ---------- */
    _log(...a)   { if (this.DEBUG) console.log(...a); },
    _warn(...a)  { if (this.DEBUG) console.warn(...a); },
    _info(...a)  { if (this.DEBUG) console.info(...a); },
    _group(t)    { if (this.DEBUG && console.group) console.group(t); },
    _groupEnd()  { if (this.DEBUG && console.groupEnd) console.groupEnd(); },
    /* ---------- DETEKSI ---------- */
    env() {
      if (this._env) return this._env;
      const ua = navigator.userAgent || '';
      const uaData = navigator.userAgentData || null;
      const plat = (navigator.platform || '').toLowerCase();
      const maxTouch = navigator.maxTouchPoints || 0;
      /* ---------- IOS ---------- */
      const isIOSClassic = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
      const isIPadOS = /Macintosh/.test(ua) && maxTouch > 1;
      const isIOS = isIOSClassic || isIPadOS;
      const isAndroid = /Android/i.test(ua);
      const isWindows = /Windows|Win32|Win64|WinCE/i.test(ua) || plat.indexOf('win') === 0;
      const isMac = (/Macintosh|Mac OS X/i.test(ua) || plat.indexOf('mac') === 0) && !isIOS;
      const isLinux = (/Linux/i.test(ua) || plat.indexOf('linux') === 0) && !isAndroid;
      const isChromeOS = /CrOS/i.test(ua);
      /* ---------- BROWSER ---------- */
      const isEdge      = /Edg\//i.test(ua) || /EdgA\//i.test(ua) || /EdgiOS\//i.test(ua);
      const isOpera     = /OPR\//i.test(ua) || /Opera|OPT\//i.test(ua);
      const isSamsung   = /SamsungBrowser/i.test(ua);
      const isFirefox   = /Firefox\//i.test(ua) || /FxiOS\//i.test(ua);
      const isBrave     = !!(navigator.brave && typeof navigator.brave.isBrave === 'function');
      /* ---------- CHROME ---------- */
      const isChromiumUA = /Chrome\//i.test(ua) || /CriOS\//i.test(ua) || (uaData && uaData.brands || []).some(b => /Chrom(e|ium)/i.test(b.brand));
      const isChrome    = isChromiumUA && !isEdge && !isOpera && !isSamsung && !isBrave;
      const isSafari    = /Safari/i.test(ua) && !isChromiumUA && !isFirefox && !isEdge && !isOpera && !isSamsung;
      const isInApp =
        /(FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|WhatsApp|WeChat|MicroMessenger|Snapchat|TikTok|Musical_ly|GSA\/|; wv\)|WebView)/i.test(ua)
        || (isAndroid && /Version\/[\d.]+/.test(ua) && /Chrome\/[.0-9]+ Mobile/.test(ua) && !isSamsung && !isEdge && !isOpera && !isFirefox && !/Chrome\/[.0-9]+ Mobile Safari/.test(ua));
      const supportsBIP = isChromiumUA && !isIOS && !isFirefox;
      let osName = 'Perangkat';
      if (isIOS)          osName = isIPadOS ? 'iPadOS' : 'iOS';
      else if (isAndroid) osName = 'Android';
      else if (isChromeOS) osName = 'ChromeOS';
      else if (isWindows) osName = 'Windows';
      else if (isMac)     osName = 'macOS';
      else if (isLinux)   osName = 'Linux';
      let browserName = 'Browser';
      if (isInApp)        browserName = 'In-App Browser';
      else if (isEdge)    browserName = 'Edge';
      else if (isSamsung) browserName = 'Samsung Internet';
      else if (isOpera)   browserName = 'Opera';
      else if (isBrave)   browserName = 'Brave';
      else if (isFirefox) browserName = 'Firefox';
      else if (isChrome)  browserName = 'Chrome';
      else if (isSafari)  browserName = 'Safari';
      const isDesktop = !isIOS && !isAndroid && (isWindows || isMac || isLinux || isChromeOS);
      this._env = {
        ua, isIOS, isIPadOS, isAndroid, isWindows, isMac, isLinux, isChromeOS,
        isEdge, isOpera, isSamsung, isFirefox, isBrave, isChrome, isSafari,
        isChromium: isChromiumUA, isInApp, supportsBIP, isDesktop,
        osName, browserName
      };
      return this._env;
    },
    /* ---------- SHORTCUT DETEKTOR ---------- */
    isIOS()        { return this.env().isIOS; },
    isAndroid()    { return this.env().isAndroid; },
    isDesktop()    { return this.env().isDesktop; },
    isInAppBrowser() { return this.env().isInApp; },
    isSecure() {
      if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
      return location.protocol === 'https:'
          || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    },
    isStandalone() {
      return window.matchMedia('(display-mode: standalone)').matches
          || window.matchMedia('(display-mode: fullscreen)').matches
          || window.matchMedia('(display-mode: minimal-ui)').matches
          || window.navigator.standalone === true
          || document.referrer.startsWith('android-app://');
    },
    isInstalled()  { return this.isStandalone() || localStorage.getItem(this.KEY_INSTALLED) === '1'; },
    isDismissed()  {
      const t = Number(localStorage.getItem(this.KEY_DISMISSED));
      if (!t) return false;
      return (Date.now() - t) / 86400000 < this.DISMISS_DAYS;
    },
    platform() {
      const e = this.env();
      if (e.isIOS)     return 'ios';
      if (e.isAndroid) return 'android';
      return 'desktop';
    },
    /* ---------- INIT ---------- */
    init() {
      this._log('%c[PWA] Initializing…', 'color:#169AC4;font-weight:bold');
      this._diagnose();
      this._testCSSLoaded();
      this._checkManifest();
      this.setupDelegatedClicks();
      this.bindGlobalEvents();
      this.registerServiceWorker();
      this.setupConnectionWatch();
      this.refreshUI();
      if (!this.isInstalled() && !this.isDismissed() && !this.env().isInApp) {
        if (!this.env().supportsBIP) {
          setTimeout(() => this.showBanner(), this.BANNER_DELAY);
        }
      }
      this._log('%c[PWA] Ready ✓', 'color:#16A34A;font-weight:bold');
    },
    _diagnose() {
      if (!this.DEBUG) return;
      const ok = (b) => b ? '✅' : '⚠️';
      const e = this.env();
      const isSecure    = this.isSecure();
      const hasManifest = !!document.querySelector('link[rel="manifest"]');
      const swSupport   = 'serviceWorker' in navigator;
      const btnFound    = !!document.getElementById('pwa-install-btn');
      this._group('[PWA] Diagnostic');
      this._log(`${ok(isSecure)}  Secure context (HTTPS/localhost) : ${isSecure}`);
      this._log(`${ok(hasManifest)}  <link rel="manifest">            : ${hasManifest}`);
      this._log(`${ok(swSupport)}  Service Worker support           : ${swSupport}`);
      this._log(`${ok(btnFound)}  #pwa-install-btn in DOM          : ${btnFound}`);
      this._log(`ℹ️  OS / Browser                    : ${e.osName} / ${e.browserName}`);
      this._log(`ℹ️  Mendukung install otomatis      : ${e.supportsBIP}`);
      this._log(`ℹ️  Standalone (berjalan sbg app)   : ${this.isStandalone()}`);
      if (!isSecure)    this._warn('[PWA] beforeinstallprompt TIDAK akan fire tanpa secure context (HTTPS atau localhost).');
      if (!hasManifest) this._warn('[PWA] Manifest tidak ter-link. Tambahkan <link rel="manifest" href="manifest.json"> di <head>.');
      if (!btnFound)    this._warn('[PWA] #pwa-install-btn tidak ditemukan saat init. Event delegation tetap aktif (tombol bisa muncul belakangan).');
      if (e.isInApp)    this._warn('[PWA] Terdeteksi in-app browser (mis. Instagram/FB/Line). Install PWA umumnya diblokir — arahkan pengguna membuka di Chrome/Safari.');
      if (e.isFirefox && e.isDesktop) this._warn('[PWA] Firefox desktop belum mendukung install PWA native — akan memakai instruksi manual.');
      this._groupEnd();
    },
    _testCSSLoaded() {
      if (!document.body) return false;
      const probe = document.createElement('div');
      probe.className = 'pwa-banner';
      probe.style.cssText = 'position:absolute !important;visibility:hidden;left:-9999px;';
      document.body.appendChild(probe);
      const pos = getComputedStyle(probe).position;
      probe.remove();
      const loaded = pos === 'fixed'; // .pwa-banner di pwa.css adalah position:fixed
      if (!loaded) {
        this._warn('[PWA] pwa.css sepertinya BELUM ter-load. Banner & modal mungkin tak terlihat.');
        this._warn('[PWA] Tambahkan: <link rel="stylesheet" href="pwa.css"> di <head>.');
      }
      return loaded;
    },
    /* ---------- CHECK KESALAHAN ---------- */
    async _checkManifest() {
      const link = document.querySelector('link[rel="manifest"]');
      const href = this.MANIFEST_HREF || (link ? link.href : null);
      if (!href) return;
      try {
        const res = await fetch(href, { credentials: 'same-origin', cache: 'no-cache' });
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok) {
          this._warn(`[PWA] Manifest mengembalikan HTTP ${res.status} (${href}). Pastikan file dapat diakses & tidak diblokir redirect.`);
          return;
        }
        if (ct && !/json|manifest/.test(ct)) {
          this._warn(`[PWA] Manifest content-type = "${ct}", bukan JSON. Ini gejala klasik Cloudflare/redirect mengembalikan halaman HTML. Pastikan /manifest.json disajikan sebagai application/manifest+json dan TIDAK terkena redirect HTTPS yang salah.`);
        }
        const json = await res.clone().json().catch(() => null);
        if (!json) {
          this._warn('[PWA] Manifest tidak dapat di-parse sebagai JSON. Cek isi file / redirect.');
          return;
        }
        const icons = Array.isArray(json.icons) ? json.icons : [];
        const has192 = icons.some(i => /(^|\s)192x192(\s|$)/.test(i.sizes || ''));
        const has512 = icons.some(i => /(^|\s)512x512(\s|$)/.test(i.sizes || ''));
        const displayOK = ['standalone', 'fullscreen', 'minimal-ui'].includes(json.display)
          || (Array.isArray(json.display_override) && json.display_override.some(d => ['standalone','fullscreen','minimal-ui'].includes(d)));
        if (!has192 || !has512) this._warn('[PWA] Manifest kurang ikon 192x192 dan/atau 512x512 (purpose "any"). Chrome mewajibkannya untuk installable.');
        if (!displayOK)          this._warn('[PWA] Manifest "display" bukan standalone/fullscreen/minimal-ui. Chrome tidak akan menawarkan install.');
        if (!json.name && !json.short_name) this._warn('[PWA] Manifest tidak punya name/short_name.');
        this._log('[PWA] Manifest OK & dapat diakses:', href);
      } catch (err) {
        this._warn(`[PWA] Gagal mengambil manifest (${href}): ${err && err.message}. Kemungkinan mixed content / redirect / CORS. Ini menghalangi installability.`);
      }
    },
    /* ---------- EVEN DELEGASI ---------- */
    setupDelegatedClicks() {
      document.addEventListener('click', (e) => {
        const installBtn = e.target.closest('#pwa-install-btn');
        if (installBtn) {
          e.preventDefault();
          this._log('[PWA] Install button clicked.');
          this.handleInstallClick();
          return;
        }
        const actionEl = e.target.closest('[data-pwa-action]');
        if (!actionEl) return;
        const action = actionEl.dataset.pwaAction;
        e.preventDefault();
        if (action === 'install')      this.handleInstallClick();
        else if (action === 'modal')   this.showModal();
        else if (action === 'dismiss') this.dismiss();
        else if (action === 'close')   { this.hideModal(); this.hideBanner(); this.hideUpdateBanner(); }
        else if (action === 'update')  this.applyUpdate();
        else if (action === 'copy-url') this._copyUrl();
      });
    },
    bindGlobalEvents() {
      window.addEventListener('beforeinstallprompt', (e) => {
        // Cegah mini-infobar bawaan, simpan event untuk dipakai tombol kita.
        e.preventDefault();
        this.deferredPrompt = e;
        this._installable = true;
        this._log('[PWA] beforeinstallprompt fired — aplikasi installable.');
        this.refreshUI();
        if (!this.isDismissed() && !this.isInstalled()) {
          setTimeout(() => this.showBanner(), this.BANNER_DELAY);
        }
      });
      window.addEventListener('appinstalled', () => {
        localStorage.setItem(this.KEY_INSTALLED, '1');
        this.deferredPrompt = null;
        this._installable = false;
        this.hideBanner();
        this.hideModal();
        this.refreshUI();
        this.toast('Aplikasi berhasil di download! 🎉', 'success');
        this._log('[PWA] App installed.');
      });
      try {
        window.matchMedia('(display-mode: standalone)').addEventListener('change', () => this.refreshUI());
      } catch (_) { /* Safari lama */ }
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (document.getElementById('pwa-modal'))  this.hideModal();
          if (document.getElementById('pwa-banner')) this.hideBanner();
        }
      });
    },
    /* ---------- SERVICE WORKER ---------- */
    _resolveSWPath() {
      try { return new URL(this.SW_PATH, location.href).href; }
      catch (_) { return this.SW_PATH; }
    },
    registerServiceWorker() {
      if (!('serviceWorker' in navigator)) {
        this._warn('[PWA] Service Worker tidak didukung browser ini.');
        return;
      }
      if (!this.isSecure()) {
        this._warn('[PWA] Service Worker butuh secure context (HTTPS/localhost). Registrasi dilewati.');
        return;
      }
      const swUrl = this._resolveSWPath();
      const opts = { updateViaCache: 'none' };
      if (this.SW_SCOPE) opts.scope = this.SW_SCOPE;
      navigator.serviceWorker.register(swUrl, opts)
        .then((reg) => {
          this.registration = reg;
          this._log('[PWA] Service Worker registered:', reg.scope);
          reg.addEventListener('updatefound', () => {
            const sw = reg.installing;
            if (!sw) return;
            sw.addEventListener('statechange', () => {
              if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                this.showUpdateBanner();
              }
            });
          });
          setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') reg.update().catch(() => {});
          });
        })
        .catch((err) => {
          this._warn('[PWA] Service Worker registration GAGAL:', err && err.message);
          this._warn('[PWA] Penyebab umum: file SW 404, path/scope salah, mixed content, atau redirect HTTPS Cloudflare tidak konsisten. Ini membuat aplikasi TIDAK installable di Chrome.');
        });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    },
    /* ---------- UI REFRESH ---------- */
    refreshUI() {
      const btn = document.getElementById('pwa-install-btn');
      if (!btn) return;
      const labelEl  = btn.querySelector('.pwa-btn-label');
      const iconEl   = btn.querySelector('.pwa-btn-icon');
      const statusEl = document.getElementById('pwa-install-status');
      const e = this.env();
      if (this.isInstalled()) {
        if (labelEl)  labelEl.textContent  = 'Aplikasi Sudah Terinstall';
        if (iconEl)   iconEl.textContent   = '✓';
        if (statusEl) statusEl.textContent = 'Terinstall di perangkat ini';
        btn.disabled = true;
        btn.classList.add('pwa-installed');
        return;
      }
      btn.disabled = false;
      btn.classList.remove('pwa-installed');
      if (this.deferredPrompt) {
        if (labelEl)  labelEl.textContent  = 'Download Aplikasi';
        if (iconEl)   iconEl.textContent   = '⬇';
        if (statusEl) statusEl.textContent = 'Gratis · Tanpa Play Store · < 1 MB';
      } else if (e.isIOS) {
        if (labelEl)  labelEl.textContent  = 'Install di iPhone / iPad';
        if (iconEl)   iconEl.textContent   = '';
        if (statusEl) statusEl.textContent = 'Lihat panduan singkat untuk iOS';
      } else if (e.isInApp) {
        if (labelEl)  labelEl.textContent  = 'Buka di Browser';
        if (iconEl)   iconEl.textContent   = '↗';
        if (statusEl) statusEl.textContent = `Buka lewat ${e.isIOS ? 'Safari' : 'Chrome'} untuk memasang`;
      } else {
        if (labelEl)  labelEl.textContent  = 'Install Aplikasi';
        if (iconEl)   iconEl.textContent   = '⬇';
        if (statusEl) statusEl.textContent = 'Lihat panduan pemasangan';
      }
    },
    /* ---------- INSTALL HANDLER ---------- */
    async handleInstallClick() {
      const e = this.env();
      this._log('[PWA] handleInstallClick →', {
        installed: this.isInstalled(),
        hasDeferredPrompt: !!this.deferredPrompt,
        os: e.osName, browser: e.browserName
      });
      if (this.isInstalled()) {
        this.toast('Aplikasi sudah terinstall di perangkat Anda.', 'info');
        return;
      }
      if (e.isInApp) {
        this.showModal();
        return;
      }
      if (this.deferredPrompt) {
        try {
          this.deferredPrompt.prompt();
          const { outcome } = await this.deferredPrompt.userChoice;
          this.deferredPrompt = null;
          this.toast(
            outcome === 'accepted' ? 'Memasang aplikasi…' : 'Pemasangan dibatalkan.',
            outcome === 'accepted' ? 'info' : 'warning'
          );
          this.refreshUI();
        } catch (err) {
          this._warn('[PWA] Install prompt error:', err);
          this.showModal();
        }
        return;
      }
      this._log('[PWA] Tidak ada native prompt — menampilkan instruksi manual.');
      this.showModal();
    },
    /* ---------- FLOATING BANNER ---------- */
    showBanner() {
      if (document.getElementById('pwa-banner')) return;
      if (this.isInstalled() || this.isDismissed()) return;
      const e = this.env();
      const primary = this.deferredPrompt
        ? `<button class="pwa-banner-btn pwa-banner-btn-primary" data-pwa-action="install">Install</button>`
        : `<button class="pwa-banner-btn pwa-banner-btn-primary" data-pwa-action="modal">Cara Download</button>`;
      const html = `
        <div id="pwa-banner" class="pwa-banner" role="status" aria-live="polite">
          <button class="pwa-banner-close" data-pwa-action="dismiss" aria-label="Tutup">×</button>
          <div class="pwa-banner-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="3"/><line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          </div>
          <div class="pwa-banner-body">
            <strong>Unduh aplikasi Bontang Akuatik</strong>
            <span>Akses lebih cepat tanpa membuka browser.</span>
          </div>
          <div class="pwa-banner-actions">
            ${primary}
            <button class="pwa-banner-btn pwa-banner-btn-ghost" data-pwa-action="dismiss">Nanti</button>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      requestAnimationFrame(() => {
        const b = document.getElementById('pwa-banner');
        if (b) b.classList.add('show');
      });
    },
    hideBanner() {
      const el = document.getElementById('pwa-banner');
      if (!el) return;
      el.classList.remove('show');
      setTimeout(() => el.remove(), 320);
    },
    dismiss() {
      localStorage.setItem(this.KEY_DISMISSED, String(Date.now()));
      this.hideBanner();
    },
    /* ---------- INSTRUKSI MANUAL ---------- */
    _instructions() {
      const e = this.env();
      const menu = '⋮';
      if (e.isInApp) {
        return {
          title: 'Buka di Browser Terlebih Dahulu',
          intro: 'Aplikasi tidak bisa diUnduh dari dalam browser aplikasi ini. Buka halaman di browser bawaan perangkat, lalu Unduh dari sana.',
          steps: [
            { icon: menu, text: `Ketuk menu <strong>(${menu} atau …)</strong> di pojok layar.` },
            { icon: '↗',  text: `Pilih <strong>Buka di ${e.isIOS ? 'Safari' : 'Chrome'}</strong> / "Open in browser".` },
            { icon: '⬇',  text: 'Setelah terbuka di browser, ketuk tombol <strong>Unduh</strong> lagi.' }
          ],
          extraButton: `<button class="btn btn-primary btn-block" data-pwa-action="copy-url">Salin Tautan Halaman</button>`
        };
      }
      if (e.isIOS) {
        if (e.isSafari) {
          return {
            title: 'Unduh di iPhone / iPad',
            intro: 'Tambahkan Bontang Akuatik ke Layar Utama lewat Safari.',
            steps: [
              { icon: this._svgShare(), text: 'Ketuk ikon <strong>Bagikan</strong> di bilah bawah Safari.' },
              { icon: '➕',              text: 'Gulir dan pilih <strong>Tambah ke Layar Utama</strong>.' },
              { icon: '✓',               text: 'Ketuk <strong>Tambah</strong> di kanan atas untuk konfirmasi.' }
            ]
          };
        }
        return {
          title: `Unduh di ${e.osName}`,
          intro: `Di iOS, pemasangan dilakukan lewat menu Bagikan ${e.browserName}.`,
          steps: [
            { icon: this._svgShare(), text: 'Ketuk ikon <strong>Bagikan</strong> pada bilah browser.' },
            { icon: '➕',              text: 'Pilih <strong>Tambah ke Layar Utama</strong>.' },
            { icon: '✓',               text: 'Ketuk <strong>Tambah</strong> untuk konfirmasi.' }
          ]
        };
      }
      if (e.isAndroid) {
        if (e.isFirefox) {
          return {
            title: 'Unduh di Android (Firefox)',
            intro: 'Tambahkan aplikasi lewat menu Firefox.',
            steps: [
              { icon: menu, text: `Ketuk menu <strong>(${menu})</strong> di pojok kanan atas.` },
              { icon: '⬇',  text: 'Pilih <strong>Instal</strong> / <strong>Add to Home screen</strong>.' },
              { icon: '✓',  text: 'Konfirmasi — aplikasi muncul di layar utama.' }
            ]
          };
        }
        if (e.isSamsung) {
          return {
            title: 'Unduh di Android (Samsung Internet)',
            intro: 'Tambahkan aplikasi lewat menu Samsung Internet.',
            steps: [
              { icon: '≡',  text: 'Ketuk menu <strong>(≡)</strong> di bilah bawah.' },
              { icon: '⬇',  text: 'Pilih <strong>Tambahkan halaman ke</strong> → <strong>Layar Beranda</strong>.' },
              { icon: '✓',  text: 'Konfirmasi pemasangan.' }
            ]
          };
        }
        return {
          title: 'Unduh di Android',
          intro: `Tambahkan aplikasi lewat menu ${e.browserName}.`,
          steps: [
            { icon: menu, text: `Ketuk menu <strong>(${menu})</strong> di pojok kanan atas.` },
            { icon: '⬇',  text: 'Pilih <strong>Instal aplikasi</strong> / <strong>Add to Home screen</strong>.' },
            { icon: '✓',  text: 'Konfirmasi — aplikasi muncul di layar utama.' }
          ]
        };
      }
      if (e.isMac && e.isSafari) {
        return {
          title: 'Unduh di Mac (Safari)',
          intro: 'Tambahkan aplikasi ke Dock lewat Safari.',
          steps: [
            { icon: this._svgShare(), text: 'Klik menu <strong>Bagikan</strong> di bilah Safari.' },
            { icon: '📌',             text: 'Pilih <strong>Tambahkan ke Dock</strong> (Add to Dock).' },
            { icon: '✓',              text: 'Klik <strong>Tambah</strong> untuk konfirmasi.' }
          ]
        };
      }
      if (e.isFirefox && e.isDesktop) {
        return {
          title: 'Firefox Desktop',
          intro: 'Firefox di desktop belum mendukung pemasangan PWA secara native. Untuk pengalaman aplikasi penuh, buka situs ini di <strong>Chrome</strong> atau <strong>Microsoft Edge</strong>, lalu klik ikon Install di bilah alamat.',
          steps: [
            { icon: '🔖', text: 'Alternatif: tekan <strong>Ctrl/Cmd + D</strong> untuk menyimpan sebagai bookmark.' },
            { icon: '🌐', text: 'Atau buka di <strong>Chrome / Edge</strong> untuk memasang sebagai aplikasi.' }
          ],
          extraButton: `<button class="btn btn-primary btn-block" data-pwa-action="copy-url">Salin Tautan Halaman</button>`
        };
      }
      return {
        title: `Unduh di ${e.osName}`,
        intro: `Unduh Bontang Akuatik sebagai aplikasi desktop lewat ${e.browserName}.`,
        steps: [
          { icon: '⊕', text: 'Klik ikon <strong>Install</strong> (⊕ / monitor dengan panah) di ujung kanan bilah alamat.' },
          { icon: menu, text: `Atau buka menu <strong>(${menu})</strong> → <strong>Cast, save, and share</strong> / <strong>Apps</strong> → <strong>Install this site as an app</strong>.` },
          { icon: '✓',  text: 'Klik <strong>Install</strong> untuk konfirmasi.' }
        ]
      };
    },
    showModal() {
      if (document.getElementById('pwa-modal')) return;
      this.lastFocused = document.activeElement;
      const cfg = this._instructions();
      const stepsHTML = cfg.steps.map((s, i) => `
        <li class="pwa-modal-step">
          <span class="pwa-modal-step-num">${i + 1}</span>
          <span class="pwa-modal-step-icon">${s.icon}</span>
          <span class="pwa-modal-step-text">${s.text}</span>
        </li>`).join('');
      const footer = cfg.extraButton
        ? cfg.extraButton
        : `<button class="btn btn-primary btn-block" data-pwa-action="close">Mengerti</button>`;
      const html = `
        <div id="pwa-modal" class="pwa-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pwa-modal-title">
          <div class="pwa-modal">
            <button class="pwa-modal-close" data-pwa-action="close" aria-label="Tutup">×</button>
            <div class="pwa-modal-header">
              <div class="pwa-modal-emoji">📲</div>
              <h3 id="pwa-modal-title">${cfg.title}</h3>
              <p>${cfg.intro}</p>
            </div>
            <ol class="pwa-modal-steps">${stepsHTML}</ol>
            <div class="pwa-modal-footer">${footer}</div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      const modal = document.getElementById('pwa-modal');
      modal.addEventListener('click', (e) => { if (e.target === modal) this.hideModal(); });
      requestAnimationFrame(() => {
        modal.classList.add('show');
        const focusable = modal.querySelector('button');
        if (focusable) focusable.focus();
      });
      this._log('[PWA] Modal shown:', cfg.title);
    },
    hideModal() {
      const modal = document.getElementById('pwa-modal');
      if (!modal) return;
      modal.classList.remove('show');
      setTimeout(() => {
        modal.remove();
        if (this.lastFocused && this.lastFocused.focus) this.lastFocused.focus();
      }, 280);
    },
    /* ---------- UPDATE BANNER ---------- */
    showUpdateBanner() {
      if (document.getElementById('pwa-update')) return;
      const html = `
        <div id="pwa-update" class="pwa-update" role="status" aria-live="polite">
          <div class="pwa-update-body">
            <strong>Versi baru tersedia</strong>
            <span>Muat ulang untuk menggunakan versi terbaru aplikasi.</span>
          </div>
          <div class="pwa-update-actions">
            <button class="pwa-banner-btn pwa-banner-btn-primary" data-pwa-action="update">Muat Ulang</button>
            <button class="pwa-banner-btn pwa-banner-btn-ghost" data-pwa-action="close">Nanti</button>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      requestAnimationFrame(() => {
        const u = document.getElementById('pwa-update');
        if (u) u.classList.add('show');
      });
    },
    hideUpdateBanner() {
      const el = document.getElementById('pwa-update');
      if (!el) return;
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    },
    applyUpdate() {
      const reg = this.registration;
      if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      else window.location.reload();
    },
    /* ---------- CONNECTION ---------- */
    setupConnectionWatch() {
      window.addEventListener('online',  () => { this.removeOfflineBadge(); this.toast('Koneksi internet kembali pulih.', 'success'); });
      window.addEventListener('offline', () => { this.showOfflineBadge();  this.toast('Anda offline. Konten dari cache tetap tersedia.', 'warning'); });
      if (!navigator.onLine) this.showOfflineBadge();
    },
    showOfflineBadge() {
      if (document.getElementById('pwa-offline')) return;
      const el = document.createElement('div');
      el.id = 'pwa-offline';
      el.className = 'pwa-offline';
      el.setAttribute('role', 'status');
      el.innerHTML = `<span class="pwa-offline-dot" aria-hidden="true"></span> Offline`;
      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
    },
    removeOfflineBadge() {
      const el = document.getElementById('pwa-offline');
      if (!el) return;
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    },
    /* ---------- TOAST ---------- */
    toast(msg, type = 'info') {
      this._log(`%c[PWA:${type}] ${msg}`, 'color:#0F7FA3');
      if (typeof Utils !== 'undefined' && typeof Utils.notify === 'function') {
        Utils.notify(msg, type);
        return;
      }
      this._inlineToast(msg, type);
    },
    _inlineToast(msg, type) {
      const colors = { success: '#16A34A', warning: '#F59E0B', error: '#DC2626', info: '#169AC4' };
      const div = document.createElement('div');
      div.className = 'pwa-toast-fallback';
      div.style.cssText = `
        position:fixed;top:24px;right:24px;z-index:10003;
        background:#fff;color:#0B0F12;
        border:1px solid #E3EDF5;border-left:4px solid ${colors[type] || colors.info};
        padding:14px 18px;border-radius:10px;max-width:340px;
        font:500 14px Poppins,system-ui,sans-serif;
        box-shadow:0 16px 40px rgba(15,42,68,0.15);
        transform:translateX(120%);opacity:0;
        transition:transform .3s ease,opacity .3s ease;
      `;
      div.textContent = msg;
      document.body.appendChild(div);
      requestAnimationFrame(() => { div.style.transform = 'translateX(0)'; div.style.opacity = '1'; });
      setTimeout(() => {
        div.style.transform = 'translateX(120%)';
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 300);
      }, 3500);
    },
    /* ---------- HELPER ---------- */
    _svgShare() {
      return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/>
        <polyline points="16 6 12 2 8 6"/>
        <line x1="12" y1="2" x2="12" y2="15"/>
      </svg>`;
    },
    _copyUrl() {
      const url = location.href;
      const done = () => this.toast('Tautan disalin. Tempel di browser (Chrome/Safari) untuk memasang.', 'success');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => this._legacyCopy(url, done));
      } else {
        this._legacyCopy(url, done);
      }
    },
    _legacyCopy(text, cb) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); cb && cb(); } catch (_) {}
      ta.remove();
    },
    /* ---------- PUBLIK DEBUG ---------- */
    diagnose() { const d = this.DEBUG; this.DEBUG = true; this._diagnose(); this._testCSSLoaded(); this._checkManifest(); this.DEBUG = d; },
    install()  { this.handleInstallClick(); },
    info()     { return this.env(); }
  };

  /* ---------- BOOTSTRAP ---------- */
  const boot = () => PWA.init();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.PWA = PWA;
})();