/**
 * login.js — Halaman masuk
 *
 * Autentikasi dilakukan sepenuhnya terhadap cache lokal: data Peserta,
 * Pelatih, dan Enrollment disinkronkan lebih dulu, lalu username/password
 * dicocokkan di perangkat (lihat BizLogic.login). Tidak ada request login
 * per percobaan, sehingga tetap cepat walau banyak pengguna bersamaan.
 *
 * PERUBAHAN KEBIJAKAN: peserta dengan pembayaran belum lunas kini TETAP
 * dapat masuk. Pembatasan dipindahkan ke akses jadwal di dashboard.
 */
document.addEventListener('DOMContentLoaded', async () => {
  Utils.mountNavbar('login');

  // Sudah punya sesi -> langsung ke dashboard yang sesuai perannya.
  const session = Auth.getSession();
  if (session) {
    window.location.replace(Auth.homeFor(session.role));
    return;
  }

  const form = document.getElementById('form-login');
  const btn = form.querySelector('button[type="submit"]');
  const status = document.getElementById('login-status');

  // Data login belum tersedia sampai sinkronisasi pertama selesai.
  let siap = false;
  const setSiap = (v) => {
    siap = v;
    btn.disabled = !v;
    if (status) status.textContent = v ? '' : 'Menyiapkan data…';
  };
  setSiap(false);

  await Sync.init(['Peserta', 'Pelatih', 'Enrollment'], () => setSiap(true));
  // Cache lokal sudah cukup untuk login walau sinkronisasi server tertunda.
  if (Store.peserta().length || Store.pelatih().length) setSiap(true);
  // Perangkat baru & offline: beri tahu, jangan biarkan tombol mati selamanya.
  setTimeout(() => {
    if (!siap) {
      setSiap(true);
      if (!navigator.onLine) UI.toast('Anda sedang offline. Login hanya bisa untuk akun yang pernah masuk di perangkat ini.', 'warning');
    }
  }, 6000);

  const passInput = document.getElementById('password');
  const passToggle = document.getElementById('togglePassword');
  if (passInput && passToggle) UI.passwordToggle(passInput, passToggle);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      username: String(fd.get('username') || '').trim(),
      password: String(fd.get('password') || '')
    };
    if (!data.username || !data.password) {
      UI.toast('Username dan password wajib diisi', 'warning');
      return;
    }

    btn.disabled = true;
    const res = BizLogic.login(data);
    btn.disabled = false;

    if (!res.success) {
      UI.toast(res.message || 'Login gagal', 'error');
      return;
    }

    Auth.setSession(res.role, res.data);
    UI.toast('Selamat datang, ' + (res.data.nama || res.data.username) + '!', 'success');
    setTimeout(() => { window.location.href = Auth.homeFor(res.role); }, 600);
  });
});
