// The pretend disk: what My Computer, MS-DOS Prompt, Find and Notepad see.
//
// Node: { name, kind: 'drive'|'folder'|'file'|'app'|'page'|'link'|'shortcut', children?, text?, data?, app?, arg?, href?, icon?, size?, target? }
//
// The files that ship with the site are read-only. Anything the visitor makes on C:
// (folders, notes, drawings, copies) is marked `user` and kept in localStorage.

const README = `blankiekun 95 - README.TXT
==========================

Hi! This is my homepage, dressed up as a Windows 95 desktop.

I write open-source tools for reading Japanese:

  chimimouryou          a self-hosted e-book reader for your
                        Calibre library
  CONscripter           a visual novel engine that runs in the
                        browser (and almost everywhere else)
  conscripter-convert   turns games made with other engines into
                        games CONscripter can play

The project pages are in Internet Explorer. Open it from the desktop
or the Start menu and look under Favorites.

Getting around
--------------
  * Double-click an icon on the desktop to open it.
  * Drag a window by its title bar. The outline follows your mouse,
    and the window moves when you let go.
  * Drag a window's edge or corner to resize it.
  * Right-click the desktop for more options.
  * Start > Settings > Display changes the colours, wallpaper and
    screen saver.
  * Right-click the taskbar to cascade, tile or minimize windows.
  * Notepad, WordPad and Paint save on drive C:. Save to 3½ Floppy
    (A:) to download a file to your real computer.

Everything else (Minesweeper, FreeCell, Hearts, Paint...) is here
for fun.

Source code: https://github.com/blankiekun
`;

const TODO = `TODO.TXT

[x] chimimouryou: play visual novels inside the reader
[x] CONscripter: WebAssembly build, saves in IndexedDB
[x] conscripter-convert: Xuse games (最果てのイマ)
[ ] conscripter-convert: Nitroplus reader
[ ] conscripter-convert: movies
[ ] beat Minesweeper on Expert in under 100 seconds
`;

const AUTOEXEC = `@ECHO OFF
PROMPT $P$G
PATH C:\\WINDOWS;C:\\WINDOWS\\COMMAND
SET BLASTER=A220 I5 D1 T4
SET HOMEPAGE=http://www.geocities.com/SiliconValley/Lab/1995/
`;

const CONFIG = `DEVICE=C:\\WINDOWS\\HIMEM.SYS
DEVICE=C:\\WINDOWS\\EMM386.EXE NOEMS
DOS=HIGH,UMB
FILES=40
BUFFERS=30
`;

const BUGS = `bugs.txt  (deleted)

- the converter forgot what time of day it was and lit every
  night scene like noon. fixed: tints are pre-rendered now.
- chimimouryou counted furigana as characters read. fixed.
- Minesweeper keeps blowing up on the first click.
  (not a bug. skill issue.)
`;

const OLDSITE = `<html>
<head><title>blankiekun's page</title></head>
<body bgcolor="#000000" text="#00ff00">
<center>
<h1>UNDER CONSTRUCTION</h1>
<img src="construction.gif">
<p>come back soon!!!</p>
</center>
</body>
</html>
`;

const app = (name, appId, icon, size, arg) => ({ name, kind: 'app', app: appId, icon, size, arg });
const page = (name, key, size, dos) => ({ name, kind: 'page', page: key, icon: 'i-htm', size, dos });
const txt = (name, text) => ({ name, kind: 'file', icon: 'i-txt', text, size: text.length });

