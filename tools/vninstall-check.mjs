// node tools/vninstall-check.mjs: checks js/apps/vninstall.js's disc grouping, ISO 9660 reader (2048 and
// raw 2352-byte sectors), autorun.inf, installer kinds and .lnk targets on files built here.
import assert from 'node:assert/strict';
import { discsOf, listDisc, autorunProgram, installerKind, lnkTarget, copyProtection, discPrograms, programRoot } from '../js/apps/vninstall.js';

// A record: extent sector, size, flags, name.
function record(sector, size, dir, name) {
  const n = typeof name === 'string' ? new TextEncoder().encode(name) : name;
  const r = new Uint8Array(33 + n.length + (n.length % 2 ? 0 : 1));
  const dv = new DataView(r.buffer);
  r[0] = r.length; dv.setUint32(2, sector, true); dv.setUint32(10, size, true); r[25] = dir ? 2 : 0; r[32] = n.length; r.set(n, 33);
  return r;
}
function iso() {
  const s = new Uint8Array(21 * 2048), at = n => n * 2048;
  s.set([1, ...new TextEncoder().encode('CD001')], at(16));
  s.set(new TextEncoder().encode('MY_GAME'.padEnd(32)), at(16) + 40);
  s.set(record(18, 2048, true, [0]), at(16) + 156);
  s.set([255, ...new TextEncoder().encode('CD001')], at(17));
  let o = at(18);
  for (const r of [record(18, 2048, true, [0]), record(18, 2048, true, [1]), record(20, 27, false, 'AUTORUN.INF;1'), record(19, 2048, true, 'DATA'), record(20, 4, false, 'SETUP.EXE;1')]) { s.set(r, o); o += r.length; }
  o = at(19);
  for (const r of [record(19, 2048, true, [0]), record(18, 2048, true, [1]), record(20, 4, false, 'GAME.EXE;1')]) { s.set(r, o); o += r.length; }
  s.set(new TextEncoder().encode('[autorun]\nopen=SETUP.EXE /x'), at(20));
  return s;
}
const plain = iso();
const raw = new Uint8Array(21 * 2352);
for (let i = 0; i < 21; i++) raw.set(plain.subarray(i * 2048, (i + 1) * 2048), i * 2352 + 16);

for (const [name, data] of [['game.iso', plain], ['game.bin', raw]]) {
  const list = await listDisc({ main: new File([data], name), files: [new File([data], name)] });
  assert.equal(list.label, 'MY_GAME');
  assert.deepEqual(list.files.map(f => f.path), ['AUTORUN.INF', 'DATA/GAME.EXE', 'SETUP.EXE']);
  const auto = autorunProgram(new TextDecoder().decode(await list.read(list.files[0])));
  assert.deepEqual(auto, { program: 'SETUP.EXE', args: '/x' });
  assert.deepEqual(discPrograms(list.files, auto), ['SETUP.EXE', 'DATA/GAME.EXE']);
}
assert.equal(await listDisc({ main: new File([new Uint8Array(40000)], 'x.iso'), files: [new File([new Uint8Array(40000)], 'x.iso')] }), null);

// A CUE takes its BINs; an MDS its MDF; discs in name order.
const cue = new File(['FILE "Disc 2.bin" BINARY\n  TRACK 01 MODE1/2352'], 'Disc 2.cue');
const bin = new File(['x'], 'disc 2.bin'), mds = new File(['m'], 'Disc 1.mds'), mdf = new File(['f'], 'Disc 1.mdf');
const discs = await discsOf([bin, mdf, cue, mds]);
assert.deepEqual(discs.map(d => d.files.map(f => f.name)), [['Disc 1.mds', 'Disc 1.mdf'], ['Disc 2.cue', 'disc 2.bin']]);

assert.deepEqual(autorunProgram('[other]\nopen=a.exe\n[AutoRun]\nopen="sub\\My Setup.exe" -q'), { program: 'sub/My Setup.exe', args: '-q' });
assert.equal(installerKind(new TextEncoder().encode('..N\0u\0l\0l\0s\0o\0f\0t\0..')), 'nsis');
assert.equal(installerKind(new TextEncoder().encode('Inno Setup Setup Data')), 'inno');
assert.equal(installerKind(new Uint8Array(10)), undefined);
assert.deepEqual(copyProtection(['DATA/secdrv.sys', 'x.exe']), ['SafeDisc']);
assert.equal(programRoot({ area: 1, path: 'drive_c/Program Files/Maker/Game/game.exe' }), 'drive_c/Program Files/Maker');
assert.equal(programRoot({ area: 1, path: 'drive_c/Game/game.exe' }), 'drive_c/Game');
assert.equal(programRoot({ area: 0, path: 'game.exe' }), '');

// A shortcut with only LinkInfo's ANSI local path.
const lnk = new Uint8Array(0x4c + 0x1c + 20), dv = new DataView(lnk.buffer);
dv.setUint32(0, 0x4c, true); dv.setUint32(0x14, 2, true);
dv.setUint32(0x4c, 0x1c + 20, true); dv.setUint32(0x4c + 4, 0x1c, true); dv.setUint32(0x4c + 8, 1, true); dv.setUint32(0x4c + 0x10, 0x1c, true);
lnk.set(new TextEncoder().encode('C:\\files\\g\\a.exe'), 0x4c + 0x1c);
assert.equal(lnkTarget(lnk), 'C:\\files\\g\\a.exe');
console.log('vninstall ok');
