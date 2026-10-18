// Internet Explorer. The project pages are little 90s homepages under sites/,
// loaded into a frame and given pretend GeoCities addresses.

import { h, icon, esc, wait, reducedMotion } from '../util.js';
import { createWindow, launch } from '../wm.js';
import { menubar, openMenu } from '../menu.js';
import { msgbox, about } from '../dialogs.js';
import { V } from '../version.js';

// Tabs came with IE 7 (Vista) and stayed.
const TABS = ['vista', '7', '8', '10', '11'].includes(V.id);

export const PAGES = {
  home: { file: 'sites/home.html', url: 'http://www.geocities.com/SiliconValley/Lab/1995/', label: "blankiekun's Homepage", icon: 'i-htm' },
  chimimouryou: { file: 'sites/chimimouryou.html', url: 'http://www.geocities.com/Tokyo/Pagoda/1995/chimimouryou.html', label: 'chimimouryou', icon: 'i-book' },
  convert: { file: 'sites/convert.html', url: 'http://www.angelfire.com/tech/blankiekun/convert.html', label: 'conscripter-convert', icon: 'i-convert' },
  'convert-metrics': { file: 'sites/convert-metrics.html', url: 'http://www.angelfire.com/tech/blankiekun/convert-metrics.html', label: 'Convert completion', icon: 'i-convert' },
  conscripter: { file: 'sites/conscripter.html', url: 'http://www.geocities.com/TimesSquare/Arcade/1995/conscripter.html', label: 'CONscripter', icon: 'i-game' },
  games: { file: 'sites/games.html', url: 'http://www.angelfire.com/biz/blankiekun/games.html', label: 'Games', icon: 'i-game' },
  guestbook: { file: 'sites/guestbook.html', url: 'http://www.geocities.com/SiliconValley/Lab/1995/guestbook.html', label: 'Guestbook', icon: 'i-htm' },
  // Help in 10 and 11 (js/apps/system.js); not a project page, so not in Links or Favorites.
  help: { file: 'sites/help.html', url: 'https://blankiekun.github.io/help', label: 'Get help', icon: 'i-helpbook', unlisted: true },
};
const LISTED = Object.entries(PAGES).filter(([, p]) => !p.unlisted);
const GITHUB = 'https://github.com/blankiekun';
const FILES = Object.fromEntries(Object.entries(PAGES).map(([k, p]) => [p.file.split('/').pop(), k]));

function keyFor(input) {
  if (!input) return 'home';
  if (PAGES[input]) return input;
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '');
  for (const [k, p] of Object.entries(PAGES)) {
    const u = p.url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    if (s === u || s + '/' === u || s === u.replace(/\/$/, '')) return k;
  }
  const base = s.split('/').pop().replace(/\.html?$/, '');
  if (FILES[base + '.html']) return FILES[base + '.html'];
  if (base === 'conscripter-convert') return 'convert';
  return null;
}

function throbber() {
  const ns = 'http://www.w3.org/2000/svg';
  const wrap = h('div', { class: 'throbber', 'aria-hidden': 'true' });
  wrap.innerHTML = `<svg viewBox="0 0 40 40" xmlns="${ns}">
    <circle cx="20" cy="20" r="14" fill="#0040c0"/>
    <ellipse class="mer" cx="20" cy="20" rx="7" ry="14" fill="none" stroke="#7fb2ff" stroke-width="1.5"/>
    <path d="M6 20h28M8 13h24M8 27h24" stroke="#7fb2ff" stroke-width="1"/>
    <text x="20" y="29" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="bold" font-size="27" fill="#fff" stroke="#000040" stroke-width=".8">e</text>
  </svg>`;
  return wrap;
}

function toolBtn(id, label, onclick) {
  return h('button', { class: 'ie-tool', type: 'button', title: label, onclick }, icon(id), h('span', null, label));
}

