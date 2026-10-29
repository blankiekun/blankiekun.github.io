// VNBox's game library in the visitor's Google Drive: the app's hidden folder, as for saves (consdrive.js signs in).
// A game goes up as its files cut into chunks of up to CHUNK bytes, each named by its SHA-256 and packed into
// Drive files of about PACK bytes, UPLOADS at a time. A chunk already in Drive (the same engine file in another game, or what a
// stopped upload sent) isn't sent again, so a stopped upload goes on where it was. Drive holds:
//   vnbox library.json.gz    { v, games: [{ title, size, exe, hook, res, tuning, cleanup, discs, drive, at, manifest, done }] }
//   vnbox game.json.gz       one per game, its manifest: { v, title, packs: [id], chunks: [[hash, pack, at, length, gz]],
//                            files: [[path, size, [chunk]]], dirs: [path] }
//   vnbox pack.bin           chunks back to back, gzipped where that saves a tenth or more
// Paths are from the root of the site's private storage: vn/<title>/... and the game's disc images in vn-discs/.

import { api, API, UPLOAD, createFile, gzip, gunzip } from './consdrive.js';

export const CHUNK = 4 << 20;
// Few big files: Drive limits how many files a second an account makes, not their size.
export const PACK = 32 << 20;
// Packs uploading at once, and reads of a download in flight at once.
const UPLOADS = 3, AHEAD = 3;
// The manifest goes up after the first pack, then at most this often, for a stopped upload to go on from.
const SAVE_EVERY = 30e3;
// Gzip is tried on a chunk's first SAMPLE bytes, and on the whole only if they shrink (most of a game is
// already compressed: ogg, png, movies).
const SAMPLE = 64 << 10;

// ---------- chunks, packs and manifests (no Drive here, for tools/vnlib-check.mjs) ----------

