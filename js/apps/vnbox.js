// VNBox: plays Windows visual novels on Wine in an emulated PC (VNBox, blankiekun's Boxedwine fork),
// in a frame (vnbox/engine/boxedwine.html). The engine reads the game from this browser's private
// storage a block at a time, so each game is copied there once and opens again from Recent games
// without choosing it. Saves stay in this browser (IndexedDB). A text hook script (0xDC00's, in
// vnbox/hooks/) sends each line of dialogue to the text log beside the game, for Yomitan or the clipboard.

import { h, icon, download, store } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar, openMenu } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import { fromDrop, pickFolder, walkHandle, unzipAll, bytes, when } from './conscripter.js';

const RECENT = 'w95.vnbox.recent';
const MAX_RECENT = 6;
const SHOW_LOG = 'w95.vnbox.log';
const CLIP = 'w95.vnbox.clip';
// The engine release in vnbox/engine/; tools/update-vnbox.sh (run by VNBox's update-site workflow) bumps it.
const ENGINE_VERSION = 'v0.2.1';
const ENGINE = 'vnbox/engine/';
const SIZES = ['640x480', '800x600', '1024x768', '1280x720'];
const MAX_LINES = 1000;
// The engine waits for the game's files with JSPI, which Chrome and Edge have (137 and later).
const canRun = typeof WebAssembly === 'object' && typeof WebAssembly.Suspending === 'function';
const canStore = !!(navigator.storage && navigator.storage.getDirectory && window.FileSystemFileHandle && 'createWritable' in FileSystemFileHandle.prototype);
// Installers, uninstallers and settings tools: never the game itself, unless there's nothing else.
const NOT_GAME = /^(unins|setup|install|config|vcredist|dxsetup|dxwebsetup|directx|patch|update)/i;
// The frame's own page has the Boxedwine shell's buttons and console; only the game shows here.
const FRAME_CSS = `body { background: #000; color: #c0c0c0; font: 12px sans-serif; }
#controls, #console, #app > hr { display: none !important; }
#dropzone { padding: 0; }
div.emscripten_border { border: 0; }`;

// Pixel art for the welcome page: a box with a visual novel in its window.
const ART = `<svg viewBox="0 0 64 56" width="96" height="84" shape-rendering="crispEdges">
<path fill="#000" d="M4 14h56v40H4z"/><path fill="#c08040" d="M5 15h54v38H5z"/><path fill="#e0a060" d="M5 15h54v2H5z"/><path fill="#804020" d="M5 51h54v2H5z"/>
<path fill="#000" d="M2 6h60v9H2z"/><path fill="#e0a060" d="M3 7h58v7H3z"/><path fill="#c08040" d="M3 12h58v2H3z"/>
<path fill="#000" d="M12 20h40v26H12z"/><path fill="#202060" d="M13 21h38v14H13z"/><path fill="#a04878" d="M13 30h38v5H13z"/><path fill="#fff0c0" d="M40 23h4v4h-4z"/>
<path fill="#f8b0c8" d="M18 25h6v2h1v4h-1v4h-6v-4h-1v-4h1z"/><path fill="#000040" d="M13 36h38v10H13z"/><path fill="#8080ff" d="M13 36h38v1H13z"/>
<path fill="#fff" d="M15 39h26v1H15zM15 42h18v1H15z"/><path class="cons-blink" fill="#ff0" d="M46 42h3v1h-1v1h-1v-1h-1z"/>
<path fill="#800000" d="M28 8h8v5h-8z"/><path fill="#fff" d="M30 9h4v1h-4z"/></svg>`;

// ---------- games in this browser ----------

// [{ title, at, size, exe, hook, res }], newest first. Each one has a copy of its files in the
// site's private storage (the origin private file system), in vn/<title>, where the engine reads them.
const recentGames = () => store.get(RECENT, []);
const vnRoot = () => navigator.storage.getDirectory().then(d => d.getDirectoryHandle('vn', { create: true }));
const dropCopy = title => vnRoot().then(r => r.removeEntry(title, { recursive: true })).catch(() => {});

