// blankiekun Exchange: the Inbox. Mail from blankiekun lives in this browser
// (read, deleted and so on are remembered per visitor); mail to blankiekun goes
// out through the "send a note" flow in send.js.

import { h, icon, store, small } from '../util.js';
import { createWindow, launch, all, find } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import { saveAs, saveTo } from '../filedlg.js';
import { sendEnabled, sendDialog } from '../send.js';

const KEY = 'w95.inbox';
const MAX = 2000;              // the worker keeps the first 2,000 characters of a note
const APP = 'blankiekun Exchange';
const GITHUB = 'https://github.com/blankiekun';
const FOLDERS = [['deleted', 'Deleted Items', 'i-trash'], ['inbox', 'Inbox', 'i-inbox'], ['outbox', 'Outbox', 'i-folder'], ['sent', 'Sent Items', 'i-folder']];
const folderName = f => FOLDERS.find(x => x[0] === f)[1];

// The mail that comes with the Inbox. Only where it is and whether it was read is stored.
const CANNED = {
  w1: { important: true, date: +new Date(1995, 7, 24, 11, 30), subject: 'Welcome to blankiekun 95!', body:
`Hi there,

Welcome to blankiekun 95, my homepage dressed up as a PC from 1995. Everything works: open things, poke around, and save files to the pretend disk (they stay in your browser).

A bit about me: I'm blank, I live in the US, and I'm learning Japanese by reading visual novels (Umineko, Oretsuba and Subahibi are some favourites).

I make three open-source projects, and each one has a message in this Inbox:

  - chimimouryou, a Japanese e-book reader for Calibre libraries
  - CONscripter, a visual novel engine that runs in the browser
  - conscripter-convert, which brings games from other engines to CONscripter

If you want to say hi, use Compose > New Message. It really reaches me. I'm also on X as @blankiekun, in English and Japanese.

blankiekun` },
  w2: { date: +new Date(1995, 7, 24, 11, 25), subject: 'chimimouryou: your Calibre library, everywhere', body:
`chimimouryou is a self-hosted Japanese e-book reader for your Calibre library. It's a fork of ttsu Ebook Reader that runs on your own server, so everyone in the house reads books, manga and visual novels from one library, each with their own account, synced progress and highlights.

What it adds:
  - Your Calibre library as the bookshelf, with reading streaks and "Continue reading"
  - Vertical text, highlights and notes, and search that ignores furigana
  - Offline reading, and audiobooks that highlight the line being read
  - Anki mining with Yomitan, with audio and visual novel screenshots
  - Visual novels played in the browser with CONscripter
  - Docker images for amd64 and arm64

Source and setup guide:
${GITHUB}/chimimouryou

blankiekun` },
  w3: { date: +new Date(1995, 7, 24, 11, 20), subject: 'CONscripter: visual novels in your browser', body:
`CONscripter is an ONScripter engine for playing NScripter visual novels. It's a fork of ONScripter-Yuri, built on SDL2, and it runs on the Web (WebAssembly), Windows, Linux, macOS, Android and RetroArch.

It adds colour filters, shakes, ripples and pulses, slide, zoom, flip and melt transitions, text sizes and more. Every addition is opt-in, so old scripts behave exactly as they always did.

Want to try it? Double-click CONscripter on the desktop and open a game folder. The game is read straight from your disk and nothing is uploaded.

Source:
${GITHUB}/CONscripter

blankiekun` },
  w4: { date: +new Date(1995, 7, 24, 11, 15), subject: 'conscripter-convert: bring your games along', body:
`conscripter-convert turns Japanese visual novels you own into games for CONscripter, so they play in the browser and in chimimouryou. It reads a game's archives, images, audio and scripts and writes a 0.txt script plus .nsa archives. It's written in Rust.

Engines so far:
  - Xuse (Saihate no Ima, finished)
  - 5pb./MAGES on the PS Vita
  - Nitroplus NSS

It ships no game data and reads only your own installation. When a game needs something NScripter can't do, the feature goes into CONscripter instead of being faked.

Source:
${GITHUB}/conscripter-convert

blankiekun` },
  w5: { date: +new Date(1995, 7, 24, 11, 11), subject: 'How to reach me', body:
`A few ways to get in touch:

  - Compose > New Message, right here. It goes straight to me.
  - Notepad and Paint have a "Send to blankiekun" button for notes and drawings.
  - HyperTerminal: dial blankiekun BBS at 555-1995 and sign the guestbook.
  - Bugs and ideas for the projects: open an issue on GitHub.
  - X: @blankiekun (https://x.com/blankiekun), in English or Japanese.

${GITHUB}

blankiekun` },
};
// Tools > Deliver Now brings this one, once.
const LATE = { w6: { date: +new Date(1995, 7, 25, 9, 2), subject: 'Thanks for checking your mail', body:
`Look at you, clicking Deliver Now like it's 1995.

Since you're here: blankiekun BBS is up and running. Open HyperTerminal, dial 555-1995, and listen to that modem sing. There's a door game, too.

blankiekun` } };
const ALL = { ...CANNED, ...LATE };

