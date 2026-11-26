'use strict';
const net = require('net');
const vi = n => { const b = []; do { let x = n & 127; n >>>= 7; if (n) x |= 128; b.push(x); } while (n); return Buffer.from(b); };
const pkt = d => Buffer.concat([vi(d.length), d]);
const str = s => Buffer.concat([vi(Buffer.byteLength(s)), Buffer.from(s)]);

/* Server List Ping — status & jumlah pemain */
function ping(host, port = 25565, timeout = 3000) {
  return new Promise(res => {
    const s = net.connect({ host, port }); let buf = Buffer.alloc(0);
    const t = setTimeout(() => { s.destroy(); res(null); }, timeout);
    s.on('connect', () => { const pt = Buffer.alloc(2); pt.writeUInt16BE(port); s.write(pkt(Buffer.concat([vi(0), vi(765), str(host), pt, vi(1)]))); s.write(pkt(vi(0))); });
    s.on('data', d => {
      buf = Buffer.concat([buf, d]);
      try {
        let o = 0; const rv = () => { let n = 0, sh = 0, b; do { b = buf[o++]; if (b === undefined) throw 0; n |= (b & 127) << sh; sh += 7; } while (b & 128); return n; };
        const len = rv(); if (buf.length < o + len) return; rv(); const sl = rv(); if (buf.length < o + sl) return;
        const j = JSON.parse(buf.subarray(o, o + sl).toString()); clearTimeout(t); s.destroy();
        res({ online: j.players && j.players.online, max: j.players && j.players.max, version: j.version && j.version.name });
      } catch {}
    });
    s.on('error', () => { clearTimeout(t); res(null); });
  });
}

/* RCON — kirim command ke server Minecraft (enable-rcon=true di server.properties) */
function rcon(host, port, pass, cmd) {
  return new Promise((res, rej) => {
    const s = net.connect({ host, port }); let buf = Buffer.alloc(0), stage = 0;
    const t = setTimeout(() => { s.destroy(); rej(new Error('timeout')); }, 5000);
    const send = (id, type, body) => { const b = Buffer.from(body), p = Buffer.alloc(14 + b.length); p.writeInt32LE(10 + b.length, 0); p.writeInt32LE(id, 4); p.writeInt32LE(type, 8); b.copy(p, 12); s.write(p); };
    s.on('connect', () => send(1, 3, pass));
    s.on('data', d => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 4) {
        const l = buf.readInt32LE(0); if (buf.length < l + 4) break;
        const id = buf.readInt32LE(4), out = buf.subarray(12, l + 2).toString(); buf = buf.subarray(l + 4);
        if (stage === 0) { if (id === -1) { clearTimeout(t); s.destroy(); return rej(new Error('auth gagal')); } stage = 1; send(2, 2, cmd); }
        else { clearTimeout(t); s.end(); return res(out); }
      }
    });
    s.on('error', e => { clearTimeout(t); rej(e); });
  });
}
module.exports = { ping, rcon };
