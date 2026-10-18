// Desktop gadgets for Vista and 7: CPU Meter, Calendar and Slide Show, plus the gallery that adds
// them (and the Clock gadget, js/apps/clock.js). Vista docks them down the Sidebar on the right;
// 7 lets them float on the desktop. Which ones are open is remembered for the next visit.

import { h, icon, store, small } from '../util.js';
import { createWindow, launch, all } from '../wm.js';
import { sample } from './sysmon.js';
import { V } from '../version.js';

const SIDEBAR = V.id === 'vista';
const KEY = 'w95.gadgets';
const open = new Map();   // id -> window, in the order they were added

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

function gadget(id, title, body, height, onClosed) {
  return createWindow({ app: 'gadgets', title, icon: 'i-programs', body, className: 'gadget', width: 150, height, resizable: false, taskbar: false, onClosed });
}

// ---------- CPU Meter ----------

// The same made-up processor figure System Monitor charts.
function cpuMeter() {
  const dial = svg('svg', { viewBox: '-50 -50 100 100', class: 'gd-dial', 'aria-hidden': 'true' });
  dial.append(svg('circle', { r: 46, class: 'gd-rim' }));
  for (let p = 0; p <= 100; p += 10) {
    const a = (p * 2.4 - 120) * Math.PI / 180;
    dial.append(svg('line', { x1: Math.sin(a) * 36, y1: -Math.cos(a) * 36, x2: Math.sin(a) * 41, y2: -Math.cos(a) * 41, class: p >= 80 ? 'gd-tick hot' : 'gd-tick' }));
  }
  const needle = svg('line', { x1: 0, y1: 6, x2: 0, y2: -36, class: 'gd-needle' });
  dial.append(needle, svg('circle', { r: 3, class: 'gd-pin' }));
  const pct = h('div', { class: 'gd-pct' });
  const body = h('div', { class: 'gd gd-cpu', role: 'meter', 'aria-label': 'CPU usage', 'aria-valuemin': 0, 'aria-valuemax': 100 }, dial, pct);
  function tick() {
    const v = Math.round(sample());
    needle.setAttribute('transform', `rotate(${v * 2.4 - 120})`);
    pct.textContent = `CPU ${v}%`;
    body.setAttribute('aria-valuenow', v);
  }
  const timer = setInterval(tick, 1000);
  tick();
  return gadget('cpu', 'CPU Meter', body, 160, () => clearInterval(timer));
}

// ---------- Calendar ----------

// A month as grid cells: blanks up to the first weekday (Sunday first), then 1..last day.
export function monthCells(y, m) {
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  return [...Array(first).fill(''), ...Array.from({ length: days }, (_, i) => i + 1)];
}
console.assert(monthCells(2024, 1).join() === ',,,,' + Array.from({ length: 29 }, (_, i) => i + 1).join(), 'calendar: Feb 2024 starts Thursday, 29 days');
console.assert(monthCells(2026, 9).length === 35 && monthCells(2023, 0)[0] === 1, 'calendar: Oct 2026 starts Thursday; Jan 2023 starts Sunday');
console.assert(monthCells(2026, 12).length === monthCells(2027, 0).length, 'calendar: month 12 rolls into January');

function calendar() {
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth();
  const title = h('button', { class: 'gd-cal-t', type: 'button', title: 'Today', onclick: () => { y = now.getFullYear(); m = now.getMonth(); draw(); } });
  const grid = h('div', { class: 'gd-cal-grid', role: 'grid' });
  const flip = d => { m += d; if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; } draw(); };
  function draw() {
    title.textContent = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const today = y === now.getFullYear() && m === now.getMonth() ? now.getDate() : 0;
    grid.replaceChildren(...'SMTWTFS'.split('').map(d => h('span', { class: 'gd-cal-wd' }, d)),
      ...monthCells(y, m).map(d => h('span', { class: d === today ? 'today' : null }, d)));
  }
  draw();
  const body = h('div', { class: 'gd gd-cal' },
    h('div', { class: 'gd-cal-head' },
      h('button', { class: 'gd-cal-flip', type: 'button', 'aria-label': 'Previous month', onclick: () => flip(-1) }, '◄'), title,
      h('button', { class: 'gd-cal-flip', type: 'button', 'aria-label': 'Next month', onclick: () => flip(1) }, '►')),
    grid);
  return gadget('calendar', 'Calendar', body, 190);
}

