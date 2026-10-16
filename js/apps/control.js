// Control Panel applets: Mouse, Regional Settings, Add/Remove Programs and Sounds.
// Each is a tabbed properties dialog; settings are saved in this browser on OK or Apply.
// Also exports helpers the shell uses: dblclickMs(), formatTime(), formatDate() and playSound().

import { h, icon, store, clamp, wait } from '../util.js';
import { createWindow, launch, appInfo } from '../wm.js';
import { msgbox, inputbox } from '../dialogs.js';

// ---------- shared pieces ----------

// Pixel art from rows of characters: each character is a palette key, '.' or unknown is clear.
function pix(rows, pal, scale = 1, extra = '') {
  const w = Math.max(...rows.map(r => r.length));
  const paths = {};
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length;) {
      let e = x;
      while (e < r.length && r[e] === r[x]) e++;
      const f = pal[r[x]];
      if (f) (paths[f] ||= []).push(`M${x} ${y}h${e - x}v1H${x}z`);
      x = e;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${rows.length}" width="${w * scale}" height="${rows.length * scale}" shape-rendering="crispEdges" aria-hidden="true">${extra}` +
    Object.entries(paths).map(([f, d]) => `<path fill="${f}" d="${d.join('')}"/>`).join('') + '</svg>';
}

function tabbed(names, panels) {
  const btns = names.map((t, i) => {
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === 0), tabindex: i === 0 ? '0' : '-1' }, t);
    b.addEventListener('click', () => show(i));
    return b;
  });
  function show(i) {
    btns.forEach((x, j) => { x.setAttribute('aria-selected', String(j === i)); x.tabIndex = j === i ? 0 : -1; });
    panels.forEach((p, j) => { p.hidden = j !== i; });
  }
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, btns);
  tabs.addEventListener('keydown', e => {
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (d) { e.preventDefault(); const n = (i + d + btns.length) % btns.length; show(n); btns[n].focus(); }
  });
  panels.forEach((p, i) => { p.hidden = i !== 0; });
  const el = h('div', { class: 'dp-tabs' }, tabs, h('div', { class: 'tabpanel' }, ...panels));
  // Ctrl+Tab moves between tabs, as in Windows.
  el.next = d => { const i = btns.findIndex(b => b.getAttribute('aria-selected') === 'true'); show((i + d + btns.length) % btns.length); };
  return el;
}

// A properties dialog: tabs over OK / Cancel / Apply. apply() saves the draft;
// call dirty() whenever the draft changes so Apply lights up.
function propsDialog({ app, title, icon: ic, names, panels, apply, cls = '', onClosed }) {
  const applyBtn = h('button', { class: 'btn', type: 'button', disabled: true, html: '<u>A</u>pply', onclick: () => commit() });
  let busy = false;
  async function commit() {
    if (busy) return;
    busy = true;
    try { await apply(); } finally { busy = false; }
    applyBtn.disabled = true;
  }
  const ok = h('button', { class: 'btn default', type: 'button', onclick: async () => { if (!applyBtn.disabled) await commit(); win.close(); } }, 'OK');
  const tabs = tabbed(names, panels);
  const body = h('div', { class: 'dlg cp ' + cls }, tabs,
    h('div', { class: 'btns right' }, ok, h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel'), applyBtn));
  body.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); win.close(); }
    else if (e.key === 'Enter' && !e.target.closest('button, select, textarea, a')) { e.preventDefault(); ok.click(); }
    else if (e.key === 'Tab' && e.ctrlKey) { e.preventDefault(); tabs.next(e.shiftKey ? -1 : 1); }
    else if (e.altKey && e.key.toLowerCase() === 'a' && !applyBtn.disabled) { e.preventDefault(); commit(); }
  });
  const win = createWindow({ app, title, icon: ic, body, dialog: true, taskbar: true, resizable: false, width: 'auto', route: app, help: () => launch('help'), onClosed });
  return { win, dirty: () => { applyBtn.disabled = false; } };
}

// A keyboard-friendly single-select list. add(el, value) appends a row.
function listbox(label, cls = '') {
  const el = h('div', { class: 'listbox ' + cls, tabindex: '0', role: 'listbox', 'aria-label': label });
  const rows = [];
  let cur = -1;
  const api = {
    el, onpick: null,
    get value() { return cur < 0 ? null : rows[cur].value; },
    get row() { return cur < 0 ? null : rows[cur].el; },
    add(row, value) {
      row.classList.add('opt');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', 'false');
      const i = rows.length;
      rows.push({ el: row, value });
      row.addEventListener('click', () => api.pick(i));
      el.append(row);
      return row;
    },
    pick(i, quiet) {
      if (i < 0 || i >= rows.length) return;
      cur = i;
      rows.forEach((r, j) => { r.el.classList.toggle('sel', j === i); r.el.setAttribute('aria-selected', String(j === i)); });
      rows[i].el.scrollIntoView({ block: 'nearest' });
      if (!quiet && api.onpick) api.onpick(rows[i].value, rows[i].el);
    },
    clear() { rows.length = 0; cur = -1; el.replaceChildren(); },
  };
  el.addEventListener('keydown', e => {
    const n = { ArrowDown: cur + 1, ArrowUp: cur - 1, Home: 0, End: rows.length - 1, PageDown: cur + 5, PageUp: cur - 5 }[e.key];
    if (n == null) return;
    e.preventDefault();
    api.pick(clamp(n, 0, rows.length - 1));
  });
  return api;
}

// Win95's "Slow ---|--- Fast" trackbar.
function slider({ id, min = 0, max = 10, value, lo, hi, label, oninput }) {
  const ticks = h('div', { class: 'cp-ticks' });
  ticks.style.setProperty('--n', max - min);
  const input = h('input', { type: 'range', id, min: String(min), max: String(max), step: '1', value: String(value), 'aria-label': label });
  input.addEventListener('input', () => oninput(+input.value));
  return h('div', { class: 'cp-slider' }, h('span', null, lo), h('div', { class: 'cp-track' }, input, ticks), h('span', null, hi));
}

const group = (legend, ...kids) => h('fieldset', { class: 'group' }, h('legend', null, legend), ...kids);
const row = (label, control) => h('label', { class: 'cp-row' }, h('span', { html: label }), control);

// A small busy dialog with a Win95 progress bar. Returns { set(fraction, text), close() }.
function progress(parent, title, text) {
  const bar = h('i');
  const msg = h('p', null, text);
  const body = h('div', { class: 'dlg cp-busy' }, msg, h('div', { class: 'cp-prog' }, bar));
  const win = createWindow({ title, body, dialog: true, resizable: false, width: 'auto', parent, taskbar: false });
  win.el.querySelector('.tbtn.x').disabled = true;
  return {
    win,
    set(f, t) { bar.style.width = Math.round(clamp(f, 0, 1) * 100) + '%'; if (t) msg.textContent = t; },
    close() { win.close(true); },
  };
}

// ---------- Mouse ----------

const MKEY = 'w95.mouse';
const MDEF = { dblclick: 500, trails: 0, left: false, speed: 5, scheme: 'Windows Standard' };
const mouseSettings = () => ({ ...MDEF, ...(store.get(MKEY, null) || {}) });

// The double-click time in milliseconds (Win95's default is 500).
export function dblclickMs() { return mouseSettings().dblclick; }

// Slider position 0..10 maps to 900..200 ms.
const msToPos = ms => clamp(Math.round((900 - ms) / 70), 0, 10);
const posToMs = p => 900 - p * 70;

// The classic black-outlined arrow, 12×19.
const ARROW = pix([
  'k', 'kk', 'kwk', 'kwwk', 'kwwwk', 'kwwwwk', 'kwwwwwk', 'kwwwwwwk', 'kwwwwwwwk', 'kwwwwwwwwk', 'kwwwwwwwwwk',
  'kwwwwwwkkkkk', 'kwwwkwwk', 'kwwk.kwwk', 'kwk..kwwk', 'kk....kwwk', 'k.....kwwk', '.......kwwk', '.......kkk',
], { k: '#000', w: '#fff' });

