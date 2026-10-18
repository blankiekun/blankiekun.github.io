// 10 and 11's Task View (Win+Tab or the taskbar button): every window on this desktop as a
// still in a grid, under (11) or over (10) a strip of virtual desktops to switch, add or remove.
// Drag a window onto a desktop, or right-click it, to move it there.

import { h, icon } from './util.js';
import { openMenu, closeMenus } from './menu.js';
import { all, focus, close, still, desks, switchDesk, addDesk, removeDesk, moveToDesk, onDeskChange } from './wm.js';

let tv = null;

// The column count that shows n windows of aspect a (width / height) largest in W x H.
export function fitGrid(n, W, H, a) {
  let best = 1, size = 0;
  for (let c = 1; c <= n; c++) {
    const s = Math.min(W / c / a, H / Math.ceil(n / c));
    if (s > size) { size = s; best = c; }
  }
  return best;
}
console.assert(fitGrid(1, 800, 600, 1.6) === 1 && fitGrid(4, 1600, 900, 1.6) === 2 && fitGrid(4, 360, 600, 1.6) === 1 && fitGrid(3, 1600, 500, 1.6) === 3, 'Task View grid fits the windows');

export function closeTaskView(w) {
  if (!tv) return;
  tv.el.remove(); tv = null;
  document.body.classList.remove('task-viewing');
  closeMenus();
  if (w) focus(w);
}

export function taskView() {
  if (tv) { closeTaskView(); return; }
  closeMenus();
  tv = { i: 0, el: h('div', { class: 'taskview', role: 'dialog', 'aria-label': 'Task View', tabindex: '-1', onclick: e => { if (!e.target.closest('.tv-card, .tv-desks')) closeTaskView(); } }) };
  document.body.append(tv.el);
  document.body.classList.add('task-viewing');
  draw();
}

function draw() {
  const { n, cur } = desks();
  tv.list = all().filter(w => w.task && w.desk === cur).reverse();
  tv.i = Math.min(tv.i, Math.max(0, tv.list.length - 1));
  // The taskbar stays usable under it, as in 10 and 11.
  tv.el.style.bottom = innerHeight - document.getElementById('taskbar').getBoundingClientRect().top + 'px';
  const strip = h('div', { class: 'tv-desks' },
    Array.from({ length: n }, (_, i) => h('div', { class: 'tv-desk' + (i === cur ? ' on' : ''), 'data-desk': i },
      h('button', { type: 'button', onclick: () => { closeTaskView(); switchDesk(i); } }, 'Desktop ' + (i + 1)),
      n > 1 && h('button', { type: 'button', class: 'tv-dx', 'aria-label': 'Close Desktop ' + (i + 1), onclick: () => removeDesk(i) }, icon('i-x')))),
    h('button', { type: 'button', class: 'tv-desk tv-new', onclick: addDesk }, '+ New desktop'));
  const grid = h('div', { class: 'tv-grid' });
  tv.el.replaceChildren(strip, grid);
  const W = grid.clientWidth, H = grid.clientHeight, stills = tv.list.map(still);
  const aspect = stills.reduce((t, { r }) => t + r.width / r.height, 0) / stills.length || 1.6;
  const cols = tv.cols = fitGrid(stills.length || 1, W, H, aspect), rows = Math.ceil(stills.length / cols);
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  tv.cards = tv.list.map((w, i) => {
    const { copy, r } = stills[i];
    // Room for the title row and the gaps.
    const s = Math.min((W / cols - 24) / r.width, (H / rows - 52) / r.height, 1);
    Object.assign(copy.style, { transform: `scale(${s})`, transformOrigin: '0 0' });
    const card = h('div', { class: 'tv-card', role: 'button', tabindex: '-1', 'aria-label': w.task.title, style: { width: r.width * s + 'px' },
      onclick: e => { if (!card.dragged && !e.target.closest('.tv-x')) closeTaskView(w); },
      oncontextmenu: e => { e.preventDefault(); menu(w, e); } },
    h('div', { class: 'tv-title' }, icon(w.opts.icon || 'i-exe'), h('span', null, w.task.title),
      h('button', { type: 'button', class: 'tv-x', 'aria-label': 'Close ' + w.task.title, onclick: () => shut(w) }, icon('i-x'))),
    h('div', { class: 'tv-view', style: { width: r.width * s + 'px', height: r.height * s + 'px' } }, copy));
    card.addEventListener('pointerdown', e => drag(w, card, e));
    return card;
  });
  grid.append(...tv.cards);
  pick(tv.i);
}

function pick(i) {
  if (!tv.cards.length) { tv.el.focus(); return; }
  tv.i = Math.max(0, Math.min(i, tv.cards.length - 1));
  tv.cards.forEach((c, j) => c.classList.toggle('on', j === tv.i));
  tv.cards[tv.i].focus({ preventScroll: true });
}

// A window that asks before closing (unsaved work) is brought out to ask.
function shut(w) {
  if (w.opts.onClose) closeTaskView(w);
  close(w).then(() => { if (tv) draw(); });
}

function menu(w, e) {
  const { n, cur } = desks();
  openMenu([
    { label: '&Move to', submenu: () => [
      ...Array.from({ length: n }, (_, i) => ({ label: 'Desktop ' + (i + 1), disabled: i === cur, action: () => moveToDesk(w, i) })),
      { label: '&New desktop', action: () => { addDesk(); moveToDesk(w, n); } }] },
    '-', { label: '&Close', action: () => shut(w) },
  ], { x: e.clientX, y: e.clientY });
}

// Dragged onto a desktop's tile, a window moves there.
function drag(w, card, e) {
  if (e.button !== 0 || e.target.closest('.tv-x')) return;
  const x0 = e.clientX, y0 = e.clientY;
  card.dragged = false;
  const move = ev => {
    if (!card.dragged && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
    card.dragged = true;
    card.classList.add('drag');
    card.style.transform = `translate(${ev.clientX - x0}px, ${ev.clientY - y0}px) scale(.6)`;
    tv.el.querySelectorAll('.tv-desk').forEach(d => d.classList.toggle('over', d === over(ev)));
  };
  const over = ev => document.elementsFromPoint(ev.clientX, ev.clientY).map(el => el.closest('.tv-desk[data-desk]')).find(Boolean);
  const up = ev => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
    if (!card.dragged) return;
    const d = ev.type === 'pointerup' && over(ev);
    if (d) moveToDesk(w, +d.dataset.desk);
    else if (tv) draw();
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
}

onDeskChange(() => { if (tv) draw(); });
addEventListener('resize', () => { if (tv) draw(); });
// Before the window manager's keys; Ctrl+Win+arrows still reach it to switch desktops.
addEventListener('keydown', e => {
  if (!tv || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('.menu')) return;
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -tv.cols, ArrowDown: tv.cols }[e.key];
  if (e.key === 'Escape') closeTaskView();
  else if (e.key === 'Enter' && tv.list.length && !e.target.closest('button')) closeTaskView(tv.list[tv.i]);
  else if (step && tv.cards.length) pick(tv.i + step);
  else return;
  e.preventDefault(); e.stopPropagation();
}, true);
// A click on the taskbar (but not the Task View button, which toggles) leaves Task View.
document.addEventListener('pointerdown', e => { if (tv && !tv.el.contains(e.target) && !e.target.closest('.tb-taskview, .menu')) closeTaskView(); }, true);
