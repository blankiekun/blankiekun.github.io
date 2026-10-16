// Folder windows: My Computer, drives, folders, Control Panel, Network Neighborhood
// and the Recycle Bin, plus the two-pane "Exploring" window with the folder tree.
// Like Win95's default, each folder opens in its own window; View > Options can
// switch to browsing in one window.

import { h, icon, small, store, marquee, overlaps } from '../util.js';
import { createWindow, find, launch, appInfo } from '../wm.js';
import { menubar, openMenu } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import {
  root, resolve, recycle, network, kindLabel, sizeLabel, pathOf, parentOf, onChange,
  canWrite, mkdir, createFile, restore, emptyBin, FsError, desktopFolder,
} from '../fs.js';
import { open as shellOpen } from '../shell.js';
import { sound } from '../desktop.js';
import { properties, iconOf } from '../props.js';
import { clip, cut, copyNodes, paste, canPaste, del, startDrag, toFloppy, onClip, isCut, undo, undoLabel, renameNode, makeShortcut } from '../fileops.js';

const PREFS = 'w95.explorer';
const prefs = { view: 'icons', sort: 'name', single: false, toolbar: false, status: true, ...store.get(PREFS, {}) };
const savePrefs = () => store.set(PREFS, prefs);
const wins = new Set();
const refreshAll = () => { for (const w of wins) w.refresh(); };
onChange(refreshAll);
export const refreshExplorers = refreshAll;
onClip(refreshAll);

const VIEWS = { icons: 'Lar&ge Icons', small: 'S&mall Icons', list: '&List', details: '&Details' };

const svg = inner => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" shape-rendering="crispEdges">${inner}</svg>`;
const GLYPH = {
  cut: svg("<path d='M5 1h1v5h1v2H6v1H5v1H4v2H3v2H2v-2h1v-2h1V8h1zM10 1h1v5h-1v2h1v1h1v1h1v2h1v2h-1v-2h-1v-2h-1V9h-1V8H9V6h1z'/><path fill='#000080' d='M2 11h3v4H2zM11 11h3v4h-3z'/><path fill='#fff' d='M3 12h1v2H3zM12 12h1v2h-1z'/>"),
  copy: svg("<path d='M1 1h7v1h1v6H1zM6 6h8v1h1v8H6z'/><path fill='#fff' d='M2 2h5v5H2zM7 7h6v1h1v6H7z'/><path fill='#808080' d='M8 9h5v1H8zM8 11h5v1H8z'/>"),
  paste: svg("<path d='M2 2h9v12H2z'/><path fill='#808000' d='M3 3h7v10H3z'/><path d='M5 1h3v3H5z'/><path d='M7 6h7v9H7z'/><path fill='#fff' d='M8 7h5v7H8z'/>"),
  undo: svg("<path d='M3 3h1v2h6v1h2v1h1v4h-1v1h-1v1H9v-1h2v-1h1V8h-1V7H9V6H4v2H3V7H2V6H1V5h1V4h1z' fill='#000'/>"),
  del: svg("<path fill='#000' d='M2 2h3v1h1v1h1v1h2V4h1V3h1V2h3v1h-1v1h-1v1h-1v1h-1v2h1v1h1v1h1v1h1v1h1v1h-3v-1h-1v-1h-1v-1H7v1H6v1H5v1H2v-1h1v-1h1v-1h1V9h1V7H5V6H4V5H3V4H2z'/>"),
  props: svg("<path d='M2 2h12v12H2z'/><path fill='#fff' d='M3 3h10v10H3z'/><path fill='#000080' d='M3 3h10v2H3z'/><path d='M4 7h2v2H4zM7 7h5v1H7zM4 10h2v2H4zM7 10h5v1H7z'/>"),
  icons: svg("<path fill='#000080' d='M1 1h6v5H1zM9 1h6v5H9zM1 9h6v5H1zM9 9h6v5H9z'/>"),
  small: svg("<path fill='#000080' d='M1 2h3v3H1zM1 8h3v3H1zM9 2h3v3H9zM9 8h3v3H9z'/><path d='M5 3h3v1H5zM5 9h3v1H5zM13 3h2v1h-2zM13 9h2v1h-2z'/>"),
  list: svg("<path fill='#000080' d='M1 2h3v3H1zM1 7h3v3H1zM1 12h3v3H1z'/><path d='M5 3h9v1H5zM5 8h9v1H5zM5 13h9v1H5z'/>"),
  details: svg("<path fill='#000080' d='M1 2h3v3H1zM1 7h3v3H1zM1 12h3v3H1z'/><path d='M5 3h4v1H5zM10 3h5v1h-5zM5 8h4v1H5zM10 8h5v1h-5zM5 13h4v1H5zM10 13h5v1h-5z'/>"),
};

