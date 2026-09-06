# Bontang Akuatik Swimming Club — Aplikasi Web (PWA)

Aplikasi manajemen klub renang: pendaftaran peserta, periode pelatihan,
jadwal, absensi, rapor, dan informasi klub.

Arsitektur: **PWA statis** (GitHub Pages, domain `bontangaquatik.com`) dengan
**Supabase** sebagai database. Tidak ada server aplikasi sendiri — seluruh
business logic berjalan di perangkat pengguna terhadap cache lokal
(IndexedDB), sehingga aplikasi tetap responsif walau banyak pengguna membuka
bersamaan dan tetap berfungsi saat koneksi putus.

---

## 1. Struktur Kode

```
assets/js/
├── config.js              Konstanta lintas halaman (tanpa business logic)
├── supabase-client.js     Satu instance klien Supabase
│
├── lib/                   Modul murni, tanpa efek samping
│   ├── wita.js            Waktu operasional WITA (UTC+8) & format tanggal
│   ├── password.js        Kebijakan password + checklist real-time
│   ├── wa.js              Template pesan WhatsApp berisi identitas peserta
│   ├── numbering.js       Nomor peserta DDMMYY + urut 4 digit
│   ├── schedule-engine.js Aturan jadwal, pembuatan otomatis, status waktu
│   └── paginator.js       Pagination sisi frontend
│
├── db.js / crud-api.js / sync.js    Cache lokal & transport data
│
├── domain/                Business logic (dimuat berurutan)
│   ├── base.js            BizUtil, persist(), objek BizLogic
│   ├── people.js          Akun, identitas, periode pelatihan, peran
│   ├── training.js        Jadwal, absensi, rapor
│   └── content.js         Berita & pengaturan sistem
│
├── auth.js                Sesi, peran, izin, mode "lihat sebagai"
├── utils.js               Navbar, footer, banner, helper tampilan
├── components/ui.js       Toast, modal, skeleton, empty state
│
├── admin/                 Panel admin, satu modul per tab
│   ├── core.js  peserta.js  jadwal.js  kehadiran.js
│   ├── rapor.js  berita.js  pelatih.js  settings.js  boot.js
│
└── login.js  registrasi.js  peserta.js  profile.js
    forgot-password.js  update-password.js  home.js  pwa.js
```

**Urutan pemuatan script wajib**: `config → supabase-client → lib/* →
db/crud-api/sync → domain/base → domain/people → domain/training →
domain/content → auth → utils → components/ui → skrip halaman`.

---

## 2. Peran Pengguna

| Peran | Analogi | Wewenang |
|---|---|---|
| **superadmin** | Koordinator / pemilik klub | Akses penuh: konfirmasi pembayaran, ubah seluruh data peserta, kelola akun pelatih, delegasi jadwal, normalisasi nomor peserta, arsip rapor ZIP, pengaturan sistem, "lihat sebagai" pengguna lain |
| **admin** | Pelatih operasional | Melatih & menilai: jadwal, absensi, rapor, berita. **Tidak** dapat mengubah data diri peserta maupun status pembayaran |
| **peserta** | Pengguna akhir | Jadwal, absensi, rapor, profil, perpanjangan pelatihan |

Seluruh keputusan izin berada di satu tempat: `Auth.can(aksi)` di
`assets/js/auth.js`. UI dan business logic memakai fungsi yang sama, sehingga
tidak mungkin berbeda pendapat.

### Mode "lihat sebagai"
Koordinator **dan** pelatih dapat membuka dashboard peserta lewat tombol
di tab Peserta, untuk menelusuri keluhan tanpa meminta password peserta.
Mode ini **baca-saja**: mengubah profil, mengganti password, mencatat
absensi, dan mengajukan perpanjangan semuanya ditolak — di UI maupun di
business logic.

Alasannya dua. Pertama, tanpa itu pelatih bisa menembus larangan mengubah
data peserta hanya dengan menyamar. Kedua, perubahan yang dibuat sambil
menyamar akan tercatat seolah-olah dilakukan peserta sendiri. Untuk
mengubah data peserta, koordinator memakai panel admin sebagai dirinya.
Untuk mencatat kehadiran, pelatih memakai daftar hadir di tab Jadwal.

---

## 3. Keputusan Desain Penting

### Waktu selalu WITA
Peserta memakai perangkat dengan zona waktu berbeda-beda. Semua keputusan
berbasis waktu memakai `lib/wita.js` yang memetakan waktu ke jam dinding
WITA (UTC+8), sehingga sesi jam 16:00 terbuka pada detik yang sama di semua
perangkat. Tanggal disimpan sebagai string `YYYY-MM-DD` (bukan `date`) untuk
menghilangkan risiko pergeseran zona waktu saat data bolak-balik.

### Status jadwal dihitung, bukan disimpan
Sesi otomatis **Pending → Aktif (tepat jam mulai) → Selesai (+2 jam)** tanpa
cron server dan tanpa admin menekan tombol harian. Admin tetap dapat menimpa
lewat kolom `Status_Manual` (Aktif / Pending / Cancel), dan mengembalikannya
ke mode otomatis. Tidak ada penulisan berkala ke database.

### Satu orang = satu akun
Identitas peserta dikunci pada nama + tanggal lahir + WhatsApp. Peserta lama
yang ingin kembali **tidak** membuat akun baru; sistem menambahkan baris
`Enrollment` baru sehingga riwayat absensi dan rapor tetap menyatu.

### Pembayaran membatasi otorisasi, bukan autentikasi
Peserta yang belum lunas **tetap dapat masuk**. Yang dibatasi adalah akses
modul jadwal, yang menampilkan panel penjelasan + tombol WhatsApp berisi
identitas peserta.

