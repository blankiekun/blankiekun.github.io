// Message boxes and the other small modal dialogs.

import { h, icon, accel } from './util.js';
import { createWindow } from './wm.js';

const ICONS = { error: 'i-error', info: 'i-info', warn: 'i-warn', question: 'i-question' };

// Resolves with the label of the button pressed ('OK', 'Yes', ...), or null when closed.
export function msgbox({ title = 'blankiekun 95', text, icon: kind = 'info', buttons = ['OK'], parent, html }) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; resolve(v); win.close(true); };
    const btns = buttons.map((b, i) => h('button', {
      class: 'btn' + (i === 0 ? ' default' : ''), type: 'button', html: accel(b).html,
      onclick: () => finish(b.replace('&', '')),
    }));
    const msg = h('div', { class: 'msg' });
    if (html) msg.innerHTML = html; else msg.textContent = text;
    const body = h('div', { class: 'dlg' },
      h('div', { class: 'row' }, kind ? icon(ICONS[kind] || kind) : null, msg),
      h('div', { class: 'btns' }, btns));
    body.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); finish(buttons.includes('Cancel') ? 'Cancel' : buttons.length === 1 ? buttons[0].replace('&', '') : null); }
      const k = e.key.toLowerCase();
      const b = buttons.findIndex(b => accel(b).key === k);
      if (b >= 0 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); btns[b].click(); }
    });
    const win = createWindow({
      title, body, dialog: true, resizable: false, width: 'auto', taskbar: !parent, parent,
      icon: null, onClose: () => { if (!done) { done = true; resolve(null); } },
    });
    btns[0].focus();
  });
}

// A dialog with a single text field. Resolves with the text, or null on Cancel.
export function inputbox({ title, label, value = '', parent, ok = 'OK' }) {
  return new Promise(resolve => {
    let done = false;
    const input = h('input', { class: 'field', value, style: { width: '100%' } });
    const finish = v => { if (done) return; done = true; resolve(v); win.close(true); };
    const body = h('form', { class: 'dlg', style: { width: '320px' } },
      h('label', null, label, input),
      h('div', { class: 'btns right' },
        h('button', { class: 'btn default', type: 'submit' }, ok),
        h('button', { class: 'btn', type: 'button', onclick: () => finish(null) }, 'Cancel')));
    body.querySelector('label').style.cssText = 'display:flex;flex-direction:column;gap:4px';
    body.addEventListener('submit', e => { e.preventDefault(); finish(input.value); });
    body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); finish(null); } });
    const win = createWindow({
      title, body, dialog: true, resizable: false, width: 'auto', taskbar: !parent, parent,
      onClose: () => { if (!done) { done = true; resolve(null); } },
    });
    input.focus();
    input.select();
  });
}

// Help > About for every app: the classic shell About box.
export function about(appName, appIcon, parent) {
  const body = h('div', { class: 'dlg about' },
    h('div', { class: 'row' },
      h('div', { class: 'about-logo' }, icon('i-flag'), appIcon ? icon(appIcon) : null),
      h('div', { class: 'about-text' },
        h('p', null, h('b', null, 'blankiekun 95'), h('br'), appName),
        h('p', null, 'Copyright © 1981-1995 blankiekun'),
        h('p', null, 'This product is licensed to:', h('br'), h('a', { href: 'https://github.com/blankiekun', target: '_blank', rel: 'noopener' }, 'github.com/blankiekun')),
        h('hr'),
        h('p', null, 'Physical Memory Available to Windows:  16,384 KB', h('br'), 'System Resources:  87% Free'))),
    h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'button', onclick: () => win.close() }, 'OK')));
  body.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); win.close(); } });
  const win = createWindow({ title: 'About ' + appName, body, dialog: true, resizable: false, width: 'auto', parent, taskbar: !parent });
  body.querySelector('.btn').focus();
  return win;
}