function open(arg) {
  const tabs = [];
  let tab = null;   // the tab on show: { iframe, hist, pos, current: { key, url }, token, title, el, label }

  const address = h('input', { class: 'field ie-address', id: 'ie-address', autocomplete: 'off', spellcheck: false, 'aria-label': 'Address' });
  const statusText = h('span', null, 'Done');
  const progress = h('div', { class: 'ie-progress' }, h('i'));
  const throb = throbber();

  const back = toolBtn('i-back', 'Back', () => go(-1));
  const fwd = toolBtn('i-fwd', 'Forward', () => go(1));
  const tools = h('div', { class: 'ie-tools' },
    back, fwd,
    toolBtn('i-stop', 'Stop', stop),
    toolBtn('i-refresh', 'Refresh', () => tab.current && load(tab.current, false)),
    toolBtn('i-home', 'Home', () => navigate('home')),
    h('span', { class: 'ie-sep' }),
    toolBtn('i-fav', 'Favorites', e => favMenu(e.currentTarget)),
    toolBtn('i-printer', 'Print', () => { try { tab.iframe.contentWindow.print(); } catch {} }),
  );
  const links = h('div', { class: 'ie-links' }, h('span', { class: 'ie-label' }, 'Links'),
    ...LISTED.map(([k, p]) => h('button', { type: 'button', class: 'ie-link', onclick: () => navigate(k) }, icon('i-htm'), h('span', null, p.label))),
    h('a', { class: 'ie-link', href: GITHUB, target: '_blank', rel: 'noopener' }, icon('i-github'), h('span', null, 'GitHub')));
  const addrForm = h('form', { class: 'ie-addr' }, h('label', { class: 'ie-label', for: 'ie-address', html: 'A<u>d</u>dress' }),
    h('div', { class: 'ie-addr-field' }, icon('i-htm'), address));
  addrForm.addEventListener('submit', e => { e.preventDefault(); navigate(address.value); });

  const favItems = () => [
    { label: '&Add To Favorites...', action: () => msgbox({ title: 'Add to Favorites', icon: 'info', parent: win, text: 'This page is already in your Favorites.\n\nEverything here is a favorite.' }) },
    { label: '&Organize Favorites...', disabled: true },
    '-',
    ...LISTED.map(([k, p]) => ({ label: p.label, icon: 'i-htm', action: () => navigate(k) })),
    '-',
    { label: 'blankiekun on GitHub', icon: 'i-github', action: () => window.open(GITHUB, '_blank', 'noopener') },
    { label: 'chimimouryou repository', icon: 'i-github', action: () => window.open(GITHUB + '/chimimouryou', '_blank', 'noopener') },
    { label: 'CONscripter repository', icon: 'i-github', action: () => window.open(GITHUB + '/CONscripter', '_blank', 'noopener') },
    { label: 'conscripter-convert repository', icon: 'i-github', action: () => window.open(GITHUB + '/conscripter-convert', '_blank', 'noopener') },
  ];
  function favMenu(btn) {
    openMenu(favItems(), { rect: btn.getBoundingClientRect() });
  }

  const menus = [
    { label: '&File', items: () => [
      { label: '&New Window', key: 'Ctrl+N', action: () => launch('ie', tab.current ? tab.current.key : 'home') },
      ...TABS ? [{ label: 'New &Tab', action: () => newTab() }, { label: 'Close T&ab', action: () => closeTab(tab) }] : [],
      { label: '&Open...', key: 'Ctrl+O', action: () => { address.focus(); address.select(); } },
      '-',
      { label: '&Print...', key: 'Ctrl+P', action: () => { try { tab.iframe.contentWindow.print(); } catch {} } },
      '-',
      { label: '&Close', action: () => win.close() },
    ] },
    { label: '&Edit', items: () => [
      { label: 'Select &All', key: 'Ctrl+A', action: () => { try { const d = tab.iframe.contentDocument; d.getSelection().selectAllChildren(d.body); } catch {} } },
      '-',
      { label: '&Find (on This Page)...', key: 'Ctrl+F', disabled: true },
    ] },
    { label: '&View', items: () => [
      { label: '&Toolbar', checked: !tools.hidden, action: () => { tools.hidden = !tools.hidden; } },
      { label: '&Links', checked: !links.hidden, action: () => { links.hidden = !links.hidden; } },
      { label: '&Status Bar', checked: !status.hidden, action: () => { status.hidden = !status.hidden; } },
      '-',
      { label: 'Sto&p', key: 'Esc', action: stop },
      { label: '&Refresh', key: 'F5', action: () => tab.current && load(tab.current, false) },
      '-',
      { label: 'Sour&ce', action: viewSource, disabled: !tab.current || !tab.current.key },
    ] },
    { label: '&Go', items: () => [
      { label: '&Back', key: 'Alt+Left', disabled: tab.pos <= 0, action: () => go(-1) },
      { label: '&Forward', key: 'Alt+Right', disabled: tab.pos >= tab.hist.length - 1, action: () => go(1) },
      '-',
      { label: '&Home Page', action: () => navigate('home') },
      { label: '&Search the Web', action: () => window.open('https://github.com/search?q=user%3Ablankiekun', '_blank', 'noopener') },
    ] },
    { label: 'F&avorites', items: favItems },
    { label: '&Help', items: () => [
      { label: '&Help Topics', action: () => launch('help') },
      '-',
      { label: '&About Internet Explorer', action: () => about('Internet Explorer', 'i-ie', win, V.ie ? h('p', null, 'Version ' + V.ie) : null) },
    ] },
  ];
  const bar = menubar(menus);
  // Edge has no menu bar; the same menus sit behind its ··· button (css/versions.css shows it in 10 and 11).
  const more = h('button', { class: 'ie-more', type: 'button', title: 'Settings and more', 'aria-label': 'Settings and more',
    onclick: e => openMenu(menus.map(m => ({ label: m.label, submenu: m.items })), { rect: e.currentTarget.getBoundingClientRect() }) }, '···');

  const status = h('div', { class: 'statusbar' }, statusText, h('div', { class: 'ie-prog-cell' }, progress), h('div', { class: 'ie-zone' }, icon('i-globe'), 'Internet zone'));
  const view = h('div', { class: 'ie-view' });
  const newBtn = h('button', { type: 'button', class: 'ie-newtab', title: 'New Tab', 'aria-label': 'New Tab', onclick: () => newTab() });
  const tabBar = TABS ? h('div', { class: 'ie-tabs', role: 'tablist' }, newBtn) : '';
  const body = h('div', { class: 'ie' },
    h('div', { class: 'ie-top' }, h('div', { class: 'ie-bars' }, bar, tools, addrForm, more, tabBar, links), throb),
    view,
    status);

  const win = createWindow({
    app: 'ie', title: 'Internet Explorer', icon: 'i-ie', body,
    width: 820, height: 600, minW: 300, minH: 240, center: true,
  });

  function setStatus(t) { statusText.textContent = t; }
  function setBusy(on) {
    throb.classList.toggle('busy', on);
    if (!on) progress.firstChild.style.width = '0';
  }
  function updateNav() {
    back.disabled = tab.pos <= 0;
    fwd.disabled = tab.pos >= tab.hist.length - 1;
  }

  // Each tab keeps its own page and history; only the one on show is laid out.
  function newTab(input) {
    const t = { hist: [], pos: -1, current: null, token: 0, title: 'Internet Explorer' };
    t.iframe = h('iframe', { title: 'Web page', name: 'ie-view' });
    t.iframe.addEventListener('load', () => loaded(t));
    view.append(t.iframe);
    if (TABS) {
      t.label = h('span', null, 'Connecting...');
      t.el = h('div', { class: 'ie-tab', role: 'tab', onclick: () => show(t) }, icon('i-htm'), t.label,
        h('button', { type: 'button', class: 'ie-tab-x', title: 'Close Tab', 'aria-label': 'Close Tab', onclick: e => { e.stopPropagation(); closeTab(t); } }));
      tabBar.insertBefore(t.el, newBtn);
    }
    tabs.push(t);
    show(t);
    navigate(input || 'home');
  }

  function show(t) {
    if (tab) { tab.iframe.hidden = true; tab.el?.setAttribute('aria-selected', 'false'); }
    tab = t;
    t.iframe.hidden = false;
    t.el?.setAttribute('aria-selected', 'true');
    address.value = t.current ? t.current.url : '';
    win.setTitle(t.title + ' - Internet Explorer');
    if (t.current) win.setRoute(t.current.key ? 'ie/' + t.current.key : 'ie/home');
    updateNav();
    setBusy(false);
    setStatus('Done');
  }

  function closeTab(t) {
    if (tabs.length === 1) { win.close(); return; }
    const i = tabs.indexOf(t);
    tabs.splice(i, 1);
    t.token++;
    t.iframe.remove();
    t.el.remove();
    if (t === tab) { tab = null; show(tabs[Math.min(i, tabs.length - 1)]); }
  }

  function navigate(input, opts = {}) {
    const raw = (input || '').trim();
    const key = keyFor(raw);
    let entry;
    if (key) entry = { key, url: PAGES[key].url, hash: raw.split('#')[1] };
    else if (/(^|\.)github\.com/i.test(raw)) {
      const href = /^https?:/i.test(raw) ? raw : 'https://' + raw;
      window.open(href, '_blank', 'noopener');
      setStatus('Opened ' + href + ' in a new window');
      if (tab.current) address.value = tab.current.url;
      return;
    } else {
      const url = /^[a-z]+:/i.test(raw) ? raw : 'http://' + raw;
      entry = { key: null, url };
    }
    if (opts.hash) entry.hash = opts.hash;
    tab.hist.splice(tab.pos + 1);
    tab.hist.push(entry);
    tab.pos = tab.hist.length - 1;
    load(entry, true);
  }

  function go(d) {
    const p = tab.pos + d;
    if (p < 0 || p >= tab.hist.length) return;
    tab.pos = p;
    load(tab.hist[p], true);
  }

  function stop() {
    tab.token++;
    setBusy(false);
    setStatus('Done');
  }

  async function load(entry, fake) {
    const t = tab, token = ++t.token;
    t.current = entry;
    address.value = entry.url;
    updateNav();
    win.setRoute(entry.key ? 'ie/' + entry.key : 'ie/home');
    setBusy(true);
    const host = entry.url.replace(/^[a-z]+:\/\//i, '').split('/')[0];
    const fill = progress.firstChild;
    const slow = fake && !reducedMotion.matches;
    setStatus('Finding site: ' + host);
    fill.style.width = '10%';
    if (slow) await wait(260);
    if (token !== t.token) return;
    setStatus('Opening page ' + entry.url + '...');
    fill.style.width = '45%';
    if (slow) await wait(320);
    if (token !== t.token) return;
    fill.style.width = '80%';
    if (entry.key) {
      t.iframe.removeAttribute('srcdoc');
      t.iframe.src = PAGES[entry.key].file + (entry.hash ? '#' + entry.hash : '');
    } else {
      t.iframe.removeAttribute('src');
      t.iframe.srcdoc = errorPage(entry.url);
    }
  }

  function loaded(t) {
    const on = t === tab;
    if (on) setBusy(false);
    let doc;
    try { doc = t.iframe.contentDocument; } catch { doc = null; }
    if (!doc || !doc.body) return;
    t.title = doc.title || (t.current && t.current.url) || 'Internet Explorer';
    if (t.label) { t.label.textContent = t.title; t.el.title = t.title; }
    if (on) { win.setTitle(t.title + ' - Internet Explorer'); setStatus('Done'); }
    // A link inside a page that leads to another project page stays in this window.
    const file = (doc.location.pathname || '').split('/').pop();
    if (FILES[file] && (!t.current || t.current.key !== FILES[file])) {
      const entry = { key: FILES[file], url: PAGES[FILES[file]].url };
      t.hist.splice(t.pos + 1); t.hist.push(entry); t.pos = t.hist.length - 1;
      t.current = entry;
      if (on) { address.value = entry.url; updateNav(); win.setRoute('ie/' + entry.key); }
    }
    wire(doc);
  }

  function wire(doc) {
    doc.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (href.startsWith('#')) return;
      const file = href.split('#')[0].split('/').pop();
      if (FILES[file]) {
        e.preventDefault();
        navigate(FILES[file], { hash: href.split('#')[1] });
      } else if (/^(https?:|mailto:)/i.test(href) || /\.(png|jpe?g|gif)$/i.test(href)) {
        a.target = '_blank';
        a.rel = 'noopener';
      } else if (href.startsWith('ie:') || href.startsWith('../#')) {
        // ../#cons/demo opens the desktop with the demo when the page is read on its own; here it's the same route
        e.preventDefault();
        const [id, arg] = href.replace(/^ie:|^\.\.\/#/, '').split('/');
        launch(id, arg);
      }
    });
    doc.addEventListener('mouseover', e => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      const file = href.split('#')[0].split('/').pop();
      setStatus(FILES[file] ? 'Shortcut to ' + PAGES[FILES[file]].url : href.startsWith('#') ? (tab.current ? tab.current.url : '') + href : 'Shortcut to ' + href);
    });
    doc.addEventListener('mouseout', e => {
      if (e.target.closest && e.target.closest('a[href]')) setStatus('Done');
    });
    // Keyboard shortcuts typed while the page has focus.
    doc.addEventListener('keydown', e => {
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    });
  }

  async function viewSource() {
    const c = tab.current;
    if (!c || !c.key) return;
    const text = await fetch(PAGES[c.key].file).then(r => r.text()).catch(() => '');
    launch('notepad', { name: PAGES[c.key].file.split('/').pop().replace('.html', '[1].htm'), text });
  }

  body.addEventListener('keydown', e => {
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'F5') { e.preventDefault(); if (tab.current) load(tab.current, false); }
    else if (e.key === 'Escape' && throb.classList.contains('busy')) stop();
  });

  win.navigate = navigate;
  newTab(arg);
  return win;
}

