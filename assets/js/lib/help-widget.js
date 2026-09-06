/**
 * ===================================================================
 * help-widget.js — Tombol bantuan mengambang (FAQ + WhatsApp)
 * ===================================================================
 * Tombol bulat di sudut KIRI BAWAH layar yang membuka daftar pertanyaan
 * umum, plus pintasan menghubungi admin lewat WhatsApp.
 *
 * Tombol dapat DIGESER oleh pengguna bila menutupi konten, dan posisinya
 * diingat per perangkat. Menggeser tidak ikut membuka panel: klik hanya
 * dihitung bila jari/kursor bergerak kurang dari ambang kecil.
 *
 * Pesan WhatsApp dibangun lewat modul WA, sehingga bila pengguna sedang
 * masuk sebagai peserta, identitasnya otomatis ikut terkirim ke admin.
 */
const HelpWidget = (function () {
  'use strict';

  const POS_KEY = 'swim_help_pos';
  const DRAG_THRESHOLD = 6;     // piksel; di bawah ini dianggap klik, bukan geser
  const MARGIN = 12;            // jarak minimum dari tepi layar

  let root = null;
  let panel = null;
  let terbuka = false;

  /* ---------------- Ikon ---------------- */
  const ICON_TANYA =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"/>' +
    '<path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  const ICON_TUTUP =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" aria-hidden="true">' +
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  const ICON_WA =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.48-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z"/>' +
    '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.02h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.23 8.23 0 0 1 8.24 8.24c0 4.54-3.7 8.23-8.24 8.23z"/></svg>';

  /* ---------------- Posisi tersimpan ---------------- */
  function bacaPosisi() {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return (typeof p.left === 'number' && typeof p.top === 'number') ? p : null;
    } catch (e) { return null; }
  }

  function simpanPosisi(left, top) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ left, top })); }
    catch (e) { /* mode privat */ }
  }

  /** Jaga tombol tetap di dalam layar (mis. setelah perangkat diputar). */
  function batasi(left, top) {
    const w = root.offsetWidth || 56;
    const h = root.offsetHeight || 56;
    return {
      left: Math.min(Math.max(MARGIN, left), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
      top: Math.min(Math.max(MARGIN, top), Math.max(MARGIN, window.innerHeight - h - MARGIN))
    };
  }

  /**
   * Posisi default (kiri bawah) ditentukan CSS, bukan JavaScript.
   *
   * Menghitungnya dari window.innerHeight saat pemasangan tidak dapat
   * diandalkan: tinggi viewport belum tentu final ketika DOMContentLoaded
   * terjadi, sehingga tombol bisa terjepit ke tepi atas. Koordinat inline
   * baru dipakai setelah pengguna benar-benar menggesernya.
   */
  function posisiDefault() {
    root.style.left = '';
    root.style.top = '';
    root.style.right = '';
    root.style.bottom = '';
    root.classList.add('is-bottom');
    root.classList.remove('is-right');
  }

  function terapkanPosisi(left, top) {
    const p = batasi(left, top);
    root.style.left = p.left + 'px';
    root.style.top = p.top + 'px';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    // Panel dibuka ke atas bila tombol berada di paruh bawah layar.
    root.classList.toggle('is-bottom', p.top > window.innerHeight / 2);
    root.classList.toggle('is-right', p.left > window.innerWidth / 2);
    return p;
  }

  /** Apakah pengguna sudah memindahkan tombol dari posisi bawaannya? */
  function sudahDigeser() { return !!root.style.top; }

  /* ---------------- Isi panel ---------------- */
  function bangunPanel() {
    const daftar = (CONFIG.FAQ || []).map((item, i) => {
      let aksi = '';
      if (item.cta === 'wa') {
        aksi = '<button type="button" class="help-faq__cta" data-help="wa">' +
               ICON_WA + ' Tanya Admin via WhatsApp</button>';
      } else if (item.cta === 'daftar') {
        aksi = '<a class="help-faq__cta" href="registrasi.html">Buka Halaman Pendaftaran</a>';
      }
      return '<details class="help-faq" name="help-faq">' +
        '<summary>' + Utils.escapeHtml(item.q) + '</summary>' +
        '<div class="help-faq__body"><p>' + item.a + '</p>' + aksi + '</div>' +
      '</details>';
    }).join('');

    return '<div class="help-panel__head">' +
        '<div><strong>Pusat Bantuan</strong><span>Pertanyaan yang sering diajukan</span></div>' +
        '<button type="button" class="help-panel__close" data-help="tutup" aria-label="Tutup bantuan">' +
          ICON_TUTUP + '</button>' +
      '</div>' +
      '<div class="help-panel__body">' + daftar + '</div>' +
      '<div class="help-panel__foot">' +
        '<p>Tidak menemukan jawaban Anda?</p>' +
        '<button type="button" class="btn btn-success btn-block" data-help="wa">' +
          ICON_WA + ' Hubungi Admin via WhatsApp</button>' +
      '</div>';
  }

  /* ---------------- Buka / tutup ---------------- */
  function buka() {
    if (terbuka) return;
    terbuka = true;
    panel.hidden = false;
    root.classList.add('is-open');
    root.querySelector('.help-fab').setAttribute('aria-expanded', 'true');
    root.querySelector('.help-fab').innerHTML = ICON_TUTUP;
  }

  function tutup() {
    if (!terbuka) return;
    terbuka = false;
    panel.hidden = true;
    root.classList.remove('is-open');
    root.querySelector('.help-fab').setAttribute('aria-expanded', 'false');
    root.querySelector('.help-fab').innerHTML = ICON_TANYA;
  }

  function toggle() { terbuka ? tutup() : buka(); }

  /** Pesan WhatsApp membawa identitas peserta bila pengguna sedang masuk. */
  function hubungiAdmin() {
    const id = (typeof Auth !== 'undefined' && Auth.getRole() === CONFIG.ROLES.PESERTA)
      ? Auth.getId() : null;
    const peserta = id && typeof Store !== 'undefined' ? Store.findPeserta(id) : null;
    WA.open(peserta ? WA.Templates.pengaduan(peserta, '') : WA.Templates.calonPeserta());
    tutup();
  }

  /* ---------------- Geser tombol ---------------- */
  function pasangGeser(fab) {
    let mulaiX = 0, mulaiY = 0, awalKiri = 0, awalAtas = 0;
    let menggeser = false, aktif = false;

    const turun = (e) => {
      if (e.button != null && e.button !== 0) return;
      aktif = true;
      menggeser = false;
      mulaiX = e.clientX;
      mulaiY = e.clientY;
      const r = root.getBoundingClientRect();
      awalKiri = r.left;
      awalAtas = r.top;
      fab.setPointerCapture(e.pointerId);
    };

    const gerak = (e) => {
      if (!aktif) return;
      const dx = e.clientX - mulaiX;
      const dy = e.clientY - mulaiY;
      if (!menggeser && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

      if (!menggeser) { menggeser = true; root.classList.add('is-dragging'); tutup(); }
      e.preventDefault();
      terapkanPosisi(awalKiri + dx, awalAtas + dy);
    };

    const naik = (e) => {
      if (!aktif) return;
      aktif = false;
      try { fab.releasePointerCapture(e.pointerId); } catch (err) { /* abaikan */ }

      if (menggeser) {
        root.classList.remove('is-dragging');
        const r = root.getBoundingClientRect();
        simpanPosisi(r.left, r.top);
        menggeser = false;
        return;
      }
      toggle();   // gerakan di bawah ambang -> dianggap klik
    };

    fab.addEventListener('pointerdown', turun);
    fab.addEventListener('pointermove', gerak);
    fab.addEventListener('pointerup', naik);
    fab.addEventListener('pointercancel', () => {
      aktif = false; menggeser = false; root.classList.remove('is-dragging');
    });
  }

  /* ---------------- Pemasangan ---------------- */
  function mount() {
    if (document.getElementById('help-widget')) return;
    if (!CONFIG.FAQ || !CONFIG.FAQ.length) return;

    root = document.createElement('div');
    root.id = 'help-widget';
    root.className = 'help-widget';
    root.innerHTML =
      '<div class="help-panel" id="help-panel" role="dialog" aria-label="Pusat bantuan" hidden>' +
        bangunPanel() +
      '</div>' +
      '<button type="button" class="help-fab" aria-label="Bantuan & pertanyaan umum" ' +
              'aria-expanded="false" aria-controls="help-panel" title="Bantuan">' +
        ICON_TANYA +
      '</button>';
    document.body.appendChild(root);
    panel = root.querySelector('#help-panel');

    // Posisi awal: sudut kiri bawah lewat CSS, atau posisi terakhir yang
    // dipilih pengguna bila ia pernah menggeser tombolnya.
    const tersimpan = bacaPosisi();
    if (tersimpan) terapkanPosisi(tersimpan.left, tersimpan.top);
    else posisiDefault();

    pasangGeser(root.querySelector('.help-fab'));

    root.addEventListener('click', (e) => {
      const aksi = e.target.closest('[data-help]');
      if (!aksi) return;
      if (aksi.dataset.help === 'wa') hubungiAdmin();
      if (aksi.dataset.help === 'tutup') tutup();
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutup(); });
    document.addEventListener('click', (e) => {
      if (terbuka && !root.contains(e.target)) tutup();
    });
    // Setelah layar berubah ukuran (mis. ponsel diputar), tombol yang pernah
    // digeser dijaga tetap di dalam viewport. Tombol yang masih memakai
    // posisi bawaan dibiarkan diatur CSS.
    window.addEventListener('resize', () => {
      if (!sudahDigeser()) return;
      const r = root.getBoundingClientRect();
      terapkanPosisi(r.left, r.top);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  return { mount, buka, tutup, hubungiAdmin };
})();
