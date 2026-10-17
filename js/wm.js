// The window manager: overlapping windows, focus and z-order, outline dragging and
// resizing, minimize/maximize/close, taskbar buttons, and the URL hash.

import { h, icon, clamp, small, reducedMotion, sound } from './util.js';
import { closeMenus, openMenu } from './menu.js';
import { rename } from './version.js';

const layer = document.getElementById('windows');
const tasks = document.getElementById('tasks');
const apps = new Map();
const wins = [];            // bottom to top
let active = null;
let cascade = 0;
let routeListener = null;
let busyTimer = 0;

export function register(app) { apps.set(app.id, app); }
export function appInfo(id) { return apps.get(id); }
export function onRouteChange(fn) { routeListener = fn; }
export function all() { return wins.slice(); }
export function find(pred) { return wins.find(pred); }
export function activeWindow() { return active; }

export function launch(id, arg) {
  const app = apps.get(id);
  if (!app) return null;
  if (app.single) {
    const w = wins.find(w => w.app === id);
    if (w) { if (app.reopen) app.reopen(w, arg); focus(w); return w; }
  }
  // The arrow-and-hourglass while a program "loads".
  document.body.classList.add('busy');
  clearTimeout(busyTimer);
  busyTimer = setTimeout(() => document.body.classList.remove('busy'), 300);
  sound('Open program');
  return app.open(arg);
}

function area() { return layer.getBoundingClientRect(); }

export function createWindow(o) {
  o.title = rename(o.title);
  const resizable = o.resizable !== false;
  const win = {
    app: o.app || null, opts: o, state: 'normal', route: o.route || null,
    minW: o.minW || 160, minH: o.minH || 90,
  };

  const title = h('span', { class: 't' }, o.title);
  const ic = o.icon ? icon(o.icon) : null;
  const btns = h('div', { class: 'tbtns' });
  const maxBtn = h('button', { class: 'tbtn', type: 'button', 'aria-label': 'Maximize', disabled: o.maximizable === false || !resizable }, icon('i-max'));
  if (!o.dialog) {
    btns.append(
      h('button', { class: 'tbtn', type: 'button', 'aria-label': 'Minimize', onclick: () => minimize(win) }, icon('i-min')),
      maxBtn,
    );
    maxBtn.addEventListener('click', () => toggleMax(win));
  } else if (o.help) {
    btns.append(h('button', { class: 'tbtn help', type: 'button', 'aria-label': 'Help', onclick: o.help }, '?'));
  }
  btns.append(h('button', { class: 'tbtn x', type: 'button', 'aria-label': 'Close', onclick: () => close(win) }, icon('i-x')));

  const bar = h('div', { class: 'titlebar' }, ic, title, btns);
  // The icon is the system menu; double-clicking it closes the window.
  if (ic) {
    ic.classList.add('sysicon');
    ic.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      focus(win);
      if (Date.now() - (win.sysAt || 0) < 400) { closeMenus('dbl'); close(win); return; }
      win.sysAt = Date.now();
      systemMenu(win, { rect: bar.getBoundingClientRect(), left: true });
    });
  }
  bar.addEventListener('contextmenu', e => {
    if (e.target.closest('.tbtn')) return;
    e.preventDefault();
    focus(win);
    systemMenu(win, { x: e.clientX, y: e.clientY });
  });
  const body = h('div', { class: 'win-body' });
  if (o.body) body.append(o.body);
  const el = h('section', {
    class: 'win' + (o.dialog ? ' dialog' : '') + (o.className ? ' ' + o.className : '') + (o.width === 'auto' ? ' autosize' : ''),
    'aria-label': o.title, tabindex: '-1',
  }, bar, body);

  if (resizable) for (const d of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const g = h('div', { class: 'resize ' + d });
    g.addEventListener('pointerdown', e => outlineDrag(win, e, d));
    el.append(g);
  }

  Object.assign(win, {
    el, body, bar, maxBtn,
    setTitle(t) { t = rename(t); title.textContent = t; el.setAttribute('aria-label', t); if (win.task) { win.task.querySelector('span').textContent = t; win.task.title = t; } },
    setIcon(id) { bar.querySelector('use').setAttribute('href', '#' + id); if (win.task) win.task.querySelector('use').setAttribute('href', '#' + id); },
    setRoute(r) { win.route = r; if (active === win) syncRoute(); },
    close: force => close(win, force),
    focus: () => focus(win),
    fit: () => fit(win),
    center: () => center(win),
  });

  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('.tbtn')) return;
    outlineDrag(win, e, 'move');
  });
  bar.addEventListener('dblclick', e => { if (!e.target.closest('.tbtn') && !maxBtn.disabled && !o.dialog) toggleMax(win); });
  el.addEventListener('pointerdown', e => {
    if (win.modal) { e.preventDefault(); e.stopPropagation(); focus(win.modal); flash(win.modal); sound('Default sound'); return; }
    if (active !== win) focus(win);
  }, true);

  // Size and place.
  layer.append(el);
  const A = area();
  if (o.width !== 'auto') el.style.width = Math.min(o.width || 480, A.width) + 'px';
  if (o.height && o.height !== 'auto') el.style.height = Math.min(o.height, A.height) + 'px';
  const r = el.getBoundingClientRect();
  let x, y;
  if (o.parent && !o.parent.el.classList.contains('min')) {
    const p = o.parent.el.getBoundingClientRect();
    x = p.left - A.left + (p.width - r.width) / 2;
    y = p.top - A.top + (p.height - r.height) / 2;
  } else if (o.center || o.dialog) {
    x = (A.width - r.width) / 2; y = (A.height - r.height) / 2.4;
  } else if (o.x != null) {
    x = o.x; y = o.y;
  } else {
    const step = 26, n = cascade++ % 8;
    x = 40 + n * step + (A.width > 900 ? 90 : 0); y = 16 + n * step;
    if (x + r.width > A.width) x = Math.max(0, A.width - r.width - 8);
    if (y + r.height > A.height) y = Math.max(0, A.height - r.height - 8);
  }
  el.style.left = Math.round(Math.max(0, x)) + 'px';
  el.style.top = Math.round(Math.max(0, y)) + 'px';

  if (o.taskbar !== false) {
    win.task = h('button', { class: 'task', type: 'button', title: o.title }, icon(o.icon || 'i-exe'), h('span', null, o.title));
    win.task.addEventListener('click', () => {
      if (active === win && win.state !== 'min') minimize(win);
      else focus(win);
    });
    win.task.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      if (win.state !== 'min') focus(win);
      systemMenu(win, { x: e.clientX, y: e.clientY });
    });
    tasks.append(win.task);
  }

  if (o.parent && o.modal !== false && o.dialog) o.parent.modal = win;
  wins.push(win);
  if ((small.matches && !o.dialog) || o.maximized) maximize(win);
  focus(win);
  el.classList.add('opening');
  el.addEventListener('animationend', () => el.classList.remove('opening'), { once: true });
  return win;
}

