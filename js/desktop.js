// The desktop surface: icons, right-click menu, Start menu, tray clock,
// and the boot / shut down / log off screens.

import { h, icon, clamp, wait, reducedMotion, store, marquee, overlaps, sound } from './util.js';
import { openMenu, closeMenus, isOpen } from './menu.js';
import { launch, register, createWindow, all, close, deactivate, appInfo, cascadeAll, tile, minimizeAll, undo, undoLabel, onPlaceTask, onTaskMenu, systemMenu } from './wm.js';
import { msgbox, about } from './dialogs.js';
import { menubar } from './menu.js';
import { run, open as shellOpen, RECENT } from './shell.js';
import { recycle, network, root, resolve, onChange, desktopFolder, createFile, mkdir, emptyBin, FsError, kindLabel } from './fs.js';
import { properties, iconOf } from './props.js';
import { clip, cut, copyNodes, paste, canPaste, del, drop, toFloppy, onClip, isCut, undo as undoFile, undoLabel as fileUndoLabel, renameNode, makeShortcut } from './fileops.js';
import { OS, V, VERSIONS, rename, absent } from './version.js';

const GITHUB = 'https://github.com/blankiekun';
const desktopEl = document.getElementById('desktop');
const iconsEl = document.getElementById('icons');

// ---------- icons ----------

const ICONS = [
  { label: 'My Computer', app: 'mycomputer', icon: 'i-computer', type: 'System', node: root, open: () => launch('mycomputer') },
  { label: 'Network Neighborhood', app: 'network', icon: 'i-network', type: 'System', node: network, open: () => launch('network') },
  { label: 'Windows Explorer', app: 'explorer', icon: 'i-folder-open', type: 'Application', open: () => launch('explorer', { path: 'C:\\', explore: true }) },
  { label: 'Inbox', app: 'inbox', icon: 'i-inbox', type: 'Application', open: () => launch('inbox') },
  { label: 'Recycle Bin', app: 'recycle', icon: () => recycle.children.length ? 'i-trash-full' : 'i-trash', type: 'System', node: recycle, open: () => launch('recycle') },
  { label: 'Internet Explorer', app: 'ie', icon: 'i-ie', type: 'Application', open: () => launch('ie', 'home') },
  { label: 'CONscripter', app: 'cons', icon: 'i-game', type: 'Application', open: () => launch('cons') },
  { label: 'Games', app: 'ie', icon: 'i-cd', type: 'Shortcut', shortcut: true, open: () => launch('ie', 'games') },
  { label: 'Minesweeper', app: 'minesweeper', icon: 'i-mine', type: 'Application', open: () => launch('minesweeper') },
  { label: 'Solitaire', app: 'solitaire', icon: 'i-sol', type: 'Application', open: () => launch('solitaire') },
  { label: 'Paint', app: 'paint', icon: 'i-paint', type: 'Application', open: () => launch('paint') },
  { label: 'Notepad', app: 'notepad', icon: 'i-notepad', type: 'Application', open: () => launch('notepad') },
  { label: 'WordPad', app: 'wordpad', icon: 'i-wordpad', type: 'Application', open: () => launch('wordpad') },
  { label: 'Media Player', app: 'mplayer', icon: 'i-mplayer', type: 'Application', open: () => launch('mplayer') },
  { label: 'CD Player', app: 'cdplayer', icon: 'i-cdplayer', type: 'Application', open: () => launch('cdplayer') },
  { label: 'HyperTerminal', app: 'hyperterm', icon: 'i-hyperterm', type: 'Application', open: () => launch('hyperterm') },
  { label: 'Calculator', app: 'calc', icon: 'i-calc', type: 'Application', open: () => launch('calc') },
  { label: 'MS-DOS Prompt', app: 'dos', icon: 'i-dos', type: 'Application', open: () => launch('dos') },
  { label: 'Windows Setup', app: 'setup', icon: 'i-setup', type: 'Application', open: () => launch('setup') },
  { label: 'Reversi', app: 'reversi', icon: 'i-reversi', type: 'Application', era: true, open: () => launch('reversi') },
  { label: 'Clock', app: 'clock', icon: 'i-clock', type: 'Application', era: true, open: () => launch('clock') },
  { label: 'Sticky Notes', app: 'stickynotes', icon: 'i-stickynotes', type: 'Application', era: true, open: () => launch('stickynotes') },
  { label: 'Display', app: 'display', icon: 'i-display', type: 'Control Panel', open: () => launch('display') },
  { label: 'README.TXT', app: 'notepad', icon: 'i-txt', type: 'Text Document', open: () => run('notepad readme.txt') },
  { label: 'GitHub', icon: 'i-github', type: 'Shortcut', shortcut: true, open: () => window.open(GITHUB, '_blank', 'noopener') },
];
const CELL_W = 86, CELL_H = 74;
let moved = false;
let renaming = false;

// The visitor's files in C:\WINDOWS\Desktop show up after the built-in icons.
function fileIcon(node) {
  return { label: node.name, icon: () => iconOf(node), type: kindLabel(node), node, file: true, open: () => shellOpen(node) };
}

function makeIcon(it, i) {
  const b = h('button', { class: 'icon', type: 'button', role: 'option', 'aria-selected': 'false', tabindex: i === 0 ? '0' : '-1',
    title: !it.file && absent(it.app) ? `Not part of ${OS}` : null },
    icon(typeof it.icon === 'function' ? it.icon() : it.icon), h('span', null, it.file ? it.label : rename(it.label)));
  if (it.shortcut || (it.node && (it.node.kind === 'link' || it.node.kind === 'shortcut'))) b.append(h('i', { class: 'lnk', 'aria-hidden': 'true' }));
  it.el = b;
  if (it.node === recycle) b.dropFolder = () => recycle;
  else if (it.node && it.node.children && it.file) b.dropFolder = () => it.node;
  b.addEventListener('pointerdown', e => iconDown(it, e));
  b.addEventListener('dblclick', () => { if (!renaming) it.open(); });
  b.addEventListener('keydown', e => iconKey(it, e));
  b.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    select(it);
    openMenu(iconMenu(it), { x: e.clientX, y: e.clientY });
  });
  return b;
}

function iconMenu(it) {
  const n = it.node;
  if (n === recycle) return [
    { label: '&Open', action: it.open }, { label: '&Explore', action: () => launch('explorer', { node: recycle, explore: true }) }, '-',
    { label: 'Empty Recycle &Bin', disabled: !recycle.children.length, action: emptyAll }, '-',
    { label: 'Create &Shortcut', action: () => makeShortcut(recycle, desktopFolder()) }, '-',
    { label: 'P&roperties', action: () => properties(recycle) },
  ];
  if (n === root) return [
    { label: '&Open', action: it.open }, { label: '&Explore', action: () => launch('explorer', { node: root, explore: true }) },
    { label: '&Find...', action: () => launch('find') }, '-',
    { label: 'Map &Network Drive...', disabled: true }, { label: '&Disconnect Network Drive...', disabled: true }, '-',
    { label: 'Create &Shortcut', action: () => makeShortcut(root, desktopFolder()) }, { label: 'Rena&me', disabled: true }, '-',
    { label: 'P&roperties', action: () => launch('sysprops') },
  ];
  if (n === network) return [
    { label: '&Open', action: it.open }, { label: '&Explore', action: () => launch('explorer', { node: network, explore: true }) },
    { label: '&Find Computer...', action: () => launch('find') }, '-',
    { label: 'Create &Shortcut', action: () => makeShortcut(network, desktopFolder()) }, '-',
    { label: 'P&roperties', action: () => msgbox({ title: 'Network', icon: 'i-network', text: 'The following network components are installed:\n\n  Client for GitHub Networks\n  Dial-Up Adapter (28.8 kbps)\n  TCP/IP -> the whole internet' }) },
  ];
  if (it.file) return [
    { label: '&Open', action: it.open },
    ...(n.children ? [{ label: '&Explore', action: () => launch('explorer', { node: n, explore: true }) }] : []), '-',
    { label: 'Se&nd To', submenu: [{ label: '3½ Floppy (A:)', icon: 'i-floppy', action: () => toFloppy([n]) }] }, '-',
    { label: 'Cu&t', action: () => cut([n]) }, { label: '&Copy', action: () => copyNodes([n]) },
    ...(n.children ? [{ label: '&Paste', disabled: !canPaste(n), action: () => paste(n) }] : []), '-',
    { label: 'Create &Shortcut', action: () => makeShortcut(n, desktopFolder()) }, { label: '&Delete', action: () => del([n]) }, { label: 'Rena&me', action: () => startRename(it) }, '-',
    { label: 'P&roperties', action: () => properties(n) },
  ];
  // A program's icon: its shortcut opens the same program.
  const asNode = it.app ? { name: it.label, kind: 'app', app: it.app, arg: it.app === 'ie' ? 'home' : undefined, icon: typeof it.icon === 'string' ? it.icon : undefined } : null;
  const canPin = it.app && it.type !== 'Text Document';
  return [{ label: '&Open', action: it.open },
    ...(canPin ? [isPinned(it.app) ? { label: 'Unpin from &Taskbar', action: () => unpin(it.app) }
      : { label: 'Pin to &Taskbar', action: () => pin({ label: it.label, id: it.app, icon: asNode.icon, arg: it.app === 'explorer' ? { path: 'C:\\', explore: true } : asNode.arg }) }] : []),
    '-', { label: 'Cu&t', disabled: true }, { label: '&Copy', disabled: true }, '-',
    { label: 'Create &Shortcut', disabled: !asNode, action: () => makeShortcut(asNode, desktopFolder()) }, { label: '&Delete', disabled: true }, { label: 'Rena&me', disabled: true }, '-',
    { label: 'P&roperties', action: () => msgbox({ title: it.label + ' Properties', icon: it.el.querySelector('use').getAttribute('href').slice(1), text: `${it.label}\n\nType: ${it.type}\nLocation: C:\\WINDOWS\\Desktop` }) }];
}

