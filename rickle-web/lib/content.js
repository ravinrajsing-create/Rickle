'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const FILE = path.join(__dirname, '..', 'data', 'content.json');
const CATS = ['kota', 'kegiatan', 'komunitas', 'acara'], GROUPS = ['roleplay', 'gameplay', 'community'];
let db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const save = () => { fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2)); fs.renameSync(FILE + '.tmp', FILE); };
const bad = m => { throw Object.assign(new Error(m), { status: 400 }); };
const s = (v, max = 2000) => String(v ?? '').slice(0, max).trim();
const id = () => crypto.randomBytes(8).toString('hex');
const tr = o => ({ id: s(o && o.id), en: s(o && o.en) });
const MAGIC = [[/^\x89PNG/, 'png', 'image/png'], [/^\xFF\xD8\xFF/, 'jpg', 'image/jpeg'], [/^GIF8/, 'gif', 'image/gif'], [/^RIFF[\s\S]{4}WEBP/, 'webp', 'image/webp']];

function setSettings(b) {
  const n = db.settings;
  for (const k of ['serverName', 'ip', 'version', 'discordId', 'discordInvite', 'rconHost']) if (k in b) n[k] = s(b[k], 120);
  if ('rconPort' in b) n.rconPort = Math.max(1, Math.min(65535, +b.rconPort || 25575));
  if ('maintenance' in b) n.maintenance = !!b.maintenance;
  if ('announcement' in b) n.announcement = tr(b.announcement);
  if (n.discordInvite && !/^https:\/\//.test(n.discordInvite)) n.discordInvite = '';
  save();
}
function setRules(arr) {
  if (!Array.isArray(arr) || arr.length > 200) bad('rules invalid');
  db.rules = arr.map(r => ({ id: /^[a-f0-9]{16}$/.test(r.id) ? r.id : id(), group: GROUPS.includes(r.group) ? r.group : bad('group invalid'),
    title: tr(r.title), d: tr(r.d), x: tr(r.x), s: tr(r.s) }));
  save(); return db.rules.length;
}
function img(b, dir) {
  if (b.imageData) {
    const m = /^data:image\/[\w+.-]+;base64,([A-Za-z0-9+/=]+)$/.exec(b.imageData); if (!m) bad('gambar invalid');
    const buf = Buffer.from(m[1], 'base64'); if (buf.length > 5e6) bad('maks 5MB');
    const head = buf.subarray(0, 16).toString('latin1'), t = MAGIC.find(x => x[0].test(head)); if (!t) bad('hanya PNG/JPG/GIF/WEBP');
    const name = crypto.randomBytes(12).toString('hex') + '.' + t[1]; fs.writeFileSync(path.join(dir, name), buf); return '/uploads/' + name;
  }
  if (/^https:\/\/[^\s"'<>]+$/.test(b.image || '')) return b.image;
  bad('gambar wajib (upload atau URL https)');
}
function addGallery(b, dir) {
  const it = { id: id(), title: s(b.title, 80) || 'Tanpa judul', category: CATS.includes(b.category) ? b.category : 'kota', author: s(b.author, 60), image: img(b, dir), created: Date.now() };
  db.gallery.unshift(it); save(); return it;
}
function editGallery(gid, b) {
  const it = db.gallery.find(x => x.id === gid); if (!it) return null;
  if ('title' in b) it.title = s(b.title, 80) || it.title; if ('author' in b) it.author = s(b.author, 60);
  if (CATS.includes(b.category)) it.category = b.category; save(); return it;
}
function delGallery(gid, dir) {
  const i = db.gallery.findIndex(x => x.id === gid); if (i < 0) return false;
  const [it] = db.gallery.splice(i, 1); save();
  if (/^\/uploads\/[a-f0-9]{24}\.\w+$/.test(it.image)) fs.unlink(path.join(dir, path.basename(it.image)), () => {});
  return true;
}
module.exports = { get: () => db, setSettings, setRules, addGallery, editGallery, delGallery };
