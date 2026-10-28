// Desktop gadgets: CPU Meter, Calendar, Slide Show, the Moe Clock and Kanji of the Day, plus the gallery that adds
// them (and the Clock gadget, js/apps/clock.js). Vista docks them down the Sidebar on the right;
// every other era lets them float on the desktop, skinned for its decade (css/apps.css).
// Which ones are open is remembered for the next visit.

import { h, icon, store, small } from '../util.js';
import { createWindow, launch, all } from '../wm.js';
import { sample } from './sysmon.js';
import { V } from '../version.js';

const SIDEBAR = V.id === 'vista';
// The Clock and CPU Meter gadgets are Vista and 7's own; other eras get the rest.
const AERO = ['vista', '7'].includes(V.id);
const KEY = 'w95.gadgets';
const open = new Map();   // id -> window, in the order they were added

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

function gadget(id, title, body, height, onClosed) {
  return createWindow({ app: 'gadgets', title, icon: 'i-programs', body, className: 'gadget', width: 150, height, resizable: false, taskbar: false, onClosed });
}

// ---------- CPU Meter ----------

// The same made-up processor figure System Monitor charts.
function cpuMeter() {
  const dial = svg('svg', { viewBox: '-50 -50 100 100', class: 'gd-dial', 'aria-hidden': 'true' });
  dial.append(svg('circle', { r: 46, class: 'gd-rim' }));
  for (let p = 0; p <= 100; p += 10) {
    const a = (p * 2.4 - 120) * Math.PI / 180;
    dial.append(svg('line', { x1: Math.sin(a) * 36, y1: -Math.cos(a) * 36, x2: Math.sin(a) * 41, y2: -Math.cos(a) * 41, class: p >= 80 ? 'gd-tick hot' : 'gd-tick' }));
  }
  const needle = svg('line', { x1: 0, y1: 6, x2: 0, y2: -36, class: 'gd-needle' });
  dial.append(needle, svg('circle', { r: 3, class: 'gd-pin' }));
  const pct = h('div', { class: 'gd-pct' });
  const body = h('div', { class: 'gd gd-cpu', role: 'meter', 'aria-label': 'CPU usage', 'aria-valuemin': 0, 'aria-valuemax': 100 }, dial, pct);
  function tick() {
    const v = Math.round(sample());
    needle.setAttribute('transform', `rotate(${v * 2.4 - 120})`);
    pct.textContent = `CPU ${v}%`;
    body.setAttribute('aria-valuenow', v);
  }
  const timer = setInterval(tick, 1000);
  tick();
  return gadget('cpu', 'CPU Meter', body, 160, () => clearInterval(timer));
}

// ---------- Calendar ----------

// A month as grid cells: blanks up to the first weekday (Sunday first), then 1..last day.
export function monthCells(y, m) {
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  return [...Array(first).fill(''), ...Array.from({ length: days }, (_, i) => i + 1)];
}
console.assert(monthCells(2024, 1).join() === ',,,,' + Array.from({ length: 29 }, (_, i) => i + 1).join(), 'calendar: Feb 2024 starts Thursday, 29 days');
console.assert(monthCells(2026, 9).length === 35 && monthCells(2023, 0)[0] === 1, 'calendar: Oct 2026 starts Thursday; Jan 2023 starts Sunday');
console.assert(monthCells(2026, 12).length === monthCells(2027, 0).length, 'calendar: month 12 rolls into January');

function calendar() {
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth();
  const title = h('button', { class: 'gd-cal-t', type: 'button', title: 'Today', onclick: () => { y = now.getFullYear(); m = now.getMonth(); draw(); } });
  const grid = h('div', { class: 'gd-cal-grid', role: 'grid' });
  const flip = d => { m += d; if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; } draw(); };
  function draw() {
    title.textContent = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const today = y === now.getFullYear() && m === now.getMonth() ? now.getDate() : 0;
    grid.replaceChildren(...'SMTWTFS'.split('').map(d => h('span', { class: 'gd-cal-wd' }, d)),
      ...monthCells(y, m).map(d => h('span', { class: d === today ? 'today' : null }, d)));
  }
  draw();
  const body = h('div', { class: 'gd gd-cal' },
    h('div', { class: 'gd-cal-head' },
      h('button', { class: 'gd-cal-flip', type: 'button', 'aria-label': 'Previous month', onclick: () => flip(-1) }, '◄'), title,
      h('button', { class: 'gd-cal-flip', type: 'button', 'aria-label': 'Next month', onclick: () => flip(1) }, '►')),
    grid);
  return gadget('calendar', 'Calendar', body, 190);
}

