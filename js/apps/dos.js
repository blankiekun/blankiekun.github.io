// MS-DOS Prompt. Reads the pretend disk in fs.js and can start the other programs.

import { h, icon } from '../util.js';
import { createWindow, launch, toggleMax } from '../wm.js';
import { resolve, dosName, drive, mkdir, remove, rename, copy, createFile, FsError } from '../fs.js';
import { run, open as shellOpen, bsod, ALIASES, PROJECTS } from '../shell.js';
import { OS, V } from '../version.js';
import { editor } from './dosedit.js';

// `type x | more`, `more < x` and `more x`: what feeds MORE, if it's there at all.
// shortcut: MORE is the only thing a pipe or < can feed, until another filter (SORT, FIND) earns a place.
function pipeline(line) {
  const p = /^(.*?)\|\s*more\s*$/i.exec(line);
  if (p) return { cmd: p[1].trim(), more: true };
  const f = /^more(?:\s+|$)(?:<\s*)?(.*)$/i.exec(line);
  if (f) return { file: f[1].trim(), more: true };
  return { cmd: line };
}
console.assert(JSON.stringify([pipeline('type a.txt | more'), pipeline('more < a.txt'), pipeline('MORE a.txt'), pipeline('dir'), pipeline('moreover')])
  === '[{"cmd":"type a.txt","more":true},{"file":"a.txt","more":true},{"file":"a.txt","more":true},{"cmd":"dir"},{"cmd":"moreover"}]', 'dos pipeline');

// `color 0a`'s sixteen console colours, 0 to f.
const COLORS = ['#000', '#000080', '#008000', '#008080', '#800000', '#800080', '#808000', '#c0c0c0', '#808080', '#00f', '#0f0', '#0ff', '#f00', '#f0f', '#ff0', '#fff'];
const label = letter => letter === 'D' ? 'PROJECTS' : letter === 'E' ? 'BK95_CD' : 'BLANKIEKUN';

const STAMP = [V.date[1] + 1, V.date[2], V.date[0] % 100].map(n => String(n).padStart(2, '0')).join('-') + '  11:11a';

