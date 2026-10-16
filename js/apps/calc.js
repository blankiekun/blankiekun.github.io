// Calculator. The standard view uses immediate execution like the original:
// 2 + 3 * 4 = 20, and pressing = again repeats the last operation. The scientific
// view honours precedence (2 + 3 * 4 = 14) and adds parentheses, number bases,
// Inv/Hyp functions and the statistics box, laid out like Windows 95's calc.exe.

import { h, store } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { about } from '../dialogs.js';

const RADIX = { hex: 16, dec: 10, oct: 8, bin: 2 };
const PREFIX = { 16: '0x', 8: '0o', 2: '0b' };
const BITS = { dword: 32, word: 16, byte: 8 };
const TURN = { deg: 360, rad: 2 * Math.PI, grad: 400 };
// Binding strength, loosest first: Or Xor, And, Lsh, + -, * / Mod, x^y.
const PREC = { Or: 1, Xor: 1, And: 2, Lsh: 3, Rsh: 3, '+': 4, '-': 4, '*': 5, '/': 5, Mod: 5, pow: 6, root: 6 };
const BINARY = { '+': 1, '-': 1, '*': 1, '/': 1, Mod: 1, And: 1, Or: 1, Xor: 1, Lsh: 1, 'x^y': 1 };
const DEC_ONLY = ['.', 'F-E', 'dms', 'Exp', 'sin', 'cos', 'tan', 'pi'];
const STAT_KEYS = ['Ave', 'Sum', 's', 'Dat'];
let uid = 0;

const big = n => BigInt(Math.trunc(n));

// Lanczos approximation, so n! works for fractions the way calc.exe's does.
function gamma(x) {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  x -= 1;
  let a = c[0];
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  const t = x + 7.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}
function factorial(n) {
  if (Number.isInteger(n)) {
    if (n < 0) return NaN;
    let r = 1;
    for (let i = 2; i <= n && r !== Infinity; i++) r *= i;
    return r;
  }
  return gamma(n + 1);
}

