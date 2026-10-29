// The desktop surface: icons, right-click menu, Start menu, tray clock,
// and the boot / shut down / log off screens.

import { h, icon, clamp, wait, reducedMotion, store, marquee, overlaps, sound, small } from './util.js';
import { openMenu, closeMenus, isOpen } from './menu.js';
import { launch, register, createWindow, all, close, deactivate, appInfo, cascadeAll, tile, minimizeAll, showDesktop, focus, undo, undoLabel, onPlaceTask, onRun, onLock, onTaskMenu, onActionCenter, onTaskView, systemMenu } from './wm.js';
import { msgbox, about } from './dialogs.js';
import { taskView, closeTaskView } from './taskview.js';
import { menubar } from './menu.js';
import { run, open as shellOpen, RECENT } from './shell.js';
import { recycle, network, root, resolve, onChange, desktopFolder, startupFolder, createFile, mkdir, emptyBin, FsError, kindLabel } from './fs.js';
import { properties, iconOf } from './props.js';
import { clip, cut, copyNodes, paste, canPaste, del, drop, toFloppy, onClip, isCut, undo as undoFile, undoLabel as fileUndoLabel, renameNode, makeShortcut } from './fileops.js';
import { OS, V, VERSIONS, rename, absent } from './version.js';
import * as wn from './whatsnew.js';

const GITHUB = 'https://github.com/blankiekun';
const desktopEl = document.getElementById('desktop');
const iconsEl = document.getElementById('icons');

// ---------- icons ----------

const ICONS = [
  { label: 'My Computer', modern: true, app: 'mycomputer', icon: 'i-computer', type: 'System', node: root, open: () => launch('mycomputer') },
  { label: 'Network Neighborhood', app: 'network', icon: 'i-network', type: 'System', node: network, open: () => launch('network') },
  { label: 'Windows Explorer', app: 'explorer', icon: 'i-folder-open', type: 'Application', open: () => launch('explorer', { path: 'C:\\', explore: true }) },
  { label: 'Inbox', app: 'inbox', icon: 'i-inbox', type: 'Application', open: () => launch('inbox') },
  { label: 'Recycle Bin', modern: true, app: 'recycle', icon: () => recycle.children.length ? 'i-trash-full' : 'i-trash', type: 'System', node: recycle, open: () => launch('recycle') },
  { label: 'Internet Explorer', modern: true, app: 'ie', icon: 'i-ie', type: 'Application', open: () => launch('ie', 'home') },
  { label: 'CONscripter', modern: true, app: 'cons', icon: 'i-game', type: 'Application', open: () => launch('cons') },
  { label: 'VNBox', modern: true, app: 'vnbox', icon: 'i-vnbox', type: 'Application', open: () => launch('vnbox') },
  { label: 'Games', modern: true, app: 'ie', icon: 'i-cd', type: 'Shortcut', shortcut: true, open: () => launch('ie', 'games') },
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
  { label: 'README.TXT', modern: true, app: 'notepad', icon: 'i-txt', type: 'Text Document', open: () => run('notepad readme.txt') },
  { label: 'WHATSNEW.TXT', modern: true, app: 'notepad', icon: 'i-txt', type: 'Text Document', open: openWhatsNew },
  { label: 'GitHub', modern: true, icon: 'i-github', type: 'Shortcut', shortcut: true, open: () => window.open(GITHUB, '_blank', 'noopener') },
];
// 8 to 11 came with a bare desktop: just these (modern: true), the site's own shortcuts among them. 8 dropped Briefcase.
const BARE = ['8', '10', '11'].includes(V.id);
const hidden = n => BARE && n.briefcase;
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
  for (let i = ICONS.length - 1; i >= 0; i--) if ((ICONS[i].app && !appInfo(ICONS[i].app)) || (ICONS[i].era && absent(ICONS[i].app)) || (BARE && !ICONS[i].modern)) ICONS.splice(i, 1);
  ICONS.forEach((it, i) => iconsEl.append(makeIcon(it, i)));
  for (const n of desktopFolder().children.filter(n => !hidden(n))) { const it = fileIcon(n); ICONS.push(it); iconsEl.append(makeIcon(it, ICONS.length)); }
  arrange();
  if (V.id === '7' && !small.matches) scatter();
}

