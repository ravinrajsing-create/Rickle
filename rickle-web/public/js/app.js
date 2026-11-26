/* Rickle — data dinamis (peraturan, galeri), multi-bahasa, animasi interaktif */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  const CATS = ['kota', 'kegiatan', 'komunitas', 'acara'], CAT_KEY = { kota: 'gal_f1', kegiatan: 'gal_f2', komunitas: 'gal_f3', acara: 'gal_f4' };
  const GROUPS = [['roleplay', 'rules_tab_rp'], ['gameplay', 'rules_tab_gp'], ['community', 'rules_tab_com']];
  let D = { settings: {}, rules: [], gallery: [] }, cat = 'all', grp = 'roleplay', q = '', shown = [];
  const loaded = {};

  const T = k => (translations[currentLang] && translations[currentLang][k]) || translations.en[k] || k;
  const L = o => (o && (o[currentLang] || o.en || o.id)) || '';

  /* ---------- Bahasa ---------- */
  async function loadLang(l) {
    if (loaded[l]) return; loaded[l] = 1;
    try {
      const j = await (await fetch('/lang/' + l + '.json')).json();
      translations[l] = Object.assign({}, translations.en, translations[l] || {}, j);
    } catch (e) { translations[l] = translations[l] || translations.en; }
  }
  const origChange = window.changeLanguage;
  window.changeLanguage = async function (l) {
    await loadLang(l); origChange(l);
    document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem('lang', l); } catch (e) {}
    $('langSelect').value = l; renderAll();
  };

  /* ---------- Peraturan ---------- */
  function renderRules() {
    $('rulesTabs').innerHTML = GROUPS.map(g => `<button class="rules-tab ${g[0] === grp ? 'active' : ''}" data-g="${g[0]}">${esc(T(g[1]))}</button>`).join('');
    $('rulesSearch').placeholder = T('rules_search');
    const term = q.toLowerCase();
    const list = D.rules.filter(r => r.group === grp && (!term || (L(r.title) + L(r.d) + L(r.x)).toLowerCase().includes(term)));
    $('rulesRoot').innerHTML = list.map((r, i) => `
      <div class="rule-item ${term ? 'open' : ''}" style="--i:${i}">
        <div class="rule-header" data-toggle><div class="rule-number">${String(i + 1).padStart(2, '0')}</div><div class="rule-title">${esc(L(r.title))}</div><i class="fa-solid fa-chevron-down rule-icon" style="margin-inline-start:auto"></i></div>
        <div class="rule-desc"><p>${esc(L(r.d))}</p>
          ${L(r.x) ? `<div class="rule-box bad"><i class="fa-solid fa-circle-xmark"></i><div><b>${esc(T('rules_example'))}</b><p>${esc(L(r.x))}</p></div></div>` : ''}
          ${L(r.s) ? `<div class="rule-box sanction"><i class="fa-solid fa-gavel"></i><div><b>${esc(T('rules_sanction'))}</b><p>${esc(L(r.s))}</p></div></div>` : ''}
        </div></div>`).join('') || `<div class="empty-box">${esc(T('rules_empty'))}</div>`;
  }

  /* ---------- Galeri ---------- */
  function renderGallery() {
    const n = c => D.gallery.filter(g => c === 'all' || g.category === c).length;
    $('galleryFilterBar').innerHTML = [['all', 'filter_all']].concat(CATS.map(c => [c, CAT_KEY[c]])).map(c =>
      `<button class="filter-btn ${cat === c[0] ? 'active' : ''}" data-c="${c[0]}">${esc(T(c[1]))} <small>${n(c[0])}</small></button>`).join('');
    shown = D.gallery.filter(g => cat === 'all' || g.category === cat);
    $('galleryGrid').innerHTML = shown.map((g, i) => `
      <div class="gallery-item g-card" data-i="${i}" style="--d:${Math.min(i, 12) * 60}ms" tabindex="0">
        <div class="g-shine"></div>
        <img src="${esc(g.image)}" alt="${esc(g.title)}" loading="lazy" referrerpolicy="no-referrer">
        <div class="gallery-overlay"><span class="gallery-tag">${esc(T(CAT_KEY[g.category]))}</span><h4>${esc(g.title)}</h4>${g.author ? `<p>${esc(T('gal_by'))} ${esc(g.author)}</p>` : ''}</div>
        <span class="g-zoom"><i class="fa-solid fa-expand"></i></span>
      </div>`).join('');
    const e = $('galleryEmpty'); e.style.display = D.gallery.length ? 'none' : 'block'; e.textContent = T('gal_empty');
    reveal();
  }
  function reveal() {
    const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: .1 });
    document.querySelectorAll('.g-card:not(.in)').forEach(el => io.observe(el));
  }

  /* ---------- Lightbox ---------- */
  let lb, cur = 0, sx = 0;
  function openLB(i) {
    if (!lb) {
      lb = document.createElement('div'); lb.className = 'lb';
      lb.innerHTML = '<button class="lb-x" aria-label="close">✕</button><button class="lb-n lb-prev">‹</button><button class="lb-n lb-next">›</button><figure><img alt=""><figcaption></figcaption></figure>';
      document.body.appendChild(lb);
      lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('lb-x')) closeLB(); else if (e.target.classList.contains('lb-prev')) step(-1); else if (e.target.classList.contains('lb-next')) step(1); });
      lb.addEventListener('touchstart', e => sx = e.touches[0].clientX, { passive: true });
      lb.addEventListener('touchend', e => { const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 50) step(d < 0 ? 1 : -1); });
    }
    cur = i; paint(); lb.classList.add('open'); document.body.style.overflow = 'hidden';
  }
  function paint() {
    const g = shown[cur]; if (!g) return; const im = lb.querySelector('img');
    im.classList.remove('pop'); void im.offsetWidth; im.src = g.image; im.alt = g.title; im.classList.add('pop');
    lb.querySelector('figcaption').innerHTML = `<b>${esc(g.title)}</b><span>${esc(T(CAT_KEY[g.category]))}${g.author ? ' · ' + esc(g.author) : ''} · ${cur + 1}/${shown.length}</span>`;
  }
  const step = d => { cur = (cur + d + shown.length) % shown.length; paint(); };
  const closeLB = () => { lb && lb.classList.remove('open'); document.body.style.overflow = ''; };
  document.addEventListener('keydown', e => {
    if (lb && lb.classList.contains('open')) {
      if (e.key === 'Escape') closeLB(); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
    } else if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('g-card')) openLB(+e.target.dataset.i);
  });

  /* ---------- Event delegasi ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-toggle],[data-g],[data-c],.g-card,#rulesToggleAll'); if (!t) return;
    if (t.hasAttribute('data-toggle')) t.parentElement.classList.toggle('open');
    else if (t.dataset.g) { grp = t.dataset.g; renderRules(); }
    else if (t.dataset.c) { cat = t.dataset.c; renderGallery(); }
    else if (t.id === 'rulesToggleAll') { const its = document.querySelectorAll('#rulesRoot .rule-item'), all = [...its].every(x => x.classList.contains('open')); its.forEach(x => x.classList.toggle('open', !all)); }
    else openLB(+t.dataset.i);
  });
  document.addEventListener('input', e => { if (e.target.id === 'rulesSearch') { q = e.target.value.trim(); renderRules(); } });

  /* Tilt 3D + spotlight mengikuti kursor */
  document.addEventListener('mousemove', e => {
    const c = e.target.closest && e.target.closest('.g-card'); if (!c) return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.style.setProperty('--rx', ((.5 - y) * 12).toFixed(2) + 'deg'); c.style.setProperty('--ry', ((x - .5) * 14).toFixed(2) + 'deg');
    c.style.setProperty('--mx', (x * 100) + '%'); c.style.setProperty('--my', (y * 100) + '%');
  });
  document.addEventListener('mouseout', e => { const c = e.target.closest && e.target.closest('.g-card'); if (c && !c.contains(e.relatedTarget)) { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); } });

  /* ---------- Status server & pengumuman ---------- */
  function renderSettings() {
    const s = D.settings;
    if (s.ip && $('stat-ip')) $('stat-ip').textContent = s.ip;
    if (s.version && $('stat-version')) $('stat-version').textContent = s.version;
    const a = $('announce'), msg = s.maintenance ? T('maintenance') : L(s.announcement);
    a.hidden = !msg; a.textContent = msg; a.classList.toggle('warn', !!s.maintenance);
    if (s.discordInvite) document.querySelectorAll('a[href="https://discord.gg/rickle"]').forEach(x => x.href = s.discordInvite);
  }
  async function loadStatus() {
    try {
      const st = await (await fetch('/api/status')).json(), b = $('stat-online'); if (!b) return;
      b.textContent = st.online ? `${st.players}/${st.max}` : (D.settings.ip ? 'OFFLINE' : '—');
    } catch (e) {}
  }
  const renderAll = () => { renderRules(); renderGallery(); renderSettings(); };

  async function boot() {
    try { D = await (await fetch('/api/public')).json(); } catch (e) {}
    let l = 'id'; try { l = localStorage.getItem('lang') || (navigator.language || 'id').slice(0, 2); } catch (e) {}
    if (!['id', 'en', 'ms', 'es', 'ja', 'ar'].includes(l)) l = 'id';
    await loadLang('id'); await loadLang('en'); await window.changeLanguage(l); loadStatus(); setInterval(loadStatus, 30000);
  }
  boot();
})();
