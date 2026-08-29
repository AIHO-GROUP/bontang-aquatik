/**
 * ===================================================================
 * BACKEND — Bontang Akuatik Swimming Club  (ARSITEKTUR OFFLINE-FIRST)
 * ===================================================================
 * Sengaja dibuat SESEDERHANA MUNGKIN: Google Apps Script di sini HANYA
 * berfungsi sebagai REST API CRUD (Create, Read, Update, Delete) polos
 * terhadap Google Spreadsheet. TIDAK ADA business logic, validasi,
 * filtering, searching, sorting, grouping, formatting, penggabungan
 * data, ataupun perhitungan apa pun di file ini.
 *
 * Seluruh business logic (login, registrasi, validasi, jadwal, rapor,
 * berita, statistik kehadiran, nomor peserta, dsb.) telah dipindahkan
 * ke JavaScript Web App (lihat assets/js/business-logic.js & schedule.js).
 * Apps Script hanya menerima request, membaca/menulis Spreadsheet, dan
 * mengembalikan JSON mentah.
 *
 * ------------------------------------------------------------------
 * RUTE: dikirim sebagai QUERY STRING pada URL /exec, mis.
 *   …/exec?resource=peserta&op=create   (payload data ada di body POST)
 *   …/exec?resource=peserta&op=read     (GET)
 *
 * (TIDAK memakai path style …/exec/peserta/create — e.pathInfo pada Apps
 * Script Web App tidak bisa diandalkan karena URL /exec melalui redirect
 * internal Google yang sering menghilangkan segmen path tambahan.)
 *
 *   resource=peserta    op=read|create|update|delete
 *   resource=jadwal     op=read|create|update|delete
 *   resource=kehadiran  op=read|create|update|delete
 *   resource=rapor      op=read|create|update|delete
 *   resource=berita     op=read|create|update|delete
 *   resource=pelatih    op=read                        (read-only)
 *   resource=settings   op=read|update                 (ScriptProperties, bukan sheet)
 *
 * Catatan: sheet "Kehadiran" & "Pelatih" tidak disebutkan eksplisit pada
 * daftar endpoint permintaan awal, tetapi tetap diperlukan agar fitur
 * absen/izin (create Kehadiran) & login admin (read Pelatih) tetap
 * berfungsi — ditambahkan mengikuti pola CRUD generik yang sama.
 * ===================================================================
 */

const SPREADSHEET_ID = '1Jvndc1jgdlx4iSw2nNp9ezAM-MbU12Y8o1R_nrmLmQw';

/** Peta nama resource (URL) -> nama Sheet Google Spreadsheet. */
const ENTITY_SHEETS = {
  peserta: 'Peserta',
  jadwal: 'Jadwal',
  kehadiran: 'Kehadiran',
  rapor: 'Rapor',
  berita: 'Berita',
  pelatih: 'Pelatih' // read-only dari Web App (dipakai untuk login admin & daftar pelatih)
};

/** Resource yang HANYA boleh diakses via operasi read (tidak ada create/update/delete dari Web App). */
const READ_ONLY_RESOURCES = ['pelatih'];

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    var body = {};
    if (e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (parseErr) { body = {}; }
    }
    var params = e.parameter || {};
    var payload = Object.assign({}, params, body);

    var route = resolveRoute(e, payload);
    var result = dispatch(route.resource, route.op, payload);
    return jsonOutput(result);
  } catch (err) {
    return jsonOutput({ success: false, message: 'Server error: ' + err.message });
  }
}

/**
 * Tentukan resource & operasi murni dari request — TIDAK ADA logika bisnis,
 * hanya parsing rute. Diutamakan dari QUERY STRING / body ("resource" & "op"),
 * karena e.pathInfo pada Apps Script Web App TIDAK bisa diandalkan (URL
 * /exec melalui redirect internal Google yang sering menghilangkan segmen
 * path tambahan seperti …/exec/peserta/create). pathInfo hanya dipakai
 * sebagai fallback tambahan bila query string/body tidak mengirimkannya.
 */
function resolveRoute(e, payload) {
  var resource = (payload.resource || '').toString().toLowerCase();
  var op = (payload.op || '').toString().toLowerCase();

  if (!resource || !op) {
    var parts = String(e.pathInfo || '').split('/').filter(function (s) { return s; });
    if (!resource) resource = (parts[0] || '').toLowerCase();
    if (!op) op = (parts[1] || '').toLowerCase();
  }
  if (!op) op = (e.postData && e.postData.contents) ? 'create' : 'read';
  return { resource: resource, op: op };
}

