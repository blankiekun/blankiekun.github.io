// Opening things: files, folders, pages, programs and Run... commands.

import { launch, appInfo } from './wm.js';
import { h, store } from './util.js';
import { msgbox } from './dialogs.js';
import { resolve, pathOf, recycle, openerFor, follow } from './fs.js';
import { OS, V } from './version.js';

// Starting Windows from inside Windows: the famous blue screen, in each era's own style. Any key or
// click goes back to the desktop and nothing is lost; it's only a joke.
// shortcut: the QR-like square is random cells with three corner marks, it doesn't encode anything.
export function bsod() {
  let tick = 0;
  const modern = ['8', '10', '11'].includes(V.id);
  const scr = h('div', { class: 'screen bsod' + (modern ? ' sad' : ''), tabindex: '-1', role: 'alert' });
  if (modern) {
    const pct = h('b', null, '0'), qr = h('canvas', { width: 25, height: 25 }), g = qr.getContext('2d');
    for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
      const d = Math.min(...[[3, 3], [21, 3], [3, 21]].map(([cx, cy]) => Math.max(Math.abs(x - cx), Math.abs(y - cy))));
      if (d < 4 ? d !== 2 : Math.random() < .5) g.fillRect(x, y, 1, 1);
    }
    tick = setInterval(() => { if (pct.textContent < 100) pct.textContent = +pct.textContent + 1; }, 120);
    scr.append(h('div', { class: 'face' }, ':('),
      h('p', null, 'Your PC ran into a problem and needs to restart. We\'re just collecting some error info, and then we\'ll restart for you.'),
      h('p', null, pct, '% complete'),
      h('div', { class: 'qr' }, qr, h('p', null, 'This is only a joke. Press any key or click to go back.', h('br'), h('br'), 'Stop code: BLANKIEKUN_JOKE_EXCEPTION')));
  } else if (V.nt) {
    scr.append(h('p', null, '*** STOP: 0x0000001E (0xC0000005, 0x80123456, 0x00000000, 0x00000000)'),
      h('p', null, 'KMODE_EXCEPTION_NOT_HANDLED'),
      h('p', null, '*** Address 80123456 base at 80100000, DateStamp 3844d96e - blankiekun.sys'),
      h('p', null, 'If this is the first time you have seen this screen, restart your computer. If this screen appears again, follow these steps:\n\nCheck for viruses, and make sure any new hardware or software is properly installed. This is only a joke, nothing was harmed.'),
      h('p', null, 'Press any key to return to the desktop ', h('i', null, '_')));
  } else {
    scr.append(h('p', null, h('span', null, ' ' + OS + ' ')),
      h('p', null, 'A fatal exception 0E has occurred at 0028:C0011E36 in VXD VMM(01) + 00010E36. The current application will be terminated.'),
      h('p', null, '*  Press any key to terminate the current application.', h('br'),
        '*  Press CTRL+ALT+DEL again to restart your computer. You will lose any unsaved information in all applications.'),
      h('p', null, 'Press any key to continue ', h('i', null, '_')));
  }
  const done = e => { e.preventDefault(); e.stopPropagation(); scr.remove(); clearInterval(tick); removeEventListener('keydown', done, true); };
  addEventListener('keydown', done, true);
  scr.addEventListener('pointerdown', done);
  document.body.append(scr);
  scr.focus();
}

// Program names that Run... and the DOS prompt understand.
export const ALIASES = {
  iexplore: 'ie', ie: 'ie', 'internet explorer': 'ie', explorer: 'explorer', setup: 'setup',
  winmine: 'minesweeper', minesweeper: 'minesweeper', mines: 'minesweeper',
  sol: 'solitaire', solitaire: 'solitaire',
  onscripter: 'cons', cons: 'cons', 'conscripter player': 'cons', vnbox: 'vnbox', boxedwine: 'vnbox', wine: 'vnbox',
  notepad: 'notepad', mspaint: 'paint', pbrush: 'paint', paint: 'paint',
  calc: 'calc', calculator: 'calc',
  command: 'dos', cmd: 'dos', 'command.com': 'dos', dos: 'dos',
  control: 'mycomputer:Control Panel', 'desk.cpl': 'display', display: 'display',
  spider: 'spider', freecell: 'freecell', hearts: 'hearts', mshearts: 'hearts',
  write: 'wordpad', wordpad: 'wordpad', charmap: 'charmap',
  sndrec32: 'sndrec', sndrec: 'sndrec', soundrec: 'sndrec', cdplayer: 'cdplayer', cdplay: 'cdplayer',
  scrnsave: 'screensaver', screensaver: 'screensaver', defrag: 'defrag', scandisk: 'scandisk', scandskw: 'scandisk',
  'main.cpl': 'mouse', mouse: 'mouse', 'intl.cpl': 'regional', 'appwiz.cpl': 'addremove', 'mmsys.cpl': 'sounds',
  hypertrm: 'hyperterm', hyperterm: 'hyperterm', hyperterminal: 'hyperterm', exchng32: 'inbox', exchange: 'inbox', inbox: 'inbox', mail: 'inbox',
    mplayer: 'mplayer', mplay32: 'mplayer', clipbrd: 'clipbrd', printers: 'mycomputer:Printers', 'control printers': 'mycomputer:Printers',
    taskman: 'taskman', welcome: 'welcome', sndvol32: 'volume', network: 'network', 'net view': 'network',
  sysdm: 'sysprops', 'sysdm.cpl': 'sysprops', winver: 'about', help: 'help', winhelp: 'help', find: 'find',
  reversi: 'reversi', clock: 'clock', stikynot: 'stickynotes', 'sticky notes': 'stickynotes', regedit: 'regedit', regedt32: 'regedit', dialer: 'dialer', winpopup: 'winpopup', sysmon: 'sysmon', rsrcmtr: 'resmeter',
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
      if (node.briefcase && !store.get('w95.briefcase', false)) {
        store.set('w95.briefcase', true);
        return msgbox({ title: 'Welcome to the Windows Briefcase', icon: 'i-briefcase', buttons: ['&Finish'], parent: parentWin,
          text: 'Use Briefcase to keep copies of your files up to date when you work on two computers.\n\n1. Copy files to Briefcase.\n2. Take Briefcase with you on a floppy disk, and edit the files there.\n3. When you come back, use Update All on the Briefcase menu to update the original files.' })
          .then(() => open(node, parentWin));
      }
      return launch('explorer', node.virtual || !pathOf(node) ? { node } : pathOf(node));
    case 'app':
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
