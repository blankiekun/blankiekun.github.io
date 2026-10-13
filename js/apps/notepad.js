// Notepad.

import { h, download } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, inputbox, about } from '../dialogs.js';
import { walk } from '../fs.js';

function open(arg) {
  let name = arg && arg.name ? arg.name : 'Untitled';
  let saved = arg && arg.text != null ? arg.text : '';
  let wrap = true;
  let lastFind = '';

  const ta = h('textarea', { class: 'np-text', spellcheck: false, 'aria-label': 'Text', id: 'np-' + Math.random().toString(36).slice(2, 7) });
  ta.value = saved;
  const dirty = () => ta.value !== saved;
  const title = () => `${name} - Notepad`;

  async function confirmSave() {
    if (!dirty()) return true;
    const b = await msgbox({ title: 'Notepad', icon: 'warn', parent: win, buttons: ['&Yes', '&No', 'Cancel'],
      text: `The text in the ${name} file has changed.\n\nDo you want to save the changes?` });
    if (b === 'Yes') { save(); return true; }
    return b === 'No';
  }
  function save() {
    const file = /\.[a-z0-9]+$/i.test(name) ? name : name + '.txt';
    download(file === 'Untitled.txt' ? 'Untitled.txt' : file, new Blob([ta.value.replace(/\n/g, '\r\n')], { type: 'text/plain' }));
    saved = ta.value;
  }
  function load(n, t) { name = n; saved = t; ta.value = t; win.setTitle(title()); ta.setSelectionRange(0, 0); ta.scrollTop = 0; }
  async function openDialog() {
    if (!(await confirmSave())) return;
    const files = [];
    walk((node, p) => { if (node.kind === 'file') files.push({ node, p }); });
    let pick = files[0];
    const lb = h('div', { class: 'listbox', tabindex: '0', style: { height: '140px', width: 'min(320px, calc(100vw - 60px))' } },
      ...files.map(f => {
        const o = h('div', { class: 'opt' + (f === pick ? ' sel' : '') }, f.p);
        o.addEventListener('click', () => { pick = f; lb.querySelectorAll('.opt').forEach(x => x.classList.toggle('sel', x === o)); });
        o.addEventListener('dblclick', () => { pick = f; ok(); });
        return o;
      }));
    const ok = () => { d.close(true); load(pick.node.name, pick.node.text); };
    const form = h('div', { class: 'dlg' }, h('div', null, 'File ', h('u', null, 'n'), 'ame:'), lb,
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'button', onclick: ok }, 'Open'), h('button', { class: 'btn', type: 'button', onclick: () => d.close(true) }, 'Cancel')));
    const d = createWindow({ title: 'Open', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    lb.focus();
  }
  function findNext() {
    if (!lastFind) return findDialog();
    const from = ta.selectionEnd;
    const hay = ta.value.toLowerCase(), needle = lastFind.toLowerCase();
    let i = hay.indexOf(needle, from);
    if (i < 0) i = hay.indexOf(needle);
    if (i < 0) { msgbox({ title: 'Notepad', icon: 'info', parent: win, text: `Cannot find "${lastFind}"` }); return; }
    ta.focus();
    ta.setSelectionRange(i, i + lastFind.length);
  }
  async function findDialog() {
    const v = await inputbox({ title: 'Find', label: 'Fi&nd what:'.replace('&', ''), value: lastFind, parent: win, ok: 'Find Next' });
    if (v) { lastFind = v; findNext(); }
  }
  function insert(text) {
    ta.focus();
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
  }

  const bar = menubar([
    { label: '&File', items: () => [
      { label: '&New', action: async () => { if (await confirmSave()) load('Untitled', ''); } },
      { label: '&Open...', action: openDialog },
      { label: '&Save', action: save },
      { label: 'Save &As...', action: async () => { const v = await inputbox({ title: 'Save As', label: 'File name:', value: name, parent: win, ok: 'Save' }); if (v) { name = v; win.setTitle(title()); save(); } } },
      '-',
      { label: '&Print', action: () => { const w = window.open('', '_blank'); if (w) { w.document.write('<pre>' + ta.value.replace(/</g, '&lt;') + '</pre>'); w.print(); } } },
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Edit', items: () => [
      { label: '&Undo', key: 'Ctrl+Z', action: () => { ta.focus(); document.execCommand('undo'); } },
      '-',
      { label: 'Cu&t', key: 'Ctrl+X', action: () => { ta.focus(); document.execCommand('cut'); } },
      { label: '&Copy', key: 'Ctrl+C', action: () => { ta.focus(); document.execCommand('copy'); } },
      { label: '&Paste', key: 'Ctrl+V', action: async () => { try { insert(await navigator.clipboard.readText()); } catch { ta.focus(); } } },
      { label: 'De&lete', key: 'Del', action: () => insert('') },
      '-',
      { label: 'Select &All', action: () => { ta.focus(); ta.select(); } },
      { label: 'Time/&Date', key: 'F5', action: () => insert(new Date().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', month: 'numeric', day: 'numeric', year: 'numeric' }).replace(',', '')) },
      '-',
      { label: '&Word Wrap', checked: wrap, action: () => { wrap = !wrap; ta.classList.toggle('nowrap', !wrap); } },
    ] },
    { label: '&Search', items: () => [
      { label: '&Find...', action: findDialog },
      { label: 'Find &Next', key: 'F3', action: findNext },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') }, '-',
      { label: '&About Notepad', action: () => about('Notepad', 'i-notepad', win) },
    ] },
  ]);

  ta.addEventListener('keydown', e => {
    if (e.key === 'F5') { e.preventDefault(); insert(new Date().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', month: 'numeric', day: 'numeric', year: 'numeric' }).replace(',', '')); }
    if (e.key === 'F3') { e.preventDefault(); findNext(); }
  });

  const win = createWindow({
    app: 'notepad', title: title(), icon: 'i-notepad', body: h('div', { class: 'np' }, bar, ta),
    width: 560, height: 420, minW: 200, minH: 120,
    route: 'notepad', autofocus: 'textarea', onClose: confirmSave,
  });
  ta.focus();
  ta.setSelectionRange(0, 0);
  return win;
}

export default { id: 'notepad', title: 'Notepad', icon: 'i-notepad', open };
