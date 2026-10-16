// Media Player. Plays the visitor's video and sound files, and BLANKIEKUN.AVI: a clip
// drawn live on a canvas with a WebAudio jingle, run by the same trackbar and buttons.

import { h, store, clamp } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import { openFile } from '../filedlg.js';
import { glyph } from './sndrec.js';

const PREFS = 'w95.mplayer';
const BASE = 420;      // the window's width with no picture
const DEMO = 'BLANKIEKUN.AVI';
const MCI = 'The specified file cannot be played on the specified MCI device. The file may be corrupt, or not in the correct format.';

function level() {
  const v = store.get('w95.volume', { level: 0.8, mute: false });
  return v.mute ? 0 : clamp(+v.level || 0, 0, 1);
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
function mmss(t) {
  const cs = Math.round(t * 100);
  return `${pad(Math.floor(cs / 6000))}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
}

// The selection buttons' brackets; the rest are Sound Recorder's glyphs.
const MARK = {
  in: 'M0 0h5v1H0zM1 1h3v1H1zM2 2h1v7H2zM3 8h4v1H3z',
  out: 'M2 0h5v1H2zM3 1h3v1H3zM4 2h1v7H4zM0 8h4v1H0z',
};
const mark = k => `<svg width="7" height="9" viewBox="0 0 7 9" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${MARK[k]}"/></svg>`;

// The trackbar thumb, pointed at the bottom because the ticks are below it.
const THUMB = (() => {
  const px = { hl: '', sh: '', dk: '', f: '' };
  const put = (k, x, y, w = 1, ht = 1) => { px[k] += `M${x} ${y}h${w}v${ht}h-${w}z`; };
  put('hl', 0, 0, 10); put('hl', 0, 1, 1, 13);
  put('dk', 10, 0, 1, 14); put('sh', 9, 1, 1, 13); put('f', 1, 1, 8, 13);
  for (let y = 14; y <= 18; y++) {
    const l = y - 13, r = 23 - y;
    if (y < 18) put('hl', l, y);
    put('dk', r, y);
    if (r - 1 > l) put('sh', r - 1, y);
    if (r - 2 > l) put('f', l + 1, y, r - l - 2);
  }
  return `<svg width="11" height="19" viewBox="0 0 11 19" shape-rendering="crispEdges" aria-hidden="true">` +
    Object.entries(px).map(([k, d]) => `<path class="${k}" d="${d}"/>`).join('') + '</svg>';
})();

// ---------- BLANKIEKUN.AVI ----------
// 15 seconds at 15 frames a second in three scenes, which Scale > Tracks shows as tracks.

const DW = 240, DH = 180, DFPS = 15, DLEN = 15;
const FLAG = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];

// The waving four-pane flag. turn is cos(angle) while it spins round; trail is the
// colour of the dashes streaming off its left edge.
function flag(g, cx, cy, size, phase, turn, trail) {
  const n = 10, pane = size * 0.46, gap = size * 0.08, sw = pane / n;
  const w = Math.max(1, Math.ceil(sw * Math.abs(turn)));
  const wave = u => Math.sin(u / size * 4 + phase) * size * 0.06 - u * 0.1;
  for (let col = 0; col < 2 * n; col++) {
    const right = col >= n;
    const u = col * sw + (right ? gap : 0);
    const x = Math.round(cx + (u + sw / 2 - size / 2) * turn - w / 2);
    const top = cy - pane - gap / 2 + wave(u);
    g.fillStyle = FLAG[right ? 1 : 0]; g.fillRect(x, Math.round(top), w, Math.round(pane));
    g.fillStyle = FLAG[right ? 3 : 2]; g.fillRect(x, Math.round(top + pane + gap), w, Math.round(pane));
  }
  if (!trail) return;
  g.fillStyle = trail;
  const left = cx - size / 2 * turn, d = Math.max(1, Math.round(sw * 0.9));
  for (let row = 0; row < 4; row++) {
    const y = cy - pane - gap / 2 + wave(0) + row * (pane + gap) / 2 + pane / 4;
    for (let k = 1; k <= 3; k++) {
      const s = Math.max(1, Math.round(d * (1 - k * 0.25)));
      g.fillRect(Math.round(left - k * d * 2), Math.round(y + Math.sin(phase - k) * 2), s, s);
    }
  }
}

function words(g, text, x, y, size, color, shadow, chars = text.length) {
  g.font = `bold ${size}px Tahoma, Arial, sans-serif`;
  g.textBaseline = 'alphabetic';
  const sub = text.slice(0, chars);
  if (shadow) { g.fillStyle = shadow; g.fillText(sub, x + 2, y + 2); }
  g.fillStyle = color;
  g.fillText(sub, x, y);
  return g.measureText(text).width;
}

function paint(g, t) {
  g.textAlign = 'left';
  if (t < 5) {
    // 1: out of the stars
    g.fillStyle = '#000'; g.fillRect(0, 0, DW, DH);
    for (let i = 0; i < 48; i++) {
      const a = i * 2.39996, z = (i * 0.618 + t * 0.35) % 1;
      const r = z * z * 170;
      g.fillStyle = z > 0.6 ? '#ffffff' : z > 0.3 ? '#c0c0c0' : '#808080';
      g.fillRect(Math.round(DW / 2 + Math.cos(a) * r), Math.round(DH / 2 + Math.sin(a) * r * 0.8), z > 0.7 ? 2 : 1, z > 0.7 ? 2 : 1);
    }
    const k = t / 5, size = 16 + 104 * k * (2 - k);
    flag(g, DW / 2, DH / 2, size, t * 5, 1, '#808080');
  } else if (t < 10) {
    // 2: the flag turns round while the name types itself out
    g.fillStyle = '#008080'; g.fillRect(0, 0, DW, DH);
    const a = (t - 5) * Math.PI * 0.8;
    flag(g, DW / 2, 70, 92, t * 5, Math.cos(a), null);
    g.font = 'bold 26px Tahoma, Arial, sans-serif';
    const full = 'blankiekun 95', x = Math.round((DW - g.measureText(full).width) / 2);
    const n = Math.min(full.length, Math.floor((t - 5.4) * 5));
    if (n > 0) {
      const wb = words(g, 'blankiekun ', x, 150, 26, '#ffffff', '#000000', Math.min(n, 11));
      if (n > 11) words(g, '95', x + wb, 150, 26, '#ffff00', '#000000', n - 11);
    }
    if (n < full.length && Math.floor(t * 3) % 2 === 0) {
      g.fillStyle = '#ffffff';
      g.fillRect(x + (n > 0 ? g.measureText(full.slice(0, n)).width : 0) + 2, 128, 2, 24);
    }
  } else {
    // 3: clouds, the whole logo, and a fade to black
    g.fillStyle = '#0000ff'; g.fillRect(0, 0, DW, DH);
    g.fillStyle = '#000080'; g.fillRect(0, 0, DW, 40);
    for (let i = 0; i < 6; i++) {
      const x = ((i * 71 + t * (8 + i * 3)) % (DW + 80)) - 60, y = 20 + (i * 37) % 130;
      g.fillStyle = i % 2 ? '#c0c0c0' : '#ffffff';
      g.fillRect(Math.round(x), y, 48, 10); g.fillRect(Math.round(x) + 10, y - 6, 26, 8); g.fillRect(Math.round(x) + 6, y + 10, 34, 4);
    }
    flag(g, 62, 86, 72, t * 5, 1, '#ffffff');
    const wb = words(g, 'blankiekun', 112, 92, 22, '#ffffff', '#000000');
    words(g, '95', 112 + wb + 4, 92, 22, '#ffff00', '#000000');
    words(g, 'Starting blankiekun 95...', 46, 160, 11, '#ffffff', null, Math.floor((t - 10.5) * 12));
    if (t > 13.8) {
      g.fillStyle = `rgba(0,0,0,${Math.min(1, (t - 13.8) / 1.1)})`;
      g.fillRect(0, 0, DW, DH);
    }
  }
}

// The jingle: a square-wave lead in eighth notes ('-' holds, '.' rests) over a triangle bass.
const BEAT = 60 / 128;
const LEAD = 'C5 . E5 . G5 . C6 -  B5 - A5 . E5 . C5 .  F5 . A5 . C6 . A5 .  G5 - - - D5 . G5 .  ' +
  'E5 . G5 . C6 . E6 -  D6 . C6 . A5 . E5 .  G5 . B5 . D6 . B5 .  C6 - - - - - . .';
const ROOTS = 'C3 A2 F2 G2 C3 A2 G2 C3';
function freq(n) {
  const m = /^([A-G])(#?)(\d)$/.exec(n);
  return 440 * 2 ** (({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0) + (m[3] - 4) * 12 - 9) / 12);
}
const JINGLE = (() => {
  const out = [];
  LEAD.trim().split(/\s+/).forEach((tok, i) => {
    if (tok === '-') { const n = out[out.length - 1]; if (n) n.d += BEAT / 2; }
    else if (tok !== '.') out.push({ t: i * BEAT / 2, d: BEAT / 2, f: freq(tok), type: 'square', v: 0.09 });
  });
  ROOTS.split(' ').forEach((r, bar) => {
    for (let b = 0; b < 4; b++) {
      if (bar === 7 && b) break;
      out.push({ t: (bar * 4 + b) * BEAT, d: bar === 7 ? BEAT * 4 : BEAT * 0.9, f: freq(r) * (b % 2 ? 2 : 1), type: 'triangle', v: 0.3 });
    }
  });
  return out;
})();

function demoEngine() {
  const canvas = h('canvas', { class: 'mp-media pix', width: DW, height: DH, role: 'img', 'aria-label': DEMO });
  const g = canvas.getContext('2d');
  let ctx = null, out = null, voices = [], playing = false, t0 = 0, p0 = 0, last = -1, vol = level();
  const pos = () => playing ? Math.min(DLEN, p0 + (performance.now() - t0) / 1000) : p0;

  function sound(from) {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        out = ctx.createGain();
        out.connect(ctx.destination);
      }
    } catch { return; }
    ctx.resume().catch(() => {});
    out.gain.value = vol;
    const now = ctx.currentTime + 0.02;
    for (const n of JINGLE) {
      if (n.t < from - 0.01) continue;
      const o = ctx.createOscillator(), env = ctx.createGain(), at = now + n.t - from;
      o.type = n.type;
      o.frequency.value = n.f;
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(n.v, at + 0.01);
      env.gain.setTargetAtTime(n.v * 0.6, at + 0.03, 0.08);
      env.gain.setTargetAtTime(0, at + n.d - 0.03, 0.015);
      o.connect(env); env.connect(out);
      o.start(at); o.stop(at + n.d + 0.1);
      voices.push(o);
    }
  }
  function hush() {
    for (const o of voices) { try { o.stop(); } catch {} o.disconnect(); }
    voices = [];
  }
  function play() { if (playing) return; t0 = performance.now(); playing = true; sound(p0); }
  function pause() { if (!playing) return; p0 = pos(); playing = false; hush(); }
  function draw(t) {
    const f = Math.min(DLEN * DFPS - 1, Math.floor(t * DFPS));
    if (f !== last) { last = f; paint(g, f / DFPS); }
  }
  function seek(t) {
    const was = playing;
    pause();
    p0 = clamp(t, 0, DLEN);
    if (was) play(); else draw(p0);
  }
  draw(0);
  return {
    name: DEMO, device: 'Video for Windows', length: DLEN, fps: DFPS, tracks: [0, 5, 10], view: canvas, size: [DW, DH],
    pos, play, pause, seek, draw, ended: () => pos() >= DLEN,
    volume(v) { vol = v; if (out) out.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
    destroy() { pause(); if (ctx) ctx.close().catch(() => {}); ctx = null; },
  };
}

// A <video> element plays both kinds of file; one with no picture is just sound.
function mediaEngine(src, name) {
  return new Promise((ok, fail) => {
    const el = h('video', { class: 'mp-media', preload: 'auto', playsinline: true, 'aria-label': name });
    el.playsInline = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.onerror = el.ondurationchange = null;
      const video = el.videoWidth > 0;
      el.volume = level();
      ok({
        name, device: video ? 'Video for Windows' : 'Sound', length: el.duration, fps: video ? 30 : 0, tracks: [0],
        view: video ? el : null, size: [el.videoWidth, el.videoHeight],
        pos: () => Math.min(el.currentTime, el.duration),
        play: () => el.play(),
        pause: () => el.pause(),
        seek: t => { el.currentTime = t; },
        draw() {},
        ended: () => el.ended,
        volume: v => { el.volume = v; },
        destroy() { el.pause(); el.removeAttribute('src'); el.load(); },
      });
    };
    el.onerror = () => { if (!done) { done = true; fail(new Error('mci')); } };
    el.onloadedmetadata = () => {
      el.onloadedmetadata = null;
      if (isFinite(el.duration) && el.duration > 0) return finish();
      // Recorded .webm files don't say how long they are until the end has been read.
      el.ondurationchange = () => { if (isFinite(el.duration)) { el.currentTime = 0; finish(); } };
      el.currentTime = 1e101;
    };
    el.src = src;
  });
}

