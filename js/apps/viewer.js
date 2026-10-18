// Picture viewer: Imaging in 98/Me/2000, Picture and Fax Viewer in XP, Photo Viewer in Vista/7, Photos from 8.
// Images from the pretend disk open here instead of Paint when the era has it (ONLY in version.js).

import { h, clamp } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { about } from '../dialogs.js';
import { resolve, parentOf } from '../fs.js';

// Position after stepping d places through n pictures, wrapping round.
export const step = (i, d, n) => (i + d + n) % n;
console.assert(step(0, -1, 3) === 2 && step(2, 1, 3) === 0 && step(1, 1, 3) === 2, 'viewer: previous/next wrap');

function open(arg = {}) {
  // shortcut: siblings come from the file's own folder by path, so a picture opened from a floppy or the clipboard has no previous/next; upgrade if those ever matter.
  const node = arg.path && resolve(arg.path);
  const folder = node && parentOf(node);
  let pics = folder ? folder.children.filter(c => c.kind === 'file' && c.data).sort((a, b) => a.name.localeCompare(b.name)) : [];
  let i = pics.indexOf(node);
  if (i < 0) { pics = []; i = 0; }      // not in its folder's list (moved, or a copy): show just this one
  let cur = arg, zoom = 0, rot = 0;      // zoom 0 = fit the window

  const img = h('img', { class: 'vw-img', alt: '' });
  const stage = h('div', { class: 'vw-stage' }, img);
  const status = h('div', { class: 'statusbar' });

  function show() {
    const { naturalWidth: w, naturalHeight: ht } = img;
    const swap = rot % 180;
    const fit = w ? Math.min(1, (stage.clientWidth - 8) / (swap ? ht : w), (stage.clientHeight - 8) / (swap ? w : ht)) : 1;
    const z = zoom || fit;
    // The box is the rotated size so the scrollbars fit; the image is turned about its centre inside it.
    const bw = (swap ? ht : w) * z, bh = (swap ? w : ht) * z;
    img.style.cssText = `width:${w * z}px;height:${ht * z}px;transform:rotate(${rot}deg);margin:${(bh - ht * z) / 2}px ${(bw - w * z) / 2}px`;
    status.textContent = `${cur.name}  ${w} x ${ht}  ${Math.round(z * 100)}%` + (pics.length > 1 ? `  (${i + 1} of ${pics.length})` : '');
  }
  function load(f) {
    if (!f.data) return;   // started from IMGVIEW.EXE with no picture
    cur = f; rot = 0; zoom = 0;
    img.src = f.data;
    win.setTitle(f.name + ' - ' + win.opts.title);
  }
  const go = d => { if (pics.length > 1) { i = step(i, d, pics.length); load(pics[i]); } };
  const zoomBy = f => { zoom = clamp((zoom || parseFloat(img.style.width) / img.naturalWidth || 1) * f, 0.05, 16); show(); };
  const turn = d => { rot = (rot + d + 360) % 360; show(); };
  const items = [
    ['Previous', () => go(-1)], ['Next', () => go(1)], ['Zoom In', () => zoomBy(1.25)], ['Zoom Out', () => zoomBy(0.8)],
    ['Best Fit', () => { zoom = 0; show(); }], ['Rotate Left', () => turn(-90)], ['Rotate Right', () => turn(90)],
    ['Edit', () => launch('paint', cur)],
  ];
  const tools = h('div', { class: 'vw-tools' }, ...items.map(([t, fn]) => h('button', { type: 'button', class: 'btn', onclick: fn }, t)));

  const bar = menubar([
    { label: '&File', items: () => [
      { label: '&Edit', action: items[7][1] },
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&View', items: () => [
      { label: 'Zoom &In', action: items[2][1] }, { label: 'Zoom &Out', action: items[3][1] }, { label: '&Best Fit', action: items[4][1] },
      '-',
      { label: 'Rotate &Left', action: items[5][1] }, { label: 'Rotate &Right', action: items[6][1] },
      '-',
      { label: '&Previous', action: items[0][1] }, { label: '&Next', action: items[1][1] },
    ] },
    { label: '&Help', items: () => [{ label: '&About...', action: () => about('Picture Viewer', 'i-viewer', win) }] },
  ]);
  const root = h('div', { class: 'vw', tabindex: '-1' }, bar, tools, stage, status);
  root.addEventListener('keydown', e => {
    const fn = { ArrowLeft: items[0][1], ArrowRight: items[1][1], '+': items[2][1], '-': items[3][1] }[e.key];
    if (fn) { e.preventDefault(); fn(); }
  });
  img.addEventListener('load', show);

  const win = createWindow({
    app: 'viewer', title: 'Picture Viewer', icon: 'i-viewer', body: root,
    width: 560, height: 420, minW: 280, minH: 200, autofocus: '.vw',
    onResize: show,
  });
  load(cur);
  return win;
}

export default { id: 'viewer', title: 'Picture Viewer', icon: 'i-viewer', open };
