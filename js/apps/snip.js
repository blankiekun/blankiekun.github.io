// Snipping Tool, 7 onward: New dims the screen, and the box dragged over it opens in Paint.
// There's no way to photograph the page without a library, so only canvases (Paint, the games,
// CONscripter) come out as pixels; the desktop, windows and taskbar are drawn as plain shapes.

import { h, marquee } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { about } from '../dialogs.js';

// A client rect as x, y, w, h inside the snip whose corner is at r.
export const local = (b, r) => ({ x: b.left - r.left, y: b.top - r.top, w: b.right - b.left, h: b.bottom - b.top });
console.assert(JSON.stringify(local({ left: 15, top: 30, right: 25, bottom: 70 }, { left: 10, top: 20 })) === '{"x":5,"y":10,"w":10,"h":40}', 'snip: rect into snip space');

// shortcut: anything that isn't a canvas is a flat box (titles kept, icons, text and gradients lost), and a WebGL
// canvas without preserveDrawingBuffer comes out blank; upgrade with a DOM rasterizer if snips of text ever matter.
function render(r) {
  const c = h('canvas', { width: r.right - r.left, height: r.bottom - r.top }), ctx = c.getContext('2d');
  const css = el => getComputedStyle(el);
  const box = (el, fill = css(el).backgroundColor) => { const b = local(el.getBoundingClientRect(), r); ctx.fillStyle = fill; ctx.fillRect(b.x, b.y, b.w, b.h); };
  const pixels = (cv, off, within) => {
    const b = local(cv.getBoundingClientRect(), r);
    ctx.save(); ctx.beginPath(); ctx.rect(within.x, within.y, within.w, within.h); ctx.clip();   // a scrolled canvas stays inside its window
    try { ctx.drawImage(cv, b.x + off.x, b.y + off.y, b.w, b.h); } catch {}
    ctx.restore();
  };
  box(document.body, css(document.getElementById('desktop')).backgroundColor);
  const shown = el => el.checkVisibility({ visibilityProperty: true });
  const wins = [...document.querySelectorAll('.win')].filter(shown).sort((a, b) => (+css(a).zIndex || 0) - (+css(b).zIndex || 0));
  for (const w of wins) {
    const wb = local(w.getBoundingClientRect(), r);
    ctx.save(); ctx.beginPath(); ctx.rect(wb.x, wb.y, wb.w, wb.h); ctx.clip();
    // Every coloured element as a flat box, in document order, which is near enough to paint order.
    for (const el of [w, ...w.querySelectorAll('*')]) if (!/, 0\)$|transparent/.test(css(el).backgroundColor) && shown(el)) box(el);
    const t = w.querySelector('.titlebar .t'), tb = local(t.getBoundingClientRect(), r);
    ctx.fillStyle = css(t).color; ctx.font = css(t).font; ctx.textBaseline = 'middle';
    ctx.fillText(t.textContent, tb.x, tb.y + tb.h / 2);
    const body = w.querySelector('.win-body'), inner = local(body.getBoundingClientRect(), r);
    for (const cv of body.querySelectorAll('canvas')) pixels(cv, { x: 0, y: 0 }, inner);
    for (const f of body.querySelectorAll('iframe')) {
      let doc = null;
      try { doc = f.contentDocument; } catch {}
      const fb = local(f.getBoundingClientRect(), r);
      if (doc) for (const cv of doc.querySelectorAll('canvas')) pixels(cv, { x: fb.x, y: fb.y }, inner);
    }
    ctx.restore();
  }
  const task = document.getElementById('taskbar');
  if (shown(task)) box(task);
  return c;
}

function open() {
  const snip = () => {
    win.el.style.visibility = 'hidden';
    let last = null, done = false;
    const dim = h('div', { class: 'snip-dim', tabindex: '-1' });
    const finish = ok => {
      if (done) return;
      done = true;
      const data = ok && last && last.right - last.left >= 3 && last.bottom - last.top >= 3 && render(last).toDataURL();
      dim.remove(); win.el.style.visibility = '';
      if (data) launch('paint', { name: 'Snip.png', data });
    };
    dim.addEventListener('pointerdown', e => { if (e.button === 0) { e.preventDefault(); marquee(e, rc => { last = rc; }); } });
    dim.addEventListener('pointerup', () => finish(true));
    dim.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
    document.body.append(dim);
    dim.focus();
  };
  const bar = menubar([
    { label: '&File', items: () => [{ label: '&New Snip', action: snip }, '-', { label: 'E&xit', action: () => win.close() }] },
    { label: '&Help', items: () => [{ label: '&About Snipping Tool...', action: () => about('Snipping Tool', 'i-snip', win) }] },
  ]);
  const body = h('div', { class: 'snip' }, bar,
    h('div', { class: 'snip-tools' }, h('button', { type: 'button', class: 'btn', onclick: snip }, 'New')),
    h('p', { class: 'snip-hint' }, 'Click New, then drag a box around the part of the screen you want. Esc cancels.'));
  const win = createWindow({ app: 'snip', title: 'Snipping Tool', icon: 'i-snip', body, width: 300, height: 140, minW: 200, minH: 110 });
  return win;
}

export default { id: 'snip', title: 'Snipping Tool', icon: 'i-snip', open };
