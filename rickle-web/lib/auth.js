'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const DIR = path.join(__dirname, '..', 'data'), FILE = path.join(DIR, 'admin.json'), LOG = path.join(DIR, 'audit.log');
const TTL = 2 * 3600 * 1000, sessions = new Map(), fails = new Map();
let admin;

const safeEq = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const hash = async (pw, salt) => (await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 })).toString('hex');
const save = () => { fs.writeFileSync(FILE + '.tmp', JSON.stringify(admin), { mode: 0o600 }); fs.renameSync(FILE + '.tmp', FILE); };

function init() {
  if (fs.existsSync(FILE)) { admin = JSON.parse(fs.readFileSync(FILE, 'utf8')); return; }
  const user = process.env.ADMIN_USER || 'admin', fromEnv = !!process.env.ADMIN_PASSWORD, pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  admin = { user, salt, hash: crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex'), mustChange: true, totp: null };
  save();
  console.log('\n  ================ AKUN ADMIN PERTAMA (tampil sekali) ================\n  username : ' + user + '\n  password : ' + (fromEnv ? '(dari ADMIN_PASSWORD)' : pw) + '\n  Wajib ganti password saat login pertama.\n  ====================================================================');
}

async function login(ip, username, password, otp) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  if (f.until > Date.now()) return { error: 'Terlalu banyak percobaan. Coba lagi nanti.', code: 429 };
  const okUser = safeEq(String(username || ''), admin.user);
  const okPass = safeEq(await hash(String(password || '').slice(0, 200), admin.salt), admin.hash);
  let ok = okUser && okPass;
  if (ok && admin.totp && admin.totp.enabled) {
    if (!otp) return { error: 'OTP_REQUIRED' };
    ok = verifyTotp(admin.totp.secret, otp);
  }
  if (!ok) {
    f.n++; if (f.n >= 5) { f.until = Date.now() + 15 * 60 * 1000; f.n = 0; }
    fails.set(ip, f); audit(String(username).slice(0, 30), ip, 'login.fail');
    await new Promise(r => setTimeout(r, 600));
    return { error: 'Username / password / OTP salah' };
  }
  fails.delete(ip);
  if (sessions.size > 20) sessions.delete(sessions.keys().next().value);
  const sid = crypto.randomBytes(32).toString('base64url'), csrf = crypto.randomBytes(24).toString('base64url');
  sessions.set(sid, { sid, user: admin.user, csrf, exp: Date.now() + TTL, mustChange: admin.mustChange });
  audit(admin.user, ip, 'login.ok');
  return { sid, csrf, mustChange: admin.mustChange };
}

function session(req) {
  const m = /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const s = sessions.get(m[1]); if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(m[1]); return null; }
  s.exp = Date.now() + TTL; return s;
}
const destroy = sid => sessions.delete(sid);

async function changePassword(sess, cur, next) {
  if (typeof next !== 'string' || next.length < 12 || next.length > 200 || !/[a-z]/.test(next) || !/[A-Z]/.test(next) || !/\d/.test(next))
    return { error: 'Password minimal 12 karakter, harus ada huruf besar, kecil, dan angka.' };
  if (!safeEq(await hash(String(cur || ''), admin.salt), admin.hash)) return { error: 'Password saat ini salah' };
  admin.salt = crypto.randomBytes(16).toString('hex'); admin.hash = await hash(next, admin.salt); admin.mustChange = false; save();
  for (const [k, s] of sessions) if (s.sid !== sess.sid) sessions.delete(k); // logout sesi lain
  sess.mustChange = false; return { ok: 1 };
}

/* ---------- TOTP (2FA, RFC 6238) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32enc = buf => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };
const b32dec = s => { let bits = ''; for (const c of s) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); };
function code(secret, t) {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(t)); const h = crypto.createHmac('sha1', b32dec(secret)).update(c).digest(), o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
function verifyTotp(secret, otp) { const t = Math.floor(Date.now() / 30000); return [-1, 0, 1].some(d => safeEq(code(secret, t + d), String(otp).trim())); }
const hasTotp = () => !!(admin.totp && admin.totp.enabled);
function totpSetup() { admin.totp = { secret: b32enc(crypto.randomBytes(20)), enabled: false }; save(); return { secret: admin.totp.secret, uri: `otpauth://totp/Rickle:${admin.user}?secret=${admin.totp.secret}&issuer=Rickle` }; }
function totpEnable(c) { if (!admin.totp || !verifyTotp(admin.totp.secret, c)) return false; admin.totp.enabled = true; save(); return true; }
async function totpDisable(pw) { if (!safeEq(await hash(String(pw || ''), admin.salt), admin.hash)) return false; admin.totp = null; save(); return true; }

/* ---------- Audit log ---------- */
function audit(user, ip, action, extra) {
  const clean = s => String(s ?? '').replace(/[\r\n]/g, ' ').slice(0, 200);
  fs.appendFile(LOG, JSON.stringify({ t: new Date().toISOString(), user: clean(user), ip: clean(ip), action: clean(action), extra: clean(extra) }) + '\n', () => {});
}
function readAudit() { try { return fs.readFileSync(LOG, 'utf8').trim().split('\n').slice(-100).reverse().map(l => JSON.parse(l)); } catch { return []; } }

setInterval(() => { for (const [k, s] of sessions) if (s.exp < Date.now()) sessions.delete(k); for (const [k, f] of fails) if (f.until < Date.now() && !f.n) fails.delete(k); }, 600000).unref();
module.exports = { init, login, session, destroy, changePassword, safeEq, audit, readAudit, hasTotp, totpSetup, totpEnable, totpDisable, TTL };
