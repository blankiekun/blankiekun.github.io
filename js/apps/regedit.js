// Registry Editor. Read-only: HKEY_CURRENT_USER\Software\blankiekun holds what this
// site keeps in localStorage, one key per dot in the storage name.

import { h, icon, small } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';

const HIVES = ['HKEY_CLASSES_ROOT', 'HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE', 'HKEY_USERS', 'HKEY_CURRENT_CONFIG', 'HKEY_DYN_DATA'];

const key = name => ({ name, kids: new Map(), values: [] });
function sub(k, path) {
  for (const p of path) { if (!k.kids.has(p)) k.kids.set(p, key(p)); k = k.kids.get(p); }
  return k;
}

// One value per property of a saved object; anything else is the key's (Default).
function values(raw) {
  let v;
  try { v = JSON.parse(raw); } catch { v = raw; }
  if (v && typeof v === 'object' && !Array.isArray(v)) return Object.entries(v);
  return [['(Default)', v]];
}

function data(v) {
  if (typeof v === 'string') { const s = JSON.stringify(v); return s.length > 200 ? s.slice(0, 199) + '…"' : s; }
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff) return '0x' + v.toString(16).padStart(8, '0') + ` (${v})`;
  if (typeof v === 'boolean') return `0x0000000${+v} (${+v})`;
  // Everything else shows as binary, like REG_BINARY: the hex of its JSON.
  const s = JSON.stringify(v) ?? '';
  const hex = [...s.slice(0, 48)].map(c => (c.charCodeAt(0) & 255).toString(16).padStart(2, '0')).join(' ');
  return s.length > 48 ? hex + ' ...' : hex;
}

function build() {
  const top = key('My Computer');
  for (const name of HIVES) sub(top, [name]);
  const cur = sub(top, ['HKEY_LOCAL_MACHINE', 'SOFTWARE', 'Microsoft', 'Windows', 'CurrentVersion']);
  cur.values.push(['ProductName', 'blankiekun 95'], ['Version', 'Windows 95'], ['VersionNumber', '4.00.950'], ['RegisteredOwner', 'blankiekun']);
  sub(top, ['HKEY_CURRENT_USER', 'Control Panel', 'Desktop']);
  sub(top, ['HKEY_CURRENT_USER', 'AppEvents', 'Schemes']);
  const mine = sub(top, ['HKEY_CURRENT_USER', 'Software', 'blankiekun']);
  let names = [];
  try { names = Object.keys(localStorage).sort(); } catch {}
  for (const n of names) {
    let raw = null;
    try { raw = localStorage.getItem(n); } catch {}
    if (raw != null) sub(mine, n.split('.')).values.push(...values(raw));
  }
  return top;
}

function open() {
  const top = build();
  const expanded = new Set([top]);
  let cur = top;
  const treeEl = h('div', { class: 'ex-tree', role: 'tree', tabindex: '0', 'aria-label': 'Keys' });
  const list = h('div', { class: 'ex-list v-details', tabindex: '0', role: 'listbox', 'aria-label': 'Values', style: { '--cols': 1 } });
  const status = h('div', { class: 'statusbar' }, h('span'));
  const pathOf = (k, p = [], at = top) => {
    if (at === k) return [...p, at.name];
    for (const c of at.kids.values()) { const r = pathOf(k, [...p, at.name], c); if (r) return r; }
    return null;
  };

  function row(k, depth) {
    const kids = [...k.kids.values()].sort((a, b) => k === top ? 0 : a.name.localeCompare(b.name));
    const isOpen = expanded.has(k);
    const r = h('div', { class: 'ex-trow' + (k === cur ? ' sel' : ''), role: 'treeitem', style: { paddingLeft: depth * 16 + 'px' }, 'aria-expanded': kids.length ? String(isOpen) : null },
      h('button', { class: 'ex-twist', type: 'button', tabindex: '-1', 'aria-label': isOpen ? 'Collapse' : 'Expand', hidden: !kids.length }, isOpen ? '−' : '+'),
      icon(k === top ? 'i-computer' : k === cur ? 'i-folder-open' : 'i-folder'), h('span', null, k.name));
    r.querySelector('.ex-twist').addEventListener('click', e => { e.stopPropagation(); if (isOpen) expanded.delete(k); else expanded.add(k); render(); });
    r.addEventListener('click', () => { cur = k; render(); });
    r.addEventListener('dblclick', () => { if (isOpen) expanded.delete(k); else expanded.add(k); render(); });
    treeEl.append(r);
    if (isOpen) for (const c of kids) row(c, depth + 1);
  }

  function render() {
    treeEl.replaceChildren();
    row(top, 0);
    list.replaceChildren(h('div', { class: 'ex-head' }, h('span', null, 'Name'), h('span', null, 'Data')));
    const vals = cur === top ? [] : cur.values.some(v => v[0] === '(Default)') ? cur.values : [['(Default)', undefined], ...cur.values];
    for (const [n, v] of vals) {
      const str = v === undefined || typeof v === 'string';
      list.append(h('div', { class: 'ex-item', role: 'option' },
        h('span', { class: 'ex-ic' }, icon(str ? 'i-regsz' : 'i-regbin')), h('span', { class: 'ex-name' }, n),
        h('span', null, v === undefined ? '(value not set)' : data(v))));
    }
    status.firstChild.textContent = pathOf(cur).join('\\');
  }

  function readOnly() {
    msgbox({ title: 'Registry Editor', icon: 'warn', parent: win, text: 'The registry is read-only on this computer.\n\nYour settings change when you use the programs that keep them.' });
  }

  const bar = menubar([
    { label: '&Registry', items: () => [
      { label: '&Import Registry File...', action: readOnly },
      { label: '&Export Registry File...', action: readOnly }, '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Edit', items: () => [
      { label: '&New', disabled: true }, '-',
      { label: '&Delete', disabled: true }, { label: 'Rena&me', disabled: true }, '-',
      { label: '&Copy Key Name', disabled: cur === top, action: () => navigator.clipboard.writeText(pathOf(cur).slice(1).join('\\')).catch(() => {}) },
    ] },
    { label: '&View', items: () => [
      { label: '&Refresh', key: 'F5', action: refresh },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') }, '-',
      { label: '&About Registry Editor', action: () => about('Registry Editor', 'i-regedit', win) },
    ] },
  ]);

  // Refresh re-reads storage and keeps the same key selected when it still exists.
  function refresh() {
    const path = pathOf(cur).slice(1);
    const fresh = build();
    Object.assign(top, fresh);
    let k = top;
    for (const p of path) { if (!k.kids.has(p)) break; k = k.kids.get(p); }
    cur = k;
    expanded.clear();
    for (let i = 0, a = top; i <= path.length && a; a = a.kids.get(path[i++])) expanded.add(a);
    render();
  }

  const body = h('div', { class: 'ex explore regedit' }, bar, h('div', { class: 'ex-panes' }, treeEl, list), status);
  body.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); refresh(); } });
  const win = createWindow({ app: 'regedit', title: 'Registry Editor', icon: 'i-regedit', body, width: small.matches ? 360 : 600, height: 380, minW: 240, minH: 150, route: 'regedit' });
  render();
  return win;
}

export default { id: 'regedit', title: 'Registry Editor', icon: 'i-regedit', open };
