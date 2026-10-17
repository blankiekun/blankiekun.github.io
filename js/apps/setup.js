// Windows Setup: upgrade or downgrade to another Windows. The pick is saved and the page
// reloads into it after a pretend install. Also the "out of date" balloon by the clock.

import { h, icon, store, wait, reducedMotion } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { msgbox } from '../dialogs.js';
import { VERSIONS, V, OS, KEY } from '../version.js';

const HINT = 'w95.updatehint';
const at = VERSIONS.indexOf(V);
const label = r => `blankiekun ${r.short} (${r.date[0]})`;

function open() {
  let pick = at;
  const opts = VERSIONS.map((r, i) => {
    const o = h('div', { class: 'opt' + (i === at ? ' sel' : ''), role: 'option', 'aria-selected': String(i === at) },
      label(r) + (i === at ? '  (installed)' : ''));
    o.addEventListener('click', () => choose(i));
    o.addEventListener('dblclick', () => install(i));
    return o;
  });
  const list = h('div', { class: 'listbox su-list', tabindex: '0', role: 'listbox', 'aria-label': 'Versions' }, ...opts);
  list.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); choose(Math.max(0, Math.min(VERSIONS.length - 1, pick + (e.key === 'ArrowDown' ? 1 : -1)))); }
    if (e.key === 'Enter') install(pick);
  });
  const go = h('button', { class: 'btn default', type: 'button', onclick: () => install(pick) });
  function choose(i) {
    pick = i;
    opts.forEach((o, j) => { o.classList.toggle('sel', j === i); o.setAttribute('aria-selected', String(j === i)); if (j === i) o.scrollIntoView({ block: 'nearest' }); });
    go.textContent = i > at ? 'Upgrade' : i < at ? 'Downgrade' : 'Reinstall';
  }
  const step = d => VERSIONS[at + d] ? h('button', { class: 'btn', type: 'button', onclick: () => install(at + d) }, (d > 0 ? 'Upgrade to ' : 'Downgrade to ') + VERSIONS[at + d].short) : null;
  const body = h('div', { class: 'dlg' },
    h('div', { class: 'row' }, icon('i-computer'), h('div', { class: 'msg' },
      `You are running ${OS}, version ${V.number}.\n\nChoose the version of Windows to install. Your files and settings are kept.`)),
    list,
    h('div', { class: 'btns' }, step(-1), step(1)),
    h('div', { class: 'btns right' }, go, h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel')));
  choose(at);
  const win = createWindow({ app: 'setup', title: 'Windows Setup', icon: 'i-computer', body, dialog: true, resizable: false, width: 'auto', taskbar: true, route: 'setup' });
  list.focus();

  async function install(i) {
    const r = VERSIONS[i];
    const b = await msgbox({ title: 'Windows Setup', icon: 'question', parent: win, buttons: ['&Yes', '&No'],
      text: `Setup will ${i > at ? 'upgrade' : i < at ? 'downgrade' : 'reinstall'} your computer to blankiekun ${r.short} and restart it.\n\nDo you want to continue?` });
    if (b !== 'Yes') return;
    win.close(true);
    await copying(r);
    store.set(KEY, r.id);
    store.set(HINT, true);
    try { sessionStorage.removeItem('w95.booted'); } catch {}
    location.hash = '';
    location.reload();
  }
}

// The blue Setup screen with its file-copy bar.
async function copying(r) {
  const FILES = ['KRNL386.EXE', 'USER.EXE', 'GDI.EXE', 'SHELL32.DLL', 'EXPLORER.EXE', 'COMMAND.COM', 'WIN.INI', 'SYSTEM.INI'];
  const file = h('p'), fill = h('div', { class: 'su-fill' });
  const scr = h('div', { class: 'screen su-screen', role: 'status' },
    h('h1', null, `blankiekun ${r.short} Setup`),
    h('p', null, `Setup is installing blankiekun ${r.short} on your computer. This will take a moment.`),
    file, h('div', { class: 'su-bar' }, fill));
  document.body.append(scr);
  const n = reducedMotion.matches ? 2 : 24;
  for (let i = 0; i <= n; i++) {
    file.textContent = 'Copying files... C:\\WINDOWS\\SYSTEM\\' + FILES[i % FILES.length];
    fill.style.width = Math.round(i / n * 100) + '%';
    await wait(120);
  }
}

// A balloon by the clock, a minute in, that says there's another version to try.
// Closing it, or opening Setup from it, keeps it away for good.
function balloon() {
  if (store.get(HINT, false) || document.body.classList.contains('solo')) return;
  const last = at === VERSIONS.length - 1;
  const done = () => { store.set(HINT, true); b.remove(); };
  const b = h('div', { class: 'su-balloon', role: 'status' },
    h('button', { class: 'tbtn su-x', type: 'button', 'aria-label': 'Close', onclick: done }, icon('i-x')),
    h('b', null, icon('i-info'), last ? 'Feeling nostalgic?' : 'Your version of Windows is out of date'),
    h('p', null, last ? 'Click here to downgrade to an older blankiekun.' : 'Click here to upgrade, or downgrade, to another blankiekun.'));
  b.addEventListener('click', e => { if (e.target.closest('.su-x')) return; done(); launch('setup'); });
  document.body.append(b);
  setTimeout(() => b.remove(), 20000);
}
setTimeout(balloon, 60000);

export default { id: 'setup', title: 'Windows Setup', icon: 'i-computer', single: true, open };
