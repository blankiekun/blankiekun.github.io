// Cascading popup menus: the Start menu, menu bars and right-click menus all use this.
//
// An item is { label: '&Open', icon, action, submenu, checked, radio, disabled, key, href }
// or '-' for a separator. `submenu` may be an array or a function returning one.

import { h, icon, accel, sound } from './util.js';
import { rename, V } from './version.js';

// Paint and WordPad wear the ribbon from 7 on.
export const hasRibbon = ['7', '8', '10', '11'].includes(V.id);

let stack = []; // open menus, outermost first: { el, items, hot, parentItem, onClose }
let rootOpts = null;

export function isOpen() { return stack.length > 0; }

export function closeMenus(reason) {
  const opts = rootOpts;
  stack.forEach(m => m.el.remove());
  stack = [];
  rootOpts = null;
  if (opts && opts.onClose) opts.onClose(reason);
}

function closeFrom(level) {
  while (stack.length > level) stack.pop().el.remove();
}

// at: { x, y } point, or { rect, below: true } to drop under/above an element.
export function openMenu(items, at, opts = {}) {
  closeMenus('replaced');
  rootOpts = opts;
  push(items, at, opts.className, opts.banner);
  sound('Menu popup');
  if (opts.focusFirst) setHot(stack[0], firstEnabled(stack[0]));
}

function itemsOf(it) { return typeof it.submenu === 'function' ? it.submenu() : it.submenu; }
function enabled(it) { return it !== '-' && !it.disabled; }
function firstEnabled(m) { return m.items.findIndex(enabled); }

function push(items, at, className, banner) {
  const level = stack.length;
  const ul = h('ul', { class: 'menu-items', role: 'menu' });
  const m = { el: null, items, hot: -1, rows: [] };
  items.forEach((it, i) => {
    if (it === '-') { ul.append(h('li', { role: 'separator' }, h('hr'))); m.rows.push(null); return; }
    const a = accel(rename(it.label));
    const row = h(it.href ? 'a' : 'div', {
      class: 'mi' + (it.className ? ' ' + it.className : ''), role: 'menuitem', tabindex: '-1',
      'aria-disabled': it.disabled ? 'true' : null,
      'aria-haspopup': it.submenu ? 'menu' : null,
      href: it.href || null, target: it.href ? '_blank' : null, rel: it.href ? 'noopener' : null,
    });
    const ic = h('span', { class: 'ic' });
    if (it.img) ic.append(h('img', { src: it.img, alt: '', width: 32, height: 32 }));
    else if (it.icon) ic.append(icon(it.icon));
    else if (it.checked) ic.append(h('span', { class: 'chk ' + (it.radio ? 'dot' : 'tick') }));
    row.append(ic, h('span', { class: 'lbl', html: a.html + (it.sub ? `<small>${it.sub}</small>` : '') }),
      h('span', { class: 'key' }, it.key || ''), it.submenu ? h('span', { class: 'sub' }) : h('span'));
    row.addEventListener('pointerenter', () => hover(level, i));
    row.addEventListener('click', e => { if (!it.href) e.preventDefault(); activate(level, i, true); });
    m.rows.push(row);
    ul.append(h('li', { role: 'none' }, row));
  });

  const el = h('div', { class: 'menu' + (className ? ' ' + className : '') });
  if (banner) el.append(banner.cloneNode(true));
  el.append(ul);
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('pointerdown', e => e.stopPropagation());
  m.el = el;
  document.body.append(el);
  stack.push(m);
  place(el, at);
  return m;
}