// Keeps the visitor's icons in step with the Desktop folder; new ones go in the next free spot.
function syncFiles() {
  const nodes = desktopFolder().children.filter(n => !hidden(n));
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
// 7's moe desktop: icons strewn over the left of the screen, the same spots every visit, one per cell.
// They count as moved, so a resize leaves them be; Arrange Icons puts them back in columns.
function scatter() {
  const cols = Math.max(1, Math.floor(desktopEl.clientWidth * .7 / CELL_W)), rows = Math.max(1, Math.floor((desktopEl.clientHeight - 8) / CELL_H));
  const cells = [...Array(cols * rows).keys()];
  let seed = 7;
  const r = () => (seed = Math.imul(seed, 48271) % 2147483647) / 2147483647;
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  ICONS.forEach((it, i) => {
    if (i >= cells.length) return;   // more icons than cells: the rest keep their column spot
    it.x = 4 + Math.floor(cells[i] / rows) * CELL_W + Math.round(r() * 16 - 8);
    it.y = 6 + (cells[i] % rows) * CELL_H + Math.round(r() * 12 - 6);
    it.x = Math.max(0, it.x); it.y = Math.max(0, it.y);
    place(it);
  });
  moved = true;
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
    { label: '&Gadgets', action: () => launch('gadgets') },
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
      prog('VNBox', 'vnbox', 'i-vnbox'),
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
    era('Snipping Tool', 'snip', 'i-snip'),
    era('Sticky Notes', 'stickynotes', 'i-stickynotes'),
    prog('WinPopup', 'winpopup', 'i-winpopup'),
    prog('WordPad', 'wordpad', 'i-wordpad'),
  ]);
  const projects = [
    { label: "blankiekun's Homepage", icon: 'i-pg-home', action: () => launch('ie', 'home') },
    '-',
    { label: 'chimimouryou', icon: 'i-pg-chimi', action: () => launch('ie', 'chimimouryou') },
    prog('chimimouryou Reader (demo)', 'reader', 'i-reader'),
    { label: 'conscripter-convert', icon: 'i-pg-convert', action: () => launch('ie', 'convert') },
    { label: 'CONscripter', icon: 'i-pg-cons', action: () => launch('ie', 'conscripter') },
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
      { label: 'StartUp', icon: 'i-programs', action: () => launch('explorer', 'C:\\WINDOWS\\Start Menu\\Programs\\StartUp') },
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

// q: what was typed in 10's taskbar search box, carried on into the panel's own.
function openPanel(q) {
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
  const lockItem = () => PANEL === 'xp' ? null : named(item('Lock', 'i-logoff', lock, 'sp-logoff sp-lock'), 'Lock');
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
      h('div', { class: 'sp-right' }, user(), ...places, h('div', { class: 'sp-grow' }), h('div', { class: 'sp-foot' }, power(), lockItem(), logoff())));
    focus = s.box;
  } else if (PANEL === 'screen') {
    const tiles = h('div', { class: 'sp-tiles' },
      h('button', { type: 'button', class: 'sp-tile wide', onclick: () => closePanel() }, icon('i-computer'), h('span', null, 'Desktop')),
      ...fav.map(it => h('button', { type: 'button', class: 'sp-tile', onclick: go(it.action) }, icon(it.icon), h('span', null, strip(it.label)))));
    const apps = h('div', { class: 'sp-folders', hidden: true }, ...az());
    const all = h('button', { type: 'button', class: 'sp-arrow', 'aria-label': 'All apps', onclick: () => { apps.hidden = !apps.hidden; tiles.hidden = !apps.hidden; all.classList.toggle('up', !apps.hidden); } });
    const body = h('div', null, tiles, apps, all), s = search(body, 'Search everywhere');
    el = h('div', { class: 'startpanel sp-screen' },
      h('header', null, h('h1', null, 'Start'), user(), lockItem(), power('Power'), s.box),
      body, s.found);
    focus = s.box;
    // Clicking the background goes back to the desktop, like Escape.
    el.addEventListener('click', e => { if (e.target === el) closePanel(); });
  } else if (PANEL === 'ten') {
    const apps = h('div', null, ...az());
    const s = search(apps, 'Type here to search');
    el = h('div', { class: 'startpanel sp-ten' },
      h('div', { class: 'sp-rail' }, user(), item('Documents', 'i-docs', () => launch('explorer', 'C:\\My Documents')),
        item('Settings', 'i-ctrl', () => launch('settings')), lockItem(), logoff(), power('Power')),
      h('div', { class: 'sp-apps' }, s.box, apps, s.found),
      h('div', { class: 'sp-tiles' }, ...fav.map(it => h('button', { type: 'button', class: 'sp-tile', onclick: go(it.action) }, icon(it.icon), h('span', null, strip(it.label))))));
    focus = s.box;
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
    el = h('div', { class: 'startpanel sp-eleven' }, s.box, body, s.found, h('footer', null, user(), lockItem(), power('Power')));
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
  if (q && focus) { focus.value = q; focus.dispatchEvent(new Event('input')); }
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
  const b = await msgbox({ title: V.logoff.replace('...', ''), icon: 'i-logoff', text: `Are you sure you want to ${V.logoff.replace('...', '').toLowerCase()}?`, buttons: V.id === 'xp' ? ['&Yes', 'Switch &User', '&No'] : ['&Yes', '&No'] });
  if (b === 'Yes') logOn();
  else if (b === 'Switch User') lock();
}

// Shortcuts in StartUp open after boot and logon; Shift skips them, so a bad one can't trap the visitor.
let shiftHeld = false;
const runStartup = () => { if (!shiftHeld) startupFolder().children.forEach(n => shellOpen(n)); };
for (const t of ['keydown', 'keyup', 'click']) addEventListener(t, e => { shiftHeld = e.shiftKey; }, true);

// While the sign-in is up nothing behind it can take focus, so Tab can't walk into the windows.
const trap = on => { for (const id of ['desktop', 'taskbar']) document.getElementById(id).inert = on; };