async function emptyAll() {
  const n = recycle.children.length;
  const b = await msgbox({ title: n === 1 ? 'Confirm File Delete' : 'Confirm Multiple File Delete', icon: 'i-warn', buttons: ['&Yes', '&No'],
    text: n === 1 ? `Are you sure you want to delete '${recycle.children[0].name}'?` : `Are you sure you want to delete these ${n} items?` });
  if (b === 'Yes') { emptyBin(); sound('Empty Recycle Bin'); }
}

function renderIcons() {
  // Programs that failed to load, or that this era didn't have, don't get an icon.
  for (let i = ICONS.length - 1; i >= 0; i--) if ((ICONS[i].app && !appInfo(ICONS[i].app)) || (ICONS[i].era && absent(ICONS[i].app))) ICONS.splice(i, 1);
  ICONS.forEach((it, i) => iconsEl.append(makeIcon(it, i)));
  for (const n of desktopFolder().children) { const it = fileIcon(n); ICONS.push(it); iconsEl.append(makeIcon(it, ICONS.length)); }
  arrange();
}

// Keeps the visitor's icons in step with the Desktop folder; new ones go in the next free spot.
function syncFiles() {
  const nodes = desktopFolder().children;
  for (let i = ICONS.length - 1; i >= 0; i--) {
    const it = ICONS[i];
    if (it.file && !nodes.includes(it.node)) { it.el.remove(); ICONS.splice(i, 1); }
  }
  for (const n of nodes) {
    let it = ICONS.find(o => o.node === n);
    if (!it) {
      it = fileIcon(n);
      ICONS.push(it);
      iconsEl.append(makeIcon(it, ICONS.length));
      const spot = freeSpot();
      it.x = spot.x; it.y = spot.y; place(it);
    } else if (!renaming) {
      it.label = n.name; it.type = kindLabel(n);
      it.el.querySelector('span').textContent = n.name;
    }
  }
  refreshIcons();
}
onChange(syncFiles);
onClip(() => ICONS.forEach(it => it.el && it.el.classList.toggle('cut', !!it.node && isCut(it.node))));

function freeSpot() {
  const rows = Math.max(1, Math.floor((desktopEl.clientHeight - 8) / CELL_H));
  const taken = new Set(ICONS.filter(o => o.x != null).map(o => Math.round((o.x - 4) / CELL_W) + ':' + Math.round((o.y - 6) / CELL_H)));
  for (let i = 0; ; i++) {
    const c = Math.floor(i / rows), r = i % rows;
    if (!taken.has(c + ':' + r)) return { x: 4 + c * CELL_W, y: 6 + r * CELL_H };
  }
}

export function refreshIcons() {
  ICONS.forEach(it => { if (typeof it.icon === 'function' && it.el) it.el.querySelector('use').setAttribute('href', '#' + it.icon()); });
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

function select(it) { ICONS.forEach(o => mark(o, o === it)); }
function mark(o, on) {
  o.el.classList.toggle('sel', on);
  o.el.setAttribute('aria-selected', String(on));
  o.el.tabIndex = on ? 0 : -1;
}

// Where a dragged icon would land: a folder or the Recycle Bin, else just the desktop.
function dropAt(x, y, group) {
  for (let el = document.elementFromPoint(x, y); el; el = el.parentElement) {
    if (group.some(o => o.el === el) || el === desktopEl || el === iconsEl) return null;
    if (el.dropFolder) return { el, folder: el.dropFolder() };
  }
  return null;
}

// Dragging a selected icon drags the whole selection with it.
function iconDown(it, e) {
  if (e.button !== 0 || renaming) return;
  e.stopPropagation();
  closeMenus('icon');
  deactivate();
  const wasSel = it.el.classList.contains('sel');
  if (!wasSel) select(it);
  it.el.focus({ preventScroll: true });
  const group = ICONS.filter(o => o.el.classList.contains('sel'));
  const files = group.filter(o => o.file).map(o => o.node);
  const touch = e.pointerType !== 'mouse';
  const sx = e.clientX, sy = e.clientY;
  let ghosts = null, over = null;
  it.el.setPointerCapture(e.pointerId);
  const move = ev => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!ghosts) {
      if (Math.hypot(dx, dy) < (touch ? 10 : 4)) return;
      ghosts = group.map(o => {
        const g = o.el.cloneNode(true);
        g.classList.add('ghost');
        iconsEl.append(g);
        return g;
      });
    }
    group.forEach((o, i) => { ghosts[i].style.left = o.x + dx + 'px'; ghosts[i].style.top = o.y + dy + 'px'; });
    if (files.length) {
      const t = dropAt(ev.clientX, ev.clientY, group);
      if (over && (!t || t.el !== over)) over.classList.remove('drop-hot');
      over = t && t.el;
      if (over) over.classList.add('drop-hot');
    }
  };
  const up = ev => {
    it.el.removeEventListener('pointermove', move);
    it.el.removeEventListener('pointerup', up);
    it.el.removeEventListener('pointercancel', up);
    if (over) over.classList.remove('drop-hot');
    if (ghosts) {
      ghosts.forEach(g => g.remove());
      if (ev.type !== 'pointerup') return;
      const t = files.length && dropAt(ev.clientX, ev.clientY, group);
      if (t) { drop(files, t.folder, ev.ctrlKey); return; }
      for (const o of group) {
        o.x = clamp(o.x + ev.clientX - sx, 0, desktopEl.clientWidth - CELL_W);
        o.y = clamp(o.y + ev.clientY - sy, 0, desktopEl.clientHeight - CELL_H);
        place(o);
      }
      moved = true;
    } else if (ev.type === 'pointerup') {
      if (wasSel) select(it); // a click without a drag picks just this one out of the selection
      if (touch) it.open(); // a tap opens on touch screens; double-click is a mouse habit
    }
  };
  it.el.addEventListener('pointermove', move);
  it.el.addEventListener('pointerup', up);
  it.el.addEventListener('pointercancel', up);
}

function startRename(it) {
  const span = it.el.querySelector('span');
  const box = h('textarea', { class: 'icon-rename', rows: 2, spellcheck: false, 'aria-label': 'New name' });
  box.value = it.node.name;
  span.replaceChildren(box);
  renaming = true;
  box.focus();
  const dot = it.node.children ? -1 : it.node.name.lastIndexOf('.');
  box.setSelectionRange(0, dot > 0 ? dot : box.value.length);
  let done = false;
  const finish = ok => {
    if (done) return;
    done = true; renaming = false;
    const v = box.value.replace(/\n/g, '').trim();
    span.textContent = it.node.name;
    if (ok && v && v !== it.node.name) renameNode(it.node, v);
    it.el.focus({ preventScroll: true });
  };
  box.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  box.addEventListener('pointerdown', e => e.stopPropagation());
  box.addEventListener('dblclick', e => e.stopPropagation());
  box.addEventListener('blur', () => finish(true));
}

