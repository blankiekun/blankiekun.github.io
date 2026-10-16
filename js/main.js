// Boots the desktop, registers the programs, and maps the URL hash to windows.

import { register, launch, appInfo, activeWindow, maximize } from './wm.js';
import { initDesktop, boot, freshBoot } from './desktop.js';
import { store } from './util.js';

const MODULES = ['ie', 'explorer', 'notepad', 'minesweeper', 'solitaire', 'conscripter', 'paint', 'calc', 'dos', 'display', 'system',
  'freecell', 'hearts', 'wordpad', 'charmap', 'sndrec', 'cdplayer', 'screensaver', 'control', 'taskman', 'disktools',
  'hyperterm', 'inbox', 'mplayer', 'clipbrd', 'printers'];

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
  window.addEventListener('hashchange', () => {
    const w = activeWindow();
    const cur = w && w.route ? (typeof w.route === 'function' ? w.route() : w.route) : '';
    if (location.hash.slice(1) !== cur) route(location.hash);
  });
  if (!route(location.hash)) launch('ie', 'home');
  if (freshBoot && store.get('w95.welcome', true)) launch('welcome');
}

if (solo) document.body.classList.add('solo'); else boot();
start();
