// Display Properties: desktop pattern, wallpaper, colour, and window colour schemes.
// Choices are remembered in this browser only.

import { h, store } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { msgbox } from '../dialogs.js';
import { screenSaverTab, setScreenSaver, loadScreenSaver, SAVERS } from './screensaver.js';
import { setSoundMap } from './control.js';
import { V } from '../version.js';

const KEY = 'w95.display';

// 8×8 bitmaps, one byte per row, drawn black over the desktop colour.
const PATTERNS = {
  '(None)': null,
  'Bricks': [0xff, 0x80, 0x80, 0x80, 0xff, 0x08, 0x08, 0x08],
  'Buttons': [0x7c, 0x82, 0x82, 0x82, 0x82, 0x82, 0x7c, 0x00],
  'Cargo Net': [0x88, 0x50, 0x20, 0x50, 0x88, 0x05, 0x02, 0x05],
  'Circuits': [0x88, 0x88, 0xf8, 0x08, 0x08, 0x08, 0x8f, 0x80],
  'Diamonds': [0x10, 0x28, 0x44, 0x82, 0x44, 0x28, 0x10, 0x00],
  'Paisley': [0x02, 0x07, 0x07, 0x02, 0x20, 0x50, 0x50, 0x20],
  'Plaid': [0xaa, 0x00, 0xaa, 0x00, 0xff, 0x08, 0x08, 0x08],
  'Scottie': [0x40, 0xc0, 0xc8, 0x78, 0x78, 0x48, 0x00, 0x00],
  'Thatches': [0xf8, 0x74, 0x22, 0x47, 0x8f, 0x17, 0x22, 0x71],
  'Tulip': [0x00, 0x00, 0x54, 0x7c, 0x7c, 0x38, 0x92, 0x7c],
  'Waffle': [0x00, 0x00, 0x00, 0x00, 0x80, 0x80, 0x80, 0xf0],
  '50% Gray': [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55],
};

const svgUrl = s => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;

function patternUrl(bits) {
  if (!bits) return 'none';
  let d = '';
  bits.forEach((row, y) => { for (let x = 0; x < 8; x++) if (row & (0x80 >> x)) d += `M${x} ${y}h1v1H${x}z`; });
  return svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8' shape-rendering='crispEdges'><path d='${d}'/></svg>`);
}