export async function hashOf(u8) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', u8)).subarray(0, 16);
  return btoa(String.fromCharCode(...d)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const squeeze = u8 => new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then(b => new Uint8Array(b));
const unsqueeze = u8 => new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer().then(b => new Uint8Array(b));
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// files: [[path, size, [hash]]]; chunks: Map hash -> [pack id, at, length, gz]. Every chunk goes in, a stopped
// upload's included, so the next one knows them.
function toManifest(title, files, chunks, dirs) {
  const packs = [], packIx = new Map(), list = [], chunkIx = new Map();
  const ix = hash => {
    if (!chunkIx.has(hash)) {
      const [id, at, length, gz] = chunks.get(hash);
      if (!packIx.has(id)) { packIx.set(id, packs.length); packs.push(id); }
      chunkIx.set(hash, list.length);
      list.push([hash, packIx.get(id), at, length, gz]);
    }
    return chunkIx.get(hash);
  };
  const out = files.map(([path, size, hashes]) => [path, size, hashes.map(ix)]);
  for (const hash of chunks.keys()) ix(hash);
  return { v: 1, title, packs, chunks: list, files: out, dirs };
}

// The chunks manifests have in Drive: Map hash -> [pack id, at, length, gz].
export function knownChunks(manifests) {
  const known = new Map();
  for (const m of manifests) for (const [hash, p, at, length, gz] of m.chunks) known.set(hash, [m.packs[p], at, length, gz]);
  return known;
}

// Cuts the files into chunks and packs the ones not known. files: [{ path, size, read(start, end) -> Uint8Array }];
// put(bytes) uploads a pack and resolves to its id, up to UPLOADS at once; saved(manifest) now and then, with
// the files whose packs are all up. Resolves to the whole manifest.
export async function packGame({ title, files, dirs = [], known, put, saved = async () => {}, progress = () => {}, signal, packSize = PACK }) {
  const chunks = new Map(), list = [], sending = new Set(), flying = [];
  let pack = [], packLen = 0, waiting = new Map(), done = 0, lastSave = 0;
  // The oldest pack in flight: once it's up, so are the files listed before it was cut.
  async function land() {
    const { up, filesDone } = flying.shift();
    await up;
    if (Date.now() - lastSave < SAVE_EVERY) return;
    lastSave = Date.now();
    await saved(toManifest(title, list.slice(0, filesDone), chunks, dirs));
    if (signal) signal.throwIfAborted();
  }
  async function flush() {
    if (!pack.length) return;
    const bytes = concat(pack), these = waiting;
    pack = []; packLen = 0; waiting = new Map();
    const up = put(bytes).then(id => {
      for (const [hash, [at, length, gz]] of these) { const c = [id, at, length, gz]; chunks.set(hash, c); known.set(hash, c); sending.delete(hash); }
    });
    up.catch(() => {});
    flying.push({ up, filesDone: list.length });
    if (flying.length >= UPLOADS) await land();
  }
  for (const f of files) {
    const hashes = [];
    for (let at = 0; at < f.size; at += CHUNK) {
      if (signal) signal.throwIfAborted();
      const raw = await f.read(at, Math.min(at + CHUNK, f.size));
      const hash = await hashOf(raw);
      hashes.push(hash);
      if (!chunks.has(hash) && !sending.has(hash)) {
        if (known.has(hash)) chunks.set(hash, known.get(hash));
        else {
          const tried = raw.length > SAMPLE * 2 && (await squeeze(raw.subarray(0, SAMPLE))).length >= SAMPLE * 0.9;
          const small = tried ? raw : await squeeze(raw), gz = small.length < raw.length * 0.9 ? 1 : 0, bytes = gz ? small : raw;
          // The files before this one are whole once the pack is up.
          if (packLen + bytes.length > packSize) await flush();
          waiting.set(hash, [packLen, bytes.length, gz]);
          sending.add(hash);
          pack.push(bytes);
          packLen += bytes.length;
        }
      }
      progress(done += raw.length);
    }
    list.push([f.path, f.size, hashes]);
  }
  await flush();
  while (flying.length) await land();
  return toManifest(title, list, chunks, dirs);
}

// The reads that fetch these chunks (indexes into m.chunks, in order): [{ pack, at, length, chunks }], neighbouring
// chunks of a pack in one read of up to READ bytes (AHEAD of them are held at once).
export const READ = 16 << 20;
export function planReads(m, seq) {
  const runs = [];
  for (const i of seq) {
    const [, pack, at, length] = m.chunks[i], last = runs.at(-1);
    if (last && last.pack === pack && last.at + last.length === at && last.length + length <= READ) { last.length += length; last.chunks.push(i); }
    else runs.push({ pack, at, length, chunks: [i] });
  }
  return runs;
}

// A manifest's path may only be the game's own folder or a disc image folder.
export function safePath(title, path) {
  const parts = String(path).split('/');
  if (parts.some(p => !p || p === '.' || p === '..')) return false;
  return parts.length > 2 && ((parts[0] === 'vn' && parts[1] === title) || parts[0] === 'vn-discs');
}

// Writes a manifest's files. read(pack id, at, length) -> Uint8Array; open(path) -> { write(bytes), close() };
// mkdir(path); skip(path, size): already there (from a stopped download).
export async function unpackGame(m, { read, open, mkdir, skip = async () => false, progress = () => {}, signal }) {
  for (const [path] of m.files) if (!safePath(m.title, path)) throw new Error(`The game's file list in Google Drive has a path VNBox won't write: ${path}`);
  for (const path of m.dirs || []) if (!safePath(m.title, path + '/x')) throw new Error(`The game's file list in Google Drive has a folder VNBox won't write: ${path}`);
  const todo = [];
  for (const f of m.files) if (!(await skip(f[0], f[1]))) todo.push(f);
  const runs = planReads(m, todo.flatMap(f => f[2]));
  const pending = [];
  let next = 0, run = null, buf = null, off = 0, k = 0, done = m.files.reduce((n, f) => n + f[1], 0) - todo.reduce((n, f) => n + f[1], 0);
  const fetchRun = r => read(m.packs[r.pack], r.at, r.length).then(b => {
    if (b.length !== r.length) throw new Error('Google Drive sent part of the game cut short.');
    return b;
  });
  async function chunk() {
    if (!run || k === run.chunks.length) {
      while (pending.length < AHEAD && next < runs.length) { const p = fetchRun(runs[next++]); p.catch(() => {}); pending.push(p); }
      run = runs[next - pending.length];
      buf = await pending.shift();
      off = 0; k = 0;
    }
    const [hash, , , length, gz] = m.chunks[run.chunks[k++]];
    const part = buf.subarray(off, off += length), bytes = gz ? await unsqueeze(part) : part;
    if (await hashOf(bytes) !== hash) throw new Error('Part of the game in Google Drive is damaged.');
    return bytes;
  }
  progress(done);
  for (const [path, , cs] of todo) {
    if (signal) signal.throwIfAborted();
    const out = await open(path);
    try {
      for (let i = 0; i < cs.length; i++) {
        const bytes = await chunk();
        await out.write(bytes);
        progress(done += bytes.length);
      }
    } catch (e) {
      if (out.abort) await out.abort().catch(() => {});
      throw e;
    }
    await out.close();
  }
  for (const path of m.dirs || []) await mkdir(path);
}

// ---------- Google Drive ----------

const LIB = { name: 'vnbox library.json.gz', mimeType: 'application/gzip', appProperties: { vnbox: 'library' } };
const MANIFEST = { name: 'vnbox game.json.gz', mimeType: 'application/gzip', appProperties: { vnbox: 'game' } };
const PACKFILE = { name: 'vnbox pack.bin', mimeType: 'application/octet-stream', appProperties: { vnbox: 'pack' } };

async function readJson(id, interactive) {
  const r = await api(`${API}/files/${id}?alt=media`, {}, interactive);
  return JSON.parse(await gunzip(await r.arrayBuffer()));
}
// shortcut: one request, so a manifest over 5 MB gzipped (a game of about 100,000 files) fails; use a resumable upload if one does
async function writeJson(id, meta, doc, interactive) {
  const body = await gzip(JSON.stringify(doc));
  if (id) {
    await api(`${UPLOAD}/files/${id}?uploadType=media&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/gzip' }, body }, interactive);
    return id;
  }
  return (await (await createFile(meta, body, interactive, 'id')).json()).id;
}
// Drive's answers to too many requests (429, 403 rate limits) and its hiccups (5xx, the connection) are tried
// again, after 1, 2, 4, 8 and 16 seconds and a bit.
async function retried(f, signal) {
  for (let i = 0; ; i++) {
    try { return await f(); } catch (e) {
      const again = e.kind === 'net' || e.status === 429 || e.status >= 500 || (e.status === 403 && /rate|limit/i.test(e.message));
      if (!again || i === 5 || (signal && signal.aborted)) throw e;
      await new Promise(r => setTimeout(r, (1000 << i) + Math.random() * 1000));
    }
  }
}

// A file of any size, by Drive's resumable upload in one go: the upload's address, then its bytes. Drive
// shows a page the upload's id, not its Location.
async function bigFile(meta, blob) {
  const r = await api(`${UPLOAD}/files?uploadType=resumable`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ parents: ['appDataFolder'], ...meta }) });
  const upId = r.headers.get('X-GUploader-UploadID');
  const url = r.headers.get('Location') || (upId && `${UPLOAD}/files?uploadType=resumable&upload_id=${encodeURIComponent(upId)}`);
  if (!url) throw new Error('Google Drive didn\'t say where to upload.');
  return (await (await api(url + '&fields=id', { method: 'PUT', headers: { 'Content-Type': meta.mimeType }, body: blob })).json()).id;
}

const removeFile = (id, interactive) => api(`${API}/files/${id}`, { method: 'DELETE' }, interactive).catch(e => { if (e.kind !== 'gone') throw e; });

let libId = null;
// The games in Drive: [{ title, size, exe, ..., manifest, done }]. done is false while an upload is unfinished.
export async function library(interactive = false) {
  if (!libId) {
    const q = encodeURIComponent("appProperties has { key='vnbox' and value='library' } and trashed = false");
    const f = (await (await api(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id)&orderBy=modifiedTime desc`, {}, interactive)).json()).files[0];
    if (!f) return [];
    libId = f.id;
  }
  try {
    return (await readJson(libId, interactive)).games || [];
  } catch (e) {
    if (e.kind !== 'gone') throw e;
    libId = null;
    return library(interactive);
  }
}

