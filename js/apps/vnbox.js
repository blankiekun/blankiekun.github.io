// VNBox: plays Windows visual novels on Wine in an emulated PC (VNBox, blankiekun's Boxedwine fork),
// in a frame (vnbox/engine/boxedwine.html). The engine reads the game from this browser's private
// storage a block at a time, so each game is copied there once and opens again from Recent games
// without choosing it. Saves stay in this browser (IndexedDB), and with Google Drive sync on (consdrive.js,
// shared with CONscripter) are copied to the visitor's Drive as the game saves them. A text hook script (0xDC00's, or a LunaHook engine port, in
// vnbox/hooks/) sends each line of dialogue to the text log beside the game, for Yomitan or the clipboard.

import { h, icon, download, store, wait } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar, openMenu } from '../menu.js';
import { msgbox, about, inputbox } from '../dialogs.js';
import { fromDrop, pickFolder, walkHandle, unzipAll, bytes, when, makeZip, readZip } from './conscripter.js';
import { saveAreas, listSaves, savesUnder, readSaves, savePathParts, writeSaves, deleteSaves, SYNC_CAP, syncedSaves, writeSynced, savedSince } from './vnsaves.js';
import * as drive from './consdrive.js';
import * as anki from './consanki.js';
import { watchGamepads } from './vnpad.js';
import { lunaSuggestion } from './vnhooks.js';
import { DISC_DRIVE, SETUP_FOLDER, DISC_FILE, INSTALLER_NAMES, discsOf, discFolder, discPath, discSize, listDisc, autorunProgram, copyProtection,
  installerKind, silentArgs, installDir, discPrograms, installedPrograms, moveInstalled } from './vninstall.js';
import { tabbed } from './system.js';
import { FILTERS, DEFAULT_RECENT, filterOn, hookCleaner, suggestCleanup, rulesText, rulesFromText } from './vnclean.js';
import { VERSIONS, COMPAT_KEYS, keyOf, tuningPairs, tuned, compatFromTuning, compatParams, validDesktop, rowsFromText, rowsText } from './vntuning.js';

const RECENT = 'w95.vnbox.recent';
const MAX_RECENT = 6;
const SHOW_LOG = 'w95.vnbox.log';
const CLIP = 'w95.vnbox.clip';
const FOLD = 'w95.vnbox.fold';  // touch screens: Menu / Skip buttons folded away
// The engine release in vnbox/engine/; tools/update-vnbox.sh (run by VNBox's update-site workflow) bumps it.
const ENGINE_VERSION = 'v0.2.2';
const ENGINE = 'vnbox/engine/';
const SIZES = ['640x480', '800x600', '1024x768', '1280x720'];
// The screen a game too big for the 800x600 start runs on once, to learn its size (see fitted).
const LEARN = '1920x1200';
const MAX_LINES = 1000;
// Anki mining keeps this many hooked lines, the newest KEPT_PICTURES with their screenshot (about 200 KB each).
const KEPT_LINES = 500, KEPT_PICTURES = 30;
// and the newest KEPT_SOUNDS with the game's sound from the click that brought them (cons/soundtap.js
// cuts a line's at 20 s, up to about 4 MB).
const KEPT_SOUNDS = 10;
// How often a running game's databases are checked for a new save to copy to Google Drive.
const SAVE_POLL = 5000;
// A game's saves in Drive go by its title, or by the title it was linked to (the same game in a
// folder named otherwise on another computer; record.drive).
const driveKey = title => 'vnbox:' + ((recentGames().find(r => r.title === title) || {}).drive || title);
const hhmm = t => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
// The engine waits for the game's files with JSPI, which Chrome and Edge have (137 and later).
const canRun = typeof WebAssembly === 'object' && typeof WebAssembly.Suspending === 'function';
const canStore = !!(navigator.storage && navigator.storage.getDirectory && window.FileSystemFileHandle && 'createWritable' in FileSystemFileHandle.prototype);
// Installers, uninstallers and settings tools: never the game itself, unless there's nothing else.
const NOT_GAME = /^(unins|setup|install|config|vcredist|dxsetup|dxwebsetup|directx|patch|update)/i;
// The frame's own page has the Boxedwine shell's buttons and console; only the game shows here.
const FRAME_CSS = `body { background: #000; color: #c0c0c0; font: 12px sans-serif; }
#controls, #console, #app > hr { display: none !important; }
#dropzone { padding: 0; }
div.emscripten_border { border: 0; }
canvas { outline: none; } /* it takes focus (tabindex) for the game's keys: no ring around the game */
body { touch-action: none; } /* taps are the game's left button (frameControls), never a pan or zoom */
#vnb-pad { position: fixed; z-index: 2; width: 18px; height: 18px; margin: -9px 0 0 -9px; border: 2px solid #fff; border-radius: 50%; outline: 1px solid #000; pointer-events: none; }
#vnb-pad[hidden] { display: none; }`;

// Pixel art for the welcome page: a box with a visual novel in its window.
const ART = `<svg viewBox="0 0 64 56" width="96" height="84" shape-rendering="crispEdges">
<path fill="#000" d="M4 14h56v40H4z"/><path fill="#c08040" d="M5 15h54v38H5z"/><path fill="#e0a060" d="M5 15h54v2H5z"/><path fill="#804020" d="M5 51h54v2H5z"/>
<path fill="#000" d="M2 6h60v9H2z"/><path fill="#e0a060" d="M3 7h58v7H3z"/><path fill="#c08040" d="M3 12h58v2H3z"/>
<path fill="#000" d="M12 20h40v26H12z"/><path fill="#202060" d="M13 21h38v14H13z"/><path fill="#a04878" d="M13 30h38v5H13z"/><path fill="#fff0c0" d="M40 23h4v4h-4z"/>
<path fill="#f8b0c8" d="M18 25h6v2h1v4h-1v4h-6v-4h-1v-4h1z"/><path fill="#000040" d="M13 36h38v10H13z"/><path fill="#8080ff" d="M13 36h38v1H13z"/>
<path fill="#fff" d="M15 39h26v1H15zM15 42h18v1H15z"/><path class="cons-blink" fill="#ff0" d="M46 42h3v1h-1v1h-1v-1h-1z"/>
<path fill="#800000" d="M28 8h8v5h-8z"/><path fill="#fff" d="M30 9h4v1h-4z"/></svg>`;

// ---------- games in this browser ----------

// [{ title, at, size, exe, hook, res, discs, drive }], newest first. Each one has a copy of its files in the
// site's private storage (the origin private file system), in vn/<title>, where the engine reads them;
// a game installed from discs keeps their images in vn-discs/ (vninstall.js), for games that check for them.
const recentGames = () => store.get(RECENT, []);
const vnRoot = () => navigator.storage.getDirectory().then(d => d.getDirectoryHandle('vn', { create: true }));
async function dropCopy(r) {
  await vnRoot().then(d => d.removeEntry(r.title, { recursive: true })).catch(() => {});
  const kept = recentGames().flatMap(o => o.title === r.title ? [] : o.discs || []).map(d => d.slice(0, d.lastIndexOf('/')));
  const opfs = await navigator.storage.getDirectory();
  for (const folder of new Set((r.discs || []).map(d => d.slice(0, d.lastIndexOf('/'))))) {
    if (!kept.includes(folder)) await opfs.getDirectoryHandle('vn-discs').then(d => d.removeEntry(folder.split('/')[1], { recursive: true })).catch(() => {});
  }
}

function remember(g) {
  const old = recentGames().find(r => r.title === g.title) || {};
  const list = [{ ...old, title: g.title, at: Date.now(), size: g.size, exe: g.exe, hook: g.hook || '', res: g.res, ...(g.discs && { discs: g.discs }), ...(g.drive && { drive: g.drive }) },
    ...recentGames().filter(r => r.title !== g.title)];
  store.set(RECENT, list.slice(0, MAX_RECENT));
  for (const r of list.slice(MAX_RECENT)) dropCopy(r);
}
const setGame = (title, patch) => store.set(RECENT, recentGames().map(r => r.title === title ? { ...r, ...patch } : r));
function forget(title) {
  const r = recentGames().find(r => r.title === title) || { title };
  store.set(RECENT, recentGames().filter(r => r.title !== title));
  dropCopy(r);
}

// Copies the discs' images into vn-discs/ (files already there with the same size are kept).
async function copyDiscs(discs, progress) {
  const opfs = await navigator.storage.getDirectory();
  let done = 0;
  for (const disc of discs) {
    let d = opfs;
    for (const p of discFolder(disc).split('/')) d = await d.getDirectoryHandle(p, { create: true });
    for (const f of disc.files) {
      const there = await d.getFileHandle(f.name).then(h => h.getFile()).catch(() => null);
      if (!there || there.size !== f.size) await f.stream().pipeTo(await (await d.getFileHandle(f.name, { create: true })).createWritable());
      progress(done += f.size);
    }
  }
}

async function copyGame(g, progress) {
  const root = await vnRoot();
  await root.removeEntry(g.title, { recursive: true }).catch(() => {});
  const top = await root.getDirectoryHandle(g.title, { create: true });
  let done = 0;
  try {
    for (const f of g.files) {
      const parts = f.path.split('/');
      let d = top;
      for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      await f.file.stream().pipeTo(await (await d.getFileHandle(parts.at(-1), { create: true })).createWritable());
      progress(done += f.file.size);
    }
  } catch (e) {
    await root.removeEntry(g.title, { recursive: true }).catch(() => {});
    throw e;
  }
}

