// CONscripter: plays an NScripter visual novel from a folder the visitor drops in.
// The engine runs in a frame (cons/player.html) that reads the files straight off
// their disk, so nothing is uploaded. Saves stay in this browser, and can be
// exported to a .zip and imported again.

import { h, icon, download } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';

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

function pickFiles(folder) {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', multiple: true, hidden: true });
    if (folder) input.webkitdirectory = true;
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
  return { files, font, title, size: files.reduce((n, f) => n + f.file.size, 0) };
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

  const player = () => frame && frame.contentWindow && frame.contentWindow.listSaves ? frame.contentWindow : null;

  // Welcome page, drawn like a 95 Setup wizard.
  const dropBox = h('div', { class: 'cons-drop' }, icon('i-folder-open'),
    h('div', null, h('b', null, 'Drag a game folder here'), h('br'), 'the one with 0.txt, 00.txt or nscript.dat in it'));
  const welcome = h('div', { class: 'cons-welcome' },
    h('div', { class: 'cons-side', 'aria-hidden': 'true' }, icon('i-game'), h('span', null, 'CON', h('b', null, 'scripter'))),
    h('div', { class: 'cons-main' },
      h('h2', null, 'Welcome to CONscripter'),
      h('p', null, 'CONscripter plays NScripter visual novels. Open a game folder from your computer to start.'),
      dropBox,
      h('div', { class: 'cons-btns' },
        h('button', { class: 'btn default', type: 'button', onclick: () => openPicked(true), html: 'Open <u>F</u>older...' }),
        h('button', { class: 'btn', type: 'button', onclick: () => openPicked(false), html: 'Open F<u>i</u>les...' })),
      h('p', { class: 'cons-note' }, icon('i-info'), h('span', null, 'The game is read from your disk and never leaves this computer. Saves are kept in this browser; use File > Export Saves to back them up.'))));

  const view = h('div', { class: 'cons-view' }, welcome);
  const statusText = h('span', null, 'Ready');
  const statusGame = h('span', { class: 'cons-size' }, '');
  const status = h('div', { class: 'statusbar' }, statusText, statusGame, h('span', { class: 'cons-saves' }, icon('i-floppy'), 'Saves: this browser'));
  const say = t => { statusText.textContent = t; };

  const bar = menubar([
    { label: '&File', items: () => [
      { label: 'Open &Folder...', key: 'Ctrl+O', action: () => openPicked(true) },
      { label: 'Open F&iles...', action: () => openPicked(false) },
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
      { label: '&Full Screen', disabled: !frame, action: () => frame && frame.requestFullscreen && frame.requestFullscreen().catch(() => {}) },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help', 'CONscripter') }, '-',
      { label: '&About CONscripter', action: () => about('CONscripter', 'i-game', win) },
    ] },
  ]);

  const root = h('div', { class: 'cons' }, bar, view, status);

  function stop(msg) {
    if (frame) frame.remove();
    frame = null; skip = false;
    view.classList.remove('playing');
    view.replaceChildren(welcome);
    win.setTitle('CONscripter');
    statusGame.textContent = '';
    say(msg);
  }

  function boot(g) {
    if (frame) frame.remove();
    game = g; skip = false;
    frame = h('iframe', { class: 'cons-frame', title: g.title, src: 'cons/player.html', allow: 'fullscreen; autoplay' });
    const me = frame;
    frame.addEventListener('load', () => {
      const w = frame.contentWindow;
      w.onGameDrop = takeDrop;
      w.start({
        files: g.files, title: g.title, font: g.font,
        onExit: code => { if (frame !== me) return; stop(code ? 'The game stopped (exit code ' + code + ')' : 'The game has ended'); },
        onError: msg => { if (frame !== me) return; stop('The game stopped'); msgbox({ title: 'CONscripter', icon: 'error', parent: win, text: 'CONscripter has stopped.\n\n' + msg }); },
      }).catch(err => { stop('Ready'); msgbox({ title: 'CONscripter', icon: 'error', parent: win, text: 'The game could not be started.\n\n' + err }); });
      frame.focus();
    }, { once: true });
    view.classList.add('playing');
    view.replaceChildren(frame);
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

  async function openPicked(folder) { load(await pickFiles(folder)); }
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
    if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openPicked(true); }
  });

  const win = createWindow({
    app: 'cons', title: 'CONscripter', icon: 'i-game', body: root,
    width: 660, height: 540, minW: 320, minH: 260, route: 'cons',
    onClose: confirmQuit,
  });
  return win;
}

export default { id: 'cons', title: 'CONscripter', icon: 'i-game', single: true, open };
