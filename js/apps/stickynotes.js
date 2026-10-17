// Sticky Notes, from Windows 7 on: yellow notes that stay put until you delete them.
// Every note is its own window; their text and places are kept in localStorage.

import { h, store } from '../util.js';
import { createWindow, find } from '../wm.js';
import { msgbox } from '../dialogs.js';

const KEY = 'w95.notes';
const COLOURS = ['yellow', 'blue', 'green', 'pink', 'purple', 'white'];
const saved = () => store.get(KEY, []);
function save(note) {
  const list = saved().filter(n => n.id !== note.id);
  store.set(KEY, note.gone ? list : [...list, note]);
}

function note(n) {
  const text = h('textarea', { class: 'sn-text', 'aria-label': 'Note', spellcheck: false }, n.text);
  const where = () => { const r = win.el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const keep = () => save({ ...n, ...where(), text: text.value });
  text.addEventListener('input', keep);
  const add = h('button', { class: 'sn-add', type: 'button', title: 'New Note', 'aria-label': 'New Note', onclick: () => note({ id: Date.now(), text: '', colour: n.colour }) }, '+');
  const body = h('div', { class: 'sn' }, text);
  body.addEventListener('contextmenu', e => {
    if (e.target === text && text.selectionStart !== text.selectionEnd) return;
    e.preventDefault();
    import('../menu.js').then(m => m.openMenu(COLOURS.map(c => ({ label: c[0].toUpperCase() + c.slice(1), radio: true, checked: n.colour === c,
      action: () => { win.el.classList.replace('sn-' + n.colour, 'sn-' + c); n.colour = c; keep(); } })), { x: e.clientX, y: e.clientY }));
  });
  const win = createWindow({ app: 'stickynotes', title: 'Sticky Notes', icon: 'i-stickynotes', body, className: 'sn-win sn-' + n.colour,
    width: n.w || 200, height: n.h || 190, minW: 140, minH: 100, x: n.x, y: n.y, maximizable: false,
    // The note's X deletes it, as in Windows; closing from the taskbar would too, so it asks first.
    onClose: async () => {
      if (text.value.trim() && await msgbox({ title: 'Sticky Notes', icon: 'warn', text: 'Are you sure you want to delete this note?', buttons: ['&Yes', '&No'], parent: win }) !== 'Yes') return false;
      save({ ...n, gone: true });
    } });
  win.bar.prepend(add);
  // Moving or resizing the window ends with a click; that's when the place gets saved.
  win.el.addEventListener('pointerup', () => setTimeout(keep));
  keep();
  text.focus();
  return win;
}

function open() {
  const list = saved();
  if (find(w => w.app === 'stickynotes') || !list.length) return note({ id: Date.now(), text: '', colour: 'yellow' });
  let last;
  for (const n of list) last = note(n);
  return last;
}

export default { id: 'stickynotes', title: 'Sticky Notes', icon: 'i-stickynotes', open };