// ---------- the mail store, shared by every window ----------

let db = null;
const listeners = new Set();
function data() {
  if (db) return db;
  const d = store.get(KEY, null);
  db = d && d.v === 1 && Array.isArray(d.msgs) ? d : { v: 1, extra: false, msgs: Object.keys(CANNED).map(id => ({ id, folder: 'inbox', read: false })) };
  return db;
}
function commit() { store.set(KEY, db); listeners.forEach(fn => fn()); }
function entry(id) { return data().msgs.find(m => m.id === id); }
// A message with everything filled in.
function full(m) {
  const c = ALL[m.id];
  return c ? { from: 'blankiekun', to: you(), cc: '', ...c, ...m } : { important: false, ...m };
}
const you = () => store.get('w95.send.name', '') || store.get('w95.ht.handle', '') || 'You';
const inFolder = f => data().msgs.filter(m => m.folder === f).map(full);
const unread = f => data().msgs.filter(m => m.folder === f && !m.read).length;
function move(id, folder) { const m = entry(id); if (m) { m.folder = folder; commit(); } }
function markRead(id, read = true) { const m = entry(id); if (m && m.read !== read) { m.read = read; commit(); } }
function remove(id) { const d = data(); d.msgs = d.msgs.filter(m => m.id !== id); commit(); }

const stamp = t => new Date(t).toLocaleString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit' }).replace(/,/g, '');
const longStamp = t => new Date(t).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// Toolbar pictures, drawn like the 16-colour icons in index.html.
function glyph(parts) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('shape-rendering', 'crispEdges');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = parts.map(([f, d]) => `<path fill="${f}" d="${d}"/>`).join('');
  return s;
}
const ENV = [['#000', 'M1 6h12v8H1z'], ['#fff', 'M2 7h10v6H2z'], ['#808080', 'M2 7h1v1h1v1h1v1h4V9h1V8h1V7h1v1h-1v1h-1v1H9v1H5v-1H4V9H3V8H2z']];
const GLYPHS = {
  compose: () => glyph([...ENV, ['#000', 'M12 1h2v1h1v2h-1v1h-1v1h-1v1h-1v1H9V6h1V5h1V4h1V3h1V2h-1z'], ['#ffff00', 'M12 2h1v1h-1zM11 3h1v1h-1zM10 4h1v1h-1z']]),
  del: () => glyph([['#000', 'M3 3h2v1h1v1h1v1h2V5h1V4h1V3h2v2h-1v1h-1v1H9v2h1v1h1v1h1v2h-2v-1H9v-1H7v1H6v1H5v1H3v-2h1v-1h1v-1h1V7H5V6H4V5H3z']]),
  reply: () => glyph([...ENV.map(([f, d]) => [f, d.replace(/M(\d+) (\d+)/g, (_, x, y) => `M${+x + 2} ${y}`)]), ['#800080', 'M4 0h1v2h4v4H8V3H5v2H4V4H3V3H2V2h1V1h1z']]),
  replyAll: () => glyph([...ENV.map(([f, d]) => [f, d.replace(/M(\d+) (\d+)/g, (_, x, y) => `M${+x + 2} ${y}`)]), ['#800080', 'M4 0h1v1h3v1h3v4h-1V3H8v2H5v-1H4V3H3V2H2V1h2zM2 0h1v1H2z']]),
  forward: () => glyph([...ENV, ['#008000', 'M11 0h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1V5H8V3h3z']]),
  deliver: () => glyph([...ENV, ['#000', 'M10 0h5v1h-5zM14 1h1v4h-1z'], ['#0000ff', 'M9 2h4v1H9zM12 3h1v1h-1z']]),
  prev: () => glyph([['#000', 'M8 3h1v10H8V12H7v-1H6v-1H5V9H4V7h1V6h1V5h1V4h1z']]),
  next: () => glyph([['#000', 'M7 3h1v1h1v1h1v1h1v1h1v2h-1v1h-1v1H9v1H8v1H7z']]),
  bang: () => glyph([['#ff0000', 'M7 2h2v8H7zM7 12h2v2H7z']]),
  open: () => glyph([['#000', 'M1 7h12v8H1z'], ['#fff', 'M2 8h10v6H2z'], ['#000', 'M1 7h1V5h1V4h1V3h1V2h4v1h1v1h1v1h1v2h1v1H1zM2 7h10V6h-1V5h-1V4H9V3H5v1H4v1H3v1H2z'], ['#fff', 'M3 6h8v1H3zM4 5h6v1H4zM5 4h4v1H5z'], ['#808080', 'M2 8h1v1h1v1h1v1h4v-1h1V9h1V8h1v1h-1v1h-1v1H9v1H5v-1H4v-1H3V9H2z']]),
};
const tbBtn = (title, g, onclick, label) => h('button', { type: 'button', class: 'ix-tb' + (label ? ' wide' : ''), title, 'aria-label': title, onclick }, g, label ? h('span', null, label) : null);

