// node tools/vnsaves-check.mjs: checks js/apps/vnsaves.js's Boxedwine name escaping and path rules.
import assert from 'node:assert/strict';
import { escapeName, unescapeName, savePathParts, isSyncedSave } from '../js/apps/vnsaves.js';

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
console.log('vnsaves ok');
