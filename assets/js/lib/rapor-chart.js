/**
 * ===================================================================
 * lib/rapor-chart.js — Grafik perkembangan waktu renang (SVG murni)
 * ===================================================================
 * Menggambar riwayat catatan waktu peserta sebagai empat panel kecil,
 * satu panel per gaya renang, dengan satu garis di tiap panel.
 *
 * MENGAPA PANEL TERPISAH, BUKAN EMPAT GARIS DALAM SATU BIDANG
 * Waktu gaya kupu secara alami jauh lebih lambat daripada gaya bebas,
 * sehingga menumpuknya pada satu sumbu membuat tiga garis berdesakan di
 * bawah dan satu melayang di atas — tren masing-masing gaya justru tidak
 * terbaca. Panel terpisah memberi tiap gaya skala sendiri, dan karena
 * setiap panel hanya berisi satu garis, warna tidak lagi dipakai untuk
 * membedakan gaya. Itu penting: empat warna yang masih dapat dibedakan
 * oleh mata dengan buta warna merah-hijau tidak mungkin didapat dari
 * palet biru-jingga klub, sedangkan satu garis per panel selalu jelas.
 *
 * WARNA
 * Sian (garis) dan jingga (sorotan) diambil dari identitas klub dan
 * sudah diuji: jarak warnanya aman untuk protanopia, deuteranopia, dan
 * tritanopia, serta kontrasnya di atas 3:1 terhadap latar terang maupun
 * gelap. Nilai untuk tema gelap dipilih terpisah, bukan hasil membalik
 * warna tema terang.
 *
 * ARAH BACA
 * Sumbu tegak adalah waktu tempuh, jadi GARIS YANG MENURUN berarti
 * peserta makin cepat. Keterangan itu selalu ditulis di bawah grafik
 * supaya tidak salah baca, dan tabel riwayat tetap tersedia sebagai
 * padanan non-visual dari grafik ini.
 *
 * Tanpa dependency: tidak memuat pustaka grafik apa pun.
 */