const CLOUDS = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600' preserveAspectRatio='xMidYMid slice'><defs><linearGradient id='s' x2='0' y2='1'><stop offset='0' stop-color='#2c5fd6'/><stop offset='1' stop-color='#a4c6fb'/></linearGradient><filter id='b' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='12'/></filter></defs><rect width='800' height='600' fill='url(#s)'/><g fill='#fff' filter='url(#b)'><ellipse cx='150' cy='120' rx='120' ry='38'/><ellipse cx='220' cy='100' rx='70' ry='40'/><ellipse cx='610' cy='90' rx='150' ry='36'/><ellipse cx='560' cy='70' rx='60' ry='34'/><ellipse cx='260' cy='450' rx='200' ry='48'/><ellipse cx='330' cy='420' rx='90' ry='46'/><ellipse cx='680' cy='400' rx='130' ry='40'/><ellipse cx='480' cy='280' rx='80' ry='22' opacity='.7'/><ellipse cx='90' cy='300' rx='70' ry='20' opacity='.6'/></g></svg>`;
const SETUP = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600' preserveAspectRatio='xMidYMid slice'><defs><linearGradient id='g' x2='0' y2='1'><stop offset='0' stop-color='#0000a8'/><stop offset='1' stop-color='#000010'/></linearGradient></defs><rect width='800' height='600' fill='url(#g)'/><text x='40' y='90' font-family='Arial Black, Arial, sans-serif' font-style='italic' font-weight='900' font-size='54' fill='#fff'>blankiekun<tspan fill='#ff4040' font-size='30' dy='-22'>95</tspan></text></svg>`;
const RIVETS = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' shape-rendering='crispEdges'><rect width='32' height='32' fill='#2050a8'/><path fill='#5080d8' d='M0 0h32v1H0zM0 0h1v32H0z'/><path fill='#103070' d='M0 31h32v1H0zM31 0h1v32h-1z'/><path fill='#80a8f0' d='M4 4h2v1H4zM4 4h1v2H4zM26 4h2v1h-2zM26 4h1v2h-1zM4 26h2v1H4zM4 26h1v2H4zM26 26h2v1h-2zM26 26h1v2h-1z'/><path fill='#082050' d='M6 5h1v2H5V6h1zM28 5h1v2h-2V6h1zM6 27h1v2H5v-1h1zM28 27h1v2h-2v-1h1z'/></svg>`;
export const WALLPAPERS = {
  '(None)': null,
  'Blue Rivets': { url: svgUrl(RIVETS), size: 'auto', repeat: 'repeat' },
  'Clouds': { url: svgUrl(CLOUDS), size: 'cover', repeat: 'no-repeat' },
  'Setup': { url: svgUrl(SETUP), size: 'cover', repeat: 'no-repeat' },
  // The later versions' default wallpapers, drawn with gradients.
  'Bliss': { url: 'radial-gradient(ellipse 120% 55% at 25% 108%, #6cbb34 0 55%, transparent 56%), radial-gradient(ellipse 90% 45% at 90% 112%, #4f9e25 0 60%, transparent 61%), radial-gradient(ellipse 18% 6% at 70% 22%, #fff, transparent), linear-gradient(#2a6bd4, #6ba5ec 45%, #c4ddf6 72%)', size: 'cover', repeat: 'no-repeat' },
  'Aurora': { url: 'radial-gradient(ellipse 70% 30% at 35% 62%, rgba(140, 230, 120, .55), transparent 70%), radial-gradient(ellipse 60% 25% at 70% 42%, rgba(70, 170, 255, .5), transparent 70%), linear-gradient(135deg, #0d4433, #0a2a4a 60%, #051a2c)', size: 'cover', repeat: 'no-repeat' },
  'Harmony': { url: 'radial-gradient(circle at 50% 45%, #bfe6ff 0, #4aa3ec 12%, transparent 34%), radial-gradient(ellipse 80% 40% at 30% 80%, rgba(120, 200, 80, .35), transparent 70%), linear-gradient(#2a74c4, #0f3d7a)', size: 'cover', repeat: 'no-repeat' },
  'Hero': { url: 'linear-gradient(100deg, transparent 52%, rgba(120, 200, 255, .5) 58%, transparent 66%), radial-gradient(ellipse 30% 45% at 62% 50%, #7cc8ff, #1a73d9 45%, transparent 70%), linear-gradient(#001a40, #003b86)', size: 'cover', repeat: 'no-repeat' },
  'Bloom': { url: 'radial-gradient(ellipse 30% 40% at 50% 58%, #e4f0ff, #3b82f6 45%, transparent 70%), radial-gradient(ellipse 50% 30% at 50% 70%, rgba(0, 70, 200, .5), transparent 70%), linear-gradient(#d5e6ff, #8fb6f2)', size: 'cover', repeat: 'no-repeat' },
  // Anime pictures in each era's style (img/wallpapers/, see THIRD-PARTY.txt).
  ...Object.fromEntries([
    // PC-98 CG for 1.0-3.1
    ['Rooftop', 'rooftop.jpg'], ['Sunset Shore', 'shore.jpg'], ['Starlight Lady', 'pc98-starlight-lady.png'], ['Shade Reader', 'pc98-shade-reader.png'],
    ['Moonlit Swings', 'pc98-moonlit-swings.png'], ['Autumn Leaves', 'pc98-autumn-leaves.png'], ['Rainy Room', 'dan98-bedroom-blues.jpg'],
    // late-90s cel anime for 95-Me
    ['Lain', 'lain.jpg'], ['Wired', 'wired.jpg'], ['Wired Crash', 'lain-win98-bsod.jpg'], ['Ed and Ein', 'bebop-ed-ein-sunset.jpg'], ['Bebop Alley', 'bebop-alley-crew.jpg'],
    ['Tokyo-3 Dusk', 'eva-misato-car.jpg'], ['Rei in Rain', 'eva-rei-umbrella.jpg'], ['Moon Guardians', 'sailor-moon-night.jpg'], ['Tenchi Road', 'tenchi-abbey-road.jpg'], ['Me-tan', 'me-tan.jpg'],
    // 2000s moe for 2000 and XP
    ['Peeking', 'konata.jpg'], ['Akiba Crossing', 'lucky-star-akiba.jpg'], ['SOS Brigade', 'haruhi-sos-brigade.jpg'], ['Chii Autumn', 'chobits-chii-autumn.jpg'], ['Snow Town', 'kanon-winter.jpg'],
    ['2000-tan', '2000-tan.jpg'], ['XP-tan', 'xp-tan.jpg'], ['Bliss Midnight', 'bliss-midnight.jpg'],
    // Vista and 7
    ['Miku Error', 'miku-window-error.jpg'], ['Light Music', 'k-on-band.jpg'], ['Snow Umbrella', 'toradora-snow.jpg'], ['Magica Quintet', 'madoka-quintet.jpg'],
    ['Clannad Road', 'clannad-road.jpg'], ['Lab Members', 'steins-gate-lab.jpg'], ['Nanami', 'nanami-seven.jpg'],
    // 8-11
    ['Violet Meadow', 'violet-meadow.jpg'], ['Suga Stairs', 'your-name-stairs.jpg'], ['Sunshine Girl', 'weathering-sky.jpg'], ['Harbor Band', 'bocchi-harbor.jpg'], ['Journey On', 'frieren-journey.jpg'], ['Touko', 'touko-win10.jpg'],
  ].map(([name, file]) => [name, { url: `url("${new URL(`../../img/wallpapers/${file}`, import.meta.url)}")`, size: 'cover', repeat: 'no-repeat' }])),
};

