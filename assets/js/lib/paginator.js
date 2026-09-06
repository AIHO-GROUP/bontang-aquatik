/**
 * ===================================================================
 * paginator.js — Pagination sisi frontend (tanpa request database)
 * ===================================================================
 * SELURUH data sudah tersedia di cache lokal (IndexedDB -> Store), jadi
 * pagination dilakukan murni dengan memotong array di memori. Tidak ada
 * satu pun request tambahan ke Supabase saat pengguna berpindah halaman
 * atau mengganti jumlah baris per halaman — penting agar performa tetap
 * stabil ketika ratusan pengguna membuka aplikasi bersamaan.
 *
 * Pemakaian:
 *   const pager = new Paginator({
 *     mountId: 'pager-peserta',
 *     storageKey: 'pgsize_peserta',        // ingat pilihan per perangkat
 *     onRender: (rows) => renderTable(rows)
 *   });
 *   pager.setData(filteredRows);           // panggil tiap kali filter berubah
 */
class Paginator {
  /**
   * @param {object} opts
   *   mountId    : id elemen tempat kontrol pagination dirender (wajib)
   *   onRender   : callback(pageRows, info) yang menggambar baris (wajib)
   *   pageSize   : ukuran awal (default CONFIG.PAGE_SIZE_DEFAULT)
   *   storageKey : kunci localStorage untuk mengingat pilihan pengguna
   *   label      : kata benda untuk teks ringkasan ("peserta", "jadwal")
   */
  constructor(opts) {
    this.mountId    = opts.mountId;
    this.onRender   = opts.onRender;
    this.storageKey = opts.storageKey || null;
    this.label      = opts.label || 'data';
    this.data       = [];
    this.page       = 1;
    this.pageSize   = this._loadPageSize(opts.pageSize);
    this._boundMount = null;
  }

  _loadPageSize(fallback) {
    const def = fallback || CONFIG.PAGE_SIZE_DEFAULT || 10;
    if (!this.storageKey) return def;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw === 'all') return 'all';
      const n = parseInt(raw, 10);
      return CONFIG.PAGE_SIZE_OPTIONS.includes(n) ? n : def;
    } catch (_) { return def; }
  }

  _savePageSize() {
    if (!this.storageKey) return;
    try { localStorage.setItem(this.storageKey, String(this.pageSize)); } catch (_) { /* mode privat */ }
  }

  get totalItems() { return this.data.length; }

  get perPage() {
    return this.pageSize === 'all' ? Math.max(this.totalItems, 1) : this.pageSize;
  }

  get totalPages() {
    if (this.pageSize === 'all') return 1;
    return Math.max(1, Math.ceil(this.totalItems / this.perPage));
  }

  /** Ganti dataset (mis. setelah filter/pencarian) dan gambar ulang. */
  setData(rows, opts) {
    this.data = Array.isArray(rows) ? rows : [];
    if (!opts || opts.keepPage !== true) this.page = 1;
    if (this.page > this.totalPages) this.page = this.totalPages;
    this.render();
  }

  goTo(page) {
    const target = Math.min(Math.max(1, page), this.totalPages);
    if (target === this.page) return;
    this.page = target;
    this.render();
    this._scrollIntoView();
  }

  setPageSize(size) {
    this.pageSize = (size === 'all') ? 'all' : parseInt(size, 10);
    this._savePageSize();
    this.page = 1;
    this.render();
  }

  _scrollIntoView() {
    const mount = document.getElementById(this.mountId);
    if (!mount) return;
    const section = mount.closest('.tab-content, .dashboard-section, section') || mount;
    const top = section.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  /** Baris untuk halaman aktif. */
  currentRows() {
    if (this.pageSize === 'all') return this.data;
    const start = (this.page - 1) * this.perPage;
    return this.data.slice(start, start + this.perPage);
  }

  render() {
    const rows = this.currentRows();
    const start = this.totalItems === 0 ? 0 : (this.pageSize === 'all' ? 1 : (this.page - 1) * this.perPage + 1);
    const end   = this.pageSize === 'all' ? this.totalItems : Math.min(this.page * this.perPage, this.totalItems);

    if (typeof this.onRender === 'function') {
      this.onRender(rows, { page: this.page, totalPages: this.totalPages, totalItems: this.totalItems, start, end });
    }
    this._renderControls(start, end);
  }

  /** Nomor halaman ringkas: 1 … 4 [5] 6 … 12 */
  _pageNumbers() {
    const total = this.totalPages, cur = this.page;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const out = [1];
    const from = Math.max(2, cur - 1), to = Math.min(total - 1, cur + 1);
    if (from > 2) out.push('...');
    for (let i = from; i <= to; i++) out.push(i);
    if (to < total - 1) out.push('...');
    out.push(total);
    return out;
  }

  _renderControls(start, end) {
    const mount = document.getElementById(this.mountId);
    if (!mount) return;

    if (this.totalItems === 0) { mount.innerHTML = ''; return; }

    const sizeOpts = CONFIG.PAGE_SIZE_OPTIONS.map((o) => {
      const val = String(o);
      const text = o === 'all' ? 'Semua' : o;
      return '<option value="' + val + '"' + (String(this.pageSize) === val ? ' selected' : '') + '>' + text + '</option>';
    }).join('');

    const numbers = this._pageNumbers().map((n) => {
      if (n === '...') return '<span class="pager__gap">…</span>';
      return '<button type="button" class="pager__num' + (n === this.page ? ' is-active' : '') +
             '" data-page="' + n + '" aria-current="' + (n === this.page ? 'page' : 'false') + '">' + n + '</button>';
    }).join('');

    const single = this.totalPages <= 1;

    mount.innerHTML =
      '<div class="pager">' +
        '<div class="pager__size">' +
          '<label for="' + this.mountId + '-size">Tampilkan</label>' +
          '<select id="' + this.mountId + '-size" class="pager__select">' + sizeOpts + '</select>' +
          '<span class="pager__info">' + start + '–' + end + ' dari ' + this.totalItems + ' ' + this.label + '</span>' +
        '</div>' +
        (single ? '' :
        '<nav class="pager__nav" aria-label="Navigasi halaman">' +
          '<button type="button" class="pager__btn" data-nav="prev"' + (this.page === 1 ? ' disabled' : '') + '>' +
            '<span aria-hidden="true">‹</span> Sebelumnya</button>' +
          '<div class="pager__numbers">' + numbers + '</div>' +
          '<button type="button" class="pager__btn" data-nav="next"' + (this.page === this.totalPages ? ' disabled' : '') + '>' +
            'Berikutnya <span aria-hidden="true">›</span></button>' +
        '</nav>') +
      '</div>';

    // Delegasi event dipasang sekali per mount point.
    if (this._boundMount !== mount) {
      mount.addEventListener('click', (e) => {
        const num = e.target.closest('[data-page]');
        if (num) { this.goTo(Number(num.dataset.page)); return; }
        const nav = e.target.closest('[data-nav]');
        if (nav && !nav.disabled) this.goTo(this.page + (nav.dataset.nav === 'next' ? 1 : -1));
      });
      mount.addEventListener('change', (e) => {
        if (e.target.classList.contains('pager__select')) this.setPageSize(e.target.value);
      });
      this._boundMount = mount;
    }
  }
}
