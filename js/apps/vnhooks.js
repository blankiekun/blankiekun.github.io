// Which LunaHook engine port fits a game, for VNBox's Text Hook dialog: the index's file checks
// (tools/vnbox-hooks.sh) run over the game's files. Ported from chimimouryou's windows-game.ts
// (lunaFileCheck, lunaSuggestion). No DOM imports: tools/vnhooks-check.mjs runs it.

// LunaHook's Util::CheckFile: a name with * and ? wildcards, matched case-insensitively against the
// files and folders in the program's folder (or below it, for a name with a folder in it).
export function lunaFileCheck(name, files, exe) {
  const exeDir = exe.includes('/') ? exe.slice(0, exe.lastIndexOf('/') + 1) : '';
  const paths = new Set();
  for (const file of files) {
    if (!file.startsWith(exeDir)) continue;
    const parts = file.slice(exeDir.length).split('/');
    parts.forEach((_, at) => paths.add(parts.slice(0, at + 1).join('/').toLowerCase()));
  }
  const spec = name.replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
  const pattern = new RegExp('^' + spec.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*').replaceAll('?', '[^/]') + '$');
  return [...paths].some(p => pattern.test(p));
}

// The index entry ([file, name, luna?]) of the engine first in LunaHook's order whose file checks
// pass, or undefined.
export function lunaSuggestion(index, files, exe) {
  let best;
  for (const [file, , luna] of index) {
    for (const e of luna || []) {
      const check = name => lunaFileCheck(name, files, exe);
      const passes = e.all ? e.all.every(check) : e.any ? e.any.some(check) : false;
      if (passes && (!best || e.order < best.order)) best = { file, order: e.order };
    }
  }
  return best && best.file;
}
