// Blankie, the sleepy helper from 98 to XP: a little blanket who sits above the windows while
// WordPad or Help is open, notices letters, and hands out tips in a yellow balloon.
// The balloon never takes focus from the document, and Escape closes it.

import { h, store } from './util.js';
import { launch } from './wm.js';
import { openMenu } from './menu.js';
import { msgbox } from './dialogs.js';
import { V } from './version.js';

const ERAS = ['98', 'me', '2000', 'xp'];
const KEY = 'w95.blankie';   // { off, never: [tip ids] }
const IDLE = 40000, SLEEP = 90000;

const SVG = `<svg viewBox="0 0 80 92" width="80" height="92" aria-hidden="true">
<g class="bk-body">
  <path class="bk-arm bk-l" d="M13 54q-9 3-8 12q6 1 9-5z"/>
  <g class="bk-wave"><path class="bk-arm" d="M67 56q10-3 11-12q-7-1-11 6z"/></g>
  <path class="bk-sheet" d="M40 10C20 10 12 27 12 46v26q5 9 10 0q5 9 11 0q5 9 7 0q4 9 9 0q5 9 10 0q5 9 9 0V46c0-19-8-36-28-36z"/>
  <path class="bk-stitch" d="M17 66q5 6 10 0q5 6 10 0q5 6 6 0q4 6 9 0q5 6 9 0q5 6 6 0"/>
  <path class="bk-cap" d="M21 24Q27 3 47 4q17 1 26 21l-5 2q-5-11-13-14q3 6 2 12Q38 15 21 24z"/>
  <circle class="bk-pom" cx="71" cy="28" r="4.5"/>
  <g class="bk-eyes">
    <ellipse class="bk-white" cx="31" cy="38" rx="7" ry="8"/><ellipse class="bk-white" cx="50" cy="38" rx="7" ry="8"/>
    <g class="bk-look"><circle cx="32" cy="40" r="4"/><circle cx="51" cy="40" r="4"/>
      <circle class="bk-glint" cx="33.5" cy="38.5" r="1.5"/><circle class="bk-glint" cx="52.5" cy="38.5" r="1.5"/></g>
    <path class="bk-lid" d="M24.5 35h13A7 8 0 0 0 24.5 35zM43.5 35h13A7 8 0 0 0 43.5 35z"/>
    <path class="bk-lash" d="M24.5 35h13M43.5 35h13"/>
  </g>
  <path class="bk-shut" d="M24 39q7 5 14 0M43 39q7 5 14 0"/>
  <ellipse class="bk-blush" cx="24" cy="48" rx="4" ry="2.5"/><ellipse class="bk-blush" cx="57" cy="48" rx="4" ry="2.5"/>
  <path class="bk-mouth" d="M37 50q3.5 3 7 0"/>
  <g class="bk-pencil"><path fill="#f6c343" stroke="#2b3350" stroke-width="1.5" d="M60 66l14-14 4 4-14 14-6 2z"/><path fill="#2b3350" d="M58 72l1.5-4.5 3 3z"/></g>
</g>
<g class="bk-z"><text x="58" y="14">z</text><text x="66" y="7">Z</text></g>
</svg>`;

const opts = () => ({ off: false, never: [], ...store.get(KEY, {}) });
const save = o => store.set(KEY, o);

let el = null, balloon = null, idleT = 0, sleepT = 0, poseT = 0, nextIdle = 0;
const wins = new Set();

// Letters, Save and Help come from the programs; the two idle ones take turns.
const TIPS = {
  letter: {
    text: 'It looks like you\'re writing a letter. Would you like help?',
    options: [
      ['Get help with writing the letter', () => tip('letterhelp')],
      ['Just type the letter without help', null],
      ['Don\'t show me this tip again', 'never'],
    ],
  },
  letterhelp: {
    text: 'Letters go down better with a nap halfway through. When you\'re done, sign off with "Yours sleepily," and put the kettle on.',
    options: [['Thanks, Blankie', null]],
  },
  save: { text: 'Saved! I\'ve tucked your document in, nice and warm.', options: [['OK', null], ['Don\'t show me this tip again', 'never']] },
  help: { text: 'Looking for something? The answer is usually under a blanket. Pick a topic on the left.', options: [['OK', null], ['Don\'t show me this tip again', 'never']] },
  reader: {
    text: 'Did you know? You can read Japanese novels with chimimouryou, furigana and all.',
    options: [['Open the chimimouryou reader', () => launch('reader')], ['Not now', null], ['Don\'t show me this tip again', 'never']],
  },
  cons: {
    text: 'Did you know? CONscripter plays visual novels right here. There\'s a demo to try.',
    options: [['Play the CONscripter demo', () => launch('cons', 'demo')], ['Not now', null], ['Don\'t show me this tip again', 'never']],
  },
};
const IDLES = ['reader', 'cons'];
const idleTip = () => { const never = opts().never, left = IDLES.filter(i => !never.includes(i)); return left.length ? left[nextIdle++ % left.length] : null; };

// A program window brings Blankie out; when the last of them closes he goes again.
export function summon(win) {
  if (!ERAS.includes(V.id) || opts().off || document.body.classList.contains('solo') || !win) return;
  wins.add(win);
  const closed = win.opts.onClosed;
  win.opts.onClosed = () => { if (closed) closed(); wins.delete(win); if (!wins.size) hide(); };
  if (el) return;
  el = h('div', { class: 'bk', title: 'Blankie', html: SVG });
  document.body.append(el);
  pose('wave', 1600);
  drag(el);
  el.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    openMenu([
      { label: '&Hide', action: hide },
      { label: '&Options...', action: options },
      '-',
      { label: '&Animate!', action: () => pose(['wave', 'think', 'write'][Math.floor(Math.random() * 3)], 2000) },
    ], { x: e.clientX, y: e.clientY });
  });
  addEventListener('resize', clampPos);
  document.addEventListener('keydown', onKey, true);
  for (const t of ['keydown', 'pointerdown']) document.addEventListener(t, awake, true);
  awake();
}

