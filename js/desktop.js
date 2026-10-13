// The desktop surface: icons, right-click menu, Start menu, tray clock,
// and the boot / shut down / log off screens.

import { h, icon, clamp, wait, small, reducedMotion } from './util.js';
import { openMenu, closeMenus, isOpen } from './menu.js';
import { launch, createWindow, all, close, deactivate, appInfo } from './wm.js';
import { msgbox } from './dialogs.js';
import { run } from './shell.js';
import { recycle } from './fs.js';

const GITHUB = 'https://github.com/blankiekun';
const desktopEl = document.getElementById('desktop');
const iconsEl = document.getElementById('icons');

// ---------- icons ----------

const ICONS = [
  { label: 'My Computer', app: 'mycomputer', icon: 'i-computer', type: 'System', open: () => launch('mycomputer') },
  { label: 'Recycle Bin', app: 'recycle', icon: () => recycle.children.length ? 'i-trash-full' : 'i-trash', type: 'System', open: () => launch('recycle') },
  { label: 'Internet Explorer', app: 'ie', icon: 'i-ie', type: 'Application', open: () => launch('ie', 'home') },
  { label: 'Minesweeper', app: 'minesweeper', icon: 'i-mine', type: 'Application', open: () => launch('minesweeper') },
  { label: 'Solitaire', app: 'solitaire', icon: 'i-sol', type: 'Application', open: () => launch('solitaire') },
  { label: 'Paint', app: 'paint', icon: 'i-paint', type: 'Application', open: () => launch('paint') },
  { label: 'Notepad', app: 'notepad', icon: 'i-notepad', type: 'Application', open: () => launch('notepad') },
  { label: 'Calculator', app: 'calc', icon: 'i-calc', type: 'Application', open: () => launch('calc') },
  { label: 'MS-DOS Prompt', app: 'dos', icon: 'i-dos', type: 'Application', open: () => launch('dos') },
  { label: 'Display', app: 'display', icon: 'i-display', type: 'Control Panel', open: () => launch('display') },
  { label: 'README.TXT', app: 'notepad', icon: 'i-txt', type: 'Text Document', open: () => run('notepad readme.txt') },
  { label: 'GitHub', icon: 'i-github', type: 'Shortcut', shortcut: true, open: () => window.open(GITHUB, '_blank', 'noopener') },
];
const CELL_W = 76, CELL_H = 74;
let moved = false;

function renderIcons() {
  // Programs that failed to load don't get an icon.
  for (let i = ICONS.length - 1; i >= 0; i--) if (ICONS[i].app && !appInfo(ICONS[i].app)) ICONS.splice(i, 1);
  ICONS.forEach((it, i) => {
    const b = h('button', { class: 'icon', type: 'button', role: 'option', 'aria-selected': 'false', tabindex: i === 0 ? '0' : '-1' },
      icon(typeof it.icon === 'function' ? it.icon() : it.icon), h('span', null, it.label));
    if (it.shortcut) b.append(h('i', { class: 'lnk', 'aria-hidden': 'true' }));
    it.el = b;
    b.addEventListener('pointerdown', e => iconDown(it, e));
    b.addEventListener('dblclick', () => it.open());
    b.addEventListener('keydown', e => iconKey(it, e));
    b.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      select(it);
      openMenu([{ label: '&Open', action: it.open }, '-', { label: 'Cu&t', disabled: true }, { label: '&Copy', disabled: true }, '-',
        { label: 'Create &Shortcut', disabled: true }, { label: '&Delete', disabled: true }, { label: 'Rena&me', disabled: true }, '-',
        { label: 'P&roperties', action: () => msgbox({ title: it.label + ' Properties', icon: it.el.querySelector('use').getAttribute('href').slice(1), text: `${it.label}\n\nType: ${it.type}\nLocation: C:\\WINDOWS\\Desktop` }) }],
      { x: e.clientX, y: e.clientY });
    });
    iconsEl.append(b);
  });
  arrange();
}

export function refreshIcons() {
  ICONS.forEach(it => { if (typeof it.icon === 'function') it.el.querySelector('use').setAttribute('href', '#' + it.icon()); });
}