const SCHEMES = {
  'Windows Standard': { face: '#c0c0c0', title: '#000080', desktop: '#008080' },
  'Windows Classic': { face: '#d4d0c8', title: '#0a246a', desktop: '#3a6ea5' },
  'Brick': { face: '#c2bfa5', title: '#800000', desktop: '#3f1010' },
  'Desert': { face: '#d5ccbb', title: '#008080', desktop: '#a28d68' },
  'Eggplant': { face: '#90b0a8', title: '#588078', desktop: '#400040' },
  // The loud one from 3.1: red bars, yellow faces.
  'Hot Dog Stand': { face: '#ffff00', title: '#ff0000', desktop: '#ff0000' },
  'Lilac': { face: '#aea8d9', title: '#5a4eb1', desktop: '#57458b' },
  'Maple': { face: '#e6d8ae', title: '#800000', desktop: '#804000' },
  'Marine': { face: '#88c0b8', title: '#000080', desktop: '#004060' },
  'Rainy Day': { face: '#8099b0', title: '#4f6582', desktop: '#000000' },
  'Rose': { face: '#cfafb7', title: '#800040', desktop: '#9f6070' },
  'Slate': { face: '#a0b4c8', title: '#406080', desktop: '#3a5070' },
  'Spruce': { face: '#a2c8a9', title: '#2b7556', desktop: '#005034' },
  'Storm': { face: '#c0c0c0', title: '#800080', desktop: '#000000' },
  'Wheat': { face: '#d6d5a8', title: '#808000', desktop: '#808040' },
};

export const COLORS = ['#008080', '#000000', '#808080', '#c0c0c0', '#800000', '#ff0000', '#808000', '#ffff00',
  '#008000', '#00ff00', '#004040', '#00ffff', '#000080', '#0000ff', '#800080', '#ff00ff', '#3a6ea5', '#a28d68'];

