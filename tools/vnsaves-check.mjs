// node tools/vnsaves-check.mjs: checks js/apps/vnsaves.js's Boxedwine name escaping and path rules.
import assert from 'node:assert/strict';
import { escapeName, unescapeName, savePathParts, isSyncedSave, saveAreas, syncedSaves, SYNC_CAP } from '../js/apps/vnsaves.js';

assert.equal(escapeName('save:1?.dat'), 'save(_colon_)1(_question_).dat');
assert.equal(escapeName('a.'), 'a(_dot_)');
assert.equal(escapeName('a '), 'a(_space_)');
assert.equal(escapeName('セ'), '(_xE3_)(_x82_)(_xBB_)');
for (const n of ['セーブ01.dat', 'user@host', 'x:y?z.', 'trailing ', 'plain.sav', '(_x41_)'.replace('x41', 'nope')])
  assert.equal(unescapeName(escapeName(n)), n);
// Names Wine didn't escape (copied from the game folder) read as they are.
assert.equal(unescapeName('セーブ.dat'), 'セーブ.dat');
assert.deepEqual(savePathParts('a\\b//c.dat'), ['a', 'b', 'c.dat']);
assert.equal(savePathParts('../x'), null);
assert.equal(savePathParts('a/./b'), null);
assert.equal(savePathParts(''), null);
for (const n of ['game/save/01.dat', 'wine/drive_c/users/username/AppData/Roaming/Maker/s.dat', 'wine/drive_c/users/username/Documents/x.sav',
  'wine/drive_c/users/username/Saved Games/g/1.sav', 'wine/drive_c/ProgramData/Maker/s.dat'])
  assert.ok(isSyncedSave(n), n);
for (const n of ['game', 'wine/system.reg', 'wine/drive_c/windows/system32/x.dll', 'wine/drive_c/ProgramData/Microsoft/x',
  'wine/drive_c/users/username/AppData/Local/Temp/x', 'wine/drive_c/users/username/AppData/Local/Maker/Cache/x', 'game/../x', 'other/x'])
  assert.ok(!isSyncedSave(n), n);

// syncedSaves on a fake IndexedDB (one store, events a tick later): only the synced files are read.
const dbs = new Map(), reads = [];
globalThis.IDBKeyRange = { bound: (lo, hi, loOpen, hiOpen) => ({ includes: k => (loOpen ? k > lo : k >= lo) && (hiOpen ? k < hi : k <= hi) }) };
globalThis.indexedDB = { open(name) {
  const r = {};
  setTimeout(() => { r.result = fakeDb(dbs.get(name) || new Map()); r.onsuccess(); });
  return r;
} };
function fakeDb(data) {
  return { close() {}, transaction() {
    const t = {};
    let pending = 0;
    const later = f => { pending++; setTimeout(() => { f(); if (!--pending && t.oncomplete) t.oncomplete(); }); };
    const req = f => { const r = {}; later(() => { r.result = f(); if (r.onsuccess) r.onsuccess(); }); return r; };
    t.objectStore = () => ({
      get: k => req(() => { reads.push(k); return data.get(k); }),
      openKeyCursor(range) {
        const keys = [...data.keys()].filter(range.includes).sort(), r = {};
        let i = 0;
        const step = () => later(() => { r.result = i < keys.length ? { key: keys[i], primaryKey: keys[i], continue: () => { i++; step(); } } : null; r.onsuccess(); });
        step();
        return r;
      },
    });
    return t;
  } };
}
const [gameArea, wineArea] = saveAreas('G'), at = new Date(1700000000000), file = bytes => ({ timestamp: at, mode: 0o100666, contents: new Uint8Array(bytes) });
dbs.set(gameArea.db, new Map([
  [gameArea.root + '/save', { timestamp: at, mode: 0o40777 }],
  [gameArea.root + '/save/01.dat', file([1, 2])],
  [gameArea.root + 'x/other.dat', file([9])], // another game whose name starts the same
]));
dbs.set(wineArea.db, new Map([
  [wineArea.root + '/system.reg', file([7, 7, 7])],
  [wineArea.root + '/drive_c/users/username/Documents/' + escapeName('セーブ.sav'), file([3])],
]));
const synced = await syncedSaves('G');
assert.equal(synced.size, 3);
assert.deepEqual(synced.files.map(f => [f.path, [...f.data], f.mtime]),
  [['game/save/01.dat', [1, 2], +at], ['wine/drive_c/users/username/Documents/セーブ.sav', [3], +at]]);
assert.ok(!reads.some(k => k.endsWith('system.reg') || k.endsWith('other.dat')), 'reads only synced keys');
dbs.get(gameArea.db).set(gameArea.root + '/big.dat', file(SYNC_CAP));
assert.deepEqual(await syncedSaves('G'), { size: SYNC_CAP + 3 });
console.log('vnsaves ok');
