// System Properties, Help, Find and Date/Time.

import { h, icon } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { about } from '../dialogs.js';
import { walk, kindLabel, sizeLabel } from '../fs.js';
import { open as shellOpen } from '../shell.js';
import { TOPICS } from '../helptopics.js';
import { OS, V, ram } from '../version.js';

const GITHUB = 'https://github.com/blankiekun';

export function tabbed(names, panels) {
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, ...names.map((t, i) => {
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === 0) }, t);
    b.addEventListener('click', () => {
      tabs.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
      panels.forEach((p, j) => { p.hidden = j !== i; });
    });
    return b;
  }));
  panels.forEach((p, i) => { p.hidden = i !== 0; });
  return h('div', { class: 'dp-tabs' }, tabs, h('div', { class: 'tabpanel' }, ...panels));
}

// ---------- System Properties ----------

const DEVICES = [
  { name: 'chimimouryou', icon: 'i-book', page: 'chimimouryou', detail: 'Japanese e-book reader for Calibre libraries. Svelte, TypeScript. Docker images for amd64 and arm64.' },
  { name: 'CONscripter', icon: 'i-game', page: 'conscripter', detail: 'ONScripter engine for NScripter visual novels. C++, GPL-2.0. Web, Windows, Linux, macOS, Android, RetroArch.' },
  { name: 'conscripter-convert', icon: 'i-convert', page: 'convert', detail: 'Converts visual novels you own to CONscripter games. Rust, GPL-3.0. Xuse supported, Nitroplus in progress.' },
];

