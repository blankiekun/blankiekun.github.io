// Clock, from Windows 1.0 to 3.1: a face that fills the window, or the time in digits.
// Vista and 7 show it as the Sidebar clock gadget instead (css/versions.css).

import { h } from '../util.js';
import { createWindow } from '../wm.js';
import { menubar } from '../menu.js';
import { about } from '../dialogs.js';
import { formatTime, formatDate } from './control.js';
import { V } from '../version.js';

const GADGET = V.id === 'vista' || V.id === '7';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

function open() {
  let digital = false, seconds = true;
  const face = svg('svg', { viewBox: '-50 -50 100 100', class: 'ck-face', 'aria-hidden': 'true' });
  for (let m = 0; m < 60; m++) {
    const a = m * Math.PI / 30, big = m % 5 === 0, r = big ? 2.4 : 1;
    face.append(svg('rect', { x: Math.sin(a) * 44 - r / 2, y: -Math.cos(a) * 44 - r / 2, width: r, height: r, class: big ? 'ck-hour' : 'ck-min' }));
  }
  const hand = (len, w, cls) => { const l = svg('line', { x1: 0, y1: 4, x2: 0, y2: -len, 'stroke-width': w, class: cls }); face.append(l); return l; };
  const hr = hand(24, 4, 'ck-hand'), mn = hand(36, 3, 'ck-hand'), sc = hand(40, 1, 'ck-sec');
  face.append(svg('circle', { r: 2, class: 'ck-pin' }));
  const digits = h('div', { class: 'ck-digits' });
  const view = h('div', { class: 'ck-view', role: 'timer', 'aria-live': 'off' }, face, digits);

  function tick() {
    const d = new Date(), s = d.getSeconds(), m = d.getMinutes() + s / 60, hh = d.getHours() % 12 + m / 60;
    hr.setAttribute('transform', `rotate(${hh * 30})`);
    mn.setAttribute('transform', `rotate(${m * 6})`);
    sc.setAttribute('transform', `rotate(${s * 6})`);
    sc.style.display = seconds ? '' : 'none';
    digits.textContent = formatTime(d, seconds);
    view.setAttribute('aria-label', formatTime(d) + ', ' + formatDate(d));
    face.style.display = digital ? 'none' : '';
    digits.style.display = digital ? '' : 'none';
    if (!GADGET) win.setTitle(digital ? 'Clock' : 'Clock - ' + formatDate(d));
  }

  const bar = menubar([
    { label: '&Settings', items: () => [
      { label: '&Analog', radio: true, checked: !digital, action: () => { digital = false; tick(); } },
      { label: '&Digital', radio: true, checked: digital, action: () => { digital = true; tick(); } }, '-',
      { label: '&Seconds', checked: seconds, action: () => { seconds = !seconds; tick(); } }, '-',
      { label: '&About Clock...', action: () => about('Clock', 'i-clock', win) },
    ] },
  ]);
  const body = h('div', { class: 'ck' }, bar, view);
  const win = createWindow({ app: 'clock', title: GADGET ? 'Clock Gadget' : 'Clock', icon: 'i-clock', body, className: GADGET ? 'ck-gadget' : '', width: GADGET ? 150 : 200, height: GADGET ? 180 : 220, minW: 120, minH: 120, route: 'clock',
    onClosed: () => clearInterval(timer) });
  const timer = setInterval(tick, 1000);
  tick();
  return win;
}

export default { id: 'clock', title: 'Clock', icon: 'i-clock', open };
