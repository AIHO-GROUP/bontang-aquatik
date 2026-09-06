/**
 * ===================================================================
 * peserta-settings.js — Menu Pengaturan peserta
 * ===================================================================
 * Dibuka dari menu profil (avatar) di navbar, BUKAN dari tab dashboard,
 * agar navigasi utama tetap fokus pada fungsi operasional.
 *
 * Semua tautan ke WhatsApp admin dibangun lewat modul WA sehingga
 * identitas peserta selalu ikut terkirim.
 */
(function (global) {
  'use strict';

  const VIEW_KEY = 'swim_jadwal_view';

  function currentPeserta() {
    const id = Auth.getId();
    return (id && Store.findPeserta(id)) || Auth.getUser() || {};
  }

  function getViewMode() {
    try { return localStorage.getItem(VIEW_KEY) || 'grid'; } catch (e) { return 'grid'; }
  }

  function setViewMode(mode) {
    try { localStorage.setItem(VIEW_KEY, mode); } catch (e) { /* mode privat */ }
    document.dispatchEvent(new CustomEvent('jadwalviewchange', { detail: { mode } }));
  }

  /** Bagikan rekomendasi ke kontak mana pun (WhatsApp membuka pemilih kontak). */
  function shareRecommendation() {
    const text = WA.Templates.rekomendasi();
    if (navigator.share) {
      navigator.share({ title: CONFIG.BRAND_NAME, text }).catch(() => {
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
      });
      return;
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }

  /** Pengaduan / pertanyaan ke admin. */
  function openContactAdmin() {
    const peserta = currentPeserta();
    const body =
      '<p class="form-helper" style="margin-bottom:12px;">' +
        'Tulis pesan Anda. Identitas peserta (nama, nomor peserta, dan grup) ' +
        'otomatis disertakan agar admin langsung mengenali Anda.</p>' +
      '<div class="form-group">' +
        '<label for="contact-msg">Pesan untuk admin</label>' +
        '<textarea id="contact-msg" class="form-control" rows="4" ' +
          'placeholder="Contoh: menanyakan jadwal pengganti minggu depan"></textarea>' +
      '</div>' +
      '<div class="contact-channel-row">' +
        '<button type="button" class="btn btn-success btn-block" id="contact-wa">💬 Kirim via WhatsApp</button>' +
        '<button type="button" class="btn btn-secondary btn-block" id="contact-email">✉️ Kirim via Email</button>' +
      '</div>';

    const m = UI.modal({ title: 'Hubungi Admin', size: 'sm', body });

    function compose(channel) {
      const typed = (m.el.querySelector('#contact-msg').value || '').trim();
      const pesan = WA.Templates.pengaduan(peserta, typed);
      if (channel === 'wa') {
        WA.open(pesan);
      } else {
        const subject = 'Pertanyaan Peserta - ' + (peserta.Nama_Lengkap || peserta.nama || '');
        window.location.href = 'mailto:' + CONFIG.CONTACT.email +
          '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(pesan);
      }
      m.close();
    }

    m.el.querySelector('#contact-wa').addEventListener('click', () => compose('wa'));
    m.el.querySelector('#contact-email').addEventListener('click', () => compose('email'));
  }

  /** Modal utama Pengaturan. */
  function open() {
    const currentTheme = Theme.get();
    const currentView = getViewMode();
    const peserta = currentPeserta();

    const seg = (group, value, options) =>
      '<div class="ui-segment" data-seg="' + group + '">' +
        options.map((o) => '<button type="button" data-val="' + o.v + '" class="' +
          (value === o.v ? 'active' : '') + '">' + o.t + '</button>').join('') +
      '</div>';

    const body =
      '<div class="settings-identity">' +
        '<div><span>Nomor Peserta</span><strong>' +
          Utils.escapeHtml(peserta.Nomor_Peserta || peserta.nomor_peserta || '-') + '</strong></div>' +
        '<div><span>Grup Latihan</span><strong>' +
          Utils.escapeHtml(peserta.Kelas || peserta.kelas || '-') + '</strong></div>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-row__label"><strong>Tema Tampilan</strong><small>Terang atau gelap</small></div>' +
        seg('theme', currentTheme, [{ v: 'light', t: '☀️ Terang' }, { v: 'dark', t: '🌙 Gelap' }]) +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-row__label"><strong>Tampilan Jadwal</strong><small>Grid atau kalender</small></div>' +
        seg('view', currentView, [{ v: 'grid', t: '▦ Grid' }, { v: 'calendar', t: '📅 Kalender' }]) +
      '</div>' +
      '<hr class="settings-divider">' +
      // Urutan tombol mengikuti kepentingan peserta: urusan akunnya sendiri
      // lebih dulu, lalu bantuan, dan ajakan berbagi diletakkan paling akhir
      // karena sifatnya opsional.
      '<a href="profile.html" class="btn btn-secondary btn-block settings-action">Profil Saya</a>' +
      '<a href="update-password.html" class="btn btn-secondary btn-block settings-action">Ganti Password</a>' +
      '<button type="button" class="btn btn-secondary btn-block settings-action" id="set-contact">' +
        'Pengaduan / Pertanyaan</button>' +
      '<button type="button" class="btn btn-success btn-block settings-action" id="set-share">' +
        '💬 Bagikan Rekomendasi</button>';

    const m = UI.modal({ title: 'Pengaturan', size: 'sm', body });

    m.el.querySelector('[data-seg="theme"]').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-val]'); if (!btn) return;
      m.el.querySelectorAll('[data-seg="theme"] button').forEach((b) => b.classList.toggle('active', b === btn));
      Theme.apply(btn.dataset.val);
    });

    m.el.querySelector('[data-seg="view"]').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-val]'); if (!btn) return;
      m.el.querySelectorAll('[data-seg="view"] button').forEach((b) => b.classList.toggle('active', b === btn));
      setViewMode(btn.dataset.val);
      UI.toast('Tampilan jadwal: ' + (btn.dataset.val === 'calendar' ? 'Kalender' : 'Grid'), 'success', { duration: 1600 });
    });

    m.el.querySelector('#set-share').addEventListener('click', shareRecommendation);
    m.el.querySelector('#set-contact').addEventListener('click', () => { m.close(); openContactAdmin(); });
  }

  global.PesertaSettings = { open, getViewMode, setViewMode, shareRecommendation, openContactAdmin };
})(window);
