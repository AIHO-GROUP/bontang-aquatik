/* ============================================================
   PDF RAPOR — jsPDF + jsPDF-AutoTable (dimuat via CDN di HTML)

   Format tabel 5 kolom:
     No | Gaya Renang | 25 m (dengan pelampung) | 25 m (tanpa) | 50 m

   Penanda tangan rapor SELALU identitas KOORDINATOR klub, bukan pelatih
   yang memberi nilai. Nama & jabatan diambil dari pengaturan sistem
   (lihat BizLogic.getRaporSigner) sehingga berganti otomatis bila
   koordinator berubah, tanpa menyentuh kode.
   ============================================================ */
const PDFRapor = {

  _imgCache: {},

  /**
   * Muat gambar dan kecilkan ke resolusi secukupnya sebelum ditanam ke PDF.
   *
   * Logo & stempel aslinya beresolusi tinggi (ratusan KB). Menanamkannya
   * apa adanya membuat SATU rapor berukuran megabyte — dan arsip ZIP berisi
   * puluhan rapor menjadi ratusan megabyte, terlalu berat untuk diunduh
   * lewat ponsel. Dibatasi di sini pada resolusi yang masih jauh di atas
   * kebutuhan cetak (gambar hanya berukuran 22-40 mm di kertas).
   *
   * Nilai yang dipakai (logo 200 px untuk cetak 22 mm, stempel 340 px untuk
   * 40 mm) setara ~220 DPI — tajam untuk dicetak, dan menekan ukuran satu
   * rapor dari 2,4 MB menjadi sekitar 0,5 MB.
   *
   * @param {string} path
   * @param {number} maxPx sisi terpanjang maksimum setelah diperkecil
   */
  async loadImageAsDataURL(path, maxPx) {
    const batas = maxPx || 420;
    const key = path + '@' + batas;
    if (this._imgCache[key]) return this._imgCache[key];

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const skala = Math.min(1, batas / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * skala));
          const h = Math.max(1, Math.round(img.naturalHeight * skala));

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);

          const result = { dataURL: canvas.toDataURL('image/png'), width: w, height: h };
          this._imgCache[key] = result;
          resolve(result);
        } catch (err) { reject(err); }
      };
      img.onerror = () => reject(new Error('Gagal memuat gambar: ' + path));
      img.src = path;
    });
  },

  fmtWaktu(v) {
    const s = String(v == null ? '' : v).trim();
    return (!s || s === '-') ? '-' : s;
  },

  fmtTTL(tempat, tanggal) {
    const t = tempat || '-';
    return tanggal ? t + ', ' + WITA.formatDate(tanggal) : t;
  },

  /** Kop surat; mengembalikan posisi Y setelah header. */
  async drawHeader(doc, pageWidth, marginX) {
    const headerTopY = 10;
    const logoSize = 22;
    const logoLeftX = marginX;
    const logoRightX = pageWidth - marginX - logoSize;

    let logoKiri = null, logoKanan = null;
    try { logoKiri = await this.loadImageAsDataURL('assets/images/akuatik.png', 200); } catch (e) { /* opsional */ }
    try { logoKanan = await this.loadImageAsDataURL('assets/images/logo.png', 200); } catch (e) { /* opsional */ }

    const drawLogo = (img, x) => {
      if (!img) return;
      const ratio = img.width / img.height;
      let w = logoSize, h = logoSize;
      if (ratio > 1) h = logoSize / ratio; else w = logoSize * ratio;
      doc.addImage(img.dataURL, 'PNG', x + (logoSize - w) / 2, headerTopY + (logoSize - h) / 2, w, h);
    };
    drawLogo(logoKiri, logoLeftX);
    drawLogo(logoKanan, logoRightX);

    const textPadding = 4;
    const textLeftX = logoLeftX + logoSize + textPadding;
    const textRightX = logoRightX - textPadding;
    const centerX = (textLeftX + textRightX) / 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('BONTANG AKUATIK SWIMMING CLUB', centerX, headerTopY + 6, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Gg. Selancar 7C, No. 7, RT 28, Kel. Api-Api, Kec. Bontang Utara, Kota Bontang',
      centerX, headerTopY + 12, { align: 'center' });

    const email = CONFIG.CONTACT.email;
    const sep = '  |  ';
    const phone = '+' + CONFIG.CONTACT.whatsapp;
    const emailW = doc.getTextWidth(email);
    const sepW = doc.getTextWidth(sep);
    const lineY = headerTopY + 18;
    let drawX = centerX - (emailW + sepW + doc.getTextWidth(phone)) / 2;

    doc.setTextColor(30, 90, 200);
    doc.text(email, drawX, lineY);
    doc.setLineWidth(0.2);
    doc.setDrawColor(30, 90, 200);
    doc.line(drawX, lineY + 0.7, drawX + emailW, lineY + 0.7);
    drawX += emailW;
    doc.setTextColor(0, 0, 0);
    doc.text(sep, drawX, lineY);
    doc.text(phone, drawX + sepW, lineY);

    const dividerY = headerTopY + logoSize + 2;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(marginX, dividerY, pageWidth - marginX, dividerY);
    return dividerY + 6;
  },

  /**
   * Bangun PDF rapor.
   * @param {object} peserta data lengkap peserta (getDataLengkapPeserta)
   * @param {object} rapor   data rapor (getRaporPeserta)
   * @param {object} opts    { output: 'save' | 'blob' } — 'blob' dipakai
   *                         saat membangun arsip ZIP banyak rapor.
   * @returns {Promise<Blob|undefined>}
   */
  async generate(peserta, rapor, opts) {
    const options = opts || {};
    if (typeof window.jspdf === 'undefined') {
      throw new Error('Library PDF belum termuat. Mohon muat ulang halaman.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 20;

    let cursorY = await this.drawHeader(doc, pageWidth, marginX);

    /* ---------------- Judul ---------------- */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('LAPORAN HASIL LATIHAN RENANG', pageWidth / 2, cursorY + 4, { align: 'center' });
    cursorY += 10;

    /* ---------------- Identitas ---------------- */
    doc.autoTable({
      startY: cursorY,
      body: [
        ['Nama', ':', (peserta.Nama_Lengkap || '-').toUpperCase()],
        ['Nomor Peserta', ':', peserta.Nomor_Peserta ? String(peserta.Nomor_Peserta) : '-'],
        ['Jenis Kelamin', ':', peserta.Jenis_Kelamin || '-'],
        ['Tempat, Tanggal Lahir', ':', this.fmtTTL(peserta.Tempat_Lahir, peserta.Tanggal_Lahir)],
        ['Kelompok Umur', ':', peserta.Kelompok_Umur || '-'],
        ['NISNAS', ':', peserta.NISNAS || '-'],
        ['Asal Sekolah', ':', peserta.Asal_Sekolah || '-'],
        ['Kelas, (Wali Kelas)', ':', (peserta.Kelas_Sekolah || '-') + ' (' + (peserta.Wali_Kelas || '-') + ')']
      ],
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 11, cellPadding: { top: 1, bottom: 1, left: 0, right: 2 }, textColor: [0, 0, 0] },
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 5, halign: 'center' }, 2: { cellWidth: 'auto' } },
      margin: { left: marginX, right: marginX }
    });
    cursorY = doc.lastAutoTable.finalY + 8;

    /* ---------------- Capaian ---------------- */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('CAPAIAN HASIL LATIHAN RENANG', pageWidth / 2, cursorY, { align: 'center' });
    cursorY += 7;

    const periode = getSemesterPeriode(peserta.Tanggal_Mulai);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.text('Periode pengambilan waktu : ' + WITA.formatDateLong(periode.start) +
             ' s.d ' + WITA.formatDateLong(periode.end), marginX, cursorY);
    cursorY += 5;

    const r = rapor || {};
    const body = CONFIG.GAYA_RENANG.map((g, i) => [
      String(i + 1),
      g.label.toUpperCase(),
      this.fmtWaktu(r['Waktu_25_' + g.key + '_Pelampung']),
      this.fmtWaktu(r['Waktu_25_' + g.key]),
      this.fmtWaktu(r['Waktu_50_' + g.key])
    ]);

    doc.autoTable({
      startY: cursorY,
      head: [['NO.', 'GAYA RENANG', '25 METER\n(Dengan Pelampung)', '25 METER\n(Tanpa Pelampung)', '50 METER']],
      body,
      theme: 'grid',
      styles: {
        font: 'helvetica', fontSize: 10, halign: 'center', valign: 'middle',
        lineColor: [0, 0, 0], lineWidth: 0.3, textColor: [0, 0, 0], cellPadding: 2.5
      },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', fontSize: 9 },
      columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 40, halign: 'left' }, 2: { cellWidth: 39 }, 3: { cellWidth: 39 }, 4: { cellWidth: 40 } },
      margin: { left: marginX, right: marginX }
    });
    cursorY = doc.lastAutoTable.finalY + 8;

    /* ---------------- Predikat & deskripsi ---------------- */
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('1) PREDIKAT', marginX, cursorY + 5);
    doc.rect(marginX + 30, cursorY, pageWidth - marginX * 2 - 30, 8);
    doc.text(r.Predikat || '-', marginX + 32, cursorY + 5);
    cursorY += 13;

    doc.text('2) DESKRIPSI', marginX, cursorY + 5);
    const deskBoxX = marginX + 30;
    const deskBoxW = pageWidth - marginX * 2 - 30;
    const deskBoxH = 18;
    doc.rect(deskBoxX, cursorY, deskBoxW, deskBoxH);
    doc.text(doc.splitTextToSize(r.Catatan || '-', deskBoxW - 4), deskBoxX + 2, cursorY + 5);
    cursorY += deskBoxH + 12;

    /* ---------------- Tanda tangan koordinator ---------------- */
    const signer = (typeof BizLogic !== 'undefined' && BizLogic.getRaporSigner)
      ? BizLogic.getRaporSigner()
      : { nama: 'Muhtar Efendi', jabatan: 'Koordinator Pelatih' };

    const footerCenterX = pageWidth - marginX - 30;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Bontang, ' + WITA.formatDateLong(WITA.todayISO()), footerCenterX, cursorY, { align: 'center' });
    cursorY += 5;

    doc.setFont('helvetica', 'bold');
    const clubY = cursorY;
    doc.text('BONTANG AKUATIK SWIMMING CLUB', footerCenterX, clubY, { align: 'center' });

    const namaSigner = String(signer.nama || '').toUpperCase();
    const gap = 24;                       // ruang untuk stempel & tanda tangan
    const signerY = clubY + gap;
    doc.setFont('helvetica', 'bold');
    doc.text(namaSigner, footerCenterX, signerY, { align: 'center' });
    const textWidth = doc.getTextWidth(namaSigner);
    doc.setLineWidth(0.3);
    doc.line(footerCenterX - textWidth / 2, signerY + 1, footerCenterX + textWidth / 2, signerY + 1);
    doc.setFont('helvetica', 'normal');
    doc.text(signer.jabatan || 'Koordinator Pelatih', footerCenterX, signerY + 5, { align: 'center' });

    // Stempel digambar TERAKHIR agar berada di depan teks.
    try {
      const stemp = await this.loadImageAsDataURL('assets/rapor/stemple.png', 340);
      const stampW = 40;
      const stampH = stampW * (stemp.height / stemp.width);
      doc.addImage(stemp.dataURL, 'PNG', footerCenterX - stampW / 2, clubY + 2, stampW, stampH);
    } catch (e) { /* stempel opsional */ }

    cursorY = signerY + 14;

    /* ---------------- Catatan kelompok umur ---------------- */
    const noteX = marginX;
    const noteY = cursorY - 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Catatan Kelompok Umur :', noteX, noteY);
    let ly = noteY + 6;
    Object.entries(CONFIG.KELOMPOK_UMUR_INFO).forEach(([nama, rentang], i) => {
      doc.text((i + 1) + ')', noteX + 2, ly);
      doc.text(nama + ' : ' + rentang, noteX + 10, ly);
      ly += 5;
    });
    doc.rect(noteX, noteY + 2, 70, 40);

    /* ---------------- Keluaran ---------------- */
    if (options.output === 'blob') return doc.output('blob');

    const filename = 'Rapor_' + String(peserta.Nama_Lengkap || 'Peserta').replace(/\s+/g, '_') +
                     '_' + WITA.todayISO() + '.pdf';
    doc.save(filename);
    if (typeof UI !== 'undefined') UI.toast('Rapor PDF berhasil diunduh', 'success');
    return undefined;
  }
};
