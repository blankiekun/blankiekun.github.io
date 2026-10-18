// blankiekun Tour, in 98 and XP: a dark screen over the desktop that walks through the site a step
// at a time, with a little pointer that drifts over to each step's picture. The taskbar stays in
// view so the Start step can ring the real Start button. Welcome's Tour button opens it, and in XP
// a balloon by the clock (setup.js) offers it once.

import { h, icon } from '../util.js';
import { launch } from '../wm.js';
import { OS } from '../version.js';

const STEPS = [
  { title: 'Welcome', icon: 'i-flag',
    text: `This is ${OS}, the home page of blankiekun's three projects, dressed up as an old PC. Everything here opens, clicks and saves like it would have. Press Next to look around.` },
  { title: 'The desktop and Start', icon: 'i-computer', start: true,
    text: 'Double-click an icon on the desktop to open it (tap once on a touch screen). Every program is on the Start menu, down in the corner, and the taskbar beside it holds the windows you have open.' },
  { title: 'chimimouryou', icon: 'i-book', go: () => launch('reader'),
    text: 'chimimouryou is a self-hosted e-book reader for your Calibre library, made for reading Japanese: vertical text, furigana and a tap-a-word glossary. Try the reader with the opening of Botchan.' },
  { title: 'CONscripter', icon: 'i-game', go: () => launch('cons', 'demo'),
    text: 'CONscripter plays NScripter visual novels in the browser, and on Windows, Linux, macOS and Android. A short demo game is ready to play.' },
  { title: 'conscripter-convert', icon: 'i-convert', go: () => launch('ie', 'convert'),
    text: 'conscripter-convert turns visual novels you own, made with other engines, into games CONscripter can play. Its page shows how far each game has got.' },
  { title: 'Other versions', icon: 'i-setup', go: () => launch('setup'),
    text: 'This PC can be any blankiekun from 1.0 to 11. Windows Setup, on the Start menu, upgrades or downgrades it; your files come along.' },
  { title: 'Have fun', icon: 'i-flag',
    text: 'That\'s the tour. Poke around, play a game of Minesweeper, write a letter in WordPad. Press Exit to go back to the desktop.' },
];

let el = null;

function open() {
  if (el) return el.focus();
  let at = 0;
  const back = document.activeElement;
  const btn = (label, onclick, cls = '') => h('button', { type: 'button', class: ('btn ' + cls).trim(), onclick }, label);
  const steps = STEPS.map((s, i) => h('li', null, h('button', { type: 'button', onclick: () => show(i) }, s.title)));
  const pic = h('div', { class: 'tour-pic', 'aria-hidden': 'true' });
  const head = h('h2', { id: 'tour-h' }), count = h('p', { class: 'tour-count' }), text = h('p');
  const tryIt = btn('Try it', () => { const go = STEPS[at].go; exit(); go(); }, 'tour-try');
  const prev = btn('< Back', () => show(at - 1)), next = btn('Next >', () => show(at + 1), 'default');
  const ring = h('div', { class: 'tour-ring', 'aria-hidden': 'true' });
  el = h('div', { class: 'tour', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'blankiekun Tour', tabindex: '-1' },
    h('h1', null, h('b', null, 'blankiekun'), ' Tour'),
    h('ol', { class: 'tour-steps', 'aria-label': 'Steps' }, steps),
    h('div', { class: 'tour-main', 'aria-live': 'polite' }, pic, count, head, text, tryIt),
    h('div', { class: 'tour-btns' }, prev, next, btn('Exit', exit)));
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') exit();
    else if (e.key === 'ArrowRight' && at < STEPS.length - 1) show(at + 1);
    else if (e.key === 'ArrowLeft' && at > 0) show(at - 1);
    else return;
    e.preventDefault();
  });
  addEventListener('resize', place);
  // Nothing behind it takes clicks or Tab while it's up.
  for (const id of ['desktop', 'taskbar']) document.getElementById(id).inert = true;
  document.body.append(el, ring);
  show(0);
  next.focus();

  function show(i) {
    at = i;
    const s = STEPS[i];
    steps.forEach((li, j) => { li.classList.toggle('on', j === i); li.firstChild.setAttribute('aria-current', j === i ? 'step' : 'false'); });
    // A new pointer each step restarts its walk over to the picture.
    pic.replaceChildren(icon(s.icon), h('i', { class: 'tour-ptr' }));
    count.textContent = `Step ${i + 1} of ${STEPS.length}`;
    head.textContent = s.title;
    text.textContent = s.text;
    tryIt.hidden = !s.go;
    prev.disabled = i === 0;
    next.disabled = i === STEPS.length - 1;
    if (document.activeElement.disabled || !el.contains(document.activeElement)) (i === STEPS.length - 1 ? el.querySelector('.tour-btns .btn:last-child') : next).focus();
    ring.hidden = !s.start;
    place();
  }
  function place() {
    const r = document.getElementById('start').getBoundingClientRect();
    Object.assign(ring.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
  }
  function exit() {
    el.remove(); ring.remove(); el = null;
    removeEventListener('resize', place);
    for (const id of ['desktop', 'taskbar']) document.getElementById(id).inert = false;
    if (back && back.isConnected) back.focus();
  }
}

export default { id: 'tour', title: 'blankiekun Tour', icon: 'i-flag', single: true, open };
