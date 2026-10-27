// Lets the site open offline. Every file of the site the page fetches is copied into a
// cache as it arrives, and served from there only when the network can't be reached, so
// online a new deploy still shows on the next load. Files are kept without their ?version,
// so a new engine release replaces the old one instead of piling up.
// shortcut: only files fetched once while online are kept (main.js hands over the page's own
// files, the engine is kept when a game first runs it); a file list made at deploy time would cover everything.

const CACHE = 'site';
const key = url => { const u = new URL(url, location.href); return u.origin + u.pathname; };

function keep(url, res) {
  if (res.status !== 200 || res.type !== 'basic') return Promise.resolve();
  const copy = res.clone();
  return caches.open(CACHE).then(c => c.put(key(url), copy));
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// { cache: [url] } from the page: files it loaded before this worker was running.
self.addEventListener('message', e => {
  const urls = e.data && e.data.cache;
  if (Array.isArray(urls)) e.waitUntil(Promise.all(urls.map(u => fetch(u, { cache: 'force-cache' }).then(res => keep(u, res)).catch(() => {}))));
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin || r.headers.has('range')) return;
  if (/\/vnbox\/engine\/.*\.zip$/.test(new URL(r.url).pathname)) return; // VNBox keeps its own copy of Wine (120 MB)
  e.respondWith(fetch(r).then(res => { e.waitUntil(keep(r.url, res)); return res; }, async () =>
    (await caches.match(key(r.url))) || (r.mode === 'navigate' && await caches.match(key('./'))) || Response.error()));
});
