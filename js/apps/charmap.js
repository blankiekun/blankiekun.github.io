// Character Map. The grid shows a font's Windows characters 0x20-0xFF, 32 to a row,
// and the Subset list adds a few Unicode blocks (kana, box drawing...).

import { h, clamp } from '../util.js';
import { createWindow } from '../wm.js';
import { msgbox } from '../dialogs.js';
import { FONTS } from './wordpad.js';

// Windows-1252 puts typographer's quotes and friends where Latin-1 has control codes.
const CP1252 = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030,
  0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const SUBSETS = [
  ['Windows Characters', null],
  ['Latin Extended', [0x100, 0x24f]],
  ['Greek', [0x370, 0x3ff]],
  ['Cyrillic', [0x400, 0x4ff]],
  ['General Punctuation', [0x2010, 0x205e]],
  ['Arrows', [0x2190, 0x21ff]],
  ['Mathematical Operators', [0x2200, 0x22ff]],
  ['Box Drawing', [0x2500, 0x259f]],
  ['CJK Symbols and Punctuation', [0x3000, 0x303f]],
  ['Hiragana', [0x3040, 0x309f]],
  ['Katakana', [0x30a0, 0x30ff]],
  ['Halfwidth Katakana', [0xff61, 0xff9f]],
];

// Unicode's names for the kana, so the status bar can say what you're looking at.
const KANA = ('SMALL A,A,SMALL I,I,SMALL U,U,SMALL E,E,SMALL O,O,KA,GA,KI,GI,KU,GU,KE,GE,KO,GO,SA,ZA,SI,ZI,SU,ZU,SE,ZE,SO,ZO,' +
  'TA,DA,TI,DI,SMALL TU,TU,DU,TE,DE,TO,DO,NA,NI,NU,NE,NO,HA,BA,PA,HI,BI,PI,HU,BU,PU,HE,BE,PE,HO,BO,PO,MA,MI,MU,ME,MO,' +
  'SMALL YA,YA,SMALL YU,YU,SMALL YO,YO,RA,RI,RU,RE,RO,SMALL WA,WA,WI,WE,WO,N,VU,SMALL KA,SMALL KE').split(',');
const KANA_MORE = {
  0x309b: 'KATAKANA-HIRAGANA VOICED SOUND MARK', 0x309c: 'KATAKANA-HIRAGANA SEMI-VOICED SOUND MARK',
  0x309d: 'HIRAGANA ITERATION MARK', 0x309e: 'HIRAGANA VOICED ITERATION MARK', 0x30fb: 'KATAKANA MIDDLE DOT',
  0x30fc: 'KATAKANA-HIRAGANA PROLONGED SOUND MARK', 0x30fd: 'KATAKANA ITERATION MARK', 0x30fe: 'KATAKANA VOICED ITERATION MARK',
  0x30f7: 'KATAKANA LETTER VA', 0x30f8: 'KATAKANA LETTER VI', 0x30f9: 'KATAKANA LETTER VE', 0x30fa: 'KATAKANA LETTER VO',
  0x3001: 'IDEOGRAPHIC COMMA', 0x3002: 'IDEOGRAPHIC FULL STOP', 0x3005: 'IDEOGRAPHIC ITERATION MARK', 0x300c: 'LEFT CORNER BRACKET', 0x300d: 'RIGHT CORNER BRACKET',
};
function nameOf(cp) {
  if (cp >= 0x3041 && cp <= 0x3096) return 'HIRAGANA LETTER ' + KANA[cp - 0x3041];
  if (cp >= 0x30a1 && cp <= 0x30f6) return 'KATAKANA LETTER ' + KANA[cp - 0x30a1];
  return KANA_MORE[cp] || '';
}

const unused = /^[\p{Cn}\p{Cc}]$/u;
const combining = /^\p{M}$/u;

// The cells of a subset: { cp, code } where code is the Windows code (for Alt+0nnn), cp null for an empty slot.
function cellsOf(subset) {
  const r = SUBSETS.find(s => s[0] === subset)[1];
  if (!r) return range(0x20, 0xff).map(code => ({ code, cp: code === 0x7f || (code >= 0x80 && code < 0xa0 && !CP1252[code]) ? null : CP1252[code] || code }));
  return range(r[0], r[1]).filter(cp => !unused.test(String.fromCodePoint(cp))).map(cp => ({ cp, code: null }));
}

