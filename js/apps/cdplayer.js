// CD Player. The drive holds "blankiekun – Greatest Hits": six chiptunes sequenced and
// synthesized live with WebAudio. Eject swaps in the visitor's own audio files instead.

import { h, store, clamp } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, inputbox, about } from '../dialogs.js';
import { glyph } from './sndrec.js';

const PREFS = 'w95.cdplayer.prefs';
const DISC = 'w95.cdplayer.disc';     // the visitor's play list and names for Greatest Hits

function level() {
  const v = store.get('w95.volume', { level: 0.8, mute: false });
  return v.mute ? 0 : clamp(+v.level || 0, 0, 1);
}

// ---------- the music ----------
// A song is a list of sections. Each section has one chord per bar and names a bass,
// arpeggio and drum pattern (16 steps a bar); `mel` is a melody in eighth notes that
// repeats across the section: a note like E5, '-' to hold, '.' for a rest.

const BASS = {   // R root, T third, F fifth, X sixth, S seventh, O octave
  none: '................',
  whole: 'R---------------',
  half: 'R-------F-------',
  eighths: 'R-O-R-O-R-O-R-O-',
  pump: 'R-R-F-R-R-R-F-O-',
  walk: 'R---T---F---X---',
  funk: 'R--.O.R..R.F-.O.',
};
const ARP = {    // 0-3 chord tones from the root up, C the whole chord at once
  none: '................',
  hit: 'C...............',
  up: '0123012301230123',
  down: '3210321032103210',
  updown: '0123212301232123',
  eighth: '0.1.2.3.2.1.0.1.',
  stab: '....C.......C...',
};
const DRUMS = {
  none: {},
  hats: { h: 'x.x.x.x.x.x.x.x.' },
  basic: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  drive: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' },
  swing: { k: 'x.......x.......', s: '....x.......x...', h: 'x...x.x.x...x.x.' },
  funk: { k: 'x..x......x..x..', s: '....x.......x..x', h: 'xxxxxxxxxxxxxxxx' },
  soft: { k: 'x.......x.......', h: '..x...x...x...x.' },
  fill: { k: 'x.......x.x.....', s: '....x.x.xxxx.xxx', h: 'x.x.x.x.........' },
};