const RaporChart = (function () {
  'use strict';

  /* Geometri panel dalam satuan viewBox; SVG diskalakan CSS, tetapi
     ketebalan garis dikunci lewat vector-effect agar tetap 2 px. */
  const VB = { w: 340, h: 168, padL: 46, padR: 14, padT: 16, padB: 30 };

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const plotW = () => VB.w - VB.padL - VB.padR;
  const plotH = () => VB.h - VB.padT - VB.padB;

  /** Tanggal ISO/timestamp -> label pendek untuk sumbu (mis. "6 Sep"). */
  function labelTanggal(nilai) {
    if (!nilai) return '-';
    if (typeof WITA !== 'undefined' && WITA.formatDate) {
      const s = WITA.formatDate(nilai);
      if (s && s !== '-') return s;
    }
    const d = new Date(nilai);
    return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }

  /**
   * Rentang sumbu tegak dengan sedikit ruang napas di atas dan bawah,
   * sehingga titik terendah tidak menempel pada garis dasar.
   */
  function rentang(values) {
    const isi = values.filter((v) => v != null);
    let min = Math.min.apply(null, isi);
    let max = Math.max.apply(null, isi);
    if (min === max) { min -= 1; max += 1; }
    const napas = (max - min) * 0.18;
    return { min: Math.max(0, min - napas), max: max + napas };
  }

  /** Satu panel = satu gaya renang. */
  function panel(deret, tanggal) {
    const values = deret.values;
    const isiIdx = [];
    values.forEach((v, i) => { if (v != null) isiIdx.push(i); });

    if (!isiIdx.length) {
      return '<figure class="rapor-chart__panel rapor-chart__panel--kosong">' +
        '<figcaption class="rapor-chart__judul">' + esc(deret.label) + '</figcaption>' +
        '<p class="rapor-chart__kosong">Belum ada catatan waktu</p></figure>';
    }

    const r = rentang(values);
    const n = Math.max(values.length, 2);
    const x = (i) => VB.padL + (n === 1 ? plotW() / 2 : (plotW() * i) / (n - 1));
    const y = (v) => VB.padT + plotH() - ((v - r.min) / (r.max - r.min)) * plotH();

    /* Garis kisi: tiga saja, tipis, agar tidak bersaing dengan data. */
    let kisi = '';
    let sumbuY = '';
    for (let g = 0; g <= 2; g++) {
      const nilai = r.min + ((r.max - r.min) * g) / 2;
      const gy = y(nilai);
      kisi += '<line class="rapor-chart__grid" x1="' + VB.padL + '" y1="' + gy.toFixed(1) +
              '" x2="' + (VB.w - VB.padR) + '" y2="' + gy.toFixed(1) + '"/>';
      sumbuY += '<text class="rapor-chart__tick" x="' + (VB.padL - 6) + '" y="' + (gy + 3.5).toFixed(1) +
                '" text-anchor="end">' + esc(RaporStat.formatWaktu(nilai).slice(0, 5)) + '</text>';
    }

    const titik = isiIdx.map((i) => ({ i, v: values[i], cx: x(i), cy: y(values[i]) }));
    const garis = titik.length > 1
      ? '<polyline class="rapor-chart__line" fill="none" points="' +
        titik.map((t) => t.cx.toFixed(1) + ',' + t.cy.toFixed(1)).join(' ') + '"/>'
      : '';

    const ring = RaporStat.ringkasDeret(values);
    const idxTerbaik = ring ? ring.indeksTerbaik : -1;
    const idxTerakhir = ring ? ring.indeksTerakhir : -1;

    /* Setiap titik mendapat cincin selebar 2 px berwarna latar agar tetap
       terpisah dari garis saat dua titik berdekatan. */
    const marker = titik.map((t) => {
      const sorot = t.i === idxTerbaik || t.i === idxTerakhir;
      return '<circle class="rapor-chart__dot' + (sorot ? ' is-sorot' : '') + '" cx="' + t.cx.toFixed(1) +
             '" cy="' + t.cy.toFixed(1) + '" r="4"/>';
    }).join('');

    /* Label langsung HANYA pada catatan terakhir — bukan pada setiap titik,
       yang justru mengubah grafik menjadi tabel yang sulit dibaca.

       Titik terakhir selalu menempel di tepi kanan, jadi labelnya terpaksa
       memanjang ke kiri dan melintasi garis. Alih-alih menggesernya sampai
       keluar bidang, teks diberi "halo" setebal 3 px berwarna latar panel
       lewat paint-order: garis di belakangnya terputus rapi tepat di sekitar
       huruf, sehingga angka tetap terbaca tanpa memindahkan apa pun. */
    const akhir = titik[titik.length - 1];
    const keKiri = akhir.cx > VB.w * 0.6;
    const labelAkhir = '<text class="rapor-chart__nilai" x="' +
      (keKiri ? (akhir.cx - 6) : (akhir.cx + 6)).toFixed(1) + '" y="' + (akhir.cy - 10).toFixed(1) +
      '" text-anchor="' + (keKiri ? 'end' : 'start') + '">' +
      esc(RaporStat.formatWaktu(akhir.v)) + '</text>';

    const xAwal = labelTanggal(tanggal[isiIdx[0]]);
    const xAkhir = labelTanggal(tanggal[isiIdx[isiIdx.length - 1]]);
    const sumbuX =
      '<text class="rapor-chart__tick" x="' + VB.padL + '" y="' + (VB.h - 9) + '" text-anchor="start">' + esc(xAwal) + '</text>' +
      (isiIdx.length > 1
        ? '<text class="rapor-chart__tick" x="' + (VB.w - VB.padR) + '" y="' + (VB.h - 9) + '" text-anchor="end">' + esc(xAkhir) + '</text>'
        : '');

    /* Bidang tangkap sentuh selebar panel: sasaran sentuh jauh lebih besar
       daripada titik 8 px, sehingga mudah dijangkau di layar ponsel. */
    const tangkap = titik.map((t) => {
      const lebar = plotW() / Math.max(titik.length, 1);
      return '<rect class="rapor-chart__hit" x="' + Math.max(VB.padL, t.cx - lebar / 2).toFixed(1) +
             '" y="' + VB.padT + '" width="' + lebar.toFixed(1) + '" height="' + plotH() +
             '" fill="transparent" data-idx="' + t.i + '" data-cx="' + t.cx.toFixed(1) +
             '" data-cy="' + t.cy.toFixed(1) + '"/>';
    }).join('');

    const catatan = titik.length > 1
      ? ''
      : '<p class="rapor-chart__catatan">Butuh minimal dua penilaian untuk melihat tren.</p>';

    return '<figure class="rapor-chart__panel">' +
      '<figcaption class="rapor-chart__judul">' + esc(deret.label) + '</figcaption>' +
      '<div class="rapor-chart__svgwrap">' +
        '<svg class="rapor-chart__svg" viewBox="0 0 ' + VB.w + ' ' + VB.h + '" ' +
             'preserveAspectRatio="xMidYMid meet" role="img" ' +
             'aria-label="Perkembangan waktu ' + esc(deret.label) + '">' +
          kisi + sumbuY + sumbuX + garis + marker + labelAkhir +
          '<line class="rapor-chart__crosshair" x1="0" y1="' + VB.padT + '" x2="0" y2="' +
            (VB.padT + plotH()) + '" hidden/>' +
          tangkap +
        '</svg>' +
        '<div class="rapor-chart__tip" hidden role="status"></div>' +
      '</div>' + catatan +
    '</figure>';
  }

  /** Pasang interaksi sorot/sentuh pada satu panel. */
  function bindPanel(wrap, deret, tanggal) {
    const svg = wrap.querySelector('.rapor-chart__svg');
    const tip = wrap.querySelector('.rapor-chart__tip');
    const cross = wrap.querySelector('.rapor-chart__crosshair');
    if (!svg || !tip) return;

    function tampil(rect) {
      const idx = Number(rect.dataset.idx);
      const cx = Number(rect.dataset.cx);
      const nilai = deret.values[idx];
      cross.setAttribute('x1', cx);
      cross.setAttribute('x2', cx);
      cross.hidden = false;

      tip.innerHTML = '<strong>' + esc(RaporStat.formatWaktu(nilai)) + '</strong>' +
                      '<span>' + esc(labelTanggal(tanggal[idx])) + '</span>';
      tip.hidden = false;
      // Posisi dihitung dari lebar terpasang, bukan satuan viewBox.
      const box = svg.getBoundingClientRect();
      const skala = box.width / VB.w;
      tip.style.left = Math.round(cx * skala) + 'px';
    }
    function sembunyi() { tip.hidden = true; cross.hidden = true; }

    svg.querySelectorAll('.rapor-chart__hit').forEach((rect) => {
      rect.addEventListener('mouseenter', () => tampil(rect));
      rect.addEventListener('focus', () => tampil(rect));
      rect.addEventListener('touchstart', () => tampil(rect), { passive: true });
    });
    svg.addEventListener('mouseleave', sembunyi);
    svg.addEventListener('blur', sembunyi, true);
    wrap.addEventListener('touchend', sembunyi, { passive: true });
  }

  /**
   * Bangun seluruh widget grafik ke dalam sebuah elemen.
   *
   * Grafik hanya digambar bila memang ADA PERKEMBANGAN untuk digambarkan,
   * yaitu minimal dua penilaian yang berisi angka. Peserta yang baru dinilai
   * sekali tidak melihat apa pun di sini — satu titik tanpa garis bukan
   * grafik perkembangan, dan angkanya sudah tercetak lengkap pada tabel
   * capaian tepat di atasnya. Wadahnya dikosongkan sekaligus disembunyikan
   * supaya tidak menyisakan ruang kosong di tengah rapor.
   *
   * @param {HTMLElement} mount_
   * @param {object[]} daftarRapor
   * @param {object[]} gayaList CONFIG.GAYA_RENANG
   * @returns {boolean} true bila grafik jadi digambar
   */
  function mount(mount_, daftarRapor, gayaList) {
    if (!mount_) return false;
    const daftar = RaporStat.urutkan(daftarRapor || []);
    if (daftar.length < 2) { mount_.innerHTML = ''; mount_.hidden = true; return false; }

    // Tanpa satu pun catatan waktu pada jarak mana pun, grafik tidak punya
    // isi — lebih baik tidak ditampilkan daripada menampilkan panel kosong.
    const adaAngka = RaporStat.JARAK.some((j) =>
      RaporStat.buildSeries(daftar, j.key, gayaList).adaData);
    if (!adaAngka) { mount_.innerHTML = ''; mount_.hidden = true; return false; }

    const pilihan = RaporStat.JARAK.map((j, i) =>
      '<button type="button" class="rapor-chart__tab' + (i === 1 ? ' is-active' : '') +
      '" data-jarak="' + j.key + '" role="tab" aria-selected="' + (i === 1) + '">' +
      esc(j.short) + '</button>').join('');

    mount_.hidden = false;
    mount_.innerHTML =
      '<div class="rapor-chart">' +
        '<div class="rapor-chart__head">' +
          '<h4 class="rapor-chart__heading">Perkembangan Catatan Waktu</h4>' +
          '<div class="rapor-chart__tabs" role="tablist" aria-label="Pilih kategori jarak">' + pilihan + '</div>' +
        '</div>' +
        '<div class="rapor-chart__sorot" id="rapor-chart-sorot"></div>' +
        '<div class="rapor-chart__grid-panel" id="rapor-chart-panels"></div>' +
        '<p class="rapor-chart__legend">' +
          '<span class="rapor-chart__key rapor-chart__key--line"></span> Catatan waktu' +
          '<span class="rapor-chart__key rapor-chart__key--sorot"></span> Terbaik &amp; terakhir' +
        '</p>' +
        '<p class="rapor-chart__hint">Sumbu tegak adalah waktu tempuh, jadi <strong>garis yang menurun ' +
          'berarti makin cepat</strong>. Angka lengkap tiap penilaian ada pada tabel riwayat di bawah.</p>' +
      '</div>';

    const panels = mount_.querySelector('#rapor-chart-panels');
    const sorotEl = mount_.querySelector('#rapor-chart-sorot');

    function gambar(jarakKey) {
      const bangun = RaporStat.buildSeries(daftar, jarakKey, gayaList);
      panels.innerHTML = bangun.series.map((s) => panel(s, bangun.tanggal)).join('');
      Array.prototype.forEach.call(panels.querySelectorAll('.rapor-chart__panel'), (fig, i) => {
        bindPanel(fig, bangun.series[i], bangun.tanggal);
      });

      const s = RaporStat.sorotan(daftar, jarakKey, gayaList);
      const kartu = [
        '<div class="rapor-chart__stat"><span>Penilaian tercatat</span><strong>' +
          s.jumlahPenilaian + '</strong></div>'
      ];
      if (s.kemajuanTerbaik) {
        kartu.push('<div class="rapor-chart__stat is-baik"><span>Kemajuan terbaik</span><strong>' +
          esc(RaporStat.formatSelisih(s.kemajuanTerbaik.selisih)) + '</strong>' +
          '<em>' + esc(s.kemajuanTerbaik.gaya) + '</em></div>');
      } else if (s.adaData) {
        kartu.push('<div class="rapor-chart__stat"><span>Kemajuan terbaik</span><strong>Belum terlihat</strong>' +
          '<em>perlu penilaian berikutnya</em></div>');
      }
      sorotEl.innerHTML = kartu.join('');
    }

    mount_.querySelector('.rapor-chart__tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.rapor-chart__tab');
      if (!b) return;
      mount_.querySelectorAll('.rapor-chart__tab').forEach((t) => {
        const on = t === b;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
      });
      gambar(b.dataset.jarak);
    });

    gambar('m25');
    return true;
  }

  return { mount };
})();

if (typeof window !== 'undefined') window.RaporChart = RaporChart;
