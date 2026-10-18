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

// The program-crashed box in each era's own words. name is the program's file name ("CRASHME.EXE").
// Resolves when it is dismissed. Nothing is reported anywhere: Send Error Report is a progress bar.
// shortcut: Debug and Ignore just close, there is no debugger and nothing to resume.
export function crash(name, parent) {
  return new Promise(resolve => {
    const prog = name.replace(/\.EXE$/i, ''), hex = n => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, '0');
    const r = () => hex(8), id = V.id;
    const old = ['1.0', '2.0', '3.1'].includes(id), classic = ['95', '98', 'me'].includes(id), aero = ['vista', '7'].includes(id);
    const msg = h('div', { class: 'msg', style: { maxWidth: '340px' } });
    const extra = h('div');
    let btns = [], title = name, text = '', bar = null;
    const done = () => { win.close(true); resolve(); };
    const b = (label, fn = done) => h('button', { class: 'btn', type: 'button', onclick: fn }, label);
    const progress = ms => {
      const i = h('i'); bar = h('div', { class: 'sk-progress', style: { width: '260px', marginTop: '8px' } }, i);
      extra.replaceChildren(bar); i.style.transition = `width ${ms}ms linear`; requestAnimationFrame(() => requestAnimationFrame(() => { i.style.width = '100%'; }));
    };
    if (old) {
      title = 'Application Error'; text = `${prog} caused a General Protection Fault in module ${name} at 0001:0042.`;
      btns = [b('Close'), b('Ignore')];
    } else if (classic) {
      text = 'This program has performed an illegal operation and will be shut down.\n\nIf the problem persists, contact the program vendor.';
      const dump = h('pre', { class: 'field', style: { display: 'none', margin: '8px 0 0', font: '12px monospace', width: '340px', height: '130px', overflow: 'auto', whiteSpace: 'pre', userSelect: 'text' } },
        `${prog} caused an invalid page fault in\nmodule KERNEL32.DLL at 0167:bff7${hex(4)}.\nRegisters:\nEAX=${r()} CS=0167 EIP=bff7${hex(4)} EFLGS=00010246\nEBX=${r()} SS=016f ESP=0063${hex(4)} EBP=0063${hex(4)}\nECX=${r()} DS=016f ESI=${r()} FS=${hex(4)}\nEDX=${r()} ES=016f EDI=${r()} GS=0000\nBytes at CS:EIP:\n${Array.from({ length: 8 }, () => hex(2)).join(' ')}\nStack dump:\n${Array.from({ length: 6 }, r).join(' ')}\n${Array.from({ length: 6 }, r).join(' ')}`);
      const det = b('Details >>', () => { const on = dump.style.display === 'none'; dump.style.display = on ? 'block' : 'none'; det.textContent = on ? '<< Details' : 'Details >>'; });
      extra.append(dump); btns = [b('Close'), det];
    } else if (id === '2000') {
      text = `${name} has generated errors and will be closed by blankiekun. You will need to restart the program.\n\nAn error log is being created.`;
      btns = [b('OK')];
    } else if (id === 'xp') {
      text = `${name} has encountered a problem and needs to close.  We are sorry for the inconvenience.\n\nIf you were in the middle of something, the information you were working on might be lost.`;
      const send = b('Send Error Report', () => {
        btns.forEach(x => { x.disabled = true; }); msg.textContent = 'Error Reporting is sending the report...'; progress(1500); setTimeout(done, 1600);
      });
      btns = [b('Debug'), send, b("Don't Send")];
    } else {
      text = `${name} has stopped working`;
      const close = b('Close program'); close.disabled = aero;
      btns = [close];
      const fin = () => { msg.textContent = ''; msg.append(h('b', null, text), h('p', null, 'A problem caused the program to stop working correctly. blankiekun will close the program and notify you if a solution is available.')); extra.replaceChildren(); close.disabled = false; close.focus(); };
      if (aero) { msg.append(h('b', null, text), h('p', null, 'blankiekun is checking for a solution to the problem...')); progress(2000); setTimeout(fin, 2000); } else fin();
    }
    if (!msg.firstChild) msg.textContent = rename(text);
    btns[0].classList.add('default');
    const body = h('div', { class: 'dlg' }, h('div', { class: 'row' }, icon('i-error'), h('div', null, msg, extra)), h('div', { class: 'btns' }, btns));
    body.addEventListener('keydown', e => { if (e.key === 'Escape' && !btns.some(x => x.disabled)) { e.preventDefault(); done(); } });
    const win = createWindow({ title, body, dialog: true, resizable: false, width: 'auto', taskbar: !parent, parent, icon: null, onClose: () => resolve() });
    btns[0].focus();
    import('./apps/control.js').then(m => m.playSound && m.playSound('Critical Stop')).catch(() => {});
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