function iconKey(it, e) {
  if (renaming) return;
  const i = ICONS.indexOf(it);
  const rows = Math.max(1, Math.floor((desktopEl.clientHeight - 8) / CELL_H));
  const go = j => { const o = ICONS[clamp(j, 0, ICONS.length - 1)]; select(o); o.el.focus(); };
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'Enter') { e.preventDefault(); if (e.altKey && it.node) properties(it.node); else it.open(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
  else if (e.key === 'ArrowRight' && !moved) { e.preventDefault(); go(i + rows); }
  else if (e.key === 'ArrowLeft' && !moved) { e.preventDefault(); go(i - rows); }
  else if (e.key === 'Delete' && it.file) { e.preventDefault(); del(ICONS.filter(o => o.file && o.el.classList.contains('sel')).map(o => o.node), null, e.shiftKey); }
  else if (e.key === 'F2' && it.file) { e.preventDefault(); startRename(it); }
  else if (ctrl && e.key.toLowerCase() === 'c' && it.file) { e.preventDefault(); copyNodes([it.node]); }
  else if (ctrl && e.key.toLowerCase() === 'x' && it.file) { e.preventDefault(); cut([it.node]); }
  else if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(desktopFolder()); }
  else if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); undoFile(); }
}

// Things dragged out of folder windows land on the desktop.
desktopEl.dropFolder = () => desktopFolder();
iconsEl.dropFolder = () => desktopFolder();

desktopEl.addEventListener('pointerdown', e => {
  if (e.target !== desktopEl && e.target !== iconsEl) return;
  select(null);
  deactivate();
  if (e.button === 0) marquee(e, r => {
    ICONS.forEach(o => mark(o, [...o.el.children].some(c => overlaps(c, r)))); // the picture and label, not the whole cell
    const first = ICONS.find(o => o.el.classList.contains('sel'));
    if (first) first.el.focus({ preventScroll: true });
  });
});

function newThing(fn) {
  try {
    const n = fn(desktopFolder());
    const it = ICONS.find(o => o.node === n);
    if (it) { select(it); startRename(it); }
  } catch (e) { if (!(e instanceof FsError)) throw e; msgbox({ title: 'Error', icon: 'error', text: e.message }); }
}
function blankBitmap() {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

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
    { label: '&Paste', disabled: !canPaste(desktopFolder()), action: () => paste(desktopFolder()) },
    { label: 'Paste &Shortcut', disabled: !clip.nodes.length, action: () => clip.nodes.forEach(n => makeShortcut(n, desktopFolder())) },
    ...(fileUndoLabel() ? [{ label: '&' + fileUndoLabel(), action: () => undoFile() }] : []),
    '-',
    { label: 'Ne&w', submenu: [
      { label: '&Folder', icon: 'i-folder', action: () => newThing(f => mkdir(f)) },
      { label: '&Shortcut', disabled: true },
      '-',
      { label: 'Text Document', icon: 'i-txt', action: () => newThing(f => createFile(f, 'New Text Document.txt', { text: '' })) },
      { label: 'WordPad Document', icon: 'i-doc', action: () => newThing(f => createFile(f, 'New WordPad Document.doc', { text: '' })) },
      { label: 'Bitmap Image', icon: 'i-bmp', action: () => newThing(f => createFile(f, 'New Bitmap Image.bmp', { data: blankBitmap() })) },
    ] },
    '-',
    { label: ['10', '11'].includes(V.id) ? 'Personali&ze' : 'P&roperties', action: () => launch('display') },
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
const banner = h('div', { class: 'side', 'aria-hidden': 'true' }, 'blankiekun', h('b', null, V.short));

// A Start menu entry for a program, left out when the program didn't load.
const prog = (label, id, ic, arg) => appInfo(id) ? { label, icon: ic, action: () => launch(id, arg) } : null;
const some = list => list.filter(Boolean);
// One this era alone had.
const era = (label, id, ic) => absent(id) ? null : prog(label, id, ic);

function startItems() {
  const accessories = some([
    { label: 'Games', icon: 'i-programs', submenu: some([
      prog('CONscripter', 'cons', 'i-game'),
      prog('FreeCell', 'freecell', 'i-freecell'),
      prog('Hearts', 'hearts', 'i-hearts'),
      prog('Minesweeper', 'minesweeper', 'i-mine'),
      era('Reversi', 'reversi', 'i-reversi'),
      prog('Solitaire', 'solitaire', 'i-sol'),
      era('Spider Solitaire', 'spider', 'i-spider'),
    ]) },
    { label: 'Multimedia', icon: 'i-programs', submenu: some([
      prog('CD Player', 'cdplayer', 'i-cdplayer'),
      prog('Media Player', 'mplayer', 'i-mplayer'),
      prog('Sound Recorder', 'sndrec', 'i-sndrec'),
      { label: 'Volume Control', icon: 'i-speaker', action: () => volumePopup(true) },
    ]) },
    { label: 'System Tools', icon: 'i-programs', submenu: some([
      prog('Character Map', 'charmap', 'i-charmap'),
      prog('Disk Defragmenter', 'defrag', 'i-defrag'),
      prog('Resource Meter', 'resmeter', 'i-resmeter'),
      prog('ScanDisk', 'scandisk', 'i-drive'),
      prog('System Monitor', 'sysmon', 'i-sysmon'),
      era('System Restore', 'restore', 'i-clock'),
    ]) },
    '-',
    { label: 'HyperTerminal', icon: 'i-programs', submenu: some([prog('HyperTerminal', 'hyperterm', 'i-hyperterm')]) },
    '-',
    prog('Calculator', 'calc', 'i-calc'),
    prog('Clipboard Viewer', 'clipbrd', 'i-clipbrd'),
    era('Clock', 'clock', 'i-clock'),
    prog('Notepad', 'notepad', 'i-notepad'),
    prog('Paint', 'paint', 'i-paint'),
    prog('Phone Dialer', 'dialer', 'i-dialer'),
    era('Sticky Notes', 'stickynotes', 'i-stickynotes'),
    prog('WinPopup', 'winpopup', 'i-winpopup'),
    prog('WordPad', 'wordpad', 'i-wordpad'),
  ]);
  const projects = [
    { label: "blankiekun's Homepage", icon: 'i-htm', action: () => launch('ie', 'home') },
    '-',
    { label: 'chimimouryou', icon: 'i-book', action: () => launch('ie', 'chimimouryou') },
    { label: 'conscripter-convert', icon: 'i-convert', action: () => launch('ie', 'convert') },
    { label: 'CONscripter', icon: 'i-game', action: () => launch('ie', 'conscripter') },
  ];
  const docs = recentDocs();
  // 98 to 2000 put Windows Update at the top (here it's Windows Setup, which moves between versions);
  // 98 also had Favorites on, with IE 4's Channels.
  const update = ['98', 'me', '2000'].includes(V.id);
  return some([
    { label: 'blankiekun', sub: 'GitHub profile', img: GITHUB + '.png?size=64', className: 'account', href: GITHUB },
    '-',
    update && prog('Windows Update', 'setup', 'i-globe'),
    update && '-',
    { label: '&Programs', icon: 'i-programs', submenu: [
      { label: 'Accessories', icon: 'i-programs', submenu: accessories },
      { label: 'Projects', icon: 'i-programs', submenu: projects },
      '-',
      prog('blankiekun Exchange', 'inbox', 'i-inbox'),
      { label: 'Internet Explorer', icon: 'i-ie', action: () => launch('ie', 'home') },
      { label: 'MS-DOS Prompt', icon: 'i-dos', action: () => launch('dos') },
      { label: 'Windows Explorer', icon: 'i-folder-open', action: () => launch('explorer', { path: 'C:\\', explore: true }) },
    ] },
    V.id === '98' && { label: 'F&avorites', icon: 'i-fav', submenu: [
      { label: 'Channels', icon: 'i-folder', submenu: projects.filter(p => p !== '-') },
      { label: 'Links', icon: 'i-folder', submenu: [{ label: 'blankiekun on GitHub', icon: 'i-github', action: () => window.open(GITHUB, '_blank', 'noopener') }] },
      '-', ...projects] },
    { label: '&Documents', icon: 'i-docs', submenu: docs.length ? docs : [{ label: '(Empty)', disabled: true }] },
    { label: '&Settings', icon: 'i-ctrl', submenu: [
      prog('Windows &Setup...', 'setup', 'i-setup'),
      { label: '&Control Panel', icon: 'i-ctrl', action: () => launch('explorer', 'Control Panel') },
      { label: '&Printers', icon: 'i-printer', action: () => launch('explorer', 'Printers') },
      { label: '&Taskbar...', icon: 'i-taskbar', action: taskbarProps },
    ] },
    { label: '&Find', icon: 'i-find', submenu: [
      { label: '&Files or Folders...', icon: 'i-find', action: () => launch('find') },
      { label: '&Computer...', icon: 'i-pc', action: () => launch('network') },
      { label: 'On the &Internet...', icon: 'i-globe', action: () => launch('ie', 'home') },
    ] },
    { label: '&Help', icon: 'i-helpbook', action: () => launch('help') },
    { label: '&Run...', icon: 'i-run', action: runDialog },
    '-',
    V.logoff && { label: '&' + V.logoff, icon: 'i-logoff', action: logOff },
    { label: 'Sh&ut Down...', icon: 'i-shutdown', action: shutDown },
  ]);
}

// The Documents menu: README and TODO, then whatever the visitor opened lately.
function recentDocs() {
  const out = [];
  for (const p of store.get(RECENT, ['C:\\My Documents\\README.TXT', 'C:\\My Documents\\TODO.TXT'])) {
    const n = resolve(p);
    if (n && n.kind === 'file') out.push({ label: n.name, icon: iconOf(n), action: () => shellOpen(n) });
  }
  return out;
}

function toggleStart(keyboard) {
  if (startBtn.getAttribute('aria-expanded') === 'true') { closeMenus('toggle'); closePanel(); return; }
  document.querySelector('.begin-hint')?.remove();
  store.set(BEGUN, true);
  if (PANEL) { openPanel(); startBtn.setAttribute('aria-expanded', 'true'); return; }
  openMenu(startItems(), { rect: startBtn.getBoundingClientRect(), above: true }, {
    className: 'startmenu' + (taskbarPrefs().small ? ' small' : ''), banner, focusFirst: keyboard,
    onClose: () => startBtn.setAttribute('aria-expanded', 'false'),
  });
  startBtn.setAttribute('aria-expanded', 'true');
}
startBtn.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); toggleStart(false); });
startBtn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStart(true); } });
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Escape' && !isOpen()) { e.preventDefault(); if (V.id === '3.1') launch('taskman'); else toggleStart(true); }
});

