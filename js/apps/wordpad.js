// WordPad. The page is a contenteditable box driven by execCommand; everything that
// goes into it (opened files, pastes, drops) passes through sanitize() first.
// Documents are saved as HTML (.doc), real RTF (.rtf) or plain text (.txt).

import { h, icon, esc, clamp, store } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar, openMenu, ribbon, rbtn, quickBar, hasRibbon } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import { openFile, saveAs, saveTo } from '../filedlg.js';
import { resolve } from '../fs.js';
import { V } from '../version.js';
import * as blankie from '../assistant.js';

export const FONTS = {
  'Arial': 'Arial, Helvetica, "Liberation Sans", sans-serif',
  'Comic Sans MS': '"Comic Sans MS", "Comic Neue", "Chalkboard SE", cursive',
  'Courier New': '"Courier New", Courier, "Liberation Mono", monospace',
  'Fixedsys': '"Fixedsys Excelsior", Fixedsys, "Courier New", monospace',
  'MS Gothic': '"MS Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", sans-serif',
  'MS Mincho': '"MS Mincho", "Hiragino Mincho ProN", "Noto Serif JP", "Noto Serif CJK JP", serif',
  'MS Sans Serif': '"MS Sans Serif", "Microsoft Sans Serif", Tahoma, Arial, sans-serif',
  'MS Serif': '"MS Serif", "Times New Roman", Times, serif',
  'Times New Roman': '"Times New Roman", Times, "Liberation Serif", serif',
};
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const COLORS = [
  ['Black', '#000000'], ['Maroon', '#800000'], ['Green', '#008000'], ['Olive', '#808000'],
  ['Navy', '#000080'], ['Purple', '#800080'], ['Teal', '#008080'], ['Gray', '#808080'],
  ['Silver', '#c0c0c0'], ['Red', '#ff0000'], ['Lime', '#00ff00'], ['Yellow', '#ffff00'],
  ['Blue', '#0000ff'], ['Fuchsia', '#ff00ff'], ['Aqua', '#00ffff'], ['White', '#ffffff'],
];
const TYPES = {
  word: { label: 'Word 6 Document', filter: { label: 'Word for Windows 6.0 (*.doc)', exts: ['.doc'] } },
  rtf: { label: 'Rich Text Document', filter: { label: 'Rich Text Format (*.rtf)', exts: ['.rtf'] } },
  text: { label: 'Text Document', filter: { label: 'Text Documents (*.txt)', exts: ['.txt'] } },
};
const UNITS = { in: [96, '"', 'Inches'], cm: [96 / 2.54, ' cm', 'Centimeters'], pt: [96 / 72, ' pt', 'Points'], pi: [16, ' pi', 'Picas'] };
const BLOCKS = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3']);
const SETTINGS = 'w95.wordpad';
const RECENT = 'w95.wordpad.recent';

// ---------- toolbar glyphs ----------
const px = (fill, d) => `<path fill='${fill}' d='${d}'/>`;
const svg = inner => `<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true">${inner}</svg>`;
const G = {
  new: svg(px('#000', 'M3 1h7v1h1v1h1v1h1v11H3z') + px('#fff', 'M4 2h5v4h4v8H4z') + px('#c0c0c0', 'M10 2h1v1h1v1h1v1h-3z')),
  preview: svg(px('#000', 'M2 1h9v14H2z') + px('#fff', 'M3 2h7v12H3z') + px('#808080', 'M4 4h5v1H4zM4 6h3v1H4z') +
    px('#000', 'M9 7h3v1h1v1h1v3h-1v1h-1v1H9v-1H8v-1H7V9h1V8h1z') + px('#00ffff', 'M9 8h3v1h1v3h-1v1H9v-1H8V9h1z') + px('#000', 'M13 13h1v1h1v1h-1v-1h-1z')),
  find: svg(px('#000', 'M2 4h4v10H2zM10 4h4v10h-4zM6 6h4v4H6zM3 2h2v2H3zM11 2h2v2h-2z') + px('#808080', 'M3 10h2v3H3zM11 10h2v3h-2z') + px('#0000ff', 'M3 11h1v1H3zM11 11h1v1h-1z')),
  cut: svg(px('#808080', 'M4 1h1v2h1v2h1v2h2V5h1V3h1V1h1v3h-1v2h-1v2H8v1H7V8H6V6H5V4H4z') +
    px('#000', 'M2 9h4v1h1v3H6v1H2v-1H1v-3h1zM3 10v3h3v-3zM9 9h4v1h1v3h-1v1H9v-1H8v-3h1zM10 10v3h3v-3z')),
  copy: svg(px('#000', 'M1 1h8v10H1z') + px('#fff', 'M2 2h6v8H2z') + px('#808080', 'M3 4h4v1H3zM3 6h2v1H3z') +
    px('#000', 'M6 5h9v10H6z') + px('#fff', 'M7 6h7v8H7z') + px('#808080', 'M8 8h5v1H8zM8 10h5v1H8zM8 12h4v1H8z')),
  paste: svg(px('#000', 'M2 2h10v13H2z') + px('#808000', 'M3 3h8v11H3z') + px('#000', 'M5 1h4v3H5z') + px('#c0c0c0', 'M6 2h2v1H6z') +
    px('#000', 'M7 6h8v9H7z') + px('#fff', 'M8 7h6v7H8z') + px('#808080', 'M9 9h4v1H9zM9 11h4v1H9z')),
  undo: svg(px('#000', 'M2 7h1V6h1V5h1V4h1v2h5v1h1v1h1v4h-1v1h-1v1H9v-1h1v-1h1V9h-1V8H6v2H5V9H4V8H3V7z')),
  date: svg(px('#000', 'M1 2h11v11H1z') + px('#fff', 'M2 5h9v7H2z') + px('#800000', 'M2 3h9v2H2z') + px('#808080', 'M3 6h1v1H3zM5 6h1v1H5zM7 6h1v1H7zM3 8h1v1H3zM5 8h1v1H5z') +
    px('#000', 'M10 8h4v1h1v1h1v3h-1v1h-1v1h-4v-1H9v-1H8v-3h1V9h1z') + px('#ffff00', 'M10 9h4v1h1v3h-1v1h-4v-1H9v-3h1z') + px('#000', 'M12 10h1v2h-1zM12 11h2v1h-2z')),
  bold: svg(px('#000', 'M3 3h7v1h1v3h-1v1h1v1h1v3h-1v1H3v-1h1V4H3zM6 4v3h3V4zM6 8v4h4V8z')),
  italic: svg(px('#000', 'M7 3h5v1h-1v1h-1v2H9v2H8v2H7v1h1v1H3v-1h1v-1h1V9h1V7h1V5h1V4H7z')),
  underline: svg(px('#000', 'M3 3h4v1H6v6h4V4H9V3h4v1h-1v6h-1v1h-1v1H6v-1H5v-1H4V4H3zM3 14h10v1H3z')),
  color: svg(px('#000', 'M4 2h7v1h2v1h1v2h1v3h-1v1h-3v1h-1v2h-1v1H8v1H4v-1H2v-1H1V5h1V3h2z') + px('#fff', 'M4 3h7v1h2v2h1v3h-3v1h-1v2H9v1H8v1H4v-1H3v-1H2V5h1V4h1z') +
    px('#ff0000', 'M4 5h2v2H4z') + px('#00ff00', 'M7 4h2v2H7z') + px('#0000ff', 'M10 5h2v2h-2z') + px('#ffff00', 'M4 9h2v2H4z')),
  left: svg(px('#000', 'M2 2h12v1H2zM2 4h8v1H2zM2 6h12v1H2zM2 8h8v1H2zM2 10h12v1H2zM2 12h8v1H2z')),
  center: svg(px('#000', 'M2 2h12v1H2zM4 4h8v1H4zM2 6h12v1H2zM4 8h8v1H4zM2 10h12v1H2zM4 12h8v1H4z')),
  right: svg(px('#000', 'M2 2h12v1H2zM6 4h8v1H6zM2 6h12v1H2zM6 8h8v1H6zM2 10h12v1H2zM6 12h8v1H6z')),
  bullets: svg(px('#000', 'M2 3h2v2H2zM2 7h2v2H2zM2 11h2v2H2zM6 4h8v1H6zM6 8h8v1H6zM6 12h8v1H6z')),
  selall: svg(px('#000', 'M1 1h2v1H1zM5 1h2v1H5zM9 1h2v1H9zM13 1h2v1h-2zM1 14h2v1H1zM5 14h2v1H5zM9 14h2v1H9zM13 14h2v1h-2zM1 3h1v2H1zM1 7h1v2H1zM1 11h1v2H1zM14 3h1v2h-1zM14 7h1v2h-1zM14 11h1v2h-1z') + px('#000080', 'M4 4h8v1H4zM4 7h8v1H4zM4 10h6v1H4z')),
};
const swatch = c => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" shape-rendering="crispEdges"><path d="M2 3h12v10H2z"/><path fill="${c}" d="M3 4h10v8H3z"/></svg>`);

// ---------- sanitizing ----------
const ALLOW = new Set(['b', 'i', 'u', 's', 'font', 'span', 'p', 'div', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'a']);
const RENAME = { strong: 'b', em: 'i', strike: 's', del: 's', ins: 'u', h4: 'h3', h5: 'h3', h6: 'h3', center: 'div', blockquote: 'div', pre: 'div', tr: 'div', address: 'div', section: 'div', article: 'div' };
const DROP = new Set(['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'template', 'noscript', 'svg', 'math',
  'head', 'title', 'meta', 'link', 'base', 'form', 'input', 'textarea', 'select', 'option', 'button', 'img', 'video', 'audio', 'canvas', 'map', 'picture', 'source', 'xml']);