function mix(hex, to, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

function varsFor(s) {
  const sc = SCHEMES[s.scheme] || SCHEMES['Windows Standard'];
  const wp = s.wallpaper === PAINTED && s.painted
    ? { url: `url("${s.painted}")`, size: 'auto', repeat: s.paintedTile ? 'repeat' : 'no-repeat' }
    : WALLPAPERS[s.wallpaper];
  return {
    '--desktop': s.color,
    '--pattern': patternUrl(PATTERNS[s.pattern]),
    '--wallpaper': wp ? wp.url : 'none',
    '--wallpaper-size': wp ? wp.size : 'cover',
    '--wallpaper-repeat': wp ? wp.repeat : 'no-repeat',
    '--face': sc.face,
    '--light': mix(sc.face, '#ffffff', 0.5),
    '--shadow': mix(sc.face, '#000000', 0.333),
    '--title': sc.title,
    '--title-off': mix(sc.face, '#000000', 0.333),
    '--title-ink-off': sc.face,
    '--select': sc.title,
  };
}

// Paint's Set As Wallpaper puts the picture here.
export const PAINTED = 'Paint Wallpaper';

const DEFAULTS = { pattern: '(None)', wallpaper: V.wallpaper, color: V.desktop, scheme: V.scheme, depth: 'High Color (16 bit)' };
const DEPTHS = { '16 Color': '16', '256 Color': '256', 'High Color (16 bit)': '', 'True Color (24 bit)': '' };
export function current() { return { ...DEFAULTS, ...(store.get(KEY, null) || {}) }; }

export function setWallpaper(dataUrl, tile) {
  setDesktop({ wallpaper: PAINTED, painted: dataUrl, paintedTile: tile });
}

// Settings (10 and 11) changes the desktop straight away, one choice at a time.
export function setDesktop(patch) {
  const s = { ...current(), ...patch };
  store.set(KEY, { ...s, vars: varsFor(s) });
  applyDisplay(s);
}

export function applyDisplay(s = current()) {
  const vars = varsFor(s);
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  document.documentElement.dataset.depth = DEPTHS[s.depth] || '';
}

function listbox(options, value, onpick, label) {
  const lb = h('div', { class: 'listbox', tabindex: '0', role: 'listbox', 'aria-label': label });
  const opts = options.map(o => {
    const el = h('div', { class: 'opt' + (o === value ? ' sel' : ''), role: 'option', 'aria-selected': String(o === value) }, o);
    el.addEventListener('click', () => pick(o));
    return el;
  });
  function pick(o) {
    value = o;
    opts.forEach((el, i) => { const on = options[i] === o; el.classList.toggle('sel', on); el.setAttribute('aria-selected', String(on)); if (on) el.scrollIntoView({ block: 'nearest' }); });
    onpick(o);
  }
  lb.addEventListener('keydown', e => {
    const i = options.indexOf(value);
    if (e.key === 'ArrowDown') { e.preventDefault(); pick(options[Math.min(options.length - 1, i + 1)]); }
    if (e.key === 'ArrowUp') { e.preventDefault(); pick(options[Math.max(0, i - 1)]); }
  });
  lb.append(...opts);
  requestAnimationFrame(() => { const s = lb.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' }); });
  return lb;
}

function open(arg) {
  // 10 and 11 send Display to Settings, as the real ones did; only its screen saver link comes back here.
  if (['10', '11'].includes(V.id) && arg !== 'Screen Saver') return launch('settings', 'Background');
  const draft = current();
  const screen = h('div', { class: 'dp-screen' }, h('div', { class: 'dp-win' }, h('div', { class: 'dp-tb' }), h('div', { class: 'dp-wb' })));
  const monitor = h('div', { class: 'dp-monitor', 'aria-hidden': 'true' }, screen, h('div', { class: 'dp-stand' }));
  const applyBtn = h('button', { class: 'btn', type: 'button', disabled: true, onclick: () => commit() });

  function preview() {
    const v = varsFor(draft);
    for (const [k, val] of Object.entries(v)) screen.style.setProperty(k, val);
    screen.dataset.depth = DEPTHS[draft.depth] || '';
    applyBtn.disabled = false;
  }

  const swatches = h('div', { class: 'dp-colors', role: 'radiogroup', 'aria-label': 'Desktop color' }, ...COLORS.map(c => {
    const b = h('button', { type: 'button', class: 'dp-sw', style: { background: c }, role: 'radio', 'aria-checked': String(c === draft.color), 'aria-label': c });
    b.addEventListener('click', () => { draft.color = c; swatches.querySelectorAll('.dp-sw').forEach(x => x.setAttribute('aria-checked', String(x === b))); preview(); });
    return b;
  }));

  const bgPanel = h('div', { class: 'dp-panel' },
    h('div', { class: 'dp-lists' },
      h('fieldset', { class: 'group' }, h('legend', null, 'Pattern'), listbox(Object.keys(PATTERNS), draft.pattern, v => { draft.pattern = v; preview(); }, 'Pattern')),
      h('fieldset', { class: 'group' }, h('legend', null, 'Wallpaper'), listbox(Object.keys(WALLPAPERS).concat(draft.painted ? [PAINTED] : []), draft.wallpaper, v => { draft.wallpaper = v; preview(); }, 'Wallpaper'))),
    h('fieldset', { class: 'group' }, h('legend', null, 'Desktop color'), swatches));

  const schemeSel = h('select', { class: 'field', id: 'dp-scheme', 'aria-label': 'Scheme' }, ...Object.keys(SCHEMES).map(s => h('option', { value: s, selected: s === draft.scheme }, s)));
  schemeSel.addEventListener('change', () => {
    draft.scheme = schemeSel.value;
    draft.color = SCHEMES[draft.scheme].desktop;
    swatches.querySelectorAll('.dp-sw').forEach(x => x.setAttribute('aria-checked', 'false'));
    preview();
  });
  const apPanel = h('div', { class: 'dp-panel', hidden: true },
    h('label', { class: 'dp-row', for: 'dp-scheme' }, h('span', { html: '<u>S</u>cheme:' }), schemeSel),
    h('p', { class: 'dp-note' }, 'A scheme sets the window colours and a matching desktop colour. Project pages in Internet Explorer keep their own look.'),
    h('button', { class: 'btn', type: 'button', onclick: () => { Object.assign(draft, DEFAULTS); schemeSel.value = DEFAULTS.scheme; preview(); } }, 'Restore defaults'));

  const depthSel = h('select', { class: 'field', id: 'dp-depth' }, ...Object.keys(DEPTHS).map(d => h('option', { value: d, selected: d === draft.depth }, d)));
  depthSel.addEventListener('change', () => { draft.depth = depthSel.value; preview(); });
  const setPanel = h('div', { class: 'dp-panel', hidden: true },
    h('label', { class: 'dp-row', for: 'dp-depth' }, h('span', { html: '<u>C</u>olor palette:' }), depthSel),
    h('div', { class: 'dp-row' }, h('span', null, 'Desktop area:'), h('b', { class: 'dp-res' }, `${innerWidth} by ${innerHeight} pixels`)),
    h('div', { class: 'dp-row' }, h('span', null, 'Font size:'), h('select', { class: 'field', disabled: true }, h('option', null, 'Small Fonts'))));

  // The Screen Saver tab keeps its own draft and draws into the monitor.
  const ss = screenSaverTab({ screen, getWin: () => win, dirty: () => { applyBtn.disabled = false; } });

  const panels = [bgPanel, ss.panel, apPanel, setPanel];
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, ...['Background', 'Screen Saver', 'Appearance', 'Settings'].map((t, i) => {
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === 0) }, t);
    b.addEventListener('click', () => {
      tabs.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
      panels.forEach((p, j) => { p.hidden = j !== i; });
      ss.show(panels[i] === ss.panel);
    });
    return b;
  }));

  // A new colour palette waits for a restart, like the real thing; Yes fakes one.
  async function commit() {
    const was = current().depth;
    store.set(KEY, { ...draft, vars: varsFor(draft) });
    applyDisplay({ ...draft, depth: was });
    ss.commit();
    applyBtn.disabled = true;
    if (draft.depth === was) return;
    const b = await msgbox({ title: 'System Settings Change', icon: 'i-warn', parent: win, buttons: ['&Yes', '&No'],
      text: 'You must restart your computer before the new settings will take effect.\n\nDo you want to restart your computer now?' });
    if (b !== 'Yes') return;
    const black = h('div', { class: 'screen', style: { background: '#000' } });
    document.body.append(black);
    setTimeout(() => { applyDisplay(current()); black.remove(); }, 1200);
  }

  const body = h('div', { class: 'dlg dp' },
    h('div', { class: 'dp-tabs' }, tabs, h('div', { class: 'tabpanel' }, monitor, ...panels)),
    h('div', { class: 'btns right' },
      h('button', { class: 'btn default', type: 'button', onclick: async () => { await commit(); win.close(); } }, 'OK'),
      h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel'),
      applyBtn));
  applyBtn.innerHTML = '<u>A</u>pply';
  body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });

  const win = createWindow({
    app: 'display', title: arg === 'Screen Saver' ? 'Screen Saver Settings' : 'Display Properties', icon: 'i-display', body, dialog: true, taskbar: true,
    resizable: false, width: 'auto', route: 'display', help: () => launch('help'),
    onClosed: () => ss.destroy(),
  });
  if (arg === 'Screen Saver') tabs.children[1].click();
  preview();
  applyBtn.disabled = true;
  return win;
}

