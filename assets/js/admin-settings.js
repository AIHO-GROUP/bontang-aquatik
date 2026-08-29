/**
 * ===================================================================
 * ADMIN SETTINGS  — menu Pengaturan untuk panel admin
 * ===================================================================
 * Mengatur:
 *   • Tema tampilan (terang / gelap)
 *   • Tampilan menu Jadwal   : list  / kalender
 *   • Tampilan menu Kehadiran: list  / tabel (mengikuti format export Excel)
 *   • Variabel Nomor Peserta : nomor urut terakhir Grup A/C & Grup B
 *
 * Preferensi tampilan disimpan per-perangkat (localStorage); variabel nomor
 * peserta disimpan di server (Script Properties) via getSettings/updateSettings.
 *
 * Bergantung pada: UI (components/ui.js), Theme, API, Utils.
 */
(function (global) {
  'use strict';

  const JADWAL_KEY = 'swim_admin_jadwal_view';      // 'list' | 'calendar'
  const KEHADIRAN_KEY = 'swim_admin_kehadiran_view'; // 'list' | 'table'

  function getJadwalView() {
    try { return localStorage.getItem(JADWAL_KEY) || 'list'; } catch (_) { return 'list'; }
  }
  function setJadwalView(mode) {
    try { localStorage.setItem(JADWAL_KEY, mode); } catch (_) {}
    document.dispatchEvent(new CustomEvent('admin:jadwalviewchange', { detail: { mode } }));
  }
  function getKehadiranView() {
    try { return localStorage.getItem(KEHADIRAN_KEY) || 'list'; } catch (_) { return 'list'; }
  }
  function setKehadiranView(mode) {
    try { localStorage.setItem(KEHADIRAN_KEY, mode); } catch (_) {}
    document.dispatchEvent(new CustomEvent('admin:kehadiranviewchange', { detail: { mode } }));
  }

  const seg = (group, value, options) => `
    <div class="ui-segment" data-seg="${group}">
      ${options.map(o => `<button type="button" data-val="${o.v}" class="${value === o.v ? 'active' : ''}">${o.t}</button>`).join('')}
    </div>`;

  /** Bangun panel pengaturan ke dalam sebuah container (untuk tab admin). */
  function renderInto(container) {
    const node = typeof container === 'string' ? document.getElementById(container) : container;
    if (!node) return;
    const currentTheme = (typeof Theme !== 'undefined') ? Theme.get() : 'light';

    node.innerHTML = `
      <div class="settings-panel">
        <div class="settings-card">
          <h3 class="settings-card__title">Tampilan</h3>
          <div class="settings-row">
            <div class="settings-row__label">Tema</div>
            ${seg('theme', currentTheme, [{ v: 'light', t: '☀️ Terang' }, { v: 'dark', t: '🌙 Gelap' }])}
          </div>
          <hr class="settings-divider">
          <div class="settings-row">
            <div class="settings-row__label">Jadwal</div>
            ${seg('jadwal', getJadwalView(), [{ v: 'list', t: '☰ List' }, { v: 'calendar', t: '📅 Kalender' }])}
          </div>
          <hr class="settings-divider">
          <div class="settings-row">
            <div class="settings-row__label">Kehadiran</div>
            ${seg('kehadiran', getKehadiranView(), [{ v: 'list', t: '☰ List' }, { v: 'table', t: '▦ Tabel' }])}
          </div>
        </div>

        <div class="settings-card">
          <h3 class="settings-card__title">Variabel Nomor Peserta</h3>
          <div id="settings-nomor-wrap">${UI.skeletonLines(2)}</div>
        </div>
      </div>`;

    // Segment: tema
    node.querySelector('[data-seg="theme"]').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-val]'); if (!btn) return;
      node.querySelectorAll('[data-seg="theme"] button').forEach(b => b.classList.toggle('active', b === btn));
      if (typeof Theme !== 'undefined') Theme.apply(btn.dataset.val);
    });
    // Segment: jadwal view
    node.querySelector('[data-seg="jadwal"]').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-val]'); if (!btn) return;
      node.querySelectorAll('[data-seg="jadwal"] button').forEach(b => b.classList.toggle('active', b === btn));
      setJadwalView(btn.dataset.val);
      UI.toast('Tampilan jadwal: ' + (btn.dataset.val === 'calendar' ? 'Kalender' : 'List'), 'success', { duration: 1800 });
    });
    // Segment: kehadiran view
    node.querySelector('[data-seg="kehadiran"]').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-val]'); if (!btn) return;
      node.querySelectorAll('[data-seg="kehadiran"] button').forEach(b => b.classList.toggle('active', b === btn));
      setKehadiranView(btn.dataset.val);
      UI.toast('Tampilan kehadiran: ' + (btn.dataset.val === 'table' ? 'Tabel' : 'List'), 'success', { duration: 1800 });
    });

    loadNomorSettings(node);
  }

  async function loadNomorSettings(node) {
    const wrap = node.querySelector('#settings-nomor-wrap');
    if (!wrap) return;
    const res = BizLogic.getSettings();
    if (!res || !res.success) {
      UI.errorState(wrap, { message: 'Gagal memuat variabel nomor peserta.', onRetry: () => loadNomorSettings(node) });
      return;
    }
    const d = res.data || { seq_ac: 0, seq_b: 0 };
    wrap.innerHTML = `
      <div class="form-grid-2">
        <div class="form-group">
          <label>Nomor Urut Terakhir — Grup A &amp; C</label>
          <input id="set-seq-ac" class="form-control" type="number" min="0" inputmode="numeric" value="${Number(d.seq_ac) || 0}">
        </div>
        <div class="form-group">
          <label>Nomor Urut Terakhir — Grup B</label>
          <input id="set-seq-b" class="form-control" type="number" min="0" inputmode="numeric" value="${Number(d.seq_b) || 0}">
        </div>
      </div>
      <div class="settings-nomor-actions">
        <button type="button" class="btn btn-primary" id="set-seq-save">Simpan Variabel</button>
      </div>`;

    wrap.querySelector('#set-seq-save').addEventListener('click', async () => {
      const acEl = wrap.querySelector('#set-seq-ac');
      const bEl = wrap.querySelector('#set-seq-b');
      const seq_ac = parseInt(acEl.value, 10);
      const seq_b = parseInt(bEl.value, 10);
      if (isNaN(seq_ac) || seq_ac < 0 || isNaN(seq_b) || seq_b < 0) {
        UI.toast('Nomor urut harus berupa angka ≥ 0.', 'warning');
        return;
      }
      const btn = wrap.querySelector('#set-seq-save');
      btn.classList.add('is-loading'); btn.disabled = true;
      const r = await BizLogic.updateSettings({ seq_ac, seq_b });
      btn.classList.remove('is-loading'); btn.disabled = false;
      if (r && r.success) UI.toast(r.message || 'Pengaturan disimpan', 'success');
      else UI.toast((r && r.message) || 'Gagal menyimpan pengaturan', 'error');
    });
  }

  global.AdminSettings = {
    renderInto,
    getJadwalView, setJadwalView,
    getKehadiranView, setKehadiranView
  };
})(window);
