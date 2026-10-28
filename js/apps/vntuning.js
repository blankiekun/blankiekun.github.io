// A VNBox game's tuning: VNBox address settings (a=b&c=d) the visitor sets per game in Game > Tuning,
// added to the address boot() builds. Ported from chimimouryou (apps/web/src/lib/data/windows-game.ts).
// The Compatibility settings are Wine fixes (registry, wine-override, wine-env, reg, desktop); the
// values are checked as VNBox's shell checks them, since they reach a `cmd /c reg add ... &` chain and
// Wine's environment.

// The game folder, program and hook: never tuned.
const LOCKED = new Set(['lazy', 'p', 'frida', 'cdrom']);
// boot()'s wine-override: no Mono/Gecko installs, and no crash debugger (a launcher that faults as it
// hands over to the game would start winedbg, which is slow here and its dialog takes the screen).
export const OVERRIDES = ['nomono', 'winedbg.exe='];
export const COMPAT_KEYS = new Set(['registry', 'wine-override', 'wine-env', 'reg', 'desktop']);
export const VERSIONS = ['win95', 'win98', 'winme', 'win2k', 'winxp', 'win7', 'win10'];

export const validDesktop = size => /^\d{3,4}x\d{3,4}$/.test(size);
export const validDll = ({ name }) => /^[a-z0-9_.-]{1,64}$/i.test(name);
export const validEnv = ({ name, value }) => /^[A-Za-z_]\w{0,63}$/.test(name) && name.toUpperCase() !== 'WINEDLLOVERRIDES'
  && !/[\x00-\x1f]/.test(value) && value.length <= 1000;
export const validReg = ({ key, name, type, value }) =>
  /^(HKCU|HKLM|HKEY_CURRENT_USER|HKEY_LOCAL_MACHINE)\\Software(\\[^\\]+)*$/i.test(key)
  && [key, name, value].every(f => f.length <= 260 && !/["&|<>^%\x00-\x1f]/.test(f))
  && (type === 'REG_SZ' || /^(0x[0-9a-f]{1,8}|\d{1,10})$/i.test(value));

export const keyOf = pair => pair.split('=')[0];
export const tuningPairs = tuning => (tuning || '').split('&').filter(Boolean);

// The address params with the tuning in: a tuned key replaces the default in place (VNBox takes
// the first key= in the address), the others go on the end. Values are raw, as typed.
export function tuned(params, tuning) {
  const out = [...params];
  for (const pair of tuningPairs((tuning || '').replaceAll('#', '%23'))) {
    const key = keyOf(pair);
    if (!key || LOCKED.has(key)) continue;
    const at = out.findIndex(p => keyOf(p) === key);
    if (at < 0) out.push(pair); else out[at] = pair;
  }
  return out;
}

// The Compatibility settings read back from a tuning's pairs:
// { renderer ('' | 'gl' | 'gdi'), version ('' | VERSIONS), movies, desktop, dlls: [{ name, mode ('n' | 'b' | '') }],
//   registry: [{ key, name, type ('REG_SZ' | 'REG_DWORD'), value }], env: [{ name, value }] }.
export function compatFromTuning(pairs) {
  const get = key => {
    const pair = pairs.find(p => keyOf(p) === key);
    try { return pair ? decodeURIComponent(pair.slice(key.length + 1)) : ''; } catch { return ''; }
  };
  const lines = key => get(key).split('\n').filter(Boolean);
  const list = key => get(key).replace(/^\[|\]$/g, '').split(',');
  const presets = list('registry'), overrides = list('wine-override').filter(i => i.includes('=') && !OVERRIDES.includes(i));
  return {
    renderer: presets.find(n => n === 'gl' || n === 'gdi') || '',
    version: presets.find(n => VERSIONS.includes(n)) || '',
    movies: !overrides.includes('quartz='),
    desktop: get('desktop'),
    dlls: overrides.filter(i => i !== 'quartz=').map(i => { const [name, mode] = i.split('='); return { name, mode: mode === 'n' || mode === 'b' ? mode : '' }; }),
    registry: lines('reg').map(line => { const [key = '', name = '', type, value = ''] = line.split('\t'); return { key, name, type: type === 'REG_DWORD' ? type : 'REG_SZ', value }; }),
    env: lines('wine-env').map(line => ({ name: line.slice(0, Math.max(0, line.indexOf('='))), value: line.slice(line.indexOf('=') + 1) })),
  };
}

// The Compatibility settings as address params (encoded: no &, = or # inside a value), invalid rows
// left out. They replace boot()'s registry=jpfonts and OVERRIDES, so both stay in.
export function compatParams(c) {
  const presets = [c.renderer, c.version].filter(Boolean);
  const overrides = [...(c.movies ? [] : ['quartz=']), ...c.dlls.filter(validDll).map(d => `${d.name.toLowerCase()}=${d.mode}`)];
  const reg = c.registry.filter(validReg).map(r => [r.key, r.name, r.type, r.value].join('\t'));
  const env = c.env.filter(validEnv).map(r => `${r.name}=${r.value}`);
  const param = (key, items, join) => items.length ? [`${key}=${encodeURIComponent(items.join(join))}`] : [];
  return [
    ...param('registry', presets.length ? ['jpfonts', ...presets] : [], ','),
    ...param('wine-override', overrides.length ? [...OVERRIDES, ...overrides] : [], ','),
    ...param('wine-env', env.slice(0, 32), '\n'),
    ...param('reg', reg.slice(0, 64), '\n'),
    ...(validDesktop(c.desktop) ? [`desktop=${c.desktop}`] : []),
  ];
}

// The Tuning dialog edits the row lists as text, one row a line:
// DLLs "d3d9=n" (n native, b built-in, nothing after = off), registry "key | name | REG_SZ | value"
// (validReg rules out |), environment "NAME=value".
const ROWS = {
  dlls: {
    parse: line => { const [name, mode = ''] = line.split('='); return { name: name.trim(), mode: mode.trim() }; },
    valid: r => validDll(r) && ['n', 'b', ''].includes(r.mode),
    text: r => `${r.name}=${r.mode}`,
  },
  registry: {
    parse: line => { const [key = '', name = '', type = '', value = ''] = line.split('|').map(s => s.trim()); return { key, name, type: type.toUpperCase(), value }; },
    valid: r => (r.type === 'REG_SZ' || r.type === 'REG_DWORD') && validReg(r),
    text: r => [r.key, r.name, r.type, r.value].join(' | '),
  },
  env: {
    parse: line => ({ name: line.slice(0, Math.max(0, line.indexOf('='))).trim(), value: line.slice(line.indexOf('=') + 1) }),
    valid: validEnv,
    text: r => `${r.name}=${r.value}`,
  },
};
export const rowsText = (kind, rows) => rows.map(ROWS[kind].text).join('\n');
// { rows, bad: the lines that aren't valid rows }
export function rowsFromText(kind, text) {
  const lines = text.split('\n').filter(l => l.trim()), k = ROWS[kind];
  return { rows: lines.map(k.parse).filter(k.valid), bad: lines.filter(l => !k.valid(k.parse(l))) };
}
