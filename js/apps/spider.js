// Spider Solitaire: ten columns, two decks, and a run of K down to A in one suit leaves the table.
// Plus! 98 brought it, so only XP, Vista and 7 have it (ONLY in version.js).

import { h, store, clamp } from '../util.js';
import { createWindow } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import { cardEl, cardName } from './cards.js';

const PREFS = 'w95.spider.prefs';
const STATS = 'w95.spider.stats.';   // plus the suit count, so 1, 2 and 4 suits keep their own record
// "This session" in the statistics lasts until the page is reloaded.
const session = { won: 0, lost: 0 };
const SUIT_SETS = { 1: [3], 2: [3, 2], 4: [0, 1, 2, 3] };   // spades, then hearts, then the other two

// ---------- rules (pure, so the self-checks below can run them) ----------
// A card can be dragged with everything under it if the cards from j down are one suit, counting down.
export function canMove(col, j) {
  if (!col[j] || !col[j].up) return false;
  for (let i = j; i < col.length - 1; i++) if (col[i].s !== col[i + 1].s || col[i].r !== col[i + 1].r + 1) return false;
  return true;
}
export const fits = (c, col) => !col.length || col.at(-1).r === c.r + 1;
// The bottom 13 cards are K..A of one suit.
export function fullRun(col) {
  if (col.length < 13) return false;
  const run = col.slice(-13);
  return run[0].r === 13 && canMove(run, 0);
}

{
  const k = (s, r, up = true) => ({ s, r, up });
  const run = s => Array.from({ length: 13 }, (_, i) => k(s, 13 - i));
  console.assert(fullRun([k(0, 5), ...run(3)]), 'spider: K..A of one suit completes');
  console.assert(!fullRun([...run(3).slice(0, 12), k(2, 1)]), 'spider: a mixed-suit run does not');
  console.assert(!fullRun(run(3).slice(1)), 'spider: 12 cards do not');
  console.assert(canMove([k(3, 5), k(3, 4)], 0) && !canMove([k(3, 5), k(2, 4)], 0), 'spider: only same-suit runs move');
  console.assert(!canMove([k(3, 5, false)], 0), 'spider: face-down cards stay put');
  console.assert(fits(k(2, 4), [k(3, 5)]) && !fits(k(2, 4), [k(3, 6)]) && fits(k(2, 4), []), 'spider: lands on one higher, or on empty');
}

