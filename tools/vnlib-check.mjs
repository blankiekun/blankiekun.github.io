// node tools/vnlib-check.mjs: checks js/apps/vnlib.js's chunking, packing, dedup, resume and unpacking against
// packs kept in memory.
import assert from 'node:assert/strict';
// vnlib.js imports consdrive.js, whose util.js reads the page's media queries.
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
const { CHUNK, packGame, unpackGame, knownChunks, planReads, safePath } = await import('../js/apps/vnlib.js');

let seed = 1;
const noise = n => { const u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = (seed = Math.imul(seed, 1103515245) + 12345) >>> 24; return u; };
const file = (path, data) => ({ path, size: data.length, data, read: async (a, b) => data.slice(a, b) });

const engine = noise(300 << 10);
const A = [file('vn/A/game.exe', engine), file('vn/A/data.xp3', noise(CHUNK * 2 + 5)), file('vn/A/text.txt', new TextEncoder().encode('ab'.repeat(5000))),
  file('vn/A/empty.dat', new Uint8Array(0)), file('vn/A/copy.exe', engine)];
const B = [file('vn/B/game.exe', engine), file('vn/B/b.dat', noise(1000))];

const packs = new Map();
let sent = 0;
// Small packs, so these few MB make several.
const PACK = CHUNK + (512 << 10);
const put = async bytes => { assert.ok(bytes.length <= PACK); sent += bytes.length; const id = 'p' + packs.size; packs.set(id, bytes); return id; };
const read = async (id, at, length) => packs.get(id).slice(at, at + length);
async function unpack(m) {
  const out = new Map(), dirs = [];
  await unpackGame(m, { read, mkdir: async p => dirs.push(p), open: async path => {
    const parts = [];
    return { write: async b => parts.push(b.slice()), close: async () => out.set(path, new Uint8Array(await new Blob(parts).arrayBuffer())) };
  } });
  return { out, dirs };
}

const known = new Map();
const mA = await packGame({ title: 'A', files: A, dirs: ['vn/A/save'], known, put, packSize: PACK });
const { out, dirs } = await unpack(mA);
for (const f of A) assert.deepEqual(out.get(f.path), f.data, f.path);
assert.deepEqual(dirs, ['vn/A/save']);
// The copy of game.exe and the repeated text aren't sent twice; the text is gzipped.
assert.ok(sent < engine.length + CHUNK * 2 + 5 + 2000, 'sent ' + sent);

// B shares A's engine: only b.dat goes up.
const before = sent;
const mB = await packGame({ title: 'B', files: B, known: knownChunks([mA]), put, packSize: PACK });
assert.ok(sent - before < 1100, 'B sent ' + (sent - before));
for (const f of B) assert.deepEqual((await unpack(mB)).out.get(f.path), f.data);

// A stop after the first pack: the next upload sends only what's left.
const C = [file('vn/C/a', noise(CHUNK)), file('vn/C/b', noise(CHUNK)), file('vn/C/c', noise(CHUNK))];
const ctl = new AbortController();
let partial = null;
await assert.rejects(packGame({ title: 'C', files: C, known: new Map(), put, saved: async m => { partial = m; ctl.abort(); }, signal: ctl.signal, packSize: PACK }));
assert.ok(partial.files.length >= 1 && partial.files.length < 3);
const mid = sent;
const mC = await packGame({ title: 'C', files: C, known: knownChunks([partial]), put, packSize: PACK });
assert.ok(sent - mid <= CHUNK * 2, 'resume sent ' + (sent - mid));
for (const f of C) assert.deepEqual((await unpack(mC)).out.get(f.path), f.data);

// Neighbouring chunks in one read.
assert.equal(planReads(mA, mA.files.flatMap(f => f[2])).length < mA.files.flatMap(f => f[2]).length, true);

// Paths outside the game's folder are refused.
assert.ok(safePath('A', 'vn/A/x/y.dat'));
assert.ok(safePath('A', 'vn-discs/d1/a.iso'));
for (const p of ['vn/B/x', 'vn/A', 'vn/A/../B/x', 'vn//A/x', '../x/y/z', 'other/A/x', 'vn-discs/a.iso'])
  assert.ok(!safePath('A', p), p);
await assert.rejects(unpack({ ...mB, files: [['vn/A/x', 0, []]] }));

// A damaged pack is caught.
const bad = new Uint8Array(packs.get(mB.packs.at(-1)));
bad[bad.length - 1] ^= 1;
packs.set(mB.packs.at(-1), bad);
await assert.rejects(unpack(mB), /damaged/);
console.log('vnlib ok');
