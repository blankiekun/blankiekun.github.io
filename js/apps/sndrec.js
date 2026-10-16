// Sound Recorder. Records up to 60 seconds from the microphone, plays it back,
// trims it, runs the Effects menu over the samples and saves 16-bit PCM .wav files.

import { h, store, clamp } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import { openFile as openDialog, saveAs as saveDialog, saveTo } from '../filedlg.js';

const MAX = 60;     // seconds a recording can grow to, like the original's buffer
let clip = null;    // Edit > Copy, shared by every Sound Recorder window: { chans, rate }

// The shell's master volume (the tray's volume popup writes this key).
function level() {
  const v = store.get('w95.volume', { level: 0.8, mute: false });
  return v.mute ? 0 : clamp(+v.level || 0, 0, 1);
}

// Transport glyphs, drawn as rows of pixels so they stay crisp at 1x.
function tri(x, ht, dir) {
  const half = Math.ceil(ht / 2);
  let d = '';
  for (let i = 0; i < ht; i++) {
    const w = i < half ? i + 1 : ht - i;
    d += `M${dir > 0 ? x : x + half - w} ${i}h${w}v1h-${w}z`;
  }
  return d;
}
const bar = x => `M${x} 0h1v9h-1z`;
const dot = () => [3, 5, 7, 7, 7, 5, 3].map((w, i) => `M${(7 - w) / 2} ${i + 1}h${w}v1h-${w}z`).join('');
export const GLYPH = {
  start: [11, bar(0) + tri(1, 9, -1) + tri(6, 9, -1)],
  end: [11, tri(0, 9, 1) + tri(5, 9, 1) + bar(10)],
  back: [10, tri(0, 9, -1) + tri(5, 9, -1)],
  fwd: [10, tri(0, 9, 1) + tri(5, 9, 1)],
  play: [5, tri(0, 9, 1)],
  stop: [7, 'M0 1h7v7H0z'],
  pause: [7, 'M0 0h3v9H0zM4 0h3v9H4z'],
  rec: [7, dot()],
  eject: [9, [0, 1, 2, 3, 4].map(i => `M${4 - i} ${i}h${2 * i + 1}v1h-${2 * i + 1}z`).join('') + 'M0 7h9v2H0z'],
};
export function glyph(name) {
  const [w, d] = GLYPH[name];
  return `<svg width="${w}" height="9" viewBox="0 0 ${w} 9" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
}

// 16-bit PCM RIFF/WAVE, channels interleaved.
function encodeWav(chans, rate) {
  const n = chans[0].length, nc = chans.length, bytes = n * nc * 2;
  const v = new DataView(new ArrayBuffer(44 + bytes));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, bytes, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const s = clamp(chans[c][i], -1, 1);
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([v.buffer], { type: 'audio/wav' });
}

// Mix down or spread out to `nc` channels.
function conform(chans, nc) {
  if (chans.length === nc) return chans;
  if (nc === 1) {
    const out = new Float32Array(chans[0].length);
    for (const d of chans) for (let i = 0; i < d.length; i++) out[i] += d[i] / chans.length;
    return [out];
  }
  return Array.from({ length: nc }, (_, c) => chans[c % chans.length]);
}

function resample(d, from, to) {
  if (from === to) return d;
  const out = new Float32Array(Math.round(d.length * to / from));
  for (let i = 0; i < out.length; i++) {
    const x = i * from / to, j = Math.floor(x), f = x - j;
    out[i] = (d[j] || 0) * (1 - f) + (d[j + 1] || 0) * f;
  }
  return out;
}

function join(...parts) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function open(arg) {
  let name = 'Sound', path = null;   // path: where it's saved on the pretend disk
  let rate = 44100;
  let chans = [new Float32Array(0)];   // never mutated in place, so `saved` can share arrays
  let saved = chans;                   // what Revert goes back to
  let dirty = false;
  let pos = 0;                         // seconds
  let mode = 'idle';                   // 'idle' | 'arming' | 'play' | 'rec'
  let ctx = null, gain = null, src = null, t0 = 0, p0 = 0, raf = 0;
  let stream = null, mic = null, proc = null, sink = null, rec = null;

  const frames = () => chans[0].length;
  const length = () => frames() / rate;
  const shownLength = () => mode === 'rec' ? Math.max(length(), pos) : length();

  function ac() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      gain = ctx.createGain();
      gain.connect(ctx.destination);
      if (!frames()) rate = ctx.sampleRate;
    }
    gain.gain.value = level();
    return ctx;
  }
  const onVolume = () => { if (gain) gain.gain.setTargetAtTime(level(), ctx.currentTime, 0.02); };
  window.addEventListener('w95-volume', onVolume);

  // ---------- the panel ----------
  const posOut = h('div', { class: 'sr-val', 'aria-live': 'off' });
  const lenOut = h('div', { class: 'sr-val' });
  const canvas = h('canvas', { width: 150, height: 48, 'aria-hidden': 'true' });
  const g = canvas.getContext('2d');
  const slider = h('input', { type: 'range', class: 'trackbar', min: 0, max: 0, step: 1, value: 0, 'aria-label': 'Position' });
  const btn = (kind, label, fn) => h('button', { type: 'button', class: 'mbtn ' + kind, 'aria-label': label, title: label, html: glyph(kind), onclick: fn });
  const bStart = btn('start', 'Seek to Start', () => seekTo(0));
  const bEnd = btn('end', 'Seek to End', () => seekTo(length()));
  const bPlay = btn('play', 'Play', play);
  const bStop = btn('stop', 'Stop', stop);
  const bRec = btn('rec', 'Record', record);

  slider.addEventListener('input', () => seekTo(slider.value / 100));

  // The green trace: live input while recording, otherwise the sound around the position.
  function draw() {
    const W = canvas.width, H = canvas.height, mid = H >> 1;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#00ff00';
    let pick;
    if (mode === 'rec' && rec && rec.live) {
      const d = rec.live, step = d.length / W;
      pick = x => d[Math.floor(x * step)];
    } else {
      const d = chans[0], step = Math.max(1, Math.round(rate / 20 / W));   // 1/20 sec across the box
      const i0 = Math.round(pos * rate) - (W >> 1) * step;
      pick = x => d[i0 + x * step] || 0;
    }
    let prev = mid;
    for (let x = 0; x < W; x++) {
      const y = clamp(Math.round(mid - pick(x) * (mid - 1)), 0, H - 1);
      const top = Math.min(prev, y), bot = Math.max(prev, y);
      g.fillRect(x, top, 1, bot - top + 1);
      prev = y;
    }
  }

  function update() {
    posOut.textContent = pos.toFixed(2) + ' sec.';
    lenOut.textContent = shownLength().toFixed(2) + ' sec.';
    slider.max = Math.round(shownLength() * 100);
    slider.value = Math.round(pos * 100);
    slider.disabled = mode === 'rec' || mode === 'arming' || !frames();
    const had = document.activeElement;
    const idle = mode === 'idle';
    bStart.disabled = !(idle || mode === 'play') || !frames() || pos <= 0;
    bEnd.disabled = !(idle || mode === 'play') || !frames() || pos >= length();
    bPlay.disabled = !idle || !frames();
    bStop.disabled = idle || mode === 'arming';
    bRec.disabled = !idle || pos >= MAX - 0.005;
    // A button that just went grey keeps the keyboard focus nearby, as Windows does.
    if (had && had.disabled && root.contains(had)) (!idle ? bStop : !bPlay.disabled ? bPlay : bRec).focus();
    draw();
  }

  function loop() {
    if (mode === 'play') pos = Math.min(length(), p0 + ctx.currentTime - t0);
    update();
    raf = requestAnimationFrame(loop);
  }

  // ---------- transport ----------
  function play() {
    if (mode !== 'idle' || !frames()) return;
    if (pos >= length() - 0.005) pos = 0;
    const c = ac();
    c.resume();
    const buf = c.createBuffer(chans.length, frames(), rate);
    chans.forEach((d, i) => buf.copyToChannel(d, i));
    const s = src = c.createBufferSource();
    s.buffer = buf;
    s.connect(gain);
    s.onended = () => { if (src === s) { pos = length(); halt(); } };
    t0 = c.currentTime; p0 = pos;
    s.start(0, pos);
    mode = 'play';
    loop();
  }

  function halt() {
    if (src) { src.onended = null; try { src.stop(); } catch {} src.disconnect(); src = null; }
    mode = 'idle';
    cancelAnimationFrame(raf);
    update();
  }

  function stop() {
    if (mode === 'play') pos = Math.min(length(), p0 + ctx.currentTime - t0);
    if (mode === 'rec') commit();
    halt();
  }

  function seekTo(t) {
    const wasPlaying = mode === 'play';
    if (wasPlaying) halt();
    pos = clamp(t, 0, length());
    if (wasPlaying && pos < length()) play(); else update();
  }

  async function record() {
    if (mode !== 'idle' || pos >= MAX) return;
    mode = 'arming';
    update();
    const c = ac();
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error(), { name: 'NotFoundError' });
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (err) {
      mode = 'idle';
      update();
      const text = err.name === 'NotAllowedError' || err.name === 'SecurityError'
        ? 'Sound Recorder cannot record because access to the microphone was denied.\n\nAllow this site to use your microphone, and then try again.'
        : err.name === 'NotFoundError' || err.name === 'OverconstrainedError'
          ? 'No wave recording device is installed.\n\nConnect a microphone, and then try again.'
          : 'The recording device is already in use or could not be opened.';
      msgbox({ title: 'Sound Recorder', icon: 'error', parent: win, text });
      return;
    }
    if (!win.el.isConnected) { release(); return; }
    await c.resume();
    if (!frames()) rate = c.sampleRate;
    mic = c.createMediaStreamSource(stream);
    proc = c.createScriptProcessor(2048, 1, 1);
    sink = c.createGain();
    sink.gain.value = 0;        // the processor only runs while connected to the output
    mic.connect(proc); proc.connect(sink); sink.connect(c.destination);
    rec = { start: pos, chunks: [], n: 0, live: null };
    const room = Math.round((MAX - pos) * rate);
    proc.onaudioprocess = e => {
      if (mode !== 'rec') return;
      let d = e.inputBuffer.getChannelData(0);
      if (d.length > room - rec.n) d = d.subarray(0, room - rec.n);
      rec.chunks.push(new Float32Array(d));
      rec.n += d.length;
      rec.live = d;
      pos = rec.start + rec.n / rate;
      if (rec.n >= room) stop();
    };
    mode = 'rec';
    loop();
  }

  // Recording writes over whatever was after the position, and the tail is kept.
  function commit() {
    const s = Math.round(rec.start * rate), data = join(...rec.chunks);
    if (data.length) {
      chans = chans.map(old => join(old.subarray(0, s), data, old.subarray(Math.min(old.length, s + data.length))));
      dirty = true;
    }
    pos = rec.start + data.length / rate;
    rec = null;
    release();
  }

  function release() {
    if (proc) { proc.onaudioprocess = null; proc.disconnect(); proc = null; }
    if (mic) { mic.disconnect(); mic = null; }
    if (sink) { sink.disconnect(); sink = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  // ---------- editing ----------
  const editable = () => mode === 'idle' && frames() > 0;

  function effect(fn, newPos) {
    if (!editable()) return;
    const was = length();
    chans = chans.map(fn);
    pos = clamp(newPos ? newPos(pos, was) : pos, 0, length());
    dirty = true;
    update();
  }
  const EFFECTS = {
    louder: () => effect(d => d.map(s => clamp(s * 1.25, -1, 1))),
    softer: () => effect(d => d.map(s => s * 0.8)),
    faster: () => effect(d => {
      const out = new Float32Array(d.length >> 1);
      for (let i = 0; i < out.length; i++) out[i] = (d[2 * i] + d[2 * i + 1]) / 2;
      return out;
    }, p => p / 2),
    slower: () => effect(d => {
      const out = new Float32Array(d.length * 2);
      for (let i = 0; i < d.length; i++) { out[2 * i] = d[i]; out[2 * i + 1] = (d[i] + (i + 1 < d.length ? d[i + 1] : d[i])) / 2; }
      return out;
    }, p => p * 2),
    echo: () => effect(d => {
      const a = Math.round(rate * 0.12), b = a * 2, out = new Float32Array(d.length);
      for (let i = 0; i < d.length; i++) out[i] = clamp(d[i] + 0.45 * (d[i - a] || 0) + 0.2 * (d[i - b] || 0), -1, 1);
      return out;
    }),
    reverse: () => effect(d => d.slice().reverse(), (p, len) => len - p),
  };

  async function deletePart(before) {
    if (!editable()) return;
    const b = await msgbox({ title: 'Sound Recorder', icon: 'question', parent: win, buttons: ['OK', 'Cancel'],
      text: `Do you want to delete the sound data ${before ? 'before' : 'after'} the current position (${pos.toFixed(2)} sec.)?` });
    if (b !== 'OK') return;
    const s = Math.round(pos * rate);
    chans = chans.map(d => before ? d.slice(s) : d.slice(0, s));
    if (before) pos = 0;
    dirty = true;
    update();
  }

  // Insert or mix other sound in at the position; the position moves past what was inserted.
  function paste(add, mix) {
    if (mode !== 'idle') return;
    if (!frames()) { chans = add.map(d => d.slice()); pos = 0; dirty = true; update(); return; }
    add = conform(add, chans.length);
    const s = Math.round(pos * rate), n = add[0].length;
    chans = chans.map((old, c) => {
      if (!mix) return join(old.subarray(0, s), add[c], old.subarray(s));
      const out = new Float32Array(Math.max(old.length, s + n));
      out.set(old);
      for (let i = 0; i < n; i++) out[s + i] = clamp(out[s + i] + add[c][i], -1, 1);
      return out;
    });
    if (!mix) pos += n / rate;
    dirty = true;
    update();
  }

  // ---------- files ----------
  const picker = h('input', { type: 'file', accept: 'audio/*,.wav,.mp3,.ogg,.m4a,.flac', hidden: true });
  let onPick = null;
  picker.addEventListener('change', () => { const f = picker.files[0]; picker.value = ''; if (f && onPick) onPick(f); });
  function pickFile(fn) { onPick = fn; picker.click(); }

  async function decode(file) {
    try {
      const buf = await ac().decodeAudioData(await file.arrayBuffer());
      return Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, i) => new Float32Array(buf.getChannelData(i)));
    } catch {
      msgbox({ title: 'Sound Recorder', icon: 'error', parent: win,
        text: `Cannot open ${file.name}.\n\nThis is not a valid sound file, or it uses a format that is not supported.` });
      return null;
    }
  }

  const WAV = [{ label: 'Sounds (*.wav)', exts: ['.wav'] }, { label: 'All Files (*.*)', exts: [] }];
  async function load(f, p) {
    const data = await decode(f);
    if (!data) return;
    rate = ctx.sampleRate;
    chans = saved = data;
    name = f.name; path = p || null;
    pos = 0; dirty = false;
    win.setTitle(title());
    update();
  }
  // Sounds on the pretend disk are kept as data: URLs.
  const fromData = async (data, n) => new File([await (await fetch(data)).blob()], n);
  async function openFile() {
    if (mode !== 'idle' || !(await confirmSave())) return;
    const r = await openDialog({ filters: WAV, parent: win, accept: 'audio/*,.wav,.mp3,.ogg,.m4a,.flac' });
    if (!r) return;
    if (r.file) load(r.file);
    else if (r.node.data) load(await fromData(r.node.data, r.name), r.node.user ? r.path : null);
    else msgbox({ title: 'Sound Recorder', icon: 'error', parent: win, text: `Cannot open ${r.name}.\n\nThis is not a valid sound file, or it uses a format that is not supported.` });
  }

  function reset() {
    if (mode !== 'idle') stop();
    chans = saved = [new Float32Array(0)];
    name = 'Sound'; path = null; pos = 0; dirty = false;
    win.setTitle(title());
    update();
  }

  const dataUrl = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  function markSaved(n, p) {
    name = n; path = p || null;
    saved = chans;
    dirty = false;
    win.setTitle(title());
    return true;
  }
  async function save() {
    if (!path) return saveAs();
    if (mode !== 'idle') stop();
    if (!saveTo({ path }, { data: await dataUrl(encodeWav(chans, rate)) }, null, win)) return false;
    return markSaved(name, path);
  }
  async function saveAs() {
    if (mode !== 'idle') stop();
    const r = await saveDialog({ name: /\.wav$/i.test(name) ? name : name.replace(/\.[^.]+$/, '') + '.wav', filters: WAV, parent: win });
    if (!r) return false;
    const blob = encodeWav(chans, rate);
    const n = saveTo(r, r.floppy ? {} : { data: await dataUrl(blob) }, () => blob, win);
    if (!n && !r.floppy) return false;
    return markSaved(r.name, n ? r.path : null);
  }

  async function confirmSave() {
    if (mode !== 'idle') stop();
    if (!dirty) return true;
    const b = await msgbox({ title: 'Sound Recorder', icon: 'warn', parent: win, buttons: ['&Yes', '&No', 'Cancel'],
      text: `The sound in ${name} has been modified.\n\nDo you want to save changes?` });
    if (b === 'Yes') return saveAs();
    return b === 'No';
  }

  function properties() {
    const bytes = frames() * chans.length * 2;
    msgbox({ title: `${name} Properties`, icon: null, parent: win,
      text: `${name}\n\nLength:\t\t${length().toFixed(2)} sec.\nData Size:\t${bytes.toLocaleString('en-US')} bytes\n` +
        `Audio Format:\tPCM ${rate.toLocaleString('en-US')} Hz, 16 Bit, ${chans.length === 1 ? 'Mono' : 'Stereo'}` });
  }

  const title = () => `${name} - Sound Recorder`;

  const menu = menubar([
    { label: '&File', items: () => [
      { label: '&New', action: async () => { if (await confirmSave()) reset(); } },
      { label: '&Open...', action: openFile },
      { label: '&Save', disabled: !dirty && name !== 'Sound', action: save },
      { label: 'Save &As...', action: saveAs },
      { label: '&Revert...', disabled: !dirty || mode !== 'idle', action: async () => {
        const b = await msgbox({ title: 'Sound Recorder', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: 'Do you want to discard your changes and return to the last saved version?' });
        if (b === 'Yes') { chans = saved; pos = clamp(pos, 0, length()); dirty = false; update(); }
      } },
      '-',
      { label: 'Proper&ties', action: properties },
      '-',
      { label: 'E&xit', action: () => win.close() },
    ] },
    { label: '&Edit', items: () => [
      { label: '&Copy', disabled: !editable(), action: () => { clip = { chans, rate }; } },
      { label: '&Paste Insert', disabled: !clip || mode !== 'idle', action: () => paste(clip.chans.map(d => resample(d, clip.rate, rate)), false) },
      { label: 'Paste Mi&x', disabled: !clip || mode !== 'idle', action: () => paste(clip.chans.map(d => resample(d, clip.rate, rate)), true) },
      '-',
      { label: '&Insert File...', disabled: mode !== 'idle', action: () => pickFile(async f => { const d = await decode(f); if (d) { rate = frames() ? rate : ctx.sampleRate; paste(d, false); } }) },
      { label: '&Mix with File...', disabled: mode !== 'idle', action: () => pickFile(async f => { const d = await decode(f); if (d) { rate = frames() ? rate : ctx.sampleRate; paste(d, true); } }) },
      '-',
      { label: 'Delete &Before Current Position', disabled: !editable() || pos <= 0, action: () => deletePart(true) },
      { label: 'Delete &After Current Position', disabled: !editable() || pos >= length(), action: () => deletePart(false) },
    ] },
    { label: 'Effect&s', items: () => [
      { label: '&Increase Volume (by 25%)', disabled: !editable(), action: EFFECTS.louder },
      { label: '&Decrease Volume', disabled: !editable(), action: EFFECTS.softer },
      '-',
      { label: 'I&ncrease Speed (by 100%)', disabled: !editable(), action: EFFECTS.faster },
      { label: 'D&ecrease Speed', disabled: !editable(), action: EFFECTS.slower },
      '-',
      { label: '&Add Echo', disabled: !editable(), action: EFFECTS.echo },
      '-',
      { label: '&Reverse', disabled: !editable(), action: EFFECTS.reverse },
    ] },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') },
      '-',
      { label: '&About Sound Recorder', action: () => about('Sound Recorder', 'i-sndrec', win) },
    ] },
  ]);

  const root = h('div', { class: 'sr-body' },
    h('div', { class: 'sr-top' },
      h('div', { class: 'sr-read' }, h('div', null, 'Position:'), posOut),
      h('div', { class: 'sr-wave' }, canvas),
      h('div', { class: 'sr-read len' }, h('div', null, 'Length:'), lenOut)),
    slider,
    h('div', { class: 'sr-btns' }, bStart, bEnd, bPlay, bStop, bRec));

  const win = createWindow({
    app: 'sndrec', title: title(), icon: 'i-sndrec', body: h('div', { class: 'sr' }, menu, root, picker),
    width: 'auto', resizable: false, maximizable: false, route: 'sndrec',
    onClose: confirmSave,
    onClosed: () => {
      cancelAnimationFrame(raf);
      if (src) { src.onended = null; try { src.stop(); } catch {} }
      release();
      window.removeEventListener('w95-volume', onVolume);
      if (ctx) ctx.close().catch(() => {});
    },
  });
  update();
  bRec.focus();
  if (arg && arg.data) fromData(arg.data, arg.name).then(f => load(f, arg.path));
  return win;
}

export default { id: 'sndrec', title: 'Sound Recorder', icon: 'i-sndrec', open };
