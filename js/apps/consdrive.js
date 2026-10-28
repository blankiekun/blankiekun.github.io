// Google Drive sync for CONscripter and VNBox saves (VNBox's games as 'vnbox:<title>'). Each game's saves go to one file in the
// app's hidden folder in the visitor's Drive (appDataFolder): only this site can see
// that folder, and the site can see nothing else in their Drive. Signing in is
// Google's token flow, all in the browser, so there's no server; a token lasts an hour.
//
// The file is gzipped JSON: { v, game, at, files: [{ path, mtime, data (base64) }] }.
// Syncing keeps the newest copy of each save file, by its time, on both sides.

import { GOOGLE_CLIENT_ID } from '../config.js';
import { store } from '../util.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const ON = 'w95.cons.drive';            // { email } while sync is on
const TOKEN = 'w95.cons.drive.token';   // in sessionStorage: { value, exp }

export const available = !!GOOGLE_CLIENT_ID;
export const account = () => available ? store.get(ON, null) : null;
export const enabled = () => !!account();

// kind: 'signin' (needs a click to sign in again), 'popup' (the sign-in window was
// blocked), 'closed' (they closed it), 'denied', 'net', 'drive'.
export class DriveError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

// ---------- signing in ----------

let gis = null;
function loadGis() {
  if (!gis) gis = new Promise((resolve, reject) => {
    if (window.google && google.accounts && google.accounts.oauth2) return resolve(google.accounts.oauth2);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => window.google && google.accounts ? resolve(google.accounts.oauth2) : s.onerror();
    s.onerror = () => { gis = null; s.remove(); reject(new DriveError('Google sign-in could not be loaded. Check the connection; an ad or tracker blocker can also stop it.', 'net')); };
    document.head.append(s);
  });
  return gis;
}
// Loaded ahead while sync is on, so the sign-in window opens straight from a click.
export function preload() { if (enabled()) loadGis().catch(() => {}); }

let token = null;
try { token = JSON.parse(sessionStorage.getItem(TOKEN)); } catch {}
function keepToken(t) {
  token = t;
  try { if (t) sessionStorage.setItem(TOKEN, JSON.stringify(t)); else sessionStorage.removeItem(TOKEN); } catch {}
}
const fresh = (ms = 0) => token && token.exp > Date.now() + ms ? token.value : null;
export const signedIn = () => !!fresh();

// Opens Google's window. Popup blockers let it through only just after a click.
async function signIn(prompt) {
  const oauth = await loadGis();
  return new Promise((resolve, reject) => {
    const a = account();
    oauth.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: SCOPE, prompt,
      ...(a && a.email ? { login_hint: a.email } : {}),
      callback: r => {
        if (r.error) return reject(new DriveError(r.error_description || r.error, r.error === 'access_denied' ? 'denied' : 'drive'));
        if (!oauth.hasGrantedAllScopes(r, SCOPE)) return reject(new DriveError('Google Drive access was not allowed.', 'denied'));
        keepToken({ value: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60e3 });
        resolve(r.access_token);
      },
      error_callback: e => reject(e && e.type === 'popup_failed_to_open'
        ? new DriveError('The browser blocked the Google sign-in window.', 'popup')
        : new DriveError('The Google sign-in window was closed.', 'closed')),
    }).requestAccessToken();
  });
}

const clicked = () => !!(navigator.userActivation && navigator.userActivation.isActive);

// A token, signing in again only where a click lets the window open. A token close to
// running out is renewed early when that can be done, except in full screen, where the
// window would pull the game out of it.
async function getToken(interactive) {
  const t = fresh();
  if (t && (fresh(10 * 60e3) || !clicked() || document.fullscreenElement)) return t;
  if (interactive || clicked()) {
    try { return await signIn(''); } catch (e) { if (t) return t; throw e; }
  }
  throw new DriveError('Google Drive sync needs you to sign in again.', 'signin');
}

// Turns sync on: signs in, choosing the account, and remembers who.
export async function connect() {
  await signIn('select_account');
  let email = '';
  try { email = (await (await call(`${API}/about?fields=user(emailAddress)`, {}, fresh())).json()).user.emailAddress || ''; } catch {}
  store.set(ON, { email });
  return email;
}

// Signs in again, with sync already on.
export const signInAgain = () => signIn('');

export async function disconnect() {
  const t = fresh();
  store.set(ON, null);
  keepToken(null);
  cache.clear();
  if (t) try { (await loadGis()).revoke(t, () => {}); } catch {}
}

// ---------- the Drive API ----------

async function call(url, opts, tok) {
  let r;
  try {
    r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + tok } });
  } catch {
    throw new DriveError('Google Drive could not be reached. Check the connection.', 'net');
  }
  if (r.status === 401) { keepToken(null); throw new DriveError('Google Drive sync needs you to sign in again.', 'signin'); }
  if (!r.ok) {
    let msg = '';
    try { msg = (await r.json()).error.message; } catch {}
    throw new DriveError(msg || `Google Drive answered ${r.status}.`, r.status === 404 ? 'gone' : 'drive');
  }
  return r;
}

// One try, and once more after a sign-in if the token turned out to be dead.
async function api(url, opts = {}, interactive = false) {
  try {
    return await call(url, opts, await getToken(interactive));
  } catch (e) {
    if (e.kind !== 'signin' || !(interactive || clicked())) throw e;
    return call(url, opts, await getToken(interactive));
  }
}

