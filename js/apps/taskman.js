// Close Program, the Ctrl+Alt+Del box. Pressing Ctrl+Alt+Del again while it's
// open restarts the computer, which is exactly what the warning says.

import { h } from '../util.js';
import { createWindow, all, close, find } from '../wm.js';

function open() {
  const existing = find(w => w.app === 'taskman');
  if (existing) { restart(); return existing; }
  let picked = null;
  const list = h('div', { class: 'listbox tm-list', tabindex: '0', role: 'listbox', 'aria-label': 'Programs' });
  function fill() {
    list.replaceChildren();
    const progs = all().filter(w => w.task && w.app !== 'taskman');
    // Explorer is always running, as in Win95; ending it is not a good idea.
    for (const w of [...progs, null]) {
      const o = h('div', { class: 'opt', role: 'option' }, w ? w.el.getAttribute('aria-label') : 'Explorer');
      o.win = w;
      o.addEventListener('click', () => pick(o));
      o.addEventListener('dblclick', () => { pick(o); end(); });
      list.append(o);
    }
    pick(list.firstChild);
  }
  function pick(o) {
    list.querySelectorAll('.opt').forEach(x => x.classList.toggle('sel', x === o));
    picked = o;
  }
  function end() {
    if (!picked) return;
    if (!picked.win) { restart(); return; }
    close(picked.win, true);
    fill();
    list.focus();
  }
  list.addEventListener('keydown', e => {
    const opts = [...list.children], i = opts.indexOf(picked);
    if (e.key === 'ArrowDown') { e.preventDefault(); pick(opts[Math.min(opts.length - 1, i + 1)]); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pick(opts[Math.max(0, i - 1)]); }
    else if (e.key === 'Enter') { e.preventDefault(); end(); }
  });
  const body = h('div', { class: 'dlg tm' },
    list,
    h('p', { class: 'tm-warn' }, 'WARNING: Pressing CTRL+ALT+DEL again will restart your computer. You will lose unsaved information in all programs that are running.'),
    h('div', { class: 'btns' },
      h('button', { class: 'btn', type: 'button', onclick: end }, h('u', null, 'E'), 'nd Task'),
      h('button', { class: 'btn', type: 'button', onclick: () => { win.close(); import('../desktop.js').then(m => m.shutDown && m.shutDown()); } }, h('u', null, 'S'), 'hut Down'),
      h('button', { class: 'btn default', type: 'button', onclick: () => win.close() }, 'Cancel')));
  body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  const win = createWindow({ app: 'taskman', title: 'Close Program', body, dialog: true, resizable: false, width: 'auto', taskbar: false });
  win.el.style.zIndex = 9000;
  fill();
  list.focus();
  return win;
}

function restart() {
  try { sessionStorage.removeItem('w95.booted'); } catch {}
  history.replaceState(null, '', location.pathname);
  location.reload();
}

// Most systems keep Ctrl+Alt+Del for themselves; Ctrl+Alt+End and Ctrl+Shift+Esc get through.
document.addEventListener('keydown', e => {
  const cad = e.ctrlKey && e.altKey && (e.key === 'Delete' || e.key === 'End');
  const cse = e.ctrlKey && e.shiftKey && e.key === 'Escape';
  if (!cad && !cse) return;
  e.preventDefault();
  open();
});

export default { id: 'taskman', title: 'Close Program', icon: 'i-exe', open };
