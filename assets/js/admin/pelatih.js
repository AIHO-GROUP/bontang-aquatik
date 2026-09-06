/**
 * ===================================================================
 * admin/pelatih.js — Tab Pelatih (khusus koordinator)
 * ===================================================================
 * Koordinator mengelola akun pelatih operasional: menambah, mengubah,
 * menaikkan/menurunkan peran, menonaktifkan, serta melihat berapa banyak
 * sesi yang menjadi tanggung jawab masing-masing pelatih.
 *
 * Pengaman: klub harus selalu memiliki minimal satu koordinator aktif,
 * dan akun yang masih tertaut pada jadwal/rapor tidak dapat dihapus —
 * cukup dinonaktifkan agar riwayat pekerjaannya tetap utuh.
 */
const AdminPelatih = (function () {
  'use strict';

  const Icons = Admin.Icons;
  let cache = [];
  let pager = null;

  function load() {
    if (!Auth.isSuperadmin()) return;
    const res = BizLogic.getAllPelatih();
    if (!res.success) return;
    cache = res.data || [];
    applyFilters();
  }

  function applyFilters() {
    const q = (document.getElementById('search-pelatih')?.value || '').toLowerCase();
    const rows = cache.filter((p) =>
      !q || (p.Nama + ' ' + p.Username + ' ' + (p.Jabatan || '')).toLowerCase().includes(q));
    pager.setData(rows);
  }

  function render(rows) {
    if (!rows.length) { Admin.emptyRow('tbody-pelatih', 6, 'Belum ada akun pelatih'); return; }
    const meId = Auth.getId();

    document.getElementById('tbody-pelatih').innerHTML = rows.map((p) =>
      '<tr>' +
        '<td><div class="cell-primary">' + Utils.escapeHtml(p.Nama) +
          (p.Id_Pelatih === meId ? ' <span class="status-badge success">Anda</span>' : '') + '</div>' +
          '<div class="cell-sub">' + Utils.escapeHtml(p.Jabatan || '-') + '</div></td>' +
        '<td><code>' + Utils.escapeHtml(p.Username) + '</code>' +
          (p.password_lemah ? '<div class="cell-sub text-warning">password lemah</div>' : '') + '</td>' +
        '<td><span class="status-badge ' + (p.is_superadmin ? 'personal' : 'info') + '">' +
          CONFIG.ROLE_LABEL[p.Role] + '</span></td>' +
        '<td>' + p.jumlah_jadwal + ' sesi</td>' +
        '<td>' + (p.Aktif === false
          ? '<span class="status-badge danger">Nonaktif</span>'
          : '<span class="status-badge success">Aktif</span>') + '</td>' +
        '<td><div class="action-btns">' +
          '<button class="icon-btn edit" data-act="edit" data-id="' + p.Id_Pelatih + '" ' +
            'title="Ubah akun" aria-label="Ubah akun">' + Icons.pencil() + '</button>' +
          (p.Id_Pelatih !== meId
            ? '<button class="icon-btn view" data-act="masuk" data-id="' + p.Id_Pelatih + '" ' +
                'title="Lihat sebagai pelatih ini" aria-label="Lihat sebagai pelatih ini">' + Icons.swap() + '</button>' +
              '<button class="icon-btn delete" data-act="delete" data-id="' + p.Id_Pelatih + '" ' +
                'title="Hapus akun" aria-label="Hapus akun">' + Icons.trash() + '</button>'
            : '') +
        '</div></td>' +
      '</tr>').join('');
  }

  /* ---------------- Formulir ---------------- */
  function openEditor(id) {
    const p = id ? cache.find((x) => x.Id_Pelatih === id) : null;
    const isSelf = p && p.Id_Pelatih === Auth.getId();

    const roleOpts = [
      { v: CONFIG.ROLES.ADMIN, t: 'Pelatih — operasional di kolam' },
      { v: CONFIG.ROLES.SUPERADMIN, t: 'Koordinator — akses penuh' }
    ].map((o) => '<option value="' + o.v + '"' +
      ((p ? p.Role : CONFIG.ROLES.ADMIN) === o.v ? ' selected' : '') + '>' + o.t + '</option>').join('');

    const body =
      '<div class="form-grid-2">' +
        '<div class="form-group"><label for="pl-nama">Nama Lengkap *</label>' +
          '<input id="pl-nama" class="form-control" value="' + (p ? Utils.escapeHtml(p.Nama) : '') + '"></div>' +
        '<div class="form-group"><label for="pl-username">Username *</label>' +
          '<input id="pl-username" class="form-control" value="' + (p ? Utils.escapeHtml(p.Username) : '') + '"></div>' +
        '<div class="form-group"><label for="pl-jabatan">Jabatan</label>' +
          '<input id="pl-jabatan" class="form-control" value="' +
          (p ? Utils.escapeHtml(p.Jabatan || '') : 'Pelatih') + '"></div>' +
        '<div class="form-group"><label for="pl-role">Peran *</label>' +
          '<select id="pl-role" class="form-control"' + (isSelf ? ' disabled' : '') + '>' + roleOpts + '</select>' +
          (isSelf ? '<p class="form-helper">Anda tidak dapat mengubah peran akun sendiri.</p>' : '') + '</div>' +
        '<div class="form-group"><label for="pl-wa">Nomor WhatsApp</label>' +
          '<input id="pl-wa" class="form-control" inputmode="numeric" value="' +
          (p ? Utils.escapeHtml(p.Nomor_Whatsapp || '') : '') + '" placeholder="628xxxxxxxxxx"></div>' +
        '<div class="form-group"><label for="pl-email">Email</label>' +
          '<input id="pl-email" type="email" class="form-control" value="' +
          (p ? Utils.escapeHtml(p.Email || '') : '') + '"></div>' +
      '</div>' +
      '<div class="form-group"><label for="pl-password">Password ' +
        (p ? '<span class="text-muted">(kosongkan bila tidak diubah)</span>' : '*') + '</label>' +
        '<div class="password-wrap">' +
          '<input type="password" id="pl-password" class="form-control" autocomplete="new-password">' +
          '<button type="button" class="password-toggle" data-password-toggle="pl-password"></button>' +
        '</div>' +
        '<div class="pw-checklist" id="pl-checklist"' + (p ? ' hidden' : '') + '></div></div>' +
      (p && !isSelf
        ? '<label class="checkbox-row"><input type="checkbox" id="pl-aktif"' +
          (p.Aktif !== false ? ' checked' : '') + '><span>Akun aktif (dapat masuk aplikasi)</span></label>'
        : '');

    const m = UI.modal({
      title: p ? 'Ubah Akun Pelatih' : 'Tambah Akun Pelatih',
      size: 'md',
      body,
      actions: [{ label: 'Batal', variant: 'secondary' }]
    });

    UI.bindPasswordToggles(m.el);

    const pwInput = m.el.querySelector('#pl-password');
    const checklist = m.el.querySelector('#pl-checklist');
    if (p) pwInput.addEventListener('input', () => { checklist.hidden = pwInput.value.length === 0; });

    const guard = PasswordPolicy.attach({
      input: pwInput,
      checklist,
      usernameInput: m.el.querySelector('#pl-username')
    });

    const save = document.createElement('button');
    save.className = 'btn btn-primary btn-block';
    save.style.marginTop = '12px';
    save.textContent = p ? 'Simpan Perubahan' : 'Buat Akun';
    save.addEventListener('click', async () => {
      const payload = {
        nama: m.el.querySelector('#pl-nama').value.trim(),
        username: m.el.querySelector('#pl-username').value.trim(),
        jabatan: m.el.querySelector('#pl-jabatan').value.trim(),
        nomor_whatsapp: m.el.querySelector('#pl-wa').value.trim(),
        email: m.el.querySelector('#pl-email').value.trim()
      };
      if (!isSelf) payload.role = m.el.querySelector('#pl-role').value;

      const aktifEl = m.el.querySelector('#pl-aktif');
      if (aktifEl) payload.aktif = aktifEl.checked;

      const pw = pwInput.value;
      if (!p && !pw) { UI.toast('Password wajib diisi untuk akun baru', 'warning'); return; }
      if (pw) {
        if (!guard.isValid()) {
          UI.toast(PasswordPolicy.firstError(pw, payload.username), 'warning', { duration: 5000 });
          return;
        }
        payload.password = pw;
      }

      save.disabled = true;
      Utils.showLoader(true);
      const res = p
        ? await BizLogic.updatePelatih(Object.assign({ id }, payload))
        : await BizLogic.createPelatih(payload);
      Utils.showLoader(false);
      save.disabled = false;

      if (!res.success) { UI.toast(res.message, 'error', { duration: 5000 }); return; }
      UI.toast(res.message, 'success');
      m.close();
      Admin.refresh(['pelatih', 'jadwal', 'berita']);
    });
    m.el.querySelector('.modal-body').appendChild(save);
  }

  async function confirmRemove(id) {
    const p = cache.find((x) => x.Id_Pelatih === id);
    if (!p) return;

    const ok = await UI.confirm(
      'Hapus akun pelatih "' + p.Nama + '"? Akun ini tidak akan bisa masuk lagi.',
      { title: 'Hapus Akun Pelatih', confirmLabel: 'Ya, hapus', variant: 'danger' }
    );
    if (!ok) return;

    Utils.showLoader(true);
    const res = await BizLogic.deletePelatih({ id });
    Utils.showLoader(false);

    if (res.success) { UI.toast(res.message, 'success'); Admin.refresh('pelatih'); return; }

    if (res.code === 'HAS_REFERENCES') {
      const nonaktif = await UI.confirm(
        res.message + ' Nonaktifkan akun ini sebagai gantinya?',
        { title: 'Akun Masih Tertaut Data', confirmLabel: 'Ya, nonaktifkan', variant: 'primary' }
      );
      if (nonaktif) {
        const r = await BizLogic.updatePelatih({ id, aktif: false });
        UI.toast(r.message, r.success ? 'success' : 'error');
        Admin.refresh('pelatih');
      }
      return;
    }
    UI.toast(res.message, 'error');
  }

  /** Koordinator membuka panel sebagai pelatih tertentu. */
  async function loginAsPelatih(id) {
    const p = cache.find((x) => x.Id_Pelatih === id);
    if (!p) return;

    const ok = await UI.confirm(
      'Anda akan membuka panel sebagai ' + p.Nama + ' (' + CONFIG.ROLE_LABEL[p.Role] + '). ' +
      'Sebuah banner akan tampil selama mode ini aktif.',
      { title: 'Lihat Sebagai Pelatih', confirmLabel: 'Ya, lanjutkan', variant: 'primary' }
    );
    if (!ok) return;

    Auth.impersonate(p.Role === CONFIG.ROLES.SUPERADMIN ? CONFIG.ROLES.SUPERADMIN : CONFIG.ROLES.ADMIN, {
      id: p.Id_Pelatih,
      nama: p.Nama || p.Username,
      username: p.Username,
      jabatan: p.Jabatan || '',
      role: p.Role
    });
    window.location.reload();
  }

  function init() {
    pager = new Paginator({
      mountId: 'pager-pelatih',
      storageKey: 'pgsize_admin_pelatih',
      label: 'pelatih',
      onRender: render
    });

    const search = document.getElementById('search-pelatih');
    if (search) search.addEventListener('input', applyFilters);

    document.getElementById('btn-tambah-pelatih').addEventListener('click', () => openEditor(null));

    document.getElementById('tbody-pelatih').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'edit') return openEditor(btn.dataset.id);
      if (btn.dataset.act === 'delete') return confirmRemove(btn.dataset.id);
      if (btn.dataset.act === 'masuk') return loginAsPelatih(btn.dataset.id);
    });
  }

  return { init, load };
})();

Admin.register('pelatih', AdminPelatih);