const keyOf = async title => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(title)))]
  .slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');

// What we last read or wrote for each game: { id, version, files }. While the version
// in Drive matches, its files are these, so they needn't be downloaded again.
const cache = new Map();

async function find(title, interactive) {
  const c = cache.get(title);
  if (c) {
    try {
      return await (await api(`${API}/files/${c.id}?fields=id,version,trashed`, {}, interactive)).json().then(f => f.trashed ? null : f);
    } catch (e) {
      if (e.kind !== 'gone') throw e;
      cache.delete(title);
    }
  }
  const key = await keyOf(title);
  const q = encodeURIComponent(`appProperties has { key='game' and value='${key}' } and trashed = false`);
  const r = await api(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,version)&orderBy=modifiedTime desc`, {}, interactive);
  return (await r.json()).files[0] || null;
}

async function gzip(text) {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}
async function gunzip(buf) {
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s) {
  const bin = atob(s), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function download(title, f, interactive) {
  const c = cache.get(title);
  if (c && c.id === f.id && c.version === f.version) return c.files;
  const r = await api(`${API}/files/${f.id}?alt=media`, {}, interactive);
  const doc = JSON.parse(await gunzip(await r.arrayBuffer()));
  const files = (doc.files || []).map(x => ({ path: String(x.path), mtime: Number(x.mtime) || 0, data: unb64(x.data) }))
    .filter(x => x.path && !x.path.split('/').includes('..') && !x.path.startsWith('/'));
  cache.set(title, { id: f.id, version: f.version, files });
  return files;
}

async function upload(title, f, files, interactive, meta) {
  const body = await gzip(JSON.stringify({ v: 1, game: title, at: Date.now(), ...meta,
    files: files.map(x => ({ path: x.path, mtime: x.mtime, data: b64(x.data) })) }));
  let r;
  if (f) {
    r = await api(`${UPLOAD}/files/${f.id}?uploadType=media&fields=id,version`, { method: 'PATCH', headers: { 'Content-Type': 'application/gzip' }, body }, interactive);
  } else {
    const meta = { name: title + ' saves.json.gz', parents: ['appDataFolder'], mimeType: 'application/gzip', appProperties: { game: await keyOf(title) } };
    const b = 'cons' + Math.random().toString(36).slice(2);
    const multi = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/gzip\r\n\r\n`, body, `\r\n--${b}--`]);
    r = await api(`${UPLOAD}/files?uploadType=multipart&fields=id,version`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: multi }, interactive);
  }
  const done = await r.json();
  cache.set(title, { id: done.id, version: done.version, files });
}

// ---------- syncing ----------

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// local, remote: [{ path, data, mtime (ms) }]. The newer copy of each file wins; on a
// tie, this browser's. Same bytes count as the same file whatever their times.
export function merge(local, remote) {
  const mine = new Map(local.map(f => [f.path, f])), theirs = new Map(remote.map(f => [f.path, f]));
  const toLocal = [], merged = new Map(mine);
  for (const r of remote) {
    const l = mine.get(r.path);
    if (l && same(l.data, r.data)) continue;
    if (!l || r.mtime > l.mtime) { toLocal.push(r); merged.set(r.path, r); }
  }
  const push = local.some(l => { const r = theirs.get(l.path); return !r || (l.mtime >= r.mtime && !same(l.data, r.data)); });
  return { toLocal, merged: [...merged.values()], push };
}

// local: this browser's saves of the game. Uploads what Drive is missing, and resolves
// to the files from Drive that are newer than this browser's, for the caller to write.
// interactive: straight from a click, so it may open the sign-in window.
// meta: more fields for the uploaded file, such as the engine that wrote the saves.
export async function sync(title, local, interactive = false, meta = {}) {
  local = local.map(f => ({ path: f.path, data: f.data, mtime: +f.mtime || 0 }));
  const f = await find(title, interactive);
  const remote = f ? await download(title, f, interactive) : [];
  const m = merge(local, remote);
  if (m.push) await upload(title, f, m.merged, interactive, meta);
  return m.toLocal;
}

// The games whose saves are in Drive under a prefix (e.g. 'vnbox:'): [{ title (after the prefix), at (ms) }],
// newest first, from the files' names (upload names them '<title> saves.json.gz').
export async function list(prefix, interactive = false) {
  const end = ' saves.json.gz', seen = new Set();
  const r = await api(`${API}/files?spaces=appDataFolder&pageSize=1000&orderBy=modifiedTime desc&fields=files(name,modifiedTime)&q=${encodeURIComponent('trashed = false')}`, {}, interactive);
  return (await r.json()).files.filter(f => f.name.startsWith(prefix) && f.name.endsWith(end))
    .map(f => ({ title: f.name.slice(prefix.length, -end.length), at: Date.parse(f.modifiedTime) }))
    .filter(g => !seen.has(g.title) && seen.add(g.title));
}

// Deletes the game's saves from Drive.
export async function remove(title, interactive = false) {
  const f = await find(title, interactive);
  if (f) await api(`${API}/files/${f.id}`, { method: 'DELETE' }, interactive);
  cache.delete(title);
  return !!f;
}
