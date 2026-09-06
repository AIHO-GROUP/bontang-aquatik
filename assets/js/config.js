/**
 * ===================================================================
 * KONFIGURASI APLIKASI — Bontang Akuatik Swimming Club
 * ===================================================================
 * Satu-satunya sumber kebenaran untuk konstanta lintas halaman.
 * TIDAK berisi business logic — hanya nilai konfigurasi.
 */

const CONFIG = {
  /* ---------------- Backend ---------------- */
  SUPABASE_URL: 'https://eenudyixapvgbeosacgt.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlbnVkeWl4YXB2Z2Jlb3NhY2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5OTczMTQsImV4cCI6MjEwMzU3MzMxNH0.aLjmWOsudUHrP26E6Nxf3FZqLXuuCEXIdNuQYOokHsE',

  /* ---------------- Brand ---------------- */
  BRAND_NAME: 'Bontang Akuatik',
  BRAND_CLUB: 'BONTANG AKUATIK SWIMMING CLUB',
  BRAND_TAGLINE: 'Klub Pelatihan Renang Profesional di Bontang',

  /* ---------------- Kontak ---------------- */
  CONTACT: {
    whatsapp: '62816679671',
    email: 'bontangakuatikswimmingclub@gmail.com',
    alamat: 'Bontang, Kalimantan Timur',
    alamat_lengkap: 'Gg. Selancar 7C No. 7, RT 28, Kel. Api-Api, ' +
                    'Kec. Bontang Utara, Kota Bontang, Kalimantan Timur'
  },

  /* ---------------- Peran pengguna ---------------- */
  ROLES: {
    SUPERADMIN: 'superadmin',   // Koordinator / pemilik klub — akses penuh
    ADMIN: 'admin',             // Pelatih operasional di kolam
    PESERTA: 'peserta'
  },
  ROLE_LABEL: {
    superadmin: 'Koordinator',
    admin: 'Pelatih',
    peserta: 'Peserta'
  },

  /* ---------------- Zona waktu operasional ---------------- */
  // Seluruh jadwal & status sesi dihitung dalam WITA (UTC+8), apa pun
  // zona waktu perangkat pengguna.
  TIMEZONE_OFFSET_MINUTES: 480,
  TIMEZONE_LABEL: 'WITA',

  /* ---------------- Aturan sesi latihan ---------------- */
  // Jadwal otomatis berstatus Aktif tepat pada jam mulai, lalu tertutup
  // (Selesai) setelah durasi ini. Admin tetap bisa menimpa manual.
  SESI_DURASI_MENIT: 120,
  // Batas pembuatan jadwal otomatis ke depan (hari). Mencegah ribuan baris
  // jadwal untuk pendaftaran berdurasi 1-2 tahun.
  JADWAL_HORIZON_HARI: 120,

  /* ---------------- Kebijakan password ---------------- */
  PASSWORD_POLICY: {
    minLength: 6,
    requireUppercase: true,
    requireNumber: true,
    requireSymbol: true,
    forbidUsername: true
  },

  /* ---------------- Pilihan/enum ---------------- */
  KELAS_OPTIONS: ['Grup A', 'Grup B', 'Grup C'],
  STATUS_JADWAL: ['Aktif', 'Pending', 'Cancel'],
  JENIS_KELAMIN_OPTIONS: ['Laki-laki', 'Perempuan'],
  DURASI_OPTIONS: [1, 3, 6, 12],
  PREDIKAT_OPTIONS: ['Sangat Baik', 'Baik', 'Cukup', 'Perlu Latihan Lanjut'],
  PAGE_SIZE_OPTIONS: [5, 10, 20, 'all'],
  PAGE_SIZE_DEFAULT: 10,

  ENROLLMENT_STATUS: {
    pending:   { label: 'Menunggu Pembayaran', tone: 'warning' },
    active:    { label: 'Aktif',               tone: 'success' },
    completed: { label: 'Selesai',             tone: 'muted'   },
    paused:    { label: 'Dijeda',              tone: 'info'    },
    rejoined:  { label: 'Bergabung Kembali',   tone: 'success' }
  },

  /* ---------------- Lampiran berita ---------------- */
  BERITA_UPLOAD: {
    maxBytes: 10485760,
    accept: '.jpg,.jpeg,.png,.pdf,.pptx',
    mimeTypes: [
      'image/jpeg', 'image/jpg', 'image/png', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint'
    ],
    bucket: 'berita'
  },

  /* ---------------- Gaya renang untuk rapor ---------------- */
  GAYA_RENANG: [
    { key: 'Bebas',    label: 'Gaya Bebas' },
    { key: 'Dada',     label: 'Gaya Dada' },
    { key: 'Kupu',     label: 'Gaya Kupu' },
    { key: 'Punggung', label: 'Gaya Punggung' }
  ],

  KELOMPOK_UMUR_INFO: {
    'Senior': '> 19 tahun',
    'Group 1': '16-18 tahun',
    'Group 2': '14-15 tahun',
    'Group 3': '12-13 tahun',
    'Group 4': '10-11 tahun',
    'Group 5': '8-9 tahun',
    'Group 6': '7 tahun ke bawah'
  },

  /* ---------------- Detail kelas (tanpa informasi tarif) ---------------- */
  KELAS_DETAIL: {
    'Grup A': {
      lokasi: 'Kenari Waterpark Bontang',
      jadwal_label: 'Senin, Rabu, Sabtu',
      jam_label: '16:00 - 17:45 WITA',
      frekuensi: '3x seminggu',
      mascot: '🐬',
      mascot_name: 'Tim Lumba-Lumba',
      color: 'blue',
      recommended: false,
      fasilitas: ['Pelatih profesional', 'Laporan kemajuan', 'Pendampingan event lomba']
    },
    'Grup B': {
      lokasi: 'Kenari Waterpark Bontang',
      jadwal_label: 'Selasa, Kamis, Sabtu',
      jam_label: 'Sel/Kam 16:00 • Sab 07:00 WITA',
      frekuensi: '3x seminggu',
      mascot: '🦈',
      mascot_name: 'Tim Hiu',
      color: 'orange',
      recommended: true,
      fasilitas: ['Pelatih profesional', 'Laporan kemajuan', 'Pendampingan event lomba']
    },
    'Grup C': {
      lokasi: 'Grand Equator Hotel Bontang',
      jadwal_label: 'Sabtu & Minggu',
      jam_label: 'Sab 16:00 • Min 08:00 WITA',
      frekuensi: '2x seminggu',
      mascot: '🐢',
      mascot_name: 'Tim Kura-Kura',
      color: 'green',
      recommended: false,
      fasilitas: ['Pelatih profesional', 'Laporan kemajuan', 'Pendampingan event lomba']
    }
  },

  WEEKLY_SCHEDULE: {
    'Grup A': [
      { hari: 'Senin',  jam: '16:00 - 17:45' },
      { hari: 'Rabu',   jam: '16:00 - 17:45' },
      { hari: 'Sabtu',  jam: '16:00 - 17:45' }
    ],
    'Grup B': [
      { hari: 'Selasa', jam: '16:00 - 17:45' },
      { hari: 'Kamis',  jam: '16:00 - 17:45' },
      { hari: 'Sabtu',  jam: '07:00 - 08:45' }
    ],
    'Grup C': [
      { hari: 'Sabtu',  jam: '16:00 - 17:45' },
      { hari: 'Minggu', jam: '08:00 - 09:30' }
    ]
  },

  LOCATIONS: [
    {
      name: 'Kenari Waterpark Bontang',
      address: 'Bontang, Kalimantan Timur',
      mapsUrl: 'https://maps.app.goo.gl/CJRNytfi6htyRrYWA',
      embedSrc: 'https://maps.google.com/maps?q=Kolam+Renang+Kenari+Bontang&z=16&output=embed'
    },
    {
      name: 'Grand Equator Hotel Bontang',
      address: 'Bontang, Kalimantan Timur',
      mapsUrl: 'https://maps.app.goo.gl/pAW9yPUd2trFCzqG8',
      embedSrc: 'https://maps.google.com/maps?q=Kolam+Renang+Ekuator+Bontang&z=16&output=embed'
    }
  ],

  EQUIPMENT_INFO: {
    pemula: ['Pakaian renang', 'Kacamata renang', 'Papan pelampung'],
    lanjut: ['Pakaian renang', 'Kacamata renang', 'Papan pelampung', 'Pull buoy', 'Hand paddles', 'Fins (ukuran pendek)'],
    lain: ['Perlengkapan mandi untuk bilas'],
    tambahan: [
      'Awali dan akhiri latihan dengan doa serta stretching',
      'Jeda makan besar minimal 1 jam sebelum latihan; makan setelah latihan',
      'Bawa air minum (tidak dingin), disarankan air hangat'
    ]
  },

  MIN_AGE: 5,

  /* ---------------- Pertanyaan yang sering diajukan ----------------
     Ditampilkan lewat tombol mengambang di halaman publik & dashboard
     peserta. Pertanyaan soal biaya SENGAJA tidak dijawab dengan angka:
     tarif dapat berubah dan bergantung grup/durasi, sehingga jawabannya
     mengarahkan ke admin agar informasinya selalu akurat. */
  FAQ: [
    {
      q: 'Berapa biaya pelatihan renang di Bontang Akuatik?',
      a: 'Rincian biaya kami sampaikan langsung oleh admin, karena besarannya ' +
         'menyesuaikan grup latihan dan durasi pendaftaran yang Anda pilih, ' +
         'serta dapat berubah sewaktu-waktu. Silakan hubungi admin kami melalui ' +
         'WhatsApp agar Anda menerima informasi terbaru yang akurat beserta ' +
         'tata cara pembayarannya.',
      cta: 'wa'
    },
    {
      q: 'Bagaimana cara mendaftar?',
      a: 'Buka menu <strong>Daftar Sekarang</strong>, lengkapi data dalam empat langkah ' +
         '(akun, data pribadi, sekolah, dan pilihan grup), lalu konfirmasikan pembayaran ' +
         'kepada admin melalui WhatsApp. Akun Anda langsung dapat digunakan untuk masuk, ' +
         'dan jadwal latihan terbuka otomatis setelah pembayaran diverifikasi.',
      cta: 'daftar'
    },
    {
      q: 'Berapa usia minimal peserta?',
      a: 'Usia minimal 5 tahun. Peserta dikelompokkan otomatis oleh sistem berdasarkan ' +
         'tanggal lahir, mulai dari Group 6 (7 tahun ke bawah) hingga Senior (di atas 19 tahun).'
    },
    {
      q: 'Kapan dan di mana jadwal latihannya?',
      a: '<strong>Grup A</strong>: Senin, Rabu, Sabtu pukul 16.00 WITA di Kenari Waterpark.<br>' +
         '<strong>Grup B</strong>: Selasa &amp; Kamis pukul 16.00, Sabtu pukul 07.00 WITA di Kenari Waterpark.<br>' +
         '<strong>Grup C</strong>: Sabtu pukul 16.00 dan Minggu pukul 08.00 WITA di Grand Equator Hotel.'
    },
    {
      q: 'Perlengkapan apa yang harus dibawa?',
      a: 'Pakaian renang, kacamata renang, papan pelampung, dan perlengkapan mandi untuk bilas. ' +
         'Peserta tingkat lanjut dianjurkan menambahkan pull buoy, hand paddles, dan fins pendek. ' +
         'Bawa juga air minum (tidak dingin) dan beri jeda minimal satu jam setelah makan besar.'
    },
    {
      q: 'Bagaimana cara melakukan absensi?',
      a: 'Absensi dibuka <strong>otomatis</strong> tepat pada jam mulai latihan dan tertutup dua jam ' +
         'kemudian. Buka dashboard Anda, lalu ketuk kartu jadwal pada bagian ' +
         '"Ayo Absen Kehadiran". Bila berhalangan hadir, Anda dapat mengajukan izin ' +
         'lebih awal beserta alasannya.'
    },
    {
      q: 'Saya lupa password, bagaimana?',
      a: 'Gunakan tautan <strong>Lupa password?</strong> di halaman masuk. Anda akan diminta ' +
         'memverifikasi identitas (nama lengkap, tanggal lahir, dan nomor WhatsApp), ' +
         'lalu menerima kode OTP di email untuk membuat password baru. Bila kode tidak ' +
         'kunjung diterima, hubungi admin untuk dibantu memulihkan akun.',
      cta: 'wa'
    },
    {
      q: 'Masa pelatihan saya habis. Apakah harus mendaftar ulang?',
      a: 'Tidak perlu. Gunakan akun yang sama, lalu tekan tombol ' +
         '<strong>Perpanjang / Bergabung Kembali</strong> di dashboard Anda. ' +
         'Seluruh riwayat latihan, absensi, dan rapor Anda tetap tersimpan dalam satu akun.'
    },
    {
      q: 'Apa itu NISNAS?',
      a: 'NISNAS adalah <strong>Nomor Induk Siswa Nasional Akuatik Swimming</strong>, ' +
         'nomor keanggotaan yang diterbitkan oleh klub renang untuk keperluan pendataan ' +
         'atlet dan pendaftaran kejuaraan. Nomor ini berbeda dari NISN sekolah formal. ' +
         'Bila Anda belum memilikinya, kolom tersebut boleh dikosongkan dan admin akan ' +
         'membantu penerbitannya.'
    }
  ],

  /* ---------------- Pemberitahuan perubahan sistem ---------------- */
  // Dinaikkan setiap kali ada perubahan besar pada alur/database yang perlu
  // diketahui pengguna. Banner tampil sekali per versi per perangkat.
  NOTICE: {
    version: 2,
    title: 'Pembaruan Sistem Bontang Akuatik',
    body: [
      'Aplikasi baru saja diperbarui dengan beberapa perubahan penting:',
      '<strong>Login tetap bisa</strong> walau pembayaran belum lunas. Hanya jadwal latihan yang terkunci sampai pembayaran dikonfirmasi.',
      '<strong>Password lebih aman</strong>: minimal 6 karakter dengan huruf kapital, angka, dan karakter unik.',
      '<strong>Lupa password kini memakai kode OTP email</strong> agar akun Anda lebih terlindungi.',
      '<strong>Riwayat pelatihan tersimpan per periode</strong>. Perpanjangan tidak lagi menghapus riwayat lama.',
      '<strong>Jadwal buka dan tutup otomatis</strong> sesuai jam latihan (WITA), tanpa perlu menunggu admin.',
      'Seluruh data dan akun lama Anda tetap utuh. Tidak perlu mendaftar ulang.'
    ]
  }
};

/**
 * Periode rapor berbasis semester (mengikuti pola sekolah formal).
 * Semester 1: 01 Jan sampai 30 Jun; Semester 2: 01 Jul sampai 31 Des.
 * @returns {{start:Date, end:Date, label:string}}
 */
function getSemesterPeriode(tanggalMulai) {
  const ref = tanggalMulai ? new Date(tanggalMulai) : new Date();
  const valid = !isNaN(ref.getTime());
  const year  = valid ? ref.getFullYear() : new Date().getFullYear();
  const month = valid ? ref.getMonth()    : new Date().getMonth();
  const isSemester1 = month <= 5;
  const start = isSemester1 ? new Date(year, 0, 1) : new Date(year, 6, 1);
  const end   = isSemester1 ? new Date(year, 5, 30) : new Date(year, 11, 31);
  return { start, end, label: isSemester1 ? 'Semester 1' : 'Semester 2' };
}
