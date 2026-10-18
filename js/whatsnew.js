// WHATSNEW.TXT: the latest release of each project from GitHub, and the "newer than last visit" check.
// Failing quietly is the point: offline or rate-limited, the file just points at GitHub.
// shortcut: pre-release suffixes are ignored when comparing tags, and the cache is per tab session (not shared with sites/live.js).

import { OS } from './version.js';
import { store } from './util.js';

export const REPOS = ['chimimouryou', 'CONscripter', 'conscripter-convert'];
const SEEN = 'w95.seen', BAD = 300e3, TTL = 3600e3;
const FALLBACK = 'See github.com/blankiekun for release notes.';
const got = {};

// True when tag a is a later version than b: v0.9.0 < v0.10.0.
export function newer(a, b) {
  const x = (a.match(/\d+/g) || []).map(Number), y = (b.match(/\d+/g) || []).map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
console.assert(newer('v0.32.0', 'v0.31.0') && newer('v0.10.0', 'v0.9.0') && !newer('v0.9.0', 'v0.10.0') && !newer('v1.0', 'v1.0.0'), 'whatsnew: newer()');

// Release notes are markdown; Notepad wants plain lines.
function plain(md, max) {
  return String(md || '').replace(/```[^\n]*/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '')
    .split(/\r?\n/).map(l => l.replace(/^\s*#+\s*/, '').replace(/^(\s*)[*+-]\s+/, '$1- ').replace(/[*_`]{1,3}/g, '').trimEnd())
    .filter(l => l.trim()).slice(0, max).join('\n');
}

function load(repo) {
  const k = 'wn:' + repo;
  let c;
  try { c = JSON.parse(sessionStorage.getItem(k)); } catch {}
  if (c && Date.now() - c.t < (c.d ? BAD : TTL)) return Promise.resolve(c.d ? null : c);
  const save = v => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };
  return fetch(`https://api.github.com/repos/blankiekun/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    .then(r => { if (!r.ok) throw 0; return r.json(); })
    .then(j => {
      if (!j.tag_name) throw 0;
      const d = { t: Date.now(), tag: j.tag_name, name: j.name || j.tag_name, date: (j.published_at || '').slice(0, 10), notes: plain(j.body, 10) };
      save(d);
      return d;
    }, () => { save({ t: Date.now(), d: 1 }); return null; });
}

// Resolves once every repo has answered (or failed); never rejects, so nothing waits on it for long.
export const ready = Promise.all(REPOS.map(r => load(r).then(d => { if (d) got[r] = d; }, () => {}))).then(() => got);

// Read when the file is opened, so it shows whatever has arrived by then.
export function text() {
  const have = REPOS.filter(r => got[r]);
  return `${OS} - WHATSNEW.TXT\n==========================\n\nThe latest release of each project, straight from GitHub.\n\n` +
    (have.length ? have.map(r => `${r}  ${got[r].tag}${got[r].date ? '  (' + got[r].date + ')' : ''}\n${got[r].name !== got[r].tag ? got[r].name + '\n' : ''}${got[r].notes || ''}\n\nhttps://github.com/blankiekun/${r}/releases\n`).join('\n') : FALLBACK + '\n');
}

// Remember the newest tags as seen.
export function mark() {
  const s = store.get(SEEN, {});
  for (const r of REPOS) if (got[r]) s[r] = got[r].tag;
  store.set(SEEN, s);
}

// The projects with a release newer than the last one this visitor saw. A first visit (or a project
// not seen before) only records its tags.
export async function fresh() {
  await ready;
  const s = store.get(SEEN, null);
  const f = s ? REPOS.filter(r => got[r] && s[r] && newer(got[r].tag, s[r])) : [];
  if (!f.length) mark();
  return f.map(r => ({ repo: r, tag: got[r].tag }));
}
