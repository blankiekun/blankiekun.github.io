// Opening things: files, folders, pages, programs and Run... commands.

import { launch, appInfo } from './wm.js';
import { h, store } from './util.js';
import { msgbox } from './dialogs.js';
import { resolve, pathOf, recycle, openerFor, follow } from './fs.js';

// Starting Windows from inside Windows: the famous blue screen. Any key or click
// goes back to the desktop and nothing is lost; it's only a joke.
export function bsod() {
  const scr = h('div', { class: 'screen bsod', tabindex: '-1', role: 'alert' },
    h('p', null, h('span', null, ' blankiekun 95 ')),
    h('p', null, 'A fatal exception 0E has occurred at 0028:C0011E36 in VXD VMM(01) + 00010E36. The current application will be terminated.'),
    h('p', null, '*  Press any key to terminate the current application.', h('br'),
      '*  Press CTRL+ALT+DEL again to restart your computer. You will lose any unsaved information in all applications.'),
    h('p', null, 'Press any key to continue ', h('i', null, '_')));
  const done = e => { e.preventDefault(); e.stopPropagation(); scr.remove(); removeEventListener('keydown', done, true); };
  addEventListener('keydown', done, true);
  scr.addEventListener('pointerdown', done);
  document.body.append(scr);
  scr.focus();
}

// Program names that Run... and the DOS prompt understand.
export const ALIASES = {
  iexplore: 'ie', ie: 'ie', 'internet explorer': 'ie', explorer: 'explorer',
  winmine: 'minesweeper', minesweeper: 'minesweeper', mines: 'minesweeper',
  sol: 'solitaire', solitaire: 'solitaire',
  onscripter: 'cons', cons: 'cons', 'conscripter player': 'cons',
  notepad: 'notepad', mspaint: 'paint', pbrush: 'paint', paint: 'paint',
  calc: 'calc', calculator: 'calc',
  command: 'dos', cmd: 'dos', 'command.com': 'dos', dos: 'dos',
  control: 'mycomputer:Control Panel', 'desk.cpl': 'display', display: 'display',
  freecell: 'freecell', hearts: 'hearts', mshearts: 'hearts',
  write: 'wordpad', wordpad: 'wordpad', charmap: 'charmap',
  sndrec32: 'sndrec', sndrec: 'sndrec', soundrec: 'sndrec', cdplayer: 'cdplayer', cdplay: 'cdplayer',
  scrnsave: 'screensaver', screensaver: 'screensaver', defrag: 'defrag', scandisk: 'scandisk', scandskw: 'scandisk',
  'main.cpl': 'mouse', mouse: 'mouse', 'intl.cpl': 'regional', 'appwiz.cpl': 'addremove', 'mmsys.cpl': 'sounds',
  hypertrm: 'hyperterm', hyperterm: 'hyperterm', hyperterminal: 'hyperterm', exchng32: 'inbox', exchange: 'inbox', inbox: 'inbox', mail: 'inbox',
    mplayer: 'mplayer', mplay32: 'mplayer', clipbrd: 'clipbrd', printers: 'mycomputer:Printers', 'control printers': 'mycomputer:Printers',
    taskman: 'taskman', welcome: 'welcome', sndvol32: 'volume', network: 'network', 'net view': 'network',
  sysdm: 'sysprops', 'sysdm.cpl': 'sysprops', winver: 'about', help: 'help', winhelp: 'help', find: 'find',
};

export const PROJECTS = { chimimouryou: 'chimimouryou', convert: 'convert', 'conscripter-convert': 'convert', conscripter: 'conscripter', home: 'home', index: 'home' };

export function open(node, parentWin) {
  if (!node) return;
  switch (node.kind) {
    case 'drive':
      if (node.notReady) {
        import('./apps/control.js').then(m => m.playSound('Floppy')).catch(() => {});
        return msgbox({ title: 'A:\\', icon: 'error', text: 'A:\\ is not accessible.\n\nThe device is not ready.', buttons: ['&Retry', 'Cancel'], parent: parentWin })
          .then(b => { if (b === 'Retry') open(node, parentWin); });
      }
      return launch('explorer', node.letter + ':\\');
    case 'folder':
      if (node === recycle) return launch('recycle');
      return launch('explorer', node.virtual || !pathOf(node) ? { node } : pathOf(node));
    case 'app':
      if (node.app === 'setup') return msgbox({ title: 'Setup', icon: 'info', text: 'blankiekun 95 is already installed on this computer.', parent: parentWin });
      return launch(node.app, node.arg);
    case 'page':
      return launch('ie', node.page);
    case 'link':
      window.open(node.href, '_blank', 'noopener');
      return;
    case 'file': {
      const app = openerFor(node);
      remember(node);
      return launch(appInfo(app) ? app : 'notepad', { name: node.name, text: node.text, data: node.data, path: node.user ? pathOf(node) : null });
    }
    case 'shortcut': {
      const t = follow(node);
      if (!t) {
        return msgbox({ title: 'Problem with Shortcut', icon: 'warn', parent: parentWin,
          text: `The item '${node.target ? node.target.split('\\').pop() : node.name}' that this shortcut refers to has been changed or moved, so this shortcut will no longer work properly.` });
      }
      return open(t, parentWin);
    }
    case 'joke':
      return msgbox({ title: node.name, icon: 'warn', text: 'This file is in the Recycle Bin for a reason.\n\nTo use it, you would first have to drag it out. Please don\'t.', parent: parentWin });
  }
}

// Start > Documents lists the last files opened.
export const RECENT = 'w95.recent';
function remember(node) {
  const p = node.user ? pathOf(node) : node.name === 'README.TXT' || node.name === 'TODO.TXT' ? pathOf(node) : null;
  if (!p) return;
  const list = store.get(RECENT, ['C:\\My Documents\\README.TXT', 'C:\\My Documents\\TODO.TXT']).filter(x => x !== p);
  store.set(RECENT, [p, ...list].slice(0, 15));
}

// Start > Run and the DOS prompt's fallback. Returns false when nothing matched.
export function run(cmd, parentWin) {
  const raw = cmd.trim();
  if (!raw) return true;
  const lower = raw.toLowerCase().replace(/\.exe$/, '');
  if (/^https?:\/\//i.test(raw) || /^www\./i.test(raw)) { launch('ie', raw); return true; }
  if (/\.(htm|html)$/i.test(raw)) {
    const key = PROJECTS[lower.replace(/\.html?$/, '')];
    if (key) { launch('ie', key); return true; }
  }
  const [prog, ...rest] = lower.split(/\s+/);
  if (lower === 'win' || lower === 'win.com') { bsod(); return true; }
  const alias = ALIASES[lower] || ALIASES[prog];
  if (alias) {
    if (alias.startsWith('mycomputer:')) launch('explorer', alias.split(':')[1]);
    else if (alias === 'notepad' && rest.length) { const n = resolve('C:\\My Documents\\' + rest.join(' ')); launch('notepad', n ? { name: n.name, text: n.text } : null); }
    else launch(alias, rest.join(' ') || undefined);
    return true;
  }
  if (PROJECTS[lower]) { launch('ie', PROJECTS[lower]); return true; }
  const node = resolve(raw) || resolve('C:\\WINDOWS\\' + raw) || resolve('C:\\My Documents\\' + raw);
  if (node) { open(node, parentWin); return true; }
  return false;
}
