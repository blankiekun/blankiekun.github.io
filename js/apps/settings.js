// Settings, 10 and 11: Display, System Properties and the Start menu's Settings come here
// instead of the classic dialogs. Changes take effect as they're made; the pages Settings
// never took over (mouse, sounds, date and time) still open the Control Panel ones.
// 10 opens on a home grid of categories, 11 lists them down the side. Colors' dark mode and
// accent are kept here and put on <html> (data-theme, --accent) for css/versions.css to draw.

import { h, icon, store } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { WALLPAPERS, COLORS, PAINTED, current, setDesktop } from './display.js';
import { formatDate, formatTime } from './control.js';
import { OS, V, ram } from '../version.js';

const row = (label, value) => h('div', { class: 'st-row' }, h('span', null, label), value);
const select = (...opts) => h('select', { class: 'field', disabled: opts.length < 2 }, ...opts.map(o => h('option', null, o)));
const toggle = (on, onchange) => {
  const b = h('button', { type: 'button', class: 'st-switch', role: 'switch', 'aria-checked': String(on) }, on ? 'On' : 'Off');
  b.addEventListener('click', () => { on = !on; b.setAttribute('aria-checked', String(on)); b.textContent = on ? 'On' : 'Off'; if (onchange) onchange(on); });
  return b;
};
const linkTo = (label, fn) => h('a', { href: '#', class: 'st-link', onclick: e => { e.preventDefault(); fn(); } }, label);

function display() {
  return [h('div', { class: 'st-card' },
    h('h3', null, 'Scale and layout'),
    row('Change the size of text, apps, and other items', select('100% (Recommended)')),
    row('Display resolution', select(`${screen.width * devicePixelRatio} × ${screen.height * devicePixelRatio} (Recommended)`)),
    row('Display orientation', select('Landscape')))];
}

function about() {
  const build = V.number.split('.').pop();
  return [
    h('div', { class: 'st-card' }, h('h3', null, 'Device specifications'),
      row('Device name', h('b', null, 'BLANKIEKUN-PC')),
      row('Installed RAM', h('b', null, ram(V.ramKB))),
      row('System type', h('b', null, '64-bit operating system, x64-based processor'))),
    h('div', { class: 'st-card' }, h('h3', null, 'blankiekun specifications'),
      row('Edition', h('b', null, OS)),
      row('Version', h('b', null, V.sys.replace('Version ', ''))),
      row('OS build', h('b', null, build))),
  ];
}

function background() {
  const s = current();
  const preview = h('div', { class: 'st-preview', 'aria-hidden': 'true' });
  const paint = (el, name, color) => {
    const wp = name === PAINTED ? { url: `url("${s.painted}")`, size: 'cover', repeat: 'no-repeat' } : WALLPAPERS[name];
    Object.assign(el.style, { backgroundColor: color, backgroundImage: wp ? wp.url : 'none', backgroundSize: wp ? wp.size : '', backgroundRepeat: wp ? wp.repeat : '' });
  };
  const pictures = Object.keys(WALLPAPERS).filter(n => WALLPAPERS[n]).concat(s.painted ? [PAINTED] : []);
  const kind = select('Picture', 'Solid color');
  kind.value = WALLPAPERS[s.wallpaper] || s.wallpaper === PAINTED ? 'Picture' : 'Solid color';
  const grid = h('div', { class: 'st-pics', role: 'radiogroup', 'aria-label': 'Choose your picture' });
  function fill() {
    const now = current(), pics = kind.value === 'Picture';
    paint(preview, now.wallpaper, now.color);
    grid.replaceChildren(...(pics ? pictures : COLORS).map(v => {
      const on = pics ? now.wallpaper === v : now.wallpaper === '(None)' && now.color === v;
      const b = h('button', { type: 'button', class: 'st-pic' + (pics ? '' : ' color'), role: 'radio', 'aria-checked': String(on), 'aria-label': v, title: v });
      paint(b, pics ? v : '(None)', pics ? '#000' : v);
      b.addEventListener('click', () => { setDesktop(pics ? { wallpaper: v } : { wallpaper: '(None)', color: v }); fill(); });
      return b;
    }));
  }
  kind.addEventListener('change', fill);
  fill();
  return [preview, h('div', { class: 'st-card' }, row('Background', kind), h('h3', null, kind.value === 'Picture' ? 'Choose your picture' : 'Choose your background color'), grid)];
}

