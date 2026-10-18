// chimimouryou Reader: a taste of chimimouryou's reader, with the opening of 坊っちゃん from Aozora Bunko
// in vertical text, paged right to left, with furigana and tap-to-look-up from a small glossary.

import { h, store, clamp } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { about } from '../dialogs.js';

const TITLE = 'chimimouryou Reader (demo)';
const SIZES = [16, 18, 20, 24, 28];
const THEMES = ['Light', 'Sepia', 'Dark'];
const KEY = 'reader';

// The longest glossary word that covers position i of text, as [start, word], or null.
export function lookup(text, i, words, max) {
  let best = null;
  for (let s = Math.max(0, i - max + 1); s <= i; s++)
    for (let n = max; n > i - s && (!best || n > best[1].length); n--)
      if (words.has(text.substr(s, n))) { best = [s, text.substr(s, n)]; break; }
  return best;
}
{
  const w = new Set(['腰を抜か', '抜か', '一生懸命', '一人']), t = '腰を抜かした。一生懸命に';
  console.assert(lookup(t, 3, w, 6)?.[1] === '腰を抜か' && lookup(t, 9, w, 6)?.[0] === 7 && lookup(t, 6, w, 6) === null, 'reader: longest word covering the tap');
}

// botchan.txt is one paragraph a line, with ruby written Aozora's way: ｜base《reading》.
// Returns [base, reading] runs; plain text has no reading.
function parse(line) {
  const parts = line.split(/｜([^《]+)《([^》]+)》/), out = [];
  for (let k = 0; k < parts.length; k += 3) {
    if (parts[k]) out.push([parts[k]]);
    if (k + 1 < parts.length) out.push([parts[k + 1], parts[k + 2]]);
  }
  return out;
}
console.assert(JSON.stringify(parse('｜親譲《おやゆず》りの')) === '[["親譲","おやゆず"],["りの"]]', 'reader: ruby markup');