// The sign-in, in the era's own look; the account is the GitHub one. Any password works.
function logOn(locked) {
  if (!locked) closeAll();
  const look = PANEL || (V.id === '2000' ? 'nt' : '9x');
  const scr = h('div', { class: 'screen logon logon-' + look });
  const signIn = () => {
    scr.remove();
    trap(false);
    if (locked) return;
    launch('ie', 'home');
    runStartup();
    import('./apps/gadgets.js').then(m => m.reopen());
  };
  // Every screen is a labelled form, so Enter signs in and screen readers name it.
  const form = (label, cls, kids, next = signIn) => {
    const f = h('form', { class: cls, 'aria-label': label }, ...kids);
    f.addEventListener('submit', e => { e.preventDefault(); next(); });
    return f;
  };
  const off = () => { scr.remove(); trap(false); powerOff(); };
  scr.append(...LOGON[look](form, off, scr));
  document.body.append(scr);
  trap(true);
  scr.querySelector('input:not([readonly]), button').focus();
}

const pwField = (placeholder) => h('input', { class: 'field', type: 'password', autocomplete: 'off', 'aria-label': 'Password', placeholder });
const avatar = (cls, size = 48) => h('img', { src: GITHUB + '.png?size=' + size * 2, alt: '', width: size, height: size, class: cls });
const glyph = (id, label, onclick) => h('button', { class: 'logon-glyph', type: 'button', title: label, 'aria-label': label, onclick }, icon(id));
const win9x = (form, label, kids, buttons, next) => form(label, 'win active logon-win', [
  h('div', { class: 'titlebar' }, h('span', { class: 't' }, label)),
  h('div', { class: 'dlg' }, h('div', { class: 'row' }, ...kids, h('div', { class: 'btns', style: { flexDirection: 'column' } }, ...buttons)))], next);
const okBtn = () => h('button', { class: 'btn default', type: 'submit' }, 'OK');
const userRow = () => h('label', null, h('span', { html: '<u>U</u>ser name:' }), h('input', { class: 'field', value: 'blankiekun', readonly: true }));
const pwRow = () => h('label', null, h('span', { html: '<u>P</u>assword:' }), pwField());

const LOGON = {
  // 95, 98 and Me: the Welcome dialog. Cancel logs on too, as it did.
  '9x': form => [win9x(form, 'Welcome to ' + OS, [avatar('logon-avatar'),
    h('div', { class: 'logon-fields' },
      h('p', null, 'Type a user name and password to log on to ' + OS + '.'), userRow(), pwRow(),
      h('p', { class: 'logon-hint' }, 'Any password works. This account is ', h('a', { href: GITHUB, target: '_blank', rel: 'noopener' }, 'github.com/blankiekun'), '.'))],
    [okBtn(), h('button', { class: 'btn', type: 'button', onclick: e => e.target.form.requestSubmit() }, 'Cancel')])],
  // 2000: Ctrl+Alt+Delete first, then Log On to blankiekun.
  nt(form, off, scr) {
    const band = () => h('div', { class: 'logon-band', 'aria-hidden': 'true' }, h('b', null, 'blankiekun', h('sup', null, '2000')), h('span', null, 'Professional'), h('small', null, 'Built on NT Technology'));
    const opts = h('label', { hidden: true }, h('span', { html: '<u>L</u>og on to:' }), h('input', { class: 'field', value: 'blankiekun (this computer)', readonly: true }));
    const logon = () => win9x(form, 'Log On to blankiekun', [band(), h('div', { class: 'logon-fields' }, userRow(), pwRow(), opts)],
      [okBtn(), h('button', { class: 'btn', type: 'button', onclick: e => e.target.form.requestSubmit() }, 'Cancel'),
        h('button', { class: 'btn', type: 'button', onclick: off }, 'Shutdown...'),
        h('button', { class: 'btn', type: 'button', onclick: e => { opts.hidden = !opts.hidden; e.target.textContent = opts.hidden ? 'Options >>' : 'Options <<'; } }, 'Options >>')]);
    const next = () => { const f = logon(); welcome.replaceWith(f); f.querySelector('input:not([readonly])').focus(); };
    // shortcut: the browser or OS takes Ctrl+Alt+Delete before the page sees it, so Ctrl+Alt+End, Enter and OK work too.
    const welcome = win9x(form, 'Welcome to ' + OS, [band(), h('div', { class: 'logon-fields' },
      h('p', null, h('b', null, 'Press Ctrl-Alt-Delete to begin.')),
      h('p', null, 'Requiring this key combination at startup helps keep your password secure. In this browser, Ctrl-Alt-End, Enter or OK will do.'))], [okBtn()], next);
    welcome.addEventListener('keydown', e => { if (e.ctrlKey && e.altKey && (e.key === 'Delete' || e.key === 'End')) { e.preventDefault(); e.stopPropagation(); next(); } });
    return [welcome];
  },
  // XP: the Welcome screen. One account and no password, so the tile logs on.
  xp: (form, off) => [h('div', { class: 'xpw-top' }),
    h('div', { class: 'xpw-mid' },
      h('div', { class: 'xpw-left' }, h('b', { class: 'xpw-logo' }, 'blankiekun', h('sup', null, 'xp')), h('p', null, 'To begin, click your user name')),
      form('Welcome to ' + OS, 'xpw-right', [h('button', { class: 'xpw-tile', type: 'submit' }, avatar(''), h('span', null, 'blankiekun'))])),
    h('div', { class: 'xpw-bot' }, h('button', { class: 'xpw-off', type: 'button', onclick: off }, icon('i-shutdown'), 'Turn off computer'))],
  // Vista and 7: the tile in the middle, ease of access and power along the bottom.
  aero: (form, off) => [form('Welcome to ' + OS, 'aero-in', [avatar('aero-pic', 128), h('b', null, 'blankiekun'),
      h('div', { class: 'aero-pw' }, pwField('Password'), h('button', { type: 'submit', 'aria-label': 'Log on' }, '→')),
      // shortcut: there is one account, so Switch User has no one else to show; it just puts you back in the box.
      h('button', { class: 'btn', type: 'button', onclick: e => e.target.form.querySelector('input').focus() }, 'Switch User')]),
    h('div', { class: 'aero-bar' }, h('span', { class: 'logon-glyph', 'aria-hidden': 'true' }, icon('i-qs-access')),
      h('span', null, 'blankiekun', h('sup', null, V.short)), glyph('i-charm-power', 'Shut down', off))],
  // 8, 10 and 11: the round picture, the name and the box.
  metro: (form, off) => [form('Sign in to ' + OS, 'metro-in', [avatar('metro-pic', 96), h('b', null, 'blankiekun'),
      h('div', { class: 'metro-pw' }, pwField(V.id === '11' ? 'PIN' : 'Password'), V.id === '8' && h('button', { type: 'submit', 'aria-label': 'Sign in' }, '→')),
      V.id === '10' && h('button', { class: 'btn metro-go', type: 'submit' }, 'Sign in')]),
    h('div', { class: 'metro-bar' }, h('span', { class: 'logon-glyph', 'aria-hidden': 'true' }, icon('i-tb-wifi')), glyph('i-charm-power', 'Shut down', off))],
};
LOGON.screen = LOGON.ten = LOGON.eleven = LOGON.metro;

