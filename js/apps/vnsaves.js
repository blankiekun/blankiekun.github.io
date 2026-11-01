// A VNBox game's save files, read and written straight from the engine's IndexedDB, with the game
// stopped: the engine loads its databases at start and writes its whole tree back while it runs.
// Ported from chimimouryou (apps/web/src/lib/data/vn-save-store.ts).
// IDBFS keeps one database per mount point (name = mount path, store FILE_DATA, key = absolute
// path, value { timestamp: Date, mode, contents? }). Each game has two:
// - /lazyapp/<lazy>: the files the game wrote into its own folder (they win over the OPFS copy's),
// - /root/lazy/<lazy>: everything else Wine wrote (the prefix, C: = drive_c),
// with <lazy> = encodeURIComponent('opfs:vn/<title>'). Names Boxedwine wrote are escaped
// ((_colon_), (_xE3_)... per byte, Fs::localNameToRemote).

const STORE = 'FILE_DATA';
// Emscripten's: S_IFREG | 0666, S_IFDIR | 0777
const FILE_MODE = 0o100666;
const DIR_MODE = 0o40777;
const isDir = mode => (mode & 0o170000) === 0o40000;
const isLink = mode => (mode & 0o170000) === 0o120000;

// The places a game's saves live in this browser: [{ label, db, root }].
export function saveAreas(title) {
  const lazy = encodeURIComponent('opfs:vn/' + title);
  const prefix = '/root/lazy/' + lazy;
  return [
    { label: 'Game folder', db: '/lazyapp/' + lazy, root: `/lazyapp/${lazy}/${title}` },
    { label: 'Wine (C: drive and settings)', db: prefix, root: prefix + '/home/username/.wine' },
  ];
}

function openDb(name) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 21);
    // As IDBFS.getDB creates it, so the engine opens it unchanged later.
    r.onupgradeneeded = () => {
      const store = r.result.objectStoreNames.contains(STORE) ? r.transaction.objectStore(STORE) : r.result.createObjectStore(STORE);
      if (!store.indexNames.contains('timestamp')) store.createIndex('timestamp', 'timestamp', { unique: false });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function withStore(area, mode, run) {
  const db = await openDb(area.db);
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const result = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('The save files could not be written.'));
    });
  } finally {
    db.close();
  }
}

const SPECIAL = { colon: ':', question: '?', at: '@', dot: '.', space: ' ' };