// Linkified, plain-text body.
function bodyNodes(text) {
  const out = [];
  let at = 0, m;
  const re = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g;
  while ((m = re.exec(text))) {
    out.push(text.slice(at, m.index), h('a', { href: m[0], target: '_blank', rel: 'noopener' }, m[0]));
    at = m.index + m[0].length;
  }
  out.push(text.slice(at));
  return out;
}

// ---------- Deliver Now ----------

let delivering = false;
function deliver(parent, say) {
  if (delivering) return;
  delivering = true;
  const fill = h('i');
  const text = h('div', null, 'Connecting to blankiekun Mail...');
  const cancel = h('button', { class: 'btn', type: 'button', onclick: () => finish(false) }, 'Cancel');
  const body = h('div', { class: 'dlg ix-deliver' },
    h('div', { class: 'row' }, icon('i-inbox'), text),
    h('div', { class: 'ix-progress', role: 'progressbar', 'aria-label': 'Progress' }, fill),
    h('div', { class: 'btns right' }, cancel));
  body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
  const d = createWindow({ title: APP, body, dialog: true, resizable: false, width: 'auto', parent, taskbar: false, onClose: () => finish(false, true) });
  cancel.focus();
  let p = 0, done = false;
  const steps = [[700, 'Checking for new mail in Personal Folders...'], [1500, 'Delivering messages...'], [2300, null]];
  const timers = steps.map(([t, msg]) => setTimeout(() => msg ? (text.textContent = msg) : finish(true), t));
  const grow = setInterval(() => { p = Math.min(100, p + 5); fill.style.width = p + '%'; }, 110);
  function finish(ok, closing) {
    if (done) return;
    done = true; delivering = false;
    timers.forEach(clearTimeout); clearInterval(grow);
    if (!closing) d.close(true);
    if (!ok) return;
    const d0 = data();
    let got = 0;
    if (!d0.extra) {
      d0.extra = true;
      for (const id of Object.keys(LATE)) d0.msgs.push({ id, folder: 'inbox', read: false });
      got = Object.keys(LATE).length;
      commit();
      import('./control.js').then(m => m.playSound && m.playSound('Asterisk')).catch(() => {});
    }
    say(got ? `${got} new message${got > 1 ? 's' : ''} delivered.` : 'No new messages.');
    const waiting = inFolder('outbox').length;
    if (waiting && !sendEnabled()) {
      msgbox({ title: APP, icon: 'warn', parent, text: `${APP} could not connect to the mail server, so the ${waiting === 1 ? 'message' : `${waiting} messages`} in your Outbox could not be sent.` });
    } else if (waiting) {
      msgbox({ title: APP, icon: 'info', parent, text: 'There is mail waiting in your Outbox.\n\nOpen it and click Send to deliver it to blankiekun.' });
    }
  }
}

// ---------- the Inbox window ----------