// Lock keeps every window open and only draws the sign-in over them; 8, 10 and 11 put a clock screen first.
function lock() {
  if (!PANEL || document.querySelector('.screen.logon')) return;
  closeMenus('replaced');
  closePanel();
  closeTaskView();
  if (!['screen', 'ten', 'eleven'].includes(PANEL)) { logOn(true); return; }
  const now = new Date();
  const scr = h('div', { class: 'screen logon lockscreen', tabindex: '0', role: 'button', 'aria-label': 'Locked. Press any key or click to sign in.' },
    h('b', null, now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })),
    h('span', null, now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })));
  const open = () => { scr.remove(); logOn(true); };
  scr.addEventListener('click', open);
  // The key that opens it mustn't also reach the password box, or Enter would sign straight in.
  scr.addEventListener('keydown', e => { if (!e.metaKey && !(e.ctrlKey && e.altKey)) { e.preventDefault(); open(); } });
  document.body.append(scr);
  trap(true);
  scr.focus();
}

onLock(lock);

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
  // A link to something specific (#ie/chimimouryou, #cons/demo) only gets a brief flash of the boot.
  const deep = location.hash.length > 1, fast = reducedMotion.matches;
  let skip;
  const skipped = new Promise(r => { skip = r; });
  const post = h('div', { class: 'screen post', 'aria-live': 'polite' }, V.start ? 'Starting ' + OS + '...' : 'C:\\>WIN');
  document.body.append(post);
  const onKey = () => skip();
  addEventListener('keydown', onKey);
  post.addEventListener('pointerdown', skip);
  await Promise.race([wait(deep ? 100 : fast ? 200 : 900), skipped]);
  const splash = h('div', { class: 'screen splash b-' + bootLook(), role: 'img', 'aria-label': OS + ' is starting' }, ...bootParts(), ...deep ? [] : [h('small', { class: 'skip' }, 'Press any key or tap to skip')]);
  splash.addEventListener('pointerdown', skip);
  post.replaceWith(splash);
  await Promise.race([wait(deep ? 300 : fast ? 600 : 2200), skipped]);
  removeEventListener('keydown', onKey);
  splash.remove();
  sound('Start Windows');
  runStartup();
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

let formatTime = (d, sec) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: sec ? '2-digit' : undefined });
let formatDate = d => d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
let formatShort = d => d.toLocaleDateString('en-US');
// 10 and 11 show the date under the time.
const MODERN = V.id === '10' || V.id === '11';

function clock() {
  const t = document.getElementById('clock');
  const tray = t.parentElement;
  const tick = () => {
    const d = new Date();
    t.textContent = formatTime(d) + (MODERN ? '\n' + formatShort(d) : '');
    t.dateTime = d.toISOString();
    tray.dataset.tip = formatDate(d);
  };
  tick();
  setInterval(tick, 10000);
  // Regional Settings decides how the time looks, when that applet loaded.
  import('./apps/control.js').then(m => {
    if (m.formatTime) formatTime = (d, sec) => m.formatTime(d, sec);
    if (m.formatDate) { formatDate = d => m.formatDate(d, true); formatShort = d => m.formatDate(d); }
    tick();
  }).catch(() => {});
  window.addEventListener('w95-regional', tick);
  t.addEventListener('dblclick', () => { closeFlyout(); launch('datetime'); });
  // 7 on, a single click shows the month above the clock.
  if (SUPERBAR) t.addEventListener('click', () => calendarFlyout(t));
  const spk = tray.querySelector('svg');
  spk.classList.add('spk');
  spk.classList.toggle('muted', volume().mute);
  spk.setAttribute('aria-hidden', 'false');
  spk.setAttribute('role', 'button');
  spk.setAttribute('aria-label', 'Volume');
  // 11's speaker is part of the Quick Settings button instead (modernTaskbar).
  if (V.id === '11') return;
  spk.addEventListener('click', () => volumePopup(false));
  spk.addEventListener('dblclick', () => { if (volEl) { volEl.remove(); volEl = null; } volumeControl(); });
}

