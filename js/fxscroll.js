// Firefox can't style ::-webkit-scrollbar, only colour its own bars. So there the native bars are
// hidden and drawn as elements instead, styled by the very same ::-webkit-scrollbar rules: each
// stylesheet's scrollbar rules are rewritten to classes (::-webkit-scrollbar-thumb:vertical:hover
// becomes .fxsb-thumb.fxsb-v:hover), so every era's skin keeps a single source.

const LINE = 20, DELAY = 400, REPEAT = 50;

function rewrite(css, base) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!sel.includes('::-webkit-scrollbar')) continue;
    out += sel.replace(/::-webkit-scrollbar(-[a-z-]+)?/g, '.fxsb$1')
      .replace(/:(vertical|horizontal|decrement|increment|start|end)\b/g, (_, p) => '.fxsb-' + p)
      + '{' + body.replace(/url\(\s*(['"]?)(?!data:)([^'")]+)\1\s*\)/g, (_, q, u) => `url("${new URL(u, base)}")`) + '}\n';
  }
  return out;
}

const bars = new Map();   // scroller -> { v, h, corner }
let thick = 16;

const part = (cls, dir) => { const d = document.createElement('div'); d.className = `${cls} fxsb-${dir}`; return d; };

function makeBar(el, dir) {
  const bar = part('fxsb', dir);
  const dec = part('fxsb-button', dir), inc = part('fxsb-button', dir), track = part('fxsb-track', dir), thumb = part('fxsb-thumb', dir);
  dec.classList.add('fxsb-start', 'fxsb-decrement'); inc.classList.add('fxsb-end', 'fxsb-increment');
  track.append(thumb); bar.append(dec, track, inc);
  const v = dir === 'vertical';
  const by = n => v ? el.scrollBy(0, n) : el.scrollBy(n, 0);
  // Hold a button or the track and it keeps going, as Windows does.
  const hold = (e, step) => {
    e.preventDefault(); e.stopPropagation();
    if (step() === false) return;
    let t = setTimeout(function again() { if (step() !== false) t = setTimeout(again, REPEAT); }, DELAY);
    const stop = () => { clearTimeout(t); removeEventListener('pointerup', stop); removeEventListener('pointercancel', stop); };
    addEventListener('pointerup', stop); addEventListener('pointercancel', stop);
  };
  dec.addEventListener('pointerdown', e => hold(e, () => by(-LINE)));
  inc.addEventListener('pointerdown', e => hold(e, () => by(LINE)));
  track.addEventListener('pointerdown', e => {
    if (e.target !== track) return;
    const at = v ? e.clientY : e.clientX;
    hold(e, () => {
      const r = thumb.getBoundingClientRect(), page = (v ? el.clientHeight : el.clientWidth) - LINE;
      if (at < (v ? r.top : r.left)) by(-page); else if (at > (v ? r.bottom : r.right)) by(page); else return false;
    });
  });
  thumb.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    thumb.setPointerCapture(e.pointerId);
    const from = v ? e.clientY : e.clientX, start = v ? el.scrollTop : el.scrollLeft;
    const room = (v ? track.clientHeight - thumb.offsetHeight : track.clientWidth - thumb.offsetWidth) || 1;
    const range = v ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
    const move = m => { const p = start + ((v ? m.clientY : m.clientX) - from) * range / room; if (v) el.scrollTop = p; else el.scrollLeft = p; };
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('lostpointercapture', () => thumb.removeEventListener('pointermove', move), { once: true });
  });
  // Clicks on the bar aren't clicks on what's behind it (an explorer's rubber band, a canvas).
  for (const t of ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu']) bar.addEventListener(t, e => e.stopPropagation());
  // The wheel over the bar scrolls what it belongs to; a horizontal bar turns it sideways.
  bar.addEventListener('wheel', e => {
    e.preventDefault();
    const k = [1, LINE, el.clientHeight][e.deltaMode], d = (e.deltaY || e.deltaX) * k;
    if (v) el.scrollBy(e.deltaX * k, d); else el.scrollBy(d, 0);
  }, { passive: false });
  return bar;
}

function wants(el) {
  if (el === document.documentElement || el === document.body || el.tagName === 'SELECT' || el.closest('.fxsb')) return null;
  const s = getComputedStyle(el), y = s.overflowY, x = s.overflowX;
  if (!/auto|scroll/.test(x + y)) return null;
  return s;
}

function update(el) {
  let b = bars.get(el);
  const s = el.isConnected && wants(el);
  if (!s) { if (b) { b.v.remove(); b.h.remove(); b.corner.remove(); el.classList.remove('fxsb-host'); el.style.paddingRight = el.style.paddingBottom = ''; bars.delete(el); } return; }
  if (!b) {
    b = { v: makeBar(el, 'vertical'), h: makeBar(el, 'horizontal'), corner: document.createElement('div'), sv: false, sh: false };
    b.corner.className = 'fxsb-corner';
    el.classList.add('fxsb-host');
    bars.set(el, b);
  }
  // The bars sit beside the scroller, not in it, so they don't scroll away with the content.
  if (el.nextSibling !== b.v) el.after(b.v, b.h, b.corner);
  // Make room for the bars the way a real scrollbar takes it from the content box.
  // shortcut: this replaces any inline padding the app set on a scroller; none do yet.
  const sv = s.overflowY === 'scroll' || (s.overflowY === 'auto' && el.scrollHeight > el.clientHeight + 1);
  const sh = s.overflowX === 'scroll' || (s.overflowX === 'auto' && el.scrollWidth > el.clientWidth + 1);
  if (sv !== b.sv || sh !== b.sh || el.dataset.fxsbT != thick) {
    el.style.paddingRight = el.style.paddingBottom = '';
    const cs = getComputedStyle(el);
    if (sv) el.style.paddingRight = `calc(${cs.paddingRight} + ${thick}px)`;
    if (sh) el.style.paddingBottom = `calc(${cs.paddingBottom} + ${thick}px)`;
    b.sv = sv; b.sh = sh; el.dataset.fxsbT = thick;
  }
  const shown = el.offsetParent && el.clientWidth > 0 && el.clientHeight > 0;
  const x = el.offsetLeft + el.clientLeft, y = el.offsetTop + el.clientTop;
  const w = el.clientWidth - (sv ? thick : 0), h = el.clientHeight - (sh ? thick : 0);
  place(b.v, shown && sv, x + w, y, thick, h);
  place(b.h, shown && sh, x, y + h, w, thick);
  place(b.corner, shown && sv && sh, x + w, y + h, thick, thick);
  if (sv) thumb(b.v, el.clientHeight, el.scrollHeight, el.scrollTop, true);
  if (sh) thumb(b.h, el.clientWidth, el.scrollWidth, el.scrollLeft, false);
}

function place(d, on, x, y, w, h) {
  d.hidden = !on;
  if (on) Object.assign(d.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
}

function thumb(bar, client, total, pos, v) {
  const track = bar.children[1], t = track.firstChild;
  const len = v ? track.clientHeight : track.clientWidth;
  const range = total - client;
  t.hidden = range <= 0 || len < thick;
  if (t.hidden) return;
  const size = Math.max(Math.round(len * client / total), Math.min(thick, len));
  const at = Math.round((len - size) * Math.min(1, pos / range));
  Object.assign(t.style, v ? { top: at + 'px', height: size + 'px', left: 0, right: 0 } : { left: at + 'px', width: size + 'px', top: 0, bottom: 0 });
}

function measure() {
  const probe = document.createElement('div'); probe.className = 'fxsb fxsb-vertical'; probe.hidden = true;
  probe.style.display = 'block'; probe.style.position = 'absolute';
  document.body.append(probe);
  thick = parseFloat(getComputedStyle(probe).width) || 16;
  probe.remove();
}

let pending = 0;
function scan() {
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    for (const el of document.body.getElementsByTagName('*')) if (!bars.has(el) && wants(el)) update(el);
    for (const el of [...bars.keys()]) update(el);
  });
}

