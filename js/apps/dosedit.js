// The full-screen blue MS-DOS Editor that EDIT opens inside the DOS window, and QBasic, its twin.

import { h } from '../util.js';
import { resolve, writeFile, FsError } from '../fs.js';
import { V } from '../version.js';

// QBasic's sample program; Run > Start "runs" its PRINT lines.
const HELLO = `' HELLO.BAS\nCLS\nPRINT "Hello from blankiekun!"\nPRINT "QBasic says hi."\nEND\n`;

// abs turns a typed name into a full path; done runs once Exit has put the prompt back.
export function editor({ host, abs, path = null, text = '', qbasic = false, done }) {
  const prog = qbasic ? 'MS-DOS QBasic' : 'MS-DOS Editor';
  if (qbasic && !path) text = HELLO;
  let saved = text, last = '', openMenu = null, sel = 0;

  const ta = h('textarea', { class: 'de-text', spellcheck: false, autocapitalize: 'off', autocomplete: 'off', wrap: 'off', 'aria-label': prog });
  const name = h('span');
  const pos = h('span');
  const bar = h('div', { class: 'de-menu', role: 'menubar' });
  const root = h('div', { class: 'de' }, bar, h('div', { class: 'de-frame' }, name), ta,
    h('div', { class: 'de-status' }, h('span', null, prog + '  F1=Help'), h('span', null, '│ ', pos)));

  // shortcut: View and Options are drawn greyed out with nothing behind them, until someone wants split windows or colours.
  const items = {
    File: [['&New', fileNew], ['&Open...', fileOpen], ['&Save', () => save()], ['Save &As...', () => save(true)], ['E&xit', exit]],
    Edit: [['Cu&t', () => clip(true)], ['&Copy', () => clip()], ['&Paste', paste], ['Cl&ear', () => { ta.setRangeText(''); status(); }]],
    Search: [['&Find...', () => find()], ['&Repeat Last Find', () => find(last || null)]],
    View: [['&Split', null], ['&Output Screen', qbasic ? run : null]],
    Run: [['&Start', run]],
    Debug: [['&Step', null]],
    Options: [['&Display...', null], ['Help &Path...', null]],
    Help: [['&About...', about]],
  };
  const order = qbasic ? ['File', 'Edit', 'View', 'Search', 'Run', 'Debug', 'Options', 'Help'] : ['File', 'Edit', 'Search', 'View', 'Options', 'Help'];
  // '&Save' -> the letter after & is the hotkey, drawn in white.
  const label = s => { const i = s.indexOf('&'); return [s.slice(0, i), h('u', null, s[i + 1]), s.slice(i + 2)]; };
  const key = s => s[s.indexOf('&') + 1].toLowerCase();
  for (const m of order) bar.append(h('span', { class: 'de-m', role: 'menuitem', 'data-m': m, onclick: () => show(openMenu === m ? null : m) }, label('&' + m)));

  function show(m) {
    bar.querySelector('.de-drop')?.remove();
    bar.querySelector('.de-m.on')?.classList.remove('on');
    openMenu = m;
    if (!m) { ta.focus(); return; }
    const btn = bar.querySelector(`[data-m="${m}"]`);
    btn.classList.add('on');
    btn.append(h('div', { class: 'de-drop', role: 'menu' }, ...items[m].map(([l, fn], i) =>
      h('div', { class: 'de-item' + (fn ? '' : ' off') + (i === sel ? ' sel' : ''), role: 'menuitem', onclick: e => { e.stopPropagation(); choose(i); } }, label(l)))));
  }
  function choose(i) {
    const fn = items[openMenu][i][1];
    if (!fn) return;
    sel = 0; show(null); fn();
  }

  // A grey box over the text: a message, maybe a field, and buttons. Resolves to the button
  // pressed, or for a field to its text (null on Cancel or Esc).
  function dialog(msg, { field, buttons = ['OK'] } = {}) {
    return new Promise(res => {
      const input = field != null && h('input', { class: 'de-field', value: field, spellcheck: false, autocapitalize: 'off', 'aria-label': msg });
      const end = b => { box.remove(); ta.focus(); res(input ? (b === 'OK' ? input.value.trim() : null) : b); };
      const box = h('div', { class: 'de-dlg', role: 'dialog', 'aria-label': prog }, h('div', null, msg), input,
        h('div', { class: 'de-btns' }, ...buttons.map(b => h('button', { type: 'button', onclick: () => end(b) }, `< ${b} >`))));
      box.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); end('Cancel'); }
        else if (e.key === 'Enter' && e.target === input) { e.preventDefault(); end('OK'); }
      });
      root.append(box);
      (input || box.querySelector('button')).focus();
      if (input) input.select();
    });
  }

  function load(p, t) {
    path = p; saved = t; ta.value = t;
    name.textContent = p ? p.slice(p.lastIndexOf('\\') + 1).toUpperCase() : 'UNTITLED';
    ta.setSelectionRange(0, 0); ta.scrollTop = 0; status();
  }
  function status() {
    const ln = ta.value.slice(0, ta.selectionStart).split('\n');
    pos.textContent = `Line:${ln.length} Col:${ln.at(-1).length + 1}`;
  }
  // Before New, Open or Exit throws the text away.
  async function keep() {
    if (ta.value === saved) return true;
    const b = await dialog('Loaded file is not saved. Save it now?', { buttons: ['Yes', 'No', 'Cancel'] });
    return b === 'No' || (b === 'Yes' && await save());
  }
  async function fileNew() { if (await keep()) load(null, ''); }
  async function fileOpen() {
    if (!await keep()) return;
    const n = await dialog('File Name:', { field: '', buttons: ['OK', 'Cancel'] });
    if (!n) return;
    const node = resolve(abs(n));
    // Like EDIT NEWFILE.TXT: a name that isn't there yet opens empty and is made on Save.
    if (!node) load(abs(n), '');
    else if (node.children || node.text == null) await dialog('File not found.');
    else load(abs(n), node.text);
  }
  async function save(as) {
    let p = path;
    if (as || !p) {
      const n = await dialog('File Name:', { field: p ? p.slice(p.lastIndexOf('\\') + 1) : '', buttons: ['OK', 'Cancel'] });
      if (!n) return false;
      p = abs(n);
    }
    try { writeFile(p, { text: ta.value }); } catch (e) {
      if (!(e instanceof FsError)) throw e;
      await dialog(e.message.split('\n')[0]);
      return false;
    }
    load(p, ta.value);
    return true;
  }
  async function exit() { if (await keep()) { root.remove(); done(); } }
  function clip(cut) {
    navigator.clipboard?.writeText(ta.value.slice(ta.selectionStart, ta.selectionEnd)).catch(() => {});
    if (cut) { ta.setRangeText(''); status(); }
  }
  async function paste() { try { ta.setRangeText(await navigator.clipboard.readText(), ta.selectionStart, ta.selectionEnd, 'end'); status(); } catch {} }
  async function find(s = null) {
    if (s == null) s = await dialog('Find What:', { field: last, buttons: ['OK', 'Cancel'] });
    if (!s) return;
    last = s;
    const lo = ta.value.toLowerCase(), q = s.toLowerCase();
    let i = lo.indexOf(q, ta.selectionEnd);
    if (i < 0) i = lo.indexOf(q);
    if (i < 0) { await dialog('Match not found.'); return; }
    ta.setSelectionRange(i, i + s.length); status();
  }
  function about() {
    dialog(`${prog}\nVersion ${qbasic ? '1.1' : ['1.0', '2.0', '3.1'].includes(V.id) ? '1.1' : '2.0.026'}\n${V.dosCopy}`);
  }
  // shortcut: only PRINT "text" lines run, which is all HELLO.BAS needs; anything more would want a real interpreter.
  function run() {
    const out = [...ta.value.matchAll(/^\s*PRINT\s+"([^"]*)"?/gim)].map(m => m[1]);
    const scr = h('div', { class: 'de-run', tabindex: -1 }, out.join('\n') + '\n\n\n', h('div', null, 'Press any key to continue'));
    const end = e => { e.preventDefault(); e.stopPropagation(); scr.remove(); ta.focus(); };
    scr.addEventListener('keydown', end);
    scr.addEventListener('pointerdown', end);
    root.append(scr);
    scr.focus();
  }

  root.addEventListener('keydown', e => {
    if (openMenu) {
      const list = items[openMenu], k = e.key;
      const i = order.indexOf(openMenu);
      if (k === 'ArrowDown' || k === 'ArrowUp') { sel = (sel + (k === 'ArrowDown' ? 1 : list.length - 1)) % list.length; show(openMenu); }
      else if (k === 'ArrowLeft' || k === 'ArrowRight') { sel = 0; show(order[(i + (k === 'ArrowRight' ? 1 : order.length - 1)) % order.length]); }
      else if (k === 'Enter') choose(sel);
      else if (k === 'Escape' || k === 'Alt') { sel = 0; show(null); }
      else { const j = list.findIndex(([l]) => key(l) === k.toLowerCase()); if (j >= 0) choose(j); else return; }
      e.preventDefault();
      return;
    }
    const m = e.altKey && order.find(m => m[0].toLowerCase() === e.key.toLowerCase());
    if (m) { e.preventDefault(); sel = 0; show(m); }
    else if (e.key === 'F1') { e.preventDefault(); about(); }
    else if (qbasic && e.key === 'F5') { e.preventDefault(); run(); }
    else if (e.key === 'Tab' && e.target === ta) { e.preventDefault(); ta.setRangeText('        ', ta.selectionStart, ta.selectionEnd, 'end'); status(); }
  });
  for (const ev of ['input', 'keyup', 'pointerup', 'select']) ta.addEventListener(ev, status);
  ta.addEventListener('pointerdown', () => { if (openMenu) show(null); });

  host.before(root);
  load(path, text);
  ta.focus({ preventScroll: true });
}
