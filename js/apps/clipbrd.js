// Clipboard Viewer. Shows the files that Cut and Copy put on the shell's clipboard,
// and, when asked from the Display menu, the text or picture on the visitor's real one.

import { h, icon } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import { saveAs, saveTo } from '../filedlg.js';
import { clip, onClip, copyNodes } from '../fileops.js';
import { parentOf, pathOf } from '../fs.js';

const DENIED = 'Clipboard Viewer is not allowed to look at your computer\'s clipboard.\n\nAllow this site to see text and images you copy, and then choose Refresh from the Display menu.';
const UNSUPPORTED = 'This browser doesn\'t let web pages look at your computer\'s clipboard.\n\nFiles you cut or copy in My Computer and Explorer still show up here.';
const NOFORMAT = 'Clipboard Viewer cannot display the information you have copied.\n\nTo see the information, try pasting it into a document.';

function open() {
  let mode = 'auto';      // 'auto' is the shell's clipboard; 'text' and 'picture' are the real one
  let text = null;        // text last read from the real clipboard
  let pic = null;         // object URL of the picture last read from it
  let note = null;        // why the real clipboard couldn't be shown
  let busy = 0;

  const view = h('div', { class: 'cb-view', tabindex: '0', role: 'region', 'aria-label': 'Clipboard contents', 'aria-live': 'polite' });

  const button = (label, fn) => h('button', { type: 'button', class: 'btn', onclick: fn }, label);
  const message = (msg, buttons) => h('div', { class: 'cb-note' }, h('p', null, msg), buttons ? h('div', { class: 'btns' }, buttons) : null);
  const realButtons = () => [button('Show Text', () => read('text')), button('Show Picture', () => read('picture'))];

  function render() {
    if (mode === 'auto') {
      if (!clip.nodes.length) {
        view.replaceChildren(message('The Clipboard is empty.\n\nCut or copy files in My Computer or Explorer to see them here, or look at what\'s on your computer\'s clipboard:', realButtons()));
        return;
      }
      const n = clip.nodes.length;
      view.replaceChildren(
        h('p', { class: 'cb-head' }, `${n} ${n === 1 ? 'item' : 'items'} ${clip.cut ? 'cut' : 'copied'}. Paste ${n === 1 ? 'it' : 'them'} into a folder with Edit > Paste.`),
        h('ul', { class: 'cb-files' }, clip.nodes.map(node => {
          const folder = parentOf(node);
          return h('li', { class: clip.cut ? 'cut' : null },
            icon(node.icon || (node.children ? 'i-folder' : 'i-txt')),
            h('span', { class: 'nm' }, node.name + (clip.cut ? ' (cut)' : '')),
            h('span', { class: 'at' }, folder ? pathOf(folder) || folder.name : ''));
        })));
      return;
    }
    if (note) view.replaceChildren(message(note, [button('Refresh', () => read(mode))]));
    else if (mode === 'text') view.replaceChildren(h('pre', { class: 'cb-text' }, text));
    else view.replaceChildren(h('img', { class: 'cb-pic', src: pic, alt: 'The picture on the Clipboard' }));
  }

  function forget() {
    text = null;
    note = null;
    if (pic) { URL.revokeObjectURL(pic); pic = null; }
  }

  // Browsers only hand over the clipboard during a click or key press, so this is
  // only ever called from one.
  async function read(want) {
    mode = want;
    view.focus({ preventScroll: true });
    forget();
    const my = ++busy;
    const cb = navigator.clipboard;
    let t = null, p = null, n = null;
    try {
      if (want === 'text') {
        if (!cb || !cb.readText) throw Object.assign(new Error(), { name: 'Unsupported' });
        t = await cb.readText();
        if (!t) n = 'There is no text on the Clipboard.';
      } else {
        if (!cb || !cb.read) throw Object.assign(new Error(), { name: 'Unsupported' });
        const items = await cb.read();
        for (const it of items) {
          const type = it.types.find(x => x.startsWith('image/'));
          if (type) { p = URL.createObjectURL(await it.getType(type)); break; }
        }
        if (!p) n = items.length ? NOFORMAT : 'There is no picture on the Clipboard.';
      }
    } catch (e) {
      n = e.name === 'Unsupported' ? UNSUPPORTED
        : e.name === 'NotAllowedError' || e.name === 'SecurityError' ? DENIED
          : e.name === 'DataError' ? NOFORMAT : DENIED;
    }
    if (my !== busy || !win.el.isConnected) { if (p) URL.revokeObjectURL(p); return; }
    text = t || null; pic = p; note = n;
    render();
  }

  async function save() {
    if (mode !== 'text' || !text) return;
    const r = await saveAs({ title: 'Save As', name: 'CLIPBRD.TXT', parent: win,
      filters: [{ label: 'Text Documents (*.txt)', exts: ['.txt'] }, { label: 'All Files (*.*)', exts: [] }] });
    if (!r) return;
    const t = text;
    saveTo(r, { text: t }, () => new Blob([t.replace(/\r?\n/g, '\r\n')], { type: 'text/plain' }), win);
  }

  const empty = () => !clip.nodes.length && text == null && pic == null;
  async function clear() {
    if (empty()) return;
    const b = await msgbox({ title: 'Clear Clipboard', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: 'Clear the contents of the Clipboard?' });
    if (b !== 'Yes' || !win.el.isConnected) return;
    forget();
    clip.nodes = [];
    copyNodes([]);   // tells Explorer and the desktop, and so us
    mode = 'auto';
    render();
    view.focus({ preventScroll: true });
  }

  const menu = menubar([
    { label: '&File', items: () => [
      { label: 'Save &As...', disabled: mode !== 'text' || !text, action: save },
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Edit', items: () => [
      { label: '&Delete', key: 'Del', disabled: empty(), action: clear },
    ] },
    { label: '&Display', items: () => [
      { label: '&Auto', radio: true, checked: mode === 'auto', action: () => { mode = 'auto'; render(); view.focus(); } },
      { label: '&Text', radio: true, checked: mode === 'text', action: () => read('text') },
      { label: '&Picture', radio: true, checked: mode === 'picture', action: () => read('picture') },
      '-',
      { label: '&Refresh', key: 'F5', action: () => (mode === 'auto' ? render() : read(mode)) },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') },
      '-',
      { label: '&About Clipboard Viewer', action: () => about('Clipboard Viewer', 'i-clipbrd', win) },
    ] },
  ]);

  const root = h('div', { class: 'cb' }, menu, view);
  root.addEventListener('keydown', e => {
    const letter = e.code && e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : '';
    if (e.altKey && !e.ctrlKey && !e.metaKey && letter && menu.openByKey(letter)) { e.preventDefault(); return; }
    if (e.key === 'F5') { e.preventDefault(); if (mode === 'auto') render(); else read(mode); }
    else if (e.key === 'Delete' && !e.target.closest('input, textarea')) { e.preventDefault(); clear(); }
    else if ((e.ctrlKey || e.metaKey) && letter === 's' && !e.altKey) { e.preventDefault(); save(); }
  });

  // Cutting or copying something new puts it on the clipboard in place of what we showed.
  const off = onClip(() => { if (mode !== 'auto') forget(); mode = 'auto'; render(); });

  const win = createWindow({
    app: 'clipbrd', title: 'Clipboard Viewer', icon: 'i-clipbrd', body: root,
    width: 420, height: 300, minW: 220, minH: 140, route: 'clipbrd', autofocus: '.cb-view',
    onClosed: () => { off(); busy++; forget(); },
  });
  render();
  return win;
}

export default { id: 'clipbrd', title: 'Clipboard Viewer', icon: 'i-clipbrd', single: true, open };