function restack() {
  wins.forEach((w, i) => { w.el.style.zIndex = 10 + i; });
}

export function focus(win) {
  if (!win || !wins.includes(win)) return;
  if (win.modal && wins.includes(win.modal)) { focus(win.modal); return; }
  if (win.state === 'min') {
    win.el.classList.remove('min');
    win.state = win.wasMax ? 'max' : 'normal';
    zoom(win, false);
  }
  wins.splice(wins.indexOf(win), 1);
  wins.push(win);
  // Dialogs stay above the window that owns them.
  for (const w of wins.slice()) if (w.opts.parent === win && wins.includes(w)) { wins.splice(wins.indexOf(w), 1); wins.push(w); }
  restack();
  if (active !== win) {
    if (active && active.opts.onBlur) active.opts.onBlur();
    active = win;
  }
  wins.forEach(w => {
    w.el.classList.toggle('active', w === win);
    if (w.task) w.task.classList.toggle('on', w === win);
  });
  if (!win.el.contains(document.activeElement)) {
    const f = win.opts.autofocus ? win.el.querySelector(win.opts.autofocus) : null;
    (f || win.el).focus({ preventScroll: true });
  }
  if (win.opts.onFocus) win.opts.onFocus();
  syncRoute();
}

function flash(win) {
  let n = 0;
  const t = setInterval(() => {
    win.el.classList.toggle('active', n % 2 === 1);
    if (++n > 5) { clearInterval(t); win.el.classList.add('active'); }
  }, 70);
}