function open() {
  let folder = 'inbox';
  let sel = null;
  let sortBy = 'date', asc = false;
  let showTree = true, showTools = true, showStatus = true;
  let note = '', noteTimer = 0;

  const tree = h('div', { class: 'ex-tree ix-tree', role: 'tree', tabindex: '0', 'aria-label': 'Folders' });
  const list = h('div', { class: 'ix-list', role: 'grid', tabindex: '0', 'aria-label': 'Messages' });
  const folderSel = h('select', { class: 'field ix-where', 'aria-label': 'Folder' }, FOLDERS.map(([id, n]) => h('option', { value: id }, n)));
  folderSel.addEventListener('change', () => go(folderSel.value));
  const sbItems = h('span'), sbNote = h('span', { class: 'ix-note' });
  const status = h('div', { class: 'statusbar' }, sbItems, sbNote);
  const say = t => { note = t; clearTimeout(noteTimer); noteTimer = setTimeout(() => { note = ''; render(); }, 5000); render(); };

  const selected = () => sel && entry(sel) ? full(entry(sel)) : null;
  function go(f) { folder = f; sel = null; render(); list.focus({ preventScroll: true }); }

  function renderTree() {
    const row = (id, name, ic, depth) => {
      const n = id ? unread(id) : 0;
      const r = h('div', { class: 'ex-trow' + (id === folder ? ' sel' : ''), role: 'treeitem', style: { paddingLeft: depth * 16 + 2 + 'px' }, 'aria-selected': String(id === folder) },
        icon(ic), h('span', { class: n ? 'ix-bold' : null }, name + (n ? ` (${n})` : '')));
      if (id) r.addEventListener('click', () => go(id));
      return r;
    };
    tree.replaceChildren(row(null, 'Personal Folders', 'i-docs', 0), ...FOLDERS.map(([id, n, ic]) => row(id, n, ic, 1)));
  }

  function rows() {
    const ms = inFolder(folder);
    const key = { from: m => (folder === 'sent' || folder === 'outbox' ? m.to : m.from).toLowerCase(), subject: m => m.subject.toLowerCase(), date: m => m.date, important: m => +!!m.important, read: m => +!!m.read }[sortBy];
    return ms.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1) || b.date - a.date; });
  }

  function renderList() {
    const outgoing = folder === 'sent' || folder === 'outbox';
    const col = (k, label, cls) => {
      const b = h('button', { type: 'button', class: 'ix-col ' + cls, 'aria-label': 'Sort by ' + (typeof label === 'string' ? label : k) }, label);
      b.addEventListener('click', () => { if (sortBy === k) asc = !asc; else { sortBy = k; asc = k !== 'date'; } renderList(); });
      return b;
    };
    const head = h('div', { class: 'ix-row ix-head', role: 'row' },
      col('important', '!', 'c-imp'), col('read', glyph(ENV), 'c-ic'), col('from', outgoing ? 'To' : 'From', 'c-from'),
      col('subject', 'Subject', 'c-subj'), col('date', outgoing ? 'Sent' : 'Received', 'c-date'));
    const items = rows().map(m => {
      const r = h('div', { class: 'ix-row ix-item' + (m.read ? '' : ' unread') + (m.folder === 'outbox' ? ' draft' : '') + (m.id === sel ? ' sel' : ''), role: 'row', 'aria-selected': String(m.id === sel), 'data-id': m.id },
        h('span', { class: 'c-imp' }, m.important ? GLYPHS.bang() : null),
        h('span', { class: 'c-ic' }, m.read ? GLYPHS.open() : icon('i-mail')),
        h('span', { class: 'c-from' }, outgoing ? m.to : m.from),
        h('span', { class: 'c-subj' }, m.subject || '(no subject)'),
        h('span', { class: 'c-date' }, small.matches ? new Date(m.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : stamp(m.date)));
      r.addEventListener('click', () => { sel = m.id; render(); });
      r.addEventListener('dblclick', () => openMsg(m.id));
      // A tap opens it straight away; double-tapping is awkward on a phone.
      r.addEventListener('pointerup', e => { if (e.pointerType === 'touch') { sel = m.id; openMsg(m.id); } });
      return r;
    });
    list.replaceChildren(head, ...items);
    if (!items.length) list.append(h('div', { class: 'ix-empty' }, 'There are no items to show in this view.'));
    const s = list.querySelector('.ix-item.sel');
    if (s) s.scrollIntoView({ block: 'nearest' });
  }

  function render() {
    if (sel && (!entry(sel) || entry(sel).folder !== folder)) sel = null;
    renderTree();
    renderList();
    folderSel.value = folder;
    const n = inFolder(folder).length, u = unread(folder);
    sbItems.textContent = `${n} Item${n === 1 ? '' : 's'}${u ? `, ${u} Unread` : ''}`;
    sbNote.textContent = note;
    win && win.setTitle(`${folderName(folder)} - ${APP}`);
    panes.classList.toggle('no-tree', !showTree);
    tools.hidden = !showTools;
    status.hidden = !showStatus;
    const m = selected();
    [tbDel, tbReply, tbAll, tbFwd].forEach(b => { b.disabled = !m; });
  }

  function openMsg(id) {
    const m = entry(id);
    if (!m) return;
    if (m.folder === 'outbox') { compose({ draft: full(m) }); return; }
    markRead(id);
    readNote(id);
  }
  async function del(id = sel) {
    const m = id && entry(id);
    if (!m) return;
    if (m.folder === 'deleted') {
      const b = await msgbox({ title: APP, icon: 'warn', parent: win, buttons: ['&Yes', '&No'], text: 'This will permanently delete the selected item.\n\nDo you want to continue?' });
      if (b !== 'Yes') return;
      remove(id);
    } else move(id, 'deleted');
  }
  function moveDialog() {
    const m = selected();
    if (!m) return;
    const to = h('select', { class: 'field', id: 'ix-move', size: 4 }, FOLDERS.map(([id, n]) => h('option', { value: id, selected: id === m.folder }, n)));
    const form = h('form', { class: 'dlg' },
      h('label', { for: 'ix-move', class: 'ix-col-label' }, 'Move the selected item to:'), to,
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'OK'), h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancel')));
    form.addEventListener('submit', e => { e.preventDefault(); move(m.id, to.value); d.close(true); });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); d.close(); } });
    const d = createWindow({ title: 'Move', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    to.focus();
  }
  async function emptyDeleted() {
    if (!inFolder('deleted').length) return;
    const b = await msgbox({ title: APP, icon: 'warn', parent: win, buttons: ['&Yes', '&No'], text: 'This will permanently delete all the items in the Deleted Items folder.\n\nDo you want to continue?' });
    if (b !== 'Yes') return;
    const d = data();
    d.msgs = d.msgs.filter(m => m.folder !== 'deleted');
    commit();
  }
  const reply = kind => { const m = selected(); if (m) compose({ from: m, kind }); };

  list.addEventListener('keydown', e => {
    const ids = rows().map(m => m.id);
    const i = ids.indexOf(sel);
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = ids[Math.min(ids.length - 1, i + 1)] || sel; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = ids[Math.max(0, i - 1)] || sel; }
    else if (e.key === 'Home') { e.preventDefault(); sel = ids[0] || null; }
    else if (e.key === 'End') { e.preventDefault(); sel = ids[ids.length - 1] || null; }
    else if (e.key === 'Enter' && sel) { e.preventDefault(); openMsg(sel); return; }
    else if (e.key === 'Delete' && sel) { e.preventDefault(); del(); return; }
    else return;
    render();
  });
  tree.addEventListener('keydown', e => {
    const i = FOLDERS.findIndex(f => f[0] === folder);
    if (e.key === 'ArrowDown' && i < FOLDERS.length - 1) { e.preventDefault(); folder = FOLDERS[i + 1][0]; sel = null; render(); }
    if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); folder = FOLDERS[i - 1][0]; sel = null; render(); }
  });

  const bar = menubar([
    { label: '&File', items: () => [
      { label: '&Open', action: () => sel && openMsg(sel), disabled: !selected() },
      { label: '&Move...', action: moveDialog, disabled: !selected() },
      { label: '&Delete', key: 'Del', action: () => del(), disabled: !selected() },
      '-',
      { label: 'Empty "&Deleted Items" Folder', action: emptyDeleted, disabled: !inFolder('deleted').length },
      '-',
      { label: '&Close', action: () => win.close() },
    ] },
    { label: '&Edit', items: () => [
      { label: 'Mark as &Read', action: () => markRead(sel), disabled: !selected() || selected().read },
      { label: 'Mark as &Unread', action: () => markRead(sel, false), disabled: !selected() || !selected().read },
    ] },
    { label: '&View', items: () => [
      { label: '&Folders', checked: showTree, action: () => { showTree = !showTree; render(); } },
      { label: '&Toolbar', checked: showTools, action: () => { showTools = !showTools; render(); } },
      { label: 'Status &Bar', checked: showStatus, action: () => { showStatus = !showStatus; render(); } },
      '-',
      ...FOLDERS.map(([id, n]) => ({ label: n, radio: true, checked: folder === id, action: () => go(id) })),
    ] },
    { label: '&Compose', items: () => [
      { label: '&New Message', key: 'Ctrl+N', action: () => compose() },
      '-',
      { label: 'Reply to &Sender', key: 'Ctrl+R', action: () => reply('reply'), disabled: !selected() },
      { label: 'Reply to &All', action: () => reply('all'), disabled: !selected() },
      { label: '&Forward', key: 'Ctrl+F', action: () => reply('fwd'), disabled: !selected() },
    ] },
    { label: '&Tools', items: () => [
      { label: '&Deliver Now', key: 'Ctrl+M', action: () => deliver(win, say) },
      '-',
      { label: '&Address Book...', action: addressBook },
      '-',
      { label: '&Options...', disabled: true },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') }, '-',
      { label: `&About ${APP}`, action: () => about(APP, 'i-inbox', win) },
    ] },
  ]);
  function addressBook() {
    msgbox({ title: 'Address Book', icon: 'info', parent: win, text: 'Your address book has one entry:\n\nblankiekun\n\nEverything you send from here goes to blankiekun.' });
  }

  const tbDel = tbBtn('Delete', GLYPHS.del(), () => del());
  const tbReply = tbBtn('Reply to Sender', GLYPHS.reply(), () => reply('reply'));
  const tbAll = tbBtn('Reply to All', GLYPHS.replyAll(), () => reply('all'));
  const tbFwd = tbBtn('Forward', GLYPHS.forward(), () => reply('fwd'));
  const tools = h('div', { class: 'ix-tools' },
    h('div', { class: 'ix-tbgroup' }, folderSel, tbBtn('Show/Hide Folder List', icon('i-folder'), () => { showTree = !showTree; render(); })),
    h('div', { class: 'ix-tbgroup' }, tbBtn('New Message', GLYPHS.compose(), () => compose())),
    h('div', { class: 'ix-tbgroup' }, tbDel),
    h('div', { class: 'ix-tbgroup' }, tbReply, tbAll, tbFwd),
    h('div', { class: 'ix-tbgroup' }, tbBtn('Deliver Now', GLYPHS.deliver(), () => deliver(win, say)), tbBtn('Inbox', icon('i-inbox'), () => go('inbox'))));

  const panes = h('div', { class: 'ix-panes' }, tree, list);
  const root = h('div', { class: 'ix' }, bar, tools, panes, status);
  root.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'n') { e.preventDefault(); compose(); }
    else if (k === 'r' && selected()) { e.preventDefault(); reply('reply'); }
    else if (k === 'f' && selected()) { e.preventDefault(); reply('fwd'); }
    else if (k === 'm') { e.preventDefault(); deliver(win, say); }
  });

  let win = null;
  win = createWindow({
    app: 'inbox', title: `Inbox - ${APP}`, icon: 'i-inbox', body: root,
    width: 640, height: 420, minW: 260, minH: 200, route: 'inbox', autofocus: '.ix-list',
    onClosed: () => listeners.delete(render),
  });
  listeners.add(render);
  render();
  return win;
}