// The shallowest folder with a program in it is the game; its programs are the ones to start it with,
// biggest first (installers and settings tools last).
export function findGame(list) {
  const exes = list.filter(f => /\.exe$/i.test(f.path));
  if (!exes.length) return null;
  const depth = p => p.split('/').length;
  const first = exes.reduce((a, b) => depth(b.path) < depth(a.path) ? b : a).path;
  const root = first.slice(0, first.lastIndexOf('/') + 1);
  const files = list.filter(f => f.path.startsWith(root)).map(f => ({ path: f.path.slice(root.length), file: f.file }));
  const progs = files.filter(f => /\.exe$/i.test(f.path) && !f.path.includes('/'))
    .sort((a, b) => NOT_GAME.test(a.path) - NOT_GAME.test(b.path) || b.file.size - a.file.size).map(f => f.path);
  const title = (root.split('/').filter(Boolean).pop() || progs[0].replace(/\.exe$/i, '')).replace(/[\\/:*?"<>|]/g, '_');
  return { title, files, exes: progs, size: files.reduce((n, f) => n + f.file.size, 0) };
}

// What's in this browser for games not in the list (removed games' saves, which for an installed game
// hold what the installer left too; an install stopped without VNBox; disc images no game uses):
// [{ title, disc (a vn-discs folder), size }], biggest first. busy: a title in use, left out.
async function leftovers(busy) {
  const list = recentGames(), known = new Set([...list.map(r => r.title), busy]);
  const used = new Set(list.flatMap(r => r.discs || []).map(d => d.split('/')[1]));
  const sizeOf = async d => { let n = 0; for await (const [, x] of d.entries()) n += x.kind === 'file' ? (await x.getFile()).size : await sizeOf(x); return n; };
  const found = new Map(), add = (title, size, disc) => {
    const k = disc ? 'disc:' + disc : title, o = found.get(k) || { title, disc, size: 0 };
    o.size += size;
    found.set(k, o);
  };
  const opfs = await navigator.storage.getDirectory();
  for (const [name, d] of await Array.fromAsync((await vnRoot()).entries())) if (!known.has(name) && d.kind === 'directory') add(name, await sizeOf(d));
  const discs = await opfs.getDirectoryHandle('vn-discs').catch(() => null);
  if (discs) for await (const [name, d] of discs.entries()) if (!used.has(name)) add('', await sizeOf(d), name);
  const dbs = indexedDB.databases ? await indexedDB.databases().catch(() => []) : [];
  const titles = new Set(dbs.map(d => /^\/(?:lazyapp|root\/lazy)\/(.+)$/.exec(d.name || '')).filter(Boolean)
    .map(m => { try { return decodeURIComponent(m[1]); } catch { return ''; } }).filter(t => t.startsWith('opfs:vn/')).map(t => t.slice(8)));
  for (const title of titles) {
    if (known.has(title)) continue;
    for (const area of saveAreas(title)) add(title, (await listSaves(area).catch(() => [])).reduce((n, e) => n + e.size, 0));
  }
  return [...found.values()].sort((a, b) => b.size - a.size);
}

// The save databases of a game: the engine names them after their mount points, which end in the game's folder.
async function deleteSaveDbs(title) {
  const end = encodeURIComponent('opfs:vn/' + title);
  const dbs = indexedDB.databases ? await indexedDB.databases().catch(() => []) : [];
  await Promise.all(dbs.filter(d => d.name && d.name.endsWith(end)).map(d => new Promise(res => {
    const r = indexedDB.deleteDatabase(d.name);
    r.onsuccess = r.onerror = r.onblocked = res;
  })));
}

// The paths of the files and folders in a game's copy (vn/<title>), for the LunaHook engines' file checks.
async function gameFileNames(title) {
  const out = [];
  async function walk(d, prefix) {
    for await (const [name, handle] of d.entries()) {
      out.push(prefix + name);
      if (handle.kind === 'directory') await walk(handle, prefix + name + '/');
    }
  }
  await walk(await (await vnRoot()).getDirectoryHandle(title), '').catch(() => {});
  return out;
}

let hookList = null;
const hooks = () => hookList ||= fetch('vnbox/hooks/index.json').then(r => r.ok ? r.json() : []).catch(() => { hookList = null; return []; });

// A list to pick one from, with a box to narrow it down when filter is set. Resolves to the value, or null.
function listDialog({ title, text, items, value, filter, parent, extra }) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; resolve(v); d.close(true); };
    const sel = h('select', { class: 'field vnb-list', size: 12, 'aria-label': title, ondblclick: () => sel.value && finish(sel.value) });
    const fill = q => sel.replaceChildren(...items.filter(([, l]) => !q || l.toLowerCase().includes(q))
      .map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    fill('');
    const find = filter ? h('input', { class: 'field', type: 'search', placeholder: 'Type part of the game\'s name', 'aria-label': 'Find',
      oninput: () => fill(find.value.trim().toLowerCase()) }) : null;
    const form = h('form', { class: 'dlg vnb-dlg' }, h('p', null, text), find, sel,
      h('div', { class: 'btns right' }, extra ? extra(finish) : null,
        h('button', { class: 'btn default', type: 'submit' }, 'OK'),
        h('button', { class: 'btn', type: 'button', onclick: () => finish(null) }, 'Cancel')));
    form.addEventListener('submit', e => { e.preventDefault(); finish(sel.value || null); });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); finish(null); } });
    const d = createWindow({ title, body: form, dialog: true, resizable: false, width: 'auto', parent, taskbar: false, onClosed: () => finish(null) });
    (find || sel).focus();
  });
}

// Files from the visitor's computer.
function pickFiles(accept, multiple) {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept, multiple, hidden: true });
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

// File > Save Files: a file browser over a game's saves (vnsaves.js), opened with the game stopped.
// Download a file, a folder or everything as a .zip, upload files into a folder, restore a .zip at
// its paths, delete; a backup .zip of what an overwrite or delete touches is downloaded first.
function savesWindow(title, parent, onClosed) {
  const areas = saveAreas(title);
  let area = areas[0], entries = [], open = new Set(), selected = '';
  const where = h('select', { class: 'field', 'aria-label': 'Location', onchange: () => { area = areas[where.value]; open = new Set(); selected = ''; reload(); } },
    ...areas.map((a, i) => h('option', { value: i }, a.label)));
  const list = h('div', { class: 'vnb-sv-list', role: 'tree', 'aria-label': 'Save files' });
  const status = h('span', { class: 'vnb-sv-status' });
  const btn = (html, onclick) => h('button', { class: 'btn', type: 'button', html, onclick });
  const dlBtn = btn('<u>D</u>ownload', () => run(downloadSel));
  const delBtn = btn('De<u>l</u>ete', () => run(remove));
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const zipName = what => `${title} ${area === areas[0] ? 'game folder' : 'wine'} ${what} ${stamp()}.zip`;
  const entry = path => entries.find(e => e.path === path);
  // Uploads go into the selected folder, or the selected file's.
  const folder = () => !selected ? '' : entry(selected) && entry(selected).dir ? selected + '/' : selected.slice(0, selected.lastIndexOf('/') + 1);
  // Folders before files at each level.
  const order = e => e.path.split('/').map((p, i, all) => (i < all.length - 1 || e.dir ? 0 : 1) + p).join('\0');

  function render() {
    const rows = entries.filter(e => { const p = e.path.split('/'); return p.slice(0, -1).every((_, i) => open.has(p.slice(0, i + 1).join('/'))); })
      .sort((a, b) => order(a).localeCompare(order(b)));
    list.replaceChildren(...(rows.length ? rows.map(e => {
      const depth = e.path.split('/').length - 1, name = e.path.split('/').pop();
      return h('button', { class: 'vnb-sv-row' + (e.path === selected ? ' sel' : ''), type: 'button', role: 'treeitem',
        'aria-selected': String(e.path === selected), ...(e.dir ? { 'aria-expanded': String(open.has(e.path)) } : {}),
        style: { paddingLeft: 4 + depth * 16 + 'px' }, title: e.path,
        onclick: () => { selected = e.path; if (e.dir && !open.delete(e.path)) open.add(e.path); render(); } },
        icon(e.dir ? (open.has(e.path) ? 'i-folder-open' : 'i-folder') : 'i-doc'), h('span', { class: 'vnb-sv-name' }, name),
        h('span', { class: 'cons-recent-at' }, e.dir ? '' : bytes(e.size)), h('span', { class: 'cons-recent-at' }, e.modified ? new Date(e.modified).toLocaleString() : ''));
    }) : [h('p', { class: 'cse-empty' }, 'Nothing here yet. The game hasn\'t saved anything in this place.')]));
    dlBtn.disabled = !entries.length;
    dlBtn.innerHTML = selected ? '<u>D</u>ownload Selected' : '<u>D</u>ownload All';
    delBtn.disabled = !selected;
  }
  async function reload() {
    try { entries = await listSaves(area); } catch (e) { entries = []; status.textContent = e.message; }
    render();
  }
  async function run(task) {
    for (const b of form.querySelectorAll('button')) b.disabled = true;
    status.textContent = 'Working...';
    try { status.textContent = await task() || ''; } catch (e) { status.textContent = ''; msgbox({ title: 'Save Files', icon: 'error', parent: win, text: e.message }); }
    for (const b of form.querySelectorAll('button')) b.disabled = false;
    await reload();
  }
  async function backup(touched) {
    if (touched.some(e => !e.dir)) download(zipName('backup'), makeZip(await readSaves(area, touched)));
  }
  async function downloadSel() {
    download(zipName(selected ? selected.split('/').pop() : 'all'), makeZip(await readSaves(area, savesUnder(entries, selected))));
  }
  async function write(files) {
    const paths = new Set(files.map(f => f.path));
    await backup(entries.filter(e => !e.dir && paths.has(e.path)));
    const replaced = await writeSaves(area, files, entries);
    return `${files.length} file${files.length === 1 ? '' : 's'} written` + (replaced.length ? `, ${replaced.length} replaced (backup downloaded)` : '');
  }
  async function upload() {
    const picked = await pickFiles('', true);
    if (picked.length) run(async () => write(await Promise.all(picked.map(async f => ({ path: folder() + f.name, data: new Uint8Array(await f.arrayBuffer()) })))));
  }
  async function restore() {
    const [zip] = await pickFiles('.zip,application/zip', false);
    if (zip) run(async () => {
      let files;
      try { files = await readZip(zip); } catch { throw new Error('That zip could not be read. It may be damaged, or not really a .zip file.'); }
      files = files.filter(f => savePathParts(f.path));
      if (!files.length) throw new Error('That zip has no files in it.');
      return write(await Promise.all(files.map(async f => ({ path: savePathParts(f.path).join('/'), data: new Uint8Array(await f.file.arrayBuffer()) }))));
    });
  }
  async function remove() {
    const b = await msgbox({ title: 'Save Files', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: `Delete ${selected}?\n\nA backup .zip of it is downloaded first.` +
      (drive.enabled() ? ' Saves synced with Google Drive come back from there the next time the game starts.' : '') });
    if (b !== 'Yes') return '';
    const touched = savesUnder(entries, selected);
    await backup(touched);
    const gone = await deleteSaves(area, entries, selected);
    selected = '';
    return `Deleted ${gone.filter(e => !e.dir).length} file(s)`;
  }

  const form = h('div', { class: 'cse' },
    h('div', { class: 'cse-bar' }, h('label', null, 'Look in: ', where)),
    list,
    h('div', { class: 'cse-foot' }, status, dlBtn,
      btn('<u>U</u>pload Files...', upload), btn('<u>R</u>estore Zip...', restore), delBtn,
      h('button', { class: 'btn default', type: 'button', onclick: () => win.close() }, 'Close')));
  const win = createWindow({ title: `Save Files - ${title}`, icon: 'i-floppy', body: form, parent,
    width: 600, height: 420, minW: 360, minH: 240, onClosed });
  reload();
  return win;
}

// Game > Tuning's settings: [key, label, the value boot() runs with, options ([value, text]) or [on, off] for a check box].
// What each does: boxedwine-shell.js and startupArgs.cpp in VNBox.
const KNOBS = [
  ['audioFreq', '&Sound rate:', '44100', [['11025', '11025 Hz'], ['22050', '22050 Hz'], ['44100', '44100 Hz']]],
  ['bpp', 'C&olour depth:', '32', [['8', '8 bits'], ['16', '16 bits'], ['32', '32 bits']]],
  ['cpu', '&CPU:', '', [['', 'Pentium 4'], ['p3', 'Pentium III'], ['p2', 'Pentium II']]],
  ['fitWindow', 'The game\'s window &fills the screen, without a title bar', 'true', null, ['true', 'false']],
  ['disableWasmJitForWrittenCode', '&No JIT for code the game rewrites (can help games that patch themselves)', '', null, ['true', '']],
];

// Game > Tuning: a game's VNBox settings and Wine fixes (vntuning.js). Resolves to its new tuning, or null.
// The install's settings: the game's name, the installer and whether it asks its questions.
// kindOf(path) reads which installer a program is. Resolves to { title, installer, kind, silent }, or null.
function installDialog({ title, programs, kindOf, protection, from }, parent) {
  return new Promise(resolve => {
    const name = h('input', { class: 'field', value: title, spellcheck: false, 'aria-label': 'Name' });
    const sel = h('select', { class: 'field vnb-list', size: Math.min(8, Math.max(3, programs.length)), 'aria-label': 'Installer' },
      ...programs.map((p, i) => h('option', { value: p, selected: !i }, p)));
    const silent = h('input', { type: 'checkbox', checked: true });
    const silentRow = h('label', { class: 'cons-check', hidden: true }, silent, h('span'));
    let kind;
    async function pick() {
      const path = sel.value;
      kind = undefined;
      silentRow.hidden = true;
      const k = await kindOf(path);
      if (sel.value !== path || !k) return;
      kind = k;
      silentRow.lastChild.innerHTML = `Install without its questions (<u>q</u>uiet; ${INSTALLER_NAMES[k]})`;
      silentRow.hidden = false;
    }
    sel.addEventListener('change', pick);
    pick();
    let done = false;
    const finish = v => { if (done) return; done = true; resolve(v); d.close(true); };
    const form = h('form', { class: 'dlg vnb-dlg' },
      h('p', null, `Installs the game from ${from} into this browser, then plays it like a game folder you opened.`),
      protection.length ? h('div', { class: 'cons-warn-row' }, icon('i-warn'), h('p', null, h('b', null, protection.join(' and ') + ' copy protection: '),
        'games with it don\'t run in VNBox, even once installed.')) : null,
      h('label', { class: 'dp-row' }, h('span', { html: '<u>N</u>ame:' }), name),
      h('p', null, 'The ', h('b', null, 'installer'), ' to run:'), sel, silentRow,
      h('div', { class: 'btns right' },
        h('button', { class: 'btn default', type: 'submit' }, h('span', { html: '<u>I</u>nstall' })),
        h('button', { class: 'btn', type: 'button', onclick: () => finish(null) }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const t = name.value.trim().replace(/[\\/:*?"<>|]/g, '_');
      if (t && sel.value) finish({ title: t, installer: sel.value, kind, silent: !!kind && silent.checked });
    });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); finish(null); } });
    const d = createWindow({ title: 'Install', body: form, dialog: true, resizable: false, width: 'auto', parent, taskbar: false, onClosed: () => finish(null) });
    sel.focus();
  });
}

