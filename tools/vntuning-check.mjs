// node tools/vntuning-check.mjs: checks js/apps/vntuning.js's address merging and Compatibility round trip.
import assert from 'node:assert/strict';
import { tuned, compatFromTuning, compatParams, tuningPairs, rowsFromText, rowsText, engineOptions, numberValue } from '../js/apps/vntuning.js';

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

// vnbox-options.json: known schema only, experimental left out, group order, the site's own defaults.
const json = { schema: 1, groups: ['Speed', 'Display'], options: [
  { name: 'fitWindow', type: 'bool', default: false, urlValues: { true: 'true', false: 'false' }, group: 'Display' },
  { name: 'nativeLibc', type: 'bool', default: true, urlValues: { true: '1', false: '0' }, group: 'Speed' },
  { name: 'hotMax', type: 'int', default: 1024, min: 1, max: 9, group: 'Debug', experimental: true },
  { name: 'fps', type: 'int', default: 60, min: 0, max: 240, group: 'Display' }] };
const eo = engineOptions(json);
assert.deepEqual(eo.map(o => [o.name, o.initial]), [['nativeLibc', '1'], ['fitWindow', 'true'], ['fps', '60']]);
assert.deepEqual(engineOptions({ ...json, schema: 2 }), []);
assert.deepEqual(engineOptions(null), []);
const fps = eo[2];
assert.equal(numberValue(fps, ' 30 '), '30');
assert.equal(numberValue(fps, ''), '60');
assert.equal(numberValue(fps, '241'), null);
assert.equal(numberValue(fps, '2.5'), null);
assert.equal(numberValue(fps, 'abc'), null);
console.log('vntuning ok');
