// node tools/vnsaves-check.mjs: checks js/apps/vnsaves.js's Boxedwine name escaping and path rules.
import assert from 'node:assert/strict';
import { escapeName, unescapeName, savePathParts } from '../js/apps/vnsaves.js';

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
console.log('vnsaves ok');
