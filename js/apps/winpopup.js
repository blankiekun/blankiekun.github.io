// WinPopup: pop-up messages on the network. There is no network, so nothing gets delivered.

import { h, icon } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import { formatTime, formatDate } from './control.js';

// The one message waiting when WinPopup starts, as if someone on the LAN sent it.
const INBOX = [{ from: 'SYSOP', to: 'BLANKIEKUN', at: new Date(), text: 'The file server is going down at 5:00 PM for backups. Please save your work and log off.' }];

function open() {
  let cur = INBOX.length - 1;
  const head = h('div', { class: 'wp-head' });
  const text = h('div', { class: 'wp-text field', tabindex: '0' });
  const status = h('div', { class: 'statusbar' }, h('span'));
  const discardBtn = h('button', { class: 'btn wp-tool', type: 'button', title: 'Discard Message', onclick: discard }, icon('i-x'));
  const prevBtn = h('button', { class: 'btn wp-tool', type: 'button', title: 'Previous Message', onclick: () => go(-1) }, '◄');
  const nextBtn = h('button', { class: 'btn wp-tool', type: 'button', title: 'Next Message', onclick: () => go(1) }, '►');

  function render() {
    const m = INBOX[cur];
    head.textContent = m ? `Message from ${m.from} to ${m.to} on ${formatDate(m.at)} ${formatTime(m.at)}` : '';
    text.textContent = m ? m.text : '';
    status.firstChild.textContent = INBOX.length ? `Number of messages: ${INBOX.length}` : 'No messages';
    discardBtn.disabled = !m;
    prevBtn.disabled = cur <= 0;
    nextBtn.disabled = cur >= INBOX.length - 1;
  }
  function go(d) { cur = Math.max(0, Math.min(INBOX.length - 1, cur + d)); render(); }
  function discard() { INBOX.splice(cur, 1); cur = Math.min(cur, INBOX.length - 1); render(); }

  function send() {
    const to = h('input', { class: 'field', 'aria-label': 'User or computer', style: { width: '100%' } });
    const msg = h('textarea', { class: 'field', rows: 5, maxlength: 128, 'aria-label': 'Message', style: { width: '100%' } });
    const form = h('form', { class: 'dlg', style: { width: '320px' } },
      h('fieldset', { class: 'group' }, h('legend', null, 'To'),
        h('label', { class: 'wp-radio' }, h('input', { type: 'radio', name: 'wp-to', checked: true }), 'User or computer'),
        h('label', { class: 'wp-radio' }, h('input', { type: 'radio', name: 'wp-to' }), 'Workgroup'),
        to),
      h('label', { class: 'wp-col' }, 'Message:', msg),
      h('div', { class: 'btns right' },
        h('button', { class: 'btn default', type: 'submit' }, 'OK'),
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!to.value.trim()) { to.focus(); return; }
      dlg.close();
      msgbox({ title: 'WinPopup', icon: 'error', parent: win,
        text: `The message could not be delivered because the user or computer '${to.value.trim().toUpperCase()}' was not found on the network.` });
    });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); dlg.close(); } });
    const dlg = createWindow({ title: 'Send Message', body: form, dialog: true, resizable: false, width: 'auto', taskbar: false, parent: win });
    to.focus();
  }

  const bar = menubar([
    { label: '&Messages', items: () => [
      { label: '&Send...', action: send },
      { label: '&Discard', disabled: !INBOX.length, action: discard },
      { label: '&Previous', disabled: cur <= 0, action: () => go(-1) },
      { label: '&Next', disabled: cur >= INBOX.length - 1, action: () => go(1) }, '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') }, '-',
      { label: '&About WinPopup', action: () => about('WinPopup', 'i-winpopup', win) },
    ] },
  ]);
  const body = h('div', { class: 'wp' }, bar,
    h('div', { class: 'wp-tools' }, h('button', { class: 'btn wp-tool', type: 'button', title: 'Send', onclick: send }, icon('i-winpopup')), discardBtn, prevBtn, nextBtn),
    head, text, status);
  const win = createWindow({ app: 'winpopup', title: 'WinPopup', icon: 'i-winpopup', body, width: 360, height: 240, minW: 240, minH: 160, route: 'winpopup' });
  render();
  return win;
}

export default { id: 'winpopup', title: 'WinPopup', icon: 'i-winpopup', open };