// ---------- Slide Show ----------

// The site's own screenshots of chimimouryou; the CONscripter ones show other people's game art.
// The anime wallpapers come first, like the picture-frame widget on an anime desktop.
const SLIDES = [...['shore', 'rooftop', 'lain', 'wired', 'konata'].map(f => `wallpapers/${f}.jpg`),
  'chimi-store.png', 'chimi-settings.png', 'chimi-reader.png', 'chimi-phone-store.png'];

function slideshow() {
  let i = 0;
  const frame = h('div', { class: 'gd gd-slide', title: 'Next picture', onclick: () => show(i + 1) });
  const show = n => { i = n % SLIDES.length; frame.replaceChildren(h('img', { src: 'img/' + SLIDES[i], alt: '' })); };
  show(0);
  const timer = setInterval(() => show(i + 1), 6000);
  return gadget('slides', 'Slide Show', frame, 130, () => clearInterval(timer));
}

// ---------- Moe Clock ----------

// The big time-and-date text anime desktops put over the wallpaper, dated the Japanese way.
const WEEKDAYS = '日月火水木金土';
export const jpDate = d => `${d.getMonth() + 1}月${d.getDate()}日 (${WEEKDAYS[d.getDay()]})`;
console.assert(jpDate(new Date(2026, 9, 28)) === '10月28日 (水)', 'moe clock: 28 Oct 2026 is a Wednesday');

function moeClock() {
  const time = h('div', { class: 'gd-moe-t' }), date = h('div', { class: 'gd-moe-d', lang: 'ja' });
  const body = h('div', { class: 'gd gd-moe', role: 'timer', 'aria-label': 'Clock' }, time, date);
  function tick() {
    const now = new Date();
    time.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    date.textContent = jpDate(now);
  }
  const timer = setInterval(tick, 1000);
  tick();
  return gadget('moe', 'Moe Clock', body, 100, () => clearInterval(timer));
}

// ---------- Kanji of the Day ----------

