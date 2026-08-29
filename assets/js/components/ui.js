/**
 * ===================================================================
 * UI — Reusable Component Layer (Design System)
 * ===================================================================
 * Satu sumber kebenaran untuk komponen UI yang sebelumnya ditulis
 * berulang di banyak file (modal, toast, button, input, select, spinner,
 * ikon mata SVG, skeleton/shimmer). Memuat ini SETELAH utils.js akan
 * meng-upgrade Utils.notify & Utils.confirm secara backward-compatible
 * sehingga seluruh halaman lama otomatis memakai UX yang lebih baik.
 *
 * Dimuat sebagai global `UI`. Tanpa dependency eksternal.
 */
(function (global) {
  'use strict';

  /* ---------- IKON SVG (reusable; pakai currentColor agar tema-aware) ---------- */
  const ICONS = {
    eyeOpen: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M2 12C3.8 7.8 7.5 5 12 5C16.5 5 20.2 7.8 22 12C20.2 16.2 16.5 19 12 19C7.5 19 3.8 16.2 2 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`,
    eyeClosed: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 3L21 21" stroke="var(--color-danger)" stroke-width="2" stroke-linecap="round"/>
        <path d="M10.6 10.7C10.2 11.1 10 11.5 10 12C10 13.1 10.9 14 12 14C12.5 14 12.9 13.8 13.3 13.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M9.9 5.1C10.6 5 11.3 5 12 5C16.5 5 20.2 7.8 22 12C21.2 13.8 20 15.3 18.5 16.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M6.2 6.3C4.5 7.5 3.1 9.4 2 12C3.8 16.2 7.5 19 12 19C13.5 19 14.9 18.7 16.2 18.1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    success: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="var(--color-success)"/><path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="var(--color-danger)"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l9.5 16.5h-19L12 3z" fill="var(--color-warning)"/><path d="M12 9v5M12 16.8v.2" stroke="#1a1300" stroke-width="2.1" stroke-linecap="round"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="var(--color-primary)"/><path d="M12 10.5v6M12 7.6v.2" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/></svg>`
  };

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  /* =================================================================
     TOAST  — UI.toast(message, type?, opts?)
     opts: { title, duration, action:{label, onClick} }
     ================================================================= */
  function getToastStack() {
    let s = document.getElementById('ui-toast-stack');
    if (!s) { s = el('div'); s.id = 'ui-toast-stack'; document.body.appendChild(s); }
    return s;
  }
  function toast(message, type = 'info', opts = {}) {
    const stack = getToastStack();
    const duration = opts.duration != null ? opts.duration : (type === 'error' ? 5200 : 3600);
    const node = el('div', 'ui-toast ' + (type || 'info'));
    node.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icon = el('span', 'ui-toast__icon', ICONS[type] || ICONS.info);
    const body = el('div', 'ui-toast__body');
    if (opts.title) body.appendChild(el('div', 'ui-toast__title', escapeHtml(opts.title)));
    body.appendChild(el('div', 'ui-toast__msg', escapeHtml(message)));

    if (opts.action && opts.action.label) {
      const act = el('button', 'ui-toast__action', escapeHtml(opts.action.label));
      act.addEventListener('click', () => { close(); try { opts.action.onClick && opts.action.onClick(); } catch (_) {} });
      body.appendChild(act);
    }

    const closeBtn = el('button', 'ui-toast__close', '&times;');
    closeBtn.setAttribute('aria-label', 'Tutup');
    let timer = null;
    function close() {
      if (!node.parentNode) return;
      node.classList.add('fadeout');
      setTimeout(() => node.remove(), 280);
      if (timer) clearTimeout(timer);
    }
    closeBtn.addEventListener('click', close);

    node.appendChild(icon); node.appendChild(body); node.appendChild(closeBtn);
    stack.appendChild(node);
    if (duration > 0) timer = setTimeout(close, duration);
    return { close };
  }

  /* =================================================================
     MODAL  — UI.modal({ title, body, size, actions:[{label,variant,onClick,close}], onClose, closeOnBackdrop })
     Mengembalikan { el, close } untuk kontrol lanjutan.
     ================================================================= */
  function modal(cfg = {}) {
    const backdrop = el('div', 'modal-backdrop active');
    const sizeCls = cfg.size ? ' modal-' + cfg.size : '';
    const dialog = el('div', 'modal' + sizeCls);
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    let header = '';
    if (cfg.title) {
      header = `<div class="modal-header"><h3>${escapeHtml(cfg.title)}</h3>
        <button class="modal-close" data-ui-close aria-label="Tutup">&times;</button></div>`;
    }
    const bodyHtml = typeof cfg.body === 'string' ? cfg.body : '';
    dialog.innerHTML = `${header}<div class="modal-body">${bodyHtml}</div>`;

    // Body bisa berupa Node
    if (cfg.body instanceof Node) {
      dialog.querySelector('.modal-body').innerHTML = '';
      dialog.querySelector('.modal-body').appendChild(cfg.body);
    }

    if (Array.isArray(cfg.actions) && cfg.actions.length) {
      const footer = el('div', 'modal-footer');
      cfg.actions.forEach(a => {
        const b = el('button', 'btn btn-' + (a.variant || 'secondary'), escapeHtml(a.label));
        b.addEventListener('click', () => {
          let keepOpen = false;
          if (a.onClick) keepOpen = a.onClick() === false ? false : keepOpen;
          if (a.close !== false) close();
        });
        footer.appendChild(b);
      });
      dialog.appendChild(footer);
    }

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';

    function close() {
      backdrop.style.opacity = '0';
      setTimeout(() => {
        backdrop.remove();
        if (!document.querySelector('.modal-backdrop')) document.body.style.overflow = '';
      }, 180);
      document.removeEventListener('keydown', onKey);
      if (cfg.onClose) try { cfg.onClose(); } catch (_) {}
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    backdrop.querySelectorAll('[data-ui-close]').forEach(b => b.addEventListener('click', close));
    if (cfg.closeOnBackdrop !== false) {
      backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    }

    // Auto-focus elemen pertama yang bisa difokus
    setTimeout(() => {
      const f = dialog.querySelector('input,select,textarea,button:not(.modal-close)');
      if (f) f.focus();
    }, 60);

    return { el: dialog, backdrop, close };
  }

  /* =================================================================
     CONFIRM  — UI.confirm(message, opts?) -> Promise<boolean>
     opts: { title, confirmLabel, cancelLabel, variant }
     ================================================================= */
  function confirm(message, opts = {}) {
    return new Promise(resolve => {
      let settled = false;
      const done = (val) => { if (!settled) { settled = true; resolve(val); } };
      const m = modal({
        title: opts.title || 'Konfirmasi',
        size: 'sm',
        body: `<p style="font-size:15px;line-height:1.55;">${escapeHtml(message)}</p>`,
        closeOnBackdrop: true,
        onClose: () => done(false),
        actions: [
          { label: opts.cancelLabel || 'Batal', variant: 'secondary', onClick: () => done(false) },
          { label: opts.confirmLabel || 'Ya, Lanjutkan', variant: opts.variant || 'danger', onClick: () => done(true) }
        ]
      });
    });
  }

  /* =================================================================
     PASSWORD TOGGLE  — UI.passwordToggle(input, button)
     Mengikat tombol mata SVG reusable ke sebuah input password.
     ================================================================= */
  function passwordToggle(input, button) {
    if (!input || !button) return;
    function render() { button.innerHTML = input.type === 'password' ? ICONS.eyeOpen : ICONS.eyeClosed; }
    button.type = 'button';
    button.setAttribute('aria-label', 'Tampilkan / sembunyikan password');
    button.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      render();
    });
    render();
  }
  /** Auto-bind semua [data-password-toggle] (value = id input) di halaman. */
  function bindPasswordToggles(root = document) {
    root.querySelectorAll('[data-password-toggle]').forEach(btn => {
      if (btn.dataset.uiBound) return;
      const input = document.getElementById(btn.dataset.passwordToggle);
      if (input) { passwordToggle(input, btn); btn.dataset.uiBound = '1'; }
    });
  }

  /* =================================================================
     SKELETON / SHIMMER builders
     ================================================================= */
  function skeletonLines(n = 3) {
    let out = '<span class="skeleton skeleton-title"></span>';
    for (let i = 0; i < n; i++) {
      const w = i % 3 === 0 ? '' : (i % 3 === 1 ? ' skeleton-line-80' : ' skeleton-line-60');
      out += `<span class="skeleton skeleton-text${w}"></span>`;
    }
    return out;
  }
  function skeletonCards(count = 3, lines = 3) {
    let out = '<div class="skeleton-grid">';
    for (let i = 0; i < count; i++) out += `<div class="skeleton-card">${skeletonLines(lines)}</div>`;
    return out + '</div>';
  }
  /** Render shimmer ke dalam container (string id atau elemen). */
  function showSkeleton(target, kind = 'cards', opts = {}) {
    const node = typeof target === 'string' ? document.getElementById(target) : target;
    if (!node) return;
    node.innerHTML = kind === 'lines'
      ? skeletonLines(opts.lines || 4)
      : skeletonCards(opts.count || 3, opts.lines || 3);
  }

  /* =================================================================
     EMPTY / ERROR FALLBACK
     ================================================================= */
  function emptyState(target, { icon = '📭', title = 'Belum ada data', message = '', action } = {}) {
    const node = typeof target === 'string' ? document.getElementById(target) : target;
    if (!node) return;
    const btn = action ? `<button class="btn btn-primary" data-ui-empty-action>${escapeHtml(action.label)}</button>` : '';
    node.innerHTML = `<div class="ui-empty">
        <div class="ui-empty__icon">${icon}</div>
        <div class="ui-empty__title">${escapeHtml(title)}</div>
        <div>${escapeHtml(message)}</div>${btn}</div>`;
    if (action) { const b = node.querySelector('[data-ui-empty-action]'); if (b) b.addEventListener('click', action.onClick); }
  }
  function errorState(target, { message = 'Terjadi kesalahan memuat data.', onRetry } = {}) {
    emptyState(target, {
      icon: '⚠️', title: 'Gagal memuat', message,
      action: onRetry ? { label: '🔄 Coba lagi', onClick: onRetry } : null
    });
  }

  /* =================================================================
     HTML BUILDERS (markup konsisten, hindari duplikasi)
     ================================================================= */
  function button({ label = '', variant = 'primary', size = '', type = 'button', icon = '', attrs = '' } = {}) {
    const cls = ['btn', 'btn-' + variant, size ? 'btn-' + size : ''].filter(Boolean).join(' ');
    return `<button type="${type}" class="${cls}" ${attrs}>${icon}${escapeHtml(label)}</button>`;
  }
  function input({ name = '', label = '', type = 'text', value = '', placeholder = '', required = false, attrs = '' } = {}) {
    const id = 'f_' + name + '_' + Math.random().toString(36).slice(2, 7);
    return `<div class="form-group">
      ${label ? `<label for="${id}">${escapeHtml(label)}${required ? ' *' : ''}</label>` : ''}
      <input id="${id}" name="${name}" type="${type}" class="form-control" value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''} ${attrs}></div>`;
  }
  function select({ name = '', label = '', options = [], value = '', required = false, placeholder = '- Pilih -', attrs = '' } = {}) {
    const id = 'f_' + name + '_' + Math.random().toString(36).slice(2, 7);
    const opts = [placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : '']
      .concat(options.map(o => {
        const v = typeof o === 'object' ? o.value : o;
        const t = typeof o === 'object' ? o.label : o;
        return `<option value="${escapeHtml(v)}" ${String(v) === String(value) ? 'selected' : ''}>${escapeHtml(t)}</option>`;
      })).join('');
    return `<div class="form-group">
      ${label ? `<label for="${id}">${escapeHtml(label)}${required ? ' *' : ''}</label>` : ''}
      <select id="${id}" name="${name}" class="form-control" ${required ? 'required' : ''} ${attrs}>${opts}</select></div>`;
  }
  function spinner(size = '') { return `<span class="ui-spinner ${size}"></span>`; }

  /* =================================================================
     OFFLINE STATE — banner global + status helper
     ================================================================= */
  function mountOfflineBanner() {
    if (document.getElementById('ui-offline-banner')) return;
    const b = el('div', '', '📡 Anda sedang offline — perubahan akan disinkronkan saat koneksi kembali.');
    b.id = 'ui-offline-banner';
    document.body.appendChild(b);
    const update = () => b.classList.toggle('show', !navigator.onLine);
    window.addEventListener('online', () => { update(); toast('Koneksi kembali tersambung.', 'success'); });
    window.addEventListener('offline', () => { update(); });
    update();
  }

  const UI = {
    ICONS, toast, modal, confirm, passwordToggle, bindPasswordToggles,
    skeletonLines, skeletonCards, showSkeleton, emptyState, errorState,
    button, input, select, spinner, mountOfflineBanner, escapeHtml
  };
  global.UI = UI;

  /* =================================================================
     BACKWARD-COMPAT: upgrade Utils.notify & Utils.confirm bila ada,
     sehingga seluruh halaman lama otomatis memakai komponen baru tanpa
     perubahan call-site. (alert("Terjadi kesalahan") -> diganti toast).
     ================================================================= */
  if (global.Utils) {
    global.Utils.notify = function (msg, type = 'info', duration = 3600) {
      return toast(msg, type, { duration });
    };
    global.Utils.confirm = function (message) { return confirm(message); };
  }

  // Auto-bind password toggles & offline banner saat DOM siap.
  function onReady() { bindPasswordToggles(); mountOfflineBanner(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();

})(window);