export const root = {
  name: 'My Computer', kind: 'folder', icon: 'i-computer', children: [
    { name: '3½ Floppy (A:)', kind: 'drive', letter: 'A', icon: 'i-floppy', notReady: true, children: [] },
    {
      name: '(C:)', kind: 'drive', letter: 'C', icon: 'i-drive', children: [
        {
          name: 'My Documents', kind: 'folder', children: [
            txt('README.TXT', README),
            txt('TODO.TXT', TODO),
          ],
        },
        {
          name: 'Program Files', kind: 'folder', dos: 'PROGRA~1', children: [
            { name: 'Internet Explorer', kind: 'folder', dos: 'INTERN~1', children: [app('IEXPLORE.EXE', 'ie', 'i-ie', 1012736)] },
            { name: 'Accessories', kind: 'folder', dos: 'ACCESS~1', children: [
              app('MSPAINT.EXE', 'paint', 'i-paint', 344064), app('WORDPAD.EXE', 'wordpad', 'i-wordpad', 183296),
              { name: 'HyperTerminal', kind: 'folder', dos: 'HYPERT~1', children: [app('HYPERTRM.EXE', 'hyperterm', 'i-hyperterm', 26112)] },
            ] },
            { name: 'blankiekun Exchange', kind: 'folder', dos: 'BLANKI~1', children: [app('EXCHNG32.EXE', 'inbox', 'i-inbox', 427520)] },
            { name: 'CONscripter', kind: 'folder', dos: 'CONSCR~1', children: [app('CONSCRIPTER.EXE', 'cons', 'i-game', 4767101)] },
          ],
        },
        {
          name: 'WINDOWS', kind: 'folder', children: [
            { name: 'COMMAND', kind: 'folder', children: [app('COMMAND.COM', 'dos', 'i-dos', 92870)] },
            { name: 'Desktop', kind: 'folder', dos: 'DESKTOP', children: [] },
            { name: 'MEDIA', kind: 'folder', children: [app('BLANKIEKUN.AVI', 'mplayer', 'i-mplayer', 1048576, 'demo')] },
            app('CALC.EXE', 'calc', 'i-calc', 59392),
            app('NOTEPAD.EXE', 'notepad', 'i-notepad', 34304),
            app('SOL.EXE', 'solitaire', 'i-sol', 180736),
            app('WINMINE.EXE', 'minesweeper', 'i-mine', 24064),
            app('DESK.CPL', 'display', 'i-display', 222208),
            app('CHARMAP.EXE', 'charmap', 'i-charmap', 15872),
            app('FREECELL.EXE', 'freecell', 'i-freecell', 30208),
            app('MSHEARTS.EXE', 'hearts', 'i-hearts', 30720),
            app('SNDREC32.EXE', 'sndrec', 'i-sndrec', 51200),
            app('CDPLAYER.EXE', 'cdplayer', 'i-cdplayer', 106496),
            app('DEFRAG.EXE', 'defrag', 'i-defrag', 222720),
            app('SCANDSKW.EXE', 'scandisk', 'i-drive', 189952),
            app('TASKMAN.EXE', 'taskman', 'i-exe', 14848),
            app('MPLAYER.EXE', 'mplayer', 'i-mplayer', 33280),
            app('CLIPBRD.EXE', 'clipbrd', 'i-clipbrd', 16896),
            app('DIALER.EXE', 'dialer', 'i-dialer', 39936),
            app('REGEDIT.EXE', 'regedit', 'i-regedit', 77824),
            app('WELCOME.EXE', 'welcome', 'i-flag', 21504),
            app('EXPLORER.EXE', 'explorer', 'i-folder-open', 204288, 'C:\\'),
          ],
        },
        txt('AUTOEXEC.BAT', AUTOEXEC),
        txt('CONFIG.SYS', CONFIG),
      ],
    },
    {
      name: 'Projects (D:)', kind: 'drive', letter: 'D', icon: 'i-drive', children: [
        page('index.htm', 'home', 9216),
        page('chimimouryou.htm', 'chimimouryou', 14336),
        page('conscripter-convert.htm', 'convert', 11264),
        page('CONscripter.htm', 'conscripter', 12288, 'CONSCR~2.HTM'),
        { name: 'GitHub', kind: 'link', href: 'https://github.com/blankiekun', icon: 'i-github' },
      ],
    },
    { name: 'Bk95_cd (E:)', kind: 'drive', letter: 'E', icon: 'i-cd', children: [
      txt('AUTORUN.INF', '[autorun]\nopen=SETUP.EXE\nicon=SETUP.EXE,0\n'),
      app('SETUP.EXE', 'setup', 'i-exe', 61440),
    ] },
    { name: 'Control Panel', kind: 'folder', icon: 'i-ctrl', virtual: true, children: [
      app('Add/Remove Programs', 'addremove', 'i-addremove'),
      app('Date/Time', 'datetime', 'i-ctrl'),
      app('Display', 'display', 'i-display'),
      app('Mouse', 'mouse', 'i-mouse'),
      app('Regional Settings', 'regional', 'i-globe'),
      app('Sounds', 'sounds', 'i-speaker'),
      app('System', 'sysprops', 'i-computer'),
      app('Taskbar', 'taskbarprops', 'i-taskbar'),
    ] },
    { name: 'Printers', kind: 'folder', icon: 'i-printer', virtual: true, children: [] },
  ],
};

