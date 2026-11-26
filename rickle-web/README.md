# Rickle Roleplay — Website + Admin Panel

Tanpa `npm install`. Cukup Node.js 18+.

## Menjalankan
- **Windows:** klik dua kali `start.bat`  •  **Linux/Mac:** `./start.sh`  •  atau `node server.js`
- Website: http://127.0.0.1:3000  •  Admin: http://127.0.0.1:3000/admin
- Saat pertama dijalankan, **username & password admin acak dicetak di console (sekali saja)**. Login, lalu panel memaksa ganti password.

## Struktur
| File | Isi |
|---|---|
| `server.js` | **File utama** — menjalankan semua file lain |
| `lib/auth.js` | Login, sesi, rate-limit, 2FA TOTP, audit log |
| `lib/content.js` | Penyimpanan & validasi peraturan, galeri, pengaturan |
| `lib/minecraft.js` | Cek status server (ping) & konsol RCON |
| `public/index.html`, `css/`, `js/app.js` | Website (dari test2.html, sudah dibuat dinamis) |
| `public/lang/*.json` | Bahasa: id, en, ms, es, ja, ar (tambah bahasa = tambah file JSON) |
| `public/admin/` | Admin panel |
| `data/content.json` | Peraturan, galeri, pengaturan (bisa di-backup) |

## Fitur admin
Dashboard (status online + konsol RCON), edit peraturan (ID/EN, contoh, sanksi, urutan), galeri (upload/edit/hapus), pengaturan (IP, versi, Discord, pengumuman, maintenance), keamanan (ganti password, 2FA, audit log).

## Keamanan yang dipasang
scrypt password hash • sesi HttpOnly + SameSite=Strict • token CSRF + cek Origin • lockout 15 menit setelah 5 gagal login • 2FA TOTP opsional • CSP ketat di panel admin • validasi upload lewat magic-bytes (SVG ditolak) • anti path-traversal • semua teks dirender anti-XSS • audit log • sesi lain otomatis keluar saat ganti password.

**Wajib jika dipublikasikan:** pakai HTTPS (Nginx/Caddy/Cloudflare), set `COOKIE_SECURE=1`, `TRUST_PROXY=1` bila di belakang proxy, `HOST=127.0.0.1` + reverse proxy, aktifkan 2FA. Lihat `.env.example`.

## RCON (opsional)
Di `server.properties` Minecraft: `enable-rcon=true`, `rcon.password=...`, `rcon.port=25575`. Lalu jalankan web dengan env `RCON_PASSWORD` yang sama. Jangan buka port RCON ke internet.

## Catatan
- **Sanksi di peraturan adalah usulan saya** (bertahap warn → kick → ban). Silakan sesuaikan di Admin → Peraturan.
- Bahasa ms/es/ja/ar menerjemahkan menu, galeri, dan peraturan; teks halaman lain otomatis memakai English.
- Login/daftar pemain di halaman publik masih simulasi seperti file asli (belum ada akun pemain).
