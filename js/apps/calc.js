// Calculator, standard view. Immediate execution like the original:
// 2 + 3 * 4 = 20, and pressing = again repeats the last operation.

import { h } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { about } from '../dialogs.js';

function open() {
  let display = '0', acc = null, op = null, fresh = true, mem = 0, last = null, error = false, grouping = false;

  const screen = h('div', { class: 'field calc-display', role: 'status', 'aria-live': 'polite' }, '0.');
  const memBox = h('div', { class: 'calc-mem' });

  const fmt = n => {
    if (!isFinite(n)) return null;
    let s = String(parseFloat(n.toPrecision(15)));
    if (s.length > 20) s = n.toExponential(10).replace(/\.?0+e/, 'e');
    return s;
  };
  const value = () => parseFloat(display);
  function show() {
    if (error) { screen.textContent = error; return; }
    let s = display;
    if (grouping && !s.includes('e')) {
      const [i, f] = s.split('.');
      s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f != null ? '.' + f : '');
    }
    screen.textContent = s.includes('.') || s.includes('e') ? s : s + '.';
    memBox.textContent = mem ? 'M' : '';
  }
  function set(n) {
    const s = fmt(n);
    if (s == null) { error = n !== n ? 'Invalid input for function.' : 'Cannot divide by zero.'; display = '0'; acc = null; op = null; }
    else display = s;
    fresh = true;
  }
  const apply = (a, o, b) => o === '+' ? a + b : o === '-' ? a - b : o === '*' ? a * b : b === 0 ? Infinity : a / b;

  function press(k) {
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
  const root = h('div', { class: 'calc', tabindex: '0' },
    screen,
    h('div', { class: 'calc-top' }, memBox, b('Backspace', 'Back', 'red wide'), b('CE', 'CE', 'red wide'), b('C', 'C', 'red wide')),
    keys);

  root.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') navigator.clipboard?.writeText(display).catch(() => {});
      return;
    }
    const map = { Enter: '=', '=': '=', Escape: 'C', Delete: 'CE', Backspace: 'Back', r: '1/x', '@': 'sqrt', F9: '+/-', ',': '.' };
    const k = map[e.key] || e.key;
    if (/^[0-9]$/.test(k) || ['.', '+', '-', '*', '/', '%', '=', 'C', 'CE', 'Back', '1/x', 'sqrt', '+/-'].includes(k)) {
      e.preventDefault();
      press(k);
    }
  });

  const bar = menubar([
    { label: '&Edit', items: () => [
      { label: '&Copy', key: 'Ctrl+C', action: () => navigator.clipboard?.writeText(display).catch(() => {}) },
      { label: '&Paste', key: 'Ctrl+V', action: async () => {
        try { const t = (await navigator.clipboard.readText()).trim(); if (/^-?\d*\.?\d+$/.test(t)) { display = t; fresh = true; show(); } } catch {}
      } },
    ] },
    { label: '&View', items: () => [
      { label: '&Scientific', disabled: true },
      { label: 'S&tandard', checked: true, radio: true },
      '-',
      { label: '&Digit grouping', checked: grouping, action: () => { grouping = !grouping; show(); } },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') },
      '-',
      { label: '&About Calculator', action: () => about('Calculator', 'i-calc', win) },
    ] },
  ]);

  const win = createWindow({
    app: 'calc', title: 'Calculator', icon: 'i-calc', body: h('div', { class: 'calc-wrap' }, bar, root),
    width: 'auto', resizable: false, maximizable: false, route: 'calc', autofocus: '.calc',
  });
  root.focus();
  show();
  return win;
}

export default { id: 'calc', title: 'Calculator', icon: 'i-calc', open };