// ---------- 3.1: Program Manager ----------
// 3.1 has no taskbar. Programs start from Program Manager's groups, which hold the Start menu's
// programs; closing it exits Windows.

function progman() {
  const sub = (list, label) => list.find(it => it && it.label === label).submenu;
  const items = startItems(), programs = sub(items, '&Programs'), acc = sub(programs, 'Accessories');
  const groups = [
    ['Main', [...programs.filter(it => it && it !== '-' && !it.submenu), ...sub(items, '&Settings').filter(it => it && it.action !== taskbarProps),
      { label: 'Read Me', icon: 'i-txt', action: () => run('notepad readme.txt') }]],
    ['Accessories', leaves(acc.filter(it => it.label !== 'Games'))],
    ['Games', leaves(sub(acc, 'Games'))],
    ['Projects', leaves(sub(programs, 'Projects'))],
  ];
  // Double-click or Enter starts a program, as in 3.1; a single click only selects it.
  const prog = it => h('button', { type: 'button', class: 'pm-icon', ondblclick: it.action, onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); it.action(); } } },
    icon(it.icon || 'i-exe'), h('span', null, strip(it.label).replace(/\.\.\.$/, '')));
  const body = h('div', { class: 'pm' },
    menubar([
      { label: '&File', items: [{ label: '&Run...', action: runDialog }, '-', { label: 'E&xit Windows...', action: shutDown }] },
      { label: '&Help', items: [{ label: '&Contents', action: () => launch('help') }, '-', { label: '&About Program Manager...', action: () => about('Program Manager', 'i-programs', win) }] },
    ]),
    h('div', { class: 'pm-groups' }, ...groups.map(([name, list]) => h('section', { class: 'pm-group', 'aria-label': name },
      h('div', { class: 'titlebar' }, h('span', { class: 't' }, name)),
      h('div', { class: 'pm-icons' }, ...list.map(prog))))));
  const win = createWindow({ app: 'progman', title: 'Program Manager', icon: 'i-programs', body, width: 600, height: 400,
    onClose: () => { shutDown(); return false; } });
  return win;
}

// ---------- XP on: the Start panel ----------
// XP's two columns, Vista and 7's search box, 8's full-screen Start, 10's tiles and 11's grid.
// 95 to 2000 keep the cascading menu above.

const PANEL = { xp: 'xp', vista: 'aero', 7: 'aero', 8: 'screen', 10: 'ten', 11: 'eleven' }[V.id];
let panel = null;

function closePanel() {
  if (!panel) return;
  panel.remove();
  panel = null;
  startBtn.setAttribute('aria-expanded', 'false');
}
document.addEventListener('pointerdown', closePanel);
window.addEventListener('blur', closePanel);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel && !isOpen()) { closePanel(); startBtn.focus(); } });

const strip = label => rename(label.replace('&', ''));
const subOf = it => typeof it.submenu === 'function' ? it.submenu() : it.submenu;
const leaves = list => list.flatMap(it => !it || it === '-' || it.disabled ? [] : it.submenu ? leaves(subOf(it)) : [it]);
const uniq = list => list.filter((it, i) => list.findIndex(o => strip(o.label) === strip(it.label)) === i);

