// Which hook script fits a game, picked and saved when it first starts and put first in VNBox's Text
// Hook dialog: by program name, title, or the LunaHook engines' file checks (tools/vnbox-hooks.sh)
// run over the game's files. Ported from chimimouryou's windows-game.ts (hookSuggestion,
// lunaFileCheck, lunaSuggestion). No DOM imports: tools/vnhooks-check.mjs runs it.

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

// Games whose program names no script and whose title isn't the script's (hand-kept).
const knownHooks = { '信天翁航海録.exe': 'PC_Albatross_Koukairoku.js' };
// Program names too common to say which game it is.
const genericPrograms = /^(?:game|start|launcher|main|play|run|setup|app|player)\d*$/;
const hookKey = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
// A script's names: each part of its name ("Romaji (日本語)", "A / B") and its file name.
const scriptKeys = (file, name) => [...name.split(/[/()（）]/), file.replace(/^PC_(?:Steam_|DMM_)?|\.js$/g, '')]
  .map(hookKey).filter(k => k.length >= 3);

// The index entry ([file, name, luna?, exes?]) for a game ({ exe, names, files? }), or undefined: the
// hand-kept table, then a script that names the program, then the best name match with the program's
// name or the titles, then the LunaHook engine whose file checks the game's files pass.
export function hookSuggestion(index, game) {
  const program = game.exe.split(/[\\/]/).pop() || '';
  const known = knownHooks[program];
  if (known && index.some(([f]) => f === known)) return known;
  const byProgram = index.find(([, , , exes]) => (exes || []).some(e => e.toLowerCase() === program.toLowerCase()));
  if (byProgram) return byProgram[0];
  const stem = hookKey(program.replace(/\.exe$/i, ''));
  const names = [...(genericPrograms.test(stem) ? [] : [stem]), ...game.names.map(hookKey)].filter(n => n.length >= 3);
  let best;
  for (const [file, name] of index) {
    for (const key of scriptKeys(file, name)) {
      for (const n of names) {
        // Equal names win; else the longer the shared name, the better (5+ characters, or 3+ in
        // Japanese, where a word is a few characters).
        const short = Math.min(key.length, n.length);
        const enough = short >= (/[\u3040-\u9fff]/.test(key) ? 3 : 5);
        const score = key === n ? 1000 : enough && (key.includes(n) || n.includes(key)) ? short : 0;
        if (score && (!best || score > best.score)) best = { file, score };
      }
    }
  }
  return best ? best.file : game.files && lunaSuggestion(index, game.files, game.exe);
}
