// Ctrl+Alt+Del. Up to Me it's Close Program, and pressing Ctrl+Alt+Del again while it's
// open restarts the computer, which is exactly what the warning says. From 2000 it's Task
// Manager: tabs for Applications, Processes and Performance to 7, then 8's redesign with
// fewer or more details. Its title is renamed per era (version.js).

import { h, icon } from '../util.js';
import { createWindow, all, close, find, focus } from '../wm.js';
import { V } from '../version.js';
import { menubar } from '../menu.js';
import { about, msgbox } from '../dialogs.js';
import { tabbed } from './system.js';
import { sample } from './sysmon.js';

const NT = ['2000', 'xp', 'vista', '7'].includes(V.id), MODERN = ['8', '10', '11'].includes(V.id);

function open() {
  const existing = find(w => w.app === 'taskman');
  if (existing && (NT || MODERN)) { focus(existing); return existing; }
  if (existing) { restart(); return existing; }
  if (NT || MODERN) return taskManager();
  let picked = null;
  const list = h('div', { class: 'listbox tm-list', tabindex: '0', role: 'listbox', 'aria-label': 'Programs' });
  function fill() {
    list.replaceChildren();
    const progs = all().filter(w => w.task && w.app !== 'taskman');
    // Explorer is always running, as in Win95; ending it is not a good idea.
    for (const w of [...progs, null]) {
      const o = h('div', { class: 'opt', role: 'option' }, w ? w.el.getAttribute('aria-label') : 'Explorer');
      o.win = w;
      o.addEventListener('click', () => pick(o));
      o.addEventListener('dblclick', () => { pick(o); end(); });
      list.append(o);
    }
    pick(list.firstChild);
  }
  function pick(o) {
    list.querySelectorAll('.opt').forEach(x => x.classList.toggle('sel', x === o));
    picked = o;
  }
  function end() {
    if (!picked) return;
    if (!picked.win) { restart(); return; }
    close(picked.win, true);
    fill();
    list.focus();
  }
  list.addEventListener('keydown', e => {
    const opts = [...list.children], i = opts.indexOf(picked);
    if (e.key === 'ArrowDown') { e.preventDefault(); pick(opts[Math.min(opts.length - 1, i + 1)]); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pick(opts[Math.max(0, i - 1)]); }
    else if (e.key === 'Enter') { e.preventDefault(); end(); }
  });
  const body = h('div', { class: 'dlg tm' },
    list,
    h('p', { class: 'tm-warn' }, 'WARNING: Pressing CTRL+ALT+DEL again will restart your computer. You will lose unsaved information in all programs that are running.'),
    h('div', { class: 'btns' },
      h('button', { class: 'btn', type: 'button', onclick: end }, h('u', null, 'E'), 'nd Task'),
      h('button', { class: 'btn', type: 'button', onclick: () => { win.close(); import('../desktop.js').then(m => m.shutDown && m.shutDown()); } }, h('u', null, 'S'), 'hut Down'),
      h('button', { class: 'btn default', type: 'button', onclick: () => win.close() }, 'Cancel')));
  body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  const win = createWindow({ app: 'taskman', title: 'Close Program', body, dialog: true, resizable: false, width: 'auto', taskbar: false });
  win.el.style.zIndex = 9000;
  fill();
  list.focus();
  return win;
}

// ---------- Task Manager (2000 on) ----------

// Windows' own processes: image name (8 on: its description), user, memory in K.
const SYSTEM = [['System Idle Process', 'SYSTEM', 16], ['System', 'SYSTEM', 236], ['smss.exe', 'SYSTEM', 388], ['csrss.exe', 'SYSTEM', 3164],
  ['winlogon.exe', 'SYSTEM', 4520], ['services.exe', 'SYSTEM', 3412], ['lsass.exe', 'SYSTEM', 1256], ['svchost.exe', 'SYSTEM', 4836],
  ['svchost.exe', 'NETWORK SERVICE', 3108], ['spoolsv.exe', 'SYSTEM', 4384], ['explorer.exe', 'blankiekun', 18044]];
const BACKGROUND = [['Antimalware Service Executable', 98304], ['Desktop Window Manager', 41984], ['Windows Explorer', 52224],
  ['Service Host: Local System', 23552], ['Client Server Runtime Process', 1228], ['System', 140]];