// ---------- reading a message ----------

function readNote(id) {
  const existing = find(w => w.app === 'inbox-msg' && w.msgId === id);
  if (existing) { existing.focus(); return existing; }
  let m = full(entry(id));
  const fieldRow = (label, value) => h('div', { class: 'ix-hrow' }, h('span', null, label), h('input', { class: 'field', readOnly: true, value, tabindex: '-1', 'aria-label': label }));
  const headBox = h('div', { class: 'ix-headers' });
  const body = h('div', { class: 'ix-body', tabindex: '0' });
  function fill() {
    const out = m.folder === 'sent';
    headBox.replaceChildren(
      fieldRow('From:', m.from), fieldRow(out ? 'Sent:' : 'Received:', longStamp(m.date)),
      fieldRow('To:', m.to), fieldRow('Cc:', m.cc || ''), fieldRow('Subject:', m.subject || '(no subject)'));
    body.replaceChildren(...bodyNodes(m.body));
    body.scrollTop = 0;
    win && win.setTitle(`${m.subject || '(no subject)'} - Message`);
  }
  // Previous and Next walk the folder the message is in, newest first.
  function step(d) {
    const ids = inFolder(m.folder).sort((a, b) => b.date - a.date).map(x => x.id);
    const next = ids[ids.indexOf(m.id) + d];
    if (!next) return;
    markRead(next);
    m = full(entry(next));
    win.msgId = next;
    fill();
  }
  const reply = kind => compose({ from: m, kind });
  async function saveAsText() {
    const text = `From:\t${m.from}\nSent:\t${longStamp(m.date)}\nTo:\t${m.to}\nSubject:\t${m.subject}\n\n${m.body}\n`;
    const r = await saveAs({ name: (m.subject || 'Message').replace(/[\\/:*?"<>|]/g, '').slice(0, 40) + '.txt', filters: [{ label: 'Text Only (*.txt)', exts: ['.txt'] }], parent: win });
    if (r) saveTo(r, { text }, () => new Blob([text.replace(/\n/g, '\r\n')], { type: 'text/plain' }), win);
  }
  async function del() {
    if (m.folder === 'deleted') {
      const b = await msgbox({ title: APP, icon: 'warn', parent: win, buttons: ['&Yes', '&No'], text: 'This will permanently delete this item.\n\nDo you want to continue?' });
      if (b !== 'Yes') return;
      remove(m.id);
    } else move(m.id, 'deleted');
    win.close();
  }
  const bar = menubar([
    { label: '&File', items: () => [
      { label: 'Save &As...', action: saveAsText },
      { label: '&Delete', action: del },
      '-',
      { label: '&Close', action: () => win.close() },
    ] },
    { label: '&Edit', items: () => [
      { label: '&Copy', key: 'Ctrl+C', action: () => { const t = window.getSelection().toString(); if (t) navigator.clipboard?.writeText(t).catch(() => {}); } },
      { label: 'Select &All', key: 'Ctrl+A', action: () => { const r = document.createRange(); r.selectNodeContents(body); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } },
      '-',
      { label: 'Mark as &Unread', action: () => { markRead(m.id, false); win.close(); } },
    ] },
    { label: '&View', items: () => [
      { label: '&Previous', key: 'Ctrl+<', action: () => step(-1) },
      { label: '&Next', key: 'Ctrl+>', action: () => step(1) },
    ] },
    { label: '&Compose', items: () => [
      { label: '&New Message', action: () => compose() },
      '-',
      { label: 'Reply to &Sender', action: () => reply('reply') },
      { label: 'Reply to &All', action: () => reply('all') },
      { label: '&Forward', action: () => reply('fwd') },
    ] },
    { label: '&Help', items: () => [{ label: `&About ${APP}`, action: () => about(APP, 'i-inbox', win) }] },
  ]);
  const tools = h('div', { class: 'ix-tools' },
    h('div', { class: 'ix-tbgroup' }, tbBtn('Delete', GLYPHS.del(), del)),
    h('div', { class: 'ix-tbgroup' }, tbBtn('Reply to Sender', GLYPHS.reply(), () => reply('reply')), tbBtn('Reply to All', GLYPHS.replyAll(), () => reply('all')), tbBtn('Forward', GLYPHS.forward(), () => reply('fwd'))),
    h('div', { class: 'ix-tbgroup' }, tbBtn('Previous', GLYPHS.prev(), () => step(-1)), tbBtn('Next', GLYPHS.next(), () => step(1))));
  const root = h('div', { class: 'ix-note-win' }, bar, tools, headBox, body);
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  let win = null;
  win = createWindow({ app: 'inbox-msg', title: 'Message', icon: 'i-mail', body: root, width: 520, height: 440, minW: 240, minH: 220, autofocus: '.ix-body' });
  win.msgId = id;
  fill();
  return win;
}

// ---------- writing one ----------

// from + kind ('reply', 'all', 'fwd') quotes a message; draft reopens one from the Outbox.
function compose({ from, kind, draft } = {}) {
  let subject0 = '', body0 = '';
  if (draft) { subject0 = draft.subject; body0 = draft.body; }
  else if (from) {
    const pre = kind === 'fwd' ? 'FW: ' : 'RE: ';
    subject0 = (/^(re|fw|fwd):\s/i.test(from.subject) ? from.subject.replace(/^(re|fw|fwd):\s*/i, pre) : pre + from.subject);
    body0 = `\n\n-----Original Message-----\nFrom:\t${from.from}\nSent:\t${longStamp(from.date)}\nTo:\t${from.to}\nSubject:\t${from.subject}\n\n${from.body}`;
  }
  let draftId = draft ? draft.id : null;
  let sent = false;
  const to = h('input', { class: 'field', id: 'ix-to-' + Date.now(), readOnly: true, value: 'blankiekun', title: 'Everything you send from here goes to blankiekun.' });
  const cc = h('input', { class: 'field', readOnly: true, value: '', 'aria-label': 'Cc', title: 'Only blankiekun gets mail from here.' });
  const subject = h('input', { class: 'field', maxlength: 120, autocomplete: 'off', value: subject0, 'aria-label': 'Subject' });
  const ta = h('textarea', { class: 'field ix-compose-body', spellcheck: true, 'aria-label': 'Message' });
  ta.value = body0;
  const count = h('span');
  const sendBtn = tbBtn('Send', GLYPHS.compose(), send, 'Send');
  const dirty = () => !sent && (subject.value !== subject0 || ta.value !== body0);
  const note = () => `Subject: ${subject.value.trim() || '(no subject)'}\n\n${ta.value.trim()}`;
  function update() {
    const n = note().length;
    count.textContent = `${n.toLocaleString('en-US')} of ${MAX.toLocaleString('en-US')} characters`;
    count.classList.toggle('ix-over', n > MAX);
    win && win.setTitle(subject.value.trim() ? `${subject.value.trim()} - Message` : `New Message - ${APP}`);
  }
  subject.addEventListener('input', update);
  ta.addEventListener('input', update);

  // Puts the message in a folder, replacing the draft it came from.
  function file(folder) {
    const d = data();
    const m = { id: draftId || 'm' + Date.now().toString(36), folder, from: you(), to: 'blankiekun', cc: '', subject: subject.value.trim(), body: ta.value, date: Date.now(), read: true };
    const i = d.msgs.findIndex(x => x.id === m.id);
    if (i >= 0) d.msgs[i] = m; else d.msgs.push(m);
    draftId = m.id;
    commit();
  }

  async function send() {
    if (sent) return;
    if (!subject.value.trim() && !ta.value.trim()) {
      msgbox({ title: APP, icon: 'info', parent: win, text: 'There is nothing to send yet.\n\nType a subject or a message first.' });
      return;
    }
    const text = note();
    if (text.length > MAX) {
      msgbox({ title: APP, icon: 'warn', parent: win, text: `Messages to blankiekun can be up to ${MAX.toLocaleString('en-US')} characters, counting the subject. This one has ${text.length.toLocaleString('en-US')}.\n\nShorten it a little and try again.` });
      return;
    }
    if (!sendEnabled()) {
      file('outbox');
      sent = true;
      win.close(true);
      msgbox({ title: APP, icon: 'warn', text: `${APP} could not connect to the mail server.\n\nYour message was placed in the Outbox.` });
      return;
    }
    // send.js doesn't say how it went, so watch its dialog: a new "last sent" time means it went out.
    const before = store.get('w95.send.last', 0);
    sendDialog({ kind: 'note', parent: win, text });
    const dlg = find(w => w.opts.parent === win && /^Send note/.test(w.opts.title || ''));
    if (!dlg) return;   // still cooling down from the last send; send.js said so
    const t = setInterval(() => {
      if (!sent && store.get('w95.send.last', 0) !== before) { sent = true; file('sent'); }
      // Close once the "was sent" box (a child of this window) is gone.
      if (sent && !all().some(w => w.opts.parent === win)) { clearInterval(t); win.close(true); }
      else if (!sent && !all().includes(dlg)) clearInterval(t);
    }, 250);
  }

  const bar = menubar([
    { label: '&File', items: () => [
      { label: 'S&end', key: 'Ctrl+Enter', action: send },
      { label: '&Save', key: 'Ctrl+S', action: () => { file('outbox'); subject0 = subject.value; body0 = ta.value; } },
      '-',
      { label: '&Close', action: () => win.close() },
    ] },
    { label: '&Edit', items: () => [
      { label: '&Undo', key: 'Ctrl+Z', action: () => { ta.focus(); document.execCommand('undo'); } },
      '-',
      { label: 'Cu&t', key: 'Ctrl+X', action: () => { ta.focus(); document.execCommand('cut'); } },
      { label: '&Copy', key: 'Ctrl+C', action: () => { ta.focus(); document.execCommand('copy'); } },
      { label: '&Paste', key: 'Ctrl+V', action: async () => { try { ta.focus(); ta.setRangeText(await navigator.clipboard.readText(), ta.selectionStart, ta.selectionEnd, 'end'); update(); } catch {} } },
      '-',
      { label: 'Select &All', action: () => { ta.focus(); ta.select(); } },
    ] },
    { label: '&Insert', items: () => [
      { label: '&Time/Date', action: () => { ta.focus(); ta.setRangeText(longStamp(Date.now()), ta.selectionStart, ta.selectionEnd, 'end'); update(); } },
    ] },
    { label: '&Tools', items: () => [
      { label: '&Address Book...', action: () => msgbox({ title: 'Address Book', icon: 'info', parent: win, text: 'Your address book has one entry:\n\nblankiekun' }) },
      { label: '&Check Names', action: () => msgbox({ title: 'Check Names', icon: 'info', parent: win, text: 'blankiekun is a valid name.' }) },
    ] },
    { label: '&Help', items: () => [{ label: `&About ${APP}`, action: () => about(APP, 'i-inbox', win) }] },
  ]);
  const tools = h('div', { class: 'ix-tools' }, h('div', { class: 'ix-tbgroup' }, sendBtn));
  const lbl = (text, el) => h('div', { class: 'ix-hrow' }, h('span', { class: 'ix-addr' }, text), el);
  const root = h('div', { class: 'ix-compose' }, bar, tools,
    h('div', { class: 'ix-headers' }, lbl('To...', to), lbl('Cc...', cc), lbl('Subject:', subject)),
    ta, h('div', { class: 'statusbar' }, count));
  root.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); file('outbox'); subject0 = subject.value; body0 = ta.value; }
  });

  let win = null;
  win = createWindow({
    app: 'inbox-compose', title: `New Message - ${APP}`, icon: 'i-mail', body: root,
    width: 520, height: 440, minW: 240, minH: 240,
    onClose: async () => {
      if (!dirty()) return true;
      const b = await msgbox({ title: APP, icon: 'question', parent: win, buttons: ['&Yes', '&No', 'Cancel'], text: 'Do you want to save changes to this message?\n\nIt will be kept in your Outbox.' });
      if (b === 'Yes') { file('outbox'); return true; }
      return b === 'No';
    },
  });
  update();
  if (from || draft) { ta.focus(); ta.setSelectionRange(0, 0); ta.scrollTop = 0; } else subject.focus();
  return win;
}

export default { id: 'inbox', title: `Inbox - ${APP}`, icon: 'i-inbox', single: true, open };