### Password teks polos (disengaja)
Atas kebutuhan operasional klub, password disimpan apa adanya agar admin
dapat membacakannya kembali kepada orang tua peserta. Kebijakan kekuatan
password tetap ditegakkan. Konsekuensi keamanannya dicatat di `01_schema.sql`.

### Pagination murni frontend
Seluruh data sudah ada di cache lokal, jadi berpindah halaman, mengganti
jumlah baris (5/10/20/Semua), memfilter, dan berpindah tab **tidak
menghasilkan satu pun request database** — terverifikasi lewat pengujian.

---

## 4. Yang Harus Dilakukan Setelah Deploy

### a. Konfigurasi SMTP Supabase (WAJIB untuk reset password)
Reset password memakai kode OTP yang dikirim lewat Supabase Auth. SMTP bawaan
Supabase **hanya untuk pengembangan** (dibatasi beberapa email per jam), jadi
untuk 65+ peserta wajib memasang SMTP sendiri:

> Supabase Dashboard → **Project Settings → Authentication → SMTP Settings** →
> aktifkan *Custom SMTP* (mis. Resend, Brevo, atau Gmail SMTP) → isi host,
> port, user, password, dan alamat pengirim.

Selama SMTP belum dipasang, alur reset tetap aman: peserta diberi pesan yang
jelas dan tombol **Hubungi Admin via WhatsApp** sebagai jalur pemulihan
cadangan, sehingga tidak ada yang terkunci.

### b. Buat akun koordinator Anda sendiri
Agar tidak ada yang kehilangan akses saat rilis, akun `Muhtar` yang sudah ada
dipromosikan menjadi **koordinator (superadmin)**. Langkah berikutnya:

1. Masuk sebagai `Muhtar`.
2. Buka tab **Pelatih → Tambah Pelatih**, buat akun koordinator atas nama Anda.
3. Masuk dengan akun baru tersebut.
4. Turunkan peran `Muhtar` menjadi **Pelatih** bila sesuai pembagian tugas.

Nama penanda tangan rapor tetap **"Muhtar Efendi"** (sama seperti rapor
terdahulu) dan dapat diubah di **Pengaturan → Penandatangan Rapor**.

### c. Normalisasi nomor peserta
46 dari 65 peserta memiliki nomor warisan yang belum mengikuti format
`DDMMYY + 4 digit` (mis. `0`, `1107110228BA`, `15060600251baknr`). Sebuah
strip peringatan di tab Peserta menyediakan tombol **Normalisasi Sekarang**
yang menampilkan pratinjau sebelum/sesudah.

Ini **tidak** dijalankan otomatis, karena nomor lama mungkin sudah tercetak di
seragam. Nomor lama diarsipkan ke kolom `Nomor_Peserta_Legacy` dan tetap
terlihat pada detail peserta.

### d. Tinjau kandidat akun ganda
**Pengaturan → Kebersihan Data** menampilkan peserta dengan nama + tanggal
lahir sama (mis. beberapa akun atas nama orang yang sama pada data lama).
Sistem sengaja **tidak** menggabungkannya otomatis karena tiap akun bisa
menyimpan riwayat absensi berbeda — keputusan ada pada koordinator.

---

## 5. Basis Data

Struktur lengkap ada di [`01_schema.sql`](01_schema.sql). Tabel:
`Peserta`, `Enrollment`, `Jadwal`, `Kehadiran`, `Rapor`, `Berita`,
`Pelatih`, `Settings`, plus bucket penyimpanan `berita` untuk lampiran.

### Cadangan sebelum upgrade
Snapshot lengkap data sebelum perubahan tersimpan di schema **`backup_v1`**
(tabel `*_20260906`). Schema ini tidak di-expose ke API publik. Untuk
memulihkan satu tabel:

```sql
-- contoh pemulihan (jalankan lewat SQL Editor Supabase)
insert into "Peserta" select * from backup_v1."Peserta_20260906"
on conflict ("Id_Peserta") do nothing;
```

### Pemeliharaan otomatis
Saat panel koordinator dibuka, tiga tugas berjalan diam-diam dan idempoten
(pengganti cron server):

1. **Rekonsiliasi pembayaran warisan** — menyelaraskan periode pelatihan
   dengan kolom `Peserta.Status_Pembayaran` yang mungkin diubah lewat versi
   aplikasi lama.
2. **Penutupan periode** — periode yang sudah lewat ditandai `completed`.
3. **Top-up jadwal** — menambah jadwal berikutnya untuk pendaftaran berdurasi
   panjang, dibatasi horizon (default 120 hari) agar tabel tidak membengkak.

---

## 6. Pengembangan Lokal

```bash
python -m http.server 5173
```

Lalu buka `http://localhost:5173`. Konfigurasi ada di `.claude/launch.json`.

### Cache-busting saat rilis
Setiap `<script>` dan `<link>` memakai stempel rilis `?v=YYYYMMDD`.
**Naikkan stempel ini setiap kali men-deploy perubahan** agar pengguna PWA
langsung menerima kode terbaru:

```bash
# ganti stempel lama dengan tanggal rilis baru di seluruh berkas HTML
sed -i 's/?v=20260906e/?v=20260910/g' *.html
```

Naikkan juga `VERSION` di `service-worker.js` agar cache lama dibuang.
Service worker memakai *network-first* untuk HTML/JS/CSS sehingga perbaikan
logika selalu sampai ke pengguna, dan *cache-first* untuk gambar/font.
