// CONscripter: plays an NScripter visual novel from a folder the visitor drops in.
// The engine runs in a frame (cons/player.html) that reads the files straight off
// their disk, so nothing is uploaded. Saves stay in this browser, can be exported to
// a .zip and imported again, and with Google Drive sync on, are copied to the
// visitor's Drive (consdrive.js) as the game saves them.

import { h, icon, download, store } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar, openMenu } from '../menu.js';
import { msgbox, inputbox, about } from '../dialogs.js';
import { openSaveEditor } from './conssave.js';
import * as drive from './consdrive.js';

const NO_TIP = 'w95.cons.notip';
const FLAGS = 'w95.cons.flags';
const RECENT = 'w95.cons.recent';
const MAX_RECENT = 6;

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

// Google Drive's logo, for the sync button and the offer on the welcome page.
const DRIVE_LOGO = `<svg viewBox="0 0 87.3 78" aria-hidden="true"><path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"/><path fill="#00ac47" d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"/><path fill="#ea4335" d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"/><path fill="#00832d" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"/><path fill="#2684fc" d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/><path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"/></svg>`;
const driveLogo = cls => h('span', { class: 'drive-logo ' + (cls || ''), html: DRIVE_LOGO });

const SCRIPTS = ['0.txt', '00.txt', 'nscript.dat', 'nscr_sec.dat', 'onscript.nt', 'onscript.nt2', 'onscript.nt3', 'nscript.___'];

// ---------- reading what the visitor gave us ----------

