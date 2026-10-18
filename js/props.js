// The Properties sheets for files, folders, drives and the Recycle Bin.

import { h, icon, store } from './util.js';
import { createWindow, launch } from './wm.js';
import { msgbox } from './dialogs.js';
import { recycle, pathOf, parentOf, kindLabel, dosName, folderStats, rename, FsError, walk } from './fs.js';
import { OS, V } from './version.js';

const SHIPPED = new Date(...V.date, 11, 11);   // the day this Windows came out
export const CAPACITY = 1_610_612_736;           // a 1.5 GB disk, roomy for 1995
const SYSTEM_BYTES = 412_983_296;

export function confirmDelete() { return store.get('w95.recycle', { confirm: true }).confirm !== false; }

const stamp = t => new Date(t).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const bytes = n => n.toLocaleString('en-US') + ' bytes';
const mb = n => (n / 1048576).toFixed(1) + 'MB';

export function iconOf(n) {
  if (n === recycle) return recycle.children.length ? 'i-trash-full' : 'i-trash';
  if (n.icon) return n.icon;
  return n.children ? 'i-folder' : 'i-txt';
}

export function usedOn(letter) {
  let used = letter === 'C' ? SYSTEM_BYTES : 0;
  walk((n, p) => { if (p.startsWith(letter + ':') && !n.children) used += n.size || 0; });
  return used;
}

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
  return h('div', { class: 'dp-tabs' }, tabs, h('div', { class: 'tabpanel pr-panel' }, ...panels));
}

const sep = () => h('hr', { class: 'pr-sep' });
const rows = pairs => h('dl', { class: 'pr-rows' }, ...pairs.filter(Boolean).flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));

