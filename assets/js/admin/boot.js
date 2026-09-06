/**
 * ===================================================================
 * admin/boot.js — Titik masuk panel admin
 * ===================================================================
 * Urutan yang disengaja:
 *   1. Penjagaan peran & visibilitas elemen khusus koordinator.
 *   2. Kerangka UI (tab atas + navigasi bawah) disiapkan lebih dulu.
 *   3. Render dari cache lokal supaya panel langsung terpakai walau
 *      jaringan lambat atau perangkat sedang offline.
 *   4. Pemeliharaan otomatis di latar belakang setelah data server tiba.
 */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireRole([CONFIG.ROLES.SUPERADMIN, CONFIG.ROLES.ADMIN])) return;

  Utils.mountNavbar('admin');
  Admin.applyRoleVisibility();
  Admin.setupTabs();
  Admin.buildBottomNav();

  // Rangka sementara agar layar tidak kosong saat cache dimuat.
  Admin.skeleton('tbody-peserta', 7, 6);
  Admin.skeleton('tbody-jadwal', 7, 6);
  Admin.skeleton('tbody-kehadiran', 7, 6);
  Admin.skeleton('tbody-rapor', 6, 5);
  Admin.skeleton('tbody-berita', 6, 4);

  AdminPeserta.init();
  AdminJadwal.init();
  AdminKehadiran.init();
  AdminRapor.init();
  AdminBerita.init();
  AdminPelatih.init();

  document.addEventListener('app:opensettings', () => AdminSettings.open());

  const entities = ['Peserta', 'Jadwal', 'Kehadiran', 'Rapor', 'Berita', 'Pelatih', 'Enrollment', '__settings__'];

  await Sync.init(entities, async () => {
    BizLogic.applyRuntimeSettings();
    // Peran bisa berubah sejak login terakhir (mis. dipromosikan koordinator).
    Admin.applyRoleVisibility();
    Admin.buildBottomNav();
    Admin.refreshAll();
    await runMaintenance();
  });

  BizLogic.applyRuntimeSettings();
  Admin.refreshAll();

  Utils.mountChangeNotice();
  Utils.mountPasswordNag();

  // Status sesi bergantung pada waktu berjalan; segarkan tampilan tiap menit.
  setInterval(() => {
    Admin.refresh(['jadwal']);
    Admin.renderTasks();
  }, 60000);
});

/**
 * Pemeliharaan otomatis yang menggantikan tugas cron di server:
 *   1. menyelaraskan pembayaran yang dikonfirmasi lewat aplikasi versi lama,
 *   2. menutup periode pelatihan yang sudah lewat,
 *   3. menambah jadwal berikutnya untuk periode panjang (top-up horizon).
 *
 * Urutannya disengaja: rekonsiliasi harus lebih dulu agar periode yang baru
 * diakui lunas ikut diperhitungkan oleh dua langkah berikutnya.
 *
 * Semuanya idempoten, hanya menambah/menaikkan status (tidak pernah mencabut
 * akses), dan berjalan diam-diam — kegagalan tidak mengganggu pemakaian panel.
 */
async function runMaintenance() {
  if (!navigator.onLine) return;
  try {
    const selaras = await BizLogic.reconcileLegacyPayments();
    const tutup = await BizLogic.closeExpiredEnrollments();
    const isi = await BizLogic.topUpSchedules();

    if (selaras.count || tutup.count || isi.count) {
      Admin.refresh(['peserta', 'jadwal']);
      const pesan = [];
      if (selaras.count) pesan.push(selaras.count + ' pembayaran diselaraskan');
      if (tutup.count) pesan.push(tutup.count + ' periode ditandai selesai');
      if (isi.count) pesan.push(isi.count + ' jadwal baru dibuat otomatis');
      UI.toast('Pemeliharaan otomatis: ' + pesan.join(' • '), 'info', { duration: 5000 });
    }
  } catch (err) {
    console.warn('[Admin] pemeliharaan otomatis gagal:', err);
  }
}