// JLPT N5-N4 kanji: glyph|on'yomi|kun'yomi (okurigana in brackets)|meaning|example|its reading|gloss.
const KANJI = `日|ニチ・ジツ|ひ・か|day, sun|毎日|まいにち|every day
月|ゲツ・ガツ|つき|moon, month|今月|こんげつ|this month
火|カ|ひ|fire|火山|かざん|volcano
水|スイ|みず|water|水曜日|すいようび|Wednesday
木|モク・ボク|き|tree, wood|木曜日|もくようび|Thursday
金|キン・コン|かね|gold, money|金曜日|きんようび|Friday
土|ド・ト|つち|earth, soil|土曜日|どようび|Saturday
山|サン|やま|mountain|富士山|ふじさん|Mount Fuji
川|セン|かわ|river|小川|おがわ|brook
人|ジン・ニン|ひと|person|日本人|にほんじん|Japanese person
口|コウ・ク|くち|mouth|入口|いりぐち|entrance
目|モク・ボク|め|eye|目薬|めぐすり|eye drops
手|シュ|て|hand|上手|じょうず|skilful
足|ソク|あし・た(りる)|foot, leg; enough|遠足|えんそく|school outing
大|ダイ・タイ|おお(きい)|big|大学|だいがく|university
小|ショウ|ちい(さい)・こ・お|small|小学校|しょうがっこう|primary school
中|チュウ|なか|middle, inside|中国|ちゅうごく|China
上|ジョウ|うえ・あ(げる)・のぼ(る)|up, above|屋上|おくじょう|rooftop
下|カ・ゲ|した・さ(げる)・くだ(る)|down, below|地下鉄|ちかてつ|subway
右|ウ・ユウ|みぎ|right|右手|みぎて|right hand
東|トウ|ひがし|east|東京|とうきょう|Tokyo
北|ホク|きた|north|北海道|ほっかいどう|Hokkaido
一|イチ・イツ|ひと(つ)|one|一人|ひとり|one person, alone
円|エン|まる(い)|yen, circle|百円|ひゃくえん|100 yen
年|ネン|とし|year|去年|きょねん|last year
時|ジ|とき|time, hour|時間|じかん|time
分|ブン・フン・ブ|わ(ける)・わ(かる)|part, minute; understand|自分|じぶん|oneself
今|コン・キン|いま|now|今週|こんしゅう|this week
先|セン|さき|ahead, previous|先生|せんせい|teacher
生|セイ・ショウ|い(きる)・う(まれる)・なま|life, birth, raw|学生|がくせい|student
学|ガク|まな(ぶ)|study|学校|がっこう|school
本|ホン|もと|book, origin|日本|にほん|Japan
語|ゴ|かた(る)|word, language|日本語|にほんご|Japanese
名|メイ・ミョウ|な|name|名前|なまえ|name
友|ユウ|とも|friend|友達|ともだち|friend
子|シ・ス|こ|child|女の子|おんなのこ|girl
男|ダン・ナン|おとこ|man|男性|だんせい|male
女|ジョ・ニョ|おんな・め|woman|女性|じょせい|female
行|コウ・ギョウ|い(く)・おこな(う)|go; carry out|旅行|りょこう|trip
来|ライ|く(る)|come|来週|らいしゅう|next week
見|ケン|み(る)|see|花見|はなみ|cherry-blossom viewing
食|ショク|た(べる)・く(う)|eat|食堂|しょくどう|canteen
飲|イン|の(む)|drink|飲み物|のみもの|a drink
書|ショ|か(く)|write|図書館|としょかん|library
読|ドク|よ(む)|read|読書|どくしょ|reading
話|ワ|はな(す)・はなし|talk, story|電話|でんわ|telephone
聞|ブン・モン|き(く)|hear, ask|新聞|しんぶん|newspaper
休|キュウ|やす(む)|rest|休日|きゅうじつ|day off
雨|ウ|あめ・あま|rain|大雨|おおあめ|heavy rain
花|カ|はな|flower|花火|はなび|fireworks
天|テン|あめ・あま|heaven, sky|天気|てんき|weather
気|キ・ケ|—|spirit, air|元気|げんき|well, lively
電|デン|—|electricity|電車|でんしゃ|train
車|シャ|くるま|car, vehicle|自転車|じてんしゃ|bicycle
店|テン|みせ|shop|店員|てんいん|shop assistant
春|シュン|はる|spring|青春|せいしゅん|youth
夏|カ・ゲ|なつ|summer|夏休み|なつやすみ|summer holidays
空|クウ|そら・あ(く)・から|sky; empty|空港|くうこう|airport
海|カイ|うみ|sea|海外|かいがい|overseas
白|ハク・ビャク|しろ(い)|white|面白い|おもしろい|interesting
新|シン|あたら(しい)|new|新幹線|しんかんせん|bullet train
高|コウ|たか(い)|tall, expensive|最高|さいこう|the best`.split('\n').map(l => l.split('|'));

// Days since 1970 in local time, so the kanji changes at the user's midnight; walks the list in order.
export const kanjiIndex = (d, n = KANJI.length) => (Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) % n + n) % n;
console.assert(kanjiIndex(new Date(2026, 9, 28, 0, 0)) === kanjiIndex(new Date(2026, 9, 28, 23, 59)), 'kanji: same all day');
console.assert(kanjiIndex(new Date(2026, 9, 28)) !== kanjiIndex(new Date(2026, 9, 29)), 'kanji: changes the next day');
console.assert(Array.from({ length: 400 }, (_, i) => kanjiIndex(new Date(1969, 0, i))).every(i => i >= 0 && i < KANJI.length), 'kanji: in range, before 1970 too');
console.assert(KANJI.every(k => k.length === 7), 'kanji: every row has seven fields');