function tuningDialog(g, parent) {
  return new Promise(resolve => {
    const pairs = tuningPairs(g.tuning), c = compatFromTuning(pairs);
    const valueOf = ([key, , initial]) => { const p = pairs.find(x => keyOf(x) === key); return p ? p.slice(key.length + 1) : initial; };
    const select = (options, value) => h('select', { class: 'field' }, ...options.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
    const mn = label => label.replace(/&(.)/, '<u>$1</u>');
    const row = (label, el) => h('label', { class: 'dp-row' }, h('span', { html: mn(label) }), el);
    const check = (label, checked) => {
      const box = h('input', { type: 'checkbox', checked });
      return [box, h('label', { class: 'cons-check' }, box, h('span', { html: mn(label) }))];
    };
    const area = (label, value, placeholder) => {
      const t = h('textarea', { class: 'field vnb-tune-text', rows: 3, spellcheck: false, autocomplete: 'off', wrap: 'off', placeholder }, value);
      return [t, h('label', { class: 'vnb-tune-area' }, h('span', { html: mn(label) }), t)];
    };

    const knobs = KNOBS.map(k => {
      const [, label, , options, onOff] = k;
      if (options) { const el = select(options, valueOf(k)); return { k, get: () => el.value, el: row(label, el) }; }
      const [box, el] = check(label, valueOf(k) === onOff[0]);
      return { k, get: () => onOff[box.checked ? 0 : 1], el };
    });
    const extra = h('input', { class: 'field', spellcheck: false, autocomplete: 'off', placeholder: 'e.g. safe-memory=true&disableHideCursor=true',
      value: pairs.filter(p => !KNOBS.some(k => k[0] === keyOf(p)) && !COMPAT_KEYS.has(keyOf(p))).join('&') });
    const renderer = select([['', 'Default (OpenGL)'], ['gl', 'OpenGL'], ['gdi', 'GDI']], c.renderer);
    const version = select([['', 'Default (10)'], ...VERSIONS.map(v => [v, 'Windows ' + ({ winme: 'ME', win2k: '2000', winxp: 'XP' }[v] || v.slice(3))])], c.version);
    const [movies, moviesEl] = check('Play &movies (DirectShow). Off lets a game that hangs on its opening movie skip it', c.movies);
    const desktop = h('input', { class: 'field', spellcheck: false, placeholder: 'e.g. 800x600 (empty: none)', value: c.desktop });
    const [dlls, dllsEl] = area('&DLL overrides, one a line: name=n (native), name=b (built-in) or name= (off)', rowsText('dlls', c.dlls), 'd3d9=n');
    const [reg, regEl] = area('&Registry values: key | name | REG_SZ or REG_DWORD | value', rowsText('registry', c.registry), 'HKCU\\Software\\Wine\\Direct3D | renderer | REG_SZ | gdi');
    const [env, envEl] = area('&Environment variables: NAME=value', rowsText('env', c.env), 'NAME=value');

    const panels = [
      h('div', { class: 'dp-panel' }, ...knobs.map(x => x.el),
        row('E&xtra:', extra), h('p', { class: 'dp-note' }, 'Extra settings go into VNBox\'s address as typed (a=b&c=d). The game, program and hook can\'t be changed here.')),
      h('div', { class: 'dp-panel' }, h('p', { class: 'dp-note' }, 'Wine fixes for a game that won\'t start, shows nothing or stops at a movie. The renderer, Windows version and registry values stay in this game\'s Wine setup after you set them back: pick the other value to undo them.'),
        row('Re&nderer:', renderer), row('&Windows version:', version), moviesEl, row('&Virtual desktop:', desktop), dllsEl, regEl, envEl),
    ];
    let done = false;
    const finish = v => { if (done) return; done = true; resolve(v); d.close(true); };
    const form = h('form', { class: 'dlg vnb-dlg vnb-tune' }, tabbed(['Settings', 'Compatibility'], panels),
      h('div', { class: 'btns right' },
        h('button', { class: 'btn', type: 'button', onclick: () => { extra.value = ''; finish(''); } }, h('span', { html: 'Reset <u>A</u>ll' })),
        h('button', { class: 'btn default', type: 'submit' }, 'OK'),
        h('button', { class: 'btn', type: 'button', onclick: () => finish(null) }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const rows = { dlls: rowsFromText('dlls', dlls.value), registry: rowsFromText('registry', reg.value), env: rowsFromText('env', env.value) };
      const bad = [...Object.values(rows).flatMap(x => x.bad), ...(desktop.value.trim() && !validDesktop(desktop.value.trim()) ? [desktop.value] : [])];
      if (bad.length) return msgbox({ title: 'Tuning', icon: 'error', parent: d, text: 'These aren\'t valid, so nothing was changed yet:\n\n' + bad.join('\n') });
      const compat = { renderer: renderer.value, version: version.value, movies: movies.checked, desktop: desktop.value.trim(),
        dlls: rows.dlls.rows, registry: rows.registry.rows, env: rows.env.rows };
      finish([...knobs.filter(x => x.get() !== x.k[2]).map(x => `${x.k[0]}=${x.get()}`), ...compatParams(compat),
        extra.value.trim().replace(/^[?&]+|&+$/g, '')].filter(Boolean).join('&'));
    });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); finish(null); } });
    const d = createWindow({ title: 'Tuning - ' + g.title, body: form, dialog: true, resizable: false, width: 'auto', parent, taskbar: false, onClosed: () => finish(null) });
    form.querySelector('select').focus();
  });
}

// Text > Text Cleanup: a game's filters for its hooked lines (vnclean.js). recent is the raw lines the
// hook sent lately, for Suggest. Resolves to the new cleanup, or null.
function cleanupDialog(g, recent, parent) {
  return new Promise(resolve => {
    const c = g.cleanup || {};
    const boxes = FILTERS.map(([key, title, hint]) => {
      const box = h('input', { type: 'checkbox', checked: filterOn(c, key) });
      return [key, box, h('label', { class: 'cons-check', title: hint }, box, h('span', null, title + ': ', h('span', { class: 'dp-note' }, hint)))];
    });
    const num = (value, min, max) => h('input', { class: 'field vnb-clean-num', type: 'number', min, max, value });
    const count = num(c.repeatCount || 0, 0, 10), size = num(c.recentSize || DEFAULT_RECENT, 1, 100);
    const rules = h('textarea', { class: 'field vnb-tune-text', rows: 3, spellcheck: false, autocomplete: 'off', wrap: 'off', placeholder: '^【.+?】 => ' }, rulesText(c.rules));
    const set = cleanup => boxes.forEach(([key, box]) => { box.checked = filterOn(cleanup, key); });
    function suggest() {
      const s = suggestCleanup(recent.slice(-50));
      if (!s) return msgbox({ title: 'Text Cleanup', icon: 'info', parent: d,
        text: recent.length < 3 ? 'Click through a few lines in the game first, then try again.' : 'The recent lines look clean: nothing to suggest.' });
      set(s);
    }
    let done = false;
    const finish = v => { if (done) return; done = true; resolve(v); d.close(true); };
    const form = h('form', { class: 'dlg vnb-dlg vnb-tune' },
      h('p', null, 'Filters for what a hook gets wrong, run in this order on each line before the text log shows it. OK also cleans the lines already in the log.'),
      h('div', { class: 'vnb-clean-list' }, ...boxes.map(b => b[2])),
      h('label', { class: 'dp-row' }, h('span', { html: 'Repeat &count (0: guessed):'.replace(/&(.)/, '<u>$1</u>') }), count),
      h('label', { class: 'dp-row' }, h('span', { html: 'Recent lines &kept:'.replace(/&(.)/, '<u>$1</u>') }), size),
      h('label', { class: 'vnb-tune-area' }, h('span', { html: 'R<u>e</u>place rules, one a line: regular expression => replacement' }), rules),
      h('div', { class: 'btns right' },
        h('button', { class: 'btn', type: 'button', onclick: suggest }, h('span', { html: '<u>S</u>uggest' })),
        h('button', { class: 'btn', type: 'button', onclick: () => { set({}); count.value = 0; size.value = DEFAULT_RECENT; rules.value = ''; } }, h('span', { html: '<u>R</u>eset' })),
        h('button', { class: 'btn default', type: 'submit' }, 'OK'),
        h('button', { class: 'btn', type: 'button', onclick: () => finish(null) }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const r = rulesFromText(rules.value);
      if (r.bad.length) return msgbox({ title: 'Text Cleanup', icon: 'error', parent: d, text: 'These rules aren\'t valid regular expressions, so nothing was changed yet:\n\n' + r.bad.join('\n') });
      // Only what differs from the defaults is kept.
      const out = {};
      for (const [key, box] of boxes) if (box.checked !== (key === 'newOnly')) out[key] = box.checked;
      if (+count.value > 0) out.repeatCount = Math.min(10, Math.round(+count.value));
      if (+size.value > 0 && +size.value !== DEFAULT_RECENT) out.recentSize = Math.min(100, Math.round(+size.value));
      if (r.rules.length) out.rules = r.rules;
      finish(out);
    });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); finish(null); } });
    const d = createWindow({ title: 'Text Cleanup - ' + g.title, body: form, dialog: true, resizable: false, width: 'auto', parent, taskbar: false, onClosed: () => finish(null) });
    form.querySelector('input').focus();
  });
}

function aboutVNBox(win) {
  return about('VNBox', 'i-vnbox', win, h('p', null, 'Engine ',
    h('a', { href: 'https://github.com/blankiekun/VNBox/releases/tag/' + ENGINE_VERSION, target: '_blank', rel: 'noopener' }, 'VNBox ' + ENGINE_VERSION),
    h('br'), 'Wine 11.0 on Tiny Core Linux, from Boxedwine', h('br'),
    'Text hooks by 0xDC00 and contributors (MIT), and LunaHook\'s engines (HIllya51 and contributors) as ported by chimimouryou (GPL-3.0-or-later)'));
}

// ---------- touch and gamepads (ported from chimimouryou #307) ----------

// Wine's frames go to the present canvas while it shows, else the game draws with GL on #canvas
// (VNBox's own activeCanvas test).
function screenCanvas(w) {
  const d = w.document, present = d.getElementById('boxedwine-webgl-canvas-0'), style = present && w.getComputedStyle(present);
  return present && present.width && style.display !== 'none' && style.visibility !== 'hidden' ? present : d.getElementById('canvas');
}

// The game's mouse, wheel and keys, sent to #canvas (where the engine's SDL listens) at frame coordinates.
function gameMouse(w, type, button, x, y) {
  w.document.getElementById('canvas').dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, button,
    buttons: type === 'mousedown' ? [1, 4, 2][button] : 0, clientX: x, clientY: y }));
}
function gameWheel(w, deltaY, { x, y }) {
  w.document.getElementById('canvas').dispatchEvent(new w.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, clientX: x, clientY: y }));
}
function gameKey(w, down, code, key, keyCode) {
  const e = new w.KeyboardEvent(down ? 'keydown' : 'keyup', { bubbles: true, cancelable: true, code, key, ctrlKey: down && key === 'Control' });
  // Engines that still read keyCode get it too (the constructor leaves it 0).
  Object.defineProperty(e, 'keyCode', { value: keyCode });
  Object.defineProperty(e, 'which', { value: keyCode });
  w.document.getElementById('canvas').dispatchEvent(e);
}