export const recycle = {
  name: 'Recycle Bin', kind: 'folder', icon: 'i-trash-full', children: [
    { ...txt('bugs.txt', BUGS), from: 'C:\\My Documents' },
    { name: 'old_website_v1.html', kind: 'file', icon: 'i-htm', text: OLDSITE, size: OLDSITE.length, from: 'C:\\My Documents' },
    { name: 'FREE_SCREENSAVERS.EXE', kind: 'joke', icon: 'i-exe', size: 666666, from: 'C:\\WINDOWS\\DESKTOP' },
  ],
};

// Network Neighborhood: blankiekun's computer shares the projects.
const repo = name => ({ name, kind: 'link', href: 'https://github.com/blankiekun/' + name, icon: 'i-github' });
export const network = {
  name: 'Network Neighborhood', kind: 'folder', icon: 'i-network', virtual: true, children: [
    { name: 'Entire Network', kind: 'folder', icon: 'i-network', virtual: true, children: [
      { name: 'Workgroup', kind: 'folder', icon: 'i-network', virtual: true, children: [] },
    ] },
    { name: 'Blankiekun', kind: 'folder', icon: 'i-pc', virtual: true, comment: 'blankiekun\'s computer', children: [
      repo('chimimouryou'), repo('CONscripter'), repo('conscripter-convert'),
      { name: 'Homepage', kind: 'page', page: 'home', icon: 'i-htm' },
    ] },
    { name: 'Geocities', kind: 'folder', icon: 'i-pc', virtual: true, offline: true, comment: 'closed in 2009', children: [] },
  ],
};

export function drive(letter) {
  return root.children.find(n => n.letter === letter.toUpperCase());
}

// 'C:\\WINDOWS' -> node, using either long or 8.3 names.
export function resolve(path) {
  if (!path || path === 'My Computer') return root;
  if (path === 'Recycle Bin') return recycle;
  if (path === 'Network Neighborhood') return network;
  if (path.startsWith('\\\\')) {
    const node = network.children[1].name.toUpperCase() === path.slice(2).split('\\')[0].toUpperCase() ? network.children[1] : network.children.find(c => '\\\\' + c.name.toUpperCase() === path.toUpperCase());
    return node || null;
  }
  if (path === 'Control Panel' || path === 'Printers') return root.children.find(n => n.name === path);
  const m = /^([a-z]):\\?(.*)$/i.exec(path);
  if (!m) return null;
  let node = drive(m[1]);
  if (!node) return null;
  for (const part of m[2].split('\\').filter(Boolean)) {
    node = (node.children || []).find(c => same(c, part));
    if (!node) return null;
  }
  return node;
}

export function same(node, name) {
  const n = name.toUpperCase();
  return node.name.toUpperCase() === n || (node.dos || '').toUpperCase() === n || dosName(node) === n;
}

export function pathOf(node, parent = root, prefix = '') {
  for (const c of parent.children || []) {
    const p = c.kind === 'drive' ? c.letter + ':\\' : prefix + (prefix.endsWith('\\') ? '' : '\\') + c.name;
    if (c === node) return p;
    if (c.children) { const r = pathOf(node, c, p); if (r) return r; }
  }
  return null;
}

// 8.3 name for the DOS prompt.
export function dosName(node) {
  if (node.dos) return node.dos.toUpperCase();
  const dot = node.name.lastIndexOf('.');
  let base = (dot > 0 ? node.name.slice(0, dot) : node.name).replace(/[^a-z0-9_~-]/gi, '').toUpperCase();
  const ext = dot > 0 ? node.name.slice(dot + 1).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 3) : '';
  if (base.length > 8) base = base.slice(0, 6) + '~1';
  return ext ? base + '.' + ext : base;
}

export function walk(fn, node = root, path = '') {
  for (const c of node.children || []) {
    const p = c.kind === 'drive' ? c.letter + ':\\' : path + (path.endsWith('\\') ? '' : '\\') + c.name;
    fn(c, p, path);
    if (c.children && !c.virtual && !c.notReady) walk(fn, c, p);
  }
}