function topVisible() {
  for (let i = wins.length - 1; i >= 0; i--) if (wins[i].state !== 'min') return wins[i];
  return null;
}

function blurAll() {
  if (active && active.opts.onBlur) active.opts.onBlur();
  active = null;
  wins.forEach(w => { w.el.classList.remove('active'); if (w.task) w.task.classList.remove('on'); });
  syncRoute();
}

// Like Windows 95, a title bar flies between the window and its taskbar button.
function zoom(win, down) {
  if (reducedMotion.matches || !win.task) return;
  const at = q => ({ left: q.left + 'px', top: q.top + 'px', width: q.width + 'px', height: q.height + 'px' });
  const frames = [at(win.bar.getBoundingClientRect()), at(win.task.getBoundingClientRect())];
  if (!down) { frames.reverse(); win.el.classList.add('zooming'); }
  const box = h('div', { class: 'zoom-caption' });
  document.body.append(box);
  box.animate(frames, 200).onfinish = () => { box.remove(); win.el.classList.remove('zooming'); };
}

export function minimize(win) {
  zoom(win, true);
  sound('Minimize');
  win.wasMax = win.state === 'max';
  win.state = 'min';
  win.el.classList.add('min');
  const next = topVisible();
  if (next) focus(next); else blurAll();
}

export function maximize(win) {
  win.state = 'max';
  win.el.classList.add('max');
  win.maxBtn.querySelector('use').setAttribute('href', '#i-restore');
  win.maxBtn.setAttribute('aria-label', 'Restore');
  if (win.opts.onResize) win.opts.onResize();
}

export function restore(win) {
  if (small.matches && !win.opts.dialog) return;
  win.state = 'normal';
  win.el.classList.remove('max');
  win.maxBtn.querySelector('use').setAttribute('href', '#i-max');
  win.maxBtn.setAttribute('aria-label', 'Maximize');
  fit(win);
  if (win.opts.onResize) win.opts.onResize();
}

export function toggleMax(win) {
  if (win.state === 'max') restore(win); else { maximize(win); sound('Maximize'); }
}

export async function close(win, force) {
  if (!wins.includes(win)) return;
  if (!force && win.opts.onClose) {
    const ok = await win.opts.onClose();
    if (ok === false) return;
  }
  if (!wins.includes(win)) return;
  for (const w of wins.filter(w => w.opts.parent === win)) close(w, true);
  wins.splice(wins.indexOf(win), 1);
  if (win.opts.parent && win.opts.parent.modal === win) win.opts.parent.modal = null;
  win.el.remove();
  if (win.task) { win.task.remove(); sound('Close program'); }
  if (win.opts.onClosed) win.opts.onClosed();
  if (active === win) {
    active = null;
    const parent = win.opts.parent && wins.includes(win.opts.parent) ? win.opts.parent : null;
    const next = parent && parent.state !== 'min' ? parent : topVisible();
    if (next) focus(next); else blurAll();
  }
}