function dispatch(resource, op, payload) {
  if (resource === 'settings') {
    if (op === 'read') return settingsRead();
    if (op === 'update') return settingsUpdate(payload);
    return { success: false, message: 'Operasi settings tidak dikenal: ' + op };
  }

  var sheetName = ENTITY_SHEETS[resource];
  if (!sheetName) return { success: false, message: 'Resource tidak dikenal: ' + resource };

  if (op === 'read') return crudRead(sheetName);

  if (READ_ONLY_RESOURCES.indexOf(resource) !== -1) {
    return { success: false, message: 'Resource "' + resource + '" hanya mendukung operasi read dari Web App.' };
  }

  if (op === 'create') return crudCreate(sheetName, payload);
  if (op === 'update') return crudUpdate(sheetName, payload);
  if (op === 'delete') return crudDelete(sheetName, payload);
  return { success: false, message: 'Operasi tidak dikenal: ' + op };
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ====================== HELPERS (murni akses Spreadsheet, tanpa logika bisnis) ======================
function getSheet(name) { return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name); }

function getHeaders(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

function sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

/** Baris dicocokkan berdasarkan KOLOM PERTAMA sheet (Id_...), dikirim Web App sebagai payload.id. */
function findRowIndex(sheet, idValue) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(idValue)) return i + 1;
  }
  return -1;
}

// ====================== CRUD GENERIK (tanpa validasi/format/kalkulasi apa pun) ======================

/** READ — kembalikan SELURUH baris sheet apa adanya, tanpa filter/format/urutan. */
function crudRead(sheetName) {
  var sheet = getSheet(sheetName);
  if (!sheet) return { success: false, message: 'Sheet "' + sheetName + '" tidak ditemukan' };
  return { success: true, data: sheetToObjects(sheet) };
}

/**
 * CREATE — tambah baris baru. Web App WAJIB mengirim seluruh field (termasuk
 * Id_... yang sudah dibuat di sisi klien) memakai NAMA KOLOM PERSIS seperti
 * header sheet. Mendukung batch: payload.items = [ {...}, {...} ] untuk
 * menulis banyak baris sekaligus dalam 1 kali panggilan (mis. generate
 * jadwal kelas otomatis), agar jumlah request ke Apps Script tetap minimal.
 */
function crudCreate(sheetName, payload) {
  var sheet = getSheet(sheetName);
  if (!sheet) return { success: false, message: 'Sheet "' + sheetName + '" tidak ditemukan' };
  var headers = getHeaders(sheet);
  var items = Array.isArray(payload.items) ? payload.items : [payload];
  var rows = items.map(function (item) {
    return headers.map(function (h) { return item[h] !== undefined ? item[h] : ''; });
  });
  if (rows.length === 1) {
    sheet.appendRow(rows[0]);
  } else if (rows.length > 1) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }
  return { success: true, message: 'Data dibuat', count: rows.length, data: payload };
}

/**
 * UPDATE — payload.id dicocokkan terhadap kolom pertama sheet. Field lain
 * pada payload (memakai nama kolom persis) akan menimpa nilai lama bila ada;
 * field yang tidak dikirim tidak disentuh.
 */
function crudUpdate(sheetName, payload) {
  var sheet = getSheet(sheetName);
  if (!sheet) return { success: false, message: 'Sheet "' + sheetName + '" tidak ditemukan' };
  var row = findRowIndex(sheet, payload.id);
  if (row === -1) return { success: false, message: 'Data tidak ditemukan' };
  var headers = getHeaders(sheet);
  headers.forEach(function (h, i) {
    if (payload[h] !== undefined) sheet.getRange(row, i + 1).setValue(payload[h]);
  });
  return { success: true, message: 'Data diperbarui' };
}

/** DELETE — payload.id dicocokkan terhadap kolom pertama sheet, baris dihapus. */
function crudDelete(sheetName, payload) {
  var sheet = getSheet(sheetName);
  if (!sheet) return { success: false, message: 'Sheet "' + sheetName + '" tidak ditemukan' };
  var row = findRowIndex(sheet, payload.id);
  if (row === -1) return { success: false, message: 'Data tidak ditemukan' };
  sheet.deleteRow(row);
  return { success: true, message: 'Data dihapus' };
}