export function kindLabel(n) {
  if (n.kind === 'drive') return n.letter === 'A' ? '3½ Inch Floppy Disk' : n.letter === 'E' ? 'CD-ROM Disc' : 'Local Disk';
  if (n.kind === 'folder') return n.virtual ? 'System Folder' : 'File Folder';
  if (n.printer) return n.isDefault ? 'Printer (default)' : 'Printer';
  if (n.app === 'addprinter') return 'Printer Wizard';
  if (n.app === 'mplayer' && n.arg === 'demo') return 'Video Clip';
  if (n.kind === 'app' || n.kind === 'joke') return /\.CPL$/i.test(n.name) || !/\./.test(n.name) ? 'Control Panel extension' : 'Application';
  if (n.kind === 'page') return 'HTML Document';
  if (n.kind === 'link') return 'Internet Shortcut';
  if (n.kind === 'shortcut') return 'Shortcut';
  if (/\.(bat)$/i.test(n.name)) return 'MS-DOS Batch File';
  if (/\.(sys|inf)$/i.test(n.name)) return 'System file';
  if (/\.html?$/i.test(n.name)) return 'HTML Document';
  if (/\.(doc|wri)$/i.test(n.name)) return 'WordPad Document';
  if (/\.rtf$/i.test(n.name)) return 'Rich Text Format';
  if (/\.(bmp|png|gif|jpe?g)$/i.test(n.name)) return 'Bitmap Image';
  if (/\.(wav|mp3|ogg)$/i.test(n.name)) return 'Wave Sound';
  if (/\.(avi|mp4|webm)$/i.test(n.name)) return 'Video Clip';
  if (/\.ht$/i.test(n.name)) return 'HyperTerminal file';
  return 'Text Document';
}

export function sizeLabel(n) {
  if (n.size == null) return '';
  return Math.max(1, Math.ceil(n.size / 1024)).toLocaleString('en-US') + 'KB';
}

// ---------- the visitor's files ----------

const KEY = 'w95.fs';
const BAD = /[\\/:*?"<>|]/;
const listeners = new Set();

export class FsError extends Error {}

export const desktopFolder = () => resolve('C:\\WINDOWS\\Desktop');
export const docsFolder = () => resolve('C:\\My Documents');

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Which program opens a file, and its icon, go by the extension like on the real thing.
export function iconForName(name) {
  const ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1]?.toLowerCase();
  if (ext === 'htm' || ext === 'html') return 'i-htm';
  if (ext === 'doc' || ext === 'wri' || ext === 'rtf') return 'i-doc';
  if (ext === 'bmp' || ext === 'png' || ext === 'gif' || ext === 'jpg') return 'i-bmp';
  if (ext === 'wav' || ext === 'mp3' || ext === 'ogg') return 'i-sndrec';
  if (ext === 'ht') return 'i-hyperterm';
  if (ext === 'avi' || ext === 'mp4' || ext === 'webm') return 'i-mplayer';
  return 'i-txt';
}

export function openerFor(node) {
  if (/\.(doc|wri|rtf)$/i.test(node.name)) return 'wordpad';
  if (/\.(wav|mp3|ogg)$/i.test(node.name)) return 'sndrec';
  if (/\.ht$/i.test(node.name)) return 'hyperterm';
  if (/\.(avi|mp4|webm|mid|rmi)$/i.test(node.name)) return 'mplayer';
  if (/\.(bmp|png|gif|jpe?g)$/i.test(node.name) || node.data) return 'paint';
  return 'notepad';
}

function sizeOf(n) {
  if (n.children) return undefined;
  if (n.kind === 'shortcut') return 342;
  if (n.data) return Math.round(n.data.length * 0.75);
  if (n.text != null) return new Blob([n.text]).size;
  return n.size;
}

export function parentOf(node, from = root) {
  if (node === root || node === recycle || node === network) return null;
  if (from === root) {
    if (recycle.children.includes(node)) return recycle;
    const n = parentOf(node, network);
    if (n) return n;
  }
  for (const c of from.children || []) {
    if (c === node) return from;
    if (c.children) { const r = parentOf(node, c); if (r) return r; }
  }
  return null;
}

// Folders on C: take new files. The other drives and the system folders don't.
export function canWrite(folder) {
  if (!folder || !folder.children || folder.virtual || folder === recycle) return false;
  const p = pathOf(folder);
  return !!p && p.startsWith('C:');
}

export function checkName(name) {
  const n = name.trim();
  if (!n) throw new FsError('You must type a filename.');
  if (BAD.test(n)) throw new FsError('A filename cannot contain any of the following characters:\n\\ / : * ? " < > |');
  return n;
}

