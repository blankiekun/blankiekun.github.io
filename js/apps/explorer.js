// Folder windows: My Computer, drives, folders, Control Panel, Network Neighborhood
// and the Recycle Bin, plus the two-pane "Exploring" window with the folder tree.
// Like Win95's default, each folder opens in its own window; View > Options can
// switch to browsing in one window. From XP on it's one window with Back and Forward, and
// each era's chrome: XP's task pane, Vista and 7's command bar, the ribbon in 8 and 10,
// 11's command bar; from Vista on, the breadcrumb address bar, search and navigation pane.

import { h, icon, small, store, marquee, overlaps, sound } from '../util.js';
import { createWindow, find, launch, appInfo } from '../wm.js';
import { menubar, openMenu, ribbon, rbtn } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import {
  root, resolve, recycle, network, kindLabel, sizeLabel, pathOf, parentOf, onChange,
  canWrite, mkdir, createFile, restore, emptyBin, FsError, desktopFolder, docsFolder,
} from '../fs.js';
import { open as shellOpen } from '../shell.js';
import { properties, iconOf } from '../props.js';
import { clip, cut, copyNodes, paste, canPaste, del, startDrag, toFloppy, onClip, isCut, undo, undoLabel, renameNode, makeShortcut } from '../fileops.js';
import { OS, V, rename } from '../version.js';

const XP = V.id === 'xp', AERO = V.id === 'vista' || V.id === '7', RIBBON = V.id === '8' || V.id === '10', W11 = V.id === '11';
const MODERN = AERO || RIBBON || W11;
const NEW = XP || MODERN;

