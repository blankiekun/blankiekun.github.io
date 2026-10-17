// Reversi, the game that came with Windows 1.0 and 2.0 (3.1 swapped it for Minesweeper).
// You are black and move first; the computer plays white.

import { h } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';

const N = 8, DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export function startBoard() {
  const b = Array(N * N).fill(0);
  b[27] = b[36] = 2; b[28] = b[35] = 1;   // 1 black, 2 white
  return b;
}

// The squares a move at i would turn over for player p (empty when the move isn't legal).
export function flips(b, i, p) {
  if (b[i]) return [];
  const out = [], r0 = i / N | 0, c0 = i % N;
  for (const [dr, dc] of DIRS) {
    const run = [];
    let r = r0 + dr, c = c0 + dc;
    while (r >= 0 && r < N && c >= 0 && c < N && b[r * N + c] === 3 - p) { run.push(r * N + c); r += dr; c += dc; }
    if (run.length && r >= 0 && r < N && c >= 0 && c < N && b[r * N + c] === p) out.push(...run);
  }
  return out;
}

export const moves = (b, p) => b.map((_, i) => i).filter(i => flips(b, i, p).length);

// Corners are worth most and the squares next to them least; then more pieces turned beats fewer.
const WEIGHT = [100, -20, 10, 5, 5, 10, -20, 100, -20, -50, -2, -2, -2, -2, -50, -20, 10, -2, 1, 1, 1, 1, -2, 10, 5, -2, 1, 0, 0, 1, -2, 5];
const weight = i => { const r = i / N | 0, c = i % N; return WEIGHT[(r < 4 ? r : 7 - r) * N + (c < 4 ? c : 7 - c)]; };
export function pick(b, p, skill) {
  const ms = moves(b, p);
  if (!ms.length) return -1;
  if (skill === 'beginner') return ms[Math.random() * ms.length | 0];
  return ms.reduce((best, i) => {
    const s = weight(i) + flips(b, i, p).length;
    return s > best.s ? { i, s } : best;
  }, { i: -1, s: -Infinity }).i;
}

{
  const b = startBoard();
  console.assert(moves(b, 1).join() === '19,26,37,44', 'reversi: black opens with four moves');
  console.assert(flips(b, 19, 1).join() === '27', 'reversi: d3 turns over d4');
  console.assert(pick(b, 1, 'expert') >= 0, 'reversi: the computer finds a move');
}

function open() {
  let board = startBoard(), skill = 'expert', busy = false;
  const cells = board.map((_, i) => h('button', { class: 'rv-cell', type: 'button', 'aria-label': 'ABCDEFGH'[i % N] + (1 + (i / N | 0)), onclick: () => play(i) }, h('i')));
  const grid = h('div', { class: 'rv-board', role: 'grid' }, ...cells);
  const status = h('div', { class: 'statusbar' }, h('span'));

  function render(hint = -1) {
    board.forEach((v, i) => { cells[i].dataset.v = v; cells[i].classList.toggle('hint', i === hint); });
    const black = board.filter(v => v === 1).length, white = board.filter(v => v === 2).length;
    status.firstChild.textContent = `You (black): ${black}    Computer (white): ${white}`;
  }
  function place(i, p) { for (const j of [i, ...flips(board, i, p)]) board[j] = p; }
  function over() {
    const black = board.filter(v => v === 1).length, white = board.filter(v => v === 2).length;
    const text = black > white ? `You won ${black} to ${white}!` : black < white ? `The computer won ${white} to ${black}.` : `It's a tie, ${black} each.`;
    msgbox({ title: 'Reversi', icon: 'info', text, parent: win });
  }
  async function computer() {
    busy = true;
    // The computer keeps moving while you have nowhere to go.
    do {
      await new Promise(r => setTimeout(r, 400));
      if (!win.el.isConnected) return;
      const i = pick(board, 2, skill);
      if (i < 0) break;
      place(i, 2); render();
    } while (!moves(board, 1).length && moves(board, 2).length);
    busy = false;
    if (!moves(board, 1).length) over();
  }
  function play(i) {
    if (busy) return;
    if (!flips(board, i, 1).length) { msgbox({ title: 'Reversi', icon: 'warn', text: 'You may only move to a space where the cursor is a cross.', parent: win }); return; }
    place(i, 1); render();
    if (moves(board, 2).length) computer(); else if (!moves(board, 1).length) over();
  }
  function pass() {
    if (busy) return;
    if (moves(board, 1).length) { msgbox({ title: 'Reversi', icon: 'warn', text: 'You may not pass. Move where the cursor is a cross.', parent: win }); return; }
    computer();
  }
  function hint() { if (!busy) render(pick(board, 1, 'expert')); }

  const bar = menubar([
    { label: '&Game', items: () => [
      { label: '&Hint', action: hint },
      { label: '&Pass', action: pass },
      { label: '&New', action: () => { if (!busy) { board = startBoard(); render(); } } }, '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Skill', items: () => [
      { label: '&Beginner', radio: true, checked: skill === 'beginner', action: () => { skill = 'beginner'; } },
      { label: '&Expert', radio: true, checked: skill === 'expert', action: () => { skill = 'expert'; } },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') }, '-',
      { label: '&About Reversi', action: () => about('Reversi', 'i-reversi', win) },
    ] },
  ]);
  grid.addEventListener('pointermove', e => {
    const c = e.target.closest('.rv-cell');
    grid.classList.toggle('can', !!c && !busy && flips(board, cells.indexOf(c), 1).length > 0);
  });
  const body = h('div', { class: 'rv' }, bar, grid, status);
  const win = createWindow({ app: 'reversi', title: 'Reversi', icon: 'i-reversi', body, width: 320, height: 370, minW: 200, minH: 230, route: 'reversi' });
  render();
  return win;
}

export default { id: 'reversi', title: 'Reversi', icon: 'i-reversi', open };
