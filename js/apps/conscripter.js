// CONscripter: plays an NScripter visual novel from a folder the visitor drops in.
// The engine runs in a frame (cons/player.html) that reads the files straight off
// their disk, so nothing is uploaded. Saves stay in this browser, and can be
// exported to a .zip and imported again.

import { h, icon, download, store } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, inputbox, about } from '../dialogs.js';
import { openSaveEditor } from './conssave.js';

const NO_TIP = 'w95.cons.notip';
const FLAGS = 'w95.cons.flags';

// Debug > Engine Flags: engine options, used from the next start.
const FLAG_LIST = [
  { flag: '--edit', label: '&Edit Variables with Z' },
  { flag: '--debug:1', label: '&Debug Output (Engine Log)' },
  { flag: '--force-button-shortcut', label: 'Ignore &Key Locks' },
  { flag: '--enable-wheeldown-advance', label: '&Wheel Down Advances Text' },
  '-',
  { flag: '--render-font-outline', label: 'Text &Outline Instead of Shadow' },
  { flag: '--no-video', label: '&No Movies' },
  { flag: '--disable-rescale', label: 'Don\'t &Rescale Images' },
  '-',
  { flag: '--fontcache', label: '&Cache Font' },
  { flag: '--no-vsync', label: 'No &VSync' },
];
let tipShown = false;

// The Setup picture: a little monitor with a visual novel on it.
const ART = `<svg viewBox="0 0 64 56" width="96" height="84" shape-rendering="crispEdges">
<path fill="#fff" d="M2 2h60v1H3v41H2z"/><path fill="#000" d="M2 45h61V2h-1v42H2z"/><path fill="#c0c0c0" d="M3 3h59v41H3z"/><path fill="#808080" d="M6 6h53v1H7v33H6z"/><path fill="#fff" d="M7 40h52V7h-1v32H7z"/>
<path fill="#202060" d="M7 7h51v6H7z"/><path fill="#503070" d="M7 13h51v5H7z"/><path fill="#a04878" d="M7 18h51v4H7z"/><path fill="#e08060" d="M7 22h51v3H7z"/><path fill="#f0c070" d="M7 25h51v2H7z"/>
<path fill="#fff" d="M12 9h1v1h-1zM24 11h1v1h-1zM41 8h1v1h-1zM52 12h1v1h-1z"/><path fill="#fff0c0" d="M46 9h4v1h1v3h-1v1h-4v-1h-1v-3h1z"/>
<path fill="#203020" d="M7 27h51v12H7z"/><path fill="#402820" d="M15 20h2v9h-2z"/><path fill="#f8b0c8" d="M10 15h12v2h2v3h-2v2H10v-2H8v-3h2z"/><path fill="#e07898" d="M11 19h3v1h-3zM18 16h3v1h-3zM16 20h4v1h-4z"/>
<path fill="#282040" d="M37 19h5v2h1v4h2v8h-10v-8h2v-4h1z"/>
<path fill="#000040" d="M9 29h47v9H9z"/><path fill="#8080ff" d="M9 29h47v1H9z"/><path fill="#fff" d="M11 31h30v1H11zM11 34h22v1H11z"/><path class="cons-blink" fill="#ff0" d="M50 34h3v1h-1v1h-1v-1h-1z"/>
<path fill="#808080" d="M26 45h13v4H26z"/><path fill="#c0c0c0" d="M16 49h33v4H16z"/><path fill="#fff" d="M16 49h33v1H16z"/><path fill="#000" d="M16 53h33v1H16z"/></svg>`;

const SCRIPTS = ['0.txt', '00.txt', 'nscript.dat', 'nscr_sec.dat', 'onscript.nt', 'onscript.nt2', 'onscript.nt3', 'nscript.___'];

// ---------- reading what the visitor gave us ----------

