// Paint. Everything is drawn pixel by pixel so fills and colour picks stay exact,
// the way the real thing never anti-aliased anything.

import { h, clamp } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import { saveAs, openFile, saveTo } from '../filedlg.js';
import { sendEnabled, sendButton, sendDialog, tipLater } from '../send.js';

const PALETTE = [
  '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040',
];

const svg = inner => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${inner}</svg>`;
const TOOLS = [
  { id: 'eraser', name: 'Eraser/Color Eraser', icon: svg("<path d='M2 10l6-6 6 6-4 4H6z' fill='#fff' stroke='#000'/><path d='M2 10l6-6 2.5 2.5-6 6z' fill='#ffff80' stroke='#000'/>") },
  { id: 'fill', name: 'Fill With Color', icon: svg("<path d='M3 8l5-5 5 5-5 5z' fill='#fff' stroke='#000'/><path d='M13 8c1.5 2 2 3 1 5-1.5 0-2-2-1-5z' fill='#0000ff'/>") },
  { id: 'picker', name: 'Pick Color', icon: svg("<path d='M11 2l3 3-2 2-1-1-6 6-3 1 1-3 6-6-1-1z' fill='#c0c0c0' stroke='#000'/>") },
  { id: 'pencil', name: 'Pencil', icon: svg("<path d='M3 13l1-3 7-7 2 2-7 7z' fill='#ffff00' stroke='#000'/><path d='M3 13l1-3 2 2z' fill='#000'/>") },
  { id: 'brush', name: 'Brush', icon: svg("<path d='M10 2l4 4-5 3-2-2z' fill='#800000' stroke='#000'/><path d='M7 7l2 2-2 3c-1 1-3 2-5 2 0-2 1-4 2-5z' fill='#000'/>") },
  { id: 'airbrush', name: 'Airbrush', icon: svg("<rect x='2.5' y='7.5' width='6' height='6' fill='#c0c0c0' stroke='#000'/><rect x='4' y='4' width='3' height='3'/><path d='M9 3h1v1H9zM11 2h1v1h-1zM12 5h1v1h-1zM10 6h1v1h-1zM13 3h1v1h-1z'/>") },
  { id: 'line', name: 'Line', icon: svg("<path d='M3 13L13 3' stroke='#000' stroke-width='1.6'/>") },
  { id: 'rect', name: 'Rectangle', icon: svg("<rect x='2.5' y='4.5' width='11' height='8' fill='none' stroke='#000'/>") },
  { id: 'ellipse', name: 'Ellipse', icon: svg("<ellipse cx='8' cy='8.5' rx='6' ry='4.5' fill='none' stroke='#000'/>") },
  { id: 'rrect', name: 'Rounded Rectangle', icon: svg("<rect x='2.5' y='4.5' width='11' height='8' rx='3' fill='none' stroke='#000'/>") },
];
const SIZES = { brush: [1, 2, 3, 5], eraser: [4, 6, 8, 10], line: [1, 2, 3, 5], airbrush: [4, 8, 12] };
const SHAPES = ['rect', 'ellipse', 'rrect'];

function open(arg) {
  let W = 480, H = 320;
  let name = 'untitled', path = null, edits = 0, savedAt = 0;
  let fg = '#000000', bg = '#ffffff';
  let tool = 'pencil', prevTool = 'pencil';
  const size = { brush: 2, eraser: 6, line: 1, airbrush: 8 };
  let fillMode = 'outline';
  const undoStack = [];
  let drew = false;

  const canvas = h('canvas', { class: 'pt-canvas', width: W, height: H, 'aria-label': 'Drawing' });
  const overlay = h('canvas', { class: 'pt-overlay', width: W, height: H, 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const octx = overlay.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const holder = h('div', { class: 'pt-holder' }, canvas, overlay);
  const area = h('div', { class: 'pt-area' }, holder);
  const coords = h('div', { style: { width: '90px' } });
  const hint = h('span', null, 'For Help, click Help Topics on the Help Menu.');
  const status = h('div', { class: 'statusbar' }, hint, coords);

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
    if (id === 'picker' && tool !== 'picker') prevTool = tool;
    tool = id;
    toolBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(TOOLS[i].id === id)));
    holder.dataset.tool = id;
    renderOptions();
  }
  function renderOptions() {
    options.replaceChildren();
    if (SIZES[tool]) {
      for (const s of SIZES[tool]) {
        const b = h('button', { type: 'button', class: 'pt-opt', 'aria-pressed': String(size[tool] === s), 'aria-label': s + ' pixels' },
          h('i', { style: tool === 'line' ? { width: '24px', height: s + 'px' } : { width: Math.min(14, s + 1) + 'px', height: Math.min(14, s + 1) + 'px', borderRadius: tool === 'brush' ? '50%' : tool === 'airbrush' ? '50%' : '0' } }));
        b.addEventListener('click', () => { size[tool] = s; renderOptions(); });
        options.append(b);
      }
    } else if (SHAPES.includes(tool)) {
      for (const m of ['outline', 'both', 'fill']) {
        const b = h('button', { type: 'button', class: 'pt-opt shape ' + m, 'aria-pressed': String(fillMode === m), 'aria-label': m }, h('i'));
        b.addEventListener('click', () => { fillMode = m; renderOptions(); });
        options.append(b);
      }
    }
  }

  // ---------- colour box ----------
  const fgBox = h('i', { class: 'pt-fg' }), bgBox = h('i', { class: 'pt-bg' });
  const picker = h('input', { type: 'color', class: 'pt-native', tabindex: '-1', 'aria-hidden': 'true' });
  let editing = null;
  const swatches = PALETTE.map((c, i) => {
    const b = h('button', { type: 'button', class: 'pt-sw', style: { background: c }, 'aria-label': c });
    b.addEventListener('click', () => { fg = PALETTE[i]; updateColors(); });
    b.addEventListener('contextmenu', e => { e.preventDefault(); bg = PALETTE[i]; updateColors(); });
    b.addEventListener('dblclick', () => { editing = i; picker.value = PALETTE[i]; picker.click(); });
    return b;
  });
  picker.addEventListener('input', () => {
    if (editing == null) return;
    PALETTE[editing] = picker.value;
    swatches[editing].style.background = picker.value;
    fg = picker.value; updateColors();
  });
  const colorbox = h('div', { class: 'pt-colorbox' }, h('div', { class: 'pt-cur' }, bgBox, fgBox), h('div', { class: 'pt-pal' }, ...swatches), picker);
  function updateColors() { fgBox.style.background = fg; bgBox.style.background = bg; }

  // ---------- pixels ----------
  const rgb = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
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
  function shape(g, kind, x0, y0, x1, y1, outline, inside) {
    const pts = polygon(kind, x0, y0, x1, y1);
    if (fillMode !== 'outline') { g.fillStyle = fillMode === 'fill' ? outline : inside; fillPoly(g, pts); }
    if (fillMode !== 'fill') {
      g.fillStyle = outline;
      for (let i = 0; i < pts.length; i++) line(g, pts[i][0], pts[i][1], pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1], size.line, false);
    }
  }
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
    const img = undoStack.pop();
    if (!img) return;
    if (img.width !== W || img.height !== H) resize(img.width, img.height, false);
    ctx.putImageData(img, 0, 0);
  }

  // ---------- pointer ----------
  let stroke = null, airTimer = null;
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
  holder.addEventListener('contextmenu', e => e.preventDefault());
  holder.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    holder.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    const main = e.button === 2 ? bg : fg, other = e.button === 2 ? fg : bg;
    if (tool === 'picker') {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const p = ctx.getImageData(x, y, 1, 1).data;
      const hex = '#' + [p[0], p[1], p[2]].map(v => v.toString(16).padStart(2, '0')).join('');
      if (e.button === 2) bg = hex; else fg = hex;
      updateColors();
      setTool(prevTool);
      return;
    }
    pushUndo();
    drew = true;
    if (tool === 'fill') { if (x >= 0 && y >= 0 && x < W && y < H) flood(x, y, main); return; }
    stroke = { x0: x, y0: y, lx: x, ly: y, main, other, id: e.pointerId };
    ctx.fillStyle = tool === 'eraser' ? bg : main;
    if (tool === 'pencil') stamp(ctx, x, y, 1);
    else if (tool === 'brush') stamp(ctx, x, y, size.brush, true);
    else if (tool === 'eraser') stamp(ctx, x, y, size.eraser, false);
    else if (tool === 'airbrush') { spray(x, y, main); airTimer = setInterval(() => stroke && spray(stroke.lx, stroke.ly, main), 40); }
  });
  holder.addEventListener('pointermove', e => {
    const [x, y] = pos(e);
    coords.textContent = x >= 0 && y >= 0 && x < W && y < H ? `${x},${y}` : '';
    if (!stroke || e.pointerId !== stroke.id) return;
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
    }
    stroke.lx = x; stroke.ly = y;
  });
  const end = e => {
    if (!stroke || e.pointerId !== stroke.id) return;
    clearInterval(airTimer);
    const [x, y] = pos(e);
    octx.clearRect(0, 0, W, H);
    if (e.type === 'pointerup') {
      ctx.fillStyle = stroke.main;
      if (tool === 'line') line(ctx, stroke.x0, stroke.y0, x, y, size.line, false);
      else if (SHAPES.includes(tool)) shape(ctx, tool, stroke.x0, stroke.y0, x, y, stroke.main, stroke.other);
    }
    stroke = null;
  };
  holder.addEventListener('pointerup', end);
  holder.addEventListener('pointercancel', end);
  holder.addEventListener('pointerleave', () => { if (!stroke) coords.textContent = ''; });

  // ---------- image operations ----------
  function resize(w, hgt, keep = true) {
    const old = keep ? ctx.getImageData(0, 0, Math.min(W, w), Math.min(H, hgt)) : null;
    W = w; H = hgt;
    canvas.width = overlay.width = W; canvas.height = overlay.height = H;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (old) ctx.putImageData(old, 0, 0);
  }
  function transform(fn) {
    pushUndo();
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    tmp.getContext('2d').drawImage(canvas, 0, 0);
    ctx.save(); fn(ctx); ctx.drawImage(tmp, 0, 0); ctx.restore();
  }
  function invert() {
    pushUndo();
    const img = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = 255 - img.data[i]; img.data[i + 1] = 255 - img.data[i + 1]; img.data[i + 2] = 255 - img.data[i + 2]; }
    ctx.putImageData(img, 0, 0);
  }
  function clear() { pushUndo(); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
  function attributes() {
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
  const IMG = [{ label: 'Bitmap Files (*.bmp)', exts: ['.bmp'] }, { label: 'Pictures (*.png;*.jpg;*.gif)', exts: ['.png', '.jpg', '.jpeg', '.gif'] }, { label: 'All Files (*.*)', exts: [] }];
  const setName = (n, p) => { name = n; path = p || null; win.setTitle(name + ' - Paint'); };
  function loadImage(src, n, p, revoke) {
    const img = new Image();
    img.onload = () => {
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
    if (!(await confirmSave())) return;
    const r = await openFile({ filters: IMG, parent: win, accept: 'image/*' });
    if (!r) return;
    if (r.file) loadImage(URL.createObjectURL(r.file), r.file.name, null, true);
    else if (r.node.data) loadImage(r.node.data, r.node.name, r.node.user ? r.path : null);
    else msgbox({ title: 'Paint', icon: 'error', parent: win, text: `Paint cannot read ${r.name}.\nThis is not a valid bitmap file, or its format is not currently supported.` });
  }
  const modified = () => edits !== savedAt;
  async function confirmSave() {
    if (!modified()) return true;
    const b = await msgbox({ title: 'Paint', icon: 'warn', parent: win, buttons: ['&Yes', '&No', 'Cancel'], text: `Save changes to ${name}?` });
    if (b === 'Yes') return save();
    return b === 'No';
  }
  const bar = menubar([
    { label: '&File', items: () => [
      { label: '&New', key: 'Ctrl+N', action: async () => {
        if (!(await confirmSave())) return;
        resize(480, 320, false); undoStack.length = 0; edits = savedAt = 0; drew = false; setName('untitled');
      } },
      { label: '&Open...', key: 'Ctrl+O', action: openDialog },
      { label: '&Save', key: 'Ctrl+S', action: () => save() },
      { label: 'Save &As...', action: () => save(true) },
      ...(sendEnabled() ? ['-', { label: 'S&end to blankiekun...', icon: 'i-mail', action: sendDrawing }] : []),
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Edit', items: () => [
      { label: '&Undo', key: 'Ctrl+Z', disabled: !undoStack.length, action: undo },
      '-',
      { label: 'C&lear Image', key: 'Ctrl+Shft+N', action: clear },
    ] },
    { label: '&View', items: () => [
      { label: '&Tool Box', key: 'Ctrl+T', checked: !toolbox.hidden, action: () => { toolbox.hidden = !toolbox.hidden; } },
      { label: '&Color Box', key: 'Ctrl+A', checked: !colorbox.hidden, action: () => { colorbox.hidden = !colorbox.hidden; } },
      { label: '&Status Bar', checked: !status.hidden, action: () => { status.hidden = !status.hidden; } },
    ] },
    { label: '&Image', items: () => [
      { label: '&Flip/Rotate...', submenu: [
        { label: 'Flip &horizontal', action: () => transform(g => { g.translate(W, 0); g.scale(-1, 1); }) },
        { label: 'Flip &vertical', action: () => transform(g => { g.translate(0, H); g.scale(1, -1); }) },
        { label: 'Rotate by &180°', action: () => transform(g => { g.translate(W, H); g.rotate(Math.PI); }) },
      ] },
      { label: '&Invert Colors', key: 'Ctrl+I', action: invert },
      { label: '&Attributes...', key: 'Ctrl+E', action: attributes },
      { label: '&Clear Image', action: clear },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') },
      '-',
      { label: '&About Paint', action: () => about('Paint', 'i-paint', win) },
    ] },
  ]);

  function sendDrawing() {
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

  // Pictures are kept on the pretend disk as PNG data, whatever the name says.
  async function save(as) {
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

  const root = h('div', { class: 'pt' }, bar, h('div', { class: 'pt-main' }, toolbox, area), colorbox, status);
  if (sendEnabled()) {
    const btn = sendButton('Send to blankiekun...', sendDrawing);
    colorbox.append(btn);
    tipLater(btn, root, 'paint', 'Send your drawing to blankiekun with this button.', () => drew);
  }
  root.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); undo(); }
    else if (k === 's') { e.preventDefault(); save(); }
    else if (k === 'i') { e.preventDefault(); invert(); }
  });

  const win = createWindow({
    app: 'paint', title: 'untitled - Paint', icon: 'i-paint', body: root,
    width: 640, height: 500, minW: 260, minH: 240, route: 'paint', onClose: confirmSave,
  });
  if (arg && arg.data) loadImage(arg.data, arg.name, arg.path);
  setTool('pencil');
  updateColors();
  return win;
}

export default { id: 'paint', title: 'Paint', icon: 'i-paint', open };
