// Boots the desktop, registers the programs, and maps the URL hash to windows.

import { register, launch, appInfo, activeWindow, maximize } from './wm.js';
import { initDesktop, boot } from './desktop.js';
import { OS } from './version.js';
import { initScrollbars } from './fxscroll.js';

document.title = OS;

const MODULES = ['ie', 'explorer', 'notepad', 'minesweeper', 'solitaire', 'conscripter', 'paint', 'calc', 'dos', 'display', 'system',
  'freecell', 'spider', 'viewer', 'hearts', 'wordpad', 'charmap', 'sndrec', 'cdplayer', 'screensaver', 'control', 'taskman', 'disktools',
  'hyperterm', 'inbox', 'mplayer', 'clipbrd', 'printers', 'regedit', 'dialer', 'winpopup', 'sysmon', 'setup', 'reversi', 'clock', 'stickynotes', 'restore', 'settings', 'gadgets'];

// Older links to this site used #welcome, #chimimouryou, #convert and #conscripter.
const LEGACY = { welcome: 'ie/home', chimimouryou: 'ie/chimimouryou', convert: 'ie/convert', conscripter: 'ie/conscripter' };

function route(hash) {
  let r = decodeURIComponent(hash.replace(/^#/, ''));
  r = LEGACY[r] || r;
  if (!r) return false;
  if (r.startsWith('ie/')) { launch('ie', r.slice(3)); return true; }
  if (appInfo(r)) { launch(r); return true; }
  return false;
}

// ?app=cons opens just that program, filling the page, with no desktop or taskbar around it.
const solo = new URLSearchParams(location.search).get('app');

async function start() {
  const loaded = await Promise.allSettled(MODULES.map(m => import(`./apps/${m}.js`)));
  for (const r of loaded) {
    if (r.status !== 'fulfilled') { console.error(r.reason); continue; }
    for (const v of Object.values(r.value)) if (v && v.id && v.open) register(v);
    if (r.value.applyDisplay) r.value.applyDisplay();
  }
  initDesktop();
  if (solo && appInfo(solo)) {
    const w = launch(solo);
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

// Offline: sw.js keeps the site's files as they load. The ones loaded before it ran, and
// CONscripter's engine (only fetched once a game starts), are handed to it the first time.
if ('serviceWorker' in navigator) {
  const first = !navigator.serviceWorker.controller;
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(reg => {
    if (!first) return;
    const own = u => new URL(u, location.href).origin === location.origin;
    reg.active.postMessage({ cache: [location.pathname, 'cons/player.html', 'cons/conscripter.js', 'cons/conscripter.wasm',
      ...performance.getEntriesByType('resource').map(e => e.name).filter(own)] });
  }).catch(() => {}));
}
