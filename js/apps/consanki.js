// Anki mining for CONscripter, ported from chimimouryou (lib/data/anki.ts): while a Japanese
// game plays, notes added to Anki (e.g. by Yomitan) get a screenshot and the line's voice,
// through AnkiConnect on the visitor's own computer. Settings per browser.

import { store } from '../util.js';

const KEY = 'w95.cons.anki';
const DEFAULTS = { on: false, url: 'http://127.0.0.1:8765', audioField: 'SentenceAudio', pictureField: 'Picture', screenshot: true, audio: true, tipped: false };

export const settings = () => ({ ...DEFAULTS, ...store.get(KEY, {}) });
export const set = changes => store.set(KEY, { ...settings(), ...changes });

export async function invoke(action, params = {}) {
  let res;
  try {
    // No Content-Type: a simple request, as Yomitan sends it.
    res = await fetch(settings().url, { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
  } catch {
    throw new Error('Anki is not reachable: is it running with AnkiConnect, and is this site allowed?');
  }
  const body = await res.json();
  if (body.error) throw new Error('AnkiConnect: ' + body.error);
  return body.result;
}

// Calls onNote for every note added after the first check, until the returned function is
// called. onError gets failed checks (e.g. Anki closed) and undefined once they work again.
export function watch(onNote, onError, interval = 2000) {
  let latest, stopped = false, timer;
  async function check() {
    try {
      // Note ids are their creation times, so newer notes have larger ids.
      const ids = await invoke('findNotes', { query: 'added:1' });
      const added = latest === undefined ? [] : ids.filter(id => id > latest);
      latest = Math.max(latest ?? 0, ...ids);
      onError(undefined);
      if (added.length && !stopped) for (const note of await invoke('notesInfo', { notes: added })) await onNote(note);
    } catch (e) {
      onError(e);
    }
    if (!stopped) timer = setTimeout(check, interval);
  }
  check();
  return () => { stopped = true; clearTimeout(timer); };
}

const extension = blob => { const t = (blob.type.split('/')[1] || 'bin').split(';')[0]; return { mpeg: 'mp3', jpeg: 'jpg' }[t] || t; };

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Stores the media in the note's audio and picture fields; fields that are missing or already
// filled (e.g. by Yomitan) are left alone. Returns the names of the fields filled.
export async function addMedia(note, { audio, picture }) {
  const s = settings(), update = { id: note.noteId, fields: {} }, filled = [];
  for (const [kind, blob, field] of [['audio', audio, s.audioField.trim()], ['picture', picture, s.pictureField.trim()]]) {
    if (blob && blob.size && note.fields[field] && !note.fields[field].value.trim()) {
      update[kind] = [{ data: await toBase64(blob), filename: `conscripter_${note.noteId}_${kind}.${extension(blob)}`, fields: [field] }];
      filled.push(field);
    }
  }
  if (filled.length) await invoke('updateNoteFields', { note: update });
  return filled;
}
