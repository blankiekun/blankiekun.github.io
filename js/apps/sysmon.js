// System Monitor and Resource Meter. There's no real CPU figure in a browser, so
// processor usage is a random walk with the odd spike.

import { h, icon } from '../util.js';
import { createWindow, launch, all, find } from '../wm.js';
import { menubar, openMenu } from '../menu.js';
import { about } from '../dialogs.js';

let cpu = 8;
export function sample() {
  cpu += (15 - cpu) * 0.2 + (Math.random() - 0.5) * 12;
  if (Math.random() < 0.06) cpu += 30 + Math.random() * 40;
  return cpu = Math.max(1, Math.min(100, cpu));
}

// ---------- System Monitor ----------

function sysmon() {
  const W = 300, H = 120;
  const cv = h('canvas', { class: 'sm-chart', width: W, height: H, 'aria-label': 'Kernel: Processor Usage (%)' });
  const g = cv.getContext('2d');
  const status = h('div', { class: 'statusbar' }, h('span'));
  const pts = [];
  let peak = 0, timer = 0, every = 1000;

  function draw() {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#c0c0c0';
    for (let i = 1; i < 4; i++) g.fillRect(0, Math.round(H * i / 4), W, 1);
    g.strokeStyle = '#000080'; g.lineWidth = 1; g.beginPath();
    pts.forEach((v, i) => { const x = W - (pts.length - 1 - i) * 4 - 0.5, y = H - 1 - (H - 2) * v / 100 + 0.5; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
  function tick() {
    const v = Math.round(sample());
    pts.push(v);
    if (pts.length > W / 4 + 1) pts.shift();
    peak = Math.max(peak, v);
    status.firstChild.textContent = `Kernel: Processor Usage (%)   Last value: ${v}   Peak value: ${peak}`;
    draw();
  }
  const restart = ms => { every = ms; clearInterval(timer); timer = setInterval(tick, ms); };

  const bar = menubar([
    { label: '&File', items: () => [{ label: 'E&xit', action: () => win.close() }] },
    { label: '&Edit', items: () => [{ label: '&Clear Window', action: () => { pts.length = 0; peak = 0; draw(); } }] },
    { label: '&Options', items: () => [
      { label: '&Chart: Update Interval', submenu: [1, 5, 30].map(s => ({ label: s + (s === 1 ? ' second' : ' seconds'), checked: every === s * 1000, action: () => restart(s * 1000) })) },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') }, '-',
      { label: '&About System Monitor', action: () => about('System Monitor', 'i-sysmon', win) },
    ] },
  ]);
  const body = h('div', { class: 'sm' }, bar,
    h('div', { class: 'sm-pane' }, h('div', { class: 'sm-scale' }, h('span', null, '100'), h('span', null, '50'), h('span', null, '0')), cv),
    h('div', { class: 'sm-label' }, 'Kernel: Processor Usage (%)'), status);
  const win = createWindow({ app: 'sysmon', title: 'System Monitor', icon: 'i-sysmon', body, width: 'auto', resizable: false, route: 'sysmon', onClosed: () => clearInterval(timer) });
  tick();
  restart(1000);
  return win;
}

// ---------- Resource Meter ----------

// Each open window costs a few percent, as it did on a 16 MB machine.
function free() {
  const n = all().length;
  const sys = Math.max(12, 86 - n * 4);
  return { System: sys, User: Math.max(12, sys + 2), GDI: Math.max(12, sys + 5) };
}

let trayIcon = null;
function meter() {
  if (trayIcon) return showMeter();
  trayIcon = icon('i-resmeter', 'resmeter');
  trayIcon.setAttribute('role', 'button');
  trayIcon.setAttribute('aria-label', 'Resource Meter');
  const tray = document.querySelector('.tray');
  tray.insertBefore(trayIcon, document.getElementById('clock'));
  const title = h('title');
  trayIcon.prepend(title);
  const upd = () => { if (trayIcon) title.textContent = `System resources: ${free().System}% free`; };
  upd();
  const t = setInterval(upd, 2000);
  trayIcon.addEventListener('dblclick', showMeter);
  trayIcon.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    openMenu([{ label: '&Details', action: showMeter }, { label: 'E&xit', action: () => { clearInterval(t); trayIcon.remove(); trayIcon = null; find(w => w.app === 'resmeter')?.close(); } }], { x: e.clientX, y: e.clientY });
  });
  return null;
}

function showMeter() {
  const existing = find(w => w.app === 'resmeter');
  if (existing) { existing.focus(); return existing; }
  const f = free();
  const row = (name, v) => h('div', { class: 'rm-row' },
    h('span', null, `${name} resources: ${v}% free`),
    h('div', { class: 'rm-bar' }, h('i', { style: { width: v + '%' } })));
  const body = h('div', { class: 'dlg rm' }, row('System', f.System), row('User', f.User), row('GDI', f.GDI),
    h('div', { class: 'btns' }, h('button', { class: 'btn default', type: 'button', onclick: () => win.close() }, 'OK')));
  const win = createWindow({ app: 'resmeter', title: 'Resource Meter', icon: 'i-resmeter', body, dialog: true, resizable: false, width: 'auto' });
  body.querySelector('.btn').focus();
  return win;
}

export const resmeter = { id: 'resmeter', title: 'Resource Meter', icon: 'i-resmeter', open: meter };
export default { id: 'sysmon', title: 'System Monitor', icon: 'i-sysmon', open: sysmon };