const BLOCKISH = /^(p|div|h[1-6]|ul|ol|li|dl|dt|dd|table|thead|tbody|tfoot|tr|td|th|br|hr|pre|blockquote|center|section|article|header|footer|nav|aside|main|address|figure|head|body|html|script|style|title|meta|link)$/;
const LEN = /^-?\d{1,4}(\.\d+)?(in|cm|mm|pt|pc|px|em)$|^0$/;
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;
const FAMILY = /^[\p{L}\p{N}\s,"'_-]{1,200}$/u;
const STYLE = {
  'color': COLOR,
  'font-family': FAMILY,
  'font-size': /^(\d{1,3}(\.\d+)?(pt|px|em|rem|%)|(xx?-)?(small|large)|medium|smaller|larger)$/,
  'font-weight': /^(bold|bolder|normal|[1-9]00)$/,
  'font-style': /^(italic|oblique|normal)$/,
  'text-decoration-line': /^(underline|line-through|none|underline line-through|line-through underline)$/,
  'text-align': /^(left|right|center|justify|start|end)$/,
  'margin-left': LEN, 'margin-right': LEN, 'text-indent': LEN,
};
const FONT_SIZES = { 1: '8pt', 2: '10pt', 3: '12pt', 4: '14pt', 5: '18pt', 6: '24pt', 7: '36pt' };

function cleanStyle(n) {
  const out = [];
  if (n.style) for (const [p, rx] of Object.entries(STYLE)) {
    const v = n.style.getPropertyValue(p).trim();
    if (v && rx.test(v)) out.push(`${p}: ${v}`);
  }
  const align = n.getAttribute('align');
  if (align && /^(left|right|center|justify)$/i.test(align)) out.push('text-align: ' + align.toLowerCase());
  if (n.localName === 'center') out.push('text-align: center');
  const size = n.localName === 'font' && n.getAttribute('size');
  if (size && FONT_SIZES[size]) out.push('font-size: ' + FONT_SIZES[size]);
  return out.join('; ');
}
// The page keeps spaces and tabs (white-space: pre-wrap), so the line breaks that only
// format the HTML source are folded into spaces. Inside <pre> they become <br>s.
function copyKids(from, to, pre) {
  for (const n of from.childNodes) {
    if (n.nodeType === 3) {
      if (pre) { n.data.split(/\r?\n/).forEach((l, i) => { if (i) to.append(document.createElement('br')); if (l) to.append(l); }); continue; }
      if (/^\s*$/.test(n.data) && /[\r\n]/.test(n.data)) {
        const inline = x => x && (x.nodeType === 3 || (x.nodeType === 1 && !BLOCKISH.test(x.localName)));
        if (inline(n.previousSibling) && inline(n.nextSibling)) to.append(' ');
        continue;
      }
      to.append(n.data.replace(/[ \t]*[\r\n]\s*/g, ' '));
      continue;
    }
    if (n.nodeType !== 1) continue;
    let tag = n.localName;
    if (DROP.has(tag) || n.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
    tag = RENAME[tag] || tag;
    if (!ALLOW.has(tag)) { copyKids(n, to, pre); if (tag === 'td' || tag === 'th') to.append(' '); continue; }
    const el = document.createElement(tag);
    const st = cleanStyle(n);
    if (st) el.setAttribute('style', st);
    if (tag === 'font') {
      const c = n.getAttribute('color'), f = n.getAttribute('face');
      if (c && COLOR.test(c.trim())) el.setAttribute('color', c.trim());
      if (f && FAMILY.test(f)) el.setAttribute('face', f);
    }
    if (tag === 'a') {
      const href = (n.getAttribute('href') || '').trim();
      if (/^https?:\/\//i.test(href)) { el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
    }
    copyKids(n, el, pre || n.localName === 'pre');
    to.append(el);
  }
}
// Only basic formatting survives: no scripts, handlers, frames, images or stray CSS.
export function sanitize(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  const out = document.createElement('div');
  copyKids(doc.body, out);
  return out.innerHTML;
}

const textToHtml = t => String(t).replace(/\r\n?/g, '\n').split('\n').map(l => `<div>${esc(l) || '<br>'}</div>`).join('');

// ---------- RTF ----------
// Reads the parts of RTF that matter here: fonts, colours, b/i/u/strike, sizes,
// paragraphs, alignment and indents. Pictures, objects and headers are skipped.
function parseRtf(s) {
  let i = 0;
  const group = () => {
    const items = [];
    while (i < s.length) {
      const c = s[i];
      if (c === '{') { i++; items.push({ g: group() }); }
      else if (c === '}') { i++; return items; }
      else if (c === '\\') {
        const d = s[++i];
        if (/[a-z]/i.test(d)) {
          const m = /^([a-z]{1,32})(-?\d{1,10})? ?/i.exec(s.slice(i, i + 48));
          i += m[0].length;
          items.push({ w: m[1], p: m[2] == null ? null : +m[2] });
        } else if (d === "'") {
          items.push({ t: new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(s.substr(i + 1, 2), 16) || 63])) });
          i += 3;
        } else {
          i++;
          if (d === '\n' || d === '\r') items.push({ w: 'par', p: null });
          else if (d === '*') items.push({ w: '*' });
          else if (d === '~') items.push({ t: '\u00a0' });
          else if (d === '_') items.push({ t: '-' });
          else if (d !== '-' && d !== undefined) items.push({ t: d });
        }
      } else if (c === '\r' || c === '\n') i++;
      else {
        let j = i;
        while (j < s.length && !'{}\\\r\n'.includes(s[j])) j++;
        items.push({ t: s.slice(i, j) });
        i = j;
      }
    }
    return items;
  };
  return group();
}
const SKIP = new Set(['info', 'stylesheet', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'fldinst', 'pntxta', 'pntxtb']);
const SPECIAL = { tab: '\t', bullet: '\u2022', emdash: '\u2014', endash: '\u2013', lquote: '\u2018', rquote: '\u2019', ldblquote: '\u201c', rdblquote: '\u201d', emspace: '\u2003', enspace: '\u2002' };

function rtfToHtml(src) {
  const fonts = {}, colors = [''];
  const paras = [];
  let runs = '';
  const para = { align: '', li: 0, ri: 0, fi: 0 };
  const plain = { b: false, i: false, ul: false, strike: false, fs: 0, f: null, cf: 0, uc: 1 };
  function emit(t, st) {
    if (!t) return;
    let s = esc(t);
    const css = [];
    if (st.f != null && fonts[st.f]) css.push(`font-family: ${fontStack(fonts[st.f])}`);
    if (st.fs) css.push(`font-size: ${st.fs}pt`);
    if (st.cf && colors[st.cf]) css.push(`color: ${colors[st.cf]}`);
    if (st.b) s = `<b>${s}</b>`;
    if (st.i) s = `<i>${s}</i>`;
    if (st.ul) s = `<u>${s}</u>`;
    if (st.strike) s = `<s>${s}</s>`;
    runs += css.length ? `<span style='${css.join('; ')}'>${s}</span>` : s;
  }
  function endPara() {
    const css = [];
    if (para.align) css.push('text-align: ' + para.align);
    if (para.li) css.push(`margin-left: ${para.li / 1440}in`);
    if (para.ri) css.push(`margin-right: ${para.ri / 1440}in`);
    if (para.fi) css.push(`text-indent: ${para.fi / 1440}in`);
    paras.push(`<div${css.length ? ` style='${css.join('; ')}'` : ''}>${runs || '<br>'}</div>`);
    runs = '';
  }
  function run(items, outer) {
    const st = { ...outer };
    const first = items[0];
    if (first && (first.w === '*' || SKIP.has(first.w))) return;
    if (first && first.w === 'fonttbl') {
      for (const it of items) if (it.g) {
        const n = it.g.find(x => x.w === 'f');
        const name = it.g.filter(x => x.t != null).map(x => x.t).join('').replace(/;.*$/, '').trim();
        if (n && name) fonts[n.p] = name;
      }
      return;
    }
    if (first && first.w === 'colortbl') {
      let c = [0, 0, 0], any = false;
      for (const it of items.slice(1)) {
        if (it.w === 'red') { c[0] = it.p; any = true; } else if (it.w === 'green') { c[1] = it.p; any = true; } else if (it.w === 'blue') { c[2] = it.p; any = true; }
        else if (it.t != null && it.t.includes(';')) { for (const _ of it.t.match(/;/g)) { colors.push(any ? `rgb(${c.join(', ')})` : ''); c = [0, 0, 0]; any = false; } }
      }
      colors.shift();
      if (colors[0] !== '') colors.unshift('');
      return;
    }
    let skip = 0;
    for (const it of items) {
      if (it.g) { run(it.g, st); continue; }
      if (it.t != null) {
        let t = it.t;
        if (skip) { const n = Math.min(skip, t.length); t = t.slice(n); skip -= n; }
        emit(t, st);
        continue;
      }
      const p = it.p;
      switch (it.w) {
        case 'b': st.b = p !== 0; break;
        case 'i': st.i = p !== 0; break;
        case 'ul': st.ul = p !== 0; break;
        case 'ulnone': st.ul = false; break;
        case 'strike': st.strike = p !== 0; break;
        case 'fs': st.fs = (p || 24) / 2; break;
        case 'f': st.f = p; break;
        case 'cf': st.cf = p || 0; break;
        case 'uc': st.uc = p || 0; break;
        case 'plain': Object.assign(st, plain, { uc: st.uc }); break;
        case 'u': emit(String.fromCharCode(p < 0 ? p + 65536 : p), st); skip = st.uc; break;
        case 'par': endPara(); break;
        case 'line': runs += '<br>'; break;
        case 'pard': Object.assign(para, { align: '', li: 0, ri: 0, fi: 0 }); break;
        case 'ql': para.align = ''; break;
        case 'qc': para.align = 'center'; break;
        case 'qr': para.align = 'right'; break;
        case 'qj': para.align = 'justify'; break;
        case 'li': para.li = p || 0; break;
        case 'ri': para.ri = p || 0; break;
        case 'fi': para.fi = p || 0; break;
        default: if (SPECIAL[it.w]) emit(SPECIAL[it.w], st);
      }
    }
  }
  const tree = parseRtf(String(src));
  run(tree.length === 1 && tree[0].g ? tree[0].g : tree, plain);
  if (runs) endPara();
  return paras.join('');
}