function remember(g) {
  const old = recentGames().find(r => r.title === g.title) || {};
  const list = [{ ...old, title: g.title, at: Date.now(), size: g.size, exe: g.exe, hook: g.hook || '', res: g.res }, ...recentGames().filter(r => r.title !== g.title)];
  store.set(RECENT, list.slice(0, MAX_RECENT));
  for (const r of list.slice(MAX_RECENT)) dropCopy(r.title);
}
const setGame = (title, patch) => store.set(RECENT, recentGames().map(r => r.title === title ? { ...r, ...patch } : r));
function forget(title) {
  store.set(RECENT, recentGames().filter(r => r.title !== title));
  dropCopy(title);
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

// The save databases of a game: the engine names them after their mount points, which end in the game's folder.
async function deleteSaveDbs(title) {
  const end = encodeURIComponent('opfs:vn/' + title);
  const dbs = indexedDB.databases ? await indexedDB.databases().catch(() => []) : [];
  await Promise.all(dbs.filter(d => d.name && d.name.endsWith(end)).map(d => new Promise(res => {
    const r = indexedDB.deleteDatabase(d.name);
    r.onsuccess = r.onerror = r.onblocked = res;
  })));
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

function aboutVNBox(win) {
  return about('VNBox', 'i-vnbox', win, h('p', null, 'Engine ',
    h('a', { href: 'https://github.com/blankiekun/VNBox/releases/tag/' + ENGINE_VERSION, target: '_blank', rel: 'noopener' }, 'VNBox ' + ENGINE_VERSION),
    h('br'), 'Wine 11.0 on Tiny Core Linux, from Boxedwine', h('br'),
    'Text hooks by 0xDC00 and contributors (MIT)'));
}

// ---------- the window ----------

function open() {
  let game = null;   // what's loaded: { title, size, exe, hook, res }
  let frame = null;  // the running engine
  let errors = [];   // what the engine reported, for Debug > Engine Log
  let ownHook = null; // a hook script picked from a file this visit: { name, url }
  let showLog = store.get(SHOW_LOG, true), clip = store.get(CLIP, false);

  const dropBox = h('div', { class: 'cons-drop' }, icon('i-folder-open'),
    h('b', null, 'Drag a game folder or .zip here'),
    h('span', null, 'the one with the game\'s .exe in it'));
  const recentRows = h('div', { class: 'cons-recent-list' });
  const recentBox = h('fieldset', { class: 'group cons-recent' }, h('legend', null, 'Recent games'), recentRows);
  function showRecent() {
    const list = recentGames();
    recentBox.hidden = !list.length;
    recentRows.replaceChildren(...list.map(r => {
      const row = h('button', { class: 'cons-recent-item', type: 'button', onclick: () => openRecent(r), title: 'Play ' + r.title },
        icon('i-folder'), h('span', { class: 'cons-recent-name' }, r.title), h('span', { class: 'cons-recent-at' }, when(r.at)));
      row.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        openMenu([
          { label: '&Play', action: () => openRecent(r) },
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
        h('p', null, h('b', null, 'This browser can\'t run VNBox. '), 'It needs Chrome or Edge, version 137 or later, on a computer.')),
      dropBox,
      h('div', { class: 'cons-btns' },
        h('button', { class: 'btn default', type: 'button', disabled: !can, onclick: openPicked }, h('span', { html: 'Open <u>F</u>older...' })),
        h('button', { class: 'btn', type: 'button', disabled: !can, onclick: openZip }, h('span', { html: 'Open <u>Z</u>ip...' })),
        h('button', { class: 'btn', type: 'button', onclick: () => launch('help', 'VNBox') }, h('span', { html: '<u>H</u>elp' }))),
      recentBox,
      h('fieldset', { class: 'group cons-warn' }, h('legend', null, 'Good to know'),
        h('div', { class: 'cons-warn-row' }, icon('i-info'), h('p', null,
          'The first game downloads Wine (120 MB, once) and sets it up, which takes a few minutes. Games are slower than on Windows, and not every game runs. ',
          h('b', null, 'Saves are kept only in this browser'), ': clearing site data erases them.')),
        h('div', { class: 'cons-warn-row' }, icon('i-notepad'), h('p', null,
          'Japanese games can send their text to the ', h('b', null, 'text log'), ' beside the game, to look words up with Yomitan or copy them: choose ',
          h('b', null, 'Text > Text Hook'), ' while playing.')))));

  const log = h('div', { class: 'vnb-log', lang: 'ja', tabindex: 0, 'aria-label': 'Text log', 'aria-live': 'polite' });
  const logEmpty = h('p', { class: 'vnb-log-empty', lang: 'en' }, 'The game\'s text shows here once a text hook is on: Text > Text Hook.');
  const view = h('div', { class: 'cons-view' }, welcome);
  const statusText = h('span', null, 'Ready');
  const statusGame = h('span', { class: 'cons-size' }, '');
  const status = h('div', { class: 'statusbar' }, statusText, statusGame);
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

  // ---------- the text log ----------

  function addLine(text) {
    text = String(text).trim();
    if (!text) return;
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    logEmpty.remove();
    log.append(h('p', null, text));
    while (log.childElementCount > MAX_LINES) log.firstElementChild.remove();
    if (atEnd) log.scrollTop = log.scrollHeight;
    if (clip && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  }
  const lines = () => [...log.querySelectorAll('p:not(.vnb-log-empty)')].map(p => p.textContent);
  function clearLog() { log.replaceChildren(logEmpty); }
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
    const items = [['', '(None)'], ...(ownHook ? [['file', ownHook.name + ' (from your computer)']] : []), ...list];
    const pick = await listDialog({ title: 'Text Hook', parent: win, filter: true, items, value: game.hook || '',
      text: 'Choose the hook script for ' + game.title + '. It sends each line the game shows to the text log. The game restarts to use it.',
      extra: finish => h('button', { class: 'btn', type: 'button', onclick: () => pickHookFile().then(f => f && finish('file')) }, h('span', { html: 'From a F<u>i</u>le...' })) });
    if (pick == null || pick === (game.hook || '')) return frame && frame.focus();
    if (!(await confirmQuit())) return;
    game.hook = pick;
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

  // ---------- running a game ----------

  function stop(msg) {
    if (frame) frame.remove();
    frame = null;
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
    errors = [];
    const arg = (k, v) => k + '=' + encodeURIComponent(v);
    // The shell reads env= undecoded and splits it at the colon, so only the quotes are escaped.
    const hook = hookUrl(g);
    const q = [arg('lazy', 'opfs:vn/' + g.title), arg('p', g.exe), arg('root', 'TinyCore15Wine11.0-web.zip'), arg('overlay', 'jp.zip'),
      'env=%22LC_ALL:ja_JP.UTF-8%22', arg('resolution', g.res || SIZES[1]), ...(hook ? [arg('frida', hook)] : [])];
    frame = h('iframe', { class: 'cons-frame', title: g.title, src: ENGINE + 'boxedwine.html?' + q.join('&'), allow: 'fullscreen; autoplay', style: { visibility: 'hidden' } });
    const me = frame;
    frame.addEventListener('load', () => {
      const w = frame.contentWindow;
      w.document.head.append(Object.assign(w.document.createElement('style'), { textContent: FRAME_CSS }));
      w.boxedwineText = line => { if (frame === me) addLine(line); };
      frame.style.visibility = '';
      frame.focus();
    }, { once: true });
    clearLog();
    view.classList.add('playing');
    fsBtn.disabled = !canFull;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    view.replaceChildren(h('div', { class: 'vnb-play' }, frame, log));
    win.setTitle(g.title + ' - VNBox');
    statusGame.textContent = g.exe + ', ' + bytes(g.size);
    say('Playing ' + g.title);
  }

  // The engine posts { type: 'vnbox-error', source, message }; a game that couldn't be read never starts.
  function onMessage(e) {
    if (!frame || e.source !== frame.contentWindow || !e.data || e.data.type !== 'vnbox-error') return;
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
      text: `Quit ${game.title}?\n\nAnything you haven't saved in the game will be lost.` });
    return b === 'Yes';
  }

  function engineLog() {
    const out = frame && frame.contentDocument && frame.contentDocument.getElementById('output');
    const text = [out ? out.value : '', ...errors].filter(Boolean).join('\n');
    launch('notepad', { name: game.title + ' log.txt', text: text || '(The engine hasn\'t printed anything yet.)' });
  }

  function setSize(res) {
    game.res = res;
    setGame(game.title, { res });
    say('Restart the game to use the new screen size');
  }

  // ---------- opening games ----------

  // From a folder handle, or a list of files already read.
  async function load({ list, handle }) {
    if (list && !list.length) return;
    say('Reading files...');
    if (!list) {
      try { list = await walkHandle(handle); } catch (e) { idle(); return error(`The folder ${handle.name} could not be read.\n\n${e.message}`); }
    }
    let g = findGame(list);
    if (!g && list.some(f => /\.zip$/i.test(f.path))) {
      say('Unpacking...');
      try { g = findGame(await unzipAll(list)); } catch { idle(); return error('That zip could not be read. It may be damaged, or not really a .zip file.'); }
    }
    if (!g) {
      idle();
      return error(list.some(f => /\.(7z|rar|lzh)$/i.test(f.path)) ? 'That looks like an archive VNBox can\'t open. Extract it first, or make it a .zip.'
        : 'There is no Windows game here.\n\nVNBox looks for a folder with the game\'s .exe in it. If the game came on a disc or with an installer, install it on Windows first and open the folder it went into.');
    }
    const old = recentGames().find(r => r.title === g.title);
    g.exe = old && g.exes.includes(old.exe) ? old.exe : g.exes.length === 1 ? g.exes[0]
      : await listDialog({ title: 'Choose the Program', parent: win, items: g.exes.map(e => [e, e]), value: g.exes[0],
        text: `${g.title} has more than one program. Which one starts the game?` });
    if (!g.exe) return idle();
    if (!(await confirmQuit())) return idle();
    const s = navigator.storage, { usage = 0, quota = 0 } = s.estimate ? await s.estimate().catch(() => ({})) : {};
    if (quota && g.size > (quota - usage) * 0.9) { idle(); return error(`There's no room in this browser for ${g.title} (${bytes(g.size)}). Remove a game you've finished from File > Games in This Browser, or free some disk space.`); }
    if (frame) stop('Ready');
    let shown = -1;
    try {
      await copyGame(g, done => {
        const pct = Math.floor(done / (g.size || 1) * 100);
        if (pct !== shown) say(`Copying ${g.title} into this browser... ${shown = pct}%`);
      });
    } catch (e) {
      idle();
      return error(`${g.title} could not be copied into this browser.\n\n${e.message}`);
    }
    Object.assign(g, { hook: old ? old.hook : '', res: old ? old.res : undefined });
    delete g.files;
    remember(g);
    boot(g);
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
    const b = await msgbox({ title: 'Delete Saves', icon: 'warn', parent: win, buttons: ['&Yes', '&No'],
      text: `Delete every save of ${game.title} in this browser, and its Wine settings, then restart it?\n\nThis can't be undone.` });
    if (b !== 'Yes' || !frame) return;
    const g = game;
    stop('Deleting the saves...');
    await new Promise(r => setTimeout(r, 100)); // the closed frame lets go of its databases
    await deleteSaveDbs(g.title);
    boot(g);
    say('Deleted the saves');
  }

  // File > Games in This Browser: what each copy takes, and a way to remove it.
  function gamesDialog() {
    const rows = h('div', { class: 'cons-recent-list' });
    const used = h('p');
    function show() {
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
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'Close')));
    form.addEventListener('submit', e => { e.preventDefault(); d.close(true); });
    const d = createWindow({ title: 'Games in This Browser', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    form.querySelector('.default').focus();
  }

  const bar = menubar([
    { label: '&File', items: () => [
      { label: 'Open &Folder...', key: 'Ctrl+O', disabled: !can, action: openPicked },
      { label: 'Open &Zip...', disabled: !can, action: openZip },
      '-',
      { label: '&Close Game', disabled: !frame, action: () => confirmQuit().then(ok => ok && stop('Ready')) },
      { label: '&Games in This Browser...', action: gamesDialog },
      '-',
      ...recentGames().map((r, i) => ({ label: `&${i + 1} ${r.title.length > 40 ? r.title.slice(0, 38) + '...' : r.title}`, action: () => openRecent(r) })),
      ...(recentGames().length ? ['-'] : []),
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Game', items: () => [
      { label: '&Restart', disabled: !frame, action: () => confirmQuit().then(ok => ok && boot(game)) },
      { label: 'Screen &Size', disabled: !game, submenu: SIZES.map(s => ({ label: s.replace('x', ' x '), checked: game && (game.res || SIZES[1]) === s, action: () => setSize(s) })) },
      '-',
      { label: isFull() ? 'Exit &Full Screen' : '&Full Screen', disabled: !frame || !canFull, action: fullScreen },
    ] },
    { label: '&Text', items: () => [
      { label: 'Text &Hook...', disabled: !game, action: chooseHook },
      '-',
      { label: 'Show Text &Log', checked: showLog, action: toggleLog },
      { label: '&Copy Each Line to the Clipboard', checked: clip, action: () => { clip = !clip; store.set(CLIP, clip); } },
      '-',
      { label: '&Save Text Log...', disabled: !lines().length, action: () => download(game.title + ' text.txt', new Blob([lines().join('\n') + '\n'], { type: 'text/plain' })) },
      { label: 'C&lear Text Log', disabled: !lines().length, action: clearLog },
    ] },
    { label: '&Debug', items: () => [
      { label: 'Engine L&og', disabled: !frame, action: engineLog },
      { label: '&Delete This Game\'s Saves...', disabled: !frame, action: deleteSaves },
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

  const root = h('div', { class: 'cons vnb' }, hot, bar, view, status);
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
      document.removeEventListener('fullscreenchange', leftFull);
      window.removeEventListener('message', onMessage);
      if (ownHook) URL.revokeObjectURL(ownHook.url);
      if (isFull()) document.exitFullscreen().catch(() => {});
    },
  });
  return win;
}

export default { id: 'vnbox', title: 'VNBox', icon: 'i-vnbox', single: true, open };