// Brings him back after Options turned him off (WordPad's Help menu).
export function enable(win) {
  const o = opts(); o.off = false; save(o);
  summon(win);
}

// WordPad: a letter at the top of the page, and the pencil while the visitor types.
export function watch(page) {
  let seen = false;
  page.addEventListener('input', () => {
    if (!el) return;
    pose('write', 1200);
    if (seen) return;
    const first = page.innerText.replace(/^\s+/, '').split('\n')[0];
    if (/^Dear\s/i.test(first) || /,\s*$/.test(first)) { seen = true; tip('letter'); }
  });
}

export function tip(id) {
  const t = TIPS[id];
  if (!el || !t || opts().never.includes(id)) return;
  closeBalloon();
  pose('think', 700);
  const pick = act => () => {
    closeBalloon();
    if (act === 'never') { const o = opts(); o.never = [...new Set([...o.never, id])]; save(o); }
    else if (act) act();
  };
  balloon = h('div', { class: 'bk-balloon' },
    h('p', { role: 'status' }, t.text),
    ...t.options.map(([label, act]) => h('button', { type: 'button', class: 'bk-opt', onclick: pick(act) }, h('i'), label)));
  // Clicking an option mustn't move the caret out of the document.
  balloon.addEventListener('mousedown', e => e.preventDefault());
  document.body.append(balloon);
  placeBalloon();
}

function closeBalloon() { if (balloon) { balloon.remove(); balloon = null; } }

function hide() {
  closeBalloon();
  if (!el) return;
  el.remove(); el = null;
  clearTimeout(idleT); clearTimeout(sleepT);
  removeEventListener('resize', clampPos);
  document.removeEventListener('keydown', onKey, true);
  for (const t of ['keydown', 'pointerdown']) document.removeEventListener(t, awake, true);
}

async function options() {
  const b = await msgbox({ title: 'Blankie', icon: 'question', buttons: ['Turn &off', '&Reset tips', 'Cancel'],
    text: 'Turn Blankie off? He\'ll stay in bed until you choose Show Blankie on WordPad\'s Help menu.\n\nReset tips brings back the tips you said not to show again.' });
  const o = opts();
  if (b === 'Turn off') { o.off = true; save(o); hide(); }
  if (b === 'Reset tips') { o.never = []; save(o); }
}

function onKey(e) {
  if (e.key === 'Escape' && balloon) { e.preventDefault(); e.stopPropagation(); closeBalloon(); }
}

// Any key or click wakes him; a long quiet spell brings a tip, then a nap.
function awake() {
  if (!el) return;
  el.classList.remove('sleep');
  clearTimeout(idleT); clearTimeout(sleepT);
  idleT = setTimeout(() => {
    if (!balloon) tip(idleTip());
  }, IDLE);
  sleepT = setTimeout(() => { closeBalloon(); if (el) el.classList.add('sleep'); }, SLEEP);
}

function pose(name, ms) {
  if (!el) return;
  el.classList.remove('wave', 'think', 'write');
  void el.offsetWidth;   // restart the animation if it's the same pose again
  el.classList.add(name);
  clearTimeout(poseT);
  poseT = setTimeout(() => el && el.classList.remove(name), ms);
}

// Drag him anywhere on screen; a plain click asks him for a tip.
function drag(n) {
  n.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    const r = n.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    let moved = false;
    n.setPointerCapture(e.pointerId);
    const move = ev => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
      moved = true;
      place(ev.clientX - dx, ev.clientY - dy);
    };
    const up = () => {
      n.removeEventListener('pointermove', move); n.removeEventListener('pointerup', up); n.removeEventListener('pointercancel', up);
      if (!moved) tip(idleTip() || 'help');
    };
    n.addEventListener('pointermove', move); n.addEventListener('pointerup', up); n.addEventListener('pointercancel', up);
  });
}

function place(x, y) {
  const r = el.getBoundingClientRect();
  Object.assign(el.style, {
    left: Math.max(0, Math.min(innerWidth - r.width, x)) + 'px',
    top: Math.max(0, Math.min(innerHeight - r.height, y)) + 'px',
    right: 'auto', bottom: 'auto',
  });
  placeBalloon();
}
function clampPos() { if (el && el.style.left) { const r = el.getBoundingClientRect(); place(r.left, r.top); } else placeBalloon(); }

// The balloon sits above him (below, near the top of the screen), kept inside the page.
function placeBalloon() {
  if (!balloon || !el) return;
  const c = el.getBoundingClientRect(), b = balloon.getBoundingClientRect();
  const below = c.top - b.height - 12 < 0;
  const left = Math.max(8, Math.min(innerWidth - b.width - 8, c.left + c.width / 2 - b.width + 30));
  balloon.style.left = left + 'px';
  balloon.style.top = (below ? c.bottom + 12 : c.top - b.height - 12) + 'px';
  balloon.classList.toggle('below', below);
  balloon.style.setProperty('--tail', Math.max(12, Math.min(b.width - 24, c.left + c.width / 2 - left - 8)) + 'px');
}