// ---------- 7 on: tray flyouts ----------
// One flyout at a time above the taskbar; clicking its button again, Escape or a click elsewhere shuts it.
let fly = null;
function closeFlyout() { fly?.el.remove(); fly = null; }
function flyout(el, owner) {
  const again = fly?.owner === owner;
  closeFlyout();
  if (again) return;
  fly = { el, owner };
  document.querySelector('.toast')?.remove();
  el.classList.add('flyout');
  el.tabIndex = -1;
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { closeFlyout(); owner.focus?.(); } });
  document.body.append(el);
  el.focus({ preventScroll: true });
}
document.addEventListener('pointerdown', e => { if (fly && !fly.el.contains(e.target) && !fly.owner.contains(e.target)) closeFlyout(); }, true);
// A click in a program's frame only shows as the page losing focus.
window.addEventListener('blur', closeFlyout);

// The month, today marked, with a ticking time on top in 10 and 11.
function calendarFlyout(owner) {
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth();
  const title = h('b'), grid = h('div', { class: 'cal-grid', role: 'grid' });
  const time = MODERN ? h('div', { class: 'cal-time' }) : null, date = MODERN ? h('div', { class: 'cal-date' }) : null;
  const flip = d => { m += d; if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; } draw(); };
  let cells = null;
  function draw() {
    if (!cells) return;
    title.textContent = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const today = y === now.getFullYear() && m === now.getMonth() ? now.getDate() : 0;
    grid.replaceChildren(...['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => h('span', { class: 'cal-wd' }, d)),
      ...cells(y, m).map(d => h('span', { class: d === today ? 'today' : null }, d)));
  }
  const tick = () => { const d = new Date(); time.textContent = formatTime(d, true); date.textContent = formatDate(d); };
  if (time) { tick(); const timer = setInterval(() => el.isConnected ? tick() : clearInterval(timer), 1000); }
  // 11 lists the notifications above the month.
  const notesEl = V.id === '11' ? h('div', { class: 'cal-notes' }) : null;
  const drawNotes = () => notesEl.replaceChildren(h('h2', null, 'Notifications'), ...noteList(drawNotes));
  if (notesEl) drawNotes();
  const el = h('div', { class: 'cal-fly', role: 'dialog', 'aria-label': 'Calendar' }, notesEl, time, date,
    h('div', { class: 'cal-head' }, title,
      h('button', { type: 'button', 'aria-label': 'Previous month', onclick: () => flip(-1) }, '\u25b2'),
      h('button', { type: 'button', 'aria-label': 'Next month', onclick: () => flip(1) }, '\u25bc')),
    grid);
  import('./apps/gadgets.js').then(g => { cells = g.monthCells; draw(); });
  flyout(el, owner);
}

// ---------- 10 and 11: search, Task View, Widgets and the tray's network and notification icons ----------

function startSearch(q) {
  openPanel(q);
  startBtn.setAttribute('aria-expanded', 'true');
}

function modernTaskbar() {
  if (!MODERN) return;
  const btn = (label, ic, onclick, cls = '') => h('button', { type: 'button', class: 'tb-btn ' + cls, title: label, 'aria-label': label, onclick }, icon(ic));
  const view = btn('Task View', 'i-tb-taskview', taskView, 'tb-taskview');
  onTaskView(taskView);
  if (V.id === '10') {
    // The box hands over to the Start panel's search: clicked, or typed in after tabbing to it.
    const box = h('input', { class: 'tb-search-box', type: 'search', placeholder: 'Type here to search', 'aria-label': 'Type here to search' });
    box.addEventListener('input', () => { const q = box.value; box.value = ''; startSearch(q); });
    const wrap = h('label', { class: 'tb-search' }, icon('i-tb-search'), box);
    wrap.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); startSearch(''); });
    startBtn.after(wrap, view);
  } else {
    startBtn.after(btn('Search', 'i-tb-search', () => startSearch('')), view);
    const widgets = h('button', { type: 'button', class: 'tb-btn tb-widgets', 'aria-label': 'Widgets', onclick: () => widgetsFlyout(widgets) }, icon('i-tb-weather'), h('span', null, '18\u00b0C'));
    taskbarEl.prepend(widgets);
  }
  const t = document.getElementById('clock');
  const net = icon('i-tb-wifi', 'net');
  net.setAttribute('aria-hidden', 'false');
  net.setAttribute('role', 'img');
  net.setAttribute('aria-label', 'Connected');
  net.dataset.tip = 'Connected';
  netIcon = net;
  const spk = t.parentElement.querySelector('.spk');
  spk.before(net);
  // 10's notification icon opens the Action Center; 11's opens the notifications over the calendar,
  // and the network and speaker together are the Quick Settings button.
  noteBtn = btn('Notifications', 'i-tb-note', () => V.id === '10' ? actionCenter() : calendarFlyout(noteBtn), 'tb-note');
  t.after(noteBtn);
  if (V.id === '11') {
    qsBtn = h('button', { type: 'button', class: 'tb-qs', 'aria-label': 'Quick settings', onclick: quickSettings });
    spk.before(qsBtn);
    qsBtn.append(net, spk);
  }
  onActionCenter(() => V.id === '10' ? actionCenter() : quickSettings());
  import('./apps/settings.js').then(m => { if (m.net) radio = m.net; }).catch(() => {});
  setTimeout(welcome, 1500);
}