export function child(folder, name) {
  return (folder.children || []).find(c => c.name.toUpperCase() === name.toUpperCase());
}

export function uniqueName(folder, base) {
  if (!child(folder, base)) return base;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base, ext = dot > 0 ? base.slice(dot) : '';
  for (let i = 2; ; i++) if (!child(folder, `${stem} (${i})${ext}`)) return `${stem} (${i})${ext}`;
}

function make(props) {
  const n = { ...props, user: true, mtime: props.mtime || Date.now() };
  if (n.kind === 'file' && !n.icon) n.icon = iconForName(n.name);
  if (n.children) n.children = n.children.map(make);
  n.size = sizeOf(n);
  return n;
}

function guard(folder) {
  if (!canWrite(folder)) {
    const p = folder === recycle ? 'the Recycle Bin' : pathOf(folder) || folder.name;
    throw new FsError(`Cannot create or replace files in ${p}: Access is denied.\n\nMake sure the disk is not full or write-protected.`);
  }
}

function readOnly(node, verb) {
  if (!node.user) throw new FsError(`Cannot ${verb} ${node.name}: Access is denied.\n\nIt's one of the files that came with blankiekun 95, so it can't be changed.`);
}

export function mkdir(folder, name = 'New Folder') {
  guard(folder);
  const n = make({ name: uniqueName(folder, checkName(name)), kind: 'folder', children: [] });
  return add(folder, n);
}

export function createFile(folder, name, props = {}) {
  guard(folder);
  const n = make({ text: '', ...props, name: uniqueName(folder, checkName(name)), kind: 'file' });
  return add(folder, n);
}

// Save: makes the file, or replaces what's in it.
export function writeFile(path, props) {
  const i = path.lastIndexOf('\\');
  const folder = resolve(i === 2 ? path.slice(0, 3) : path.slice(0, i));
  const name = checkName(path.slice(i + 1));
  if (!folder) throw new FsError(`The folder for ${path} does not exist.`);
  guard(folder);
  const old = child(folder, name);
  if (old) {
    if (old.children) throw new FsError(`Cannot save ${name}: there is already a folder with that name.`);
    readOnly(old, 'replace');
    const before = { text: old.text, data: old.data, mtime: old.mtime, size: old.size };
    delete old.text; delete old.data;
    Object.assign(old, props, { mtime: Date.now() });
    old.size = sizeOf(old);
    try { changed(); } catch (e) { delete old.text; delete old.data; Object.assign(old, before); changed(true); throw e; }
    return old;
  }
  return add(folder, make({ ...props, name, kind: 'file' }));
}

export function rename(node, name) {
  readOnly(node, 'rename');
  const n = checkName(name);
  const folder = parentOf(node);
  const other = folder && child(folder, n);
  if (other && other !== node) throw new FsError(`Cannot rename ${node.name}: A file with the name you specified already exists. Specify a different filename.`);
  node.name = n;
  if (node.kind === 'file' && node.icon && /^i-(txt|htm|doc|bmp|sndrec|mplayer|hyperterm)$/.test(node.icon)) node.icon = iconForName(n);
  changed();
}

// Delete sends things to the Recycle Bin. Deleting from the bin is for good.
export function remove(node) {
  const folder = parentOf(node);
  if (folder === recycle) {
    recycle.children.splice(recycle.children.indexOf(node), 1);
    if (!node.user) gone.add(node.name);
    changed();
    return;
  }
  readOnly(node, 'delete');
  folder.children.splice(folder.children.indexOf(node), 1);
  node.from = pathOf(folder) || 'C:\\';
  node.deleted = Date.now();
  recycle.children.push(node);
  changed();
}

export function restore(node) {
  if (!node.user) throw new FsError(`${node.name} is happier in the Recycle Bin.\n\nIt will stay here.`);
  let folder = resolve(node.from);
  if (!canWrite(folder)) folder = docsFolder();
  recycle.children.splice(recycle.children.indexOf(node), 1);
  node.name = uniqueName(folder, node.name);
  delete node.from; delete node.deleted;
  folder.children.push(node);
  changed();
}

export function emptyBin() {
  for (const n of recycle.children) if (!n.user) gone.add(n.name);
  recycle.children.length = 0;
  changed();
}

function inside(node, folder) {
  for (let f = folder; f; f = parentOf(f)) if (f === node) return true;
  return false;
}