function arrange(order = ICONS) {
  const rows = Math.max(1, Math.floor((desktopEl.clientHeight - 8) / CELL_H));
  order.forEach((it, i) => {
    it.x = 4 + Math.floor(i / rows) * CELL_W;
    it.y = 6 + (i % rows) * CELL_H;
    place(it);
  });
  moved = false;
}
function place(it) { it.el.style.left = it.x + 'px'; it.el.style.top = it.y + 'px'; }

function lineUp() {
  const taken = new Set();
  ICONS.forEach(it => {
    let c = Math.max(0, Math.round((it.x - 4) / CELL_W)), r = Math.max(0, Math.round((it.y - 6) / CELL_H));
    while (taken.has(c + ':' + r)) r++;
    taken.add(c + ':' + r);
    it.x = 4 + c * CELL_W; it.y = 6 + r * CELL_H; place(it);
  });
}

function select(it) {
  ICONS.forEach(o => {
    const on = o === it;
    o.el.classList.toggle('sel', on);
    o.el.setAttribute('aria-selected', String(on));
    o.el.tabIndex = on ? 0 : -1;
  });
}

function iconDown(it, e) {
  if (e.button !== 0) return;
  e.stopPropagation();
  closeMenus('icon');
  deactivate();
  select(it);
  it.el.focus({ preventScroll: true });
  const touch = e.pointerType !== 'mouse';
  const sx = e.clientX, sy = e.clientY;
  let ghost = null;
  it.el.setPointerCapture(e.pointerId);
  const move = ev => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!ghost) {
      if (Math.hypot(dx, dy) < (touch ? 10 : 4)) return;
      ghost = it.el.cloneNode(true);
      ghost.classList.add('ghost');
      iconsEl.append(ghost);
    }
    ghost.style.left = it.x + dx + 'px';
    ghost.style.top = it.y + dy + 'px';
  };
  const up = ev => {
    it.el.removeEventListener('pointermove', move);
    it.el.removeEventListener('pointerup', up);
    it.el.removeEventListener('pointercancel', up);
    if (ghost) {
      ghost.remove();
      if (ev.type === 'pointerup') {
        it.x = clamp(it.x + ev.clientX - sx, 0, desktopEl.clientWidth - CELL_W);
        it.y = clamp(it.y + ev.clientY - sy, 0, desktopEl.clientHeight - CELL_H);
        place(it);
        moved = true;
      }
    } else if (touch && ev.type === 'pointerup') {
      it.open(); // a tap opens on touch screens; double-click is a mouse habit
    }
  };
  it.el.addEventListener('pointermove', move);
  it.el.addEventListener('pointerup', up);
  it.el.addEventListener('pointercancel', up);
}

