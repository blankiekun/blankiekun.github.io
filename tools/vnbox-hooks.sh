#!/bin/sh
# Copies 0xDC00's text hook scripts for PC games (github.com/0xDC00/scripts, MIT) into vnbox/hooks/,
# with the libraries they require, and lists them in vnbox/hooks/index.json for VNBox's Text Hook dialog.
# usage: tools/vnbox-hooks.sh [path to a clone of 0xDC00/scripts]   (default: a fresh clone)
set -eu
cd "$(dirname "$0")/.."
src=${1:-}
if [ -z "$src" ]; then
  src=$(mktemp -d)
  trap 'rm -rf "$src"' EXIT
  git clone -q --depth 1 https://github.com/0xDC00/scripts "$src"
fi
rm -rf vnbox/hooks
mkdir -p vnbox/hooks
cp "$src/LICENSE" vnbox/hooks/
node - "$src" vnbox/hooks <<'EOF'
const fs = require('fs'), path = require('path');
const [src, out] = process.argv.slice(2);
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
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(list) + '\n');
console.log(list.length + ' hooks, ' + copy.size + ' files');
EOF