// Win95 drew the drive as a tilted 3D pie: blue for used space, magenta for free.
function pie(used, total) {
  const c = h('canvas', { width: 120, height: 66, class: 'pr-pie', 'aria-hidden': 'true' });
  const g = c.getContext('2d');
  const cx = 60, cy = 26, rx = 56, ry = 22, depth = 12;
  const a = Math.PI * 2 * (used / total);
  for (let d = depth; d >= 0; d--) {
    g.fillStyle = d ? '#800080' : '#ff00ff';
    g.beginPath(); g.ellipse(cx, cy + d, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = d ? '#000080' : '#0000ff';
    g.beginPath(); g.moveTo(cx, cy + d); g.ellipse(cx, cy + d, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + a); g.closePath(); g.fill();
  }
  g.strokeStyle = '#000';
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(cx - rx, cy); g.lineTo(cx - rx, cy + depth); g.ellipse(cx, cy + depth, rx, ry, 0, Math.PI, 0, true); g.lineTo(cx + rx, cy); g.stroke();
  return c;
}

export function properties(node, parent) {
  const isBin = node === recycle;
  const title = (isBin ? 'Recycle Bin' : node.kind === 'drive' ? node.name : node.name) + ' Properties';
  const nameIn = h('input', { class: 'field pr-name', value: node.kind === 'drive' ? (node.name.replace(/\s*\([A-Z]:\)$/, '') || '') : node.name, readonly: !node.user, 'aria-label': 'Name' });
  const head = h('div', { class: 'pr-head' }, icon(iconOf(node)), nameIn);
  const names = ['General'], panels = [];
  let apply = () => true;

  if (isBin) {
    const s = store.get('w95.recycle', { confirm: true, size: 10 });
    const st = folderStats(recycle);
    const size = h('input', { type: 'range', min: 1, max: 100, value: s.size || 10, 'aria-label': 'Maximum size' });
    const pct = h('span', null, (s.size || 10) + '%');
    size.addEventListener('input', () => { pct.textContent = size.value + '%'; });
    const conf = h('input', { type: 'checkbox', checked: s.confirm !== false, id: 'pr-confirm' });
    panels.push(h('div', null,
      h('label', { class: 'pr-check' }, h('input', { type: 'radio', name: 'pr-bin', checked: true }), 'Use one setting for all drives'),
      h('label', { class: 'pr-check' }, h('input', { type: 'checkbox', disabled: true }), 'Do not move files to the Recycle Bin. Remove files immediately on delete.'),
      h('div', { class: 'pr-slider' }, size, pct), h('p', null, 'Maximum size of Recycle Bin (percent of each drive)'),
      h('label', { class: 'pr-check', for: 'pr-confirm' }, conf, 'Display delete confirmation dialog'),
      sep(), rows([['Contains:', `${st.files + st.folders} item(s), ${bytes(st.bytes)}`]])));
    apply = () => { store.set('w95.recycle', { confirm: conf.checked, size: +size.value }); return true; };
  } else if (node.kind === 'drive') {
    const total = node.letter === 'E' ? 52_428_800 : node.letter === 'A' ? 1_457_664 : CAPACITY;
    const used = node.notReady ? 0 : node.letter === 'E' ? 61440 + 40 : usedOn(node.letter);
    panels.push(h('div', null, head, sep(),
      rows([['Type:', kindLabel(node)]]), sep(),
      h('div', { class: 'pr-space' },
        h('i', { class: 'pr-sw used' }), h('span', null, 'Used space:'), h('span', null, bytes(used)), h('span', null, mb(used)),
        h('i', { class: 'pr-sw free' }), h('span', null, 'Free space:'), h('span', null, bytes(total - used)), h('span', null, mb(total - used)),
        h('i'), h('span', null, 'Capacity:'), h('span', null, bytes(total)), h('span', null, mb(total))),
      h('div', { class: 'pr-piebox' }, pie(used, total), h('span', null, 'Drive ' + node.letter))));
    if (node.letter === 'C' || node.letter === 'D') {
      names.push('Tools');
      const tool = (heading, text, btn, fn) => h('fieldset', { class: 'group pr-tool' }, h('legend', null, heading),
        h('p', null, text), h('div', { class: 'btns right' }, h('button', { class: 'btn', type: 'button', onclick: fn }, btn)));
      panels.push(h('div', null,
        tool('Error-checking status', OS + ' was unable to determine when you last checked this drive for errors.', 'Check Now...',
          () => launch('scandisk', node.letter)),
        tool('Backup status', OS + ' was unable to determine when you last backed up files on this drive.', 'Backup Now...',
          () => msgbox({ title: 'Backup', icon: 'info', parent: win, text: 'Backup is not installed.\n\nThe projects are backed up on GitHub, which is much better.' })),
        tool('Defragmentation status', OS + ' was unable to determine when you last defragmented this drive.', 'Defragment Now...',
          () => launch('defrag', node.letter))));
    }
  } else {
    const where = node.from || (pathOf(node) || '').split('\\').slice(0, -1).join('\\').replace(/^([A-Z]:)$/, '$1\\') || (parentOf(node) && parentOf(node).virtual ? parentOf(node).name : 'My Computer');
    const t = node.mtime || SHIPPED;
    const st = node.children ? folderStats(node) : null;
    const attrs = h('div', { class: 'pr-attrs' },
      ...['Read-only', 'Hidden', 'Archive', 'System'].map(a => h('label', { class: 'pr-check' },
        h('input', { type: 'checkbox', disabled: true, checked: a === 'Read-only' ? !node.user : a === 'Archive' ? !node.children : false }), a)));
    panels.push(h('div', null, head, sep(),
      rows([['Type:', kindLabel(node)], ['Location:', where],
        node.kind === 'shortcut' && ['Target:', node.target || (node.ref && node.ref.name) || ''],
        ['Size:', st ? `${mb(st.bytes)} (${bytes(st.bytes)})` : node.size != null ? `${Math.max(1, Math.ceil(node.size / 1024))}KB (${bytes(node.size)})` : '0 bytes'],
        st && ['Contains:', `${st.files} Files, ${st.folders} Folders`]]),
      sep(),
      rows([['MS-DOS name:', dosName(node)], ['Created:', stamp(node.ctime || t)], !node.children && ['Modified:', stamp(t)], ['Accessed:', new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })]]),
      sep(),
      h('div', { class: 'pr-attrrow' }, h('span', null, 'Attributes:'), attrs)));
    if (node.user) apply = () => {
      if (nameIn.value.trim() === node.name) return true;
      try { rename(node, nameIn.value); return true; }
      catch (e) { if (!(e instanceof FsError)) throw e; msgbox({ title: 'Error Renaming File', icon: 'error', parent: win, text: e.message }); return false; }
    };
  }

  const okBtn = h('button', { class: 'btn default', type: 'submit' }, 'OK');
  const form = h('form', { class: 'dlg pr' },
    tabbed(names, panels),
    h('div', { class: 'btns right' }, okBtn,
      h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel'),
      h('button', { class: 'btn', type: 'button', disabled: !node.user && !isBin, onclick: () => apply() }, 'Apply')));
  form.addEventListener('submit', e => { e.preventDefault(); if (apply()) win.close(); });
  form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  const win = createWindow({ title, body: form, dialog: true, resizable: false, width: 'auto', parent, modal: false, taskbar: !parent, help: () => launch('help') });
  okBtn.focus();
  return win;
}

