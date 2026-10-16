// Paint. Everything is drawn pixel by pixel so fills and colour picks stay exact,
// the way the real thing never anti-aliased anything.

import { h, clamp } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar, openMenu } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import { saveAs, openFile, saveTo } from '../filedlg.js';
import { sendEnabled, sendButton, sendDialog, tipLater } from '../send.js';

const PALETTE = [
  '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040',
];
// The 48 basic colours of the Edit Colors dialog.
const BASIC = [
  '#ff8080', '#ffff80', '#80ff80', '#00ff80', '#80ffff', '#0080ff', '#ff80c0', '#ff80ff',
  '#ff0000', '#ffff00', '#80ff00', '#00ff40', '#00ffff', '#0080c0', '#8080c0', '#ff00ff',
  '#804040', '#ff8040', '#00ff00', '#008080', '#004080', '#8080ff', '#800040', '#ff0080',
  '#800000', '#ff8000', '#008000', '#008040', '#0000ff', '#0000a0', '#800080', '#8000ff',
  '#400000', '#804000', '#004000', '#004040', '#000080', '#000040', '#400040', '#400080',
  '#000000', '#808000', '#808040', '#808080', '#408080', '#c0c0c0', '#404040', '#ffffff',
];
const FONTS = ['Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'DotGothic16', 'Georgia', 'Impact', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

const svg = inner => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${inner}</svg>`;
// In the real toolbox order, read left to right in two columns.
const TOOLS = [
  { id: 'freeselect', name: 'Free-Form Select', icon: svg("<path d='M3.5 5.5l4-3 5.5 2-1 4.5 2 4-6 1-5-3z' fill='none' stroke='#000' stroke-dasharray='2 1'/>") },
  { id: 'select', name: 'Select', icon: svg("<rect x='2.5' y='3.5' width='11' height='9' fill='none' stroke='#000' stroke-dasharray='2 1'/>") },
  { id: 'eraser', name: 'Eraser/Color Eraser', icon: svg("<path d='M2 10l6-6 6 6-4 4H6z' fill='#fff' stroke='#000'/><path d='M2 10l6-6 2.5 2.5-6 6z' fill='#ffff80' stroke='#000'/>") },
  { id: 'fill', name: 'Fill With Color', icon: svg("<path d='M3 8l5-5 5 5-5 5z' fill='#fff' stroke='#000'/><path d='M13 8c1.5 2 2 3 1 5-1.5 0-2-2-1-5z' fill='#0000ff'/>") },
  { id: 'picker', name: 'Pick Color', icon: svg("<path d='M11 2l3 3-2 2-1-1-6 6-3 1 1-3 6-6-1-1z' fill='#c0c0c0' stroke='#000'/>") },
  { id: 'magnifier', name: 'Magnifier', icon: svg("<circle cx='6.5' cy='6.5' r='4' fill='#80ffff' stroke='#000'/><path d='M9.5 9.5l4.5 4.5' stroke='#000' stroke-width='2'/>") },
  { id: 'pencil', name: 'Pencil', icon: svg("<path d='M3 13l1-3 7-7 2 2-7 7z' fill='#ffff00' stroke='#000'/><path d='M3 13l1-3 2 2z' fill='#000'/>") },
  { id: 'brush', name: 'Brush', icon: svg("<path d='M10 2l4 4-5 3-2-2z' fill='#800000' stroke='#000'/><path d='M7 7l2 2-2 3c-1 1-3 2-5 2 0-2 1-4 2-5z' fill='#000'/>") },
  { id: 'airbrush', name: 'Airbrush', icon: svg("<rect x='2.5' y='7.5' width='6' height='6' fill='#c0c0c0' stroke='#000'/><rect x='4' y='4' width='3' height='3'/><path d='M9 3h1v1H9zM11 2h1v1h-1zM12 5h1v1h-1zM10 6h1v1h-1zM13 3h1v1h-1z'/>") },
  { id: 'text', name: 'Text', icon: svg("<path d='M3 14L7 2h2l4 12h-2.2l-1-3H6.2l-1 3zM6.8 9h2.4L8 5.2z'/>") },
  { id: 'line', name: 'Line', icon: svg("<path d='M3 13L13 3' stroke='#000' stroke-width='1.6'/>") },
  { id: 'curve', name: 'Curve', icon: svg("<path d='M2 13C3 3 11 14 14 3' fill='none' stroke='#000' stroke-width='1.4'/>") },
  { id: 'rect', name: 'Rectangle', icon: svg("<rect x='2.5' y='4.5' width='11' height='8' fill='none' stroke='#000'/>") },
  { id: 'polygon', name: 'Polygon', icon: svg("<path d='M2.5 12.5l2-9 5 3.5 4-3.5-1 9z' fill='none' stroke='#000'/>") },
  { id: 'ellipse', name: 'Ellipse', icon: svg("<ellipse cx='8' cy='8.5' rx='6' ry='4.5' fill='none' stroke='#000'/>") },
  { id: 'rrect', name: 'Rounded Rectangle', icon: svg("<rect x='2.5' y='4.5' width='11' height='8' rx='3' fill='none' stroke='#000'/>") },
];
const SIZES = { brush: [1, 2, 3, 5], eraser: [4, 6, 8, 10], line: [1, 2, 3, 5], airbrush: [4, 8, 12] };
const SIZE_KEY = { curve: 'line' };    // the Curve shares the Line's width, as in Win95
const SHAPES = ['rect', 'ellipse', 'rrect', 'polygon'];
const SELECTS = ['select', 'freeselect'];
const ZOOMS = [1, 2, 6, 8];
const MODE_ICONS = {
  opaque: svg("<rect x='1.5' y='2.5' width='13' height='11' fill='#fff' stroke='#000'/><circle cx='6' cy='7' r='3' fill='#ff0000'/><rect x='7' y='7' width='6' height='5' fill='#0000ff'/>"),
  transparent: svg("<circle cx='6' cy='7' r='3' fill='#ff0000'/><rect x='7' y='7' width='6' height='5' fill='#0000ff'/><path d='M1.5 2.5h13v11h-13z' fill='none' stroke='#000' stroke-dasharray='1 1'/>"),
};

// The clipboard is shared by every Paint window, like the real one.
let clip = null;
let seq = 0;

const rgb = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const hex = (r, g, b) => '#' + [r, g, b].map(v => clamp(v | 0, 0, 255).toString(16).padStart(2, '0')).join('');
const cloneImg = img => new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);

// Pixel remapping for flips, rotations, stretches and skews: f(x, y) gives the
// source index for each target pixel, or -1 to use `fill`.
function remap(src, w, hgt, fill, f) {
  const out = new ImageData(w, hgt), s = src.data, d = out.data;
  for (let y = 0, o = 0; y < hgt; y++) for (let x = 0; x < w; x++, o += 4) {
    const i = f(x, y);
    if (i >= 0) { d[o] = s[i]; d[o + 1] = s[i + 1]; d[o + 2] = s[i + 2]; d[o + 3] = s[i + 3]; }
    else { d[o] = fill[0]; d[o + 1] = fill[1]; d[o + 2] = fill[2]; d[o + 3] = fill[3]; }
  }
  return out;
}
const OPS = {
  flipH: img => remap(img, img.width, img.height, null, (x, y) => (y * img.width + img.width - 1 - x) * 4),
  flipV: img => remap(img, img.width, img.height, null, (x, y) => ((img.height - 1 - y) * img.width + x) * 4),
  rot90: img => remap(img, img.height, img.width, null, (x, y) => ((img.height - 1 - x) * img.width + y) * 4),
  rot180: img => remap(img, img.width, img.height, null, (x, y) => ((img.height - 1 - y) * img.width + img.width - 1 - x) * 4),
  rot270: img => remap(img, img.height, img.width, null, (x, y) => (x * img.width + img.width - 1 - y) * 4),
  invert: img => {
    const out = cloneImg(img), d = out.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
    return out;
  },
  stretch: (img, ph, pv) => {
    const w = clamp(Math.round(img.width * ph / 100), 1, 2000), hgt = clamp(Math.round(img.height * pv / 100), 1, 2000);
    return remap(img, w, hgt, null, (x, y) => (Math.floor(y * img.height / hgt) * img.width + Math.floor(x * img.width / w)) * 4);
  },
  // Rows slide sideways: positive angles lean the picture to the right at the top.
  skewH: (img, deg, fill) => {
    const t = Math.tan(deg * Math.PI / 180), ext = Math.min(2000 - img.width, Math.round(Math.abs(t) * (img.height - 1)));
    const off = y => Math.round(t >= 0 ? t * (img.height - 1 - y) : -t * y);
    return remap(img, img.width + Math.max(0, ext), img.height, fill, (x, y) => {
      const sx = x - off(y);
      return sx >= 0 && sx < img.width ? (y * img.width + sx) * 4 : -1;
    });
  },
  skewV: (img, deg, fill) => {
    const t = Math.tan(deg * Math.PI / 180), ext = Math.min(2000 - img.height, Math.round(Math.abs(t) * (img.width - 1)));
    const off = x => Math.round(t >= 0 ? t * (img.width - 1 - x) : -t * x);
    return remap(img, img.width, img.height + Math.max(0, ext), fill, (x, y) => {
      const sy = y - off(x);
      return sy >= 0 && sy < img.height ? (sy * img.width + x) * 4 : -1;
    });
  },
};

function open(arg) {
  let W = 480, H = 320;
  let name = 'untitled', path = null, edits = 0, savedAt = 0;
  let fg = '#000000', bg = '#ffffff', fgIndex = 0;
  let tool = 'pencil', prevTool = 'pencil';
  const size = { brush: 2, eraser: 6, line: 1, airbrush: 8 };
  let fillMode = 'outline';
  let transparent = true;            // Opaque/Transparent, shared by the selections and Text
  let zoom = 1, grid = false, thumbOn = false, textBarOn = true;
  const font = { face: 'Arial', size: 12, bold: false, italic: false, underline: false };
  const pal = PALETTE.slice();
  const undoStack = [];
  let drew = false;
  const uid = ++seq;

  // The selection: its pixels (alpha 0 outside a free-form path) and whether it has
  // been lifted off the picture yet. Until it's moved the pixels stay in the bitmap.
  let sel = null;        // { x, y, w, h, img, lifted }
  let curve = null;      // { stage, p0, c1, c2, p3, main }
  let poly = null;       // { pts, main, other, upAt }
  let text = null;       // { x, y, w, h, el }

  const canvas = h('canvas', { class: 'pt-canvas', width: W, height: H, 'aria-label': 'Drawing' });
  const overlay = h('canvas', { class: 'pt-overlay', width: W, height: H, 'aria-hidden': 'true' });
  const floatC = h('canvas', { class: 'pt-float', hidden: true, 'aria-hidden': 'true' });
  const gridEl = h('div', { class: 'pt-grid', hidden: true });
  const ns = 'http://www.w3.org/2000/svg';
  const ants = document.createElementNS(ns, 'svg');
  ants.setAttribute('class', 'pt-ants');
  ants.setAttribute('preserveAspectRatio', 'none');
  ants.setAttribute('aria-hidden', 'true');
  const antsA = document.createElementNS(ns, 'path'), antsB = document.createElementNS(ns, 'path');
  antsA.setAttribute('class', 'a'); antsB.setAttribute('class', 'b');
  ants.append(antsA, antsB);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const octx = overlay.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const holder = h('div', { class: 'pt-holder' }, canvas, floatC, overlay, gridEl, ants);
  const area = h('div', { class: 'pt-area' }, holder);
  const coords = h('div', { style: { width: '90px' } });
  const dims = h('div', { style: { width: '90px' } });
  const hint = h('span', null, 'For Help, click Help Topics on the Help Menu.');
  const status = h('div', { class: 'statusbar' }, hint, coords, dims);

  // ---------- tool box ----------
  const toolBtns = TOOLS.map(t => {
    const b = h('button', { type: 'button', class: 'pt-tool', title: t.name, 'aria-label': t.name, 'aria-pressed': String(t.id === tool), html: t.icon });
    b.addEventListener('click', () => setTool(t.id));
    b.addEventListener('pointerenter', () => { hint.textContent = t.name; });
    b.addEventListener('pointerleave', () => { hint.textContent = 'For Help, click Help Topics on the Help Menu.'; });
    return b;
  });
  const options = h('div', { class: 'pt-options' });
  const toolbox = h('div', { class: 'pt-toolbox' }, h('div', { class: 'pt-tools' }, ...toolBtns), options);

  function setTool(id) {
    finishPending();
    const passing = ['picker', 'magnifier'];   // these hand control back when they're done
    if (passing.includes(id) && !passing.includes(tool)) prevTool = tool;
    tool = id;
    toolBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(TOOLS[i].id === id)));
    holder.dataset.tool = id;
    octx.clearRect(0, 0, W, H);
    fontbar.hidden = !(id === 'text' && textBarOn);
    renderOptions();
  }
  function optBtn(cls, pressed, label, onclick, ...kids) {
    const b = h('button', { type: 'button', class: 'pt-opt ' + cls, 'aria-pressed': String(pressed), 'aria-label': label, title: label }, ...kids);
    b.addEventListener('click', onclick);
    return b;
  }
  function renderOptions() {
    options.replaceChildren();
    const key = SIZE_KEY[tool] || tool;
    if (SIZES[key]) {
      const lineish = key === 'line';
      for (const s of SIZES[key]) {
        options.append(optBtn('', size[key] === s, s + ' pixels', () => { size[key] = s; renderOptions(); },
          h('i', { style: lineish ? { width: '24px', height: s + 'px' } : { width: Math.min(14, s + 1) + 'px', height: Math.min(14, s + 1) + 'px', borderRadius: tool === 'brush' || tool === 'airbrush' ? '50%' : '0' } })));
      }
    } else if (SHAPES.includes(tool)) {
      for (const m of ['outline', 'both', 'fill']) options.append(optBtn('shape ' + m, fillMode === m, m, () => { fillMode = m; renderOptions(); }, h('i')));
    } else if (SELECTS.includes(tool) || tool === 'text') {
      for (const m of ['opaque', 'transparent']) {
        const b = optBtn('mode', transparent === (m === 'transparent'), m === 'opaque' ? 'Opaque' : 'Transparent', () => setTransparent(m === 'transparent'));
        b.innerHTML = MODE_ICONS[m];
        options.append(b);
      }
    } else if (tool === 'magnifier') {
      for (const z of ZOOMS) options.append(optBtn('zoom', zoom === z, z + 'x', () => { setZoom(z); setTool(prevTool); }, z + 'x'));
    }
  }
  function setTransparent(v) {
    transparent = v;
    renderFloat();
    styleText();
    renderOptions();
  }

  // ---------- fonts toolbar (Text tool) ----------
  const faceSel = h('select', { class: 'field pt-fb-face', 'aria-label': 'Font' }, ...FONTS.map(f => h('option', { value: f, selected: f === font.face }, f)));
  const sizeSel = h('select', { class: 'field pt-fb-size', 'aria-label': 'Font size' }, ...FONT_SIZES.map(s => h('option', { value: s, selected: s === font.size }, String(s))));
  const styleBtn = (k, label, inner) => {
    const b = h('button', { type: 'button', class: 'pt-fb-btn', 'aria-pressed': 'false', 'aria-label': label, title: label, html: inner });
    b.addEventListener('pointerdown', e => e.preventDefault());   // keep the caret in the text box
    b.addEventListener('click', () => { font[k] = !font[k]; b.setAttribute('aria-pressed', String(font[k])); styleText(); refocusText(); });
    return b;
  };
  const fontbar = h('div', { class: 'pt-fontbar', hidden: true, role: 'toolbar', 'aria-label': 'Fonts' },
    h('span', { class: 'pt-fb-title' }, 'Fonts'), faceSel, sizeSel,
    styleBtn('bold', 'Bold', '<b>B</b>'), styleBtn('italic', 'Italic', '<i style="font-family:serif">I</i>'), styleBtn('underline', 'Underline', '<u>U</u>'));
  faceSel.addEventListener('change', () => { font.face = faceSel.value; styleText(); refocusText(); });
  sizeSel.addEventListener('change', () => { font.size = +sizeSel.value; styleText(); refocusText(); });

  // ---------- colour box ----------
  const fgBox = h('i', { class: 'pt-fg' }), bgBox = h('i', { class: 'pt-bg' });
  const swatches = pal.map((c, i) => {
    const b = h('button', { type: 'button', class: 'pt-sw', style: { background: c }, 'aria-label': c });
    b.addEventListener('click', () => { fg = pal[i]; fgIndex = i; updateColors(); });
    b.addEventListener('contextmenu', e => { e.preventDefault(); bg = pal[i]; updateColors(); });
    b.addEventListener('dblclick', () => editColors(i));
    return b;
  });
  const colorbox = h('div', { class: 'pt-colorbox' }, h('div', { class: 'pt-cur' }, bgBox, fgBox), h('div', { class: 'pt-pal' }, ...swatches));
  function updateColors() {
    fgBox.style.background = fg; bgBox.style.background = bg;
    renderFloat();      // a transparent selection drops the new background colour
    styleText();
  }

  // ---------- pixels ----------
  function stamp(g, x, y, s, round) {
    if (s <= 1) { g.fillRect(x, y, 1, 1); return; }
    const o = Math.floor(s / 2);
    if (!round) { g.fillRect(x - o, y - o, s, s); return; }
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const cx = dx - (s - 1) / 2, cy = dy - (s - 1) / 2;
      if (cx * cx + cy * cy <= (s / 2) * (s / 2)) g.fillRect(x - o + dx, y - o + dy, 1, 1);
    }
  }
  function line(g, x0, y0, x1, y1, s, round) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      stamp(g, x0, y0, s, round);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // A cubic bezier walked in short steps, each step a Bresenham line, so it stays aliased.
  function bezier(g, p0, c1, c2, p3, s) {
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const n = Math.max(2, Math.ceil((d(p0, c1) + d(c1, c2) + d(c2, p3)) / 2));
    let lx = p0[0], ly = p0[1];
    for (let i = 1; i <= n; i++) {
      const t = i / n, m = 1 - t;
      const x = Math.round(m * m * m * p0[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * p3[0]);
      const y = Math.round(m * m * m * p0[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * p3[1]);
      line(g, lx, ly, x, y, s, false);
      lx = x; ly = y;
    }
  }
  function polygon(kind, x0, y0, x1, y1) {
    const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
    if (kind === 'rect') return [[l, t], [r, t], [r, b], [l, b]];
    const pts = [];
    if (kind === 'ellipse') {
      const cx = (l + r) / 2, cy = (t + b) / 2, rx = (r - l) / 2, ry = (b - t) / 2;
      const n = Math.max(16, Math.round((rx + ry) * 1.5));
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry)]); }
      return pts;
    }
    const rad = Math.min(8, (r - l) / 2, (b - t) / 2);
    const corner = (cx, cy, a0) => { for (let i = 0; i <= 6; i++) { const a = a0 + i / 6 * Math.PI / 2; pts.push([Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad)]); } };
    corner(r - rad, t + rad, -Math.PI / 2); corner(r - rad, b - rad, 0); corner(l + rad, b - rad, Math.PI / 2); corner(l + rad, t + rad, Math.PI);
    return pts;
  }
  function fillPoly(g, pts) {
    const ys = pts.map(p => p[1]);
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        const yy = y + 0.5;
        if ((ay <= yy && by > yy) || (by <= yy && ay > yy)) xs.push(ax + (yy - ay) / (by - ay) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) g.fillRect(Math.ceil(xs[i]), y, Math.floor(xs[i + 1]) - Math.ceil(xs[i]) + 1, 1);
    }
  }
  function outlinePts(g, pts, closed) {
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; line(g, a[0], a[1], b[0], b[1], size.line, false); }
  }
  function drawPts(g, pts, outline, inside) {
    if (fillMode !== 'outline') { g.fillStyle = fillMode === 'fill' ? outline : inside; fillPoly(g, pts); }
    if (fillMode !== 'fill' || pts.length < 3) { g.fillStyle = outline; outlinePts(g, pts, true); }
  }
  function shape(g, kind, x0, y0, x1, y1, outline, inside) { drawPts(g, polygon(kind, x0, y0, x1, y1), outline, inside); }
  function flood(x, y, color) {
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const at = (x, y) => (y * W + x) * 4;
    const i0 = at(x, y);
    const [tr, tg, tb] = [d[i0], d[i0 + 1], d[i0 + 2]];
    const [nr, ng, nb] = rgb(color);
    if (tr === nr && tg === ng && tb === nb) return;
    const match = i => d[i] === tr && d[i + 1] === tg && d[i + 2] === tb;
    const stack = [[x, y]];
    while (stack.length) {
      let [cx, cy] = stack.pop();
      while (cx > 0 && match(at(cx - 1, cy))) cx--;
      let up = false, down = false;
      for (; cx < W && match(at(cx, cy)); cx++) {
        const i = at(cx, cy);
        d[i] = nr; d[i + 1] = ng; d[i + 2] = nb; d[i + 3] = 255;
        if (cy > 0) { const m = match(at(cx, cy - 1)); if (m && !up) stack.push([cx, cy - 1]); up = m; }
        if (cy < H - 1) { const m = match(at(cx, cy + 1)); if (m && !down) stack.push([cx, cy + 1]); down = m; }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function pushUndo() {
    edits++;
    undoStack.push(ctx.getImageData(0, 0, W, H));
    if (undoStack.length > 3) undoStack.shift();
  }
  function undo() {
    // A curve, polygon or text box still being made is just thrown away.
    if (text) { text.el.remove(); text = null; return; }
    if (curve || poly) { curve = poly = null; octx.clearRect(0, 0, W, H); return; }
    sel = null; drawSel();
    const img = undoStack.pop();
    if (!img) return;
    if (img.width !== W || img.height !== H) resize(img.width, img.height, false);
    ctx.putImageData(img, 0, 0);
  }

  // ---------- zoom ----------
  function layout() {
    for (const c of [canvas, overlay]) { c.style.width = W * zoom + 'px'; c.style.height = H * zoom + 'px'; }
    gridEl.hidden = !(grid && zoom >= 4);
    Object.assign(gridEl.style, { width: W * zoom + 'px', height: H * zoom + 'px', backgroundSize: `${zoom}px ${zoom}px` });
    ants.setAttribute('viewBox', `0 0 ${W} ${H}`);
    ants.style.width = W * zoom + 'px'; ants.style.height = H * zoom + 'px';
    drawSel();
    styleText();
  }
  // Zooms around a picture point (the middle of the view when none is given).
  function setZoom(z, cx, cy) {
    if (cx == null) { cx = (area.scrollLeft + area.clientWidth / 2) / zoom; cy = (area.scrollTop + area.clientHeight / 2) / zoom; }
    zoom = clamp(z, 1, 8);
    layout();
    area.scrollLeft = cx * zoom - area.clientWidth / 2;
    area.scrollTop = cy * zoom - area.clientHeight / 2;
    if (tool === 'magnifier') renderOptions();
    startThumb();
  }
  function customZoom() {
    const id = 'pt-z' + uid;
    const radios = [1, 2, 4, 6, 8].map(z => h('label', { class: 'pt-radio' },
      h('input', { type: 'radio', name: id, value: z, checked: z === zoom }), z * 100 + '%'));
    const form = h('form', { class: 'dlg' },
      h('div', null, 'Current size: ' + zoom * 100 + '%'),
      h('fieldset', { class: 'group pt-zoomopts' }, h('legend', null, 'Zoom to'), ...radios),
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'OK'), h('button', { class: 'btn', type: 'button', onclick: () => d.close(true) }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = form.querySelector('input:checked');
      d.close(true);
      if (v) setZoom(+v.value);
    });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); d.close(true); } });
    const d = createWindow({ title: 'Custom Zoom', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    (form.querySelector('input:checked') || radios[0].firstChild).focus();
  }
  function toggleGrid() { if (zoom >= 4) { grid = !grid; layout(); } }

  // The thumbnail shows the part of the picture in view at its real size.
  const thumbC = h('canvas', { width: 128, height: 96 });
  const thumb = h('div', { class: 'pt-thumb', hidden: true }, h('div', { class: 'pt-thumb-t' }, 'Thumbnail'), thumbC);
  let thumbRunning = false;
  function startThumb() {
    thumb.hidden = !(thumbOn && zoom > 1);
    if (thumb.hidden || thumbRunning) return;
    thumbRunning = true;
    const g = thumbC.getContext('2d');
    const frame = () => {
      if (!thumbOn || zoom === 1 || !root.isConnected) { thumbRunning = false; thumb.hidden = true; return; }
      const sx = Math.floor(area.scrollLeft / zoom), sy = Math.floor(area.scrollTop / zoom);
      g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 96);
      g.drawImage(canvas, -sx, -sy);
      if (sel && sel.lifted) g.drawImage(floatC, sel.x - sx, sel.y - sy);
      g.drawImage(overlay, -sx, -sy);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ---------- selection ----------
  function setAnts(d) {
    antsA.setAttribute('d', d || ''); antsB.setAttribute('d', d || '');
    ants.style.display = d ? '' : 'none';
  }
  const rectPath = (x, y, w, hgt) => `M${x} ${y}h${w}v${hgt}h${-w}z`;
  function drawSel() {
    if (!sel) { floatC.hidden = true; if (!stroke || stroke.kind !== 'select') setAnts(''); return; }
    Object.assign(floatC.style, { left: sel.x * zoom + 'px', top: sel.y * zoom + 'px', width: sel.w * zoom + 'px', height: sel.h * zoom + 'px' });
    floatC.hidden = !sel.lifted;
    setAnts(rectPath(sel.x, sel.y, sel.w, sel.h));
  }
  // What the selection looks like on the picture: in Transparent mode the
  // background colour drops out.
  function renderFloat() {
    if (!sel) return;
    let img = sel.img;
    if (transparent) {
      img = cloneImg(img);
      const [r, g, b] = rgb(bg), d = img.data;
      for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === b) d[i + 3] = 0;
    }
    floatC.width = sel.w; floatC.height = sel.h;
    floatC.getContext('2d').putImageData(img, 0, 0);
    drawSel();
  }
  // Alpha is only ever 0 or 255, so drawing the float back stays pixel-exact.
  function stampSel() { ctx.drawImage(floatC, sel.x, sel.y); }
  function punchHole() {
    const x0 = Math.max(0, sel.x), y0 = Math.max(0, sel.y), x1 = Math.min(W, sel.x + sel.w), y1 = Math.min(H, sel.y + sel.h);
    if (x1 <= x0 || y1 <= y0) return;
    const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data, s = sel.img.data;
    const [r, g, b] = rgb(bg);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (!s[((y - sel.y) * sel.w + x - sel.x) * 4 + 3]) continue;
      const i = ((y - y0) * (x1 - x0) + x - x0) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
    ctx.putImageData(img, x0, y0);
  }
  // Picks the selection up off the picture. Without `copy` the place it came
  // from is filled with the background colour; with it (Ctrl-drag) a copy stays.
  function lift(copy) {
    if (sel.lifted) { if (copy) stampSel(); return; }
    pushUndo();
    if (!copy) punchHole();
    sel.lifted = true;
    renderFloat();
  }
  function commitSel() {
    if (!sel) return;
    if (sel.lifted) stampSel();
    sel = null;
    drawSel();
  }
  function grab(x, y, w, hgt, mask) {
    const img = ctx.getImageData(x, y, w, hgt);
    if (mask) for (let i = 0; i < mask.length; i += 4) if (!mask[i + 3]) img.data[i + 3] = 0;
    sel = { x, y, w, h: hgt, img, lifted: false };
    renderFloat();
  }
  function makeSelection(x0, y0, x1, y1, pts) {
    const l = clamp(Math.min(x0, x1), 0, W - 1), r = clamp(Math.max(x0, x1), 0, W - 1);
    const t = clamp(Math.min(y0, y1), 0, H - 1), b = clamp(Math.max(y0, y1), 0, H - 1);
    if (!pts) { if (r > l || b > t) grab(l, t, r - l + 1, b - t + 1); return; }
    // Free-form: clip to the path, its outline included.
    const xs = pts.map(p => clamp(p[0], 0, W - 1)), ys = pts.map(p => clamp(p[1], 0, H - 1));
    const L = Math.min(...xs), T = Math.min(...ys), w = Math.max(...xs) - L + 1, hgt = Math.max(...ys) - T + 1;
    if (pts.length < 3 || w < 2 || hgt < 2) return;
    const m = h('canvas', { width: w, height: hgt }).getContext('2d');
    const local = pts.map(p => [p[0] - L, p[1] - T]);
    m.fillStyle = '#000';
    fillPoly(m, local);
    for (let i = 0; i < local.length; i++) { const a = local[i], c = local[(i + 1) % local.length]; line(m, a[0], a[1], c[0], c[1], 1, false); }
    grab(L, T, w, hgt, m.getImageData(0, 0, w, hgt).data);
  }
  const inSel = (x, y) => sel && x >= sel.x && y >= sel.y && x < sel.x + sel.w && y < sel.y + sel.h;
  function selectAll() {
    finishPending();
    if (!SELECTS.includes(tool)) setTool('select');
    grab(0, 0, W, H);
  }
  function clearSel() {
    if (!sel) return;
    if (!sel.lifted) { pushUndo(); punchHole(); }
    sel = null;
    drawSel();
  }
  const selCanvas = () => {
    const c = h('canvas', { width: sel.w, height: sel.h });
    c.getContext('2d').putImageData(sel.img, 0, 0);
    return c;
  };
  function copySel() {
    if (!sel) return;
    clip = cloneImg(sel.img);
    // Also hand it to the real clipboard when the browser lets us.
    try {
      if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
        const blob = new Promise(res => selCanvas().toBlob(res, 'image/png'));
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
      }
    } catch {}
  }
  function cutSel() { if (sel) { copySel(); clearSel(); } }

  // Pasting drops the picture at the top-left of the view as a floating selection.
  async function pasteImage(img) {
    finishPending();
    if (img.width > W || img.height > H) {
      const b = await msgbox({ title: 'Paint', icon: 'question', parent: win, buttons: ['&Yes', '&No', 'Cancel'],
        text: 'The image in the clipboard is larger than the bitmap.\nWould you like the bitmap enlarged?' });
      if (b === 'Cancel' || b == null) return;
      if (b === 'Yes') { pushUndo(); resize(clamp(Math.max(W, img.width), 1, 2000), clamp(Math.max(H, img.height), 1, 2000)); }
    }
    if (!SELECTS.includes(tool)) setTool('select');
    pushUndo();
    drew = true;
    const x = clamp(Math.floor(area.scrollLeft / zoom), 0, W - 1), y = clamp(Math.floor(area.scrollTop / zoom), 0, H - 1);
    sel = { x, y, w: img.width, h: img.height, img: cloneImg(img), lifted: true };
    renderFloat();
  }
  function pasteInternal() { if (clip) pasteImage(clip); }
  // Decodes a picture, with any soft edges snapped to fully on or off.
  async function decode(src) {
    const im = new Image();
    im.src = typeof src === 'string' ? src : URL.createObjectURL(src);
    try { await im.decode(); } finally { if (typeof src !== 'string') URL.revokeObjectURL(im.src); }
    const c = h('canvas', { width: Math.min(im.naturalWidth, 2000), height: Math.min(im.naturalHeight, 2000) });
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] < 128 ? 0 : 255;
    return img;
  }
  // The system clipboard comes back re-encoded and without our free-form mask,
  // so when it holds the same pixels we copied, ours wins.
  function sameAsClip(img) {
    if (!clip || clip.width !== img.width || clip.height !== img.height) return false;
    const a = clip.data, b = img.data;
    for (let i = 0; i < a.length; i += 4) if (a[i + 3] && (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])) return false;
    return true;
  }
  async function pasteBlob(blob) {
    try {
      const img = await decode(blob);
      if (sameAsClip(img)) pasteInternal(); else pasteImage(img);
    } catch { pasteInternal(); }
  }
  async function pasteMenu() {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await Promise.race([navigator.clipboard.read(), new Promise((_, no) => setTimeout(no, 1500))]);
        for (const it of items) {
          const type = it.types.find(t => t.startsWith('image/'));
          if (type) { pasteBlob(await it.getType(type)); return; }
        }
      }
    } catch {}
    pasteInternal();
  }
  let pasteTimer = 0;
  async function copyTo() {
    if (!sel) return;
    const c = selCanvas();
    const r = await saveAs({ name: 'untitled.bmp', filters: IMG, parent: win, title: 'Copy To' });
    if (!r) return;
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    saveTo(r, { data: c.toDataURL('image/png') }, () => blob, win);
  }
  async function pasteFrom() {
    const r = await openFile({ filters: IMG, parent: win, accept: 'image/*', title: 'Paste From' });
    if (!r) return;
    const src = r.file || (r.node && r.node.data);
    try {
      if (!src) throw new Error();
      pasteImage(await decode(src));
    } catch {
      msgbox({ title: 'Paint', icon: 'error', parent: win, text: `Paint cannot read ${r.name}.\nThis is not a valid bitmap file, or its format is not currently supported.` });
    }
  }

  // ---------- text ----------
  const fontPx = () => Math.round(font.size * 4 / 3);
  const lineH = () => Math.ceil(fontPx() * 1.2);
  const fontCss = z => `${font.italic ? 'italic ' : ''}${font.bold ? 'bold ' : ''}${fontPx() * z}px "${font.face}", sans-serif`;
  function startText(x0, y0, x1, y1) {
    let x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0) + 1, hgt = Math.abs(y1 - y0) + 1;
    if (w < 8) w = Math.min(160, W - x);          // a plain click gets a box of a sensible size
    if (hgt < lineH()) hgt = lineH();
    const el = h('textarea', { class: 'pt-text', spellcheck: false, autocomplete: 'off', 'aria-label': 'Text' });
    el.addEventListener('input', () => {
      text.h = Math.max(text.h, Math.min(H - text.y, Math.ceil(el.scrollHeight / zoom)));
      styleText();
    });
    text = { x, y, w, h: hgt, el };
    holder.append(el);
    styleText();
    el.focus({ preventScroll: true });
  }
  function styleText() {
    if (!text) return;
    Object.assign(text.el.style, {
      left: text.x * zoom + 'px', top: text.y * zoom + 'px', width: text.w * zoom + 'px', height: text.h * zoom + 'px',
      font: fontCss(zoom), lineHeight: lineH() * zoom + 'px', color: fg,
      textDecoration: font.underline ? 'underline' : 'none',
      background: transparent ? 'transparent' : bg,
    });
  }
  const refocusText = () => { if (text) text.el.focus({ preventScroll: true }); };
  // Greedy word wrap with the canvas's own measurements, breaking long words.
  function wrap(g, str, width) {
    const out = [];
    for (const para of str.split('\n')) {
      let cur = '';
      for (const word of para.split(/(?<=\s)/)) {
        if (g.measureText(cur + word).width <= width || !cur) cur += word;
        else { out.push(cur); cur = word; }
        while (g.measureText(cur.trimEnd()).width > width && cur.length > 1) {
          let n = cur.length - 1;
          while (n > 1 && g.measureText(cur.slice(0, n)).width > width) n--;
          out.push(cur.slice(0, n)); cur = cur.slice(n);
        }
      }
      out.push(cur);
    }
    return out;
  }
  // Rendered into the bitmap with the anti-aliasing thresholded away.
  function commitText() {
    if (!text) return;
    const t = text;
    text = null;
    t.el.remove();
    if (!t.el.value.trim()) return;
    const bx = Math.max(0, t.x), by = Math.max(0, t.y), bw = Math.min(W, t.x + t.w) - bx, bh = Math.min(H, t.y + t.h) - by;
    if (bw <= 0 || bh <= 0) return;
    pushUndo();
    drew = true;
    const g = h('canvas', { width: bw, height: bh }).getContext('2d', { willReadFrequently: true });
    g.font = fontCss(1);
    g.textBaseline = 'middle';
    g.fillStyle = '#000';
    const lh = lineH(), px = fontPx();
    wrap(g, t.el.value, t.w).forEach((ln, i) => {
      const y = t.y - by + i * lh;
      g.fillText(ln, t.x - bx, y + lh / 2);
      if (font.underline && ln.trim()) g.fillRect(t.x - bx, y + Math.round(lh / 2 + px * 0.38) + 1, Math.ceil(g.measureText(ln.trimEnd()).width), Math.max(1, Math.round(px / 14)));
    });
    const m = g.getImageData(0, 0, bw, bh).data;
    const img = ctx.getImageData(bx, by, bw, bh), d = img.data;
    const [fr, fgG, fb] = rgb(fg), [br, bgG, bb] = rgb(bg);
    for (let i = 0; i < d.length; i += 4) {
      if (m[i + 3] >= 110) { d[i] = fr; d[i + 1] = fgG; d[i + 2] = fb; d[i + 3] = 255; }
      else if (!transparent) { d[i] = br; d[i + 1] = bgG; d[i + 2] = bb; d[i + 3] = 255; }
    }
    ctx.putImageData(img, bx, by);
  }

  // ---------- curve and polygon ----------
  function previewCurve() {
    octx.clearRect(0, 0, W, H);
    octx.fillStyle = curve.main;
    bezier(octx, curve.p0, curve.c1, curve.c2, curve.p3, size.line);
  }
  function finishCurve() {
    if (!curve) return;
    const c = curve;
    curve = null;
    octx.clearRect(0, 0, W, H);
    pushUndo();
    drew = true;
    ctx.fillStyle = c.main;
    bezier(ctx, c.p0, c.c1, c.c2, c.p3, size.line);
  }
  function previewPoly() {
    octx.clearRect(0, 0, W, H);
    octx.fillStyle = poly.main;
    outlinePts(octx, poly.pts, false);
  }
  function finishPoly() {
    if (!poly) return;
    const p = poly;
    poly = null;
    octx.clearRect(0, 0, W, H);
    const pts = p.pts.filter((q, i) => i === 0 || q[0] !== p.pts[i - 1][0] || q[1] !== p.pts[i - 1][1]);
    if (pts.length < 2) return;
    pushUndo();
    drew = true;
    drawPts(ctx, pts, p.main, p.other);
  }
  // Everything half-made gets finished before the tool changes or the picture is used.
  function finishPending() {
    commitText();
    finishCurve();
    finishPoly();
    commitSel();
  }
  function cancel() {
    if (stroke && stroke.kind !== 'move' && stroke.kind !== 'paint') { stroke = null; dims.textContent = ''; }
    if (text) { text.el.remove(); text = null; }
    curve = poly = null;
    octx.clearRect(0, 0, W, H);
    drawSel();
  }

  // ---------- pointer ----------
  let stroke = null, airTimer = null;
  const touches = new Map();             // fingers on the picture, for two-finger panning
  let pan = null;
  const mid = () => {
    const v = [...touches.values()];
    return [v.reduce((a, q) => a + q[0], 0) / v.length, v.reduce((a, q) => a + q[1], 0) / v.length];
  };
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) * W / r.width), Math.floor((e.clientY - r.top) * H / r.height)];
  };
  function spray(x, y, color) {
    const r = size.airbrush / 2 + 1;
    ctx.fillStyle = color;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r;
      ctx.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1);
    }
  }
  // Win95 shows where the magnifier will land.
  function magnifierHover(x, y) {
    octx.clearRect(0, 0, W, H);
    if (zoom !== 1) return;
    const w = Math.min(W, Math.ceil(area.clientWidth / 4)), hgt = Math.min(H, Math.ceil(area.clientHeight / 4));
    const l = clamp(x - (w >> 1), 0, W - w), t = clamp(y - (hgt >> 1), 0, H - hgt);
    octx.fillStyle = '#000';
    octx.fillRect(l, t, w, 1); octx.fillRect(l, t + hgt - 1, w, 1); octx.fillRect(l, t, 1, hgt); octx.fillRect(l + w - 1, t, 1, hgt);
  }
  holder.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (SELECTS.includes(tool) && !stroke) openMenu(refocus(editItems(true)), { x: e.clientX, y: e.clientY });
  });
  holder.addEventListener('pointerdown', e => {
    if (text && e.target === text.el) return;            // typing, or placing the caret
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    root.focus({ preventScroll: true });
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      // A second finger pans the view instead of drawing; the stroke it interrupts is dropped.
      if (touches.size === 2) {
        holder.setPointerCapture(e.pointerId);
        if (stroke) {
          clearInterval(airTimer);
          if (stroke.kind === 'paint') { const img = undoStack.pop(); if (img) ctx.putImageData(img, 0, 0); }
          else if (stroke.kind === 'select' || stroke.kind === 'text') setAnts('');
          if (stroke.kind === 'curve' || stroke.kind === 'poly') cancel();
          stroke = null;
          octx.clearRect(0, 0, W, H);
          drawSel();
        }
        pan = mid();
        return;
      }
    }
    if (stroke || pan) return;                           // a second finger mid-stroke
    if (text) { commitText(); return; }                  // clicking outside the box finishes typing
    const [x, y] = pos(e);
    const right = e.button === 2;
    if (right && SELECTS.includes(tool)) return;         // that's the context menu
    holder.setPointerCapture(e.pointerId);
    const main = right ? bg : fg, other = right ? fg : bg;
    if (tool === 'picker') {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const p = ctx.getImageData(x, y, 1, 1).data;
      const c = hex(p[0], p[1], p[2]);
      if (right) bg = c; else fg = c;
      updateColors();
      setTool(prevTool);
      return;
    }
    if (tool === 'magnifier') {
      octx.clearRect(0, 0, W, H);
      if (zoom === 1) setZoom(right ? 1 : 4, x, y); else setZoom(1, x, y);
      setTool(prevTool);
      return;
    }
    if (SELECTS.includes(tool)) {
      if (inSel(x, y)) {
        lift(e.ctrlKey || e.metaKey);
        drew = true;
        stroke = { kind: 'move', dx: x - sel.x, dy: y - sel.y, id: e.pointerId };
      } else {
        commitSel();
        stroke = { kind: 'select', x0: x, y0: y, pts: [[x, y]], id: e.pointerId };
      }
      return;
    }
    if (tool === 'text') { stroke = { kind: 'text', x0: x, y0: y, id: e.pointerId }; return; }
    if (tool === 'curve') {
      if (!curve) curve = { stage: 0, p0: [x, y], c1: [x, y], c2: [x, y], p3: [x, y], main };
      else if (curve.stage === 1) curve.c1 = curve.c2 = [x, y];
      else curve.c2 = [x, y];
      stroke = { kind: 'curve', id: e.pointerId };
      previewCurve();
      return;
    }
    if (tool === 'polygon') {
      const now = Date.now();
      if (poly) {
        const last = poly.pts[poly.pts.length - 1];
        // A double-click near the last corner closes the shape.
        if (now - poly.upAt < 400 && Math.hypot(x - last[0], y - last[1]) * zoom < 8) { finishPoly(); return; }
        poly.pts.push([x, y]);
      } else poly = { pts: [[x, y], [x, y]], main, other, upAt: 0 };
      stroke = { kind: 'poly', id: e.pointerId };
      previewPoly();
      return;
    }
    pushUndo();
    drew = true;
    if (tool === 'fill') { if (x >= 0 && y >= 0 && x < W && y < H) flood(x, y, main); return; }
    stroke = { kind: 'paint', x0: x, y0: y, lx: x, ly: y, main, other, id: e.pointerId };
    ctx.fillStyle = tool === 'eraser' ? bg : main;
    if (tool === 'pencil') stamp(ctx, x, y, 1);
    else if (tool === 'brush') stamp(ctx, x, y, size.brush, true);
    else if (tool === 'eraser') stamp(ctx, x, y, size.eraser, false);
    else if (tool === 'airbrush') { spray(x, y, main); airTimer = setInterval(() => stroke && spray(stroke.lx, stroke.ly, main), 40); }
  });
  const showDims = (x0, y0, x1, y1) => { dims.textContent = `${Math.abs(x1 - x0) + 1}x${Math.abs(y1 - y0) + 1}`; };
  holder.addEventListener('pointermove', e => {
    if (pan && touches.has(e.pointerId)) {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      const m = mid();
      area.scrollLeft -= m[0] - pan[0]; area.scrollTop -= m[1] - pan[1];
      pan = m;
      return;
    }
    const [x, y] = pos(e);
    coords.textContent = x >= 0 && y >= 0 && x < W && y < H ? `${x},${y}` : '';
    if (!stroke) {
      holder.classList.toggle('over-sel', SELECTS.includes(tool) && !!inSel(x, y));
      if (tool === 'magnifier' && e.pointerType === 'mouse') magnifierHover(x, y);
      if (tool === 'polygon' && poly && e.pointerType === 'mouse') { poly.pts.push([x, y]); previewPoly(); poly.pts.pop(); }
      return;
    }
    if (e.pointerId !== stroke.id) return;
    switch (stroke.kind) {
      case 'move':
        sel.x = x - stroke.dx; sel.y = y - stroke.dy;
        drawSel();
        return;
      case 'select':
        if (tool === 'freeselect') {
          stroke.pts.push([x, y]);
          setAnts('M' + stroke.pts.map(p => `${p[0] + 0.5} ${p[1] + 0.5}`).join('L'));
        } else {
          const l = clamp(Math.min(stroke.x0, x), 0, W), t = clamp(Math.min(stroke.y0, y), 0, H);
          setAnts(rectPath(l, t, clamp(Math.max(stroke.x0, x) + 1, 0, W) - l, clamp(Math.max(stroke.y0, y) + 1, 0, H) - t));
          showDims(stroke.x0, stroke.y0, x, y);
        }
        return;
      case 'text': {
        const l = Math.min(stroke.x0, x), t = Math.min(stroke.y0, y);
        setAnts(rectPath(l, t, Math.abs(x - stroke.x0) + 1, Math.abs(y - stroke.y0) + 1));
        showDims(stroke.x0, stroke.y0, x, y);
        return;
      }
      case 'curve':
        if (curve.stage === 0) curve.p3 = [x, y];
        else if (curve.stage === 1) curve.c1 = curve.c2 = [x, y];
        else curve.c2 = [x, y];
        previewCurve();
        return;
      case 'poly':
        poly.pts[poly.pts.length - 1] = [x, y];
        previewPoly();
        return;
    }
    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') {
      ctx.fillStyle = tool === 'eraser' ? bg : stroke.main;
      line(ctx, stroke.lx, stroke.ly, x, y, tool === 'pencil' ? 1 : size[tool], tool === 'brush');
    } else if (tool === 'airbrush') {
      spray(x, y, stroke.main);
    } else {
      octx.clearRect(0, 0, W, H);
      octx.fillStyle = stroke.main;
      if (tool === 'line') line(octx, stroke.x0, stroke.y0, x, y, size.line, false);
      else shape(octx, tool, stroke.x0, stroke.y0, x, y, stroke.main, stroke.other);
      showDims(stroke.x0, stroke.y0, x, y);
    }
    stroke.lx = x; stroke.ly = y;
  });
  const end = e => {
    if (touches.delete(e.pointerId) && pan) { pan = touches.size ? mid() : null; return; }
    if (!stroke || e.pointerId !== stroke.id) return;
    clearInterval(airTimer);
    const s = stroke;
    stroke = null;
    dims.textContent = '';
    const [x, y] = pos(e);
    const up = e.type === 'pointerup';
    switch (s.kind) {
      case 'move': return;
      case 'select':
        setAnts('');
        if (up) makeSelection(s.x0, s.y0, x, y, tool === 'freeselect' ? s.pts : null);
        drawSel();
        return;
      case 'text':
        setAnts('');
        if (up) startText(clamp(s.x0, 0, W - 1), clamp(s.y0, 0, H - 1), clamp(x, 0, W - 1), clamp(y, 0, H - 1));
        return;
      case 'curve':
        if (!up) { curve = null; octx.clearRect(0, 0, W, H); return; }
        if (curve.stage === 2) finishCurve(); else curve.stage++;
        return;
      case 'poly': {
        if (!up) { poly = null; octx.clearRect(0, 0, W, H); return; }
        const p0 = poly.pts[0];
        // Clicking back on the starting corner closes it too.
        if (poly.pts.length > 3 && Math.hypot(x - p0[0], y - p0[1]) * zoom < 8) { poly.pts.pop(); finishPoly(); return; }
        poly.upAt = Date.now();
        return;
      }
    }
    octx.clearRect(0, 0, W, H);
    if (up) {
      ctx.fillStyle = s.main;
      if (tool === 'line') line(ctx, s.x0, s.y0, x, y, size.line, false);
      else if (SHAPES.includes(tool)) shape(ctx, tool, s.x0, s.y0, x, y, s.main, s.other);
    }
  };
  holder.addEventListener('pointerup', end);
  holder.addEventListener('pointercancel', end);
  holder.addEventListener('pointerleave', () => {
    if (!stroke) { coords.textContent = ''; if (tool === 'magnifier') octx.clearRect(0, 0, W, H); }
  });
  // Clicking the grey around the picture puts the selection or text down.
  area.addEventListener('pointerdown', e => {
    if (e.target !== area || e.offsetX >= area.clientWidth || e.offsetY >= area.clientHeight) return;
    commitText(); commitSel();
  });

  // ---------- image operations ----------
  function resize(w, hgt, keep = true) {
    const old = keep ? ctx.getImageData(0, 0, Math.min(W, w), Math.min(H, hgt)) : null;
    W = w; H = hgt;
    canvas.width = overlay.width = W; canvas.height = overlay.height = H;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (old) ctx.putImageData(old, 0, 0);
    layout();
  }
  // Flip, rotate, stretch, skew and invert work on the selection when there is one.
  function apply(op) {
    commitText(); finishCurve(); finishPoly();
    if (sel) {
      lift(false);
      sel.img = op(sel.img, [0, 0, 0, 0]);
      sel.w = sel.img.width; sel.h = sel.img.height;
      renderFloat();
      return;
    }
    pushUndo();
    const out = op(ctx.getImageData(0, 0, W, H), [...rgb(bg), 255]);
    if (out.width !== W || out.height !== H) resize(out.width, out.height, false);
    ctx.putImageData(out, 0, 0);
  }
  const invert = () => apply(OPS.invert);
  function clear() { finishPending(); pushUndo(); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
  function attributes() {
    finishPending();
    const wIn = h('input', { class: 'field', type: 'number', value: W, id: 'pt-w', min: 1, max: 2000 });
    const hIn = h('input', { class: 'field', type: 'number', value: H, id: 'pt-h', min: 1, max: 2000 });
    const form = h('form', { class: 'dlg' },
      h('label', { class: 'dp-row', for: 'pt-w' }, h('span', { html: '<u>W</u>idth:' }), wIn),
      h('label', { class: 'dp-row', for: 'pt-h' }, h('span', { html: '<u>H</u>eight:' }), hIn),
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'OK'), h('button', { class: 'btn', type: 'button', onclick: () => d.close(true) }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      pushUndo();
      resize(clamp(+wIn.value || W, 1, 2000), clamp(+hIn.value || H, 1, 2000));
      d.close(true);
    });
    const d = createWindow({ title: 'Attributes', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    wIn.select();
  }
  function stretchSkew() {
    const id = 'pt-ss' + uid + '-';
    const num = (k, v, min, max) => h('input', { class: 'field pt-num', type: 'number', id: id + k, value: v, min, max });
    const sh = num('sh', 100, 1, 500), sv = num('sv', 100, 1, 500), kh = num('kh', 0, -89, 89), kv = num('kv', 0, -89, 89);
    const row = (k, label, input, unit) => h('div', { class: 'pt-ss-row' }, h('label', { for: id + k, html: label }), input, h('span', null, unit));
    const form = h('form', { class: 'dlg pt-ss' },
      h('fieldset', { class: 'group' }, h('legend', null, 'Stretch'),
        row('sh', '<u>H</u>orizontal:', sh, '%'), row('sv', '<u>V</u>ertical:', sv, '%')),
      h('fieldset', { class: 'group' }, h('legend', null, 'Skew'),
        row('kh', 'H<u>o</u>rizontal:', kh, 'Degrees'), row('kv', 'V<u>e</u>rtical:', kv, 'Degrees')),
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'OK'), h('button', { class: 'btn', type: 'button', onclick: () => d.close(true) }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const ph = clamp(+sh.value || 100, 1, 500), pv = clamp(+sv.value || 100, 1, 500), dh = clamp(+kh.value || 0, -89, 89), dv = clamp(+kv.value || 0, -89, 89);
      d.close(true);
      if (ph === 100 && pv === 100 && !dh && !dv) return;
      apply((img, fill) => {
        if (ph !== 100 || pv !== 100) img = OPS.stretch(img, ph, pv);
        if (dh) img = OPS.skewH(img, dh, fill);
        if (dv) img = OPS.skewV(img, dv, fill);
        return img;
      });
    });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); d.close(true); } });
    const d = createWindow({ title: 'Stretch and Skew', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    sh.select();
  }

  // Options > Edit Colors: replaces a palette swatch, like the Win95 colour dialog.
  function editColors(i = fgIndex) {
    const id = 'pt-ec' + uid + '-';
    let cur = pal[i];
    const prev = h('div', { class: 'pt-ec-prev' });
    const native = h('input', { type: 'color', class: 'pt-ec-native', 'aria-label': 'Custom color' });
    const chans = ['Red', 'Green', 'Blue'].map((n, k) => h('input', { class: 'field pt-num', type: 'number', min: 0, max: 255, id: id + k }));
    const basics = BASIC.map(c => {
      const b = h('button', { type: 'button', class: 'pt-ec-sw', style: { background: c }, 'aria-label': c });
      b.addEventListener('click', () => set(c));
      b.addEventListener('dblclick', () => form.requestSubmit());
      return b;
    });
    function set(c, from) {
      cur = c;
      prev.style.background = c;
      native.value = c;
      if (from !== 'chans') rgb(c).forEach((v, k) => { chans[k].value = v; });
      basics.forEach((b, k) => b.classList.toggle('sel', BASIC[k] === c));
    }
    native.addEventListener('input', () => set(native.value));
    chans.forEach(ch => ch.addEventListener('input', () => set(hex(...chans.map(x => +x.value || 0)), 'chans')));
    const form = h('form', { class: 'dlg pt-ec' },
      h('div', { class: 'pt-ec-cols' },
        h('div', null, h('div', { html: '<u>B</u>asic colors:' }), h('div', { class: 'pt-ec-grid' }, ...basics)),
        h('div', { class: 'pt-ec-custom' },
          h('label', { class: 'pt-ec-pick' }, native, h('span', null, 'Define Custom Colors...')),
          prev, h('div', { class: 'pt-ec-cap' }, 'Color|Solid'),
          ...['<u>R</u>ed:', '<u>G</u>reen:', 'Bl<u>u</u>e:'].map((l, k) => h('div', { class: 'pt-ss-row' }, h('label', { for: id + k, html: l }), chans[k])))),
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'OK'), h('button', { class: 'btn', type: 'button', onclick: () => d.close(true) }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      pal[i] = cur;
      swatches[i].style.background = cur;
      swatches[i].setAttribute('aria-label', cur);
      fg = cur; fgIndex = i;
      updateColors();
      d.close(true);
    });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); d.close(true); } });
    const d = createWindow({ title: 'Edit Colors', body: form, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    set(cur);
    (basics.find(b => b.classList.contains('sel')) || basics[0]).focus();
  }

  // View > View Bitmap: the picture alone on the screen until a click or key.
  function viewBitmap() {
    finishPending();
    const el = h('div', { class: 'pt-view', tabindex: '-1', role: 'dialog', 'aria-label': 'View Bitmap' },
      h('img', { src: canvas.toDataURL('image/png'), alt: name, width: W, height: H }));
    const done = e => { e.preventDefault(); e.stopPropagation(); el.remove(); root.focus({ preventScroll: true }); };
    el.addEventListener('click', done);
    el.addEventListener('keydown', done);
    el.addEventListener('contextmenu', done);
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
    document.body.append(el);
    el.focus();
  }

  const IMG = [{ label: 'Bitmap Files (*.bmp)', exts: ['.bmp'] }, { label: 'Pictures (*.png;*.jpg;*.gif)', exts: ['.png', '.jpg', '.jpeg', '.gif'] }, { label: 'All Files (*.*)', exts: [] }];
  const setName = (n, p) => { name = n; path = p || null; win.setTitle(name + ' - Paint'); };
  function loadImage(src, n, p, revoke) {
    const img = new Image();
    img.onload = () => {
      finishPending();
      pushUndo();
      resize(Math.min(img.width, 2000), Math.min(img.height, 2000), false);
      ctx.drawImage(img, 0, 0);
      if (revoke) URL.revokeObjectURL(src);
      setName(n, p);
      savedAt = edits;
    };
    img.onerror = () => msgbox({ title: 'Paint', icon: 'error', parent: win, text: `Paint cannot read this file.\nThis is not a valid bitmap file, or its format is not currently supported.` });
    img.src = src;
  }
  async function openDialog() {
    finishPending();
    if (!(await confirmSave())) return;
    const r = await openFile({ filters: IMG, parent: win, accept: 'image/*' });
    if (!r) return;
    if (r.file) loadImage(URL.createObjectURL(r.file), r.file.name, null, true);
    else if (r.node.data) loadImage(r.node.data, r.node.name, r.node.user ? r.path : null);
    else msgbox({ title: 'Paint', icon: 'error', parent: win, text: `Paint cannot read ${r.name}.\nThis is not a valid bitmap file, or its format is not currently supported.` });
  }
  async function newImage() {
    finishPending();
    if (!(await confirmSave())) return;
    resize(480, 320, false); undoStack.length = 0; edits = savedAt = 0; drew = false; setName('untitled');
  }
  const modified = () => edits !== savedAt;
  async function confirmSave() {
    finishPending();
    if (!modified()) return true;
    const b = await msgbox({ title: 'Paint', icon: 'warn', parent: win, buttons: ['&Yes', '&No', 'Cancel'], text: `Save changes to ${name}?` });
    if (b === 'Yes') return save();
    return b === 'No';
  }
  function editItems(context) {
    return [
      ...(context ? [] : [{ label: '&Undo', key: 'Ctrl+Z', disabled: !undoStack.length && !text && !curve && !poly, action: undo }, '-']),
      { label: 'Cu&t', key: 'Ctrl+X', disabled: !sel, action: cutSel },
      { label: '&Copy', key: 'Ctrl+C', disabled: !sel, action: copySel },
      { label: '&Paste', key: 'Ctrl+V', disabled: !clip && !(navigator.clipboard && navigator.clipboard.read), action: pasteMenu },
      { label: 'C&lear Selection', key: 'Del', disabled: !sel, action: clearSel },
      { label: 'Select &All', key: 'Ctrl+L', action: selectAll },
      '-',
      { label: 'C&opy To...', disabled: !sel, action: copyTo },
      { label: 'Paste &From...', action: pasteFrom },
      ...(context ? ['-', ...imageItems().slice(0, 3)] : []),
    ];
  }
  function imageItems() {
    return [
      { label: '&Flip/Rotate', submenu: [
        { label: 'Flip &horizontal', action: () => apply(OPS.flipH) },
        { label: 'Flip &vertical', action: () => apply(OPS.flipV) },
        '-',
        { label: 'Rotate by &90°', action: () => apply(OPS.rot90) },
        { label: 'Rotate by &180°', action: () => apply(OPS.rot180) },
        { label: 'Rotate by &270°', action: () => apply(OPS.rot270) },
      ] },
      { label: '&Stretch/Skew...', action: stretchSkew },
      { label: '&Invert Colors', key: 'Ctrl+I', action: invert },
      { label: '&Attributes...', key: 'Ctrl+E', action: attributes },
      { label: '&Clear Image', key: 'Ctrl+Shft+N', disabled: !!sel, action: clear },
    ];
  }
  // Menu commands give the keyboard back to the picture, so shortcuts keep working.
  const refocus = items => items.map(it => it === '-' ? it : {
    ...it,
    action: it.action && (() => { root.focus({ preventScroll: true }); it.action(); }),
    submenu: it.submenu && (() => refocus(typeof it.submenu === 'function' ? it.submenu() : it.submenu)),
  });
  const bar = menubar([
    { label: '&File', items: () => [
      { label: '&New', key: 'Ctrl+N', action: newImage },
      { label: '&Open...', key: 'Ctrl+O', action: openDialog },
      { label: '&Save', key: 'Ctrl+S', action: () => save() },
      { label: 'Save &As...', action: () => save(true) },
      ...(sendEnabled() ? ['-', { label: 'S&end to blankiekun...', icon: 'i-mail', action: sendDrawing }] : []),
      '-',
      { label: 'Set As Wallpaper (&Tiled)', action: () => wallpaper(true) },
      { label: 'Set As Wallpaper (C&entered)', action: () => wallpaper(false) },
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Edit', items: () => editItems(false) },
    { label: '&View', items: () => [
      { label: '&Tool Box', key: 'Ctrl+T', checked: !toolbox.hidden, action: () => { toolbox.hidden = !toolbox.hidden; } },
      { label: '&Color Box', checked: !colorbox.hidden, action: () => { colorbox.hidden = !colorbox.hidden; } },
      { label: '&Status Bar', checked: !status.hidden, action: () => { status.hidden = !status.hidden; } },
      { label: 'T&ext Toolbar', checked: textBarOn, action: () => { textBarOn = !textBarOn; fontbar.hidden = !(tool === 'text' && textBarOn); } },
      '-',
      { label: '&Zoom', submenu: () => [
        { label: '&Normal Size', key: 'Ctrl+PgUp', checked: zoom === 1, radio: true, action: () => setZoom(1) },
        { label: '&Large Size', key: 'Ctrl+PgDn', checked: zoom === 4, radio: true, action: () => setZoom(4) },
        { label: 'C&ustom...', action: customZoom },
        '-',
        { label: 'Show &Grid', key: 'Ctrl+G', checked: grid && zoom >= 4, disabled: zoom < 4, action: toggleGrid },
        { label: 'Show T&humbnail', checked: thumbOn && zoom > 1, disabled: zoom === 1, action: () => { thumbOn = !thumbOn; startThumb(); } },
      ] },
      { label: '&View Bitmap', key: 'Ctrl+F', action: viewBitmap },
    ] },
    { label: '&Image', items: imageItems },
    { label: '&Options', items: () => [
      { label: '&Edit Colors...', action: () => editColors() },
      { label: '&Draw Opaque', checked: !transparent, action: () => setTransparent(!transparent) },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') },
      '-',
      { label: '&About Paint', action: () => about('Paint', 'i-paint', win) },
    ] },
  ].map(m => ({ ...m, items: () => refocus(m.items()) })));

  function sendDrawing() {
    finishPending();
    const d = ctx.getImageData(0, 0, W, H).data;
    let blank = true;
    for (let i = 4; i < d.length && blank; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2]) blank = false;
    if (blank) { msgbox({ title: 'Paint', icon: 'info', parent: win, text: 'The picture is empty. Draw something first!' }); return; }
    canvas.toBlob(blob => {
      if (!blob) return;
      if (blob.size > 1_500_000) { msgbox({ title: 'Paint', icon: 'warn', parent: win, text: 'This picture is too big to send. Make it smaller with Image > Attributes.' }); return; }
      sendDialog({ kind: 'drawing', parent: win, blob });
    }, 'image/png');
  }

  function wallpaper(tile) {
    finishPending();
    import('./display.js').then(m => m.setWallpaper(canvas.toDataURL('image/png'), tile));
  }

  // Pictures are kept on the pretend disk as PNG data, whatever the name says.
  async function save(as) {
    finishPending();
    const data = canvas.toDataURL('image/png');
    if (!path || as) {
      const r = await saveAs({ name: /\.[a-z0-9]+$/i.test(name) ? name : name + '.bmp', filters: IMG, parent: win });
      if (!r) return false;
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      const n = saveTo(r, { data }, () => blob, win);
      if (!n && !r.floppy) return false;
      setName(r.name, n ? r.path : null);
    } else if (!saveTo({ path }, { data }, null, win)) return false;
    savedAt = edits;
    return true;
  }

  const root = h('div', { class: 'pt', tabindex: '-1' }, bar, fontbar, h('div', { class: 'pt-main' }, toolbox, area, thumb), colorbox, status);
  if (sendEnabled()) {
    const btn = sendButton('Send to blankiekun...', sendDrawing);
    colorbox.append(btn);
    tipLater(btn, root, 'paint', 'Send your drawing to blankiekun with this button.', () => drew);
  }
  const onKey = e => {
    if (e.target.closest('input, textarea, select')) {
      if (e.key === 'Escape' && text && e.target === text.el) { e.preventDefault(); commitText(); root.focus({ preventScroll: true }); }
      return;
    }
    const c = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.altKey && !c && k.length === 1) { if (bar.openByKey(k)) e.preventDefault(); return; }
    if (!c) {
      if (e.key === 'Delete') clearSel();
      else if (e.key === 'Escape') cancel();
      else if (e.key === 'Enter' && poly) finishPoly();
      else return;
      e.preventDefault();
      return;
    }
    if (k === 'v') {
      // Leave the browser to fire a paste event with whatever the real clipboard
      // holds; fall back to ours if it doesn't.
      clearTimeout(pasteTimer);
      pasteTimer = setTimeout(pasteInternal, 80);
      return;
    }
    const keys = {
      z: undo, s: () => save(), o: openDialog, i: invert, e: attributes,
      x: cutSel, c: copySel, l: selectAll, a: selectAll, f: viewBitmap, g: toggleGrid,
      t: () => { toolbox.hidden = !toolbox.hidden; },
      pageup: () => setZoom(1), pagedown: () => setZoom(4),
    };
    if (e.shiftKey && k === 'n') { e.preventDefault(); clear(); return; }
    if (keys[k] && !e.shiftKey) { e.preventDefault(); keys[k](); }
  };
  const onPaste = e => {
    if (e.target.closest('input, textarea')) return;
    e.preventDefault();
    clearTimeout(pasteTimer);
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.kind === 'file' && i.type.startsWith('image/'));
    const f = item && item.getAsFile();
    if (f) pasteBlob(f); else pasteInternal();
  };

  const win = createWindow({
    app: 'paint', title: 'untitled - Paint', icon: 'i-paint', body: root,
    width: 640, height: 500, minW: 260, minH: 240, route: 'paint', onClose: confirmSave, autofocus: '.pt',
  });
  // On the window, not the body: focus lands on the window itself after dialogs.
  win.el.addEventListener('keydown', onKey);
  win.el.addEventListener('paste', onPaste);
  if (arg && arg.data) loadImage(arg.data, arg.name, arg.path);
  setTool('pencil');
  updateColors();
  layout();
  return win;
}

export default { id: 'paint', title: 'Paint', icon: 'i-paint', open };
