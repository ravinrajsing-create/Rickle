'use strict';
/* Admin panel — semua DOM dibuat dengan textContent (anti-XSS), tanpa inline script */
const app = document.getElementById('app');
let csrf = '', me = null, view = 'dashboard', rules = [], settings = {}, gallery = [], flash = null, pollT = 0;
const CATS = ['kota', 'kegiatan', 'komunitas', 'acara'], GROUPS = ['roleplay', 'gameplay', 'community'];

function h(tag, a, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(a || {})) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v; else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF': csrf }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/admin/login') { me = null; draw(); throw new Error('Sesi berakhir'); }
  if (!r.ok) throw Object.assign(new Error(j.error || 'Error ' + r.status), { data: j });
  return j;
}
const say = (t, err) => { flash = { t, err }; draw(); };
const field = (label, val, on, o = {}) => {
  const el = h(o.area ? 'textarea' : 'input', { type: o.type || 'text', maxlength: o.max || 2000, placeholder: o.ph || '' }); el.value = val ?? '';
  el.addEventListener('input', () => on(el.value)); return h('div', {}, h('label', {}, label), el);
};

/* ---------- Login ---------- */
function loginView() {
  let otpBox = h('div', { hidden: true });
  const u = h('input', { autocomplete: 'username' }), p = h('input', { type: 'password', autocomplete: 'current-password' }), o = h('input', { inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code' });
  otpBox.append(h('label', {}, 'Kode 2FA'), o);
  const err = h('div', { class: 'msg err', hidden: true });
  async function go(ev) {
    ev.preventDefault(); err.hidden = true;
    try {
      const r = await api('POST', '/api/admin/login', { username: u.value, password: p.value, otp: o.value });
      csrf = r.csrf; await boot();
    } catch (e) {
      if (e.message === 'OTP_REQUIRED') { otpBox.hidden = false; o.focus(); } else { err.textContent = e.message; err.hidden = false; p.value = ''; }
    }
  }
  return h('form', { class: 'login', onsubmit: go }, h('h1', {}, 'Rickle Admin'), h('div', { style: 'color:var(--mut)' }, 'Masuk untuk mengelola server'), err,
    h('label', {}, 'Username'), u, h('label', {}, 'Password'), p, otpBox, h('button', { class: 'btn', type: 'submit' }, 'Masuk'));
}

/* ---------- Dashboard + RCON ---------- */
function dashboardView() {
  const st = h('div', {}, 'Memuat status…'), out = h('pre', {}, ''), cmd = h('input', { placeholder: 'contoh: list, whitelist add Steve, say Halo!', maxlength: 300 });
  async function refresh() { try { const s = await api('GET', '/api/admin/status'); st.replaceChildren(h('span', { class: 'pill ' + (s.online ? 'on-p' : 'off-p') }, s.online ? 'ONLINE' : 'OFFLINE'), s.online ? `  ${s.players}/${s.max} pemain · ${s.version}` : '  (cek IP di Pengaturan)'); } catch {} }
  async function run(c) {
    if (!c) return; if (/^(stop|op|deop|ban-ip|pardon-ip)\b/i.test(c) && !confirm('Jalankan perintah sensitif: ' + c + ' ?')) return;
    out.textContent += '> ' + c + '\n';
    try { out.textContent += ((await api('POST', '/api/admin/rcon', { command: c })).output || '(ok, tanpa output)') + '\n'; } catch (e) { out.textContent += '✖ ' + e.message + '\n'; }
    out.scrollTop = out.scrollHeight;
  }
  refresh(); clearInterval(pollT); pollT = setInterval(() => view === 'dashboard' && refresh(), 20000);
  return h('div', {}, h('h3', {}, 'Dashboard'),
    h('div', { class: 'card' }, h('b', {}, 'Status server'), h('div', { style: 'margin-top:8px' }, st)),
    h('div', { class: 'card' }, h('b', {}, 'Konsol (RCON)'), h('div', { style: 'color:var(--mut);margin:4px 0 10px' }, 'Butuh enable-rcon=true di server.properties dan env RCON_PASSWORD pada web ini.'),
      h('div', { class: 'bar' }, ['list', 'save-all', 'whitelist list', 'tps'].map(c => h('button', { class: 'btn ghost sm', onclick: () => run(c) }, c))),
      out, h('form', { class: 'bar', onsubmit: e => { e.preventDefault(); run(cmd.value.trim()); cmd.value = ''; } }, h('div', { style: 'flex:1' }, cmd), h('button', { class: 'btn' }, 'Kirim'))));
}

/* ---------- Peraturan ---------- */
const emptyRule = g => ({ id: '', group: g, title: { id: '', en: '' }, d: { id: '', en: '' }, x: { id: '', en: '' }, s: { id: '', en: '' } });
function rulesView() {
  const wrap = h('div', {}, h('h3', {}, 'Peraturan'), h('div', { style: 'color:var(--mut);margin-bottom:12px' }, 'Isi ID & EN. Bahasa lain (ms/es/ja/ar) otomatis memakai teks EN.'));
  for (const g of GROUPS) {
    wrap.append(h('div', { class: 'bar' }, h('b', {}, g.toUpperCase()), h('button', { class: 'btn sm', onclick: () => { rules.push(emptyRule(g)); draw(); } }, '+ Tambah')));
    rules.forEach((r, i) => {
      if (r.group !== g) return;
      const move = d => { for (let k = i + d; k >= 0 && k < rules.length; k += d) if (rules[k].group === g) { [rules[i], rules[k]] = [rules[k], rules[i]]; break; } draw(); };
      const pair = (lab, key, area) => h('div', { class: 'row' }, field(lab + ' (ID)', r[key].id, v => r[key].id = v, { area }), field(lab + ' (EN)', r[key].en, v => r[key].en = v, { area }));
      wrap.append(h('details', {}, h('summary', {}, h('b', {}, r.title.id || r.title.en || '(baru)')),
        h('div', {}, pair('Judul', 'title'), pair('Penjelasan', 'd', true), pair('Contoh pelanggaran', 'x', true), pair('Sanksi', 's'),
          h('label', {}, 'Kategori'), (() => { const s = h('select', { onchange: () => { r.group = s.value; draw(); } }, GROUPS.map(x => h('option', { value: x, selected: x === r.group }, x))); return s; })(),
          h('div', { class: 'bar' }, h('button', { class: 'btn ghost sm', onclick: () => move(-1) }, '↑'), h('button', { class: 'btn ghost sm', onclick: () => move(1) }, '↓'),
            h('button', { class: 'btn red sm', onclick: () => { if (confirm('Hapus peraturan ini?')) { rules.splice(i, 1); draw(); } } }, 'Hapus')))));
    });
  }
  wrap.append(h('div', { class: 'bar' }, h('button', { class: 'btn', onclick: async () => { try { await api('PUT', '/api/admin/rules', { rules }); await load(); say('Peraturan disimpan ✔'); } catch (e) { say(e.message, 1); } } }, 'Simpan semua peraturan')));
  return wrap;
}

/* ---------- Galeri ---------- */
function galleryView() {
  const f = { title: '', category: 'kota', author: '', image: '', imageData: '' }, file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  file.addEventListener('change', () => { const x = file.files[0]; if (!x) return; if (x.size > 5e6) { say('Maks 5MB', 1); file.value = ''; return; } const fr = new FileReader(); fr.onload = () => f.imageData = fr.result; fr.readAsDataURL(x); });
  const cat = (cur, on) => { const s = h('select', {}, CATS.map(c => h('option', { value: c, selected: c === cur }, c))); s.addEventListener('change', () => on(s.value)); return s; };
  const add = h('div', { class: 'card' }, h('b', {}, 'Tambah foto'), h('div', { class: 'row' }, field('Judul', '', v => f.title = v, { max: 80 }), field('Oleh', '', v => f.author = v, { max: 60 })),
    h('label', {}, 'Kategori'), cat('kota', v => f.category = v), h('label', {}, 'Upload gambar (PNG/JPG/WEBP/GIF, maks 5MB)'), file,
    field('…atau URL gambar https', '', v => f.image = v), h('div', { class: 'bar' }, h('button', { class: 'btn', onclick: async () => { try { await api('POST', '/api/admin/gallery', f); await load(); say('Foto ditambahkan ✔'); } catch (e) { say(e.message, 1); } } }, 'Tambahkan')));
  const list = h('div', { class: 'gal' }, gallery.map(g => {
    const d = { title: g.title, author: g.author, category: g.category };
    return h('div', { class: 'card' }, h('img', { src: g.image, alt: '' }), field('Judul', g.title, v => d.title = v, { max: 80 }), field('Oleh', g.author, v => d.author = v, { max: 60 }), h('label', {}, 'Kategori'), cat(g.category, v => d.category = v),
      h('div', { class: 'bar' }, h('button', { class: 'btn sm', onclick: async () => { try { await api('PUT', '/api/admin/gallery/' + g.id, d); await load(); say('Tersimpan ✔'); } catch (e) { say(e.message, 1); } } }, 'Simpan'),
        h('button', { class: 'btn red sm', onclick: async () => { if (!confirm('Hapus foto "' + g.title + '"?')) return; try { await api('DELETE', '/api/admin/gallery/' + g.id); await load(); say('Dihapus'); } catch (e) { say(e.message, 1); } } }, 'Hapus')));
  }));
  return h('div', {}, h('h3', {}, 'Galeri (' + gallery.length + ')'), add, gallery.length ? list : h('div', { style: 'color:var(--mut)' }, 'Galeri kosong.'));
}

/* ---------- Pengaturan ---------- */
function settingsView() {
  const s = settings, a = s.announcement || { id: '', en: '' }; s.announcement = a;
  const chk = h('input', { type: 'checkbox' }); chk.checked = !!s.maintenance; chk.addEventListener('change', () => s.maintenance = chk.checked);
  return h('div', {}, h('h3', {}, 'Pengaturan Server & Website'), h('div', { class: 'card' },
    h('div', { class: 'row' }, field('Nama server', s.serverName, v => s.serverName = v), field('IP : port (untuk cek status)', s.ip, v => s.ip = v, { ph: 'play.contoh.id:25565' })),
    h('div', { class: 'row' }, field('Versi', s.version, v => s.version = v), field('Link undangan Discord (https)', s.discordInvite, v => s.discordInvite = v)),
    h('div', { class: 'row' }, field('RCON host', s.rconHost, v => s.rconHost = v), field('RCON port', s.rconPort, v => s.rconPort = v, { type: 'number' })),
    h('div', { class: 'row' }, field('Pengumuman (ID)', a.id, v => a.id = v), field('Pengumuman (EN)', a.en, v => a.en = v)),
    h('label', {}, h('span', {}, 'Mode maintenance  '), chk),
    h('div', { class: 'bar' }, h('button', { class: 'btn', onclick: async () => { try { await api('PUT', '/api/admin/settings', s); say('Pengaturan disimpan ✔'); } catch (e) { say(e.message, 1); } } }, 'Simpan'))));
}

/* ---------- Keamanan ---------- */
function securityView() {
  const p = { current: '', next: '' }, code = h('input', { inputmode: 'numeric', maxlength: 6, placeholder: '6 digit' }), box = h('div', {}), log = h('div', {});
  async function setup() { const r = await api('POST', '/api/admin/totp/setup'); box.replaceChildren(h('div', { class: 'msg' }, 'Masukkan kunci ini ke aplikasi authenticator (Google Authenticator/Authy):', h('pre', {}, r.secret + '\n' + r.uri)), h('label', {}, 'Kode verifikasi'), code,
    h('div', { class: 'bar' }, h('button', { class: 'btn', onclick: async () => { try { await api('POST', '/api/admin/totp/enable', { code: code.value }); me.totp = true; say('2FA aktif ✔'); } catch { say('Kode salah', 1); } } }, 'Aktifkan'))); }
  api('GET', '/api/admin/audit').then(rows => log.replaceChildren(h('table', {}, h('tr', {}, ['Waktu', 'User', 'IP', 'Aksi', 'Detail'].map(x => h('th', {}, x))), rows.map(r => h('tr', {}, h('td', {}, new Date(r.t).toLocaleString()), h('td', {}, r.user), h('td', {}, r.ip), h('td', {}, r.action), h('td', {}, r.extra)))))).catch(() => {});
  return h('div', {}, h('h3', {}, 'Keamanan'),
    h('div', { class: 'card' }, h('b', {}, 'Ganti password'), h('div', { style: 'color:var(--mut)' }, 'Min. 12 karakter, kombinasi huruf besar, kecil, angka. Sesi lain otomatis keluar.'),
      field('Password saat ini', '', v => p.current = v, { type: 'password' }), field('Password baru', '', v => p.next = v, { type: 'password' }),
      h('div', { class: 'bar' }, h('button', { class: 'btn', onclick: async () => { try { await api('POST', '/api/admin/password', p); me.mustChange = false; await load(); say('Password diganti ✔'); } catch (e) { say(e.message, 1); } } }, 'Ganti'))),
    !me.mustChange && h('div', { class: 'card' }, h('b', {}, 'Autentikasi 2 langkah (TOTP) — ' + (me.totp ? 'AKTIF' : 'nonaktif')),
      h('div', { class: 'bar' }, h('button', { class: 'btn', onclick: setup }, me.totp ? 'Atur ulang' : 'Aktifkan'), me.totp && h('button', { class: 'btn red', onclick: async () => { const pw = prompt('Masukkan password untuk menonaktifkan 2FA'); if (!pw) return; try { await api('POST', '/api/admin/totp/disable', { password: pw }); me.totp = false; say('2FA dinonaktifkan'); } catch { say('Password salah', 1); } } }, 'Nonaktifkan')), box),
    !me.mustChange && h('div', { class: 'card' }, h('b', {}, 'Audit log (100 terakhir)'), log));
}

/* ---------- Layout ---------- */
const VIEWS = { dashboard: ['Dashboard', dashboardView], rules: ['Peraturan', rulesView], gallery: ['Galeri', galleryView], settings: ['Pengaturan', settingsView], security: ['Keamanan', securityView] };
function draw() {
  if (!me) { app.replaceChildren(loginView()); return; }
  if (me.mustChange) view = 'security';
  const nav = Object.entries(VIEWS).map(([k, v]) => h('button', { class: view === k ? 'on' : '', disabled: me.mustChange && k !== 'security', onclick: () => { view = k; flash = null; draw(); } }, v[0]));
  app.replaceChildren(h('div', { class: 'layout' }, h('aside', {}, h('h2', {}, '⬢ Rickle Admin'), nav, h('div', { class: 'sp' }),
    h('a', { href: '/', target: '_blank', rel: 'noopener', style: 'color:var(--mut);padding:10px 12px' }, '↗ Lihat website'),
    h('button', { onclick: async () => { try { await api('POST', '/api/admin/logout'); } catch {} me = null; draw(); } }, '⎋ Keluar')),
    h('main', {}, me.mustChange && h('div', { class: 'msg err' }, 'Ganti password awal dulu sebelum memakai panel.'), flash && h('div', { class: 'msg' + (flash.err ? ' err' : '') }, flash.t), VIEWS[view][1]())));
}
async function load() { [rules, settings, gallery] = await Promise.all([api('GET', '/api/public').then(d => d.rules), api('GET', '/api/admin/settings'), api('GET', '/api/public').then(d => d.gallery)]); }
async function boot() {
  try { me = await api('GET', '/api/admin/me'); csrf = me.csrf; if (!me.mustChange) await load(); } catch { me = null; }
  draw();
}
boot();