// ---------- Desktop Themes ----------
// Plus!-style themes made from what's already here: one pick sets the colours,
// wallpaper, pattern, event sounds and screen saver together.
const THEMES = {
  'Windows Default': { scheme: V.scheme, color: V.desktop, wallpaper: V.wallpaper, pattern: '(None)', saver: 'flying', sounds: null },
  'Inside Your Computer': { scheme: 'Slate', color: '#3a5070', wallpaper: '(None)', pattern: 'Circuits', saver: 'pipes',
    sounds: { 'Default sound': 'Ding', 'Asterisk': 'Chord', 'Critical Stop': 'Chord', 'Exclamation': 'Ding', 'Start Windows': 'The blankiekun Sound', 'Exit Windows': 'Tada', 'Empty Recycle Bin': 'Recycle' } },
  'Mystery': { scheme: 'Storm', color: '#000000', wallpaper: '(None)', pattern: '(None)', saver: 'mystify',
    sounds: { 'Default sound': 'Ding', 'Asterisk': 'Chimes', 'Critical Stop': 'Chord', 'Exclamation': 'Chimes', 'Start Windows': 'Chimes', 'Exit Windows': 'Chord' } },
  'Science': { scheme: 'Marine', color: '#004060', wallpaper: 'Blue Rivets', pattern: '(None)', saver: 'stars',
    sounds: { 'Asterisk': 'Ding', 'Critical Stop': 'Chord', 'Exclamation': 'Ding', 'Start Windows': 'Chord', 'Exit Windows': 'Chimes', 'Empty Recycle Bin': 'Recycle' } },
  "The 60's USA": { scheme: 'Rose', color: '#9f6070', wallpaper: '(None)', pattern: 'Paisley', saver: 'marquee',
    sounds: { 'Asterisk': 'Chimes', 'Exclamation': 'Ding', 'Start Windows': 'Tada', 'Exit Windows': 'Tada', 'Empty Recycle Bin': 'Recycle' } },
};
const CURRENT = '(Current Windows settings)';

