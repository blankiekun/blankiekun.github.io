// Desktop gadgets: CPU Meter, Calendar, Slide Show, the Moe Clock and Weather, plus the gallery that adds
// them (and the Clock gadget, js/apps/clock.js). Vista docks them down the Sidebar on the right;
// every other era lets them float on the desktop, skinned for its decade (css/apps.css).
// Which ones are open is remembered for the next visit.

import { h, icon, store, small } from '../util.js';
import { createWindow, launch, all } from '../wm.js';
import { sample } from './sysmon.js';
import { V } from '../version.js';

const SIDEBAR = V.id === 'vista';
// The Clock and CPU Meter gadgets are Vista and 7's own; other eras get the rest.
const AERO = ['vista', '7'].includes(V.id);
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
// The anime wallpapers come first, like the picture-frame widget on an anime desktop.
const SLIDES = [...['shore', 'rooftop', 'lain', 'wired', 'konata'].map(f => `wallpapers/${f}.jpg`),
  'chimi-store.png', 'chimi-settings.png', 'chimi-reader.png', 'chimi-phone-store.png'];

function slideshow() {
  let i = 0;
  const frame = h('div', { class: 'gd gd-slide', title: 'Next picture', onclick: () => show(i + 1) });
  const show = n => { i = n % SLIDES.length; frame.replaceChildren(h('img', { src: 'img/' + SLIDES[i], alt: '' })); };
  show(0);
  const timer = setInterval(() => show(i + 1), 6000);
  return gadget('slides', 'Slide Show', frame, 130, () => clearInterval(timer));
}

// ---------- Moe Clock ----------

// The big time-and-date text anime desktops put over the wallpaper, dated the Japanese way.
const WEEKDAYS = '日月火水木金土';
export const jpDate = d => `${d.getMonth() + 1}月${d.getDate()}日 (${WEEKDAYS[d.getDay()]})`;
console.assert(jpDate(new Date(2026, 9, 28)) === '10月28日 (水)', 'moe clock: 28 Oct 2026 is a Wednesday');

function moeClock() {
  const time = h('div', { class: 'gd-moe-t' }), date = h('div', { class: 'gd-moe-d', lang: 'ja' });
  const body = h('div', { class: 'gd gd-moe', role: 'timer', 'aria-label': 'Clock' }, time, date);
  function tick() {
    const now = new Date();
    time.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    date.textContent = jpDate(now);
  }
  const timer = setInterval(tick, 1000);
  tick();
  return gadget('moe', 'Moe Clock', body, 100, () => clearInterval(timer));
}

// ---------- Weather ----------

// Made-up Akihabara weather, the same all day: there's no network call, so it's seeded by the date
// and shaped by Tokyo's monthly normals, with snow only December to February and June's rainy season.
const CONDS = ['sun', 'cloud', 'rain', 'snow'], NAMES = { sun: 'Sunny', cloud: 'Cloudy', rain: 'Rain', snow: 'Snow' };
const HI = [10, 11, 14, 19, 23, 26, 30, 31, 27, 22, 17, 12], LO = [1, 2, 5, 10, 15, 19, 23, 24, 21, 15, 9, 4];
const WINTER = [11, 0, 1];
const odds = m => m === 5 ? [.2, .35, .45, 0] : WINTER.includes(m) ? [.55, .27, .1, .08] : [.45, .3, .25, 0];

export function weatherFor(d) {
  let s = 0;
  for (const c of `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`) s = Math.imul(s ^ c.charCodeAt(0), 16777619);
  const r = () => {   // mulberry32
    let t = s += 0x6d2b79f5;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 2 ** 32;
  };
  const m = d.getMonth(), o = odds(m);
  let p = r();
  const cond = CONDS.find((_, k) => (p -= o[k]) < 0) || 'cloud';   // a rounding miss lands on cloud, never snow
  const j = Math.round(r() * 6 - 3), hi = HI[m] + j - (cond === 'rain' ? 2 : 0), lo = LO[m] + j - Math.round(r() * 2);
  return cond === 'snow' ? { cond, hi: Math.min(hi, 3), lo: Math.min(lo, -1) } : { cond, hi, lo };
}
// Coolest at 2 am, warmest at 2 pm.
const tempAt = (w, hour) => Math.round(w.lo + (w.hi - w.lo) * (1 - Math.cos((hour - 2) / 12 * Math.PI)) / 2);
const toF = c => Math.round(c * 9 / 5 + 32);
const YEAR = Array.from({ length: 365 }, (_, i) => new Date(2026, 0, i + 1));
console.assert(JSON.stringify(weatherFor(new Date(2026, 9, 28))) === JSON.stringify(weatherFor(new Date(2026, 9, 28, 23, 59))), 'weather: the same all day');
console.assert(YEAR.every(d => weatherFor(d).cond !== 'snow' || WINTER.includes(d.getMonth())), 'weather: snow only in winter');
console.assert(YEAR.filter(d => d.getMonth() === 7).every(d => { const w = weatherFor(d); return w.cond !== 'snow' && w.hi > w.lo; }), 'weather: no snow in August, highs above lows');
console.assert(Array.from({ length: 90 }, (_, i) => weatherFor(new Date(2026, 11, i + 1)).cond).includes('snow'), 'weather: it can snow in winter');
console.assert(new Set(YEAR.map(d => weatherFor(d).cond)).size === 4, 'weather: every condition turns up in a year');
console.assert(toF(0) === 32 && toF(100) === 212 && tempAt({ lo: 5, hi: 15 }, 14) === 15 && tempAt({ lo: 5, hi: 15 }, 2) === 5, 'weather: °F and the daily curve');