// ---------- WHATSNEW.TXT and the "new release" notice ----------

async function openWhatsNew() {
  await wn.ready;
  wn.mark();
  const it = ICONS.find(o => o.open === openWhatsNew);
  if (it?.el) it.el.querySelector('span').textContent = it.label;
  run('notepad whatsnew.txt');
}

// 10 and 11 toast it, XP to 7 float a balloon by the clock, and the rest only mark the file "(new)".
// shortcut: the balloon shows for as long as .screen is up plus 20s, with no sound.
function announce(list) {
  if (!list.length) return;
  const msg = list.map(f => `${f.repo} ${f.tag}`).join(' and ') + (list.length > 1 ? ' are' : ' is') + ' out \u2014 see WHATSNEW.TXT';
  if (MODERN) { wn.mark(); notify("What's new", msg, openWhatsNew); return; }
  if (['xp', 'vista', '7'].includes(V.id)) {
    const show = () => {
      if (document.querySelector('.screen')) { setTimeout(show, 1000); return; }
      wn.mark();
      const done = () => b.remove();
      const b = h('div', { class: 'su-balloon', role: 'status' },
        h('button', { class: 'tbtn su-x', type: 'button', 'aria-label': 'Close', onclick: done }, icon('i-x')),
        h('b', null, icon('i-info'), "What's new"), h('p', null, msg));
      b.addEventListener('click', e => { if (!e.target.closest('.su-x')) { done(); openWhatsNew(); } });
      document.body.append(b);
      setTimeout(done, 20000);
    };
    show();
    return;
  }
  const it = ICONS.find(o => o.open === openWhatsNew);
  if (it?.el) it.el.querySelector('span').textContent = it.label + ' (new)';
}

// ---------- 10 and 11: notifications, the Action Center and Quick Settings ----------

// What notify() said this visit, newest first; 10's Action Center and 11's calendar flyout list them.
const notes = [];
let noteBtn = null, qsBtn = null, netIcon = null;
const markNew = () => noteBtn?.classList.toggle('new', notes.length > 0);

// A toast at the bottom right that also stays in the list until it's clicked or dismissed there.
export function notify(title, text, onclick) {
  if (!MODERN) return;
  // Not over the boot, lock or sign-in screen: wait until they're gone.
  if (document.querySelector('.screen')) { setTimeout(notify, 1000, title, text, onclick); return; }
  const n = { title, text, onclick };
  notes.unshift(n);
  markNew();
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, noteCard(n, () => t.remove(), false));
  document.body.append(t);
  setTimeout(() => t.remove(), 7000);
}
// drop: the x takes it out of the list too (in the list), or only hides the toast.
function noteCard(n, done, drop) {
  const gone = () => { const i = notes.indexOf(n); if (i >= 0) notes.splice(i, 1); markNew(); };
  return h('div', { class: 'note' },
    h('button', { type: 'button', class: 'note-body', onclick: () => { gone(); closeFlyout(); done(); n.onclick?.(); } }, h('b', null, n.title), h('span', null, n.text)),
    h('button', { type: 'button', class: 'note-x', 'aria-label': 'Dismiss', onclick: () => { if (drop) gone(); done(); } }, '\u00d7'));
}
const noteList = redraw => notes.length ? notes.map(n => noteCard(n, redraw, true)) : [h('p', { class: 'note-none' }, 'No new notifications')];

// Once per visitor, after the boot and sign-in screens: the thing most worth a look.
const WELCOMED = 'w95.welcomed';
function welcome() {
  if (store.get(WELCOMED, false)) return;
  if (document.querySelector('.screen')) { setTimeout(welcome, 1000); return; }
  store.set(WELCOMED, true);
  notify('Welcome to ' + OS, 'Try CONscripter: visual novels, in the browser.', () => launch('ie', 'conscripter'));
}

// The toggles only change how they look, except Night light and brightness, which tint and dim the desktop.
// shortcut: forgotten on reload; store them like w95.volume if anyone minds.
const qs = { tablet: false, location: true, focus: false, project: false, bluetooth: true, saver: false, access: false, night: false, bright: 100 };
// Wi-Fi and airplane mode are Settings' own (settings.js net), once it loads.
let radio = { wifi: true, airplane: false };
const tintEl = h('div', { class: 'tint' });
document.body.append(tintEl);
function applyQS() {
  // A multiply overlay, not a filter on #desktop: a filter would make it the containing block of fixed windows (full screen).
  const b = .3 + qs.bright * .007, c = (qs.night ? [255, 214, 168] : [255, 255, 255]).map(v => Math.round(v * b));
  tintEl.style.background = qs.night || qs.bright < 100 ? `rgb(${c})` : '';
  const up = radio.wifi && !radio.airplane;
  netIcon.dataset.tip = up ? 'Connected' : 'Not connected';
  netIcon.setAttribute('aria-label', netIcon.dataset.tip);
  netIcon.classList.toggle('off', !up);
}
function qsToggle(label, ic, obj, key) {
  const b = h('button', { type: 'button', class: 'qs-tile', 'aria-pressed': String(obj[key]) }, icon(ic), h('span', null, label));
  b.addEventListener('click', () => { obj[key] = !obj[key]; b.setAttribute('aria-pressed', String(obj[key])); applyQS(); });
  return b;
}
const qsAction = (label, ic, fn) => h('button', { type: 'button', class: 'qs-tile', onclick: () => { closeFlyout(); fn(); } }, icon(ic), h('span', null, label));

