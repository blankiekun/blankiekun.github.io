// 8's charms and hot corners. The pointer in the top- or bottom-right corner shows the five charms;
// sliding along the edge, Win+C or a swipe in from the right brings out the whole bar and the clock.
// The top-left corner shows the window used before this one; sliding down lists them all.

import { h, icon } from './util.js';
import { all, focus, activeWindow, still, launch, onCharms } from './wm.js';
import { absent } from './version.js';
import { volumePopup, shutDown } from './desktop.js';

const EDGE = 4;   // how close to the corner counts
let bar = null, clock = null, pane = null, sw = null, sticky = false, y0 = 0, swipe = null;
let start = () => {}, search = () => {};

const go = fn => () => { close(); fn(); };
const link = (label, fn) => h('button', { type: 'button', class: 'charm-link', onclick: fn }, label);

function show(full) {
  if (!bar) {
    bar = h('nav', { class: 'charms', 'aria-label': 'Charms', onpointerdown: e => e.stopPropagation(), onpointerleave: leave },
      [['Search', 'i-charm-search', go(() => search(''))], ['Share', 'i-charm-share', share], ['Start', 'i-charm-start', go(() => start())],
        ['Devices', 'i-charm-devices', devices], ['Settings', 'i-charm-settings', settings]]
        .map(([label, ic, fn]) => h('button', { type: 'button', onclick: fn }, icon(ic), h('span', null, label))));
    document.body.append(bar);
  }
  if (!full || clock) return;
  bar.classList.add('full');
  const d = new Date();
  clock = h('div', { class: 'charm-clock', 'aria-hidden': 'true' },
    h('b', null, d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '')),
    h('div', null, d.toLocaleDateString([], { weekday: 'long' }), h('br'), d.toLocaleDateString([], { month: 'long', day: 'numeric' })));
  document.body.append(clock);
}

// Moving off a corner's strip puts it away (pointermove alone misses the pointer going into a frame).
const leave = e => { if (!sticky && e.pointerType === 'mouse') close(); };

function close() {
  for (const el of [bar, clock, pane, sw?.el]) el?.remove();
  bar = clock = pane = sw = null;
  sticky = false;
}

// Win+C, or a swipe: the whole bar, staying until something else is clicked.
function open() {
  if (bar && sticky) { close(); return; }
  close();
  show(true);
  sticky = true;
  bar.querySelector('button').focus();
}

// A charm's pane takes the bar's place at the right.
function openPane(title, ...kids) {
  close();
  sticky = true;
  pane = h('aside', { class: 'charm-pane', role: 'dialog', 'aria-label': title, tabindex: '-1', onpointerdown: e => e.stopPropagation() }, h('h2', null, title), kids);
  document.body.append(pane);
  pane.focus();
}

function share() {
  const say = h('p', { role: 'status' }, 'Nothing to share here. You can copy the link to this site instead.');
  openPane('Share', say, navigator.clipboard && link('Copy link', () => navigator.clipboard.writeText(location.origin + location.pathname)
    .then(() => { say.textContent = 'Link copied.'; }, () => { say.textContent = "The link couldn't be copied."; })));
}

function devices() {
  const say = h('p', { role: 'status' });
  const none = what => () => { say.textContent = `You don't have any devices that can ${what}.`; };
  openPane('Devices', link('Play', none('play from this app')), link('Print', go(() => launch('explorer', 'Printers'))), link('Project', none('show a second screen')), say);
}

function settings() {
  const say = h('p', { role: 'status' });
  const tell = msg => () => { say.textContent = msg; };
  const tray = (label, ic, fn) => h('button', { type: 'button', class: 'charm-tray', onclick: fn }, icon(ic), h('span', null, label));
  const cp = () => launch('explorer', 'Control Panel');
  openPane('Settings', h('small', null, 'Desktop'),
    link('Control Panel', go(cp)), link('Personalization', go(() => launch('display'))), link('PC info', go(() => launch('sysprops'))), link('Help', go(() => launch('help'))),
    h('div', { class: 'charm-grow' }), say,
    h('div', { class: 'charm-trays' },
      tray('Network', 'i-tb-wifi', go(() => launch('network'))), tray('Volume', 'i-qs-volume', go(() => volumePopup())),
      tray('Brightness', 'i-qs-sun', tell("This display's brightness is set on the monitor.")),
      tray('Notifications', 'i-tb-note', tell('Notifications are on.')), tray('Power', 'i-charm-power', go(shutDown)),
      tray('Keyboard', 'i-charm-keyboard', tell('ENG: English (United States)'))),
    link('Change PC settings', go(absent('settings') ? cp : () => launch('settings'))));
}

// The top-left corner: the window before this one, then (down the edge) every other one.
function peek() {
  const list = all().filter(w => w.task && w !== activeWindow()).reverse();
  if (!list.length) return;
  sw = { list, el: h('div', { class: 'charm-switch', role: 'list', 'aria-label': 'Recent apps', onpointerleave: leave }) };
  thumbs(1);
  document.body.append(sw.el);
}
function thumbs(n) {
  sw.el.classList.toggle('list', n > 1);
  sw.el.replaceChildren(...sw.list.slice(0, n).map(w => {
    const { copy, r } = still(w), s = Math.min(150 / r.width, 110 / r.height);
    Object.assign(copy.style, { transform: `scale(${s})`, transformOrigin: '0 0' });
    return h('button', { type: 'button', class: 'charm-thumb', role: 'listitem', title: w.task.title, 'aria-label': w.task.title,
      style: { width: r.width * s + 'px', height: r.height * s + 'px' }, onclick: () => { close(); focus(w); } }, copy);
  }));
}

document.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') {
    if (swipe != null && swipe - e.clientX > 30) { swipe = null; open(); }
    return;
  }
  if (document.querySelector('.screen.logon')) return;
  const x = e.clientX, y = e.clientY;
  if (sticky) return;
  if (!bar && x >= innerWidth - EDGE && (y <= EDGE || y >= innerHeight - EDGE)) { show(false); y0 = y; }
  else if (bar && Math.abs(y - y0) > 40) show(true);
  if (!sw && !bar && x <= EDGE && y <= EDGE) peek();
  else if (sw && y > 140 && !sw.el.classList.contains('list')) thumbs(sw.list.length);
}, true);
// shortcut: the browser may take a touch swipe at the edge for itself (back, scroll), so this works where it doesn't.
document.addEventListener('pointerdown', e => {
  swipe = e.pointerType === 'touch' && e.clientX >= innerWidth - 16 ? e.clientX : null;
  if ((bar || pane || sw) && !e.target.closest('.charms, .charm-pane, .charm-switch')) close();
}, true);
document.addEventListener('pointerup', () => { swipe = null; }, true);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !(bar || pane || sw)) return;
  e.preventDefault(); e.stopPropagation();
  close();
}, true);

// desktop.js hands over its Start toggle and the Start screen's search.
export function initCharms(toggleStart, startSearch) {
  start = toggleStart; search = startSearch;
  onCharms(open);
}
