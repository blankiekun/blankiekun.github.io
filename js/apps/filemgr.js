// The file browsers before Explorer: 3.1's File Manager (drive bar, directory tree, file list)
// and 1.0/2.0's MS-DOS Executive (drive letters, the path, a flat list of 8.3 names). explorer.js
// hands them every folder on a disk; they show the same files (fs.js) and copy, move, delete and
// rename through fileops.js, so Undo and the other windows keep up.

import { h, icon, small, store } from '../util.js';
import { createWindow, appInfo, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, inputbox, about } from '../dialogs.js';
import { root, resolve, pathOf, parentOf, onChange, mkdir, dosName, canWrite, FsError } from '../fs.js';
import { open as shellOpen } from '../shell.js';
import { properties, usedOn, CAPACITY } from '../props.js';
import { copyNodes, cut, paste, del, renameNode, onClip } from '../fileops.js';
import { V } from '../version.js';

const FM = V.id === '3.1';
const NAME = FM ? 'File Manager' : 'MS-DOS Executive';
const PREFS = 'w95.filemgr.' + V.id;
const prefs = { panes: 'both', details: false, sort: 'name', status: true, ...store.get(PREFS, {}) };
const save = () => store.set(PREFS, prefs);
let win = null;
onChange(() => win && win.refresh());
onClip(() => win && win.refresh());

// ---------- what both show ----------

const isDir = n => !!n.children;
const drives = () => root.children.filter(n => n.kind === 'drive');
const driveOf = n => { while (n && n.kind !== 'drive') n = parentOf(n); return n; };
// 3.1 printed 8.3 names in lower case, 1.0 in capitals.
const shown = n => FM ? dosName(n).toLowerCase() : dosName(n);
const dosPath = n => { if (n.kind === 'drive') return n.letter + ':\\'; const p = dosPath(parentOf(n)); return (p.endsWith('\\') ? p : p + '\\') + dosName(n); };
const ext = n => isDir(n) ? '' : dosName(n).split('.')[1] || '';
const SHIPPED = new Date(...V.date, 11, 11).getTime();
const when = n => new Date(n.mtime || SHIPPED);
const day = d => FM ? `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}` : `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}-${String(d.getFullYear()).slice(2)}`;
const time = d => { const hr = d.getHours() % 12 || 12, m = String(d.getMinutes()).padStart(2, '0'); return FM ? `${hr}:${m}:00${d.getHours() < 12 ? 'am' : 'pm'}` : `${hr}:${m}${d.getHours() < 12 ? 'a' : 'p'}`; };
const num = n => n.toLocaleString('en-US');

