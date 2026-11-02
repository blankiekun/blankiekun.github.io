// Picking and dropping game folders, and .zip files: what CONscripter and VNBox both need,
// apart from conscripter.js so that VNBox doesn't load CONscripter to get them.

import { h } from '../util.js';

export function fromDrop(dt) {
  const items = [...dt.items];
  const handle = items.length === 1 && items[0].getAsFileSystemHandle ? items[0].getAsFileSystemHandle().catch(() => null) : null;
  const entries = items.map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  const loose = entries.length ? [] : [...dt.files].map(file => ({ path: file.name, file }));
  const list = (async () => {
    const out = loose;
    async function walk(entry, prefix) {
      if (entry.isFile) {
        out.push({ path: prefix + entry.name, file: await new Promise((res, rej) => entry.file(res, rej)) });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (;;) {
          const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          if (!batch.length) break;
          for (const e of batch) await walk(e, prefix + entry.name + '/');
        }
      }
    }
    for (const e of entries) await walk(e, '');
    return out;
  })();
  return Promise.all([list, handle]).then(([list, handle]) => ({ list, handle: handle && handle.kind === 'directory' ? handle : null }));
}

// Resolves to { handle } where the browser hands out folders it can keep (Chrome, Edge),
// otherwise to { list }.
export async function pickFolder() {
  if (window.showDirectoryPicker) {
    try {
      return { handle: await showDirectoryPicker({ id: 'cons', mode: 'read' }) };
    } catch (e) {
      if (e.name === 'AbortError') return { list: [] };
    }
  }
  return new Promise(resolve => {
    const input = h('input', { type: 'file', multiple: true, hidden: true });
    input.webkitdirectory = true;
    input.addEventListener('change', () => {
      resolve({ list: [...input.files].map(file => ({ path: file.webkitRelativePath || file.name, file })) });
      input.remove();
    });
    input.addEventListener('cancel', () => { resolve({ list: [] }); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

export async function walkHandle(dir) {
  const out = [];
  async function walk(d, prefix) {
    for await (const e of d.values()) {
      if (e.kind === 'file') out.push({ path: prefix + e.name, file: await e.getFile() });
      else await walk(e, prefix + e.name + '/');
    }
  }
  await walk(dir, dir.name + '/');
  return out;
}

const hhmm = t => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function when(t) {
  const d = new Date(t), now = new Date(), day = 864e5;
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= midnight) return 'Today ' + hhmm(t);
  if (t >= midnight - day) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

// The shallowest folder with a script in it is the game.
export function bytes(n) {
  if (n >= 1 << 30) return (n / (1 << 30)).toFixed(1) + ' GB';
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MB';
  return Math.max(1, Math.round(n / 1024)) + ' KB';
}

// ---------- .zip, just enough for save files ----------

const CRC = new Uint32Array(256).map((_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n; });
const crc32 = d => { let c = -1; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };

function dosTime(d) {
  return { time: d.getHours() << 11 | d.getMinutes() << 5 | d.getSeconds() >> 1, date: (d.getFullYear() - 1980) << 9 | (d.getMonth() + 1) << 5 | d.getDate() };
}

// Stored, not deflated: save files are small and mostly incompressible anyway.
export function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.path), crc = crc32(f.data), { time, date } = dosTime(f.mtime || new Date());
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x800, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, name.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x800, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, off, true);
    parts.push(lh, name, f.data);
    central.push(ch, name);
    off += 30 + name.length + f.data.length;
  }
  const size = central.reduce((n, p) => n + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

// Reads the zip a slice at a time, so a game of a few GB doesn't have to fit in memory:
// stored files are slices of the zip itself, deflated ones are unpacked once into Blobs.
// lazy: deflated ones are { size, stream() } instead, unpacked as they're read, so nothing is unpacked twice.
// shortcut: lazy files have only size and stream() (all VNBox's copy reads); give them more if another caller wants it
export async function readZip(zip, lazy = false) {
  const tail = await zip.slice(Math.max(0, zip.size - 65557)).arrayBuffer(), t = new DataView(tail);
  let e = tail.byteLength - 22;
  while (e >= 0 && t.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  let count = t.getUint16(e + 10, true), cdSize = t.getUint32(e + 12, true), cdOff = t.getUint32(e + 16, true);
  // Zip64 (over 4 GB or 65535 files): the real numbers are in a record the locator before the end points to.
  if (e >= 20 && t.getUint32(e - 20, true) === 0x07064b50) {
    const at = Number(t.getBigUint64(e - 12, true)), z = new DataView(await zip.slice(at, at + 56).arrayBuffer());
    if (z.getUint32(0, true) !== 0x06064b50) throw new Error('not a zip');
    count = Number(z.getBigUint64(32, true)); cdSize = Number(z.getBigUint64(40, true)); cdOff = Number(z.getBigUint64(48, true));
  }
  const cd = await zip.slice(cdOff, cdOff + cdSize).arrayBuffer(), v = new DataView(cd), u8 = new Uint8Array(cd);
  const utf8 = new TextDecoder(), sjis = new TextDecoder('shift_jis'), out = [];
  for (let i = 0, p = 0; i < count; i++) {
    const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    let csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true), lo = v.getUint32(p + 42, true);
    // Sizes and offsets past 4 GB are 0xffffffff here, with the real ones in the Zip64 extra field.
    for (let x = p + 46 + nlen, end = x + xlen; x + 4 <= end; x += 4 + v.getUint16(x + 2, true)) {
      if (v.getUint16(x, true) !== 1) continue;
      let q = x + 4;
      if (usize === 0xffffffff) { usize = Number(v.getBigUint64(q, true)); q += 8; }
      if (csize === 0xffffffff) { csize = Number(v.getBigUint64(q, true)); q += 8; }
      if (lo === 0xffffffff) lo = Number(v.getBigUint64(q, true));
    }
    const path = (flags & 0x800 ? utf8 : sjis).decode(u8.subarray(p + 46, p + 46 + nlen)).replace(/\\/g, '/');
    p += 46 + nlen + xlen + clen;
    if (path.endsWith('/') || path.split('/').includes('..') || (method !== 0 && method !== 8)) continue;
    const lh = new DataView(await zip.slice(lo, lo + 30).arrayBuffer());
    const start = lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    let file = zip.slice(start, start + csize);
    if (method === 8) {
      const packed = file, stream = () => packed.stream().pipeThrough(new DecompressionStream('deflate-raw'));
      file = lazy ? { size: usize, stream } : await new Response(stream()).blob();
    }
    out.push({ path, file });
  }
  return out;
}

// A picked or dropped .zip becomes the files in it, under a folder named after the zip.
export async function unzipAll(list, lazy = false) {
  const out = [];
  for (const f of list) {
    if (!/\.zip$/i.test(f.path)) { out.push(f); continue; }
    const dir = f.path.replace(/\.zip$/i, '/');
    for (const z of await readZip(f.file, lazy)) out.push({ path: dir + z.path, file: z.file });
  }
  return out;
}
