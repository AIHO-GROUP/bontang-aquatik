
(function (global) {
  'use strict';

  const VIEW_KEY = 'swim_jadwal_view';

  function getUser() {
    try {
      if (Auth && typeof Auth.getUser === 'function') return Auth.getUser() || {};
      const s = Auth.getSession(); return s ? s.data : {};
    } catch (_) { return {}; }
  }

  function getViewMode() {
    try { return localStorage.getItem(VIEW_KEY) || 'grid'; } catch (_) { return 'grid'; }
  }
  function setViewMode(mode) {
    try { localStorage.setItem(VIEW_KEY, mode); } catch (_) {}
    document.dispatchEvent(new CustomEvent('jadwalviewchange', { detail: { mode } }));
  }

  function waLink(phone, message) {
    return `https://wa.me/${String(phone).replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
  }

  /* ---------- Bagikan rekomendasi (WhatsApp) ---------- */
  function shareRecommendation() {
    const user = getUser();
    const msg = `Saya rekomendasikan pelatihan renang di Bontang Akuatik, kunjungi bontangaquatik.com untuk informasi lebih lengkapnya!`;
    window.open(waLink(CONFIG.CONTACT.whatsapp, msg), '_blank');
  }

  /* ---------- Pengaduan / pertanyaan ke admin ---------- */
  function openContactAdmin() {
    const user = getUser();
    const nama = user.nama || user.Nama_Lengkap || 'Peserta';
    const body = `
      <p class="form-helper" style="margin-bottom:12px;">Tulis pesan Anda, lalu pilih akan dikirim lewat WhatsApp atau Email.</p>
      <div class="form-group">
        <label>Pesan untuk admin</label>
        <textarea id="contact-msg" class="form-control" rows="4" placeholder="Contoh: menanyakan jadwal pengganti minggu depan"></textarea>
      </div>
      <div class="contact-channel-row">
        <button type="button" class="btn btn-success btn-block" id="contact-wa">💬 Kirim via WhatsApp</button>
        <button type="button" class="btn btn-secondary btn-block" id="contact-email">✉️ Kirim via Email</button>
      </div>`;
    const m = UI.modal({ title: 'Hubungi Admin', size: 'sm', body });

    function compose(channel) {
      const typed = (m.el.querySelector('#contact-msg').value || '').trim();
      const pesan = typed || '(Sampaikan Pesan)';
      const full = `Halo admin Bontang Akuatik, saya ${nama} peserta dari pelatihan renang bontang akuatik ingin ${pesan}`;
      if (channel === 'wa') {
        window.open(waLink(CONFIG.CONTACT.whatsapp, full), '_blank');
      } else {
        const subject = encodeURIComponent('Pengaduan / Pertanyaan Peserta - ' + nama);
        window.location.href = `mailto:${CONFIG.CONTACT.email}?subject=${subject}&body=${encodeURIComponent(full)}`;
      }
      m.close();
    }
    m.el.querySelector('#contact-wa').addEventListener('click', () => compose('wa'));
    m.el.querySelector('#contact-email').addEventListener('click', () => compose('email'));
  }

  /* ---------- Modal utama Pengaturan ---------- */
  function open() {
    const currentTheme = (typeof Theme !== 'undefined') ? Theme.get() : 'light';
    const currentView = getViewMode();
    const seg = (group, value, options) => `
      <div class="ui-segment" data-seg="${group}">
        ${options.map(o => `<button type="button" data-val="${o.v}" class="${value === o.v ? 'active' : ''}">${o.t}</button>`).join('')}
      </div>`;

    const body = `
      <div class="settings-row">
        <div class="settings-row__label"><strong>Tema Tampilan</strong><small>Terang atau gelap</small></div>
        ${seg('theme', currentTheme, [{ v: 'light', t: '☀️ Terang' }, { v: 'dark', t: '🌙 Gelap' }])}
      </div>
      <div class="settings-row">
        <div class="settings-row__label"><strong>Tampilan Jadwal</strong><small>Mode grid atau kalender</small></div>
        ${seg('view', currentView, [{ v: 'grid', t: '▦ Grid' }, { v: 'calendar', t: '📅 Kalender' }])}
      </div>
      <hr class="settings-divider">
      <button type="button" class="btn btn-success btn-block settings-action" id="set-share">
        💬 Bagikan Rekomendasi
      </button>
      <button type="button" class="btn btn-secondary btn-block settings-action" id="set-contact">
        Pengaduan Layanan
      </button>`;

    const m = UI.modal({ title: 'Pengaturan', size: 'sm', body });

    // Segmented: tema
    m.el.querySelector('[data-seg="theme"]').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-val]'); if (!btn) return;
      m.el.querySelectorAll('[data-seg="theme"] button').forEach(b => b.classList.toggle('active', b === btn));
      if (typeof Theme !== 'undefined') Theme.apply(btn.dataset.val);
    });
    // Segmented: view mode
    m.el.querySelector('[data-seg="view"]').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-val]'); if (!btn) return;
      m.el.querySelectorAll('[data-seg="view"] button').forEach(b => b.classList.toggle('active', b === btn));
      setViewMode(btn.dataset.val);
      UI.toast('Tampilan jadwal: ' + (btn.dataset.val === 'calendar' ? 'Kalender' : 'Grid'), 'success', { duration: 1800 });
    });
    const shareBtn = m.el.querySelector('#set-share');
    if (shareBtn) shareBtn.addEventListener('click', shareRecommendation);
    const contactBtn = m.el.querySelector('#set-contact');
    if (contactBtn) contactBtn.addEventListener('click', () => { m.close(); openContactAdmin(); });
  }

  global.PesertaSettings = { open, getViewMode, setViewMode, shareRecommendation, openContactAdmin };
})(window);