function place(el, at) {
  const W = innerWidth, H = innerHeight;
  const r = el.getBoundingClientRect();
  let x, y;
  if (at.rect && at.side) {          // submenu: to the right of the item, flip left if needed
    x = at.rect.right - 3; y = at.rect.top - 3;
    if (x + r.width > W) x = Math.max(0, at.rect.left - r.width + 3);
    if (y + r.height > H) y = Math.max(0, H - r.height);
  } else if (at.rect) {              // dropdown: below the button, or above it near the bottom
    x = at.rect.left; y = at.above ? at.rect.top - r.height : at.rect.bottom;
    if (y + r.height > H) y = Math.max(0, at.rect.top - r.height);
    if (x + r.width > W) x = Math.max(0, W - r.width);
  } else {
    x = at.x; y = at.y;
    if (x + r.width > W) x = Math.max(0, x - r.width);
    if (y + r.height > H) y = Math.max(0, H - r.height);
  }
  el.style.left = Math.round(x) + 'px';
  el.style.top = Math.round(y) + 'px';
}

let hoverTimer;
function hover(level, i) {
  const m = stack[level];
  if (!m) return;
  setHot(m, i);
  clearTimeout(hoverTimer);
  const it = m.items[i];
  // Win95 opens submenus after a short pause and closes stale ones the same way.
  hoverTimer = setTimeout(() => {
    if (stack[level] !== m || m.hot !== i) return;
    if (it.submenu && !it.disabled) {
      if (!(stack[level + 1] && stack[level + 1].parentIndex === i)) openSub(level, i);
    } else closeFrom(level + 1);
  }, 180);
}

function setHot(m, i) {
  m.rows.forEach((r, j) => r && r.classList.toggle('hot', j === i));
  m.hot = i;
  if (m.rows[i]) m.rows[i].focus({ preventScroll: true });
}

function openSub(level, i, focus) {
  closeFrom(level + 1);
  const m = stack[level];
  const sub = push(itemsOf(m.items[i]), { rect: m.rows[i].getBoundingClientRect(), side: true });
  sub.parentIndex = i;
  if (focus) setHot(sub, firstEnabled(sub));
  else setHot(m, i);
}

function activate(level, i, fromMouse) {
  const m = stack[level];
  const it = m && m.items[i];
  if (!it || it.disabled) return;
  if (it.submenu) { clearTimeout(hoverTimer); openSub(level, i, !fromMouse); return; }
  closeMenus('chosen');
  if (it.action) it.action();
}

document.addEventListener('pointerdown', () => { if (stack.length) closeMenus('outside'); });
window.addEventListener('blur', () => { if (stack.length) closeMenus('outside'); });
window.addEventListener('resize', () => { if (stack.length) closeMenus('outside'); });

document.addEventListener('keydown', e => {
  if (!stack.length) return;
  const level = stack.length - 1;
  const m = stack[level];
  const n = m.items.length;
  const step = d => {
    let i = m.hot;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (enabled(m.items[i])) return setHot(m, i); }
  };
  switch (e.key) {
    case 'ArrowDown': step(1); break;
    case 'ArrowUp': step(-1); break;
    case 'ArrowRight':
      if (m.hot >= 0 && m.items[m.hot].submenu) openSub(level, m.hot, true);
      else if (rootOpts && rootOpts.onArrow) rootOpts.onArrow(1);
      break;
    case 'ArrowLeft':
      if (level > 0) { closeFrom(level); setHot(stack[level - 1], stack[level - 1].hot); }
      else if (rootOpts && rootOpts.onArrow) rootOpts.onArrow(-1);
      break;
    case 'Enter': case ' ': if (m.hot >= 0) activate(level, m.hot); break;
    case 'Escape':
      if (level > 0) { closeFrom(level); setHot(stack[level - 1], stack[level - 1].hot); }
      else closeMenus('escape');
      break;
    case 'Tab': closeMenus('escape'); return;
    default: {
      const k = e.key.toLowerCase();
      const i = m.items.findIndex(it => it !== '-' && accel(rename(it.label)).key === k);
      if (i < 0) return;
      setHot(m, i); activate(level, i);
    }
  }
  e.preventDefault();
  e.stopPropagation();
}, true);

