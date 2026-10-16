// What Explorer and the desktop share for moving files around: the clipboard,
// deleting with the confirmation box, pasting, dragging and Send To.

import { h, icon, download } from './util.js';
import { msgbox } from './dialogs.js';
import { recycle, parentOf, remove, copy, move, canWrite, rename, restore, shortcut, desktopFolder, FsError } from './fs.js';
import { confirmDelete } from './props.js';

export const clip = { nodes: [], cut: false };

// Edit > Undo: the last delete, move, copy, rename or new shortcut can be taken back.
let last = null;
export const undoLabel = () => last && last.label;
export async function undo(parent) {
  const u = last;
  last = null;
  if (!u) return;
  try { u.run(); } catch (e) { await fail(e, parent, 'Undo'); }
  marks();
}
// Copies and new shortcuts are undone by deleting them for good.
function gone(n) { remove(n); if (parentOf(n) === recycle) remove(n); }

function fail(e, parent, title = 'Error') {
  if (!(e instanceof FsError)) throw e;
  return msgbox({ title, icon: 'error', parent, text: e.message });
}

export function cut(nodes) { clip.nodes = nodes.slice(); clip.cut = true; marks(); }
export function copyNodes(nodes) { clip.nodes = nodes.slice(); clip.cut = false; marks(); }
export const canPaste = folder => clip.nodes.length > 0 && canWrite(folder);

// Cut items look dimmed until they're pasted, as in Explorer.
const markers = new Set();
export function onClip(fn) { markers.add(fn); return () => markers.delete(fn); }
function marks() { for (const fn of markers) fn(); }
export const isCut = n => clip.cut && clip.nodes.includes(n);

export async function paste(folder, parent) {
  if (!canPaste(folder)) return;
  const moved = [], made = [];
  try {
    for (const n of clip.nodes) {
      if (clip.cut) { moved.push([n, parentOf(n)]); move(n, folder); } else made.push(copy(n, folder));
    }
  } catch (e) { await fail(e, parent, clip.cut ? 'Error Moving File' : 'Error Copying File'); }
  remember(moved, made);
  if (clip.cut) { clip.nodes = []; clip.cut = false; }
  marks();
}

// Shift+Delete skips the Recycle Bin, as in Windows 95.
export async function del(nodes, parent, shift) {
  if (!nodes.length) return;
  const forGood = shift || parentOf(nodes[0]) === recycle;
  const locked = nodes.find(n => !n.user && parentOf(n) !== recycle);
  if (locked) {
    return msgbox({ title: 'Error Deleting File', icon: 'error', parent,
      text: `Cannot delete ${locked.name}: Access is denied.\n\nIt's one of the files that came with blankiekun 95, so it can't be deleted.` });
  }
  if (confirmDelete() || forGood) {
    const one = nodes.length === 1, n = nodes[0];
    const title = one ? (n.children ? 'Confirm Folder Delete' : 'Confirm File Delete') : 'Confirm Multiple File Delete';
    const text = forGood
      ? (one ? `Are you sure you want to delete '${n.name}'?` : `Are you sure you want to delete these ${nodes.length} items?`)
      : one
        ? (n.children ? `Are you sure you want to remove the folder '${n.name}' and move all its contents to the Recycle Bin?` : `Are you sure you want to send '${n.name}' to the Recycle Bin?`)
        : `Are you sure you want to send these ${nodes.length} items to the Recycle Bin?`;
    const b = await msgbox({ title, icon: forGood ? 'i-warn' : 'i-trash-full', parent, buttons: ['&Yes', '&No'], text });
    if (b !== 'Yes') return;
  }
  const done = [];
  try { for (const n of nodes) { if (shift) gone(n); else remove(n); done.push(n); } } catch (e) { await fail(e, parent, 'Error Deleting File'); }
  if (!forGood && done.length) last = { label: 'Undo Delete', run: () => done.forEach(n => parentOf(n) === recycle && restore(n)) };
  if (nodes.some(n => clip.nodes.includes(n))) { clip.nodes = clip.nodes.filter(n => !nodes.includes(n)); marks(); }
}

// Dropping: onto the Recycle Bin deletes, elsewhere it moves the visitor's own
// files and copies the read-only ones. Holding Ctrl always copies.
export async function drop(nodes, folder, copying, parent) {
  if (folder === recycle) return del(nodes, parent);
  if (!nodes.length || nodes.includes(folder)) return;
  const moved = [], made = [];
  try {
    for (const n of nodes) {
      if (parentOf(n) === folder && !copying) continue;
      if (n.user && !copying) { moved.push([n, parentOf(n)]); move(n, folder); } else made.push(copy(n, folder));
    }
  } catch (e) { await fail(e, parent, 'Error Moving File'); }
  remember(moved, made);
}

