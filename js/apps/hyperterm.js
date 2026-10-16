// HyperTerminal: the connection wizard, a dial-up handshake synthesized with
// WebAudio, and blankiekun BBS, a little bulletin board that runs in the page.

import { h, icon, store, clamp, reducedMotion, small, download } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import { saveAs, openFile, saveTo } from '../filedlg.js';
import { docsFolder, pathOf } from '../fs.js';
import { sendEnabled, sendDialog } from '../send.js';

const DEFAULTS = { name: 'blankiekun BBS', icon: 'i-hyperterm', country: 0, area: '206', number: '555-1995', device: 'Dial-Up Modem (28.8)', echo: false, emu: 'Auto detect', lines: 500 };
const COUNTRIES = [['United States of America', 1], ['Canada', 1], ['United Kingdom', 44], ['Germany', 49], ['France', 33], ['Netherlands', 31], ['Japan', 81], ['Australia', 61], ['Brazil', 55]];
const DEVICES = ['Dial-Up Modem (28.8)', 'Direct to Com 1', 'Direct to Com 2'];
const EMULATIONS = ['Auto detect', 'ANSI', 'Minitel', 'TTY', 'Viewdata', 'VT100', 'VT52'];
const ICONS = ['i-hyperterm', 'i-globe', 'i-computer', 'i-network', 'i-mail', 'i-pc', 'i-book', 'i-game'];
const FONTS = { 'Fixedsys': 'var(--font-dos)', 'Terminal': 'var(--font-dos)', 'Courier New': '"Courier New", Courier, monospace', 'Lucida Console': '"Lucida Console", Monaco, monospace' };
const CPS = 600;              // characters a second: brisk, but you still see it arrive
const GITHUB = 'https://github.com/blankiekun/';

class Hangup extends Error {}

// ---------- the modem ----------

let actx = null;
function level() {
  const v = store.get('w95.volume', { level: 0.8, mute: false }) || {};
  return v.mute ? 0 : clamp(Number(v.level ?? 0.8) || 0, 0, 1);
}

// When each part of the call happens, in seconds. The sound and the status line both follow it.
function timeline(digits) {
  const dial = 0.45, tones = digits.length * 0.1;
  const answer = dial + tones + 0.25;
  return { answer, carrier: answer + 0.5, done: answer + 0.5 + 1.5 };
}

// Dial tone, DTMF for each digit, the answer tone, then the screech. Returns stop(), or null when muted.
function modemSound(digits) {
  const vol = level();
  if (!vol) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    if (!actx) actx = new AC();
    if (actx.state !== 'running') actx.resume().catch(() => {});
    const c = actx, out = c.createGain();
    out.gain.value = vol * 0.3;
    out.connect(c.destination);
    const onVolume = () => out.gain.setTargetAtTime(level() * 0.3, c.currentTime, 0.02);
    window.addEventListener('w95-volume', onVolume);
    const t0 = c.currentTime + 0.05, tl = timeline(digits);
    const env = (t, dur, g) => {
      const e = c.createGain();
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(g, t + 0.008);
      e.gain.setValueAtTime(g, t + dur - 0.015);
      e.gain.linearRampToValueAtTime(0, t + dur);
      e.connect(out);
      return e;
    };
    const tone = (freqs, t, dur, g = 0.4, type = 'sine') => {
      const e = env(t, dur, g);
      for (const f of freqs) { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(e); o.start(t); o.stop(t + dur + 0.02); }
    };
    tone([350, 440], t0, 0.35, 0.25);
    const ROW = [697, 770, 852, 941], COL = [1209, 1336, 1477], KEYS = '123456789*0#';
    [...digits].forEach((d, i) => { const k = KEYS.indexOf(d); tone([ROW[k / 3 | 0], COL[k % 3]], t0 + 0.45 + i * 0.1, 0.07, 0.35); });
    // The answering modem's 2100 Hz tone.
    let t = t0 + tl.answer;
    tone([2100], t, 0.45, 0.2);
    t = t0 + tl.carrier;
    // V.21 chatter: one oscillator hopping between the two FSK tones.
    const fsk = c.createOscillator(), fe = env(t, 0.35, 0.18);
    for (let i = 0; i < 35; i++) fsk.frequency.setValueAtTime(Math.random() < 0.5 ? 980 : 1180, t + i * 0.01);
    fsk.connect(fe); fsk.start(t); fsk.stop(t + 0.4);
    // The "bong" sweep and the probing tones.
    const sw = c.createOscillator(), se = env(t + 0.35, 0.3, 0.2);
    sw.frequency.setValueAtTime(600, t + 0.35);
    sw.frequency.exponentialRampToValueAtTime(2400, t + 0.6);
    sw.connect(se); sw.start(t + 0.35); sw.stop(t + 0.7);
    tone([1200, 2400], t + 0.65, 0.2, 0.12, 'square');
    // Then the hiss of the scrambled carrier, wobbling as the modems train.
    const len = 0.7, buf = c.createBuffer(1, c.sampleRate * len | 0, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource(), bp = c.createBiquadFilter(), ne = env(t + 0.8, len, 0.5);
    noise.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(1800, t + 0.8);
    bp.frequency.linearRampToValueAtTime(1100, t + 1.1);
    bp.frequency.linearRampToValueAtTime(2000, t + 1.5);
    noise.connect(bp); bp.connect(ne); noise.start(t + 0.8); noise.stop(t + 0.8 + len);
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      window.removeEventListener('w95-volume', onVolume);
      try { out.gain.cancelScheduledValues(c.currentTime); out.gain.setTargetAtTime(0, c.currentTime, 0.02); setTimeout(() => out.disconnect(), 200); } catch {}
    };
    setTimeout(stop, (tl.done + 0.4) * 1000);
    return stop;
  } catch { return null; }
}

// ---------- session files (.ht) ----------

function serialize(s) {
  return ['[HyperTerminal]', `Name=${s.name}`, `Icon=${s.icon}`, `Country=${COUNTRIES[s.country][0]} (${COUNTRIES[s.country][1]})`,
    `AreaCode=${s.area}`, `Number=${s.number}`, `ConnectUsing=${s.device}`, `Emulation=${s.emu}`, `LocalEcho=${s.echo ? 1 : 0}`, `Backscroll=${s.lines}`, ''].join('\n');
}
function parse(text) {
  const kv = {};
  for (const l of String(text).split(/\r?\n/)) { const m = /^\s*([A-Za-z]+)\s*=\s*(.*?)\s*$/.exec(l); if (m) kv[m[1].toLowerCase()] = m[2]; }
  if (!/\[HyperTerminal\]/i.test(text) || !kv.name) return null;
  const ci = COUNTRIES.findIndex(c => `${c[0]} (${c[1]})` === kv.country);
  return {
    ...DEFAULTS, name: kv.name.slice(0, 40), icon: ICONS.includes(kv.icon) ? kv.icon : DEFAULTS.icon, country: ci < 0 ? 0 : ci,
    area: (kv.areacode || '').slice(0, 6), number: (kv.number || '').slice(0, 24), device: DEVICES.includes(kv.connectusing) ? kv.connectusing : DEVICES[0],
    emu: EMULATIONS.includes(kv.emulation) ? kv.emulation : DEFAULTS.emu, echo: kv.localecho === '1', lines: clamp(+kv.backscroll || 500, 25, 5000),
  };
}
const HT = [{ label: 'HyperTerminal files (*.ht)', exts: ['.ht'] }, { label: 'All Files (*.*)', exts: [] }];
const TXT = [{ label: 'Text Documents (*.txt)', exts: ['.txt'] }, { label: 'All Files (*.*)', exts: [] }];

