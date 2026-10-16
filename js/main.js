// Boots the desktop, registers the programs, and maps the URL hash to windows.

import { register, launch, appInfo, activeWindow } from './wm.js';
import { initDesktop, boot, freshBoot } from './desktop.js';
import { store } from './util.js';

const MODULES = ['ie', 'explorer', 'notepad', 'minesweeper', 'solitaire', 'conscripter', 'paint', 'calc', 'dos', 'display', 'system',
  'freecell', 'hearts', 'wordpad', 'charmap', 'sndrec', 'cdplayer', 'screensaver', 'control', 'taskman', 'disktools', 'printers', 'mplayer', 'clipbrd'];

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

async function start() {
  const loaded = await Promise.allSettled(MODULES.map(m => import(`./apps/${m}.js`)));
  for (const r of loaded) {
    if (r.status !== 'fulfilled') { console.error(r.reason); continue; }
    for (const v of Object.values(r.value)) if (v && v.id && v.open) register(v);
    if (r.value.applyDisplay) r.value.applyDisplay();
  }
  initDesktop();
  window.addEventListener('hashchange', () => {
    const w = activeWindow();
    const cur = w && w.route ? (typeof w.route === 'function' ? w.route() : w.route) : '';
    if (location.hash.slice(1) !== cur) route(location.hash);
  });
  if (!route(location.hash)) launch('ie', 'home');
  if (freshBoot && store.get('w95.welcome', true)) launch('welcome');
}

boot();
start();
