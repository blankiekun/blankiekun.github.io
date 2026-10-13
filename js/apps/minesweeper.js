// Minesweeper.

import { h, store, clamp } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';

const LEVELS = {
  beginner: { w: 9, h: 9, m: 10, label: 'Beginner' },
  intermediate: { w: 16, h: 16, m: 40, label: 'Intermediate' },
  expert: { w: 30, h: 16, m: 99, label: 'Expert' },
};
const BEST = 'w95.winmine.best';
const PREFS = 'w95.winmine.prefs';

// Seven-segment display: three digits, unlit segments stay faintly visible.
const SEG = {
  a: '1,1 12,1 10,3 3,3', b: '12,2 12,10 10,9 10,4', c: '12,12 12,21 10,19 10,13',
  d: '3,19 10,19 12,21 1,21', e: '1,12 3,13 3,19 1,21', f: '1,2 3,4 3,9 1,10', g: '2,11 3,10 10,10 11,11 10,12 3,12',
};
const DIGITS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g' };
function sevenSeg(n) {
  const s = n < 0 ? '-' + String(Math.min(99, -n)).padStart(2, '0') : String(Math.min(999, n)).padStart(3, '0');
  let out = '';
  [...s].forEach((ch, i) => {
    for (const [k, pts] of Object.entries(SEG)) {
      out += `<polygon transform="translate(${i * 13} 0)" points="${pts}" fill="${DIGITS[ch].includes(k) ? '#ff0000' : '#4a0000'}"/>`;
    }
  });
  return `<svg viewBox="0 0 39 23" width="39" height="23" shape-rendering="crispEdges" aria-hidden="true">${out}</svg>`;
}