// Toolbar pictures, drawn like the 16-colour icons in index.html.
function glyph(parts) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('shape-rendering', 'crispEdges');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = parts.map(([f, d]) => `<path fill="${f}" d="${d}"/>`).join('');
  return s;
}
const PHONE = [['#000', 'M4 9h8v6H4zM3 10h1v5H3zM12 10h1v5h-1z'], ['#c0c0c0', 'M5 10h6v4H5z'], ['#fff', 'M7 11h2v2H7z']];
const GLYPHS = {
  call: () => glyph([...PHONE, ['#000', 'M1 5h14v2H1zM1 7h4v2H1zM11 7h4v2h-4z'], ['#808080', 'M2 6h12v1H2z']]),
  hang: () => glyph([...PHONE, ['#000', 'M2 1h12v2H2zM2 3h4v2H2zM10 3h4v2h-4z'], ['#808080', 'M3 2h10v1H3z'], ['#ff0000', 'M7 5h2v3H7z']]),
  send: () => glyph([['#000', 'M5 4h8v11H5z'], ['#fff', 'M6 5h6v9H6z'], ['#808080', 'M7 9h4v1H7zM7 11h4v1H7z'], ['#ff0000', 'M2 0h1v1h1v1h1v1H4v4H1V3H0V2h1V1h1z']]),
  recv: () => glyph([['#000', 'M5 4h8v11H5z'], ['#fff', 'M6 5h6v9H6z'], ['#808080', 'M7 9h4v1H7zM7 11h4v1H7z'], ['#0000ff', 'M1 0h3v4h1v1H4v1H3v1H2V6H1V5H0V4h1z']]),
  props: () => glyph([['#000', 'M1 2h14v12H1z'], ['#fff', 'M2 5h12v8H2z'], ['#000080', 'M2 3h12v2H2z'], ['#000', 'M4 7h1v1H4zM4 10h1v1H4z'], ['#808080', 'M6 7h6v1H6zM6 10h5v1H6z']]),
};

// ---------- the window ----------

