/**
 * ===================================================================
 * KONFIGURASI APLIKASI — Bontang Akuatik Swimming Club
 * ===================================================================
 */

const CONFIG = {
  // ⚠️ GANTI dengan kredensial project Supabase Anda (Project Settings -> API).
  // SUPABASE_URL  : contoh https://xxxxxxxxxxxx.supabase.co
  // SUPABASE_ANON_KEY : kunci "anon public" (BUKAN service_role) — aman dipakai di browser,
  //                      hak aksesnya diatur lewat Row Level Security (lihat 01_schema.sql).
  SUPABASE_URL: 'https://eenudyixapvgbeosacgt.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlbnVkeWl4YXB2Z2Jlb3NhY2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5OTczMTQsImV4cCI6MjEwMzU3MzMxNH0.aLjmWOsudUHrP26E6Nxf3FZqLXuuCEXIdNuQYOokHsE',

  // Brand
  BRAND_NAME: 'Bontang Akuatik',
  BRAND_CLUB: 'BONTANG AKUATIK SWIMMING CLUB',
  BRAND_TAGLINE: 'Klub Pelatihan Renang Profesional di Bontang',

  // Kontak
  CONTACT: {
    whatsapp: '62816679671',         // nomor admin (untuk redirect setelah registrasi)
    email: 'bontangakuatikswimmingclub@gmail.com',
    alamat: 'Bontang, Kalimantan Timur'
  },

  // Pesan otomatis ke admin setelah registrasi (request 10)
  WA_REGISTRATION_MESSAGE:
    'Halo, saya telah melakukan pendaftaran pelatihan renang Bontang Akuatik. ' +
    'Apakah bisa dibantu untuk melanjutkan sistem pembayaran. Terima Kasih',

  // Pilihan kelas
  KELAS_OPTIONS: ['Grup A', 'Grup B', 'Grup C'],
  STATUS_JADWAL: ['Aktif', 'Pending', 'Cancel'],
  JENIS_KELAMIN_OPTIONS: ['Laki-laki', 'Perempuan'],
  PREDIKAT_OPTIONS: [
    'Sangat Baik',
    'Baik',
    'Cukup',
    'Perlu Latihan Lanjut'
  ],

  // Gaya renang untuk tabel rapor
  GAYA_RENANG: [
    { key: 'Bebas',    label: 'Gaya Bebas' },
    { key: 'Dada',     label: 'Gaya Dada' },
    { key: 'Kupu',     label: 'Gaya Kupu' },
    { key: 'Punggung', label: 'Gaya Punggung' }
  ],

  // Kelompok umur (display purposes)
  KELOMPOK_UMUR_INFO: {
    'Senior': '> 19 tahun',
    'Group 1': '16-18 tahun',
    'Group 2': '14-15 tahun',
    'Group 3': '12-13 tahun',
    'Group 4': '10-11 tahun',
    'Group 5': '8-9 tahun',
    'Group 6': '≤ 7 tahun'
  },

  // Detail kelas (untuk section "Kelas Tersedia") — request 6
  KELAS_DETAIL: {
    'Grup A': {
      lokasi: 'Kenari Waterpark Bontang',
      jadwal_label: 'Senin, Rabu, Sabtu',
      jam_label: '16:00 - 17:45 WITA',
      frekuensi: '3x seminggu',
      tarif: 400000,
      tarif_label: 'Rp 400.000',
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
      tarif: 400000,
      tarif_label: 'Rp 400.000',
      mascot: '🦈',
      mascot_name: 'Tim Hiu',
      color: 'orange',
      recommended: true,                // ⭐ HIGHLIGHT
      fasilitas: ['Pelatih profesional', 'Laporan kemajuan', 'Pendampingan event lomba']
    },
    'Grup C': {
      lokasi: 'Grand Equator Hotel Bontang',
      jadwal_label: 'Sabtu & Minggu',
      jam_label: 'Sab 16:00 • Min 08:00 WITA',
      frekuensi: '2x seminggu',
      tarif: 100000,
      tarif_label: 'Rp 100.000',
      mascot: '🐢',
      mascot_name: 'Tim Kura-Kura',
      color: 'green',
      recommended: false,
      fasilitas: ['Pelatih profesional', 'Laporan kemajuan', 'Pendampingan event lomba']
    }
  },

  // Jadwal mingguan per grup (untuk visualisasi schedule section — request 7)
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

  // Lokasi maps (untuk footer carousel — request 5)
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

  // Peralatan latihan untuk modal absensi (request 11)
  EQUIPMENT_INFO: {
    pemula: ['Pakaian renang', 'Kacamata renang', 'Papan pelampung'],
    lanjut: ['Pakaian renang', 'Kacamata renang', 'Papan pelampung', 'Pull buoy', 'Hand paddles', 'Fins (ukuran pendek)'],
    lain: ['Perlengkapan mandi untuk bilas'],
    tambahan: [
      'Awali & akhiri latihan dengan doa dan stretching',
      'Jeda makan besar ≥ 1 jam sebelum latihan; makan setelah latihan',
      'Bawa air minum (tidak dingin), disarankan air hangat'
    ]
  },

  // Rekomendasi pertanyaan keamanan (lupa password) — user boleh buat sendiri
  SECURITY_QUESTIONS: [
    'Nama guru favorit?',
    'Nama film favorit?',
    'Nama musisi favorit?',
    'Nama hewan peliharaan pertama?',
    'Kota tempat lahir ibu?',
    'Makanan favorit masa kecil?',
    'Nama sahabat masa kecil?'
  ],

  // Usia minimum
  MIN_AGE: 5
};

/**
 * Periode rapor berbasis semester (mengikuti pola sekolah formal).
 * Semester 1: 01 Jan – 30 Jun ; Semester 2: 01 Jul – 31 Des.
 * Tahun diambil dari tanggal mulai pelatihan (fallback: tahun berjalan).
 * @returns {{start:Date, end:Date, label:string}}
 */
function getSemesterPeriode(tanggalMulai) {
  const ref = tanggalMulai ? new Date(tanggalMulai) : new Date();
  const year = isNaN(ref.getTime()) ? new Date().getFullYear() : ref.getFullYear();
  const month = isNaN(ref.getTime()) ? new Date().getMonth() : ref.getMonth(); // 0-11
  const isSemester1 = month <= 5; // Jan(0)..Jun(5)
  const start = isSemester1 ? new Date(year, 0, 1)  : new Date(year, 6, 1);
  const end   = isSemester1 ? new Date(year, 5, 30) : new Date(year, 11, 31);
  return { start, end, label: isSemester1 ? 'Semester 1' : 'Semester 2' };
}