const titleFor = node => node.name;
const isTop = n => n === root || n === recycle || n === network;

function pathLabel(node) {
  if (isTop(node) || node.virtual) return node.name;
  return pathOf(node) || node.name;
}

function sorted(list) {
  const by = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    type: (a, b) => kindLabel(a).localeCompare(kindLabel(b)) || a.name.localeCompare(b.name),
    size: (a, b) => (a.size || 0) - (b.size || 0) || a.name.localeCompare(b.name),
    date: (a, b) => (a.mtime || 0) - (b.mtime || 0) || a.name.localeCompare(b.name),
  }[prefs.sort];
  // Drives keep their letters' order in My Computer, folders come before files elsewhere.
  return list.slice().sort((a, b) => (a.kind === 'drive' || b.kind === 'drive') ? 0 : (!!b.children - !!a.children) || by(a, b));
}

// ---------- the folder tree for Exploring windows ----------

function tree(win, go) {
  const el = h('div', { class: 'ex-tree', role: 'tree', tabindex: '0', 'aria-label': 'All Folders' });
  const open = new Set([root, resolve('C:\\')]);
  function row(node, depth, label) {
    const kids = (node.children || []).filter(c => c.children && !c.notReady);
    const isOpen = open.has(node);
    const r = h('div', { class: 'ex-trow' + (win.node === node ? ' sel' : ''), role: 'treeitem', style: { paddingLeft: depth * 16 + 'px' }, 'aria-expanded': kids.length ? String(isOpen) : null },
      h('button', { class: 'ex-twist', type: 'button', tabindex: '-1', 'aria-label': isOpen ? 'Collapse' : 'Expand', hidden: !kids.length }, isOpen ? '−' : '+'),
      icon(win.node === node && node.kind === 'folder' && !node.icon ? 'i-folder-open' : iconOf(node)), h('span', null, label || node.name));
    r.dropFolder = () => node;
    r.querySelector('.ex-twist').addEventListener('click', e => { e.stopPropagation(); if (isOpen) open.delete(node); else open.add(node); render(); });
    r.addEventListener('click', () => { open.add(node); go(node); });
    el.append(r);
    if (isOpen) for (const k of sorted(kids)) row(k, depth + 1);
  }
  function render() {
    el.replaceChildren();
    const desk = desktopFolder();
    row(desk, 0, 'Desktop');
    row(root, 1);
    row(network, 1);
    row(recycle, 1);
  }
  el.reveal = node => { for (let p = parentOf(node); p; p = parentOf(p)) open.add(p); render(); };
  el.render = render;
  return el;
}

// ---------- windows ----------