function open() {
  let display = '0', acc = null, op = null, fresh = true, mem = 0, last = null, error = false;
  const prefs = store.get('w95.calc', {});
  let grouping = !!prefs.grouping, sci = !!prefs.sci;
  // Scientific state: the base and its word size or angle unit, the Inv/Hyp boxes,
  // F-E and exponent entry, and the pending operands and operators (with '(' marks).
  let base = 'dec', angle = 'deg', word = 'dword', inv = false, hyp = false, fe = false, expMode = false;
  let vals = [], ops = [], opPending = false, lastSci = null;
  const stats = [];
  let statWin = null, statSel = -1;
  const id = ++uid;

  const screen = h('div', { class: 'field calc-display', role: 'status', 'aria-live': 'polite' }, '0.');
  const memBox = h('div', { class: 'calc-mem' });
  const parenBox = h('div', { class: 'calc-mem calc-paren' });

  const fmt = n => {
    if (!isFinite(n)) return null;
    let s = String(parseFloat(n.toPrecision(15)));
    if (s.length > 20) s = n.toExponential(10).replace(/\.?0+e/, 'e');
    return s;
  };
  const radix = () => RADIX[base];
  const value = () => base === 'dec' ? parseFloat(display) : parseInt(display, radix());
  const depth = () => ops.filter(o => o === '(').length;
  function show() {
    if (error) { screen.textContent = error; return; }
    let s = display;
    if (base !== 'dec') {
      // Hex and binary group in fours, octal in threes, like the later calc.exe.
      if (grouping) s = s.replace(base === 'oct' ? /\B(?=(\d{3})+$)/g : /\B(?=([0-9A-F]{4})+$)/g, ' ');
      screen.textContent = s;
    } else {
      if (grouping && !s.includes('e')) {
        const [i, f] = s.split('.');
        s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f != null ? '.' + f : '');
      }
      screen.textContent = s.includes('.') || s.includes('e') ? s : s + '.';
    }
    memBox.textContent = mem ? 'M' : '';
    if (sci) refresh();
  }
  function set(n) {
    const s = fmt(n);
    if (s == null) { error = n !== n ? 'Invalid input for function.' : 'Cannot divide by zero.'; display = '0'; acc = null; op = null; }
    else display = s;
    fresh = true;
  }
  const apply = (a, o, b) => o === '+' ? a + b : o === '-' ? a - b : o === '*' ? a * b : b === 0 ? Infinity : a / b;

  function press(k) {
    if (sci) return pressSci(k);
    if (error && k !== 'C' && k !== 'CE') return show();
    if (error) { error = false; }
    if (/^[0-9]$/.test(k)) {
      if (fresh) { display = k; fresh = false; }
      else if (display.replace(/[-.]/g, '').length < 16) display = display === '0' ? k : display + k;
    } else if (k === '.') {
      if (fresh) { display = '0.'; fresh = false; }
      else if (!display.includes('.')) display += '.';
    } else if ('+-*/'.includes(k)) {
      if (op && !fresh) set(apply(acc, op, value()));
      acc = value(); op = k; fresh = true; last = null;
    } else if (k === '=') {
      if (op) { const b = value(); last = [op, b]; set(apply(acc, op, b)); op = null; acc = null; }
      else if (last) set(apply(value(), last[0], last[1]));
      fresh = true;
    } else if (k === 'sqrt') { set(value() < 0 ? NaN : Math.sqrt(value())); }
    else if (k === '%') { set(acc != null ? acc * value() / 100 : 0); }
    else if (k === '1/x') { set(1 / value()); }
    else if (k === '+/-') { if (display !== '0') display = display.startsWith('-') ? display.slice(1) : '-' + display; }
    else if (k === 'C') { display = '0'; acc = null; op = null; fresh = true; last = null; error = false; }
    else if (k === 'CE') { display = '0'; fresh = true; error = false; }
    else if (k === 'Back') { if (!fresh) { display = display.slice(0, -1); if (!display || display === '-') { display = '0'; fresh = true; } } }
    else if (k === 'MC') mem = 0;
    else if (k === 'MR') { display = fmt(mem); fresh = true; }
    else if (k === 'MS') { mem = value(); fresh = true; }
    else if (k === 'M+') { mem += value(); fresh = true; }
    show();
  }

  // ---------- the scientific engine ----------

  // Outside Dec everything is an unsigned integer of the word size, so negatives
  // show as two's complement: -1 is FFFFFFFF in Hex Dword.
  const mask = n => BigInt.asUintN(BITS[word], big(n));
  const maxWord = () => (1n << BigInt(BITS[word])) - 1n;
  function fail(msg) {
    error = msg; display = '0'; vals = []; ops = []; opPending = false; expMode = false; fresh = true;
  }
  // Show a result; false (after showing the error) when it isn't a number.
  function setv(n, divZero) {
    fresh = true; expMode = false;
    if (!isFinite(n)) { fail(n !== n ? 'Invalid input for function.' : divZero ? 'Cannot divide by zero.' : 'Overflow.'); return false; }
    if (base !== 'dec') display = mask(n).toString(radix()).toUpperCase();
    else if (fe) display = parseFloat(n.toPrecision(15)).toExponential();
    else display = fmt(n);
    return true;
  }
  // Bit operations work on whole numbers of any size in Dec.
  const bits = (a, o, b) => {
    const x = big(a), y = big(b);
    if (o === 'And') return Number(x & y);
    if (o === 'Or') return Number(x | y);
    if (o === 'Xor') return Number(x ^ y);
    if (Math.abs(b) > 1100) return o === 'Lsh' === b > 0 ? (a ? a * Infinity : 0) : a < 0 ? -1 : 0;
    return Number(o === 'Lsh' ? x << y : x >> y);
  };
  function binop(a, o, b) {
    let r;
    if (o === '+') r = a + b;
    else if (o === '-') r = a - b;
    else if (o === '*') r = a * b;
    else if (o === '/') r = b === 0 ? Infinity : a / b;
    else if (o === 'Mod') r = b === 0 ? Infinity : a % b;
    else if (o === 'pow') r = Math.pow(a, b);
    else if (o === 'root') r = a < 0 && Math.abs(b % 2) === 1 ? -Math.pow(-a, 1 / b) : Math.pow(a, 1 / b);
    else r = isFinite(a) && isFinite(b) ? bits(a, o, b) : NaN;
    if (base !== 'dec' && isFinite(r)) r = Number(mask(r));
    return r;
  }
  function reduce() {
    const b = vals.pop(), a = vals.pop(), o = ops.pop();
    const r = binop(a, o, b);
    if (!isFinite(r)) { setv(r, (o === '/' || o === 'Mod') && b === 0); return false; }
    vals.push(r);
    lastSci = [o, b];
    return true;
  }

  // Trig in the chosen unit. Whole quarter turns are exact, so sin 180 is 0 and tan 90 an error.
  function trig(fn, x) {
    const T = TURN[angle];
    if (inv) {
      const r = { sin: Math.asin, cos: Math.acos, tan: Math.atan }[fn](x);
      return r * T / (2 * Math.PI);
    }
    const t = x % T;
    let s, c;
    if (angle !== 'rad' && t % (T / 4) === 0) {
      const q = ((t / (T / 4)) % 4 + 4) % 4;
      s = [0, 1, 0, -1][q]; c = [1, 0, -1, 0][q];
    } else {
      const a = t / T * 2 * Math.PI;
      s = Math.sin(a); c = Math.cos(a);
      if (Math.abs(s) < 1e-14 && Math.abs(t) > 1e-7) s = 0;
      if (Math.abs(c) < 1e-14) c = 0;
    }
    return fn === 'sin' ? s : fn === 'cos' ? c : c === 0 ? NaN : s / c;
  }
  const HYP = { sin: [Math.sinh, Math.asinh], cos: [Math.cosh, Math.acosh], tan: [Math.tanh, Math.atanh] };

  function unary(k, x) {
    switch (k) {
      case 'sin': case 'cos': case 'tan': return hyp ? HYP[k][inv ? 1 : 0](x) : trig(k, x);
      case 'ln': return inv ? Math.exp(x) : x <= 0 ? NaN : Math.log(x);
      case 'log': return inv ? Math.pow(10, x) : x <= 0 ? NaN : Math.log10(x);
      case 'x^2': return inv ? (x < 0 ? NaN : Math.sqrt(x)) : x * x;
      case 'x^3': return inv ? Math.cbrt(x) : x * x * x;
      case '1/x': return x === 0 ? Infinity : 1 / x;
      case 'n!': return factorial(x);
      case 'Int': return inv ? x - Math.trunc(x) : Math.trunc(x);
      case 'Not': return Number(~big(x));
      case 'pi': return inv ? 2 * Math.PI : Math.PI;
      case 'dms': {
        // Degrees to degrees.minutesseconds (D.MMSS), and back with Inv.
        const sg = Math.sign(x), a = Math.abs(x), d = Math.trunc(a);
        if (inv) { const mm = Math.trunc((a - d) * 100 + 1e-9); return sg * (d + mm / 60 + ((a - d) * 100 - mm) * 100 / 3600); }
        const m = Math.trunc((a - d) * 60 + 1e-9);
        return sg * (d + m / 100 + ((a - d) * 60 - m) * 60 / 10000);
      }
    }
  }

  function digit(k) {
    if (expMode) {
      const [m, e] = display.split('e');
      const ex = e.slice(1) === '0' ? k : e.slice(1) + k;
      if (ex.length <= 3) display = m + 'e' + e[0] + ex;
      return;
    }
    if (base === 'dec') {
      if (fresh) { display = k; fresh = false; }
      else if (display.replace(/[-.]/g, '').length < 16) display = display === '0' ? k : display + k;
      return;
    }
    const next = fresh || display === '0' ? k : display + k;
    // A digit that would overflow the word is ignored.
    if (BigInt(PREFIX[radix()] + next) <= maxWord()) { display = next; fresh = false; }
  }

  function binary(k) {
    const o = k === 'x^y' ? (inv ? 'root' : 'pow') : k === 'Lsh' && inv ? 'Rsh' : k;
    inv = hyp = false;
    lastSci = null;
    // Pressing another operator straight after one changes your mind.
    if (opPending && ops.length && ops[ops.length - 1] !== '(') { ops[ops.length - 1] = o; return; }
    vals.push(value());
    while (ops.length && ops[ops.length - 1] !== '(' && PREC[ops[ops.length - 1]] >= PREC[o]) if (!reduce()) return;
    ops.push(o);
    setv(vals[vals.length - 1]);
    opPending = true;
  }

  function statistic(k, x) {
    const n = stats.length;
    const sum = stats.reduce((a, b) => a + b, 0), sq = stats.reduce((a, b) => a + b * b, 0);
    if (k === 'Dat') { stats.push(x); statSel = n; fresh = true; renderStats(); return; }
    if (k === 'Sum') setv(inv ? sq : sum);
    else if (k === 'Ave') setv(n ? (inv ? sq : sum) / n : 0);
    else {
      // s is the sample deviation; Inv+s divides by n for the population one.
      const m = sum / n, d = stats.reduce((a, b) => a + (b - m) ** 2, 0), div = inv ? n : n - 1;
      setv(div > 0 ? Math.sqrt(d / div) : 0);
    }
    inv = hyp = false;
  }

  function pressSci(k) {
    if (k === 'Inv' || k === 'Hyp') { if (k === 'Inv') inv = !inv; else hyp = !hyp; return show(); }
    if (k === 'Sta') return openStats();
    if (sciBtns[k] && sciBtns[k].disabled) return;
    if (error && k !== 'C' && k !== 'CE') return show();
    error = false;
    const x = value();
    if (/^[0-9]$/.test(k) || /^x[A-F]$/.test(k)) { digit(k.slice(-1)); opPending = false; }
    else if (k === '.') {
      if (expMode) return show();
      if (fresh) { display = '0.'; fresh = false; }
      else if (!display.includes('.')) display += '.';
      opPending = false;
    } else if (BINARY[k]) binary(k);
    else if (k === '(') {
      if (depth() < 25) { ops.push('('); fresh = true; opPending = false; expMode = false; }
    } else if (k === ')') {
      if (depth()) {
        vals.push(x);
        while (ops[ops.length - 1] !== '(') if (!reduce()) return show();
        ops.pop();
        setv(vals.pop());
        opPending = false;
      }
    } else if (k === '=') {
      if (ops.length) {
        vals.push(x);
        while (ops.length) if (ops[ops.length - 1] === '(') ops.pop(); else if (!reduce()) return show();
        setv(vals.pop());
      } else if (lastSci) setv(binop(x, lastSci[0], lastSci[1]), lastSci[1] === 0);
      else setv(x);
      vals = []; opPending = false;
    } else if (k === 'Exp') {
      if (!display.includes('e')) { display = (fresh ? '0' : display) + 'e+0'; expMode = true; fresh = false; }
    } else if (k === 'F-E') { fe = !fe; if (!expMode) setv(x); }
    else if (k === '+/-') {
      if (expMode) display = display.replace(/e([+-])/, (_, s) => 'e' + (s === '+' ? '-' : '+'));
      else if (base !== 'dec') display = mask(-x).toString(radix()).toUpperCase();
      else if (display !== '0') display = display.startsWith('-') ? display.slice(1) : '-' + display;
    } else if (k === 'C') { display = '0'; vals = []; ops = []; opPending = false; lastSci = null; fresh = true; expMode = false; }
    else if (k === 'CE') { display = '0'; fresh = true; expMode = false; }
    else if (k === 'Back') {
      if (expMode) {
        const [m, e] = display.split('e');
        display = e.length > 2 ? m + 'e' + e.slice(0, -1) : e.slice(1) !== '0' ? m + 'e' + e[0] + '0' : m;
        if (!display.includes('e')) expMode = false;
      } else if (!fresh) { display = display.slice(0, -1); if (!display || display === '-') { display = '0'; fresh = true; } }
    }
    else if (k === 'MC') mem = 0;
    else if (k === 'MR') setv(mem);
    else if (k === 'MS') { mem = x; fresh = true; }
    else if (k === 'M+') { mem += x; fresh = true; }
    else if (STAT_KEYS.includes(k)) statistic(k, x);
    else if (k) {
      const r = unary(k, x);
      if (r === undefined) return show();
      inv = hyp = false;
      setv(r, k === '1/x');
      opPending = false;
    }
    show();
  }

  // Change the number base, converting what's shown.
  function setBase(b) {
    if (b === base) return;
    const x = error ? 0 : value();
    error = false;
    base = b;
    if (b !== 'dec') fe = false;
    setv(x);
    vals = vals.map(v => b === 'dec' ? v : Number(mask(v)));
    renderStats();
    show();
  }
  function setWord(w) {
    word = w;
    if (base !== 'dec' && !error) setv(value());
    vals = vals.map(v => base === 'dec' ? v : Number(mask(v)));
    show();
  }

  // ---------- the statistics box ----------

  const statList = h('div', { class: 'listbox calc-stat-list', role: 'listbox', tabindex: '0', 'aria-label': 'Statistics data' });
  const statCount = h('span', { class: 'calc-stat-n' });
  function renderStats() {
    statCount.textContent = 'n=' + stats.length;
    statSel = Math.min(statSel, stats.length - 1);
    if (statSel < 0 && stats.length) statSel = 0;
    statList.replaceChildren(...stats.map((v, i) => {
      const s = base === 'dec' ? fmt(v) : mask(v).toString(radix()).toUpperCase();
      const o = h('div', { class: 'opt' + (i === statSel ? ' sel' : ''), role: 'option', 'aria-selected': String(i === statSel) }, s);
      o.addEventListener('click', () => { statSel = i; renderStats(); });
      return o;
    }));
    statList.children[statSel]?.scrollIntoView({ block: 'nearest' });
  }
  statList.addEventListener('keydown', e => {
    const d = { ArrowUp: -1, ArrowDown: 1, Home: -Infinity, End: Infinity }[e.key];
    if (d == null || !stats.length) return;
    e.preventDefault();
    statSel = Math.max(0, Math.min(stats.length - 1, statSel + d));
    renderStats();
  });
  function backToCalc() { win.focus(); root.focus(); }
  function openStats() {
    if (statWin) { statWin.focus(); return; }
    const sb = (label, fn) => h('button', { type: 'button', class: 'btn calc-key', onclick: fn }, label);
    const body = h('div', { class: 'calc-stat' },
      statList,
      h('div', { class: 'calc-stat-btns' },
        sb('RET', backToCalc),
        sb('LOAD', () => { if (statSel >= 0) { error = false; setv(stats[statSel]); show(); } }),
        sb('CD', () => { if (statSel >= 0) { stats.splice(statSel, 1); renderStats(); } }),
        sb('CAD', () => { stats.length = 0; renderStats(); }),
        statCount));
    body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); backToCalc(); } });
    statWin = createWindow({
      title: 'Statistics Box', icon: null, body, dialog: true, modal: false, parent: win, taskbar: false,
      width: 'auto', resizable: false, onClosed: () => { statWin = null; if (sci) refresh(); },
    });
    // Beside the calculator when there's room, so the keys stay clickable.
    const A = win.el.parentElement.getBoundingClientRect(), c = win.el, s = statWin.el;
    if (win.state === 'normal') {
      const right = c.offsetLeft + c.offsetWidth + 4, left = c.offsetLeft - s.offsetWidth - 4;
      const x = right + s.offsetWidth <= A.width ? right : left >= 0 ? left : null;
      if (x != null) { s.style.left = x + 'px'; s.style.top = c.offsetTop + 'px'; }
    } else s.style.top = Math.max(0, A.height - s.offsetHeight - 8) + 'px';
    renderStats();
    statList.focus();
    refresh();
  }

  // ---------- the keys ----------

  const b = (label, key, cls) => {
    const el = h('button', { type: 'button', class: 'btn calc-key ' + (cls || ''), 'aria-label': key === 'Back' ? 'Backspace' : label }, label);
    el.addEventListener('click', () => press(key));
    return el;
  };
  const keys = h('div', { class: 'calc-keys' },
    b('MC', 'MC', 'red'), b('7', '7', 'blue'), b('8', '8', 'blue'), b('9', '9', 'blue'), b('/', '/', 'red'), b('sqrt', 'sqrt', 'blue'),
    b('MR', 'MR', 'red'), b('4', '4', 'blue'), b('5', '5', 'blue'), b('6', '6', 'blue'), b('*', '*', 'red'), b('%', '%', 'blue'),
    b('MS', 'MS', 'red'), b('1', '1', 'blue'), b('2', '2', 'blue'), b('3', '3', 'blue'), b('-', '-', 'red'), b('1/x', '1/x', 'blue'),
    b('M+', 'M+', 'red'), b('0', '0', 'blue'), b('+/-', '+/-', 'blue'), b('.', '.', 'blue'), b('+', '+', 'red'), b('=', '=', 'red'));
  const stdTop = h('div', { class: 'calc-top' }, b('Backspace', 'Back', 'red wide'), b('CE', 'CE', 'red wide'), b('C', 'C', 'red wide'));
  const std = h('div', { class: 'calc-std' }, stdTop, keys);

  // The scientific keypad, row by row as calc.exe lays it out (hex digits are xA..xF).
  const sciBtns = {};
  const ARIA = { s: 'Standard deviation', 'x^y': 'x to the y', 'x^3': 'x cubed', 'x^2': 'x squared', 'n!': 'Factorial', '(': 'Open parenthesis', ')': 'Close parenthesis' };
  const sk = (key, cls) => {
    const label = key[0] === 'x' && key.length === 2 ? key[1] : key;
    const el = b(label, key, cls);
    if (ARIA[key]) el.setAttribute('aria-label', ARIA[key]);
    sciBtns[key] = el;
    return el;
  };
  const ROWS = [
    ['Sta', 'F-E', '(', ')', 'MC', '7', '8', '9', '/', 'Mod', 'And'],
    ['Ave', 'dms', 'Exp', 'ln', 'MR', '4', '5', '6', '*', 'Or', 'Xor'],
    ['Sum', 'sin', 'x^y', 'log', 'MS', '1', '2', '3', '-', 'Lsh', 'Not'],
    ['s', 'cos', 'x^3', 'n!', 'M+', '0', '+/-', '.', '+', '=', 'Int'],
    ['Dat', 'tan', 'x^2', '1/x', 'pi', 'xA', 'xB', 'xC', 'xD', 'xE', 'xF'],
  ];
  const colour = (key, col) => col === 0 || /^[0-9.]$|^x[A-F]$|^\+\/-$|^pi$/.test(key) ? 'blue' : col < 4 ? 'purple' : 'red';
  const sciKeys = h('div', { class: 'calc-sci-keys' }, ROWS.flatMap(r => r.map((key, col) => sk(key, colour(key, col)))));

  const radio = (group, label, val, onpick) => {
    const input = h('input', { type: 'radio', name: 'calc' + id + group, value: val });
    input.addEventListener('change', () => { onpick(val); root.focus(); });
    return h('label', null, input, label);
  };
  const baseGroup = h('div', { class: 'calc-group', role: 'radiogroup', 'aria-label': 'Number base' },
    radio('base', 'Hex', 'hex', setBase), radio('base', 'Dec', 'dec', setBase), radio('base', 'Oct', 'oct', setBase), radio('base', 'Bin', 'bin', setBase));
  const angleGroup = h('div', { class: 'calc-group', role: 'radiogroup', 'aria-label': 'Angle unit' },
    radio('angle', 'Degrees', 'deg', v => { angle = v; }), radio('angle', 'Radians', 'rad', v => { angle = v; }), radio('angle', 'Grads', 'grad', v => { angle = v; }));
  const wordGroup = h('div', { class: 'calc-group', role: 'radiogroup', 'aria-label': 'Word size' },
    radio('word', 'Dword', 'dword', setWord), radio('word', 'Word', 'word', setWord), radio('word', 'Byte', 'byte', setWord));
  const check = (label, key) => {
    const input = h('input', { type: 'checkbox' });
    input.addEventListener('change', () => { press(key); root.focus(); });
    return h('label', null, input, label);
  };
  const invBox = check('Inv', 'Inv'), hypBox = check('Hyp', 'Hyp');
  const sciTop = h('div', { class: 'calc-sci-top' },
    h('div', { class: 'calc-group calc-invhyp' }, invBox, hypBox),
    parenBox, h('span', { class: 'calc-mem-slot' }),
    sk('Back', 'red wide'), sk('CE', 'red wide'), sk('C', 'red wide'));
  sciBtns.Back.textContent = 'Backspace';
  const sciPanel = h('div', { class: 'calc-sci' },
    h('div', { class: 'calc-modes' }, baseGroup, angleGroup, wordGroup), sciTop, sciKeys);

  // Bring the radios, checkboxes and greyed-out keys in line with the state.
  function refresh() {
    const r = radix();
    for (const [k, el] of Object.entries(sciBtns)) {
      let off = false;
      if (/^[0-9]$/.test(k)) off = +k >= r;
      else if (/^x[A-F]$/.test(k)) off = r !== 16;
      else if (DEC_ONLY.includes(k)) off = base !== 'dec';
      else if (STAT_KEYS.includes(k)) off = !statWin;
      el.disabled = off;
    }
    for (const [g, v] of [[baseGroup, base], [angleGroup, angle], [wordGroup, word]])
      for (const i of g.querySelectorAll('input')) i.checked = i.value === v;
    angleGroup.hidden = base !== 'dec';
    wordGroup.hidden = base === 'dec';
    invBox.firstChild.checked = inv;
    hypBox.firstChild.checked = hyp;
    parenBox.textContent = depth() ? '(=' + depth() : '';
  }

  const root = h('div', { class: 'calc', tabindex: '0' }, screen, std, sciPanel);

  function setView(on) {
    if (on === sci && root.dataset.view) return;
    if (!on && base !== 'dec') setBase('dec');
    sci = on;
    acc = null; op = null; last = null; vals = []; ops = []; opPending = false; lastSci = null; expMode = false; fresh = true;
    inv = hyp = fe = false;
    if (!error) display = fmt(value()) ?? '0';
    root.dataset.view = sci ? 'scientific' : 'standard';
    std.hidden = sci; sciPanel.hidden = !sci;
    if (sci) sciTop.querySelector('.calc-mem-slot').before(memBox); else stdTop.prepend(memBox);
    store.set('w95.calc', { sci, grouping });
    show();
    // The window sizes to its keys, so keep the wider scientific one on screen.
    if (win && win.state === 'normal') {
      const A = win.el.parentElement.getBoundingClientRect(), el = win.el;
      if (el.offsetLeft + el.offsetWidth > A.width) el.style.left = Math.max(0, A.width - el.offsetWidth) + 'px';
      win.fit();
    }
  }

  const SCI_KEYS = {
    Enter: '=', '=': '=', Escape: 'C', Delete: 'CE', Backspace: 'Back', ',': '.', F9: '+/-', Insert: 'Dat',
    r: '1/x', s: 'sin', o: 'cos', t: 'tan', n: 'ln', l: 'log', '@': 'x^2', '#': 'x^3', y: 'x^y', '!': 'n!', p: 'pi',
    x: 'Exp', v: 'F-E', m: 'dms', ';': 'Int', '%': 'Mod', '&': 'And', '|': 'Or', '^': 'Xor', '~': 'Not', '<': 'Lsh',
    i: 'Inv', h: 'Hyp', '(': '(', ')': ')',
  };
  const CTRL_KEYS = { l: 'MC', r: 'MR', m: 'MS', p: 'M+', s: 'Sta', a: 'Ave', t: 'Sum', d: 's' };
  root.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (e.altKey) return;
      const c = e.key.toLowerCase();
      if (c === 'c') navigator.clipboard?.writeText(display).catch(() => {});
      else if (c === 'v') paste();
      else if (CTRL_KEYS[c] && (sci || c in { l: 1, r: 1, m: 1, p: 1 })) { e.preventDefault(); press(CTRL_KEYS[c]); }
      return;
    }
    if (sci) {
      const fk = { F5: 'hex', F6: 'dec', F7: 'oct', F8: 'bin' }[e.key];
      const f2 = ['F2', 'F3', 'F4'].indexOf(e.key);
      let k = SCI_KEYS[e.key] || e.key;
      if (base === 'hex' && /^[a-fA-F]$/.test(e.key)) k = 'x' + e.key.toUpperCase();
      if (fk) setBase(fk);
      else if (f2 >= 0) { if (base === 'dec') angle = ['deg', 'rad', 'grad'][f2]; else setWord(['dword', 'word', 'byte'][f2]); show(); }
      else if (/^[0-9]$/.test(k) || sciBtns[k] || ['Inv', 'Hyp', '+', '-', '*', '/', '=', '.'].includes(k)) press(k);
      else return;
      e.preventDefault();
      return;
    }
    const map = { Enter: '=', '=': '=', Escape: 'C', Delete: 'CE', Backspace: 'Back', r: '1/x', '@': 'sqrt', F9: '+/-', ',': '.' };
    const k = map[e.key] || e.key;
    if (/^[0-9]$/.test(k) || ['.', '+', '-', '*', '/', '%', '=', 'C', 'CE', 'Back', '1/x', 'sqrt', '+/-'].includes(k)) {
      e.preventDefault();
      press(k);
    }
  });

  async function paste() {
    try {
      const t = (await navigator.clipboard.readText()).trim().replace(/[\s,]/g, '');
      const ok = base !== 'dec' ? { hex: /^[0-9a-f]+$/i, oct: /^[0-7]+$/, bin: /^[01]+$/ }[base] : sci ? /^-?\d*\.?\d+(e[+-]?\d+)?$/i : /^-?\d*\.?\d+$/;
      if (!ok.test(t)) return;
      error = false;
      if (base === 'dec') { display = t; fresh = true; }
      else setv(Number(BigInt(PREFIX[radix()] + t) & maxWord()));
      show();
    } catch {}
  }

  const bar = menubar([
    { label: '&Edit', items: () => [
      { label: '&Copy', key: 'Ctrl+C', action: () => navigator.clipboard?.writeText(display).catch(() => {}) },
      { label: '&Paste', key: 'Ctrl+V', action: paste },
    ] },
    { label: '&View', items: () => [
      { label: '&Scientific', checked: sci, radio: true, action: () => { setView(true); root.focus(); } },
      { label: 'S&tandard', checked: !sci, radio: true, action: () => { setView(false); root.focus(); } },
      '-',
      { label: '&Digit grouping', checked: grouping, action: () => { grouping = !grouping; store.set('w95.calc', { sci, grouping }); show(); } },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') },
      '-',
      { label: '&About Calculator', action: () => about('Calculator', 'i-calc', win) },
    ] },
  ]);

  let win = null;
  setView(sci);
  win = createWindow({
    app: 'calc', title: 'Calculator', icon: 'i-calc', body: h('div', { class: 'calc-wrap' }, bar, root), className: 'calc-win',
    width: 'auto', resizable: false, maximizable: false, route: 'calc', autofocus: '.calc',
  });
  root.focus();
  show();
  return win;
}

export default { id: 'calc', title: 'Calculator', icon: 'i-calc', open };
