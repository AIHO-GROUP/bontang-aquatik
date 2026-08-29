-- =====================================================================
-- SKEMA SUPABASE — Bontang Akuatik Swimming Club
-- Migrasi dari Google Sheets -> Supabase (PostgreSQL)
-- =====================================================================
-- PENTING: Nama tabel & kolom SENGAJA memakai huruf besar/kecil yang
-- PERSIS SAMA dengan header Google Sheet (lihat SHEET_HEADERS di
-- backend/Code.gs lama). Karena PostgreSQL meng-lowercase identifier
-- yang tidak di-quote, SEMUA nama di sini memakai tanda kutip ganda
-- ("Nama_Kolom") agar Supabase API (PostgREST) mengembalikan JSON
-- dengan key yang PERSIS sama seperti yang dibaca frontend selama ini
-- (mis. peserta.Nama_Lengkap, row.Id_Peserta, dst).
-- JANGAN hapus tanda kutip ganda saat menjalankan script ini.
--
-- Tipe kolom: SEMUA bertipe TEXT kecuali 2 kolom yang terbukti (via
-- pengecekan source code BizUtil.isTrue / Utils.formatBool) SELALU
-- dibaca & ditulis sebagai boolean asli oleh frontend:
--   - Peserta.Status_Pembayaran
--   - Kehadiran.Status
-- Ini AMAN karena kedua helper tsb sudah menerima boolean asli maupun
-- string "TRUE"/"FALSE" (dari data lama), jadi tidak ada perubahan
-- perilaku sama sekali.
--
-- TIDAK ADA foreign key constraint yang ditambahkan secara sengaja:
-- Google Sheet lama TIDAK PERNAH memvalidasi relasi antar sheet (Code.gs
-- crudDelete tidak pernah cascade / block penghapusan meski masih
-- direferensikan sheet lain). Menambah FK constraint akan MENGUBAH
-- perilaku (operasi yang dulu sukses bisa gagal) — sehingga sengaja
-- TIDAK dilakukan agar 100% setara.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Peserta
-- ---------------------------------------------------------------------
create table if not exists "Peserta" (
  "Id_Peserta"        text primary key,
  "Nama_Lengkap"       text not null default '',
  "Username"           text not null default '',
  "Password"           text not null default '',
  "Nomor_Whatsapp"     text not null default '',
  "Jenis_Kelamin"      text not null default '',
  "Tempat_Lahir"       text not null default '',
  "Tanggal_Lahir"      text not null default '',
  "NISNAS"             text not null default '',
  "Asal_Sekolah"       text not null default '',
  "Kelas_Sekolah"      text not null default '',
  "Wali_Kelas"         text not null default '',
  "Kelompok_Umur"      text not null default '',
  "Kelas"              text not null default '',
  "Tanggal_Mulai"      text not null default '',
  "Tanggal_Akhir"      text not null default '',
  "Status_Pembayaran"  boolean not null default false,
  "Nomor_Peserta"      text not null default ''
);

-- ---------------------------------------------------------------------
-- 2) Jadwal
-- ---------------------------------------------------------------------
create table if not exists "Jadwal" (
  "Id_Jadwal"   text primary key,
  "Id_Pelatih"  text not null default '',
  "Id_Peserta"  text not null default '',
  "Tanggal"     text not null default '',
  "Pukul"       text not null default '',
  "Lokasi"      text not null default '',
  "Kelas"       text not null default '',
  "Status"      text not null default ''
);

-- ---------------------------------------------------------------------
-- 3) Kehadiran
-- ---------------------------------------------------------------------
create table if not exists "Kehadiran" (
  "Id_Kehadiran" text primary key,
  "Id_Jadwal"    text not null default '',
  "Id_Peserta"   text not null default '',
  "Status"       boolean not null default false,
  "Catatan"      text not null default ''
);

-- ---------------------------------------------------------------------
-- 4) Rapor
-- ---------------------------------------------------------------------
create table if not exists "Rapor" (
  "Id_Rapor"                        text primary key,
  "Id_Peserta"                      text not null default '',
  "Predikat"                        text not null default '',
  "Catatan"                         text not null default '',
  "Waktu_25_Bebas"                  text not null default '',
  "Waktu_25_Dada"                   text not null default '',
  "Waktu_25_Kupu"                   text not null default '',
  "Waktu_25_Punggung"               text not null default '',
  "Waktu_50_Bebas"                  text not null default '',
  "Waktu_50_Dada"                   text not null default '',
  "Waktu_50_Kupu"                   text not null default '',
  "Waktu_50_Punggung"               text not null default '',
  "Tanggal_Rapor"                   text not null default '',
  "Id_Pelatih"                      text not null default '',
  "Waktu_25_Bebas_Pelampung"        text not null default '',
  "Waktu_25_Dada_Pelampung"         text not null default '',
  "Waktu_25_Kupu_Pelampung"         text not null default '',
  "Waktu_25_Punggung_Pelampung"     text not null default ''
);