function errorPage(url) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cannot find server</title>
<style>body{font:13px/1.45 Tahoma,Verdana,Arial,sans-serif;margin:24px;max-width:560px;color:#000;background:#fff}
h1{font:bold 18px Tahoma,Arial,sans-serif;margin:0 0 12px;display:flex;gap:10px;align-items:center}
hr{border:0;border-top:1px solid #c0c0c0;margin:14px 0}ul{padding-left:20px}a{color:#0000ff}code{word-break:break-all}</style></head>
<body><h1><svg width="32" height="32" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#000" d="M5 1h6v1h2v2h1v2h1v4h-1v2h-1v2h-2v1H5v-1H3v-2H2v-2H1V6h1V4h1V2h2z"/><path fill="#fff" d="M5 2h6v1h1v1h1v2h1v4h-1v2h-1v1h-1v1H5v-1H4v-1H3v-2H2V6h1V4h1V3h1z"/><path fill="#0000ff" d="M7 4h2v2H7zM7 7h2v5H7zM6 7h1v1H6zM6 11h4v1H6z"/></svg>The page cannot be displayed</h1>
<p>The page you are looking for, <code>${esc(url)}</code>, is not on blankiekun's little corner of the ${V.date[0]} web.</p>
<hr><p>Please try the following:</p>
<ul><li>Click the <b>Home</b> button, or pick a page from the <b>Links</b> bar.</li>
<li>Open the address in a real browser: <a href="${esc(url.replace(/^http:/, 'https:'))}" target="_blank" rel="noopener">${esc(url)}</a></li></ul>
<hr><p style="color:#808080">Cannot find server or DNS Error<br>Internet Explorer</p></body></html>`;
}

export default {
  id: 'ie', title: 'Internet Explorer', icon: 'i-ie', single: true, open,
  reopen(win, arg) { if (arg) win.navigate(arg); },
};
