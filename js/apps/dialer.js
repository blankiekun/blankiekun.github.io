// Phone Dialer. The keypad plays real touch tones; dialing finds no modem.

import { h, store, clamp } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';

const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PRS'], ['8', 'TUV'], ['9', 'WXY'], ['*', ''], ['0', ''], ['#', '']];
const ROW = [697, 770, 852, 941], COL = [1209, 1336, 1477];

let actx = null;
function dtmf(key) {
  const v = store.get('w95.volume', { level: 0.8, mute: false }) || {};
  const vol = v.mute ? 0 : clamp(Number(v.level ?? 0.8) || 0, 0, 1);
  const k = KEYS.findIndex(x => x[0] === key);
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!vol || k < 0 || !AC) return;
  try {
    if (!actx) actx = new AC();
    if (actx.state !== 'running') actx.resume().catch(() => {});
    const t = actx.currentTime + 0.01, g = actx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 0.15, t + 0.008);
    g.gain.setValueAtTime(vol * 0.15, t + 0.13);
    g.gain.linearRampToValueAtTime(0, t + 0.15);
    g.connect(actx.destination);
    for (const f of [ROW[k / 3 | 0], COL[k % 3]]) { const o = actx.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.16); }
  } catch {}
}

function open() {
  const num = h('input', { class: 'field pd-num', type: 'text', inputmode: 'tel', autocomplete: 'off', 'aria-label': 'Number to dial', value: store.get('w95.dialer', '') });
  num.addEventListener('keydown', e => { if (e.key.length === 1 && /[0-9*#]/.test(e.key)) dtmf(e.key); if (e.key === 'Enter') { e.preventDefault(); dial(); } });
  const pad = h('div', { class: 'pd-pad' }, ...KEYS.map(([d, abc]) => h('button', { class: 'btn pd-key', type: 'button', onclick: () => { dtmf(d); num.value += d; } }, h('b', null, d), h('small', null, abc))));

  async function dial() {
    const n = num.value.trim();
    if (!n) { num.focus(); return; }
    store.set('w95.dialer', n);
    for (const d of n.replace(/[^0-9*#]/g, '').slice(0, 20)) { dtmf(d); await new Promise(r => setTimeout(r, 180)); }
    await msgbox({ title: 'Phone Dialer', icon: 'error', parent: win,
      text: `Phone Dialer could not dial ${n}.\n\nNo modem is installed on this computer.` });
    num.focus();
  }

  const bar = menubar([
    { label: '&File', items: () => [{ label: 'E&xit', action: () => win.close() }] },
    { label: '&Edit', items: () => [
      { label: 'Cu&t', action: () => { num.focus(); document.execCommand('cut'); } },
      { label: '&Copy', action: () => { num.focus(); document.execCommand('copy'); } },
      { label: '&Paste', action: async () => { try { num.value += await navigator.clipboard.readText(); } catch {} num.focus(); } },
    ] },
    { label: '&Tools', items: () => [{ label: '&Show Log', disabled: true }] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') }, '-',
      { label: '&About Phone Dialer', action: () => about('Phone Dialer', 'i-dialer', win) },
    ] },
  ]);
  const body = h('div', { class: 'pd' }, bar,
    h('div', { class: 'pd-main' },
      h('span', null, 'Number to dial:'),
      h('div', { class: 'pd-row' }, num, h('button', { class: 'btn default', type: 'button', onclick: dial }, h('u', null, 'D'), 'ial')),
      pad));
  const win = createWindow({ app: 'dialer', title: 'Phone Dialer', icon: 'i-dialer', body, width: 'auto', resizable: false, maximizable: false, route: 'dialer' });
  num.focus();
  return win;
}

export default { id: 'dialer', title: 'Phone Dialer', icon: 'i-dialer', open };
