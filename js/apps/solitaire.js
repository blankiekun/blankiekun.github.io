// Solitaire (Klondike), with standard scoring and the bouncing cards at the end.

import { h, store, reducedMotion } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';

const SUITS = ['♣', '♦', '♥', '♠'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const red = s => s === 1 || s === 2;
const BACKS = { weave: 'Blue weave', bricks: 'Red bricks', fish: 'Ocean' };
const PREFS = 'w95.sol.prefs';

// Pip positions as fractions of the card's face, for 1-10.
const PIPS = {
  1: [[.5, .5]], 2: [[.5, .2], [.5, .8]], 3: [[.5, .2], [.5, .5], [.5, .8]],
  4: [[.3, .2], [.7, .2], [.3, .8], [.7, .8]],
  5: [[.3, .2], [.7, .2], [.5, .5], [.3, .8], [.7, .8]],
  6: [[.3, .2], [.7, .2], [.3, .5], [.7, .5], [.3, .8], [.7, .8]],
  7: [[.3, .2], [.7, .2], [.5, .35], [.3, .5], [.7, .5], [.3, .8], [.7, .8]],
  8: [[.3, .2], [.7, .2], [.5, .35], [.3, .5], [.7, .5], [.5, .65], [.3, .8], [.7, .8]],
  9: [[.3, .2], [.7, .2], [.3, .4], [.7, .4], [.5, .5], [.3, .6], [.7, .6], [.3, .8], [.7, .8]],
  10: [[.3, .2], [.7, .2], [.5, .3], [.3, .4], [.7, .4], [.3, .6], [.7, .6], [.5, .7], [.3, .8], [.7, .8]],
};

function cardFace(c) {
  const sym = SUITS[c.s];
  const corner = cls => h('div', { class: 'cd-corner ' + cls }, h('b', null, RANKS[c.r]), h('i', null, sym));
  const mid = h('div', { class: 'cd-mid' });
  if (c.r <= 10) {
    for (const [x, y] of PIPS[c.r]) {
      mid.append(h('span', { class: 'cd-pip' + (y > .55 ? ' flip' : '') + (c.r === 1 ? ' ace' : ''), style: { left: x * 100 + '%', top: y * 100 + '%' } }, sym));
    }
  } else {
    mid.append(h('div', { class: 'cd-court' }, h('b', null, RANKS[c.r]), h('i', null, sym), h('b', { class: 'flip' }, RANKS[c.r])));
  }
  return h('div', { class: 'cd-front' + (red(c.s) ? ' red' : '') }, corner('tl'), mid, corner('br'));
}

function open() {
  const prefs = { draw: 1, back: 'weave', ...store.get(PREFS, {}) };
  const board = h('div', { class: 'sol-board', tabindex: '0', 'aria-label': 'Solitaire table' });
  const spacer = h('div', { class: 'sol-spacer' });
  const scoreEl = h('span', null, 'Score: 0');
  const timeEl = h('span', null, 'Time: 0');
  const status = h('div', { class: 'statusbar' }, h('span', null, ''), scoreEl, timeEl);
  const slots = {};
  let cards = [], stock, waste, found, tab, score, seconds, timer, undoSnap, cw = 71, ch = 96, gap = 8, drag = null, lastClick = { id: -1, t: 0 }, celebrating = null;

  // Empty-pile outlines.
  const slot = (key, cls) => { const el = h('div', { class: 'sol-slot ' + cls }); slots[key] = el; board.append(el); return el; };
  slot('stock', 'stock');
  for (let i = 0; i < 4; i++) slot('f' + i, 'found');
  for (let i = 0; i < 7; i++) slot('t' + i, 'tab');
  board.append(spacer);

  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) {
    const c = { id: s * 13 + r - 1, s, r, up: false };
    c.el = h('div', { class: 'cd', 'data-id': c.id, role: 'img' }, cardFace(c), h('div', { class: 'cd-back' }));
    cards.push(c);
    board.append(c.el);
  }

  function setBack() { board.dataset.back = prefs.back; }

  function deal() {
    stopCelebration();
    const deck = cards.slice();
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    deck.forEach(c => { c.up = false; });
    tab = Array.from({ length: 7 }, () => []);
    for (let i = 0; i < 7; i++) for (let j = i; j < 7; j++) tab[j].push(deck.pop());
    tab.forEach(p => { p[p.length - 1].up = true; });
    stock = deck; waste = []; found = [[], [], [], []];
    score = 0; seconds = 0; undoSnap = null;
    clearInterval(timer); timer = null;
    updateStatus();
    render();
  }

  function startClock() {
    if (timer) return;
    timer = setInterval(() => { seconds++; updateStatus(); }, 1000);
  }
  function updateStatus() {
    scoreEl.textContent = 'Score: ' + score;
    timeEl.textContent = 'Time: ' + seconds;
  }
  function addScore(n) { score = Math.max(0, score + n); updateStatus(); }

  function where(c) {
    if (stock.includes(c)) return { pile: stock, kind: 'stock' };
    if (waste.includes(c)) return { pile: waste, kind: 'waste' };
    for (let i = 0; i < 4; i++) if (found[i].includes(c)) return { pile: found[i], kind: 'found', i };
    for (let i = 0; i < 7; i++) if (tab[i].includes(c)) return { pile: tab[i], kind: 'tab', i };
    return null;
  }

  // ---------- layout ----------
  function measure() {
    const W = board.clientWidth || 560;
    cw = Math.max(34, Math.min(71, Math.floor(W / 8.1)));
    ch = Math.round(cw * 96 / 71);
    gap = Math.max(4, Math.floor((W - 7 * cw) / 8));
    board.style.setProperty('--cw', cw + 'px');
    board.style.setProperty('--ch', ch + 'px');
  }
  const colX = i => gap + i * (cw + gap);
  const rowY = () => gap * 2 + ch;
  const downStep = () => Math.max(3, Math.round(ch * 0.06));
  const upStep = () => Math.max(12, Math.round(ch * 0.22));

  function place(c, x, y, z) {
    c.el.style.left = x + 'px';
    c.el.style.top = y + 'px';
    c.el.style.zIndex = z;
    c.el.classList.toggle('up', c.up);
    c.el.setAttribute('aria-label', c.up ? RANKS[c.r] + ' of ' + ['clubs', 'diamonds', 'hearts', 'spades'][c.s] : 'face-down card');
  }

  function render() {
    measure();
    const pos = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
    pos(slots.stock, colX(0), gap);
    slots.stock.classList.toggle('done', !stock.length && !waste.length);
    for (let i = 0; i < 4; i++) pos(slots['f' + i], colX(3 + i), gap);
    for (let i = 0; i < 7; i++) pos(slots['t' + i], colX(i), rowY());
    stock.forEach((c, i) => place(c, colX(0) + Math.floor(i / 10) * 2, gap + Math.floor(i / 10) * 2, 10 + i));
    const fanFrom = prefs.draw === 3 ? Math.max(0, waste.length - 3) : waste.length;
    waste.forEach((c, i) => place(c, colX(1) + (i >= fanFrom ? (i - fanFrom) * Math.round(cw * 0.22) : 0), gap, 100 + i));
    found.forEach((p, f) => p.forEach((c, i) => place(c, colX(3 + f), gap, 200 + i)));
    let maxY = rowY() + ch;
    tab.forEach((p, t) => {
      let y = rowY();
      p.forEach((c, i) => { place(c, colX(t), y, 300 + i); maxY = Math.max(maxY, y + ch); y += c.up ? upStep() : downStep(); });
    });
    spacer.style.top = maxY + gap + 'px';
    board.classList.toggle('won', found.every(p => p.length === 13));
  }

  // ---------- moves ----------
  function snapshot() {
    const ids = p => p.map(c => c.id);
    undoSnap = { stock: ids(stock), waste: ids(waste), found: found.map(ids), tab: tab.map(ids), up: cards.map(c => c.up), score };
  }
  function undo() {
    if (!undoSnap) return;
    const get = ids => ids.map(i => cards[i]);
    stock = get(undoSnap.stock); waste = get(undoSnap.waste); found = undoSnap.found.map(get); tab = undoSnap.tab.map(get);
    cards.forEach((c, i) => { c.up = undoSnap.up[i]; });
    score = undoSnap.score;
    undoSnap = null;
    updateStatus();
    render();
  }

  function drawCards() {
    startClock();
    snapshot();
    if (!stock.length) {
      if (!waste.length) return;
      stock = waste.reverse(); waste = [];
      stock.forEach(c => { c.up = false; });
      addScore(prefs.draw === 1 ? -100 : -20);
    } else {
      for (let k = 0; k < prefs.draw && stock.length; k++) { const c = stock.pop(); c.up = true; waste.push(c); }
    }
    render();
  }

  const canTab = (c, p) => !p.length ? c.r === 13 : (p[p.length - 1].up && red(p[p.length - 1].s) !== red(c.s) && p[p.length - 1].r === c.r + 1);
  const canFound = (c, p) => !p.length ? c.r === 1 : (p[p.length - 1].s === c.s && p[p.length - 1].r === c.r - 1);

  function moveTo(group, from, toKind, toIndex) {
    startClock();
    snapshot();
    const dest = toKind === 'found' ? found[toIndex] : tab[toIndex];
    from.pile.splice(from.pile.length - group.length, group.length);
    dest.push(...group);
    if (toKind === 'found') addScore(from.kind === 'found' ? 0 : 10);
    else if (from.kind === 'waste') addScore(5);
    else if (from.kind === 'found') addScore(-15);
    render();
    checkWin();
  }

  function toFoundation(c) {
    const from = where(c);
    if (!from || from.kind === 'stock' || from.pile[from.pile.length - 1] !== c || !c.up) return false;
    for (let i = 0; i < 4; i++) if (canFound(c, found[i])) { moveTo([c], from, 'found', i); return true; }
    return false;
  }

  function autoPlay() {
    let moved = true;
    while (moved) {
      moved = false;
      for (const p of [waste, ...tab]) {
        const c = p[p.length - 1];
        if (c && c.up && toFoundation(c)) { moved = true; break; }
      }
    }
  }

  function checkWin() {
    if (!found.every(p => p.length === 13)) return;
    clearInterval(timer); timer = null;
    celebrate();
  }

  // ---------- pointer ----------
  function toBoard(e) {
    const r = board.getBoundingClientRect();
    return { x: e.clientX - r.left + board.scrollLeft, y: e.clientY - r.top + board.scrollTop };
  }

  board.addEventListener('pointerdown', e => {
    if (e.button !== 0 || celebrating) return;
    const el = e.target.closest('.cd, .sol-slot');
    if (!el) return;
    e.preventDefault();
    board.focus({ preventScroll: true });
    if (el.classList.contains('sol-slot')) {
      if (el === slots.stock) drawCards();
      return;
    }
    const c = cards[+el.dataset.id];
    const from = where(c);
    if (from.kind === 'stock') { drawCards(); return; }
    if (!c.up) {
      if (from.kind === 'tab' && from.pile[from.pile.length - 1] === c) { snapshot(); c.up = true; addScore(5); startClock(); render(); }
      return;
    }
    if (from.kind === 'waste' && waste[waste.length - 1] !== c) return;
    if (from.kind === 'found' && from.pile[from.pile.length - 1] !== c) return;
    const group = from.kind === 'tab' ? from.pile.slice(from.pile.indexOf(c)) : [c];
    const p = toBoard(e);
    drag = { c, from, group, sx: p.x, sy: p.y, starts: group.map(g => ({ x: g.el.offsetLeft, y: g.el.offsetTop })), moving: false, id: e.pointerId };
    board.setPointerCapture(e.pointerId);
  });

  board.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = toBoard(e);
    const dx = p.x - drag.sx, dy = p.y - drag.sy;
    if (!drag.moving) {
      if (Math.hypot(dx, dy) < 4) return;
      drag.moving = true;
      board.classList.add('dragging');
    }
    drag.group.forEach((g, i) => {
      g.el.style.left = drag.starts[i].x + dx + 'px';
      g.el.style.top = drag.starts[i].y + dy + 'px';
      g.el.style.zIndex = 1000 + i;
    });
  });

  function endDrag(e, cancel) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    board.classList.remove('dragging');
    if (!d.moving) {
      // A click. Two quick clicks on the same card send it home.
      const now = performance.now();
      if (lastClick.id === d.c.id && now - lastClick.t < 400) { toFoundation(d.c); lastClick = { id: -1, t: 0 }; }
      else lastClick = { id: d.c.id, t: now };
      return;
    }
    if (cancel) { render(); return; }
    const lx = d.c.el.offsetLeft, ly = d.c.el.offsetTop;
    const overlap = (x, y) => Math.max(0, Math.min(lx + cw, x + cw) - Math.max(lx, x)) * Math.max(0, Math.min(ly + ch, y + ch) - Math.max(ly, y));
    let best = null, bestA = 0;
    for (let i = 0; i < 7; i++) {
      if (d.from.kind === 'tab' && d.from.i === i) continue;
      const p = tab[i];
      const top = p[p.length - 1];
      const y = top ? top.el.offsetTop : rowY();
      const a = overlap(colX(i), y);
      if (a > bestA && canTab(d.c, p)) { best = ['tab', i]; bestA = a; }
    }
    if (d.group.length === 1) for (let i = 0; i < 4; i++) {
      if (d.from.kind === 'found' && d.from.i === i) continue;
      const a = overlap(colX(3 + i), gap);
      if (a > bestA && canFound(d.c, found[i])) { best = ['found', i]; bestA = a; }
    }
    if (best) moveTo(d.group, d.from, best[0], best[1]);
    else render();
  }
  board.addEventListener('pointerup', e => endDrag(e, false));
  board.addEventListener('pointercancel', e => endDrag(e, true));
  board.addEventListener('contextmenu', e => { e.preventDefault(); if (!celebrating) autoPlay(); });
  board.addEventListener('keydown', e => {
    if (e.key === 'F2') { e.preventDefault(); deal(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
  });

  // ---------- the cards bouncing off the table ----------
  function cardImage(c) {
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch);
    g.strokeStyle = '#000'; g.strokeRect(0.5, 0.5, cw - 1, ch - 1);
    g.fillStyle = red(c.s) ? '#e00000' : '#000';
    g.font = `bold ${Math.round(cw * 0.2)}px Arial, sans-serif`;
    g.textBaseline = 'top';
    g.fillText(RANKS[c.r], 4, 4);
    g.fillText(SUITS[c.s], 4, 4 + cw * 0.22);
    g.font = `${Math.round(cw * 0.5)}px Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(SUITS[c.s], cw / 2, ch / 2);
    return cv;
  }

  async function celebrate() {
    const cv = h('canvas', { class: 'sol-fx', 'aria-hidden': 'true' });
    cv.width = board.clientWidth; cv.height = board.clientHeight;
    cv.style.left = board.scrollLeft + 'px'; cv.style.top = board.scrollTop + 'px';
    board.append(cv);
    const g = cv.getContext('2d');
    let stopped = false;
    celebrating = { stop: () => { stopped = true; } };
    const stop = () => celebrating && celebrating.stop();
    cv.addEventListener('pointerdown', stop);
    if (!reducedMotion.matches) {
      for (let r = 13; r >= 1 && !stopped; r--) for (let f = 0; f < 4 && !stopped; f++) {
        const c = found[f][r - 1];
        const img = cardImage(c);
        let x = colX(3 + f), y = gap - board.scrollTop;
        let vx = (Math.random() * 5 + 2) * (Math.random() < .5 ? -1 : 1), vy = -Math.random() * 6;
        c.el.style.visibility = 'hidden';
        await new Promise(done => {
          const step = () => {
            if (stopped) return done();
            vy += 0.5; x += vx; y += vy;
            if (y + ch > cv.height) { y = cv.height - ch; vy = -vy * 0.75; }
            g.drawImage(img, Math.round(x), Math.round(y));
            if (x < -cw || x > cv.width) return done();
            requestAnimationFrame(step);
          };
          step();
        });
      }
    }
    cv.remove();
    cards.forEach(c => { c.el.style.visibility = ''; });
    celebrating = null;
    const b = await msgbox({ title: 'Solitaire', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: `You won with a score of ${score} in ${seconds} seconds!\n\nDeal again?` });
    if (b === 'Yes') deal();
  }
  function stopCelebration() { if (celebrating) celebrating.stop(); }

  // ---------- menus ----------
  function setPref(k, v) { prefs[k] = v; store.set(PREFS, prefs); }
  const bar = menubar([
    { label: '&Game', items: () => [
      { label: '&Deal', key: 'F2', action: deal },
      '-',
      { label: '&Undo', disabled: !undoSnap, action: undo },
      { label: 'De&ck...', submenu: Object.entries(BACKS).map(([k, l]) => ({ label: l, checked: prefs.back === k, radio: true, action: () => { setPref('back', k); setBack(); } })) },
      { label: '&Options...', submenu: [
        { label: 'Draw &One', checked: prefs.draw === 1, radio: true, action: () => { setPref('draw', 1); deal(); } },
        { label: 'Draw &Three', checked: prefs.draw === 3, radio: true, action: () => { setPref('draw', 3); deal(); } },
      ] },
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Help', items: () => [
      { label: '&Contents', action: () => launch('help', 'Solitaire') },
      '-',
      { label: '&About Solitaire', action: () => about('Solitaire', 'i-sol', win) },
    ] },
  ]);

  setBack();
  const win = createWindow({
    app: 'solitaire', title: 'Solitaire', icon: 'i-sol', body: h('div', { class: 'sol' }, bar, board, status),
    width: 620, height: 470, minW: 300, minH: 260, route: 'solitaire',
    onResize: () => render(),
    onClosed: () => { clearInterval(timer); stopCelebration(); },
  });
  deal();
  new ResizeObserver(() => { if (!drag) render(); }).observe(board);
  return win;
}

export default { id: 'solitaire', title: 'Solitaire', icon: 'i-sol', single: true, open };
