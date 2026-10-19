// FreeCell, dealt with Microsoft's own shuffle so game #1 here is game #1 everywhere.

import { h, store, clamp, reducedMotion, wait } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, inputbox, about } from '../dialogs.js';
import { CHEATS } from '../version.js';
import { red, cardEl, cardName } from './cards.js';

const PREFS = 'w95.freecell.prefs';
const STATS = 'w95.freecell.stats';
const MAX_GAME = 32000;
// "This session" in the statistics lasts until the page is reloaded.
const session = { won: 0, lost: 0 };

// Microsoft's deal: the C runtime's rand() seeded with the game number, picking
// from a deck ordered AC AD AH AS 2C ... and dealing across the eight columns.
// Returns 52 card ids (suit * 13 + rank - 1) in deal order.
export function msDeal(n) {
  // Deals -1 and -2 stand in for the secret unwinnable ones: the deck in rank order, and backwards.
  // shortcut: not checked with a solver, so they may be winnable; run one if anyone reports a win.
  if (n < 0) return Array.from({ length: 52 }, (_, i) => n === -1 ? i : 51 - i).map(i => (i % 4) * 13 + (i >> 2));
  let seed = n;
  const rnd = () => (seed = (seed * 214013 + 2531011) % 2147483648) >>> 16;
  const t = Array.from({ length: 52 }, (_, i) => 51 - i);
  for (let i = 0; i < 51; i++) {
    const j = 51 - rnd() % (52 - i);
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t.map(m => (m % 4) * 13 + Math.floor(m / 4));
}

// The little king between the cells, 16x16 and facing left; CSS mirrors it.
const KING = [
  '...k...k...k....',
  '..kyk.kyk.kyk...',
  '..kyyyyyyyyyk...',
  '..kyryyyryyyk...',
  '..kkkkkkkkkkk...',
  '..kfffffffffk...',
  '.kfkffffffffk...',
  'kffffffffffk....',
  '.kffffffffffk...',
  '..kffkkfffffk...',
  '..kwwwwwwwwwk...',
  '..kwwwwwwwwk....',
  '.kbkwwwwwwkbk...',
  'kbbbkwwwwkbbbk..',
  'kbbbbkkkkbbbbk..',
  'kkkkkkkkkkkkkk..',
];
const KING_INK = { k: '#000', y: '#ffff00', r: '#ff0000', f: '#ffc8a0', w: '#fff', b: '#0000ff' };
function kingSvg() {
  let px = '';
  KING.forEach((row, y) => [...row].forEach((ch, x) => { if (KING_INK[ch]) px += `<rect x="${x + 1}" y="${y}" width="1" height="1" fill="${KING_INK[ch]}"/>`; }));
  return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${px}</svg>`;
}

function open(arg) {
  const prefs = { messages: true, quick: false, ...store.get(PREFS, {}) };
  const board = h('div', { class: 'fc-board', tabindex: '0', 'aria-label': 'FreeCell table' });
  const spacer = h('div', { class: 'sol-spacer' });
  const king = h('div', { class: 'fc-king', html: kingSvg() });
  const leftEl = h('span', { class: 'fc-left', role: 'status' });
  const cells = [], homes = [], bases = [];
  let cards = [], free, home, cols, sel = null, gameNo = 0, moved = false, over = false, busy = false, undoSnap = null;
  let cw = 71, ch = 96, colGap = 8, rowY = 110, lastClick = { key: '', t: 0 };

  for (let i = 0; i < 4; i++) cells.push(board.appendChild(h('div', { class: 'fc-cell' })));
  for (let i = 0; i < 4; i++) homes.push(board.appendChild(h('div', { class: 'fc-cell home' })));
  for (let i = 0; i < 8; i++) bases.push(board.appendChild(h('div', { class: 'fc-base' })));
  board.append(king, spacer);
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) {
    const c = { id: s * 13 + r - 1, s, r };
    c.el = cardEl(c, { 'aria-label': cardName(c) });
    c.el.classList.add('up');
    cards.push(c);
    board.append(c.el);
  }

  // ---------- games ----------
  function deal(n) {
    gameNo = n;
    free = [null, null, null, null];
    home = [[], [], [], []];
    cols = Array.from({ length: 8 }, () => []);
    msDeal(n).forEach((id, i) => cols[i % 8].push(cards[id]));
    sel = null; moved = false; over = false; undoSnap = null;
    win.setTitle('FreeCell Game #' + n);
    render();
  }
  const randomGame = () => 1 + Math.floor(Math.random() * MAX_GAME);

  // Leaving a game you've started counts as a loss, as in Windows.
  async function abandon() {
    if (!moved || over) return true;
    const b = await msgbox({ title: 'FreeCell', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: 'Do you want to resign this game?' });
    if (b !== 'Yes') return false;
    record(false);
    return true;
  }
  async function newGame() { if (!busy && await abandon()) deal(randomGame()); }
  async function selectGame() {
    if (busy || !await abandon()) return;
    const v = await inputbox({ title: 'Game Number', label: `Select a game number from 1 to ${MAX_GAME}:`, value: String(randomGame()), parent: win });
    if (v == null) return;
    const n = Math.floor(+v.trim());
    if (!(n >= 1 && n <= MAX_GAME || CHEATS && (n === -1 || n === -2))) {
      await msgbox({ title: 'FreeCell', icon: 'warn', parent: win, text: `Please enter a number from 1 to ${MAX_GAME}.` });
      return selectGame();
    }
    deal(n);
  }
  // Ctrl+Shift+F10: the error box whose Abort button wins the game.
  async function cheat() {
    if (busy || over) return;
    const b = await msgbox({ title: 'FreeCell', icon: 'error', parent: win, buttons: ['&Abort', '&Retry', '&Ignore'], text: 'An error has occurred in blankiekun FreeCell.' });
    if (b !== 'Abort') return;
    free = [null, null, null, null]; cols.forEach(p => { p.length = 0; });
    home = [0, 1, 2, 3].map(s => cards.slice(s * 13, s * 13 + 13));
    sel = null; render(); afterMove();
  }
  function restart() { if (!busy) deal(gameNo); }

  // ---------- statistics ----------
  function loadStats() { return { won: 0, lost: 0, wins: 0, losses: 0, cur: 0, ...store.get(STATS, {}) }; }
  // cur > 0 is a run of wins, cur < 0 a run of losses.
  function record(won) {
    const st = loadStats();
    if (won) { st.won++; session.won++; st.cur = st.cur > 0 ? st.cur + 1 : 1; st.wins = Math.max(st.wins, st.cur); }
    else { st.lost++; session.lost++; st.cur = st.cur < 0 ? st.cur - 1 : -1; st.losses = Math.max(st.losses, -st.cur); }
    store.set(STATS, st);
  }
  function statistics() {
    const st = loadStats();
    const pct = (w, l) => (w + l ? Math.round(w * 100 / (w + l)) : 0) + '%';
    const line = (label, w, l) => h('tr', null, h('td', null, label), h('td', null, 'won: ' + w), h('td', null, 'lost: ' + l), h('td', { class: 'num' }, pct(w, l)));
    const n = Math.abs(st.cur);
    const current = !st.cur ? '0' : n + (st.cur > 0 ? (n === 1 ? ' win' : ' wins') : (n === 1 ? ' loss' : ' losses'));
    const body = h('div', { class: 'dlg fc-stats' },
      h('table', null,
        line('This session:', session.won, session.lost),
        line('Total:', st.won, st.lost)),
      h('fieldset', { class: 'group' }, h('legend', null, 'Streaks'),
        h('table', null,
          h('tr', null, h('td', null, 'Wins:'), h('td', { class: 'num' }, st.wins)),
          h('tr', null, h('td', null, 'Losses:'), h('td', { class: 'num' }, st.losses)),
          h('tr', null, h('td', null, 'Current:'), h('td', { class: 'num' }, current)))),
      h('div', { class: 'btns' },
        h('button', { class: 'btn default', type: 'button', onclick: () => d.close(true) }, 'OK'),
        h('button', { class: 'btn', type: 'button', html: '<u>C</u>lear', onclick: () => { store.set(STATS, {}); session.won = session.lost = 0; d.close(true); statistics(); } })));
    body.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); d.close(true); }
      if (e.key.toLowerCase() === 'c') { e.preventDefault(); body.querySelectorAll('.btn')[1].click(); }
    });
    const d = createWindow({ title: 'FreeCell Statistics', body, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    body.querySelector('.default').focus();
  }

  function options() {
    const chk = (label, k) => h('label', { class: 'fc-opt' }, h('input', { type: 'checkbox', checked: prefs[k], 'data-k': k }), h('span', { html: label }));
    const form = h('form', { class: 'dlg' },
      h('div', { class: 'fc-opts' }, chk('<u>D</u>isplay messages on illegal moves', 'messages'), chk('<u>Q</u>uick play (no animation)', 'quick')),
      h('div', { class: 'btns' },
        h('button', { class: 'btn default', type: 'submit' }, 'OK'),
        h('button', { class: 'btn', type: 'button', onclick: () => d.close(true) }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      form.querySelectorAll('input').forEach(i => { prefs[i.dataset.k] = i.checked; });
      store.set(PREFS, prefs);
      d.close(true);
    });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); d.close(true); } });
    const d = createWindow({ title: 'FreeCell Options', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    form.querySelector('.default').focus();
  }

  // ---------- layout ----------
  function measure() {
    const W = board.clientWidth || 620, H = board.clientHeight || 400;
    cw = clamp(Math.floor(Math.min(W / 8.75, H / 4.2 * 71 / 96)), 30, 142);
    ch = Math.round(cw * 96 / 71);
    colGap = (W - 8 * cw) / 9;
    rowY = ch + Math.max(8, Math.round(ch * .14));
    board.style.setProperty('--cw', cw + 'px');
    board.style.setProperty('--ch', ch + 'px');
    return W;
  }
  const colX = i => Math.round(colGap + i * (cw + colGap));
  const animated = () => !prefs.quick && !reducedMotion.matches;

  function place(c, x, y, z) {
    c.el.style.left = x + 'px';
    c.el.style.top = y + 'px';
    c.el.style.zIndex = z;
  }

  // moving: cards to keep on top while they slide to their new place.
  function render(moving = []) {
    if (!cols) return;
    const W = measure();
    const H = board.clientHeight || 400;
    const pos = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
    for (let i = 0; i < 4; i++) { pos(cells[i], i * cw, 0); pos(homes[i], W - (4 - i) * cw, 0); }
    const ks = clamp(W - 8 * cw - 6, 18, 40);
    king.style.width = king.style.height = ks + 'px';
    pos(king, Math.round((W - ks) / 2), Math.round((ch - ks) / 2));
    free.forEach((c, i) => c && place(c, i * cw, 0, 100));
    home.forEach((p, i) => p.forEach((c, j) => place(c, W - (4 - i) * cw, 0, 200 + j)));
    // Long columns squeeze together to stay inside the window, down to a point.
    const base = Math.round(ch * .3), least = Math.max(9, Math.round(ch * .15));
    let maxY = rowY + ch;
    cols.forEach((p, i) => {
      pos(bases[i], colX(i), rowY);
      bases[i].style.height = Math.max(ch, H - rowY) + 'px';
      const step = p.length > 1 ? clamp(Math.floor((H - rowY - ch - 4) / (p.length - 1)), least, base) : base;
      p.forEach((c, j) => { place(c, colX(i), rowY + j * step, 300 + j); maxY = Math.max(maxY, rowY + j * step + ch); });
    });
    moving.forEach((c, i) => { c.el.style.zIndex = 1000 + i; });
    cards.forEach(c => c.el.classList.toggle('sel', !!sel && selCard() === c));
    spacer.style.top = maxY + 4 + 'px';
    leftEl.textContent = 'Cards Left: ' + (52 - home.reduce((n, p) => n + p.length, 0));
  }

  // ---------- rules ----------
  const top = p => p[p.length - 1];
  const fits = (c, col) => !col.length || (top(col).r === c.r + 1 && red(top(col).s) !== red(c.s));
  const homeRank = s => { const p = home.find(p => p.length && p[0].s === s); return p ? p.length : 0; };
  const homeFor = (c, prefer) => {
    const ok = i => home[i].length ? home[i][0].s === c.s && home[i].length === c.r - 1 : c.r === 1;
    if (prefer != null && ok(prefer)) return prefer;
    for (let i = 0; i < 4; i++) if (ok(i)) return i;
    return -1;
  };
  // How many cards at the bottom of a column are in sequence.
  function runLen(p) {
    if (!p.length) return 0;
    let n = 1;
    for (let i = p.length - 1; i > 0 && p[i - 1].r === p[i].r + 1 && red(p[i - 1].s) !== red(p[i].s); i--) n++;
    return n;
  }
  const freeCells = () => free.filter(c => !c).length;
  // The most cards you can move at once, using the free cells and empty columns as scratch space.
  const maxMove = dest => (freeCells() + 1) * 2 ** cols.filter((p, i) => !p.length && i !== dest).length;
  const selCard = () => sel && (sel.kind === 'free' ? free[sel.i] : top(cols[sel.i]));

  // Cards that can't be wanted on the table any more go home by themselves: a card
  // is safe once both cards of the other colour that could hold it are home.
  function safeHome(c) {
    if (homeFor(c) < 0) return false;
    if (c.r <= 2) return true;
    const other = red(c.s) ? [0, 3] : [1, 2];
    return other.every(s => homeRank(s) >= c.r - 1);
  }

  function anyMove() {
    const srcs = [...free.filter(Boolean), ...cols.filter(p => p.length).map(top)];
    if (cols.some(p => !p.length) || (freeCells() && cols.some(p => p.length))) return true;
    if (srcs.some(c => homeFor(c) >= 0)) return true;
    if (free.some(c => c && cols.some(p => fits(c, p)))) return true;
    return cols.some((p, i) => {
      const n = Math.min(runLen(p), maxMove(-1));
      for (let k = 1; k <= n; k++) if (cols.some((q, j) => j !== i && q.length && fits(p[p.length - k], q))) return true;
      return false;
    });
  }

  // ---------- moves ----------
  function snapshot() {
    const ids = p => p.map(c => c && c.id);
    undoSnap = { free: ids(free), home: home.map(ids), cols: cols.map(ids) };
  }
  function undo() {
    if (!undoSnap || busy) return;
    const get = ids => ids.map(i => i == null ? null : cards[i]);
    free = get(undoSnap.free); home = undoSnap.home.map(get); cols = undoSnap.cols.map(get);
    undoSnap = null; sel = null; over = false;
    render();
  }

  // Moves the bottom k cards of a column (or a free cell's card) somewhere else.
  async function move(from, to, k = 1) {
    snapshot();
    const group = from.kind === 'col' ? cols[from.i].splice(-k) : [free[from.i]];
    if (from.kind === 'free') free[from.i] = null;
    if (to.kind === 'col') cols[to.i].push(...group);
    else if (to.kind === 'free') free[to.i] = group[0];
    else home[to.i].push(group[0]);
    sel = null; moved = true;
    busy = true;
    board.classList.toggle('anim', animated());
    render(group);
    if (animated()) await wait(130);
    await autoHome();
    busy = false;
    board.classList.remove('anim');
    render();
    afterMove();
  }

  async function autoHome() {
    for (;;) {
      let c = null, from = null;
      free.forEach((f, i) => { if (!c && f && safeHome(f)) { c = f; from = () => { free[i] = null; }; } });
      cols.forEach(p => { if (!c && p.length && safeHome(top(p))) { c = top(p); from = () => p.pop(); } });
      if (!c) return;
      from();
      home[homeFor(c)].push(c);
      render([c]);
      if (animated()) await wait(110);
    }
  }

  async function afterMove() {
    if (home.every(p => p.length === 13)) {
      over = true; undoSnap = null;
      record(true);
      const b = await msgbox({ title: 'Game Over', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: 'Congratulations, you win!\n\nDo you want to play again?' });
      if (b === 'Yes') deal(randomGame());
      return;
    }
    if (!anyMove()) {
      over = true;
      record(false);
      const b = await msgbox({ title: 'Game Over', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: 'Sorry, you lose. There are no more legal moves.\n\nDo you want to play this game again?' });
      if (b === 'Yes') deal(gameNo);
    }
  }

  async function illegal(text = 'That move is not allowed.') {
    sel = null;
    render();
    if (prefs.messages) await msgbox({ title: 'FreeCell', icon: 'info', parent: win, text });
  }

  // ---------- clicks ----------
  // spot: { kind: 'free' | 'home' | 'col', i }
  async function click(spot, double) {
    if (busy || over) return;
    if (double && spot.kind === 'col' && cols[spot.i].length) {
      // Double-clicking a column parks its bottom card in a free cell.
      sel = null;
      const f = free.indexOf(null);
      if (f >= 0) return move(spot, { kind: 'free', i: f });
      return render();
    }
    if (!sel) {
      if ((spot.kind === 'col' && cols[spot.i].length) || (spot.kind === 'free' && free[spot.i])) { sel = spot; render(); }
      return;
    }
    const c = selCard();
    if (spot.kind === sel.kind && spot.i === sel.i) { sel = null; return render(); }
    if (spot.kind === 'home') {
      const i = homeFor(c, spot.i);
      return i >= 0 ? move(sel, { kind: 'home', i }) : illegal();
    }
    if (spot.kind === 'free') {
      if (free[spot.i]) { sel = spot; return render(); }
      return move(sel, spot);
    }
    const dest = cols[spot.i];
    if (sel.kind === 'free') return fits(c, dest) ? move(sel, spot) : illegal();
    const src = cols[sel.i], run = runLen(src), max = maxMove(spot.i);
    if (!dest.length) {
      let k = 1;
      if (run > 1 && max > 1) {
        // Non-breaking spaces: the buttons are flex boxes, which would eat a space before the <u>.
        const b = await msgbox({ title: 'Move to Empty Column...', icon: 'question', parent: win, buttons: ['Move\u00a0&column', 'Move\u00a0&single card', 'Cancel'], text: 'Move the whole column, or just a single card?' });
        if (!b || b === 'Cancel') { sel = null; return render(); }
        if (b.endsWith('column')) k = Math.min(run, max);
      }
      return move(sel, spot, k);
    }
    const d = top(dest), k = d.r - c.r;
    if (k < 1 || k > run || !fits(src[src.length - k], dest)) return illegal();
    if (k > max) return illegal(`That move requires moving ${k} cards. You only have enough free space to move ${max} card${max === 1 ? '' : 's'}.`);
    return move(sel, spot, k);
  }

  function spotAt(e) {
    const r = board.getBoundingClientRect();
    const x = e.clientX - r.left + board.scrollLeft, y = e.clientY - r.top + board.scrollTop;
    const W = board.clientWidth;
    if (y < ch + 2) {
      if (x < 4 * cw) return { kind: 'free', i: Math.floor(x / cw) };
      if (x >= W - 4 * cw) return { kind: 'home', i: clamp(Math.floor((x - (W - 4 * cw)) / cw), 0, 3) };
      return null;
    }
    if (y < rowY - 2) return null;
    // Anywhere in a column's lane counts, which is kinder to fingers.
    let best = 0;
    for (let i = 1; i < 8; i++) if (Math.abs(x - colX(i) - cw / 2) < Math.abs(x - colX(best) - cw / 2)) best = i;
    return Math.abs(x - colX(best) - cw / 2) <= cw / 2 + colGap / 2 ? { kind: 'col', i: best } : null;
  }

  function look(e) {
    const r = board.getBoundingClientRect();
    king.classList.toggle('right', e.clientX - r.left > board.clientWidth / 2);
  }
  board.addEventListener('pointermove', look);
  board.addEventListener('pointerdown', e => { look(e); board.focus({ preventScroll: true }); if (e.pointerType !== 'mouse' || e.button === 0) e.preventDefault(); });
  board.addEventListener('click', e => {
    const spot = spotAt(e);
    if (!spot) { if (sel && !busy) { sel = null; render(); } return; }
    // A double-click is a second click on a column the first click just picked up.
    const key = spot.kind + spot.i, now = performance.now();
    const double = lastClick.key === key && now - lastClick.t < 400 && sel && sel.kind === 'col' && sel.i === spot.i;
    lastClick = !double && !sel && spot.kind === 'col' && cols[spot.i].length ? { key, t: now } : { key: '', t: 0 };
    click(spot, double);
  });
  board.addEventListener('contextmenu', e => e.preventDefault());

  // Keys: 1-8 pick columns, Q W E R the free cells, H the home cells, Esc lets go.
  board.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      return;
    }
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '8') click({ kind: 'col', i: +k - 1 }, false);
    else if ('qwer'.includes(k) && k.length === 1) click({ kind: 'free', i: 'qwer'.indexOf(k) }, false);
    else if (k === 'h') click({ kind: 'home', i: 0 }, false);
    else if (k === 'escape' && sel) { sel = null; render(); }
    else return;
    e.preventDefault();
  });

  const keys = { F2: newGame, F3: selectGame, F4: statistics, F5: options, F10: undo };
  const root = h('div', { class: 'fc' });
  root.addEventListener('keydown', e => {
    if (CHEATS && e.ctrlKey && e.shiftKey && e.key === 'F10') { e.preventDefault(); cheat(); }
    else if (keys[e.key] && !e.altKey) { e.preventDefault(); keys[e.key](); }
  });

  // ---------- menus ----------
  const bar = menubar([
    { label: '&Game', items: () => [
      { label: '&New Game', key: 'F2', action: newGame },
      { label: '&Select Game...', key: 'F3', action: selectGame },
      { label: '&Restart Game', disabled: !moved, action: restart },
      '-',
      { label: 'S&tatistics...', key: 'F4', action: statistics },
      { label: '&Options...', key: 'F5', action: options },
      '-',
      { label: '&Undo', key: 'F10', disabled: !undoSnap, action: undo },
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Help', items: () => [
      { label: '&Contents', key: 'F1', action: () => launch('help', 'FreeCell') },
      '-',
      { label: '&About FreeCell...', action: () => about('FreeCell', 'i-freecell', win) },
    ] },
  ]);
  bar.append(leftEl);
  root.append(bar, board);

  const win = createWindow({
    app: 'freecell', title: 'FreeCell', icon: 'i-freecell', body: root,
    width: 640, height: 480, minW: 300, minH: 260, route: 'freecell', autofocus: '.fc-board',
    onResize: () => render(),
    onClosed: () => { if (moved && !over) record(false); },
  });
  const n = Math.floor(+arg);
  deal(n >= 1 && n <= MAX_GAME ? n : randomGame());
  new ResizeObserver(() => render()).observe(board);
  return win;
}

export default { id: 'freecell', title: 'FreeCell', icon: 'i-freecell', single: true, open };

for (const n of [1, -1, -2]) console.assert(new Set(msDeal(n)).size === 52, 'msDeal: ' + n + ' is a full deck');
console.assert(msDeal(-1)[0] !== msDeal(-2)[0], 'msDeal: -1 and -2 differ');
