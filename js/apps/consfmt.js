// The variables in ONScripter save files, for CONscripter's Save Editor.
// A save (saveN.dat) is a run of 4-byte little-endian ints and NUL-ended strings:
// the text window, cursors, background, standing pictures, 1000 sprites, then the
// variables below the global border (%0 up), then the call stack and the rest.
// gloval.sav is only the global variables, from the border up. Everything the editor
// doesn't touch is copied back byte for byte.

const SPRITES = 1000;

function latin(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1 << 16) s += String.fromCharCode(...bytes.subarray(i, i + (1 << 16)));
  return s;
}

// The border and range from the script's first ";" line: ";mode800,value500" etc.,
// and the names numalias gives variables, for the editor to show.
export function scriptConfig(bytes) {
  const out = { border: 200, range: 4096, names: new Map() };
  const text = latin(bytes);
  for (const m of text.matchAll(/(?:^|[:\s])numalias[ \t]+([A-Za-z_][\w]*)[ \t]*,[ \t]*(\d+)/gim)) {
    const n = +m[2], had = out.names.get(n);
    out.names.set(n, had ? had + ', ' + m[1] : m[1]);
  }
  const at = bytes.indexOf(0x3b);
  if (at < 0) return out;
  let end = bytes.indexOf(0x0a, at);
  if (end < 0) end = bytes.length;
  const line = String.fromCharCode(...bytes.subarray(at + 1, Math.min(end, at + 200)));
  for (const part of line.replace(/^\s*\$/, '').split(',')) {
    let m;
    if ((m = part.match(/^\s*(?:value|g)\s*(\d+)/i))) out.border = +m[1];
    else if ((m = part.match(/^\s*v\s*(\d+)/i))) out.range = +m[1];
  }
  return out;
}

function reader(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const r = {
    p: 0,
    int() { const v = r.p + 4 <= u8.length ? dv.getInt32(r.p, true) : 0; r.p += 4; return v; },
    str() { const s = r.p; while (r.p < u8.length && u8[r.p]) r.p++; const v = u8.slice(s, r.p); r.p++; return v; },
    skip(ints) { r.p += ints * 4; },
  };
  return r;
}

function readVars(r, count, u8) {
  const vars = [];
  for (let i = 0; i < count; i++) {
    if (r.p + 4 > u8.length) return null;
    vars.push({ num: r.int(), str: r.str() });
  }
  return r.p <= u8.length ? vars : null;
}

// Where %0 starts in a save file, or -1 if it isn't one.
function varsStart(u8) {
  const r = reader(u8);
  let version = 208;
  if (u8[0] === 0x4f && u8[1] === 0x4e && u8[2] === 0x53) { version = u8[3] * 100 + u8[4]; r.p = 5; }
  if (version < 200 || version > 208) return -1;
  r.skip(8); r.str(); r.str();             // font flags, colour, the two cursors
  r.skip(2); r.str();                      // window effect
  r.skip(8); r.p += 4; r.skip(1);          // text window size, colour, wait
  r.skip(4); r.str();                      // text window picture
  r.skip(6); r.str();                      // cursor places, background
  r.str(); r.str(); r.str(); r.skip(6);    // standing pictures
  r.skip(version >= 203 ? 6 : 3);
  for (let i = 0; i < SPRITES; i++) { r.str(); r.skip(version >= 203 ? 5 : 4); }
  return r.p <= u8.length ? r.p : -1;
}

// { vars: [{ num, str: bytes }], start, end } for %0..%border-1, or null.
export function parseSave(u8, border) {
  const start = varsStart(u8);
  if (start < 0) return null;
  const r = reader(u8);
  r.p = start;
  const vars = readVars(r, border, u8);
  if (!vars) return null;
  // The call stack comes next; a wrong border lands somewhere that isn't one.
  const end = r.p, nest = r.int();
  if (nest < 0 || nest > 4096 || r.p > u8.length) return null;
  return { vars, start, end };
}

export function parseGlobal(u8) {
  const r = reader(u8), vars = [];
  while (r.p + 4 <= u8.length) vars.push({ num: r.int(), str: r.str() });
  return { vars, start: 0, end: u8.length };
}

export function writeVars(u8, parsed, vars) {
  const parts = [u8.subarray(0, parsed.start)];
  for (const v of vars) {
    const n = new Uint8Array(4);
    new DataView(n.buffer).setInt32(0, v.num, true);
    parts.push(n, v.str, new Uint8Array(1));
  }
  parts.push(u8.subarray(parsed.end));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Text in the game's own encoding. TextDecoder knows Shift JIS but there's no
// encoder, so the table is built backwards the first time it's needed.
let sjisTable = null;
function sjisEncode(s) {
  if (!sjisTable) {
    sjisTable = new Map();
    const dec = new TextDecoder('shift_jis');
    for (let b = 0xa1; b <= 0xdf; b++) sjisTable.set(dec.decode(new Uint8Array([b])), [b]);
    for (let a = 0x81; a <= 0xfc; a++) {
      if (a > 0x9f && a < 0xe0) continue;
      for (let b = 0x40; b <= 0xfc; b++) {
        if (b === 0x7f) continue;
        const c = dec.decode(new Uint8Array([a, b]));
        if (c.length === 1 && c !== '�' && !sjisTable.has(c)) sjisTable.set(c, [a, b]);
      }
    }
  }
  const out = [];
  for (const c of s) {
    const code = c.codePointAt(0);
    if (code < 0x80) out.push(code);
    else { const b = sjisTable.get(c); if (!b) return null; out.push(...b); }
  }
  return new Uint8Array(out);
}

export function decodeText(bytes, encoding) {
  return new TextDecoder(encoding === 'utf8' ? 'utf-8' : 'shift_jis').decode(bytes);
}
export function encodeText(s, encoding) {
  return encoding === 'utf8' ? new TextEncoder().encode(s) : sjisEncode(s);
}