// 10: notifications down the right, the quick actions under them, one row of them until Expand.
function actionCenter() {
  const list = h('div', { class: 'ac-list' });
  const clear = h('button', { type: 'button', class: 'ac-link', onclick: () => { notes.length = 0; markNew(); draw(); } }, 'Clear all notifications');
  const draw = () => { list.replaceChildren(...noteList(draw)); clear.hidden = !notes.length; };
  draw();
  const tiles = h('div', { class: 'ac-tiles' },
    qsToggle('Tablet mode', 'i-qs-tablet', qs, 'tablet'), qsAction('Network', 'i-tb-wifi', () => launch('settings', 'Status')),
    qsToggle('Night light', 'i-qs-night', qs, 'night'), qsAction('All settings', 'i-qs-gear', () => launch('settings')),
    qsToggle('Location', 'i-qs-location', qs, 'location'), qsToggle('Airplane mode', 'i-qs-airplane', radio, 'airplane'),
    qsToggle('Focus assist', 'i-qs-focus', qs, 'focus'), qsToggle('Project', 'i-qs-project', qs, 'project'));
  const more = h('button', { type: 'button', class: 'ac-link', onclick: () => { more.textContent = tiles.classList.toggle('open') ? 'Collapse' : 'Expand'; } }, 'Expand');
  flyout(h('div', { class: 'ac', role: 'dialog', 'aria-label': 'Action center' },
    h('div', { class: 'ac-head' }, h('h2', null, 'Notifications'), clear), list, h('div', { class: 'ac-foot' }, more), tiles), noteBtn);
}

// 11: toggle buttons, brightness and volume, and the way to Settings.
function quickSettings() {
  const slider = (label, ic, value, set) => {
    const s = h('input', { type: 'range', min: 0, max: 100, value, 'aria-label': label });
    s.addEventListener('input', () => set(+s.value));
    return h('label', { class: 'qs-slider' }, icon(ic), s);
  };
  const v = volume();
  flyout(h('div', { class: 'qs', role: 'dialog', 'aria-label': 'Quick settings' },
    h('div', { class: 'qs-grid' },
      qsToggle('Wi-Fi', 'i-tb-wifi', radio, 'wifi'), qsToggle('Bluetooth', 'i-qs-bluetooth', qs, 'bluetooth'), qsToggle('Airplane mode', 'i-qs-airplane', radio, 'airplane'),
      qsToggle('Battery saver', 'i-qs-battery', qs, 'saver'), qsToggle('Focus', 'i-qs-focus', qs, 'focus'), qsToggle('Accessibility', 'i-qs-access', qs, 'access'),
      qsToggle('Night light', 'i-qs-night', qs, 'night')),
    slider('Brightness', 'i-qs-sun', qs.bright, n => { qs.bright = n; applyQS(); }),
    slider('Volume', 'i-qs-volume', v.mute ? 0 : Math.round(v.level * 100), n => setVolume({ level: n / 100, mute: !n })),
    h('div', { class: 'qs-foot' }, h('button', { type: 'button', class: 'tb-btn', 'aria-label': 'All settings', title: 'All settings', onclick: () => { closeFlyout(); launch('settings'); } }, icon('i-qs-gear')))), qsBtn);
}

// A few cards: the date, the projects' news and some invented weather.
function widgetsFlyout(owner) {
  const d = new Date();
  const news = [['chimimouryou', 'chimimouryou', 'A self-hosted reader for Calibre libraries'],
    ['CONscripter', 'conscripter', 'Visual novels, in the browser'], ['conscripter-convert', 'convert', 'Brings games from other engines to CONscripter']];
  const el = h('div', { class: 'wg-fly', role: 'dialog', 'aria-label': 'Widgets' },
    h('h2', null, formatTime(d)),
    h('section', { class: 'wg-card' }, h('b', null, d.toLocaleDateString('en-US', { weekday: 'long' })), h('span', null, formatDate(d))),
    h('section', { class: 'wg-card wg-weather' }, icon('i-tb-weather'), h('div', null, h('b', null, '18\u00b0C'), h('span', null, 'Mostly sunny, blankietown'), h('small', null, 'High 21\u00b0  Low 12\u00b0'))),
    h('section', { class: 'wg-card' }, h('b', null, 'blankiekun news'),
      ...news.map(([name, page, line]) => h('button', { type: 'button', class: 'wg-news', onclick: () => { closeFlyout(); launch('ie', page); } }, h('b', null, name), h('span', null, line)))));
  flyout(el, owner);
}

// ---------- tooltips ----------