// Keep at least the title bar on screen.
function fit(win) {
  if (win.state === 'max') return;
  const A = area();
  const el = win.el;
  let w = el.offsetWidth, hgt = el.offsetHeight;
  if (win.opts.width !== 'auto' && w > A.width) { el.style.width = A.width + 'px'; w = A.width; }
  if (win.opts.height && win.opts.height !== 'auto' && hgt > A.height) { el.style.height = A.height + 'px'; hgt = A.height; }
  const x = clamp(el.offsetLeft, Math.min(0, -w + 60), Math.max(0, A.width - 60));
  const y = clamp(el.offsetTop, 0, Math.max(0, A.height - 24));
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

function center(win) {
  const A = area();
  win.el.style.left = Math.max(0, Math.round((A.width - win.el.offsetWidth) / 2)) + 'px';
  win.el.style.top = Math.max(0, Math.round((A.height - win.el.offsetHeight) / 2.4)) + 'px';
}

// Moving and resizing draw a dithered outline that follows the pointer;
// the window itself only jumps there when the button is released.
function outlineDrag(win, e, mode) {
  if (e.button !== 0 || (small.matches && !win.opts.dialog)) return;
  // A maximized window can't be moved or sized, as in Windows 95.
  if (win.state === 'max') return;
  closeMenus('drag');
  const target = e.currentTarget;
  const A = area();
  const r = win.el.getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY;
  const box = { x: r.left, y: r.top, w: r.width, h: r.height };
  let outline = null, drawn = -Infinity, snap = false;
  // Dragging to the top edge offers to maximize, as later Windows does.
  const canSnap = mode === 'move' && !win.opts.dialog && !win.maxBtn.disabled;
  const id = e.pointerId;
  try { target.setPointerCapture(id); } catch {}
  if (mode !== 'move') e.preventDefault();

  const cursor = mode === 'move' ? '' : getComputedStyle(target).cursor;

  function move(ev) {
    if (ev.pointerId !== id) return;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!outline) {
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      outline = h('div', { class: 'drag-outline' });
      document.body.append(outline);
      document.body.classList.add('dragging');
      document.body.style.cursor = cursor;
    }
    if (mode === 'move') {
      box.x = clamp(r.left + dx, A.left - r.width + 40, A.right - 40);
      box.y = clamp(r.top + dy, A.top, A.bottom - 20);
      const was = snap;
      snap = canSnap && ev.clientY <= A.top + 2;
      if (snap !== was) { outline.classList.toggle('snap', snap); drawn = -Infinity; }
    } else {
      const minW = win.minW, minH = win.minH;
      let { left, top, right, bottom } = r;
      if (mode.includes('e')) right = clamp(r.right + dx, r.left + minW, A.right);
      if (mode.includes('s')) bottom = clamp(r.bottom + dy, r.top + minH, A.bottom);
      if (mode.includes('w')) left = clamp(r.left + dx, A.left, r.right - minW);
      if (mode.includes('n')) top = clamp(r.top + dy, A.top, r.bottom - minH);
      Object.assign(box, { x: left, y: top, w: right - left, h: bottom - top });
    }
    // The real XOR rectangle couldn't keep up with the mouse, so redraw in steps.
    if (ev.timeStamp - drawn < 70) return;
    drawn = ev.timeStamp;
    draw();
  }
  function draw() {
    if (snap) { Object.assign(outline.style, { left: A.left + 'px', top: A.top + 'px', width: A.width + 'px', height: A.height + 'px' }); return; }
    Object.assign(outline.style, { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px' });
  }
  function end(ev, cancel) {
    if (ev && ev.pointerId !== id) return;
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', cancelUp);
    document.removeEventListener('keydown', esc, true);
    try { target.releasePointerCapture(id); } catch {}
    if (!outline) return;
    outline.remove();
    document.body.classList.remove('dragging');
    document.body.style.cursor = '';
    if (cancel) return;
    if (snap) { maximize(win); sound('Maximize'); return; }
    win.el.style.left = Math.round(box.x - A.left) + 'px';
    win.el.style.top = Math.round(box.y - A.top) + 'px';
    if (mode !== 'move') {
      win.el.style.width = Math.round(box.w) + 'px';
      win.el.style.height = Math.round(box.h) + 'px';
      if (win.opts.onResize) win.opts.onResize();
    }
  }
  const up = ev => end(ev, false);
  const cancelUp = ev => end(ev, true);
  const esc = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(null, true); } };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', cancelUp);
  document.addEventListener('keydown', esc, true);
}

// Clicking into an iframe doesn't bubble out, so watch for the page losing focus to one.
window.addEventListener('blur', () => setTimeout(() => {
  const f = document.activeElement;
  if (f && f.tagName === 'IFRAME') {
    const w = wins.find(w => w.el.contains(f));
    if (w && w !== active) focus(w);
  }
}));

function onViewport() {
  wins.forEach(w => {
    if (small.matches && !w.opts.dialog && w.state === 'normal') maximize(w);
    else if (w.state !== 'max') fit(w);
    if (w.opts.onResize) w.opts.onResize();
  });
}
window.addEventListener('resize', onViewport);
small.addEventListener('change', onViewport);

function syncRoute() {
  const r = active && active.route ? (typeof active.route === 'function' ? active.route() : active.route) : '';
  const want = r ? '#' + r : '';
  if (location.hash !== want && !(want === '' && location.hash === '#')) {
    history.replaceState(null, '', want || location.pathname + location.search);
  }
  if (routeListener) routeListener(r);
}

// ---------- the system menu ----------

