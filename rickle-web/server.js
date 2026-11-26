'use strict';
/* RICKLE ROLEPLAY — file utama. Jalankan: node server.js  (tanpa npm install) */
const http = require('http'), fs = require('fs'), path = require('path'), net = require('net'), crypto = require('crypto');
const A = require('./lib/auth'), C = require('./lib/content'), MC = require('./lib/minecraft');

const PORT = +process.env.PORT || 3000, HOST = process.env.HOST || '127.0.0.1';
const PUB = path.join(__dirname, 'public'), UP = path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(UP, { recursive: true });
A.init();

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon' };

function headers(res, admin) {
  const script = admin ? "'self'" : "'self' 'unsafe-inline'";
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src ${script}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; media-src 'self' https:; connect-src 'self' https://discord.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.COOKIE_SECURE === '1') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const ipOf = req => (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function body(req, limit = 1e6) {
  return new Promise((ok, no) => {
    let n = 0; const ch = [];
    req.on('data', d => { n += d.length; if (n > limit) { no(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else ch.push(d); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(ch).toString() || '{}')); } catch { no(Object.assign(new Error('bad json'), { code: 400 })); } });
  });
}

let statusCache = { t: 0, v: null };
async function publicStatus() {
  const s = C.get().settings;
  if (Date.now() - statusCache.t < 15000) return statusCache.v;
  const host = (s.ip || '').split(':')[0], port = +(s.ip || '').split(':')[1] || 25565;
  const st = host ? await MC.ping(host, port) : null;
  statusCache = { t: Date.now(), v: { online: !!st, players: st && st.online, max: st && st.max, version: st && st.version } };
  return statusCache.v;
}

async function api(req, res, url) {
  const ip = ipOf(req), p = url.pathname, m = req.method;
  if (p === '/api/public' && m === 'GET') { const d = C.get(); const { rconHost, rconPort, ...pub } = d.settings; return json(res, 200, { settings: pub, rules: d.rules, gallery: d.gallery }); }
  if (p === '/api/status' && m === 'GET') return json(res, 200, await publicStatus());

  if (p === '/api/admin/login' && m === 'POST') {
    const b = await body(req); const r = await A.login(ip, b.username, b.password, b.otp);
    if (r.error) return json(res, r.code || 401, { error: r.error });
    const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `sid=${r.sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${A.TTL / 1000}${secure}`);
    return json(res, 200, { csrf: r.csrf, mustChange: r.mustChange });
  }
  if (!p.startsWith('/api/admin/')) return json(res, 404, { error: 'not found' });

  const sess = A.session(req);
  if (!sess) return json(res, 401, { error: 'unauthorized' });
  if (m !== 'GET') {
    const o = req.headers.origin; if (o && new URL(o).host !== req.headers.host) return json(res, 403, { error: 'bad origin' });
    if (!A.safeEq(req.headers['x-csrf'] || '', sess.csrf)) return json(res, 403, { error: 'bad csrf' });
  }
  const log = (a, x) => A.audit(sess.user, ip, a, x);

  if (p === '/api/admin/me') return json(res, 200, { user: sess.user, csrf: sess.csrf, mustChange: sess.mustChange, totp: A.hasTotp() });
  if (p === '/api/admin/logout' && m === 'POST') { A.destroy(sess.sid); res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return json(res, 200, { ok: 1 }); }
  if (p === '/api/admin/password' && m === 'POST') {
    const b = await body(req); const r = await A.changePassword(sess, b.current, b.next);
    if (r.error) return json(res, 400, r); log('password.change'); return json(res, 200, { ok: 1 });
  }
  if (sess.mustChange) return json(res, 403, { error: 'Ganti password dulu / change password first' });

  if (p === '/api/admin/settings') {
    if (m === 'GET') return json(res, 200, C.get().settings);
    if (m === 'PUT') { C.setSettings(await body(req)); statusCache.t = 0; log('settings.update'); return json(res, 200, { ok: 1 }); }
  }
  if (p === '/api/admin/rules' && m === 'PUT') { const n = C.setRules((await body(req, 3e6)).rules); log('rules.update', n + ' rules'); return json(res, 200, { ok: 1, count: n }); }
  if (p === '/api/admin/gallery' && m === 'POST') {
    const b = await body(req, 8e6); const it = C.addGallery(b, UP); log('gallery.add', it.title); return json(res, 200, it);
  }
  const g = p.match(/^\/api\/admin\/gallery\/([a-f0-9]{8,32})$/);
  if (g && m === 'PUT') { const it = C.editGallery(g[1], await body(req)); if (!it) return json(res, 404, { error: 'not found' }); log('gallery.edit', g[1]); return json(res, 200, it); }
  if (g && m === 'DELETE') { if (!C.delGallery(g[1], UP)) return json(res, 404, { error: 'not found' }); log('gallery.delete', g[1]); return json(res, 200, { ok: 1 }); }
  if (p === '/api/admin/status' && m === 'GET') { statusCache.t = 0; return json(res, 200, await publicStatus()); }
  if (p === '/api/admin/rcon' && m === 'POST') {
    const b = await body(req), cmd = String(b.command || '').trim().replace(/^\//, '');
    if (!cmd || cmd.length > 300 || /[\r\n\0]/.test(cmd)) return json(res, 400, { error: 'invalid command' });
    if (!process.env.RCON_PASSWORD) return json(res, 503, { error: 'Set env RCON_PASSWORD dulu' });
    const s = C.get().settings;
    try { const out = await MC.rcon(s.rconHost || '127.0.0.1', +s.rconPort || 25575, process.env.RCON_PASSWORD, cmd); log('rcon', cmd); return json(res, 200, { output: out }); }
    catch (e) { return json(res, 502, { error: 'RCON: ' + e.message }); }
  }
  if (p === '/api/admin/audit' && m === 'GET') return json(res, 200, A.readAudit());
  if (p === '/api/admin/totp/setup' && m === 'POST') { log('totp.setup'); return json(res, 200, A.totpSetup()); }
  if (p === '/api/admin/totp/enable' && m === 'POST') { const ok = A.totpEnable((await body(req)).code); if (ok) log('totp.enable'); return json(res, ok ? 200 : 400, { ok }); }
  if (p === '/api/admin/totp/disable' && m === 'POST') { const b = await body(req); const ok = await A.totpDisable(b.password); if (ok) log('totp.disable'); return json(res, ok ? 200 : 400, { ok }); }
  return json(res, 404, { error: 'not found' });
}

function serve(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/admin' || p === '/admin/') p = '/admin/index.html';
  if (p === '/') p = '/index.html';
  const base = p.startsWith('/uploads/') ? UP : PUB, rel = p.startsWith('/uploads/') ? p.slice(9) : p;
  const file = path.join(base, rel);
  if (!file.startsWith(base + path.sep) || rel.includes('\0')) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    if (!MIME[ext]) { res.writeHead(403); return res.end('Forbidden'); }
    res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control': ext === '.html' || p.startsWith('/admin') ? 'no-cache' : 'public, max-age=300' });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    headers(res, url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin'));
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serve(req, res, url);
  } catch (e) {
    if (!res.headersSent) json(res, e.code === 413 || e.code === 400 ? e.code : e.status || 500, { error: e.status || e.code === 413 || e.code === 400 ? e.message : 'server error' });
    if (!e.status && !e.code) console.error(e);
  }
}).listen(PORT, HOST, () => console.log(`\n  Rickle web  → http://${HOST}:${PORT}\n  Admin panel → http://${HOST}:${PORT}/admin\n`));