function fontStack(name) {
  const k = Object.keys(FONTS).find(f => f.toLowerCase() === String(name).toLowerCase());
  return k ? FONTS[k] : `"${String(name).replace(/["\\]/g, '')}", serif`;
}
function fontNameOf(family) {
  const first = String(family).split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  return Object.keys(FONTS).find(k => FONTS[k].split(',')[0].replace(/["']/g, '').trim().toLowerCase() === first || k.toLowerCase() === first) || '';
}

// ---------- the program ----------
function open(arg) {
  const uid = 'wp' + Math.random().toString(36).slice(2, 7);
  const opts = { toolbar: true, format: true, ruler: true, status: true, wrap: 'window', units: 'in', ...store.get(SETTINGS, {}) };
  let name = 'Document', path = null, docType = 'word', savedHtml = '';
  let saved = null;          // the last selection inside the page
  let tabs = [];             // tab stops in px
  const pending = {};        // the point size waiting for execCommand's size-7 marker (see applyStyle)
  let findWin = null;
  const find = { what: '', repl: '', whole: false, matchCase: false };

  const page = h('div', { class: 'wp-page', contenteditable: 'true', spellcheck: false, role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Document' });
  const area = h('div', { class: 'wp-area' }, page);
  const hint = h('span', null, 'For Help, press F1');
  const numCell = h('div', { class: 'wp-num' }, 'NUM');
  const status = h('div', { class: 'statusbar' }, hint, numCell);
  const title = () => `${name} - WordPad`;
  const dirty = () => page.innerHTML !== savedHtml;

  // ---------- selection ----------
  function onSel() {
    const s = getSelection();
    if (s.rangeCount && page.contains(s.anchorNode)) { saved = s.getRangeAt(0).cloneRange(); syncSoon(); }
  }
  document.addEventListener('selectionchange', onSel);
  function restore() {
    if (document.activeElement !== page) page.focus({ preventScroll: true });
    if (saved && page.contains(saved.startContainer)) {
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(saved);
    }
  }
  function cmd(name, val) {
    restore();
    document.execCommand(name, false, val);
    fixMarks();
    syncSoon();
  }
  // Fonts and colours go in as CSS so Undo can take them back out. execCommand only
  // knows HTML font sizes 1-7, so a size goes in as size 7 (xxx-large) and then gets
  // the real point size.
  function applyStyle(kind, value) {
    restore();
    document.execCommand('styleWithCSS', false, true);
    if (kind === 'size') { pending.size = value; document.execCommand('fontSize', false, '7'); }
    else if (kind === 'face') document.execCommand('fontName', false, value);
    else document.execCommand('foreColor', false, value || '#000000');
    document.execCommand('styleWithCSS', false, false);
    fixMarks();
    syncSoon();
  }
  function fixMarks() {
    for (const el of page.querySelectorAll('[style*="xxx-large"], font[size="7"]')) {
      el.removeAttribute('size');
      el.style.fontSize = pending.size || '';
      for (const d of el.querySelectorAll('[style]')) { d.style.fontSize = ''; if (!d.getAttribute('style')) d.removeAttribute('style'); }
      if (!el.getAttribute('style')) el.removeAttribute('style');
    }
  }
  function setState(name, want) {
    restore();
    if (document.queryCommandState(name) !== want) document.execCommand(name);
  }
  const caretEl = () => {
    let el = saved ? saved.startContainer : page;
    if (el.nodeType === 3) el = el.parentElement;
    return el && page.contains(el) ? el : page;
  };
  const blockOf = el => { for (let e = el; e && e !== page; e = e.parentElement) if (BLOCKS.has(e.nodeName) && e.nodeName !== 'UL' && e.nodeName !== 'OL') return e; return page; };
  function decoOf(el) {
    let u = false, s = false;
    for (let e = el; e && e !== area; e = e.parentElement) {
      const d = getComputedStyle(e).textDecorationLine;
      if (d.includes('underline')) u = true;
      if (d.includes('line-through')) s = true;
    }
    return { u, s };
  }
  // The paragraphs the selection touches; bare text straight in the page gets wrapped first.
  function blocks() {
    const r = saved || document.createRange();
    if (!saved) r.setStart(page, 0);
    const leaf = b => !b.querySelector('p,div,li,h1,h2,h3');
    let list = [...page.querySelectorAll('p,div,li,h1,h2,h3')].filter(b => leaf(b) && r.intersectsNode(b));
    if (!list.length) {
      cmd('formatBlock', 'div');
      list = [blockOf(caretEl())].filter(b => b !== page);
    }
    return list;
  }

  // ---------- toolbar and format bar ----------
  function tool(glyph, label, tip, action, toggle) {
    const b = h('button', { type: 'button', class: 'wp-tb', title: label, 'aria-label': label, 'aria-pressed': toggle ? 'false' : null });
    if (glyph.startsWith('i-')) b.append(icon(glyph)); else b.innerHTML = glyph;
    // Keep the caret in the page: buttons don't take focus from a pointer.
    b.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') e.preventDefault(); });
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', action);
    b.addEventListener('pointerenter', () => { hint.textContent = tip; });
    b.addEventListener('pointerleave', () => { hint.textContent = 'For Help, press F1'; });
    return b;
  }
  const sep = () => h('span', { class: 'wp-sep' });
  const toolbar = h('div', { class: 'wp-bar wp-tools' },
    tool(G.new, 'New', 'Creates a new document', () => newDoc()),
    tool('i-folder-open', 'Open', 'Opens an existing document', () => openDoc()),
    tool('i-floppy', 'Save', 'Saves the active document', () => save()),
    sep(),
    tool('i-printer', 'Print', 'Prints the active document', () => print()),
    tool(G.preview, 'Print Preview', 'Displays full pages', () => print()),
    sep(),
    tool(G.find, 'Find', 'Finds the specified text', () => findDialog(false)),
    sep(),
    tool(G.cut, 'Cut', 'Cuts the selection and puts it on the Clipboard', () => cmd('cut')),
    tool(G.copy, 'Copy', 'Copies the selection and puts it on the Clipboard', () => cmd('copy')),
    tool(G.paste, 'Paste', 'Inserts Clipboard contents', () => paste()),
    tool(G.undo, 'Undo', 'Undoes the last action', () => cmd('undo')),
    sep(),
    tool(G.date, 'Date/Time', 'Inserts the current date and/or time', () => dateDialog()));

  const fontSel = h('select', { class: 'field wp-font', 'aria-label': 'Font', title: 'Font' },
    h('option', { value: '' }, ''), ...Object.keys(FONTS).map(f => h('option', { value: f }, f)));
  const sizeSel = h('select', { class: 'field wp-size', 'aria-label': 'Font Size', title: 'Font Size' },
    h('option', { value: '' }, ''), ...SIZES.map(s => h('option', { value: s }, String(s))));
  fontSel.addEventListener('change', () => { if (fontSel.value) applyStyle('face', FONTS[fontSel.value]); });
  sizeSel.addEventListener('change', () => { if (sizeSel.value) applyStyle('size', sizeSel.value + 'pt'); });
  for (const s of [fontSel, sizeSel]) {
    s.addEventListener('pointerenter', () => { hint.textContent = s === fontSel ? 'Changes the font of the selection' : 'Changes the font size of the selection'; });
    s.addEventListener('pointerleave', () => { hint.textContent = 'For Help, press F1'; });
  }
  const bBtn = tool(G.bold, 'Bold', 'Makes the selection bold (toggle)', () => cmd('bold'), true);
  const iBtn = tool(G.italic, 'Italic', 'Makes the selection italic (toggle)', () => cmd('italic'), true);
  const uBtn = tool(G.underline, 'Underline', 'Underlines the selection (toggle)', () => cmd('underline'), true);
  const colorBtn = tool(G.color, 'Color', 'Formats the selection with a color', () => {
    openMenu([...COLORS.map(([n, c]) => ({ label: n, img: swatch(c), action: () => applyStyle('color', c) })),
      { label: 'Automatic', img: swatch('#000000'), action: () => applyStyle('color', '') }],
    { rect: colorBtn.getBoundingClientRect() });
  });
  const alignBtns = {
    left: tool(G.left, 'Align Left', 'Aligns text to the left', () => cmd('justifyLeft'), true),
    center: tool(G.center, 'Center', 'Centers text', () => cmd('justifyCenter'), true),
    right: tool(G.right, 'Align Right', 'Aligns text to the right', () => cmd('justifyRight'), true),
  };
  const bulletBtn = tool(G.bullets, 'Bullets', 'Inserts a bullet on this line', () => cmd('insertUnorderedList'), true);
  const formatbar = h('div', { class: 'wp-bar wp-fmt' },
    fontSel, sizeSel, sep(), bBtn, iBtn, uBtn, colorBtn, sep(), alignBtns.left, alignBtns.center, alignBtns.right, sep(), bulletBtn);

  // ---------- ruler ----------
  const ticks = h('div', { class: 'wp-ticks' });
  const marks = { first: h('i', { class: 'wp-mk first' }), left: h('i', { class: 'wp-mk left' }), right: h('i', { class: 'wp-mk right' }) };
  const strip = h('div', { class: 'wp-strip' }, ticks, marks.first, marks.left, marks.right);
  const ruler = h('div', { class: 'wp-ruler', 'aria-hidden': 'true' }, strip);
  function drawRuler() {
    const unit = opts.units === 'cm' ? UNITS.cm[0] : 96, sub = opts.units === 'cm' ? 4 : 8;
    let d = '', t = '';
    for (let i = 1; i * unit / sub < 2000; i++) {
      const x = Math.round(i * unit / sub) + 0.5;
      if (i % sub === 0) t += `<text x="${x}" y="11.5">${i / sub}</text>`;
      else if (i % (sub / 2) === 0) d += `M${x} 5v6`;
      else d += `M${x} 7v2`;
    }
    for (const s of tabs) d += `M${s + 0.5} 10v5M${s} 14.5h5`;
    ticks.innerHTML = `<svg width="2000" height="16" shape-rendering="crispEdges"><path d="${d}" stroke="#000" fill="none"/>${t}</svg>`;
  }
  function layoutRuler() {
    if (ruler.hidden || !page.isConnected) return;
    const pr = page.getBoundingClientRect(), rr = ruler.getBoundingClientRect();
    const cs = getComputedStyle(page);
    const pl = parseFloat(cs.paddingLeft), pw = page.clientWidth - pl - parseFloat(cs.paddingRight);
    strip.style.left = Math.round(pr.left - rr.left + pl) + 'px';
    strip.style.width = Math.max(0, pw) + 'px';
    const b = blockOf(caretEl()), bs = getComputedStyle(b);
    const ml = b === page ? 0 : parseFloat(bs.marginLeft) || 0, mr = b === page ? 0 : parseFloat(bs.marginRight) || 0;
    marks.first.style.left = ml + (parseFloat(bs.textIndent) || 0) + 'px';
    marks.left.style.left = ml + 'px';
    marks.right.style.left = pw - mr + 'px';
  }
  area.addEventListener('scroll', layoutRuler);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layoutRuler()) : null;
  if (ro) ro.observe(area);

  // ---------- keeping the bars in step with the caret ----------
  let syncing = 0;
  function syncSoon() { if (!syncing) syncing = requestAnimationFrame(() => { syncing = 0; syncUI(); }); }
  function syncUI() {
    const el = caretEl(), cs = getComputedStyle(el);
    const live = document.activeElement === page;
    const f = fontNameOf(cs.fontFamily);
    if (document.activeElement !== fontSel) fontSel.value = f;
    const pt = Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2;
    if (document.activeElement !== sizeSel) {
      let o = sizeSel.querySelector('.extra');
      if (!SIZES.includes(pt)) {
        if (!o) { o = h('option', { class: 'extra' }); sizeSel.append(o); }
        o.value = o.textContent = String(pt);
      } else if (o) o.remove();
      sizeSel.value = String(pt);
    }
    const deco = decoOf(el);
    const state = (c, fallback) => { try { return live ? document.queryCommandState(c) : fallback; } catch { return fallback; } };
    bBtn.setAttribute('aria-pressed', String(state('bold', +cs.fontWeight >= 600)));
    iBtn.setAttribute('aria-pressed', String(state('italic', cs.fontStyle === 'italic')));
    uBtn.setAttribute('aria-pressed', String(state('underline', deco.u)));
    const align = getComputedStyle(blockOf(el)).textAlign;
    const a = align === 'center' ? 'center' : align === 'right' || align === 'end' ? 'right' : 'left';
    for (const [k, b] of Object.entries(alignBtns)) b.setAttribute('aria-pressed', String(k === a));
    bulletBtn.setAttribute('aria-pressed', String(!!el.closest('ul')));
    layoutRuler();
  }

  // ---------- views ----------
  const rbSync = []; // ribbon checkboxes, so the Alt+V menu and Options dialog keep them in step
  function applyView() {
    rbSync.forEach(f => f());
    toolbar.hidden = !opts.toolbar;
    formatbar.hidden = !opts.format;
    ruler.hidden = !opts.ruler;
    status.hidden = !opts.status;
    root.dataset.wrap = opts.wrap;
    page.style.tabSize = (tabs[0] || 48) + 'px';
    drawRuler();
    layoutRuler();
    store.set(SETTINGS, opts);
  }
  const toggle = k => () => { opts[k] = !opts[k]; applyView(); };

  // ---------- documents ----------
  function load(n, html, p, type) {
    name = n; path = p || null; docType = type;
    tabs = [];
    page.innerHTML = html || '<div><br></div>';
    if (!page.firstChild) page.innerHTML = '<div><br></div>';
    page.style.fontFamily = type === 'text' ? FONTS['Courier New'] : '';
    savedHtml = page.innerHTML;
    saved = null;
    win && win.setTitle(title());
    area.scrollTop = 0;
    page.focus({ preventScroll: true });
    const r = document.createRange();
    r.setStart(page, 0); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    applyView();
    syncSoon();
  }
  const typeOf = n => /\.txt$/i.test(n) ? 'text' : /\.rtf$/i.test(n) ? 'rtf' : 'word';
  // Turns what was stored (or read from a real file) into page HTML.
  function convert(n, text) {
    const t = String(text ?? '');
    if (/^\s*\{\\rtf/.test(t)) return sanitize(rtfToHtml(t));
    if (/\.txt$/i.test(n)) return textToHtml(t);
    if (/<\/?[a-z][^>]*>/i.test(t)) return sanitize(t);
    return textToHtml(t);
  }

  async function confirmSave() {
    if (!dirty()) return true;
    const b = await msgbox({ title: 'WordPad', icon: 'warn', parent: win, buttons: ['&Yes', '&No', 'Cancel'], text: `Save changes to ${name}?` });
    if (b === 'Yes') return save();
    return b === 'No';
  }
  async function newDoc() {
    const type = await pickType();
    if (!type || !(await confirmSave())) return;
    load('Document', '', null, type);
  }
  function pickType() {
    return new Promise(res => {
      let pick = 'word', done = false;
      const finish = v => { if (done) return; done = true; res(v); d.close(true); };
      const lb = h('div', { class: 'listbox wp-types', tabindex: '0', role: 'listbox', 'aria-label': 'New document type' });
      const rows = Object.entries(TYPES).map(([k, t]) => {
        const o = h('div', { class: 'opt' + (k === pick ? ' sel' : ''), role: 'option' }, t.label);
        o.addEventListener('click', () => select(k));
        o.addEventListener('dblclick', () => finish(k));
        o.key = k;
        return o;
      });
      lb.append(...rows);
      const select = k => { pick = k; rows.forEach(o => o.classList.toggle('sel', o.key === k)); };
      lb.addEventListener('keydown', e => {
        const ks = Object.keys(TYPES), i = ks.indexOf(pick);
        if (e.key === 'ArrowDown') { e.preventDefault(); select(ks[Math.min(ks.length - 1, i + 1)]); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); select(ks[Math.max(0, i - 1)]); }
        else if (e.key === 'Enter') { e.preventDefault(); finish(pick); }
      });
      const form = h('div', { class: 'dlg wp-dlg' },
        h('div', { class: 'wp-side' },
          h('div', { class: 'wp-col' }, h('label', { html: '<u>N</u>ew document type:', 'data-k': 'n' }), lb),
          h('div', { class: 'wp-btncol' },
            h('button', { class: 'btn default', type: 'button', onclick: () => finish(pick) }, 'OK'),
            h('button', { class: 'btn', type: 'button', onclick: () => finish(null) }, 'Cancel'))));
      dialogKeys(form, () => finish(null), { n: lb });
      const d = createWindow({ title: 'New', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false, onClose: () => { if (!done) { done = true; res(null); } } });
      lb.focus();
    });
  }

  async function openDoc() {
    if (!(await confirmSave())) return;
    const r = await openFile({
      title: 'Open', parent: win,
      filters: [TYPES.word.filter, { label: 'Windows Write (*.wri)', exts: ['.wri'] }, TYPES.rtf.filter, TYPES.text.filter, { label: 'All Documents (*.*)', exts: [] }],
      accept: '.doc,.wri,.rtf,.txt,.htm,.html,text/plain,text/html,text/rtf,application/rtf',
    });
    if (!r) return;
    if (r.file) return openReal(r.file);
    openNode(r.node, r.path);
  }
  function openNode(node, p) {
    if (!node || node.kind !== 'file') { msgbox({ title: 'WordPad', icon: 'warn', parent: win, text: `${p}\nCannot find this file.\nPlease verify that the correct path and file name are given.` }); return; }
    if (node.data || node.text == null) { msgbox({ title: 'WordPad', icon: 'error', parent: win, text: `WordPad cannot open ${node.name}.\n\nIt isn't a document. Try opening it with Paint.` }); return; }
    load(node.name, convert(node.name, node.text), node.user ? p : null, typeOf(node.name));
    if (node.user) remember(p);
  }
  async function openReal(file) {
    if (file.size > 4e6) { msgbox({ title: 'WordPad', icon: 'error', parent: win, text: `${file.name} is too large for WordPad.` }); return; }
    let t;
    try { t = await file.text(); } catch { msgbox({ title: 'WordPad', icon: 'error', parent: win, text: `Cannot read ${file.name}.` }); return; }
    if (t.slice(0, 4096).includes('\u0000')) {
      msgbox({ title: 'WordPad', icon: 'error', parent: win, text: `WordPad cannot read ${file.name}.\n\nIt was saved in a format this WordPad doesn't understand. Save it as Rich Text (.rtf), HTML or Text and try again.` });
      return;
    }
    const n = /\.html?$/i.test(file.name) && !/<[a-z!]/i.test(t) ? file.name + '.txt' : file.name;
    load(file.name, convert(n, t), null, typeOf(file.name));
  }

  const hasFormatting = () => !!page.querySelector('b,i,u,s,font,span,ul,ol,h1,h2,h3,a,[style]');
  async function save() {
    const node = path && resolve(path);
    if (!path || (node && !node.user)) return saveAsDialog();
    return write({ path, name });
  }
  async function saveAsDialog() {
    const order = [docType, ...Object.keys(TYPES).filter(k => k !== docType)];
    const base = path ? name : name.replace(/\.[a-z0-9]+$/i, '') + TYPES[docType].filter.exts[0];
    const r = await saveAs({ title: 'Save As', name: base, filters: order.map(k => TYPES[k].filter), parent: win });
    if (!r) return false;
    return write(r);
  }
  async function write(r) {
    const type = typeOf(r.name);
    if (type === 'text' && docType !== 'text' && hasFormatting()) {
      const b = await msgbox({ title: 'WordPad', icon: 'warn', parent: win, buttons: ['&Yes', '&No'],
        text: 'You are about to save the document in a Text-Only format, which will remove all formatting.\n\nAre you sure you want to do this?' });
      if (b !== 'Yes') return false;
    }
    const html = sanitize(page.innerHTML);
    const text = type === 'text' ? plainText() : type === 'rtf' ? toRtf() : html;
    const node = saveTo(r, { text }, () => blobFor(type, text, html), win);
    if (!r.floppy && !node) return false;
    name = r.name; path = r.floppy ? null : r.path; docType = type;
    savedHtml = page.innerHTML;
    win.setTitle(title());
    if (path) remember(path);
    blankie.tip('save');
    return true;
  }
  function blobFor(type, text, html) {
    if (type === 'text') return new Blob([text.replace(/\n/g, '\r\n')], { type: 'text/plain' });
    if (type === 'rtf') return new Blob([text], { type: 'application/rtf' });
    // Word happily opens an HTML file named .doc.
    return new Blob([`<html><head><meta charset="utf-8"><title>${esc(name)}</title></head><body style="font: 10pt 'Times New Roman', serif">${html}</body></html>`], { type: 'application/msword' });
  }

  function plainText() {
    let out = '';
    const walk = n => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) out += c.data;
        else if (c.nodeName === 'BR') { if (c.nextSibling || !BLOCKS.has(c.parentNode.nodeName)) out += '\n'; }
        else if (c.nodeType === 1) {
          const block = BLOCKS.has(c.nodeName);
          if (block && out && !out.endsWith('\n')) out += '\n';
          if (c.nodeName === 'LI') out += '\u2022\t';
          walk(c);
          if (block && !out.endsWith('\n')) out += '\n';
          else if (block && c.lastChild && c.lastChild.nodeName === 'BR' && !c.textContent) out += '\n';
        }
      }
    };
    walk(page);
    return out.replace(/\u00a0/g, ' ').replace(/\n$/, '');
  }

  // Real RTF from what's on screen, so downloads open in Word and in the real WordPad.
  function toRtf() {
    const fonts = [], colors = [], paras = [];
    let cur = null;
    const fontIx = fam => { const f = fam.split(',')[0].replace(/["']/g, '').trim() || 'Times New Roman'; let i = fonts.indexOf(f); if (i < 0) i = fonts.push(f) - 1; return i; };
    const colorIx = c => {
      const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c);
      if (!m || (m[1] === '0' && m[2] === '0' && m[3] === '0')) return 0;
      const k = `\\red${m[1]}\\green${m[2]}\\blue${m[3]};`;
      let i = colors.indexOf(k); if (i < 0) i = colors.push(k) - 1;
      return i + 1;
    };
    const rtfEsc = s => [...s.replace(/\u00a0/g, ' ')].map(ch => {
      const n = ch.codePointAt(0);
      if (ch === '\\' || ch === '{' || ch === '}') return '\\' + ch;
      if (ch === '\t') return '\\tab ';
      if (n < 128) return ch;
      if (n > 0xffff) return [...String.fromCodePoint(n)].map(() => '?').join('');
      return `\\u${n > 32767 ? n - 65536 : n}?`;
    }).join('');
    const twips = v => Math.round((parseFloat(v) || 0) * 15);
    const ensure = blk => {
      if (cur) return;
      const cs = getComputedStyle(blk);
      let props = cs.textAlign === 'center' ? '\\qc' : cs.textAlign === 'right' ? '\\qr' : cs.textAlign === 'justify' ? '\\qj' : '';
      if (blk !== page) {
        const li = twips(cs.marginLeft) + (blk.nodeName === 'LI' ? 360 : 0), ri = twips(cs.marginRight), fi = twips(cs.textIndent) - (blk.nodeName === 'LI' ? 360 : 0);
        if (li) props += '\\li' + li;
        if (ri) props += '\\ri' + ri;
        if (fi) props += '\\fi' + fi;
      }
      cur = { props, runs: blk.nodeName === 'LI' ? '\\bullet\\tab ' : '' };
      paras.push(cur);
    };
    const walk = (n, blk) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) {
          if (!c.data) continue;
          ensure(blk);
          const el = c.parentElement, cs = getComputedStyle(el), d = decoOf(el);
          let fmt = `\\f${fontIx(cs.fontFamily)}\\fs${Math.round(parseFloat(cs.fontSize) * 1.5)}`;
          const ci = colorIx(cs.color);
          if (ci) fmt += '\\cf' + ci;
          if (+cs.fontWeight >= 600) fmt += '\\b';
          if (cs.fontStyle === 'italic') fmt += '\\i';
          if (d.u) fmt += '\\ul';
          if (d.s) fmt += '\\strike';
          cur.runs += `{${fmt} ${rtfEsc(c.data)}}`;
        } else if (c.nodeName === 'BR') {
          ensure(blk);
          if (c.nextSibling || c.parentNode !== blk) cur.runs += '\\line ';
        } else if (c.nodeType === 1) {
          if (BLOCKS.has(c.nodeName)) { cur = null; walk(c, c.nodeName === 'UL' || c.nodeName === 'OL' ? blk : c); cur = null; }
          else walk(c, blk);
        }
      }
    };
    walk(page, page);
    const body = paras.map(p => `\\pard${p.props} ${p.runs}\\par\n`).join('');
    return `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl${(fonts.length ? fonts : ['Times New Roman']).map((f, i) => `{\\f${i}\\fnil ${f};}`).join('')}}\n` +
      `{\\colortbl ;${colors.join('')}}\n\\viewkind4\\uc1\n${body}}\n`;
  }

  function print() {
    import('./printers.js').then(m => m.printJob(name, sanitize(page.innerHTML), { css: `
      @page { margin: 1in 1.25in; } body { margin: 0; font: 10pt "Times New Roman", Times, serif; white-space: pre-wrap; tab-size: ${tabs[0] || 48}px; color: #000; }
      p, div { margin: 0; } h1, h2, h3 { margin: 0; } ul, ol { margin: 0; }` }));
  }

  async function paste() {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) if (it.types.includes('text/html')) { cmd('insertHTML', sanitize(await (await it.getType('text/html')).text())); return; }
      }
      cmd('insertText', await navigator.clipboard.readText());
    } catch {
      restore();
      msgbox({ title: 'WordPad', icon: 'info', parent: win, text: 'Your browser keeps the Clipboard to itself.\n\nPress Ctrl+V to paste instead.' });
    }
  }
  page.addEventListener('paste', e => {
    const dt = e.clipboardData;
    if (!dt) return;
    e.preventDefault();
    const html = dt.getData('text/html');
    if (html) document.execCommand('insertHTML', false, sanitize(html));
    else document.execCommand('insertText', false, dt.getData('text/plain'));
  });
  let dragging = false;
  page.addEventListener('dragstart', () => { dragging = true; });
  page.addEventListener('dragend', () => { dragging = false; });
  page.addEventListener('drop', e => {
    if (dragging) return;  // moving text inside the page is fine
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt || dt.files.length) return;
    const pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (pos) { saved = pos; }
    const html = dt.getData('text/html');
    if (html) cmd('insertHTML', sanitize(html)); else cmd('insertText', dt.getData('text/plain'));
  });

  // ---------- recent files ----------
  function remember(p) {
    const list = store.get(RECENT, []).filter(x => x.toUpperCase() !== p.toUpperCase());
    list.unshift(p);
    store.set(RECENT, list.slice(0, 4));
  }
  async function openRecent(p) {
    if (!(await confirmSave())) return;
    const n = resolve(p);
    if (!n) store.set(RECENT, store.get(RECENT, []).filter(x => x !== p));
    openNode(n, p);
  }

  // ---------- Find and Replace ----------
  const isWord = c => !!c && /[\p{L}\p{N}_]/u.test(c);
  function textIndex() {
    const nodes = [];
    let s = '', last = null;
    const w = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      const b = blockOf(n.parentElement);
      if (last && b !== last) s += '\n';
      last = b;
      nodes.push({ n, at: s.length });
      s += n.data;
    }
    return { s, nodes };
  }
  function caretPos(nodes, r) {
    if (!r) return 0;
    for (const x of nodes) if (x.n === r.endContainer) return x.at + r.endOffset;
    const pt = document.createRange();
    pt.setStart(r.endContainer, r.endOffset);
    for (const x of nodes) if (pt.comparePoint(x.n, 0) > 0) return x.at;
    return Infinity;
  }
  function locate(from, r) {
    const { s, nodes } = textIndex();
    const nd = find.matchCase ? find.what : find.what.toLowerCase();
    const hay = find.matchCase ? s : s.toLowerCase();
    const ok = i => !find.whole || (!isWord(s[i - 1]) && !isWord(s[i + nd.length]));
    const at = from == null ? caretPos(nodes, r) : from;
    let i = hay.indexOf(nd, at);
    while (i >= 0 && !ok(i)) i = hay.indexOf(nd, i + 1);
    if (i < 0) return null;
    const range = document.createRange();
    const a = nodes.findLast(x => x.at <= i), b = nodes.findLast(x => x.at < i + nd.length);
    range.setStart(a.n, i - a.at);
    range.setEnd(b.n, i + nd.length - b.at);
    return range;
  }
  function selectRange(r) {
    saved = r;
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    const el = r.startContainer.parentElement;
    if (el) {
      const er = r.getBoundingClientRect(), ar = area.getBoundingClientRect();
      if (er.top < ar.top || er.bottom > ar.bottom) area.scrollTop += er.top - ar.top - ar.height / 3;
    }
    if (window.CSS && CSS.highlights && window.Highlight) CSS.highlights.set('wp-find', new Highlight(r));
    syncSoon();
  }
  function findNext() {
    if (!find.what) { findDialog(false); return false; }
    const r = locate(null, saved) || locate(0);
    if (!r) { msgbox({ title: 'WordPad', icon: 'info', parent: findWin || win, text: 'WordPad has finished searching the document.' }); return false; }
    selectRange(r);
    return true;
  }
  const matches = () => {
    if (!saved) return false;
    const t = saved.toString();
    return find.matchCase ? t === find.what : t.toLowerCase() === find.what.toLowerCase();
  };
  function replaceOne() {
    if (matches()) cmd('insertText', find.repl);
    findNext();
  }
  function replaceAll() {
    let n = 0, pos = 0;
    for (; n < 5000; n++) {
      const r = locate(pos);
      if (!r) break;
      selectRange(r);
      restore();
      document.execCommand('insertText', false, find.repl);
      const s = getSelection();
      saved = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
      pos = caretPos(textIndex().nodes, saved);
    }
    msgbox({ title: 'WordPad', icon: 'info', parent: findWin || win, text: n ? 'WordPad has finished searching the document.' : `Cannot find "${find.what}".` });
  }
  function findDialog(replace) {
    if (findWin) findWin.close(true);
    const sel = saved && saved.toString();
    if (sel && !sel.includes('\n') && sel.length < 80) find.what = sel;
    const what = h('input', { class: 'field', id: uid + '-what', value: find.what, autocomplete: 'off' });
    const repl = replace ? h('input', { class: 'field', id: uid + '-repl', value: find.repl, autocomplete: 'off' }) : null;
    const whole = h('input', { type: 'checkbox', checked: find.whole });
    const mc = h('input', { type: 'checkbox', checked: find.matchCase });
    const nextBtn = h('button', { class: 'btn default', type: 'submit', html: '<u>F</u>ind Next' });
    const replBtn = replace ? h('button', { class: 'btn', type: 'button', html: '<u>R</u>eplace', onclick: () => { sync(); replaceOne(); back(replBtn); } }) : null;
    const allBtn = replace ? h('button', { class: 'btn', type: 'button', html: 'Replace <u>A</u>ll', onclick: () => { sync(); replaceAll(); back(allBtn); } }) : null;
    // Selecting text in the page focuses it, so hand the focus back to the dialog.
    const back = el => { if (findWin === d && !d.modal) el.focus({ preventScroll: true }); };
    const sync = () => {
      find.what = what.value; if (repl) find.repl = repl.value; find.whole = whole.checked; find.matchCase = mc.checked;
      for (const b of [nextBtn, replBtn, allBtn]) if (b) b.disabled = !what.value;
    };
    const form = h('form', { class: 'dlg wp-dlg wp-find' },
      h('div', { class: 'wp-side' },
        h('div', { class: 'wp-col' },
          h('div', { class: 'wp-frow' }, h('label', { for: what.id, html: 'Fi<u>n</u>d what:' }), what),
          repl && h('div', { class: 'wp-frow' }, h('label', { for: repl.id, html: 'Re<u>p</u>lace with:' }), repl),
          h('label', { class: 'wp-chk' }, whole, h('span', { html: 'Match <u>w</u>hole word only' })),
          h('label', { class: 'wp-chk' }, mc, h('span', { html: 'Match <u>c</u>ase' }))),
        h('div', { class: 'wp-btncol' }, nextBtn, replBtn, allBtn,
          h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancel'))));
    form.addEventListener('input', sync);
    form.addEventListener('submit', e => { e.preventDefault(); sync(); findNext(); back(what); });
    dialogKeys(form, () => d.close(), { n: what, p: repl, w: whole, c: mc, f: nextBtn, r: replBtn, a: allBtn });
    const d = findWin = createWindow({
      title: replace ? 'Replace' : 'Find', body: form, dialog: true, modal: false, resizable: false, width: 'auto', parent: win, taskbar: false,
      onClosed: () => { if (findWin === d) findWin = null; if (window.CSS && CSS.highlights) CSS.highlights.delete('wp-find'); },
    });
    sync();
    what.focus();
    what.select();
  }

  // ---------- Insert > Date and Time ----------
  function dateDialog() {
    const now = new Date();
    const f = o => now.toLocaleString('en-US', o);
    const pad = n => String(n).padStart(2, '0');
    const yy = pad(now.getFullYear() % 100);
    const formats = [...new Set([
      `${now.getMonth() + 1}/${now.getDate()}/${yy}`,
      f({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      `${now.getDate()} ${f({ month: 'long' })}, ${now.getFullYear()}`,
      f({ month: 'long', day: 'numeric', year: 'numeric' }),
      `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`,
      `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${yy}`,
      `${yy}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`,
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      `${pad(now.getDate())}-${f({ month: 'short' })}-${yy}`,
      f({ hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    ])];
    let pick = 0;
    const lb = h('div', { class: 'listbox wp-dates', tabindex: '0', role: 'listbox', 'aria-label': 'Available formats' });
    const rows = formats.map((t, i) => {
      const o = h('div', { class: 'opt' + (i === 0 ? ' sel' : ''), role: 'option' }, t);
      o.addEventListener('click', () => choose(i));
      o.addEventListener('dblclick', () => { choose(i); ok(); });
      return o;
    });
    lb.append(...rows);
    const choose = i => { pick = i; rows.forEach((o, j) => o.classList.toggle('sel', j === i)); rows[i].scrollIntoView({ block: 'nearest' }); };
    lb.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); choose(Math.min(rows.length - 1, pick + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); choose(Math.max(0, pick - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); ok(); }
    });
    const ok = () => { d.close(true); cmd('insertText', formats[pick]); };
    const form = h('div', { class: 'dlg wp-dlg' },
      h('div', { class: 'wp-side' },
        h('div', { class: 'wp-col' }, h('label', { html: '<u>A</u>vailable formats:' }), lb),
        h('div', { class: 'wp-btncol' },
          h('button', { class: 'btn default', type: 'button', onclick: ok }, 'OK'),
          h('button', { class: 'btn', type: 'button', onclick: () => d.close(true) }, 'Cancel'))));
    dialogKeys(form, () => d.close(true), { a: lb });
    const d = createWindow({ title: 'Date/Time', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    lb.focus();
  }

  // ---------- Format > Font ----------
  function combo(items, value, id, cls) {
    const input = h('input', { class: 'field', id, value, autocomplete: 'off' });
    const list = h('div', { class: 'listbox wp-cl', role: 'listbox', 'aria-labelledby': id + '-l' });
    let changed = () => {};
    const opts = items.map(v => {
      const o = h('div', { class: 'opt', role: 'option' }, String(v));
      o.addEventListener('click', () => { input.value = String(v); mark(); changed(); });
      return o;
    });
    list.append(...opts);
    function mark() {
      const v = input.value.trim().toLowerCase();
      let hit = null;
      for (const o of opts) { const on = o.textContent.toLowerCase() === v; o.classList.toggle('sel', on); if (on) hit = o; }
      if (hit && (hit.offsetTop < list.scrollTop || hit.offsetTop + hit.offsetHeight > list.scrollTop + list.clientHeight)) list.scrollTop = hit.offsetTop - 2;
    }
    input.addEventListener('input', () => { mark(); changed(); });
    input.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const i = opts.findIndex(o => o.classList.contains('sel'));
      const j = clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, opts.length - 1);
      input.value = opts[j].textContent; mark(); changed(); input.select();
    });
    return { el: h('div', { class: 'wp-combo ' + (cls || '') }, input, list), input, mark, set onchange(f) { changed = f; } };
  }
  function fontDialog() {
    const el = caretEl(), cs = getComputedStyle(el), deco = decoOf(el);
    const STYLES = ['Regular', 'Italic', 'Bold', 'Bold Italic'];
    const bold = +cs.fontWeight >= 600, italic = cs.fontStyle === 'italic';
    const start = {
      font: fontNameOf(cs.fontFamily), style: STYLES[(bold ? 2 : 0) + (italic ? 1 : 0)],
      size: String(Math.round(parseFloat(cs.fontSize) * 1.5) / 2), u: deco.u, s: deco.s,
      color: (COLORS.find(([, c]) => toRgb(c) === cs.color) || [''])[0],
    };
    const fc = combo(Object.keys(FONTS), start.font, uid + '-ff', 'font');
    const sc = combo(STYLES, start.style, uid + '-fs', 'style');
    const zc = combo(SIZES, start.size, uid + '-fz', 'size');
    const strike = h('input', { type: 'checkbox', checked: start.s });
    const under = h('input', { type: 'checkbox', checked: start.u });
    const colorSel = h('select', { class: 'field', id: uid + '-fc' }, h('option', { value: '' }, 'Automatic'), ...COLORS.map(([n]) => h('option', { value: n }, n)));
    colorSel.value = start.color;
    const chip = h('i', { class: 'wp-chip' });
    const sample = h('div', { class: 'wp-sample' }, h('span', null, 'AaBbYyZz'));
    function preview() {
      const s = sample.firstChild.style, st = sc.input.value.toLowerCase();
      const fn = Object.keys(FONTS).find(f => f.toLowerCase() === fc.input.value.trim().toLowerCase());
      s.fontFamily = fn ? FONTS[fn] : fontStack(fc.input.value || 'Times New Roman');
      s.fontWeight = st.includes('bold') ? 'bold' : 'normal';
      s.fontStyle = st.includes('italic') ? 'italic' : 'normal';
      s.fontSize = clamp(parseFloat(zc.input.value) || 10, 1, 72) + 'pt';
      s.textDecoration = [under.checked && 'underline', strike.checked && 'line-through'].filter(Boolean).join(' ') || 'none';
      const c = COLORS.find(([n]) => n === colorSel.value);
      s.color = c ? c[1] : '#000';
      chip.style.background = c ? c[1] : '#000';
    }
    fc.onchange = sc.onchange = zc.onchange = preview;
    for (const x of [strike, under, colorSel]) x.addEventListener('change', preview);
    const ok = () => {
      const size = parseFloat(zc.input.value);
      if (zc.input.value.trim() && (!(size >= 1) || size > 1638)) { msgbox({ title: 'Font', icon: 'warn', parent: d, text: 'Size must be between 1 and 1638 points.' }); return; }
      d.close(true);
      const fn = Object.keys(FONTS).find(f => f.toLowerCase() === fc.input.value.trim().toLowerCase());
      if (fc.input.value.trim() && fc.input.value !== start.font) applyStyle('face', fn ? FONTS[fn] : fontStack(fc.input.value.trim()));
      if (sc.input.value !== start.style) {
        const st = sc.input.value.toLowerCase();
        setState('bold', st.includes('bold'));
        setState('italic', st.includes('italic'));
      }
      if (zc.input.value.trim() && zc.input.value !== start.size) applyStyle('size', size + 'pt');
      if (under.checked !== start.u) setState('underline', under.checked);
      if (strike.checked !== start.s) setState('strikeThrough', strike.checked);
      if (colorSel.value !== start.color) { const c = COLORS.find(([n]) => n === colorSel.value); applyStyle('color', c ? c[1] : ''); }
      fixMarks();
      syncSoon();
    };
    const lab = (c, html, k) => h('label', { for: c.input.id, id: c.input.id + '-l', html, 'data-k': k });
    const form = h('form', { class: 'dlg wp-dlg wp-fontdlg' },
      h('div', { class: 'wp-side' },
        h('div', { class: 'wp-fontcols' },
          h('div', { class: 'wp-col' }, lab(fc, '<u>F</u>ont:', 'f'), fc.el),
          h('div', { class: 'wp-col' }, lab(sc, 'F<u>o</u>nt style:', 'o'), sc.el),
          h('div', { class: 'wp-col' }, lab(zc, '<u>S</u>ize:', 's'), zc.el)),
        h('div', { class: 'wp-btncol' },
          h('button', { class: 'btn default', type: 'submit' }, 'OK'),
          h('button', { class: 'btn', type: 'button', onclick: () => d.close(true) }, 'Cancel'))),
      h('div', { class: 'wp-fontlow' },
        h('fieldset', { class: 'group wp-effects' }, h('legend', null, 'Effects'),
          h('label', { class: 'wp-chk' }, strike, h('span', { html: 'Stri<u>k</u>eout' })),
          h('label', { class: 'wp-chk' }, under, h('span', { html: '<u>U</u>nderline' })),
          h('label', { for: colorSel.id, html: '<u>C</u>olor:' }), h('div', { class: 'wp-colorrow' }, chip, colorSel)),
        h('div', { class: 'wp-col wp-samplecol' },
          h('fieldset', { class: 'group' }, h('legend', null, 'Sample'), sample),
          h('label', { class: 'wp-frow' }, h('span', { html: 'Sc<u>r</u>ipt:' }), h('select', { class: 'field' }, h('option', null, 'Western'), h('option', null, 'Japanese')))),
      ));
    form.addEventListener('submit', e => { e.preventDefault(); ok(); });
    dialogKeys(form, () => d.close(true), { f: fc.input, o: sc.input, s: zc.input, k: strike, u: under, c: colorSel });
    const d = createWindow({ title: 'Font', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    fc.mark(); sc.mark(); zc.mark(); preview();
    fc.input.focus(); fc.input.select();
  }

  // ---------- Format > Paragraph and Tabs ----------
  const fmtLen = v => +(v / (UNITS[opts.units] || UNITS.in)[0]).toFixed(2) + (UNITS[opts.units] || UNITS.in)[1];
  function parseLen(s) {
    const m = /^\s*(-?\d*\.?\d+)\s*("|in|cm|mm|pt|pi)?\s*$/i.exec(s);
    if (!m) return null;
    const u = (m[2] || '').toLowerCase();
    const f = u === '"' || u === 'in' ? 96 : u === 'cm' ? UNITS.cm[0] : u === 'mm' ? UNITS.cm[0] / 10 : u === 'pt' ? UNITS.pt[0] : u === 'pi' ? 16 : (UNITS[opts.units] || UNITS.in)[0];
    return +m[1] * f;
  }
  function paragraphDialog() {
    const list = blocks();
    const b = list[0] || page, cs = getComputedStyle(b);
    const field = (id, v) => h('input', { class: 'field', id: uid + id, value: fmtLen(b === page ? 0 : parseFloat(v) || 0), autocomplete: 'off' });
    const left = field('-pl', cs.marginLeft), right = field('-pr', cs.marginRight), first = field('-pf', cs.textIndent);
    const align = h('select', { class: 'field', id: uid + '-pa' }, ...['Left', 'Right', 'Center'].map(a => h('option', { value: a.toLowerCase() }, a)));
    align.value = cs.textAlign === 'center' ? 'center' : cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : 'left';
    const row = (input, html) => h('div', { class: 'wp-frow' }, h('label', { for: input.id, html }), input);
    const ok = () => {
      const vals = [left, right, first].map(i => parseLen(i.value));
      if (vals.some(v => v == null || Math.abs(v) > 2000)) { msgbox({ title: 'WordPad', icon: 'warn', parent: d, text: 'The measurement must be between -22" and 22".' }); return; }
      d.close(true);
      for (const blk of list) {
        blk.style.marginLeft = vals[0] ? vals[0] / 96 + 'in' : '';
        blk.style.marginRight = vals[1] ? vals[1] / 96 + 'in' : '';
        blk.style.textIndent = vals[2] ? vals[2] / 96 + 'in' : '';
        blk.style.textAlign = align.value === 'left' ? '' : align.value;
        if (!blk.getAttribute('style')) blk.removeAttribute('style');
      }
      restore();
      syncSoon();
    };
    const form = h('form', { class: 'dlg wp-dlg' },
      h('div', { class: 'wp-side' },
        h('fieldset', { class: 'group wp-col' }, h('legend', null, 'Indentation'),
          row(left, '<u>L</u>eft:'), row(right, '<u>R</u>ight:'), row(first, '<u>F</u>irst line:')),
        h('div', { class: 'wp-btncol' },
          h('button', { class: 'btn default', type: 'submit' }, 'OK'),
          h('button', { class: 'btn', type: 'button', onclick: () => d.close(true) }, 'Cancel'))),
      row(align, '<u>A</u>lignment:'));
    form.addEventListener('submit', e => { e.preventDefault(); ok(); });
    dialogKeys(form, () => d.close(true), { l: left, r: right, f: first, a: align });
    const d = createWindow({ title: 'Paragraph', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    left.focus(); left.select();
  }
  function tabsDialog() {
    let stops = tabs.slice();
    const pos = h('input', { class: 'field', id: uid + '-tp', autocomplete: 'off' });
    const lb = h('div', { class: 'listbox wp-tablist', role: 'listbox', 'aria-label': 'Tab stops' });
    const setBtn = h('button', { class: 'btn', type: 'button', html: '<u>S</u>et', onclick: () => {
      const v = parseLen(pos.value);
      if (v == null || v <= 0 || v > 2000) { msgbox({ title: 'WordPad', icon: 'warn', parent: d, text: 'This is not a valid measurement.' }); return; }
      if (!stops.some(s => Math.abs(s - v) < 1)) stops.push(Math.round(v));
      stops.sort((a, b) => a - b); pos.value = ''; render(); pos.focus();
    } });
    const clrBtn = h('button', { class: 'btn', type: 'button', html: '<u>C</u>lear', onclick: () => { const v = parseLen(pos.value); stops = stops.filter(s => v == null || Math.abs(s - v) >= 1); pos.value = ''; render(); } });
    const allBtn = h('button', { class: 'btn', type: 'button', html: 'Clear <u>A</u>ll', onclick: () => { stops = []; render(); } });
    function render() {
      lb.replaceChildren(...stops.map(s => {
        const o = h('div', { class: 'opt' }, fmtLen(s));
        o.addEventListener('click', () => { pos.value = fmtLen(s); lb.querySelectorAll('.opt').forEach(x => x.classList.toggle('sel', x === o)); });
        return o;
      }));
    }
    render();
    const form = h('form', { class: 'dlg wp-dlg' },
      h('div', { class: 'wp-side' },
        h('div', { class: 'wp-col' }, h('label', { for: pos.id, html: '<u>T</u>ab stop position:' }), pos, lb),
        h('div', { class: 'wp-btncol' },
          h('button', { class: 'btn default', type: 'submit' }, 'OK'),
          h('button', { class: 'btn', type: 'button', onclick: () => d.close(true) }, 'Cancel'))),
      h('div', { class: 'btns' }, setBtn, clrBtn, allBtn));
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (pos.value.trim()) { setBtn.click(); return; }
      tabs = stops; d.close(true); applyView(); restore();
    });
    dialogKeys(form, () => d.close(true), { t: pos, s: setBtn, c: clrBtn, a: allBtn });
    const d = createWindow({ title: 'Tabs', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    pos.focus();
  }

  // ---------- View > Options ----------
  function optionsDialog() {
    const tabNames = ['Options', TYPES[docType].label.replace(' Document', '')];
    let tab = 1;
    const units = Object.entries(UNITS).map(([k, [, , label]]) => {
      const r = h('input', { type: 'radio', name: uid + '-u', value: k, checked: opts.units === k });
      return h('label', { class: 'wp-chk' }, r, h('span', null, label));
    });
    const wraps = [['none', '<u>N</u>o wrap'], ['window', 'Wrap to <u>w</u>indow'], ['ruler', 'Wrap to <u>r</u>uler']].map(([k, html]) =>
      h('label', { class: 'wp-chk' }, h('input', { type: 'radio', name: uid + '-w', value: k, checked: opts.wrap === k }), h('span', { html })));
    const bars = [['toolbar', '<u>T</u>oolbar'], ['format', '<u>F</u>ormat bar'], ['ruler', 'R<u>u</u>ler'], ['status', '<u>S</u>tatus bar']].map(([k, html]) =>
      h('label', { class: 'wp-chk' }, h('input', { type: 'checkbox', name: k, checked: opts[k] }), h('span', { html })));
    const panels = [
      h('div', { class: 'tabpanel' }, h('fieldset', { class: 'group' }, h('legend', null, 'Measurement units'), ...units)),
      h('div', { class: 'tabpanel wp-optpanel' },
        h('fieldset', { class: 'group' }, h('legend', null, 'Word wrap'), ...wraps),
        h('fieldset', { class: 'group' }, h('legend', null, 'Toolbars'), ...bars)),
    ];
    const tabBtns = tabNames.map((t, i) => h('button', { type: 'button', role: 'tab', onclick: () => show(i) }, t));
    function show(i) { tab = i; panels.forEach((p, j) => { p.hidden = j !== i; }); tabBtns.forEach((b, j) => b.setAttribute('aria-selected', String(j === i))); }
    const form = h('form', { class: 'dlg wp-dlg wp-options' },
      h('div', null, h('div', { class: 'tabs', role: 'tablist' }, ...tabBtns), ...panels),
      h('div', { class: 'btns right' },
        h('button', { class: 'btn default', type: 'submit' }, 'OK'),
        h('button', { class: 'btn', type: 'button', onclick: () => d.close(true) }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      opts.units = fd.get(uid + '-u') || opts.units;
      opts.wrap = fd.get(uid + '-w') || opts.wrap;
      for (const k of ['toolbar', 'format', 'ruler', 'status']) opts[k] = fd.has(k);
      d.close(true);
      applyView();
    });
    dialogKeys(form, () => d.close(true), {});
    const d = createWindow({ title: 'Options', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    show(tab);
    tabBtns[tab].focus();
  }

  // ---------- menus ----------
  const menus = [
    { label: '&File', items: () => {
      const recent = store.get(RECENT, []);
      return [
        { label: '&New...', key: 'Ctrl+N', action: newDoc },
        { label: '&Open...', key: 'Ctrl+O', action: openDoc },
        { label: '&Save', key: 'Ctrl+S', action: save },
        { label: 'Save &As...', action: saveAsDialog },
        '-',
        { label: '&Print...', key: 'Ctrl+P', action: print },
        { label: 'Print Pre&view', action: print },
        { label: 'Page Set&up...', disabled: true },
        '-',
        ...(recent.length ? [...recent.map((p, i) => ({ label: `&${i + 1} ${p.length > 34 ? p.slice(0, 3) + '...' + p.slice(-28) : p}`, action: () => openRecent(p) })), '-'] : []),
        { label: 'Sen&d...', disabled: true },
        '-',
        { label: 'E&xit', action: () => win.close() },
      ];
    } },
    { label: '&Edit', items: () => {
      const has = !!saved && !saved.collapsed;
      return [
        { label: '&Undo', key: 'Ctrl+Z', action: () => cmd('undo') },
        '-',
        { label: 'Cu&t', key: 'Ctrl+X', disabled: !has, action: () => cmd('cut') },
        { label: '&Copy', key: 'Ctrl+C', disabled: !has, action: () => cmd('copy') },
        { label: '&Paste', key: 'Ctrl+V', action: paste },
        { label: 'Paste &Special...', disabled: true },
        { label: 'Cle&ar', key: 'Del', disabled: !has, action: () => cmd('delete') },
        { label: 'Select A&ll', key: 'Ctrl+A', action: () => { page.focus(); cmd('selectAll'); } },
        '-',
        { label: '&Find...', key: 'Ctrl+F', action: () => findDialog(false) },
        { label: 'Find &Next', key: 'F3', action: findNext },
        { label: 'R&eplace...', key: 'Ctrl+H', action: () => findDialog(true) },
        '-',
        { label: 'Lin&ks...', disabled: true },
        { label: 'Object &Properties', key: 'Alt+Enter', disabled: true },
        { label: '&Object', disabled: true },
      ];
    } },
    { label: '&View', items: () => [
      ...(hasRibbon ? [] : [{ label: '&Toolbar', checked: opts.toolbar, action: toggle('toolbar') },
        { label: '&Format Bar', checked: opts.format, action: toggle('format') }]),
      { label: '&Ruler', checked: opts.ruler, action: toggle('ruler') },
      { label: '&Status Bar', checked: opts.status, action: toggle('status') },
      '-',
      { label: '&Options...', action: optionsDialog },
    ] },
    { label: '&Insert', items: () => [
      { label: '&Date and Time...', action: dateDialog },
      { label: '&Object...', disabled: true },
    ] },
    { label: 'F&ormat', items: () => [
      { label: '&Font...', action: fontDialog },
      { label: '&Bullet Style', checked: !!caretEl().closest('ul'), action: () => cmd('insertUnorderedList') },
      { label: '&Paragraph...', action: paragraphDialog },
      { label: '&Tabs...', action: tabsDialog },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') },
      ...(['98', 'me', '2000', 'xp'].includes(V.id) ? [{ label: 'Show &Blankie', action: () => blankie.enable(win) }] : []),
      '-',
      { label: '&About WordPad', action: () => about('WordPad', 'i-wordpad', win) },
    ] },
  ];
  // From 7 the toolbar and format bar's own controls move into the ribbon.
  const rbChk = (label, k) => {
    const c = h('input', { type: 'checkbox' });
    rbSync.push(() => { c.checked = opts[k]; });
    c.checked = opts[k];
    c.addEventListener('change', toggle(k));
    return h('label', { class: 'rb-chk' }, c, label);
  };
  const col = (...kids) => h('div', { class: 'rb-col' }, ...kids), row = (...kids) => h('div', { class: 'rb-row' }, ...kids);
  const bar = hasRibbon ? ribbon(menus, [
    { label: 'Home', groups: [
      ['Clipboard', rbtn('Paste', G.paste, paste, true), col(rbtn('Cut', G.cut, () => cmd('cut')), rbtn('Copy', G.copy, () => cmd('copy')))],
      ['Font', col(row(fontSel, sizeSel), row(bBtn, iBtn, uBtn, colorBtn))],
      ['Paragraph', col(row(bulletBtn, rbtn('Paragraph', G.left, paragraphDialog)), row(alignBtns.left, alignBtns.center, alignBtns.right))],
      ['Insert', rbtn('Date and time', G.date, dateDialog, true)],
      ['Editing', col(rbtn('Find', G.find, () => findDialog(false)), rbtn('Replace', G.find, () => findDialog(true)), rbtn('Select all', G.selall, () => { page.focus(); cmd('selectAll'); }))],
    ] },
    { label: 'View', groups: [
      ['Show or hide', col(rbChk('Ruler', 'ruler'), rbChk('Status bar', 'status'))],
      ['Settings', rbtn('Options', 'i-ctrl', optionsDialog, true)],
    ] },
  ]) : menubar(menus);

  const root = h('div', { class: 'wp' }, bar, ...(hasRibbon ? [] : [toolbar, formatbar]), ruler, area, status);

  page.addEventListener('input', () => { fixMarks(); syncSoon(); });
  root.addEventListener('pointerover', e => { if (!e.target.closest('.wp-tb, .wp-fmt select')) hint.textContent = 'For Help, press F1'; });
  page.addEventListener('focus', () => {
    if (window.CSS && CSS.highlights) CSS.highlights.delete('wp-find');
    // Coming back from a dialog: put the caret back where it was.
    const s = getSelection();
    if (saved && page.contains(saved.startContainer) && !(s.rangeCount && page.contains(s.anchorNode))) { s.removeAllRanges(); s.addRange(saved); }
  });
  page.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.shiftKey) { e.preventDefault(); document.execCommand('insertText', false, '\t'); }
  });
  root.addEventListener('keydown', e => {
    if (e.getModifierState) numCell.textContent = e.getModifierState('NumLock') ? 'NUM' : '';
    const letter = e.code && e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : '';
    if (e.altKey && !e.ctrlKey && !e.metaKey && letter && bar.openByKey(letter)) { e.preventDefault(); return; }
    if (e.key === 'F1') { e.preventDefault(); launch('help'); return; }
    if (e.key === 'F3') { e.preventDefault(); findNext(); return; }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !letter) return;
    const map = {
      n: newDoc, o: openDoc, s: save, p: print, f: () => findDialog(false), h: () => findDialog(true),
      e: () => cmd('justifyCenter'), l: () => cmd('justifyLeft'), r: () => cmd('justifyRight'),
    };
    if (map[letter]) { e.preventDefault(); map[letter](); }
    else if (e.target !== page && 'biuz'.includes(letter)) { e.preventDefault(); cmd({ b: 'bold', i: 'italic', u: 'underline', z: 'undo' }[letter]); }
    else if (e.target === page && 'biu'.includes(letter)) syncSoon();
  });

  const win = createWindow({
    app: 'wordpad', title: title(), icon: 'i-wordpad', body: root,
    width: 640, height: 460, minW: 280, minH: 220, route: 'wordpad', autofocus: '.wp-page',
    onClose: confirmSave, onResize: layoutRuler,
    onClosed: () => { document.removeEventListener('selectionchange', onSel); if (ro) ro.disconnect(); if (findWin) findWin.close(true); },
  });
  blankie.summon(win);
  blankie.watch(page);
  if (hasRibbon) quickBar(win, { save: () => save(), undo: () => cmd('undo'), redo: () => cmd('redo') });

  if (arg && arg.text != null) load(arg.name || 'Document', convert(arg.name || '', arg.text), arg.path, typeOf(arg.name || ''));
  else load('Document', '', null, 'word');
  if (arg && arg.path) remember(arg.path);
  return win;
}

function toRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
}

// Alt+letter on a dialog: focus the field or press the button with that access key.
function dialogKeys(form, close, keys) {
  form.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (!e.altKey || e.ctrlKey) return;
    const k = e.code && e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : '';
    const t = keys[k];
    if (!t) return;
    e.preventDefault();
    if (t.tagName === 'BUTTON' || (t.tagName === 'INPUT' && (t.type === 'checkbox' || t.type === 'radio'))) { t.focus(); t.click(); }
    else { t.focus(); if (t.select) t.select(); }
  });
}

export default { id: 'wordpad', title: 'WordPad', icon: 'i-wordpad', open };