const CLOUD = '<path d="M4 12a3 3 0 0 1 .5-6 4 4 0 0 1 7.5 1 2.5 2.5 0 0 1 0 5z" fill="#eef3f8" stroke="#8a9bb0" stroke-width=".7"/>';
const ICONS = {
  sun: '<circle cx="8" cy="9" r="3.5" fill="#ffc83d"/><path d="M8 2v2M8 14v2M1 9h2M13 9h2M3 4l1.5 1.5M11.5 12.5L13 14M3 14l1.5-1.5M11.5 5.5L13 4" stroke="#ffc83d" stroke-linecap="round"/>',
  cloud: CLOUD,
  rain: CLOUD + '<path d="M6 14l-1 3M9 14l-1 3M12 14l-1 3" stroke="#5ab0ff" stroke-linecap="round"/>',
  snow: CLOUD + '<g fill="#bfe6ff" stroke="#5a8fc4" stroke-width=".4"><circle cx="5.5" cy="15.5" r="1"/><circle cx="9" cy="16.5" r="1"/><circle cx="12" cy="15" r="1"/></g>',
};
const wxIcon = (cond, label) => {
  const e = svg('svg', { viewBox: '0 0 16 18', class: 'gd-wx-ico', ...label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' } });
  e.innerHTML = ICONS[cond];
  return e;
};

// The weather girl, dressed for the day: a sun hat and a wave, a cardigan under a cloud,
// a raincoat and umbrella, a coat with scarf and earmuffs.
const DRESS = { sun: '#ff8fb8', cloud: '#a99be0', rain: '#ffd23f', snow: '#e0474c' };
const ARMS = { sun: 'M23 44L13 33M37 44L43 56', cloud: 'M23 44L18 56M37 44L42 56', rain: 'M23 44L18 56M37 44L44 41', snow: 'M23 44L18 56M37 44L42 56' };
const EXTRA = {
  sun: '<ellipse cx="30" cy="16" rx="19" ry="4" fill="#f3d88a"/><path d="M21 16q9-13 18 0z" fill="#f3d88a"/><path d="M21.5 13.5h17" stroke="#ff6f91" stroke-width="2"/>',
  cloud: '<path d="M44 14a5 5 0 0 1 9-2 4 4 0 0 1 3 7h-13a3 3 0 0 1 1-5z" fill="#fff" opacity=".9"/>',
  rain: '<path d="M44 14V41" stroke="#555" stroke-width="1.5"/><path d="M6 15Q30-8 56 15z" fill="#3b7fc4" stroke="#2a5f94"/><path d="M4 30l-1 4M7 52l-1 4M55 32l-1 4M57 56l-1 4" stroke="#dff1ff" stroke-linecap="round"/>',
  snow: '<path d="M17 26q13-14 26 0" fill="none" stroke="#e0474c" stroke-width="2"/><circle cx="17" cy="29" r="4" fill="#fff"/><circle cx="43" cy="29" r="4" fill="#fff"/><path d="M22 40h16v4h-16zM33 43h4v9h-4z" fill="#fff"/><g fill="#fff"><circle cx="6" cy="20" r="1.5"/><circle cx="54" cy="12" r="1.5"/><circle cx="8" cy="58" r="1.5"/><circle cx="53" cy="46" r="1.5"/></g>',
};
const girl = cond => `<circle cx="13" cy="34" r="5" fill="#5a3825"/><circle cx="47" cy="34" r="5" fill="#5a3825"/>
  <circle cx="30" cy="25" r="15" fill="#5a3825"/>
  <path d="M25 62v10M35 62v10" stroke="#ffe3cf" stroke-width="3"/><ellipse cx="25" cy="73" rx="3" ry="1.6" fill="#7a4a3a"/><ellipse cx="35" cy="73" rx="3" ry="1.6" fill="#7a4a3a"/>
  <path d="${ARMS[cond]}" stroke="#ffe3cf" stroke-width="3" stroke-linecap="round"/>
  <path d="M23 40h14l7 22h-28z" fill="${DRESS[cond]}"/>
  <circle cx="30" cy="28" r="12" fill="#ffe3cf"/><path d="M17 26Q30 6 43 26Q36 19 30 22Q24 19 17 26z" fill="#5a3825"/>
  <ellipse cx="25" cy="30" rx="2" ry="3" fill="#3a2a4a"/><ellipse cx="35" cy="30" rx="2" ry="3" fill="#3a2a4a"/><circle cx="25.7" cy="29" r=".8" fill="#fff"/><circle cx="35.7" cy="29" r=".8" fill="#fff"/>
  <ellipse cx="21" cy="34" rx="2.5" ry="1.3" fill="#ff9db0" opacity=".7"/><ellipse cx="39" cy="34" rx="2.5" ry="1.3" fill="#ff9db0" opacity=".7"/>
  <path d="M28 35q2 2 4 0" fill="none" stroke="#a0505a" stroke-linecap="round"/>${EXTRA[cond]}`;

const FKEY = 'w95.weather.f';

function weather() {
  let f = store.get(FKEY, false);
  const deg = c => (f ? toF(c) : c) + '°';
  const fig = svg('svg', { viewBox: '0 0 60 80', class: 'gd-wx-girl', 'aria-hidden': 'true' });
  const temp = h('button', { class: 'gd-wx-t', type: 'button', title: 'Switch between °C and °F', onclick: () => { f = !f; store.set(FKEY, f); draw(); } });
  const what = h('div', { class: 'gd-wx-c' }), range = h('div', { class: 'gd-wx-city' });   // what the girl's picture says, in words
  const days = h('div', { class: 'gd-wx-days' });
  const body = h('div', { class: 'gd gd-wx', role: 'group', 'aria-label': 'Weather in Akihabara' },
    h('div', { class: 'gd-wx-now' }, fig, h('div', { class: 'gd-wx-txt' }, temp, what, range, h('div', { class: 'gd-wx-city' }, 'Akihabara'))), days);
  function draw() {
    const now = new Date(), w = weatherFor(now);
    if (body.dataset.wx !== w.cond) fig.innerHTML = girl(body.dataset.wx = w.cond);
    temp.textContent = deg(tempAt(w, now.getHours())) + (f ? 'F' : 'C');
    what.textContent = NAMES[w.cond];
    range.textContent = `H ${deg(w.hi)}  L ${deg(w.lo)}`;
    days.replaceChildren(...[1, 2, 3].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i), n = weatherFor(d);
      return h('div', null, d.toLocaleDateString(undefined, { weekday: 'short' }), wxIcon(n.cond, NAMES[n.cond]), `${deg(n.hi)} ${deg(n.lo)}`);
    }));
  }
  draw();
  const timer = setInterval(draw, 60000);
  return gadget('weather', 'Weather', body, 178, () => clearInterval(timer));
}