function iconKey(it, e) {
  const i = ICONS.indexOf(it);
  const rows = Math.max(1, Math.floor((desktopEl.clientHeight - 8) / CELL_H));
  const go = j => { const o = ICONS[clamp(j, 0, ICONS.length - 1)]; select(o); o.el.focus(); };
  if (e.key === 'Enter') { e.preventDefault(); it.open(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
  else if (e.key === 'ArrowRight' && !moved) { e.preventDefault(); go(i + rows); }
  else if (e.key === 'ArrowLeft' && !moved) { e.preventDefault(); go(i - rows); }
}

desktopEl.addEventListener('pointerdown', e => {
  if (e.target !== desktopEl && e.target !== iconsEl) return;
  select(null);
  deactivate();
});
desktopEl.addEventListener('contextmenu', e => {
  if (e.target !== desktopEl && e.target !== iconsEl) return;
  e.preventDefault();
  select(null);
  openMenu([
    { label: 'Arrange &Icons', submenu: [
      { label: 'by &Name', action: () => arrange([...ICONS].sort((a, b) => a.label.localeCompare(b.label))) },
      { label: 'by &Type', action: () => arrange([...ICONS].sort((a, b) => a.type.localeCompare(b.type) || ICONS.indexOf(a) - ICONS.indexOf(b))) },
      { label: '&Auto Arrange', action: () => arrange() },
    ] },
    { label: 'Line &up Icons', action: lineUp },
    '-',
    { label: '&Refresh', action: refreshDesktop },
    '-',
    { label: '&Paste', disabled: true },
    { label: 'Paste &Shortcut', disabled: true },
    '-',
    { label: 'Ne&w', submenu: [{ label: '&Folder', disabled: true }, { label: '&Shortcut', disabled: true }, '-', { label: 'Text Document', icon: 'i-txt', action: () => launch('notepad', { name: 'New Text Document.txt', text: '' }) }] },
    '-',
    { label: 'P&roperties', action: () => launch('display') },
  ], { x: e.clientX, y: e.clientY });
});

function refreshDesktop() {
  iconsEl.style.visibility = 'hidden';
  setTimeout(() => { iconsEl.style.visibility = ''; }, 120);
}

let lastH = 0;
window.addEventListener('resize', () => {
  const H = desktopEl.clientHeight;
  if (!moved && H !== lastH) arrange();
  else ICONS.forEach(it => { it.x = clamp(it.x, 0, Math.max(0, desktopEl.clientWidth - CELL_W)); it.y = clamp(it.y, 0, Math.max(0, H - CELL_H)); place(it); });
  lastH = H;
});

// ---------- Start menu ----------

const startBtn = document.getElementById('start');
const banner = h('div', { class: 'side', 'aria-hidden': 'true' }, 'blankiekun', h('b', null, '95'));

function startItems() {
  const accessories = [
    { label: 'Games', icon: 'i-programs', submenu: [
      { label: 'Minesweeper', icon: 'i-mine', action: () => launch('minesweeper') },
      { label: 'Solitaire', icon: 'i-sol', action: () => launch('solitaire') },
    ] },
    '-',
    { label: 'Calculator', icon: 'i-calc', action: () => launch('calc') },
    { label: 'Notepad', icon: 'i-notepad', action: () => launch('notepad') },
    { label: 'Paint', icon: 'i-paint', action: () => launch('paint') },
  ];
  const projects = [
    { label: "blankiekun's Homepage", icon: 'i-htm', action: () => launch('ie', 'home') },
    '-',
    { label: 'chimimouryou', icon: 'i-book', action: () => launch('ie', 'chimimouryou') },
    { label: 'conscripter-convert', icon: 'i-convert', action: () => launch('ie', 'convert') },
    { label: 'CONscripter', icon: 'i-game', action: () => launch('ie', 'conscripter') },
  ];
  return [
    { label: 'blankiekun', sub: 'GitHub profile', img: GITHUB + '.png?size=64', className: 'account', href: GITHUB },
    '-',
    { label: '&Programs', icon: 'i-programs', submenu: [
      { label: 'Accessories', icon: 'i-programs', submenu: accessories },
      { label: 'Projects', icon: 'i-programs', submenu: projects },
      '-',
      { label: 'Internet Explorer', icon: 'i-ie', action: () => launch('ie', 'home') },
      { label: 'MS-DOS Prompt', icon: 'i-dos', action: () => launch('dos') },
      { label: 'Windows Explorer', icon: 'i-folder-open', action: () => launch('explorer', 'C:\\') },
    ] },
    { label: '&Documents', icon: 'i-docs', submenu: [
      { label: 'README.TXT', app: 'notepad', icon: 'i-txt', action: () => run('notepad readme.txt') },
      { label: 'TODO.TXT', icon: 'i-txt', action: () => run('notepad todo.txt') },
    ] },
    { label: '&Settings', icon: 'i-ctrl', submenu: [
      { label: '&Control Panel', icon: 'i-ctrl', action: () => launch('explorer', 'Control Panel') },
      { label: '&Display', icon: 'i-display', action: () => launch('display') },
      { label: '&Printers', icon: 'i-printer', action: () => launch('explorer', 'Printers') },
    ] },
    { label: '&Find', icon: 'i-find', submenu: [
      { label: '&Files or Folders...', icon: 'i-find', action: () => launch('find') },
      { label: 'On the &Internet...', icon: 'i-globe', action: () => launch('ie', 'home') },
    ] },
    { label: '&Help', icon: 'i-helpbook', action: () => launch('help') },
    { label: '&Run...', icon: 'i-run', action: runDialog },
    '-',
    { label: '&Log Off blankiekun...', icon: 'i-logoff', action: logOff },
    { label: 'Sh&ut Down...', icon: 'i-shutdown', action: shutDown },
  ];
}

function toggleStart(keyboard) {
  if (startBtn.getAttribute('aria-expanded') === 'true') { closeMenus('toggle'); return; }
  openMenu(startItems(), { rect: startBtn.getBoundingClientRect(), above: true }, {
    className: 'startmenu', banner, focusFirst: keyboard,
    onClose: () => startBtn.setAttribute('aria-expanded', 'false'),
  });
  startBtn.setAttribute('aria-expanded', 'true');
}
startBtn.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); toggleStart(false); });
startBtn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStart(true); } });
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Escape' && !isOpen()) { e.preventDefault(); toggleStart(true); }
});

