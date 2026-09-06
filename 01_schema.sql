-- =====================================================================
-- SKEMA SUPABASE — Bontang Akuatik Swimming Club (v2)
-- =====================================================================
-- Berkas ini adalah CERMIN dari struktur database yang sedang berjalan.
-- Berguna untuk membangun ulang project dari nol atau menyiapkan
-- lingkungan uji coba. Perubahan pada database produksi dilakukan lewat
-- migrasi bertahap (lihat riwayat migrasi di dashboard Supabase),
-- bukan dengan menjalankan ulang berkas ini.
--
-- CATATAN PENAMAAN
-- Nama tabel & kolom memakai huruf besar/kecil PERSIS seperti header
-- Google Sheet asli. PostgreSQL meng-lowercase identifier yang tidak
-- di-quote, jadi SEMUA nama di sini memakai tanda kutip ganda agar
-- PostgREST mengembalikan JSON dengan key yang sama seperti yang dibaca
-- frontend (mis. peserta.Nama_Lengkap). JANGAN hapus tanda kutipnya.
--
-- CATATAN TIPE DATA
-- Kolom tanggal disimpan sebagai TEXT ber-format 'YYYY-MM-DD'. Ini
-- warisan migrasi dari Google Sheets yang sengaja dipertahankan agar
-- tidak ada risiko pergeseran zona waktu saat data bolak-balik antara
-- browser (WITA/WIB/WIT) dan server (UTC). Seluruh perbandingan tanggal
-- dilakukan sebagai string ISO yang urutannya identik dengan urutan
-- kronologis. Lihat assets/js/lib/wita.js.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Peserta — satu baris = satu orang = satu akun
-- ---------------------------------------------------------------------
create table if not exists "Peserta" (
  "Id_Peserta"            text primary key,
  "Nama_Lengkap"          text not null default '',
  "Username"              text not null default '',
  "Password"              text not null default '',   -- teks polos, disengaja (lihat catatan bawah)
  "Email"                 text not null default '',   -- kanal OTP pemulihan akun
  "Nomor_Whatsapp"        text not null default '',
  "Jenis_Kelamin"         text not null default '',
  "Tempat_Lahir"          text not null default '',
  "Tanggal_Lahir"         text not null default '',
  "NISNAS"                text not null default '',
  "Asal_Sekolah"          text not null default '',
  "Kelas_Sekolah"         text not null default '',
  "Wali_Kelas"            text not null default '',
  "Kelompok_Umur"         text not null default '',
  -- Kolom cermin dari periode pelatihan yang sedang berjalan. Sumber
  -- kebenarannya ada di tabel "Enrollment"; kolom ini dipertahankan agar
  -- seluruh laporan & tampilan lama tetap berfungsi tanpa perubahan.
  "Kelas"                 text not null default '',
  "Tanggal_Mulai"         text not null default '',
  "Tanggal_Akhir"         text not null default '',
  "Status_Pembayaran"     boolean not null default false,
  -- Nomor peserta: DDMMYY (dari tanggal lahir) + nomor urut 4 digit.
  "Nomor_Peserta"         text not null default '',
  "Nomor_Urut"            integer,
  "Nomor_Peserta_Legacy"  text not null default '',   -- arsip nomor lama pra-normalisasi
  "Auth_User_Id"          uuid,                       -- tautan opsional ke Supabase Auth
  "Password_Updated_At"   timestamptz,
  "Status_Akun"           text not null default 'active',   -- active | nonaktif
  "Created_At"            timestamptz not null default now(),
  "Updated_At"            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) Enrollment — riwayat periode pelatihan
--    Peserta yang berhenti lalu bergabung kembali TIDAK membuat akun
--    baru; cukup satu baris Enrollment baru, sehingga riwayat absensi
--    dan rapor tetap menempel pada satu identitas.
-- ---------------------------------------------------------------------
create table if not exists "Enrollment" (
  "Id_Enrollment"     text primary key,
  "Id_Peserta"        text not null,
  "Kelas"             text not null default '',
  "Tanggal_Mulai"     text not null default '',
  "Tanggal_Akhir"     text not null default '',
  "Durasi_Bulan"      integer not null default 0,
  "Status"            text not null default 'pending',
  "Status_Pembayaran" boolean not null default false,
  "Urutan"            integer not null default 1,
  "Catatan"           text not null default '',
  "Dibuat_Oleh"       text not null default '',
  "Created_At"        timestamptz not null default now(),
  "Updated_At"        timestamptz not null default now(),
  constraint enrollment_status_check
    check ("Status" in ('pending', 'active', 'completed', 'paused', 'rejoined'))
);

