# Panduan Migrasi: Google Apps Script → Supabase
### Bontang Akuatik Swimming Club

## Ringkasan Apa yang Berubah

| | Sebelum | Sesudah |
|---|---|---|
| Backend | Google Apps Script (`Code.gs`) → Google Sheet | Supabase (PostgreSQL) |
| Transport frontend | `assets/js/crud-api.js` → `fetch()` ke URL `/exec` | `assets/js/crud-api.js` → Supabase JS SDK |
| Tabel & kolom | 6 sheet (Peserta, Jadwal, Kehadiran, Rapor, Berita, Pelatih) | 6 tabel **nama & kolom identik** + 1 tabel baru `Settings` (pengganti `PropertiesService`) |
| Business logic (`business-logic.js`, `admin.js`, `peserta.js`, dll) | — | **TIDAK DIUBAH SAMA SEKALI** |
| Tampilan (HTML/CSS) | — | **TIDAK DIUBAH**, hanya ditambah 2 baris `<script>` |
| Mode offline (IndexedDB, Outbox, Service Worker) | — | **TIDAK DIUBAH**, tetap berfungsi penuh karena hanya bergantung pada interface `CrudApi`, bukan implementasinya |

**File yang diubah:** `config.js`, `crud-api.js`, `service-worker.js` (hanya nomor versi cache)
**File baru:** `supabase-client.js`
**File yang TIDAK disentuh:** seluruh 15 file JS lainnya, seluruh CSS, seluruh HTML (kecuali 2 baris `<script>` tambahan), `manifest.json`.

---

## Langkah 1 — Buat Project Supabase

1. Buka [supabase.com](https://supabase.com) → **New Project**.
2. Pilih region terdekat dari basis pengguna (mis. Singapore) agar latensi rendah.
3. Simpan **Database Password** yang dibuat (untuk akses langsung bila perlu nanti).
4. Tunggu project selesai provisioning (~2 menit).

## Langkah 2 — Jalankan Skema Database

1. Buka **SQL Editor** di dashboard Supabase.
2. Copy-paste seluruh isi `01_schema.sql` → **Run**.
   - Ini membuat 7 tabel (6 setara sheet + `Settings`), index, dan RLS policy.
3. Copy-paste seluruh isi `02_seed_data.sql` → **Run**.
   - Ini mengimpor **735 baris data lama Anda** (1 pelatih, 58 peserta, 508 jadwal, 168 kehadiran) — sheet Berita & Rapor kosong saat export sehingga tidak ada baris yang diimpor untuk keduanya (tabelnya tetap dibuat, siap dipakai).
   - Aman dijalankan berkali-kali (pakai `ON CONFLICT DO NOTHING`, tidak akan duplikat).
4. Verifikasi: buka **Table Editor**, cek jumlah baris tiap tabel sesuai tabel di atas.

## Langkah 3 — Ambil Kredensial API

1. Di dashboard Supabase → **Project Settings → API**.
2. Salin **Project URL** (mis. `https://xxxxxxxxxxxx.supabase.co`).
3. Salin **anon public key** (bukan `service_role` — kunci itu HARUS TETAP RAHASIA, jangan pernah dipakai di frontend).

## Langkah 4 — Isi `config.js`

Buka `assets/js/config.js`, isi 2 baris berikut dengan nilai dari Langkah 3:

```js
SUPABASE_URL: 'https://xxxxxxxxxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi....(anon key Anda)....',
```

## Langkah 5 — Deploy

Upload seluruh isi folder aplikasi (sudah termasuk semua perubahan) ke hosting Anda seperti biasa (GitHub Pages / domain `CNAME` yang sudah ada). Tidak ada langkah build tambahan — aplikasi ini pure static HTML/JS/CSS seperti sebelumnya.

> Catatan PWA: nomor versi `service-worker.js` sudah dinaikkan (`v1.1.0` → `v1.2.0`) supaya **pengguna lama yang sudah install PWA di HP mereka otomatis mendapat file JS baru** (yang menunjuk ke Supabase) dan tidak tersangkut memakai cache lama yang masih menunjuk ke Apps Script (yang sudah tidak dipakai). Ini penting agar transisi benar-benar mulus tanpa pengguna sadar ada perubahan.

---

## Checklist Pengujian Sebelum Go-Live

Jalankan semua ini di staging/localhost dulu sebelum mengarahkan pengguna asli:

- [ ] **Registrasi** peserta baru → cek muncul di tabel `Peserta` Supabase
- [ ] **Login** peserta lama (pakai salah satu akun dari data CSV lama, mis. username `Jelita`) — pastikan status pembayaran & data lain tampil benar
- [ ] **Login** admin (`admin` / `admin123`)
- [ ] Admin: tandai pembayaran lunas, edit data peserta, hapus peserta
- [ ] Admin: generate jadwal kelas otomatis (operasi *batch create*)
- [ ] Absensi (create Kehadiran), edit kehadiran, hapus kehadiran
- [ ] Buat/edit rapor, export PDF rapor
- [ ] Buat/edit berita
- [ ] **Mode offline**: matikan koneksi internet di browser DevTools → pastikan app tetap bisa dibuka & data lama tetap tampil (dari cache IndexedDB) → lakukan 1 perubahan (mis. edit profil) saat offline → nyalakan kembali internet → pastikan perubahan otomatis terkirim (Outbox flush)
- [ ] Buka dari 2 device berbeda bersamaan, pastikan data konsisten setelah refresh

---

## Catatan Desain & Keamanan (transparansi, bukan bagian scope migrasi)

Beberapa hal ini **sudah ada sejak sistem lama** (bukan risiko baru dari migrasi), dicatat di sini murni untuk transparansi profesional:

1. **Password tersimpan sebagai teks polos**, bukan hash — sama seperti sebelumnya di Google Sheet. Login diverifikasi langsung di frontend terhadap data yang sudah di-cache.
2. **Seluruh tabel `Peserta` ter-download ke browser setiap pengunjung** (termasuk semua password) — ini konsekuensi dari desain *offline-first* yang sudah ada (agar login & data bisa diakses tanpa internet), sama persis seperti sebelumnya saat data di-fetch penuh dari Apps Script.
3. RLS (Row Level Security) di Supabase sengaja dibuat **terbuka** (`anon` bisa read/write penuh) agar **perilaku 100% setara** dengan URL Apps Script lama yang juga bisa diakses siapa saja yang tahu URL-nya — bukan dibuat lebih longgar maupun lebih ketat.

Ketiganya **tidak diubah** dalam migrasi ini karena mengubahnya berarti mengubah *business logic* (di luar permintaan Anda). Jika suatu saat ingin diperketat (hash password, batasi data yang ter-expose ke publik, dsb.), itu proyek terpisah yang saya siap bantu — beri tahu saya kapan pun Anda siap.

## Rollback

Jika terjadi masalah, cukup kembalikan 3 file (`config.js`, `crud-api.js`, `service-worker.js`) dan hapus 1 file (`supabase-client.js` beserta 2 baris `<script>` di HTML) ke versi Apps Script lama — data di Google Sheet lama tidak disentuh sama sekali oleh proses migrasi ini, sehingga tetap bisa jadi fallback selama Anda belum menonaktifkan deployment Apps Script-nya.
