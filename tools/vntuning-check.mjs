// node tools/vntuning-check.mjs: checks js/apps/vntuning.js's address merging and Compatibility round trip.
import assert from 'node:assert/strict';
import { tuned, compatFromTuning, compatParams, tuningPairs, rowsFromText, rowsText } from '../js/apps/vntuning.js';

// Tuned keys replace in place, new ones go on the end, the game and hook stay.
assert.deepEqual(tuned(['lazy=a', 'p=g.exe', 'audioFreq=44100', 'frida=h.js'], 'audioFreq=22050&p=x.exe&frida=y&bpp=16&a=#'),
  ['lazy=a', 'p=g.exe', 'audioFreq=22050', 'frida=h.js', 'bpp=16', 'a=%23']);

const compat = { renderer: 'gdi', version: 'winxp', movies: false, desktop: '800x600',
  dlls: [{ name: 'D3D9', mode: 'n' }, { name: 'bad name', mode: 'b' }],
  registry: [{ key: 'HKCU\\Software\\Wine\\Direct3D', name: 'renderer', type: 'REG_SZ', value: 'gdi' },
    { key: 'HKCU\\Software\\X', name: 'n', type: 'REG_DWORD', value: 'abc' }],
  env: [{ name: 'A_B', value: 'x=y' }, { name: 'WINEDLLOVERRIDES', value: 'z' }] };
const params = compatParams(compat);
assert.ok(params.every(p => !/[&#]/.test(p.slice(p.indexOf('=') + 1)) && p.indexOf('=', p.indexOf('=') + 1) < 0), params.join('&'));
const back = compatFromTuning(tuningPairs(params.join('&')));
assert.deepEqual(back, { ...compat, dlls: [{ name: 'd3d9', mode: 'n' }], registry: compat.registry.slice(0, 1), env: compat.env.slice(0, 1) });
// Nothing set: no params, so boot()'s defaults stay.
assert.deepEqual(compatParams(compatFromTuning([])), []);

const reg = rowsFromText('registry', 'HKCU\\Software\\Wine\\Direct3D | renderer | reg_sz | gdi\nHKLM\\System\\X | a | REG_SZ | b\n\n');
assert.equal(reg.rows.length, 1);
assert.deepEqual(reg.bad, ['HKLM\\System\\X | a | REG_SZ | b']);
assert.equal(rowsText('registry', reg.rows), 'HKCU\\Software\\Wine\\Direct3D | renderer | REG_SZ | gdi');
assert.deepEqual(rowsFromText('dlls', 'd3d9=n\nddraw=\nx=q').bad, ['x=q']);
assert.deepEqual(rowsFromText('env', 'A=1=2').rows, [{ name: 'A', value: '1=2' }]);
console.log('vntuning ok');