// Sets up a just-loaded frame: VNBox only takes the mouse, so a finger is the left button (SDL's
// own touch handling never gets it); the pads are hidden from the engine (the page reads them and
// would act twice), kept as w.vnbPads; and the pad's cursor, a ring the stick moves.
function frameControls(w) {
  const d = w.document;
  let touchId = null;
  function touchMouse(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    cursor.hidden = true;
    const t = [...e.changedTouches].find(t => e.type === 'touchstart' ? touchId === null : t.identifier === touchId);
    if (!t) return;
    if (e.type === 'touchstart') {
      touchId = t.identifier;
      gameMouse(w, 'mousemove', 0, t.clientX, t.clientY);
      gameMouse(w, 'mousedown', 0, t.clientX, t.clientY);
    } else if (e.type === 'touchmove') gameMouse(w, 'mousemove', 0, t.clientX, t.clientY);
    else { touchId = null; gameMouse(w, 'mouseup', 0, t.clientX, t.clientY); }
  }
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) w.addEventListener(type, touchMouse, { capture: true, passive: false });
  // Focus in the frame can keep the news of a pad from the page.
  w.addEventListener('gamepadconnected', () => window.dispatchEvent(new Event('gamepadconnected')));
  if (w.navigator.getGamepads) {
    w.vnbPads = w.navigator.getGamepads.bind(w.navigator);
    w.navigator.getGamepads = () => [];
  }
  const cursor = Object.assign(d.createElement('div'), { id: 'vnb-pad', hidden: true });
  d.body.append(cursor);
  // A real mouse hides it.
  w.addEventListener('mousemove', e => { if (e.isTrusted) cursor.hidden = true; }, true);
}