-- ---------------------------------------------------------------------
-- 5) Berita
-- ---------------------------------------------------------------------
create table if not exists "Berita" (
  "Id_Berita"   text primary key,
  "Judul"       text not null default '',
  "Tanggal"     text not null default '',
  "Deskripsi"   text not null default '',
  "Link"        text not null default '',
  "Status"      text not null default ''
);

-- ---------------------------------------------------------------------
-- 6) Pelatih
-- ---------------------------------------------------------------------
create table if not exists "Pelatih" (
  "Id_Pelatih"  text primary key,
  "Nama"        text not null default '',
  "Username"    text not null default '',
  "Password"    text not null default ''
);

-- ---------------------------------------------------------------------
-- 7) Settings — pengganti PropertiesService (key-value) dari Code.gs lama.
--    Dipakai untuk NOMOR_SEQ_AC & NOMOR_SEQ_B (nomor urut peserta).
-- ---------------------------------------------------------------------
create table if not exists "Settings" (
  "key"   text primary key,
  "value" text not null default ''
);

-- ---------------------------------------------------------------------
-- INDEX tambahan (murni untuk kecepatan baca, TIDAK mengubah perilaku
-- apa pun — index tidak terlihat oleh aplikasi/API).
-- ---------------------------------------------------------------------
create index if not exists idx_jadwal_id_peserta   on "Jadwal" ("Id_Peserta");
create index if not exists idx_jadwal_tanggal       on "Jadwal" ("Tanggal");
create index if not exists idx_kehadiran_id_jadwal  on "Kehadiran" ("Id_Jadwal");
create index if not exists idx_kehadiran_id_peserta on "Kehadiran" ("Id_Peserta");
create index if not exists idx_rapor_id_peserta     on "Rapor" ("Id_Peserta");
create index if not exists idx_peserta_username     on "Peserta" ("Username");
create index if not exists idx_pelatih_username     on "Pelatih" ("Username");

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
-- Aplikasi TIDAK memakai Supabase Auth (login diverifikasi manual di
-- business-logic.js terhadap tabel Peserta/Pelatih, memakai anon key
-- dari browser — persis seperti Apps Script Web App lama yang di-deploy
-- "Execute as Me, Access: Anyone", yaitu endpoint terbuka untuk siapa
-- pun yang tahu URL/key-nya).
--
-- Agar PERILAKU 100% SETARA dengan sistem lama (bukan lebih longgar,
-- bukan lebih ketat), RLS diaktifkan dengan policy yang mengizinkan
-- akses penuh (read/write) memakai anon key, sama seperti URL /exec
-- lama yang bisa diakses siapa saja.
--
-- ⚠️ CATATAN KEAMANAN (bukan bagian dari scope migrasi ini, hanya
-- transparansi risiko yang SUDAH ADA sejak sistem lama, bukan risiko
-- baru dari migrasi ini): Password peserta/pelatih tersimpan sebagai
-- teks polos (bukan hash) dan seluruh tabel Peserta ter-download penuh
-- ke browser setiap pengguna (agar mode offline berfungsi). Ini adalah
-- desain arsitektur asli, bukan sesuatu yang berubah karena migrasi.
-- Bila suatu saat ingin diperketat (mis. hash password, batasi field
-- yang ter-expose), itu perlu perubahan business logic — di luar scope
-- permintaan migrasi murni ini.
-- ---------------------------------------------------------------------
alter table "Peserta"   enable row level security;
alter table "Jadwal"    enable row level security;
alter table "Kehadiran" enable row level security;
alter table "Rapor"     enable row level security;
alter table "Berita"    enable row level security;
alter table "Pelatih"   enable row level security;
alter table "Settings"  enable row level security;

create policy "anon_full_access" on "Peserta"   for all using (true) with check (true);
create policy "anon_full_access" on "Jadwal"    for all using (true) with check (true);
create policy "anon_full_access" on "Kehadiran" for all using (true) with check (true);
create policy "anon_full_access" on "Rapor"     for all using (true) with check (true);
create policy "anon_full_access" on "Berita"    for all using (true) with check (true);
create policy "anon_full_access" on "Pelatih"   for all using (true) with check (true);
create policy "anon_full_access" on "Settings"  for all using (true) with check (true);
