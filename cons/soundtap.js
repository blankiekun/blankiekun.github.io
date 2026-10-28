// The game's sound for Anki cards, for players whose lines have no voice file: CONscripter's
// (cons/player.html) and VNBox's (js/apps/vnbox.js loads it into the engine's frame). A classic
// script, before the engine's: it patches AudioNode.connect, which only acts once recordLines is set.
// Players call recordLine(line) as a line is shown and lineSound(line) for its sound.

// Without a voice file, the game's sound from the click that brought the line: whatever
// the engine sends to the speakers is also sent to soundTap, a worklet on the audio thread
// that hands back 16-bit stereo blocks stamped with their first frame. The last minute of
// them is kept here, and a line's sound is cut from it, so nothing starts or stops per
// click (a new MediaRecorder at each click could make the game's sound pop).
const TAP_SECONDS = 60;
const TAP_WORKLET = `registerProcessor('cons-tap', class extends AudioWorkletProcessor {
  constructor() { super(); this.pcm = new Int16Array(8192); this.n = 0; }
  process([input]) {
    const l = input[0], r = input[1] || l, len = l ? l.length : 128;
    if (!this.n) this.start = currentFrame;
    for (let i = 0; i < len; i++, this.n += 2) {
      this.pcm[this.n] = l ? Math.max(-1, Math.min(1, l[i])) * 32767 : 0;
      this.pcm[this.n + 1] = l ? Math.max(-1, Math.min(1, r[i])) * 32767 : 0;
    }
    if (this.n === this.pcm.length) {
      this.port.postMessage({ start: this.start, pcm: this.pcm }, [this.pcm.buffer]);
      this.pcm = new Int16Array(8192); this.n = 0;
    }
    return true;
  }
});`;
// A line's recording stops after LINE_SECONDS, so a line left on screen doesn't keep a minute of sound.
const LINE_SECONDS = 20;
let soundTap, tapReady = false, tapBlocks = [], tapEnd = 0, tapWaiting = [], recording = null;
var recordLines = false; // var: VNBox sets it from the page, as the frame's window.recordLines
const nativeConnect = AudioNode.prototype.connect;
AudioNode.prototype.connect = function (target) {
  if (recordLines && target instanceof AudioDestinationNode) {
    if (!soundTap) startSoundTap(this.context);
    if (soundTap.context === this.context) nativeConnect.call(this, soundTap);
  }
  return nativeConnect.apply(this, arguments);
};

function startSoundTap(ctx) {
  soundTap = ctx.createGain(); // sources connect here at once; the worklet joins when loaded
  const url = URL.createObjectURL(new Blob([TAP_WORKLET], { type: 'text/javascript' }));
  ctx.audioWorklet.addModule(url).then(() => {
    const node = new AudioWorkletNode(ctx, 'cons-tap', { numberOfOutputs: 1, outputChannelCount: [1] });
    const mute = ctx.createGain();
    mute.gain.value = 0; // the worklet must reach the speakers to be run, silently
    nativeConnect.call(soundTap, node);
    nativeConnect.call(node, mute);
    nativeConnect.call(mute, ctx.destination);
    node.port.onmessage = ({ data }) => {
      tapBlocks.push(data);
      tapEnd = data.start + data.pcm.length / 2;
      while (tapBlocks.length && tapBlocks[0].start < tapEnd - TAP_SECONDS * ctx.sampleRate) tapBlocks.shift();
      tapWaiting = tapWaiting.filter(w => (tapEnd >= w.end ? (w.done(), false) : true));
    };
    tapReady = true;
    restartLineRecorder();
  }).catch(err => console.warn('No sound recording for Anki', err)).finally(() => URL.revokeObjectURL(url));
}

const tapNow = () => Math.round(soundTap.context.currentTime * soundTap.context.sampleRate);

// The kept sound from frame start to end, as a WAV, once the worklet has sent it (or after a
// second, if the sound has stopped: a suspended context sends nothing).
async function tapClip(start, end) {
  await new Promise(done => {
    if (tapEnd >= end) return done();
    tapWaiting.push({ end, done });
    setTimeout(done, 1000);
  });
  const frames = Math.max(0, end - start), pcm = new Int16Array(frames * 2);
  for (const b of tapBlocks) {
    const from = Math.max(start, b.start), to = Math.min(end, b.start + b.pcm.length / 2);
    if (from < to) pcm.set(b.pcm.subarray((from - b.start) * 2, (to - b.start) * 2), (from - start) * 2);
  }
  const head = new DataView(new ArrayBuffer(44)), rate = soundTap.context.sampleRate;
  [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']].forEach(([o, s]) => [...s].forEach((c, i) => head.setUint8(o + i, c.charCodeAt(0))));
  head.setUint32(4, 36 + pcm.byteLength, true);
  head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 2, true); // PCM, stereo
  head.setUint32(24, rate, true); head.setUint32(28, rate * 4, true);
  head.setUint16(32, 4, true); head.setUint16(34, 16, true);
  head.setUint32(40, pcm.byteLength, true);
  return new Blob([head, pcm], { type: 'audio/wav' });
}