function open() {
  const st = { pos: 0, furi: true, size: 2, theme: 0, ...store.get(KEY, {}) };
  const save = () => store.set(KEY, st);
  let text = '', gloss = new Map(), max = 1, spans = [], page = 0, pages = 1, W = 0;

  const spacer = h('div', { class: 'rd-spacer' });
  const vp = h('div', { class: 'rd-text', lang: 'ja' }, 'Loading...');
  const pop = h('div', { class: 'rd-pop', hidden: true });
  const fill = h('div', { class: 'rd-fill' });
  const count = h('span');
  const side = (cls, label, d) => h('button', { type: 'button', class: 'rd-side ' + cls, 'aria-label': label, onclick: () => go(page + d) }, d > 0 ? '‹' : '›');
  const stage = h('div', { class: 'rd-stage' }, side('rd-next', 'Next page', 1), vp, side('rd-prev', 'Previous page', -1), pop);
  const status = h('div', { class: 'rd-status' }, h('div', { class: 'rd-bar' }, fill), count);

  // Distance of a character from the start of the text, across the pages.
  const dist = (el, box) => box.right - el.getBoundingClientRect().right - vp.scrollLeft;
  function go(p, keep) {
    page = clamp(p, 0, pages - 1);
    vp.scrollLeft = -page * W;  // vertical-rl scrolls leftwards, into negative scrollLeft
    if (!keep && spans.length) {
      const box = vp.getBoundingClientRect();
      const i = spans.findIndex(s => dist(s, box) >= page * W - 1);
      st.pos = Math.max(0, i); save();
    }
    count.textContent = `Page ${page + 1} of ${pages}`;
    fill.style.width = (pages > 1 ? page / (pages - 1) * 100 : 100) + '%';
    pop.hidden = true;
  }
  // Pages are a whole number of columns wide, so none is cut in half at the page's edge.
  function layout() {
    if (!spans.length) return;
    const fs = SIZES[st.size], lh = fs * 2;
    root.style.setProperty('--rd-fs', fs + 'px');
    root.style.setProperty('--rd-lh', lh + 'px');
    vp.style.flex = vp.style.width = '';
    W = Math.max(1, Math.floor(vp.clientWidth / lh)) * lh;
    vp.style.flex = 'none'; vp.style.width = W + 'px';
    spacer.style.width = '0';
    const total = vp.scrollWidth;
    spacer.style.width = (Math.ceil(total / W) * W - total) + 'px';
    pages = Math.max(1, Math.round(vp.scrollWidth / W));
    const s = spans[clamp(st.pos, 0, spans.length - 1)];
    go(Math.floor((dist(s, vp.getBoundingClientRect())) / W), true);
  }

  function render(src) {
    vp.textContent = ''; spans = []; text = '';
    for (const line of src.trim().split('\n')) {
      const p = h('p');
      for (const [base, ruby] of parse(line)) {
        const chars = [...base].map(c => { const s = h('span', { 'data-i': text.length }, c); text += c; spans.push(s); return s; });
        p.append(ruby ? h('ruby', null, ...chars, h('rt', null, ruby)) : h('span', null, ...chars));
      }
      text += '\n'; spans.push(null);  // keep text and spans in step: one entry a character
      vp.append(p);
    }
    spans = spans.map((s, i) => s || spans[i - 1]);
    vp.append(spacer);
    layout();
    document.fonts.ready.then(layout);  // the Mincho may arrive after the first layout
  }

  function show(e, at) {
    vp.querySelectorAll('.rd-hit').forEach(s => s.classList.remove('rd-hit'));
    // shortcut: a hand-made glossary of this excerpt's words (surface forms, no deinflection); a real dictionary would need JMdict-sized data.
    const hit = lookup(text, at, gloss, max);
    if (hit) for (let k = hit[0]; k < hit[0] + hit[1].length; k++) spans[k].classList.add('rd-hit');
    const [reading, meaning] = hit ? gloss.get(hit[1]) : [];
    pop.replaceChildren(...(hit
      ? [h('b', { lang: 'ja' }, hit[1]), h('span', { class: 'rd-kana', lang: 'ja' }, reading), h('p', null, meaning), h('small', null, 'Demo glossary')]
      : [h('b', { lang: 'ja' }, text[at]), h('p', null, "Not in this demo's dictionary. In chimimouryou you look words up with Yomitan and its dictionaries, such as JMdict.")]));
    pop.hidden = false;
    const box = stage.getBoundingClientRect();
    pop.style.left = clamp(e.clientX - box.left + 12, 4, Math.max(4, box.width - pop.offsetWidth - 4)) + 'px';
    pop.style.top = clamp(e.clientY - box.top + 12, 4, Math.max(4, box.height - pop.offsetHeight - 4)) + 'px';
  }

  // A tap on a character looks it up; a swipe turns the page (rightwards is forwards, as in a Japanese book).
  let down = null;
  vp.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  vp.addEventListener('pointerup', e => {
    if (!down) return;
    const dx = e.clientX - down[0], dy = e.clientY - down[1];
    down = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { go(page + Math.sign(dx)); return; }
    const s = e.target.closest('[data-i]');
    if (s) show(e, +s.dataset.i); else pop.hidden = true;
  });

  const theme = t => { st.theme = t; save(); root.dataset.theme = THEMES[t].toLowerCase(); };
  const furi = on => { st.furi = on; save(); root.classList.toggle('rd-nofuri', !on); };
  const size = d => { st.size = clamp(st.size + d, 0, SIZES.length - 1); save(); layout(); };

  const bar = menubar([
    { label: '&File', items: () => [{ label: 'E&xit', action: () => win.close() }] },
    { label: 'A&a', items: () => [
      { label: '&Furigana', checked: st.furi, action: () => furi(!st.furi) },
      '-',
      { label: '&Larger Text', disabled: st.size === SIZES.length - 1, action: () => size(1) },
      { label: '&Smaller Text', disabled: st.size === 0, action: () => size(-1) },
      '-',
      ...THEMES.map((t, k) => ({ label: '&' + t, checked: st.theme === k, radio: true, action: () => theme(k) })),
    ] },
    { label: '&Help', items: () => [{ label: '&About chimimouryou Reader...', action: () => about(TITLE, 'i-reader', win, h('div', null,
      h('p', null, 'A demo of ', h('a', { href: '#ie/chimimouryou', onclick: e => { e.preventDefault(); launch('ie', 'chimimouryou'); } }, 'chimimouryou'),
        ', a self-hosted Japanese e-book reader for Calibre libraries (', h('a', { href: 'https://github.com/blankiekun/chimimouryou', target: '_blank', rel: 'noopener' }, 'GitHub'), ').'),
      h('p', null, '坊っちゃん, 夏目漱石: the opening of chapter one, from ', h('a', { href: 'https://www.aozora.gr.jp/cards/000148/card752.html', target: '_blank', rel: 'noopener' }, '青空文庫 (Aozora Bunko)'), '.'),
      h('p', null, 'The glossary is a small one made for this demo.'))) }] },
  ]);
  const root = h('div', { class: 'rd', tabindex: '-1' }, bar, stage, status);
  root.addEventListener('keydown', e => {
    const d = { ArrowLeft: 1, PageDown: 1, ' ': 1, ArrowRight: -1, PageUp: -1 }[e.key];
    if (d) { e.preventDefault(); go(page + d); }
    else if (e.key === 'Escape') pop.hidden = true;
  });
  theme(st.theme); furi(st.furi);

  const win = createWindow({
    app: 'reader', title: TITLE, icon: 'i-reader', body: root,
    width: 640, height: 460, minW: 300, minH: 260, route: 'reader', autofocus: '.rd',
    onResize: layout,
  });
  Promise.all(['botchan.txt', 'glossary.tsv'].map(f => fetch('demo-reader/' + f).then(r => { if (!r.ok) throw new Error(f); return r.text(); })))
    .then(([src, tsv]) => {
      for (const l of tsv.trim().split('\n')) { const [w, ...rest] = l.split('\t'); gloss.set(w, rest); max = Math.max(max, w.length); }
      render(src);
    }, () => { vp.textContent = 'Cannot open the book.'; });
  return win;
}

export default { id: 'reader', title: TITLE, icon: 'i-reader', single: true, open };
