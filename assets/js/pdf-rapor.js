/* ============================================================
   PDF RAPOR GENERATOR — v4
   jsPDF + jsPDF-AutoTable (load via CDN di HTML)

   Format 5 kolom: No | GAYA RENANG | 25m (Dengan Pelampung)
                   | 25m (Tanpa Pelampung) | 50m
   + Stempel & tanda tangan (assets/rapor/stemple.png) di-overlay
     "di depan teks" pada area antara nama klub dan nama pelatih.
   + Periode pengambilan waktu mengikuti semester (Jan–Jun / Jul–Des).
   + Nomor peserta tampil di antara Nama dan Jenis Kelamin.
   ============================================================ */
const PDFRapor = {

  _imgCache: {},

  async loadImageAsDataURL(path) {
    if (this._imgCache[path]) return this._imgCache[path];
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const result = { dataURL: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight };
          this._imgCache[path] = result;
          resolve(result);
        } catch (err) { reject(err); }
      };
      img.onerror = () => reject(new Error('Gagal load gambar: ' + path));
      img.src = path;
    });
  },

  /** Format waktu dari DB → "01.08.12" atau "-" */
  fmtWaktu(v) {
    if (!v || String(v).trim() === '' || String(v).trim() === '-') return '-';
    return String(v).trim();
  },

  fmtTTL(tempat, tanggal) {
    const t = tempat || '-';
    if (!tanggal) return t;
    return t + ', ' + Utils.formatDate(tanggal);
  },

  fmtTanggalID(d) {
    if (!d) return '-';
    return Utils.formatDateLong(d);
  },

  currentYear() { return new Date().getFullYear(); },

  /** Kop surat — return Y cursor setelah header. */
  async drawHeader(doc, pageWidth, marginX) {
    const headerTopY = 10;
    const logoSize = 22;
    const logoLeftX = marginX;
    const logoRightX = pageWidth - marginX - logoSize;

    let logoKiri = null, logoKanan = null;
    try { logoKiri = await this.loadImageAsDataURL('assets/images/bontang.png'); } catch (e) { console.warn(e.message); }
    try { logoKanan = await this.loadImageAsDataURL('assets/images/logo.png'); } catch (e) { console.warn(e.message); }

    const drawLogo = (img, x) => {
      if (!img) return;
      const ratio = img.width / img.height;
      let w = logoSize, h = logoSize;
      if (ratio > 1) { h = logoSize / ratio; } else { w = logoSize * ratio; }
      const dx = x + (logoSize - w) / 2;
      const dy = headerTopY + (logoSize - h) / 2;
      const format = img.dataURL.includes('image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(img.dataURL, format, dx, dy, w, h);
    };
    drawLogo(logoKiri, logoLeftX);
    drawLogo(logoKanan, logoRightX);

    const textPadding = 4;
    const textLeftX = logoLeftX + logoSize + textPadding;
    const textRightX = logoRightX - textPadding;
    const textCenterX = (textLeftX + textRightX) / 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('BONTANG AKUATIK SWIMMING CLUB', textCenterX, headerTopY + 6, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Gg. Selancar 7C, No. 7, RT 28, Kel. Api-Api, Kec. Bontang Utara, Kota Bontang',
      textCenterX, headerTopY + 12, { align: 'center' });

    const email = 'bontangakuatikswimmingclub@gmail.com';
    const sep = '  |  ';
    const phone = '+62816679671';
    doc.setFontSize(9.5);
    const emailW = doc.getTextWidth(email);
    const sepW = doc.getTextWidth(sep);
    const lineY = headerTopY + 18;
    let drawX = textCenterX - (emailW + sepW + doc.getTextWidth(phone)) / 2;

    doc.setTextColor(30, 90, 200);
    doc.text(email, drawX, lineY);
    doc.setLineWidth(0.2);
    doc.setDrawColor(30, 90, 200);
    doc.line(drawX, lineY + 0.7, drawX + emailW, lineY + 0.7);
    drawX += emailW;
    doc.setTextColor(0, 0, 0);
    doc.text(sep, drawX, lineY);
    drawX += sepW;
    doc.text(phone, drawX, lineY);

    const dividerY = headerTopY + logoSize + 2;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(marginX, dividerY, pageWidth - marginX, dividerY);
    return dividerY + 6;
  },

  /**
   * Generate PDF rapor.
   * @param {Object} peserta - data lengkap peserta (getDataLengkapPeserta)
   * @param {Object} rapor   - data rapor (getRaporPeserta)
   * @param {String} namaPelatih - opsional override nama pelatih
   */
  async generate(peserta, rapor, namaPelatih) {
    if (typeof window.jspdf === 'undefined') {
      Utils.notify('Library PDF belum termuat. Mohon refresh halaman.', 'error');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 20;

    // ============ KOP SURAT ============
    let cursorY = await this.drawHeader(doc, pageWidth, marginX);

    // ============ JUDUL ============
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('LAPORAN HASIL LATIHAN RENANG', pageWidth / 2, cursorY + 4, { align: 'center' });
    cursorY += 10;

    // ============ IDENTITAS (Nomor Peserta antara Nama & Jenis Kelamin) ============
    const identitas = [
      ['Nama', ':', (peserta.Nama_Lengkap || '-').toUpperCase()],
      ['Nomor Peserta', ':', peserta.Nomor_Peserta ? String(peserta.Nomor_Peserta) : '-'],
      ['Jenis Kelamin', ':', peserta.Jenis_Kelamin || '-'],
      ['Tempat, Tanggal Lahir', ':', this.fmtTTL(peserta.Tempat_Lahir, peserta.Tanggal_Lahir)],
      ['Kelompok Umur', ':', peserta.Kelompok_Umur || '-'],
      ['NISN', ':', peserta.NISNAS || '-'],
      ['Asal Sekolah', ':', peserta.Asal_Sekolah || '-'],
      ['Kelas, (Wali Kelas)', ':', (peserta.Kelas_Sekolah || '-') + ' (' + (peserta.Wali_Kelas || '-') + ')']
    ];
    doc.autoTable({
      startY: cursorY,
      body: identitas,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 11, cellPadding: { top: 1, bottom: 1, left: 0, right: 2 }, textColor: [0, 0, 0] },
      columnStyles: { 0: { cellWidth: 50, fontStyle: 'normal' }, 1: { cellWidth: 5, halign: 'center' }, 2: { cellWidth: 'auto', fontStyle: 'normal' } },
      margin: { left: marginX, right: marginX }
    });
    cursorY = doc.lastAutoTable.finalY + 8;

    // ============ SUBJUDUL ============
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('CAPAIAN HASIL LATIHAN RENANG', pageWidth / 2, cursorY, { align: 'center' });
    cursorY += 7;

    // ============ PERIODE (semester) ============
    const periode = (typeof getSemesterPeriode === 'function')
      ? getSemesterPeriode(peserta.Tanggal_Mulai)
      : { start: peserta.Tanggal_Mulai, end: peserta.Tanggal_Akhir };
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.text('Periode pengambilan waktu : ' + this.fmtTanggalID(periode.start) + ' s.d ' + this.fmtTanggalID(periode.end), marginX, cursorY);
    cursorY += 5;

    // ============ TABEL RAPOR — 5 KOLOM ============
    const r = rapor || {};
    const tabelRapor = [
      ['1', 'GAYA BEBAS',    this.fmtWaktu(r.Waktu_25_Bebas_Pelampung),    this.fmtWaktu(r.Waktu_25_Bebas),    this.fmtWaktu(r.Waktu_50_Bebas)],
      ['2', 'GAYA DADA',     this.fmtWaktu(r.Waktu_25_Dada_Pelampung),     this.fmtWaktu(r.Waktu_25_Dada),     this.fmtWaktu(r.Waktu_50_Dada)],
      ['3', 'GAYA KUPU',     this.fmtWaktu(r.Waktu_25_Kupu_Pelampung),     this.fmtWaktu(r.Waktu_25_Kupu),     this.fmtWaktu(r.Waktu_50_Kupu)],
      ['4', 'GAYA PUNGGUNG', this.fmtWaktu(r.Waktu_25_Punggung_Pelampung), this.fmtWaktu(r.Waktu_25_Punggung), this.fmtWaktu(r.Waktu_50_Punggung)]
    ];
    doc.autoTable({
      startY: cursorY,
      head: [['NO.', 'GAYA RENANG', '25 METER\n(Dengan Pelampung)', '25 METER\n(Tanpa Pelampung)', '50 METER']],
      body: tabelRapor,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 10, halign: 'center', valign: 'middle', lineColor: [0, 0, 0], lineWidth: 0.3, textColor: [0, 0, 0], cellPadding: 2.5 },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', fontSize: 9 },
      columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 40, halign: 'left' }, 2: { cellWidth: 39 }, 3: { cellWidth: 39 }, 4: { cellWidth: 40 } },
      margin: { left: marginX, right: marginX }
    });
    cursorY = doc.lastAutoTable.finalY + 8;

    // ============ PREDIKAT ============
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('1) PREDIKAT', marginX, cursorY + 5);
    doc.rect(marginX + 30, cursorY, pageWidth - marginX * 2 - 30, 8);
    doc.text(r.Predikat || '-', marginX + 32, cursorY + 5);
    cursorY += 13;

    // ============ DESKRIPSI ============
    doc.text('2) DESKRIPSI', marginX, cursorY + 5);
    const deskBoxX = marginX + 30;
    const deskBoxW = pageWidth - marginX * 2 - 30;
    const deskBoxH = 18;
    doc.rect(deskBoxX, cursorY, deskBoxW, deskBoxH);
    const splitText = doc.splitTextToSize(r.Catatan || '-', deskBoxW - 4);
    doc.text(splitText, deskBoxX + 2, cursorY + 5);
    cursorY += deskBoxH + 12;

    // ============ FOOTER: tanggal + klub + STEMPEL + nama pelatih ============
    const footerCenterX = pageWidth - marginX - 30; // pusat blok tanda tangan (kanan)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Bontang, ' + this.fmtTanggalID(new Date()), footerCenterX, cursorY, { align: 'center' });
    cursorY += 5;

    // Baris nama klub
    doc.setFont('helvetica', 'bold');
    const clubY = cursorY;
    doc.text('BONTANG AKUATIK SWIMMING CLUB', footerCenterX, clubY, { align: 'center' });

    // Baris nama pelatih (di bawah, beri ruang untuk stempel di tengah)
    // const pelatih = (namaPelatih || r.Nama_Pelatih || 'Muhtar Efendi').toUpperCase();
    const pelatih = ('Muhtar Efendi').toUpperCase();
    const gap = 24; // ruang kosong untuk stempel & tanda tangan
    const pelatihY = clubY + gap;
    doc.setFont('helvetica', 'bold');
    doc.text(pelatih, footerCenterX, pelatihY, { align: 'center' });
    const textWidth = doc.getTextWidth(pelatih);
    doc.setLineWidth(0.3);
    doc.line(footerCenterX - textWidth / 2, pelatihY + 1, footerCenterX + textWidth / 2, pelatihY + 1);
    doc.setFont('helvetica', 'normal');
    doc.text('Koordinator Pelatih', footerCenterX, pelatihY + 5, { align: 'center' });

    // STEMPEL — di-overlay TERAKHIR (di depan teks), di area tengah antara klub & pelatih
    try {
      const stemp = await this.loadImageAsDataURL('assets/rapor/stemple.png');
      const stampW = 40;
      const stampH = stampW * (stemp.height / stemp.width);
      const stampX = footerCenterX - stampW / 2;
      const stampY = clubY + 2; // mulai tepat di bawah teks klub, mengisi gap menuju nama pelatih
      doc.addImage(stemp.dataURL, 'PNG', stampX, stampY, stampW, stampH);
    } catch (e) {
      console.warn('Stempel tidak termuat:', e.message);
    }

    cursorY = pelatihY + 14;

    // ============ CATATAN KELOMPOK UMUR (kiri) ============
    const noteX = marginX;
    const noteY = cursorY - 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Catatan Kelompok Umur :', noteX, noteY);
    const kelompokList = [
      ['Senior', '> 19 tahun'], ['Group 1', '16-18 tahun'], ['Group 2', '14-15 tahun'],
      ['Group 3', '12-13 tahun'], ['Group 4', '10-11 tahun'], ['Group 5', '8-9 tahun'], ['Group 6', '< 7 tahun']
    ];
    let ly = noteY + 6;
    kelompokList.forEach((item, index) => {
      doc.text((index + 1) + ')', noteX + 2, ly);
      doc.text(item[0] + ' : ' + item[1], noteX + 10, ly);
      ly += 5;
    });
    doc.rect(noteX, noteY + 2, 70, 40);

    // ============ SAVE (setelah semua digambar) ============
    const filename = 'Rapor_' + (peserta.Nama_Lengkap || 'Peserta').replace(/\s+/g, '_') + '_' + Utils.formatDateInput(new Date()) + '.pdf';
    doc.save(filename);
    Utils.notify('Rapor PDF berhasil diunduh', 'success');
  }
};
