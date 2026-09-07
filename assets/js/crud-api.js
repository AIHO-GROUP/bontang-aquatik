/**
 * ===================================================================
 * crud-api.js — Klien REST generik ke Supabase (transport murni)
 * ===================================================================
 * Tidak ada business logic di sini. Tanggung jawabnya hanya:
 *   • memetakan nama resource ke tabel + kolom id,
 *   • menjalankan read/create/update/delete,
 *   • mengunggah/menghapus berkas lampiran,
 *   • membedakan kegagalan JARINGAN (offline: true, boleh diantre) dari
 *     penolakan bisnis dari server (tidak boleh diantre) — klasifikasinya
 *     dipusatkan di lib/net.js agar penolakan server TIDAK PERNAH lagi
 *     dilaporkan kepada pengguna sebagai "perangkat offline".
 *
 * Bentuk response konsisten: { success, data?, message?, count?, offline? }
 */
const RESOURCE_MAP = {
  peserta:    { table: 'Peserta',    idCol: 'Id_Peserta' },
  jadwal:     { table: 'Jadwal',     idCol: 'Id_Jadwal' },
  kehadiran:  { table: 'Kehadiran',  idCol: 'Id_Kehadiran' },
  rapor:      { table: 'Rapor',      idCol: 'Id_Rapor' },
  berita:     { table: 'Berita',     idCol: 'Id_Berita' },
  pelatih:    { table: 'Pelatih',    idCol: 'Id_Pelatih' },
  enrollment: { table: 'Enrollment', idCol: 'Id_Enrollment' }
};