export async function initScrollbars() {
  if (CSS.supports('selector(::-webkit-scrollbar)')) return;
  const sheets = [...document.querySelectorAll('link[rel=stylesheet]')].filter(l => new URL(l.href).origin === location.origin);
  const css = await Promise.all(sheets.map(l => fetch(l.href).then(r => r.text()).then(t => rewrite(t, l.href)).catch(() => '')));
  const style = document.createElement('style');
  style.textContent = '.fxsb-host { scrollbar-width: none; }\n'
    + '.fxsb, .fxsb-corner { position: absolute; z-index: 1; box-sizing: border-box; }\n'
    + '.fxsb { display: flex; }\n.fxsb.fxsb-vertical { flex-direction: column; }\n'
    + '.fxsb[hidden], .fxsb-corner[hidden], .fxsb-thumb[hidden] { display: none; }\n'
    + '.fxsb-button { flex: none; box-sizing: border-box; }\n'
    + '.fxsb-track { flex: 1; position: relative; min-width: 0; min-height: 0; }\n'
    + '.fxsb-thumb { position: absolute; box-sizing: border-box; }\n'
    + css.join('');
  document.head.append(style);
  const remeasure = () => { measure(); scan(); };
  remeasure();
  // Our own writes to the bars don't count as changes.
  new MutationObserver(recs => { if (recs.some(r => !r.target.closest?.('.fxsb, .fxsb-corner'))) scan(); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  new MutationObserver(remeasure).observe(document.documentElement, { attributes: true, attributeFilter: ['data-win'] });
  addEventListener('scroll', e => { if (bars.has(e.target)) update(e.target); }, true);
  for (const t of ['resize', 'input', 'load', 'pointerup']) addEventListener(t, scan, true);
  setInterval(scan, 1000);   // content that grows without a DOM change, like images decoding
}
