// The pretend disk: what My Computer, MS-DOS Prompt, Find and Notepad see.
//
// Node: { name, kind: 'drive'|'folder'|'file'|'app'|'page'|'link', children?, text?, app?, arg?, href?, icon?, size? }

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
  * Start > Settings > Display changes the colours and wallpaper.

Everything else (Minesweeper, Solitaire, Paint...) is here for fun.

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
            { name: 'Accessories', kind: 'folder', dos: 'ACCESS~1', children: [app('MSPAINT.EXE', 'paint', 'i-paint', 344064)] },
          ],
        },
        {
          name: 'WINDOWS', kind: 'folder', children: [
            { name: 'COMMAND', kind: 'folder', children: [app('COMMAND.COM', 'dos', 'i-dos', 92870)] },
            app('CALC.EXE', 'calc', 'i-calc', 59392),
            app('NOTEPAD.EXE', 'notepad', 'i-notepad', 34304),
            app('SOL.EXE', 'solitaire', 'i-sol', 180736),
            app('WINMINE.EXE', 'minesweeper', 'i-mine', 24064),
            app('DESK.CPL', 'display', 'i-display', 222208),
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
      app('Display', 'display', 'i-display'),
      app('System', 'sysprops', 'i-computer'),
      app('Date/Time', 'datetime', 'i-ctrl'),
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

export function drive(letter) {
  return root.children.find(n => n.letter === letter.toUpperCase());
}

// 'C:\\WINDOWS' -> node, using either long or 8.3 names.
export function resolve(path) {
  if (!path || path === 'My Computer') return root;
  if (path === 'Recycle Bin') return recycle;
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
  if (n.kind === 'app' || n.kind === 'joke') return /\.CPL$/i.test(n.name) || !/\./.test(n.name) ? 'Control Panel extension' : 'Application';
  if (n.kind === 'page') return 'HTML Document';
  if (n.kind === 'link') return 'Internet Shortcut';
  if (/\.(bat)$/i.test(n.name)) return 'MS-DOS Batch File';
  if (/\.(sys|inf)$/i.test(n.name)) return 'System file';
  if (/\.html?$/i.test(n.name)) return 'HTML Document';
  return 'Text Document';
}

export function sizeLabel(n) {
  if (n.size == null) return '';
  return Math.max(1, Math.ceil(n.size / 1024)).toLocaleString('en-US') + 'KB';
}
