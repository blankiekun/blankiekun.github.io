// System Restore, Me and XP. A restore point is a copy of the system settings (display,
// sounds, mouse, taskbar and so on); going back to one puts them back and restarts.
// Documents, mail and saved games are left alone, as the real one promised.

import { h, store } from '../util.js';
import { createWindow } from '../wm.js';
import { msgbox } from '../dialogs.js';
import { OS } from '../version.js';

const KEY = 'w95.restore';
const SETTINGS = ['w95.display', 'w95.screensaver', 'w95.sounds', 'w95.mouse', 'w95.regional', 'w95.taskbar', 'w95.volume', 'w95.printers', 'w95.quick', 'w95.addremove'];
const MAX = 10;

const snapshot = () => Object.fromEntries(SETTINGS.map(k => [k, localStorage.getItem(k)]));
const when = t => new Date(t).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });

function points() {
  const list = store.get(KEY, []);
  // The first visit gets the checkpoint Windows would have made on its own.
  if (!list.length) { list.push({ at: Date.now(), name: 'System Checkpoint', s: snapshot() }); store.set(KEY, list); }
  return list;
}

function restore() {
  const band = h('div', { class: 'hs-band' }, h('b', null, 'System Restore'), h('span', null, OS));
  const page = h('div', { class: 'sr-page' });
  const back = h('button', { class: 'btn', type: 'button' }, '< Back');
  const next = h('button', { class: 'btn default', type: 'button' }, 'Next >');
  const cancel = h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel');
  let step;

  const radio = (label, val, on) => h('label', { class: 'sr-opt' }, h('input', { type: 'radio', name: 'sr-do', value: val, checked: on }), label);
  function welcome() {
    page.replaceChildren(h('h2', null, 'Welcome to System Restore'),
      h('div', { class: 'sr-cols' },
        h('div', null, h('p', null, 'You can use System Restore to undo changes to your settings and return your computer to an earlier time, without losing your recent work, such as saved documents and e-mail.'),
          h('p', null, 'Your computer creates restore points, called system checkpoints. You can also create your own restore points.')),
        h('div', null, h('p', null, 'To begin, select the task that you want to perform:'),
          radio('Restore my computer to an earlier time', 'pick', true), radio('Create a restore point', 'make', false))));
    step = { back: null, next: () => (page.querySelector('input:checked').value === 'pick' ? pick : make)() };
    show();
  }

  function pick() {
    const list = points();
    const box = h('div', { class: 'listbox sr-list', role: 'listbox', tabindex: '0', 'aria-label': 'Restore points' });
    let sel = list.length - 1;
    list.forEach((p, i) => {
      const o = h('div', { class: 'opt' + (i === sel ? ' sel' : ''), role: 'option' }, h('b', null, p.name), h('span', null, when(p.at)));
      o.addEventListener('click', () => { sel = i; box.querySelectorAll('.opt').forEach(x => x.classList.toggle('sel', x === o)); });
      o.addEventListener('dblclick', () => step.next());
      box.prepend(o);
    });
    page.replaceChildren(h('h2', null, 'Select a Restore Point'), h('p', null, 'Click the restore point you want to use, newest first, then click Next.'), box);
    step = { back: welcome, next: () => confirm(list[sel]) };
    show();
  }

  function confirm(p) {
    page.replaceChildren(h('h2', null, 'Confirm Restore Point Selection'),
      h('p', { class: 'sr-big' }, when(p.at), h('br'), p.name),
      h('p', null, 'This process does not cause you to lose recent work, such as saved documents or e-mail, and is completely reversible.'),
      h('p', null, 'During the restoration, System Restore shuts down ' + OS + '. After the restoration is complete, your computer restarts using the settings from the date and time listed above.'));
    step = { back: pick, next: () => {
      // The settings as they are now become a point too, so the restore can be undone.
      const list = points();
      list.push({ at: Date.now(), name: 'Restore Operation', s: snapshot() });
      store.set(KEY, list.slice(-MAX));
      for (const [k, v] of Object.entries(p.s)) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
      try { sessionStorage.removeItem('w95.booted'); } catch {}
      history.replaceState(null, '', location.pathname);
      location.reload();
    } };
    show('OK');
  }

  function make() {
    const name = h('input', { class: 'field sr-name', maxlength: 64, 'aria-label': 'Restore point description' });
    page.replaceChildren(h('h2', null, 'Create a Restore Point'),
      h('p', null, 'Your computer creates restore points on its own, but you can make one now, before you change settings you might want to undo.'),
      h('p', null, 'Type a description for this restore point. The current date and time are added to it.'),
      h('label', { class: 'sr-field' }, 'Restore point description:', name));
    step = { back: welcome, next: () => {
      if (!name.value.trim()) return msgbox({ title: 'System Restore', icon: 'warn', parent: win, text: 'Type a description for this restore point.' }).then(() => name.focus());
      const list = points(), p = { at: Date.now(), name: name.value.trim(), s: snapshot() };
      store.set(KEY, [...list, p].slice(-MAX));
      page.replaceChildren(h('h2', null, 'Restore Point Created'), h('p', { class: 'sr-big' }, when(p.at), h('br'), p.name),
        h('p', null, 'To go back to this restore point, open System Restore and choose Restore my computer to an earlier time.'));
      step = { back: welcome, next: () => win.close() };
      show('Close');
    } };
    show();
    name.focus();
  }

  function show(label = 'Next >') {
    back.disabled = !step.back;
    next.textContent = label;
  }
  back.addEventListener('click', () => step.back?.());
  next.addEventListener('click', () => step.next());

  const body = h('div', { class: 'sr' }, band, page, h('div', { class: 'btns right sr-btns' }, back, next, cancel));
  const win = createWindow({ app: 'restore', title: 'System Restore', icon: 'i-clock', body, width: 560, height: 400, minW: 320, minH: 300, route: 'restore' });
  welcome();
  return win;
}

export const restoreApp = { id: 'restore', title: 'System Restore', icon: 'i-clock', single: true, open: restore };