const BLUES = 'E7 E7 E7 E7 A7 A7 E7 E7 B7 A7 E7 B7';
const SONGS = [
  { title: 'Boot Sequence', bpm: 138, parts: [
    { chords: 'C C F G', arp: 'up', bass: 'whole', drums: 'hats' },
    { chords: 'C Am F G', reps: 2, arp: 'eighth', bass: 'eighths', drums: 'basic',
      mel: 'E5 - G5 - C6 - B5 G5  A5 - - E5 C5 - E5 A5  F5 - A5 - C6 - D6 C6  B5 - G5 - D5 - G5 -' },
    { chords: 'F G Em Am F G C C', arp: 'up', bass: 'pump', drums: 'drive',
      mel: 'A5 - G5 - F5 - E5 -  D5 - E5 - F5 - G5 -  G5 - - E5 B4 - E5 G5  A5 - - - . . . .  A5 - C6 - F6 - C6 -  D6 - - B5 G5 - D6 -  C6 - - - G5 - E5 -  C5 - - - . . . .' },
    { chords: 'C Am F G', arp: 'eighth', bass: 'eighths', drums: 'basic',
      mel: 'E5 - G5 - C6 - B5 G5  A5 - - E5 C5 - E5 A5  F5 - A5 - C6 - D6 C6  B5 - G5 - D5 - G5 -' },
    { chords: 'C', arp: 'hit', bass: 'whole', drums: 'none', mel: 'C6 - - - - - - -' },
  ] },
  { title: 'Minesweeper Blues', bpm: 104, swing: 0.66, lead: 0.25, parts: [
    { chords: BLUES, arp: 'stab', bass: 'walk', drums: 'swing', mel: 'E5 . G5 E5 A5 - Bb5 B5  - - . . G5 - E5 .' },
    { chords: BLUES, arp: 'stab', bass: 'walk', drums: 'swing',
      mel: 'B5 - D6 - E6 - D6 B5  A5 - G5 - E5 - . .  G5 G5 A5 G5 E5 - D5 E5  - - - - . . . .' },
    { chords: 'E7', arp: 'hit', bass: 'whole', drums: 'none', mel: 'E5 - - - - - - -' },
  ] },
  { title: 'Furigana Funk', bpm: 108, lead: 0.125, parts: [
    { chords: 'Dm7 G7 Dm7 G7', arp: 'stab', bass: 'funk', drums: 'funk' },
    { chords: 'Dm7 G7 Dm7 G7 Bbmaj7 A7 Dm7 A7', arp: 'stab', bass: 'funk', drums: 'funk',
      mel: 'D5 . F5 D5 . A5 . G5  - . F5 . D5 . C5 D5  . . F5 G5 A5 . C6 A5  G5 - - . F5 . D5 .' },
    { chords: 'Dm7 Dm7', arp: 'none', bass: 'none', drums: 'fill' },
    { chords: 'Dm7 G7 Dm7 G7 Bbmaj7 A7 Dm7 A7', arp: 'stab', bass: 'funk', drums: 'funk',
      mel: 'A5 . C6 A5 . D6 . C6  - . A5 . G5 . F5 G5  . . A5 C6 D6 . F6 D6  C6 - - . A5 . G5 .' },
    { chords: 'Dm7', arp: 'hit', bass: 'whole', drums: 'none', mel: 'D6 - - - - - - -' },
  ] },
  { title: 'Solitaire Cascade', bpm: 168, parts: [
    { chords: 'Am F C G', reps: 2, arp: 'down', bass: 'eighths', drums: 'drive',
      mel: 'A5 - - - E5 - A5 B5  C6 - - - A5 - - -  G5 - - - E5 - C5 D5  E5 - - - D5 - - -' },
    { chords: 'F G Em Am', reps: 2, arp: 'updown', bass: 'pump', drums: 'drive',
      mel: 'C6 B5 A5 G5 F5 E5 D5 C5  D5 E5 F5 G5 A5 B5 C6 D6  E6 D6 C6 B5 A5 G5 F5 E5  A5 - - - - - . .' },
    { chords: 'Am F C G', reps: 2, arp: 'down', bass: 'eighths', drums: 'drive',
      mel: 'A5 - - - E5 - A5 B5  C6 - - - A5 - - -  G5 - - - E5 - C5 D5  E5 - - - D5 - - -' },
    { chords: 'Am', arp: 'hit', bass: 'whole', drums: 'none', mel: 'A5 - - - - - - -' },
  ] },
  { title: 'Blue Screen Ballad', bpm: 76, lead: 0.125, parts: [
    { chords: 'F Dm Bb C', arp: 'eighth', bass: 'half', drums: 'soft' },
    { chords: 'F Dm Bb C', reps: 2, arp: 'eighth', bass: 'half', drums: 'soft',
      mel: 'A5 - - - G5 - F5 -  D5 - - - - - . .  F5 - G5 - A5 - Bb5 -  G5 - - - - - . .' },
    { chords: 'F', arp: 'hit', bass: 'whole', drums: 'none', mel: 'F5 - - - - - - -' },
  ] },
  { title: 'It’s Now Safe to Turn Off', bpm: 120, parts: [
    { chords: 'G D Em C', reps: 2, arp: 'up', bass: 'eighths', drums: 'basic',
      mel: 'B5 - - - A5 - G5 -  F#5 - - - D5 - - -  E5 - G5 - B5 - D6 -  C6 - B5 - A5 - - -' },
    { chords: 'C D G Em C D G G', arp: 'updown', bass: 'pump', drums: 'drive',
      mel: 'E5 - G5 - C6 - - -  D6 - C6 - B5 - A5 -  G5 - - - D5 - G5 -  B5 - - - - - . .' },
    { chords: 'G D Em C', arp: 'eighth', bass: 'half', drums: 'soft',
      mel: 'B5 - - - A5 - G5 -  F#5 - - - D5 - - -  E5 - G5 - B5 - D6 -  C6 - B5 - A5 - - -' },
    { chords: 'G', arp: 'hit', bass: 'whole', drums: 'none', mel: 'G5 - - - - - - -' },
  ] },
];

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = s => { const m = /^([A-G])([#b]?)(\d)$/.exec(s); return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
const hz = m => 440 * 2 ** ((m - 69) / 12);
function chord(name) {
  const [, root, q = ''] = /^([A-G][#b]?)(maj7|m7|m|7)?$/.exec(name);
  const r = midi(root + '0') - 12;   // pitch class, 0-11
  const third = q.startsWith('m') && q !== 'maj7' ? 3 : 4;
  const seventh = q === 'maj7' ? 11 : 10;
  return { r, third, seventh, tones: q.includes('7') ? [0, third, 7, seventh] : [0, third, 7, 12] };
}

// Expands a song into a sorted list of { t, d, v, f } note events (times in seconds).
function compile(song) {
  const sp = 60 / song.bpm / 4;
  const ev = [];
  const at = step => (step + (song.swing && step % 4 === 2 ? song.swing : 0)) * sp;
  // A 16-step pattern string: each symbol starts a note held over the '-'s after it.
  const pattern = (str, base, fn) => {
    for (let i = 0; i < 16; i++) {
      const ch = str[i];
      if (ch === '.' || ch === '-') continue;
      let n = 1;
      while (str[i + n] === '-') n++;
      fn(ch, at(base + i), n * sp);
    }
  };
  let step = 0;
  for (const sec of song.parts) for (let rep = 0; rep < (sec.reps || 1); rep++) {
    const bars = sec.chords.split(' ');
    bars.forEach((name, b) => {
      const c = chord(name), base = step + b * 16;
      const bassAt = { R: 0, T: c.third, F: 7, X: 9, S: c.seventh, O: 12 };
      pattern(BASS[sec.bass || 'none'], base, (ch, t, d) => ev.push({ t, d: d * 0.9, v: 'bass', f: hz(36 + c.r + bassAt[ch]) }));
      pattern(ARP[sec.arp || 'none'], base, (ch, t, d) => {
        const notes = ch === 'C' ? c.tones.slice(0, 3) : [c.tones[+ch]];
        for (const n of notes) ev.push({ t, d: ch === 'C' ? sp * 3 : d * 0.8, v: ch === 'C' ? 'chord' : 'arp', f: hz(60 + c.r + n) });
      });
      const kit = DRUMS[sec.drums || 'none'];
      for (const v of ['k', 's', 'h']) if (kit[v]) pattern(kit[v], base, (ch, t) => ev.push({ t, d: 0, v }));
    });
    if (sec.mel) {
      const toks = sec.mel.trim().split(/\s+/), n = bars.length * 8;
      for (let i = 0; i < n; i++) {
        const tok = toks[i % toks.length];
        if (tok === '.' || tok === '-') continue;
        let len = 1;
        while (i + len < n && toks[(i + len) % toks.length] === '-') len++;
        ev.push({ t: at(step + i * 2), d: len * 2 * sp * 0.92, v: 'lead', f: hz(midi(tok)) });
      }
    }
    step += bars.length * 16;
  }
  ev.sort((a, b) => a.t - b.t);
  return { ev, length: step * sp + 1.2, duty: song.lead || 0.5 };
}

// ---------- the synthesizer ----------
const waves = new WeakMap();   // per AudioContext: noise buffer and pulse waves
function kit(c) {
  let k = waves.get(c);
  if (!k) {
    const noise = c.createBuffer(1, c.sampleRate, c.sampleRate), d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const pulse = duty => {
      const n = 32, re = new Float32Array(n), im = new Float32Array(n);
      for (let i = 1; i < n; i++) re[i] = 2 * Math.sin(i * Math.PI * duty) / (i * Math.PI);
      return c.createPeriodicWave(re, im);
    };
    k = { noise, pulse: { 0.5: pulse(0.5), 0.25: pulse(0.25), 0.125: pulse(0.125) } };
    waves.set(c, k);
  }
  return k;
}

function voice(c, bus, e, when, duty) {
  const K = kit(c);
  const g = c.createGain();
  g.connect(bus);
  const env = (peak, d, rel = 0.03) => {
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.004);
    g.gain.setTargetAtTime(peak * 0.6, when + 0.01, 0.08);
    g.gain.setValueAtTime(peak * 0.6, when + d);
    g.gain.linearRampToValueAtTime(0, when + d + rel);
  };
  const tone = (type, f, peak, d) => {
    const o = c.createOscillator();
    if (typeof type === 'number') o.setPeriodicWave(K.pulse[type]); else o.type = type;
    o.frequency.value = f;
    o.connect(g);
    env(peak, d);
    o.start(when);
    o.stop(when + d + 0.05);
    o.onended = () => g.disconnect();
  };
  const hit = (filter, freq, peak, decay) => {
    const s = c.createBufferSource(), f = c.createBiquadFilter();
    s.buffer = K.noise;
    f.type = filter; f.frequency.value = freq;
    s.connect(f); f.connect(g);
    g.gain.setValueAtTime(peak, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + decay);
    s.start(when, Math.random() * 0.5);
    s.stop(when + decay + 0.02);
    s.onended = () => g.disconnect();
  };
  switch (e.v) {
    case 'lead': tone(duty, e.f, 0.16, e.d); break;
    case 'arp': tone(0.25, e.f, 0.06, e.d); break;
    case 'chord': tone(0.5, e.f, 0.07, e.d); break;
    case 'bass': tone('triangle', e.f, 0.42, e.d); break;
    case 'h': hit('highpass', 7000, 0.12, 0.05); break;
    case 's': hit('bandpass', 1800, 0.35, 0.14); break;
    case 'k': {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(150, when);
      o.frequency.exponentialRampToValueAtTime(40, when + 0.12);
      o.connect(g);
      g.gain.setValueAtTime(0.7, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
      o.start(when); o.stop(when + 0.18);
      o.onended = () => g.disconnect();
    }
  }
}

// ---------- the LED display ----------
const SEG = {
  a: '1,1 12,1 10,3 3,3', b: '12,2 12,10 10,9 10,4', c: '12,12 12,21 10,19 10,13',
  d: '3,19 10,19 12,21 1,21', e: '1,12 3,13 3,19 1,21', f: '1,2 3,4 3,9 1,10', g: '2,11 3,10 10,10 11,11 10,12 3,12',
};
const DIGITS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
const ON = '#00ff00', OFF = '#002400';
function led(str) {
  let x = 0, out = '';
  const rect = (rx, y, w, ht) => `<rect x="${x + rx}" y="${y}" width="${w}" height="${ht}" fill="${ON}"/>`;
  for (const ch of str) {
    if (ch === '[' || ch === ']') { x += ch === ']' ? 2 : 0; out += rect(ch === '[' ? 1 : 4, 1, 2, 21) + rect(1, 1, 5, 2) + rect(1, 20, 5, 2); x += ch === '[' ? 9 : 7; }
    else if (ch === ':') { out += rect(1, 6, 2, 2) + rect(1, 15, 2, 2); x += 5; }
    else if (ch === ' ' || ch === '-') { if (ch === '-') out += rect(1, 10, 6, 2); x += 9; }
    else {
      for (const [k, pts] of Object.entries(SEG)) out += `<polygon transform="translate(${x} 0)" points="${pts}" fill="${(DIGITS[ch] || '').includes(k) ? ON : OFF}"/>`;
      x += 14;
    }
  }
  return `<svg viewBox="0 0 ${x} 23" width="${x}" height="23" shape-rendering="crispEdges" aria-hidden="true">${out}</svg>`;
}

const pad = n => String(n).padStart(2, '0');
const mmss = s => { s = Math.max(0, Math.floor(s + 1e-6)); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };
const nn = i => pad(i + 1);

// Small toolbar pictures, 16x16 like the real ones.
const px = (pts) => pts.map(([x, y, w = 1, ht = 1]) => `M${x} ${y}h${w}v${ht}h-${w}z`).join('');
const diag = (x, y, n, dx) => Array.from({ length: n }, (_, i) => [x + i * dx, y + i]);
const TOOL = {
  list: px([[2, 3, 8], [2, 6, 8], [2, 9, 8], [2, 12, 5], [12, 4, 1, 8], [13, 4, 2], [10, 11, 2, 2]]),
  elapsed: px([[2, 3, 1, 10], [4, 7, 7, 2], [11, 5, 1, 6], [12, 6, 1, 4], [13, 7, 1, 2]]),
  track: px([[2, 7, 7, 2], [9, 5, 1, 6], [10, 6, 1, 4], [11, 7, 1, 2], [13, 3, 1, 10]]),
  disc: px([[1, 7, 6, 2], [7, 5, 1, 6], [8, 6, 1, 4], [9, 7, 1, 2], [11, 3, 1, 10], [13, 3, 1, 10]]),
  random: px([...diag(2, 3, 10, 1), ...diag(11, 3, 10, -1), [12, 2, 2], [13, 3], [12, 13, 2], [13, 12], [2, 2], [2, 13]]),
  continuous: px([[3, 4, 10], [3, 4, 1, 7], [12, 4, 1, 7], [3, 10, 4], [7, 8, 1, 5], [8, 9, 1, 3], [9, 10]]),
  intro: px([[2, 4, 1, 8], [4, 4, 1, 8], [5, 5, 1, 6], [6, 6, 1, 4], [7, 7, 1, 2], [9, 11], [11, 11], [13, 11]]),
};
const toolSvg = d => `<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function hitsDisc() {
  const saved = store.get(DISC, {});
  const tracks = SONGS.map((s, i) => {
    const song = compile(s);
    return { title: (saved.names && saved.names[i]) || s.title, dur: song.length, song };
  });
  const list = Array.isArray(saved.list) && saved.list.every(i => Number.isInteger(i) && i >= 0 && i < tracks.length) ? saved.list : tracks.map((_, i) => i);
  return { hits: true, artist: saved.artist || 'blankiekun', title: saved.title || 'Greatest Hits', tracks, list };
}

// Reads each file's length from its metadata; files the browser can't play are left out.
async function localDisc(files) {
  files = files.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const tracks = (await Promise.all(files.map(f => new Promise(resolve => {
    const url = URL.createObjectURL(f), a = new Audio();
    const done = dur => { a.removeAttribute('src'); clearTimeout(t); if (dur == null) URL.revokeObjectURL(url); resolve(dur == null ? null : { title: f.name.replace(/\.[^.]+$/, ''), dur, url }); };
    const t = setTimeout(() => done(null), 8000);
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => done(null);
    a.src = url;
  })))).filter(Boolean);
  return { hits: false, artist: 'Unknown Artist', title: 'Unknown Title', tracks, list: tracks.map((_, i) => i) };
}

function open() {
  const prefs = { toolbar: false, info: true, status: true, time: 'elapsed', random: false, continuous: false, intro: false, introLen: 10, ...store.get(PREFS, {}) };
  const savePrefs = () => store.set(PREFS, prefs);

  let disc = hitsDisc();
  let order = [], cur = 0;          // order: play list indices, shuffled for Random Order
  let state = 'stop';               // 'stop' | 'play' | 'pause'
  let offset = 0;                   // position in the track while not playing
  let eng = null;                   // the running track: { pos(), stop() }
  let ctx = null, master = null;
  const au = new Audio();           // local files play through this, routed into `master`
  au.preload = 'auto';

  function ac() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.connect(ctx.destination);
      ctx.createMediaElementSource(au).connect(master);
    }
    return ctx;
  }
  const onVolume = () => { if (master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.02); };
  window.addEventListener('w95-volume', onVolume);

  const track = () => disc && order.length ? disc.tracks[order[cur]] : null;
  const pos = () => eng ? eng.pos() : offset;

  function synthPlayer(song, from) {
    const c = ac(), bus = c.createGain();
    bus.gain.value = 0.6;
    bus.connect(master);
    const t0 = c.currentTime + 0.05 - from;
    let i = song.ev.findIndex(e => e.t >= from - 0.001);
    if (i < 0) i = song.ev.length;
    // Schedule a little ahead; hidden tabs only get timers once a second, so look further.
    const pump = () => {
      const until = c.currentTime + (document.hidden ? 1.6 : 0.25);
      while (i < song.ev.length && t0 + song.ev[i].t < until) { const e = song.ev[i++]; voice(c, bus, e, Math.max(c.currentTime, t0 + e.t), song.duty); }
    };
    pump();
    const timer = setInterval(pump, 40);
    return {
      pos: () => clamp(c.currentTime - t0, from, song.length),
      stop() { clearInterval(timer); bus.gain.setTargetAtTime(0, c.currentTime, 0.01); setTimeout(() => bus.disconnect(), 150); },
    };
  }

  function filePlayer(t, from) {
    ac();
    if (au.src !== t.url) au.src = t.url;
    const seek = () => { try { au.currentTime = from; } catch {} };
    if (au.readyState >= 1) seek(); else au.addEventListener('loadedmetadata', seek, { once: true });
    au.play().catch(() => {});
    return { pos: () => au.readyState >= 1 ? au.currentTime : from, stop() { au.removeEventListener('loadedmetadata', seek); au.pause(); } };
  }
  au.addEventListener('ended', () => { if (state === 'play' && eng) trackEnded(); });

  function startEngine() {
    const t = track();
    if (!t) return;
    const c = ac();
    c.resume();
    master.gain.value = level();
    eng = t.url ? filePlayer(t, offset) : synthPlayer(t.song, offset);
  }
  function stopEngine() {
    if (!eng) return;
    offset = eng.pos();
    eng.stop();
    eng = null;
  }

  function buildOrder(keep) {
    const was = keep && order.length ? order[cur] : null;
    order = disc ? disc.list.slice() : [];
    if (prefs.random) {
      shuffle(order);
      const i = order.indexOf(was);
      if (i > 0) { order.splice(i, 1); order.unshift(was); }
    }
    cur = Math.max(0, order.indexOf(was));
  }

  // ---------- transport ----------
  function play() {
    if (!track() || state === 'play') return;
    startEngine();
    state = 'play';
    render();
  }
  function pause() {
    if (state === 'play') { stopEngine(); state = 'pause'; render(); }
    else if (state === 'pause') play();
  }
  function stop() {
    stopEngine();
    state = 'stop';
    offset = 0;
    buildOrder(false);
    render();
  }
  function goto(i) {
    if (!order.length) return;
    const playing = state === 'play';
    stopEngine();
    cur = (i + order.length) % order.length;
    offset = 0;
    if (playing) startEngine();
    render();
  }
  function prev() {
    if (!track()) return;
    if (pos() > 1.5) goto(cur);
    else if (cur > 0 || prefs.continuous) goto(cur - 1);
    else goto(0);
  }
  function next() {
    if (!track()) return;
    if (cur + 1 < order.length || prefs.continuous) goto(cur + 1);
  }
  function seek(d) {
    const t = track();
    if (!t) return;
    const p = pos() + d;
    if (p >= t.dur && d > 0) { if (cur + 1 < order.length || prefs.continuous) goto(cur + 1); return; }
    const playing = state === 'play';
    stopEngine();
    offset = clamp(p, 0, Math.max(0, t.dur - 0.25));
    if (playing) startEngine();
    render();
  }
  function trackEnded() {
    if (cur + 1 < order.length) goto(cur + 1);
    else if (prefs.continuous) {
      stopEngine();
      offset = 0;
      if (prefs.random) shuffle(order);
      cur = 0;
      startEngine();
      render();
    } else stop();
  }
  function eject() {
    stopEngine();
    state = 'stop';
    offset = 0;
    if (disc) {
      freeDisc();
      disc = null;
      buildOrder(false);
      render();
      picker.value = '';
      picker.click();
    } else {
      disc = hitsDisc();    // closing the empty tray puts Greatest Hits back
      buildOrder(false);
      render();
    }
  }
  function freeDisc() {
    if (!disc || disc.hits) return;
    au.pause();
    au.removeAttribute('src');
    au.load();
    disc.tracks.forEach(t => URL.revokeObjectURL(t.url));
  }

  const picker = h('input', { type: 'file', accept: 'audio/*', multiple: true, hidden: true });
  picker.addEventListener('change', async () => {
    const files = [...picker.files];
    if (!files.length) return;
    const d = await localDisc(files);
    if (!d.tracks.length) {
      msgbox({ title: 'CD Player', icon: 'error', parent: win, text: 'None of the selected files could be played.\n\nPlease insert an audio compact disc.' });
      return;
    }
    if (!win.el.isConnected) { d.tracks.forEach(t => URL.revokeObjectURL(t.url)); return; }
    freeDisc();
    disc = d;
    state = 'stop'; offset = 0;
    buildOrder(false);
    render();
  });

  // ---------- the window ----------
  const display = h('button', { type: 'button', class: 'cdp-led', title: 'Click to change the time display', 'aria-label': 'Time display' });
  display.addEventListener('click', () => { prefs.time = { elapsed: 'track', track: 'disc', disc: 'elapsed' }[prefs.time]; savePrefs(); render(); });

  const tbtn = (kind, label, fn, cls) => h('button', { type: 'button', class: 'mbtn ' + (cls || kind), 'aria-label': label, title: label, html: glyph(kind), onclick: fn });
  const bPlay = tbtn('play', 'Play', play);
  const bPause = tbtn('pause', 'Pause', pause);
  const bStop = tbtn('stop', 'Stop', stop);
  const bPrev = tbtn('start', 'Previous Track', prev, 'prev');
  const bBack = tbtn('back', 'Skip Backwards', null);
  const bFwd = tbtn('fwd', 'Skip Forwards', null);
  const bNext = tbtn('end', 'Next Track', next, 'next');
  const bEject = tbtn('eject', 'Eject', eject);
  // Skip buttons scan while held; a keyboard press jumps five seconds.
  for (const [b, dir] of [[bBack, -1], [bFwd, 1]]) {
    let t1, t2;
    const end = () => { clearTimeout(t1); clearInterval(t2); };
    b.addEventListener('pointerdown', e => {
      if (e.button !== 0 || b.disabled) return;
      seek(dir);
      t1 = setTimeout(() => { t2 = setInterval(() => seek(dir), 150); }, 400);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, end);
    b.addEventListener('click', e => { if (e.detail === 0) seek(dir * 5); });
  }

  const artist = h('select', { class: 'field', 'aria-label': 'Artist' });
  const titleField = h('input', { class: 'field', readOnly: true, 'aria-label': 'Title' });
  const trackSel = h('select', { class: 'field', 'aria-label': 'Track' });
  trackSel.addEventListener('change', () => {
    const i = order.indexOf(+trackSel.value);
    if (i >= 0) goto(i);
  });

  const toolBtn = (key, label, fn) => {
    const b = h('button', { type: 'button', class: 'cdp-tb', title: label, 'aria-label': label, html: toolSvg(TOOL[key]), onclick: fn });
    b.dataset.key = key;
    return b;
  };
  const setTime = t => () => { prefs.time = t; savePrefs(); render(); };
  const toggle = k => () => {
    prefs[k] = !prefs[k];
    savePrefs();
    if (k === 'random') buildOrder(true);
    render();
  };
  const toolbar = h('div', { class: 'cdp-toolbar', role: 'toolbar' },
    toolBtn('list', 'Edit Play List', editPlayList), h('span', { class: 'sep' }),
    toolBtn('elapsed', 'Track Time Elapsed', setTime('elapsed')),
    toolBtn('track', 'Track Time Remaining', setTime('track')),
    toolBtn('disc', 'Disc Time Remaining', setTime('disc')), h('span', { class: 'sep' }),
    toolBtn('random', 'Random Track Order', toggle('random')),
    toolBtn('continuous', 'Continuous Play', toggle('continuous')),
    toolBtn('intro', 'Intro Play', toggle('intro')));

  const info = h('div', { class: 'cdp-info' },
    h('label', null, h('u', null, 'A'), 'rtist:'), artist,
    h('label', null, h('u', null, 'T'), 'itle:'), titleField,
    h('label', null, 'Trac', h('u', null, 'k'), ':'), trackSel);
  const stTotal = h('span'), stTrack = h('span');
  const status = h('div', { class: 'statusbar' }, stTotal, stTrack);

  let lastLed = '';
  function ledText() {
    const t = track();
    if (!t) return '[00] 00:00';
    const n = nn(order[cur]), p = pos();
    if (prefs.time === 'track') return `[${n}]-${mmss(t.dur - p)}`;
    if (prefs.time === 'disc') return `[${n}]-${mmss(order.slice(cur).reduce((s, i) => s + disc.tracks[i].dur, 0) - p)}`;
    return `[${n}] ${mmss(p)}`;
  }
  function renderTime() {
    const s = ledText();
    if (s !== lastLed) { display.innerHTML = led(s); display.setAttribute('aria-label', 'Time display ' + s); lastLed = s; }
    display.classList.toggle('blink', state === 'pause');
  }

  function render() {
    const t = track(), has = !!t;
    renderTime();
    bPlay.disabled = !has || state === 'play';
    bPause.disabled = !has || state === 'stop';
    bStop.disabled = !has || state === 'stop';
    bPause.classList.toggle('on', state === 'pause');
    for (const b of [bPrev, bBack, bFwd, bNext]) b.disabled = !has;
    if (document.activeElement && document.activeElement.disabled && root.contains(document.activeElement)) (has ? (state === 'play' ? bPause : bPlay) : bEject).focus();

    artist.replaceChildren(h('option', null, disc ? `${disc.artist}  <D:>` : 'Data or no disc loaded'));
    artist.disabled = !disc;
    titleField.value = disc ? disc.title : 'Please insert an audio compact disc';
    trackSel.replaceChildren(...(disc ? disc.list : []).map(i => h('option', { value: i }, `${disc.tracks[i].title} <${nn(i)}>`)));
    if (t) trackSel.value = order[cur];
    trackSel.disabled = !has;

    const total = disc ? disc.list.reduce((s, i) => s + disc.tracks[i].dur, 0) : 0;
    stTotal.textContent = `Total Play: ${mmss(total)} m:s`;
    stTrack.textContent = `Track: ${mmss(t ? t.dur : 0)} m:s`;

    toolbar.hidden = !prefs.toolbar;
    info.hidden = !prefs.info;
    status.hidden = !prefs.status;
    for (const b of toolbar.querySelectorAll('.cdp-tb')) {
      const k = b.dataset.key;
      b.setAttribute('aria-pressed', String(k === prefs.time || !!(prefs[k] === true)));
      b.disabled = k === 'list' && !disc;
    }
  }

  function tick() {
    const t = track();
    if (state === 'play' && eng && t) {
      const p = eng.pos();
      if ((prefs.intro && p >= prefs.introLen) || (!t.url && p >= t.dur - 0.02)) trackEnded();
    }
    renderTime();
  }
  const timer = setInterval(tick, 100);

  // ---------- Disc Settings ----------
  function editPlayList() {
    if (!disc) return;
    const d = disc, list = d.list.slice(), names = d.tracks.map(t => t.title);
    let selList = 0, selAvail = 0, selTrack = list.length ? list[0] : 0;
    const artistIn = h('input', { class: 'field', value: d.artist });
    const titleIn = h('input', { class: 'field', value: d.title });
    const listBox = h('div', { class: 'listbox', tabindex: '0', role: 'listbox', 'aria-label': 'Play List' });
    const availBox = h('div', { class: 'listbox', tabindex: '0', role: 'listbox', 'aria-label': 'Available Tracks' });
    const nameLbl = h('label', { class: 'cdp-nl' });
    const nameIn = h('input', { class: 'field' });
    const opt = (text, sel, fn) => h('div', { class: 'opt' + (sel ? ' sel' : ''), role: 'option', 'aria-selected': String(sel), onclick: fn }, text);
    function fill() {
      selList = clamp(selList, 0, Math.max(0, list.length - 1));
      listBox.replaceChildren(...list.map((ti, i) => opt(`${nn(ti)}  ${names[ti]}`, i === selList, () => { selList = i; selTrack = ti; fill(); })));
      availBox.replaceChildren(...names.map((n, i) => opt(`${nn(i)}  ${n}`, i === selAvail, () => { selAvail = i; selTrack = i; fill(); })));
      nameLbl.textContent = `Track ${nn(selTrack)}:`;
      nameIn.value = names[selTrack];
    }
    const keys = (box, get, set, len) => box.addEventListener('keydown', e => {
      const dir = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (dir) { e.preventDefault(); set(clamp(get() + dir, 0, len() - 1)); fill(); }
      if (e.key === 'Delete' && box === listBox) { e.preventDefault(); remove(); }
    });
    keys(listBox, () => selList, i => { selList = i; selTrack = list[i]; }, () => list.length);
    keys(availBox, () => selAvail, i => { selAvail = i; selTrack = i; }, () => names.length);
    const add = () => {
      if (list.length) list.splice(++selList, 0, selAvail); else { list.push(selAvail); selList = 0; }
      fill();
    };
    const remove = () => { if (list.length) { list.splice(selList, 1); fill(); } };
    const b = (label, fn) => h('button', { type: 'button', class: 'btn', onclick: fn }, label);
    const ok = () => {
      d.artist = artistIn.value.trim() || d.artist;
      d.title = titleIn.value.trim() || d.title;
      names.forEach((n, i) => { d.tracks[i].title = n; });
      d.list = list;
      if (d.hits) store.set(DISC, { artist: d.artist, title: d.title, names, list });
      dlg.close(true);
      if (disc !== d) return;
      const playing = order[cur];
      if (!list.includes(playing)) stop(); else { buildOrder(true); render(); }
    };
    const body = h('div', { class: 'dlg cdp-dlg' },
      h('div', null, 'Drive: \\Device\\CdRom0 <D:>'),
      h('div', { class: 'cdp-dl-fields' },
        h('label', null, 'Artist:'), artistIn,
        h('label', null, 'Title:'), titleIn),
      h('div', { class: 'cdp-lists' },
        h('div', null, h('div', null, 'Play List:'), listBox),
        h('div', { class: 'cdp-mid' }, b('← Add', add), b('Remove →', remove), b('Clear All', () => { list.length = 0; fill(); }), b('Reset', () => { list.splice(0, list.length, ...names.map((_, i) => i)); fill(); })),
        h('div', null, h('div', null, 'Available Tracks:'), availBox)),
      h('div', { class: 'cdp-setname' }, nameLbl, nameIn, b('Set Name', () => { const v = nameIn.value.trim(); if (v) { names[selTrack] = v; fill(); } })),
      h('div', { class: 'btns right' },
        h('button', { class: 'btn default', type: 'button', onclick: ok }, 'OK'),
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close(true) }, 'Cancel')));
    nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = nameIn.value.trim(); if (v) { names[selTrack] = v; fill(); } } });
    body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); dlg.close(true); } });
    fill();
    const dlg = createWindow({ title: 'CD Player: Disc Settings', body, dialog: true, resizable: false, width: 'auto', parent: win, taskbar: false });
    artistIn.focus();
  }

  async function preferences() {
    const v = await inputbox({ title: 'Preferences', label: 'Intro play length (seconds):', value: String(prefs.introLen), parent: win });
    if (v == null) return;
    const n = Math.round(+v);
    if (n >= 5 && n <= 15) { prefs.introLen = n; savePrefs(); }
    else msgbox({ title: 'CD Player', icon: 'warn', parent: win, text: 'The intro play length must be between 5 and 15 seconds.' });
  }

  const bar = menubar([
    { label: '&Disc', items: () => [
      { label: '&Edit Play List...', disabled: !disc, action: editPlayList },
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&View', items: () => [
      { label: '&Toolbar', checked: prefs.toolbar, action: toggle('toolbar') },
      { label: '&Disc/Track Info', checked: prefs.info, action: toggle('info') },
      { label: '&Status Bar', checked: prefs.status, action: toggle('status') },
      '-',
      { label: 'Track Time &Elapsed', checked: prefs.time === 'elapsed', radio: true, action: setTime('elapsed') },
      { label: 'Track Time &Remaining', checked: prefs.time === 'track', radio: true, action: setTime('track') },
      { label: 'Dis&c Time Remaining', checked: prefs.time === 'disc', radio: true, action: setTime('disc') },
    ] },
    { label: '&Options', items: () => [
      { label: '&Random Order', checked: prefs.random, action: toggle('random') },
      { label: '&Continuous Play', checked: prefs.continuous, action: toggle('continuous') },
      { label: '&Intro Play', checked: prefs.intro, action: toggle('intro') },
      '-',
      { label: '&Preferences...', action: preferences },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') },
      '-',
      { label: '&About CD Player', action: () => about('CD Player', 'i-cdplayer', win) },
    ] },
  ]);

  const root = h('div', { class: 'cdp' }, bar, toolbar,
    h('div', { class: 'cdp-main' }, display,
      h('div', { class: 'cdp-ctl' }, bPlay, bPause, bStop, bPrev, bBack, bFwd, bNext, bEject)),
    info, status, picker);

  const win = createWindow({
    app: 'cdplayer', title: 'CD Player', icon: 'i-cdplayer', body: root,
    width: 'auto', resizable: false, maximizable: false, route: 'cdplayer',
    onClosed: () => {
      clearInterval(timer);
      if (eng) eng.stop();
      freeDisc();
      au.pause();
      window.removeEventListener('w95-volume', onVolume);
      if (ctx) ctx.close().catch(() => {});
    },
  });
  buildOrder(false);
  render();
  bPlay.focus();
  return win;
}

export default { id: 'cdplayer', title: 'CD Player', icon: 'i-cdplayer', single: true, open };