// ---------- Docking, the gallery, and remembering ----------

const MAKERS = { clock: () => launch('clock'), cpu: cpuMeter, calendar, slides: slideshow, moe: moeClock, weather };

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
  store.get(KEY, []).filter(id => MAKERS[id]).forEach(add);
}

const LIST = [['clock', 'Clock', 'i-clock', AERO], ['cpu', 'CPU Meter', 'i-sysmon', AERO], ['calendar', 'Calendar', null, true], ['slides', 'Slide Show', 'i-viewer', true], ['moe', 'Moe Clock', 'i-clock', true],
  ['weather', 'Weather', () => wxIcon('sun'), true]]
  .filter(g => g[3]);

function gallery() {
  const tile = ([id, name, ic]) => h('button', { class: 'gd-tile', type: 'button', onclick: () => add(id) },
    typeof ic === 'function' ? ic() : ic ? icon(ic) : h('span', { class: 'gd-cal-ico' }, new Date().getDate()), h('span', null, name));
  const body = h('div', { class: 'gd-gallery' }, h('p', null, 'Click a gadget to add it to the desktop.'), h('div', { class: 'gd-tiles' }, LIST.map(tile)));
  return createWindow({ app: 'gadgets', title: 'Gadgets', icon: 'i-programs', body, width: 'auto', resizable: false, route: 'gadgets' });
}

export default { id: 'gadgets', title: 'Gadgets', icon: 'i-programs', open: gallery };
