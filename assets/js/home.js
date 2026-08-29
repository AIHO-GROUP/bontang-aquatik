document.addEventListener('DOMContentLoaded', async () => {
  Utils.mountNavbar('home');
  initHeroFX();
  renderScheduleSection();
  await Sync.init(['Berita']);
  loadBerita();
  Utils.mountFooter();

  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });

  document.querySelectorAll('[data-wa]').forEach(a => {
    a.href = Utils.waLink(CONFIG.CONTACT.whatsapp, 'Halo Bontang Akuatik, saya tertarik untuk bergabung kelas pelatihan renang. Mohon informasinya.');
  });
});

/* ===================== HERO FX: gelembung + mouse-follow ===================== */
function initHeroFX() {
  const hero = document.getElementById('hero');
  if (!hero) return;
  const bubbles = document.getElementById('hero-bubbles');
  // Gelembung putih ambient (background tidak terkesan solid)
  if (bubbles) {
    let html = '';
    for (let i = 0; i < 16; i++) {
      const size  = (10 + Math.random() * 46).toFixed(0);
      const left  = (Math.random() * 100).toFixed(2);
      const dur   = (7 + Math.random() * 10).toFixed(1);
      const delay = (Math.random() * 12).toFixed(1);
      const drift = (Math.random() * 60 - 30).toFixed(0);
      html += `<span class="bubble" style="width:${size}px;height:${size}px;left:${left}%;` +
              `animation-duration:${dur}s;animation-delay:-${delay}s;--drift:${drift}px;"></span>`;
    }
    bubbles.innerHTML = html;
  }
  // Efek selalu aktif (mengabaikan preferensi reduced-motion atas permintaan)
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = null, started = false, lastSpawn = 0;
  const loop = () => {
    cx += (tx - cx) * 0.15;
    cy += (ty - cy) * 0.15;
    if (bubbles) {
      const r = hero.getBoundingClientRect();
      const dx = (cx - r.width / 2) / r.width;
      const dy = (cy - r.height / 2) / r.height;
      bubbles.style.transform = `translate3d(${dx * -26}px, ${dy * -18}px, 0)`;
    }
    raf = (Math.abs(tx - cx) > 0.4 || Math.abs(ty - cy) > 0.4)
      ? requestAnimationFrame(loop) : null;
  };
  // Lahirkan gelembung kecil di posisi kursor
  const spawnBubble = (x, y) => {
    const b = document.createElement('span');
    b.className = 'cursor-bubble';
    const size = 25 + Math.random() * 16;
    b.style.left   = (x + (Math.random() * 24 - 12)) + 'px';
    b.style.top    = y + 'px';
    b.style.width  = size + 'px';
    b.style.height = size + 'px';
    hero.appendChild(b);
    setTimeout(() => b.remove(), 1200);
  };
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    tx = e.clientX - r.left;
    ty = e.clientY - r.top;
    if (!started) { started = true; cx = tx; cy = ty; }
    if (!raf) raf = requestAnimationFrame(loop);
    const now = performance.now();
    if (now - lastSpawn > 90) { lastSpawn = now; spawnBubble(tx, ty); }
  });
}

