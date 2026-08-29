/* ============================================================
   EXCEL EXPORT — Kehadiran format buku absensi
   Menggunakan SheetJS (load via CDN di HTML)
   ============================================================ */
const ExcelExport = {

  /** Bulan ID singkat */
  monthNames: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],

  /**
   * Generate Excel kehadiran format buku absensi.
   * @param {Object} data - {dates: ['2025-10-01', ...], peserta: [{nama, attendance: {date: 'H'/'I'/'A'}}], kelas, periode}
   */
  kehadiran(data) {
    if (typeof XLSX === 'undefined') {
      Utils.notify('Library Excel belum termuat. Mohon refresh halaman.', 'error');
      return;
    }

    if (!data.dates || data.dates.length === 0) {
      Utils.notify('Tidak ada jadwal pada periode ini', 'warning');
      return;
    }

    // Group dates by bulan untuk header bulan
    const dateByMonth = {};
    data.dates.forEach(d => {
      const [year, month] = d.split('-');
      const key = `${year}-${month}`;
      if (!dateByMonth[key]) dateByMonth[key] = [];
      dateByMonth[key].push(d);
    });
    const monthGroups = Object.entries(dateByMonth); // [[ '2025-10', [...] ], ...]

    // ============ BUILD SHEET DATA ============
    const aoa = [];

    // Title row
    aoa.push([`DAFTAR HADIR PELATIHAN RENANG - ${data.kelas}`]);
    aoa.push([`Periode: ${this.formatTglID(data.periode.dari)} s.d ${this.formatTglID(data.periode.sampai)}`]);
    aoa.push([`Bontang Akuatik Swimming Club`]);
    aoa.push([]); // empty row

    // Header Row 1: Bulan (merged per month)
    const headerRow1 = ['NO.', 'NAMA PESERTA'];
    monthGroups.forEach(([monthKey, dates]) => {
      const [year, month] = monthKey.split('-');
      const bulanLabel = `${this.monthNames[Number(month) - 1]} ${year}`;
      headerRow1.push(bulanLabel);
      for (let i = 1; i < dates.length; i++) headerRow1.push(''); // placeholder untuk merge
    });
    aoa.push(headerRow1);

    // Header Row 2: Tanggal (01, 02, ...)
    const headerRow2 = ['', ''];
    data.dates.forEach(d => {
      const day = d.split('-')[2];
      headerRow2.push(String(Number(day))); // strip leading zero
    });
    aoa.push(headerRow2);

    // Body
    data.peserta.forEach((ps, idx) => {
      const row = [idx + 1, ps.nama];
      data.dates.forEach(d => row.push(ps.attendance[d] || ''));
      aoa.push(row);
    });

    // Footer: keterangan
    aoa.push([]);
    aoa.push(['Keterangan:']);
    aoa.push(['H = Hadir | I = Izin | A = Alpa (tidak hadir)']);

    // ============ CREATE WORKSHEET ============
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Column widths
    const colWidths = [{ wch: 5 }, { wch: 30 }];
    for (let i = 0; i < data.dates.length; i++) colWidths.push({ wch: 4 });
    ws['!cols'] = colWidths;

    // Merges
    const merges = [];
    // Merge title row
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 1 + data.dates.length } });
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 1 + data.dates.length } });
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 1 + data.dates.length } });
    // Merge bulan headers (row idx 4 = headerRow1)
    let colCursor = 2;
    monthGroups.forEach(([_, dates]) => {
      if (dates.length > 1) {
        merges.push({ s: { r: 4, c: colCursor }, e: { r: 4, c: colCursor + dates.length - 1 } });
      }
      colCursor += dates.length;
    });
    // Merge NO. header vertically
    merges.push({ s: { r: 4, c: 0 }, e: { r: 5, c: 0 } });
    merges.push({ s: { r: 4, c: 1 }, e: { r: 5, c: 1 } });
    ws['!merges'] = merges;

    // Cell styling (best effort - XLSX styling support varies)
    // Apply borders & alignment to all data cells
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 0; R <= range.e.r; ++R) {
      for (let C = 0; C <= range.e.c; ++C) {
        const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddr]) ws[cellAddr] = { v: '' };
        const cell = ws[cellAddr];
        cell.s = cell.s || {};
        cell.s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
        cell.s.border = {
          top:    { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left:   { style: 'thin', color: { rgb: '000000' } },
          right:  { style: 'thin', color: { rgb: '000000' } }
        };
        // Title rows: bold + bigger
        if (R === 0) { cell.s.font = { bold: true, sz: 14 }; cell.s.alignment.horizontal = 'center'; }
        if (R === 1 || R === 2) { cell.s.font = { italic: true, sz: 11 }; }
        // Header rows
        if (R === 4 || R === 5) {
          cell.s.font = { bold: true, sz: 11 };
          cell.s.fill = { fgColor: { rgb: '169AC4' }, patternType: 'solid' };
          cell.s.font.color = { rgb: 'FFFFFF' };
        }
        // Nama align left
        if (R > 5 && C === 1) cell.s.alignment.horizontal = 'left';
      }
    }

    // ============ CREATE WORKBOOK ============
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Kehadiran ${data.kelas}`);

    const filename = `Kehadiran_${data.kelas.replace(/\s+/g, '_')}_${data.periode.dari}_${data.periode.sampai}.xlsx`;
    XLSX.writeFile(wb, filename);
    Utils.notify('Excel kehadiran berhasil diunduh 📊', 'success');
  },

  formatTglID(d) {
    if (!d) return '-';
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return `${date.getDate()} ${this.monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }
};