const PREFS = NEW ? 'w95.explorer.' + V.id : 'w95.explorer';
const prefs = { view: 'icons', sort: 'name', single: NEW, toolbar: XP, status: !AERO, menubar: XP, nav: true, details: AERO, ...store.get(PREFS, {}) };
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
  rename: svg("<path d='M1 5h8v1H2v4h7v1H1zM12 5h3v6h-3v-1h2V6h-2zM9 2h3v1h-1v10h1v1H9v-1h1V3H9z'/>"),
  search: svg("<circle cx='6.5' cy='6.5' r='4.5' fill='#fff' stroke='#000' stroke-width='1.5'/><path d='M10 10l4.5 4.5' stroke='#000' stroke-width='2'/>"),
};
// Vista on: the round Back and Forward buttons and the flat Up arrow.
const arrow = d => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const ARROW = { back: arrow('M14 8H3M8 3L3 8l5 5'), fwd: arrow('M2 8h11M8 3l5 5-5 5'), up: arrow('M8 14V3M3 8l5-5 5 5') };
const FAV = V.id === 'vista' ? 'Favorite Links' : V.id === '10' || W11 ? 'Quick access' : 'Favorites';

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
  function row(node, depth, label, leaf) {
    const kids = leaf ? [] : (node.children || []).filter(c => c.children && !c.notReady);
    const isOpen = open.has(node);
    const r = h('div', { class: 'ex-trow' + (win.node === node ? ' sel' : ''), role: 'treeitem', style: { paddingLeft: depth * 16 + 'px' }, 'aria-expanded': kids.length ? String(isOpen) : null },
      h('button', { class: 'ex-twist', type: 'button', tabindex: '-1', 'aria-label': isOpen ? 'Collapse' : 'Expand', hidden: !kids.length }, isOpen ? '−' : '+'),
      icon(win.node === node && node.kind === 'folder' && !node.icon ? 'i-folder-open' : iconOf(node)), h('span', null, label || rename(node.name)));
    r.dropFolder = () => node;
    r.querySelector('.ex-twist').addEventListener('click', e => { e.stopPropagation(); if (isOpen) open.delete(node); else open.add(node); render(); });
    r.addEventListener('click', () => { open.add(node); go(node); });
    el.append(r);
    if (isOpen) for (const k of sorted(kids)) row(k, depth + 1);
  }
  function render() {
    el.replaceChildren();
    if (MODERN) {
      el.append(h('div', { class: 'ex-tgroup' }, FAV));
      row(desktopFolder(), 1, 'Desktop', true);
      row(docsFolder(), 1, 'Documents', true);
      row(root, 0);
      row(network, 0);
      return;
    }
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

  let sel = new Set(), lead = null, renaming = null, query = '', showTree = explore;
  const back = [], fwd = [];
  const list = h('div', { class: 'ex-list', tabindex: '0', role: 'listbox', 'aria-multiselectable': 'true' });
  list.dropFolder = () => win.node;
  const status = h('div', { class: 'statusbar' }, h('span'), h('span', { style: { width: '120px' } }));
  const where = h('select', { class: 'field ex-where', 'aria-label': 'Go to a different folder' });
  const toolbar = h('div', { class: 'ex-toolbar' });

  const here = () => win.node;
  const isBin = () => here() === recycle;
  // Programs that didn't load aren't listed.
  const items = () => sorted((here().children || []).filter(n => (n.kind !== 'app' || n.app === 'setup' || appInfo(n.app)) && n.name.toLowerCase().includes(query)));
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
      status.children[0].textContent = MODERN ? s.length + (s.length === 1 ? ' item' : ' items') + ' selected' : s.length + ' object(s) selected';
      const total = s.reduce((t, c) => t + (c.size || 0), 0);
      status.children[1].textContent = total ? sizeLabel({ size: total }) : '';
    } else {
      status.children[0].textContent = MODERN ? n + (n === 1 ? ' item' : ' items') : n + ' object(s)' + (here().kind === 'drive' && here().letter === 'C' ? ' (plus 7 hidden)' : '');
      const total = items().reduce((t, c) => t + (c.size || 0), 0);
      status.children[1].textContent = total ? sizeLabel({ size: total }) : '';
    }
    status.hidden = !prefs.status;
    if (det) {
      const d = s[0] || here();
      det.replaceChildren(icon(s[0] ? iconOf(d) : winIcon(d)), h('div', null,
        h('b', null, s.length > 1 ? s.length + ' items selected' : rename(d.name)),
        h('span', null, s.length > 1 ? '' : s.length ? kindLabel(d) + (d.size ? '    Size: ' + sizeLabel(d) : '') : n + (n === 1 ? ' item' : ' items'))));
      det.hidden = !prefs.details;
    }
    if (tasks) syncTasks();
    syncButtons();
  }

  // XP's task pane: what you can do here, other places, and details of the selection.
  const folded = new Set();
  const link = (label, pic, fn) => h('button', { class: 'ex-link', type: 'button', onclick: fn }, pic.startsWith('i-') ? icon(pic) : h('span', { html: pic }), h('span', null, label));
  function taskBox(title, ...kids) {
    const box = h('div', { class: 'ex-tbox' + (folded.has(title) ? ' folded' : '') },
      h('button', { class: 'ex-thead', type: 'button', 'aria-expanded': String(!folded.has(title)) }, title), h('div', { class: 'ex-tbody' }, ...kids));
    box.firstChild.addEventListener('click', () => { if (!folded.delete(title)) folded.add(title); syncTasks(); });
    return box;
  }
  function syncTasks() {
    const s = selected(), n = s[0];
    const it = s.length > 1 ? 'the selected items' : n && (n.children || n.kind === 'drive') ? 'this folder' : 'this file';
    const first = here() === root
      ? taskBox('System Tasks', link('View system information', 'i-computer', () => launch('sysprops')),
        link('Add or remove programs', 'i-addremove', () => launch('addremove')), link('Change a setting', 'i-ctrl', () => launch('explorer', 'Control Panel')))
      : isBin()
        ? taskBox('Recycle Bin Tasks', link('Empty the Recycle Bin', 'i-trash', empty),
          n ? link(s.length > 1 ? 'Restore the selected items' : 'Restore this item', 'i-folder', restoreSel) : link('Restore all items', 'i-folder', () => { sel = new Set(items()); restoreSel(); }))
        : taskBox('File and Folder Tasks', ...(n
          ? [s.length === 1 && n.user ? link('Rename ' + it, GLYPH.rename, () => startRename(n)) : null,
            n.kind === 'drive' ? null : link('Copy ' + it, GLYPH.copy, () => copyNodes(s)),
            n.kind === 'drive' || isTop(n) ? null : link('Delete ' + it, GLYPH.del, delSel)]
          : [canWrite(here()) ? link('Make a new folder', 'i-newfolder', newFolder) : null]));
    const places = [parentOf(here()), desktopFolder(), docsFolder(), root, network].filter((p, i, a) => p && p !== here() && a.indexOf(p) === i);
    const d = n || here();
    tasks.replaceChildren(first,
      taskBox('Other Places', ...places.map(p => link(p === desktopFolder() ? 'Desktop' : rename(p.name), iconOf(p), () => go(p)))),
      taskBox('Details', s.length > 1 ? h('p', null, s.length + ' items selected.')
        : h('p', null, h('b', null, rename(d.name)), h('br'), isTop(d) || d.virtual ? 'System Folder' : kindLabel(d), d.size ? h('br') : null, d.size ? 'Size: ' + sizeLabel(d) : null)));
  }

  // Opening a folder: a new window, or the same one in single-window mode and in Exploring.
  function activate(n) {
    if ((n.children || n.kind === 'drive') && !n.notReady && !n.offline && n !== recycle && oneWin()) { go(n); return; }
    if (n === recycle && oneWin()) { go(n); return; }
    shellOpen(n, win);
  }
  const oneWin = () => explore || NEW || prefs.single;
  const title = n => explore && !NEW ? 'Exploring - ' + pathLabel(n) : titleFor(n);
  function go(n, hist) {
    if (n.offline) { msgbox({ title: 'Network Neighborhood', icon: 'error', parent: win, text: `\\\\${n.name.toUpperCase()} is not accessible.\n\nThe network path was not found.` }); return; }
    if (n.notReady) { shellOpen(n, win); return; }
    if (!hist && n !== win.node) { back.push(win.node); fwd.length = 0; }
    win.node = n;
    sel = new Set(); lead = null; query = '';
    if (search) search.value = '';
    render();
    if (treeEl) treeEl.reveal(n);
    win.setTitle(title(n));
    win.setIcon(explore && !NEW ? 'i-folder-open' : winIcon(n));
    win.setRoute(routeFor(n));
  }
  function up() {
    const p = parentOf(here());
    if (here() === root || here() === network || here() === recycle || here() === desktopFolder()) return;
    if (!p || p === root && here().kind !== 'drive' && !here().virtual) return;
    if (oneWin()) go(p);
    else shellOpen(p, win);
  }
  // Back and Forward skip folders that have since been deleted.
  function step(from, to) {
    let n;
    while ((n = from.pop()) && !isTop(n) && !pathOf(n));
    if (!n) return;
    to.push(here());
    go(n, true);
  }
  const goBack = () => step(back, fwd), goFwd = () => step(fwd, back);

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
    if (!n.user) { msgbox({ title: 'Error Renaming File', icon: 'error', parent: win, text: `Cannot rename ${n.name}: Access is denied.\n\nIt's one of the files that came with ${OS}.` }); return; }
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
  const delSel = shift => del(selected(), win, shift === true);
  const props = () => { const s = selected(); properties(s.length ? s[0] : here(), win); };
  const setView = v => { prefs.view = v; savePrefs(); refreshAll(); };
  const flip = k => () => { prefs[k] = !prefs[k]; savePrefs(); refreshAll(); };
  const sortBy = k => () => { prefs.sort = k; savePrefs(); refreshAll(); };
  const viewItems = () => Object.entries(VIEWS).map(([k, l]) => ({ label: l, radio: true, checked: prefs.view === k, action: () => setView(k) }));
  const sortItems = () => [['by &Name', 'name'], ['by &Type', 'type'], ['by Si&ze', 'size'], ['by &Date', 'date']]
    .map(([label, k]) => ({ label, radio: true, checked: prefs.sort === k, action: sortBy(k) }));
  const selectNone = () => { sel = new Set(); paint(); };
  const invert = () => { sel = new Set(items().filter(n => !sel.has(n))); paint(); };

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
      ...(MODERN ? [] : [{ label: '&Toolbar', checked: prefs.toolbar, action: flip('toolbar') }]),
      { label: 'Status &Bar', checked: prefs.status, action: flip('status') },
      ...(XP ? [{ label: 'E&xplorer Bar', submenu: [{ label: '&Folders', checked: showTree, action: toggleTree }] }] : []),
      '-',
      ...viewItems(),
      '-',
      { label: 'Arrange &Icons', submenu: sortItems },
      { label: 'Line &up Icons', disabled: prefs.view !== 'icons' && prefs.view !== 'small', action: render },
      '-',
      { label: '&Refresh', key: 'F5', action: render },
      { label: '&Options...', action: options },
    ];
  }
  function bgMenu(x, y) {
    openMenu([
      { label: '&View', submenu: viewItems },
      '-',
      { label: 'Arrange &Icons', submenu: sortItems },
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
    if (NEW) bar.hidden = AERO ? !prefs.menubar : W11;
    if (side) {
      side.hidden = MODERN && !prefs.nav;
      const want = XP && !showTree ? [tasks] : XP ? [paneHead, treeEl] : [treeEl];
      if (side.firstChild !== want[0]) side.replaceChildren(...want);
    }
    if (MODERN && !crumbs.contains(document.activeElement)) {
      const chain = [];
      for (let f = here(); f; f = parentOf(f)) chain.unshift(f);
      crumbs.replaceChildren(icon(winIcon(here())), ...chain.flatMap(f => [h('span', { class: 'ex-sep' }, '\u203a'),
        h('button', { class: 'ex-crumb', type: 'button', onclick: () => go(f) }, f === desktopFolder() ? 'Desktop' : rename(f.name))]));
      search.placeholder = 'Search ' + (here() === desktopFolder() ? 'Desktop' : rename(here().name));
    }
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
    syncButtons();
    if (treeEl) treeEl.render();
  }
  function syncButtons() {
    const s = selected();
    body.querySelectorAll('[data-cmd]').forEach(b => {
      const c = b.dataset.cmd;
      b.disabled = c === 'back' ? !back.length : c === 'fwd' ? !fwd.length
        : c === 'rename' ? s.length !== 1 || !s[0].user : c === 'newfolder' ? !canWrite(here()) : c === 'up' ? (here() === root || isTop(here()) || here() === desktopFolder())
        : c === 'cut' ? !s.length || s.some(n => !n.user) : c === 'copy' ? !s.length || isBin()
        : c === 'paste' ? !canPaste(here()) : c === 'del' ? !s.length || s.some(n => n.kind === 'drive') : c === 'undo' ? !undoLabel() : false;
      if (VIEWS[c]) b.setAttribute('aria-pressed', String(prefs.view === c));
      if (c === 'folders') b.setAttribute('aria-pressed', String(showTree));
    });
  }

  const tb = (cmd, title, html, fn) => {
    const b = h('button', { class: 'ex-tb', type: 'button', title, 'aria-label': title, 'data-cmd': cmd, html });
    b.addEventListener('click', fn);
    return b;
  };
  where.addEventListener('change', () => {
    const n = where.selectedOptions[0].node;
    if (oneWin()) go(n); else shellOpen(n, win);
  });
  const toggleTree = () => { showTree = !showTree; syncChrome(); };
  const drop = items => e => openMenu(items(), { rect: e.currentTarget.getBoundingClientRect(), below: true });
  if (XP) toolbar.append(
    h('div', { class: 'ex-tbgroup' }, tb('back', 'Back', icon('i-back').outerHTML + '<span>Back</span>', goBack), tb('fwd', 'Forward', icon('i-fwd').outerHTML, goFwd),
      tb('up', 'Up', icon('i-up').outerHTML, up)),
    h('div', { class: 'ex-tbgroup' }, tb('search', 'Search', GLYPH.search + '<span>Search</span>', () => launch('find')),
      tb('folders', 'Folders', icon('i-folder').outerHTML + '<span>Folders</span>', toggleTree)),
    h('div', { class: 'ex-tbgroup' }, tb('views', 'Views', GLYPH.icons, drop(viewItems))),
    h('div', { class: 'ex-addrrow' }, h('span', null, 'Address'), where, h('button', { class: 'btn ex-go', type: 'button', onclick: () => where.dispatchEvent(new Event('change')) }, 'Go')));
  else toolbar.append(
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
    if (NEW && e.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(e.key)) { e.preventDefault(); ({ ArrowLeft: goBack, ArrowRight: goFwd, ArrowUp: up })[e.key](); return; }
    if (e.key === 'ArrowRight') j = i + (prefs.view === 'list' ? 0 : 1);
    else if (e.key === 'ArrowLeft') j = i - (prefs.view === 'list' ? 0 : 1);
    else if (e.key === 'ArrowDown') j = i < 0 ? 0 : i + cols;
    else if (e.key === 'ArrowUp') j = i - cols;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = all.length - 1;
    else if (e.key === 'Enter' && sel.size) { e.preventDefault(); if (e.altKey) props(); else selected().forEach(activate); return; }
    else if (e.key === 'Backspace') { e.preventDefault(); if (NEW) goBack(); else up(); return; }
    else if (e.key === 'Delete' && sel.size) { e.preventDefault(); delSel(e.shiftKey); return; }
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

  const editItems = () => [
    { label: undoLabel() ? '&' + undoLabel() : '&Undo', key: 'Ctrl+Z', disabled: !undoLabel(), action: () => undo(win) }, '-',
    { label: 'Cu&t', key: 'Ctrl+X', disabled: !sel.size || selected().some(n => !n.user), action: () => cut(selected()) },
    { label: '&Copy', key: 'Ctrl+C', disabled: !sel.size || isBin(), action: () => copyNodes(selected()) },
    { label: '&Paste', key: 'Ctrl+V', disabled: !canPaste(here()), action: () => paste(here(), win) },
    { label: 'Paste &Shortcut', disabled: !clip.nodes.length || !canWrite(here()), action: () => clip.nodes.forEach(n => makeShortcut(n, here(), win)) }, '-',
    { label: 'Select &All', key: 'Ctrl+A', action: () => { sel = new Set(items()); paint(); } },
    { label: '&Invert Selection', action: invert },
  ];
  const menus = [
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
    { label: '&Edit', items: editItems },
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
      { label: '&About ' + OS, action: () => about('Explorer', 'i-folder-open', win) },
    ] },
  ];

  // 8 and 10's ribbon; its buttons carry data-cmd so syncChrome greys them like the toolbar's.
  const rb = (cmd, ...a) => { const b = rbtn(...a); if (cmd) b.dataset.cmd = cmd; return b; };
  const bar = RIBBON ? ribbon(menus, [
    { label: 'Home', groups: [
      ['Clipboard', rb('copy', 'Copy', GLYPH.copy, () => copyNodes(selected()), true), rb('paste', 'Paste', GLYPH.paste, () => paste(here(), win), true),
        h('div', { class: 'rb-col' }, rb('cut', 'Cut', GLYPH.cut, () => cut(selected())), rb('undo', 'Undo', GLYPH.undo, () => undo(win)))],
      ['Organize', rb('del', 'Delete', GLYPH.del, delSel, true), rb('rename', 'Rename', GLYPH.rename, () => startRename(selected()[0]), true)],
      ['New', rb('newfolder', 'New folder', 'i-newfolder', newFolder, true)],
      ['Open', rb('', 'Properties', GLYPH.props, props, true)],
      ['Select', h('div', { class: 'rb-col' }, rb('', 'Select all', GLYPH.icons, () => { sel = new Set(items()); paint(); }),
        rb('', 'Select none', GLYPH.small, selectNone), rb('', 'Invert selection', GLYPH.list, invert))],
    ] },
    { label: 'View', groups: [
      ['Panes', rb('', 'Navigation pane', 'i-folder', flip('nav'), true)],
      ['Layout', h('div', { class: 'rb-col' }, ...['icons', 'small'].map(k => rb(k, VIEWS[k].replace('&', ''), GLYPH[k], () => setView(k)))),
        h('div', { class: 'rb-col' }, ...['list', 'details'].map(k => rb(k, VIEWS[k].replace('&', ''), GLYPH[k], () => setView(k))))],
      ['Current view', rb('', 'Sort by', GLYPH.details, drop(sortItems), true)],
    ] },
  ]) : menubar(menus);

  // Vista on: Back, Forward, the breadcrumb address and the search box.
  const navBtn = cmd => h('button', { class: 'ex-nav', type: 'button', title: { back: 'Back', fwd: 'Forward', up: 'Up' }[cmd], 'aria-label': { back: 'Back', fwd: 'Forward', up: 'Up' }[cmd], 'data-cmd': cmd, html: ARROW[cmd],
    onclick: { back: goBack, fwd: goFwd, up }[cmd] });
  const crumbs = MODERN ? h('div', { class: 'ex-crumbs' }) : null;
  const search = MODERN ? h('input', { class: 'ex-search', type: 'search', 'aria-label': 'Search', oninput: e => { query = e.target.value.trim().toLowerCase(); render(); } }) : null;
  const navrow = MODERN ? h('div', { class: 'ex-navrow' }, navBtn('back'), navBtn('fwd'), AERO ? null : navBtn('up'), h('div', { class: 'ex-addr' }, crumbs), search) : null;
  // Clicking past the last folder turns the address into a path you can type.
  navrow?.querySelector('.ex-addr').addEventListener('click', e => {
    if (e.target.closest('.ex-crumb, input')) return;
    const box = h('input', { class: 'ex-path', 'aria-label': 'Address' });
    box.value = pathLabel(here());
    crumbs.replaceChildren(box);
    box.focus(); box.select();
    box.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { box.blur(); return; }
      if (e.key !== 'Enter') return;
      const n = resolve(box.value.trim());
      box.blur();
      if (n && (n.children || n.kind === 'drive')) go(n);
      else msgbox({ title: 'Explorer', icon: 'error', parent: win, text: `Windows can't find '${box.value}'. Check the spelling and try again.` });
    });
    box.addEventListener('blur', () => setTimeout(syncChrome));
  });
  search?.addEventListener('keydown', e => e.stopPropagation());

  // Vista and 7's command bar, and 11's.
  const menuBtn = (label, items, cls) => h('button', { class: 'ex-cbtn' + (cls ? ' ' + cls : ''), type: 'button', 'aria-haspopup': 'menu', onclick: drop(items) }, label);
  const organize = () => [...editItems(), '-',
    { label: '&Layout', submenu: () => [
      { label: '&Menu Bar', checked: prefs.menubar, action: flip('menubar') },
      { label: '&Details Pane', checked: prefs.details, action: flip('details') },
      { label: '&Navigation Pane', checked: prefs.nav, action: flip('nav') },
    ] }, '-',
    ...menus[0].items().slice(-6)];
  const cmdbar = AERO ? h('div', { class: 'ex-cmd' }, menuBtn('Organize', organize),
    V.id === 'vista' ? menuBtn('Views', viewItems) : h('button', { class: 'ex-cbtn', type: 'button', 'data-cmd': 'newfolder', onclick: newFolder }, 'New folder'),
    h('span', { class: 'ex-fill' }), V.id === '7' ? menuBtn(h('span', { html: GLYPH[prefs.view] }), viewItems, 'ex-views') : null)
    : W11 ? h('div', { class: 'ex-cmd' }, menuBtn('New', newMenu, 'ex-new11'), h('span', { class: 'ex-csep' }),
      tb('cut', 'Cut', GLYPH.cut, () => cut(selected())), tb('copy', 'Copy', GLYPH.copy, () => copyNodes(selected())), tb('paste', 'Paste', GLYPH.paste, () => paste(here(), win)),
      tb('rename', 'Rename', GLYPH.rename, () => startRename(selected()[0])), tb('del', 'Delete', GLYPH.del, delSel), h('span', { class: 'ex-csep' }),
      menuBtn('Sort', sortItems), menuBtn('View', viewItems), h('span', { class: 'ex-csep' }),
      menuBtn('\u22ef', () => [{ label: '&Undo', disabled: !undoLabel(), action: () => undo(win) }, '-',
        { label: 'Select &all', action: () => { sel = new Set(items()); paint(); } }, { label: 'Select &none', action: selectNone }, { label: '&Invert selection', action: invert }, '-',
        { label: '&Navigation pane', checked: prefs.nav, action: flip('nav') }, { label: '&Status bar', checked: prefs.status, action: flip('status') }, '-',
        { label: '&Properties', action: props }], 'ex-more'))
      : null;
  const det = AERO ? h('div', { class: 'ex-det' }) : null;
  const tasks = XP ? h('div', { class: 'ex-tasks' }) : null;
  const side = NEW ? h('div', { class: 'ex-side' }) : null;
  const paneHead = XP ? h('div', { class: 'ex-phead' }, h('span', null, 'Folders'), h('button', { class: 'ex-pclose', type: 'button', 'aria-label': 'Close', onclick: toggleTree }, '\u00d7')) : null;

  const treeEl = explore || NEW ? tree({ get node() { return win.node; } }, n => go(n)) : null;
  const body = NEW
    ? h('div', { class: 'ex ex-new' + (MODERN ? ' ex-modern' : '') }, ...(RIBBON ? [bar, navrow] : [navrow, bar, XP ? toolbar : cmdbar]), h('div', { class: 'ex-panes' }, side, list), det, status)
    : explore
    ? h('div', { class: 'ex explore' }, bar, toolbar,
      h('div', { class: 'ex-heads' }, h('span', null, 'All Folders'), h('span', { class: 'ex-contents' }, 'Contents of \'' + pathLabel(node) + '\'')),
      h('div', { class: 'ex-panes' }, treeEl, list), status)
    : h('div', { class: 'ex' }, bar, toolbar, list, status);
  const winIcon = n => { const ic = iconOf(n); return ic === 'i-folder' ? 'i-folder-open' : ic; };
  const routeFor = n => n === root ? 'mycomputer' : n === recycle ? 'recycle' : n === network ? 'network' : null;
  const win = createWindow({
    app: 'explorer', title: title(node), icon: explore && !NEW ? 'i-folder-open' : winIcon(node), body,
    width: small.matches ? 360 : NEW ? 640 : explore ? 600 : 440, height: NEW ? 420 : explore ? 380 : 300, minW: 200, minH: 150,
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
    if (explore && !NEW) body.querySelector('.ex-contents').textContent = 'Contents of \'' + pathLabel(here()) + '\'';
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