// Pointer trails: ghost arrows that lag behind the real pointer, for mice only.
let trail = null;
function setTrails(n) {
  if (trail) { trail.stop(); trail = null; }
  if (!n || !matchMedia('(any-pointer: fine)').matches) return;
  const url = `url("data:image/svg+xml,${encodeURIComponent(ARROW)}")`;
  const ghosts = Array.from({ length: n }, () => h('div', { class: 'cp-ghost', 'aria-hidden': 'true', hidden: true, style: { backgroundImage: url } }));
  document.body.append(...ghosts);
  const hist = [];
  const STEP = 3;            // frames between ghosts
  let pos = null, raf = 0;
  function tick() {
    raf = 0;
    if (!pos) return;
    hist.unshift(pos);
    hist.length = Math.min(hist.length, n * STEP + 1);
    let moving = false;
    ghosts.forEach((g, i) => {
      const p = hist[(i + 1) * STEP];
      const show = p && (p[0] !== pos[0] || p[1] !== pos[1]);
      g.hidden = !show;
      if (show) { g.style.transform = `translate(${p[0]}px, ${p[1]}px)`; moving = true; }
    });
    if (moving || hist.length < n * STEP + 1) raf = requestAnimationFrame(tick);
  }
  const move = e => {
    if (e.pointerType !== 'mouse') return;
    pos = [e.clientX, e.clientY];
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const leave = e => { if (!e.relatedTarget) { pos = null; hist.length = 0; ghosts.forEach(g => { g.hidden = true; }); } };
  addEventListener('pointermove', move, { passive: true });
  document.addEventListener('mouseout', leave);
  trail = { stop() { removeEventListener('pointermove', move); document.removeEventListener('mouseout', leave); cancelAnimationFrame(raf); ghosts.forEach(g => g.remove()); } };
}
setTrails(mouseSettings().trails);

function mouseArt(left) {
  const P = left ? 'R' : 'L';
  const rows = [
    '..........k..........', '..........k..........', '..........k..........', '..........k..........',
    '......kkkkkkkkk......', '....kkLLLLkRRRRkk....', '...kLLLLLLkRRRRRRk...',
    '..kLLLLLLLkRRRRRRRk..', '..kLLLLLLLkRRRRRRRk..',
    ...Array(4).fill('.kLLLLLLLLkRRRRRRRRk.'),
    '.kkkkkkkkkkkkkkkkkkk.',
    ...Array(12).fill('.kwgggggggggggggggdk.'),
    '..kwgggggggggggggdk..', '...kwgggggggggggdk...', '....kkdddddddddkk....', '......kkkkkkkkk......',
  ];
  return pix(rows, { k: '#000', w: '#fff', g: '#c0c0c0', d: '#808080', L: P === 'L' ? '#000080' : '#c0c0c0', R: P === 'R' ? '#000080' : '#c0c0c0' }, 2);
}

const JACK_BOX = [
  '..krrrrrrrrrrrrrrrrrrk..', '..krrrrrrrrrrrrrrrrrrk..', '..krrrrrrrryyrrrrrrrrk..', '..krrrrrrryyyyrrrrrrrk..',
  '..krrrrrryyyyyyrrrrrrk.k', '..krrrrryyyyyyyyrrrrrkkk', '..krrrrrryyyyyyrrrrrrk.k', '..krrrrrrryyyyrrrrrrrk..',
  '..krrrrrrrryyrrrrrrrrk..', '..krrrrrrrrrrrrrrrrrrk..', '..krrrrrrrrrrrrrrrrrrk..', '..kkkkkkkkkkkkkkkkkkkk..',
];
const JACK_CLOSED = [...Array(12).fill(''), '..kkkkkkkkkkkkkkkkkkkk..', '..kmmmmmmmmmmmmmmmmmmk..', '..kkkkkkkkkkkkkkkkkkkk..', ...JACK_BOX];
const JACK_OPEN = [
  '..........bb', '.........bbbb', 'kkk.....bbbbbb', 'kmk....bbbbbbbb', 'kmk....kwwwwwwk', 'kmk...kwwkwwkwwk',
  'kmk...kwwwwrwwwk', 'kmk...kwwkkkkwwk', 'kmk....kwwwwwwk', 'kmk.....kkkkkk', 'kmk......yyyy', 'kmk.......kk',
  'kmk......k..k', 'kmk.......kk', 'kmkkkkkkkkkkkkkkkkkkkk..', ...JACK_BOX,
];
const JACK_PAL = { k: '#000', r: '#ff0000', y: '#ffff00', m: '#800000', b: '#0000ff', w: '#fff' };

const POINTERS = [
  ['Normal Select', 'default', '↖'], ['Help Select', 'help', '↖?'], ['Working In Background', 'progress', '↖⌛'],
  ['Busy', 'wait', '⌛'], ['Precision Select', 'crosshair', '+'], ['Text Select', 'text', 'I'],
  ['Handwriting', 'default', '✎'], ['Unavailable', 'not-allowed', '⊘'], ['Vertical Resize', 'ns-resize', '↕'],
  ['Horizontal Resize', 'ew-resize', '↔'], ['Diagonal Resize 1', 'nwse-resize', '⤡'], ['Diagonal Resize 2', 'nesw-resize', '⤢'],
  ['Move', 'move', '✥'],
];
const POINTER_SCHEMES = ['(None)', 'Windows Standard', 'Animated hourglasses'];

function mouse() {
  const draft = mouseSettings();
  let p;
  const dirty = () => p.dirty();

  // Buttons
  const pic = h('div', { class: 'cp-mousepic', html: mouseArt(draft.left) });
  const lbl = h('div', { class: 'cp-btnlabels' });
  function labels() {
    const [a, b] = draft.left ? ['Right', 'Left'] : ['Left', 'Right'];
    lbl.innerHTML = `<p><b>${a} Button:</b><br>- Normal Select<br>- Normal Drag</p><p><b>${b} Button:</b><br>- Context Menu<br>- Special Drag</p>`;
    pic.innerHTML = mouseArt(draft.left);
  }
  labels();
  const hand = left => h('label', null, h('input', { type: 'radio', name: 'cp-hand', checked: draft.left === left, onchange: () => { draft.left = left; labels(); dirty(); } }), left ? 'L' : 'R', h('u', null, left ? 'e' : 'i'), left ? 'ft-handed' : 'ght-handed');
  const jack = h('button', { type: 'button', class: 'cp-jack', 'aria-label': 'Test area: double-click here', html: pix(JACK_CLOSED, JACK_PAL, 2) });
  let lastClick = 0, popped = false;
  jack.addEventListener('click', e => {
    const gap = e.timeStamp - lastClick;
    lastClick = e.timeStamp;
    if (gap > draft.dblclick) return;
    lastClick = 0;
    popped = !popped;
    jack.innerHTML = pix(popped ? JACK_OPEN : JACK_CLOSED, JACK_PAL, 2);
    jack.dataset.open = String(popped);
    jack.title = `Double-click: ${Math.round(gap)} ms`;
  });
  const buttons = h('div', { class: 'cp-panel' },
    group('Button configuration', h('div', { class: 'cp-mouse' }, h('div', { class: 'cp-radios' }, hand(false), hand(true)), pic, lbl)),
    group('Double-click speed', h('div', { class: 'cp-dbl' },
      slider({ id: 'cp-dbl', value: msToPos(draft.dblclick), lo: 'Slow', hi: 'Fast', label: 'Double-click speed', oninput: v => { draft.dblclick = posToMs(v); dirty(); } }),
      h('div', { class: 'cp-test' }, h('span', null, h('u', null, 'T'), 'est area:'), jack))));

  // Pointers
  const schemeSel = h('select', { class: 'field', id: 'cp-pscheme' });
  const schemes = [...new Set([...POINTER_SCHEMES, draft.scheme])];
  schemeSel.append(...schemes.map(s => h('option', { value: s, selected: s === draft.scheme }, s)));
  const preview = h('div', { class: 'cp-ppreview', 'aria-hidden': 'true' });
  const plist = listbox('Pointers', 'cp-plist');
  function glyphs() {
    preview.dataset.anim = plist.el.dataset.anim = String(draft.scheme === 'Animated hourglasses');
  }
  POINTERS.forEach(([name, cur, g]) => plist.add(h('div', { style: { cursor: cur } }, h('span', null, name), h('b', { class: /⌛/.test(g) ? 'hg' : '' }, g)), [name, cur, g]));
  plist.onpick = ([, cur, g]) => { preview.replaceChildren(h('b', { class: /⌛/.test(g) ? 'hg' : '' }, g)); preview.style.cursor = cur; };
  plist.pick(0);
  glyphs();
  schemeSel.addEventListener('change', () => { draft.scheme = schemeSel.value; glyphs(); dirty(); });
  const pointers = h('div', { class: 'cp-panel', hidden: true },
    group('Schemes', h('div', { class: 'cp-schemes' }, h('div', { class: 'cp-line' }, schemeSel, preview),
      h('div', { class: 'cp-line right' },
        h('button', { class: 'btn', type: 'button', html: 'Sa<u>v</u>e As...', onclick: async () => {
          const n = await inputbox({ title: 'Save Scheme', label: 'Save this cursor scheme as:', parent: p.win });
          if (!n || !n.trim()) return;
          const name = n.trim();
          if (![...schemeSel.options].some(o => o.value === name)) schemeSel.append(h('option', { value: name }, name));
          schemeSel.value = draft.scheme = name; glyphs(); dirty();
        } }),
        h('button', { class: 'btn', type: 'button', html: '<u>D</u>elete', onclick: () => {
          if (POINTER_SCHEMES.includes(schemeSel.value)) { msgbox({ title: 'Mouse Properties', text: 'You cannot delete a scheme that came with blankiekun 95.', icon: 'warn', parent: p.win }); return; }
          schemeSel.selectedOptions[0].remove();
          schemeSel.value = draft.scheme = 'Windows Standard'; glyphs(); dirty();
        } })))),
    plist.el,
    h('div', { class: 'cp-line right' },
      h('button', { class: 'btn', type: 'button', html: 'Use De<u>f</u>ault', onclick: () => { schemeSel.value = draft.scheme = 'Windows Standard'; glyphs(); dirty(); } }),
      h('button', { class: 'btn', type: 'button', html: '<u>B</u>rowse...', onclick: () => msgbox({ title: 'Browse', text: 'There are no other pointers on this computer. The arrow is doing its best.', icon: 'info', parent: p.win }) })));

  // Motion
  const trailBox = h('input', { type: 'checkbox', id: 'cp-trails', checked: draft.trails > 0 });
  const trailSlider = slider({ id: 'cp-tlen', min: 2, max: 7, value: draft.trails || 4, lo: 'Short', hi: 'Long', label: 'Pointer trail length', oninput: v => { draft.trails = v; dirty(); } });
  const trailInput = trailSlider.querySelector('input');
  const syncTrail = () => { trailInput.disabled = !trailBox.checked; trailSlider.classList.toggle('off', !trailBox.checked); };
  trailBox.addEventListener('change', () => { draft.trails = trailBox.checked ? +trailInput.value : 0; syncTrail(); dirty(); });
  syncTrail();
  const fine = matchMedia('(any-pointer: fine)').matches;
  const motion = h('div', { class: 'cp-panel', hidden: true },
    group('Pointer speed', slider({ id: 'cp-speed', value: draft.speed, lo: 'Slow', hi: 'Fast', label: 'Pointer speed', oninput: v => { draft.speed = v; dirty(); } })),
    group('Pointer trail',
      h('label', { class: 'cp-check' }, trailBox, h('span', null, 'Show pointer ', h('u', null, 't'), 'rails')),
      trailSlider,
      fine ? null : h('p', { class: 'cp-note' }, 'Pointer trails appear when you use a mouse.')));

  p = propsDialog({
    app: 'mouse', title: 'Mouse Properties', icon: 'i-mouse', cls: 'cp-mouseprops',
    names: ['Buttons', 'Pointers', 'Motion'], panels: [buttons, pointers, motion],
    apply() { store.set(MKEY, draft); setTrails(draft.trails); },
  });
  return p.win;
}

// ---------- Regional Settings ----------

const RKEY = 'w95.regional';
// [tag, name, region on the map, currency]
const LOCALES = [
  ['en-US', 'English (United States)', 'n', 'USD'], ['en-GB', 'English (British)', 'e', 'GBP'], ['en-AU', 'English (Australian)', 'o', 'AUD'],
  ['en-CA', 'English (Canadian)', 'n', 'CAD'], ['fr-FR', 'French (Standard)', 'e', 'EUR'], ['de-DE', 'German (Standard)', 'e', 'EUR'],
  ['it-IT', 'Italian (Standard)', 'e', 'EUR'], ['es-ES', 'Spanish (Modern Sort)', 'e', 'EUR'], ['es-MX', 'Spanish (Mexican)', 'n', 'MXN'],
  ['pt-BR', 'Portuguese (Brazilian)', 's', 'BRL'], ['nl-NL', 'Dutch (Standard)', 'e', 'EUR'], ['sv-SE', 'Swedish', 'e', 'SEK'],
  ['pl-PL', 'Polish', 'e', 'PLN'], ['ru-RU', 'Russian', 'a', 'RUB'], ['ja-JP', 'Japanese', 'a', 'JPY'],
  ['ko-KR', 'Korean', 'a', 'KRW'], ['zh-CN', 'Chinese (PRC)', 'a', 'CNY'], ['zh-TW', 'Chinese (Taiwan)', 'a', 'TWD'],
  ['af-ZA', 'Afrikaans', 'f', 'ZAR'],
];

// A pixel world map; letters are regions so the selected one can be lit up.
const WORLD = [
  '                                                ',
  '   nnnnnnnnn  nnn       eee  aaaaaaaaaaaaaa     ',
  '  nnnnnnnnnnnnnn      eeeeeaaaaaaaaaaaaaaaaaa   ',
  ' nnnnnnnnnnnnnn        eeeeaaaaaaaaaaaaaaaaaaa  ',
  '   nnnnnnnnnnn        eeeeeaaaaaaaaaaaaaaaaa    ',
  '    nnnnnnnnnn       eeeeeeaaaaaaaaaaaaaaaa a   ',
  '     nnnnnnnn        ee eeaaaaaaaaaaaaaaaa  a   ',
  '      nnnnnn        fffff aaaaaaaaaaaaaa        ',
  '       nnnn        fffffffffaaa aaaaaaa a       ',
  '        nnn        ffffffffff aa  aaa           ',
  '          nn        ffffffff   a   aa a         ',
  '           sss        ffffff        a  aa       ',
  '           sssss      fffff          aa a       ',
  '           ssssss      ffff            oo       ',
  '            sssss      fff           oooooo     ',
  '             sss       ff           ooooooo     ',
  '             ss                     ooooooo     ',
  '             ss                      o  oo   o  ',
  '             s                              o   ',
  '                                                ',
];
function worldArt(region) {
  const pal = { n: '#008000', s: '#008000', e: '#008000', f: '#008000', a: '#008000', o: '#008000' };
  pal[region] = '#ffff00';
  return pix(WORLD, pal, 4, '<rect width="48" height="20" fill="#008080"/>');
}

const SPACES = /[\u00a0\u202f]/g;
// Turns Intl parts into a Win95-style picture string such as "M/d/yyyy" or "h:mm:ss tt".
function picture(parts, d, sep) {
  return parts.map(x => {
    const v = x.value.replace(SPACES, ' ');
    switch (x.type) {
      case 'year': return v.length > 2 ? 'yyyy' : 'yy';
      case 'month': return /^\d+$/.test(v) ? (v.length > 1 ? 'MM' : 'M') : /\d/.test(v) ? v.replace(/\d+/, 'M') : 'MMMM';
      case 'day': return v.length > 1 ? 'dd' : 'd';
      case 'weekday': return 'dddd';
      case 'hour': return (d.hour12 ? 'h' : 'H').repeat(v.length > 1 ? 2 : 1);
      case 'minute': return 'mm';
      case 'second': return 'ss';
      case 'dayPeriod': return 'tt';
      case 'literal': return v === sep ? ':' : /[A-Za-z']/.test(v) ? `'${v.replace(/'/g, '')}'` : v;
      default: return '';
    }
  }).join('');
}

function localeDefaults(tag) {
  const L = LOCALES.find(l => l[0] === tag) || LOCALES[0];
  const loc = L[0];
  const d = { locale: loc };
  const t = new Date(2026, 2, 5, 9, 4, 5);
  const hp = new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' });
  d.hour12 = !!hp.resolvedOptions().hour12;
  const tparts = new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).formatToParts(t);
  const hi = tparts.findIndex(x => x.type === 'hour');
  d.timeSep = (tparts[hi + 1] && tparts[hi + 1].type === 'literal') ? tparts[hi + 1].value : ':';
  d.timeStyle = picture(tparts, d, d.timeSep);
  const period = hour => (new Intl.DateTimeFormat(loc, { hour: 'numeric', hour12: true }).formatToParts(new Date(2026, 0, 1, hour)).find(x => x.type === 'dayPeriod') || {}).value || '';
  d.am = period(9) || 'AM';
  d.pm = period(21) || 'PM';
  d.shortDate = picture(new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(t), d);
  d.longDate = picture(new Intl.DateTimeFormat(loc, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).formatToParts(t), d);
  const np = new Intl.NumberFormat(loc).formatToParts(-1234567.891);
  const part = (ps, type, fb) => ((ps.find(x => x.type === type) || {}).value ?? fb).replace(SPACES, ' ');
  Object.assign(d, { decimal: part(np, 'decimal', '.'), group: part(np, 'group', ','), groupSize: 3, digits: 2, minus: part(np, 'minusSign', '-'), negFormat: 0, leadingZero: true });
  d.measure = ['en-US'].includes(loc) ? 'U.S.' : 'Metric';
  d.listSep = d.decimal === ',' ? ';' : ',';
  const cf = new Intl.NumberFormat(loc, { style: 'currency', currency: L[3] });
  const cp = cf.formatToParts(1234.5);
  const ci = cp.findIndex(x => x.type === 'currency'), ni = cp.findIndex(x => x.type === 'integer');
  const spaced = cp.some(x => x.type === 'literal' && /\s/.test(x.value.replace(SPACES, ' ')));
  d.currency = part(cp, 'currency', '$');
  d.curPos = (ci < ni ? 0 : 1) + (spaced ? 2 : 0);
  d.curNeg = ci < ni ? 0 : 3;
  d.curDigits = cf.resolvedOptions().maximumFractionDigits;
  d.curDecimal = part(cp, 'decimal', d.decimal);
  d.curGroup = part(cp, 'group', d.group);
  return d;
}

let regionalCache = null;
// The saved regional settings, filled in from the browser's locale data.
export function regionalSettings() {
  if (!regionalCache) {
    const saved = store.get(RKEY, null) || {};
    regionalCache = { ...localeDefaults(saved.locale || 'en-US'), ...saved };
  }
  return { ...regionalCache };
}

const TOKENS = /'([^']*)'|dddd|ddd|dd|d|MMMM|MMM|MM|M|yyyy|yy|HH|H|hh|h|mm|m|ss|s|tt|:/g;
function fmt(pattern, t, s) {
  const pad = n => String(n).padStart(2, '0');
  const name = o => new Intl.DateTimeFormat(s.locale, o).format(t);
  const h12 = t.getHours() % 12 || 12;
  return pattern.replace(TOKENS, (tok, lit) => {
    if (lit != null) return lit;
    switch (tok) {
      case 'dddd': return name({ weekday: 'long' });
      case 'ddd': return name({ weekday: 'short' });
      case 'dd': return pad(t.getDate());
      case 'd': return String(t.getDate());
      case 'MMMM': return name({ month: 'long' });
      case 'MMM': return name({ month: 'short' });
      case 'MM': return pad(t.getMonth() + 1);
      case 'M': return String(t.getMonth() + 1);
      case 'yyyy': return String(t.getFullYear());
      case 'yy': return pad(t.getFullYear() % 100);
      case 'HH': return pad(t.getHours());
      case 'H': return String(t.getHours());
      case 'hh': return pad(h12);
      case 'h': return String(h12);
      case 'mm': return pad(t.getMinutes());
      case 'm': return String(t.getMinutes());
      case 'ss': return pad(t.getSeconds());
      case 's': return String(t.getSeconds());
      case 'tt': return t.getHours() < 12 ? s.am : s.pm;
      case ':': return s.timeSep;
    }
    return tok;
  }).trim();
}

// The time in the chosen style. Without seconds it is what the taskbar clock shows ("3:04 PM").
export function formatTime(date = new Date(), seconds = false, s = regionalSettings()) {
  const style = seconds ? s.timeStyle : s.timeStyle.replace(/:ss?/, '');
  return fmt(style, date, s);
}

// The short date ("3/5/2026"), or the long date ("Thursday, March 5, 2026").
export function formatDate(date = new Date(), long = false, s = regionalSettings()) {
  return fmt(long ? s.longDate : s.shortDate, date, s);
}

const NEG_FORMATS = ['-1.1', '- 1.1', '(1.1)', '1.1-', '1.1 -'];
const CUR_POS = ['¤1.1', '1.1¤', '¤ 1.1', '1.1 ¤'];
const CUR_NEG = ['-¤1.1', '(¤1.1)', '¤-1.1', '-1.1¤', '-1.1 ¤', '-¤ 1.1', '(1.1¤)'];

function digits(n, places, dec, grp, size, lead) {
  const [i, f] = Math.abs(n).toFixed(places).split('.');
  let int = size > 0 ? i.replace(new RegExp(`\\B(?=(\\d{${size}})+(?!\\d))`, 'g'), grp) : i;
  if (!lead && int === '0' && f) int = '';
  return int + (f ? dec + f : '');
}
function fmtNumber(n, s) {
  const b = digits(n, s.digits, s.decimal, s.group, s.groupSize, s.leadingZero);
  return n < 0 ? NEG_FORMATS[s.negFormat].replace('-', s.minus).replace('1.1', b) : b;
}
function fmtCurrency(n, s) {
  const b = digits(n, s.curDigits, s.curDecimal, s.curGroup, s.groupSize, true);
  const pat = n < 0 ? CUR_NEG[s.curNeg] : CUR_POS[s.curPos];
  return pat.replace('-', s.minus).replace('¤', s.currency).replace('1.1', b);
}

function regional() {
  let draft = regionalSettings();
  let p;
  const syncs = [];
  const refresh = () => syncs.forEach(f => f());
  const change = () => { refresh(); p.dirty(); };

  // A text box bound to draft[key].
  const text = (key, max = 4) => {
    const el = h('input', { class: 'field cp-short', maxlength: String(max), autocomplete: 'off', spellcheck: false });
    el.addEventListener('input', () => { draft[key] = el.value; change(); });
    syncs.push(() => { if (document.activeElement !== el) el.value = draft[key]; });
    return el;
  };
  // A dropdown bound to draft[key]; options is a list or a function giving [value, label] pairs.
  const choice = (key, options, parse = v => v) => {
    const el = h('select', { class: 'field' });
    el.addEventListener('change', () => { draft[key] = parse(el.value); change(); });
    syncs.push(() => {
      const opts = (typeof options === 'function' ? options() : options).map(o => Array.isArray(o) ? o : [o, String(o)]);
      if (!opts.some(o => String(o[0]) === String(draft[key]))) opts.unshift([draft[key], String(draft[key])]);
      el.replaceChildren(...opts.map(([v, l]) => h('option', { value: String(v) }, l)));
      el.value = String(draft[key]);
    });
    return el;
  };
  const sample = fn => {
    const el = h('output', { class: 'field cp-sample' });
    syncs.push(() => { el.textContent = fn(); });
    return el;
  };
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  // Regional Settings
  const map = h('div', { class: 'cp-map' });
  const locSel = h('select', { class: 'field', id: 'cp-locale', 'aria-label': 'Locale' }, ...LOCALES.map(([v, n]) => h('option', { value: v }, n)));
  locSel.addEventListener('change', () => { draft = { ...localeDefaults(locSel.value) }; change(); });
  syncs.push(() => { locSel.value = draft.locale; map.innerHTML = worldArt((LOCALES.find(l => l[0] === draft.locale) || LOCALES[0])[2]); });
  const regionPanel = h('div', { class: 'cp-panel' },
    h('p', { class: 'cp-note' }, 'Many programs support international settings for numbers, currencies, times, and dates. Setting the regional settings will change the way these programs display and sort numbers, currencies, times and dates.'),
    map, locSel);

  // Number
  const numPanel = h('div', { class: 'cp-panel', hidden: true },
    group('Appearance samples', h('div', { class: 'cp-form' },
      h('span', null, 'Positive:'), sample(() => fmtNumber(123456789, draft)),
      h('span', null, 'Negative:'), sample(() => fmtNumber(-123456789, draft)))),
    h('div', { class: 'cp-form' },
      row('<u>D</u>ecimal symbol:', text('decimal', 3)),
      row('No. of digits after decimal:', choice('digits', range(0, 9), Number)),
      row('Digit <u>g</u>rouping symbol:', text('group', 3)),
      row('No. of digits in group:', choice('groupSize', range(0, 9), Number)),
      row('Negative sign symbol:', text('minus', 3)),
      row('Negative number format:', choice('negFormat', () => NEG_FORMATS.map((f, i) => [i, f.replace('-', draft.minus)]), Number)),
      row('Display leading zeroes:', choice('leadingZero', () => [[true, '0' + draft.decimal + '7'], [false, draft.decimal + '7']], v => v === 'true')),
      row('<u>M</u>easurement system:', choice('measure', ['Metric', 'U.S.'])),
      row('<u>L</u>ist separator:', text('listSep', 3))));

  // Currency
  const curPanel = h('div', { class: 'cp-panel', hidden: true },
    group('Appearance samples', h('div', { class: 'cp-form' },
      h('span', null, 'Positive:'), sample(() => fmtCurrency(123456789, draft)),
      h('span', null, 'Negative:'), sample(() => fmtCurrency(-123456789, draft)))),
    h('div', { class: 'cp-form' },
      row('¤ = Universal currency symbol', h('span')),
      row('Currency <u>s</u>ymbol:', text('currency', 4)),
      row('<u>P</u>osition of currency symbol:', choice('curPos', () => CUR_POS.map((f, i) => [i, f.replace('¤', draft.currency)]), Number)),
      row('<u>N</u>egative number format:', choice('curNeg', () => CUR_NEG.map((f, i) => [i, f.replace('¤', draft.currency).replace('-', draft.minus)]), Number)),
      row('<u>D</u>ecimal symbol:', text('curDecimal', 3)),
      row('No. of digits after decimal:', choice('curDigits', range(0, 9), Number)),
      row('Digit <u>g</u>rouping symbol:', text('curGroup', 3))));

  // Time
  const timeStyles = () => [...new Set([draft.timeStyle, 'h:mm:ss tt', 'hh:mm:ss tt', 'H:mm:ss', 'HH:mm:ss', 'tt h:mm:ss'])];
  const timePanel = h('div', { class: 'cp-panel', hidden: true },
    group('Appearance', h('div', { class: 'cp-form' }, h('span', null, 'Time sample:'), sample(() => formatTime(new Date(), true, draft)))),
    h('div', { class: 'cp-form' },
      row('<u>T</u>ime style:', choice('timeStyle', timeStyles)),
      row('Time <u>s</u>eparator:', text('timeSep', 3)),
      row('<u>A</u>M symbol:', text('am', 9)),
      row('<u>P</u>M symbol:', text('pm', 9))));
  timePanel.addEventListener('change', () => { draft.hour12 = /h/.test(draft.timeStyle); });
  const clock = setInterval(() => { if (!timePanel.hidden) refresh(); }, 1000);

  // Date
  const dateSep = () => (draft.shortDate.replace(/'[^']*'/g, '').match(/[^dMy]+/) || ['/'])[0];
  const sepBox = h('input', { class: 'field cp-short', maxlength: '3', autocomplete: 'off', spellcheck: false });
  sepBox.addEventListener('input', () => {
    if (!sepBox.value) return;
    const old = dateSep();
    draft.shortDate = draft.shortDate.split(old).join(sepBox.value);
    change();
  });
  syncs.push(() => { if (document.activeElement !== sepBox) sepBox.value = dateSep(); });
  const shortStyles = () => [...new Set([draft.shortDate, 'M/d/yy', 'M/d/yyyy', 'MM/dd/yy', 'MM/dd/yyyy', 'dd/MM/yy', 'dd/MM/yyyy', 'dd.MM.yyyy', 'yyyy-MM-dd', 'yy/MM/dd'])];
  const longStyles = () => [...new Set([draft.longDate, 'dddd, MMMM d, yyyy', 'MMMM d, yyyy', 'dddd, d MMMM yyyy', 'd MMMM yyyy', 'dddd, MMMM dd, yyyy'])];
  const datePanel = h('div', { class: 'cp-panel', hidden: true },
    row('Calendar type:', h('select', { class: 'field', disabled: true }, h('option', null, 'Gregorian Calendar'))),
    group('Short date', h('div', { class: 'cp-form' },
      h('span', null, 'Short date sample:'), sample(() => formatDate(new Date(), false, draft)),
      row('S<u>h</u>ort date style:', choice('shortDate', shortStyles)),
      row('Date <u>s</u>eparator:', sepBox))),
    group('Long date', h('div', { class: 'cp-form' },
      h('span', null, 'Long date sample:'), sample(() => formatDate(new Date(), true, draft)),
      row('L<u>o</u>ng date style:', choice('longDate', longStyles)))));

  p = propsDialog({
    app: 'regional', title: 'Regional Settings Properties', icon: 'i-globe', cls: 'cp-regional',
    names: ['Regional Settings', 'Number', 'Currency', 'Time', 'Date'], panels: [regionPanel, numPanel, curPanel, timePanel, datePanel],
    apply() {
      draft.hour12 = /h/.test(draft.timeStyle);
      store.set(RKEY, draft);
      regionalCache = null;
      window.dispatchEvent(new CustomEvent('w95-regional'));
    },
    onClosed: () => clearInterval(clock),
  });
  refresh();
  return p.win;
}

// ---------- Add/Remove Programs ----------

const PROGRAMS = [
  ['ie', 'Internet Explorer'], ['cons', 'CONscripter'], ['minesweeper', 'Minesweeper'], ['solitaire', 'Solitaire'],
  ['freecell', 'FreeCell'], ['hearts', 'Hearts'], ['paint', 'Paint'], ['notepad', 'Notepad'], ['wordpad', 'WordPad'],
  ['calc', 'Calculator'], ['charmap', 'Character Map'], ['sndrec', 'Sound Recorder'], ['cdplayer', 'CD Player'], ['dos', 'MS-DOS Prompt'],
];
const AKEY = 'w95.addremove';
const COMPONENTS = [
  { name: 'Accessibility Options', icon: 'i-ctrl', size: 0.4, on: true, desc: 'Includes options to change keyboard, sound, display, and mouse behavior for people with mobility, hearing, or visual impairments.', parts: ['Accessibility Options'] },
  { name: 'Accessories', icon: 'i-programs', size: 4.2, on: 'partial', desc: 'Includes Windows accessories and enhancements for your computer.', parts: ['Calculator', 'Character Map', 'Desktop Wallpaper', 'Games', 'Notepad', 'Paint', 'Screen Savers', 'WordPad'] },
  { name: 'Communications', icon: 'i-mail', size: 1.2, on: true, desc: 'Includes accessories to help you connect to other computers and online services.', parts: ['Dial-Up Networking', 'Direct Cable Connection', 'HyperTerminal', 'Phone Dialer'] },
  { name: 'Disk Tools', icon: 'i-drive', size: 1.1, on: true, desc: 'Includes programs for backing up and compressing disks.', parts: ['Backup', 'Defrag', 'Disk compression tools'] },
  { name: 'Multimedia', icon: 'i-cd', size: 2.5, on: true, desc: 'Includes programs for playing sound, animation, or video on computers with CD-ROM drives or sound cards.', parts: ['Audio Compression', 'CD Player', 'Media Player', 'Sample Sounds', 'Sound Recorder', 'Volume Control'] },
  { name: 'The Microsoft Network', icon: 'i-globe', size: 2.1, on: false, desc: 'The Microsoft Network gives you access to e-mail, bulletin boards, chat, and the Internet. Requires a modem and the patience of a saint.', parts: ['The Microsoft Network'] },
];

// The floppy drive that never is.
let notReadyCount = 0;
async function notReady(parent) {
  const lines = ['The device is not ready.', 'The device is still not ready.', 'The device is not ready, and frankly, neither are we.'];
  for (;;) {
    playSound('Floppy');
    const r = await msgbox({ title: 'Error', text: 'A:\\ is not accessible.\n\n' + lines[Math.min(notReadyCount++, lines.length - 1)], icon: 'error', buttons: ['&Retry', 'Cancel'], parent });
    if (r !== 'Retry') return;
    await wait(500);
  }
}

function installWizard(parent) {
  const text = h('div', { class: 'cp-wtext' });
  const back = h('button', { class: 'btn', type: 'button', html: '&lt;&nbsp;<u>B</u>ack', disabled: true });
  const next = h('button', { class: 'btn default', type: 'button', html: '<u>N</u>ext &gt;' });
  const cancel = h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel');
  const pic = h('div', { class: 'cp-wpic' }, icon('i-floppy'), icon('i-cd'));
  let page = 0;
  function show(n) {
    page = n;
    back.disabled = n === 0;
    if (n === 0) {
      text.replaceChildren(h('p', null, 'Insert the product\'s first installation floppy disk or CD-ROM, and then click Next.'));
      next.innerHTML = '<u>N</u>ext &gt;';
    } else {
      const cmd = h('input', { class: 'field', 'aria-label': 'Command line for installation program', autocomplete: 'off' });
      text.replaceChildren(
        h('p', null, 'Windows was unable to locate the installation program. Click Back to try again, or click Browse to search manually.'),
        h('label', { class: 'cp-col' }, h('span', { html: '<u>C</u>ommand line for installation program:' }), cmd),
        h('div', { class: 'cp-line right' }, h('button', { class: 'btn', type: 'button', html: 'B<u>r</u>owse...', onclick: () => notReady(win) })));
      next.textContent = 'Finish';
      next.disabled = true;
      cmd.addEventListener('input', () => { next.disabled = !cmd.value.trim(); });
    }
    next.focus();
  }
  back.addEventListener('click', () => { next.disabled = false; show(0); });
  next.addEventListener('click', async () => {
    if (page === 1) {
      await msgbox({ title: 'Run Installation Program', text: 'Cannot find the file \'' + text.querySelector('input').value.trim() + '\' (or one of its components). It may have been installed somewhere fun.', icon: 'error', parent: win });
      return;
    }
    [back, next, cancel].forEach(b => { b.disabled = true; });
    text.replaceChildren(h('p', null, 'Searching for an installation program on drive A:...'), h('div', { class: 'cp-prog busy' }, h('i')));
    await wait(1200);
    const r = await msgbox({ title: 'Insert Disk', text: 'Please insert the disk labeled \'blankiekun 95 Plus! Disk 1 of 47\' into drive A:, and then click OK.', icon: 'warn', buttons: ['OK', 'Cancel'], parent: win });
    if (r === 'OK') {
      await wait(700);
      await msgbox({ title: 'Install Program', text: 'The disk in drive A: appears to be a slice of toast.\n\nRemove the toast, insert a floppy disk, and try again.', icon: 'error', parent: win });
    }
    cancel.disabled = false;
    next.disabled = false;
    show(r === 'OK' ? 1 : 0);
  });
  const body = h('div', { class: 'dlg cp-wizard' },
    h('div', { class: 'cp-wbody' }, pic, text),
    h('hr', { class: 'cp-hr' }),
    h('div', { class: 'btns right' }, back, next, cancel));
  body.addEventListener('keydown', e => { if (e.key === 'Escape' && !cancel.disabled) { e.preventDefault(); win.close(); } });
  const win = createWindow({ title: 'Install Program From Floppy Disk or CD-ROM', icon: 'i-addremove', body, dialog: true, resizable: false, width: 'auto', parent, taskbar: false });
  show(0);
  return win;
}

async function uninstall(parent, name) {
  const sure = await msgbox({ title: 'Confirm File Deletion', text: `Are you sure you want to completely remove '${name}' and all of its components?`, icon: 'question', buttons: ['&Yes', '&No'], parent });
  if (sure !== 'Yes') return;
  const STEPS = ['Remove shared program files', 'Remove standard program files', 'Remove folder items', 'Remove program directories', 'Remove program registry entries'];
  const marks = STEPS.map(() => h('span', { class: 'cp-mark' }));
  const bar = h('i');
  const status = h('p', null, `Uninstall is removing ${name} from your computer.`);
  const ok = h('button', { class: 'btn default', type: 'button', disabled: true, onclick: () => win.close() }, 'OK');
  let cancelled = false;
  const cancel = h('button', { class: 'btn', type: 'button', onclick: () => { cancelled = true; win.close(); } }, 'Cancel');
  const body = h('div', { class: 'dlg cp-uninst' },
    status,
    h('ul', { class: 'cp-steps' }, STEPS.map((s, i) => h('li', null, marks[i], s))),
    h('div', { class: 'cp-prog' }, bar),
    h('div', { class: 'btns' }, ok, cancel));
  const win = createWindow({ title: 'Remove Programs From Your Computer', icon: 'i-addremove', body, dialog: true, resizable: false, width: 'auto', parent, taskbar: false, onClosed: () => { cancelled = true; } });
  cancel.focus();
  const setBar = f => { bar.style.width = Math.round(f * 100) + '%'; };
  let all = false;
  for (let i = 0; i < STEPS.length; i++) {
    await wait(450);
    if (cancelled) return;
    if (i === 0) {
      for (const file of ['FUN.DLL', 'GIGGLE32.DLL', 'WHEEE.VXD']) {
        if (all) break;
        const r = await msgbox({
          title: 'Remove Shared File?', icon: 'question', buttons: ['&Yes', '&No', 'Yes to A&ll'], parent: win,
          text: `The system indicates that the following shared file is no longer used by any programs. If any programs are still using this file and it is removed, those programs may not function.\n\nAre you sure you want to remove the shared file?\n\nFile name: ${file}\nLocated in: C:\\WINDOWS\\SYSTEM`,
        });
        if (cancelled || r == null) return;
        if (r === 'Yes to All') all = true;
        setBar(0.05);
      }
    }
    marks[i].textContent = '✓';
    setBar((i + 1) / STEPS.length * 0.99);
  }
  await wait(600);
  if (cancelled) return;
  marks[STEPS.length - 1].textContent = '✗';
  await msgbox({ title: 'Remove Programs', text: `blankiekun 95 could not remove ${name} because it is too much fun.`, icon: 'error', parent: win });
  if (cancelled) return;
  status.textContent = `Uninstall did not complete. ${name} is still installed, and that's probably for the best.`;
  ok.disabled = false;
  cancel.disabled = true;
  ok.focus();
}

function addremove() {
  const saved = store.get(AKEY, null) || {};
  const draft = Object.fromEntries(COMPONENTS.map(c => [c.name, saved[c.name] ?? c.on]));
  let p;

  // Install/Uninstall
  const list = listbox('Installed programs', 'cp-progs');
  PROGRAMS.forEach(([id, name]) => {
    const info = appInfo(id);
    if (info) list.add(h('div', null, icon(info.icon || 'i-exe'), h('span', null, name)), name);
  });
  const removeBtn = h('button', { class: 'btn', type: 'button', disabled: true, html: 'Add/<u>R</u>emove...', onclick: () => list.value && uninstall(p.win, list.value) });
  list.onpick = () => { removeBtn.disabled = false; };
  list.el.addEventListener('dblclick', () => removeBtn.click());
  const instPanel = h('div', { class: 'cp-panel' },
    h('div', { class: 'cp-intro' }, h('div', { class: 'cp-wpic small' }, icon('i-floppy'), icon('i-cd')),
      h('p', null, 'To install a new program from a floppy disk or CD-ROM drive, click Install.')),
    h('div', { class: 'cp-line right' }, h('button', { class: 'btn', type: 'button', html: '<u>I</u>nstall...', onclick: () => installWizard(p.win) })),
    h('hr', { class: 'cp-hr' }),
    h('div', { class: 'cp-intro' }, h('div', { class: 'cp-big' }, icon('i-addremove')),
      h('p', null, 'The following software can be automatically removed by Windows. To remove a program or to modify its installed components, select it from the list and click Add/Remove.')),
    list.el,
    h('div', { class: 'cp-line right' }, removeBtn));

  // Windows Setup
  const comps = listbox('Components', 'cp-comps');
  const desc = h('p', { class: 'cp-desc' });
  const count = h('p', { class: 'cp-count' });
  const required = h('b');
  const boxes = {};
  const totals = () => {
    const mb = COMPONENTS.reduce((t, c) => t + (draft[c.name] === true ? c.size : draft[c.name] === 'partial' ? c.size / 2 : 0), 0);
    required.textContent = mb.toFixed(1) + ' MB';
  };
  COMPONENTS.forEach(c => {
    const box = h('input', { type: 'checkbox', tabindex: '-1', 'aria-label': c.name });
    boxes[c.name] = box;
    const set = v => { box.checked = v === true || v === 'partial'; box.indeterminate = v === 'partial'; };
    set(draft[c.name]);
    box.addEventListener('change', () => { draft[c.name] = box.checked; set(box.checked); totals(); p.dirty(); });
    comps.add(h('div', null, box, icon(c.icon), h('span', null, c.name), h('span', { class: 'cp-size' }, c.size.toFixed(1) + ' MB')), c);
  });
  comps.onpick = c => {
    desc.textContent = c.desc;
    const n = draft[c.name] === true ? c.parts.length : draft[c.name] === 'partial' ? Math.ceil(c.parts.length / 2) : 0;
    count.textContent = `${n} of ${c.parts.length} components selected`;
  };
  comps.el.addEventListener('keydown', e => {
    if (e.key === ' ' && comps.value) { e.preventDefault(); boxes[comps.value.name].click(); comps.onpick(comps.value); }
  });
  comps.el.addEventListener('change', () => comps.value && comps.onpick(comps.value));
  comps.pick(0);
  totals();
  const setupPanel = h('div', { class: 'cp-panel', hidden: true },
    h('p', { class: 'cp-note' }, 'To add or remove a component, click the check box. A shaded box means that only part of the component will be installed. To see what\'s included in a component, click Details.'),
    h('span', null, h('u', null, 'C'), 'omponents:'),
    comps.el,
    h('div', { class: 'cp-form' }, h('span', null, 'Space required:'), required, h('span', null, 'Space available on disk:'), h('b', null, '812.4 MB')),
    group('Description', desc, count,
      h('div', { class: 'cp-line right' },
        h('button', { class: 'btn', type: 'button', html: '<u>D</u>etails...', onclick: () => {
          const c = comps.value;
          msgbox({ title: c.name, text: `${c.name} includes:\n\n` + c.parts.map(x => '• ' + x).join('\n'), icon: 'info', parent: p.win });
        } }))),
    h('div', { class: 'cp-line right' }, h('button', { class: 'btn', type: 'button', html: '<u>H</u>ave Disk...', onclick: () => notReady(p.win) })));

  // Startup Disk
  const diskPanel = h('div', { class: 'cp-panel', hidden: true },
    h('div', { class: 'cp-intro' }, h('div', { class: 'cp-big' }, icon('i-floppy')),
      h('p', null, 'If you have trouble starting Windows, you can use a startup disk to start your computer, run diagnostic programs, and fix many problems.')),
    h('p', { class: 'cp-note' }, 'To create a startup disk, click Create Disk. You will need one floppy disk.'),
    h('div', { class: 'cp-line right' }, h('button', { class: 'btn', type: 'button', html: '<u>C</u>reate Disk...', onclick: async () => {
      const r = await msgbox({ title: 'Insert Disk', text: 'Label a disk \'blankiekun 95 Startup Disk\' and insert it into drive A:.\n\nCaution: Setup will delete any existing files on this disk.', icon: 'warn', buttons: ['OK', 'Cancel'], parent: p.win });
      if (r !== 'OK') return;
      const pr = progress(p.win, 'Startup Disk', 'Preparing the startup disk...');
      for (let i = 1; i <= 4; i++) { await wait(180); pr.set(i / 10); }
      pr.close();
      await notReady(p.win);
    } })));

  p = propsDialog({
    app: 'addremove', title: 'Add/Remove Programs Properties', icon: 'i-addremove', cls: 'cp-addremove',
    names: ['Install/Uninstall', 'Windows Setup', 'Startup Disk'], panels: [instPanel, setupPanel, diskPanel],
    async apply() {
      const files = ['ACCESS.CPL', 'CALC.EXE', 'CHARMAP.EXE', 'HYPERTRM.EXE', 'DEFRAG.EXE', 'CDPLAYER.EXE', 'MSN.EXE', 'TADA.WAV'];
      const pr = progress(p.win, 'Copying Files...', 'Copying files...');
      for (let i = 0; i < files.length; i++) { pr.set((i + 1) / files.length, 'Copying ' + files[i] + '...'); await wait(110); }
      pr.close();
      store.set(AKEY, draft);
    },
  });
  return p.win;
}

// ---------- Sounds ----------

const SKEY = 'w95.sounds';
const EVENTS = ['Default sound', 'Asterisk', 'Critical Stop', 'Exclamation', 'Question', 'Start Windows', 'Exit Windows', 'Empty Recycle Bin', 'Maximize', 'Minimize', 'Open program', 'Close program'];
const DEFAULT_MAP = { 'Asterisk': 'Ding', 'Critical Stop': 'Chord', 'Exclamation': 'Ding', 'Start Windows': 'The blankiekun Sound', 'Exit Windows': 'Tada', 'Empty Recycle Bin': 'Recycle' };
const SCHEMES = { 'No Sounds': {}, 'blankiekun 95 Default': DEFAULT_MAP };
const soundSettings = () => ({ scheme: 'blankiekun 95 Default', map: DEFAULT_MAP, custom: {}, ...(store.get(SKEY, null) || {}) });

let actx = null, playing = null;

// One voice: an oscillator through a decaying envelope.
function tone(c, out, t, freq, dur, { type = 'sine', peak = 0.3, attack = 0.005, detune = 0 } = {}) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}
const bell = (c, out, t, f, dur = 1.2, peak = 0.3) => { tone(c, out, t, f, dur, { peak }); tone(c, out, t, f * 2.76, dur * 0.4, { peak: peak * 0.25 }); tone(c, out, t, f * 5.4, dur * 0.15, { peak: peak * 0.08 }); };

function noise(c, dur, fill) {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  fill(b.getChannelData(0), c.sampleRate);
  const s = c.createBufferSource();
  s.buffer = b;
  return s;
}

// Every sound is made on the spot; each returns its length in seconds.
const SYNTH = {
  // The A: drive looking for a disk: the head stepping out and back over a motor hum.
  'Floppy'(c, out, t) {
    for (let i = 0; i < 14; i++) {
      const k = noise(c, 0.012, d => { for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / d.length); });
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 3;
      k.connect(bp).connect(out); k.start(t + i * 0.035 + (i >= 7 ? 0.25 : 0));
    }
    tone(c, out, t, 95, 0.9, { type: 'square', peak: 0.05, attack: 0.05 });
    return 1;
  },
  'Ding'(c, out, t) { bell(c, out, t, 1318.5, 0.9, 0.35); return 0.9; },
  'Chord'(c, out, t) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { tone(c, out, t + i * 0.025, f, 1.2, { type: 'triangle', peak: 0.16 }); tone(c, out, t + i * 0.025, f * 2, 0.5, { peak: 0.04 }); });
    return 1.3;
  },
  'Chimes'(c, out, t) { [1567.98, 1318.51, 1046.5, 1174.66].forEach((f, i) => bell(c, out, t + i * 0.16, f, 1.3, 0.22)); return 1.8; },
  'Tada'(c, out, t) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(3200, t + 0.25);
    f.frequency.exponentialRampToValueAtTime(700, t + 1.6);
    f.connect(out);
    tone(c, f, t, 392, 0.14, { type: 'sawtooth', peak: 0.12 });
    [261.63, 329.63, 392, 523.25, 659.25].forEach(n => { tone(c, f, t + 0.13, n, 1.6, { type: 'sawtooth', peak: 0.07, attack: 0.02, detune: -5 }); tone(c, f, t + 0.13, n, 1.6, { type: 'sawtooth', peak: 0.05, attack: 0.02, detune: 6 }); });
    const thud = noise(c, 0.4, (d, sr) => { for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / sr * 12); });
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const g = c.createGain(); g.gain.value = 0.9;
    thud.connect(lp).connect(g).connect(out);
    thud.start(t + 0.13);
    return 1.8;
  },
  'The blankiekun Sound'(c, out, t) {
    // A slow Eb major add9 swell with a filter opening up, then a little sparkle on top.
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(260, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 1.7);
    f.frequency.exponentialRampToValueAtTime(900, t + 3.2);
    const master = c.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(1, t + 1.1);
    master.gain.setValueAtTime(1, t + 2.1);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    f.connect(master).connect(out);
    [155.56, 233.08, 311.13, 392, 466.16, 698.46].forEach((n, i) => {
      for (const det of [-7, 7]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = i < 2 ? 'sawtooth' : 'triangle'; o.frequency.value = n; o.detune.value = det;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(i < 2 ? 0.05 : 0.09, t + 0.4 + i * 0.12);
        o.connect(g).connect(f);
        o.start(t); o.stop(t + 3.5);
      }
    });
    [1244.5, 1568, 1864.7, 2489].forEach((n, i) => bell(c, out, t + 1.35 + i * 0.13, n, 1.4, 0.06));
    return 3.5;
  },
  'Recycle'(c, out, t) {
    // Crumpled paper: a burst of short crackles.
    const dur = 0.7;
    const s = noise(c, dur, (d, sr) => {
      for (let g = 0; g < 70; g++) {
        const at = Math.floor(Math.random() * (d.length - sr * 0.03)), len = Math.floor(sr * (0.002 + Math.random() * 0.02)), amp = 0.3 + Math.random() * 0.7;
        for (let i = 0; i < len; i++) d[at + i] += (Math.random() * 2 - 1) * amp * (1 - i / len);
      }
      for (let i = 0; i < d.length; i++) d[i] *= Math.min(1, i / (sr * 0.02)) * (1 - i / d.length * 0.6);
    });
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.7;
    const g = c.createGain(); g.gain.value = 0.7;
    s.connect(bp).connect(g).connect(out);
    s.start(t);
    return dur;
  },
};
const LENGTHS = { 'Ding': 0.9, 'Chord': 1.3, 'Chimes': 1.8, 'Tada': 1.8, 'The blankiekun Sound': 3.5, 'Recycle': 0.7 };
const SOUND_NAMES = ['(None)', 'The blankiekun Sound', 'Chimes', 'Chord', 'Ding', 'Recycle', 'Tada'];

function volume() {
  const v = store.get('w95.volume', { level: 0.8, mute: false }) || {};
  return v.mute ? 0 : clamp(Number(v.level ?? 0.8) || 0, 0, 1);
}

function stopSound() {
  if (!playing) return;
  const out = playing;
  playing = null;
  try { out.gain.setTargetAtTime(0, actx.currentTime, 0.02); setTimeout(() => out.disconnect(), 150); } catch {}
}

// Plays a sound by name, at the master volume. Does nothing until the page has had a click or key press.
function playName(name) {
  const fn = SYNTH[name];
  const vol = volume();
  if (!fn || !vol) return;
  try {
    if (!actx) {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
    }
    const go = () => {
      try {
        stopSound();
        const out = actx.createGain();
        out.gain.value = vol;
        out.connect(actx.destination);
        playing = out;
        const len = fn(actx, out, actx.currentTime + 0.02);
        setTimeout(() => { if (playing === out) playing = null; try { out.disconnect(); } catch {} }, (len + 0.3) * 1000);
      } catch {}
    };
    if (actx.state === 'running') go();
    else {
      const t0 = performance.now();
      actx.resume().then(() => { if (performance.now() - t0 < 300) go(); }, () => {});
    }
  } catch {}
}

// Plays the sound the current scheme gives an event ('Asterisk', 'Start Windows', ...).
// A sound name ('Tada') works too.
export function playSound(eventName) {
  const map = soundSettings().map || {};
  const name = map[eventName] ?? (SYNTH[eventName] ? eventName : null);
  if (name) playName(name);
}

function sounds() {
  const saved = soundSettings();
  const draft = { scheme: saved.scheme, map: { ...saved.map }, custom: { ...(saved.custom || {}) } };
  let p;
  const events = listbox('Events', 'cp-events');
  const marks = {};
  events.add(h('div', { class: 'cp-ehead' }, icon('i-computer'), h('span', null, 'Windows')), null);
  EVENTS.forEach(e => {
    marks[e] = h('span', { class: 'cp-snd' });
    events.add(h('div', null, marks[e], h('span', null, e)), e);
  });
  const nameSel = h('select', { class: 'field', id: 'cp-sname', disabled: true }, SOUND_NAMES.map(n => h('option', { value: n }, n)));
  const playBtn = h('button', { class: 'btn cp-play', type: 'button', 'aria-label': 'Preview', disabled: true, onclick: () => playName(nameSel.value) }, '▶');
  const stopBtn = h('button', { class: 'btn cp-play', type: 'button', 'aria-label': 'Stop', onclick: stopSound }, '■');
  const schemeSel = h('select', { class: 'field', id: 'cp-sscheme' });

  const allSchemes = () => ({ ...SCHEMES, ...draft.custom });
  const same = (a, b) => EVENTS.every(e => (a[e] || null) === (b[e] || null));
  function syncSchemes() {
    const names = Object.keys(allSchemes());
    const match = names.find(n => same(allSchemes()[n], draft.map));
    draft.scheme = match || '';
    schemeSel.replaceChildren(...(match ? [] : [h('option', { value: '' }, '(Custom)')]), ...names.map(n => h('option', { value: n }, n)));
    schemeSel.value = draft.scheme;
  }
  function syncMarks() {
    EVENTS.forEach(e => { marks[e].replaceChildren(draft.map[e] ? icon('i-speaker') : ''); });
  }
  events.onpick = e => {
    nameSel.disabled = !e;
    nameSel.value = e ? draft.map[e] || '(None)' : '(None)';
    playBtn.disabled = !e || nameSel.value === '(None)';
  };
  nameSel.addEventListener('change', () => {
    const e = events.value;
    if (!e) return;
    if (nameSel.value === '(None)') delete draft.map[e]; else draft.map[e] = nameSel.value;
    playBtn.disabled = nameSel.value === '(None)';
    syncMarks(); syncSchemes(); p.dirty();
  });
  schemeSel.addEventListener('change', () => {
    const s = allSchemes()[schemeSel.value];
    if (!s) return;
    draft.map = { ...s };
    syncMarks(); syncSchemes(); events.onpick(events.value); p.dirty();
  });
  syncMarks(); syncSchemes();

  const panel = h('div', { class: 'cp-panel' },
    h('span', null, 'E', h('u', null, 'v'), 'ents:'),
    events.el,
    group('Sound',
      h('label', { class: 'cp-col', for: 'cp-sname' }, h('span', { html: '<u>N</u>ame:' })),
      h('div', { class: 'cp-line' }, nameSel,
        h('button', { class: 'btn', type: 'button', html: '<u>B</u>rowse...', onclick: () => msgbox({ title: 'Browse', text: 'blankiekun 95 makes all of its sounds itself, so there are no .WAV files to browse.', icon: 'info', parent: p.win }) })),
      h('div', { class: 'cp-line' },
        h('button', { class: 'btn', type: 'button', html: '<u>D</u>etails...', onclick: () => {
          const n = nameSel.value;
          msgbox({ title: n, text: n === '(None)' || nameSel.disabled ? 'No sound is selected.' : `Name: ${n}\nFormat: Synthesized live, 44.1 kHz\nCopyright: blankiekun\nMedia length: ${LENGTHS[n]} sec.`, icon: 'info', parent: p.win });
        } }),
        h('span', { class: 'cp-preview' }, 'Preview:', icon('i-speaker'), playBtn, stopBtn))),
    group('Schemes',
      schemeSel,
      h('div', { class: 'cp-line right' },
        h('button', { class: 'btn', type: 'button', html: '<u>S</u>ave As...', onclick: async () => {
          const n = await inputbox({ title: 'Save Scheme As', label: 'Save this sound scheme as:', parent: p.win });
          if (!n || !n.trim()) return;
          draft.custom[n.trim()] = { ...draft.map };
          syncSchemes(); p.dirty();
        } }),
        h('button', { class: 'btn', type: 'button', html: 'D<u>e</u>lete', onclick: async () => {
          const n = schemeSel.value;
          if (!draft.custom[n]) { msgbox({ title: 'Sounds Properties', text: 'You cannot delete a scheme that came with blankiekun 95.', icon: 'warn', parent: p.win }); return; }
          if (await msgbox({ title: 'Delete Scheme', text: `Are you sure you want to remove the '${n}' sound scheme?`, icon: 'question', buttons: ['&Yes', '&No'], parent: p.win }) !== 'Yes') return;
          delete draft.custom[n];
          syncSchemes(); p.dirty();
        } }))));

  p = propsDialog({
    app: 'sounds', title: 'Sounds Properties', icon: 'i-speaker', cls: 'cp-sounds',
    names: ['Sounds'], panels: [panel],
    apply() { store.set(SKEY, draft); },
    onClosed: stopSound,
  });
  events.pick(2);
  return p.win;
}

// ---------- registration ----------

export const mouseApp = { id: 'mouse', title: 'Mouse', icon: 'i-mouse', single: true, open: mouse };
export const regionalApp = { id: 'regional', title: 'Regional Settings', icon: 'i-globe', single: true, open: regional };
export const addremoveApp = { id: 'addremove', title: 'Add/Remove Programs', icon: 'i-addremove', single: true, open: addremove };
export const soundsApp = { id: 'sounds', title: 'Sounds', icon: 'i-speaker', single: true, open: sounds };