function openPanel() {
  const items = startItems();
  const programs = items.find(it => it.label === '&Programs').submenu;
  const go = fn => () => { closePanel(); closeMenus('chosen'); fn(); };
  const item = (label, ic, fn, cls, sub) => h('button', { type: 'button', class: 'sp-item' + (cls ? ' ' + cls : ''), onclick: fn && go(fn) },
    icon(ic || 'i-exe'), h('span', null, strip(label), sub ? h('small', null, strip(sub)) : null));
  // The programs everyone pinned or ran most.
  const fav = [['Internet Explorer', 'ie', 'i-ie', 'home'], ['Inbox', 'inbox', 'i-inbox'], ['Notepad', 'notepad', 'i-notepad'], ['Paint', 'paint', 'i-paint'],
    ['Calculator', 'calc', 'i-calc'], ['CONscripter', 'cons', 'i-game'], ['Solitaire', 'solitaire', 'i-sol'], ['Minesweeper', 'minesweeper', 'i-mine'],
    ['MS-DOS Prompt', 'dos', 'i-dos'], ['Settings', 'settings', 'i-ctrl'], ['Windows Setup', 'setup', 'i-setup']]
    .filter(([, id]) => appInfo(id) && !absent(id)).map(([label, id, ic, arg]) => ({ label, icon: ic, action: () => launch(id, arg) }));
  const xp = PANEL === 'xp';
  const places = [
    [xp ? 'My Documents' : 'Documents', 'i-docs', () => launch('explorer', 'C:\\My Documents')],
    ['My Computer', 'i-computer', () => launch('mycomputer')],
    ['Network Neighborhood', 'i-network', () => launch('network')],
    '-',
    ['Control Panel', 'i-ctrl', () => launch('explorer', 'Control Panel')],
    [xp ? 'Printers and Faxes' : V.id === 'vista' ? 'Printers' : 'Devices and Printers', 'i-printer', () => launch('explorer', 'Printers')],
    ['Windows Setup', 'i-setup', () => launch('setup')],
    '-',
    ['Help and Support', 'i-helpbook', () => launch('help')],
    ['Search', 'i-find', () => launch('find')],
    ['Run...', 'i-run', runDialog],
  ].map(p => p === '-' ? h('hr') : item(...p));
  const user = (cls = 'sp-user') => h('a', { class: cls, href: GITHUB, target: '_blank', rel: 'noopener', onclick: () => closePanel() },
    h('img', { src: GITHUB + '.png?size=64', alt: '', width: 48, height: 48 }), h('span', null, 'blankiekun'));
  // Named by title and aria-label too, for the panels that show only the icon.
  const named = (b, label) => Object.assign(b, { title: label, ariaLabel: label });
  const power = (label = V.id === 'xp' ? 'Turn Off Computer' : 'Shut down') => named(item(label, 'i-shutdown', shutDown, 'sp-power'), label);
  const logoff = () => V.logoff ? named(item(V.logoff, 'i-logoff', logOff, 'sp-logoff'), V.logoff) : null;

  // A folder tree that opens in place, for Vista on.
  function tree(list) {
    const out = h('div', { class: 'sp-folders' });
    for (const it of list) {
      if (!it || it === '-' || it.disabled) continue;
      if (!it.submenu) { out.append(item(it.label, it.icon, it.action)); continue; }
      const kids = tree(subOf(it));
      kids.hidden = true;
      const b = h('button', { type: 'button', class: 'sp-item sp-folder', 'aria-expanded': 'false' }, icon(it.icon || 'i-programs'), h('span', null, strip(it.label)));
      b.addEventListener('click', () => { kids.hidden = !kids.hidden; b.setAttribute('aria-expanded', String(!kids.hidden)); });
      out.append(b, kids);
    }
    return out;
  }
  // A search box over every program; Enter opens the first match, or runs what was typed.
  function search(list, placeholder) {
    const all = uniq([...fav, ...leaves(programs)]);
    const box = h('input', { class: 'field sp-search', type: 'search', placeholder, 'aria-label': placeholder });
    const found = h('div', { class: 'sp-folders sp-found', hidden: true });
    box.addEventListener('input', () => {
      const q = box.value.trim().toLowerCase();
      found.hidden = !q;
      list.hidden = !!q;
      found.replaceChildren(...all.filter(it => strip(it.label).toLowerCase().includes(q)).map(it => item(it.label, it.icon, it.action)));
      if (q && !found.children.length) found.append(h('p', null, 'No items match your search.'));
    });
    box.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const first = found.querySelector('button');
      if (first) first.click();
      else if (box.value.trim()) { const v = box.value; closePanel(); run(v); }
    });
    return { box, found };
  }
  const az = () => uniq(leaves(programs)).sort((a, b) => strip(a.label).localeCompare(strip(b.label))).map(it => item(it.label, it.icon, it.action));
  const allBtn = (label, onclick) => h('button', { type: 'button', class: 'sp-item sp-all', onclick }, h('span', null, label));

  let el, focus;
  if (PANEL === 'xp') {
    const all = allBtn('All Programs', e => {
      e.stopPropagation();
      openMenu(programs, { rect: all.getBoundingClientRect(), side: true }, { onClose: r => { if (r === 'chosen') closePanel(); } });
    });
    const recent = item('My Recent Documents', 'i-docs', null, 'sp-sub');
    recent.onclick = e => { e.stopPropagation(); openMenu(recentDocs(), { rect: recent.getBoundingClientRect(), side: true }, { onClose: r => { if (r === 'chosen') closePanel(); } }); };
    places.splice(1, 0, recent);
    el = h('div', { class: 'startpanel sp-xp' },
      h('header', null, user()),
      h('div', { class: 'sp-cols' },
        h('div', { class: 'sp-left' }, item('Internet', 'i-ie', () => launch('ie', 'home'), 'sp-pinned', 'Internet Explorer'),
          appInfo('inbox') ? item('E-mail', 'i-inbox', () => launch('inbox'), 'sp-pinned', 'blankiekun Exchange') : null, h('hr'),
          ...fav.slice(2, 8).map(it => item(it.label, it.icon, it.action)), h('div', { class: 'sp-grow' }), h('hr'), all),
        h('div', { class: 'sp-right' }, ...places)),
      h('footer', null, logoff(), power()));
  } else if (PANEL === 'aero') {
    const list = h('div', { class: 'sp-list' }, ...fav.slice(0, 9).map(it => item(it.label, it.icon, it.action)));
    const progs = tree(programs);
    progs.hidden = true;
    const all = allBtn('All Programs', () => { progs.hidden = !progs.hidden; list.hidden = !progs.hidden; all.firstChild.textContent = progs.hidden ? 'All Programs' : 'Back'; });
    const box = h('div', { class: 'sp-list-wrap' }, list, progs);
    const s = search(box, V.id === 'vista' ? 'Start Search' : 'Search programs and files');
    el = h('div', { class: 'startpanel sp-aero' },
      h('div', { class: 'sp-left' }, box, s.found, h('hr'), all, s.box),
      h('div', { class: 'sp-right' }, user(), ...places, h('div', { class: 'sp-grow' }), h('div', { class: 'sp-foot' }, power(), logoff())));
    focus = s.box;
  } else if (PANEL === 'screen') {
    const tiles = h('div', { class: 'sp-tiles' },
      h('button', { type: 'button', class: 'sp-tile wide', onclick: () => closePanel() }, icon('i-computer'), h('span', null, 'Desktop')),
      ...fav.map(it => h('button', { type: 'button', class: 'sp-tile', onclick: go(it.action) }, icon(it.icon), h('span', null, strip(it.label)))));
    const apps = h('div', { class: 'sp-folders', hidden: true }, ...az());
    const all = h('button', { type: 'button', class: 'sp-arrow', 'aria-label': 'All apps', onclick: () => { apps.hidden = !apps.hidden; tiles.hidden = !apps.hidden; all.classList.toggle('up', !apps.hidden); } });
    el = h('div', { class: 'startpanel sp-screen' },
      h('header', null, h('h1', null, 'Start'), user(), power('Power')),
      tiles, apps, all);
    // Clicking the background goes back to the desktop, like Escape.
    el.addEventListener('click', e => { if (e.target === el) closePanel(); });
  } else if (PANEL === 'ten') {
    el = h('div', { class: 'startpanel sp-ten' },
      h('div', { class: 'sp-rail' }, user(), item('Documents', 'i-docs', () => launch('explorer', 'C:\\My Documents')),
        item('Settings', 'i-ctrl', () => launch('settings')), logoff(), power('Power')),
      h('div', { class: 'sp-apps' }, ...az()),
      h('div', { class: 'sp-tiles' }, ...fav.map(it => h('button', { type: 'button', class: 'sp-tile', onclick: go(it.action) }, icon(it.icon), h('span', null, strip(it.label))))));
  } else {
    const grid = h('div', { class: 'sp-grid' }, ...fav.map(it => h('button', { type: 'button', class: 'sp-tile', onclick: go(it.action) }, icon(it.icon), h('span', null, strip(it.label)))));
    const recent = h('div', { class: 'sp-recent' }, ...recentDocs().slice(0, 6).map(it => item(it.label, it.icon, it.action)));
    const home = h('div', null, grid, h('div', { class: 'sp-head' }, h('b', null, 'Recommended')), recent);
    const apps = h('div', { class: 'sp-apps', hidden: true }, ...az());
    const title = h('b', null, 'Pinned');
    const toggle = allBtn('All apps', () => {
      apps.hidden = !apps.hidden; home.hidden = !apps.hidden;
      title.textContent = apps.hidden ? 'Pinned' : 'All apps'; toggle.firstChild.textContent = apps.hidden ? 'All apps' : 'Back';
    });
    const body = h('div', { class: 'sp-body' }, h('div', { class: 'sp-head' }, title, toggle), home, apps);
    const s = search(body, 'Type here to search');
    el = h('div', { class: 'startpanel sp-eleven' }, s.box, body, s.found, h('footer', null, user(), power('Power')));
    focus = s.box;
  }
  el.addEventListener('pointerdown', e => e.stopPropagation());
  el.addEventListener('contextmenu', e => e.preventDefault());
  closeMenus('replaced');
  closePanel();
  panel = el;
  document.body.append(el);
  sound('Menu popup');
  el.tabIndex = -1;
  (focus || el).focus({ preventScroll: true });
}

// ---------- Run ----------

export function runDialog() {
  // The Open box remembers what was run before, newest first.
  const history = store.get('w95.run', []);
  const input = h('input', { class: 'field', id: 'run-open', autocomplete: 'off', list: 'run-history', value: history[0] || '', style: { flex: '1', minWidth: '0' } });
  const datalist = h('datalist', { id: 'run-history' }, ...history.map(v => h('option', { value: v })));
  const form = h('form', { class: 'dlg', style: { width: 'min(360px, calc(100vw - 24px))' } },
    h('div', { class: 'row' }, icon('i-run'), h('div', { class: 'msg' }, 'Type the name of a program, folder, or document, and ' + OS + ' will open it for you.')),
    h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('span', { html: '<u>O</u>pen:' }), input, datalist),
    h('div', { class: 'btns right' },
      h('button', { class: 'btn default', type: 'submit' }, 'OK'),
      h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel'),
      h('button', { class: 'btn', type: 'button', onclick: () => launch('explorer', 'C:\\') }, h('span', { html: '<u>B</u>rowse...' }))));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = input.value;
    if (run(v, win)) {
      if (v.trim()) store.set('w95.run', [v.trim(), ...history.filter(x => x !== v.trim())].slice(0, 10));
      win.close();
    }
    else msgbox({ title: v, icon: 'error', parent: win, text: `Cannot find the file '${v}' (or one of its components). Make sure the path and filename are correct and that all required libraries are available.` });
  });
  form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  const win = createWindow({ title: 'Run', body: form, dialog: true, resizable: false, width: 'auto', taskbar: false, x: 8, y: Math.max(0, desktopEl.clientHeight - 190), help: () => launch('help') });
  input.focus();
  input.select();
}