// ---------- Run ----------

export function runDialog() {
  const input = h('input', { class: 'field', id: 'run-open', autocomplete: 'off', style: { flex: '1', minWidth: '0' } });
  const form = h('form', { class: 'dlg', style: { width: 'min(360px, calc(100vw - 24px))' } },
    h('div', { class: 'row' }, icon('i-run'), h('div', { class: 'msg' }, 'Type the name of a program, folder, or document, and blankiekun 95 will open it for you.')),
    h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('span', { html: '<u>O</u>pen:' }), input),
    h('div', { class: 'btns right' },
      h('button', { class: 'btn default', type: 'submit' }, 'OK'),
      h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel'),
      h('button', { class: 'btn', type: 'button', onclick: () => launch('explorer', 'C:\\') }, h('span', { html: '<u>B</u>rowse...' }))));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = input.value;
    if (run(v, win)) win.close();
    else msgbox({ title: v, icon: 'error', parent: win, text: `Cannot find the file '${v}' (or one of its components). Make sure the path and filename are correct and that all required libraries are available.` });
  });
  form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  const win = createWindow({ title: 'Run', body: form, dialog: true, resizable: false, width: 'auto', taskbar: false, x: 8, y: Math.max(0, desktopEl.clientHeight - 190), help: () => launch('help') });
  input.focus();
}

// ---------- shut down / log off ----------

function shutDown() {
  const opts = [
    ['shutdown', '&Shut down the computer?'],
    ['restart', '&Restart the computer?'],
    ['dos', 'Restart the computer in &MS-DOS mode?'],
    ['logoff', '&Close all programs and log on as a different user?'],
  ];
  const dim = h('div', { class: 'screen dim' });
  document.body.append(dim);
  const form = h('form', { class: 'dlg', style: { width: 'min(380px, calc(100vw - 24px))' } },
    h('div', { class: 'row' }, icon('i-shutdown'), h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      h('div', null, 'Are you sure you want to:'),
      ...opts.map(([v, l], i) => h('label', { style: { display: 'flex', alignItems: 'center' } },
        h('input', { type: 'radio', name: 'sd', value: v, checked: i === 0 }), h('span', { html: l.replace(/&(.)/, '<u>$1</u>') }))))),
    h('div', { class: 'btns' },
      h('button', { class: 'btn default', type: 'submit', html: '<u>Y</u>es' }),
      h('button', { class: 'btn', type: 'button', html: '<u>N</u>o', onclick: () => win.close() }),
      h('button', { class: 'btn', type: 'button', html: '<u>H</u>elp', onclick: () => launch('help') })));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = form.querySelector('input:checked').value;
    win.close(true);
    if (v === 'shutdown') powerOff();
    else if (v === 'restart') { try { sessionStorage.removeItem('w95.booted'); } catch {} location.hash = ''; location.reload(); }
    else if (v === 'dos') { closeAll(); launch('dos', 'dosmode'); }
    else logOn();
  });
  form.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); win.close(); }
    if (e.key === 'y') form.requestSubmit();
    if (e.key === 'n') win.close();
  });
  const win = createWindow({ title: 'Shut Down blankiekun 95', body: form, dialog: true, resizable: false, width: 'auto', taskbar: false, onClosed: () => dim.remove() });
  win.el.style.zIndex = 30001;
  form.querySelector('.btn').focus();
}

function closeAll() { all().forEach(w => close(w, true)); }