function stopLineRecorder() {
  if (!recording) return;
  clearTimeout(recording.timer);
  if (recording.line) recording.line.audio = tapClip(recording.start, tapNow());
  recording = null;
}

function restartLineRecorder(e) {
  // Modifier keys are Yomitan's scan keys, not the game's.
  if (e && /^(Shift|Control|Alt|Meta)$/.test(e.key)) return;
  stopLineRecorder();
  if (tapReady) recording = { start: tapNow(), line: null, timer: setTimeout(stopLineRecorder, LINE_SECONDS * 1000) };
}
for (const type of ['mousedown', 'touchstart', 'keydown']) addEventListener(type, restartLineRecorder, true);

// A recorded line's WAV as Ogg Opus, about a tenth of the size, for the card (WebCodecs;
// the WAV where it is missing or fails).
async function oggOpus(wav) {
  if (!wav || !window.AudioEncoder) return wav;
  try {
    const sound = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await wav.arrayBuffer()); // Opus runs at 48 kHz
    const packets = [];
    let failed = null;
    const enc = new AudioEncoder({ output: c => { const d = new Uint8Array(c.byteLength); c.copyTo(d); packets.push(d); }, error: e => { failed = e; } });
    enc.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 96000 });
    const pcm = new Float32Array(sound.length * 2);
    pcm.set(sound.getChannelData(0));
    pcm.set(sound.getChannelData(1), sound.length);
    enc.encode(new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: sound.length, numberOfChannels: 2, timestamp: 0, data: pcm }));
    await enc.flush();
    enc.close();
    if (failed) throw failed;
    const PRESKIP = 312; // libopus's lookahead; the decoder drops it
    const head = new Uint8Array(19), hv = new DataView(head.buffer);
    head.set(new TextEncoder().encode('OpusHead'));
    head[8] = 1; head[9] = 2; hv.setUint16(10, PRESKIP, true); hv.setUint32(12, 48000, true);
    const tags = new Uint8Array(8 + 4 + 11 + 4);
    tags.set(new TextEncoder().encode('OpusTagsxxxxCONscripter'));
    new DataView(tags.buffer).setUint32(8, 11, true);
    const pages = [oggPage([head], 0, 2, 0), oggPage([tags], 0, 0, 1)];
    // Packets of 20 ms (960 frames) gathered into pages of up to 255 lacing values; the
    // last page's position cuts the encoder's padding off the end.
    for (let i = 0, done = 0; i < packets.length;) {
      const group = [];
      for (let lacing = 0; i < packets.length && lacing + Math.floor(packets[i].length / 255) + 1 <= 255; i++) {
        lacing += Math.floor(packets[i].length / 255) + 1;
        group.push(packets[i]);
      }
      done += group.length * 960;
      const last = i === packets.length;
      pages.push(oggPage(group, last ? PRESKIP + sound.length : PRESKIP + done, last ? 4 : 0, pages.length));
    }
    return new Blob(pages, { type: 'audio/ogg' });
  } catch (err) {
    console.warn('Keeping the WAV: no Opus', err);
    return wav;
  }
}

const OGG_CRC = new Uint32Array(256).map((_, i) => {
  let r = i << 24;
  for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
  return r >>> 0;
});
function oggPage(packets, granule, flags, seq) {
  const lacing = [];
  for (const p of packets) { let n = p.length; for (; n >= 255; n -= 255) lacing.push(255); lacing.push(n); }
  const size = packets.reduce((sum, p) => sum + p.length, 0);
  const page = new Uint8Array(27 + lacing.length + size), v = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53]); // OggS
  v.setUint8(5, flags); // 2: first page, 4: last
  v.setBigUint64(6, BigInt(granule), true);
  v.setUint32(14, 0x636f6e73, true); // stream serial number
  v.setUint32(18, seq, true);
  v.setUint8(26, lacing.length);
  page.set(lacing, 27);
  let o = 27 + lacing.length;
  for (const p of packets) { page.set(p, o); o += p.length; }
  let crc = 0;
  for (const b of page) crc = ((crc << 8) ^ OGG_CRC[(crc >>> 24) ^ b]) >>> 0;
  v.setUint32(22, crc, true);
  return page;
}

// The sound recorded since the last click is this line's (line.audio, once the next click ends it).
function recordLine(line) { if (recording) recording.line = line; }

// A line's sound as Ogg Opus (or WAV), or null; still recording, its sound ends now.
async function lineSound(line) {
  if (recording && recording.line === line) stopLineRecorder();
  return oggOpus(await line.audio);
}