// ---------- shut down / log off ----------

export function shutDown() {
  const opts = [
    ['shutdown', V.offText ? '&Shut down the computer?' : '&Exit to MS-DOS?'],
    ['restart', '&Restart the computer?'],
    V.dosMode && ['dos', 'Restart the computer in &MS-DOS mode?'],
    V.logoff && ['logoff', '&Close all programs and log on as a different user?'],
  ].filter(Boolean);
  // The dither goes inside the window layer so the dialog can sit above it.
  const dim = h('div', { class: 'screen dim' });
  document.getElementById('windows').append(dim);
  document.body.classList.add('shutting');
  const form = h('form', { class: 'dlg', style: { width: 'min(380px, calc(100vw - 24px))' } },
    h('div', { class: 'row' }, icon('i-shutdown'), h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      h('div', null, V.shutAsk),
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
  const win = createWindow({ title: V.shutTitle, body: form, dialog: true, resizable: false, width: 'auto', taskbar: false, onClosed: () => { dim.remove(); document.body.classList.remove('shutting'); } });
  win.el.style.zIndex = 9001;
  form.querySelector('.btn').focus();
}

function closeAll() { all().forEach(w => close(w, true)); }

async function powerOff() {
  closeAll();
  sound('Exit Windows');
  const wait1 = h('div', { class: 'screen wait' }, V.waitText ? h('div', null, V.waitText) : null);
  document.body.append(wait1);
  await wait(reducedMotion.matches ? 300 : 1400);
  // Before 95 Windows exits to the DOS prompt; from Vista on the screen just goes black.
  const off = h('div', { class: 'screen off' + (V.offText.startsWith('C:') ? ' dos' : ''), tabindex: '0', role: 'button' },
    h('div', { style: { whiteSpace: 'pre-line' } }, V.offText, h('small', null, 'Click anywhere to start ' + OS + ' again.')));
  wait1.replaceWith(off);
  off.focus();
  const restart = () => { try { sessionStorage.removeItem('w95.booted'); } catch {} history.replaceState(null, '', location.pathname); location.reload(); };
  off.addEventListener('click', restart);
  off.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') restart(); });
}

async function logOff() {
  const b = await msgbox({ title: V.logoff.replace('...', ''), icon: 'i-logoff', text: `Are you sure you want to ${V.logoff.replace('...', '').toLowerCase()}?`, buttons: ['&Yes', '&No'] });
  if (b === 'Yes') logOn();
}

// The Welcome dialog. The account is the GitHub one.
function logOn() {
  closeAll();
  const scr = h('div', { class: 'screen logon' });
  const pw = h('input', { class: 'field', type: 'password', id: 'logon-pw', autocomplete: 'off' });
  const form = h('form', { class: 'win active logon-win', 'aria-label': 'Welcome to ' + OS },
    h('div', { class: 'titlebar' }, h('span', { class: 't' }, 'Welcome to ' + OS)),
    h('div', { class: 'dlg' },
      h('div', { class: 'row' },
        h('img', { src: GITHUB + '.png?size=96', alt: '', width: 48, height: 48, class: 'logon-avatar' }),
        h('div', { class: 'logon-fields' },
          h('p', null, 'Type a user name and password to log on to ' + OS + '.'),
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

// Which era's boot screen; versions.css draws each from the parts below.
const bootLook = () => ({ '1.0': '1', '2.0': '1', '3.1': '3', 95: '9x', 98: '9x', me: '9x', 2000: '2000', xp: 'xp', vista: 'vista', 7: '7' })[V.id] || 'metro';
function bootParts() {
  const copy = h('small', { class: 'copy' }, 'Copyright \u00a9 ' + V.copy + ' blankiekun');
  const name = h('b', null, 'blankiekun', h('sup', null, V.short));
  switch (bootLook()) {
    case '1': return [h('div', { class: 'box' }, h('b', null, 'blankiekun'), h('span', null, 'Version ' + V.number)), copy];
    case '3': return [h('div', { class: 'logo' }, icon('i-flag'), h('div', { class: 'word' }, h('b', null, 'blankiekun'), h('i', null, 'Version ' + V.short))), copy];
    case '9x': return [h('div', { class: 'logo' }, icon('i-flag'), h('div', { class: 'word' }, h('small', null, 'Starting'), name)), h('div', { class: 'bar' })];
    case '2000': return [h('div', { class: 'band' }, icon('i-flag'), h('div', { class: 'word' }, name, h('span', null, 'Professional'), h('small', null, 'Built on NT Technology'))),
      h('div', { class: 'prog' }, h('i')), h('p', null, 'Starting Up...')];
    case 'xp': return [h('div', { class: 'logo' }, icon('i-flag'), h('div', { class: 'word' }, name)), h('div', { class: 'track' }, h('span', null, h('i'), h('i'), h('i'))),
      copy, h('em', { class: 'maker' }, 'blankiekun')];
    case 'vista': return [h('div', { class: 'track' }, h('i')), h('small', { class: 'copy' }, '\u00a9 blankiekun')];
    case '7': return [h('div', { class: 'logo' }, icon('i-flag')), h('p', null, 'Starting ' + OS), h('small', { class: 'copy' }, '\u00a9 blankiekun')];
    default: return [h('div', { class: 'panes' }), h('div', { class: 'spin' }, ...[0, 1, 2, 3, 4].map(n => h('i', { style: '--n:' + n })))];
  }
}

export async function boot() {
  let booted = false;
  try { booted = sessionStorage.getItem('w95.booted') === '1'; sessionStorage.setItem('w95.booted', '1'); } catch {}
  if (booted) return;
  const fast = reducedMotion.matches;
  let skip;
  const skipped = new Promise(r => { skip = r; });
  const post = h('div', { class: 'screen post', 'aria-live': 'polite' }, V.start ? 'Starting ' + OS + '...' : 'C:\\>WIN');
  document.body.append(post);
  const onKey = () => skip();
  addEventListener('keydown', onKey);
  post.addEventListener('pointerdown', skip);
  await Promise.race([wait(fast ? 200 : 900), skipped]);
  const splash = h('div', { class: 'screen splash b-' + bootLook(), role: 'img', 'aria-label': OS + ' is starting' }, ...bootParts());
  splash.addEventListener('pointerdown', skip);
  post.replaceWith(splash);
  await Promise.race([wait(fast ? 600 : 2200), skipped]);
  removeEventListener('keydown', onKey);
  splash.remove();
  sound('Start Windows');
}

// ---------- taskbar ----------

const taskbarEl = document.getElementById('taskbar');
const TASKBAR = 'w95.taskbar';
const taskbarPrefs = () => ({ ontop: true, autohide: false, small: false, clock: true, ...store.get(TASKBAR, {}) });

function applyTaskbar(p = taskbarPrefs()) {
  document.body.classList.toggle('tb-autohide', p.autohide);
  document.body.classList.toggle('tb-under', !p.ontop);
  document.getElementById('clock').hidden = !p.clock;
}
// Auto hide: the taskbar slides away and comes back when the pointer reaches the bottom edge.
document.addEventListener('pointermove', e => {
  if (!document.body.classList.contains('tb-autohide')) return;
  const show = e.clientY >= innerHeight - 4 || taskbarEl.contains(e.target) || isOpen();
  taskbarEl.classList.toggle('peek', show);
});

taskbarEl.addEventListener('contextmenu', e => {
  if (e.target.closest('.task') || e.target.closest('.start')) return;
  e.preventDefault();
  openMenu(some([
    { label: '&Cascade', action: cascadeAll },
    { label: 'Tile &Horizontally', action: () => tile(false) },
    { label: 'Tile &Vertically', action: () => tile(true) },
    '-',
    { label: '&Minimize All Windows', action: minimizeAll },
    QUICK_ON && { label: 'Reset &Quick Launch', action: () => { pins = QUICK_DEFAULT.slice(); savePins(); } },
    undoLabel() && { label: undoLabel(), action: undo },
    '-',
    !['1.0', '2.0', '3.1', '95', '98', 'me'].includes(V.id) && { label: 'Tas&k Manager', action: () => launch('taskman') },
    { label: 'P&roperties', action: taskbarProps },
  ]), { x: e.clientX, y: e.clientY });
});

export function taskbarProps() {
  const p = taskbarPrefs();
  const box = (k, label) => h('label', { class: 'pr-check' }, h('input', { type: 'checkbox', checked: p[k], 'data-k': k }), h('span', { html: label }));
  const pic = h('div', { class: 'tbp-pic', 'aria-hidden': 'true' },
    h('div', { class: 'tbp-win' }, h('i'), h('b', null, 'Sound Recorder')),
    h('div', { class: 'tbp-bar' }, h('span', { class: 'tbp-start' }, 'Start'), h('span', { class: 'tbp-task' }), h('span', { class: 'tbp-clock' }, '12:45 PM')));
  const opts = h('div', { class: 'tbp' }, pic,
    box('ontop', 'Always on <u>t</u>op'), box('autohide', 'A<u>u</u>to hide'),
    box('small', 'Show <u>s</u>mall icons in Start menu'), box('clock', 'Show <u>C</u>lock'));
  const sync = () => {
    const q = Object.fromEntries([...opts.querySelectorAll('input')].map(i => [i.dataset.k, i.checked]));
    pic.querySelector('.tbp-clock').hidden = !q.clock;
    return q;
  };
  opts.addEventListener('change', () => { sync(); applyBtn.disabled = false; });
  const progs = h('div', { class: 'tbp' },
    h('fieldset', { class: 'group' }, h('legend', null, 'Customize Start Menu'),
      h('p', null, 'You can customize your Start menu by adding or removing items from it.'),
      h('div', { class: 'btns right' },
        h('button', { class: 'btn', type: 'button', onclick: () => launch('explorer', 'C:\\WINDOWS') }, 'Advanced...'))),
    h('fieldset', { class: 'group' }, h('legend', null, 'Documents Menu'),
      h('div', { class: 'row', style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        h('p', { style: { margin: 0, flex: 1 } }, 'Click Clear to remove the contents of the Documents Menu.'),
        h('button', { class: 'btn', type: 'button', onclick: e => { store.set(RECENT, []); e.currentTarget.disabled = true; } }, 'Clear'))));
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, ...['Taskbar Options', 'Start Menu Programs'].map((t, i) => {
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === 0) }, t);
    b.addEventListener('click', () => { tabs.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', String(x === b))); opts.hidden = i !== 0; progs.hidden = i !== 1; });
    return b;
  }));
  progs.hidden = true;
  const apply = () => { const q = sync(); store.set(TASKBAR, q); applyTaskbar(q); applyBtn.disabled = true; };
  const applyBtn = h('button', { class: 'btn', type: 'button', disabled: true, onclick: apply }, 'Apply');
  const form = h('form', { class: 'dlg', style: { width: 'min(380px, calc(100vw - 24px))' } },
    h('div', { class: 'dp-tabs' }, tabs, h('div', { class: 'tabpanel' }, opts, progs)),
    h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'OK'),
      h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel'), applyBtn));
  form.addEventListener('submit', e => { e.preventDefault(); apply(); win.close(); });
  form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  sync();
  const win = createWindow({ app: 'taskbarprops', title: 'Taskbar Properties', icon: 'i-taskbar', body: form, dialog: true, resizable: false, width: 'auto', taskbar: true, help: () => launch('help') });
  form.querySelector('.btn').focus();
}

// ---------- volume ----------

const VOLUME = 'w95.volume';
const volume = () => ({ level: 0.8, mute: false, ...store.get(VOLUME, {}) });
function setVolume(v) {
  store.set(VOLUME, v);
  window.dispatchEvent(new CustomEvent('w95-volume'));
  document.querySelector('.tray .spk').classList.toggle('muted', v.mute);
}

let volEl = null;
// The little popup over the speaker, or (from the Start menu) the Volume Control mixer.
export function volumePopup(mixer) {
  if (mixer) return volumeControl();
  if (volEl) { volEl.remove(); volEl = null; return; }
  const v = volume();
  const slider = h('input', { type: 'range', class: 'vol-slider', min: 0, max: 100, value: Math.round(v.level * 100), 'aria-label': 'Volume', orient: 'vertical' });
  const mute = h('input', { type: 'checkbox', id: 'vol-mute', checked: v.mute });
  slider.addEventListener('input', () => setVolume({ ...volume(), level: slider.value / 100 }));
  mute.addEventListener('change', () => setVolume({ ...volume(), mute: mute.checked }));
  volEl = h('div', { class: 'vol-pop', role: 'dialog', 'aria-label': 'Volume' }, h('div', null, 'Volume'), slider, h('label', { for: 'vol-mute' }, mute, ' ', h('u', null, 'M'), 'ute'));
  volEl.addEventListener('pointerdown', e => e.stopPropagation());
  document.body.append(volEl);
  slider.focus();
  const off = e => { if (volEl && !volEl.contains(e.target) && !e.target.closest('.spk')) { volEl.remove(); volEl = null; document.removeEventListener('pointerdown', off, true); } };
  document.addEventListener('pointerdown', off, true);
  volEl.addEventListener('keydown', e => { if (e.key === 'Escape') { volEl.remove(); volEl = null; } });
}

function volumeControl() {
  const v = volume();
  const col = (name, live) => {
    const s = h('input', { type: 'range', class: 'vol-slider', min: 0, max: 100, value: live ? Math.round(v.level * 100) : 80, 'aria-label': name + ' volume', orient: 'vertical' });
    const bal = h('input', { type: 'range', class: 'vol-bal', min: -50, max: 50, value: 0, 'aria-label': name + ' balance' });
    const m = h('input', { type: 'checkbox', checked: live && v.mute });
    if (live) {
      s.addEventListener('input', () => setVolume({ ...volume(), level: s.value / 100 }));
      m.addEventListener('change', () => setVolume({ ...volume(), mute: m.checked }));
    }
    return h('div', { class: 'vol-col' }, h('b', null, name), h('span', null, 'Balance:'), bal, h('span', null, 'Volume:'), s, h('label', null, m, live ? ' Mute all' : ' Mute'));
  };
  const body = h('div', { class: 'vol-mixer' }, col('Volume Control', true), col('Wave'), col('MIDI'), col('CD Audio'), col('Line-In'));
  createWindow({ app: 'volume', title: 'Volume Control', icon: 'i-speaker', body, width: 'auto', resizable: false, maximizable: false });
}

// ---------- clock ----------

let formatTime = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
let formatDate = d => d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

function clock() {
  const t = document.getElementById('clock');
  const tray = t.parentElement;
  const tick = () => {
    const d = new Date();
    t.textContent = formatTime(d);
    t.dateTime = d.toISOString();
    tray.dataset.tip = formatDate(d);
  };
  tick();
  setInterval(tick, 10000);
  // Regional Settings decides how the time looks, when that applet loaded.
  import('./apps/control.js').then(m => {
    if (m.formatTime) formatTime = d => m.formatTime(d);
    if (m.formatDate) formatDate = d => m.formatDate(d, true);
    tick();
  }).catch(() => {});
  window.addEventListener('w95-regional', tick);
  t.addEventListener('dblclick', () => launch('datetime'));
  const spk = tray.querySelector('svg');
  spk.classList.add('spk');
  spk.classList.toggle('muted', volume().mute);
  spk.setAttribute('aria-hidden', 'false');
  spk.setAttribute('role', 'button');
  spk.setAttribute('aria-label', 'Volume');
  spk.addEventListener('click', () => volumePopup(false));
  spk.addEventListener('dblclick', () => { if (volEl) { volEl.remove(); volEl = null; } volumeControl(); });
}

// ---------- tooltips ----------

// title= hints in the shell show as Windows 95's yellow tooltips instead of the browser's.
// An iframe's title is its accessible name, not a hint, so it is left alone.
let tipFor = null, tipEl = null, tipTimer = 0, tipX = 0, tipY = 0;
function hideTip() { clearTimeout(tipTimer); if (tipEl) tipEl.remove(); tipEl = tipFor = null; }
document.addEventListener('pointermove', e => { tipX = e.clientX; tipY = e.clientY; }, { passive: true });
document.addEventListener('pointerover', e => {
  const el = e.pointerType === 'mouse' && e.target.closest ? e.target.closest('[title]:not(iframe), [data-tip]') : null;
  if (el === tipFor) return;
  hideTip();
  if (!el) return;
  if (el.title) { el.dataset.tip = el.title; el.removeAttribute('title'); }
  tipFor = el;
  tipTimer = setTimeout(() => {
    if (!el.isConnected || !el.dataset.tip) return;
    tipEl = h('div', { class: 'tooltip', role: 'tooltip' }, el.dataset.tip);
    document.body.append(tipEl);
    const r = tipEl.getBoundingClientRect();
    tipEl.style.left = clamp(tipX, 0, innerWidth - r.width) + 'px';
    tipEl.style.top = (tipY + 20 + r.height > innerHeight ? tipY - r.height - 2 : tipY + 20) + 'px';
  }, 500);
});
document.addEventListener('pointerout', e => { if (!e.relatedTarget) hideTip(); });
document.addEventListener('pointerdown', hideTip, true);
document.addEventListener('keydown', hideTip, true);

// Until Start has been clicked once, a hint slides out beside it, as on a new Windows 95 PC.
const BEGUN = 'w95.begun';
function beginHint() {
  if (store.get(BEGUN, false) || !V.start) return;
  const hint = h('div', { class: 'tooltip begin-hint', 'aria-hidden': 'true' }, '\u25c4 Click here to begin');
  hint.style.left = startBtn.getBoundingClientRect().right + 4 + 'px';
  document.body.append(hint);
}

// ---------- quick launch ----------

const QUICK = 'w95.quick';
const QUICK_DEFAULT = [
  { label: 'Windows Explorer', id: 'explorer', icon: 'i-folder-open', arg: { path: 'C:\\', explore: true } },
  { label: 'Internet Explorer', id: 'ie', icon: 'i-ie', arg: 'home' },
  { label: 'Inbox', id: 'inbox', icon: 'i-inbox' },
  { label: 'MS-DOS Prompt', id: 'dos', icon: 'i-dos' },
  { label: 'Notepad', id: 'notepad', icon: 'i-notepad' },
  { label: 'Show Desktop', id: 'showdesktop', icon: 'i-computer' },
].filter(p => !absent(p.id));
let pins = store.get(QUICK, QUICK_DEFAULT);
// From 7 on, pins are taskbar buttons; opening one swaps the pin for the window's button.
const SUPERBAR = VERSIONS.indexOf(V) >= VERSIONS.findIndex(r => r.id === '7');
// Quick Launch came with IE4 and 98.
const QUICK_ON = VERSIONS.indexOf(V) >= VERSIONS.findIndex(r => r.id === '98');
const quickEl = h('nav', SUPERBAR ? { class: 'pins' } : { class: 'quick', 'aria-label': 'Quick Launch' });
const pinOf = app => [...quickEl.children].find(b => b.dataset.app === app && b.classList.contains('pin'));
// CSS hides a pin while a window's button follows it.
function placeTask(w) {
  let at = SUPERBAR && pinOf(w.app);
  if (!at) { delete w.task.dataset.app; document.getElementById('tasks').append(w.task); return; }
  while (at.nextElementSibling?.matches('.task:not(.pin)')) at = at.nextElementSibling;
  w.task.dataset.app = w.app;
  at.after(w.task);
}
const savePins = () => { store.set(QUICK, pins); renderQuick(); };
const isPinned = id => pins.some(p => p.id === id);
const pin = p => { if (!isPinned(p.id)) { pins.push(p); savePins(); } };
const unpin = id => { pins = pins.filter(p => p.id !== id); savePins(); };

function renderQuick() {
  const running = all().filter(w => w.task && (quickEl.contains(w.task) || isPinned(w.app)));
  quickEl.replaceChildren(...pins.filter(p => p.id === 'showdesktop' ? !SUPERBAR : appInfo(p.id)).map(p => {
    const b = h('button', { type: 'button', class: SUPERBAR ? 'task pin' : null, 'data-app': p.id, title: rename(p.label), 'aria-label': rename(p.label) }, icon(p.icon));
    b.addEventListener('click', () => { if (!b.dragged) p.id === 'showdesktop' ? minimizeAll() : launch(p.id, p.arg); });
    b.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      openMenu([{ label: '&Open', action: () => b.click() }, '-', { label: 'Unpin from &Taskbar', action: () => unpin(p.id) }], { x: e.clientX, y: e.clientY });
    });
    // Drag sideways to reorder; the order is saved on drop.
    b.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const x0 = e.clientX;
      b.dragged = false;
      const move = ev => {
        if (!b.dragged && Math.abs(ev.clientX - x0) < 5) return;
        b.dragged = true;
        const over = [...quickEl.children].find(o => o !== b && !o.matches('.task:not(.pin)') && ev.clientX >= o.getBoundingClientRect().left && ev.clientX < o.getBoundingClientRect().right);
        if (over && over.getBoundingClientRect().left > b.getBoundingClientRect().left) {
          let at = over;
          while (at.nextElementSibling?.matches('.task:not(.pin)')) at = at.nextElementSibling;
          at.after(b);
        } else if (over) over.before(b);
      };
      const up = () => {
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
        if (!b.dragged) return;
        const order = [...quickEl.children].filter(o => !o.matches('.task:not(.pin)')).map(o => o.dataset.app);
        pins.sort((a, c) => order.indexOf(a.id) - order.indexOf(c.id));
        store.set(QUICK, pins);
        setTimeout(() => { b.dragged = false; });
      };
      // On document, not b: moving b in the DOM drops pointer capture.
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
    });
    return b;
  }));
  running.forEach(placeTask);
}
function quickLaunch() {
  if (!QUICK_ON) return;
  renderQuick();
  if (SUPERBAR) document.getElementById('tasks').prepend(quickEl);
  else document.getElementById('start').after(quickEl);
  onPlaceTask(placeTask);
  // 7's jump list: open another, pin or unpin, close; Shift+right-click still gives the window menu.
  if (SUPERBAR) onTaskMenu((w, at, e) => {
    const a = w.app && appInfo(w.app);
    if (e.shiftKey || !a) { systemMenu(w, at); return; }
    openMenu([
      { label: rename(a.title), action: () => launch(w.app) },
      isPinned(w.app) ? { label: '&Unpin this program from taskbar', action: () => unpin(w.app) }
        : { label: '&Pin this program to taskbar', action: () => pin({ label: a.title, id: w.app, icon: a.icon || 'i-exe' }) },
      '-', { label: '&Close window', action: () => close(w) },
    ], at);
  });
}

// 98's Channel Bar, down the right of the desktop: a button per project page.
function channelBar() {
  const ch = (label, page, cls) => h('button', { type: 'button', class: 'ch-btn ' + cls, onclick: () => launch('ie', page) }, label);
  desktopEl.insertBefore(h('div', { class: 'channelbar', role: 'toolbar', 'aria-label': 'Channel Bar' },
    h('div', { class: 'ch-head' }, 'Channels'),
    ch('Homepage', 'home', 'c1'), ch('chimimouryou', 'chimimouryou', 'c2'), ch('CONscripter', 'conscripter', 'c3'),
    ch('Converter', 'convert', 'c4'), ch('Software Depot', 'games', 'c5'), ch('Guestbook', 'guestbook', 'c6')), document.getElementById('windows'));
}

export function initDesktop() {
  register({ id: 'volume', title: 'Volume Control', icon: 'i-speaker', open: () => volumeControl() });
  register({ id: 'taskbarprops', title: 'Taskbar Properties', icon: 'i-taskbar', open: taskbarProps });
  if (V.id === '3.1') {
    register({ id: 'progman', title: 'Program Manager', icon: 'i-programs', single: true, open: progman });
    // Minimized windows sit as icons on the desktop, under the windows.
    desktopEl.insertBefore(document.getElementById('tasks'), document.getElementById('windows'));
    launch('progman');
  }
  applyTaskbar();
  quickLaunch();
  renderIcons();
  if (V.id === '98') channelBar();
  lastH = desktopEl.clientHeight;
  startBtn.querySelector('span').textContent = V.start;
  startBtn.setAttribute('aria-label', 'Start');
  clock();
  beginHint();
}