-- ---------------------------------------------------------------------
-- 3) Jadwal — satu baris = satu sesi latihan
--    Status sesi TIDAK disimpan sebagai kebenaran; ia dihitung dari
--    Tanggal + Jam_Mulai + Durasi_Menit terhadap jam dinding WITA
--    (lihat assets/js/lib/schedule-engine.js). Status_Manual dipakai
--    hanya bila admin sengaja menimpa hasil hitungan itu.
-- ---------------------------------------------------------------------
create table if not exists "Jadwal" (
  "Id_Jadwal"     text primary key,
  "Id_Pelatih"    text not null default '',   -- pelatih penanggung jawab (delegasi)
  "Id_Peserta"    text not null default '',   -- terisi -> jadwal personal
  "Id_Enrollment" text not null default '',
  "Tanggal"       text not null default '',
  "Pukul"         text not null default '',   -- label tampilan, mis. '16:00 - 18:00'
  "Jam_Mulai"     text not null default '',   -- 'HH:MM' WITA, dipakai mesin
  "Durasi_Menit"  integer not null default 120,
  "Lokasi"        text not null default '',
  "Kelas"         text not null default '',
  "Status"        text not null default '',   -- cermin kompatibilitas untuk klien lama
  "Status_Manual" text not null default '',   -- '' | Aktif | Pending | Cancel
  "Created_At"    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4) Kehadiran
-- ---------------------------------------------------------------------
create table if not exists "Kehadiran" (
  "Id_Kehadiran" text primary key,
  "Id_Jadwal"    text not null default '',
  "Id_Peserta"   text not null default '',
  "Status"       boolean not null default false,   -- true = hadir, false = izin
  "Catatan"      text not null default ''
);

-- ---------------------------------------------------------------------
-- 5) Rapor
-- ---------------------------------------------------------------------
create table if not exists "Rapor" (
  "Id_Rapor"                    text primary key,
  "Id_Peserta"                  text not null default '',
  "Predikat"                    text not null default '',
  "Catatan"                     text not null default '',
  "Waktu_25_Bebas"              text not null default '',
  "Waktu_25_Dada"               text not null default '',
  "Waktu_25_Kupu"               text not null default '',
  "Waktu_25_Punggung"           text not null default '',
  "Waktu_50_Bebas"              text not null default '',
  "Waktu_50_Dada"               text not null default '',
  "Waktu_50_Kupu"               text not null default '',
  "Waktu_50_Punggung"           text not null default '',
  "Waktu_25_Bebas_Pelampung"    text not null default '',
  "Waktu_25_Dada_Pelampung"     text not null default '',
  "Waktu_25_Kupu_Pelampung"     text not null default '',
  "Waktu_25_Punggung_Pelampung" text not null default '',
  "Tanggal_Rapor"               text not null default '',
  "Id_Pelatih"                  text not null default ''   -- pemberi nilai, BUKAN penanda tangan
);

-- ---------------------------------------------------------------------
-- 6) Berita — dengan jejak penulis & lampiran berkas
-- ---------------------------------------------------------------------
create table if not exists "Berita" (
  "Id_Berita"     text primary key,
  "Judul"         text not null default '',
  "Tanggal"       text not null default '',
  "Deskripsi"     text not null default '',
  "Link"          text not null default '',
  "Status"        text not null default '',   -- Publik | Semua Peserta | Peserta Grup X
  "Id_Pelatih"    text not null default '',
  "Nama_Penulis"  text not null default '',   -- snapshot, tetap terbaca meski akun dihapus
  "Peran_Penulis" text not null default '',
  "File_Url"      text not null default '',
  "File_Nama"     text not null default '',
  "File_Tipe"     text not null default '',
  "File_Ukuran"   bigint not null default 0,
  "Created_At"    timestamptz not null default now(),
  "Updated_At"    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7) Pelatih — akun internal: koordinator (superadmin) & pelatih (admin)
-- ---------------------------------------------------------------------
create table if not exists "Pelatih" (
  "Id_Pelatih"     text primary key,
  "Nama"           text not null default '',
  "Username"       text not null default '',
  "Password"       text not null default '',
  "Role"           text not null default 'admin',
  "Jabatan"        text not null default 'Pelatih',
  "Nomor_Whatsapp" text not null default '',
  "Email"          text not null default '',
  "Aktif"          boolean not null default true,
  "Auth_User_Id"   uuid,
  "Created_At"     timestamptz not null default now(),
  "Updated_At"     timestamptz not null default now(),
  constraint pelatih_role_check check ("Role" in ('superadmin', 'admin'))
);

-- ---------------------------------------------------------------------
-- 8) Settings — key-value untuk konfigurasi operasional
--    NOMOR_SEQ              nomor urut peserta terakhir yang dipakai
--    RAPOR_SIGNER_ID        koordinator penanda tangan rapor
--    RAPOR_SIGNER_NAMA      cadangan nama bila akun penanda tangan kosong
--    RAPOR_SIGNER_JABATAN   jabatan yang dicetak di rapor
--    JADWAL_HORIZON_HARI    batas pembuatan jadwal otomatis ke depan
--    SESI_DURASI_MENIT      lama absensi terbuka sejak jam mulai
--    APP_NOTICE_VERSION     versi banner pemberitahuan perubahan sistem
-- ---------------------------------------------------------------------
create table if not exists "Settings" (
  "key"   text primary key,
  "value" text not null default ''
);