// Call straight from the drop handler: the entries have to be taken before anything awaits.
// Resolves to { list, handle }; handle is the dropped folder, where the browser can keep it.
function fromDrop(dt) {
  const items = [...dt.items];
  const handle = items.length === 1 && items[0].getAsFileSystemHandle ? items[0].getAsFileSystemHandle().catch(() => null) : null;
  const entries = items.map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  const loose = entries.length ? [] : [...dt.files].map(file => ({ path: file.name, file }));
  const list = (async () => {
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
  return Promise.all([list, handle]).then(([list, handle]) => ({ list, handle: handle && handle.kind === 'directory' ? handle : null }));
}

// Resolves to { handle } where the browser hands out folders it can keep (Chrome, Edge),
// otherwise to { list }.
async function pickFolder() {
  if (window.showDirectoryPicker) {
    try {
      return { handle: await showDirectoryPicker({ id: 'cons', mode: 'read' }) };
    } catch (e) {
      if (e.name === 'AbortError') return { list: [] };
    }
  }
  return new Promise(resolve => {
    const input = h('input', { type: 'file', multiple: true, hidden: true });
    input.webkitdirectory = true;
    input.addEventListener('change', () => {
      resolve({ list: [...input.files].map(file => ({ path: file.webkitRelativePath || file.name, file })) });
      input.remove();
    });
    input.addEventListener('cancel', () => { resolve({ list: [] }); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

async function walkHandle(dir) {
  const out = [];
  async function walk(d, prefix) {
    for await (const e of d.values()) {
      if (e.kind === 'file') out.push({ path: prefix + e.name, file: await e.getFile() });
      else await walk(e, prefix + e.name + '/');
    }
  }
  await walk(dir, dir.name + '/');
  return out;
}

// ---------- recent games ----------

// The list is [{ title, at, folder }], newest first. folder: the browser kept the folder
// itself (in IndexedDB, under the title), so the game opens again without picking it.
const recentGames = () => store.get(RECENT, []);

function folders(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cons-folders', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('folders');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('folders', mode), r = fn(tx.objectStore('folders'));
      tx.oncomplete = () => { db.close(); resolve(r && r.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}

function remember(title, handle) {
  const list = [{ title, at: Date.now(), folder: !!handle }, ...recentGames().filter(r => r.title !== title)];
  store.set(RECENT, list.slice(0, MAX_RECENT));
  folders('readwrite', s => {
    if (handle) s.put(handle, title); else s.delete(title);
    for (const r of list.slice(MAX_RECENT)) s.delete(r.title);
  }).catch(() => {});
}

function forget(title) {
  store.set(RECENT, recentGames().filter(r => r.title !== title));
  folders('readwrite', s => { s.delete(title); }).catch(() => {});
}

const hhmm = t => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function when(t) {
  const d = new Date(t), now = new Date(), day = 864e5;
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= midnight) return 'Today ' + hhmm(t);
  if (t >= midnight - day) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
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
  const named = !!root.split('/').filter(Boolean).length;
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
  return { files, font, title, named, encoding: await detectEncoding(top), size: files.reduce((n, f) => n + f.file.size, 0) };
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

  // Google Drive sync (further down)
  let syncState = '';   // '', 'busy', 'ok', 'signin' (waiting for a sign-in), 'error'
  let syncMsg = '', syncAt = 0;
  let syncTimer = 0;    // a sync waiting for the game to finish saving
  let declined = null;  // the frame whose newer saves from Drive the visitor chose not to load
  let own = 0;          // our own writes into the saves, which aren't new saves to copy
  const quietly = async fn => { own++; try { return await fn(); } finally { own--; } };
  let chain = Promise.resolve(), waiting = null;

  const player = () => frame && frame.contentWindow && frame.contentWindow.listSaves ? frame.contentWindow : null;

  // Welcome page, drawn like a 95 Setup wizard.
  const dropBox = h('div', { class: 'cons-drop' }, icon('i-folder-open'),
    h('b', null, 'Drag a game folder here'),
    h('span', null, 'the one with 0.txt, 00.txt or nscript.dat in it'));
  const keepText = h('span');
  const keepBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => askKeep(true) }, h('span', { html: '<u>K</u>eep Saves...' }));
  const keep = h('div', { class: 'cons-keep' }, icon('i-drive'), keepText, keepBtn);
  const warnRow = h('div', { class: 'cons-warn-row' });
  const driveText = h('span');
  const driveSignIn = h('button', { class: 'btn', type: 'button', onclick: () => signInAgain() }, h('span', { html: '<u>S</u>ign In' }));
  const driveBtn = h('button', { class: 'btn', type: 'button', onclick: () => drive.enabled() ? driveOff() : driveOn() });
  const driveRow = h('div', { class: 'cons-keep cons-drive', hidden: !drive.available }, icon('i-globe'), driveText,
    h('div', { class: 'cons-drive-btns' }, driveSignIn, driveBtn));
  // While sync is off: an offer to turn it on, under the Open Folder button.
  const promo = h('button', { class: 'cons-promo', type: 'button', hidden: true, onclick: () => driveOn() },
    driveLogo(),
    h('span', { class: 'cons-promo-text' },
      h('b', null, 'Now offering Google Drive sync!'),
      h('span', null, 'Keep your saves safe, and carry on playing on any computer. Click to turn it on.')));
  const recentRows = h('div', { class: 'cons-recent-list' });
  const recentBox = h('fieldset', { class: 'group cons-recent' }, h('legend', null, 'Recent games'), recentRows);

  function showRecent() {
    const list = recentGames();
    recentBox.hidden = !list.length;
    recentRows.replaceChildren(...list.map(r => {
      const row = h('button', { class: 'cons-recent-item', type: 'button', onclick: () => openRecent(r),
        title: r.folder ? 'Open ' + r.title : 'Choose the ' + r.title + ' folder again to open it' },
      icon('i-folder'), h('span', { class: 'cons-recent-name' }, r.title), h('span', { class: 'cons-recent-at' }, when(r.at)));
      row.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        openMenu([
          { label: '&Open', action: () => openRecent(r) },
          { label: '&Remove from List', action: () => { forget(r.title); showRecent(); } },
        ], { x: e.clientX, y: e.clientY });
      });
      return row;
    }));
  }
  showRecent();
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
      promo,
      recentBox,
      h('fieldset', { class: 'group cons-warn' },
        h('legend', null, 'Your saves'),
        warnRow, keep, driveRow)));

  // Laid over the top of the game when it starts, once per visit, and gone after a few seconds.
  // kind 'local': saves are only here, for a few seconds. 'signin': Drive sync is
  // waiting for a sign-in, until it's done or closed.
  const tipText = h('span');
  const tipBtn = h('button', { class: 'cons-tip-never', type: 'button', onclick: () => {
    if (tipKind === 'signin') syncSaves({ interactive: true }); else store.set(NO_TIP, true);
    hideTip(); frame && frame.focus();
  } });
  const tip = h('div', { class: 'cons-tip', role: 'status', hidden: true }, icon('i-warn'), tipText, tipBtn,
    h('button', { class: 'cons-tip-x', type: 'button', title: 'Close', 'aria-label': 'Close', onclick: () => { hideTip(); frame && frame.focus(); } }, icon('i-x')));
  let tipTimer = 0, tipKind = '';
  function hideTip() { clearTimeout(tipTimer); tip.hidden = true; tip.classList.remove('going'); tipKind = ''; }
  function showTip(kind = 'local') {
    tipKind = kind;
    if (kind === 'signin') {
      tipText.replaceChildren('Google Drive sync needs you to sign in again. Until then, saves stay only in this browser.');
      tipBtn.textContent = 'Sign In';
    } else {
      tipShown = true;
      tipText.replaceChildren('Saves live only in this browser, and clearing site data erases them. To keep a copy, choose ',
        h('b', null, 'File > Export Saves'), '. ', h('b', null, 'Import Saves'), ' loads the .zip back in.',
        ...(drive.available ? [' Or turn on ', h('b', null, 'File > Sync with Google Drive'), '.'] : []));
      tipBtn.textContent = "Don't show again";
    }
    tip.hidden = false;
    tip.classList.remove('going');
    clearTimeout(tipTimer);
    if (kind === 'local') tipTimer = setTimeout(() => { tip.classList.add('going'); tipTimer = setTimeout(hideTip, 300); }, drive.available ? 4500 : 3000);
  }

  const view = h('div', { class: 'cons-view' }, welcome);
  const statusText = h('span', null, 'Ready');
  const statusGame = h('span', { class: 'cons-size' }, '');
  const statusSaves = h('span', { class: 'cons-saves', onclick: () => {
    if (!drive.enabled()) return;
    if (player()) syncSaves({ interactive: true, report: true }); else if (!drive.signedIn()) signInAgain();
  } });
  // With Drive sync on offer, its button on the menu bar says where saves are instead.
  const status = h('div', { class: 'statusbar' }, statusText, statusGame, drive.available ? null : statusSaves);
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
    const synced = drive.enabled();
    const b = await msgbox({ title: 'Delete Saves', icon: 'warn', parent: win, buttons: ['&Yes', '&No'],
      text: `Delete every save of ${game.title} in this browser${synced ? ' and in your Google Drive' : ''}, and its global data, then restart it?\n\nThis can't be undone. Export Saves first to keep a copy.` });
    if (b !== 'Yes' || !player()) return;
    if (synced) {
      say('Deleting the saves from Google Drive...');
      try {
        await chain;
        await drive.remove(game.title, true);
      } catch (e) {
        idle();
        return msgbox({ title: 'Delete Saves', icon: 'error', parent: win,
          text: `The saves of ${game.title} could not be deleted from Google Drive, so the ones in this browser were kept too.\n\n${e.message}` });
      }
    }
    await quietly(() => player().clearSaves());
    boot(game);
    say('Deleted the saves');
  }

  async function clearAll() {
    const b = await msgbox({ title: 'Clear All Site Data', icon: 'warn', parent: win, buttons: ['&Yes', '&No'],
      text: 'Erase everything this site keeps in this browser?\n\nThat is the saves of every game, and every setting: display, Minesweeper and Solitaire, tips. The page reloads after.' +
        (drive.enabled() ? ' Google Drive sync is turned off, and the copies in your Google Drive are kept.' : '') + '\n\nThis can\'t be undone.' });
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
      ...(drive.available ? ['-',
        { label: drive.enabled() ? 'Turn Off &Google Drive Sync...' : 'Sync with &Google Drive...', action: () => drive.enabled() ? driveOff() : driveOn() },
        { label: '&Sync Now', disabled: !player() || !drive.enabled(), action: () => syncSaves({ interactive: true, report: true }) }] : []),
      '-',
      { label: '&Close Game', disabled: !frame, action: () => confirmQuit().then(ok => ok && stop('Ready')) },
      '-',
      ...recentGames().map((r, i) => ({ label: `&${i + 1} ${r.title.length > 40 ? r.title.slice(0, 38) + '...' : r.title}`, action: () => openRecent(r) })),
      ...(recentGames().length ? ['-'] : []),
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
  const syncLabel = h('span', { class: 'cons-sync-label' });
  const syncBtn = h('button', { class: 'cons-fs cons-sync', type: 'button', onclick: syncMenu }, driveLogo(), syncLabel);
  if (drive.available) bar.append(syncBtn);
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
    keepTitle = kept ? 'Saves are in this browser, protected from automatic cleanup' : 'Saves are in this browser and may be cleared automatically';
    showSaves();
  }
  let keepTitle = '';
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
    showRecent();
    view.replaceChildren(welcome);
    win.setTitle('CONscripter');
    statusGame.textContent = '';
    showSaves();
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
      w.onSaved = () => { if (frame === me) savedSoon(); };
      w.showText(showText);
      w.start({
        files: g.files, title: g.title, font: g.font, encoding: g.encoding, args: [...flags, ...args],
        beforeRun: () => frame === me && syncSaves({ w, starting: true }),
        onExit: code => { if (frame !== me) return; stop(code ? 'The game stopped (exit code ' + code + ')' : 'The game has ended'); },
        onError: msg => { if (frame !== me) return; stop('The game stopped'); msgbox({ title: 'CONscripter', icon: 'error', parent: win, text: 'CONscripter has stopped.\n\n' + msg }); },
      }).catch(err => { stop('Ready'); msgbox({ title: 'CONscripter', icon: 'error', parent: win, text: 'The game could not be started.\n\n' + err }); });
      frame.focus();
    }, { once: true });
    view.classList.add('playing');
    fsBtn.disabled = !canFull;
    askKeep();
    view.replaceChildren(frame, tip);
    if (drive.enabled()) {
      if (syncState === 'signin' && !drive.signedIn()) showTip('signin');
    } else if (!tipShown && !store.get(NO_TIP, false)) showTip();
    win.setTitle(g.title + ' - CONscripter');
    statusGame.textContent = g.files.length.toLocaleString('en-US') + ' files, ' + bytes(g.size);
    say('Playing ' + g.title);
  }

  async function confirmQuit() {
    if (!frame) return true;
    const b = await msgbox({ title: 'CONscripter', icon: 'question', parent: win, buttons: ['&Yes', '&No'],
      text: `Quit ${game.title}?\n\nAnything you haven't saved in the game will be lost.` });
    if (b !== 'Yes') return false;
    const p = player();
    if (p) await p.flush_save();
    if (p && drive.enabled()) {
      say('Copying saves to Google Drive...');
      await syncSaves({ leaving: true });
    }
    return true;
  }

  const idle = () => say(frame ? 'Playing ' + game.title : 'Ready');

  // From a folder handle, or a list of files already read.
  async function load({ list, handle }) {
    if (list && !list.length) return;
    say('Reading files...');
    if (!list) {
      try {
        list = await walkHandle(handle);
      } catch (e) {
        idle();
        return msgbox({ title: 'CONscripter', icon: 'error', parent: win, text: `The folder ${handle.name} could not be read.\n\n${e.message}` });
      }
    }
    const g = await findGame(list);
    if (!g) {
      idle();
      const zip = list.some(f => /\.(zip|7z|rar)$/i.test(f.path));
      return msgbox({ title: 'CONscripter', icon: 'error', parent: win,
        text: zip ? 'That looks like an archive. Extract it first, then open the folder.'
          : 'There is no NScripter game here.\n\nCONscripter looks for a folder with 0.txt, 00.txt or nscript.dat in it.' });
    }
    if (!g.font) {
      idle();
      return msgbox({ title: 'CONscripter', icon: 'error', parent: win,
        text: `${g.title} has no font.\n\nPut a default.ttf next to the game's script and open it again.` });
    }
    if (!(await confirmQuit())) { say('Playing ' + game.title); return; }
    if (g.named) remember(g.title, handle);
    boot(g);
  }

  async function openPicked() { load(await pickFolder()); }
  function takeDrop(dt) { const p = fromDrop(dt); win.focus(); p.then(load); }

  // Opening the folder again, or asking to read it again, needs the click that got us here,
  // so nothing slow happens before.
  async function openRecent(r) {
    if (!r.folder) { say(`Choose the ${r.title} folder`); return openPicked(); }
    let handle = null;
    try { handle = await folders('readonly', s => s.get(r.title)); } catch {}
    if (!handle) return openPicked();
    let ok = await handle.queryPermission({ mode: 'read' }) === 'granted';
    if (!ok) ok = await handle.requestPermission({ mode: 'read' }).then(p => p === 'granted', () => false);
    if (!ok) return say('Ready');
    if (await handle.values().next().then(() => false, e => e.name === 'NotFoundError')) {
      const b = await msgbox({ title: 'CONscripter', icon: 'error', parent: win, buttons: ['&Yes', '&No'],
        text: `The ${r.title} folder isn't there anymore. It may have been moved, renamed or deleted.\n\nRemove it from the recent games?` });
      if (b === 'Yes') { forget(r.title); showRecent(); }
      return;
    }
    load({ handle });
  }

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

  // ---------- Google Drive sync ----------

  // The saves box on the welcome page, and the saves panel of the status bar.
  function showSaves() {
    const on = drive.enabled(), a = drive.account(), who = a && a.email ? ` (${a.email})` : '';
    warnRow.replaceChildren(...(on
      ? [icon('i-info'), h('p', null, 'Saves are kept in this browser and copied to your Google Drive as you play. Open a game on any computer with sync on, and its saves come with it.')]
      : [icon('i-warn'), h('p', null, 'Saves are kept only in this browser. ', h('b', null, 'Clearing browsing data, cookies or site data erases them'),
        ', and so does closing a private window. Some browsers also clean up sites you haven\'t visited in a while. Use ',
        h('b', null, 'File > Export Saves'), ' to keep a copy' + (drive.available ? ', or sync them with Google Drive.' : '.'))]));
    const out = on && !drive.signedIn();
    driveText.textContent = !on ? 'Copy saves to your Google Drive, to keep them safe and carry on playing on another computer.'
      : out ? 'Google Drive sync is on. Sign in so games sync as they start.'
      : syncState === 'error' ? 'Google Drive sync is on, but the last sync failed: ' + syncMsg
      : 'Google Drive sync is on.' + (syncAt ? ' Last synced at ' + hhmm(syncAt) + '.' : '');
    driveSignIn.hidden = !out;
    driveRow.hidden = !on;
    promo.hidden = !drive.available || on;
    driveBtn.replaceChildren(h('span', { html: on ? 'Turn <u>O</u>ff' : 'Sync with <u>G</u>oogle Drive...' }));

    const [text, title] = !on ? ['Saves: this browser', keepTitle]
      : syncState === 'busy' ? ['Saves: syncing...', 'Copying saves to and from Google Drive']
      : syncState === 'signin' ? ['Saves: sign in to Drive', 'Google Drive sync needs you to sign in again. Click to sign in.']
      : syncState === 'error' ? ['Saves: not synced', syncMsg + ' Click to try again.']
      : ['Saves: Google Drive', 'Saves are in this browser and synced with Google Drive' + who + (syncAt ? ', last at ' + hhmm(syncAt) : '') + '. Click to sync now.'];
    statusSaves.replaceChildren(icon(on ? 'i-globe' : 'i-floppy'), text);
    statusSaves.title = title;
    statusSaves.classList.toggle('link', on);

    syncLabel.textContent = !on ? 'Drive Sync' : syncState === 'busy' ? 'Syncing...' : syncState === 'signin' || out ? 'Sign In'
      : syncState === 'error' ? 'Not Synced' : 'Synced';
    syncBtn.title = !on ? 'Google Drive sync is off. Click to turn it on.' : title.replace(/ Click to.*$/, '');
    syncBtn.classList.toggle('off', !on);
    syncBtn.classList.toggle('warn', on && (syncState === 'signin' || syncState === 'error' || out));
  }

  // The menu bar's sync button: turns sync on, or drops down what it can do.
  function syncMenu() {
    if (!drive.enabled()) return driveOn();
    const a = drive.account(), r = syncBtn.getBoundingClientRect(), out = !drive.signedIn();
    openMenu([
      { label: a && a.email ? 'Syncing as ' + a.email : 'Google Drive sync is on', disabled: true },
      '-',
      { label: '&Sync Now', disabled: !player(), action: () => syncSaves({ interactive: true, report: true }) },
      ...(out ? [{ label: 'Sign &In...', action: signInAgain }] : []),
      { label: 'Turn &Off Google Drive Sync...', action: driveOff },
    ], { x: r.left, y: r.bottom });
  }

  function setSync(state, msg = '') {
    const was = syncState;
    syncState = state; syncMsg = msg;
    if (state === 'ok') syncAt = Date.now();
    showSaves();
    if (state === 'signin' && was !== 'signin' && frame) showTip('signin');
    if (state !== 'signin' && tipKind === 'signin') hideTip();
  }

  // One sync at a time; asking while one waits to run joins it.
  // starting: w is a frame whose engine hasn't started, so newer saves from Drive go
  //   straight in. Otherwise loading them means restarting the game, so it asks first.
  // leaving: the game is being closed: only copy to Drive.
  // interactive: from a click, so it may open Google's sign-in window, and errors are shown.
  function syncSaves(opts = {}) {
    if (!drive.enabled() || !game) return Promise.resolve();
    if (waiting && waiting.w === opts.w && !opts.leaving) {
      waiting.interactive = waiting.interactive || opts.interactive;
      waiting.report = waiting.report || opts.report;
      return waiting.p;
    }
    const job = waiting = { ...opts, title: game.title };
    job.p = chain = chain.then(() => { if (waiting === job) waiting = null; return runSync(job); });
    return job.p;
  }

  async function runSync({ w, title, starting, leaving, interactive, report }) {
    const p = w || player();
    if (!p || !drive.enabled() || (!w && game.title !== title)) return;
    clearTimeout(syncTimer); syncTimer = 0;
    setSync('busy');
    try {
      let job = drive.sync(title, p.listSaves(), interactive);
      // Don't hold the game back long if Drive is slow; newer saves come next sync.
      if (starting) job = Promise.race([job, new Promise((_, no) => setTimeout(() => no(new drive.DriveError('Google Drive took too long to answer.', 'net')), 15000))]);
      const newer = await job;
      if (newer.length && starting) {
        await quietly(() => p.writeSaves(newer));
        say(`Loaded ${newer.length} newer save file${newer.length === 1 ? '' : 's'} from Google Drive`);
      } else if (newer.length && !leaving && declined !== frame && player() === p) {
        const b = await msgbox({ title: 'Google Drive Sync', icon: 'question', parent: win, buttons: ['&Yes', '&No'],
          text: `Your Google Drive has newer saves of ${title}, from playing somewhere else.\n\nLoad them and restart the game? Anything you haven't saved here will be lost. If you don't, each save file keeps whichever copy was saved last.` });
        if (b === 'Yes' && player() === p) {
          await quietly(() => p.writeSaves(newer));
          boot(game);
        } else declined = frame;
      }
      setSync('ok');
      if (report) say('Synced with Google Drive');
    } catch (e) {
      const signin = e.kind === 'signin' || e.kind === 'popup';
      setSync(signin || e.kind === 'closed' || e.kind === 'denied' ? 'signin' : 'error', e.message);
      if (leaving) {
        msgbox({ title: 'Google Drive Sync', icon: 'warn',
          text: `Your latest saves of ${title} weren't copied to Google Drive.\n\n${e.message}\n\nThey're safe in this browser, and are copied the next time you play ${title} here.` });
      } else if (interactive && e.kind === 'popup') {
        const b = await msgbox({ title: 'Google Drive Sync', icon: 'warn', parent: win, buttons: ['OK', 'Cancel'],
          text: 'The browser blocked the Google sign-in window. Click OK to open it.' });
        if (b === 'OK') return runSync({ w, title, starting, interactive, report });
      } else if (interactive && e.kind !== 'closed') {
        msgbox({ title: 'Google Drive Sync', icon: 'error', parent: win, text: `${title} could not be synced with Google Drive.\n\n${e.message}` });
      }
    }
  }

  // The game saved. Copy it a few seconds later, once it's done saving; but if sync
  // needs a sign-in, do it now, while the click that saved still lets the window open.
  function savedSoon() {
    if (own || !drive.enabled()) return;
    clearTimeout(syncTimer);
    if (!drive.signedIn() && navigator.userActivation && navigator.userActivation.isActive) { syncTimer = 0; syncSaves(); return; }
    syncTimer = setTimeout(() => syncSaves(), 4000);
  }
  // Leaving the tab (or closing it) copies a save that's waiting, while there's time.
  function onHide() { if (document.hidden && syncTimer) syncSaves(); }
  document.addEventListener('visibilitychange', onHide);

  async function driveOn() {
    say('Signing in to Google...');
    try {
      await drive.connect();
    } catch (e) {
      idle();
      if (e.kind === 'popup') {
        const b = await msgbox({ title: 'Google Drive Sync', icon: 'warn', parent: win, buttons: ['OK', 'Cancel'],
          text: 'The browser blocked the Google sign-in window. Click OK to open it.' });
        return b === 'OK' && driveOn();
      }
      if (e.kind !== 'closed') msgbox({ title: 'Google Drive Sync', icon: 'error', parent: win, text: 'Google Drive sync could not be turned on.\n\n' + e.message });
      return;
    }
    syncState = ''; syncAt = 0;
    hideTip();
    showSaves();
    say('Google Drive sync is on');
    if (player()) syncSaves({ interactive: true, report: true });
  }

  async function signInAgain() {
    try {
      await drive.signInAgain();
      setSync(syncState === 'signin' ? '' : syncState);
    } catch (e) {
      if (e.kind === 'popup') {
        const b = await msgbox({ title: 'Google Drive Sync', icon: 'warn', parent: win, buttons: ['OK', 'Cancel'],
          text: 'The browser blocked the Google sign-in window. Click OK to open it.' });
        if (b === 'OK') return signInAgain();
      } else if (e.kind !== 'closed') msgbox({ title: 'Google Drive Sync', icon: 'error', parent: win, text: 'Could not sign in to Google.\n\n' + e.message });
    }
  }

  async function driveOff() {
    const b = await msgbox({ title: 'Google Drive Sync', icon: 'question', parent: win, buttons: ['&Yes', '&No'],
      text: 'Turn off Google Drive sync?\n\nSaves stay in this browser. The copies in your Google Drive stay there too, and turning sync on again brings them back.\n\n' +
        'To delete a game\'s copies, use Debug > Delete This Game\'s Saves before turning sync off. To delete them all, in Google Drive open Settings > Manage Apps, and choose Delete hidden app data for this site.' });
    if (b !== 'Yes') return;
    await chain;
    clearTimeout(syncTimer); syncTimer = 0;
    await drive.disconnect();
    syncState = ''; syncAt = 0;
    if (tipKind === 'signin') hideTip();
    showSaves();
    say('Google Drive sync is off');
  }

  showSaves();
  drive.preload();

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
    onClosed: () => {
      document.removeEventListener('fullscreenchange', leftFull);
      document.removeEventListener('visibilitychange', onHide);
      clearTimeout(syncTimer);
      if (isFull()) document.exitFullscreen().catch(() => {});
    },
  });
  return win;
}

export default { id: 'cons', title: 'CONscripter', icon: 'i-game', single: true, open };
