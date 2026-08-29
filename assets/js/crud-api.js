/**
 * ===================================================================
 * crud-api.js — Klien REST generik ke backend SUPABASE (CRUD murni)
 * ===================================================================
 * MIGRASI: file ini menggantikan versi lama yang memanggil Google Apps
 * Script (/exec?resource=..&op=..). Interface publik (CrudApi.read /
 * .create / .update / .delete / ._request) SENGAJA dibuat 100% IDENTIK
 * dengan versi lama — signature, urutan argumen, dan BENTUK RESPONSE
 * ({ success, data, message, count, offline }) — agar sync.js,
 * business-logic.js, dan seluruh file lain TIDAK PERLU diubah SAMA
 * SEKALI. Tidak ada logika bisnis di file ini — murni transport data,
 * persis seperti tanggung jawab file ini sebelum migrasi.
 *
 * Pemetaan resource -> tabel Supabase & kolom Id (dipakai untuk
 * mencocokkan operasi update/delete, menggantikan peran findRowIndex()
 * di Code.gs lama yang mencocokkan kolom PERTAMA sheet).
 */
const RESOURCE_MAP = {
  peserta:   { table: 'Peserta',   idCol: 'Id_Peserta' },
  jadwal:    { table: 'Jadwal',    idCol: 'Id_Jadwal' },
  kehadiran: { table: 'Kehadiran', idCol: 'Id_Kehadiran' },
  rapor:     { table: 'Rapor',     idCol: 'Id_Rapor' },
  berita:    { table: 'Berita',    idCol: 'Id_Berita' },
  pelatih:   { table: 'Pelatih',   idCol: 'Id_Pelatih' }
};

/** Resource yang HANYA boleh diakses via operasi read (setara READ_ONLY_RESOURCES di Code.gs lama). */
const READ_ONLY_RESOURCES = ['pelatih'];

const CrudApi = {
  /**
   * Dispatcher inti. Dipanggil langsung oleh sync.js saat flushOutbox()
   * mengirim ulang antrean offline — signature-nya WAJIB tetap
   * (resource, op, payload, opts).
   */
  async _request(resource, op, payload, opts = {}) {
    const silent = !!opts.silent;
    if (!silent) Utils.showLoader(true);
    try {
      if (resource === 'settings') return await this._settingsDispatch(op, payload);

      const map = RESOURCE_MAP[resource];
      if (!map) return { success: false, message: 'Resource tidak dikenal: ' + resource };

      if (op === 'read') return await this._crudRead(map.table);

      if (READ_ONLY_RESOURCES.indexOf(resource) !== -1) {
        return { success: false, message: 'Resource "' + resource + '" hanya mendukung operasi read dari Web App.' };
      }

      if (op === 'create') return await this._crudCreate(map.table, payload);
      if (op === 'update') return await this._crudUpdate(map.table, map.idCol, payload);
      if (op === 'delete') return await this._crudDelete(map.table, map.idCol, payload);
      return { success: false, message: 'Operasi tidak dikenal: ' + op };
    } catch (err) {
      // "offline: true" menandai kegagalan JARINGAN/TRANSPORT (tidak bisa
      // terhubung ke Supabase — device offline, Supabase down, dsb), BUKAN
      // penolakan bisnis dari server (mis. "Data tidak ditemukan" yang
      // dikembalikan sebagai objek biasa, bukan exception, lihat
      // _crudUpdate/_crudDelete di bawah). Dipakai business-logic.js untuk
      // memutuskan apakah operasi boleh diantre ke Outbox.
      console.error('CrudApi error:', resource, op, err);
      return { success: false, offline: true, message: 'Gagal terhubung ke server: ' + (err && err.message ? err.message : err) };
    } finally {
      if (!silent) Utils.showLoader(false);
    }
  },

  read(resource, opts)            { return this._request(resource, 'read', null, opts); },
  create(resource, payload, opts) { return this._request(resource, 'create', payload, opts); },
  update(resource, payload, opts) { return this._request(resource, 'update', payload, opts); },
  delete(resource, payload, opts) { return this._request(resource, 'delete', payload, opts); },

  // ====================== CRUD GENERIK (tanpa validasi/format/kalkulasi apa pun) ======================

  /** READ — kembalikan SELURUH baris tabel apa adanya, tanpa filter/format/urutan (setara crudRead Code.gs). */
  async _crudRead(table) {
    const { data, error } = await SupabaseClient.from(table).select('*');
    if (error) throw error;
    return { success: true, data: data || [] };
  },

  /**
   * CREATE — tambah baris baru. Payload WAJIB berisi seluruh field
   * (termasuk Id_... yang sudah dibuat di sisi klien) memakai NAMA KOLOM
   * PERSIS seperti nama kolom tabel. Mendukung batch: payload.items =
   * [ {...}, {...} ] untuk menulis banyak baris sekaligus dalam 1 kali
   * panggilan (setara crudCreate Code.gs).
   */
  async _crudCreate(table, payload) {
    const items = Array.isArray(payload && payload.items) ? payload.items : [payload];
    const { error } = await SupabaseClient.from(table).insert(items);
    if (error) throw error;
    return { success: true, message: 'Data dibuat', count: items.length, data: payload };
  },

  /**
   * UPDATE — payload.id dicocokkan terhadap kolom Id_... tabel tujuan.
   * Field lain pada payload (memakai nama kolom persis) akan menimpa
   * nilai lama bila ada; field yang tidak dikirim tidak disentuh
   * (setara crudUpdate Code.gs).
   */
  async _crudUpdate(table, idCol, payload) {
    const p = payload || {};
    const patch = Object.assign({}, p);
    delete patch.id; delete patch.resource; delete patch.op;
    const { data, error } = await SupabaseClient.from(table).update(patch).eq(idCol, p.id).select();
    if (error) throw error;
    if (!data || data.length === 0) return { success: false, message: 'Data tidak ditemukan' };
    return { success: true, message: 'Data diperbarui' };
  },

  /** DELETE — payload.id dicocokkan terhadap kolom Id_... tabel tujuan, baris dihapus (setara crudDelete Code.gs). */
  async _crudDelete(table, idCol, payload) {
    const p = payload || {};
    const { data, error } = await SupabaseClient.from(table).delete().eq(idCol, p.id).select();
    if (error) throw error;
    if (!data || data.length === 0) return { success: false, message: 'Data tidak ditemukan' };
    return { success: true, message: 'Data dihapus' };
  },

  // ====================== SETTINGS (tabel "Settings" key-value — pengganti PropertiesService) ======================
  async _settingsDispatch(op, payload) {
    if (op === 'read') return await this._settingsRead();
    if (op === 'update') return await this._settingsUpdate(payload);
    return { success: false, message: 'Operasi settings tidak dikenal: ' + op };
  },

  async _settingsRead() {
    const { data, error } = await SupabaseClient.from('Settings').select('*');
    if (error) throw error;
    const obj = {};
    (data || []).forEach(row => { obj[row.key] = row.value; });
    return { success: true, data: obj };
  },

  async _settingsUpdate(payload) {
    const patch = Object.assign({}, payload);
    delete patch.resource; delete patch.op; delete patch.action;
    const keys = Object.keys(patch);
    if (keys.length) {
      const rows = keys.map(k => ({ key: k, value: String(patch[k]) }));
      const { error } = await SupabaseClient.from('Settings').upsert(rows, { onConflict: 'key' });
      if (error) throw error;
    }
    return await this._settingsRead();
  }
};