// A window's menu bar. spec: [{ label: '&File', items: [...] | () => [...] }]
export function menubar(spec) {
  const bar = h('div', { class: 'menubar', role: 'menubar' });
  const btns = spec.map((top, i) => {
    const b = h('button', { type: 'button', role: 'menuitem', 'aria-haspopup': 'menu', html: accel(top.label).html });
    b.addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (b.classList.contains('open')) { closeMenus('toggle'); return; }
      open(i, false);
    });
    b.addEventListener('pointerenter', () => { if (bar.querySelector('.open') && !b.classList.contains('open')) open(i, false); });
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); open(i, true); } });
    return b;
  });
  function open(i, focusFirst) {
    const b = btns[i];
    const items = typeof spec[i].items === 'function' ? spec[i].items() : spec[i].items;
    openMenu(items, { rect: b.getBoundingClientRect() }, {
      focusFirst,
      onClose: () => b.classList.remove('open'),
      onArrow: d => open((i + d + btns.length) % btns.length, true),
    });
    b.classList.add('open');
  }
  bar.append(...btns);
  bar.openByKey = k => {
    const i = spec.findIndex(t => accel(t.label).key === k);
    if (i >= 0) { open(i, true); return true; }
    return false;
  };
  return bar;
}

// Windows 7's ribbon in place of a menu bar. The first menu drops from the blue app
// button, each tab holds groups of the app's own controls, and Alt+letter still opens
// the old menus under the ribbon so nothing goes out of reach.
// tabs: [{ label, groups: [[label, ...nodes]] }]
export function ribbon(spec, tabs) {
  const app = h('button', { type: 'button', class: 'rb-app', 'aria-haspopup': 'menu', 'aria-label': spec[0].label.replace('&', ''), title: spec[0].label.replace('&', '') });
  const strip = h('div', { class: 'rb-tabs', role: 'tablist' }, app);
  const panels = tabs.map(t => h('div', { class: 'rb-panel', role: 'tabpanel', hidden: true },
    ...t.groups.map(([label, ...kids]) => h('div', { class: 'rb-group', role: 'group', 'aria-label': label },
      h('div', { class: 'rb-gbody' }, ...kids), h('div', { class: 'rb-glabel' }, label)))));
  const tabBtns = tabs.map((t, i) => {
    const b = h('button', { type: 'button', class: 'rb-tab', role: 'tab' }, t.label);
    b.addEventListener('click', () => show(i));
    b.addEventListener('dblclick', () => bar.classList.toggle('min'));
    return b;
  });
  strip.append(...tabBtns);
  const bar = h('div', { class: 'ribbon' }, strip, ...panels);
  function show(i) {
    bar.classList.remove('min');
    tabBtns.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
    panels.forEach((p, j) => { p.hidden = i !== j; });
  }
  function open(i) {
    const items = typeof spec[i].items === 'function' ? spec[i].items() : spec[i].items;
    openMenu(items, { rect: (i ? bar : app).getBoundingClientRect() }, { focusFirst: true, onClose: () => app.classList.remove('open') });
    if (!i) app.classList.add('open');
  }
  app.addEventListener('pointerdown', e => {
    e.stopPropagation();
    if (app.classList.contains('open')) closeMenus('toggle'); else open(0);
  });
  app.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); open(0); } });
  bar.openByKey = k => {
    const i = spec.findIndex(t => accel(t.label).key === k);
    if (i >= 0) open(i);
    return i >= 0;
  };
  show(0);
  return bar;
}

// A ribbon button: big ones stack a 32px picture over the label, small ones sit in rows.
// glyph is an icon id (i-...) or SVG markup.
export function rbtn(label, glyph, action, big) {
  const b = h('button', { type: 'button', class: 'rb-btn' + (big ? ' big' : ''), title: label });
  const pic = h('span', { class: 'rb-pic' });
  if (glyph.startsWith('i-')) pic.append(icon(glyph)); else pic.innerHTML = glyph;
  b.append(pic, h('span', { class: 'rb-lbl' }, label));
  b.addEventListener('mousedown', e => e.preventDefault());   // leave the caret where it was
  b.addEventListener('click', e => action(e, b));
  return b;
}
