// The common Open and Save As dialogs. They browse the pretend disk; the
// 3½ Floppy (A:) drive stands for the visitor's real computer, so saving
// there downloads the file and opening from there picks a real one.

import { h, icon, store, download } from './util.js';
import { createWindow } from './wm.js';
import { msgbox } from './dialogs.js';
import { root, resolve, pathOf, parentOf, canWrite, mkdir, checkName, child, writeFile, FsError, docsFolder, desktopFolder } from './fs.js';

const LAST = 'w95.lastdir';

function iconOf(n) {
  if (n.icon) return n.icon;
  return n.children ? 'i-folder' : 'i-txt';
}

// filters: [{ label: 'Text Documents (*.txt)', exts: ['.txt'] }, { label: 'All Files (*.*)', exts: [] }]
// Resolves with { path, node?, folder, name, file? } or null. `file` is a real File picked from A:.
export function fileDialog({ mode = 'open', title, name = '', filters = [{ label: 'All Files (*.*)', exts: [] }], parent, accept }) {
  const saving = mode === 'save';
  return new Promise(res => {
    let done = false;
    const finish = v => { if (done) return; done = true; res(v); win.close(true); };
    let folder = (store.get(LAST, '') && resolve(store.get(LAST, ''))) || docsFolder();
    if (!folder.children || folder.virtual) folder = docsFolder();
    let filter = filters[0];
    let sel = null;

    const where = h('select', { class: 'field fdlg-where', 'aria-label': saving ? 'Save in' : 'Look in' });
    const list = h('div', { class: 'fdlg-list', tabindex: '0', role: 'listbox', 'aria-label': 'Files' });
    const nameIn = h('input', { class: 'field', id: 'fdlg-name', autocomplete: 'off', value: name });
    const typeSel = h('select', { class: 'field', id: 'fdlg-type' }, ...filters.map((f, i) => h('option', { value: i }, f.label)));
    const okBtn = h('button', { class: 'btn default', type: 'submit' }, saving ? 'Save' : 'Open');
    const upBtn = h('button', { class: 'btn fdlg-tool', type: 'button', title: 'Up One Level', 'aria-label': 'Up One Level', onclick: up }, icon('i-up'));
    const newBtn = h('button', { class: 'btn fdlg-tool', type: 'button', title: 'Create New Folder', 'aria-label': 'Create New Folder', onclick: newFolder }, icon('i-newfolder'));
    const picker = h('input', { type: 'file', hidden: true, accept: accept || filters.flatMap(f => f.exts).join(',') || null });
    picker.addEventListener('change', () => {
      const f = picker.files[0];
      if (f) finish({ file: f, name: f.name, path: 'A:\\' + f.name });
    });

    const isFloppy = () => folder.letter === 'A';
    const matches = n => n.children || !filter.exts.length || filter.exts.some(e => n.name.toLowerCase().endsWith(e));

    // The "Save in" list: Desktop, My Computer, the drives, and the folders down to here.
    function fillWhere() {
      const chain = [];
      for (let f = folder; f && f !== root; f = parentOf(f)) chain.unshift(f);
      const opts = [[desktopFolder(), 0, 'Desktop'], [root, 1]];
      for (const d of root.children.filter(c => c.kind === 'drive')) {
        opts.push([d, 2]);
        if (chain[0] === d) chain.slice(1).forEach((f, i) => opts.push([f, 3 + i]));
      }
      where.replaceChildren(...opts.map(([n, depth, label]) => {
        const o = h('option', { selected: n === folder }, '\u00a0\u00a0'.repeat(depth) + (label || n.name));
        o.node = n;
        return o;
      }));
    }

    function render() {
      fillWhere();
      list.replaceChildren();
      sel = null;
      upBtn.disabled = folder === root;
      newBtn.disabled = !canWrite(folder);
      if (isFloppy()) {
        const b = h('button', { class: 'btn fdlg-floppy', type: 'button', onclick: () => saving ? submit() : picker.click() },
          saving ? 'Save to my computer' : 'Choose a file on my computer...');
        list.append(h('div', { class: 'fdlg-note' },
          icon('i-floppy'),
          h('p', null, saving ? 'Files saved to 3½ Floppy (A:) are downloaded to your real computer.' : 'Open a file from your real computer.'),
          b));
        return;
      }
      const kids = (folder.children || []).filter(matches);
      kids.sort((a, b) => (!!b.children - !!a.children) || a.name.localeCompare(b.name));
      for (const n of kids) {
        const it = h('div', { class: 'fdlg-item', role: 'option', tabindex: '-1' }, icon(iconOf(n)), h('span', null, n.name));
        it.node = n;
        it.addEventListener('click', () => choose(it));
        it.addEventListener('dblclick', () => activate(n));
        list.append(it);
      }
    }
    function choose(it) {
      list.querySelectorAll('.fd-item').forEach(x => x.classList.toggle('sel', x === it));
      sel = it && it.node;
      if (sel && !sel.children) nameIn.value = sel.name;
    }
    function activate(n) {
      if (n.children || n.kind === 'drive') { go(n); return; }
      nameIn.value = n.name;
      submit();
    }
    function go(n) {
      if (n.notReady && n.letter !== 'A') return;
      folder = n;
      render();
    }
    function up() { const p = parentOf(folder); if (p) go(p); else if (folder !== root) go(root); }
    function newFolder() {
      try { const n = mkdir(folder); render(); const it = [...list.children].find(x => x.node === n); if (it) choose(it); }
      catch (e) { msgbox({ title: 'Error', icon: 'error', parent: win, text: e.message }); }
    }

    async function submit() {
      let v = nameIn.value.trim();
      if (!v && !saving && sel) v = sel.name;
      if (!v) return;
      // Typing a folder or a path goes there, like the real dialog.
      const typed = /^[a-z]:/i.test(v) ? resolve(v) : child(folder, v);
      if (typed && (typed.children || typed.kind === 'drive') && !(saving && isFloppy())) { nameIn.value = ''; go(typed); return; }
      if (saving) {
        if (!/\.[a-z0-9]+$/i.test(v) && filter.exts[0]) v += filter.exts[0];
        try { checkName(v); } catch (e) { msgbox({ title: title || 'Save As', icon: 'error', parent: win, text: e.message }); return; }
        if (isFloppy()) { finish({ path: 'A:\\' + v, name: v, folder, floppy: true }); return; }
        if (!canWrite(folder)) {
          msgbox({ title: title || 'Save As', icon: 'error', parent: win, text: `${pathOf(folder) || folder.name} is not accessible.\n\nYou can only save files on drive C:, or on the floppy to download them.` });
          return;
        }
        const old = child(folder, v);
        if (old) {
          if (!old.user) { msgbox({ title: title || 'Save As', icon: 'error', parent: win, text: `${v}\nThis file is read-only.\nUse a different filename.` }); return; }
          const b = await msgbox({ title: title || 'Save As', icon: 'warn', parent: win, buttons: ['&Yes', '&No'], text: `${pathOf(old)} already exists.\nDo you want to replace it?` });
          if (b !== 'Yes') return;
        }
        store.set(LAST, pathOf(folder));
        finish({ path: pathOf(folder).replace(/\\$/, '') + '\\' + v, name: v, folder, node: old });
      } else {
        if (isFloppy()) { picker.click(); return; }
        const n = child(folder, v);
        if (!n) { msgbox({ title: title || 'Open', icon: 'warn', parent: win, text: `${v}\nFile not found.\nPlease verify the correct filename was given.` }); return; }
        store.set(LAST, pathOf(folder));
        finish({ path: pathOf(n), name: n.name, folder, node: n });
      }
    }

    where.addEventListener('change', () => go(where.selectedOptions[0].node));
    typeSel.addEventListener('change', () => { filter = filters[+typeSel.value]; render(); });
    list.addEventListener('keydown', e => {
      const items = [...list.querySelectorAll('.fd-item')];
      const i = items.findIndex(x => x.node === sel);
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); const it = items[Math.min(items.length - 1, i + 1)]; if (it) { choose(it); it.scrollIntoView({ block: 'nearest' }); } }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); const it = items[Math.max(0, i - 1)]; if (it) { choose(it); it.scrollIntoView({ block: 'nearest' }); } }
      else if (e.key === 'Enter' && sel) { e.preventDefault(); activate(sel); }
      else if (e.key === 'Backspace') { e.preventDefault(); up(); }
    });

    const form = h('form', { class: 'dlg fdlg' },
      h('div', { class: 'fdlg-top' }, h('label', { for: 'fdlg-where-' + mode }, saving ? 'Save in:' : 'Look in:'), where, upBtn, newBtn),
      list,
      h('div', { class: 'fdlg-grid' },
        h('label', { for: 'fdlg-name', html: 'File <u>n</u>ame:' }), nameIn, okBtn,
        h('label', { for: 'fdlg-type', html: saving ? 'Save as <u>t</u>ype:' : 'Files of <u>t</u>ype:' }), typeSel,
        h('button', { class: 'btn', type: 'button', onclick: () => finish(null) }, 'Cancel')),
      picker);
    where.id = 'fdlg-where-' + mode;
    form.addEventListener('submit', e => { e.preventDefault(); submit(); });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); finish(null); } });
    const win = createWindow({
      title: title || (saving ? 'Save As' : 'Open'), body: form, dialog: true, resizable: false, width: 'auto', parent, taskbar: !parent,
      help: () => msgbox({ title: 'Help', icon: 'info', parent: win, text: 'Choose a folder, type a filename and click ' + (saving ? 'Save' : 'Open') + '.\n\nThe 3½ Floppy (A:) drive is your real computer.' }),
      onClose: () => { if (!done) { done = true; res(null); } },
    });
    render();
    nameIn.focus();
    nameIn.select();
  });
}

export const saveAs = o => fileDialog({ ...o, mode: 'save' });
export const openFile = o => fileDialog({ ...o, mode: 'open' });

// Saves through a dialog result: to the pretend disk, or as a download for A:.
// blob() is only called for the floppy. Returns the node written, or null.
export function saveTo(result, props, blob, parent) {
  if (result.floppy) { download(result.name, blob()); return null; }
  try {
    return writeFile(result.path, props);
  } catch (e) {
    if (e instanceof FsError) msgbox({ title: 'Error', icon: 'error', parent, text: e.message });
    else throw e;
    return null;
  }
}
