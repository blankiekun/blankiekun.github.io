// Hearts: you against three computer players, first to 100 points loses.

import { h, store, clamp, wait, reducedMotion } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, inputbox, about } from '../dialogs.js';
import { cardEl, cardName, SUIT_NAMES } from './cards.js';

const PREFS = 'w95.hearts.prefs';
const NAMES = ['Pauline', 'Michele', 'Ben'];
// Players go clockwise from you: 0 you (south), 1 west, 2 north, 3 east.
const PASS = [
  { name: 'left', to: 1, label: 'Pass Left' },
  { name: 'right', to: 3, label: 'Pass Right' },
  { name: 'across', to: 2, label: 'Pass Across' },
  { name: 'hold', to: 0 },
];
const CLUBS = 0, HEARTS = 2, SPADES = 3;
// Your hand is sorted clubs, diamonds, spades, hearts, aces high.
const SORT = [0, 1, 3, 2];
const isQS = c => c.s === SPADES && c.r === 12;
const points = c => c.s === HEARTS ? 1 : isQS(c) ? 13 : 0;
const highest = cs => cs.reduce((a, b) => (b.v > a.v ? b : a));
const lowest = cs => cs.reduce((a, b) => (b.v < a.v ? b : a));

function open() {
  const prefs = { name: '', names: NAMES.slice(), ...store.get(PREFS, {}) };
  const board = h('div', { class: 'hr-board', tabindex: '0', 'aria-label': 'Hearts table' });
  const msgEl = h('span', { role: 'status' }, '');
  const status = h('div', { class: 'statusbar' }, msgEl);
  const btn = h('button', { class: 'btn hr-pass', type: 'button', hidden: true });
  const labels = [0, 1, 2, 3].map(p => h('div', { class: 'hr-name p' + p }));
  board.append(...labels, btn);
  board.dataset.back = store.get('w95.sol.prefs', {}).back || 'weave';

  const cards = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) {
    const c = { id: s * 13 + r - 1, s, r, v: r === 1 ? 14 : r };
    c.el = cardEl(c);
    cards.push(c);
    board.append(c.el);
  }
  const twoClubs = cards[CLUBS * 13 + 1];

  // gen changes on every new game, so a hand still playing out can tell it's stale.
  let gen = 0, hands, taken, trick, leader, turn, broken, trickNo, handNo = 0, totals, history, phase = 'idle';
  let picked = new Set(), received = new Set(), cursor = 0, played = new Set();
  let cw = 71, ch = 96, ocw = 43, och = 58, gap = 8;

  const name = p => p === 0 ? prefs.name || 'You' : prefs.names[p - 1] || NAMES[p - 1];
  const say = t => { msgEl.textContent = t; };
  const pause = ms => wait(reducedMotion.matches ? Math.min(ms, 150) : ms);

  // ---------- table layout ----------
  function measure() {
    const W = board.clientWidth || 620, H = board.clientHeight || 420;
    gap = W < 500 ? 6 : 10;
    cw = clamp(Math.floor(Math.min(W / 6.5, H / 6.2)), 34, 142);
    ch = Math.round(cw * 96 / 71);
    ocw = Math.round(cw * .62); och = Math.round(ch * .62);
    board.style.setProperty('--cw', cw + 'px');
    board.style.setProperty('--ch', ch + 'px');
    return { W, H };
  }

  // Where everything sits: one fan per player and a cross of cards in the middle.
  function geometry() {
    const { W, H } = measure();
    const lh = 16, raise = Math.round(ch * .22);
    const topY = gap + lh, handY = H - ch - gap;
    const midTop = topY + och + gap, midBot = handY - raise - lh - gap;
    const cy = Math.round((midTop + midBot) / 2), cx = Math.round(W / 2);
    const d = Math.round(Math.min(ch * .32, Math.max(8, (midBot - midTop - ch) / 2)));
    const dx = Math.round(cw * .62);
    const spots = [[0, d], [-dx, 0], [0, -d], [dx, 0]].map(([x, y]) => ({ x: cx - cw / 2 + x, y: cy - ch / 2 + y }));
    return { W, H, lh, raise, topY, handY, cx, cy, spots };
  }

  function fan(p, n, g) {
    const { W, H } = g;
    if (p === 0) {
      const step = n > 1 ? Math.min(Math.round(cw * .45), (W - 2 * gap - cw) / (n - 1)) : 0;
      const x0 = (W - cw - step * (n - 1)) / 2;
      return { at: i => ({ x: Math.round(x0 + i * step), y: g.handY }), box: { x: x0, y: g.handY, w: cw + step * (n - 1) } };
    }
    if (p === 2) {
      const step = Math.round(ocw * .32), x0 = (W - ocw - step * Math.max(0, n - 1)) / 2;
      return { at: i => ({ x: Math.round(x0 + i * step), y: g.topY }), box: { x: x0, y: g.topY, w: ocw + step * Math.max(0, n - 1) } };
    }
    const avail = g.handY - g.raise - g.topY - och - g.lh - 2 * gap;
    const step = Math.max(3, Math.min(Math.round(och * .22), Math.floor((avail - och) / 12)));
    const y0 = Math.round(g.cy - (och + step * Math.max(0, n - 1)) / 2);
    const x = p === 1 ? gap : W - gap - ocw;
    return { at: i => ({ x, y: y0 + i * step }), box: { x, y: y0, w: ocw } };
  }

  function put(c, x, y, z, small) {
    const s = c.el.style;
    s.left = x + 'px'; s.top = y + 'px'; s.zIndex = z;
    if (small) { s.setProperty('--cw', ocw + 'px'); s.setProperty('--ch', och + 'px'); }
    else { s.removeProperty('--cw'); s.removeProperty('--ch'); }
  }

  function render() {
    if (!hands) return;
    const g = geometry();
    for (let p = 0; p < 4; p++) {
      const f = fan(p, hands[p].length, g);
      hands[p].forEach((c, i) => {
        const { x, y } = f.at(i);
        const up = p === 0 && (picked.has(c) || received.has(c));
        put(c, x, y - (up ? g.raise : 0), 10 + i, p !== 0);
        c.el.classList.toggle('up', p === 0);
        c.el.classList.toggle('focus', p === 0 && i === cursor && board.matches(':focus-visible'));
        c.el.setAttribute('aria-label', p === 0 ? cardName(c) : 'card');
      });
      const l = labels[p];
      l.textContent = name(p);
      if (p === 0) Object.assign(l.style, { left: f.box.x + 'px', top: g.handY - g.raise - g.lh + 'px', right: '', textAlign: '' });
      else if (p === 2) Object.assign(l.style, { left: f.box.x + 'px', top: gap - 2 + 'px', right: '', textAlign: '' });
      else Object.assign(l.style, { left: p === 1 ? gap + 'px' : '', right: p === 3 ? gap + 'px' : '', top: f.box.y - g.lh + 'px', textAlign: p === 3 ? 'right' : '' });
    }
    trick.forEach((t, i) => { const s = g.spots[t.p]; put(t.c, s.x, s.y, 100 + i); t.c.el.classList.add('up'); });
    btn.style.left = g.cx + 'px';
    btn.style.top = g.cy + 'px';
  }

  // ---------- rules ----------
  function legal(p) {
    const hand = hands[p];
    if (!trick.length) {
      if (trickNo === 0) return hand.includes(twoClubs) ? [twoClubs] : hand;
      const safe = hand.filter(c => c.s !== HEARTS);
      return broken || !safe.length ? hand : safe;
    }
    const led = trick[0].c.s;
    const follow = hand.filter(c => c.s === led);
    if (follow.length) return follow;
    if (trickNo === 0) {
      const clean = hand.filter(c => !points(c));
      if (clean.length) return clean;
    }
    return hand;
  }

  // Why a card you picked can't be played.
  function why() {
    if (!trick.length) return trickNo === 0 ? 'You must lead the two of clubs.' : 'Hearts have not been broken yet.';
    if (hands[0].some(x => x.s === trick[0].c.s)) return `You must follow suit. ${SUIT_NAMES[trick[0].c.s][0].toUpperCase() + SUIT_NAMES[trick[0].c.s].slice(1)} were led.`;
    return 'You can\'t play points on the first trick.';
  }

  const winnerOf = t => t.filter(x => x.c.s === t[0].c.s).reduce((a, b) => (b.c.v > a.c.v ? b : a)).p;

  // ---------- the computer players ----------
  function choosePass(p) {
    const hand = hands[p];
    const count = s => hand.filter(c => c.s === s).length;
    const lowSpades = hand.filter(c => c.s === SPADES && c.v < 12).length;
    const danger = c => {
      let d = c.v;
      if (c.s === SPADES) d = c.v >= 12 ? (lowSpades >= 4 ? 0 : 40 + c.v) : -5;
      else if (c.s === HEARTS) d += 3;
      else if (count(c.s) <= 2) d += 6;  // short suits are worth emptying
      return d;
    };
    return hand.slice().sort((a, b) => danger(b) - danger(a)).slice(0, 3);
  }

  function choosePlay(p) {
    const hand = hands[p], opts = legal(p);
    if (opts.length === 1) return opts[0];
    const count = s => hand.filter(c => c.s === s).length;
    const qsGone = played.has(cards[SPADES * 13 + 11]), holdsQS = hand.some(isQS);
    if (!trick.length) {
      // Lead low, from short suits, and dig the queen of spades out when it's safe to.
      const cost = c => {
        let k = c.v * 2 + count(c.s);
        if (c.s === SPADES) k += c.v >= 12 && !qsGone ? 60 : (!qsGone && !holdsQS ? -8 : 0);
        if (c.s === HEARTS) k += 6;
        return k;
      };
      return opts.reduce((a, b) => (cost(b) < cost(a) ? b : a));
    }
    const led = trick[0].c.s;
    const win = trick.filter(t => t.c.s === led).reduce((a, b) => (b.c.v > a.c.v ? b : a)).c;
    const pts = trick.some(t => points(t.c));
    const last = trick.length === 3;
    if (opts[0].s === led) {
      const under = opts.filter(c => c.v < win.v);
      if (under.length) return highest(under);
      // Going to win it anyway.
      const noQ = opts.filter(c => !isQS(c));
      if (!noQ.length) return opts[0];
      if (last && !pts) return highest(noQ);
      if (led === HEARTS) return lowest(noQ);
      return trickNo < 4 ? highest(noQ) : lowest(noQ);
    }
    // Can't follow: dump the worst card.
    const qs = opts.find(isQS);
    if (qs) return qs;
    if (!qsGone && !holdsQS) {
      const big = opts.filter(c => c.s === SPADES && c.v > 12);
      if (big.length) return highest(big);
    }
    const hearts = opts.filter(c => c.s === HEARTS);
    if (hearts.length) return highest(hearts);
    return opts.reduce((a, b) => (b.v * 2 - count(b.s) > a.v * 2 - count(a.s) ? b : a));
  }

  // ---------- a game ----------
  function newGame() {
    gen++;
    totals = [0, 0, 0, 0]; history = []; handNo = 0;
    closeDialogs();
    deal();
  }

  function deal() {
    const deck = cards.slice();
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    hands = [0, 1, 2, 3].map(p => deck.slice(p * 13, p * 13 + 13));
    taken = [[], [], [], []]; trick = []; trickNo = 0; broken = false;
    picked = new Set(); received = new Set(); played = new Set(); cursor = 0;
    cards.forEach(c => { c.el.hidden = false; c.el.classList.remove('up'); });
    sortHand();
    const pass = PASS[handNo % 4];
    if (pass.name === 'hold') {
      btn.hidden = true;
      render();
      startPlay('There is no passing this hand. ');
      return;
    }
    phase = 'pass';
    btn.textContent = pass.label;
    btn.hidden = false;
    btn.disabled = true;
    render();
    say(`Select three cards to pass to the ${pass.name}.`);
  }

  function sortHand() {
    hands[0].sort((a, b) => SORT[a.s] - SORT[b.s] || a.v - b.v);
  }

  async function doPass() {
    const pass = PASS[handNo % 4];
    const g = gen;
    const out = [[...picked], choosePass(1), choosePass(2), choosePass(3)];
    out.forEach((cs, p) => {
      hands[p] = hands[p].filter(c => !cs.includes(c));
    });
    out.forEach((cs, p) => { hands[(p + pass.to) % 4].push(...cs); });
    picked = new Set();
    received = new Set(out[(4 - pass.to) % 4]);
    sortHand();
    phase = 'passed';
    btn.textContent = 'OK';
    btn.disabled = false;
    render();
    if (g !== gen) return;
    say(`${name((4 - pass.to) % 4)} passed you these cards. Click OK to start.`);
    btn.focus();
  }

  function startPlay(prefix = '') {
    received = new Set();
    if (document.activeElement === btn) board.focus({ preventScroll: true });
    btn.hidden = true;
    leader = hands.findIndex(hd => hd.includes(twoClubs));
    turn = leader;
    render();
    run(prefix);
  }

  // Plays computer turns until it's yours or the hand is over.
  async function run(prefix = '') {
    const g = gen;
    for (;;) {
      if (g !== gen) return;
      if (turn === 0) {
        phase = 'play';
        say(prefix + (trickNo === 0 && !trick.length ? 'Lead the two of clubs.' : trick.length ? 'Select a card to play.' : 'It\'s your lead. Select a card to play.'));
        if (win.el.contains(document.activeElement)) board.focus({ preventScroll: true });
        return;
      }
      phase = 'wait';
      say(prefix + `Waiting for ${name(turn)} to play.`);
      prefix = '';
      await pause(380);
      if (g !== gen) return;
      if (await play(turn, choosePlay(turn), g)) return;
    }
  }

  // Plays a card; resolves true when that ended the hand (or the game went away).
  async function play(p, c, g) {
    hands[p].splice(hands[p].indexOf(c), 1);
    trick.push({ p, c });
    played.add(c);
    if (c.s === HEARTS && !broken) broken = true;
    if (p === 0) cursor = Math.min(cursor, hands[0].length - 1);
    render();
    if (trick.length < 4) { turn = (p + 1) % 4; return false; }
    phase = 'wait';
    const w = winnerOf(trick);
    await pause(700);
    if (g !== gen) return true;
    say(`${name(w)} won the trick.`);
    // Sweep the trick over to whoever took it.
    const geo = geometry(), f = fan(w, hands[w].length || 1, geo);
    const dest = { x: f.box.x + (w === 0 || w === 2 ? f.box.w / 2 - cw / 2 : 0), y: f.box.y };
    trick.forEach((t, i) => put(t.c, Math.round(dest.x), Math.round(dest.y), 150 + i, w !== 0));
    await pause(320);
    if (g !== gen) return true;
    taken[w].push(...trick.map(t => t.c));
    trick.forEach(t => { t.c.el.hidden = true; });
    trick = [];
    trickNo++;
    leader = turn = w;
    render();
    if (trickNo === 13) { endHand(g); return true; }
    return false;
  }

  async function endHand(g) {
    phase = 'wait';
    let pts = taken.map(cs => cs.reduce((n, c) => n + points(c), 0));
    const moon = pts.indexOf(26);
    if (moon >= 0) pts = pts.map((_, p) => (p === moon ? 0 : 26));
    pts.forEach((n, p) => { totals[p] += n; });
    history.push(pts);
    const note = moon < 0 ? null : moon === 0 ? 'You shot the moon!' : `${name(moon)} shot the moon!`;
    say(note || 'The hand is over.');
    await pause(400);
    if (g !== gen) return;
    await scoreSheet(note);
    if (g !== gen) return;
    if (totals.some(t => t >= 100)) {
      phase = 'over';
      const best = Math.min(...totals);
      const winners = [0, 1, 2, 3].filter(p => totals[p] === best);
      const text = winners.includes(0)
        ? (winners.length > 1 ? 'You tied for the win' : 'You win') + ` with ${best} points!`
        : `${winners.map(name).join(' and ')} win${winners.length > 1 ? '' : 's'} with ${best} points.`;
      say('Game over.');
      const b = await msgbox({ title: 'Hearts', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: `Game over. ${text}\n\nDo you want to play again?` });
      if (g !== gen) return;
      if (b === 'Yes') newGame();
      else say('Game over. Press F2 to start a new game.');
      return;
    }
    handNo++;
    deal();
  }

  // ---------- dialogs ----------
  let scoreWin = null;
  function closeDialogs() { if (scoreWin) scoreWin.close(true); }

  function scoreSheet(note) {
    return new Promise(resolve => {
      if (scoreWin) scoreWin.close(true);
      const run = [0, 0, 0, 0];
      const rows = history.map(pts => h('tr', null, pts.map((n, p) => { run[p] += n; return h('td', null, run[p]); })));
      const body = h('div', { class: 'dlg hr-score' },
        note ? h('p', { class: 'hr-moon' }, note) : null,
        h('div', { class: 'hr-sheet' },
          h('table', null,
            h('thead', null, h('tr', null, [0, 1, 2, 3].map(p => h('th', null, name(p))))),
            h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: 4 }, 'No hands played yet.'))))),
        h('div', { class: 'btns' }, h('button', { class: 'btn default', type: 'button', onclick: () => d.close() }, 'OK')));
      body.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); d.close(); } });
      const d = scoreWin = createWindow({
        title: 'Hearts Score Sheet', body, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false,
        onClosed: () => { if (scoreWin === d) scoreWin = null; resolve(); },
      });
      const sheet = body.querySelector('.hr-sheet');
      sheet.scrollTop = sheet.scrollHeight;
      body.querySelector('.default').focus();
    });
  }

  function options() {
    const field = (label, v) => h('label', { class: 'hr-of' }, h('span', { html: label }), h('input', { class: 'field', value: v, maxlength: 16 }));
    const form = h('form', { class: 'dlg hr-opts' },
      h('fieldset', { class: 'group' }, h('legend', null, 'Player'), field('<u>N</u>ame:', prefs.name)),
      h('fieldset', { class: 'group' }, h('legend', null, 'Computer player names'),
        field('<u>L</u>eft:', name(1)), field('<u>A</u>cross:', name(2)), field('<u>R</u>ight:', name(3))),
      h('div', { class: 'btns right' },
        h('button', { class: 'btn default', type: 'submit' }, 'OK'),
        h('button', { class: 'btn', type: 'button', onclick: () => d.close(true) }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = [...form.querySelectorAll('input')].map(i => i.value.trim());
      prefs.name = v[0];
      prefs.names = v.slice(1).map((n, i) => n || NAMES[i]);
      store.set(PREFS, prefs);
      d.close(true);
      render();
    });
    form.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); d.close(true); }
      // Alt plus an underlined letter jumps to that field.
      const l = e.altKey && [...form.querySelectorAll('.hr-of')].find(l => l.querySelector('u').textContent.toLowerCase() === e.key.toLowerCase());
      if (l) { e.preventDefault(); l.querySelector('input').select(); }
    });
    const d = createWindow({ title: 'Hearts Options', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    form.querySelector('input').select();
  }

  // ---------- your moves ----------
  function choose(c) {
    if (!hands || !hands[0].includes(c)) return;
    cursor = hands[0].indexOf(c);
    if (phase === 'pass') {
      if (picked.has(c)) picked.delete(c);
      else if (picked.size < 3) picked.add(c);
      btn.disabled = picked.size !== 3;
      render();
      return;
    }
    if (phase === 'passed') { startPlay(); return; }
    if (phase !== 'play') return;
    if (!legal(0).includes(c)) { say(why()); return; }
    phase = 'wait';
    const g = gen;
    play(0, c, g).then(done => { if (!done && g === gen) run(); });
  }

  btn.addEventListener('click', () => {
    if (phase === 'pass' && picked.size === 3) doPass();
    else if (phase === 'passed') startPlay();
  });
  board.addEventListener('click', e => {
    const el = e.target.closest('.cd');
    if (el) choose(cards[+el.dataset.id]);
  });
  board.addEventListener('contextmenu', e => e.preventDefault());
  // Arrow keys walk along your hand; Enter or Space picks the card.
  board.addEventListener('keydown', e => {
    if (!hands || !hands[0].length || e.target !== board) return;
    const n = hands[0].length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') cursor = clamp(cursor + (e.key === 'ArrowLeft' ? -1 : 1), 0, n - 1);
    else if (e.key === 'Home') cursor = 0;
    else if (e.key === 'End') cursor = n - 1;
    else if (e.key === 'Enter' || e.key === ' ') {
      if (phase === 'pass' && picked.size === 3 && e.key === 'Enter') { doPass(); e.preventDefault(); return; }
      choose(hands[0][clamp(cursor, 0, n - 1)]);
    } else return;
    e.preventDefault();
    render();
  });
  board.addEventListener('focus', () => render());
  board.addEventListener('blur', () => render());

  const root = h('div', { class: 'hr' });
  root.addEventListener('keydown', e => {
    if (e.key === 'F2') { e.preventDefault(); newGame(); }
    if (e.key === 'F3') { e.preventDefault(); scoreSheet(); }
  });

  // ---------- menus ----------
  const bar = menubar([
    { label: '&Game', items: () => [
      { label: '&New Game', key: 'F2', action: newGame },
      '-',
      { label: '&Score...', key: 'F3', action: () => scoreSheet() },
      { label: '&Options...', action: options },
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Help', items: () => [
      { label: '&Contents', key: 'F1', action: () => launch('help', 'Hearts') },
      '-',
      { label: '&About Hearts...', action: () => about('Hearts', 'i-hearts', win) },
    ] },
  ]);
  root.append(bar, board, status);

  const win = createWindow({
    app: 'hearts', title: 'Hearts', icon: 'i-hearts', body: root,
    width: 640, height: 500, minW: 300, minH: 320, route: 'hearts', autofocus: '.hr-board',
    onResize: () => render(),
    onClosed: () => { gen++; },
  });
  newGame();
  new ResizeObserver(() => render()).observe(board);
  // Like the Hearts Network, ask who's playing the first time.
  if (!prefs.name) {
    inputbox({ title: 'blankiekun Hearts Network', label: 'What is your name?', parent: win }).then(v => {
      prefs.name = (v || '').trim().slice(0, 16) || 'You';
      store.set(PREFS, prefs);
      render();
      board.focus({ preventScroll: true });
    });
  }
  return win;
}

export default { id: 'hearts', title: 'Hearts', icon: 'i-hearts', single: true, open };
