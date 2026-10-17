// Message boxes and the other small modal dialogs.

import { h, icon, accel } from './util.js';
import { createWindow } from './wm.js';
import { OS, V, rename } from './version.js';

const ICONS = { error: 'i-error', info: 'i-info', warn: 'i-warn', question: 'i-question' };

// Resolves with the label of the button pressed ('OK', 'Yes', ...), or null when closed.
export function msgbox({ title = OS, text, icon: kind = 'info', buttons = ['OK'], parent, html }) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; resolve(v); win.close(true); };
    const btns = buttons.map((b, i) => h('button', {
      class: 'btn' + (i === 0 ? ' default' : ''), type: 'button',
      onclick: () => finish(b.replace('&', '')),
    }, h('span', { html: accel(b).html })));
    const msg = h('div', { class: 'msg' });
    if (html) msg.innerHTML = rename(html); else msg.textContent = rename(text);
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
    const ev = { error: 'Critical Stop', warn: 'Exclamation', info: 'Asterisk', question: 'Question', 'i-warn': 'Exclamation' }[kind];
    if (ev) import('./apps/control.js').then(m => m.playSound && m.playSound(ev)).catch(() => {});
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
// extra: more lines under the app's name, such as its version.
export function about(appName, appIcon, parent, extra) {
  const body = h('div', { class: 'dlg about' },
    h('div', { class: 'row' },
      h('div', { class: 'about-logo' }, icon('i-flag'), appIcon ? icon(appIcon) : null),
      h('div', { class: 'about-text' },
        h('p', null, h('b', null, OS), h('br'), rename(appName)),
        extra ?? null,
        h('p', null, V.copy ? `Copyright © ${V.copy} blankiekun` : '© blankiekun'),
        h('p', null, 'This product is licensed to:', h('br'), h('a', { href: 'https://github.com/blankiekun', target: '_blank', rel: 'noopener' }, 'github.com/blankiekun')),
        h('hr'),
        h('p', null, `Physical Memory Available to Windows:  ${V.ramKB.toLocaleString('en-US')} KB`, h('br'), 'System Resources:  87% Free'))),
    h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'button', onclick: () => win.close() }, 'OK')));
  body.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); win.close(); } });
  const win = createWindow({ title: 'About ' + appName, body, dialog: true, resizable: false, width: 'auto', parent, taskbar: !parent });
  body.querySelector('.btn').focus();
  return win;
}
