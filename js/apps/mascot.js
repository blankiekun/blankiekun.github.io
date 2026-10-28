// Desktop Mascot: a little pixel girl who walks along the taskbar, climbs onto the focused window's
// title bar, and can be picked up and dropped, like the shimeji of 2000s desktops. Not a window:
// gadgets.js treats the handle mascot() returns as one, so the gallery remembers her the same way.

import { h, reducedMotion } from '../util.js';
import { activeWindow } from '../wm.js';
import { openMenu } from '../menu.js';

export const SW = 32;   // sprite size on screen: 16x16 pixels drawn at 2x

// ---------- Movement ----------

// The surface under her feet, if it's the perch (x is her left edge, y her feet).
const on = (s, p) => !!p && Math.abs(s.y - p.top) < 1 && s.x + SW / 2 >= p.l && s.x + SW / 2 <= p.r;

// One tick: state {mode, x, y, vy, dir, t} and bounds {right, floor, perch: {l, r, top} | null, still}
// to the next state; r is a random number in [0, 1), passed in so the step stays pure.
export function step(s, b, r) {
  if (s.mode === 'drag') return s;
  const p = b.perch;
  const x = Math.max(0, Math.min(b.right, s.x)), y = Math.min(b.floor, s.y), dir = s.dir, t = s.t - 1;
  if (b.still) return { mode: 'sit', x, y: on({ x, y }, p) ? p.top : b.floor, vy: 0, dir, t: 0 };
  if (s.mode === 'fall') {
    const vy = Math.min(s.vy + 1, 16), ny = y + vy;
    if (p && y <= p.top && ny >= p.top && on({ x, y: p.top }, p)) return { mode: 'sit', x, y: p.top, vy: 0, dir, t: 40 };
    if (ny >= b.floor) return { mode: 'sit', x, y: b.floor, vy: 0, dir, t: 30 };
    return { mode: 'fall', x, y: ny, vy, dir, t };
  }
  if (s.mode === 'climb') {
    if (!p || p.top >= b.floor) return { mode: 'fall', x, y, vy: 0, dir, t };
    const left = x + SW / 2 < (p.l + p.r) / 2;
    const ex = Math.max(0, Math.min(b.right, left ? p.l - SW : p.r));   // hug the window's side
    if (x !== ex) {
      if (y < b.floor) return { mode: 'fall', x, y, vy: 0, dir, t };   // the window moved off her
      const d = Math.sign(ex - x);
      return { mode: 'climb', x: x + d * Math.min(2, Math.abs(ex - x)), y, vy: 0, dir: d, t };
    }
    if (y - 1 > p.top) return { mode: 'climb', x, y: y - 1, vy: 0, dir, t };
    return { mode: 'sit', x: left ? p.l : p.r - SW, y: p.top, vy: 0, dir: left ? 1 : -1, t: 80 };
  }
  // Nothing under her any more (her window moved, closed or lost the focus): she falls.
  if (y < b.floor && !on({ x, y }, p)) return { mode: 'fall', x, y, vy: 0, dir, t };
  if (s.mode === 'sit') {
    if (t > 0) return { mode: 'sit', x, y, vy: 0, dir, t };
    return { mode: 'walk', x, y, vy: 0, dir: r < .5 ? -1 : 1, t: 40 + (r * 100 | 0) };
  }
  let nx = x + dir * 2, nd = dir;
  if (nx <= 0 || nx >= b.right) { nx = Math.max(0, Math.min(b.right, nx)); nd = -dir; }
  if (t > 0) return { mode: 'walk', x: nx, y, vy: 0, dir: nd, t };
  if (r < .35) return { mode: 'sit', x: nx, y, vy: 0, dir: nd, t: 60 + (r * 400 | 0) };
  if (r < .55 && p && y === b.floor) return { mode: 'climb', x: nx, y, vy: 0, dir: nd, t: 0 };
  return { mode: 'walk', x: nx, y, vy: 0, dir: r < .775 ? 1 : -1, t: 60 };
}

{
  const B = { right: 500, floor: 400, perch: null, still: false };
  const W = { mode: 'walk', x: 100, y: 400, vy: 0, dir: 1, t: 10 };
  const P = { l: 200, r: 300, top: 150 };
  console.assert(step(W, B, 0).x === 102 && step(W, B, 0).y === 400, 'mascot: walks 2px along the floor');
  console.assert(step({ ...W, x: 499 }, B, 0).dir === -1, 'mascot: turns at the screen edge');
  console.assert(step({ ...W, mode: 'fall', y: 395, vy: 6 }, B, 0).mode === 'sit' && step({ ...W, mode: 'fall', y: 395, vy: 6 }, B, 0).y === 400, 'mascot: lands on the floor');
  console.assert(step({ ...W, mode: 'fall', x: 230, y: 140, vy: 10 }, { ...B, perch: P }, 0).y === 150, 'mascot: lands on a title bar from above');
  console.assert(step({ ...W, mode: 'sit', x: 230, y: 150 }, B, 0).mode === 'fall', 'mascot: falls when her window goes');
  console.assert(step({ ...W, mode: 'climb', x: 168, y: 151 }, { ...B, perch: P }, 0).y === 150, 'mascot: climbs onto the title bar');
  console.assert(step({ ...W, y: 200 }, { ...B, still: true }, 0).mode === 'sit' && step({ ...W, y: 200 }, { ...B, still: true }, 0).y === 400, 'mascot: reduced motion just sits on the floor');
  console.assert(step({ ...W, mode: 'drag', y: 50 }, B, 0).y === 50, 'mascot: held, she stays in the hand');
}

