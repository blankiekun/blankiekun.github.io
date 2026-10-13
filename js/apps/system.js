// System Properties, Help, Find and Date/Time.

import { h, icon } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { about } from '../dialogs.js';
import { walk, kindLabel, sizeLabel } from '../fs.js';
import { open as shellOpen } from '../shell.js';

const GITHUB = 'https://github.com/blankiekun';

function tabbed(names, panels) {
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
      h('p', null, 'System:', h('br'), h('span', { class: 'ind' }, 'blankiekun 95'), h('br'), h('span', { class: 'ind' }, '4.00.950 B')),
      h('p', null, 'Registered to:', h('br'), h('span', { class: 'ind' }, 'blankiekun'), h('br'),
        h('span', { class: 'ind' }, h('a', { href: GITHUB, target: '_blank', rel: 'noopener' }, 'github.com/blankiekun'))),
      h('p', null, 'Computer:', h('br'), h('span', { class: 'ind' }, 'Builds tools for reading Japanese:'), h('br'),
        h('span', { class: 'ind' }, 'an e-book reader, a visual novel'), h('br'), h('span', { class: 'ind' }, 'engine, and a game converter.'), h('br'),
        h('span', { class: 'ind' }, '16.0MB RAM'))));

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
        h('dt', null, 'Memory:'), h('dd', null, '16.0 MB of RAM'),
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

const TOPICS = [
  { book: 'Introducing blankiekun 95', pages: [
    ['Welcome', `<p>This desktop is <b>blankiekun</b>'s homepage. It holds three open-source projects for reading Japanese:</p>
      <ul><li><b>chimimouryou</b>, a self-hosted e-book reader for your Calibre library.</li>
      <li><b>CONscripter</b>, the visual novel engine chimimouryou uses to play games in the browser.</li>
      <li><b>conscripter-convert</b>, which turns games made with other engines into games CONscripter can play.</li></ul>
      <p><a href="#" data-ie="home">Open the homepage in Internet Explorer</a></p>`],
    ['Where to find the projects', `<p>Open <b>Internet Explorer</b> from the desktop. Every project has its own page. Use the <b>Links</b> bar or the <b>Favorites</b> menu to move between them.</p>
      <p>You can also click <b>Start</b>, point to <b>Programs</b>, then <b>Projects</b>.</p>
      <p>The source code is on GitHub: <a href="${GITHUB}" target="_blank" rel="noopener">github.com/blankiekun</a></p>`],
  ] },
  { book: 'How To...', pages: [
    ['Open a program', `<p>Double-click its icon on the desktop. On a touch screen, tap it once.</p><p>Or click <b>Start</b> and choose it from the menu. If you know its name, click <b>Start</b>, click <b>Run</b>, and type it (try <code>winmine</code>, <code>notepad</code> or <code>command</code>).</p>`],
    ['Move or resize a window', `<p>Drag the window's title bar. An outline follows the pointer and the window moves when you release the button. Press <b>Esc</b> while dragging to cancel.</p><p>To resize, drag any edge or corner of the window.</p><p>Double-click the title bar to maximize or restore the window.</p>`],
    ['Switch between windows', `<p>Each open window has a button on the taskbar. Click it to bring the window to the front. Click the button of the window that is already in front to minimize it.</p>`],
    ['Change the desktop', `<p>Right-click an empty part of the desktop and click <b>Properties</b>, or click <b>Start</b>, point to <b>Settings</b>, and click <b>Display</b>.</p><p>You can choose a pattern, a wallpaper, a desktop colour, and a colour scheme for windows. Your choices are saved in this browser.</p>`],
  ] },
  { book: 'Games', pages: [
    ['Minesweeper', `<p>Find the mines without uncovering any of them. A number tells you how many mines touch that square.</p><ul><li>Left-click a square to uncover it.</li><li>Right-click (or press and hold) to place a flag.</li><li>Click a number whose mines are all flagged to uncover its neighbours.</li><li><b>F2</b> starts a new game.</li></ul>`],
    ['Solitaire', `<p>Move all the cards onto the four suit stacks in the top right, from Ace to King.</p><ul><li>In the seven columns, build down in alternating colours.</li><li>Only a King can fill an empty column.</li><li>Click the deck to turn cards over.</li><li>Double-click a card to send it to its suit stack. Right-click the table to send every card that can go.</li></ul>`],
  ] },
  { book: 'Tips', pages: [
    ['Keyboard shortcuts', `<table><tr><td><b>Ctrl+Esc</b></td><td>Open the Start menu</td></tr><tr><td><b>Esc</b></td><td>Close a menu, or cancel a drag</td></tr><tr><td><b>Alt+Left</b></td><td>Back, in Internet Explorer</td></tr><tr><td><b>F5</b></td><td>Refresh, in Internet Explorer</td></tr><tr><td><b>F2</b></td><td>New game, in Minesweeper and Solitaire</td></tr><tr><td><b>Enter</b></td><td>Open the selected icon</td></tr></table>`],
    ['Links to this desktop', `<p>The address bar of your real browser follows the window in front, so you can share a link to it. For example, <code>#ie/chimimouryou</code> opens the chimimouryou page and <code>#minesweeper</code> opens Minesweeper.</p>`],
  ] },
];

function help(arg) {
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
  const win = createWindow({ app: 'help', title: 'blankiekun 95 Help', icon: 'i-helpbook', body, width: 600, height: 400, minW: 280, minH: 200, route: 'help' });
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

const aboutApp = { id: 'about', title: 'About', icon: 'i-flag', open: () => about('Windows', 'i-computer') };

export const sysApp = { id: 'sysprops', title: 'System Properties', icon: 'i-computer', single: true, open: sysprops };
export const helpApp = { id: 'help', title: 'Help', icon: 'i-helpbook', single: true, open: help };
export const findApp = { id: 'find', title: 'Find', icon: 'i-find', single: true, open: find };
export const dtApp = { id: 'datetime', title: 'Date/Time', icon: 'i-ctrl', single: true, open: datetime };
export { aboutApp };