function themes() {
  const screen = h('div', { class: 'dp-screen' }, h('div', { class: 'dp-win' }, h('div', { class: 'dp-tb' }), h('div', { class: 'dp-wb' })));
  const monitor = h('div', { class: 'dp-monitor', 'aria-hidden': 'true' }, screen, h('div', { class: 'dp-stand' }));
  const sel = h('select', { class: 'field', id: 'dt-theme' }, ...[CURRENT, ...Object.keys(THEMES)].map(t => h('option', { value: t }, t)));
  const saverName = h('b');
  const applyBtn = h('button', { class: 'btn', type: 'button', disabled: true, html: '<u>A</u>pply', onclick: () => commit() });
  function preview() {
    const t = THEMES[sel.value];
    const d = t ? { ...current(), ...t } : current();
    for (const [k, v] of Object.entries(varsFor(d))) screen.style.setProperty(k, v);
    saverName.textContent = SAVERS[t ? t.saver : loadScreenSaver().saver] || '(None)';
    applyBtn.disabled = !t;
  }
  function commit() {
    const t = THEMES[sel.value];
    if (!t) return;
    const { saver, sounds, ...look } = t;
    const s = { ...current(), ...look };
    store.set(KEY, { ...s, vars: varsFor(s) });
    applyDisplay(s);
    setScreenSaver(saver);
    setSoundMap(sounds);
    applyBtn.disabled = true;
  }
  sel.addEventListener('change', preview);
  const body = h('div', { class: 'dlg dp' },
    h('label', { class: 'dp-row', for: 'dt-theme' }, h('span', { html: '<u>T</u>heme:' }), sel),
    monitor,
    h('div', { class: 'dp-row' }, h('span', null, 'Screen saver:'), saverName),
    h('p', { class: 'dp-note' }, 'A theme sets the window colours, desktop, sound events and screen saver all at once.'),
    h('div', { class: 'btns right' },
      h('button', { class: 'btn default', type: 'button', onclick: () => { commit(); win.close(); } }, 'OK'),
      h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel'),
      applyBtn));
  body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  const win = createWindow({ app: 'themes', title: 'Desktop Themes', icon: 'i-display', body, dialog: true, taskbar: true, resizable: false, width: 'auto', route: 'themes', help: () => launch('help') });
  preview();
  return win;
}

export const themesApp = { id: 'themes', title: 'Desktop Themes', icon: 'i-display', single: true, open: themes };

export default { id: 'display', title: 'Display Properties', icon: 'i-display', single: true, open };