// A flat Live Tile / Windows 11 widget card: the glyph, flipped by a click to its readings.
function kanjiOfTheDay() {
  const card = h('button', { class: 'gd gd-kanji', type: 'button', title: 'Flip', 'aria-pressed': 'false', onclick: () => draw(card.getAttribute('aria-pressed') !== 'true') });
  const ja = (cls, t) => h('span', { class: cls, lang: 'ja' }, t);
  function draw(back) {
    const [k, on, kun, en, word, read, gloss] = KANJI[kanjiIndex(new Date())];
    card.setAttribute('aria-pressed', back);
    card.replaceChildren(...back
      ? [h('span', { class: 'gd-kj-en' }, en), ja(null, '音 ' + on), ja(null, '訓 ' + kun),
        h('span', { class: 'gd-kj-ex' }, ja(null, word), ' ', ja('gd-kj-rd', read), h('br'), gloss)]
      : [ja('gd-kj-h', '今日の漢字'), ja('gd-kj-k', k)]);
  }
  draw(false);
  const timer = setInterval(() => draw(card.getAttribute('aria-pressed') === 'true'), 60000);   // a new kanji at midnight
  return gadget('kanji', 'Kanji of the Day', card, 150, () => clearInterval(timer));
}

// ---------- Docking, the gallery, and remembering ----------

const MAKERS = { clock: () => launch('clock'), cpu: cpuMeter, calendar, slides: slideshow, moe: moeClock, kanji: kanjiOfTheDay };

// Vista's Sidebar: a translucent strip down the right, with the gadgets stacked in it. In 7 a new
// gadget starts at the right under the others, then floats wherever it's dragged.
// shortcut: the Sidebar is laid out when a gadget opens or closes or the viewport changes, not on drag; track that if anyone docks many.
let sidebar = null;
function restack(added) {
  if (SIDEBAR) {
    if (!sidebar) sidebar = document.getElementById('desktop').insertBefore(h('div', { class: 'sidebar', 'aria-hidden': 'true' }), document.getElementById('windows'));
    sidebar.hidden = !open.size;
  } else if (!added) return;
  if (small.matches) return;
  const right = document.getElementById('windows').clientWidth;
  let y = 10;
  for (const w of open.values()) {
    if (SIDEBAR || w === added) {
      w.el.style.left = right - w.el.offsetWidth - 10 + 'px';
      w.el.style.top = y + 'px';
    }
    y += w.el.offsetHeight + 8;
  }
}

for (const [t, ev] of [[window, 'resize'], [small, 'change']]) t.addEventListener(ev, () => { if (open.size) restack(); });

const save = () => store.set(KEY, [...open.keys()]);

async function add(id) {
  if (small.matches) return;   // no room beside a maximized window
  const had = open.get(id);
  if (had && all().includes(had)) return had.focus();
  const win = await MAKERS[id]();   // the Clock gadget is a program, which may still be loading
  if (!win) return;
  open.set(id, win);
  // A closed gadget is forgotten; logging off (a forced close) keeps it for next time.
  win.opts.onClose = () => { open.delete(id); save(); };
  const closed = win.opts.onClosed;
  win.opts.onClosed = () => { if (closed) closed(); open.delete(id); restack(); };
  save();
  restack(win);
}

export function reopen() {
  store.get(KEY, []).filter(id => MAKERS[id]).forEach(add);
}

const LIST = [['clock', 'Clock', 'i-clock', AERO], ['cpu', 'CPU Meter', 'i-sysmon', AERO], ['calendar', 'Calendar', null, true], ['slides', 'Slide Show', 'i-viewer', true], ['moe', 'Moe Clock', 'i-clock', true], ['kanji', 'Kanji of the Day', 'i-charmap', true]]
  .filter(g => g[3]);

function gallery() {
  const tile = ([id, name, ic]) => h('button', { class: 'gd-tile', type: 'button', onclick: () => add(id) },
    ic ? icon(ic) : h('span', { class: 'gd-cal-ico' }, new Date().getDate()), h('span', null, name));
  const body = h('div', { class: 'gd-gallery' }, h('p', null, 'Click a gadget to add it to the desktop.'), h('div', { class: 'gd-tiles' }, LIST.map(tile)));
  return createWindow({ app: 'gadgets', title: 'Gadgets', icon: 'i-programs', body, width: 'auto', resizable: false, route: 'gadgets' });
}

export default { id: 'gadgets', title: 'Gadgets', icon: 'i-programs', open: gallery };