function open(arg) {
  let cwd = 'C:\\MYDOCU~1';
  const hist = [];
  let hpos = 0;
  let pendingAbort = null;
  let pendingMore = null, moreEl = null;
  let sink = null;   // collects what a command prints when it's piped into MORE
  let promptFmt = '$p$g';

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

  const print = (text = '') => { if (sink) sink.push(text); else return out.appendChild(h('div', null, text)); };
  const CODES = { p: () => canonical(cwd) || cwd, g: () => '>', l: () => '<', b: () => '|', q: () => '=', $: () => '$', _: () => '\n', n: () => cwd[0],
    v: () => V.ver, d: () => new Date().toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric' }).replace(',', ''),
    t: () => new Date().toLocaleTimeString('en-GB') + '.00' };
  const prompt = () => promptFmt.replace(/\$(.)/g, (m, c) => CODES[c.toLowerCase()]?.() ?? '');
  // 9x's COMMAND.COM and NT's cmd.exe word "no such command" differently.
  const bad = name => V.nt ? (print(`'${name}' is not recognized as an internal or external command,`), print('operable program or batch file.')) : print('Bad command or file name');
  function sync() {
    typed.textContent = input.value;
    promptEl.textContent = pendingAbort || pendingMore ? '' : prompt();
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
    print(` Volume in drive ${path[0]} is ${label(path[0])}`);
    print(` Volume Serial Number is ${V.date[0]}-${STAMP.slice(0, 5).replace('-', '')}`);
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

  // TREE: folders drawn with box lines, and with /F the files in each one first.
  function tree(argStr) {
    const files = /\/f/i.test(argStr);
    const path = abs(argStr.replace(/\/[a-z]/gi, '').trim());
    const node = resolve(path);
    if (drive(path[0])?.notReady) return notReady(path[0]);
    if (!node || !node.children) { print(V.nt ? 'Invalid path - ' + path.slice(2).toUpperCase() : 'Invalid path'); return; }
    print(V.nt ? `Folder PATH listing for volume ${label(path[0])}` : `Directory PATH listing for Volume ${label(path[0])}`);
    print(`${V.nt ? 'Volume serial number is' : 'Volume Serial Number is'} ${V.date[0]}-${STAMP.slice(0, 5).replace('-', '')}`);
    print(argStr.replace(/\/[a-z]/gi, '').trim() ? canonical(path) || path : path.slice(0, 2) + '.');
    const nm = c => V.nt ? c.name : dosName(c);
    let any = false;
    (function walk(n, pre) {
      const dirs = n.children.filter(c => c.children);
      if (files) {
        const here = n.children.filter(c => !c.children);
        for (const f of here) print(pre + (dirs.length ? '│   ' : '    ') + nm(f));
        if (here.length) print(pre + (dirs.length ? '│' : ''));
      }
      dirs.forEach((d, i) => {
        const end = i === dirs.length - 1;
        any = true;
        print(pre + (end ? '└───' : '├───') + nm(d));
        walk(d, pre + (end ? '    ' : '│   '));
      });
    })(node, '');
    if (!any) print(V.nt ? 'No subfolders exist' : 'No subdirectories exist');
  }

  // ATTRIB: the files that came with the site are read-only, the visitor's own have the archive bit.
  // shortcut: attributes can only be looked at, and a name is one file or every file in the folder, no wildcards beyond *.*.
  function attrib(argStr) {
    if (/[+-][rash]/i.test(argStr)) { print(V.nt ? 'Access denied - ' + argStr.replace(/[+-][rash]\s*/gi, '').trim().toUpperCase() : 'Access denied'); return; }
    const arg = argStr.replace(/\/s/gi, '').trim();
    const all = !arg || /^\*(\.\*)?$/.test(arg);
    const n = resolve(all ? cwd : abs(arg));
    if (!n) { print((V.nt ? 'File not found - ' : 'File not found ') + abs(arg).toUpperCase()); return; }
    const dir = n.children ? (all ? cwd : abs(arg)) : abs(arg).replace(/\\[^\\]*$/, '');
    const base = (canonical(dir) || dir).replace(/\\$/, '');
    for (const c of n.children ? n.children.filter(c => !c.children) : [n])
      print(`${c.user ? 'A' : ' '}    ${c.kind === 'app' ? 'S' : ' '} ${c.user ? ' ' : 'R'}     ${base}\\${V.nt ? c.name : dosName(c)}`);
  }

  // MORE: a screenful, then -- More -- until a key. Enter steps a line, Esc or Q stops.
  function more(lines, step) {
    const rows = step || Math.max(4, Math.floor(screen.clientHeight / (line.offsetHeight || 20)) - 2);
    lines.splice(0, rows).forEach(l => print(l));
    pendingMore = lines.length ? lines : null;
    if (pendingMore) moreEl = print('-- More --');
  }

  // PING: a reply from the site and from this machine; anything else times out.
  function ping(host) {
    if (!host) { print(''); print('Usage: ping [-t] [-n count] host'); return; }
    host = host.split(/\s+/).filter(w => !w.startsWith('-')).at(-1) || host;
    const h0 = host.toLowerCase();
    const ip = /^(localhost|127\.0\.0\.1)$/.test(h0) ? '127.0.0.1' : /^(www\.)?blankiekun\.github\.io$/.test(h0) ? '185.199.108.153' : null;
    print('');
    print(`Pinging ${host}${ip && ip !== host ? ` [${ip}]` : ''} with 32 bytes of data:`);
    print('');
    const times = [];
    for (let i = 0; i < 4; i++) {
      if (!ip) { print('Request timed out.'); continue; }
      const t = ip === '127.0.0.1' ? 0 : 18 + Math.floor(Math.random() * 25);
      times.push(t);
      print(`Reply from ${ip}: bytes=32 time${t ? '=' + t : V.nt ? '<1' : '<10'}ms TTL=${ip === '127.0.0.1' ? 128 : 57}`);
    }
    print('');
    print(`Ping statistics for ${ip || host}:`);
    print(`    Packets: Sent = 4, Received = ${times.length}, Lost = ${4 - times.length} (${(4 - times.length) * 25}% loss),`);
    if (!times.length) return;
    print('Approximate round trip times in milli-seconds:');
    print(`    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Average = ${Math.round(times.reduce((a, b) => a + b) / 4)}ms`);
  }

  // IPCONFIG: one made-up network card, nothing read from the real machine.
  function ipconfig() {
    const aero = !['2000', 'xp'].includes(V.id);
    const row = (k, v) => print(`        ${(k + ' ').padEnd(36, '. ').slice(0, 36)}: ${v}`);
    print(''); print('blankiekun IP Configuration'); print(''); print('');
    print(`Ethernet adapter Local Area Connection:`); print('');
    row('Connection-specific DNS Suffix', '');
    if (aero) row('Link-local IPv6 Address', 'fe80::1111:b1a:4e:95%11');
    row(aero ? 'IPv4 Address' : 'IP Address', '192.168.1.95');
    row('Subnet Mask', '255.255.255.0');
    row('Default Gateway', '192.168.1.1');
  }

  function openEditor(arg, qbasic) {
    const p = arg ? abs(arg) : null;
    const n = p && resolve(p);
    if (n && (n.children || n.text == null)) { print(V.nt ? 'Access is denied.' : 'Path not found'); return; }
    screen.hidden = true;
    editor({ host: screen, abs, path: p, text: n ? n.text : '', qbasic, done: () => { screen.hidden = false; sync(); input.focus({ preventScroll: true }); } });
  }

  function notReady(letter) {
    import('./control.js').then(m => m.playSound('Floppy')).catch(() => {});
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
    '  EDIT [file]     Edit a text file in the MS-DOS Editor',
    '  TREE [/F]       Draw the directory tree (/F lists the files too)',
    '  ATTRIB [file]   Show which files are read-only',
    '  TYPE x | MORE   Show a long file a screenful at a time',
    '  PROMPT $P$G     Change the prompt ($P path, $G >, $D date, $T time)',
    '  PING host       Check whether a computer answers',
    '  START name      Open a program or project page',
    '  CLS             Clear the screen',
    '  VER, DATE, TIME, MEM, ECHO' + (V.nt ? ', COLOR, IPCONFIG' : ', QBASIC'),
    '  EXIT            Close this window',
    '',
    'Programs: NOTEPAD  CALC  MSPAINT  WINMINE  SOL  IEXPLORE  EXPLORER',
    'Projects: CHIMIMOURYOU  CONSCRIPTER  CONVERT',
  ];

  function exec(raw) {
    const cmdline = raw.trim();
    if (!cmdline) return;
    const pipe = pipeline(cmdline);
    if (pipe.more) {
      if (pipe.file === '') return;
      if (pipe.file) {
        const n = resolve(abs(pipe.file));
        if (!n || n.text == null) { print(V.nt ? 'Cannot access file ' + abs(pipe.file).toUpperCase() : 'File not found'); return; }
        more(n.text.split('\n'));
      } else {
        const lines = sink = [];
        try { exec(pipe.cmd); } finally { sink = null; }
        more(lines);
      }
      return;
    }
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
      case 'ver': print(''); print(V.ver); print(''); return;
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
      case 'edit': openEditor(argStr); return;
      case 'qbasic': if (V.nt) break; openEditor(argStr, true); return;
      case 'tree': tree(argStr); return;
      case 'attrib': attrib(argStr); return;
      case 'ping': ping(argStr); return;
      case 'prompt': promptFmt = argStr || '$p$g'; return;
      case 'ipconfig': if (!V.nt) break; ipconfig(); return;
      case 'color': {
        if (!V.nt) break;
        const m = /^([0-9a-f])?([0-9a-f])$/i.exec(argStr);
        if (argStr && (!m || (m[1] || '0').toLowerCase() === m[2].toLowerCase())) return;   // cmd leaves the colours alone when they'd match
        screen.style.background = m ? COLORS[parseInt(m[1] || '0', 16)] : '';
        screen.style.color = m ? COLORS[parseInt(m[2], 16)] : '';
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
    bad(cmd0);
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
    if (pendingMore) {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault();
      moreEl.remove();
      if (e.key === 'Escape' || e.key.toLowerCase() === 'q' || (e.ctrlKey && e.key === 'c')) pendingMore = null;
      else more(pendingMore, e.key === 'Enter' ? 1 : 0);
      if (!pendingMore) { print(''); input.value = ''; }
      sync();
      return;
    }
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
      if (!pendingAbort && !pendingMore && screen.isConnected && !screen.hidden && v.trim() && out.lastChild && out.lastChild.textContent !== '') print('');
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

  // 11's console is Windows Terminal: its tab sits in the title bar (css/apps.css), and + opens another.
  const tabs = V.id === '11' && h('div', { class: 'wt-tabs' },
    h('div', { class: 'wt-tab' }, icon('i-dos'), h('span', null, 'Command Prompt'), h('button', { type: 'button', class: 'wt-x', 'aria-label': 'Close tab', onclick: () => win.close() }, '×')),
    h('button', { type: 'button', class: 'wt-new', title: 'New Tab', 'aria-label': 'New Tab', onclick: () => launch('dos') }, '+'));
  const win = createWindow({
    app: 'dos', title: 'MS-DOS Prompt', icon: 'i-dos', body: h('div', { class: 'dos' }, !V.nt && toolbar, screen), className: tabs ? 'terminal' : '',
    width: 640, height: 400, minW: 240, minH: 160, route: 'dos', autofocus: '.de-text, .dos-input',
    maximized: arg === 'dosmode',
  });
  if (tabs) win.bar.insertBefore(tabs, win.bar.querySelector('.tbtns'));

  print('');
  print(V.ver);
  print(V.dosCopy);
  print('');
  if (arg === 'dosmode') { print('Type EXIT to return to ' + OS + '.'); print(''); }
  else { print('Type HELP for a list of commands.'); print(''); }
  sync();
  input.focus({ preventScroll: true });
  return win;
}

export default { id: 'dos', title: 'MS-DOS Prompt', icon: 'i-dos', open };
