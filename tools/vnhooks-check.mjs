// node tools/vnhooks-check.mjs: checks js/apps/vnhooks.js's CheckFile wildcards and engine order, and
// that vnbox/hooks/index.json's engine entries name files that are there.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hookSuggestion, lunaFileCheck, lunaSuggestion } from '../js/apps/vnhooks.js';

const files = ['game/Game.exe', 'game/data/script.xp3', 'game/Data/a.cpk', 'other/x.pak'];
assert.ok(lunaFileCheck('*.xp3', files, 'game/Game.exe') === false); // not in the program's folder
assert.ok(lunaFileCheck('data\\*.xp3', files, 'game/Game.exe'));
assert.ok(lunaFileCheck('DATA', files, 'game/Game.exe'));
assert.ok(lunaFileCheck('data/?.cpk', files, 'game/Game.exe'));
assert.ok(!lunaFileCheck('x.pak', files, 'game/Game.exe'));
const index = [['a.js', 'A'], ['engines/K.js', 'K', [{ order: 9, any: ['data/*.xp3'] }]], ['engines/C.js', 'C', [{ order: 3, all: ['data', 'data/*.cpk'] }]]];
assert.equal(lunaSuggestion(index, files, 'game/Game.exe'), 'engines/C.js');
assert.equal(lunaSuggestion(index, ['Game.exe'], 'Game.exe'), undefined);

const scripts = [['PC_Albatross_Koukairoku.js', 'Albatross Koukairoku (信天翁航海録)'], ['PC_Steam_Fate_Stay_Night.js', 'Fate/stay night REMASTERED'],
  ['PC_Muv_Luv.js', 'Muv-Luv', null, ['muvluv.exe']], ['PC_Summer_Pockets.js', 'Summer Pockets', null, ['SiglusEngine.exe']]];
const suggest = (exe, ...names) => hookSuggestion(scripts, { exe, names });
assert.equal(suggest('信天翁航海録.exe', 'whatever'), 'PC_Albatross_Koukairoku.js');
assert.equal(suggest('bin/MuvLuv.EXE'), 'PC_Muv_Luv.js');
assert.equal(suggest('game.exe', 'Summer Pockets'), 'PC_Summer_Pockets.js');
assert.equal(suggest('game.exe', 'fate stay night'), 'PC_Steam_Fate_Stay_Night.js');
assert.equal(suggest('start.exe', '信天翁航海録 体験版'), 'PC_Albatross_Koukairoku.js');
assert.equal(suggest('game.exe', 'game'), undefined);
assert.equal(suggest('foo.exe', 'Unknown Novel'), undefined);
const engines = [...scripts, ['engines/KiriKiri.js', 'KiriKiri (LunaHook engine)', [{ order: 11, any: ['*.xp3'] }]],
  ['engines/Majiro.js', 'Majiro (LunaHook engine)', [{ order: 19, any: ['data*.arc', 'stream*.arc'] }]]];
const pick = (exe, files) => hookSuggestion(engines, { exe, names: ['Unknown Novel'], files });
assert.equal(pick('game.exe', ['game.exe', 'DATA.XP3', 'scenario1.arc']), 'engines/KiriKiri.js');
assert.equal(pick('game.exe', ['game.exe', 'stream01.arc']), 'engines/Majiro.js');
assert.equal(pick('game.exe', ['game.exe']), undefined);
assert.equal(hookSuggestion(engines, { exe: 'muvluv.exe', names: [], files: ['a.xp3'] }), 'PC_Muv_Luv.js');

const real = JSON.parse(fs.readFileSync(new URL('../vnbox/hooks/index.json', import.meta.url)));
for (const [file] of real) assert.ok(fs.existsSync(new URL('../vnbox/hooks/' + file, import.meta.url)), file);
assert.ok(real.some(e => e[3] && e[3].length), 'index.json lists programs');
assert.equal(lunaSuggestion(real, ['data.xp3', 'game.exe'], 'game.exe') !== undefined, true);
console.log('vnhooks ok');
