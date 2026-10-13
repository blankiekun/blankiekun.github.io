// Folder windows: My Computer, drives, folders, Control Panel and the Recycle Bin.
// Like Win95's default, each folder opens in its own window.

import { h, icon, small } from '../util.js';
import { createWindow, find, launch } from '../wm.js';
import { menubar, openMenu } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import { resolve, recycle, kindLabel, sizeLabel, pathOf } from '../fs.js';
import { open as shellOpen } from '../shell.js';
import { refreshIcons } from '../desktop.js';

let view = 'icons';
const wins = new Set();

function titleFor(path, node) {
  if (node === recycle) return 'Recycle Bin';
  if (node.kind === 'drive') return node.name;
  if (path === 'My Computer' || node.virtual) return node.name;
  return path.length > 3 ? path.split('\\').pop() : path;
}

function iconFor(n) {
  if (n.icon) return n === recycle && !recycle.children.length ? 'i-trash' : n.icon;
  return n.kind === 'folder' ? 'i-folder' : 'i-txt';
}

function open(path = 'My Computer') {
  const node = resolve(path);
  if (!node) { msgbox({ title: 'Explorer', icon: 'error', text: `Cannot find '${path}'.` }); return null; }
  const existing = find(w => w.app === 'explorer' && w.node === node);
  if (existing) { existing.focus(); return existing; }

  const isBin = node === recycle;
  let sel = null;
  const list = h('div', { class: 'ex-list', tabindex: '0', role: 'listbox', 'aria-label': titleFor(path, node) });
  const status = h('div', { class: 'statusbar' }, h('span'), h('span', { style: { width: '120px' } }));

  function items() { return node.children || []; }
  function render() {
    list.className = 'ex-list ' + (view === 'details' ? 'details' : 'icons');
    list.style.setProperty('--cols', isBin ? 3 : 2);
    list.replaceChildren();
    if (view === 'details') {
      const cols = isBin ? ['Name', 'Original Location', 'Type', 'Size'] : ['Name', 'Size', 'Type'];
      list.append(h('div', { class: 'ex-head' }, ...cols.map(c => h('span', null, c))));
    }
    items().forEach(n => {
      const it = h('div', { class: 'ex-item', role: 'option', 'aria-selected': 'false', tabindex: '-1' },
        h('span', { class: 'ex-ic' }, icon(iconFor(n)), n.kind === 'link' ? h('i', { class: 'lnk' }) : null),
        h('span', { class: 'ex-name' }, n.name));
      if (view === 'details') {
        if (isBin) it.append(h('span', null, n.from || ''), h('span', null, kindLabel(n)), h('span', null, sizeLabel(n)));
        else it.append(h('span', null, sizeLabel(n)), h('span', null, kindLabel(n)));
      }
      it.node = n;
      it.addEventListener('pointerdown', e => {
        e.stopPropagation();
        choose(it);
        if (e.pointerType !== 'mouse' && e.button === 0) it.addEventListener('pointerup', () => shellOpen(n, win), { once: true });
      });
      it.addEventListener('dblclick', () => shellOpen(n, win));
      it.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation(); choose(it);
        openMenu([
          { label: '&Open', action: () => shellOpen(n, win) },
          ...(isBin ? [{ label: 'R&estore', action: () => restore(n) }] : []),
          '-',
          { label: 'P&roperties', action: () => props(n) },
        ], { x: e.clientX, y: e.clientY });
      });
      list.append(it);
    });
    if (!items().length) list.append(h('div', { class: 'ex-empty' }, node.notReady ? '' : 'This folder is empty.'));
    sel = null;
    updateStatus();
  }
  function choose(it) {
    list.querySelectorAll('.ex-item').forEach(x => { x.classList.toggle('sel', x === it); x.setAttribute('aria-selected', String(x === it)); });
    sel = it;
    if (it) it.focus({ preventScroll: true });
    updateStatus();
  }
  function updateStatus() {
    const n = items().length;
    if (sel) {
      status.children[0].textContent = '1 object(s) selected';
      status.children[1].textContent = sizeLabel(sel.node);
    } else {
      status.children[0].textContent = n + ' object(s)';
      const total = items().reduce((s, c) => s + (c.size || 0), 0);
      status.children[1].textContent = total ? sizeLabel({ size: total }) : '';
    }
  }
  function props(n) {
    const where = n.from || (pathOf(n) || '').split('\\').slice(0, -1).join('\\') || 'My Computer';
    msgbox({ title: n.name + ' Properties', icon: iconFor(n), parent: win,
      text: `${n.name}\n\nType:  ${kindLabel(n)}\nLocation:  ${where}${n.size ? '\nSize:  ' + sizeLabel(n) + ' (' + n.size.toLocaleString('en-US') + ' bytes)' : ''}` });
  }
  function restore(n) {
    msgbox({ title: 'Restore', icon: 'info', parent: win, text: `${n.name} is happier in the Recycle Bin.\n\nIt will stay here.` });
  }
  async function empty() {
    if (!recycle.children.length) return;
    const b = await msgbox({ title: 'Confirm Multiple File Delete', icon: 'question', parent: win, buttons: ['&Yes', '&No'],
      text: `Are you sure you want to delete these ${recycle.children.length} items?` });
    if (b !== 'Yes') return;
    recycle.children.length = 0;
    refreshIcons();
    for (const w of wins) w.refresh();
  }

  list.addEventListener('pointerdown', () => choose(null));
  list.addEventListener('keydown', e => {
    const all = [...list.querySelectorAll('.ex-item')];
    const i = all.indexOf(sel);
    const cols = view === 'icons' ? Math.max(1, Math.floor(list.clientWidth / 80)) : 1;
    let j = null;
    if (e.key === 'ArrowRight') j = i + 1;
    else if (e.key === 'ArrowLeft') j = i - 1;
    else if (e.key === 'ArrowDown') j = i < 0 ? 0 : i + cols;
    else if (e.key === 'ArrowUp') j = i - cols;
    else if (e.key === 'Enter' && sel) { e.preventDefault(); shellOpen(sel.node, win); return; }
    else if (e.key === 'Backspace') { e.preventDefault(); up(); return; }
    if (j == null) return;
    e.preventDefault();
    if (all.length) choose(all[Math.max(0, Math.min(all.length - 1, j))]);
  });

  function up() {
    if (node === recycle || path === 'My Computer') return;
    if (node.kind === 'drive' || node.virtual) { launch('explorer', 'My Computer'); return; }
    const p = path.split('\\').slice(0, -1).join('\\');
    launch('explorer', p.length === 2 ? p + '\\' : p);
  }

  const bar = menubar([
    { label: '&File', items: () => [
      { label: '&Open', disabled: !sel, action: () => sel && shellOpen(sel.node, win) },
      ...(isBin ? [{ label: 'Empty Recycle &Bin', disabled: !recycle.children.length, action: empty }] : []),
      '-',
      { label: 'P&roperties', disabled: !sel, action: () => sel && props(sel.node) },
      '-',
      { label: '&Close', action: () => win.close() },
    ] },
    { label: '&Edit', items: () => [
      { label: '&Undo', disabled: true }, '-',
      { label: 'Cu&t', disabled: true }, { label: '&Copy', disabled: true }, { label: '&Paste', disabled: true }, '-',
      { label: 'Select &All', action: () => { const f = list.querySelector('.ex-item'); if (f) choose(f); } },
    ] },
    { label: '&View', items: () => [
      { label: 'Lar&ge Icons', checked: view === 'icons', radio: true, action: () => { view = 'icons'; for (const w of wins) w.refresh(); } },
      { label: '&Details', checked: view === 'details', radio: true, action: () => { view = 'details'; for (const w of wins) w.refresh(); } },
      '-',
      { label: '&Up One Level', key: 'Backspace', disabled: node === recycle || path === 'My Computer', action: up },
      { label: '&Refresh', action: render },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') }, '-',
      { label: '&About blankiekun 95', action: () => about('Explorer', 'i-folder-open', win) },
    ] },
  ]);

  const body = h('div', { class: 'ex' }, bar, list, status);
  const ic = iconFor(node);
  const win = createWindow({
    app: 'explorer', title: titleFor(path, node), icon: ic === 'i-folder' ? 'i-folder-open' : ic, body,
    width: small.matches ? 360 : 440, height: 300, minW: 200, minH: 150,
    route: path === 'My Computer' ? 'mycomputer' : isBin ? 'recycle' : null,
    onClosed: () => wins.delete(win),
  });
  win.node = node;
  win.refresh = () => {
    render();
    if (isBin) { const id = iconFor(node); win.setIcon(id); }
  };
  wins.add(win);
  render();
  return win;
}

export default { id: 'explorer', title: 'Explorer', icon: 'i-folder-open', open };
export const myComputer = { id: 'mycomputer', title: 'My Computer', icon: 'i-computer', open: () => open('My Computer') };
export const recycleBin = { id: 'recycle', title: 'Recycle Bin', icon: 'i-trash-full', open: () => open('Recycle Bin') };
