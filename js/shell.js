// Opening things: files, folders, pages, programs and Run... commands.

import { launch } from './wm.js';
import { msgbox } from './dialogs.js';
import { resolve, pathOf, recycle } from './fs.js';

// Program names that Run... and the DOS prompt understand.
export const ALIASES = {
  iexplore: 'ie', ie: 'ie', 'internet explorer': 'ie', explorer: 'explorer',
  winmine: 'minesweeper', minesweeper: 'minesweeper', mines: 'minesweeper',
  sol: 'solitaire', solitaire: 'solitaire',
  notepad: 'notepad', mspaint: 'paint', pbrush: 'paint', paint: 'paint',
  calc: 'calc', calculator: 'calc',
  command: 'dos', cmd: 'dos', 'command.com': 'dos', dos: 'dos',
  control: 'mycomputer:Control Panel', 'desk.cpl': 'display', display: 'display',
  sysdm: 'sysprops', 'sysdm.cpl': 'sysprops', winver: 'about', help: 'help', winhelp: 'help', find: 'find',
};

export const PROJECTS = { chimimouryou: 'chimimouryou', convert: 'convert', 'conscripter-convert': 'convert', conscripter: 'conscripter', home: 'home', index: 'home' };

export function open(node, parentWin) {
  if (!node) return;
  switch (node.kind) {
    case 'drive':
      if (node.notReady) return msgbox({ title: 'A:\\', icon: 'error', text: 'A:\\ is not accessible.\n\nThe device is not ready.', buttons: ['&Retry', 'Cancel'], parent: parentWin })
        .then(b => { if (b === 'Retry') open(node, parentWin); });
      return launch('explorer', node.letter + ':\\');
    case 'folder':
      if (node === recycle) return launch('recycle');
      return launch('explorer', node.virtual ? node.name : pathOf(node));
    case 'app':
      if (node.app === 'setup') return msgbox({ title: 'Setup', icon: 'info', text: 'blankiekun 95 is already installed on this computer.', parent: parentWin });
      return launch(node.app, node.arg);
    case 'page':
      return launch('ie', node.page);
    case 'link':
      window.open(node.href, '_blank', 'noopener');
      return;
    case 'file':
      return launch('notepad', { name: node.name, text: node.text });
    case 'joke':
      return msgbox({ title: node.name, icon: 'warn', text: 'This file is in the Recycle Bin for a reason.\n\nTo use it, you would first have to drag it out. Please don\'t.', parent: parentWin });
  }
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