export function systemMenu(win, at) {
  const o = win.opts;
  const resizable = o.resizable !== false && !o.dialog;
  const normal = win.state === 'normal';
  const items = o.dialog
    ? [{ label: '&Move', action: () => keyMove(win, 'move') }, '-', { label: '&Close', key: 'Alt+F4', className: 'bold', action: () => close(win) }]
    : [
      { label: '&Restore', disabled: normal, action: () => win.state === 'min' ? focus(win) : restore(win) },
      { label: '&Move', disabled: !normal, action: () => keyMove(win, 'move') },
      { label: '&Size', disabled: !normal || !resizable, action: () => keyMove(win, 'size') },
      { label: 'Mi&nimize', disabled: win.state === 'min', action: () => minimize(win) },
      { label: 'Ma&ximize', disabled: win.state === 'max' || win.maxBtn.disabled, action: () => { if (win.state === 'min') focus(win); maximize(win); } },
      '-',
      { label: '&Close', key: 'Alt+F4', className: 'bold', action: () => close(win) },
    ];
  openMenu(items, at.rect ? { rect: { left: at.rect.left + 2, right: at.rect.left + 2, top: at.rect.top, bottom: at.rect.bottom } } : at, { focusFirst: !at.x });
}

// Move and Size from the system menu: the outline follows the arrow keys (or the
// mouse), Enter puts the window there and Esc gives up, like the original.
function keyMove(win, mode) {
  const A = area();
  const r = win.el.getBoundingClientRect();
  const box = { x: r.left, y: r.top, w: r.width, h: r.height };
  const outline = h('div', { class: 'drag-outline' });
  document.body.append(outline);
  const draw = () => Object.assign(outline.style, { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px' });
  draw();
  document.body.style.cursor = mode === 'move' ? 'var(--move)' : 'var(--nwse)';
  let mx = null, my = null;
  function end(ok) {
    document.removeEventListener('keydown', key, true);
    document.removeEventListener('pointermove', pm, true);
    document.removeEventListener('pointerdown', pd, true);
    outline.remove();
    document.body.style.cursor = '';
    if (!ok) return;
    win.el.style.left = Math.round(box.x - A.left) + 'px';
    win.el.style.top = Math.round(box.y - A.top) + 'px';
    if (mode === 'size') {
      win.el.style.width = Math.round(box.w) + 'px';
      win.el.style.height = Math.round(box.h) + 'px';
      if (win.opts.onResize) win.opts.onResize();
    }
  }
  function nudge(dx, dy) {
    if (mode === 'move') {
      box.x = clamp(box.x + dx, A.left - box.w + 40, A.right - 40);
      box.y = clamp(box.y + dy, A.top, A.bottom - 20);
    } else {
      box.w = clamp(box.w + dx, win.minW, A.right - box.x);
      box.h = clamp(box.h + dy, win.minH, A.bottom - box.y);
    }
    draw();
  }
  function key(e) {
    const d = e.ctrlKey ? 1 : 8;
    const k = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (k) nudge(...k);
    else if (e.key === 'Enter') end(true);
    else if (e.key === 'Escape') end(false);
    else return;
    e.preventDefault(); e.stopPropagation();
  }
  function pm(e) { if (mx != null) nudge(e.clientX - mx, e.clientY - my); mx = e.clientX; my = e.clientY; }
  function pd(e) { e.preventDefault(); e.stopPropagation(); end(true); }
  // Wait for the menu click to finish before listening.
  setTimeout(() => {
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointermove', pm, true);
    document.addEventListener('pointerdown', pd, true);
  });
}

// ---------- arranging: the taskbar's right-click menu ----------

const arrangeable = () => wins.filter(w => w.state !== 'min' && !w.opts.dialog && w.opts.resizable !== false);
let undoArrange = null;

function remember(list, label) {
  const saved = list.map(w => ({ w, state: w.state, wasMax: w.wasMax, left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height }));
  undoArrange = { label, run() {
    for (const s of saved) {
      if (!wins.includes(s.w)) continue;
      if (s.state === 'min') { if (s.w.state !== 'min') minimize(s.w); continue; }
      if (s.w.state === 'min') focus(s.w);
      Object.assign(s.w.el.style, { left: s.left, top: s.top, width: s.width, height: s.height });
      if (s.state === 'max' && s.w.state !== 'max') maximize(s.w);
      else if (s.state !== 'max' && s.w.state === 'max') restore(s.w);
    }
    undoArrange = null;
  } };
}
export function undoLabel() { return undoArrange && undoArrange.label; }
export function undo() { if (undoArrange) undoArrange.run(); }

export function cascadeAll() {
  const list = arrangeable();
  if (!list.length) return;
  remember(list, '&Undo Cascade');
  const A = area();
  list.forEach((w, i) => {
    if (w.state === 'max') restore(w);
    const W = Math.min(A.width * 0.6, Math.max(320, A.width - list.length * 24)), H = Math.min(A.height * 0.7, Math.max(220, A.height - list.length * 24));
    Object.assign(w.el.style, { left: i * 24 + 'px', top: i * 24 + 'px', width: Math.round(W) + 'px', height: Math.round(H) + 'px' });
    focus(w);
    if (w.opts.onResize) w.opts.onResize();
  });
}

// Tile Vertically puts windows side by side, Horizontally stacks them; past three
// windows they go in a grid.
export function tile(vertical) {
  const list = arrangeable();
  if (!list.length) return;
  remember(list, '&Undo Tile');
  const A = area();
  const n = list.length;
  const lines = n <= 3 ? n : Math.ceil(Math.sqrt(n));
  const groups = Array.from({ length: lines }, () => []);
  list.forEach((w, i) => groups[Math.floor(i * lines / n)].push(w));
  groups.forEach((g, L) => g.forEach((w, k) => {
    if (w.state === 'max') restore(w);
    const along = vertical ? A.width / lines : A.height / lines, across = (vertical ? A.height : A.width) / g.length;
    const [x, y, W, H] = vertical ? [L * along, k * across, along, across] : [k * across, L * along, across, along];
    Object.assign(w.el.style, { left: Math.round(x) + 'px', top: Math.round(y) + 'px', width: Math.round(W) + 'px', height: Math.round(H) + 'px' });
    if (w.opts.onResize) w.opts.onResize();
  }));
}

export function minimizeAll() {
  const list = wins.filter(w => w.state !== 'min' && w.task);
  if (!list.length) return;
  remember(list, '&Undo Minimize All');
  for (const w of list) { w.wasMax = w.state === 'max'; w.state = 'min'; w.el.classList.add('min'); }
  blurAll();
}

// Clicking empty desktop deactivates windows, like Windows does.
export function deactivate() { blurAll(); }

// ---------- Alt+Tab and Alt+Space ----------
// Alt+Tab steps through a box of icons while Alt is held and switches on release.
// shortcut: the browser or OS keeps Alt+Tab for itself on most systems, so Alt+` does the same.
let sw = null;
function drawSwitch() {
  sw.el.replaceChildren(
    h('div', { class: 'alttab-icons' }, ...sw.list.map((w, i) => h('span', { class: i === sw.i ? 'on' : '' }, icon(w.opts.icon || 'i-exe')))),
    h('div', { class: 'alttab-t' }, sw.list[sw.i].task.title));
}
function endSwitch(ok) {
  const w = sw.list[sw.i];
  sw.el.remove(); sw = null;
  if (ok) focus(w);
}
document.addEventListener('keydown', e => {
  if (e.altKey && (e.key === 'Tab' || e.code === 'Backquote')) {
    const list = wins.filter(w => w.task).reverse();
    if (!list.length) return;
    e.preventDefault();
    closeMenus();
    if (!sw) { sw = { list, i: 0, el: h('div', { class: 'alttab', role: 'status' }) }; document.body.append(sw.el); }
    sw.i = (sw.i + (e.shiftKey ? -1 : 1) + sw.list.length) % sw.list.length;
    drawSwitch();
  } else if (sw && e.key === 'Escape') {
    e.preventDefault(); endSwitch(false);
  } else if (e.altKey && e.code === 'Space' && active) {
    e.preventDefault();
    systemMenu(active, { rect: active.el.querySelector('.titlebar').getBoundingClientRect(), left: true });
  }
}, true);
document.addEventListener('keyup', e => { if (sw && e.key === 'Alt') endSwitch(true); }, true);
addEventListener('blur', () => { if (sw) endSwitch(false); });