// title= hints in the shell show as Windows 95's yellow tooltips instead of the browser's.
// An iframe's title is its accessible name, not a hint, so it is left alone.
// Vista on, a window's taskbar button shows its thumbnail instead (thumbnails below).
const THUMBS = VERSIONS.indexOf(V) >= VERSIONS.findIndex(r => r.id === 'vista');
let tipFor = null, tipEl = null, tipTimer = 0, tipX = 0, tipY = 0;
function hideTip() { clearTimeout(tipTimer); if (tipEl) tipEl.remove(); tipEl = tipFor = null; }
document.addEventListener('pointermove', e => { tipX = e.clientX; tipY = e.clientY; }, { passive: true });
document.addEventListener('pointerover', e => {
  const el = e.pointerType === 'mouse' && e.target.closest ? e.target.closest('[title]:not(iframe), [data-tip]') : null;
  if (el === tipFor) return;
  hideTip();
  if (!el || (THUMBS && el.matches('#tasks .task:not(.pin)'))) return;
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

// Until Start has been clicked once, a hint slides out beside it, as on a new 95 to 2000 PC; XP on never had it.
const BEGUN = 'w95.begun';
function beginHint() {
  if (store.get(BEGUN, false) || !V.start || PANEL) return;
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
    b.addEventListener('click', () => { if (!b.dragged) p.id === 'showdesktop' ? showDesktop() : launch(p.id, p.arg); });
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
  onRun(runDialog);
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

// Vista on: hovering a window's taskbar button shows a small copy of it, and hovering that
// copy fades every other window (Aero Peek). Mouse only, so a tap never leaves one up.
function thumbnails() {
  if (!THUMBS) return;
  let thumb = null, shown = null, timer = 0;
  // peek(w) fades all but w; peek(true) fades them all, peek(false) none.
  const peek = w => { document.body.classList.toggle('peeking', !!w); all().forEach(o => o.el.classList.toggle('peeked', o === w)); };
  const hide = () => { clearTimeout(timer); thumb?.remove(); thumb = shown = null; peek(false); };
  const later = () => { clearTimeout(timer); timer = setTimeout(hide, 200); };
  const show = (w, b) => {
    hide();
    shown = w;
    // A copied canvas or frame is blank (or reloads), so those show the program's icon instead.
    let view = w.task.querySelector('svg').cloneNode(true);
    if (!w.el.querySelector('canvas, iframe, video')) {
      const min = w.el.classList.contains('min');
      w.el.classList.remove('min');
      const r = w.el.getBoundingClientRect();
      if (min) w.el.classList.add('min');
      const s = Math.min(200 / r.width, 120 / r.height);
      // shortcut: a still taken on hover, not live, re-clone on a timer if a moving preview is wanted.
      const copy = w.el.cloneNode(true);
      copy.classList.remove('min', 'max', 'active', 'opening');
      copy.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
      Object.assign(copy.style, { left: 0, top: 0, width: r.width + 'px', height: r.height + 'px', transform: `scale(${s})`, transformOrigin: '0 0', zIndex: 0 });
      view = h('div', { class: 'thumb-view', style: { width: r.width * s + 'px', height: r.height * s + 'px' } }, copy);
    }
    thumb = h('div', { class: 'thumb', role: 'tooltip', onpointerenter: () => { clearTimeout(timer); peek(w); }, onpointerleave: later, onclick: () => { hide(); focus(w); } },
      h('div', { class: 'thumb-title' }, w.task.querySelector('span').textContent), view);
    document.body.append(thumb);
    const br = b.getBoundingClientRect();
    thumb.style.left = clamp(br.left + br.width / 2 - thumb.offsetWidth / 2, 0, innerWidth - thumb.offsetWidth) + 'px';
  };
  const tasks = document.getElementById('tasks');
  tasks.addEventListener('pointerover', e => {
    const b = e.target.closest('.task:not(.pin)'), w = b && all().find(o => o.task === b);
    if (!w || e.pointerType !== 'mouse' || small.matches) return;
    clearTimeout(timer);
    if (shown !== w) timer = setTimeout(() => show(w, b), thumb ? 0 : 400);
  });
  tasks.addEventListener('pointerout', e => { if (e.target.closest('.task')) later(); });
  document.addEventListener('pointerdown', e => { if (!thumb?.contains(e.target)) hide(); }, true);
  // 7 on: the strip at the right end peeks at the desktop and, clicked, minimizes everything.
  if (!SUPERBAR) return;
  taskbarEl.append(h('button', { type: 'button', class: 'showdesk', title: 'Show desktop', 'aria-label': 'Show desktop', onclick: () => { hide(); showDesktop(); },
    onpointerenter: e => { if (e.pointerType === 'mouse') { hide(); timer = setTimeout(() => peek(true), 400); } }, onpointerleave: hide }));
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
  thumbnails();
  renderIcons();
  if (V.id === '98') channelBar();
  lastH = desktopEl.clientHeight;
  startBtn.querySelector('span').textContent = V.start;
  startBtn.setAttribute('aria-label', 'Start');
  clock();
  modernTaskbar();
  if (V.id === '8') import('./charms.js').then(m => m.initCharms(() => toggleStart(true), startSearch));
  beginHint();
  wn.fresh().then(announce, () => {});
}
