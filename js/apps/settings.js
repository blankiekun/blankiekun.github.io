// Settings, 10 and 11: Display, System Properties and the Start menu's Settings come here
// instead of the classic dialogs. Changes take effect as they're made; the pages Settings
// never took over (mouse, sounds, date and time) still open the Control Panel ones.

import { h, icon } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { WALLPAPERS, COLORS, PAINTED, current, setDesktop } from './display.js';
import { formatDate, formatTime } from './control.js';
import { OS, V, ram } from '../version.js';

const row = (label, value) => h('div', { class: 'st-row' }, h('span', null, label), value);
const select = (...opts) => h('select', { class: 'field', disabled: opts.length < 2 }, ...opts.map(o => h('option', null, o)));
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
    h('div', { class: 'st-card' }, h('h3', null, 'Windows specifications'),
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

function apps() {
  return [h('div', { class: 'st-card' }, h('h3', null, 'Apps & features'),
    h('p', null, 'Install programs from a floppy disk or CD-ROM, or remove the ones you added.'),
    linkTo('Programs and Features', () => launch('addremove')))];
}

function datetime() {
  const now = new Date();
  return [h('div', { class: 'st-card' },
    h('p', { class: 'st-big' }, formatTime(now) + ', ' + formatDate(now, true)),
    row('Set time automatically', h('span', { class: 'st-toggle on', role: 'switch', 'aria-checked': 'true' }, 'On')),
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

const CATS = [
  ['System', 'i-computer', [['Display', display], ['About', about]]],
  ['Devices', 'i-mouse', [['Mouse', devices]]],
  ['Personalization', 'i-display', [['Background', background]]],
  ['Apps', 'i-addremove', [['Apps & features', apps]]],
  ['Time & language', 'i-globe', [['Date & time', datetime]]],
];
const PAGES = CATS.flatMap(([cat, ic, pages]) => pages.map(([name, draw]) => ({ cat, ic, name, draw })));

function open(arg) {
  const nav = h('nav', { class: 'st-nav' });
  const main = h('div', { class: 'st-main' });
  function go(p) {
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.page === p.name));
    main.replaceChildren(h('h1', null, p.cat + ' › ' + p.name), ...p.draw());
    main.scrollTop = 0;
  }
  nav.append(h('div', { class: 'st-user' }, icon('i-computer'), h('b', null, 'blankiekun'), h('span', null, 'Local account')),
    ...CATS.flatMap(([cat, ic, pages]) => [h('h4', null, cat), ...pages.map(([name]) => {
      const p = PAGES.find(x => x.name === name);
      return h('button', { type: 'button', 'data-page': name, onclick: () => go(p) }, icon(ic), h('span', null, name));
    })]));
  const body = h('div', { class: 'st' }, nav, main);
  const win = createWindow({ app: 'settings', title: 'Settings', icon: 'i-ctrl', body, width: 760, height: 520, minW: 320, minH: 300, route: 'settings' });
  go(PAGES.find(p => p.name === arg) || PAGES[0]);
  win.go = name => go(PAGES.find(p => p.name === name) || PAGES[0]);
  return win;
}

export const settingsApp = { id: 'settings', title: 'Settings', icon: 'i-ctrl', single: true, open, reopen: (w, arg) => arg && w.go(arg) };
