// Boots the desktop, registers the programs, and maps the URL hash to windows.

import { register, launch, appInfo, activeWindow, maximize } from './wm.js';
import { initDesktop, boot } from './desktop.js';
import { OS } from './version.js';
import { msgbox } from './dialogs.js';
import { initScrollbars } from './fxscroll.js';

document.title = `${OS} - chimimouryou, CONscripter, conscripter-convert`;

// Loaded at boot: Display and Settings apply the saved look, Control Panel plays the sounds and
// draws mouse trails, the screen saver keeps the idle timer, Setup shows its balloon, and
// Printers fills the Printers folder.
const EAGER = ['display', 'settings', 'control', 'screensaver', 'setup', 'printers'];

// The rest load the first time they're opened. Until then the Start menu, desktop and Run box
// know them from this: module, then [id, title, icon, single] for each program it registers.
const LAZY = {
  ie: [['ie', 'Internet Explorer', 'i-ie', 1]],
  explorer: [['explorer', 'Explorer', 'i-folder-open'], ['mycomputer', 'My Computer', 'i-computer'], ['network', 'Network Neighborhood', 'i-network'], ['recycle', 'Recycle Bin', 'i-trash-full']],
  notepad: [['notepad', 'Notepad', 'i-notepad']], minesweeper: [['minesweeper', 'Minesweeper', 'i-mine', 1]], solitaire: [['solitaire', 'Solitaire', 'i-sol', 1]],
  conscripter: [['cons', 'CONscripter', 'i-game', 1]], paint: [['paint', 'Paint', 'i-paint']], calc: [['calc', 'Calculator', 'i-calc']], dos: [['dos', 'MS-DOS Prompt', 'i-dos']],
  system: [['about', 'About', 'i-flag'], ['datetime', 'Date/Time', 'i-ctrl', 1], ['find', 'Find', 'i-find', 1], ['help', 'Help', 'i-helpbook', 1], ['sysprops', 'System Properties', 'i-computer', 1], ['welcome', 'Welcome', 'i-flag', 1]],
  freecell: [['freecell', 'FreeCell', 'i-freecell', 1]], spider: [['spider', 'Spider Solitaire', 'i-spider', 1]], viewer: [['viewer', 'Picture Viewer', 'i-viewer']],
  hearts: [['hearts', 'Hearts', 'i-hearts', 1]], wordpad: [['wordpad', 'WordPad', 'i-wordpad']], charmap: [['charmap', 'Character Map', 'i-charmap', 1]],
  sndrec: [['sndrec', 'Sound Recorder', 'i-sndrec']], cdplayer: [['cdplayer', 'CD Player', 'i-cdplayer', 1]], taskman: [['taskman', 'Close Program', 'i-exe']],
  disktools: [['defrag', 'Disk Defragmenter', 'i-defrag'], ['scandisk', 'ScanDisk', 'i-drive']], hyperterm: [['hyperterm', 'HyperTerminal', 'i-hyperterm']],
  inbox: [['inbox', 'Inbox - blankiekun Exchange', 'i-inbox', 1]], mplayer: [['mplayer', 'Media Player', 'i-mplayer']], clipbrd: [['clipbrd', 'Clipboard Viewer', 'i-clipbrd', 1]],
  regedit: [['regedit', 'Registry Editor', 'i-regedit']], dialer: [['dialer', 'Phone Dialer', 'i-dialer']], winpopup: [['winpopup', 'WinPopup', 'i-winpopup']],
  sysmon: [['sysmon', 'System Monitor', 'i-sysmon'], ['resmeter', 'Resource Meter', 'i-resmeter']], reversi: [['reversi', 'Reversi', 'i-reversi']], clock: [['clock', 'Clock', 'i-clock']],
  stickynotes: [['stickynotes', 'Sticky Notes', 'i-stickynotes']], restore: [['restore', 'System Restore', 'i-clock', 1]], snip: [['snip', 'Snipping Tool', 'i-snip']], gadgets: [['gadgets', 'Gadgets', 'i-programs']],
  crashme: [['crashme', 'CRASHME', 'i-exe', 1]], reader: [['reader', 'chimimouryou Reader (demo)', 'i-reader', 1]],
};
// Modules only the lazy programs import, so the service worker can keep them for offline too.
const HELPERS = ['filedlg', 'send', 'config', 'helptopics', 'charms', 'apps/cards', 'apps/consfmt', 'apps/conssave', 'apps/consdrive', 'apps/consanki', 'apps/filemgr', 'apps/dosedit', 'assistant'];