function open(arg = 'My Computer') {
  const obj = typeof arg === 'object' && arg !== null;
  const explore = obj && arg.explore;
  const path = obj ? arg.path : arg;
  const node = obj && arg.node ? arg.node : resolve(path);
  if (!node) { msgbox({ title: 'Explorer', icon: 'error', text: `Cannot find '${path}'.` }); return null; }
  if (node.offline) { msgbox({ title: 'Network Neighborhood', icon: 'error', text: `\\\\${node.name.toUpperCase()} is not accessible.\n\nThe network path was not found.` }); return null; }
  if (!explore) {
    const existing = find(w => w.app === 'explorer' && !w.explore && w.node === node);
    if (existing) { existing.focus(); return existing; }
  }

  let sel = new Set(), lead = null, renaming = null;
  const list = h('div', { class: 'ex-list', tabindex: '0', role: 'listbox', 'aria-multiselectable': 'true' });
  list.dropFolder = () => win.node;
  const status = h('div', { class: 'statusbar' }, h('span'), h('span', { style: { width: '120px' } }));
  const where = h('select', { class: 'field ex-where', 'aria-label': 'Go to a different folder' });
  const toolbar = h('div', { class: 'ex-toolbar' });

  const here = () => win.node;
  const isBin = () => here() === recycle;
  // Programs that didn't load aren't listed.
  const items = () => sorted((here().children || []).filter(n => n.kind !== 'app' || n.app === 'setup' || appInfo(n.app)));
  const selected = () => items().filter(n => sel.has(n));

  function iconFor(n) {
    const id = iconOf(n);
    return n.kind === 'folder' && !n.icon && n === here() ? 'i-folder-open' : id;
  }

  function render() {
    const view = prefs.view;
    list.className = 'ex-list v-' + view;
    list.setAttribute('aria-label', titleFor(here()));
    list.style.setProperty('--cols', 3);
    list.replaceChildren();
    const live = new Set(here().children || []);
    sel = new Set([...sel].filter(n => live.has(n)));
    if (lead && !live.has(lead)) lead = null;
    if (view === 'details') {
      const cols = isBin() ? ['Name', 'Original Location', 'Type', 'Size'] : here() === root ? ['Name', 'Type', 'Total Size', 'Free Space'] : ['Name', 'Size', 'Type', 'Modified'];
      list.append(h('div', { class: 'ex-head' }, ...cols.map(c => {
        const b = h('span', null, c);
        const key = { Name: 'name', Size: 'size', Type: 'type', Modified: 'date' }[c];
        if (key) b.addEventListener('click', () => { prefs.sort = key; savePrefs(); refreshAll(); });
        return b;
      })));
    }
    for (const n of items()) {
      const it = h('div', { class: 'ex-item' + (sel.has(n) ? ' sel' : '') + (isCut(n) ? ' cut' : ''), role: 'option', 'aria-selected': String(sel.has(n)), tabindex: '-1' },
        h('span', { class: 'ex-ic' }, icon(iconFor(n)), n.kind === 'link' || n.kind === 'shortcut' ? h('i', { class: 'lnk' }) : null),
        h('span', { class: 'ex-name' }, n.name));
      if (view === 'details') {
        const date = n.mtime ? new Date(n.mtime).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit' }).replace(',', '') : n.children || n.kind === 'drive' ? '' : '8/24/95 11:11 AM';
        if (isBin()) it.append(h('span', null, n.from || ''), h('span', null, kindLabel(n)), h('span', null, sizeLabel(n)));
        else if (here() === root) it.append(h('span', null, kindLabel(n)), h('span', null, n.kind === 'drive' && !n.notReady ? (n.letter === 'C' ? '1.50GB' : n.letter === 'E' ? '50.0MB' : '') : ''), h('span', null, n.letter === 'C' ? '1.11GB' : n.letter === 'D' ? '0 bytes' : ''));
        else it.append(h('span', null, sizeLabel(n)), h('span', null, kindLabel(n)), h('span', null, date));
      }
      it.node = n;
      if (n.children || n.kind === 'drive') it.dropFolder = () => n;
      it.addEventListener('pointerdown', e => {
        e.stopPropagation();
        if (renaming) return;
        if (e.button === 2) { if (!sel.has(n)) choose(n); return; }
        if (e.ctrlKey || e.metaKey) { toggle(n); return; }
        if (e.shiftKey && lead) { range(n); return; }
        if (!sel.has(n)) choose(n);
        const nodes = selected();
        startDrag(e, nodes, iconOf(n), win, () => {
          if (e.pointerType !== 'mouse') activate(n);
          else if (sel.size > 1) choose(n);
        });
      });
      it.addEventListener('dblclick', () => activate(n));
      it.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); if (!sel.has(n)) choose(n); itemMenu(e.clientX, e.clientY); });
      list.append(it);
    }
    if (!items().length) list.append(h('div', { class: 'ex-empty' }, here().notReady ? '' : 'This folder is empty.'));
    updateStatus();
    syncChrome();
  }

  function rows() { return [...list.querySelectorAll('.ex-item')]; }
  function rowOf(n) { return rows().find(r => r.node === n); }
  function paint() {
    for (const r of rows()) { r.classList.toggle('sel', sel.has(r.node)); r.setAttribute('aria-selected', String(sel.has(r.node))); }
    updateStatus();
  }
  function choose(n) { sel = new Set(n ? [n] : []); lead = n; paint(); if (n) rowOf(n)?.focus({ preventScroll: true }); }
  function toggle(n) { if (sel.has(n)) sel.delete(n); else sel.add(n); lead = n; paint(); }
  function range(n) {
    const all = items(), a = all.indexOf(lead), b = all.indexOf(n);
    sel = new Set(all.slice(Math.min(a, b), Math.max(a, b) + 1));
    paint();
  }

  function updateStatus() {
    const n = items().length;
    const s = selected();
    if (s.length) {
      status.children[0].textContent = s.length + ' object(s) selected';
      const total = s.reduce((t, c) => t + (c.size || 0), 0);
      status.children[1].textContent = total ? sizeLabel({ size: total }) : '';
    } else {
      status.children[0].textContent = n + ' object(s)' + (here().kind === 'drive' && here().letter === 'C' ? ' (plus 7 hidden)' : '');
      const total = items().reduce((t, c) => t + (c.size || 0), 0);
      status.children[1].textContent = total ? sizeLabel({ size: total }) : '';
    }
    status.hidden = !prefs.status;
  }

  // Opening a folder: a new window, or the same one in single-window mode and in Exploring.
  function activate(n) {
    if ((n.children || n.kind === 'drive') && !n.notReady && !n.offline && n !== recycle && (explore || prefs.single)) { go(n); return; }
    if (n === recycle && (explore || prefs.single)) { go(n); return; }
    shellOpen(n, win);
  }
  function go(n) {
    if (n.offline) { msgbox({ title: 'Network Neighborhood', icon: 'error', parent: win, text: `\\\\${n.name.toUpperCase()} is not accessible.\n\nThe network path was not found.` }); return; }
    if (n.notReady) { shellOpen(n, win); return; }
    win.node = n;
    sel = new Set(); lead = null;
    render();
    if (treeEl) treeEl.reveal(n);
    win.setTitle(explore ? 'Exploring - ' + pathLabel(n) : titleFor(n));
    win.setIcon(explore ? 'i-folder-open' : winIcon(n));
    win.setRoute(routeFor(n));
  }
  function up() {
    const p = parentOf(here());
    if (here() === root || here() === network || here() === recycle || here() === desktopFolder()) return;
    if (!p || p === root && here().kind !== 'drive' && !here().virtual) return;
    if (explore || prefs.single) go(p);
    else shellOpen(p, win);
  }

  // ---------- commands ----------
  const fail = e => { if (!(e instanceof FsError)) throw e; return msgbox({ title: 'Error', icon: 'error', parent: win, text: e.message }); };
  function newFolder() {
    try { const n = mkdir(here()); choose(n); startRename(n); } catch (e) { fail(e); }
  }
  function newFile(name, props) {
    try { const n = createFile(here(), name, props); choose(n); startRename(n); } catch (e) { fail(e); }
  }
  function startRename(n) {
    const r = rowOf(n);
    if (!r) return;
    if (!n.user) { msgbox({ title: 'Error Renaming File', icon: 'error', parent: win, text: `Cannot rename ${n.name}: Access is denied.\n\nIt's one of the files that came with blankiekun 95.` }); return; }
    const label = r.querySelector('.ex-name');
    const box = h('textarea', { class: 'ex-rename', rows: 1, spellcheck: false, 'aria-label': 'New name' });
    box.value = n.name;
    label.replaceChildren(box);
    renaming = n;
    const dot = n.children ? -1 : n.name.lastIndexOf('.');
    box.focus();
    box.setSelectionRange(0, dot > 0 ? dot : n.name.length);
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true; renaming = null;
      if (ok && box.value.trim() && box.value.trim() !== n.name) renameNode(n, box.value.replace(/\n/g, ''), win).then(render);
      else render();
      list.focus({ preventScroll: true });
      choose(n);
    };
    box.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    box.addEventListener('pointerdown', e => e.stopPropagation());
    box.addEventListener('blur', () => finish(true));
  }
  async function empty() {
    if (!recycle.children.length) return;
    const n = recycle.children.length;
    const b = await msgbox({ title: n === 1 ? 'Confirm File Delete' : 'Confirm Multiple File Delete', icon: 'i-warn', parent: win, buttons: ['&Yes', '&No'],
      text: n === 1 ? `Are you sure you want to delete '${recycle.children[0].name}'?` : `Are you sure you want to delete these ${n} items?` });
    if (b === 'Yes') { emptyBin(); sound('Empty Recycle Bin'); }
  }
  function restoreSel() {
    for (const n of selected()) { try { restore(n); } catch (e) { fail(e); break; } }
  }
  const delSel = () => del(selected(), win);
  const props = () => { const s = selected(); properties(s.length ? s[0] : here(), win); };
  const setView = v => { prefs.view = v; savePrefs(); refreshAll(); };

  function newMenu() {
    const off = !canWrite(here());
    return [
      { label: '&Folder', icon: 'i-folder', disabled: off, action: newFolder },
      { label: '&Shortcut', disabled: true },
      '-',
      { label: 'Text Document', icon: 'i-txt', disabled: off, action: () => newFile('New Text Document.txt', { text: '' }) },
      { label: 'WordPad Document', icon: 'i-doc', disabled: off, action: () => newFile('New WordPad Document.doc', { text: '' }) },
      { label: 'Bitmap Image', icon: 'i-bmp', disabled: off, action: () => newFile('New Bitmap Image.bmp', { data: blankBitmap() }) },
    ];
  }
  function sendTo(nodes) {
    return [
      { label: '3½ Floppy (A:)', icon: 'i-floppy', action: () => toFloppy(nodes, win) },
      { label: 'Desktop', icon: 'i-computer', action: () => { copyNodes(nodes); paste(desktopFolder(), win); } },
      { label: 'My Documents', icon: 'i-docs', action: () => { copyNodes(nodes); paste(resolve('C:\\My Documents'), win); } },
      { label: 'Desktop as Shortcut', icon: 'i-computer', action: () => nodes.forEach(n => makeShortcut(n, desktopFolder(), win)) },
    ];
  }
  function itemMenu(x, y) {
    const s = selected();
    const n = s[0];
    const folderish = n.children || n.kind === 'drive';
    openMenu([
      { label: '&Open', action: () => s.forEach(activate) },
      ...(folderish && n !== recycle ? [{ label: '&Explore', action: () => launch('explorer', { node: n, explore: true }) }] : []),
      ...(n.kind === 'drive' && n.letter === 'C' ? [{ label: '&Find...', action: () => launch('find') }] : []),
      ...(isBin() ? [{ label: 'R&estore', action: restoreSel }] : []),
      ...(n.kind === 'file' ? [{ label: '&Print', action: () => printNode(n) }] : []),
      ...(!isBin() && n.kind !== 'drive' ? ['-', { label: 'Se&nd To', submenu: sendTo(s) }] : []),
      '-',
      ...(n.kind === 'drive' ? [] : [{ label: 'Cu&t', disabled: !n.user && !isBin(), action: () => cut(s) }, { label: '&Copy', disabled: isBin(), action: () => copyNodes(s) }]),
      ...(folderish && n !== recycle ? [{ label: '&Paste', disabled: !canPaste(n), action: () => paste(n, win) }] : []),
      '-',
      ...(isBin() ? [] : [{ label: 'Create &Shortcut', disabled: s.length > 1, action: () => makeShortcut(n, here(), win) }]),
      ...(n.kind === 'drive' || isTop(n) ? [] : [{ label: '&Delete', action: delSel }, { label: 'Rena&me', disabled: !n.user || s.length > 1, action: () => startRename(n) }, '-']),
      { label: 'P&roperties', action: props },
    ], { x, y });
  }
  function viewMenu() {
    return [
      { label: '&Toolbar', checked: prefs.toolbar, action: () => { prefs.toolbar = !prefs.toolbar; savePrefs(); refreshAll(); } },
      { label: 'Status &Bar', checked: prefs.status, action: () => { prefs.status = !prefs.status; savePrefs(); refreshAll(); } },
      '-',
      ...Object.entries(VIEWS).map(([k, l]) => ({ label: l, radio: true, checked: prefs.view === k, action: () => setView(k) })),
      '-',
      { label: 'Arrange &Icons', submenu: [
        { label: 'by &Name', action: () => { prefs.sort = 'name'; savePrefs(); refreshAll(); } },
        { label: 'by &Type', action: () => { prefs.sort = 'type'; savePrefs(); refreshAll(); } },
        { label: 'by Si&ze', action: () => { prefs.sort = 'size'; savePrefs(); refreshAll(); } },
        { label: 'by &Date', action: () => { prefs.sort = 'date'; savePrefs(); refreshAll(); } },
      ] },
      { label: 'Line &up Icons', disabled: prefs.view !== 'icons' && prefs.view !== 'small', action: render },
      '-',
      { label: '&Refresh', key: 'F5', action: render },
      { label: '&Options...', action: options },
    ];
  }
  function bgMenu(x, y) {
    openMenu([
      { label: '&View', submenu: Object.entries(VIEWS).map(([k, l]) => ({ label: l, radio: true, checked: prefs.view === k, action: () => setView(k) })) },
      '-',
      { label: 'Arrange &Icons', submenu: viewMenu().find(i => i.submenu).submenu },
      { label: 'Line &up Icons', action: render },
      '-',
      ...(undoLabel() ? [{ label: '&' + undoLabel(), action: () => undo(win) }, '-'] : []),
      { label: '&Paste', disabled: !canPaste(here()), action: () => paste(here(), win) },
      { label: 'Paste &Shortcut', disabled: !clip.nodes.length || !canWrite(here()), action: () => clip.nodes.forEach(n => makeShortcut(n, here(), win)) },
      ...(isBin() ? ['-', { label: 'Empty Recycle &Bin', disabled: !recycle.children.length, action: empty }] : ['-', { label: 'Ne&w', disabled: !canWrite(here()), submenu: newMenu }]),
      '-',
      { label: 'P&roperties', action: () => properties(here(), win) },
    ], { x, y });
  }

  function options() {
    const sep = h('input', { type: 'radio', name: 'ex-opt', id: 'ex-sep', checked: !prefs.single });
    const one = h('input', { type: 'radio', name: 'ex-opt', id: 'ex-one', checked: prefs.single });
    const pic = (many) => h('div', { class: 'ex-optpic' + (many ? ' many' : '') }, h('i'), h('i'), h('i'));
    const form = h('form', { class: 'dlg', style: { width: 'min(360px, calc(100vw - 24px))' } },
      h('fieldset', { class: 'group' }, h('legend', null, 'Browsing options'),
        h('p', null, 'Browse folders by using:'),
        h('label', { class: 'pr-check ex-opt', for: 'ex-sep' }, sep, h('span', null, 'Separate windows for each folder.'), pic(true)),
        h('label', { class: 'pr-check ex-opt', for: 'ex-one' }, one, h('span', null, 'A single window that changes as you open each folder.', h('br'), h('small', null, 'Press Backspace to go up a level.')), pic(false))),
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'OK'), h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancel')));
    form.addEventListener('submit', e => { e.preventDefault(); prefs.single = one.checked; savePrefs(); d.close(); });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); d.close(); } });
    const d = createWindow({ title: 'Options', body: form, dialog: true, resizable: false, width: 'auto', parent: win });
    form.querySelector('.btn').focus();
  }

  function syncChrome() {
    toolbar.hidden = !prefs.toolbar && !explore;
    // The folder list in the toolbar: Desktop, My Computer, drives, the path down to here.
    const chain = [];
    for (let f = here(); f && f !== root; f = parentOf(f)) chain.unshift(f);
    const opts = [[desktopFolder(), 0, 'Desktop'], [root, 1]];
    for (const d of root.children) {
      opts.push([d, 2]);
      if (chain[0] === d) chain.slice(1).forEach((f, i) => opts.push([f, 3 + i]));
    }
    opts.push([network, 1], [recycle, 1]);
    if (!opts.some(o => o[0] === here())) opts.push([here(), 2]);
    where.replaceChildren(...opts.map(([n, depth, label]) => { const o = h('option', { selected: n === here() }, '\u00a0\u00a0'.repeat(depth) + (label || n.name)); o.node = n; return o; }));
    const s = selected();
    toolbar.querySelectorAll('[data-cmd]').forEach(b => {
      const c = b.dataset.cmd;
      b.disabled = c === 'up' ? (here() === root || isTop(here()) || here() === desktopFolder())
        : c === 'cut' ? !s.length || s.some(n => !n.user) : c === 'copy' ? !s.length || isBin()
        : c === 'paste' ? !canPaste(here()) : c === 'del' ? !s.length || s.some(n => n.kind === 'drive') : c === 'undo' ? !undoLabel() : false;
      if (VIEWS[c]) b.setAttribute('aria-pressed', String(prefs.view === c));
    });
    if (treeEl) treeEl.render();
  }

  const tb = (cmd, title, html, fn) => {
    const b = h('button', { class: 'ex-tb', type: 'button', title, 'aria-label': title, 'data-cmd': cmd, html });
    b.addEventListener('click', fn);
    return b;
  };
  where.addEventListener('change', () => {
    const n = where.selectedOptions[0].node;
    if (explore || prefs.single) go(n); else shellOpen(n, win);
  });
  toolbar.append(
    h('div', { class: 'ex-tbgroup' }, where, tb('up', 'Up One Level', icon('i-up').outerHTML, up)),
    h('div', { class: 'ex-tbgroup' },
      tb('cut', 'Cut', GLYPH.cut, () => cut(selected())), tb('copy', 'Copy', GLYPH.copy, () => copyNodes(selected())), tb('paste', 'Paste', GLYPH.paste, () => paste(here(), win))),
    h('div', { class: 'ex-tbgroup' }, tb('undo', 'Undo', GLYPH.undo, () => undo(win))),
    h('div', { class: 'ex-tbgroup' }, tb('del', 'Delete', GLYPH.del, delSel), tb('props', 'Properties', GLYPH.props, props)),
    h('div', { class: 'ex-tbgroup' }, ...Object.keys(VIEWS).map(k => tb(k, VIEWS[k].replace('&', ''), GLYPH[k], () => setView(k)))));

  list.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (!e.ctrlKey) choose(null);
    if (e.target === list && e.offsetX >= list.clientWidth || e.offsetY >= list.clientHeight) return; // the scroll bars
    const base = [...sel];
    marquee(e, r => { sel = new Set([...base, ...rows().filter(x => [...x.children].some(c => overlaps(c, r))).map(x => x.node)]); paint(); });
  });
  list.addEventListener('contextmenu', e => { e.preventDefault(); choose(null); bgMenu(e.clientX, e.clientY); });
  list.addEventListener('keydown', e => {
    if (renaming) return;
    const all = items();
    const i = all.indexOf(lead);
    const cols = prefs.view === 'icons' ? Math.max(1, Math.floor(list.clientWidth / 80)) : prefs.view === 'small' ? Math.max(1, Math.floor(list.clientWidth / 150)) : 1;
    const ctrl = e.ctrlKey || e.metaKey;
    let j = null;
    if (e.key === 'ArrowRight') j = i + (prefs.view === 'list' ? 0 : 1);
    else if (e.key === 'ArrowLeft') j = i - (prefs.view === 'list' ? 0 : 1);
    else if (e.key === 'ArrowDown') j = i < 0 ? 0 : i + cols;
    else if (e.key === 'ArrowUp') j = i - cols;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = all.length - 1;
    else if (e.key === 'Enter' && sel.size) { e.preventDefault(); if (e.altKey) props(); else selected().forEach(activate); return; }
    else if (e.key === 'Backspace') { e.preventDefault(); up(); return; }
    else if (e.key === 'Delete' && sel.size) { e.preventDefault(); delSel(); return; }
    else if (e.key === 'F2' && lead) { e.preventDefault(); startRename(lead); return; }
    else if (e.key === 'F5') { e.preventDefault(); render(); return; }
    else if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); sel = new Set(all); paint(); return; }
    else if (ctrl && e.key.toLowerCase() === 'x' && sel.size) { e.preventDefault(); cut(selected()); return; }
    else if (ctrl && e.key.toLowerCase() === 'c' && sel.size) { e.preventDefault(); copyNodes(selected()); return; }
    else if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(here(), win); return; }
    else if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(win); return; }
    else if (e.key.length === 1 && !ctrl && !e.altKey) {
      // Typing a letter jumps to the next item starting with it.
      const k = e.key.toLowerCase();
      const from = all.slice(i + 1).concat(all.slice(0, i + 1));
      const hit = from.find(n => n.name.toLowerCase().startsWith(k));
      if (hit) { e.preventDefault(); choose(hit); rowOf(hit)?.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    if (j == null) return;
    e.preventDefault();
    if (!all.length) return;
    const n = all[Math.max(0, Math.min(all.length - 1, j))];
    if (e.shiftKey && lead) { range(n); } else choose(n);
    rowOf(n)?.scrollIntoView({ block: 'nearest' });
  });

  const bar = menubar([
    { label: '&File', items: () => {
      const s = selected(), n = s[0];
      return [
        ...(n ? [{ label: '&Open', action: () => s.forEach(activate) }, ...(n.children && n !== recycle ? [{ label: '&Explore', action: () => launch('explorer', { node: n, explore: true }) }] : []), '-'] : []),
        ...(isBin()
          ? [{ label: 'R&estore', disabled: !s.length, action: restoreSel }, { label: 'Empty Recycle &Bin', disabled: !recycle.children.length, action: empty }, '-']
          : [{ label: 'Ne&w', disabled: !canWrite(here()), submenu: newMenu }, '-']),
        ...(n && !isBin() && n.kind !== 'drive' ? [{ label: 'Se&nd To', submenu: sendTo(s) }, '-'] : []),
        { label: 'Create &Shortcut', disabled: s.length !== 1 || isBin(), action: () => makeShortcut(n, here(), win) },
        { label: '&Delete', disabled: !s.length || s.some(x => x.kind === 'drive'), action: delSel },
        { label: 'Rena&me', disabled: !n || !n.user || s.length > 1, action: () => startRename(n) },
        { label: 'P&roperties', action: props },
        '-',
        { label: '&Close', action: () => win.close() },
      ];
    } },
    { label: '&Edit', items: () => [
      { label: undoLabel() ? '&' + undoLabel() : '&Undo', key: 'Ctrl+Z', disabled: !undoLabel(), action: () => undo(win) }, '-',
      { label: 'Cu&t', key: 'Ctrl+X', disabled: !sel.size || selected().some(n => !n.user), action: () => cut(selected()) },
      { label: '&Copy', key: 'Ctrl+C', disabled: !sel.size || isBin(), action: () => copyNodes(selected()) },
      { label: '&Paste', key: 'Ctrl+V', disabled: !canPaste(here()), action: () => paste(here(), win) },
      { label: 'Paste &Shortcut', disabled: !clip.nodes.length || !canWrite(here()), action: () => clip.nodes.forEach(n => makeShortcut(n, here(), win)) }, '-',
      { label: 'Select &All', key: 'Ctrl+A', action: () => { sel = new Set(items()); paint(); } },
      { label: '&Invert Selection', action: () => { sel = new Set(items().filter(n => !sel.has(n))); paint(); } },
    ] },
    { label: '&View', items: viewMenu },
    ...(explore ? [{ label: '&Tools', items: () => [
      { label: '&Find', submenu: [{ label: '&Files or Folders...', action: () => launch('find') }] },
      { label: '&Go to...', action: async () => {
        const { inputbox } = await import('../dialogs.js');
        const v = await inputbox({ title: 'Go to Folder', label: 'Type the path of the folder you want to go to:', parent: win });
        if (v) { const n = resolve(v.trim()); if (n && (n.children || n.kind === 'drive')) go(n); else msgbox({ title: 'Go to Folder', icon: 'error', parent: win, text: `Cannot find '${v}'.` }); }
      } },
    ] }] : []),
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') }, '-',
      { label: '&About blankiekun 95', action: () => about('Explorer', 'i-folder-open', win) },
    ] },
  ]);

  const treeEl = explore ? tree({ get node() { return win.node; } }, n => go(n)) : null;
  const body = explore
    ? h('div', { class: 'ex explore' }, bar, toolbar,
      h('div', { class: 'ex-heads' }, h('span', null, 'All Folders'), h('span', { class: 'ex-contents' }, 'Contents of \'' + pathLabel(node) + '\'')),
      h('div', { class: 'ex-panes' }, treeEl, list), status)
    : h('div', { class: 'ex' }, bar, toolbar, list, status);
  const winIcon = n => { const ic = iconOf(n); return ic === 'i-folder' ? 'i-folder-open' : ic; };
  const routeFor = n => n === root ? 'mycomputer' : n === recycle ? 'recycle' : n === network ? 'network' : null;
  const win = createWindow({
    app: 'explorer', title: explore ? 'Exploring - ' + pathLabel(node) : titleFor(node), icon: explore ? 'i-folder-open' : winIcon(node), body,
    width: explore ? (small.matches ? 360 : 600) : small.matches ? 360 : 440, height: explore ? 380 : 300, minW: 200, minH: 150,
    route: routeFor(node),
    onClosed: () => wins.delete(win),
  });
  win.explore = explore;
  win.node = node;
  win.refresh = () => {
    // A folder that was deleted or moved away closes its window, as in Explorer.
    if (!isTop(here()) && !pathOf(here()) && here() !== desktopFolder()) {
      if (parentOf(here()) === recycle || !parentOf(here())) { win.close(); return; }
    }
    render();
    if (!explore) win.setIcon(winIcon(here()));
    if (explore) body.querySelector('.ex-contents').textContent = 'Contents of \'' + pathLabel(here()) + '\'';
  };
  wins.add(win);
  render();
  if (treeEl) treeEl.reveal(node);
  list.focus({ preventScroll: true });
  return win;
}

function blankBitmap() {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

function printNode(n) {
  const html = n.data ? `<img src="${n.data}" style="max-width:100%">` : '<pre style="white-space:pre-wrap">' + String(n.text || '').replace(/[&<]/g, c => c === '&' ? '&amp;' : '&lt;') + '</pre>';
  import('./printers.js').then(m => m.printJob(n.name, html));
}

export default { id: 'explorer', title: 'Explorer', icon: 'i-folder-open', open };
export const myComputer = { id: 'mycomputer', title: 'My Computer', icon: 'i-computer', open: () => open('My Computer') };
export const recycleBin = { id: 'recycle', title: 'Recycle Bin', icon: 'i-trash-full', open: () => open('Recycle Bin') };
export const networkApp = { id: 'network', title: 'Network Neighborhood', icon: 'i-network', open: () => open('Network Neighborhood') };