// View > Partial (1.0) takes a DOS wildcard; '*.*' is everything, names without a dot included.
const glob = p => !p || p === '*.*' ? () => true : (re => n => re.test(dosName(n)))(new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i'));
console.assert(glob('*.TXT')({ name: 'readme.txt' }) && !glob('*.TXT')({ name: 'paint.exe' }) && glob('*.*')({ name: 'COMMAND', children: [] }), 'glob: DOS wildcards');

function listing(folder, filter) {
  const by = {
    name: (a, b) => shown(a).localeCompare(shown(b)),
    type: (a, b) => ext(a).localeCompare(ext(b)) || shown(a).localeCompare(shown(b)),
    size: (a, b) => (b.size || 0) - (a.size || 0) || shown(a).localeCompare(shown(b)),
    date: (a, b) => when(b) - when(a) || shown(a).localeCompare(shown(b)),
  }[prefs.sort];
  // Programs that didn't load aren't listed, as in Explorer; directories come first.
  return (folder.children || []).filter(n => (n.kind !== 'app' || n.app === 'setup' || appInfo(n.app)) && (isDir(n) || filter(n)))
    .sort((a, b) => isDir(b) - isDir(a) || by(a, b));
}

// Each drive's size, the way Explorer counts it: C: is the big disk, the others are full.
function space(d) {
  const used = d.notReady ? 0 : usedOn(d.letter), total = d.letter === 'C' ? CAPACITY : used;
  console.assert(total >= used, 'space: more used than the disk holds');
  return { free: Math.floor((total - used) / 1024), total: Math.floor(total / 1024) };
}

const fmIcon = n => isDir(n) ? 'i-folder' : n.kind === 'app' || n.kind === 'joke' || /\.(exe|com|bat|pif)$/i.test(n.name) ? 'i-exe'
  : /\.(sys|ini|dll|inf|drv)$/i.test(n.name) ? 'i-fm-file' : 'i-txt';

// ---------- the window ----------

function open(node) {
  if (node === root || !pathOf(node)) node = resolve('C:\\');
  if (win) { win.go(node); win.focus(); return win; }

  let folder = node, sel = new Set(), lead = null, pattern = '*.*';
  const expanded = new Set();
  const here = () => folder;
  const items = () => listing(folder, glob(pattern));
  const selected = () => items().filter(n => sel.has(n));

  const fail = e => { if (!(e instanceof FsError)) throw e; return msgbox({ title: NAME, icon: 'error', parent: win, text: e.message }); };
  const noDisk = () => msgbox({ title: NAME, icon: 'error', parent: win,
    text: FM ? 'There is no disk in drive A.\n\nInsert a disk, and then try again.' : 'Cannot read from drive A:' });
  const later = what => msgbox({ title: NAME, icon: 'info', parent: win, text: what });

  function go(n) {
    if (n.notReady) { noDisk(); return; }
    folder = n; sel = new Set(); lead = null;
    for (let p = n; p; p = parentOf(p)) expanded.add(p);
    render();
  }
  function activate(n) {
    if (n.notReady) noDisk();
    else if (isDir(n)) go(n);
    else shellOpen(n, win);
  }
  function up() { const p = parentOf(folder); if (folder.kind !== 'drive' && p) go(p); }

  // ---------- commands ----------
  async function copyTo(moving) {
    const s = selected();
    if (!s.length) return;
    const v = await inputbox({ title: moving ? 'Move' : 'Copy', label: `${moving ? 'Move' : 'Copy'} ${s.map(shown).join(' ')} to:`, value: dosPath(folder), parent: win });
    if (!v) return;
    const dest = resolve(v.trim());
    if (!dest || !isDir(dest)) return msgbox({ title: NAME, icon: 'error', parent: win, text: `Cannot find ${v.trim().toUpperCase()}.` });
    if (!canWrite(dest)) return msgbox({ title: NAME, icon: 'error', parent: win, text: `Cannot ${moving ? 'move' : 'copy'} to ${dosPath(dest)}: Access denied.` });
    (moving ? cut : copyNodes)(s);
    await paste(dest, win);
  }
  async function renameSel() {
    const n = selected()[0];
    if (!n) return;
    const v = await inputbox({ title: 'Rename', label: `Rename ${shown(n)} to:`, value: n.name, parent: win });
    if (v && v.trim() && v.trim() !== n.name) await renameNode(n, v.trim(), win);
  }
  async function makeDir() {
    const v = await inputbox({ title: 'Create Directory', label: `Create a directory in ${dosPath(folder)} named:`, parent: win });
    if (!v || !v.trim()) return;
    try { const n = mkdir(folder, v.trim()); expanded.add(folder); sel = new Set([n]); lead = n; render(); } catch (e) { fail(e); }
  }
  async function changeDir() {
    const v = await inputbox({ title: 'Change Directory', label: 'Directory name:', value: dosPath(folder), parent: win });
    if (!v) return;
    const n = resolve(v.trim()) || resolve(dosPath(folder) + '\\' + v.trim());
    if (n && isDir(n)) go(n); else msgbox({ title: NAME, icon: 'error', parent: win, text: `Cannot find ${v.trim().toUpperCase()}.` });
  }
  const delSel = () => del(selected(), win);
  const info = () => properties(selected()[0] || folder, win);
  const runBox = () => import('../desktop.js').then(m => m.runDialog());
  const printSel = () => { const n = selected().find(x => x.kind === 'file'); if (n) import('./explorer.js').then(m => m.printNode(n)); };
  const set = (k, v) => () => { prefs[k] = v; save(); render(); };

  // ---------- File Manager: the directory window with its tree ----------
  const dirsIn = n => (n.children || []).filter(c => isDir(c) && !c.virtual);
  const branch = n => [n, ...dirsIn(n).flatMap(branch)];
  const treeEl = h('div', { class: 'fm-tree', role: 'tree', tabindex: '0', 'aria-label': 'Directory tree' });
  function renderTree() {
    const d = driveOf(folder);
    const row = (n, depth) => {
      const r = h('div', { class: 'fm-trow' + (n === folder ? ' sel' : ''), role: 'treeitem', style: { paddingLeft: 2 + depth * 14 + 'px' }, 'aria-expanded': dirsIn(n).length ? String(expanded.has(n)) : null },
        icon(n.kind === 'drive' || n === folder || expanded.has(n) && dirsIn(n).length ? 'i-fm-open' : 'i-folder'),
        h('span', null, n.kind === 'drive' ? n.letter.toLowerCase() + ':\\' : shown(n)));
      r.addEventListener('click', () => go(n));
      r.addEventListener('dblclick', () => { if (expanded.has(n) && n !== folder) expanded.delete(n); else expanded.add(n); render(); });
      return [r, ...(expanded.has(n) ? dirsIn(n).sort((a, b) => shown(a).localeCompare(shown(b))).flatMap(c => row(c, depth + 1)) : [])];
    };
    treeEl.replaceChildren(...row(d, 0));
  }
  const driveBar = h('div', { class: FM ? 'fm-drives' : 'exe-drives', role: 'toolbar', 'aria-label': 'Drives' });
  const volume = h('span', { class: 'fm-vol' });
  const childTitle = h('span', { class: 't' });
  const list = h('div', { class: FM ? 'fm-list' : 'exe-list', role: 'listbox', tabindex: '0', 'aria-multiselectable': 'true' });
  const pathEl = h('div', { class: 'exe-path' });
  const status = h('div', { class: 'statusbar' }, h('span'), h('span'));

  function renderDrives() {
    const d = driveOf(folder);
    driveBar.replaceChildren(...drives().map(x => h('button', { type: 'button', class: 'fm-drive' + (x === d ? ' on' : ''), 'aria-pressed': String(x === d), title: x.name,
      onclick: () => go(x) }, FM ? icon(x.icon) : null, h('span', null, FM ? x.letter.toLowerCase() : x.letter))));
    if (FM) driveBar.append(volume);
    volume.textContent = d.letter + ': ' + (d.name.replace(/\s*\(.:\)$/, '').toUpperCase() || '[' + d.letter + '_DRIVE]');
  }

  function renderList() {
    const all = items();
    const live = new Set(all);
    sel = new Set([...sel].filter(n => live.has(n)));
    list.className = (FM ? 'fm-list' : 'exe-list') + (prefs.details ? ' details' : '');
    const row = (n, label) => {
      const d = when(n);
      const cells = FM
        ? [icon(label ? 'i-up' : fmIcon(n)), h('span', { class: 'fm-name' }, label || shown(n)),
          ...(prefs.details && !label ? [h('span', null, isDir(n) ? '' : num(n.size || 0)), h('span', null, day(d)), h('span', null, time(d)), h('span', null, n.user ? 'a' : 'r')] : [])]
        : [h('span', { class: 'fm-name' }, prefs.details ? dosName(n).split('.')[0] : shown(n)),
          ...(prefs.details ? [h('span', null, ext(n)), h('span', null, isDir(n) ? '' : String(n.size || 0)), h('span', null, day(d)), h('span', null, time(d))] : [])];
      const it = h('div', { class: 'fm-item' + (sel.has(n) && !label ? ' sel' : '') + (isDir(n) ? ' dir' : ''), role: 'option', 'aria-selected': String(sel.has(n) && !label) }, ...cells);
      it.addEventListener('pointerdown', e => {
        e.stopPropagation();
        if (label) return;
        if (e.ctrlKey || e.metaKey) { if (!sel.delete(n)) sel.add(n); lead = n; }
        else if (e.shiftKey && lead) { const a = all.indexOf(lead), b = all.indexOf(n); sel = new Set(all.slice(Math.min(a, b), Math.max(a, b) + 1)); }
        else { sel = new Set([n]); lead = n; }
        paint();
      });
      it.addEventListener('dblclick', () => label ? up() : activate(n));
      if (!label) it.node = n;
      return it;
    };
    list.replaceChildren(...(FM && folder.kind !== 'drive' ? [row(parentOf(folder), '..')] : []), ...all.map(n => row(n)));
    if (!all.length && !FM) list.append(h('div', { class: 'ex-empty' }, 'No files found.'));
  }
  function paint() {
    for (const r of list.children) if (r.node) { r.classList.toggle('sel', sel.has(r.node)); r.setAttribute('aria-selected', String(sel.has(r.node))); }
    syncStatus();
  }
  function syncStatus() {
    const all = items(), s = selected(), bytes = l => num(l.reduce((t, n) => t + (n.size || 0), 0));
    const d = driveOf(folder), sp = space(d);
    status.hidden = !prefs.status || !FM;
    status.children[0].textContent = s.length ? `Selected ${s.length} file(s) (${bytes(s)} bytes)` : `${d.letter}: ${num(sp.free)}KB free, ${num(sp.total)}KB total`;
    status.children[1].textContent = `Total ${all.length} file(s) (${bytes(all)} bytes)`;
  }
  function render() {
    if (!pathOf(folder)) folder = resolve('C:\\');
    const path = dosPath(folder);
    childTitle.textContent = path + (path.endsWith('\\') ? '' : '\\') + pattern;
    pathEl.replaceChildren(...path.split('\\').filter(Boolean).flatMap((part, i, a) => {
      const to = resolve(a.slice(0, i + 1).join('\\') + (i ? '' : '\\'));
      return [i > 1 ? '\\' : '', h('button', { type: 'button', class: 'exe-crumb', onclick: () => go(to) }, part.toUpperCase() + (i ? '' : '\\'))];
    }));
    renderDrives();
    if (FM) {
      renderTree();
      treeEl.hidden = prefs.panes === 'dir';
      list.hidden = prefs.panes === 'tree';
    }
    renderList();
    syncStatus();
  }

  list.addEventListener('pointerdown', () => { sel = new Set(); paint(); });
  list.addEventListener('keydown', e => {
    const all = items(), i = all.indexOf(lead);
    const k = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (k && all.length) { e.preventDefault(); lead = all[Math.max(0, Math.min(all.length - 1, i + k))]; sel = e.shiftKey ? new Set([...sel, lead]) : new Set([lead]); paint(); }
    else if (e.key === 'Enter' && sel.size) { e.preventDefault(); selected().forEach(activate); }
    else if (e.key === 'Backspace') { e.preventDefault(); up(); }
    else if (e.key === 'Delete' && sel.size) { e.preventDefault(); delSel(); }
    else if (e.key === 'F7') { e.preventDefault(); copyTo(true); }
    else if (e.key === 'F8') { e.preventDefault(); copyTo(false); }
    else if (e.key === 'F5') { e.preventDefault(); render(); }
  });

  const none = () => !sel.size;
  // shortcut: the commands with nothing behind them here are greyed (3.1) or answer with a box (1.0); wire them up if the fs grows disks and attributes.
  const off = label => ({ label, disabled: true });
  const menus = FM ? [
    { label: '&File', items: () => [
      { label: '&Open', key: 'Enter', disabled: none(), action: () => selected().forEach(activate) },
      { label: '&Move...', key: 'F7', disabled: none(), action: () => copyTo(true) },
      { label: '&Copy...', key: 'F8', disabled: none(), action: () => copyTo(false) },
      { label: '&Delete...', key: 'Del', disabled: none(), action: delSel },
      { label: 'Re&name...', disabled: sel.size !== 1, action: renameSel },
      { label: 'Proper&ties...', key: 'Alt+Enter', action: info }, '-',
      { label: '&Run...', action: runBox },
      { label: '&Print...', disabled: !selected().some(n => n.kind === 'file'), action: printSel },
      off('&Associate...'), '-',
      { label: 'Cr&eate Directory...', disabled: !canWrite(folder), action: makeDir },
      off('Searc&h...'), off('&Select Files...'), '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Disk', items: [
      { label: '&Copy Disk...', action: noDisk }, { label: '&Label Disk...', action: noDisk },
      { label: '&Format Disk...', action: noDisk }, { label: '&Make System Disk...', action: noDisk }, '-',
      { label: 'Select Dri&ve...', action: () => driveBar.querySelector('.on')?.focus() },
    ] },
    { label: '&Tree', items: () => [
      { label: 'E&xpand One Level', action: () => { expanded.add(folder); render(); } },
      { label: 'Expand &Branch', action: () => { branch(folder).forEach(n => expanded.add(n)); render(); } },
      { label: 'Expand &All', action: () => { branch(driveOf(folder)).forEach(n => expanded.add(n)); render(); } },
      { label: '&Collapse Branch', action: () => { branch(folder).forEach(n => expanded.delete(n)); render(); } },
    ] },
    { label: '&View', items: () => [
      { label: 'T&ree and Directory', radio: true, checked: prefs.panes === 'both', action: set('panes', 'both') },
      { label: 'Tr&ee Only', radio: true, checked: prefs.panes === 'tree', action: set('panes', 'tree') },
      { label: 'Directory &Only', radio: true, checked: prefs.panes === 'dir', action: set('panes', 'dir') }, '-',
      { label: '&Name', radio: true, checked: !prefs.details, action: set('details', false) },
      { label: '&All File Details', radio: true, checked: prefs.details, action: set('details', true) }, '-',
      ...[['&Sort by Name', 'name'], ['Sort &by Type', 'type'], ['Sort by Si&ze', 'size'], ['Sort by &Date', 'date']]
        .map(([label, k]) => ({ label, radio: true, checked: prefs.sort === k, action: set('sort', k) })),
    ] },
    { label: '&Options', items: () => [off('&Confirmation...'), off('&Font...'), '-',
      { label: '&Status Bar', checked: prefs.status, action: set('status', !prefs.status) }] },
    { label: '&Window', items: [off('&New Window'), off('&Cascade'), off('&Tile'), '-', { label: '&Refresh', key: 'F5', action: render }] },
    { label: '&Help', items: [{ label: '&Contents', action: () => launch('help') }, '-', { label: '&About File Manager...', action: () => about('File Manager', 'i-folder-open', win) }] },
  ] : [
    { label: '&File', items: () => [
      { label: '&Run...', action: runBox },
      { label: '&Load...', disabled: none(), action: () => selected().forEach(activate) },
      { label: '&Copy...', disabled: none(), action: () => copyTo(false) },
      { label: '&Get Info...', action: info },
      { label: '&Delete...', disabled: none(), action: delSel },
      { label: '&Print...', disabled: !selected().some(n => n.kind === 'file'), action: printSel },
      { label: 'R&ename...', disabled: sel.size !== 1, action: renameSel },
    ] },
    { label: '&View', items: () => [
      { label: '&Short', radio: true, checked: !prefs.details, action: set('details', false) },
      { label: '&Long', radio: true, checked: prefs.details, action: set('details', true) }, '-',
      { label: '&All', radio: true, checked: pattern === '*.*', action: () => { pattern = '*.*'; render(); } },
      { label: '&Partial...', radio: true, checked: pattern !== '*.*', action: async () => {
        const v = await inputbox({ title: 'Partial', label: 'File names:', value: pattern === '*.*' ? '*.TXT' : pattern, parent: win });
        if (v && v.trim()) { pattern = v.trim().toUpperCase(); render(); }
      } }, '-',
      ...[['By &Name', 'name'], ['By &Date', 'date'], ['By Si&ze', 'size'], ['By &Kind', 'type']]
        .map(([label, k]) => ({ label, radio: true, checked: prefs.sort === k, action: set('sort', k) })),
    ] },
    { label: '&Special', items: [
      { label: '&End Session...', action: () => import('../desktop.js').then(m => m.shutDown()) },
      { label: '&Create Directory...', action: makeDir },
      { label: 'Change &Directory...', action: changeDir },
      { label: '&Format Data Disk...', action: () => later('Insert a new disk in drive A:\nand strike any key when ready.').then(noDisk) },
      { label: '&Make System Disk...', action: () => later('Insert a disk in drive A:\nand strike any key when ready.').then(noDisk) },
    ] },
  ];

  const body = FM
    ? h('div', { class: 'fm' }, menubar(menus),
      h('section', { class: 'fm-child', 'aria-label': 'Directory window' }, h('div', { class: 'titlebar' }, childTitle),
        driveBar, h('div', { class: 'fm-panes' }, treeEl, list)), status)
    : h('div', { class: 'fm exe' }, menubar(menus), h('div', { class: 'exe-top' }, driveBar, pathEl), list);
  win = createWindow({
    app: 'explorer', title: NAME, icon: 'i-folder-open', body,
    width: small.matches ? 360 : FM ? 600 : 480, height: FM ? 380 : 300, minW: 220, minH: 160,
    onClosed: () => { win = null; },
  });
  win.go = go;
  win.refresh = render;
  go(node);
  list.focus({ preventScroll: true });
  return win;
}

export { open as oldFiles };