function remember(moved, made) {
  if (moved.length) last = { label: 'Undo Move', run: () => moved.forEach(([n, from]) => move(n, from)) };
  else if (made.length) last = { label: 'Undo Copy', run: () => made.forEach(gone) };
}

export async function renameNode(n, name, parent) {
  const old = n.name;
  try { rename(n, name); last = { label: 'Undo Rename', run: () => rename(n, old) }; }
  catch (e) { await fail(e, parent, 'Error Renaming File'); }
}

// Create Shortcut: next to the item, or on the desktop when that folder is read-only.
export async function makeShortcut(n, folder, parent) {
  let into = folder;
  if (!canWrite(into)) {
    const b = await msgbox({ title: 'Shortcut', icon: 'question', parent, buttons: ['&Yes', '&No'],
      text: 'blankiekun 95 cannot create a shortcut here.\n\nDo you want the shortcut to be placed on the desktop instead?' });
    if (b !== 'Yes') return null;
    into = desktopFolder();
  }
  try {
    const sc = shortcut(n, into);
    last = { label: 'Undo Create Shortcut', run: () => gone(sc) };
    return sc;
  } catch (e) { await fail(e, parent, 'Shortcut'); return null; }
}

// Send To > 3½ Floppy (A:) downloads the file to the visitor's real computer.
export function toFloppy(nodes, parent) {
  const files = nodes.filter(n => n.text != null || n.data);
  if (!files.length) {
    return msgbox({ title: 'Copying...', icon: 'error', parent, text: `Cannot copy ${nodes[0].name}: Only files can be copied to the floppy disk.` });
  }
  for (const n of files) {
    if (n.data) fetch(n.data).then(r => r.blob()).then(b => download(n.name.replace(/\.bmp$/i, '.png'), b));
    else download(n.name, new Blob([n.text.replace(/\r?\n/g, '\r\n')], { type: 'text/plain' }));
  }
}

// ---------- dragging ----------

// Anything that accepts a drop sets el.dropFolder = () => folder node (or null).
function targetAt(x, y, nodes) {
  for (let el = document.elementFromPoint(x, y); el; el = el.parentElement) {
    if (el.dropFolder) {
      const f = el.dropFolder();
      if (f && !nodes.includes(f) && (f === recycle || canWrite(f))) return { el, folder: f };
      if (f) return null;
    }
  }
  return null;
}

// Starts tracking a possible drag from a pointerdown. Calls onTap() if it was only a click.
export function startDrag(e, nodes, iconId, parent, onTap) {
  if (e.button !== 0) return;
  const sx = e.clientX, sy = e.clientY;
  const touch = e.pointerType !== 'mouse';
  const src = e.currentTarget;
  let ghost = null, over = null;
  try { src.setPointerCapture(e.pointerId); } catch {}
  const move = ev => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < (touch ? 12 : 5)) return;
      ghost = h('div', { class: 'drag-ghost' }, icon(iconId), nodes.length > 1 ? h('b', null, nodes.length) : null);
      document.body.append(ghost);
      document.body.classList.add('dragging-files');
    }
    ghost.style.left = ev.clientX - 16 + 'px';
    ghost.style.top = ev.clientY - 16 + 'px';
    const t = targetAt(ev.clientX, ev.clientY, nodes);
    if (over && (!t || t.el !== over)) over.classList.remove('drop-hot');
    over = t && t.el;
    if (over) over.classList.add('drop-hot');
    ghost.classList.toggle('no', !t);
    ghost.classList.toggle('copy', !!t && (ev.ctrlKey || nodes.some(n => !n.user)) && t.folder !== recycle);
  };
  const up = ev => {
    src.removeEventListener('pointermove', move);
    src.removeEventListener('pointerup', up);
    src.removeEventListener('pointercancel', up);
    if (over) over.classList.remove('drop-hot');
    if (!ghost) { if (ev.type === 'pointerup' && onTap) onTap(); return; }
    ghost.remove();
    document.body.classList.remove('dragging-files');
    if (ev.type !== 'pointerup') return;
    const t = targetAt(ev.clientX, ev.clientY, nodes);
    if (t) drop(nodes, t.folder, ev.ctrlKey, parent);
  };
  src.addEventListener('pointermove', move);
  src.addEventListener('pointerup', up);
  src.addEventListener('pointercancel', up);
}
