#!/bin/sh
# Copies 0xDC00's text hook scripts for PC games (github.com/0xDC00/scripts, MIT) into vnbox/hooks/,
# with the libraries they require, and chimimouryou's LunaHook engine ports (GPL-3.0-or-later,
# github.com/blankiekun/chimimouryou scripts/vnbox/engines/) into vnbox/hooks/engines/, and lists them
# in vnbox/hooks/index.json for VNBox's Text Hook dialog: [file, name, luna?], luna being the engines'
# file checks ([{ order, all?, any? }], LunaHook's order and CheckFile names) VNBox suggests a port from.
# usage: tools/vnbox-hooks.sh [clone of 0xDC00/scripts] [clone of chimimouryou]   (default: fresh clones)
set -eu
cd "$(dirname "$0")/.."
src=${1:-}
chimi=${2:-}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
[ -n "$src" ] || { src=$tmp/dc00; git clone -q --depth 1 https://github.com/0xDC00/scripts "$src"; }
[ -n "$chimi" ] || { chimi=$tmp/chimi; git clone -q --depth 1 --filter=blob:none --sparse https://github.com/blankiekun/chimimouryou "$chimi"; git -C "$chimi" sparse-checkout set scripts/vnbox/engines; }
rm -rf vnbox/hooks
mkdir -p vnbox/hooks/engines
cp "$src/LICENSE" vnbox/hooks/
cp "$chimi"/scripts/vnbox/engines/*.js vnbox/hooks/engines/
cp "$chimi"/scripts/vnbox/engines/order.mjs "$tmp/order.mjs"
cat > vnbox/hooks/engines/NOTICE <<'NOTE'
The LunaHook engine hooks here are ported from LunaHook in LunaTranslator
(https://github.com/HIllya51/LunaTranslator, commit be625f4), Copyright (c) HIllya51 and contributors,
licensed under the GNU General Public License v3.0. The ports, by chimimouryou
(https://github.com/blankiekun/chimimouryou, scripts/vnbox/engines/), are GPL-3.0-or-later: see
https://www.gnu.org/licenses/gpl-3.0.html. Each file is its own source.
NOTE
node - "$src" vnbox/hooks "$tmp/order.mjs" <<'EOF2'
const fs = require('fs'), path = require('path');
const [src, out, order] = process.argv.slice(2);
const copy = new Set(), list = [];
const add = f => {
  if (copy.has(f) || !fs.existsSync(path.join(src, f))) return;
  copy.add(f);
  const text = fs.readFileSync(path.join(src, f), 'utf8');
  for (const m of text.matchAll(/require\(\s*['"]\.\/([^'"]+)['"]\s*\)/g)) add(m[1]);
};
for (const f of fs.readdirSync(src).filter(f => /^PC_.*\.js$/.test(f)).sort()) {
  add(f);
  const name = (fs.readFileSync(path.join(src, f), 'utf8').match(/@name\s+(.+)/) || [])[1];
  list.push([f, (name || f.replace(/^PC_|\.js$/g, '').replace(/_/g, ' ')).trim()]);
}
for (const f of copy) fs.copyFileSync(path.join(src, f), path.join(out, f));

// The engine files export L.engine({ name, check, files? }) objects; loading them runs no hook
// (as chimimouryou's hook-index.mjs does).
(async () => {
  const { ORDER } = await import(order);
  const dir = path.join(out, 'engines'), cache = new Map();
  const load = file => {
    const full = path.resolve(dir, file);
    if (cache.has(full)) return cache.get(full).exports;
    const module = { exports: {}, parent: {}, id: full };
    cache.set(full, module);
    new Function('require', 'module', 'exports', fs.readFileSync(full, 'utf8'))(load, module, module.exports);
    return module.exports;
  };
  const checks = c => c && typeof c === 'object' ? 'FILE' in c ? { any: [c.FILE] } : 'FILE_ALL' in c ? { all: c.FILE_ALL } : 'FILE_ANY' in c ? { any: c.FILE_ANY } : {} : {};
  let engines = 0;
  list.unshift(['engines/PC_LunaEngines.js', 'LunaHook engines (automatic: the first engine that fits the game)']);
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'libLuna.js' && f !== 'PC_LunaEngines.js').sort()) {
    const exported = [].concat(load(file));
    const luna = exported.map(e => ({ order: ORDER.indexOf(e.name), ...(e.files ? { any: e.files } : checks(e.check)) }));
    engines += luna.length;
    list.push(['engines/' + file, exported.map(e => e.name).join(' / ') + ' (LunaHook engine)', luna]);
  }
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(list) + '\n');
  console.log(list.length + ' hooks, ' + copy.size + ' dc00 files, ' + engines + ' LunaHook engines');
})();
EOF2