// Read, change, write, so the games another device put there stay. entry null removes the game.
// shortcut: two devices writing the library in the same second can lose one's change; use Drive's file versions if that happens
async function setEntry(title, entry, interactive) {
  const games = (await library(interactive)).filter(g => g.title !== title);
  if (entry) games.push(entry);
  libId = await writeJson(libId, LIB, { v: 1, games }, interactive);
  return games;
}

const manifestOf = (id, interactive) => id ? readJson(id, interactive).catch(e => { if (e.kind === 'gone') return null; throw e; }) : null;

// The record fields a game keeps in the library, so it plays the same on another device.
const KEPT = ['title', 'size', 'exe', 'hook', 'res', 'tuning', 'cleanup', 'discs', 'drive'];

// The files of a game's copy in this browser, and its empty folders.
async function gameFiles(rec) {
  const opfs = await navigator.storage.getDirectory(), files = [], dirs = [];
  const at = path => path.split('/').reduce((p, n) => p.then(d => d.getDirectoryHandle(n)), Promise.resolve(opfs));
  async function walk(d, prefix) {
    let empty = true;
    for await (const [name, x] of d.entries()) {
      empty = false;
      if (x.kind === 'directory') { await walk(x, prefix + name + '/'); continue; }
      const f = await x.getFile();
      files.push({ path: prefix + name, size: f.size, read: (a, b) => f.slice(a, b).arrayBuffer().then(b => new Uint8Array(b)) });
    }
    if (empty) dirs.push(prefix.slice(0, -1));
  }
  await walk(await at('vn/' + rec.title), 'vn/' + rec.title + '/');
  for (const folder of new Set((rec.discs || []).map(d => d.slice(0, d.lastIndexOf('/'))))) await walk(await at(folder), folder + '/');
  return { files, dirs };
}

