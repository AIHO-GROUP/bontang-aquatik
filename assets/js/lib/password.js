/**
 * ===================================================================
 * password.js — Kebijakan & validasi password
 * ===================================================================
 * Satu sumber kebenaran untuk aturan password di SELURUH aplikasi
 * (registrasi, profil, reset password, admin membuat akun pelatih).
 *
 * Setiap aturan divalidasi memakai regular expression / string matching
 * pada input password dan dibandingkan dengan username secara real-time,
 * sehingga tombol submit hanya aktif ketika semua syarat terpenuhi.
 *
 * Catatan arsitektur: password memang disimpan sebagai teks polos di
 * database atas permintaan operasional klub (admin perlu bisa membacakan
 * password ke orang tua peserta lewat telepon). Kebijakan kekuatan
 * password di sini adalah lapisan perlindungan yang tetap kita terapkan.
 */
const PasswordPolicy = (function () {
  'use strict';

  const POLICY = (typeof CONFIG !== 'undefined' && CONFIG.PASSWORD_POLICY) || {
    minLength: 6, requireUppercase: true, requireNumber: true,
    requireSymbol: true, forbidUsername: true
  };

  /**
   * Daftar aturan. Setiap aturan punya id, label yang dibaca pengguna, dan
   * fungsi test(password, username) -> boolean.
   */
  const RULES = [
    {
      id: 'length',
      label: 'Minimal ' + POLICY.minLength + ' karakter',
      enabled: true,
      test: (pw) => String(pw || '').length >= POLICY.minLength
    },
    {
      id: 'uppercase',
      label: 'Mengandung huruf kapital (A-Z)',
      enabled: POLICY.requireUppercase !== false,
      test: (pw) => /[A-Z]/.test(String(pw || ''))
    },
    {
      id: 'number',
      label: 'Mengandung angka (0-9)',
      enabled: POLICY.requireNumber !== false,
      test: (pw) => /[0-9]/.test(String(pw || ''))
    },
    {
      id: 'symbol',
      label: 'Mengandung karakter unik (!@#$%&*...)',
      enabled: POLICY.requireSymbol !== false,
      test: (pw) => /[^A-Za-z0-9]/.test(String(pw || ''))
    },
    {
      id: 'not-username',
      label: 'Tidak mengandung username Anda',
      enabled: POLICY.forbidUsername !== false,
      test: (pw, username) => {
        const p = String(pw || '').toLowerCase();
        const u = String(username || '').trim().toLowerCase();
        if (!p) return false;
        if (!u) return true;                 // belum ada username untuk dibandingkan
        if (u.length < 3) return p !== u;    // username sangat pendek: cukup cek sama persis
        return !p.includes(u);
      }
    }
  ].filter((r) => r.enabled);

  /**
   * Evaluasi password terhadap seluruh aturan.
   * @returns {{valid:boolean, results:Array<{id,label,passed}>, passedCount:number, total:number, score:number}}
   */
  function evaluate(password, username) {
    const results = RULES.map((r) => ({
      id: r.id,
      label: r.label,
      passed: !!r.test(password, username)
    }));
    const passedCount = results.filter((r) => r.passed).length;
    return {
      results,
      passedCount,
      total: results.length,
      valid: passedCount === results.length,
      score: results.length ? Math.round((passedCount / results.length) * 100) : 0
    };
  }

  /** Pesan singkat untuk toast/alert ketika password ditolak. */
  function firstError(password, username) {
    const failed = evaluate(password, username).results.filter((r) => !r.passed);
    return failed.length ? failed[0].label : '';
  }

  /**
   * Apakah password ini memenuhi standar baru? Dipakai untuk mendeteksi
   * akun lama yang perlu diminta memperbarui password.
   */
  function isStrong(password, username) {
    return evaluate(password, username).valid;
  }

  function strengthLabel(score) {
    if (score >= 100) return { text: 'Kuat', tone: 'strong' };
    if (score >= 60)  return { text: 'Sedang', tone: 'medium' };
    if (score > 0)    return { text: 'Lemah', tone: 'weak' };
    return { text: '', tone: 'empty' };
  }

  /* =================================================================
     CHECKLIST REAL-TIME
     Menghubungkan sebuah <input type=password> ke elemen checklist.
     Checklist menampilkan centang hijau saat syarat terpenuhi dan
     status abu-abu saat belum, diperbarui pada setiap ketikan.
     ================================================================= */

  const CHECK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" class="pw-rule__icon"><path d="M20 6L9 17l-5-5"/></svg>';
  const DOT_ICON   = '<svg viewBox="0 0 24 24" aria-hidden="true" class="pw-rule__icon"><circle cx="12" cy="12" r="4"/></svg>';

  function renderChecklist(container, evaluation) {
    container.innerHTML =
      '<div class="pw-meter" aria-hidden="true"><div class="pw-meter__bar" style="width:' +
        evaluation.score + '%"></div></div>' +
      '<ul class="pw-rules">' +
      evaluation.results.map((r) =>
        '<li class="pw-rule ' + (r.passed ? 'is-passed' : 'is-pending') + '">' +
          (r.passed ? CHECK_ICON : DOT_ICON) +
          '<span>' + r.label + '</span>' +
        '</li>').join('') +
      '</ul>';
    container.dataset.valid = evaluation.valid ? '1' : '0';
    container.classList.toggle('is-valid', evaluation.valid);
  }

  /**
   * @param {object} opts
   *   input       : HTMLInputElement password (wajib)
   *   checklist   : container checklist (wajib)
   *   usernameInput / usernameValue : sumber username untuk aturan "tidak mengandung username"
   *   confirmInput: input konfirmasi password (opsional)
   *   submitButton: tombol yang di-disable sampai semua syarat terpenuhi (opsional)
   *   onChange    : callback(evaluation, matches)
   * @returns {{ evaluate: function, isValid: function, destroy: function }}
   */
  function attach(opts) {
    const input = opts.input;
    const checklist = opts.checklist;
    if (!input || !checklist) return { evaluate: () => evaluate(''), isValid: () => false, destroy() {} };

    const getUsername = () => {
      if (typeof opts.usernameValue === 'function') return opts.usernameValue();
      if (opts.usernameInput) return opts.usernameInput.value;
      return opts.usernameValue || '';
    };

    let matchNode = null;
    if (opts.confirmInput) {
      matchNode = document.createElement('div');
      matchNode.className = 'pw-match';
      checklist.insertAdjacentElement('afterend', matchNode);
    }

    function run() {
      const ev = evaluate(input.value, getUsername());
      renderChecklist(checklist, ev);

      let matches = true;
      if (opts.confirmInput) {
        const c = opts.confirmInput.value;
        matches = c.length > 0 && c === input.value;
        if (!c) {
          matchNode.textContent = '';
          matchNode.className = 'pw-match';
        } else if (matches) {
          matchNode.textContent = 'Konfirmasi password cocok';
          matchNode.className = 'pw-match is-ok';
        } else {
          matchNode.textContent = 'Konfirmasi password belum cocok';
          matchNode.className = 'pw-match is-bad';
        }
      }

      if (opts.submitButton) {
        const ok = ev.valid && (!opts.confirmInput || matches);
        opts.submitButton.disabled = !ok;
        opts.submitButton.classList.toggle('is-disabled', !ok);
      }
      if (typeof opts.onChange === 'function') opts.onChange(ev, matches);
      return ev;
    }

    input.addEventListener('input', run);
    if (opts.confirmInput) opts.confirmInput.addEventListener('input', run);
    if (opts.usernameInput) opts.usernameInput.addEventListener('input', run);
    run();

    return {
      evaluate: () => evaluate(input.value, getUsername()),
      isValid: () => {
        const ev = evaluate(input.value, getUsername());
        if (!ev.valid) return false;
        if (opts.confirmInput) return opts.confirmInput.value === input.value;
        return true;
      },
      refresh: run,
      destroy() {
        input.removeEventListener('input', run);
        if (opts.confirmInput) opts.confirmInput.removeEventListener('input', run);
        if (opts.usernameInput) opts.usernameInput.removeEventListener('input', run);
      }
    };
  }

  return { RULES, POLICY, evaluate, firstError, isStrong, strengthLabel, attach, renderChecklist };
})();