// ---------- The sprite ----------

// Original pixel art, one character per pixel: outline, hair, skin, eyes, white, blush, mouth, dress, ribbon, shoes.
const INK = { o: '#2b1d2e', h: '#8a5cc7', s: '#ffe0c8', e: '#3a2350', w: '#fff', p: '#ff9fb0', m: '#c0405a', d: '#2f4a8a', r: '#e0303a', f: '#5a2a1a' };
const HEAD = ['.....oooooo.....', '...oohhhhhhoo...', '..ohhhhhhhhhho..', '.ohhhhhhhhhhhho.', '.ohhhhshhshhhho.', '.ohssssssssssho.'];
const EYES = ['.ohsewsssswesho.', '.ohseesssseesho.'], SLEEPY = ['.ohssssssssssho.', '.ohseesssseesho.'];
const FACE = ['.ohpsssmmssspho.', '..ohssssssssho..'], OPEN = ['.ohpsssmmssspho.', '..ohsssmmsssho..'];
const BODY = ['...oowwrrwwoo...', '..osdddrrdddso..', '..osddddddddso..'];
const FRAMES = {
  walk1: [...HEAD, ...EYES, ...FACE, ...BODY, '...oddddddddo...', '....os....so....', '...off....ffo...'],
  walk2: [...HEAD, ...EYES, ...FACE, ...BODY, '...oddddddddo...', '......osso......', '.....offffo.....'],
  sit: [...HEAD, ...SLEEPY, ...FACE, ...BODY, '..oddddddddddo..', '....os....so....', '....ff....ff....'],
  dangle: [...HEAD, ...EYES, ...OPEN, '.s.oowwrrwwoo.s.', '.so.dddrrddd.os.', '...oddddddddo...', '...oddddddddo...', '.....os..so.....', '.....of..fo.....'],
};

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

// A frame as one rect per run of same-coloured pixels.
function frame(rows) {
  const g = svg('g', {});
  rows.forEach((row, y) => row.replace(/(.)\1*/g, (run, c, x) => { if (INK[c]) g.append(svg('rect', { x, y, width: run.length, height: 1, fill: INK[c] })); return run; }));
  return g;
}

export function sprite(name = 'sit') {
  const s = svg('svg', { viewBox: '0 0 16 16', 'shape-rendering': 'crispEdges', 'aria-hidden': 'true' });
  for (const k in FRAMES) { const g = frame(FRAMES[k]); g.dataset.f = k; g.style.display = k === name ? '' : 'none'; s.append(g); }
  return s;
}

// ---------- On the desktop ----------

function bounds() {
  const tb = document.getElementById('taskbar').getBoundingClientRect();
  const w = activeWindow();
  const bar = w && w.state !== 'min' && !/gadget/.test(w.opts.className || '') && w.bar.getBoundingClientRect();
  return {
    right: innerWidth - SW,
    floor: tb.height && tb.top > innerHeight / 2 ? tb.top : innerHeight,
    // A maximized window's bar is at the top of the screen, with no room above it to sit.
    perch: bar && bar.width && bar.top >= SW ? { l: bar.left, r: bar.right, top: bar.top } : null,
    still: reducedMotion.matches,
  };
}

export function mascot() {
  const pic = sprite();
  const el = h('div', { class: 'mascot', role: 'img', tabindex: '0', 'aria-label': 'Desktop mascot', title: 'Drag to pick her up. Right-click to dismiss.' }, pic);
  let s = { mode: 'fall', x: innerWidth / 2 - SW / 2 | 0, y: SW, vy: 0, dir: 1, t: 0 }, n = 0, shown = 'sit';
  function draw() {
    const f = s.mode === 'drag' || s.mode === 'fall' ? 'dangle' : s.mode === 'sit' ? 'sit' : (s.mode === 'climb' ? s.x + s.y : n) >> 2 & 1 ? 'walk2' : 'walk1';
    if (f !== shown) { for (const g of pic.children) g.style.display = g.dataset.f === f ? '' : 'none'; shown = f; }
    el.style.transform = `translate(${s.x}px, ${s.y - SW}px)` + (s.dir < 0 ? ' scaleX(-1)' : '');
  }
  const timer = setInterval(() => { n++; s = step(s, bounds(), Math.random()); draw(); }, 50);
  // Held by the scruff: her head hangs from the pointer.
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const hold = e => { s = { ...s, mode: 'drag', x: e.clientX - SW / 2, y: e.clientY + SW - 4 }; draw(); };
    hold(e);
    el.onpointermove = hold;
    el.onpointerup = el.onpointercancel = () => { el.onpointermove = el.onpointerup = el.onpointercancel = null; s = { ...s, mode: 'fall', vy: 0 }; };
  });
  el.addEventListener('contextmenu', e => { e.preventDefault(); openMenu([{ label: '&Dismiss', action: close }], { x: e.clientX, y: e.clientY }); });
  el.addEventListener('keydown', e => { if (e.key === 'Delete') close(); });
  const m = { mascot: true, el, opts: {}, focus: () => el.focus(), close };
  function close() {
    clearInterval(timer);
    el.remove();
    if (m.opts.onClose) m.opts.onClose();
    if (m.opts.onClosed) m.opts.onClosed();
  }
  document.body.append(el);
  s = step(s, bounds(), 0);
  draw();
  return m;
}