function open() {
  let subset = 'Windows Characters';
  let font = 'Arial';
  let cells = cellsOf(subset);
  let sel = 0, cols = 32;

  const fontSel = h('select', { class: 'field cm-font', id: 'cm-font' }, ...Object.keys(FONTS).map(f => h('option', { value: f }, f)));
  fontSel.value = font;
  const subSel = h('select', { class: 'field cm-sub', id: 'cm-sub' }, ...SUBSETS.map(([n]) => h('option', { value: n }, n)));
  const copyField = h('input', { class: 'field cm-copy', id: 'cm-copy', autocomplete: 'off', spellcheck: false });
  const grid = h('div', { class: 'cm-grid', tabindex: '0', role: 'grid', 'aria-label': 'Characters' });
  const zoom = h('div', { class: 'cm-zoom', 'aria-hidden': 'true', hidden: true });
  const gridWrap = h('div', { class: 'cm-gridwrap' }, grid, zoom);
  const keyCell = h('span', null, '');
  const codeCell = h('div', { class: 'cm-code' }, '');
  const status = h('div', { class: 'statusbar' }, keyCell, codeCell);

  const charOf = c => c.cp == null ? '' : String.fromCodePoint(c.cp);
  // Combining marks need something to sit on; the soft hyphen would be invisible.
  const shown = c => c.cp == null ? '' : c.cp === 0xad ? '-' : combining.test(charOf(c)) ? '\u25cc' + charOf(c) : charOf(c);

  function render() {
    grid.style.fontFamily = FONTS[font];
    zoom.style.fontFamily = FONTS[font];
    copyField.style.fontFamily = FONTS[font];
    grid.replaceChildren(...cells.map((c, i) => h('div', {
      class: 'cm-cell' + (c.cp == null ? ' empty' : '') + (i === sel ? ' sel' : ''), role: 'gridcell', id: 'cm-c' + i, 'aria-label': c.cp == null ? 'Unused' : charOf(c),
    }, shown(c))));
    layout();
    choose(clamp(sel, 0, cells.length - 1), false);
  }
  function layout() {
    const w = gridWrap.clientWidth || 480;
    cols = w >= 32 * 14 ? 32 : w >= 16 * 14 ? 16 : 8;
    grid.style.setProperty('--cols', cols);
  }
  function choose(i, magnify) {
    sel = clamp(i, 0, cells.length - 1);
    grid.querySelectorAll('.cm-cell.sel').forEach(x => x.classList.remove('sel'));
    const cell = grid.children[sel];
    if (!cell) return;
    cell.classList.add('sel');
    grid.setAttribute('aria-activedescendant', cell.id);
    const c = cells[sel];
    const ch = charOf(c);
    if (c.code != null) {
      keyCell.textContent = 'Keystroke: ' + (c.code === 0x20 ? 'Spacebar' : c.code < 0x7f ? (/[A-Z]/.test(ch) ? 'Shift+' + ch : ch) : 'Alt+0' + c.code);
    } else keyCell.textContent = nameOf(c.cp) || 'Unicode character';
    codeCell.textContent = c.cp == null ? '' : 'U+' + c.cp.toString(16).toUpperCase().padStart(4, '0');
    // keep it in view
    if (cell.offsetTop < grid.scrollTop) grid.scrollTop = cell.offsetTop;
    else if (cell.offsetTop + cell.offsetHeight > grid.scrollTop + grid.clientHeight) grid.scrollTop = cell.offsetTop + cell.offsetHeight - grid.clientHeight;
    if (magnify) showZoom(); else zoom.hidden = true;
  }
  function showZoom() {
    const cell = grid.children[sel];
    const c = cells[sel];
    if (!cell || c.cp == null || c.cp === 0x20 || c.cp === 0xa0) { zoom.hidden = true; return; }
    zoom.textContent = shown(c);
    zoom.hidden = false;
    const W = zoom.offsetWidth, H = zoom.offsetHeight;
    const x = cell.offsetLeft + cell.offsetWidth / 2 - W / 2 + grid.offsetLeft;
    const y = cell.offsetTop - grid.scrollTop + cell.offsetHeight / 2 - H / 2 + grid.offsetTop;
    zoom.style.left = clamp(Math.round(x), 0, Math.max(0, gridWrap.clientWidth - W)) + 'px';
    zoom.style.top = clamp(Math.round(y), 0, Math.max(0, gridWrap.clientHeight - H)) + 'px';
  }

  function append(i = sel) {
    const ch = charOf(cells[i]);
    if (!ch) return;
    const a = copyField.selectionStart ?? copyField.value.length, b = copyField.selectionEnd ?? a;
    const focused = document.activeElement === copyField;
    if (focused) copyField.setRangeText(ch, a, b, 'end'); else copyField.value += ch;
    copyBtn.disabled = !copyField.value;
  }
  async function copy() {
    const t = copyField.value;
    if (!t) return;
    copyField.focus();
    copyField.select();
    try { await navigator.clipboard.writeText(t); }
    catch {
      copyField.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      if (!ok) msgbox({ title: 'Character Map', icon: 'info', parent: win, text: 'Your browser keeps the Clipboard to itself.\n\nThe characters are selected: press Ctrl+C to copy them.' });
    }
  }

  // ---------- pointer: hold to magnify, drag to move, double-click to select ----------
  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest && el.closest('.cm-cell');
    return cell && cell.parentNode === grid ? [...grid.children].indexOf(cell) : -1;
  };
  let holding = null;
  grid.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    grid.focus({ preventScroll: true });
    holding = e.pointerId;
    try { grid.setPointerCapture(e.pointerId); } catch {}
    choose(i, true);
  });
  grid.addEventListener('pointermove', e => {
    if (holding !== e.pointerId) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i >= 0 && i !== sel) choose(i, true);
  });
  // A double tap selects too; touch doesn't always make a dblclick here.
  let lastTap = { at: 0, i: -1 }, tapped = 0;
  const release = e => {
    if (holding !== e.pointerId) return;
    holding = null;
    zoom.hidden = true;
    if (e.type !== 'pointerup' || e.pointerType === 'mouse') return;
    if (e.timeStamp - lastTap.at < 450 && lastTap.i === sel) { append(); tapped = e.timeStamp; lastTap = { at: 0, i: -1 }; }
    else lastTap = { at: e.timeStamp, i: sel };
  };
  grid.addEventListener('pointerup', release);
  grid.addEventListener('pointercancel', release);
  grid.addEventListener('dblclick', e => { if (e.timeStamp - tapped > 600) append(); });
  grid.addEventListener('scroll', () => { if (!zoom.hidden) showZoom(); });
  grid.addEventListener('blur', () => { zoom.hidden = true; });

  grid.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const row = Math.floor(sel / cols) * cols;
    const moves = {
      ArrowLeft: sel - 1, ArrowRight: sel + 1, ArrowUp: sel - cols, ArrowDown: sel + cols,
      Home: row, End: Math.min(cells.length - 1, row + cols - 1), PageUp: sel - cols * 7, PageDown: sel + cols * 7,
    };
    if (e.key in moves) {
      e.preventDefault();
      const to = moves[e.key];
      if (to >= 0 && to < cells.length) choose(to, true);
      else if (e.key.startsWith('Page')) choose(clamp(to, 0, cells.length - 1), true);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); append(); return; }
    // Typing a character jumps to it, like the real one.
    if (e.key.length >= 1 && [...e.key].length === 1) {
      const i = cells.findIndex(c => c.cp != null && charOf(c) === e.key);
      if (i >= 0) { e.preventDefault(); choose(i, true); }
    }
  });
  grid.addEventListener('keyup', e => { if (e.key.startsWith('Arrow') || e.key.startsWith('Page') || e.key === 'Home' || e.key === 'End') setTimeout(() => { if (document.activeElement === grid && holding == null) showZoom(); }, 0); });

  fontSel.addEventListener('change', () => { font = fontSel.value; render(); });
  subSel.addEventListener('change', () => {
    subset = subSel.value;
    cells = cellsOf(subset);
    sel = 0;
    // The kana look best in a Japanese font.
    if (/Hiragana|Katakana|CJK/.test(subset) && !/^MS (Gothic|Mincho)$/.test(font)) { font = 'MS Gothic'; fontSel.value = font; }
    grid.scrollTop = 0;
    render();
  });
  copyField.addEventListener('input', () => { copyBtn.disabled = !copyField.value; });

  const closeBtn = h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Close');
  const selectBtn = h('button', { class: 'btn', type: 'button', html: '<u>S</u>elect', onclick: () => append() });
  const copyBtn = h('button', { class: 'btn', type: 'button', html: '<u>C</u>opy', disabled: true, onclick: copy });

  const body = h('div', { class: 'cm' },
    h('div', { class: 'cm-top' },
      h('label', { class: 'cm-lab', for: 'cm-font', html: '<u>F</u>ont:' }), fontSel,
      h('label', { class: 'cm-lab', for: 'cm-sub', html: 'Su<u>b</u>set:' }), subSel,
      h('label', { class: 'cm-lab', for: 'cm-copy', html: 'Characters to cop<u>y</u>:' }), copyField),
    h('div', { class: 'cm-main' }, gridWrap, h('div', { class: 'cm-btns' }, closeBtn, selectBtn, copyBtn)),
    status);
  body.addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey) return;
    const k = e.code && e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : '';
    const t = { f: fontSel, b: subSel, y: copyField, s: selectBtn, c: copyBtn }[k];
    if (!t) return;
    e.preventDefault();
    if (t.tagName === 'BUTTON') t.click(); else t.focus();
  });

  const win = createWindow({
    app: 'charmap', title: 'Character Map', icon: 'i-charmap', body,
    width: 'auto', resizable: false, maximizable: false, route: 'charmap', autofocus: '.cm-grid',
    onResize: () => { const before = cols; layout(); if (cols !== before) choose(sel, false); },
  });
  render();
  grid.focus();
  return win;
}

export default { id: 'charmap', title: 'Character Map', icon: 'i-charmap', single: true, open };
