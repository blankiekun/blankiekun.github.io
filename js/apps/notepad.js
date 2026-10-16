// Notepad.

import { h, esc } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, inputbox, about } from '../dialogs.js';
import { saveAs, openFile, saveTo } from '../filedlg.js';
import { sendEnabled, sendButton, sendDialog, tipLater } from '../send.js';
import { formatTime, formatDate } from './control.js';

const stamp = () => formatTime() + ' ' + formatDate();

function open(arg) {
  let name = arg && arg.name ? arg.name : 'Untitled';
  let path = arg && arg.path || null;   // set once it's saved on the pretend disk
  let saved = arg && arg.text != null ? arg.text : '';
  // Only notes the visitor writes get a Send button, not README.TXT and the other files on disk.
  let own = !(arg && arg.text) || !!(arg && arg.path);
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
    if (b === 'Yes') return save();
    return b === 'No';
  }
  const TXT = [{ label: 'Text Documents (*.txt)', exts: ['.txt'] }, { label: 'All Files (*.*)', exts: [] }];
  async function save(as) {
    if (!path || as) {
      const r = await saveAs({ name: /\.[a-z0-9]+$/i.test(name) ? name : name + '.txt', filters: TXT, parent: win });
      if (!r) return false;
      const n = saveTo(r, { text: ta.value }, () => new Blob([ta.value.replace(/\n/g, '\r\n')], { type: 'text/plain' }), win);
      if (!n && !r.floppy) return false;
      name = r.name; path = n ? r.path : null;
    } else if (!saveTo({ path }, { text: ta.value }, null, win)) return false;
    saved = ta.value;
    win.setTitle(title());
    return true;
  }
  function load(n, t, p) { name = n; path = p || null; saved = t; ta.value = t; own = t === '' || !!p; syncSend(); win.setTitle(title()); ta.setSelectionRange(0, 0); ta.scrollTop = 0; logStamp(); }
  // A file whose first line is .LOG gets the time and date added each time it's opened.
  function logStamp() {
    if (!/^\.LOG(\n|$)/.test(ta.value)) return;
    ta.value += '\n' + stamp() + '\n';
    ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.scrollTop = ta.scrollHeight;
  }
  async function openDialog() {
    if (!(await confirmSave())) return;
    const r = await openFile({ filters: TXT, parent: win, accept: '.txt,text/plain' });
    if (!r) return;
    if (r.file) load(r.file.name, (await r.file.text()).replace(/\r\n/g, '\n'));
    else if (r.node.text != null) load(r.node.name, r.node.text, r.node.user ? r.path : null);
    else msgbox({ title: 'Notepad', icon: 'error', parent: win, text: `${r.name}\nThis is not a text file.` });
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

  function sendNote() {
    const t = ta.value;
    if (!t.trim()) { msgbox({ title: 'Notepad', icon: 'info', parent: win, text: 'There is nothing to send yet. Type a note first!' }); return; }
    if (t.length > 2000) { msgbox({ title: 'Notepad', icon: 'warn', parent: win, text: `Notes can be up to 2,000 characters. This one has ${t.length.toLocaleString('en-US')}.` }); return; }
    sendDialog({ kind: 'note', parent: win, text: t });
  }

  const bar = menubar([
    { label: '&File', items: () => [
      { label: '&New', action: async () => { if (await confirmSave()) load('Untitled', ''); } },
      { label: '&Open...', action: openDialog },
      { label: '&Save', key: 'Ctrl+S', action: () => save() },
      ...(sendEnabled() && own ? [{ label: 'S&end to blankiekun...', icon: 'i-mail', action: sendNote }] : []),
      { label: 'Save &As...', action: () => save(true) },
      '-',
      { label: '&Print', action: () => import('./printers.js').then(m => m.printJob(name, '<pre style="white-space:pre-wrap;font:10pt monospace">' + esc(ta.value) + '</pre>')) },
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
      { label: 'Time/&Date', key: 'F5', action: () => insert(stamp()) },
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
    if (e.key === 'F5') { e.preventDefault(); insert(stamp()); }
    if (e.key === 'F3') { e.preventDefault(); findNext(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  });

  const root = h('div', { class: 'np' }, bar, ta);
  let sendBtn = null, foot = null;
  if (sendEnabled()) {
    sendBtn = sendButton('Send to blankiekun...', sendNote);
    foot = h('div', { class: 'np-foot' }, h('span', null, 'Wrote something? Send it to blankiekun.'), sendBtn);
    root.append(foot);
  }
  function syncSend() { if (foot) foot.hidden = !own; }
  syncSend();

  const win = createWindow({
    app: 'notepad', title: title(), icon: 'i-notepad', body: root,
    width: 560, height: 420, minW: 200, minH: 120,
    route: 'notepad', autofocus: 'textarea', onClose: confirmSave,
  });
  if (sendBtn) tipLater(sendBtn, root, 'notepad', 'Send your note to blankiekun with this button.', () => own && dirty() && ta.value.trim().length > 15);
  ta.focus();
  ta.setSelectionRange(0, 0);
  logStamp();
  return win;
}

export default { id: 'notepad', title: 'Notepad', icon: 'i-notepad', open };