function lockscreen() {
  return [h('div', { class: 'st-card' }, h('h3', null, 'Lock screen'),
    h('p', null, 'The screen saver is still set in the classic dialog.'),
    linkTo('Screen saver settings', () => launch('display', 'Screen Saver')))];
}

function apps() {
  return [h('div', { class: 'st-card' }, h('h3', null, 'Apps & features'),
    h('p', null, 'Install programs from a floppy disk or CD-ROM, or remove the ones you added.'),
    linkTo('Programs and Features', () => launch('addremove')))];
}

function datetime() {
  const now = new Date();
  return [h('div', { class: 'st-card' },
    h('p', { class: 'st-big' }, formatTime(now) + ', ' + formatDate(now, true)),
    row('Set time automatically', toggle(true)),
    row('Time zone', h('b', null, Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time')),
    h('h3', null, 'Related settings'),
    linkTo('Date, time & regional formatting', () => launch('regional')),
    linkTo('Additional clocks', () => launch('datetime')))];
}

function devices() {
  return [h('div', { class: 'st-card' }, h('h3', null, 'Mouse'),
    row('Select your primary button', select('Left')),
    h('h3', null, 'Related settings'),
    linkTo('Additional mouse options', () => launch('mouse')),
    linkTo('Sound Control Panel', () => launch('sounds')))];
}

const THEME = 'w95.theme';
export const theme = () => ({ dark: false, accent: null, ...store.get(THEME, {}) });
// main.js calls every module's applyDisplay at startup. index.html's head script applies the same thing before first paint.
export function applyDisplay(t = theme()) {
  const root = document.documentElement;
  root.dataset.theme = t.dark ? 'dark' : 'light';
  if (t.accent) root.style.setProperty('--accent', t.accent); else root.style.removeProperty('--accent');
}
const setTheme = changes => { store.set(THEME, { ...theme(), ...changes }); applyDisplay(); };
const ACCENTS = [['Blue', '#0078d7'], ['Navy blue', '#0063b1'], ['Iris', '#6b69d6'], ['Orchid', '#c239b3'], ['Red', '#e81123'], ['Orange', '#ca5010'],
  ['Gold', '#ff8c00'], ['Green', '#107c10'], ['Teal', '#00b7c3'], ['Storm', '#2d7d9a'], ['Steel', '#69797e'], ['Gray', '#767676']];

function colors() {
  const mode = select('Light', 'Dark');
  mode.value = theme().dark ? 'Dark' : 'Light';
  mode.addEventListener('change', () => setTheme({ dark: mode.value === 'Dark' }));
  const grid = h('div', { class: 'st-pics', role: 'radiogroup', 'aria-label': 'Choose your accent color' });
  function fill() {
    const now = theme().accent || ACCENTS[0][1];
    grid.replaceChildren(...ACCENTS.map(([name, c]) => h('button', { type: 'button', class: 'st-pic color', role: 'radio', 'aria-checked': String(c === now), 'aria-label': name, title: name,
      style: { backgroundColor: c }, onclick: () => { setTheme({ accent: c }); fill(); } })));
  }
  fill();
  // shortcut: dark mode reaches the title bars, taskbar, Start and Settings, not the insides of the other programs; give each app's CSS dark colours if wanted.
  return [h('div', { class: 'st-card' }, h('h3', null, 'Choose your color'), row('Choose your default app mode', mode)),
    h('div', { class: 'st-card' }, h('h3', null, 'Choose your accent color'), grid)];
}

// Wi-Fi and airplane mode only change what this page says (and the taskbar's Quick Settings); the site is online either way.
export const net = { wifi: true, airplane: false };
function network() {
  const status = h('p', { class: 'st-big' });
  const note = h('p');
  const paint = () => {
    const up = navigator.onLine && net.wifi && !net.airplane;
    status.textContent = net.airplane ? 'Airplane mode is on' : up ? "You're connected to the Internet" : 'Not connected';
    note.textContent = up ? 'Connected to the internet via ' + (location.host || 'blankiekun.github.io') + '.' : 'Turn on Wi-Fi to see this site again (it never left).';
  };
  paint();
  return [h('div', { class: 'st-card' }, h('h3', null, 'Network status'), icon('i-network', 'st-hero'), status, note,
      row('Connection', h('b', null, location.protocol === 'https:' ? 'Secure (HTTPS)' : location.protocol.replace(':', '').toUpperCase())),
      row('Served by', h('b', null, 'GitHub Pages'))),
    h('div', { class: 'st-card' }, h('h3', null, 'Wi-Fi'), row('Wi-Fi', toggle(net.wifi, on => { net.wifi = on; paint(); })),
      h('h3', null, 'Airplane mode'), row('Stop all wireless communication', toggle(net.airplane, on => { net.airplane = on; paint(); }))),
    h('div', { class: 'st-card' }, h('h3', null, 'Related settings'), linkTo('Dial-Up Networking', () => launch('dialer')))];
}

// shortcut: hand-copied from the latest merges in git log, no network calls; add a line when a feature ships.
const NOTES = ['Settings in 10 and 11 get a home grid, a side nav, dark mode and accent colours, Network and Update',
  'Gadgets stay small, behind windows and visible under Aero Peek', 'The browser in 10 and 11 is blankiekun Edge',
  'Vista and 7 get CPU meter, calendar and slideshow gadgets', 'Each era plays its own default sounds', '7 on get the Snipping Tool'];
const CHECKED = 'w95.update';
function update() {
  const stamp = () => { const d = new Date(store.get(CHECKED, Date.now())); return 'Last checked: ' + formatDate(d) + ', ' + formatTime(d); };
  const when = h('p', null, stamp());
  const news = h('div');
  const check = h('button', { type: 'button', class: 'btn' }, 'Check for updates');
  check.addEventListener('click', () => {
    check.disabled = true; when.textContent = 'Checking for updates...';
    setTimeout(() => {
      store.set(CHECKED, Date.now()); check.disabled = false; when.textContent = stamp();
      news.replaceChildren(h('h3', null, "What's new in the latest update"), h('ul', null, ...NOTES.map(n => h('li', null, n))));
    }, 1200);
  });
  return [h('div', { class: 'st-card' }, icon('i-refresh', 'st-hero'), h('p', { class: 'st-big' }, "You're up to date"), when, check, news)];
}

function account() {
  return [h('div', { class: 'st-card' }, icon('i-user', 'st-hero'), h('p', { class: 'st-big' }, 'BLANKIEKUN'), h('p', null, 'Local account', h('br'), 'Administrator'))];
}

const CATS = [
  ['System', 'i-computer', 'Display, about this PC', [['Display', display], ['About', about]]],
  ['Devices', 'i-mouse', 'Mouse, sound devices', [['Mouse', devices]]],
  ['Network & Internet', 'i-network', 'Wi-Fi, airplane mode', [['Status', network]]],
  ['Personalization', 'i-display', 'Background, colors, lock screen', [['Background', background], ['Colors', colors], ['Lock screen', lockscreen]]],
  ['Apps', 'i-addremove', 'Uninstall, optional features', [['Apps & features', apps]]],
  ['Accounts', 'i-user', 'Your info', [['Your info', account]]],
  ['Time & Language', 'i-globe', 'Date, time, region', [['Date & time', datetime]]],
  ['Update & Security', 'i-shield', 'blankiekun Update', [['blankiekun Update', update]]],
];
const PAGES = CATS.flatMap(([cat, ic, , pages], ci) => pages.map(([name, draw]) => ({ ci, cat, ic, name, draw })));

// A view is { ci, page }: no ci is 10's home, a ci without a page 11's list of that category's pages.
function open(arg) {
  const eleven = V.id === '11';
  const nav = h('nav', { class: 'st-nav' });
  const content = h('div');
  const main = h('div', { class: 'st-main' });
  const body = h('div', { class: 'st' }, nav, main);
  const hist = [];
  const back = h('button', { type: 'button', class: 'st-back', 'aria-label': 'Back', onclick: () => { hist.pop(); show(hist.pop()); } }, '←');
  const find = h('input', { type: 'search', class: 'st-find', placeholder: 'Find a setting', 'aria-label': 'Find a setting' });
  const head = h('div', { class: 'st-head' }, h('h1', null, 'Settings'), find);
  const navBtn = (ic, label, on, fn) => h('button', { type: 'button', class: on ? 'on' : null, onclick: fn }, icon(ic), h('span', null, label));
  const pageLink = (p, sub) => h('button', { type: 'button', class: 'st-plink', onclick: () => show({ ci: p.ci, page: p }) }, icon(p.ic), h('span', null, p.name, sub && h('small', null, p.cat)));
  function show(v) {
    hist.push(v);
    back.disabled = hist.length < 2;
    const c = CATS[v.ci], p = v.page;
    body.classList.toggle('home', !c);
    nav.replaceChildren(back, ...(eleven
      ? [h('div', { class: 'st-user' }, icon('i-user'), h('b', null, 'blankiekun'), h('span', null, 'Local account')), find,
        ...CATS.map(([cat, ic], i) => navBtn(ic, cat, i === v.ci, () => show({ ci: i })))]
      : c ? [navBtn('i-home', 'Home', false, () => show({})), find, h('h4', null, c[0]),
        ...c[3].map(([name]) => navBtn(c[1], name, name === (p && p.name), () => show({ ci: v.ci, page: PAGES.find(x => x.ci === v.ci && x.name === name) })))] : []));
    find.value = '';
    if (!c) content.replaceChildren(h('div', { class: 'st-tiles' }, ...CATS.map(([cat, ic, sub], i) =>
      h('button', { type: 'button', class: 'st-tile', onclick: () => show({ ci: i, page: PAGES.find(x => x.ci === i) }) }, icon(ic), h('b', null, cat), h('span', null, sub)))));
    else if (!p) content.replaceChildren(h('h1', null, c[0]), ...PAGES.filter(x => x.ci === v.ci).map(p => pageLink(p)));
    else content.replaceChildren(h('h1', null, eleven ? c[0] + ' › ' + p.name : p.name), ...p.draw());
    main.replaceChildren(...(c ? [] : [head]), content);
    main.scrollTop = 0;
  }
  find.addEventListener('input', () => {
    const q = find.value.trim().toLowerCase();
    if (!q) { show(hist.pop()); find.focus(); return; }
    const hits = PAGES.filter(p => (p.cat + ' ' + p.name).toLowerCase().includes(q));
    content.replaceChildren(h('h3', null, 'Search results'), ...(hits.length ? hits.map(p => pageLink(p, true)) : [h('p', null, 'No results found.')]));
  });
  find.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = content.querySelector('.st-plink'); if (b) b.click(); } });
  const win = createWindow({ app: 'settings', title: 'Settings', icon: 'i-ctrl', body, width: 760, height: 520, minW: 320, minH: 300, route: 'settings' });
  win.go = name => { const p = PAGES.find(x => x.name === name); show(p ? { ci: p.ci, page: p } : eleven ? { ci: 0 } : {}); };
  win.go(arg);
  return win;
}

export const settingsApp = { id: 'settings', title: 'Settings', icon: 'i-ctrl', single: true, open, reopen: (w, arg) => arg && w.go(arg) };