function open(arg) {
  let s = { ...DEFAULTS };
  let named = false;           // the wizard was finished or a file was opened
  let path = null, savedText = null;
  let state = 'idle';          // idle, dialing, connected
  let sid = 0;                 // bumps on every connect and hangup; old BBS loops notice and stop
  let since = 0;
  let stopSound = null, dialTimers = [];
  let capture = null;          // { result, text }
  let showTools = true, showStatus = true;
  const font = store.get('w95.ht.font', { face: 'Fixedsys', size: small.matches ? 16 : 19 });

  // Output: lines of styled runs. A pending span at the end shows the line being typed.
  const lines = h('div', { class: 'ht-lines' });
  const pend = h('span', { class: 'ht-pend' });
  const cursor = h('span', { class: 'ht-cursor' }, '\u00a0');
  let cur = null, run = null;
  let style = { fg: 0, bg: -1, bold: false };
  const input = h('input', { class: 'ht-input', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: false, enterkeyhint: 'send', 'aria-label': 'Type to the remote computer' });
  const screen = h('div', { class: 'ht-screen', role: 'log', 'aria-live': 'off' }, lines);
  const term = h('div', { class: 'ht-term' }, screen, input);
  const applyFont = () => { screen.style.fontFamily = FONTS[font.face] || FONTS.Fixedsys; screen.style.fontSize = font.size + 'px'; };
  applyFont();

  function newLine() {
    cur = h('div', { class: 'ht-line' }, pend, cursor);
    lines.append(cur);
    run = null;
    while (lines.childElementCount > s.lines) lines.firstElementChild.remove();
  }
  newLine();

  function emitChar(ch) {
    if (capture && capture.text.length < 200_000) capture.text += ch;
    if (ch === '\r') return;
    if (ch === '\n') { linkify(cur); newLine(); return; }
    if (!run) {
      const cls = ['ht-f' + style.fg + (style.bold ? 'b' : '')];
      if (style.bg >= 0) cls.push('ht-b' + style.bg);
      run = document.createTextNode('');
      cur.insertBefore(h('span', { class: cls.join(' ') }, run), pend);
    }
    run.data += ch;
  }
  // ESC [ ... m colours, ESC [ 2 J clears the screen.
  function escape(seq) {
    const cmd = seq.slice(-1), args = seq.slice(0, -1).split(';').map(n => +n || 0);
    if (cmd === 'J') { lines.replaceChildren(); newLine(); return; }
    if (cmd !== 'm') return;
    for (const a of args) {
      if (a === 0) style = { fg: 0, bg: -1, bold: false };
      else if (a === 1) style.bold = true;
      else if (a >= 30 && a <= 37) style.fg = a - 30;
      else if (a >= 40 && a <= 47) style.bg = a - 40;
    }
    run = null;
  }
  // Web addresses become links, and [X] menu keys become buttons for tapping.
  function linkify(line) {
    const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) if (!walk.currentNode.parentNode.closest('.ht-pend, .ht-cursor')) nodes.push(walk.currentNode);
    for (const n of nodes) {
      const re = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]|\[([A-Z0-9?])\]/g;
      if (!re.test(n.data)) continue;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let at = 0, m;
      while ((m = re.exec(n.data))) {
        frag.append(n.data.slice(at, m.index));
        if (m[1]) frag.append(h('span', { class: 'ht-hot', 'data-key': m[1], role: 'button' }, m[0]));
        else frag.append(h('a', { href: m[0], target: '_blank', rel: 'noopener' }, m[0]));
        at = m.index + m[0].length;
      }
      frag.append(n.data.slice(at));
      n.replaceWith(frag);
    }
  }
  const atBottom = () => screen.scrollHeight - screen.scrollTop - screen.clientHeight < 40;
  const toBottom = () => { screen.scrollTop = screen.scrollHeight; };

  // Text from the host streams in a few characters a frame.
  const queue = [];
  let pumping = false, lastT = 0;
  function write(text) {
    return new Promise(res => { queue.push({ text, i: 0, res }); if (!pumping) { pumping = true; lastT = performance.now(); requestAnimationFrame(pump); } });
  }
  function pump(ts) {
    const stick = atBottom();
    let budget = reducedMotion.matches ? Infinity : Math.max(1, Math.round(Math.min(100, ts - lastT) * CPS / 1000));
    lastT = ts;
    while (budget > 0 && queue.length) {
      const q = queue[0];
      if (q.i >= q.text.length) { queue.shift(); q.res(); continue; }
      const ch = q.text[q.i];
      if (ch === '\x1b') {
        const m = /^\x1b\[([0-9;]*[A-Za-z])/.exec(q.text.slice(q.i, q.i + 16));
        if (m) { escape(m[1]); q.i += m[0].length; continue; }
      }
      emitChar(ch); q.i++; budget--;
    }
    while (queue.length && queue[0].i >= queue[0].text.length) queue.shift().res();
    if (stick) toBottom();
    if (queue.length) requestAnimationFrame(pump); else pumping = false;
  }
  // Echo and modem messages print at once.
  function instant(text) { for (const ch of text) emitChar(ch); toBottom(); }
  function flush() { for (const q of queue.splice(0)) q.res(); }

  // ---------- typing ----------
  // The hidden input holds what's typed. It stays a real input so phones show their keyboard.
  let mode = null;             // { kind: 'line' | 'key', resolve, reject, mask, max }
  const ahead = [];            // pasted text and Enter presses waiting for the host to ask
  const dbl = t => s.echo ? [...t].map(c => c + c).join('') : t;
  function renderPend() {
    const v = mode && mode.kind === 'line' ? input.value : '';
    pend.textContent = mode && mode.mask ? '*'.repeat(v.length) : dbl(v);
    toBottom();
  }
  function commitLine() {
    const m = mode, v = input.value.slice(0, m.max || 200);
    mode = null; input.value = ''; pend.textContent = '';
    instant((m.mask ? '*'.repeat(v.length) : dbl(v)) + '\r\n');
    m.resolve(v);
  }
  function giveKey(k) {
    const m = mode;
    mode = null;
    if (s.echo && k !== '\r') instant(k);
    m.resolve(k);
  }
  // Called when the host starts waiting, and after typing or pasting.
  function feed() {
    if (!mode) return;
    if (mode.kind === 'key') {
      if (ahead.length) return giveKey(ahead.shift());
      if (input.value) { const k = input.value[0]; input.value = input.value.slice(1); return giveKey(k); }
    } else {
      while (ahead.length) {
        const c = ahead.shift();
        if (c === '\r') { renderPend(); return commitLine(); }
        input.value += c;
      }
      if (mode.max && input.value.length > mode.max) input.value = input.value.slice(0, mode.max);
      renderPend();
    }
  }
  function typeText(t) {
    if (state !== 'connected') return;
    for (const c of t.replace(/\r\n?/g, '\n')) ahead.push(c === '\n' ? '\r' : c);
    feed();
  }
  const check = id => { if (id !== sid || state !== 'connected') throw new Hangup(); };
  const readLine = (id, o = {}) => { check(id); return new Promise((resolve, reject) => { mode = { kind: 'line', resolve, reject, max: 60, ...o }; feed(); }); };
  const readKey = id => { check(id); return new Promise((resolve, reject) => { mode = { kind: 'key', resolve, reject }; feed(); }); };

  input.addEventListener('input', () => { if (state !== 'connected') { input.value = ''; return; } feed(); });
  input.addEventListener('keydown', e => {
    mods(e);
    if (e.key === 'Enter') {
      e.preventDefault();
      if (state !== 'connected') return;
      if (mode && mode.kind === 'line') commitLine();
      else if (mode && mode.kind === 'key') giveKey('\r');
      else { for (const c of input.value) ahead.push(c); input.value = ''; ahead.push('\r'); }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !input.value) {
      const t = window.getSelection().toString();
      if (t) { e.preventDefault(); navigator.clipboard?.writeText(t).catch(() => {}); }
    } else if (e.key === 'Escape' && mode && mode.kind === 'key') { e.preventDefault(); giveKey('\x1b'); }
  });
  input.addEventListener('keyup', mods);
  term.addEventListener('click', e => {
    const hot = e.target.closest('.ht-hot');
    if (hot) { typeText(hot.dataset.key); input.focus({ preventScroll: true }); return; }
    if (e.target.closest('a')) return;
    if (!window.getSelection().toString()) input.focus({ preventScroll: true });
  });

  // ---------- connecting ----------
  const phoneText = () => `${COUNTRIES[s.country][1]} ${s.area ? s.area + ' ' : ''}${s.number}`;
  const digits = () => (s.area + s.number).replace(/[^0-9*#]/g, '');

  function startSession() {
    state = 'connected';
    since = Date.now();
    sid++;
    ahead.length = 0; input.value = '';
    sync();
    bbs(sid).catch(e => { if (!(e instanceof Hangup)) console.error(e); });
    input.focus({ preventScroll: true });
  }
  function hangup(remote) {
    if (state === 'idle') return;
    dialTimers.forEach(clearTimeout); dialTimers = [];
    if (stopSound) { stopSound(); stopSound = null; }
    const was = state;
    state = 'idle';
    sid++;
    const m = mode;
    mode = null; pend.textContent = ''; input.value = ''; ahead.length = 0;
    flush();
    if (m) m.reject(new Hangup());
    if (remote && was === 'connected') instant((cur.childNodes.length > 2 ? '\r\n' : '') + '\r\nNO CARRIER\r\n');
    sync();
  }

  // ---------- the BBS ----------
  const E = '\x1b[';
  const c = (n, t, b) => `${E}${b ? '1;' : ''}${30 + n}m${t}${E}0m`;
  const heading = t => `${E}1;37;44m ${t.padEnd(38)} ${E}0m\r\n`;
  const k = (key, label, w = 0) => `${c(1, `[${key}]`, 1)} ${label.padEnd(w)}`;
  const nl = t => t.replace(/\n/g, '\r\n');
  const date95 = d => d.toLocaleString('en-US', { month: '2-digit', day: '2-digit' }) + '/95';

  async function bbs(id) {
    const say = async t => { await write(nl(t)); check(id); };
    const line = o => readLine(id, o);
    const key = async valid => { for (;;) { const r = await readKey(id); const u = r.toUpperCase(); if (!valid || valid.includes(u)) return u; } };
    const pause = async () => { await say(c(6, '[Press any key]')); await key(); await say('\n'); };
    const sleep = ms => new Promise(r => setTimeout(r, reducedMotion.matches ? 0 : ms)).then(() => check(id));
    const yes = async q => { await say(q + c(0, ' [Y/N] ', 1)); const a = await key('YN\r'); await say((a === 'N' ? 'No' : 'Yes') + '\n'); return a !== 'N'; };

    await say(`${E}2J`);
    await say(`${c(4, '+--------------------------------------+', 1)}\n`);
    await say(`${c(4, '|', 1)}  ${c(1, 'b l a n k i e k u n', 1)}   ${c(4, 'B B S', 1)}         ${c(4, '|', 1)}\n`);
    await say(`${c(4, '|', 1)}  ${c(6, '"where the 90s never hung up"')}      ${c(4, '|', 1)}\n`);
    await say(`${c(4, '+--------------------------------------+', 1)}\n`);
    await say(`Node 1 of 2  -  28800 bps  -  ${c(2, 'BKBBS v1.95')}\nSysop: blankiekun.  No warez, no flames.\n\n`);

    let handle = '';
    const known = store.get('w95.ht.handle', '');
    while (!handle) {
      await say(`Enter your handle${known ? ` (${c(0, known, 1)})` : ''}, or ${c(2, 'NEW', 1)}: `);
      let v = (await line({ max: 20 })).trim();
      if (!v && known) v = known;
      if (!v) continue;
      if (v.toUpperCase() === 'NEW') {
        await say(`\n${c(2, 'New user registration', 1)}\nPick a handle (letters and numbers): `);
        const n = (await line({ max: 20 })).trim().replace(/[^\w .-]/g, '');
        if (!n) continue;
        await say('Choose a password: ');
        await line({ mask: true, max: 20 });
        await say(`\nWelcome aboard, ${c(0, n, 1)}! Your account is validated.\n(The sysop is in a good mood today.)\n`);
        handle = n;
      } else {
        await say('Password: ');
        const p = await line({ mask: true, max: 20 });
        if (!p) { await say(c(1, 'Wrong password. Hint: anything works.\n')); continue; }
        handle = v;
      }
    }
    store.set('w95.ht.handle', handle);
    const calls = store.get('w95.ht.calls', 0) + 1;
    store.set('w95.ht.calls', calls);
    await say(`\nWelcome${calls > 1 ? ' back' : ''}, ${c(0, handle, 1)}! You are caller #${(1994 + calls).toLocaleString('en-US')}.\n`);
    await say(`You have ${c(1, '60', 1)} minutes today.\n\n`);
    await pause();

    const left = () => Math.max(0, 60 - Math.floor((Date.now() - since) / 60000));
    for (;;) {
      if (!left()) { await say(c(1, '\nYour time is up for today. Call again tomorrow!\n', 1)); await sleep(800); hangup(true); return; }
      await say('\n' + heading('MAIN MENU'));
      await say(` ${k('P', 'Projects', 14)} ${k('B', 'Bulletins')}\n ${k('S', 'Sign guestbook', 14)} ${k('D', 'Door games')}\n ${k('W', "Who's online", 14)} ${k('T', 'Time')}\n ${k('G', 'Goodbye')}\n`);
      await say(`\n${c(6, `Time left: ${left()} min.`)}  Command: `);
      const a = await key('PBSDWTGQLO?');
      await say(a + '\n');
      if (a === 'P') await projects();
      else if (a === 'B') await bulletins();
      else if (a === 'S' || a === 'L') await guestbook();
      else if (a === 'D') await door();
      else if (a === 'W') await who();
      else if (a === 'T') await time();
      else if (a === 'G' || a === 'Q' || a === 'O') {
        if (await yes('Log off now?')) {
          await say(`\nThanks for calling, ${handle}! 73 de blankiekun.\n`);
          await sleep(900);
          hangup(true);
          return;
        }
      }
    }

    async function projects() {
      const PAGES = {
        1: ['CHIMIMOURYOU  (chi-mi-mou-ryou)',
          'A self-hosted Japanese e-book reader for\nyour Calibre library. A fork of ttsu\nEbook Reader that runs on your own\nserver: the whole house reads books,\nmanga and visual novels from one library,\neach with their own account, synced\nprogress and highlights.\n\n' +
          ' * Vertical text, furigana-aware search\n * Offline reading and audiobooks\n * Anki mining with Yomitan\n * Visual novels played with CONscripter\n * Docker images for amd64 and arm64\n',
          'chimimouryou'],
        2: ['CONSCRIPTER',
          'An ONScripter engine for NScripter visual\nnovels: a fork of ONScripter-Yuri, built\non SDL2. Runs on the Web (WebAssembly),\nWindows, Linux, macOS, Android and\nRetroArch.\n\n' +
          ' * Colour filters, shakes and ripples\n * Slide, zoom, flip and melt transitions\n * Every addition is opt-in\n\nTry it here: double-click CONscripter on\nthe desktop and open a game folder.\n',
          'CONscripter'],
        3: ['CONSCRIPTER-CONVERT',
          'Converts Japanese visual novels you own\ninto CONscripter games (0.txt + .nsa),\nso they play in the browser and in\nchimimouryou. Written in Rust, GPL-3.0.\n\n' +
          ' * Xuse: Saihate no Ima, complete\n * 5pb./MAGES (PS Vita)\n * Nitroplus NSS\n\nShips no game data. It reads only your\nown installation.\n',
          'conscripter-convert'],
      };
      for (;;) {
        await say('\n' + heading('PROJECTS'));
        await say(` ${k('1', 'chimimouryou', 20)}e-book reader\n ${k('2', 'CONscripter', 20)}VN engine\n ${k('3', 'conscripter-convert', 20)}VN converter\n ${k('Q', 'Back to the main menu')}\n\nWhich one? `);
        const a = await key('123Q\r\x1b');
        await say((a === '\r' || a === '\x1b' ? 'Q' : a) + '\n');
        if (!PAGES[a]) return;
        const [title, text, repo] = PAGES[a];
        await say(`\n${c(5, title, 1)}\n${text}\nSource: ${c(4, GITHUB + repo)}\n\n`);
        await pause();
      }
    }

    async function bulletins() {
      const POSTS = [
        ['08/24/95', 'Welcome to the new board!', 'blankiekun 95 went live today. Some other\noperating system launched today too.\nCoincidence? The sysop declines to\ncomment. Leave a note in the guestbook!'],
        ['09/02/95', 'NScripter games... on the Web?!', 'Some say this "World Wide Web" thing is a\nfad. Either way, CONscripter now runs\nNScripter visual novels inside a web\npage. Saves live in your browser. No\nfloppies, no CD swapping.'],
        ['09/15/95', 'Your bookshelf, on a server', 'chimimouryou turns your Calibre library\ninto a reading room for the whole house:\nvertical text, furigana, synced progress.\nYes, you still need a computer to run it.\nNo, it does not fit on a floppy.'],
        ['10/01/95', 'Converting the unconvertable', 'conscripter-convert finished its first\ngame from start to end. When a game needs\nsomething NScripter cannot do, the sysop\nadds it to CONscripter instead of faking\nit. Screen filters came from here.'],
        ['10/31/95', 'Modem fund: we hit 28.8k!', 'Thanks to everyone who chipped in. The\nnew modem screams twice as fast. Please\nstop calling at 3 AM, the sysop\'s mum\npicks up the phone.'],
      ];
      for (;;) {
        await say('\n' + heading('BULLETINS'));
        for (const [i, p] of POSTS.entries()) await say(` ${k(String(i + 1), '')}${c(6, p[0])}  ${p[1]}\n`);
        await say(` ${k('Q', 'Back to the main menu')}\n\nRead which? `);
        const a = await key('12345Q\r\x1b');
        const p = POSTS[+a - 1];
        await say((p ? a : 'Q') + '\n');
        if (!p) return;
        await say(`\n${c(0, 'Date:', 1)} ${p[0]}   ${c(0, 'From:', 1)} blankiekun\n${c(0, 'Subj:', 1)} ${c(5, p[1], 1)}\n\n${p[2]}\n\n`);
        await pause();
      }
    }

    async function guestbook() {
      const CANNED = [
        { who: 'blankiekun', when: '08/24/95', text: 'First! Sign below, and be nice.' },
        { who: 'Zer0Kool', when: '08/25/95', text: "rad board. what's a CONscripter?" },
        { who: 'ModemMom', when: '09/03/95', text: 'Please stop tying up the phone line.' },
      ];
      const mine = store.get('w95.ht.guestbook', []);
      await say('\n' + heading('GUESTBOOK'));
      for (const g of [...CANNED, ...mine]) await say(`${c(2, g.who, 1)} ${c(6, '(' + g.when + ')')}\n  ${g.text.replace(/\n/g, '\n  ')}\n`);
      if (!(await yes('\nSign the guestbook?'))) return;
      const head = `Guestbook (HyperTerminal) from ${handle}:\n\n`;
      const room = 2000 - head.length;
      await say(`\nType your message. A blank line ends it.\n(Up to ${room.toLocaleString('en-US')} characters.)\n\n`);
      const out = [];
      for (let n = 1; n <= 20; n++) {
        await say(c(6, String(n).padStart(2) + ': '));
        const l = await line({ max: 72 });
        if (!l.trim()) break;
        out.push(l);
        if (out.join('\n').length >= room) { await say(c(1, 'Message full!\n', 1)); break; }
      }
      const text = out.join('\n').slice(0, room).trim();
      if (!text) { await say('Nothing to save.\n'); return; }
      await say(`\n${k('S', 'Save')}  ${k('A', 'Abort')}  `);
      const a = await key('SA');
      await say(a + '\n');
      if (a === 'A') { await say('Message aborted.\n'); return; }
      store.set('w95.ht.guestbook', [...mine, { who: handle, when: date95(new Date()), text }].slice(-20));
      if (sendEnabled()) {
        await say(`\nSaved! Handing it to the sysop's mailbag...\n${c(6, 'Finish sending it in the window that opened.')}\n`);
        sendDialog({ kind: 'note', parent: win, text: head + text });
      } else await say('\nSaved! The sysop reads the guestbook here.\n');
      await pause();
    }

    async function who() {
      await say('\n' + heading("WHO'S ONLINE"));
      await say(`${c(0, 'Node  User           Activity', 1)}\n`);
      await say(` 1    ${handle.slice(0, 14).padEnd(14)} Reading Who's Online\n 2    blankiekun     Fixing a CONscripter bug\n 3    ${c(6, '(waiting for a caller)')}\n\n`);
      await pause();
    }

    async function time() {
      const d = new Date();
      const t = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
      const day = d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      await say(`\nIt is ${c(0, t, 1)} on ${day}, 1995.\nYou have been on for ${Math.floor((Date.now() - since) / 60000)} min. Time left: ${left()} min.\n\n`);
      await pause();
    }

    // Legend of the Blue Screen: a one-screen forest fight. Three fights a day, like the real thing.
    async function door() {
      const today = new Date().toDateString();
      let p = store.get('w95.ht.door', null);
      if (!p || p.day !== today) p = { day: today, fights: 3, hp: 20, gold: p ? p.gold : 0, potions: 1, dead: false, best: p ? p.best || 0 : 0 };
      const keep = () => store.set('w95.ht.door', p);
      const MONSTERS = [['Stray Packet', 6, 2, 12], ['Rabid Floppy', 8, 3, 20], ['Line Noise Gremlin', 10, 3, 30], ['Feral Paperclip', 12, 4, 45], ['Y2K Bug (from the future)', 14, 5, 70]];
      const roll = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
      await say(`${E}2J${c(1, 'L E G E N D   O F   T H E', 1)}\n${c(4, '  B L U E   S C R E E N', 1)}\n${c(6, '  a door game, v0.3')}\n\n`);
      for (;;) {
        if (p.dead) { await say(c(1, 'You are dead. Come back tomorrow.\n', 1)); await pause(); return; }
        await say(`${c(2, 'The Forest', 1)}  HP ${c(0, p.hp + '/20', 1)}  Gold ${c(3, p.gold, 1)}  Potions ${p.potions}  Fights left ${p.fights}\n`);
        await say(` ${k('L', 'Look for something to kill')}\n ${k('H', 'Drink a healing potion')}\n ${k('Q', 'Back to the BBS')}\n\nYour command? `);
        const a = await key('LHQ\x1b');
        await say((a === '\x1b' ? 'Q' : a) + '\n');
        if (a === 'Q' || a === '\x1b') { keep(); return; }
        if (a === 'H') {
          if (!p.potions) await say("You're out of potions.\n\n");
          else { p.potions--; p.hp = 20; await say(c(2, 'You feel much better. HP 20/20.\n\n')); }
          keep(); continue;
        }
        if (!p.fights) { await say("You're too tired to fight. Come back tomorrow.\n\n"); continue; }
        p.fights--;
        const [name, mhp, hit, gold] = MONSTERS[roll(0, MONSTERS.length - 1)];
        let hp = mhp;
        await say(`\n${c(1, `A ${name} leaps out at you!`, 1)} (HP ${mhp})\n`);
        for (;;) {
          await say(` ${k('A', 'Attack')} ${k('R', 'Run')}  > `);
          const f = await key('AR');
          await say(f + '\n');
          if (f === 'R') {
            if (Math.random() < 0.6) { await say('You run away, like a brave hero.\n\n'); break; }
            await say(c(1, "You trip over a modem cable! You can't get away.\n"));
          } else {
            const d = roll(2, 7);
            hp -= d;
            await say(`You hit the ${name} for ${c(0, d, 1)} damage.\n`);
            if (hp <= 0) {
              p.gold += gold;
              p.best = Math.max(p.best, p.gold);
              await say(c(2, `You have killed the ${name}! You find ${gold} gold.\n\n`, 1));
              break;
            }
          }
          const t = roll(0, hit);
          p.hp -= t;
          await say(t ? `The ${name} hits you for ${c(1, t, 1)} damage.\n` : `The ${name} misses you.\n`);
          if (p.hp <= 0) {
            p.hp = 0; p.dead = true; p.gold = Math.floor(p.gold / 2);
            await say(c(1, `\nYou have been slain by the ${name}!\nYou drop half your gold.\n\n`, 1));
            break;
          }
        }
        keep();
      }
    }
  }

  // ---------- dialogs ----------
  function dialog(title, body, o = {}) {
    body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); d.close(); } });
    const d = createWindow({ title, body, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false, ...o });
    return d;
  }
  const field = (id, label, el) => h('label', { class: 'dp-row', for: id }, h('span', { html: label }), el);
  const head = () => h('div', { class: 'row ht-head' }, icon(s.icon), h('b', null, s.name));

  function describe(then) {
    let pick = s.icon;
    const name = h('input', { class: 'field', id: 'ht-name', maxlength: 40, autocomplete: 'off', value: named ? s.name : DEFAULTS.name });
    const list = h('div', { class: 'ht-icons', role: 'listbox', tabindex: '0', 'aria-label': 'Icon' }, ICONS.map(id => {
      const b = h('div', { class: 'ht-ic', role: 'option', 'data-id': id }, icon(id));
      b.addEventListener('click', () => choose(id));
      return b;
    }));
    const choose = id => {
      pick = id;
      list.querySelectorAll('.ht-ic').forEach(b => { b.classList.toggle('sel', b.dataset.id === id); b.setAttribute('aria-selected', String(b.dataset.id === id)); });
      const el = list.querySelector('.sel');
      if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    list.addEventListener('keydown', e => {
      const i = ICONS.indexOf(pick);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); choose(ICONS[Math.min(ICONS.length - 1, i + 1)]); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); choose(ICONS[Math.max(0, i - 1)]); }
    });
    const form = h('form', { class: 'dlg ht-dlg' },
      h('div', { class: 'row ht-head' }, icon('i-hyperterm'), h('b', null, 'New Connection')),
      h('div', null, 'Enter a name and choose an icon for the connection:'),
      h('label', { for: 'ht-name', class: 'ht-col', html: '<span><u>N</u>ame:</span>' }, name),
      h('div', { class: 'ht-col' }, h('span', { html: '<u>I</u>con:' }), list),
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'OK'), h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) { msgbox({ title: 'Connection Description', icon: 'warn', parent: d, text: 'You must type a name for the connection.' }); return; }
      if (/[\\/:*?"<>|]/.test(n)) { msgbox({ title: 'Connection Description', icon: 'warn', parent: d, text: 'A connection name cannot contain any of these characters:\n\\ / : * ? " < > |' }); return; }
      s.name = n; s.icon = pick;
      d.close(true);
      sync();
      phone(then);
    });
    const d = dialog('Connection Description', form);
    choose(pick);
    name.focus(); name.select();
  }

  function phoneFields(prefix) {
    const country = h('select', { class: 'field', id: prefix + '-cc' }, COUNTRIES.map(([n, code], i) => h('option', { value: i, selected: i === s.country }, `${n} (${code})`)));
    const area = h('input', { class: 'field', id: prefix + '-area', maxlength: 6, inputmode: 'tel', autocomplete: 'off', value: s.area });
    const number = h('input', { class: 'field', id: prefix + '-num', maxlength: 24, inputmode: 'tel', autocomplete: 'off', value: s.number });
    const device = h('select', { class: 'field', id: prefix + '-dev' }, DEVICES.map(n => h('option', { selected: n === s.device }, n)));
    const rows = [
      field(prefix + '-cc', 'Coun<u>t</u>ry code:', country),
      field(prefix + '-area', 'Ar<u>e</u>a code:', area),
      field(prefix + '-num', '<u>P</u>hone number:', number),
      field(prefix + '-dev', 'Co<u>n</u>nect using:', device),
    ];
    const sync = () => { const direct = device.value !== DEVICES[0]; [country, area, number].forEach(x => { x.disabled = direct; }); };
    device.addEventListener('change', sync);
    sync();
    // Returns false (after saying why) when the number won't do.
    const apply = parent => {
      const direct = device.value !== DEVICES[0];
      if (!direct && digitsOf(number.value).length < 3) {
        msgbox({ title: 'HyperTerminal', icon: 'warn', parent, text: 'You must type a phone number.' });
        number.focus();
        return false;
      }
      s.country = +country.value; s.area = area.value.trim(); s.number = number.value.trim(); s.device = device.value;
      return true;
    };
    return { rows, apply, first: number };
  }
  const digitsOf = t => String(t).replace(/[^0-9]/g, '');

  function phone(then) {
    const f = phoneFields('ht-ph');
    const form = h('form', { class: 'dlg ht-dlg' }, head(),
      h('div', null, 'Enter details for the phone number that you want to dial:'),
      h('div', { class: 'ht-rows' }, f.rows),
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'OK'), h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!f.apply(d)) return;
      named = true;
      d.close(true);
      sync();
      if (then) then(); else connectDialog();
    });
    const d = dialog('Phone Number', form);
    f.first.focus(); f.first.select();
  }

  function connectDialog() {
    if (state !== 'idle') return;
    if (!named) { describe(); return; }
    if (s.device !== DEVICES[0]) { instant(`Connected to ${s.device.replace('Direct to ', '')}.\r\n`); startSession(); return; }
    const status = h('div', { class: 'ht-status', role: 'status' });
    const dial = h('button', { class: 'btn default', type: 'submit' }, 'Dial');
    const cancel = h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancel');
    const num = h('span', null, phoneText());
    const modify = h('button', { class: 'btn', type: 'button', onclick: () => { d.close(true); phone(connectDialog); } }, h('span', { html: '<u>M</u>odify...' }));
    const loc = h('select', { class: 'field', id: 'ht-loc' }, h('option', null, 'Default Location'));
    const props = h('button', { class: 'btn', type: 'button', onclick: () => msgbox({ title: 'Dialing Properties', icon: 'info', parent: d,
      text: `I am dialing from: Default Location\nThe area code is ${s.area || '206'}.\nI am in: ${COUNTRIES[s.country][0]}\n\nThis location has tone dialing.` }) }, h('span', { html: 'Dialing <u>P</u>roperties...' }));
    const form = h('form', { class: 'dlg ht-dlg ht-connect' }, head(),
      h('div', { class: 'ht-grid' },
        h('span', null, 'Phone number:'), num, modify,
        h('label', { for: 'ht-loc' }, 'Your location:'), loc, props,
        h('span', null, 'Calling card:'), h('span', null, 'None (Direct Dial)'), h('span')),
      status,
      h('div', { class: 'btns right' }, dial, cancel));
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (dial.disabled) return;
      dial.disabled = modify.disabled = props.disabled = loc.disabled = true;
      cancel.focus();
      state = 'dialing';
      sync();
      const dg = digits(), tl = timeline(dg);
      stopSound = modemSound(dg);
      status.textContent = 'Status: Dialing';
      const at = (sec, fn) => dialTimers.push(setTimeout(fn, sec * 1000));
      at(tl.answer, () => { status.textContent = 'Status: Connecting'; });
      at(tl.done, () => { dialTimers = []; stopSound = null; state = 'idle'; d.close(true); startSession(); });
    });
    const d = dialog('Connect', form, { onClose: () => { if (state === 'dialing') hangup(); } });
    dial.focus();
  }

  function properties() {
    const f = phoneFields('ht-pp');
    const emu = h('select', { class: 'field', id: 'ht-emu' }, EMULATIONS.map(n => h('option', { selected: n === s.emu }, n)));
    const back = h('input', { class: 'field', id: 'ht-back', type: 'number', min: 25, max: 5000, value: s.lines, style: { width: '80px', flex: 'none' } });
    const echo = h('input', { type: 'checkbox', id: 'ht-echo', checked: s.echo });
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const p1 = h('div', { class: 'ht-rows' }, head(), ...f.rows);
    const p2 = h('div', { class: 'ht-rows' },
      field('ht-emu', '<u>E</u>mulation:', emu),
      field('ht-back', '<u>B</u>ackscroll buffer lines:', back),
      h('label', { class: 'ht-check', for: 'ht-echo' }, echo, h('span', { html: 'Echo typed characters <u>l</u>ocally' })));
    const panels = [p1, p2];
    ['Phone Number', 'Settings'].forEach((t, i) => {
      const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === 0) }, t);
      b.addEventListener('click', () => { tabs.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', String(x === b))); panels.forEach((p, j) => { p.hidden = j !== i; }); });
      tabs.append(b);
    });
    p2.hidden = true;
    const form = h('form', { class: 'dlg ht-dlg ht-props' },
      h('div', { class: 'dp-tabs' }, tabs, h('div', { class: 'tabpanel' }, p1, p2)),
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'OK'), h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!f.apply(d)) return;
      s.emu = emu.value; s.echo = echo.checked; s.lines = clamp(+back.value || 500, 25, 5000);
      named = true;
      d.close(true);
      sync();
    });
    const d = dialog(`${s.name} Properties`, form);
    tabs.querySelector('button').focus();
  }

  function fontDialog() {
    const face = h('select', { class: 'field', id: 'ht-face' }, Object.keys(FONTS).map(n => h('option', { selected: n === font.face }, n)));
    const size = h('select', { class: 'field', id: 'ht-size' }, [12, 14, 16, 19, 22, 26].map(n => h('option', { value: n, selected: n === font.size }, String(n))));
    const sample = h('div', { class: 'ht-sample' }, 'AaBbYyZz 0123');
    const show = () => { sample.style.fontFamily = FONTS[face.value]; sample.style.fontSize = size.value + 'px'; };
    face.addEventListener('change', show); size.addEventListener('change', show); show();
    const form = h('form', { class: 'dlg ht-dlg' },
      h('div', { class: 'ht-rows' }, field('ht-face', '<u>F</u>ont:', face), field('ht-size', '<u>S</u>ize:', size)),
      h('fieldset', { class: 'group' }, h('legend', null, 'Sample'), sample),
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'OK'), h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      font.face = face.value; font.size = +size.value;
      store.set('w95.ht.font', font);
      applyFont();
      d.close(true);
      toBottom();
    });
    const d = dialog('Font', form);
    face.focus();
  }

  // Transfer > Capture Text: everything that arrives from now on goes into a text file.
  function captureDialog() {
    const where = h('input', { class: 'field', id: 'ht-cap', autocomplete: 'off', value: (pathOf(docsFolder()) || 'C:\\My Documents').replace(/\\$/, '') + '\\CAPTURE.TXT' });
    let picked = null;
    const browse = h('button', { class: 'btn', type: 'button', onclick: async () => {
      const r = await saveAs({ title: 'Capture Text', name: 'CAPTURE.TXT', filters: TXT, parent: d });
      if (r) { picked = r; where.value = r.path; }
    } }, h('span', { html: '<u>B</u>rowse...' }));
    const form = h('form', { class: 'dlg ht-dlg' },
      h('div', null, 'Everything that comes in from the remote computer from now on is saved in this file.'),
      h('div', { class: 'dp-row' }, h('label', { for: 'ht-cap', html: '<u>F</u>ile:' }), where, browse),
      h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'Start'), h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = where.value.trim();
      if (!v) return;
      const r = picked && picked.path === v ? picked
        : /^a:\\?/i.test(v) ? { floppy: true, path: v, name: v.replace(/^a:\\?/i, '') || 'CAPTURE.TXT' } : { path: v, name: v.split('\\').pop() };
      // Make the file now, like the real thing, so a bad path fails before anything is captured.
      if (!r.floppy && !saveTo(r, { text: '' }, null, d)) return;
      capture = { result: r, text: '' };
      d.close(true);
      sync();
    });
    const d = dialog('Capture Text', form);
    where.focus();
  }
  function stopCapture() {
    if (!capture) return;
    const { result, text } = capture;
    capture = null;
    if (result.floppy) download(result.name, new Blob([text.replace(/\r?\n/g, '\r\n')], { type: 'text/plain' }));
    else saveTo({ path: result.path }, { text: text.replace(/\r\n/g, '\n') }, null, win);
    sync();
  }

  async function sendFile() {
    const r = await openFile({ title: 'Send File', parent: win });
    if (!r) return;
    msgbox({ title: 'HyperTerminal', icon: 'info', parent: win, text: state === 'connected'
      ? `blankiekun BBS doesn't take uploads, so ${r.name} stayed where it was.\n\nSign the guestbook instead!`
      : 'You must be connected to send a file.\n\nUse Call > Connect first.' });
  }
  function receiveFile() {
    msgbox({ title: 'Receive File', icon: 'info', parent: win, text: state === 'connected'
      ? 'Waiting for the remote computer to send a file...\n\nNothing came. Start a download on the BBS first. (This one has no file area yet.)'
      : 'You must be connected to receive a file.\n\nUse Call > Connect first.' });
  }
  async function sendTextFile() {
    if (state !== 'connected') { msgbox({ title: 'HyperTerminal', icon: 'info', parent: win, text: 'You must be connected to send a text file.' }); return; }
    const r = await openFile({ title: 'Send Text File', filters: TXT, parent: win, accept: '.txt,text/plain' });
    if (!r) return;
    const t = r.file ? await r.file.text() : r.node.text;
    if (t == null) { msgbox({ title: 'HyperTerminal', icon: 'error', parent: win, text: `${r.name}\nThis is not a text file.` }); return; }
    typeText(t.slice(0, 4000));
  }

  async function paste() {
    try { typeText(await navigator.clipboard.readText()); } catch {}
    input.focus({ preventScroll: true });
  }
  function copy() {
    const t = window.getSelection().toString();
    if (t) navigator.clipboard?.writeText(t).catch(() => {});
    input.focus({ preventScroll: true });
  }
  function selectAll() {
    const r = document.createRange();
    r.selectNodeContents(lines);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(r);
  }

  // ---------- files ----------
  async function save(as) {
    if (!named) { msgbox({ title: 'HyperTerminal', icon: 'info', parent: win, text: 'Set up the connection first: File > New Connection.' }); return false; }
    const text = serialize(s);
    if (!path || as) {
      const r = await saveAs({ name: s.name + '.ht', filters: HT, parent: win });
      if (!r) return false;
      const n = saveTo(r, { text, icon: 'i-hyperterm' }, () => new Blob([text.replace(/\n/g, '\r\n')], { type: 'text/plain' }), win);
      if (!n && !r.floppy) return false;
      path = n ? r.path : null;
    } else if (!saveTo({ path }, { text, icon: 'i-hyperterm' }, null, win)) return false;
    savedText = text;
    return true;
  }
  const dirty = () => named && serialize(s) !== savedText;
  async function confirmSave() {
    if (!dirty()) return true;
    const b = await msgbox({ title: 'HyperTerminal', icon: 'question', parent: win, buttons: ['&Yes', '&No', 'Cancel'], text: `Do you want to save session ${s.name}?` });
    if (b === 'Yes') return save();
    return b === 'No';
  }
  async function confirmHangup() {
    if (state === 'idle') return true;
    const b = await msgbox({ title: 'HyperTerminal', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: 'You are currently connected.\nAre you sure you want to disconnect now?' });
    if (b !== 'Yes') return false;
    hangup();
    return true;
  }
  function load(text, p) {
    const v = parse(text);
    if (!v) return false;
    s = v; named = true; path = p || null; savedText = serialize(s);
    sync();
    return true;
  }
  async function newConnection() {
    if (!(await confirmHangup()) || !(await confirmSave())) return;
    s = { ...DEFAULTS }; named = false; path = null; savedText = null;
    sync();
    describe();
  }
  async function openDialog() {
    if (!(await confirmHangup()) || !(await confirmSave())) return;
    const r = await openFile({ filters: HT, parent: win, accept: '.ht' });
    if (!r) return;
    const text = r.file ? await r.file.text() : r.node.text;
    if (text == null || !load(text, r.file ? null : r.node.user ? r.path : null)) {
      msgbox({ title: 'HyperTerminal', icon: 'error', parent: win, text: `${r.name}\nThis is not a HyperTerminal session file.` });
      return;
    }
    connectDialog();
  }

  // ---------- chrome ----------
  const bar = menubar([
    { label: '&File', items: () => [
      { label: '&New Connection...', action: newConnection },
      { label: '&Open...', action: openDialog },
      { label: '&Save', action: () => save() },
      { label: 'Save &As...', action: () => save(true) },
      '-',
      { label: 'Page Set&up...', disabled: true },
      { label: '&Print...', disabled: true },
      '-',
      { label: 'P&roperties', action: () => named ? properties() : describe() },
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Edit', items: () => [
      { label: '&Copy', key: 'Ctrl+C', action: copy },
      { label: '&Paste to Host', key: 'Ctrl+V', action: paste, disabled: state !== 'connected' },
      '-',
      { label: 'Select &All', action: selectAll },
    ] },
    { label: '&View', items: () => [
      { label: '&Toolbar', checked: showTools, action: () => { showTools = !showTools; sync(); } },
      { label: '&Status Bar', checked: showStatus, action: () => { showStatus = !showStatus; sync(); } },
      '-',
      { label: '&Font...', action: fontDialog },
    ] },
    { label: '&Call', items: () => [
      { label: '&Connect...', action: connectDialog, disabled: state !== 'idle' },
      { label: '&Disconnect', action: () => hangup(), disabled: state === 'idle' },
    ] },
    { label: '&Transfer', items: () => [
      { label: '&Send File...', action: sendFile },
      { label: '&Receive File...', action: receiveFile },
      capture ? { label: '&Capture Text', submenu: [{ label: '&Stop', action: stopCapture }] } : { label: '&Capture Text...', action: captureDialog },
      { label: 'Send &Text File...', action: sendTextFile },
      '-',
      { label: 'Capture to &Printer', disabled: true },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') }, '-',
      { label: '&About HyperTerminal', action: () => about('HyperTerminal', 'i-hyperterm', win, h('p', null, 'Dial 555-1995 for blankiekun BBS.')) },
    ] },
  ]);

  const tb = (title, g, onclick) => h('button', { type: 'button', class: 'ht-tb', title, 'aria-label': title, onclick: () => { onclick(); } }, g);
  const tbConnect = tb('Connect', GLYPHS.call(), connectDialog);
  const tbHang = tb('Disconnect', GLYPHS.hang(), () => hangup());
  const tools = h('div', { class: 'ht-tools' },
    tb('New', icon('i-txt'), newConnection), tb('Open', icon('i-folder-open'), openDialog), h('i', { class: 'ht-sep' }),
    tbConnect, tbHang, h('i', { class: 'ht-sep' }),
    tb('Send', GLYPHS.send(), sendFile), tb('Receive', GLYPHS.recv(), receiveFile), h('i', { class: 'ht-sep' }),
    tb('Properties', GLYPHS.props(), () => named ? properties() : describe()));

  const sbConn = h('span', null, 'Disconnected');
  const sbEmu = h('span', null, DEFAULTS.emu);
  const ind = n => h('span', { class: 'ht-ind off' }, n);
  const sbScroll = ind('SCROLL'), sbCaps = ind('CAPS'), sbNum = ind('NUM'), sbCap = ind('Capture'), sbEcho = ind('Print echo');
  const status = h('div', { class: 'statusbar ht-sb' }, sbConn, sbEmu, h('span', { class: 'ht-ind' }, '2400 8-N-1'), sbScroll, sbCaps, sbNum, sbCap, sbEcho);
  function mods(e) {
    if (!e.getModifierState) return;
    sbCaps.classList.toggle('off', !e.getModifierState('CapsLock'));
    sbNum.classList.toggle('off', !e.getModifierState('NumLock'));
    sbScroll.classList.toggle('off', !e.getModifierState('ScrollLock'));
  }
  const clock = t => { const x = Math.floor(t / 1000); return `${Math.floor(x / 3600)}:${String(Math.floor(x / 60) % 60).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  function tick() {
    sbConn.textContent = state === 'connected' ? 'Connected ' + clock(Date.now() - since) : state === 'dialing' ? 'Dialing...' : 'Disconnected';
  }
  function sync() {
    win && win.setTitle(`${named ? s.name : 'New Connection'} - HyperTerminal`);
    tbConnect.disabled = state !== 'idle';
    tbHang.disabled = state === 'idle';
    sbEmu.textContent = s.emu;
    sbCap.classList.toggle('off', !capture);
    sbEcho.classList.toggle('off', !s.echo);
    tools.hidden = !showTools;
    status.hidden = !showStatus;
    screen.classList.toggle('on', state === 'connected');
    tick();
  }
  const timer = setInterval(tick, 1000);

  const root = h('div', { class: 'ht' }, bar, tools, term, status);
  let win = null;
  win = createWindow({
    app: 'hyperterm', title: 'New Connection - HyperTerminal', icon: 'i-hyperterm', body: root,
    width: 620, height: 450, minW: 260, minH: 200, route: 'hyperterm', autofocus: '.ht-input',
    onClose: async () => {
      if (!(await confirmHangup())) return false;
      stopCapture();
      return confirmSave();
    },
    onClosed: () => { clearInterval(timer); hangup(); flush(); },
  });
  sync();

  // Opened from a .ht file: go straight to the Connect dialog. Otherwise start the wizard.
  if (arg && arg.text != null && load(arg.text, arg.path)) connectDialog();
  else describe();
  return win;
}

export default { id: 'hyperterm', title: 'HyperTerminal', icon: 'i-hyperterm', open };