// ---------- Slide Show ----------

// The site's own screenshots of chimimouryou; the CONscripter ones show other people's game art.
const SLIDES = ['chimi-store.png', 'chimi-settings.png', 'chimi-reader.png', 'chimi-phone-store.png'];

function slideshow() {
  let i = 0;
  const frame = h('div', { class: 'gd gd-slide', title: 'Next picture', onclick: () => show(i + 1) });
  const show = n => { i = n % SLIDES.length; frame.replaceChildren(h('img', { src: 'img/' + SLIDES[i], alt: '' })); };
  show(0);
  const timer = setInterval(() => show(i + 1), 6000);
  return gadget('slides', 'Slide Show', frame, 130, () => clearInterval(timer));
}

// ---------- Docking, the gallery, and remembering ----------

const MAKERS = { clock: () => launch('clock'), cpu: cpuMeter, calendar, slides: slideshow };

// Vista's Sidebar: a translucent strip down the right, with the gadgets stacked in it. In 7 a new
// gadget starts at the right under the others, then floats wherever it's dragged.
// shortcut: the Sidebar is laid out when a gadget opens or closes or the viewport changes, not on drag; track that if anyone docks many.
let sidebar = null;
function restack(added) {
  if (SIDEBAR) {
    if (!sidebar) sidebar = document.getElementById('desktop').insertBefore(h('div', { class: 'sidebar', 'aria-hidden': 'true' }), document.getElementById('windows'));
    sidebar.hidden = !open.size;
  } else if (!added) return;
  if (small.matches) return;
  const right = document.getElementById('windows').clientWidth;
  let y = 10;
  for (const w of open.values()) {
    if (SIDEBAR || w === added) {
      w.el.style.left = right - w.el.offsetWidth - 10 + 'px';
      w.el.style.top = y + 'px';
    }
    y += w.el.offsetHeight + 8;
  }
}

for (const [t, ev] of [[window, 'resize'], [small, 'change']]) t.addEventListener(ev, () => { if (open.size) restack(); });

const save = () => store.set(KEY, [...open.keys()]);

async function add(id) {
  if (small.matches) return;   // no room beside a maximized window
  const had = open.get(id);
  if (had && all().includes(had)) return had.focus();
  const win = await MAKERS[id]();   // the Clock gadget is a program, which may still be loading
  if (!win) return;
  open.set(id, win);
  // A closed gadget is forgotten; logging off (a forced close) keeps it for next time.
  win.opts.onClose = () => { open.delete(id); save(); };
  const closed = win.opts.onClosed;
  win.opts.onClosed = () => { if (closed) closed(); open.delete(id); restack(); };
  save();
  restack(win);
}

export function reopen() {
  if (SIDEBAR || V.id === '7') store.get(KEY, []).filter(id => MAKERS[id]).forEach(add);
}

const LIST = [['clock', 'Clock', 'i-clock'], ['cpu', 'CPU Meter', 'i-sysmon'], ['calendar', 'Calendar', null], ['slides', 'Slide Show', 'i-viewer']];

function gallery() {
  const tile = ([id, name, ic]) => h('button', { class: 'gd-tile', type: 'button', onclick: () => add(id) },
    ic ? icon(ic) : h('span', { class: 'gd-cal-ico' }, new Date().getDate()), h('span', null, name));
  const body = h('div', { class: 'gd-gallery' }, h('p', null, 'Click a gadget to add it to the desktop.'), h('div', { class: 'gd-tiles' }, LIST.map(tile)));
  return createWindow({ app: 'gadgets', title: 'Gadgets', icon: 'i-programs', body, width: 'auto', resizable: false, route: 'gadgets' });
}

export default { id: 'gadgets', title: 'Gadgets', icon: 'i-programs', open: gallery };
