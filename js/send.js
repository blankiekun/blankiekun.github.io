// "Send to blankiekun": Paint drawings and Notepad notes go to the worker in
// worker/, which posts them to a private Discord channel.

import { h, icon, store } from './util.js';
import { createWindow } from './wm.js';
import { msgbox } from './dialogs.js';
import { SEND_ENDPOINT, TURNSTILE_SITE_KEY } from './config.js';

const COOLDOWN = 60_000;  // between sends from this browser
const TIMEOUT = 15_000;   // give up waiting for the server after this
const LAST = 'w95.send.last';
const NAME = 'w95.send.name';

export const sendEnabled = () => Boolean(SEND_ENDPOINT && TURNSTILE_SITE_KEY);
const cooldownLeft = () => Math.max(0, store.get(LAST, 0) + COOLDOWN - Date.now());

let turnstile;
function loadTurnstile() {
  if (!turnstile) turnstile = new Promise((resolve, reject) => {
    const s = h('script', { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: true });
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => { turnstile = null; reject(new Error('turnstile')); };
    document.head.append(s);
  });
  return turnstile;
}

// The bottom-right button. While cooling down it shows how long is left.
export function sendButton(label, onclick) {
  const text = h('span', null, label);
  const b = h('button', { type: 'button', class: 'btn send-btn' }, icon('i-mail'), text);
  b.addEventListener('click', () => { hideTip(b); onclick(); });
  const tick = () => {
    if (!b.isConnected && b.dataset.mounted) { clearInterval(t); return; }
    if (b.isConnected) b.dataset.mounted = '1';
    const left = cooldownLeft();
    b.disabled = left > 0;
    text.textContent = left > 0 ? `Sent! Wait ${Math.ceil(left / 1000)}s` : label;
  };
  const t = setInterval(tick, 1000);
  tick();
  return b;
}

// After someone has been drawing or typing for a while, point at the button once per visit.
export function tipLater(btn, host, id, text, isWorthIt, delay = 20_000) {
  const key = 'w95.send.tip.' + id;
  let seen = false;
  try { seen = sessionStorage.getItem(key) === '1'; } catch {}
  if (seen) return;
  const timer = setInterval(() => {
    if (!btn.isConnected) { clearInterval(timer); return; }
    if (!isWorthIt() || btn.disabled) return;
    clearInterval(timer);
    try { sessionStorage.setItem(key, '1'); } catch {}
    const tip = h('div', { class: 'send-tip', role: 'status' },
      h('button', { type: 'button', class: 'send-tip-x', 'aria-label': 'Close tip', onclick: () => tip.remove() }, '×'),
      h('b', null, 'Made something nice?'), h('br'), text);
    tip.addEventListener('click', e => { if (!e.target.closest('.send-tip-x')) { tip.remove(); btn.click(); } });
    host.append(tip);
    btn.tip = tip;
    setTimeout(() => tip.remove(), 15_000);
  }, delay);
}
function hideTip(btn) { if (btn.tip) btn.tip.remove(); }

// kind: 'drawing' (blob is a PNG) or 'note' (text).
export async function sendDialog({ kind, parent, blob, text }) {
  if (cooldownLeft()) {
    msgbox({ title: 'Send', icon: 'info', parent, text: `You just sent something. You can send again in ${Math.ceil(cooldownLeft() / 1000)} seconds.` });
    return;
  }
  const what = kind === 'drawing' ? 'drawing' : 'note';
  const name = h('input', { class: 'field', id: 'send-name', maxlength: 40, autocomplete: 'nickname', value: store.get(NAME, ''), placeholder: 'Anonymous' });
  const caption = h('input', { class: 'field', id: 'send-caption', maxlength: 200, autocomplete: 'off' });
  const status = h('div', { class: 'send-status', role: 'status' }, 'Loading the "are you human" check...');
  const widget = h('div', { class: 'send-turnstile' });
  const sendBtn = h('button', { class: 'btn default', type: 'submit', disabled: true }, 'Send');
  const cancelBtn = h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel');
  let token = '', widgetId = null, url = null;

  let preview;
  if (kind === 'drawing') {
    url = URL.createObjectURL(blob);
    preview = h('div', { class: 'send-preview' }, h('img', { src: url, alt: 'Your drawing' }));
  } else {
    preview = h('pre', { class: 'send-preview note' }, text.length > 400 ? text.slice(0, 400) + '…' : text);
  }

  const form = h('form', { class: 'dlg send-dlg' },
    h('div', { class: 'row' }, icon('i-mail'), h('div', { class: 'msg' },
      `Send this ${what} to blankiekun. It goes to a private channel that only blankiekun reads.`)),
    preview,
    h('label', { class: 'dp-row', for: 'send-name' }, h('span', { html: 'Your <u>n</u>ame:' }), name),
    kind === 'drawing' ? h('label', { class: 'dp-row', for: 'send-caption' }, h('span', { html: '<u>C</u>aption:' }), caption) : null,
    widget, status,
    h('div', { class: 'btns right' }, sendBtn, cancelBtn));

  form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!token) return;
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('name', name.value.trim());
    fd.append('token', token);
    if (kind === 'drawing') { fd.append('message', caption.value.trim()); fd.append('file', blob, 'drawing.png'); }
    else fd.append('message', text);
    sendBtn.disabled = cancelBtn.disabled = true;
    status.replaceChildren('Sending...', h('div', { class: 'send-progress' }, h('i')));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    let error = null;
    try {
      const r = await fetch(SEND_ENDPOINT, { method: 'POST', body: fd, signal: ctl.signal });
      if (!r.ok) error = (await r.json().catch(() => ({}))).error || `The server said no (error ${r.status}).`;
    } catch (err) {
      error = err.name === 'AbortError' ? 'The server did not answer in time. Try again in a moment.' : 'Could not reach the server. Check your connection and try again.';
    }
    clearTimeout(timer);
    if (error) {
      status.textContent = error;
      status.classList.add('err');
      cancelBtn.disabled = false;
      token = '';
      if (window.turnstile && widgetId != null) window.turnstile.reset(widgetId);
      return;
    }
    store.set(LAST, Date.now());
    store.set(NAME, name.value.trim());
    win.close(true);
    msgbox({ title: 'Send', icon: 'info', parent, text: `Your ${what} was sent. Thanks!\n\nblankiekun will see it soon.` });
  });

  const win = createWindow({
    title: `Send ${what} to blankiekun`, body: form, dialog: true, resizable: false, width: 'auto', parent, taskbar: false,
    onClosed: () => {
      if (url) URL.revokeObjectURL(url);
      if (window.turnstile && widgetId != null) window.turnstile.remove(widgetId);
    },
  });
  name.focus();

  try {
    const ts = await loadTurnstile();
    widgetId = ts.render(widget, {
      sitekey: TURNSTILE_SITE_KEY, theme: 'light', size: 'normal',
      callback: t => { token = t; sendBtn.disabled = false; status.textContent = ''; },
      'expired-callback': () => { token = ''; sendBtn.disabled = true; status.textContent = 'The check expired. Tick it again.'; },
      'error-callback': () => { status.textContent = 'The "are you human" check could not load. Try again later.'; status.classList.add('err'); },
    });
    status.textContent = '';
  } catch {
    status.textContent = 'The "are you human" check could not load. A content blocker may be stopping it.';
    status.classList.add('err');
  }
}