function sysprops() {
  const general = h('div', { class: 'sp-general' },
    h('div', { class: 'sp-pc' }, icon('i-computer')),
    h('div', { class: 'sp-text' },
      h('p', null, 'System:', h('br'), h('span', { class: 'ind' }, OS), ...V.sys.split('\n').flatMap(l => [h('br'), h('span', { class: 'ind' }, l)])),
      h('p', null, 'Registered to:', h('br'), h('span', { class: 'ind' }, 'blankiekun'), h('br'),
        h('span', { class: 'ind' }, h('a', { href: GITHUB, target: '_blank', rel: 'noopener' }, 'github.com/blankiekun'))),
      h('p', null, 'Computer:', h('br'), h('span', { class: 'ind' }, 'Builds tools for reading Japanese:'), h('br'),
        h('span', { class: 'ind' }, 'an e-book reader, a visual novel'), h('br'), h('span', { class: 'ind' }, 'engine, and a game converter.'), h('br'),
        h('span', { class: 'ind' }, ram(V.ramKB) + ' RAM'))));

  let picked = null;
  const info = h('div', { class: 'sp-detail' }, 'Select a device to see its status.');
  const tree = h('div', { class: 'listbox sp-tree', tabindex: '0', role: 'tree', 'aria-label': 'Devices' },
    h('div', { class: 'opt' }, icon('i-computer'), 'Computer'),
    h('div', { class: 'opt sp-cat' }, icon('i-folder-open'), 'Projects'),
    ...DEVICES.map(d => {
      const o = h('div', { class: 'opt sp-dev', role: 'treeitem', tabindex: '-1' }, icon(d.icon), d.name);
      o.addEventListener('click', () => { picked = d; tree.querySelectorAll('.opt').forEach(x => x.classList.toggle('sel', x === o)); info.textContent = d.name + ': This device is working properly. ' + d.detail; propsBtn.disabled = false; });
      o.addEventListener('dblclick', () => launch('ie', d.page));
      return o;
    }));
  const propsBtn = h('button', { class: 'btn', type: 'button', disabled: true, onclick: () => picked && launch('ie', picked.page) }, 'P', h('u', null, 'r'), 'operties');
  const devices = h('div', { class: 'sp-devices' }, tree, info,
    h('div', { class: 'btns right' }, propsBtn));

  const perf = h('div', { class: 'sp-perf' },
    h('fieldset', { class: 'group' }, h('legend', null, 'Performance status'),
      h('dl', null,
        h('dt', null, 'Memory:'), h('dd', null, ram(V.ramKB) + ' of RAM'),
        h('dt', null, 'System Resources:'), h('dd', null, '87% free'),
        h('dt', null, 'File System:'), h('dd', null, '32-bit'),
        h('dt', null, 'Virtual Memory:'), h('dd', null, '32-bit'),
        h('dt', null, 'Disk Compression:'), h('dd', null, 'Not installed'),
        h('dt', null, 'Open source projects:'), h('dd', null, '3')),
      h('p', null, 'Your system is configured for optimal performance.')));

  const body = h('div', { class: 'dlg sp' },
    tabbed(['General', 'Device Manager', 'Performance'], [general, devices, perf]),
    h('div', { class: 'btns right' },
      h('button', { class: 'btn default', type: 'button', onclick: () => win.close() }, 'OK'),
      h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel')));
  body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  const win = createWindow({ app: 'sysprops', title: 'System Properties', icon: 'i-computer', body, dialog: true, resizable: false, width: 'auto', route: 'sysprops', taskbar: true, help: () => launch('help') });
  return win;
}

// ---------- Help ----------

// Help and Support, Me to 8: the same topics as a web page, with Home, Index and Search.
function helpCenter(arg) {
  const pages = TOPICS.flatMap(t => t.pages.map(([title, html]) => ({ book: t.book, title, html })));
  const side = h('nav', { class: 'hs-side' }), view = h('div', { class: 'hp-view hs-view' });
  const back = [], fwd = [];
  let cur = null;
  const link = (label, place, on) => h('a', { href: '#', class: on ? 'on' : '', onclick: e => { e.preventDefault(); go(place); } }, label);
  // A place is a page, { book }, { index: true }, { search }, or {} for Home.
  function go(place, record = true) { if (record && cur) { back.push(cur); fwd.length = 0; } cur = place; draw(); }
  function draw() {
    const p = cur, books = TOPICS.map(t => link(t.book, { book: t.book }, p.book === t.book));
    if (p.title) {
      side.replaceChildren(h('h4', null, p.book), ...pages.filter(x => x.book === p.book).map(x => link(x.title, x, x === p)), h('h4', null, 'Home'), ...books);
      view.innerHTML = `<h3>${p.title}</h3>${p.html}`;
    } else if (p.book) {
      side.replaceChildren(h('h4', null, 'Home'), ...books);
      view.replaceChildren(h('h3', null, p.book), h('ul', null, ...pages.filter(x => x.book === p.book).map(x => h('li', null, link(x.title, x)))));
    } else if (p.index || p.search != null) {
      const q = (p.search || '').toLowerCase();
      const hits = pages.filter(x => !q || (x.title + ' ' + x.html.replace(/<[^>]+>/g, ' ')).toLowerCase().includes(q)).sort((x, y) => x.title.localeCompare(y.title));
      side.replaceChildren(h('h4', null, p.index ? 'Index' : `Search results for "${p.search}"`), ...hits.map(x => link(x.title, x)), hits.length ? null : h('p', null, 'No topics found.'));
      view.replaceChildren(h('h3', null, p.index ? 'Index' : 'Search'), h('p', null, hits.length ? 'Pick a topic on the left.' : 'Try another word.'));
    } else {
      side.replaceChildren(h('h4', null, 'Home'), ...books);
      view.replaceChildren(h('h3', null, 'Welcome to Help and Support'), h('p', null, 'Pick a topic on the left, look one up in the Index, or type a word in Search.'),
        ...TOPICS.flatMap(t => [h('h4', null, t.book), h('ul', null, ...pages.filter(x => x.book === t.book).map(x => h('li', null, link(x.title, x))))]));
    }
    view.scrollTop = 0;
    bBack.disabled = !back.length; bFwd.disabled = !fwd.length;
  }
  view.addEventListener('click', e => {
    const a = e.target.closest('a[data-ie]');
    if (a) { e.preventDefault(); launch('ie', a.dataset.ie); }
  });
  const tb = (label, fn) => h('button', { class: 'hs-btn', type: 'button', onclick: fn }, label);
  const bBack = tb('Back', () => { fwd.push(cur); cur = back.pop(); draw(); });
  const bFwd = tb('Forward', () => { back.push(cur); cur = fwd.pop(); draw(); });
  const q = h('input', { class: 'field hs-q', type: 'search', 'aria-label': 'Search' });
  const form = h('form', { class: 'hs-search' }, h('label', null, 'Search'), q, h('button', { class: 'hs-btn', type: 'submit' }, 'Go'));
  form.addEventListener('submit', e => { e.preventDefault(); go({ search: q.value.trim() }); });
  const body = h('div', { class: 'hs' },
    h('div', { class: 'hs-band' }, h('b', null, 'Help and Support'), h('span', null, OS)),
    h('div', { class: 'hs-bar' }, bBack, bFwd, tb('Home', () => go({})), tb('Index', () => go({ index: true })), form),
    h('div', { class: 'hs-main' }, side, view));
  const win = createWindow({ app: 'help', title: 'Help and Support', icon: 'i-helpbook', body, width: 680, height: 460, minW: 320, minH: 240, route: 'help' });
  go(pages.find(x => x.title === arg) || {}, false);
  return win;
}

// WinHelp's books up to 2000, Help and Support from Me to 8, and in 10 and 11 a page on the web.
const CENTER = ['me', 'xp', 'vista', '7', '8'];
function help(arg) {
  if (['10', '11'].includes(V.id)) return launch('ie', 'help');
  if (CENTER.includes(V.id)) return helpCenter(arg);
  const view = h('div', { class: 'hp-view' });
  let selRow = null;
  const tree = h('div', { class: 'listbox hp-tree', tabindex: '0', role: 'tree', 'aria-label': 'Contents' });
  const rows = [];
  TOPICS.forEach(t => {
    const pages = h('div', { class: 'hp-pages' });
    const book = h('div', { class: 'opt hp-book', role: 'treeitem', 'aria-expanded': 'true' }, icon('i-helpbook'), t.book);
    book.addEventListener('click', () => { pages.hidden = !pages.hidden; book.setAttribute('aria-expanded', String(!pages.hidden)); });
    t.pages.forEach(([title, html]) => {
      const r = h('div', { class: 'opt hp-page', role: 'treeitem', tabindex: '-1' }, h('span', { class: 'hp-q' }, '?'), title);
      r.addEventListener('click', () => show(r, title, html));
      rows.push([r, title, html]);
      pages.append(r);
    });
    tree.append(book, pages);
  });
  function show(r, title, html) {
    if (selRow) selRow.classList.remove('sel');
    selRow = r; r.classList.add('sel');
    view.innerHTML = `<h3>${title}</h3>${html}`;
    view.scrollTop = 0;
  }
  view.addEventListener('click', e => {
    const a = e.target.closest('a[data-ie]');
    if (a) { e.preventDefault(); launch('ie', a.dataset.ie); }
  });
  const body = h('div', { class: 'hp' }, tree, view);
  const win = createWindow({ app: 'help', title: OS + ' Help', icon: 'i-helpbook', body, width: 600, height: 400, minW: 280, minH: 200, route: 'help' });
  const first = rows.find(r => r[1] === arg) || rows[0];
  show(...first);
  return win;
}

// ---------- Find ----------

function find() {
  const named = h('input', { class: 'field', id: 'find-named', autocomplete: 'off' });
  const where = h('select', { class: 'field', id: 'find-where' },
    h('option', { value: '' }, 'My Computer'), h('option', { value: 'C:\\' }, '(C:)'), h('option', { value: 'D:\\' }, 'Projects (D:)'));
  const results = h('div', { class: 'listbox fd-results', role: 'listbox', 'aria-label': 'Results' });
  const status = h('div', { class: 'statusbar' }, h('span', null, 'Enter a name and click Find Now.'));
  let sel = null;

  function search(e) {
    if (e) e.preventDefault();
    const q = named.value.trim().toLowerCase().replace(/\*/g, '');
    const base = where.value;
    results.replaceChildren(h('div', { class: 'fd-row fd-head' }, h('span', null, 'Name'), h('span', null, 'In Folder'), h('span', null, 'Size'), h('span', null, 'Type')));
    let n = 0;
    walk((node, p, parent) => {
      if (base && !p.startsWith(base)) return;
      if (q && !node.name.toLowerCase().includes(q)) return;
      if (node.kind === 'drive') return;
      n++;
      const r = h('div', { class: 'fd-row opt', tabindex: '-1' }, h('span', null, icon(node.icon || (node.kind === 'folder' ? 'i-folder' : 'i-txt')), node.name), h('span', null, parent || 'My Computer'), h('span', null, sizeLabel(node)), h('span', null, kindLabel(node)));
      r.addEventListener('click', () => { if (sel) sel.classList.remove('sel'); sel = r; r.classList.add('sel'); });
      r.addEventListener('dblclick', () => shellOpen(node, win));
      results.append(r);
    });
    status.firstChild.textContent = n + ' file(s) found';
    results.hidden = false;
  }

  const form = h('form', { class: 'fd' },
    tabbed(['Name & Location', 'Date Modified', 'Advanced'], [
      h('div', { class: 'fd-fields' },
        h('label', { class: 'dp-row', for: 'find-named' }, h('span', { html: '<u>N</u>amed:' }), named),
        h('label', { class: 'dp-row', for: 'find-where' }, h('span', { html: '<u>L</u>ook in:' }), where),
        h('label', { class: 'dp-row' }, h('input', { type: 'checkbox', checked: true }), 'Include ', h('u', null, 's'), 'ubfolders')),
      h('div', { class: 'fd-fields' }, h('label', { class: 'dp-row' }, h('input', { type: 'radio', name: 'fd-date', checked: true }), 'All files')),
      h('div', { class: 'fd-fields' }, h('label', { class: 'dp-row' }, h('span', null, 'Of type:'), h('select', { class: 'field' }, h('option', null, 'All Files and Folders')))),
    ]),
    h('div', { class: 'fd-btns' },
      h('button', { class: 'btn default', type: 'submit', html: 'F<u>i</u>nd Now' }),
      h('button', { class: 'btn', type: 'button', disabled: true }, 'Stop'),
      h('button', { class: 'btn', type: 'button', html: 'Ne<u>w</u> Search', onclick: () => { named.value = ''; results.hidden = true; status.firstChild.textContent = 'Enter a name and click Find Now.'; named.focus(); } })));
  form.addEventListener('submit', search);
  results.hidden = true;
  const body = h('div', { class: 'fd-wrap' }, form, results, status);
  const win = createWindow({ app: 'find', title: 'Find: All Files', icon: 'i-find', body, width: 520, height: 'auto', minW: 300, minH: 200, route: 'find', autofocus: '#find-named' });
  named.focus();
  return win;
}

// ---------- Date/Time ----------

function datetime() {
  const now = new Date();
  const cal = h('div', { class: 'dt-cal' });
  const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  cal.append(...['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => h('b', null, d)));
  for (let i = 0; i < first; i++) cal.append(h('span'));
  for (let d = 1; d <= days; d++) cal.append(h('span', { class: d === now.getDate() ? 'today' : '' }, String(d)));
  const canvas = h('canvas', { width: 120, height: 120, class: 'dt-clock', 'aria-label': 'Clock' });
  const digital = h('div', { class: 'field dt-digital' });
  function draw() {
    const t = new Date();
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, 120, 120);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      c.fillStyle = i % 3 ? '#008080' : '#000';
      const s = i % 3 ? 3 : 5;
      c.fillRect(Math.round(60 + Math.sin(a) * 50 - s / 2), Math.round(60 - Math.cos(a) * 50 - s / 2), s, s);
    }
    const hand = (a, len, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(60, 60); c.lineTo(60 + Math.sin(a) * len, 60 - Math.cos(a) * len); c.stroke(); };
    hand((t.getHours() % 12 + t.getMinutes() / 60) * Math.PI / 6, 28, 4, '#000');
    hand((t.getMinutes() + t.getSeconds() / 60) * Math.PI / 30, 40, 3, '#000');
    hand(t.getSeconds() * Math.PI / 30, 44, 1, '#800000');
    digital.textContent = t.toLocaleTimeString('en-US');
  }
  draw();
  const timer = setInterval(draw, 1000);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
  const body = h('div', { class: 'dlg dt' },
    tabbed(['Date & Time', 'Time Zone'], [
      h('div', { class: 'dt-grid' },
        h('fieldset', { class: 'group' }, h('legend', null, 'Date'),
          h('div', { class: 'dt-month' }, h('span', { class: 'field' }, now.toLocaleDateString('en-US', { month: 'long' })), h('span', { class: 'field' }, String(y))), cal),
        h('fieldset', { class: 'group' }, h('legend', null, 'Time'), canvas, digital)),
      h('div', { class: 'dt-tz' }, h('p', null, 'Current time zone:'), h('p', { class: 'field' }, tz)),
    ]),
    h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'button', onclick: () => win.close() }, 'OK'), h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel')));
  body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  const win = createWindow({ app: 'datetime', title: 'Date/Time Properties', icon: 'i-ctrl', body, dialog: true, resizable: false, width: 'auto', taskbar: true, onClosed: () => clearInterval(timer) });
  return win;
}

// ---------- Welcome ----------

const TIPS = [
  'To open a program, double-click its icon on the desktop. On a touch screen, tap it once.',
  'chimimouryou is a self-hosted e-book reader for your Calibre library, made for reading Japanese. Open Internet Explorer to read about it.',
  'CONscripter plays NScripter visual novels right in the browser. It\'s on the desktop: drop a game folder on its window.',
  'You can save files on drive C:. Saving to 3½ Floppy (A:) downloads the file to your real computer.',
  'Right-click the taskbar to Cascade or Tile your windows, or to minimize them all at once.',
  'Click the icon in the top-left corner of a window for the system menu. Double-click it to close the window.',
  'Drag files onto the Recycle Bin to delete them. If you change your mind, open the Recycle Bin and choose Restore.',
  'To see the folders on your computer as a tree, click Start, point to Programs, and click Windows Explorer.',
  'Press Ctrl+Alt+End to open Close Program. Pressing it again restarts the computer.',
  'Display Properties has screen savers. Right-click the desktop, click Properties, and look under the Screen Saver tab.',
  'Draw something in Paint or write a note in Notepad, and you can send it straight to blankiekun.',
  'conscripter-convert turns games made with other engines into games CONscripter can play.',
];

function welcome() {
  let i = Math.floor(Math.random() * TIPS.length);
  const tip = h('p', { class: 'wl-tip' });
  const show = () => { tip.textContent = TIPS[i % TIPS.length]; };
  show();
  const btn = (label, fn) => h('button', { class: 'btn', type: 'button', onclick: fn }, h('span', { html: label }));
  const body = h('div', { class: 'dlg wl' },
    h('div', { class: 'wl-head' }, h('span', null, 'Welcome to '), h('b', null, 'blankiekun'), h('sup', null, V.short)),
    h('div', { class: 'wl-main' },
      h('div', { class: 'wl-box' }, h('div', { class: 'wl-did' }, icon('i-info'), h('b', null, 'Did you know...')), tip),
      h('div', { class: 'wl-btns' },
        btn('<u>W</u>indows Tour', () => { win.close(); launch('ie', 'home'); }),
        btn('What\'s <u>N</u>ew', () => launch('help', 'Welcome')),
        btn('<u>O</u>nline Registration', () => window.open(GITHUB, '_blank', 'noopener')),
        h('hr', { class: 'pr-sep' }),
        btn('Next <u>T</u>ip', () => { i++; show(); }),
        h('button', { class: 'btn default', type: 'button', onclick: () => win.close() }, 'Close'))));
  body.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); win.close(); }
    if (e.key.toLowerCase() === 't' && !e.ctrlKey) { i++; show(); }
  });
  const win = createWindow({ app: 'welcome', title: 'Welcome', body, dialog: true, resizable: false, width: 'auto', taskbar: true });
  body.querySelector('.btn.default').focus();
  return win;
}

const aboutApp = { id: 'about', title: 'About', icon: 'i-flag', open: () => about('Windows', 'i-computer') };

export const sysApp = { id: 'sysprops', title: 'System Properties', icon: 'i-computer', single: true, open: sysprops };
export const helpApp = { id: 'help', title: 'Help', icon: 'i-helpbook', single: true, open: help };
export const findApp = { id: 'find', title: 'Find', icon: 'i-find', single: true, open: find };
export const dtApp = { id: 'datetime', title: 'Date/Time', icon: 'i-ctrl', single: true, open: datetime };
export { aboutApp };
export const welcomeApp = { id: 'welcome', title: 'Welcome', icon: 'i-flag', single: true, open: welcome };
