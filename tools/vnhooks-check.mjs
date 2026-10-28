// node tools/vnhooks-check.mjs: checks js/apps/vnhooks.js's CheckFile wildcards and engine order, and
// that vnbox/hooks/index.json's engine entries name files that are there.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lunaFileCheck, lunaSuggestion } from '../js/apps/vnhooks.js';

const files = ['game/Game.exe', 'game/data/script.xp3', 'game/Data/a.cpk', 'other/x.pak'];
assert.ok(lunaFileCheck('*.xp3', files, 'game/Game.exe') === false); // not in the program's folder
assert.ok(lunaFileCheck('data\\*.xp3', files, 'game/Game.exe'));
assert.ok(lunaFileCheck('DATA', files, 'game/Game.exe'));
assert.ok(lunaFileCheck('data/?.cpk', files, 'game/Game.exe'));
assert.ok(!lunaFileCheck('x.pak', files, 'game/Game.exe'));
const index = [['a.js', 'A'], ['engines/K.js', 'K', [{ order: 9, any: ['data/*.xp3'] }]], ['engines/C.js', 'C', [{ order: 3, all: ['data', 'data/*.cpk'] }]]];
assert.equal(lunaSuggestion(index, files, 'game/Game.exe'), 'engines/C.js');
assert.equal(lunaSuggestion(index, ['Game.exe'], 'Game.exe'), undefined);

const real = JSON.parse(fs.readFileSync(new URL('../vnbox/hooks/index.json', import.meta.url)));
for (const [file] of real) assert.ok(fs.existsSync(new URL('../vnbox/hooks/' + file, import.meta.url)), file);
assert.equal(lunaSuggestion(real, ['data.xp3', 'game.exe'], 'game.exe') !== undefined, true);
console.log('vnhooks ok');