export function copy(node, folder) {
  guard(folder);
  if (node.children && inside(node, folder)) throw new FsError(`Cannot copy ${node.name}: The destination folder is a subfolder of the source folder.`);
  const clone = n => { const { el, from, deleted, ...rest } = n; return { ...rest, mtime: Date.now(), children: n.children && n.children.map(clone) }; };
  const c = clone(node);
  if (child(folder, c.name)) c.name = child(folder, 'Copy of ' + c.name) ? uniqueName(folder, 'Copy of ' + c.name) : 'Copy of ' + c.name;
  return add(folder, make(c));
}

export function move(node, folder) {
  const from = parentOf(node);
  if (from === folder) return node;
  if (from === recycle) { node.from = pathOf(folder); restore(node); return node; }
  readOnly(node, 'move');
  guard(folder);
  if (node.children && inside(node, folder)) throw new FsError(`Cannot move ${node.name}: The destination folder is a subfolder of the source folder.`);
  if (child(folder, node.name)) throw new FsError(`Cannot move ${node.name}: A file with the name you specified already exists.`);
  from.children.splice(from.children.indexOf(node), 1);
  folder.children.push(node);
  changed();
  return node;
}

// ---------- shortcuts ----------

// A shortcut remembers where its target lives, or, for things with no path
// (Control Panel items, pages, links), a copy of how to open it.
export function where(node) {
  if (node === root) return 'My Computer';
  if (node === recycle) return 'Recycle Bin';
  if (node === network) return 'Network Neighborhood';
  const p = pathOf(node);
  return p && /^[A-Z]:/.test(p) ? p : null;
}

export function shortcut(target, folder) {
  guard(folder);
  if (target.kind === 'shortcut') return copy(target, folder);
  const path = where(target);
  const ref = path ? null : (({ kind, app, arg, page, href, icon, name }) => ({ kind, app, arg, page, href, icon, name }))(target);
  const label = target === root ? 'My Computer' : target.kind === 'drive' ? `(${target.letter})` : target.name;
  const n = make({ name: uniqueName(folder, 'Shortcut to ' + label.replace(BAD, '')), kind: 'shortcut', target: path, ref, icon: target.icon || (target.children ? 'i-folder' : iconForName(target.name)) });
  return add(folder, n);
}

// What a shortcut points at now, or null when the target is gone.
export function follow(sc) {
  if (sc.target) return resolve(sc.target);
  return sc.ref || null;
}

export function folderStats(folder) {
  let files = 0, folders = 0, bytes = 0;
  const go = f => { for (const c of f.children || []) { if (c.children) { folders++; go(c); } else { files++; bytes += c.size || 0; } } };
  go(folder);
  return { files, folders, bytes };
}

// ---------- saving to localStorage ----------

const gone = new Set();   // shipped Recycle Bin files the visitor emptied

function ser(n) {
  const { el, user, size, children, ...rest } = n;
  return children ? { ...rest, children: children.map(ser) } : rest;
}

// Adds a new node, taking it back out if there's no room to keep it.
function add(folder, n) {
  folder.children.push(n);
  try { changed(); } catch (e) { folder.children.splice(folder.children.indexOf(n), 1); changed(true); throw e; }
  return n;
}

function changed(quiet) {
  const out = { at: [], bin: recycle.children.filter(n => n.user).map(ser), gone: [...gone] };
  const go = (folder, path) => {
    for (const c of folder.children || []) {
      const p = c.kind === 'drive' ? c.letter + ':\\' : path + (path.endsWith('\\') ? '' : '\\') + c.name;
      if (c.user) out.at.push({ at: path, node: ser(c) });
      else if (c.children && !c.virtual && !c.notReady) go(c, p);
    }
  };
  go(root, '');
  let full = false;
  try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { full = true; }
  for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } }
  if (full && !quiet) throw new FsError('There is not enough free disk space.\n\nDelete some files (Paint pictures take the most room) and empty the Recycle Bin, then try again.');
}

(function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  if (!d) return;
  for (const { at, node } of d.at || []) {
    const folder = resolve(at);
    if (folder && folder.children && !child(folder, node.name)) folder.children.push(make(node));
  }
  for (const name of d.gone || []) { gone.add(name); const i = recycle.children.findIndex(n => !n.user && n.name === name); if (i >= 0) recycle.children.splice(i, 1); }
  for (const n of d.bin || []) recycle.children.push(make(n));
})();