// Boxedwine's escaped name → the name the game sees (Fs::remoteNameToLocal).
export function unescapeName(name) {
  const bytes = [], enc = new TextEncoder();
  const token = /\(_(?:(colon|question|at|dot|space)|x([0-9A-Fa-f]{2}))_\)/y;
  for (let i = 0; i < name.length;) {
    token.lastIndex = i;
    const m = token.exec(name);
    if (m) {
      bytes.push(m[1] ? SPECIAL[m[1]].charCodeAt(0) : parseInt(m[2], 16));
      i = token.lastIndex;
    } else {
      const ch = String.fromCodePoint(name.codePointAt(i));
      bytes.push(...enc.encode(ch));
      i += ch.length;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// A name as Boxedwine writes it (Fs::localNameToRemote).
export function escapeName(name) {
  return [...new TextEncoder().encode(name)].map((b, i, all) => {
    const ch = String.fromCharCode(b), last = i === all.length - 1;
    if (ch === ':') return '(_colon_)';
    if (ch === '?') return '(_question_)';
    if (ch === '@') return '(_at_)';
    if (ch === '.' && last) return '(_dot_)';
    if (ch === ' ' && last) return '(_space_)';
    if (b >= 0x80) return `(_x${b.toString(16).toUpperCase().padStart(2, '0')}_)`;
    return ch;
  }).join('');
}

// Every file and folder in the area, folders implied by a file's path included, sorted by path:
// [{ key (IndexedDB), path (shown, '/'-separated, unescaped), dir, link, size, modified (ms) }].
export async function listSaves(area) {
  const found = new Map();
  await withStore(area, 'readonly', store => {
    const r = store.openCursor(IDBKeyRange.bound(area.root + '/', area.root + '0', false, true));
    r.onsuccess = () => {
      const c = r.result;
      if (!c) return;
      const key = String(c.key), v = c.value;
      const parts = key.slice(area.root.length + 1).split('/'), shown = parts.map(unescapeName);
      // Parents first: the engine can persist a file whose folder it never listed.
      for (let d = 1; d < parts.length; d++) {
        const path = shown.slice(0, d).join('/');
        if (!found.has(path)) found.set(path, { key: area.root + '/' + parts.slice(0, d).join('/'), path, dir: true, link: false, size: 0, modified: 0 });
      }
      found.set(shown.join('/'), { key, path: shown.join('/'), dir: isDir(v.mode), link: isLink(v.mode),
        size: v.contents ? v.contents.byteLength : 0, modified: new Date(v.timestamp).getTime() });
      c.continue();
    };
  });
  return [...found.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

// The entries at path and below it ('' = the whole area).
export const savesUnder = (entries, path) => entries.filter(e => !path || e.path === path || e.path.startsWith(path + '/'));

// The files among entries with their contents: [{ path, data, mtime (Date) }], for makeZip.
export async function readSaves(area, entries) {
  const files = entries.filter(e => !e.dir);
  const reqs = await withStore(area, 'readonly', store => files.map(e => store.get(e.key)));
  return files.flatMap((e, i) => {
    const v = reqs[i].result;
    return v && v.contents ? [{ path: e.path, data: v.contents, mtime: new Date(e.modified) }] : [];
  });
}

// A shown path's segments, or null when one could leave its folder.
export function savePathParts(path) {
  const parts = path.replaceAll('\\', '/').split('/').filter(Boolean);
  return parts.length && parts.every(p => p !== '.' && p !== '..') ? parts : null;
}

// Writes files [{ path, data, mtime? (ms) }] at shown paths in the area (existing ones replaced,
// missing folders made) and returns the entries they replaced.
export async function writeSaves(area, files, entries) {
  const byPath = new Map(entries.map(e => [e.path, e]));
  const replaced = [], puts = [], now = new Date();
  const modes = await withStore(area, 'readonly', store => new Map(entries.filter(e => !e.dir).map(e => [e.path, store.get(e.key)])));
  for (const f of files) {
    const parts = savePathParts(f.path);
    if (!parts) throw new Error(`${f.path} isn't a path inside the save folder.`);
    let key = area.root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/'), known = byPath.get(path), last = i === parts.length - 1;
      key = known ? known.key : key + '/' + escapeName(part);
      if (known && known.dir === !last) return;
      if (known) throw new Error(`${path} is a file, not a folder.`);
      if (!last) {
        byPath.set(path, { key, path, dir: true, link: false, size: 0, modified: now.getTime() });
        puts.push([key, { timestamp: now, mode: DIR_MODE }]);
      }
    });
    const path = parts.join('/'), old = byPath.get(path);
    if (old && old.dir) throw new Error(`${path} is a folder.`);
    if (old) replaced.push(old);
    const prev = modes.get(path);
    // Synced files keep their time, or newest-wins would send them back.
    puts.push([key, { timestamp: f.mtime == null ? now : new Date(f.mtime), mode: (prev && prev.result && prev.result.mode) || FILE_MODE, contents: f.data }]);
    byPath.set(path, { key, path, dir: false, link: false, size: f.data.byteLength, modified: f.mtime == null ? now.getTime() : f.mtime });
  }
  await withStore(area, 'readwrite', store => puts.forEach(([k, v]) => store.put(v, k)));
  return replaced;
}

// Deletes the entries at path and below it; resolves to them.
export async function deleteSaves(area, entries, path) {
  const gone = savesUnder(entries, path);
  await withStore(area, 'readwrite', store => gone.forEach(e => store.delete(e.key)));
  return gone;
}

// ---------- Google Drive sync (consdrive.js) ----------
// A game's saves sync by name: game/<path> (anything the game wrote into its folder), and in the
// prefix wine/drive_c/users/<user>/{AppData,Documents,Saved Games}/<path> or wine/drive_c/ProgramData/<path>
// (not Microsoft's), temp and cache folders left out. Never system32, windows or the registry.

export const SYNC_CAP = 20 * 1024 * 1024;
const USER_FOLDERS = /^wine\/drive_c\/(?:users\/[^/]+\/(?:AppData|Documents|Saved Games)|ProgramData(?=\/(?!Microsoft\/)))\/(.+)$/;
const NOT_SAVES = /^(?:temp|tmp)$|cache/i;
const syncPrefix = (areas, area) => area === areas[0] ? 'game/' : 'wine/';

export function isSyncedSave(name) {
  const parts = savePathParts(name);
  if (!parts || parts.join('/') !== name) return false;
  if (parts[0] === 'game') return parts.length > 1;
  const inUser = USER_FOLDERS.exec(name);
  return !!inUser && !inUser[1].split('/').some(p => NOT_SAVES.test(p));
}

// The game's saves to sync, [{ path (sync name), data, mtime (ms) }], or only their size when
// over SYNC_CAP: { size, files? }. Picked by key, so only the saves are read, never the registry or
// Wine's other files (this runs after each save, on the game's thread).
export async function syncedSaves(title) {
  const areas = saveAreas(title), files = [];
  for (const area of areas) {
    const p = syncPrefix(areas, area), reqs = [];
    await withStore(area, 'readonly', store => {
      const r = store.openKeyCursor(IDBKeyRange.bound(area.root + '/', area.root + '0', false, true));
      r.onsuccess = () => {
        const c = r.result;
        if (!c) return;
        const path = p + String(c.key).slice(area.root.length + 1).split('/').map(unescapeName).join('/');
        if (isSyncedSave(path)) reqs.push([path, store.get(c.key)]);
        c.continue();
      };
    });
    for (const [path, { result: v }] of reqs) {
      if (v && v.contents && !isDir(v.mode) && !isLink(v.mode)) files.push({ path, data: v.contents, mtime: new Date(v.timestamp).getTime() });
    }
  }
  const size = files.reduce((n, f) => n + f.data.byteLength, 0);
  return size > SYNC_CAP ? { size } : { size, files };
}

// Writes synced files [{ path (sync name), data, mtime }] in, the game stopped, where they're
// newer than this browser's. Folders, links and paths under a local file are left alone, so one
// odd file doesn't stop the rest. Resolves to how many were written.
export async function writeSynced(title, files) {
  const areas = saveAreas(title);
  let written = 0;
  for (const area of areas) {
    const p = syncPrefix(areas, area), entries = await listSaves(area);
    const byPath = new Map(entries.map(e => [e.path, e]));
    const writes = files.filter(f => f.path.startsWith(p) && isSyncedSave(f.path)).map(f => ({ ...f, path: f.path.slice(p.length) })).filter(f => {
      const local = byPath.get(f.path), parents = f.path.split('/').slice(0, -1);
      if (local && (local.dir || local.link || local.modified >= f.mtime)) return false;
      return !parents.some((_, i) => { const e = byPath.get(parents.slice(0, i + 1).join('/')); return e && !e.dir; });
    });
    if (writes.length) await writeSaves(area, writes, entries);
    written += writes.length;
  }
  return written;
}

// Whether the game wrote a synced save after since (ms), and the newest write time seen: the
// running engine's writes, read off the timestamp index without the files' contents.
export async function savedSince(title, since) {
  const areas = saveAreas(title);
  let saved = false, at = since;
  for (const area of areas) {
    const p = syncPrefix(areas, area);
    await withStore(area, 'readonly', store => {
      const r = store.index('timestamp').openKeyCursor(IDBKeyRange.lowerBound(new Date(since), true));
      r.onsuccess = () => {
        const c = r.result;
        if (!c) return;
        at = Math.max(at, new Date(c.key).getTime());
        const key = String(c.primaryKey);
        if (key.startsWith(area.root + '/') && isSyncedSave(p + key.slice(area.root.length + 1).split('/').map(unescapeName).join('/'))) saved = true;
        c.continue();
      };
    });
  }
  return { saved, at };
}