// ====================== SETTINGS (ScriptProperties — bukan baris sheet, tapi tetap CRUD polos) ======================
/** Menyimpan variabel nomor urut peserta (NOMOR_SEQ_AC / NOMOR_SEQ_B). Web App yang memvalidasi nilainya. */
function settingsRead() {
  var props = PropertiesService.getScriptProperties().getProperties();
  return { success: true, data: props };
}
function settingsUpdate(payload) {
  var props = PropertiesService.getScriptProperties();
  Object.keys(payload).forEach(function (k) {
    if (k === 'resource' || k === 'op' || k === 'action') return;
    props.setProperty(k, String(payload[k]));
  });
  return { success: true, data: props.getProperties() };
}

// ====================== UTILITAS PENGEMBANG (dijalankan MANUAL dari editor, TIDAK diekspos via HTTP) ======================
/** Header lengkap tiap sheet — dipakai migrateSheets() untuk menambah kolom baru bila ada perubahan skema. */
const SHEET_HEADERS = {
  Peserta: [
    'Id_Peserta', 'Nama_Lengkap', 'Username', 'Password', 'Nomor_Whatsapp', 'Jenis_Kelamin',
    'Tempat_Lahir', 'Tanggal_Lahir', 'NISNAS', 'Asal_Sekolah', 'Kelas_Sekolah', 'Wali_Kelas',
    'Kelompok_Umur', 'Kelas', 'Tanggal_Mulai', 'Tanggal_Akhir', 'Status_Pembayaran', 'Nomor_Peserta'
  ],
  Jadwal: ['Id_Jadwal', 'Id_Pelatih', 'Id_Peserta', 'Tanggal', 'Pukul', 'Lokasi', 'Kelas', 'Status'],
  Kehadiran: ['Id_Kehadiran', 'Id_Jadwal', 'Id_Peserta', 'Status', 'Catatan'],
  Rapor: [
    'Id_Rapor', 'Id_Peserta', 'Predikat', 'Catatan',
    'Waktu_25_Bebas', 'Waktu_25_Dada', 'Waktu_25_Kupu', 'Waktu_25_Punggung',
    'Waktu_50_Bebas', 'Waktu_50_Dada', 'Waktu_50_Kupu', 'Waktu_50_Punggung',
    'Tanggal_Rapor', 'Id_Pelatih',
    'Waktu_25_Bebas_Pelampung', 'Waktu_25_Dada_Pelampung', 'Waktu_25_Kupu_Pelampung', 'Waktu_25_Punggung_Pelampung'
  ],
  Berita: ['Id_Berita', 'Judul', 'Tanggal', 'Deskripsi', 'Link', 'Status'],
  Pelatih: ['Id_Pelatih', 'Nama', 'Username', 'Password']
};

/**
 * Migrasi sekali-jalan: pastikan header kolom sesuai SHEET_HEADERS ada di
 * tiap sheet. Aman dijalankan berkali-kali (idempotent). HANYA dijalankan
 * manual dari editor Apps Script (bukan endpoint HTTP) karena ini adalah
 * utilitas migrasi skema, bukan operasi CRUD reguler aplikasi.
 */
function migrateSheets() {
  var report = [];
  Object.keys(SHEET_HEADERS).forEach(function (name) {
    var sheet = getSheet(name);
    if (!sheet) { report.push(name + ': sheet tidak ada'); return; }
    var wanted = SHEET_HEADERS[name];
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    var added = 0;
    wanted.forEach(function (h, i) {
      if (String(current[i] || '').trim().toLowerCase() !== h.trim().toLowerCase()) {
        sheet.getRange(1, i + 1).setValue(h);
        if (i + 1 > lastCol) added++;
      }
    });
    report.push(name + ': header disinkronkan (' + added + ' kolom baru)');
  });
  Logger.log(report.join(' • '));
  return { success: true, message: report.join(' • ') };
}

/** Buat akun admin default bila sheet Pelatih masih kosong. Dijalankan manual dari editor. */
function setupAdminDefault() {
  var sheet = getSheet('Pelatih');
  if (sheet.getLastRow() < 2) {
    sheet.appendRow(['PLT-001', 'Muhtar', 'admin', 'admin123']);
    Logger.log('Admin default: admin / admin123');
  }
}