function open() {
  const prefs = { suits: 1, ...store.get(PREFS, {}) };
  const board = h('div', { class: 'fc-board', tabindex: '0', 'data-back': 'weave', 'aria-label': 'Spider Solitaire table' });
  const spacer = h('div', { class: 'sol-spacer' });
  const leftEl = h('span', { class: 'fc-left', role: 'status' });
  const bases = Array.from({ length: 10 }, () => board.appendChild(h('div', { class: 'fc-base' })));
  const cards = [];
  let cols, stock, done, sel = null, moved = false, over = false, undos = [];
  let cw = 71, ch = 96, colGap = 8, rowY = 110;

  for (let d = 0; d < 8; d++) for (let r = 1; r <= 13; r++) {
    const c = { id: d * 13 + r - 1, s: SUIT_SETS[prefs.suits][d % prefs.suits], r, up: false };
    c.el = cardEl(c);
    cards.push(c);
    board.append(c.el);
  }
  board.append(spacer);

  // ---------- games ----------
  // A new game re-faces the same 104 cards, since the suits may have changed.
  function deal() {
    const deck = cards.map((c, i) => { c.s = SUIT_SETS[prefs.suits][Math.floor(i / 13) % prefs.suits]; c.up = false; c.el.replaceWith(c.el = cardEl(c)); return c; });
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    cols = Array.from({ length: 10 }, (_, i) => deck.splice(0, i < 4 ? 6 : 5));
    cols.forEach(p => { p.at(-1).up = true; });
    stock = deck; done = []; sel = null; moved = false; over = false; undos = [];
    win.setTitle('Spider Solitaire - ' + prefs.suits + (prefs.suits === 1 ? ' suit' : ' suits'));
    render();
  }

  // Leaving a game you've started counts as a loss.
  async function abandon() {
    if (!moved || over) return true;
    const b = await msgbox({ title: 'Spider Solitaire', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: 'Do you want to resign this game?' });
    if (b !== 'Yes') return false;
    record(false);
    return true;
  }
  async function newGame() { if (await abandon()) deal(); }
  async function setSuits(n) {
    if (n === prefs.suits || !await abandon()) return;
    prefs.suits = n;
    store.set(PREFS, prefs);
    deal();
  }

  // ---------- statistics ----------
  const skey = () => STATS + prefs.suits;
  function loadStats() { return { won: 0, lost: 0, wins: 0, losses: 0, cur: 0, ...store.get(skey(), {}) }; }
  // cur > 0 is a run of wins, cur < 0 a run of losses.
  function record(won) {
    const st = loadStats();
    if (won) { st.won++; session.won++; st.cur = st.cur > 0 ? st.cur + 1 : 1; st.wins = Math.max(st.wins, st.cur); }
    else { st.lost++; session.lost++; st.cur = st.cur < 0 ? st.cur - 1 : -1; st.losses = Math.max(st.losses, -st.cur); }
    store.set(skey(), st);
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
        line(prefs.suits + (prefs.suits === 1 ? ' suit:' : ' suits:'), st.won, st.lost)),
      h('fieldset', { class: 'group' }, h('legend', null, 'Streaks'),
        h('table', null,
          h('tr', null, h('td', null, 'Wins:'), h('td', { class: 'num' }, st.wins)),
          h('tr', null, h('td', null, 'Losses:'), h('td', { class: 'num' }, st.losses)),
          h('tr', null, h('td', null, 'Current:'), h('td', { class: 'num' }, current)))),
      h('div', { class: 'btns' },
        h('button', { class: 'btn default', type: 'button', onclick: () => d.close(true) }, 'OK'),
        h('button', { class: 'btn', type: 'button', html: '<u>C</u>lear', onclick: () => { store.set(skey(), {}); session.won = session.lost = 0; d.close(true); statistics(); } })));
    body.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); d.close(true); }
      if (e.key.toLowerCase() === 'c') { e.preventDefault(); body.querySelectorAll('.btn')[1].click(); }
    });
    const d = createWindow({ title: 'Spider Solitaire Statistics', body, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    body.querySelector('.default').focus();
  }

  // ---------- layout ----------
  const colX = i => Math.round(colGap + i * (cw + colGap));
  function render() {
    if (!cols) return;
    const W = board.clientWidth || 620, H = board.clientHeight || 400;
    cw = clamp(Math.floor(Math.min(W / 10.5, H / 4.2 * 71 / 96)), 24, 142);
    ch = Math.round(cw * 96 / 71);
    colGap = (W - 10 * cw) / 11;
    rowY = ch + Math.max(8, Math.round(ch * .14));
    board.style.setProperty('--cw', cw + 'px');
    board.style.setProperty('--ch', ch + 'px');
    const put = (c, x, y, z) => { c.el.style.left = x + 'px'; c.el.style.top = y + 'px'; c.el.style.zIndex = z; };
    // Each ten left to deal is a fanned pile at the top left; finished runs stack at the top right.
    stock.forEach((c, i) => put(c, colX(0) + Math.floor(i / 10) * Math.round(cw * .25), 0, 100 + i));
    done.forEach((p, i) => p.forEach((c, j) => put(c, W - colGap - cw - i * Math.round(cw * .25), 0, 100 + j)));
    let maxY = rowY + ch;
    cols.forEach((p, i) => {
      bases[i].style.left = colX(i) + 'px'; bases[i].style.top = rowY + 'px';
      bases[i].style.height = Math.max(ch, H - rowY) + 'px';
      // Long columns squeeze together to stay inside the window, down to a point.
      const dn = Math.round(ch * .1), up = Math.round(ch * .28), least = Math.max(8, Math.round(ch * .13));
      const need = p.reduce((n, c) => n + (c.up ? up : dn), 0) - (p.length ? (p.at(-1).up ? up : dn) : 0);
      const k = need ? Math.min(1, Math.max(0, H - rowY - ch - 4) / need) : 1;
      let y = rowY;
      p.forEach((c, j) => {
        put(c, colX(i), Math.round(y), 300 + j);
        maxY = Math.max(maxY, y + ch);
        y += Math.max(least, (c.up ? up : dn) * k);
      });
    });
    cards.forEach(c => {
      c.el.classList.toggle('up', c.up);
      c.el.setAttribute('aria-label', c.up ? cardName(c) : 'face-down card');
      c.el.classList.toggle('sel', !!sel && cols[sel.i].indexOf(c) >= sel.j);
    });
    spacer.style.top = maxY + 4 + 'px';
    leftEl.textContent = 'Runs: ' + done.length + '/8   Deals left: ' + stock.length / 10;
  }

  // ---------- moves ----------
  // One undo step is every column, the stock and the finished runs as they stood.
  function snapshot() {
    undos.push({ cols: cols.map(p => p.map(c => [c, c.up])), stock: [...stock], done: done.map(p => [...p]) });
  }
  function undo() {
    const u = undos.pop();
    if (!u || over) return;
    cols = u.cols.map(p => p.map(([c, up]) => { c.up = up; return c; }));
    stock = u.stock; stock.forEach(c => { c.up = false; }); done = u.done; sel = null;
    render();
  }

  // Turns up the card a move uncovered and takes away any finished run.
  function settle(p) {
    if (p.length) p.at(-1).up = true;
    if (fullRun(p)) { done.push(p.splice(-13).reverse()); if (p.length) p.at(-1).up = true; }
  }
  async function afterMove() {
    render();
    if (done.length < 8) return;
    over = true; undos = [];
    record(true);
    const b = await msgbox({ title: 'Game Over', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: 'Congratulations, you win!\n\nDo you want to play again?' });
    if (b === 'Yes') deal();
  }
  function move(from, to) {
    snapshot();
    const group = cols[from.i].splice(from.j);
    cols[to].push(...group);
    sel = null; moved = true;
    settle(cols[from.i]); settle(cols[to]);
    afterMove();
  }
  async function dealRow() {
    if (over || !stock.length) return;
    if (cols.some(p => !p.length)) {
      sel = null; render();
      return void await msgbox({ title: 'Spider Solitaire', icon: 'info', parent: win, text: 'You cannot deal a new row while there is an empty column.' });
    }
    snapshot();
    cols.forEach(p => { const c = stock.pop(); c.up = true; p.push(c); });
    sel = null; moved = true;
    cols.forEach(settle);
    afterMove();
  }

  // ---------- clicks ----------
  // j is the clicked card's place in column i; -1 means the empty lane.
  function click(i, j) {
    if (over) return;
    if (sel && sel.i === i) { sel = null; return render(); }
    if (sel && fits(cols[sel.i][sel.j], cols[i])) return move(sel, i);
    sel = canMove(cols[i], j) ? { i, j } : null;
    render();
  }
  function spotAt(e) {
    const c = e.target.closest('.cd') && cards[+e.target.closest('.cd').dataset.id];
    if (c && stock.includes(c)) return { stock: true };
    for (let i = 0; c && i < 10; i++) if (cols[i].includes(c)) return { i, j: cols[i].indexOf(c) };
    const r = board.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top + board.scrollTop;
    if (y < rowY - 2) return null;
    // Anywhere in a column's lane counts, which is kinder to fingers.
    let best = 0;
    for (let i = 1; i < 10; i++) if (Math.abs(x - colX(i) - cw / 2) < Math.abs(x - colX(best) - cw / 2)) best = i;
    return { i: best, j: -1 };
  }
  board.addEventListener('pointerdown', e => { board.focus({ preventScroll: true }); if (e.pointerType !== 'mouse' || e.button === 0) e.preventDefault(); });
  board.addEventListener('click', e => {
    const s = spotAt(e);
    if (!s) { if (sel) { sel = null; render(); } return; }
    if (s.stock) return dealRow();
    click(s.i, s.j);
  });
  board.addEventListener('contextmenu', e => e.preventDefault());

  // Keys: 1-9 and 0 pick columns (the bottom card), D deals, Esc lets go.
  board.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      return;
    }
    const k = e.key.toLowerCase();
    if (/^[0-9]$/.test(k)) { const i = (+k + 9) % 10; click(i, cols[i].length - 1); }
    else if (k === 'd') dealRow();
    else if (k === 'escape' && sel) { sel = null; render(); }
    else return;
    e.preventDefault();
  });

  const keys = { F2: newGame, F4: statistics, F10: undo };
  const root = h('div', { class: 'fc' });
  root.addEventListener('keydown', e => {
    if (keys[e.key] && !e.altKey) { e.preventDefault(); keys[e.key](); }
  });

  // ---------- menus ----------
  const bar = menubar([
    { label: '&Game', items: () => [
      { label: '&New Game', key: 'F2', action: newGame },
      { label: '&Deal a Row', action: dealRow },
      '-',
      { label: '&Difficulty', submenu: [1, 2, 4].map(n => ({ label: n === 1 ? '&One Suit' : n === 2 ? '&Two Suits' : '&Four Suits', checked: prefs.suits === n, radio: true, action: () => setSuits(n) })) },
      { label: 'S&tatistics...', key: 'F4', action: statistics },
      '-',
      { label: '&Undo', key: 'F10', disabled: !undos.length, action: undo },
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Help', items: () => [
      { label: '&About Spider Solitaire...', action: () => about('Spider Solitaire', 'i-spider', win) },
    ] },
  ]);
  bar.append(leftEl);
  root.append(bar, board);

  const win = createWindow({
    app: 'spider', title: 'Spider Solitaire', icon: 'i-spider', body: root,
    width: 700, height: 500, minW: 300, minH: 260, route: 'spider', autofocus: '.fc-board',
    onResize: () => render(),
    onClosed: () => { if (moved && !over) record(false); },
  });
  deal();
  new ResizeObserver(() => render()).observe(board);
  return win;
}

export default { id: 'spider', title: 'Spider Solitaire', icon: 'i-spider', single: true, open };
