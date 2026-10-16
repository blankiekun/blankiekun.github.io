// MS-DOS Prompt. Reads the pretend disk in fs.js and can start the other programs.

import { h } from '../util.js';
import { createWindow, launch, toggleMax } from '../wm.js';
import { resolve, dosName, drive, pathOf, mkdir, remove, rename, copy, createFile, FsError } from '../fs.js';
import { run, open as shellOpen, bsod, ALIASES, PROJECTS } from '../shell.js';

const STAMP = '08-24-95  11:11a';

function open(arg) {
  let cwd = 'C:\\MYDOCU~1';
  const hist = [];
  let hpos = 0;
  let pendingAbort = null;

  const out = h('div', { class: 'dos-out' });
  const typed = h('span');
  const promptEl = h('span');
  const cursor = h('span', { class: 'dos-cursor' }, '_');
  const line = h('div', { class: 'dos-line' }, promptEl, typed, cursor);
  const input = h('input', { class: 'dos-input', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': 'Command' });
  const screen = h('div', { class: 'dos-screen' }, out, line, input);
  const fontSel = h('select', { class: 'field dos-font', 'aria-label': 'Font size' }, ...['Auto', '6 x 12', '8 x 16', '10 x 20'].map(v => h('option', null, v)));
  fontSel.addEventListener('change', () => { screen.dataset.font = fontSel.selectedIndex; input.focus(); });
  const toolbar = h('div', { class: 'dos-tools' }, fontSel,
    h('button', { type: 'button', class: 'dos-tb', title: 'Copy', onclick: () => navigator.clipboard?.writeText(window.getSelection().toString()).catch(() => {}) }, 'Copy'),
    h('button', { type: 'button', class: 'dos-tb', title: 'Paste', onclick: async () => { try { input.value += await navigator.clipboard.readText(); sync(); } catch {} input.focus(); } }, 'Paste'),
    h('button', { type: 'button', class: 'dos-tb', title: 'Full screen', onclick: () => { toggleMax(win); input.focus(); } }, 'Full'));

  const print = (text = '') => { out.append(h('div', null, text)); };
  const prompt = () => cwd + '>';
  function sync() {
    typed.textContent = input.value;
    promptEl.textContent = pendingAbort ? '' : prompt();
    screen.scrollTop = screen.scrollHeight;
  }

  function abs(p) {
    if (!p) return cwd;
    p = p.replace(/\//g, '\\');
    let parts;
    if (/^[a-z]:/i.test(p)) { parts = [p.slice(0, 2).toUpperCase()]; p = p.slice(2); }
    else if (p.startsWith('\\')) parts = [cwd.slice(0, 2)];
    else parts = cwd.replace(/\\$/, '').split('\\');
    for (const seg of p.split('\\').filter(Boolean)) {
      if (seg === '.') continue;
      if (seg === '..') { if (parts.length > 1) parts.pop(); } else parts.push(seg);
    }
    return parts.length === 1 ? parts[0] + '\\' : parts.join('\\');
  }
  // 'NOTES\\A.TXT' -> [folder node, 'A.TXT'], relative to the current directory.
  function split(arg) {
    const p = abs(arg);
    const i = p.lastIndexOf('\\');
    return [resolve(i === 2 ? p.slice(0, 3) : p.slice(0, i)), p.slice(i + 1)];
  }
  function canonical(path) {
    // Rebuild a path with the names as stored, so `cd windows` shows C:\WINDOWS.
    const node = resolve(path);
    if (!node) return null;
    const m = /^([A-Z]):\\?(.*)$/i.exec(path);
    let cur = drive(m[1]);
    const out = [m[1].toUpperCase() + ':'];
    for (const part of m[2].split('\\').filter(Boolean)) {
      cur = cur.children.find(c => c.name.toUpperCase() === part.toUpperCase() || dosName(c) === part.toUpperCase());
      out.push(dosName(cur));
    }
    return out.length === 1 ? out[0] + '\\' : out.join('\\');
  }

  function dir(arg) {
    const path = abs(arg);
    const node = resolve(path);
    const d = drive(path[0]);
    if (d && d.notReady) return notReady(path[0]);
    if (!node || !node.children) { print('File not found'); return; }
    print(` Volume in drive ${path[0]} is ${path[0] === 'D' ? 'PROJECTS' : path[0] === 'E' ? 'BK95_CD' : 'BLANKIEKUN'}`);
    print(' Volume Serial Number is 1995-0824');
    print(` Directory of ${canonical(path) || path}`);
    print('');
    let files = 0, dirs = 0, bytes = 0;
    if (path.length > 3) { print('.              <DIR>        ' + STAMP + '  .'); print('..             <DIR>        ' + STAMP + '  ..'); dirs += 2; }
    for (const c of node.children) {
      const n = dosName(c);
      const [base, ext = ''] = n.split('.');
      const isDir = c.kind === 'folder';
      const size = isDir ? '<DIR>     ' : String(c.size || 1).replace(/\B(?=(\d{3})+(?!\d))/g, ',').padStart(10);
      print(`${base.padEnd(8)} ${ext.padEnd(3)}  ${size}  ${STAMP}  ${c.name}`);
      if (isDir) dirs++; else { files++; bytes += c.size || 1; }
    }
    print(`${String(files).padStart(9)} file(s)${bytes.toLocaleString('en-US').padStart(15)} bytes`);
    print(`${String(dirs).padStart(9)} dir(s)     1,048,576,000 bytes free`);
  }

  function notReady(letter) {
    print('');
    print(`Not ready reading drive ${letter}`);
    print('Abort, Retry, Fail?');
    pendingAbort = letter;
  }

  const HELP = [
    'Commands you can type:',
    '',
    '  DIR [path]      List the files in a directory',
    '  CD [path]       Change directory (CD.. goes up, CD\\ to the root)',
    '  C: D: E:        Change drive (D: has the projects)',
    '  TYPE file       Show a text file, e.g. TYPE README.TXT',
    '  MD, RD          Make or remove a directory',
    '  COPY, REN, DEL  Copy, rename or delete a file',
    '  EDIT file       Edit a text file in Notepad',
    '  START name      Open a program or project page',
    '  CLS             Clear the screen',
    '  VER, DATE, TIME, MEM, ECHO',
    '  EXIT            Close this window',
    '',
    'Programs: NOTEPAD  CALC  MSPAINT  WINMINE  SOL  IEXPLORE  EXPLORER',
    'Projects: CHIMIMOURYOU  CONSCRIPTER  CONVERT',
  ];

  function exec(raw) {
    const cmdline = raw.trim();
    if (!cmdline) return;
    const [cmd0, ...rest] = cmdline.split(/\s+/);
    const cmd = cmd0.toLowerCase();
    const argStr = cmdline.slice(cmd0.length).trim();
    if (/^[a-z]:$/i.test(cmd)) {
      const d = drive(cmd[0]);
      if (!d) { print('Invalid drive specification'); return; }
      if (d.notReady) { notReady(cmd[0].toUpperCase()); return; }
      cwd = cmd[0].toUpperCase() + ':\\';
      return;
    }
    if (/^cd(\.\.|\\)$/i.test(cmd)) return exec('cd ' + cmd.slice(2));
    switch (cmd) {
      case 'help': case '/?': HELP.forEach(l => print(l)); return;
      case 'cls': out.replaceChildren(); return;
      case 'ver': print(''); print('blankiekun 95. [Version 4.00.950]'); print(''); return;
      case 'echo': print(argStr || 'ECHO is on.'); return;
      case 'date': print('Current date is ' + new Date().toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric' }).replace(',', '')); return;
      case 'time': print('Current time is ' + new Date().toLocaleTimeString('en-US')); return;
      case 'mem':
        print(''); print('Memory Type        Total  =   Used  +   Free'); print('----------------  -------   -------   -------');
        print('Conventional          640K      62K      578K'); print('Upper                 155K     155K        0K'); print('Extended (XMS)     15,360K      ?K         ?K');
        print(''); print('Largest executable program size       578K (591,472 bytes)'); return;
      case 'dir': dir(argStr); return;
      case 'cd': case 'chdir': {
        if (!argStr) { print(canonical(cwd) || cwd); return; }
        const p = abs(argStr);
        const n = resolve(p);
        if (!n || !n.children) { print('Invalid directory'); return; }
        cwd = canonical(p) || p;
        return;
      }
      case 'type': {
        if (!argStr) { print('Required parameter missing'); return; }
        const n = resolve(abs(argStr));
        if (!n || n.children) { print('File not found - ' + argStr.toUpperCase()); return; }
        if (n.text == null) { print('This program cannot be run in DOS mode.'); return; }
        n.text.split('\n').forEach(l => print(l));
        return;
      }
      case 'edit': {
        const n = argStr ? resolve(abs(argStr)) : null;
        launch('notepad', n && n.text != null ? { name: n.name, text: n.text, path: n.user ? pathOf(n) : null } : argStr ? { name: argStr.toUpperCase(), text: '' } : null);
        return;
      }
      case 'start': {
        if (!argStr) { launch('dos'); return; }
        const n = resolve(abs(argStr));
        if (n) { shellOpen(n, win); return; }
        if (!run(argStr, win)) print(`Cannot find the file '${argStr}'.`);
        return;
      }
      case 'exit': win.close(); return;
      case 'win': case 'win.com': bsod(); return;
      case 'format': print('Nice try.'); return;
      case 'md': case 'mkdir': {
        if (!argStr) { print('Required parameter missing'); return; }
        const [folder, name] = split(argStr);
        if (!folder || !folder.children) { print('Invalid path'); return; }
        try { mkdir(folder, name); } catch { print('Unable to create directory'); }
        return;
      }
      case 'rd': case 'rmdir': {
        const n = argStr && resolve(abs(argStr));
        if (!n || !n.children || n.children.length) { print('Invalid path, not directory,'); print('or directory not empty'); return; }
        try { remove(n); } catch { print('Access denied'); }
        if (abs('.').toUpperCase().startsWith(abs(argStr).toUpperCase())) cwd = abs('..');
        return;
      }
      case 'del': case 'erase': {
        if (!argStr) { print('Required parameter missing'); return; }
        const n = resolve(abs(argStr));
        if (!n || n.children) { print('File not found'); return; }
        try { remove(n); } catch { print('Access denied'); }
        return;
      }
      case 'ren': case 'rename': {
        if (rest.length < 2) { print('Required parameter missing'); return; }
        const n = resolve(abs(rest[0]));
        if (!n) { print('File not found'); return; }
        try { rename(n, rest[1]); } catch (e) { print(e instanceof FsError && /exists/.test(e.message) ? 'Duplicate file name or file not found' : 'Access denied'); }
        return;
      }
      case 'copy': {
        if (!rest.length) { print('Required parameter missing'); return; }
        const n = resolve(abs(rest[0]));
        if (!n || n.children) { print('File not found - ' + rest[0].toUpperCase()); return; }
        // COPY file folder keeps the name; COPY file name makes a new file next to it.
        const to = rest[1] ? resolve(abs(rest[1])) : resolve(abs('.'));
        try {
          if (to && to.children) copy(n, to);
          else { const [folder, name] = split(rest[1]); createFile(folder, name, n.data ? { data: n.data } : { text: n.text || '' }); }
          print('        1 file(s) copied');
        } catch { print('Access denied'); print('        0 file(s) copied'); }
        return;
      }
      case 'deltree': print('Access denied'); return;
    }
    // A program name, an alias, or a file in the current directory.
    const local = resolve(abs(cmd0)) || resolve(abs(cmd0 + '.exe')) || resolve(abs(cmd0 + '.htm'));
    if (local && (local.kind === 'app' || local.kind === 'page' || local.kind === 'link')) { shellOpen(local, win); return; }
    if (ALIASES[cmd.replace(/\.(exe|com)$/, '')] || PROJECTS[cmd]) { run(cmdline, win); return; }
    if (local && local.text != null) { print('Bad command or file name'); return; }
    print('Bad command or file name');
  }

  function complete() {
    const v = input.value;
    const m = /^(.*?)(\S*)$/.exec(v);
    const frag = m[2];
    const slash = frag.lastIndexOf('\\');
    const dirPart = slash >= 0 ? frag.slice(0, slash + 1) : '';
    const namePart = (slash >= 0 ? frag.slice(slash + 1) : frag).toUpperCase();
    const node = resolve(abs(dirPart || '.'));
    if (!node || !node.children) return;
    const hit = node.children.map(dosName).find(n => n.startsWith(namePart));
    if (hit) { input.value = m[1] + dirPart + hit; sync(); }
  }

  input.addEventListener('input', sync);
  input.addEventListener('keydown', e => {
    if (pendingAbort) {
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'f' || k === 'escape' || k === 'enter') { e.preventDefault(); print(k === 'f' ? 'Fail' : 'Abort'); pendingAbort = null; print(''); input.value = ''; sync(); }
      else if (k === 'r') { e.preventDefault(); const d = pendingAbort; pendingAbort = null; print('Retry'); notReady(d); input.value = ''; sync(); }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value;
      print(prompt() + v);
      if (v.trim()) { hist.push(v); hpos = hist.length; }
      input.value = '';
      exec(v);
      if (!pendingAbort && v.trim() && out.lastChild && out.lastChild.textContent !== '') print('');
      sync();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); if (hpos > 0) { input.value = hist[--hpos]; sync(); }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault(); if (hpos < hist.length) { input.value = hist[++hpos] || ''; sync(); }
    } else if (e.key === 'Tab') {
      e.preventDefault(); complete();
    } else if (e.key === 'Escape') {
      e.preventDefault(); input.value = ''; sync();
    }
  });
  screen.addEventListener('pointerup', () => { if (!window.getSelection().toString()) input.focus({ preventScroll: true }); });

  const win = createWindow({
    app: 'dos', title: 'MS-DOS Prompt', icon: 'i-dos', body: h('div', { class: 'dos' }, toolbar, screen),
    width: 640, height: 400, minW: 240, minH: 160, route: 'dos', autofocus: '.dos-input',
    maximized: arg === 'dosmode',
  });

  print('');
  print('blankiekun 95. [Version 4.00.950]');
  print('(C)Copyright blankiekun 1981-1995.');
  print('');
  if (arg === 'dosmode') { print('Type EXIT to return to blankiekun 95.'); print(''); }
  else { print('Type HELP for a list of commands.'); print(''); }
  sync();
  input.focus({ preventScroll: true });
  return win;
}

export default { id: 'dos', title: 'MS-DOS Prompt', icon: 'i-dos', open };