function open() {
  const prefs = { level: 'beginner', marks: true, color: true, custom: { w: 20, h: 12, m: 30 }, ...store.get(PREFS, {}) };
  let cfg, cells, state, opened, flags, timer, seconds, pressed = [], chording = false;

  const counter = h('div', { class: 'ms-led', 'aria-label': 'Mines left', role: 'status' });
  const clock = h('div', { class: 'ms-led', 'aria-label': 'Seconds' });
  const face = h('button', { class: 'ms-face smile', type: 'button', 'aria-label': 'New game' });
  const board = h('div', { class: 'ms-board', role: 'grid', 'aria-label': 'Minefield', tabindex: '0' });
  const root = h('div', { class: 'ms' + (prefs.color ? '' : ' mono') },
    h('div', { class: 'ms-top' }, counter, face, clock), board);

  function levelCfg() { return prefs.level === 'custom' ? { ...prefs.custom } : LEVELS[prefs.level]; }

  function newGame() {
    cfg = levelCfg();
    clearInterval(timer);
    timer = null; seconds = 0; opened = 0; flags = 0; state = 'ready';
    cells = Array.from({ length: cfg.w * cfg.h }, (_, i) => ({ i, x: i % cfg.w, y: Math.floor(i / cfg.w), mine: false, n: 0, open: false, mark: 0 }));
    board.style.gridTemplateColumns = `repeat(${cfg.w}, 16px)`;
    board.replaceChildren(...cells.map(c => (c.el = h('div', { class: 'c', role: 'gridcell', 'data-i': c.i }))));
    setFace('smile');
    updateCounters();
    if (win) win.fit();
  }

  function neighbors(c) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = c.x + dx, y = c.y + dy;
      if (x >= 0 && y >= 0 && x < cfg.w && y < cfg.h) out.push(cells[y * cfg.w + x]);
    }
    return out;
  }

  // Mines go down on the first click, never on or next to that square.
  function layMines(first) {
    const safe = new Set([first, ...neighbors(first)]);
    let pool = cells.filter(c => !safe.has(c));
    if (pool.length < cfg.m) pool = cells.filter(c => c !== first);
    for (let k = 0; k < cfg.m; k++) {
      const j = k + Math.floor(Math.random() * (pool.length - k));
      [pool[k], pool[j]] = [pool[j], pool[k]];
      pool[k].mine = true;
    }
    cells.forEach(c => { c.n = neighbors(c).filter(n => n.mine).length; });
    state = 'playing';
    timer = setInterval(() => { seconds = Math.min(999, seconds + 1); updateCounters(); }, 1000);
    seconds = 1;
  }

  function paint(c) {
    let cls = 'c';
    if (c.open) cls += c.mine ? ' o m' + (c.hit ? ' hit' : '') : ' o n' + c.n;
    else if (c.wrong) cls += ' o m wrong';
    else if (c.mark === 1) cls += ' f';
    else if (c.mark === 2) cls += ' q';
    if (c.down) cls += ' down';
    c.el.className = cls;
    c.el.textContent = c.open && !c.mine && c.n ? c.n : '';
  }

  function updateCounters() {
    counter.innerHTML = sevenSeg(cfg.m - flags);
    clock.innerHTML = sevenSeg(seconds);
  }
  function setFace(f) { face.className = 'ms-face ' + f; }

  function reveal(c) {
    if (state === 'won' || state === 'lost' || c.open || c.mark === 1) return;
    if (state === 'ready') layMines(c);
    if (c.mine) return lose(c);
    const stack = [c];
    while (stack.length) {
      const cur = stack.pop();
      if (cur.open || cur.mark === 1) continue;
      cur.open = true; cur.mark = 0; opened++;
      paint(cur);
      if (cur.n === 0) for (const n of neighbors(cur)) if (!n.open && !n.mine) stack.push(n);
    }
    updateCounters();
    if (opened === cells.length - cfg.m) win_();
  }

  function chord(c) {
    if (!c.open || !c.n || state !== 'playing') return;
    const ns = neighbors(c);
    if (ns.filter(n => n.mark === 1).length !== c.n) return;
    for (const n of ns) if (!n.open && n.mark !== 1) { reveal(n); if (state !== 'playing') return; }
  }

  function toggleMark(c) {
    if (c.open || state === 'won' || state === 'lost') return;
    const prev = c.mark;
    c.mark = prev === 0 ? 1 : prev === 1 ? (prefs.marks ? 2 : 0) : 0;
    flags += (c.mark === 1) - (prev === 1);
    paint(c);
    updateCounters();
  }

  function lose(hit) {
    state = 'lost';
    clearInterval(timer);
    hit.hit = true;
    cells.forEach(c => {
      if (c.mine && c.mark !== 1) c.open = true;
      if (!c.mine && c.mark === 1) c.wrong = true;
      paint(c);
    });
    setFace('dead');
  }

  async function win_() {
    state = 'won';
    clearInterval(timer);
    cells.forEach(c => { if (c.mine) { c.mark = 1; paint(c); } });
    flags = cfg.m;
    updateCounters();
    setFace('cool');
    if (prefs.level === 'custom') return;
    const best = store.get(BEST, {});
    const prev = best[prefs.level];
    if (!prev || seconds < prev.t) {
      const nameInput = h('input', { class: 'field', value: (prev && prev.name) || 'Anonymous', style: { width: '100%' } });
      const form = h('form', { class: 'dlg', style: { width: '260px', textAlign: 'center' } },
        h('p', { style: { margin: 0 } }, `You have the fastest time for ${LEVELS[prefs.level].label.toLowerCase()} level. Please enter your name.`),
        nameInput, h('div', { class: 'btns' }, h('button', { class: 'btn default', type: 'submit' }, 'OK')));
      form.addEventListener('submit', e => {
        e.preventDefault();
        best[prefs.level] = { t: seconds, name: nameInput.value.trim() || 'Anonymous' };
        store.set(BEST, best);
        d.close(true);
        bestTimes();
      });
      const d = createWindow({ title: 'Congratulations', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
      nameInput.select();
    }
  }

  function bestTimes() {
    const best = store.get(BEST, {});
    const rows = Object.entries(LEVELS).map(([k, l]) => h('tr', null, h('td', null, l.label + ':'), h('td', { class: 'num' }, (best[k] ? best[k].t : 999) + ' seconds'), h('td', null, best[k] ? best[k].name : 'Anonymous')));
    const body = h('div', { class: 'dlg' },
      h('fieldset', { class: 'group' }, h('legend', null, 'Fastest Mine Sweepers'), h('table', { class: 'ms-best' }, ...rows)),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', type: 'button', onclick: () => { store.set(BEST, {}); d.close(true); bestTimes(); } }, h('span', { html: '<u>R</u>eset Scores' })),
        h('button', { class: 'btn default', type: 'button', onclick: () => d.close(true) }, 'OK')));
    const d = createWindow({ title: 'Fastest Mine Sweepers', body, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    body.querySelector('.default').focus();
  }

  function customDialog() {
    const f = (label, v, id) => h('label', { class: 'ms-cf' }, h('span', { html: label }), h('input', { class: 'field', type: 'number', id, value: v, inputmode: 'numeric' }));
    const form = h('form', { class: 'dlg ms-custom' },
      h('div', { class: 'row' },
        h('div', { class: 'ms-cfs' }, f('<u>H</u>eight:', cfg.h, 'ms-h'), f('<u>W</u>idth:', cfg.w, 'ms-w'), f('<u>M</u>ines:', cfg.m, 'ms-m')),
        h('div', { class: 'btns', style: { flexDirection: 'column' } },
          h('button', { class: 'btn default', type: 'submit' }, 'OK'),
          h('button', { class: 'btn', type: 'button', onclick: () => d.close(true) }, 'Cancel'))));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const hh = clamp(+form.querySelector('#ms-h').value || 9, 9, 24);
      const ww = clamp(+form.querySelector('#ms-w').value || 9, 9, 30);
      const mm = clamp(+form.querySelector('#ms-m').value || 10, 10, (ww - 1) * (hh - 1));
      prefs.level = 'custom'; prefs.custom = { w: ww, h: hh, m: mm };
      store.set(PREFS, prefs);
      d.close(true);
      newGame();
    });
    const d = createWindow({ title: 'Custom Field', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    form.querySelector('input').select();
  }

  function setLevel(l) { prefs.level = l; store.set(PREFS, prefs); newGame(); }

  const bar = menubar([
    { label: '&Game', items: () => [
      { label: '&New', key: 'F2', action: newGame },
      '-',
      ...Object.entries(LEVELS).map(([k, l]) => ({ label: '&' + l.label, checked: prefs.level === k, action: () => setLevel(k) })),
      { label: '&Custom...', checked: prefs.level === 'custom', action: customDialog },
      '-',
      { label: '&Marks (?)', checked: prefs.marks, action: () => { prefs.marks = !prefs.marks; store.set(PREFS, prefs); } },
      { label: 'Co&lor', checked: prefs.color, action: () => { prefs.color = !prefs.color; root.classList.toggle('mono', !prefs.color); store.set(PREFS, prefs); } },
      '-',
      { label: 'Best &Times...', action: bestTimes },
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Help', items: () => [
      { label: '&Contents', key: 'F1', action: () => launch('help', 'Minesweeper') },
      '-',
      { label: '&About Minesweeper...', action: () => about('Minesweeper', 'i-mine', win) },
    ] },
  ]);

  // ---------- pointer handling ----------
  // Left presses a square. Both buttons together (or the middle one) press its
  // neighbours too and, on release, open them if the flags add up. A second
  // button arrives as a pointermove with a new `buttons` mask, not a pointerdown.
  let longPress = null, longFired = false, spent = false;
  const over = () => state === 'won' || state === 'lost';
  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el && el.dataset && el.dataset.i != null && board.contains(el) ? cells[+el.dataset.i] : null;
  };
  function press(c) {
    pressed.forEach(p => { p.down = false; paint(p); });
    pressed = [];
    if (!c || over()) return;
    const set = chording ? [c, ...neighbors(c)] : [c];
    for (const p of set) if (!p.open && p.mark !== 1) { p.down = true; paint(p); pressed.push(p); }
  }
  function release() {
    press(null);
    chording = false;
    if (!over()) setFace('smile');
  }

  board.addEventListener('contextmenu', e => e.preventDefault());
  board.addEventListener('pointerdown', e => {
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    e.preventDefault();
    board.setPointerCapture(e.pointerId);
    spent = false;
    if (e.pointerType === 'touch') {
      longFired = false;
      longPress = setTimeout(() => { longFired = true; press(null); toggleMark(c); if (navigator.vibrate) navigator.vibrate(20); }, 380);
    }
    if (e.button === 2) { toggleMark(c); spent = true; return; }
    if (over()) return;
    chording = e.button === 1;
    setFace('ooh');
    press(c);
  });
  board.addEventListener('pointermove', e => {
    if (!e.buttons) return;
    const c = cellAt(e.clientX, e.clientY);
    if (longPress && (!c || pressed[0] !== c)) { clearTimeout(longPress); longPress = null; }
    if (over()) return;
    const both = (e.buttons & 3) === 3 || (e.buttons & 4) === 4;
    if (both && !chording) { chording = true; spent = false; setFace('ooh'); }
    else if (!both && chording) {
      // One of the two buttons came up: that's the chord click.
      if (c) chord(c);
      spent = true;
      release();
      return;
    }
    if (!spent && (e.buttons & 1 || chording)) press(c);
  });
  board.addEventListener('pointerup', e => {
    clearTimeout(longPress); longPress = null;
    const c = cellAt(e.clientX, e.clientY);
    const wasChord = chording;
    release();
    if (over() || spent) return;
    if (longFired) { longFired = false; return; }
    if (!c) return;
    if (wasChord) chord(c);
    else if (e.button === 0) { if (c.open) chord(c); else reveal(c); }
  });
  board.addEventListener('pointercancel', () => { clearTimeout(longPress); longPress = null; release(); });

  face.addEventListener('click', newGame);
  root.addEventListener('keydown', e => {
    if (e.key === 'F2') { e.preventDefault(); newGame(); }
  });

  let win = null;
  newGame();
  win = createWindow({
    app: 'minesweeper', title: 'Minesweeper', icon: 'i-mine', body: h('div', { class: 'ms-wrap' }, bar, root),
    width: 'auto', resizable: false, maximizable: false, route: 'minesweeper',
    onClosed: () => clearInterval(timer),
  });
  return win;
}

export default { id: 'minesweeper', title: 'Minesweeper', icon: 'i-mine', single: true, open };