async function powerOff() {
  closeAll();
  const wait1 = h('div', { class: 'screen wait' }, h('div', null, 'Please wait while your computer shuts down.'));
  document.body.append(wait1);
  await wait(reducedMotion.matches ? 300 : 1400);
  const off = h('div', { class: 'screen off', tabindex: '0', role: 'button' },
    h('div', null, "It's now safe to turn off", h('br'), 'your computer.', h('small', null, 'Click anywhere to start blankiekun 95 again.')));
  wait1.replaceWith(off);
  off.focus();
  const restart = () => { try { sessionStorage.removeItem('w95.booted'); } catch {} history.replaceState(null, '', location.pathname); location.reload(); };
  off.addEventListener('click', restart);
  off.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') restart(); });
}

async function logOff() {
  const b = await msgbox({ title: 'Log Off blankiekun 95', icon: 'i-logoff', text: 'Are you sure you want to log off?', buttons: ['&Yes', '&No'] });
  if (b === 'Yes') logOn();
}

// The Welcome dialog. The account is the GitHub one.
function logOn() {
  closeAll();
  const scr = h('div', { class: 'screen logon' });
  const pw = h('input', { class: 'field', type: 'password', id: 'logon-pw', autocomplete: 'off' });
  const form = h('form', { class: 'win active logon-win', 'aria-label': 'Welcome to blankiekun 95' },
    h('div', { class: 'titlebar' }, h('span', { class: 't' }, 'Welcome to blankiekun 95')),
    h('div', { class: 'dlg' },
      h('div', { class: 'row' },
        h('img', { src: GITHUB + '.png?size=96', alt: '', width: 48, height: 48, class: 'logon-avatar' }),
        h('div', { class: 'logon-fields' },
          h('p', null, 'Type a user name and password to log on to blankiekun 95.'),
          h('label', null, h('span', { html: '<u>U</u>ser name:' }), h('input', { class: 'field', value: 'blankiekun', readonly: true })),
          h('label', null, h('span', { html: '<u>P</u>assword:' }), pw),
          h('p', { class: 'logon-hint' }, 'Any password works. This account is ', h('a', { href: GITHUB, target: '_blank', rel: 'noopener' }, 'github.com/blankiekun'), '.')),
        h('div', { class: 'btns', style: { flexDirection: 'column' } },
          h('button', { class: 'btn default', type: 'submit' }, 'OK'),
          h('button', { class: 'btn', type: 'button', onclick: () => form.requestSubmit() }, 'Cancel')))));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    scr.remove();
    launch('ie', 'home');
  });
  scr.append(form);
  document.body.append(scr);
  pw.focus();
}

// ---------- boot ----------

export async function boot() {
  let booted = false;
  try { booted = sessionStorage.getItem('w95.booted') === '1'; sessionStorage.setItem('w95.booted', '1'); } catch {}
  if (booted) return;
  const fast = reducedMotion.matches;
  let skip;
  const skipped = new Promise(r => { skip = r; });
  const post = h('div', { class: 'screen post', 'aria-live': 'polite' }, 'Starting blankiekun 95...');
  document.body.append(post);
  const onKey = () => skip();
  addEventListener('keydown', onKey);
  post.addEventListener('pointerdown', skip);
  await Promise.race([wait(fast ? 200 : 900), skipped]);
  const splash = h('div', { class: 'screen splash', role: 'img', 'aria-label': 'blankiekun 95 is starting' },
    h('div', { class: 'logo' }, icon('i-flag'), h('div', { class: 'word' }, h('small', null, 'Starting'), h('b', null, 'blankiekun', h('sup', null, '95')))),
    h('div', { class: 'bar' }));
  splash.addEventListener('pointerdown', skip);
  post.replaceWith(splash);
  await Promise.race([wait(fast ? 600 : 2200), skipped]);
  removeEventListener('keydown', onKey);
  splash.remove();
}

// ---------- clock ----------

function clock() {
  const t = document.getElementById('clock');
  const tray = t.parentElement;
  const tick = () => {
    const d = new Date();
    t.textContent = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    t.dateTime = d.toISOString();
    tray.title = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };
  tick();
  setInterval(tick, 10000);
  tray.addEventListener('dblclick', () => launch('datetime'));
}

export function initDesktop() {
  renderIcons();
  lastH = desktopEl.clientHeight;
  clock();
  if (small.matches) { /* icons still tap-to-open; windows open maximized */ }
}