const registerAll = mod => { for (const v of Object.values(mod)) if (v && v.id && v.open) register(v); };
const loading = {};
// launch() calls this for a program still in the table; the module's register() replaces the entry.
const load = m => loading[m] ||= import(`./apps/${m}.js`).then(registerAll, e => {
  delete loading[m]; console.error(e);
  msgbox({ title: m, icon: 'error', text: `Cannot find '${m}.exe' or one of its components.` });
});
for (const [m, list] of Object.entries(LAZY))
  for (const [id, title, icon, single] of list) register({ id, title, icon, single: !!single, load: () => load(m) });

// Close Program. Most systems keep Ctrl+Alt+Del for themselves; Ctrl+Alt+End and Ctrl+Shift+Esc get through.
document.addEventListener('keydown', e => {
  const cad = e.ctrlKey && e.altKey && (e.key === 'Delete' || e.key === 'End');
  const cse = e.ctrlKey && e.shiftKey && e.key === 'Escape';
  if (!cad && !cse) return;
  e.preventDefault();
  launch('taskman');
});

// Older links to this site used #welcome, #chimimouryou, #convert and #conscripter.
const LEGACY = { welcome: 'ie/home', chimimouryou: 'ie/chimimouryou', convert: 'ie/convert', conscripter: 'ie/conscripter' };

function route(hash) {
  let r = decodeURIComponent(hash.replace(/^#/, ''));
  r = LEGACY[r] || r;
  if (!r) return false;
  if (r.startsWith('ie/')) { launch('ie', r.slice(3)); return true; }
  const [id, arg] = r.split('/');  // #cons/demo: a program and what to open in it
  if (appInfo(id)) { launch(id, arg); return true; }
  return false;
}

// ?app=cons opens just that program, filling the page, with no desktop or taskbar around it.
const solo = new URLSearchParams(location.search).get('app');

async function start() {
  const loaded = await Promise.allSettled(EAGER.map(m => import(`./apps/${m}.js`)));
  for (const r of loaded) {
    if (r.status !== 'fulfilled') { console.error(r.reason); continue; }
    registerAll(r.value);
    if (r.value.applyDisplay) r.value.applyDisplay();
  }
  initDesktop();
  if (solo && appInfo(solo)) {
    const w = await launch(solo);
    if (w) {
      maximize(w); w.el.classList.add('solo-win'); document.title = w.opts.title;
      // Exiting the program goes to the full desktop rather than an empty page.
      const closed = w.opts.onClosed;
      w.opts.onClosed = () => { if (closed) closed(); location.href = location.pathname; };
      return;
    }
  }
  // Vista and 7 put back the gadgets that were open last visit.
  import('./apps/gadgets.js').then(m => m.reopen());
  window.addEventListener('hashchange', () => {
    const w = activeWindow();
    const cur = w && w.route ? (typeof w.route === 'function' ? w.route() : w.route) : '';
    if (location.hash.slice(1) !== cur) route(location.hash);
  });
  if (!route(location.hash)) launch('ie', 'home');
}

if (solo) document.body.classList.add('solo'); else boot();
start();
initScrollbars();

// Offline: sw.js keeps the site's files as they load. The ones loaded before it ran are handed
// to it the first time, with the programs not opened yet. CONscripter's engine (5MB, only fetched once a game starts) is not:
// it's kept when a game first loads it, so a visitor who only reads never downloads it.
if ('serviceWorker' in navigator) {
  const first = !navigator.serviceWorker.controller;
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(reg => {
    if (!first) return;
    const own = u => new URL(u, location.href).origin === location.origin;
    reg.active.postMessage({ cache: [location.pathname,
      ...performance.getEntriesByType('resource').map(e => e.name).filter(own),
      ...Object.keys(LAZY).map(m => `js/apps/${m}.js`), ...HELPERS.map(m => `js/${m}.js`)] });
  }).catch(() => {}));
}