-- ---------------------------------------------------------------------
-- INDEX — murni untuk kecepatan baca, tidak mengubah perilaku aplikasi.
-- ---------------------------------------------------------------------
create index if not exists idx_peserta_username     on "Peserta" ("Username");
create index if not exists idx_peserta_created_at   on "Peserta" ("Created_At");
create index if not exists idx_peserta_nomor_urut   on "Peserta" ("Nomor_Urut");
create index if not exists idx_peserta_email        on "Peserta" ("Email");
create index if not exists idx_peserta_auth_user    on "Peserta" ("Auth_User_Id");

create index if not exists idx_enrollment_peserta   on "Enrollment" ("Id_Peserta");
create index if not exists idx_enrollment_status    on "Enrollment" ("Status");

create index if not exists idx_jadwal_id_peserta    on "Jadwal" ("Id_Peserta");
create index if not exists idx_jadwal_tanggal       on "Jadwal" ("Tanggal");
create index if not exists idx_jadwal_kelas         on "Jadwal" ("Kelas");
create index if not exists idx_jadwal_pelatih       on "Jadwal" ("Id_Pelatih");
create index if not exists idx_jadwal_kelas_tgl     on "Jadwal" ("Kelas", "Tanggal");

create index if not exists idx_kehadiran_id_jadwal  on "Kehadiran" ("Id_Jadwal");
create index if not exists idx_kehadiran_id_peserta on "Kehadiran" ("Id_Peserta");

create index if not exists idx_rapor_id_peserta     on "Rapor" ("Id_Peserta");
create index if not exists idx_berita_pelatih       on "Berita" ("Id_Pelatih");
create index if not exists idx_berita_tanggal       on "Berita" ("Tanggal");
create index if not exists idx_pelatih_username     on "Pelatih" ("Username");
create index if not exists idx_pelatih_role         on "Pelatih" ("Role");


-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
-- Aplikasi ini adalah PWA statis tanpa server sendiri: seluruh business
-- logic berjalan di perangkat pengguna terhadap Supabase memakai anon key.
-- Pembagian wewenang (koordinator / pelatih / peserta) ditegakkan di
-- lapisan aplikasi (lihat assets/js/auth.js -> Auth.can).
--
-- ⚠️ TRANSPARANSI RISIKO — bukan hal baru, melainkan konsekuensi desain
-- yang sudah ada sejak aplikasi ini berdiri dan sengaja dipertahankan
-- atas permintaan operasional klub:
--   • Password disimpan sebagai TEKS POLOS agar admin dapat membacakan
--     ulang password kepada orang tua peserta lewat telepon.
--   • Policy di bawah memberi akses penuh kepada anon key, sehingga
--     siapa pun yang memiliki URL + anon key secara teknis dapat membaca
--     seluruh tabel — sama seperti endpoint Apps Script /exec lama yang
--     di-deploy dengan akses "Anyone".
-- Bila suatu saat ingin diperketat, langkah pertamanya adalah memindahkan
-- autentikasi sepenuhnya ke Supabase Auth lalu mengganti policy di bawah
-- dengan aturan berbasis auth.uid(). Itu memerlukan penghentian
-- penyimpanan password teks polos.
-- ---------------------------------------------------------------------
alter table "Peserta"    enable row level security;
alter table "Enrollment" enable row level security;
alter table "Jadwal"     enable row level security;
alter table "Kehadiran"  enable row level security;
alter table "Rapor"      enable row level security;
alter table "Berita"     enable row level security;
alter table "Pelatih"    enable row level security;
alter table "Settings"   enable row level security;

create policy "anon_full_access" on "Peserta"    for all using (true) with check (true);
create policy "anon_full_access" on "Enrollment" for all using (true) with check (true);
create policy "anon_full_access" on "Jadwal"     for all using (true) with check (true);
create policy "anon_full_access" on "Kehadiran"  for all using (true) with check (true);
create policy "anon_full_access" on "Rapor"      for all using (true) with check (true);
create policy "anon_full_access" on "Berita"     for all using (true) with check (true);
create policy "anon_full_access" on "Pelatih"    for all using (true) with check (true);
create policy "anon_full_access" on "Settings"   for all using (true) with check (true);


-- ---------------------------------------------------------------------
-- PENYIMPANAN BERKAS — lampiran berita
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'berita', 'berita', true, 10485760,
  array[
    'image/jpeg', 'image/jpg', 'image/png', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint'
  ]
)
on conflict (id) do update
   set public             = excluded.public,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

create policy "berita_public_read"  on storage.objects for select using (bucket_id = 'berita');
create policy "berita_anon_write"   on storage.objects for insert with check (bucket_id = 'berita');
create policy "berita_anon_update"  on storage.objects for update using (bucket_id = 'berita') with check (bucket_id = 'berita');
create policy "berita_anon_delete"  on storage.objects for delete using (bucket_id = 'berita');