// Uploads a game in this browser (its record from VNBox's recent games). interactive: from a click, for the first request.
export async function uploadGame(rec, { progress, signal, interactive } = {}) {
  const games = await library(interactive);
  const known = knownChunks((await Promise.all(games.map(g => manifestOf(g.manifest)))).filter(Boolean));
  const { files, dirs } = await gameFiles(rec);
  const size = files.reduce((n, f) => n + f.size, 0);
  let id = (games.find(g => g.title === rec.title) || {}).manifest || null;
  const entry = done => ({ ...Object.fromEntries(KEPT.filter(k => rec[k] !== undefined).map(k => [k, rec[k]])), size, at: Date.now(), manifest: id, done });
  const saved = async m => {
    const first = !id;
    id = await writeJson(id, MANIFEST, m);
    if (first) await setEntry(rec.title, entry(false));
  };
  const put = bytes => retried(() => bigFile(PACKFILE, new Blob([bytes])), signal);
  const m = await packGame({ title: rec.title, files, dirs, known, put, saved, progress: n => progress && progress(n, size), signal });
  if (signal) signal.throwIfAborted();
  id = await writeJson(id, MANIFEST, m);
  return setEntry(rec.title, entry(true));
}

// Writes a game from the library into this browser. A stopped download goes on where it was: files already
// there whole are kept.
export async function downloadGame(entry, { progress, signal, interactive } = {}) {
  const m = await manifestOf(entry.manifest, interactive);
  if (!m || m.title !== entry.title) throw new Error(`${entry.title} isn't whole in your Google Drive anymore.`);
  const opfs = await navigator.storage.getDirectory();
  const dirOf = async path => {
    let d = opfs;
    for (const p of path.split('/')) d = await d.getDirectoryHandle(p, { create: true });
    return d;
  };
  const parent = path => dirOf(path.slice(0, path.lastIndexOf('/')));
  const name = path => path.slice(path.lastIndexOf('/') + 1);
  const total = m.files.reduce((n, f) => n + f[1], 0);
  await unpackGame(m, {
    read: (id, at, length) => retried(async () => new Uint8Array(await (await api(`${API}/files/${id}?alt=media`, { headers: { Range: `bytes=${at}-${at + length - 1}` } })).arrayBuffer()), signal),
    open: async path => (await (await parent(path)).getFileHandle(name(path), { create: true })).createWritable(),
    mkdir: dirOf,
    skip: async (path, size) => (await (await parent(path)).getFileHandle(name(path)).then(h => h.getFile()).catch(() => null))?.size === size,
    progress: n => progress && progress(n, total), signal,
  });
  return m;
}

// Removes a game from the library, and the packs no other game uses.
export async function deleteGame(title, interactive = false) {
  const games = await library(interactive), g = games.find(o => o.title === title);
  if (!g) return;
  const mine = await manifestOf(g.manifest, interactive);
  const used = new Set();
  for (const o of games) if (o !== g) for (const id of ((await manifestOf(o.manifest)) || { packs: [] }).packs) used.add(id);
  // First, so the game is gone even if a delete below fails (its packs are then left over, unused).
  await setEntry(title, null);
  for (const id of mine ? mine.packs : []) if (!used.has(id)) await removeFile(id);
  if (g.manifest) await removeFile(g.manifest);
}

// Free space in the visitor's Drive, in bytes, or Infinity.
export async function driveFree(interactive = false) {
  const q = (await (await api(`${API}/about?fields=storageQuota(limit,usage)`, {}, interactive)).json()).storageQuota || {};
  return q.limit ? Math.max(0, q.limit - q.usage) : Infinity;
}
