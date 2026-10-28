// Desktop gadgets: CPU Meter, Calendar, Slide Show, the Moe Clock and the Pocket Pet, plus the gallery
// that adds them (and the Clock gadget, js/apps/clock.js). Vista docks them down the Sidebar on the right;
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

// ---------- Pocket Pet ----------

// A late-90s keychain egg pet (our own blob, not anyone's character). Stats run 0-4; it ages from a
// saved timestamp, so it gets hungry while the page is shut, but bottoms out sleepy, never dead.
const PET_KEY = 'w95.pet';
const RATE = { food: -1 / 90, fun: -1 / 120, mess: 1 / 180 };   // per minute: a heart every 1.5h, 2h, 3h
export function petAge(s, now) {
  const min = Math.max(0, (now - s.t) / 60000);   // a clock set back doesn't un-age it
  const c = v => Math.min(4, Math.max(0, v));
  return { food: c(s.food + RATE.food * min), fun: c(s.fun + RATE.fun * min), mess: c(s.mess + RATE.mess * min), t: now };
}
export const petMood = s => s.food < 1 && s.fun < 1 ? 'sleepy' : s.food < 1 ? 'hungry' : s.fun < 1 ? 'grumpy' : s.mess >= 3 ? 'messy' : 'happy';
console.assert(petAge({ food: 4, fun: 4, mess: 0, t: 0 }, 90 * 60000).food === 3, 'pet: a heart of food per 90 minutes');
console.assert(petMood(petAge({ food: 4, fun: 4, mess: 0, t: 0 }, 365 * 864e5)) === 'sleepy' && petAge({ food: 4, fun: 4, mess: 0, t: 0 }, 365 * 864e5).mess === 4, 'pet: a year away floors at sleepy, never below 0 or past 4');
console.assert(petAge({ food: 2, fun: 2, mess: 1, t: 5e6 }, 1e6).food === 2, 'pet: a clock set back changes nothing');

const PET = ['...######...', '..#......#..', '.#........#.', null, '#..........#', null, null, '.#........#.', '..########..', '...#....#...'];
const FACES = {   // eyes row, then two mouth rows
  happy: ['#..#....#..#', '#...#..#...#', '#....##....#'], messy: ['#..#....#..#', '#..........#', '#...####...#'],
  hungry: ['#..#....#..#', '#....##....#', '#....##....#'], grumpy: ['#.##....##.#', '#....##....#', '#...#..#...#'],
  sleepy: ['#.##....##.#', '#..........#', '#....##....#'],
};
const SAYS = { happy: 'Happy!', messy: 'Needs a clean', hungry: 'Hungry...', grumpy: 'Grumpy. Bored.', sleepy: 'Sleepy... zzz' };

function pocketPet() {
  const fresh = { food: 4, fun: 4, mess: 0, t: Date.now() }, had = store.get(PET_KEY, null);
  let s = had && Number.isFinite(had.t) ? had : fresh;
  const lcd = svg('svg', { viewBox: '0 0 16 11', class: 'gd-pet-px', 'aria-hidden': 'true', 'shape-rendering': 'crispEdges' });
  const meters = h('div', { class: 'gd-pet-m', role: 'img' }), status = h('div', { class: 'gd-pet-s', 'aria-live': 'polite' });
  function draw() {
    s = petAge(s, Date.now());
    store.set(PET_KEY, s);
    const mood = petMood(s), face = FACES[mood];
    const px = (x, y) => svg('rect', { x, y, width: 1, height: 1 });
    const rows = PET.map((r, y) => r || face[[3, 5, 6].indexOf(y)]);
    lcd.replaceChildren(...rows.flatMap((r, y) => [...r].flatMap((p, x) => p === '#' ? [px(x + 1, y)] : [])),
      ...(s.mess >= 2 ? [[13, 9], [14, 9], [15, 9], [14, 8]].map(([x, y]) => px(x, y)) : []));   // a little pile beside it
    lcd.classList.toggle('still', mood === 'sleepy');
    const bar = v => '●'.repeat(Math.ceil(v)) + '○'.repeat(4 - Math.ceil(v));
    meters.textContent = `FOOD ${bar(s.food)} FUN ${bar(s.fun)}`;
    meters.setAttribute('aria-label', `Food ${Math.ceil(s.food)} of 4, fun ${Math.ceil(s.fun)} of 4`);
    if (status.textContent !== SAYS[mood]) status.textContent = SAYS[mood];   // only announce a change
  }
  const act = f => () => { s = petAge(s, Date.now()); f(); draw(); };
  const btn = (label, f) => h('button', { type: 'button', onclick: act(f) }, label);
  const body = h('div', { class: 'gd gd-pet', role: 'group', 'aria-label': 'Pocket Pet' },
    h('div', { class: 'gd-pet-lcd' }, lcd, meters, status),
    h('div', { class: 'gd-pet-b' },
      btn('Feed', () => { s.food = Math.min(4, s.food + 1); }),
      btn('Play', () => { s.fun = Math.min(4, s.fun + 1); s.food = Math.max(0, s.food - .25); }),
      btn('Clean', () => { s.mess = 0; })));
  draw();
  const timer = setInterval(draw, 30000);
  return gadget('pet', 'Pocket Pet', body, 220, () => clearInterval(timer));
}

// ---------- Docking, the gallery, and remembering ----------

const MAKERS = { clock: () => launch('clock'), cpu: cpuMeter, calendar, slides: slideshow, moe: moeClock, pet: pocketPet };

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

const LIST = [['clock', 'Clock', 'i-clock', AERO], ['cpu', 'CPU Meter', 'i-sysmon', AERO], ['calendar', 'Calendar', null, true], ['slides', 'Slide Show', 'i-viewer', true], ['moe', 'Moe Clock', 'i-clock', true], ['pet', 'Pocket Pet', 'i-game', true]]
  .filter(g => g[3]);

function gallery() {
  const tile = ([id, name, ic]) => h('button', { class: 'gd-tile', type: 'button', onclick: () => add(id) },
    ic ? icon(ic) : h('span', { class: 'gd-cal-ico' }, new Date().getDate()), h('span', null, name));
  const body = h('div', { class: 'gd-gallery' }, h('p', null, 'Click a gadget to add it to the desktop.'), h('div', { class: 'gd-tiles' }, LIST.map(tile)));
  return createWindow({ app: 'gadgets', title: 'Gadgets', icon: 'i-programs', body, width: 'auto', resizable: false, route: 'gadgets' });
}

export default { id: 'gadgets', title: 'Gadgets', icon: 'i-programs', open: gallery };