// Where the pad's cursor is, else the middle of the game, in frame coordinates.
function cursorAt(w) {
  const c = w.document.getElementById('vnb-pad');
  if (c && !c.hidden) return { x: parseFloat(c.style.left), y: parseFloat(c.style.top) };
  const box = screenCanvas(w).getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

// Moves the pad's cursor by its speed (each axis -1..1) for ms milliseconds, within the game.
function padMove(w, dx, dy, ms) {
  const c = w.document.getElementById('vnb-pad');
  if (!c) return;
  const box = screenCanvas(w).getBoundingClientRect(), at = cursorAt(w);
  // Crossing the game in about two seconds at full tilt.
  const speed = Math.max(box.width, box.height) / 2000 * ms;
  const x = Math.max(box.left, Math.min(box.right - 1, at.x + dx * speed));
  const y = Math.max(box.top, Math.min(box.bottom - 1, at.y + dy * speed));
  Object.assign(c.style, { left: x + 'px', top: y + 'px' });
  c.hidden = false;
  gameMouse(w, 'mousemove', 0, x, y);
}

// ---------- the window ----------

function open() {
  let game = null;   // what's loaded: { title, size, exe, hook, res }
  let frame = null;  // the running engine
  let errors = [];   // what the engine reported, for Debug > Engine Log
  let ownHook = null; // a hook script picked from a file this visit: { name, url }
  let showLog = store.get(SHOW_LOG, false), clip = store.get(CLIP, false);

  const dropBox = h('div', { class: 'cons-drop' }, icon('i-folder-open'),
    h('b', null, 'Drag a game folder or .zip here'),
    h('span', null, 'the one with the game\'s .exe in it'));
  const recentRows = h('div', { class: 'cons-recent-list' });
  const recentBox = h('fieldset', { class: 'group cons-recent' }, h('legend', null, 'Recent games'), recentRows);
  // Games whose saves are in Google Drive but not linked to a game here (from another computer):
  // Link... picks the game they're the saves of.
  const driveRows = h('div', { class: 'cons-recent-list' });
  const driveBox = h('fieldset', { class: 'group cons-recent', hidden: true }, h('legend', null, 'Saves in your Google Drive'), driveRows);
  let driveShown = 0;
  async function showDrive() {
    const n = ++driveShown;
    if (!drive.enabled()) { driveBox.hidden = true; return; }
    let games;
    // Not signed in this visit: asked, never a sign-in window out of the blue.
    try { games = await (drive.signedIn() ? drive.list('vnbox:') : Promise.reject(new drive.DriveError('', 'signin'))); } catch (e) {
      if (n !== driveShown) return;
      driveBox.hidden = false;
      driveRows.replaceChildren(e.kind === 'signin'
        ? h('button', { class: 'cons-recent-item', type: 'button', onclick: () => drive.signInAgain().then(showDrive, () => {}) },
          icon('i-info'), h('span', { class: 'cons-recent-name' }, 'Sign in to Google to see the games saved in your Drive'))
        : h('span', { class: 'cons-recent-at' }, e.message));
      return;
    }
    if (n !== driveShown) return;
    const linked = new Set(recentGames().map(r => r.drive || r.title));
    const rest = games.filter(g => !linked.has(g.title));
    driveBox.hidden = !rest.length;
    driveRows.replaceChildren(...rest.map(g => h('div', { class: 'cons-kept-item' }, icon('i-folder'),
      h('span', { class: 'cons-recent-name' }, g.title), h('span', { class: 'cons-recent-at' }, when(g.at)),
      h('button', { class: 'btn', type: 'button', title: 'Choose the game these saves are from', onclick: () => linkDrive(g.title) }, 'Link...'))));
  }
  async function linkDrive(title) {
    const list = recentGames();
    const pick = await listDialog({ title: 'Link Saves', parent: win, value: '',
      items: [['', 'Open the game\'s folder...'], ...list.map(r => [r.title, r.title + (r.drive ? ` (now linked to ${r.drive})` : '')])],
      text: `Which game are the saves of ${title} from? It syncs with them from now on, and newer ones come in when it starts.` });
    if (pick == null) return;
    if (pick) {
      setGame(pick, { drive: pick === title ? undefined : title });
      showRecent();
      say(`${pick} now syncs with the saves of ${title}`);
      if (frame && game.title === pick) syncSaves(pick, { w: frame, interactive: true, report: true });
      return;
    }
    const picked = await pickFolder();
    load({ ...picked, link: title });
  }

  function showRecent() {
    showDrive();
    const list = recentGames();
    recentBox.hidden = !list.length;
    recentRows.replaceChildren(...list.map(r => {
      const row = h('button', { class: 'cons-recent-item', type: 'button', onclick: () => openRecent(r), title: 'Play ' + r.title },
        icon('i-folder'), h('span', { class: 'cons-recent-name' }, r.title), h('span', { class: 'cons-recent-at' }, when(r.at)));
      row.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        openMenu([
          { label: '&Play', action: () => openRecent(r) },
          { label: '&Save Files...', action: () => saveFiles(r) },
          { label: '&Remove from This Browser', action: () => removeGame(r) },
        ], { x: e.clientX, y: e.clientY });
      });
      return row;
    }));
  }
  showRecent();

  const can = canRun && canStore;
  const welcome = h('div', { class: 'cons-welcome' },
    h('div', { class: 'cons-side', 'aria-hidden': 'true' },
      h('div', { class: 'cons-art', html: ART }),
      h('span', null, 'VN', h('b', null, 'Box'))),
    h('div', { class: 'cons-main' },
      h('h2', null, 'Welcome to VNBox'),
      h('p', null, 'VNBox plays Windows visual novels in the browser, on Wine in an emulated PC. Open a game folder, or a .zip of one, from your computer to start. The game is copied into this browser and never leaves this computer.'),
      can ? null : h('div', { class: 'cons-warn-row' }, icon('i-warn'),
        h('p', null, h('b', null, 'This browser can\'t run VNBox. '), 'It needs Chrome or Edge, version 137 or later.')),
      dropBox,
      h('div', { class: 'cons-btns' },
        h('button', { class: 'btn default', type: 'button', disabled: !can, onclick: openPicked }, h('span', { html: 'Open <u>F</u>older...' })),
        h('button', { class: 'btn', type: 'button', disabled: !can, onclick: openZip }, h('span', { html: 'Open <u>Z</u>ip...' })),
        h('button', { class: 'btn', type: 'button', onclick: () => launch('help', 'VNBox') }, h('span', { html: '<u>H</u>elp' }))),
      recentBox,
      driveBox,
      h('fieldset', { class: 'group cons-warn' }, h('legend', null, 'Good to know'),
        h('div', { class: 'cons-warn-row' }, icon('i-info'), h('p', null,
          'The first game downloads Wine (120 MB, once) and sets it up, which takes a few minutes. Games are slower than on Windows, and not every game runs. ',
          h('b', null, 'Saves are kept only in this browser'), ': clearing site data erases them.',
          drive.available ? ' File > Sync with Google Drive copies them to your Drive as you play.' : '')),
        h('div', { class: 'cons-warn-row' }, icon('i-notepad'), h('p', null,
          'Japanese games can send their text to the ', h('b', null, 'text log'), ' beside the game, to look words up with Yomitan or copy them: choose ',
          h('b', null, 'Text > Text Hook'), ' while playing.')))));

  const log = h('div', { class: 'vnb-log', lang: 'ja', tabindex: 0, 'aria-label': 'Text log', 'aria-live': 'polite' });
  const logEmpty = h('p', { class: 'vnb-log-empty', lang: 'en' }, 'The game\'s text shows here once a text hook is on: Text > Text Hook.');
  const view = h('div', { class: 'cons-view' }, welcome);
  const statusText = h('span', null, 'Ready');
  const statusGame = h('span', { class: 'cons-size' }, '');
  const statusSync = h('span', { class: 'cons-saves link', hidden: true, onclick: () => game && syncSaves(game.title, { w: frame, interactive: true, report: true }) });
  const status = h('div', { class: 'statusbar' }, statusText, statusGame, statusSync);
  const say = t => { statusText.textContent = t; };
  const idle = () => say(frame ? 'Playing ' + game.title : 'Ready');
  const error = text => msgbox({ title: 'VNBox', icon: 'error', parent: win, text });

  // Full screen takes the whole page, so the menus still show; the menu bar hides at the top until wanted.
  const canFull = !!document.documentElement.requestFullscreen;
  const isFull = () => win.el.classList.contains('cons-full');
  function fullScreen() {
    if (isFull()) { document.exitFullscreen().catch(() => {}); return; }
    if (!frame || !canFull) return;
    win.focus();
    document.documentElement.requestFullscreen().then(() => {
      win.el.classList.add('cons-full');
      fsBtn.lastChild.textContent = touchFs.textContent = 'Exit Full Screen';
      frame && frame.focus();
    }, () => {});
  }
  function leftFull() {
    if (document.fullscreenElement || !isFull()) return;
    win.el.classList.remove('cons-full');
    root.classList.remove('reveal');
    fsBtn.lastChild.textContent = touchFs.textContent = 'Full Screen';
  }
  document.addEventListener('fullscreenchange', leftFull);

  // ---------- touch and gamepads ----------

  // The frame's window once frameControls set it up, else null.
  const gameWin = () => frame && frame.contentWindow && frame.contentWindow.document.getElementById('vnb-pad') ? frame.contentWindow : null;
  // Skip holds Ctrl, the key most Windows visual novels skip with while it is down. A new frame holds none.
  let skip = false;
  function toggleSkip() {
    const w = gameWin();
    if (!w) return;
    skip = !skip;
    skipBtn.classList.toggle('on', skip);
    gameKey(w, skip, 'ControlLeft', 'Control', 17);
  }
  function unskip() { skip = false; skipBtn.classList.remove('on'); }
  // The game's menu: a right click where the pad's cursor is, else in the middle of the game.
  function gameMenu() {
    const w = gameWin();
    if (!w) return;
    const at = cursorAt(w);
    gameMouse(w, 'mousedown', 2, at.x, at.y);
    gameMouse(w, 'mouseup', 2, at.x, at.y);
  }
  // Pad buttons (vnpad.js): the window's own actions here, the game's mouse in the frame.
  function padChange(pressed, released) {
    const w = gameWin();
    if (w && released.includes('advance')) { const at = cursorAt(w); gameMouse(w, 'mouseup', 0, at.x, at.y); }
    for (const a of pressed) {
      if (a === 'skip') toggleSkip();
      else if (a === 'log') toggleLog();
      else if (a === 'fullscreen') fullScreen();
      else if (!w) continue;
      else if (a === 'advance') { const at = cursorAt(w); gameMouse(w, 'mousedown', 0, at.x, at.y); }
      else if (a === 'menu') gameMenu();
      else if (a === 'wheelUp' || a === 'wheelDown') gameWheel(w, a === 'wheelUp' ? -120 : 120, cursorAt(w));
    }
  }
  // The frame hides the pads from its engine (frameControls) but can still read them.
  const padStop = watchGamepads(() => {
    const w = gameWin();
    return [...(navigator.getGamepads ? navigator.getGamepads() : []), ...(w && w.vnbPads ? w.vnbPads() : [])];
  }, { change: padChange, cursor: (dx, dy, ms) => { const w = gameWin(); if (w) padMove(w, dx, dy, ms); } });

  // ---------- the text log ----------

  // raw: the lines as the hook sent them, so a new cleanup can redo the log.
  let raw = [], clean = hookCleaner({});
  function addLine(line, quiet) {
    if (!quiet) { raw.push(String(line)); if (raw.length > MAX_LINES) raw.shift(); }
    const text = clean(String(line)).trim();
    if (!text) return;
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    logEmpty.remove();
    log.append(h('p', null, text));
    while (log.childElementCount > MAX_LINES) log.firstElementChild.remove();
    if (!quiet && shots) keep(text);
    if (atEnd) log.scrollTop = log.scrollHeight;
    if (!quiet && clip && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  }
  const lines = () => [...log.querySelectorAll('p:not(.vnb-log-empty)')].map(p => p.textContent);
  function clearLog() {
    raw = [];
    clean = hookCleaner((game && game.cleanup) || {});
    log.replaceChildren(logEmpty);
  }
  async function cleanup() {
    const c = await cleanupDialog(game, raw, win);
    if (!c) return frame && frame.focus();
    game.cleanup = c;
    setGame(game.title, { cleanup: c });
    const old = raw;
    clearLog();
    for (const line of old) addLine(line, true);
    raw = old;
    frame && frame.focus();
  }
  clearLog();
  function toggleLog() {
    showLog = !showLog;
    store.set(SHOW_LOG, showLog);
    log.hidden = !showLog;
  }
  log.hidden = !showLog;

  async function chooseHook() {
    if (!game) return;
    const list = await hooks();
    // The LunaHook engine whose files the game has, first in the list.
    const fits = lunaSuggestion(list, await gameFileNames(game.title), game.exe);
    const items = [['', '(None)'], ...(ownHook ? [['file', ownHook.name + ' (from your computer)']] : []),
      ...list.filter(([f]) => f === fits).map(([f, n]) => [f, n + ' (fits this game)']), ...list.filter(([f]) => f !== fits)];
    const pick = await listDialog({ title: 'Text Hook', parent: win, filter: true, items, value: game.hook || fits || '',
      text: 'Choose the hook script for ' + game.title + '. It sends each line the game shows to the text log. The game restarts to use it.',
      extra: finish => h('button', { class: 'btn', type: 'button', onclick: () => pickHookFile().then(f => f && finish('file')) }, h('span', { html: 'From a F<u>i</u>le...' })) });
    if (pick == null || pick === (game.hook || '')) return frame && frame.focus();
    if (!(await confirmQuit())) return;
    game.hook = pick;
    // Off at first: a hook is what fills it.
    if (pick && !showLog) toggleLog();
    setGame(game.title, { hook: pick === 'file' ? '' : pick });
    boot(game);
  }
  // shortcut: a script from the visitor's computer lasts this visit and can't require() other files; keep its text if people use it
  function pickHookFile() {
    return new Promise(resolve => {
      const input = h('input', { type: 'file', accept: '.js,text/javascript', hidden: true });
      input.addEventListener('change', () => {
        const f = input.files[0];
        input.remove();
        if (!f) return resolve(null);
        if (ownHook) URL.revokeObjectURL(ownHook.url);
        ownHook = { name: f.name, url: URL.createObjectURL(new Blob([f], { type: 'text/javascript' })) };
        resolve(ownHook);
      });
      input.addEventListener('cancel', () => { input.remove(); resolve(null); });
      document.body.append(input);
      input.click();
    });
  }
  function hookUrl(g) {
    if (g.hook === 'file') return ownHook && ownHook.url;
    return g.hook ? new URL('vnbox/hooks/' + g.hook, location.href).href : null;
  }

  // ---------- Anki mining ----------

  // Cards added to Anki while playing (with Yomitan, from the text log) get the screen of the hooked
  // line their sentence came from, through consanki.js (CONscripter's settings, so on there is on
  // here). Ported from chimimouryou's overlay.js. shots: mining was on, with a text hook, when the
  // game started, so the engine's WebGL keeps its last frame readable (a buffer copy per frame).
  let kept = [], retake = null, shots = false, ankiStop = null, ankiError = '';

  function screenshot() {
    const w = frame && frame.contentWindow;
    if (!w || !w.document) return Promise.resolve(null);
    return new Promise(resolve => screenCanvas(w).toBlob(resolve, 'image/webp', 0.9));
  }

  function keep(text) {
    // A line hooked again (the game's own backlog screen) keeps the screen it had the first time.
    const earlier = kept.findLast(k => k.text === text && k.picture);
    const line = earlier ? { text, picture: earlier.picture, audio: earlier.audio } : { text, picture: screenshot() };
    // The hook fires before the text is drawn: the screen at the next click or key is the line's.
    retake = earlier ? null : line;
    // and the sound from the click that brought it to the next.
    const w = frame && frame.contentWindow;
    if (!earlier && w && w.recordLine) w.recordLine(line);
    kept.push(line);
    if (kept.length > KEPT_LINES) kept.shift();
    const old = kept[kept.length - 1 - KEPT_PICTURES];
    if (old) old.picture = null;
    const quiet = kept[kept.length - 1 - KEPT_SOUNDS];
    if (quiet) quiet.audio = undefined;
  }
  function retakeShot(e) {
    // Modifier keys are Yomitan's scan keys, not the game's; held keys repeat.
    if (!retake || e.repeat || /^(Shift|Control|Alt|Meta)$/.test(e.key)) return;
    if (retake.picture) retake.picture = screenshot();
    retake = null;
  }

  function ankiWatch() {
    const on = !!(frame && shots);
    if (on && !ankiStop) ankiStop = anki.watch(ankiNote, e => {
      // Said once per kind of failure, not on every check.
      if (e && e.message !== ankiError) say(e.message);
      ankiError = e ? e.message : '';
    });
    else if (!on && ankiStop) { ankiStop(); ankiStop = null; ankiError = ''; }
  }

  async function ankiNote(note) {
    const s = anki.settings(), line = kept[anki.lineFor(anki.noteSentence(note), kept.map(k => k.text))];
    if (!line) return say(`Left the Anki card alone: its ${s.sentenceField} field isn't from ${game.title}'s recent text`);
    try {
      say('Adding the screenshot and sound to the Anki card...');
      const w = frame && frame.contentWindow;
      const audio = s.audio && w && w.lineSound ? await w.lineSound(line) : null;
      const filled = await anki.addMedia(note, { picture: (await line.picture) || (await screenshot()), audio });
      say(filled.length ? 'Added to the Anki card: ' + filled.join(', ') : `Nothing added to the Anki card (its ${s.pictureField} and ${s.audioField} fields are missing or already filled)`);
    } catch (e) {
      say('Anki: ' + e.message);
    }
  }

  function ankiToggle() {
    const on = !anki.settings().on;
    if (on && !anki.settings().tipped) { anki.set({ tipped: true }); ankiHelp(); }
    anki.set({ on });
    if (!on) shots = false;
    else if (frame && !shots) say('Anki mining starts at the game\'s next start, with a text hook on');
    ankiWatch();
  }

  async function ankiField(key, label) {
    const v = await inputbox({ title: 'Anki Mining', parent: win, label, value: anki.settings()[key] });
    if (v != null && v.trim()) anki.set({ [key]: v.trim() });
  }

  function ankiHelp() {
    const origin = location.origin.replace(/[&<>]/g, '');
    msgbox({ title: 'Connecting to AnkiConnect', icon: 'info', parent: win, html:
      '<p>Cards you add to Anki while playing (with Yomitan on the text log, for example) get a screenshot of the game from when their sentence was shown.</p>' +
      '<ol style="margin:6px 0;padding-left:20px;line-height:1.5">' +
      '<li>In Anki, choose <b>Tools &gt; Add-ons &gt; Get Add-ons</b> and enter the code <b>2055492159</b> (AnkiConnect).</li>' +
      '<li>Select AnkiConnect, click <b>Config</b>, and add this site to <code>webCorsOriginList</code>, exactly as shown (no slash at the end):<br><code>"webCorsOriginList": ["http://localhost", "' + origin + '"]</code></li>' +
      '<li>Restart Anki and leave it open while you play.</li>' +
      '<li>If the browser asks to let this site reach apps on your device (or local network), choose <b>Allow</b>.</li>' +
      '<li>Your note type needs the fields named in Text &gt; Anki Settings (<b>Sentence</b> and <b>Picture</b> unless you change them). A filled field is left alone.</li></ol>' +
      '<p>The card gets the screen of the hooked line its <b>Sentence</b> came from (the last 30 lines; older ones get the screen as it is now), even if you have clicked on since. Cards mined from anywhere else are left alone. Mining needs a text hook, and starts with the next start of the game.</p>' });
  }

  // ---------- running a game ----------

  function stop(msg) {
    if (frame) frame.remove();
    frame = null;
    unskip();
    ankiWatch();
    view.classList.remove('playing');
    fsBtn.disabled = true;
    if (isFull()) document.exitFullscreen().catch(() => {});
    showRecent();
    view.replaceChildren(welcome);
    win.setTitle('VNBox');
    statusGame.textContent = '';
    say(msg);
  }

  function boot(g) {
    if (frame) frame.remove();
    game = g;
    unskip();
    errors = [];
    kept = []; retake = null;
    // g.install: an installer running ({ p, w, args, since }, see install), with no hook, tuning or sync.
    const inst = g.install;
    const hook = inst ? null : hookUrl(g);
    shots = anki.settings().on && !!hook;
    const arg = (k, v) => k + '=' + encodeURIComponent(v);
    // The shell reads env= undecoded and splits it at the colon, so only the quotes are escaped.
    // p: Windows separators, since the shell starts it through cmd /c, which reads Game/game.exe's /game.exe as a switch.
    const q = [arg('lazy', 'opfs:vn/' + g.title), arg('p', inst ? inst.p : g.exe.replaceAll('/', '\\')), arg('root', 'TinyCore15Wine11.0-web.zip'), arg('overlay', 'jp.zip'),
      'env=%22LC_ALL:ja_JP.UTF-8%22', arg('resolution', g.res || SIZES[1]), ...(hook ? [arg('frida', hook)] : []),
      // The discs a game was installed from, read on demand, disc 1 in the drive.
      ...(g.discs && g.discs.length ? [arg('cdrom', g.discs.map(d => 'opfs:' + d).join(';'))] : []),
      // Japanese font names (ＭＳ ゴシック...) as jp.zip's fonts, no Mono/Gecko installs, full-rate sound,
      'registry=jpfonts', 'wine-override=[nomono]', 'audioFreq=44100'];
    // and the game's window fills the screen, which takes its size, without Wine's title bar (an
    // installer opens several windows, so not for it).
    if (inst) q.push(arg('w', inst.w), ...(inst.args ? [arg('args', inst.args)] : []), 'fitWindow=false');
    else q.splice(0, q.length, ...tuned([...q, 'fitWindow=true'], g.tuning));
    frame = h('iframe', { class: 'cons-frame', title: g.title, allow: 'fullscreen; autoplay', style: { visibility: 'hidden' } });
    const me = frame;
    const start = () => {
      if (frame !== me) return;
      saveSeen = Date.now();
      frame.src = ENGINE + 'boxedwine.html?' + q.join('&');
      frame.addEventListener('load', () => {
        const w = frame.contentWindow;
        w.document.head.append(Object.assign(w.document.createElement('style'), { textContent: FRAME_CSS }));
        w.boxedwineText = line => { if (frame === me) addLine(line); };
        frameControls(w);
        // Before Wine opens a window, so before the engine makes its WebGL context.
        if (shots) {
          const proto = w.HTMLCanvasElement.prototype, get = proto.getContext;
          proto.getContext = function (type, attrs) { return get.call(this, type, /^webgl/.test(type) ? { ...attrs, preserveDrawingBuffer: true } : attrs); };
          // Taps reach the game as mousedowns (frameControls).
          for (const type of ['mousedown', 'keydown']) w.addEventListener(type, retakeShot, true);
          // The game's sound, for each line's: CONscripter's tap, which records once recordLines is set.
          if (anki.settings().audio) w.document.head.append(Object.assign(w.document.createElement('script'),
            { src: new URL('cons/soundtap.js', location.href).href, onload: () => { w.recordLines = true; } }));
        }
        const canvas = w.document.getElementById('canvas');
        if (!inst) new w.MutationObserver(() => fitted(me, canvas.width, canvas.height)).observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] });
        frame.style.visibility = '';
        ankiWatch();
        frame.focus();
      }, { once: true });
    };
    clearLog();
    view.classList.add('playing');
    fsBtn.disabled = !canFull;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    view.replaceChildren(h('div', { class: 'vnb-play' }, frame, log));
    win.setTitle(g.title + ' - VNBox');
    statusGame.textContent = inst ? '' : g.exe + ', ' + bytes(g.size);
    say(!inst ? 'Playing ' + g.title : inst.quiet ? `Installing ${g.title} quietly: the installer shows no window, and VNBox goes on by itself when it's done`
      : `Installing ${g.title}: VNBox goes on when the installer closes, or choose File > Finish Install`);
    // Newer saves from Google Drive go in before the engine reads its databases.
    if (!drive.enabled() || inst) start();
    else {
      say('Syncing saves with Google Drive...');
      wait(100) // a frame just closed lets go of its databases
        .then(() => syncSaves(g.title, { starting: true }))
        .then(n => { if (frame === me) say(n ? `Loaded ${n} newer save file${n === 1 ? '' : 's'} from Google Drive` : 'Playing ' + g.title); start(); });
    }
  }

  // Wine caps a new window at the screen plus its frame, so a game bigger than the 800x600 start comes
  // out a few pixels over it, cut off (Muramasa, 1024x576: 806x576). Such a game starts once on a big
  // screen, where its window gets its own size, which is kept as its screen size. Sizes the visitor
  // chose are left alone. (chimimouryou's fittedTuning)
  function fitted(me, width, height) {
    if (frame !== me) return;
    const over = (n, start) => n > start && n <= start + 32;
    if (!game.res && (over(width, 800) || over(height, 600))) {
      setSize(LEARN);
      boot(game);
      say('Restarting at a bigger screen to fit the game');
    } else if (game.res === LEARN && width + 'x' + height !== LEARN && (width > 800 || height > 600)) setSize(width + 'x' + height, true);
  }

  // The engine posts { type: 'vnbox-error', source, message }; a game that couldn't be read never starts.
  function onMessage(e) {
    if (!frame || e.source !== frame.contentWindow || !e.data) return;
    // No Windows program left running: the installer is done.
    if (e.data.type === 'vnbox-exit' && game.install) return finishInstall(true);
    if (e.data.type !== 'vnbox-error') return;
    errors.push(`[${e.data.source}] ${e.data.message}`);
    if (e.data.source === 'lazyfs') {
      stop('The game stopped');
      error('The game could not be started.\n\n' + e.data.message + '\n\nIf this browser cleared its storage, open the game\'s folder again.');
    } else say('The engine reported an error (Debug > Engine Log)');
  }
  window.addEventListener('message', onMessage);

  async function confirmQuit() {
    if (!frame) return true;
    const b = await msgbox({ title: 'VNBox', icon: 'question', parent: win, buttons: ['&Yes', '&No'],
      text: game.install ? `Stop installing ${game.title}?\n\nWhat it has installed so far is removed.` : `Quit ${game.title}?\n\nAnything you haven't saved in the game will be lost.` });
    if (b !== 'Yes') return false;
    if (game.install) { const g = game; stop('Ready'); await dropInstall(g); return true; }
    if (drive.enabled()) {
      say('Copying saves to Google Drive...');
      await watchSaves({ leaving: true });
    }
    return true;
  }

  function engineLog() {
    const out = frame && frame.contentDocument && frame.contentDocument.getElementById('output');
    const text = [out ? out.value : '', ...errors].filter(Boolean).join('\n');
    launch('notepad', { name: game.title + ' log.txt', text: text || '(The engine hasn\'t printed anything yet.)' });
  }

  async function tune() {
    const t = await tuningDialog(game, win);
    if (t == null || t === (game.tuning || '')) return;
    game.tuning = t;
    setGame(game.title, { tuning: t });
    if (!frame) return say('Tuning saved');
    const b = await msgbox({ title: 'Tuning', icon: 'question', parent: win, buttons: ['&Yes', '&No'],
      text: `Restart ${game.title} now to use the new tuning?\n\nAnything you haven't saved in the game will be lost. If you don't, it's used from the next start.` });
    if (b === 'Yes' && frame) boot(game);
  }

  function setSize(res, quiet) {
    game.res = res;
    setGame(game.title, { res });
    if (!quiet) say('Restart the game to use the new screen size');
  }

  // ---------- Google Drive sync ----------

  let chain = Promise.resolve();
  let saveSeen = 0;     // the newest write to the running game's databases looked at
  let declined = null;  // the frame whose newer saves from Drive the visitor chose not to load

  function showSync(text, title) {
    statusSync.hidden = !drive.enabled();
    statusSync.replaceChildren(icon('i-globe'), 'Saves: ' + text);
    statusSync.title = title;
  }
  showSync('Google Drive', 'Saves are in this browser and synced with Google Drive. Click to sync now.');

  // One sync at a time; resolves to how many newer save files from Drive were written.
  // starting: the game is stopped, so newer saves from Drive go straight in.
  // w: the frame playing, which has to restart to load them, so that's asked first.
  // leaving: the game is being closed: only copy to Drive.
  // interactive: from a click, so it may open Google's sign-in window, and errors are shown.
  function syncSaves(title, opts = {}) {
    if (!drive.enabled()) return Promise.resolve(0);
    return chain = chain.then(() => runSync(title, opts));
  }

  async function runSync(title, { w, starting, leaving, interactive, report }) {
    if (!starting && (!w || frame !== w || game.install)) return 0;
    showSync('syncing...', 'Copying saves to and from Google Drive');
    try {
      const { size, files } = await syncedSaves(title);
      if (!files) {
        showSync('this browser', `The saves of ${title} are ${bytes(size)}, over the ${bytes(SYNC_CAP)} that sync with Google Drive. They stay in this browser.`);
        return 0;
      }
      let job = drive.sync(driveKey(title), files, interactive, { engine: ENGINE_VERSION });
      // Don't hold the game back long if Drive is slow; newer saves come next sync.
      if (starting) job = Promise.race([job, wait(15000).then(() => { throw new drive.DriveError('Google Drive took too long to answer.', 'net'); })]);
      const newer = await job;
      showSync('Google Drive', `Saves are in this browser and synced with Google Drive, last at ${hhmm(Date.now())}. Click to sync now.`);
      if (report) say('Synced with Google Drive');
      if (starting) return newer.length ? await writeSynced(title, newer) : 0;
      if (newer.length && !leaving && declined !== w && frame === w) {
        const b = await msgbox({ title: 'Google Drive Sync', icon: 'question', parent: win, buttons: ['&Yes', '&No'],
          text: `Your Google Drive has newer saves of ${title}, from playing somewhere else.\n\nLoad them and restart the game? Anything you haven't saved here will be lost. If you don't, each save file keeps whichever copy was saved last.` });
        if (b === 'Yes' && frame === w) boot(game); else declined = w;
      }
    } catch (e) {
      const signin = ['signin', 'popup', 'closed', 'denied'].includes(e.kind);
      showSync(signin ? 'sign in to Drive' : 'not synced', e.message + ' Click to try again.');
      if (leaving) {
        msgbox({ title: 'Google Drive Sync', icon: 'warn',
          text: `Your latest saves of ${title} weren't copied to Google Drive.\n\n${e.message}\n\nThey're safe in this browser, and are copied the next time you play ${title} here.` });
      } else if (interactive && e.kind === 'popup') {
        const b = await msgbox({ title: 'Google Drive Sync', icon: 'warn', parent: win, buttons: ['OK', 'Cancel'],
          text: 'The browser blocked the Google sign-in window. Click OK to open it.' });
        if (b === 'OK') return runSync(title, { w, starting, interactive, report });
      } else if (interactive && e.kind !== 'closed') {
        msgbox({ title: 'Google Drive Sync', icon: 'error', parent: win, text: `${title} could not be synced with Google Drive.\n\n${e.message}` });
      }
    }
    return 0;
  }

  // The engine writes the game's saves into its databases as it runs: a new one is copied at the next look.
  async function watchSaves(opts) {
    const w = frame;
    if (!w || !w.src || !drive.enabled() || game.install) return;
    const { saved, at } = await savedSince(game.title, saveSeen).catch(() => ({ saved: false, at: saveSeen }));
    if (frame !== w) return;
    saveSeen = at;
    if (saved) return syncSaves(game.title, { w, ...opts });
  }
  const poll = setInterval(watchSaves, SAVE_POLL);
  // Leaving the tab (or closing it) copies a save the last look missed, while there's time.
  const onHide = () => { if (document.hidden) watchSaves(); };
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
      if (e.kind !== 'closed') error('Google Drive sync could not be turned on.\n\n' + e.message);
      return;
    }
    showSync('Google Drive', 'Saves are in this browser and synced with Google Drive. Click to sync now.');
    showDrive();
    say('Google Drive sync is on');
    if (frame) syncSaves(game.title, { w: frame, interactive: true, report: true });
  }

  async function driveOff() {
    const b = await msgbox({ title: 'Google Drive Sync', icon: 'question', parent: win, buttons: ['&Yes', '&No'],
      text: 'Turn off Google Drive sync, here and in CONscripter?\n\nSaves stay in this browser. The copies in your Google Drive stay there too, and turning sync on again brings them back.' });
    if (b !== 'Yes') return;
    await chain;
    await drive.disconnect();
    showSync('', '');
    showDrive();
    say('Google Drive sync is off');
  }

  // ---------- opening games ----------

  // From a folder handle, or a list of files already read.
  // Asks the browser to keep this site's storage before a big copy: Firefox asks the visitor, and lifts
  // its 10 GB cap when they agree; Chrome and Edge decide alone, and never clear it on their own after.
  const keepStorage = () => navigator.storage && navigator.storage.persist ? navigator.storage.persist().catch(() => false) : Promise.resolve(false);

  // A copy into this browser, shown in the window: its text, a bar, and how much of how much.
  // Returns progress(done, total?); the caller puts the window back (boot, or welcome on a failure).
  function showProgress(text, total) {
    const bar = h('i'), meter = h('div', { class: 'cp-prog', role: 'progressbar', 'aria-label': text, 'aria-valuemin': 0, 'aria-valuemax': 100 }, bar);
    const count = h('p', { class: 'cons-recent-at' });
    view.replaceChildren(h('div', { class: 'vnb-progress' }, h('p', null, text), meter, count));
    let shown = -1;
    return (done, t = total) => {
      const pct = Math.floor(done / (t || 1) * 100);
      if (pct === shown) return;
      shown = pct;
      bar.style.width = pct + '%';
      meter.setAttribute('aria-valuenow', pct);
      count.textContent = `${bytes(done)} of ${bytes(t)} (${pct}%)`;
      say(`${text} ${pct}%`);
    };
  }
  const copyFailed = (text, e) => { view.replaceChildren(welcome); idle(); return error(`${text}\n\n${e.message}`); };

  async function load({ list, handle, link }) {
    if (list && !list.length) return;
    keepStorage();
    say('Reading files...');
    if (!list) {
      try { list = await walkHandle(handle); } catch (e) { idle(); return error(`The folder ${handle.name} could not be read.\n\n${e.message}`); }
    }
    let g = findGame(list);
    // Disc images with no game beside them, or a folder with only an installer, are installed.
    const setupOnly = g && g.exes.every(e => /setup|install/i.test(e));
    const discs = (!g || setupOnly) && await discsOf(list.map(f => f.file).filter(f => DISC_FILE.test(f.name)));
    if (discs && discs.length) { idle(); return install({ discs }); }
    if (setupOnly) { idle(); return install({ folder: g }); }
    if (!g && list.some(f => /\.zip$/i.test(f.path))) {
      say('Unpacking...');
      try { g = findGame(await unzipAll(list)); } catch { idle(); return error('That zip could not be read. It may be damaged, or not really a .zip file.'); }
    }
    if (!g) {
      idle();
      return error(list.some(f => /\.(7z|rar|lzh)$/i.test(f.path)) ? 'That looks like an archive VNBox can\'t open. Extract it first, or make it a .zip.'
        : 'There is no Windows game here.\n\nVNBox looks for a folder with the game\'s .exe in it. A game on a disc installs from its disc image (.iso, .cue, .mds): File > Install from Disc Image.');
    }
    const old = recentGames().find(r => r.title === g.title);
    g.exe = old && g.exes.includes(old.exe) ? old.exe : g.exes.length === 1 ? g.exes[0]
      : await listDialog({ title: 'Choose the Program', parent: win, items: g.exes.map(e => [e, e]), value: g.exes[0],
        text: `${g.title} has more than one program. Which one starts the game?` });
    if (!g.exe) return idle();
    if (!(await confirmQuit())) return idle();
    await keepStorage(); // answered (or not asked again) before the room is measured
    const s = navigator.storage, { usage = 0, quota = 0 } = s.estimate ? await s.estimate().catch(() => ({})) : {};
    if (quota && g.size > (quota - usage) * 0.9) { idle(); return error(`There's no room in this browser for ${g.title} (${bytes(g.size)}). Remove a game you've finished from File > Games in This Browser, or free some disk space.`); }
    if (frame) stop('Ready');
    try {
      await copyGame(g, showProgress(`Copying ${g.title} into this browser...`, g.size));
    } catch (e) {
      return copyFailed(`${g.title} could not be copied into this browser.`, e);
    }
    Object.assign(g, { hook: old ? old.hook : '', res: old ? old.res : undefined, tuning: old ? old.tuning : '' });
    // Linked from a game's saves in Drive (linkDrive).
    if (link && link !== g.title) g.drive = link;
    delete g.files;
    remember(g);
    boot(g);
  }

  // ---------- installing from discs or an installer folder (vninstall.js) ----------

  // Installs from discs [{ main, files }] or an installer folder ({ title, files, size } from findGame).
  async function install({ discs, folder }) {
    keepStorage();
    let programs, listing = null, autorun = null, protection = [], title;
    if (discs) {
      say('Reading the disc...');
      try { listing = await listDisc(discs[0]); } catch (e) { idle(); return error(`${discs[0].main.name} could not be read.\n\n${e.message}`); }
      idle();
      if (!listing) return error(`${discs[0].main.name} has no file system VNBox can read: DVDs with only UDF, and music CDs, can't be installed.`);
      const inf = listing.files.find(f => /^autorun\.inf$/i.test(f.path));
      autorun = inf && autorunProgram(new TextDecoder('shift_jis').decode(await listing.read(inf)));
      protection = copyProtection(listing.files.map(f => f.path));
      programs = discPrograms(listing.files, autorun);
      title = (listing.label || discs[0].main.name.replace(/\.[^.]*$/, '')).replace(/[\\/:*?"<>|]/g, '_');
    } else {
      programs = discPrograms(folder.files.map(f => ({ path: f.path })), null);
      title = folder.title;
    }
    if (!programs.length) return error('There is no Windows program (.exe) on this disc to install the game with.');
    // Which installer a program is, from its first 4 MB.
    const kindOf = async path => installerKind(discs ? await listing.read(listing.files.find(f => f.path === path), 4 << 20)
      : new Uint8Array(await folder.files.find(f => f.path === path).file.slice(0, 4 << 20).arrayBuffer()));
    const opts = await installDialog({ title, programs, kindOf, protection, from: discs ? discs.map(d => d.main.name).join(', ') : 'the folder ' + folder.title }, win);
    if (!opts) return;
    if (recentGames().some(r => r.title === opts.title)) return error(`${opts.title} is already in this browser. Give this one another name, or remove it in File > Games in This Browser first.`);
    if (!(await confirmQuit())) return;
    const size = discs ? discSize(discs) : folder.size;
    await keepStorage();
    const st = navigator.storage, { usage = 0, quota = 0 } = st.estimate ? await st.estimate().catch(() => ({})) : {};
    // Room for the copy and about as much again for what the installer writes.
    if (quota && size * 2 > quota - usage) return error(`There's no room in this browser to install ${opts.title}: it needs about ${bytes(size * 2)}, and ${bytes(Math.max(0, quota - usage))} is free.`);
    if (frame) stop('Ready');
    const progress = showProgress(`Copying the ${discs ? 'disc' : 'installer'} into this browser...`, size);
    const discList = discs ? discs.map(discPath) : undefined;
    try {
      if (discs) await copyDiscs(discs, progress);
      // The game's folder (C:\files\<title>, the install target) holds an installer folder's copy while it runs.
      await copyGame({ title: opts.title, files: discs ? [] : folder.files.map(f => ({ path: SETUP_FOLDER + '/' + f.path, file: f.file })) }, progress);
    } catch (e) {
      await dropCopy({ title: opts.title, discs: discList });
      return copyFailed(`The ${discs ? 'disc' : 'installer'} could not be copied into this browser.`, e);
    }
    const dir = installDir(opts.title), installer = opts.installer.replaceAll('/', '\\');
    let p = discs ? `${DISC_DRIVE}:\\${installer}` : `${dir}\\${SETUP_FOLDER}\\${installer}`;
    const w = p.slice(0, p.lastIndexOf('\\') + 1);
    const quiet = opts.silent ? silentArgs(opts.kind, dir) : '';
    const own = autorun && autorun.program.toLowerCase() === opts.installer.toLowerCase() ? autorun.args : '';
    let args = [own, quiet].filter(Boolean).join(' ');
    // InstallShield's setup.exe /s stalls in VNBox; msiexec on the package beside it doesn't.
    const folderOf = x => x.slice(0, x.lastIndexOf('/') + 1);
    const msi = quiet && opts.kind === 'installshield' && discs && listing.files.find(f => /\.msi$/i.test(f.path) && folderOf(f.path) === folderOf(opts.installer));
    if (msi) { p = 'msiexec'; args = `/i "${DISC_DRIVE}:\\${msi.path.replaceAll('/', '\\')}" /qn`; }
    boot({ title: opts.title, exe: '', size: discs ? size : 0, discs: discList, install: { p, w, args, quiet: !!quiet, since: Date.now() } });
  }

  // The installer exited, or the visitor says it's done: the program it installed is picked, and it and
  // the files beside it move out of the engine's databases into the game's folder.
  // exited: no Windows program is left running; else the visitor chose File > Finish Install.
  async function finishInstall(exited) {
    const g = game, me = frame;
    if (!me || !g.install || g.install.finishing) return;
    if (!exited) {
      const b = await msgbox({ title: 'VNBox', icon: 'question', parent: win, buttons: ['&Yes', '&No'],
        text: `The installer is still running${g.install.quiet ? ' (quietly, with no window)' : ''}, and VNBox goes on by itself when it closes.\n\nStop it now and keep what it has installed so far? A game stopped halfway may not start.` });
      if (b !== 'Yes' || frame !== me || g.install.finishing) return;
    }
    g.install.finishing = true;
    say('Looking for the installed game...');
    await wait(1500); // the engine writes the last changes to its databases a moment after they happen
    if (frame !== me) return;
    stop('Looking for the installed game...');
    await wait(100); // the closed frame lets go of its databases
    try {
      const found = await installedPrograms(g.title, g.install.since);
      if (!found.length) {
        await dropInstall(g);
        idle();
        return error(`The installer left no Windows program (.exe) VNBox could find, so ${g.title} wasn't added.\n\nIf it stopped with an error, try again with its questions on, or with the disc's other installer.`);
      }
      const pick = found.length === 1 ? '0' : await listDialog({ title: 'Choose the Program', parent: win, value: '0',
        items: found.map((f, i) => [String(i), f.path.replace(/^drive_c\//, 'C:/') + (f.shortcut ? ' (has a shortcut)' : '') + ', ' + bytes(f.size)]),
        text: `Which program starts ${g.title}? It and the files beside it become the game's folder. Cancel discards the install.` });
      if (pick == null) { await dropInstall(g); return idle(); }
      const dir = await (await vnRoot()).getDirectoryHandle(g.title);
      const moved = await moveInstalled(g.title, dir, found[+pick], showProgress(`Moving ${g.title} into its folder...`));
      const ready = { title: g.title, exe: moved.exe, size: g.size + moved.size, hook: '', ...(g.discs && { discs: g.discs }) };
      remember(ready);
      showRecent();
      boot(ready);
    } catch (e) {
      copyFailed(`${g.title} could not be added.`, e);
    }
  }
  // A game, not an installer.
  const playing = () => !!game && !game.install;
  // Removes what a stopped install left: the game's folder and databases, and its discs.
  async function dropInstall(g) {
    if (game === g) game = null;
    await wait(100); // the closed frame lets go of its databases
    await dropCopy(g);
    await deleteSaveDbs(g.title);
  }
  async function pickDiscs() {
    const picked = (await pickFiles('.iso,.cue,.bin,.mds,.mdf,.img,.wav', true)).filter(f => DISC_FILE.test(f.name));
    if (picked.length) install({ discs: await discsOf(picked) });
  }

  async function openPicked() { load(await pickFolder()); }
  function openZip() {
    const input = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true });
    input.addEventListener('change', () => { load({ list: [...input.files].map(file => ({ path: file.name, file })) }); input.remove(); });
    input.addEventListener('cancel', () => input.remove());
    document.body.append(input);
    input.click();
  }
  async function openRecent(r) {
    if (!(await confirmQuit())) return;
    try { await (await vnRoot()).getDirectoryHandle(r.title); } catch {
      forget(r.title);
      showRecent();
      return error(`${r.title} isn't in this browser anymore (the browser may have cleared it). Open its folder again to play; its saves are still here.`);
    }
    remember(r);
    boot({ ...r });
  }

  async function removeGame(r) {
    const b = await msgbox({ title: 'VNBox', icon: 'question', parent: win, buttons: ['&Yes', '&No'],
      text: `Remove ${r.title} from this browser?\n\nIts saves are kept, and come back if you open its folder again.` });
    if (b !== 'Yes') return;
    if (frame && game.title === r.title) stop('Ready');
    forget(r.title);
    showRecent();
  }

  async function deleteSaves() {
    const synced = drive.enabled();
    const b = await msgbox({ title: 'Delete Saves', icon: 'warn', parent: win, buttons: ['&Yes', '&No'],
      text: `Delete every save of ${game.title} in this browser${synced ? ' and in your Google Drive' : ''}, and its Wine settings, then restart it?\n\nThis can't be undone.` });
    if (b !== 'Yes' || !frame) return;
    const g = game;
    if (synced) {
      say('Deleting the saves from Google Drive...');
      try {
        await chain;
        await drive.remove(driveKey(g.title), true);
      } catch (e) {
        idle();
        return msgbox({ title: 'Delete Saves', icon: 'error', parent: win,
          text: `The saves of ${g.title} could not be deleted from Google Drive, so the ones in this browser were kept too.\n\n${e.message}` });
      }
    }
    stop('Deleting the saves...');
    await new Promise(r => setTimeout(r, 100)); // the closed frame lets go of its databases
    await deleteSaveDbs(g.title);
    boot(g);
    say('Deleted the saves');
  }

  // The game stops while its save files are open (the engine would write its old tree back), and
  // starts again once they're closed.
  // shortcut: opening the same game again while they're open isn't blocked; block it if anyone does that.
  let savesWin = null;
  async function saveFiles(r) {
    if (savesWin) return savesWin.focus();
    const running = !!frame && game.title === r.title;
    if (running) {
      const b = await msgbox({ title: 'Save Files', icon: 'question', parent: win, buttons: ['OK', 'Cancel'],
        text: `${r.title} stops while its save files are open, and starts again when you close them.\n\nAnything you haven't saved in the game will be lost.` });
      if (b !== 'OK') return;
      const g = game;
      stop('The game is stopped while its save files are open');
      await wait(100); // the closed frame lets go of its databases
      r = g;
    }
    savesWin = savesWindow(r.title, win, () => { savesWin = null; if (running && !frame && win.el.isConnected) boot(r); });
  }

  // File > Games in This Browser: what each copy takes, and a way to remove it.
  function gamesDialog() {
    const rows = h('div', { class: 'cons-recent-list' });
    const used = h('p');
    const leftRows = h('div', { class: 'cons-recent-list' });
    const leftBox = h('fieldset', { class: 'group', hidden: true }, h('legend', null, 'Left behind'),
      h('p', null, 'Saves of games you removed (for a game installed here, with what its installer left), and copies no game uses.'), leftRows);
    async function showLeft() {
      const left = await leftovers(game && game.title).catch(() => []);
      leftBox.hidden = !left.length;
      leftRows.replaceChildren(...left.map(l => h('div', { class: 'cons-kept-item' }, icon('i-folder'),
        h('span', { class: 'cons-recent-name' }, l.disc ? 'Disc image no game uses' : l.title), h('span', { class: 'cons-recent-at' }, bytes(l.size)),
        h('button', { class: 'btn', type: 'button', title: 'Delete it', onclick: async () => {
          const b = await msgbox({ title: 'VNBox', icon: 'warn', parent: d, buttons: ['&Yes', '&No'],
            text: l.disc ? 'Delete this disc image from this browser?' : `Delete what's left of ${l.title} in this browser, its saves included?\n\nThis can't be undone (copies in Google Drive stay).` });
          if (b !== 'Yes') return;
          if (l.disc) await navigator.storage.getDirectory().then(o => o.getDirectoryHandle('vn-discs')).then(o => o.removeEntry(l.disc, { recursive: true })).catch(() => {});
          else { await dropCopy({ title: l.title }); await deleteSaveDbs(l.title); }
          show();
        } }, 'Delete'))));
    }
    function show() {
      showLeft();
      const list = recentGames();
      rows.replaceChildren(...(list.length ? list.map(r => h('div', { class: 'cons-kept-item' }, icon('i-folder'),
        h('span', { class: 'cons-recent-name' }, r.title), h('span', { class: 'cons-recent-at' }, bytes(r.size || 0)),
        h('button', { class: 'btn', type: 'button', title: 'Remove ' + r.title, onclick: async () => { await removeGame(r); show(); } }, 'Remove')))
        : [h('span', { class: 'cons-recent-at' }, 'No games are in this browser yet.')]));
      const st = navigator.storage;
      if (st && st.estimate) Promise.all([st.estimate(), st.persisted ? st.persisted() : false]).then(([{ usage, quota }, kept]) => {
        used.textContent = `This site is using ${bytes(usage || 0)} of the ${bytes(quota || 0)} the browser allows it. ` +
          (kept ? 'The browser has agreed not to clear it on its own.' : 'The browser may clear it on its own if it runs low on space.');
      }, () => {});
    }
    show();
    const form = h('form', { class: 'dlg cons-settings' },
      h('fieldset', { class: 'group' }, h('legend', null, 'Games'),
        h('p', null, 'Each game you open is copied here, so it opens again without choosing its folder. Removing one keeps its saves.'), rows, used),
      leftBox,
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'Close')));
    form.addEventListener('submit', e => { e.preventDefault(); d.close(true); });
    const d = createWindow({ title: 'Games in This Browser', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    form.querySelector('.default').focus();
  }

  const bar = menubar([
    { label: '&File', items: () => [
      { label: 'Open &Folder...', key: 'Ctrl+O', disabled: !can, action: openPicked },
      { label: 'Open &Zip...', disabled: !can, action: openZip },
      { label: '&Install from Disc Image...', disabled: !can, action: pickDiscs },
      ...(frame && game.install ? [{ label: 'Finish I&nstall', action: finishInstall }] : []),
      '-',
      { label: '&Close Game', disabled: !frame, action: () => confirmQuit().then(ok => ok && stop('Ready')) },
      { label: '&Save Files...', disabled: !playing(), action: () => saveFiles(game) },
      { label: '&Games in This Browser...', action: gamesDialog },
      ...(drive.available ? ['-',
        { label: drive.enabled() ? 'Turn Off Google &Drive Sync...' : 'Sync with Google &Drive...', action: () => drive.enabled() ? driveOff() : driveOn() },
        { label: 'S&ync Now', disabled: !frame || !drive.enabled(), action: () => syncSaves(game.title, { w: frame, interactive: true, report: true }) }] : []),
      '-',
      ...recentGames().map((r, i) => ({ label: `&${i + 1} ${r.title.length > 40 ? r.title.slice(0, 38) + '...' : r.title}`, action: () => openRecent(r) })),
      ...(recentGames().length ? ['-'] : []),
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Game', items: () => [
      { label: '&Restart', disabled: !frame || !!game.install, action: () => confirmQuit().then(ok => ok && boot(game)) },
      { label: 'S&kip Text', key: 'Ctrl', checked: skip, disabled: !frame, action: toggleSkip },
      { label: 'Screen &Size', disabled: !playing(), submenu: [...new Set([...SIZES, ...(game && game.res && game.res !== LEARN ? [game.res] : [])])].map(s => ({ label: s.replace('x', ' x '), checked: game && (game.res || SIZES[1]) === s, action: () => setSize(s) })) },
      { label: '&Tuning...', disabled: !playing(), action: tune },
      // Swaps the discs of a game installed from more than one (the engine's own controls are hidden).
      ...(game && game.discs ? [{ label: 'D&isc', disabled: !frame, submenu: [
        ...game.discs.map((d, i) => ({ label: `&${i + 1} ${d.slice(d.lastIndexOf('/') + 1)}`, checked: !!frame && frame.contentWindow.cdromCurrent === i,
          action: () => frame.contentWindow.insertCDRomDisc(i) })),
        '-', { label: '&Eject', action: () => frame.contentWindow.ejectCDRomDisc() }] }] : []),
      '-',
      { label: isFull() ? 'Exit &Full Screen' : '&Full Screen', disabled: !frame || !canFull, action: fullScreen },
    ] },
    { label: '&Text', items: () => [
      { label: 'Text &Hook...', disabled: !playing(), action: chooseHook },
      { label: 'Text Cl&eanup...', disabled: !playing(), action: cleanup },
      '-',
      { label: 'Show Text &Log', checked: showLog, action: toggleLog },
      { label: '&Copy Each Line to the Clipboard', checked: clip, action: () => { clip = !clip; store.set(CLIP, clip); } },
      '-',
      { label: '&Save Text Log...', disabled: !lines().length, action: () => download(game.title + ' text.txt', new Blob([lines().join('\n') + '\n'], { type: 'text/plain' })) },
      { label: 'C&lear Text Log', disabled: !lines().length, action: clearLog },
      '-',
      { label: '&Anki Mining', checked: anki.settings().on, action: ankiToggle },
      { label: 'Anki Se&ttings', submenu: [
        { label: 'Se&ntence Field...', action: () => ankiField('sentenceField', 'The note field with the mined sentence (picks the line):') },
        { label: '&Picture Field...', action: () => ankiField('pictureField', 'The note field for the screenshot:') },
        { label: 'A&udio Field...', action: () => ankiField('audioField', 'The note field for the line\'s sound:') },
        { label: 'AnkiConnect A&ddress...', action: () => ankiField('url', 'Where AnkiConnect listens:') },
        { label: 'Add Line &Sound', checked: anki.settings().audio, action: () => {
          anki.set({ audio: !anki.settings().audio });
          if (frame && shots) say('The line sound setting is used from the game\'s next start');
        } },
        '-',
        { label: '&How to Connect AnkiConnect...', action: ankiHelp },
      ] },
    ] },
    { label: '&Debug', items: () => [
      { label: 'Engine L&og', disabled: !frame, action: engineLog },
      { label: '&Delete This Game\'s Saves...', disabled: !frame || !playing(), action: deleteSaves },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help', 'VNBox') }, '-',
      { label: '&About VNBox', action: () => aboutVNBox(win) },
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

  // Touch screens have no right-click or Ctrl, so the game's menu and skip get buttons
  // under the game, in place of the status bar (CSS shows it only for touch, while playing).
  const refocus = f => () => { f(); if (frame) frame.focus(); };
  const skipBtn = h('button', { class: 'btn', type: 'button', onclick: refocus(toggleSkip) }, 'Skip');
  const touchFs = h('button', { class: 'btn', type: 'button', onclick: fullScreen, hidden: !canFull }, 'Full Screen');
  let folded = store.get(FOLD, false);
  const touchBar = h('div', { class: 'cons-touch' },
    h('button', { class: 'btn', type: 'button', onclick: refocus(gameMenu) }, 'Menu'),
    skipBtn, touchFs, h('button', { class: 'btn cons-fold', type: 'button', 'aria-label': folded ? 'Show buttons' : 'Hide buttons', 'aria-expanded': String(!folded), onclick: e => {
      folded = root.classList.toggle('cons-folded');
      store.set(FOLD, folded);
      e.currentTarget.setAttribute('aria-expanded', !folded);
      e.currentTarget.setAttribute('aria-label', folded ? 'Show buttons' : 'Hide buttons');
      if (frame) frame.focus();
    } }));
  const root = h('div', { class: folded ? 'cons vnb cons-folded' : 'cons vnb' }, hot, bar, view, touchBar, status);
  root.addEventListener('dragover', e => {
    if (!can || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropBox.classList.add('over');
  });
  root.addEventListener('dragleave', e => { if (!root.contains(e.relatedTarget)) dropBox.classList.remove('over'); });
  root.addEventListener('drop', e => {
    if (!can || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    dropBox.classList.remove('over');
    const p = fromDrop(e.dataTransfer);
    win.focus();
    p.then(load);
  });
  root.addEventListener('keydown', e => {
    if (can && e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openPicked(); }
  });

  const win = createWindow({
    app: 'vnbox', title: 'VNBox', icon: 'i-vnbox', body: root,
    width: 760, height: 560, minW: 320, minH: 260, route: 'vnbox',
    onClose: confirmQuit,
    onClosed: () => {
      clearInterval(poll);
      padStop();
      if (ankiStop) ankiStop();
      document.removeEventListener('visibilitychange', onHide);
      document.removeEventListener('fullscreenchange', leftFull);
      window.removeEventListener('message', onMessage);
      if (ownHook) URL.revokeObjectURL(ownHook.url);
      if (isFull()) document.exitFullscreen().catch(() => {});
    },
  });
  drive.preload();
  return win;
}

export default { id: 'vnbox', title: 'VNBox', icon: 'i-vnbox', single: true, open };