/* ===================== JADWAL LATIHAN (KIDS-FRIENDLY) ===================== */
function renderScheduleSection() {
  const container = document.getElementById('schedule-grid');
  if (!container) return;
  const dayEmoji = {
    'Senin': '🌅', 'Selasa': '☀️', 'Rabu': '🌤️',
    'Kamis': '⛅', 'Jumat': '🌟', 'Sabtu': '🎉', 'Minggu': '🌈'
  };
  container.innerHTML = Object.entries(CONFIG.WEEKLY_SCHEDULE).map(([nama, sesi]) => {
    const detail = CONFIG.KELAS_DETAIL[nama];
    return `
      <div class="team-card team-${detail.color} ${detail.recommended ? 'team-recommended' : ''}">
        ${detail.recommended ? '<div class="team-ribbon">🏆 FAVORIT</div>' : ''}
        <div class="team-mascot-big">${detail.mascot}</div>
        <h3 class="team-name">${detail.mascot_name}</h3>
        <div class="team-grup">${nama}</div>
        <ul class="team-schedule">
          ${sesi.map(s => `
            <li class="schedule-item">
              <span class="schedule-day">${dayEmoji[s.hari] || '📅'} ${s.hari}</span>
              <span class="schedule-time">${s.jam}</span>
            </li>
          `).join('')}
        </ul>
        <div class="team-location">📍 ${detail.lokasi}</div>
      </div>
    `;
  }).join('');
}
/* ============================== BERITA ============================== */
function loadBerita() {
  const section  = document.getElementById('berita');
  const carousel = document.getElementById('news-carousel');
  if (!section || !carousel) return;
  const res = BizLogic.getActiveBerita();
  if (!res.success || !res.data || res.data.length === 0) {
    // Hide section seluruhnya jika tidak ada berita
    section.classList.add('hidden');
    return;
  }
  const berita = res.data;
  carousel.innerHTML = berita.map((b, i) => `
    <article class="news-card" data-index="${i}">
      <div class="news-card-head">
        <div class="news-date">${Utils.escapeHtml(Utils.formatDateLong(b.Tanggal))}</div>
        <div class="news-badge">📢 Berita</div>
      </div>
      <h3 class="news-title">${Utils.escapeHtml(b.Judul)}</h3>
      <p class="news-desc">${Utils.escapeHtml(b.Deskripsi || '').substring(0, 200)}${(b.Deskripsi || '').length > 200 ? '…' : ''}</p>
      ${b.Link
        ? `<a href="${Utils.escapeHtml(b.Link)}" target="_blank" rel="noopener" class="btn btn-accent btn-sm news-link">Baca Selengkapnya →</a>`
        : `<span class="text-muted" style="font-size:12px;">Tidak ada link lanjutan</span>`}
    </article>
  `).join('');
  section.classList.remove('hidden');
  const dotsContainer = document.getElementById('news-dots');
  const cards = carousel.querySelectorAll('.news-card');
  const scrollToIdx = (idx) => {
    const card = cards[idx];
    if (card) carousel.scrollTo({ left: card.offsetLeft - 12, behavior: 'smooth' });
  };
  requestAnimationFrame(() => {
    const fits = carousel.scrollWidth <= carousel.clientWidth + 4;
    if (fits) {
      carousel.classList.add('news-centered');
      if (dotsContainer) dotsContainer.innerHTML = '';
      return;
    }
    carousel.classList.remove('news-centered');
    if (dotsContainer) {
      dotsContainer.innerHTML = berita.map((_, i) =>
        `<button class="news-dot ${i === 0 ? 'active' : ''}" data-idx="${i}" aria-label="Berita ${i + 1}"></button>`
      ).join('');
    }
    const dots = dotsContainer ? Array.from(dotsContainer.querySelectorAll('.news-dot')) : [];
    let scrollTimer;
    carousel.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        let activeIdx = 0, minDist = Infinity;
        cards.forEach((c, i) => {
          const dist = Math.abs(c.offsetLeft - carousel.scrollLeft - 12);
          if (dist < minDist) { minDist = dist; activeIdx = i; }
        });
        dots.forEach((d, i) => d.classList.toggle('active', i === activeIdx));
      }, 90);
    });
    let current = 0, timer = null;
    const nextSlide = () => {
      const atEnd = carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 8;
      current = atEnd ? 0 : Math.min(current + 1, cards.length - 1);
      scrollToIdx(current);
    };
    const start = () => { if (!timer) timer = setInterval(nextSlide, 4000); };
    const stop  = () => { clearInterval(timer); timer = null; };
    dots.forEach(d => d.addEventListener('click', () => {
      scrollToIdx(Number(d.dataset.idx)); stop(); start();
    }));
    ['mouseenter', 'pointerdown', 'touchstart'].forEach(ev =>
      carousel.addEventListener(ev, stop, { passive: true }));
    ['mouseleave', 'touchend'].forEach(ev =>
      carousel.addEventListener(ev, start, { passive: true }));
    start();
  });
}