// Call straight from the drop handler: the entries have to be taken before anything awaits.
function fromDrop(dt) {
  const entries = [...dt.items].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  const loose = entries.length ? [] : [...dt.files].map(file => ({ path: file.name, file }));
  return (async () => {
    const out = loose;
    async function walk(entry, prefix) {
      if (entry.isFile) {
        out.push({ path: prefix + entry.name, file: await new Promise((res, rej) => entry.file(res, rej)) });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (;;) {
          const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          if (!batch.length) break;
          for (const e of batch) await walk(e, prefix + entry.name + '/');
        }
      }
    }
    for (const e of entries) await walk(e, '');
    return out;
  })();
}

function pickFolder() {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', multiple: true, hidden: true });
    input.webkitdirectory = true;
    input.addEventListener('change', () => {
      resolve([...input.files].map(file => ({ path: file.webkitRelativePath || file.name, file })));
      input.remove();
    });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

// The shallowest folder with a script in it is the game.
async function findGame(list) {
  let root = null, script = null;
  for (const f of list) {
    const name = f.path.split('/').pop();
    if (!SCRIPTS.includes(name.toLowerCase())) continue;
    const dir = f.path.slice(0, f.path.length - name.length);
    if (root == null || dir.split('/').length < root.split('/').length) { root = dir; script = f.file; }
  }
  if (root == null) return null;
  const files = list.filter(f => f.path.startsWith(root)).map(f => ({ path: f.path.slice(root.length), file: f.file }));
  const top = files.filter(f => !f.path.includes('/'));
  const font = (top.find(f => f.path.toLowerCase() === 'default.ttf') || top.find(f => /\.(ttf|otf|ttc)$/i.test(f.path)) || {}).path;
  // Saves are kept per game, under the folder's name. Loose files get a name from the script.
  let title = root.split('/').filter(Boolean).pop();
  if (!title) {
    const sum = new Uint8Array(await crypto.subtle.digest('SHA-1', await script.slice(0, 1 << 20).arrayBuffer()));
    title = 'game-' + [...sum.slice(0, 4)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  title = title.replace(/[\\/:*?"<>|]/g, '_');
  return { files, font, title, encoding: await detectEncoding(top), size: files.reduce((n, f) => n + f.file.size, 0) };
}

// The engine assumes GBK unless told, so read the script: UTF-8 if it decodes as UTF-8,
// otherwise Shift JIS. nscript.dat is XORed with 0x84; encrypted scripts count as Shift JIS.
async function detectEncoding(top) {
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const scripts = top.filter(f => /^\d+\.txt$/i.test(f.path) || f.path.toLowerCase() === 'nscript.dat');
  if (!scripts.length) return 'sjis';
  try {
    for (const f of scripts) {
      let bytes = new Uint8Array(await f.file.arrayBuffer());
      if (f.path.toLowerCase() === 'nscript.dat') bytes = bytes.map(b => b ^ 0x84);
      utf8.decode(bytes);
    }
    return 'utf8';
  } catch {
    return 'sjis';
  }
}

function bytes(n) {
  if (n >= 1 << 30) return (n / (1 << 30)).toFixed(1) + ' GB';
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MB';
  return Math.max(1, Math.round(n / 1024)) + ' KB';
}

// ---------- .zip, just enough for save files ----------

const CRC = new Uint32Array(256).map((_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n; });
const crc32 = d => { let c = -1; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };

function dosTime(d) {
  return { time: d.getHours() << 11 | d.getMinutes() << 5 | d.getSeconds() >> 1, date: (d.getFullYear() - 1980) << 9 | (d.getMonth() + 1) << 5 | d.getDate() };
}

// Stored, not deflated: save files are small and mostly incompressible anyway.
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.path), crc = crc32(f.data), { time, date } = dosTime(f.mtime || new Date());
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x800, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, name.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x800, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, off, true);
    parts.push(lh, name, f.data);
    central.push(ch, name);
    off += 30 + name.length + f.data.length;
  }
  const size = central.reduce((n, p) => n + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

async function readZip(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const count = v.getUint16(e + 10, true), out = [];
  const utf8 = new TextDecoder(), sjis = new TextDecoder('shift_jis');
  for (let i = 0, p = v.getUint32(e + 16, true); i < count; i++) {
    const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const path = (flags & 0x800 ? utf8 : sjis).decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (path.endsWith('/')) continue;
    const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true);
    let data = u8.slice(start, start + csize);
    if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else if (method !== 0) continue;
    out.push({ path, data });
  }
  return out;
}

// ---------- the window ----------

function open() {
  let game = null;      // what's loaded: { files, font, title, size }
  let frame = null;     // the running player
  let skip = false;
  let showText = false;
  const flags = new Set(store.get(FLAGS, []));

  const player = () => frame && frame.contentWindow && frame.contentWindow.listSaves ? frame.contentWindow : null;

  // Welcome page, drawn like a 95 Setup wizard.
  const dropBox = h('div', { class: 'cons-drop' }, icon('i-folder-open'),
    h('b', null, 'Drag a game folder here'),
    h('span', null, 'the one with 0.txt, 00.txt or nscript.dat in it'));
  const keepText = h('span');
  const keepBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => askKeep(true) }, h('span', { html: '<u>K</u>eep Saves...' }));
  const keep = h('div', { class: 'cons-keep' }, icon('i-drive'), keepText, keepBtn);
  const welcome = h('div', { class: 'cons-welcome' },
    h('div', { class: 'cons-side', 'aria-hidden': 'true' },
      h('div', { class: 'cons-art', html: ART }),
      h('span', null, 'CON', h('b', null, 'scripter'))),
    h('div', { class: 'cons-main' },
      h('h2', null, 'Welcome to CONscripter'),
      h('p', null, 'CONscripter plays NScripter visual novels. Open a game folder from your computer to start. The game is read from your disk and never leaves this computer.'),
      dropBox,
      h('div', { class: 'cons-btns' },
        h('button', { class: 'btn default', type: 'button', onclick: openPicked }, h('span', { html: 'Open <u>F</u>older...' })),
        h('button', { class: 'btn', type: 'button', onclick: () => launch('help', 'CONscripter') }, h('span', { html: '<u>H</u>elp' }))),
      h('fieldset', { class: 'group cons-warn' },
        h('legend', null, 'Your saves'),
        h('div', { class: 'cons-warn-row' }, icon('i-warn'),
          h('p', null, 'Saves are kept only in this browser. ', h('b', null, 'Clearing browsing data, cookies or site data erases them'),
            ', and so does closing a private window. Some browsers also clean up sites you haven\'t visited in a while. Use ',
            h('b', null, 'File > Export Saves'), ' to keep a copy.')),
        keep)));

  // Laid over the top of the game when it starts, once per visit, and gone after a few seconds.
  const tip = h('div', { class: 'cons-tip', role: 'status', hidden: true }, icon('i-warn'),
    h('span', null, 'Saves live only in this browser, and clearing site data erases them. To keep a copy, choose ',
      h('b', null, 'File > Export Saves'), '. ', h('b', null, 'Import Saves'), ' loads the .zip back in.'),
    h('button', { class: 'cons-tip-never', type: 'button', onclick: () => { store.set(NO_TIP, true); hideTip(); frame && frame.focus(); } }, "Don't show again"),
    h('button', { class: 'cons-tip-x', type: 'button', title: 'Close', 'aria-label': 'Close', onclick: () => { hideTip(); frame && frame.focus(); } }, icon('i-x')));
  let tipTimer = 0;
  function hideTip() { clearTimeout(tipTimer); tip.hidden = true; tip.classList.remove('going'); }
  function showTip() {
    tipShown = true;
    tip.hidden = false;
    tip.classList.remove('going');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tip.classList.add('going'); tipTimer = setTimeout(hideTip, 300); }, 3000);
  }

  const view = h('div', { class: 'cons-view' }, welcome);
  const statusText = h('span', null, 'Ready');
  const statusGame = h('span', { class: 'cons-size' }, '');
  const statusSaves = h('span', { class: 'cons-saves' }, icon('i-floppy'), 'Saves: this browser');
  const status = h('div', { class: 'statusbar' }, statusText, statusGame, statusSaves);
  const say = t => { statusText.textContent = t; };

  // Full screen takes the whole page, not just the game's frame, so the menus and
  // message boxes can still show. The menu bar hides at the top until wanted.
  const canFull = !!document.documentElement.requestFullscreen;
  const isFull = () => win.el.classList.contains('cons-full');
  function fullScreen() {
    if (isFull()) { document.exitFullscreen().catch(() => {}); return; }
    if (!frame || !canFull) return;
    win.focus();
    document.documentElement.requestFullscreen().then(() => {
      win.el.classList.add('cons-full');
      fsBtn.lastChild.textContent = 'Exit Full Screen';
      frame && frame.focus();
    }, () => {});
  }
  function leftFull() {
    if (document.fullscreenElement || !isFull()) return;
    win.el.classList.remove('cons-full');
    root.classList.remove('reveal');
    fsBtn.lastChild.textContent = 'Full Screen';
  }
  document.addEventListener('fullscreenchange', leftFull);

  function setFlag(f) {
    if (flags.has(f)) flags.delete(f); else flags.add(f);
    store.set(FLAGS, [...flags]);
    if (frame) say('Restart the game to use the new engine flags');
  }

  // The bits of the run that don't come from flags: --goto, --load.
  async function restartAt() {
    const label = await inputbox({ title: 'Restart at Label', parent: win, label: 'Start the game at this label (without the *):' });
    if (label && label.trim()) boot(game, ['--goto', label.trim().replace(/^\*/, '')]);
  }
  async function restartSlot() {
    const n = await inputbox({ title: 'Restart from Save Slot', parent: win, label: 'Load this save slot as the game starts:', value: '1' });
    if (n == null) return;
    if (!/^\d+$/.test(n.trim())) return msgbox({ title: 'Restart from Save Slot', icon: 'error', parent: win, text: 'Give a slot number, like 1.' });
    boot(game, ['--load', n.trim()]);
  }

  async function saveEditor() {
    const p = player();
    if (!p) return;
    await p.flush_save();
    openSaveEditor({ parent: win, game, files: p.listSaves(), onSave: async (files, slot) => {
      if (files.length && player()) await player().writeSaves(files);
      boot(game, slot != null ? ['--load', String(slot)] : []);
      say(files.length ? `Saved changes to ${files.length} file${files.length === 1 ? '' : 's'}` : 'Restarted');
    } });
  }

  async function dumpVars() {
    const p = player();
    if (!p) return;
    say('Dumping variables...');
    const text = await p.dumpVars();
    say('Playing ' + game.title);
    if (text == null) return msgbox({ title: 'Dump Variables', icon: 'error', parent: win, text: 'The engine didn\'t write the variables. It only does between pages; click to the next line and try again.' });
    launch('notepad', { name: game.title + ' variables.txt', text: text.replace(/\r?\n/g, '\n') });
  }

  function engineLog() {
    const p = player();
    if (!p) return;
    const lines = p.engineLog;
    launch('notepad', { name: game.title + ' log.txt', text: lines.length ? lines.join('\n') : '(The engine hasn\'t printed anything. Turn on Debug Output in Engine Flags for more.)' });
  }

  async function storageUsed() {
    const s = navigator.storage;
    if (!s || !s.estimate) return msgbox({ title: 'Storage Used', icon: 'info', parent: win, text: 'This browser doesn\'t say how much space the site uses.' });
    const [{ usage, quota }, kept] = await Promise.all([s.estimate(), s.persisted ? s.persisted() : false]);
    msgbox({ title: 'Storage Used', icon: 'info', parent: win,
      text: `This site is using ${bytes(usage || 0)} of the ${bytes(quota || 0)} the browser allows it.\n\n` +
        (kept ? 'The browser has agreed not to clear it on its own.' : 'The browser may clear it on its own if it runs low on space.') });
  }

  async function deleteSaves() {
    const p = player();
    if (!p) return;
    const b = await msgbox({ title: 'Delete Saves', icon: 'warn', parent: win, buttons: ['&Yes', '&No'],
      text: `Delete every save of ${game.title} in this browser, and its global data, then restart it?\n\nThis can't be undone. Export Saves first to keep a copy.` });
    if (b !== 'Yes' || !player()) return;
    await player().clearSaves();
    boot(game);
    say('Deleted the saves');
  }

  async function clearAll() {
    const b = await msgbox({ title: 'Clear All Site Data', icon: 'warn', parent: win, buttons: ['&Yes', '&No'],
      text: 'Erase everything this site keeps in this browser?\n\nThat is the saves of every game, and every setting: display, Minesweeper and Solitaire, tips. The page reloads after.\n\nThis can\'t be undone.' });
    if (b !== 'Yes') return;
    if (frame) { frame.remove(); frame = null; } // its open save database would hold up the delete
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    const dbs = indexedDB.databases ? await indexedDB.databases().catch(() => []) : [];
    await Promise.all(dbs.map(d => new Promise(res => {
      const r = indexedDB.deleteDatabase(d.name);
      r.onsuccess = r.onerror = r.onblocked = res;
    })));
    location.reload();
  }

  const bar = menubar([
    { label: '&File', items: () => [
      { label: 'Open &Folder...', key: 'Ctrl+O', action: openPicked },
      '-',
      { label: '&Export Saves...', disabled: !player(), action: exportSaves },
      { label: '&Import Saves...', disabled: !player(), action: importSaves },
      '-',
      { label: '&Close Game', disabled: !frame, action: () => confirmQuit().then(ok => ok && stop('Ready')) },
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Game', items: () => [
      { label: 'Game &Menu', key: 'Esc', disabled: !player(), action: () => { player().pressEsc(); frame.focus(); } },
      { label: '&Skip Text', key: 'Ctrl', checked: skip, disabled: !player(), action: () => { skip = !skip; player().setSkip(skip); frame.focus(); } },
      '-',
      { label: '&Restart', disabled: !game, action: () => game && boot(game) },
      { label: isFull() ? 'Exit &Full Screen' : '&Full Screen', disabled: !frame || !canFull, action: fullScreen },
    ] },
    { label: '&Debug', items: () => [
      { label: 'Engine &Flags', submenu: FLAG_LIST.map(f => f === '-' ? f : { label: f.label, checked: flags.has(f.flag), action: () => setFlag(f.flag) }) },
      { label: 'Restart at &Label...', disabled: !game, action: restartAt },
      { label: 'Restart from Save &Slot...', disabled: !game, action: restartSlot },
      '-',
      { label: 'Save &Editor...', disabled: !player(), action: saveEditor },
      { label: 'Dump &Variables', disabled: !player(), action: dumpVars },
      { label: 'Engine L&og', disabled: !player(), action: engineLog },
      { label: 'Show &Text Overlay', checked: showText, disabled: !player(), action: () => { showText = !showText; player().showText(showText); frame.focus(); } },
      '-',
      { label: 'Storage &Used...', action: storageUsed },
      { label: '&Reset Tips', disabled: !store.get(NO_TIP, false), action: () => { store.set(NO_TIP, false); tipShown = false; say('Tips will show again'); } },
      { label: '&Delete This Game\'s Saves...', disabled: !player(), action: deleteSaves },
      { label: '&Clear All Site Data...', action: clearAll },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help', 'CONscripter') }, '-',
      { label: '&About CONscripter', action: () => about('CONscripter', 'i-game', win) },
    ] },
  ]);

  const fsBtn = h('button', { class: 'cons-fs', type: 'button', title: 'Full Screen', disabled: true, onclick: fullScreen }, icon('i-max'), 'Full Screen');
  bar.append(fsBtn);

  // In full screen: point at (or click) the top edge for the menu bar.
  const hot = h('div', { class: 'cons-hot', 'aria-hidden': 'true' });
  let hideTimer = 0;
  const reveal = () => { clearTimeout(hideTimer); root.classList.add('reveal'); };
  hot.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') reveal(); });
  hot.addEventListener('click', reveal);
  bar.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  bar.addEventListener('pointerleave', () => { hideTimer = setTimeout(() => root.classList.remove('reveal'), 400); });

  const root = h('div', { class: 'cons' }, hot, bar, view, status);

  // Ask the browser not to evict saves on its own. Clearing site data still erases them.
  function showKeep(kept, refused) {
    keep.classList.toggle('kept', !!kept);
    keepBtn.hidden = !!kept || !(storage && storage.persist);
    keepText.textContent = kept ? 'This browser has agreed not to clear saves on its own.'
      : refused ? 'The browser said no. Bookmarking this site makes it more likely to agree.'
      : 'This browser may also clear saves on its own when it runs low on space. Ask it to keep them.';
    statusSaves.title = kept ? 'Saves are in this browser, protected from automatic cleanup' : 'Saves are in this browser and may be cleared automatically';
  }
  const storage = navigator.storage;
  if (storage && storage.persisted) storage.persisted().then(showKeep, () => showKeep(null)); else showKeep(null);
  function askKeep(asked) {
    if (storage && storage.persist && !keep.classList.contains('kept')) storage.persist().then(k => showKeep(k, asked && !k), () => {});
  }

  function stop(msg) {
    if (frame) frame.remove();
    frame = null; skip = false;
    view.classList.remove('playing');
    fsBtn.disabled = true;
    if (isFull()) document.exitFullscreen().catch(() => {});
    hideTip();
    view.replaceChildren(welcome);
    win.setTitle('CONscripter');
    statusGame.textContent = '';
    say(msg);
  }

  // args: engine options for this run only (--goto, --load).
  function boot(g, args = []) {
    if (frame) frame.remove();
    game = g; skip = false;
    frame = h('iframe', { class: 'cons-frame', title: g.title, src: 'cons/player.html', allow: 'fullscreen; autoplay' });
    const me = frame;
    frame.addEventListener('load', () => {
      const w = frame.contentWindow;
      w.onGameDrop = takeDrop;
      w.showText(showText);
      w.start({
        files: g.files, title: g.title, font: g.font, encoding: g.encoding, args: [...flags, ...args],
        onExit: code => { if (frame !== me) return; stop(code ? 'The game stopped (exit code ' + code + ')' : 'The game has ended'); },
        onError: msg => { if (frame !== me) return; stop('The game stopped'); msgbox({ title: 'CONscripter', icon: 'error', parent: win, text: 'CONscripter has stopped.\n\n' + msg }); },
      }).catch(err => { stop('Ready'); msgbox({ title: 'CONscripter', icon: 'error', parent: win, text: 'The game could not be started.\n\n' + err }); });
      frame.focus();
    }, { once: true });
    view.classList.add('playing');
    fsBtn.disabled = !canFull;
    askKeep();
    view.replaceChildren(frame, tip);
    if (!tipShown && !store.get(NO_TIP, false)) showTip();
    win.setTitle(g.title + ' - CONscripter');
    statusGame.textContent = g.files.length.toLocaleString('en-US') + ' files, ' + bytes(g.size);
    say('Playing ' + g.title);
  }

  async function confirmQuit() {
    if (!frame) return true;
    const b = await msgbox({ title: 'CONscripter', icon: 'question', parent: win, buttons: ['&Yes', '&No'],
      text: `Quit ${game.title}?\n\nAnything you haven't saved in the game will be lost.` });
    if (b === 'Yes') { const p = player(); if (p) await p.flush_save(); return true; }
    return false;
  }

  async function load(list) {
    if (!list.length) return;
    say('Reading files...');
    const g = await findGame(list);
    if (!g) {
      say(frame ? 'Playing ' + game.title : 'Ready');
      const zip = list.some(f => /\.(zip|7z|rar)$/i.test(f.path));
      return msgbox({ title: 'CONscripter', icon: 'error', parent: win,
        text: zip ? 'That looks like an archive. Extract it first, then open the folder.'
          : 'There is no NScripter game here.\n\nCONscripter looks for a folder with 0.txt, 00.txt or nscript.dat in it.' });
    }
    if (!g.font) {
      say(frame ? 'Playing ' + game.title : 'Ready');
      return msgbox({ title: 'CONscripter', icon: 'error', parent: win,
        text: `${g.title} has no font.\n\nPut a default.ttf next to the game's script and open it again.` });
    }
    if (!(await confirmQuit())) { say('Playing ' + game.title); return; }
    boot(g);
  }

  async function openPicked() { load(await pickFolder()); }
  function takeDrop(dt) { const p = fromDrop(dt); win.focus(); p.then(load); }

  async function exportSaves() {
    const p = player();
    if (!p) return;
    await p.flush_save();
    const files = p.listSaves();
    if (!files.length) return msgbox({ title: 'Export Saves', icon: 'info', parent: win, text: `${game.title} has no saves yet.` });
    download(game.title + ' saves.zip', makeZip(files));
    say(`Exported ${files.length} save file${files.length === 1 ? '' : 's'}`);
  }

  async function importSaves() {
    if (!player()) return;
    const [picked] = await new Promise(resolve => {
      const input = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true });
      input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
      input.addEventListener('cancel', () => { resolve([]); input.remove(); });
      document.body.append(input);
      input.click();
    });
    if (!picked) return;
    let files;
    try {
      // Zips from CONscripter's own web page keep the full /onsyuri_save/<game>/ path.
      files = (await readZip(await picked.arrayBuffer())).map(f => {
        const m = f.path.match(/(?:^|\/)onsyuri_save\/[^/]+\/(.+)$/);
        return { ...f, path: (m ? m[1] : f.path).replace(/^\/+/, '') };
      }).filter(f => f.path && !f.path.split('/').includes('..'));
    } catch {
      return msgbox({ title: 'Import Saves', icon: 'error', parent: win, text: `${picked.name} is not a .zip file that CONscripter can read.` });
    }
    if (!files.length) return msgbox({ title: 'Import Saves', icon: 'info', parent: win, text: `There are no save files in ${picked.name}.` });
    const b = await msgbox({ title: 'Import Saves', icon: 'warn', parent: win, buttons: ['&Yes', '&No'],
      text: `Import ${files.length} save file${files.length === 1 ? '' : 's'} into ${game.title}?\n\nSaves with the same names are replaced, and the game restarts.` });
    if (b !== 'Yes') return;
    await player().writeSaves(files);
    boot(game);
    say(`Imported ${files.length} save file${files.length === 1 ? '' : 's'}`);
  }

  root.addEventListener('dragover', e => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropBox.classList.add('over');
  });
  root.addEventListener('dragleave', e => { if (!root.contains(e.relatedTarget)) dropBox.classList.remove('over'); });
  root.addEventListener('drop', e => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    dropBox.classList.remove('over');
    takeDrop(e.dataTransfer);
  });
  root.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openPicked(); }
  });

  const win = createWindow({
    app: 'cons', title: 'CONscripter', icon: 'i-game', body: root,
    width: 660, height: 540, minW: 320, minH: 260, route: 'cons',
    onClose: confirmQuit,
    onClosed: () => { document.removeEventListener('fullscreenchange', leftFull); if (isFull()) document.exitFullscreen().catch(() => {}); },
  });
  return win;
}

export default { id: 'cons', title: 'CONscripter', icon: 'i-game', single: true, open };