const CrudApi = {
  /**
   * Dispatcher inti. Dipanggil langsung oleh sync.js saat flushOutbox()
   * mengirim ulang antrean offline — signature WAJIB tetap
   * (resource, op, payload, opts).
   */
  async _request(resource, op, payload, opts = {}) {
    const silent = !!opts.silent;
    if (!silent) Utils.showLoader(true);
    try {
      const out = await this._dispatch(resource, op, payload, opts);
      // Server MENJAWAB (walau jawabannya menolak) => koneksi terbukti sehat.
      // Inilah pemulihan status tercepat: tidak menunggu peristiwa 'online'
      // peramban yang sering tidak pernah datang.
      this._net('reportSuccess');
      return out;
    } catch (err) {
      return this._toFailure(resource, op, err);
    } finally {
      if (!silent) Utils.showLoader(false);
    }
  },

  /** Perutean murni; seluruh penanganan galat ada di _request. */
  async _dispatch(resource, op, payload, opts = {}) {
    if (resource === 'settings') return await this._settingsDispatch(op, payload);

    const map = RESOURCE_MAP[resource];
    if (!map) return { success: false, message: 'Resource tidak dikenal: ' + resource };

    if (op === 'read')   return await this._crudRead(map.table, opts);
    if (op === 'create') return await this._crudCreate(map.table, payload);
    if (op === 'update') return await this._crudUpdate(map.table, map.idCol, payload);
    if (op === 'delete') return await this._crudDelete(map.table, map.idCol, payload);
    return { success: false, message: 'Operasi tidak dikenal: ' + op };
  },

  /** Pemanggilan aman ke lib/net.js (aplikasi tetap jalan bila belum dimuat). */
  _net(method, arg) {
    try {
      if (typeof Net !== 'undefined' && typeof Net[method] === 'function') return Net[method](arg);
    } catch (e) { /* abaikan */ }
    return null;
  },

  /** Lampirkan kode status HTTP ke objek error Supabase agar bisa diklasifikasi. */
  _withStatus(error, status) {
    try { if (error && status && !error.status) error.status = status; } catch (e) { /* abaikan */ }
    return error;
  },

  /**
   * Terjemahkan galat menjadi response standar.
   *
   * offline:true HANYA untuk kegagalan yang MASIH BISA DICOBA ULANG:
   *   • transport   — server tidak pernah terjangkau (jaringan putus);
   *   • server-busy — server menjawab 5xx/429/timeout.
   * Penolakan sadar dari server (RLS, validasi, 4xx) dikembalikan sebagai
   * kegagalan asli beserta pesannya, sehingga TIDAK lagi diantre diam-diam
   * ke Outbox dan tidak lagi memunculkan label "offline" yang keliru.
   */
  _toFailure(resource, op, err) {
    const kind = this._net('classify', err) || 'transport';
    console.error('CrudApi error [' + kind + ']:', resource, op, err);

    if (kind === 'transport') this._net('reportFailure', err);
    else this._net('reportSuccess');   // server menjawab => koneksi sehat

    const raw = (err && err.message) ? String(err.message) : String(err || '');
    let message;
    if (kind === 'transport') {
      message = 'Tidak dapat menghubungi server. Periksa koneksi internet Anda.';
    } else if (kind === 'server-busy') {
      message = 'Server sedang tidak merespons. Perubahan akan dicoba lagi secara otomatis.';
    } else {
      message = raw || 'Permintaan ditolak server.';
    }

    return {
      success: false,
      offline: kind !== 'rejected',   // boleh diantre & dikirim ulang
      kind: kind,
      status: (err && err.status) || 0,
      message: message,
      detail: raw
    };
  },

  read(resource, opts)            { return this._request(resource, 'read', null, opts); },
  create(resource, payload, opts) { return this._request(resource, 'create', payload, opts); },
  update(resource, payload, opts) { return this._request(resource, 'update', payload, opts); },
  delete(resource, payload, opts) { return this._request(resource, 'delete', payload, opts); },

  /* ====================== CRUD GENERIK ====================== */

  /**
   * READ — seluruh baris tabel. Supabase membatasi 1000 baris per request,
   * jadi hasil diambil bertahap sampai habis agar data tidak pernah terpotong
   * diam-diam saat jumlah jadwal/kehadiran tumbuh.
   */
  async _crudRead(table, opts = {}) {
    const PAGE = 1000;
    let from = 0;
    const all = [];
    for (let guard = 0; guard < 100; guard++) {
      const { data, error, status } = await SupabaseClient.from(table).select('*').range(from, from + PAGE - 1);
      if (error) throw this._withStatus(error, status);
      const rows = data || [];
      all.push.apply(all, rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return { success: true, data: all };
  },

  /**
   * CREATE — payload berisi seluruh field memakai NAMA KOLOM persis.
   * Mendukung batch lewat payload.items = [ {...}, {...} ].
   */
  async _crudCreate(table, payload) {
    const items = Array.isArray(payload && payload.items) ? payload.items : [payload];
    if (!items.length) return { success: true, message: 'Tidak ada data untuk dibuat', count: 0 };
    // Insert dipecah agar payload tidak terlalu besar untuk satu request.
    const CHUNK = 500;
    for (let i = 0; i < items.length; i += CHUNK) {
      const { error, status } = await SupabaseClient.from(table).insert(items.slice(i, i + CHUNK));
      if (error) throw this._withStatus(error, status);
    }
    return { success: true, message: 'Data dibuat', count: items.length, data: payload };
  },

  /**
   * UPDATE — payload.id dicocokkan ke kolom Id_... tabel tujuan; field lain
   * menimpa nilai lama. Mendukung batch lewat payload.items (masing-masing
   * membawa id sendiri).
   */
  async _crudUpdate(table, idCol, payload) {
    const p = payload || {};
    if (Array.isArray(p.items)) {
      for (const item of p.items) {
        const res = await this._crudUpdate(table, idCol, item);
        if (!res.success) return res;
      }
      return { success: true, message: 'Data diperbarui', count: p.items.length };
    }
    const patch = Object.assign({}, p);
    delete patch.id; delete patch.resource; delete patch.op;
    const { data, error, status } = await SupabaseClient.from(table).update(patch).eq(idCol, p.id).select();
    if (error) throw this._withStatus(error, status);
    if (!data || data.length === 0) return { success: false, message: 'Data tidak ditemukan' };
    return { success: true, message: 'Data diperbarui', data: data[0] };
  },

  /** DELETE — baris dengan Id_... yang cocok dihapus. */
  async _crudDelete(table, idCol, payload) {
    const p = payload || {};
    const { data, error, status } = await SupabaseClient.from(table).delete().eq(idCol, p.id).select();
    if (error) throw this._withStatus(error, status);
    if (!data || data.length === 0) return { success: false, message: 'Data tidak ditemukan' };
    return { success: true, message: 'Data dihapus' };
  },

  /* ====================== SETTINGS (key-value) ====================== */
  async _settingsDispatch(op, payload) {
    if (op === 'read')   return await this._settingsRead();
    if (op === 'update') return await this._settingsUpdate(payload);
    return { success: false, message: 'Operasi settings tidak dikenal: ' + op };
  },

  async _settingsRead() {
    const { data, error, status } = await SupabaseClient.from('Settings').select('*');
    if (error) throw this._withStatus(error, status);
    const obj = {};
    (data || []).forEach((row) => { obj[row.key] = row.value; });
    return { success: true, data: obj };
  },

  async _settingsUpdate(payload) {
    const patch = Object.assign({}, payload);
    delete patch.resource; delete patch.op; delete patch.action;
    const keys = Object.keys(patch);
    if (keys.length) {
      const rows = keys.map((k) => ({ key: k, value: String(patch[k]) }));
      const { error, status } = await SupabaseClient.from('Settings').upsert(rows, { onConflict: 'key' });
      if (error) throw this._withStatus(error, status);
    }
    return await this._settingsRead();
  },

  /* ====================== PENYIMPANAN BERKAS ======================
     Lampiran berita (gambar/PDF/PPTX). Bucket "berita" bersifat publik
     untuk dibaca, dengan batas ukuran & tipe yang juga ditegakkan di sisi
     server (lihat migrasi v2_08_storage_berita).
     ================================================================ */

  async uploadFile(bucket, file, opts = {}) {
    try {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
      const safe = (opts.prefix || 'file') + '-' + Date.now().toString(36) + '-' +
                   Math.random().toString(36).slice(2, 8) + '.' + ext;
      const { error } = await SupabaseClient.storage.from(bucket).upload(safe, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined
      });
      if (error) throw error;
      const { data } = SupabaseClient.storage.from(bucket).getPublicUrl(safe);
      return {
        success: true,
        path: safe,
        url: (data && data.publicUrl) || '',
        name: file.name,
        type: file.type || '',
        size: file.size
      };
    } catch (err) {
      const kind = this._net('classify', err) || 'transport';
      if (kind === 'transport') this._net('reportFailure', err); else this._net('reportSuccess');
      console.error('uploadFile error [' + kind + ']:', err);
      return {
        success: false,
        offline: kind !== 'rejected',
        kind: kind,
        message: kind === 'transport'
          ? 'Berkas gagal diunggah karena server tidak dapat dihubungi. Periksa koneksi internet Anda.'
          : 'Gagal mengunggah berkas: ' + (err && err.message ? err.message : err)
      };
    }
  },

  async removeFile(bucket, path) {
    if (!path) return { success: true };
    try {
      const { error } = await SupabaseClient.storage.from(bucket).remove([path]);
      if (error) throw error;
      return { success: true };
    } catch (err) {
      const kind = this._net('classify', err) || 'transport';
      if (kind === 'transport') this._net('reportFailure', err); else this._net('reportSuccess');
      console.warn('removeFile error [' + kind + ']:', err);
      return { success: false, offline: kind !== 'rejected', kind: kind, message: err && err.message };
    }
  },

  /** Ekstrak object path dari URL publik Supabase Storage. */
  pathFromPublicUrl(url, bucket) {
    if (!url) return '';
    const marker = '/object/public/' + bucket + '/';
    const i = String(url).indexOf(marker);
    return i === -1 ? '' : decodeURIComponent(String(url).slice(i + marker.length));
  }
};