// One reading of the machine: total CPU, and each program's share of it and of memory.
// The CPU goes mostly to the window in front; a window's memory stays what it first was.
function reading() {
  const cpu = Math.round(sample());
  const apps = all().filter(w => w.task && w.app !== 'taskman');
  const front = apps[apps.length - 1];
  for (const w of apps) w.tmK ??= Math.round(6000 + Math.random() * 24000);
  const appCpu = w => w === front ? Math.round(cpu * .6) : 0;
  const memK = [...SYSTEM, ...BACKGROUND].reduce((n, p) => n + p[p.length - 1], 0) + apps.reduce((n, w) => n + w.tmK, 0);
  const used = Math.min(.95, .22 + memK / V.ramKB + (cpu - 15) / 2000);
  return { cpu, apps, appCpu, other: cpu - appCpu(front), used };
}

// A list with column headings. Rows are { key, cells, group?, heat? }; the selection stays on
// its key when the rows are refreshed. heat[i] (0-1) shades cell i, as 8 on does.
function grid(cols, onOpen) {
  let rows = [], picked = null;
  const heads = cols.map(c => h('th', { class: c.n ? 'n' : '', scope: 'col' }, c.label));
  const body = h('tbody');
  const el = h('div', { class: 'listbox tm-grid', tabindex: '0' }, h('table', null, h('thead', null, h('tr', null, ...heads)), body));
  const mark = () => body.querySelectorAll('tr').forEach(tr => tr.classList.toggle('sel', tr.key === picked));
  function set(next) {
    rows = next;
    const keys = rows.filter(r => !r.group).map(r => r.key);
    if (!keys.includes(picked)) picked = keys[0] ?? null;
    body.replaceChildren(...rows.map(r => {
      const tr = h('tr', { class: r.group ? 'grp' : '' }, ...r.cells.map((c, i) => h('td', {
        class: cols[i] && cols[i].n ? 'n' : '', colspan: r.group ? cols.length : null,
        style: r.heat && r.heat[i] != null ? { background: `rgba(255, 196, 0, ${.12 + r.heat[i] * .5})` } : null,
      }, c)));
      tr.key = r.key;
      if (!r.group) tr.addEventListener('click', () => { picked = r.key; mark(); });
      return tr;
    }));
    mark();
  }
  // Rows are rebuilt every second, so double-clicks are caught on the body, not the row.
  body.addEventListener('dblclick', e => { const tr = e.target.closest('tr'); if (tr && !tr.classList.contains('grp')) { picked = tr.key; mark(); onOpen && onOpen(); } });
  el.addEventListener('keydown', e => {
    const keys = rows.filter(r => !r.group).map(r => r.key), i = keys.indexOf(picked);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); picked = keys[Math.max(0, Math.min(keys.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; mark(); }
    else if (e.key === 'Enter' && onOpen) { e.preventDefault(); onOpen(); }
  });
  return { el, heads, set, picked: () => rows.find(r => r.key === picked && !r.group) };
}

// Canvases drawn at their shown size.
function sized(cv) {
  const w = cv.clientWidth, hh = cv.clientHeight;
  if (w && (cv.width !== w || cv.height !== hh)) { cv.width = w; cv.height = hh; }
  return cv.getContext('2d');
}

// 2000 to 7: a lit bar meter and a scrolling history, green on black.
function meter(cv, v, text) {
  const g = sized(cv), W = cv.width, H = cv.height;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const top = 4, bottom = H - 16, n = Math.floor((bottom - top) / 3);
  for (let i = 0; i < n; i++) {
    g.fillStyle = i < Math.round(n * v / 100) ? '#00ff00' : '#008000';
    const y = bottom - i * 3 - 2;
    g.fillRect(W / 2 - 17, y, 15, 2); g.fillRect(W / 2 + 2, y, 15, 2);
  }
  g.fillStyle = '#00ff00'; g.font = '11px Tahoma, sans-serif'; g.textAlign = 'center';
  g.fillText(text, W / 2, H - 4);
}
function history(cv, pts, color, step) {
  const g = sized(cv), W = cv.width, H = cv.height;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#008040';
  for (let x = W - (step * 3) % 12; x > 0; x -= 12) g.fillRect(x, 0, 1, H);
  for (let y = H; y > 0; y -= 12) g.fillRect(0, y, W, 1);
  line(g, pts, W, H, color);
}
function line(g, pts, W, H, color, fill) {
  g.beginPath();
  pts.forEach((v, i) => { const x = W - (pts.length - 1 - i) * 3 - .5, y = H - 1 - (H - 2) * v / 100 + .5; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  if (fill) { g.save(); g.lineTo(W, H); g.lineTo(W - (pts.length - 1) * 3, H); g.fillStyle = fill; g.fill(); g.restore(); }
  g.strokeStyle = color; g.lineWidth = 1; g.stroke();
}

const kb = n => n.toLocaleString('en-US') + ' K';
const mb = k => (k / 1024).toFixed(1) + ' MB';
const gb = k => (k / 1048576).toFixed(1) + ' GB';

function taskManager() {
  const cpuPts = [], memPts = [];
  let r = reading(), step = 0, win = null;

  const appRow = w => ({ key: w, win: w, name: w.el.getAttribute('aria-label') });
  const switchTo = () => { const p = apps.picked(); if (p) focus(p.key); };
  // Ends the program picked in list g; Windows' own processes can't be ended.
  const endIn = g => () => { const p = g.picked(); if (p && p.key && p.key.el) { close(p.key, true); refresh(); } else if (p) denied(); };
  const endTask = () => endIn(more() ? procs : apps)();
  const denied = () => msgbox({ title: 'Unable to Terminate Process', icon: 'error', parent: win, text: 'The operation could not be completed.\n\nAccess is denied.' });
  const newTask = () => import('../desktop.js').then(m => m.runDialog());
  const menu = menubar([
    { label: '&File', items: () => [{ label: MODERN ? '&Run new task' : '&New Task (Run...)', action: newTask }, '-', { label: MODERN ? 'E&xit' : 'E&xit Task Manager', action: () => win.close() }] },
    { label: '&View', items: () => [{ label: MODERN ? '&Refresh now' : '&Refresh Now', action: refresh }] },
    { label: '&Help', items: () => [{ label: '&About Task Manager', action: () => about('Task Manager', 'i-exe', win) }] },
  ]);
  const btn = (label, fn, cls = 'btn') => h('button', { class: cls, type: 'button', onclick: fn }, label);
  const procCols = MODERN ? [{ label: 'Name' }, { label: 'Status' }, { label: 'CPU', n: 1 }, { label: 'Memory', n: 1 }]
    : [{ label: 'Image Name' }, { label: 'User Name' }, { label: 'CPU', n: 1 }, { label: 'Mem Usage', n: 1 }];
  const apps = grid(MODERN ? [{ label: 'Name' }] : [{ label: 'Task' }, { label: 'Status' }], switchTo);
  const procs = grid(procCols, null);
  let more = () => true, body, status = null, perf;

  if (NT) {
    // 2000 counts memory in use, XP the page file, Vista and 7 physical memory.
    const MEM = V.id === '2000' ? ['MEM Usage', 'Memory Usage History', k => Math.round(k / 1024) + 'M']
      : V.id === 'xp' ? ['PF Usage', 'Page File Usage History', k => Math.round(k / 1024) + ' MB'] : ['Memory', 'Physical Memory Usage History', k => (k / 1048576).toFixed(2) + ' GB'];
    const cv = cls => h('canvas', { class: cls });
    const [cpuM, cpuH, memM, memH] = [cv('tm-meter'), cv('tm-hist'), cv('tm-meter'), cv('tm-hist')];
    const box = (label, c) => h('fieldset', { class: 'group' }, h('legend', null, label), c);
    const totals = h('table', { class: 'tm-nums' }), phys = h('table', { class: 'tm-nums' });
    perf = h('div', { class: 'tm-perf' },
      box('CPU Usage', cpuM), box('CPU Usage History', cpuH), box(MEM[0], memM), box(MEM[1], memH),
      h('div', { class: 'tm-totals' }, box('Totals', totals), box('Physical Memory (K)', phys)));
    perf.draw = () => {
      meter(cpuM, r.cpu, r.cpu + ' %'); history(cpuH, cpuPts, '#00ff00', step);
      meter(memM, r.used * 100, MEM[2](r.used * V.ramKB)); history(memH, memPts, '#ffff00', step);
      const row = (k, v) => h('tr', null, h('td', null, k), h('td', { class: 'n' }, v));
      const n = SYSTEM.length + r.apps.length + 1;
      totals.replaceChildren(row('Handles', String(4000 + n * 137)), row('Threads', String(200 + n * 11)), row('Processes', String(n)));
      phys.replaceChildren(row('Total', kb(V.ramKB)), row('Available', kb(Math.round(V.ramKB * (1 - r.used)))));
    };
    const appsPanel = h('div', { class: 'tm-panel' }, apps.el, h('div', { class: 'tm-btns' }, btn('End Task', endIn(apps)), btn('Switch To', switchTo), btn('New Task...', newTask)));
    const procPanel = h('div', { class: 'tm-panel' }, procs.el, h('div', { class: 'tm-btns' }, btn('End Process', endIn(procs))));
    status = h('div', { class: 'statusbar' }, h('span'), h('span'), h('span'));
    body = h('div', { class: 'tmgr tm-nt' }, menu, tabbed(['Applications', 'Processes', 'Performance'], [appsPanel, procPanel, perf]), status);
  } else {
    // 8 on: a plain list of programs until More details shows the tabs.
    const cv = h('canvas', { class: 'tm-graph' });
    const pick = (b, which) => { perf.which = which; perf.querySelectorAll('.tm-side button').forEach(x => x.classList.toggle('on', x === b)); perf.draw(); };
    const side = ['CPU', 'Memory'].map((t, i) => { const b = h('button', { type: 'button', class: i ? '' : 'on' }, h('b', null, t), h('span')); b.onclick = () => pick(b, i); return b; });
    const title = h('h2'), sub = h('div', { class: 'tm-sub' }), stats = h('div', { class: 'tm-stats' });
    perf = h('div', { class: 'tm-perf10' }, h('div', { class: 'tm-side' }, ...side), h('div', { class: 'tm-main' }, title, sub, cv, stats));
    perf.which = 0;
    perf.draw = () => {
      const memText = `${gb(r.used * V.ramKB)}/${gb(V.ramKB)} (${Math.round(r.used * 100)}%)`;
      side[0].lastChild.textContent = r.cpu + '%';
      side[1].lastChild.textContent = memText;
      const cpu = perf.which === 0, color = cpu ? '#117dbb' : '#8b12ae';
      title.textContent = cpu ? 'CPU' : 'Memory';
      sub.textContent = cpu ? '% Utilization' : 'Memory usage';
      const g = sized(cv), W = cv.width, H = cv.height;
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.fillStyle = cpu ? '#d9eaf4' : '#f2e6f6';
      for (let i = 1; i < 10; i++) { g.fillRect(Math.round(W * i / 10), 0, 1, H); g.fillRect(0, Math.round(H * i / 10), W, 1); }
      line(g, cpu ? cpuPts : memPts, W, H, color, cpu ? 'rgba(17, 125, 187, .1)' : 'rgba(139, 18, 174, .1)');
      g.strokeStyle = color; g.strokeRect(.5, .5, W - 1, H - 1);
      const stat = (k, v) => h('div', null, h('span', null, k), h('b', null, v));
      stats.replaceChildren(...(cpu ? [stat('Utilization', r.cpu + '%'), stat('Processes', String(BACKGROUND.length + r.apps.length + 1)), stat('Up time', uptime())]
        : [stat('In use', gb(r.used * V.ramKB)), stat('Available', gb(V.ramKB * (1 - r.used)))]));
    };
    const tabs = tabbed(['Processes', 'Performance'], [h('div', { class: 'tm-panel' }, procs.el), perf]);
    const toggle = btn('', () => {
      body.classList.toggle('more');
      toggle.textContent = more() ? 'Fewer details' : 'More details';
      if (win.state === 'normal') Object.assign(win.el.style, more() ? { width: '560px', height: '480px' } : { width: '360px', height: '320px' });
      refresh();
    }, 'tm-more');
    more = () => body.classList.contains('more');
    body = h('div', { class: 'tmgr tm-10' }, menu, h('div', { class: 'tm-fewer' }, apps.el), tabs,
      h('div', { class: 'tm-foot' }, toggle, btn('End task', endTask)));
    toggle.textContent = 'More details';
  }

  const t0 = performance.now();
  const uptime = () => { const s = Math.floor((performance.now() - t0) / 1000) + 3725; return `0:${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

  function refresh() {
    r = reading(); step++;
    cpuPts.push(r.cpu); memPts.push(r.used * 100);
    if (cpuPts.length > 400) { cpuPts.shift(); memPts.shift(); }
    if (MODERN && !more()) apps.set(r.apps.map(w => ({ key: w, cells: [h('span', { class: 'tm-app' }, icon(w.opts.icon || 'i-exe'), appRow(w).name)] })));
    else if (NT) apps.set(r.apps.map(w => ({ key: w, cells: [appRow(w).name, 'Running'] })));
    const pct = n => String(n).padStart(2, '0');
    if (NT) procs.set([
      ...SYSTEM.map(([name, user, k], i) => ({ key: 's' + i, cells: [name, user, pct(i === 0 ? 100 - r.cpu : i === 10 ? Math.round(r.other / 2) : i === 1 ? r.other - Math.round(r.other / 2) : 0), kb(k)] })),
      ...r.apps.map(w => ({ key: w, cells: [(w.app || 'program') + '.exe', 'blankiekun', pct(r.appCpu(w)), kb(w.tmK)] })),
      { key: 'tm', cells: ['taskmgr.exe', 'blankiekun', '00', kb(3420)] },
    ]);
    else if (more()) {
      procs.heads[2].replaceChildren(h('b', null, r.cpu + '%'), h('br'), 'CPU');
      procs.heads[3].replaceChildren(h('b', null, Math.round(r.used * 100) + '%'), h('br'), 'Memory');
      const share = Math.round(r.other / 3);
      procs.set([
        { group: true, key: 'ga', cells: [`Apps (${r.apps.length + 1})`] },
        ...r.apps.map(w => ({ key: w, cells: [h('span', { class: 'tm-app' }, icon(w.opts.icon || 'i-exe'), appRow(w).name), '', r.appCpu(w) + '%', mb(w.tmK)], heat: [null, null, r.appCpu(w) / 100, w.tmK / 120000] })),
        { key: 'tm', cells: [h('span', { class: 'tm-app' }, icon('i-exe'), 'Task Manager'), '', '0%', mb(24576)], heat: [null, null, 0, .2] },
        { group: true, key: 'gb', cells: [`Background processes (${BACKGROUND.length})`] },
        ...BACKGROUND.map(([name, k], i) => { const c = i < 3 ? share : 0; return { key: 'b' + i, cells: [name, '', c + '%', mb(k)], heat: [null, null, c / 100, k / 120000] }; }),
      ]);
    }
    if (status) {
      status.children[0].textContent = `Processes: ${SYSTEM.length + r.apps.length + 1}`;
      status.children[1].textContent = `CPU Usage: ${r.cpu}%`;
      status.children[2].textContent = ['vista', '7'].includes(V.id) ? `Physical Memory: ${Math.round(r.used * 100)}%`
        : `Commit Charge: ${Math.round(r.used * V.ramKB / 1024)}M / ${Math.round(V.ramKB * 1.5 / 1024)}M`;
    }
    if (perf && !perf.closest('[hidden]') && perf.isConnected) perf.draw();
  }

  const timer = setInterval(refresh, 1000);
  win = createWindow({
    app: 'taskman', title: 'Close Program', icon: 'i-exe', body,
    width: MODERN ? 360 : 420, height: MODERN ? 320 : 460, minW: 300, minH: 260,
    onClosed: () => clearInterval(timer),
  });
  // Tabs and the details toggle show panels that weren't drawn while hidden.
  body.addEventListener('click', e => { if (e.target.closest('[role="tab"]')) refresh(); });
  refresh();
  apps.el.focus();
  return win;
}

function restart() {
  try { sessionStorage.removeItem('w95.booted'); } catch {}
  history.replaceState(null, '', location.pathname);
  location.reload();
}

export default { id: 'taskman', title: 'Close Program', icon: 'i-exe', open };