// ---------- the window ----------

const VIDEO = { label: 'Video for Windows (*.avi;*.mp4;*.webm)', exts: ['.avi', '.mp4', '.webm'] };
const SOUND = { label: 'Sound (*.wav;*.mp3;*.ogg)', exts: ['.wav', '.mp3', '.ogg'] };
const MIDI = { label: 'MIDI Sequencer (*.mid;*.rmi)', exts: ['.mid', '.rmi'] };
const ALL = { label: 'All Files (*.*)', exts: [] };

function open(arg) {
  const prefs = { autoRewind: true, autoRepeat: false, scale: 'time', ...store.get(PREFS, {}) };
  const savePrefs = () => store.set(PREFS, prefs);
  let eng = null;         // the open clip
  let url = null;         // its object URL, if it came off the floppy
  let state = 'stopped';  // 'playing' | 'paused' | 'stopped'
  let sel = null;         // { a, b } in seconds
  let loopFrom = 0, stopAt = 0, raf = 0, token = 0, tickKey = '', userSized = false, scrubbing = false;
  let win = null;

  const len = () => eng ? eng.length : 0;
  const scale = () => !eng ? 'time' : prefs.scale === 'frames' && eng.fps ? 'frames' : prefs.scale === 'tracks' && eng.tracks.length > 1 ? 'tracks' : 'time';
  const span = () => sel && sel.b - sel.a > 0.001 ? sel : null;
  const trackAt = t => eng.tracks.reduce((n, s, i) => t >= s - 1e-6 ? i : n, 0);

  // ---------- the scale ----------
  const thumb = h('div', { class: 'mp-thumb', html: THUMB });
  const range = h('div', { class: 'mp-range' });
  const markA = h('i', { class: 'mp-mark' }), markB = h('i', { class: 'mp-mark' });
  const ticks = h('div', { class: 'mp-ticks' });
  const rail = h('div', { class: 'mp-rail' }, h('div', { class: 'mp-chan' }), range, markA, markB, ticks, thumb);
  const scaleEl = h('div', { class: 'mp-scale', role: 'slider', tabindex: '0', 'aria-label': 'Position', 'aria-valuemin': '0' }, rail);
  const at = t => (len() ? clamp(t / len(), 0, 1) * 100 : 0) + '%';

  // Labels a few dozen pixels apart, on round numbers of whatever the scale counts.
  function buildTicks() {
    const W = rail.clientWidth, s = scale();
    const key = [W, len(), s, eng && eng.name].join();
    if (key === tickKey) return;
    tickKey = key;
    ticks.replaceChildren();
    if (!eng || !W) return;
    const add = (t, long, label) => {
      ticks.append(h('i', { class: 'mp-tick' + (long ? ' long' : ''), style: { left: at(t) } }));
      if (label != null) ticks.append(h('span', { class: 'mp-lbl', style: { left: at(t) } }, label));
    };
    if (s === 'tracks') {
      eng.tracks.forEach((t, i) => add(t, i === 0, String(i + 1)));
      add(len(), true);
      return;
    }
    const unit = s === 'frames' ? 1 / eng.fps : 1, total = len() / unit;
    const steps = s === 'frames' ? [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, 1e5, 2e5, 5e5]
      : [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
    const want = total / Math.max(1, Math.floor(W / 46));
    const step = steps.find(x => x >= want) || steps[steps.length - 1];
    const sub = String(step)[0] === '2' ? 4 : String(step)[0] === '1' && step >= 10 && s === 'time' ? 3 : 5;
    const minor = W * (step / sub) / total >= 5 ? step / sub : step;
    const label = v => s === 'frames' ? String(Math.round(v)) : len() >= 60 ? `${Math.floor(v / 60)}:${pad(Math.round(v % 60))}` : step < 1 ? v.toFixed(1) : String(Math.round(v));
    for (let i = 0; i * minor <= total + 1e-6; i++) {
      const v = i * minor, major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      add(v * unit, i === 0, major && W * (total - v) / total > 14 ? label(v) : null);
    }
    add(len(), true, null);
  }

  scaleEl.addEventListener('pointerdown', e => {
    if (!eng || e.button !== 0) return;
    e.preventDefault();
    scaleEl.focus({ preventScroll: true });
    const was = state === 'playing';
    if (was) eng.pause();
    scrubbing = true;
    const go = ev => { const r = rail.getBoundingClientRect(); eng.seek(clamp((ev.clientX - r.left) / r.width, 0, 1) * len()); render(); };
    go(e);
    const id = e.pointerId;
    try { scaleEl.setPointerCapture(id); } catch {}
    const up = ev => {
      if (ev.pointerId !== id) return;
      scaleEl.removeEventListener('pointermove', go);
      scaleEl.removeEventListener('pointerup', up);
      scaleEl.removeEventListener('pointercancel', up);
      scrubbing = false;
      if (was && eng && state === 'playing') { if (eng.pos() >= len() - 0.01) eng.seek(loopFrom); start(); }
      render();
    };
    scaleEl.addEventListener('pointermove', go);
    scaleEl.addEventListener('pointerup', up);
    scaleEl.addEventListener('pointercancel', up);
  });

  // Arrows move one unit of the scale, Page Up/Down one labelled step.
  scaleEl.addEventListener('keydown', e => {
    if (!eng) return;
    if (e.key === ' ') { e.preventDefault(); toggle(); return; }
    const s = scale(), p = eng.pos();
    const small = s === 'frames' ? 1 / eng.fps : s === 'tracks' ? 1 : Math.max(0.1, len() / 100);
    const big = Math.max(small, len() / 10);
    let t = null;
    if (s === 'tracks' && (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown')) t = eng.tracks[trackAt(p) + 1] ?? len();
    else if (s === 'tracks' && (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp')) t = eng.tracks[Math.max(0, trackAt(p) - (p - eng.tracks[trackAt(p)] < 0.5 ? 1 : 0))];
    else t = { ArrowRight: p + small, ArrowDown: p + small, ArrowLeft: p - small, ArrowUp: p - small, PageDown: p + big, PageUp: p - big }[e.key];
    if (e.key === 'Home') t = 0;
    if (e.key === 'End') t = len();
    if (t == null) return;
    e.preventDefault();
    seek(t);
  });

  // ---------- the buttons ----------
  const btn = (cls, label, html, fn) => h('button', { type: 'button', class: 'mbtn ' + cls, 'aria-label': label, title: label, html, onclick: fn });
  const bPlay = btn('play', 'Play', glyph('play'), toggle);
  const bStop = btn('stop', 'Stop', glyph('stop'), stop);
  const bEject = btn('eject', 'Eject', glyph('eject'), () => eng ? unload() : openMedia());
  const bPrev = btn('prev', 'Previous Mark', glyph('start'), () => toMark(-1));
  const bRew = btn('back', 'Rewind', glyph('back'), e => { if (e.detail === 0) scan(-1); });
  const bFwd = btn('fwd', 'Fast Forward', glyph('fwd'), e => { if (e.detail === 0) scan(1); });
  const bNext = btn('next', 'Next Mark', glyph('end'), () => toMark(1));
  const bIn = btn('in', 'Start Selection', mark('in'), () => setMark('a'));
  const bOut = btn('out', 'End Selection', mark('out'), () => setMark('b'));
  const readout = h('div', { class: 'mp-readout', 'aria-live': 'off' });

  // Rewind and Fast Forward keep scanning while they're held down.
  for (const [b, d] of [[bRew, -1], [bFwd, 1]]) {
    let timer = 0;
    const end = () => { clearInterval(timer); timer = 0; };
    b.addEventListener('pointerdown', e => {
      if (e.button !== 0 || b.disabled) return;
      scan(d);
      timer = setInterval(() => { if (b.disabled) end(); else scan(d); }, 120);
      b.addEventListener('pointerup', end, { once: true });
      b.addEventListener('pointerleave', end, { once: true });
      b.addEventListener('pointercancel', end, { once: true });
    });
  }

  // ---------- transport ----------
  function loop() {
    raf = 0;
    if (!eng || state !== 'playing') return;
    const p = eng.pos();
    if (scrubbing) { render(); raf = requestAnimationFrame(loop); return; }
    if (p >= stopAt - 0.005 || eng.ended()) {
      if (prefs.autoRepeat) { eng.seek(loopFrom); start(); }
      else {
        eng.pause();
        eng.seek(prefs.autoRewind ? loopFrom : Math.min(p, stopAt));
        state = 'stopped';
      }
    }
    render();
    if (state === 'playing') raf = requestAnimationFrame(loop);
  }

  // Playing goes through the selection when there is one.
  function start() {
    state = 'playing';
    Promise.resolve(eng.play()).catch(() => { if (state === 'playing') { state = 'paused'; render(); } });
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function play() {
    if (!eng) return;
    const s = span(), p = eng.pos();
    if (s && (p < s.a - 0.01 || p >= s.b - 0.01)) eng.seek(s.a);
    else if (!s && p >= len() - 0.01) eng.seek(0);
    loopFrom = s ? s.a : 0;
    stopAt = s ? s.b : len();
    start();
    render();
  }
  function pause() {
    if (!eng || state !== 'playing') return;
    eng.pause();
    state = 'paused';
    render();
  }
  function toggle() { if (state === 'playing') pause(); else play(); }
  function stop() {
    if (!eng) return;
    eng.pause();
    eng.seek(span() ? sel.a : 0);
    state = 'stopped';
    render();
  }
  function seek(t) {
    if (!eng) return;
    eng.seek(clamp(t, 0, len()));
    if (state === 'playing') {
      const s = span(), p = eng.pos();
      loopFrom = s && p >= s.a - 0.01 && p < s.b ? s.a : 0;
      stopAt = s && p >= s.a - 0.01 && p < s.b ? s.b : len();
      if (p >= len() - 0.005) { eng.pause(); state = 'stopped'; }
    }
    render();
  }
  function scan(d) { if (eng) seek(eng.pos() + d * clamp(len() / 30, 0.2, 10)); }

  // Marks are the ends, the selection and the track starts.
  function toMark(d) {
    if (!eng) return;
    const p = eng.pos(), s = span();
    const marks = [0, len(), ...eng.tracks, ...(s ? [s.a, s.b] : [])].sort((x, y) => x - y);
    const slack = state === 'playing' ? 0.5 : 0.01;
    const t = d < 0 ? marks.filter(m => m < p - slack).pop() ?? 0 : marks.find(m => m > p + 0.01) ?? len();
    seek(t);
  }
  function setMark(end) {
    if (!eng) return;
    const p = eng.pos();
    if (end === 'a') sel = { a: p, b: sel && sel.b > p ? sel.b : len() };
    else sel = { a: sel && sel.a < p ? sel.a : 0, b: p };
    render();
  }

  // ---------- loading ----------
  function unload() {
    token++;
    cancelAnimationFrame(raf); raf = 0;
    if (eng) eng.destroy();
    eng = null;
    if (url) { URL.revokeObjectURL(url); url = null; }
    screen.replaceChildren();
    screen.hidden = true;
    state = 'stopped';
    sel = null;
    tickKey = '';
    if (!userSized && win.state === 'normal') { win.el.style.width = BASE + 'px'; win.el.style.height = ''; }
    layout();
    render();
    if (!root.contains(document.activeElement)) bEject.focus();
  }

  function show(e) {
    unload();
    eng = e;
    e.volume(level());
    if (e.view) {
      screen.append(e.view);
      screen.hidden = false;
      e.view.style.width = e.size[0] + 'px';
      if (!userSized && win.state === 'normal') {
        win.el.style.width = Math.max(BASE, e.size[0] + 18) + 'px';
        win.fit();
      }
    }
    layout();
    render();
    bPlay.focus();
  }

  async function media(src, name, own) {
    const my = ++token;
    try {
      const e = await mediaEngine(src, name);
      if (my !== token || !win.el.isConnected) { e.destroy(); if (own) URL.revokeObjectURL(src); return; }
      show(e);
      url = own ? src : null;
    } catch {
      if (own) URL.revokeObjectURL(src);
      if (my === token) mciError();
    }
  }
  const mciError = () => msgbox({ title: 'Media Player', icon: 'error', parent: win, text: MCI });

  function loadFile(file) {
    if (/\.(mid|midi|rmi)$/i.test(file.name)) return mciError();
    media(URL.createObjectURL(file), file.name, true);
  }
  // A file on the pretend disk only has sound in it if a program saved it as a data URL.
  function loadNode(n) {
    if (n.kind === 'app' && n.app === 'mplayer') return show(demoEngine());
    if (typeof n.data === 'string' && n.data.startsWith('data:') && !/\.(mid|midi|rmi)$/i.test(n.name)) return media(n.data, n.name, false);
    mciError();
  }
  function load(a) {
    if (a === 'demo' || a == null) show(demoEngine());
    else if (a instanceof File) loadFile(a);
    else if (a.file instanceof File) loadFile(a.file);
    else if (typeof a === 'object') loadNode(a);
  }

  async function openMedia(device) {
    const filters = device === 'video' ? [VIDEO, ALL] : device === 'sound' ? [SOUND, ALL] : device === 'midi' ? [MIDI, ALL] : [VIDEO, SOUND, ALL];
    const r = await openFile({ title: 'Open', filters, parent: win, accept: 'video/*,audio/*,.avi,.wav,.mid,.rmi' });
    if (!r || !win.el.isConnected) return;
    if (r.file) loadFile(r.file); else if (r.node) loadNode(r.node);
  }

  // ---------- dialogs ----------
  function dialog(title, body, ok, first) {
    const done = () => d.close(true);
    body.append(h('div', { class: 'btns right' },
      h('button', { class: 'btn default', type: 'submit' }, 'OK'),
      h('button', { class: 'btn', type: 'button', onclick: done }, 'Cancel')));
    body.addEventListener('submit', e => { e.preventDefault(); if (ok() !== false) done(); });
    body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); done(); } });
    const d = createWindow({ title, body, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    (first || body.querySelector('input, button')).focus();
    return d;
  }
  const check = (label, on, disabled) => h('label', { class: 'mp-chk' }, h('input', { type: 'checkbox', checked: on, disabled }), label);

  function options() {
    const rew = check('Auto Rewind', prefs.autoRewind), rep = check('Auto Repeat', prefs.autoRepeat);
    const body = h('form', { class: 'dlg mp-dlg' },
      h('div', { class: 'mp-opts' }, rew, rep),
      h('fieldset', { class: 'group mp-ole', disabled: true },
        h('legend', null, 'OLE Object'),
        check('Control Bar On Playback', true),
        h('label', { class: 'mp-cap' }, 'Caption:', h('input', { class: 'field', value: eng ? eng.name : '' })),
        check('Border around object', true),
        check('Play in client document', true),
        check('Dither picture to VGA colors', false)));
    dialog('Options', body, () => {
      prefs.autoRewind = rew.firstChild.checked;
      prefs.autoRepeat = rep.firstChild.checked;
      savePrefs();
    });
  }

  // Edit > Selection: from and to in the units of the scale.
  function selection() {
    if (!eng) return;
    const frames = scale() === 'frames';
    const fmt = t => frames ? String(Math.round(t * eng.fps)) : mmss(t);
    const parse = v => {
      v = v.trim();
      if (frames) return /^\d+$/.test(v) ? +v / eng.fps : NaN;
      const m = /^(?:(\d+):)?(\d+(?:\.\d*)?)$/.exec(v);
      return m ? (+(m[1] || 0)) * 60 + +m[2] : NaN;
    };
    const s = span();
    const radio = (label, on) => h('label', { class: 'mp-chk' }, h('input', { type: 'radio', name: 'mpsel', checked: on }), label);
    const rNone = radio('None', !s), rAll = radio('All', !!s && s.a <= 0.001 && s.b >= len() - 0.001), rFrom = radio('From:', !!s && !rAll.firstChild.checked);
    const from = h('input', { class: 'field', value: fmt(s ? s.a : 0), 'aria-label': 'From' });
    const to = h('input', { class: 'field', value: fmt(s ? s.b : len()), 'aria-label': 'To' });
    const size = h('input', { class: 'field', value: fmt(s ? s.b - s.a : len()), 'aria-label': 'Size' });
    for (const f of [from, to, size]) f.addEventListener('focus', () => { rFrom.firstChild.checked = true; });
    to.addEventListener('input', () => { const a = parse(from.value), b = parse(to.value); if (b >= a) size.value = fmt(b - a); });
    from.addEventListener('input', () => { const a = parse(from.value), b = parse(to.value); if (b >= a) size.value = fmt(b - a); });
    size.addEventListener('input', () => { const a = parse(from.value), n = parse(size.value); if (n >= 0) to.value = fmt(Math.min(len(), a + n)); });
    const body = h('form', { class: 'dlg mp-dlg' },
      h('fieldset', { class: 'group' }, h('legend', null, 'Selection'),
        h('div', { class: 'mp-selgrid' },
          rNone, h('span'), h('span'), h('span'),
          rAll, h('span'), h('span'), h('span'),
          rFrom, from, h('label', null, 'To:'), to,
          h('span'), h('span'), h('label', null, 'Size:'), size)));
    dialog('Set Selection', body, () => {
      if (rNone.firstChild.checked) sel = null;
      else if (rAll.firstChild.checked) sel = { a: 0, b: len() };
      else {
        const a = parse(from.value), b = parse(to.value);
        if (!(a >= 0 && b > a && b <= len() + 0.005)) {
          msgbox({ title: 'Media Player', icon: 'warn', parent: win, text: `The selection must be between ${fmt(0)} and ${fmt(len())}, and From must come before To.` });
          return false;
        }
        sel = { a, b: Math.min(b, len()) };
      }
      render();
    });
  }

  function properties() {
    if (!eng) return;
    const lines = [eng.name, '', `Device:\t${eng.device}`, `Length:\t${mmss(len())} (mm:ss)`];
    if (eng.view) lines.push(`Size:\t${eng.size[0]} x ${eng.size[1]} pixels`);
    if (eng.fps && eng.name === DEMO) lines.push(`Frames:\t${Math.round(len() * eng.fps)} at ${eng.fps} frames per second`);
    if (eng.tracks.length > 1) lines.push(`Tracks:\t${eng.tracks.length}`);
    msgbox({ title: `${eng.device} Properties`, icon: null, parent: win, text: lines.join('\n') });
  }

  const setScale = s => () => { prefs.scale = s; savePrefs(); render(); scaleEl.focus(); };
  const menu = menubar([
    { label: '&File', items: () => [
      { label: '&Open...', key: 'Ctrl+O', action: () => openMedia() },
      { label: '&Close', disabled: !eng, action: unload },
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Edit', items: () => [
      { label: '&Selection...', disabled: !eng, action: selection },
      { label: '&Copy Object', key: 'Ctrl+C', disabled: true },
      '-',
      { label: '&Options...', action: options },
    ] },
    { label: '&Device', items: () => [
      { label: '&1 Video for Windows...', action: () => openMedia('video') },
      { label: '&2 Sound...', action: () => openMedia('sound') },
      { label: '&3 MIDI Sequencer...', action: () => openMedia('midi') },
      { label: '&4 CD Audio', action: () => launch('cdplayer') },
      '-',
      { label: '&Properties', disabled: !eng, action: properties },
      { label: '&Volume Control', action: () => launch('volume') },
    ] },
    { label: '&Scale', items: () => [
      { label: '&Time', radio: true, checked: scale() === 'time', action: setScale('time') },
      { label: '&Frames', radio: true, checked: scale() === 'frames', disabled: !eng || !eng.fps, action: setScale('frames') },
      { label: 'T&racks', radio: true, checked: scale() === 'tracks', disabled: !eng || eng.tracks.length < 2, action: setScale('tracks') },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') },
      '-',
      { label: '&About Media Player', action: () => about('Media Player', 'i-mplayer', win) },
    ] },
  ]);

  // ---------- drawing ----------
  function render() {
    const has = !!eng, p = has ? eng.pos() : 0, s = span();
    if (has) eng.draw(p);
    buildTicks();
    thumb.style.left = at(p);
    range.hidden = markA.hidden = markB.hidden = !s;
    if (s) {
      range.style.left = at(s.a);
      range.style.width = `calc(${at(s.b)} - ${at(s.a)})`;
      markA.style.left = at(s.a);
      markB.style.left = at(s.b);
    }
    const sc = scale();
    const text = !has ? '' : sc === 'frames' ? `${Math.round(p * eng.fps)} (frames)`
      : sc === 'tracks' ? `${pad(trackAt(p) + 1)} ${mmss(p - eng.tracks[trackAt(p)]).slice(0, 5)} (tt mm:ss)` : `${mmss(p)} (mm:ss)`;
    readout.textContent = text;
    scaleEl.classList.toggle('off', !has);
    scaleEl.setAttribute('aria-valuemax', String(Math.round(len() * 100) / 100));
    scaleEl.setAttribute('aria-valuenow', String(Math.round(p * 100) / 100));
    scaleEl.setAttribute('aria-valuetext', text || 'No media');
    scaleEl.setAttribute('aria-disabled', String(!has));

    const had = document.activeElement;
    const playing = state === 'playing';
    if (bPlay.getAttribute('aria-label') !== (playing ? 'Pause' : 'Play')) {
      bPlay.innerHTML = glyph(playing ? 'pause' : 'play');
      bPlay.title = playing ? 'Pause' : 'Play';
      bPlay.setAttribute('aria-label', bPlay.title);
    }
    bPlay.disabled = !has;
    bStop.disabled = !has || (state === 'stopped' && p <= (s ? s.a : 0) + 0.005);
    for (const b of [bPrev, bRew, bFwd, bNext, bIn, bOut]) b.disabled = !has;
    if (had && had.disabled && root.contains(had)) (has ? bPlay : bEject).focus();

    const title = has ? `${eng.name} - Media Player (${state})` : 'Media Player';
    if (win.el.getAttribute('aria-label') !== title) win.setTitle(title);
  }

  // The picture keeps the clip's own size until the window is sized by hand or maximized.
  function layout() {
    root.classList.toggle('fluid', !!eng && !!eng.view && (win.state === 'max' || userSized));
    tickKey = '';
    buildTicks();
  }

  const screen = h('div', { class: 'mp-screen', hidden: true });
  const sep = () => h('span', { class: 'mp-gap' });
  const root = h('div', { class: 'mp' }, menu, screen,
    h('div', { class: 'mp-ctl' }, scaleEl,
      h('div', { class: 'mp-row' },
        h('div', { class: 'mp-btns' }, bPlay, bStop, bEject, sep(), bPrev, bRew, bFwd, bNext, sep(), bIn, bOut),
        readout)));

  root.addEventListener('keydown', e => {
    const letter = e.code && e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : '';
    if (e.altKey && !e.ctrlKey && !e.metaKey && letter && menu.openByKey(letter)) { e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && letter === 'o') { e.preventDefault(); openMedia(); }
  });

  const onVolume = () => { if (eng) eng.volume(level()); };
  window.addEventListener('w95-volume', onVolume);
  const ro = new ResizeObserver(() => buildTicks());
  ro.observe(rail);

  win = createWindow({
    app: 'mplayer', title: 'Media Player', icon: 'i-mplayer', body: root,
    width: BASE, minW: 300, minH: 120, route: 'mplayer', autofocus: '.mp-scale',
    onResize: () => { if (win && win.state === 'normal' && win.el.style.height) userSized = true; if (win) layout(); },
    onClosed: () => {
      token++;
      cancelAnimationFrame(raf);
      if (eng) eng.destroy();
      eng = null;
      if (url) URL.revokeObjectURL(url);
      ro.disconnect();
      window.removeEventListener('w95-volume', onVolume);
    },
  });
  load(arg);
  if (!eng) render();
  bPlay.disabled ? bEject.focus() : bPlay.focus();
  return win;
}

export default { id: 'mplayer', title: 'Media Player', icon: 'i-mplayer', open };
