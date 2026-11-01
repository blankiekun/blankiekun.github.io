// Desktop gadgets: CPU Meter, Calendar, Slide Show, the Moe Clock, Kanji of the Day, the Pocket Pet, a Visual Novel
// and Weather, plus the gallery that adds them (and the Clock gadget, js/apps/clock.js, and the Desktop Mascot, js/apps/mascot.js).
// Vista docks them down the Sidebar on the right;
// every other era lets them float on the desktop, skinned for its decade (css/apps.css).
// Which ones are open is remembered for the next visit.

import { h, icon, store, small, reducedMotion } from '../util.js';
import { createWindow, launch, all } from '../wm.js';
import { sample } from './sysmon.js';
import { V } from '../version.js';
import { mascot, sprite } from './mascot.js';

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

// ---------- Pocket Pet ----------

// A late-90s keychain egg pet (our own blob, not anyone's character). Stats run 0-4; it ages from a
// saved timestamp, so it gets hungry while the page is shut, but bottoms out sleepy, never dead.
const PET_KEY = 'w95.pet';
const RATE = { food: -1 / 90, fun: -1 / 120, mess: 1 / 180 };   // per minute: a heart every 1.5h, 2h, 3h
export function petAge(s, now) {
  const min = Math.max(0, (now - s.t) / 60000);   // a clock set back doesn't un-age it
  const c = v => Math.min(4, Math.max(0, v));
  return { food: c(s.food + RATE.food * min), fun: c(s.fun + RATE.fun * min), mess: c(s.mess + RATE.mess * min), t: now };
}
export const petMood = s => s.food < 1 && s.fun < 1 ? 'sleepy' : s.food < 1 ? 'hungry' : s.fun < 1 ? 'grumpy' : s.mess >= 3 ? 'messy' : 'happy';
console.assert(petAge({ food: 4, fun: 4, mess: 0, t: 0 }, 90 * 60000).food === 3, 'pet: a heart of food per 90 minutes');
console.assert(petMood(petAge({ food: 4, fun: 4, mess: 0, t: 0 }, 365 * 864e5)) === 'sleepy' && petAge({ food: 4, fun: 4, mess: 0, t: 0 }, 365 * 864e5).mess === 4, 'pet: a year away floors at sleepy, never below 0 or past 4');
console.assert(petAge({ food: 2, fun: 2, mess: 1, t: 5e6 }, 1e6).food === 2, 'pet: a clock set back changes nothing');

const PET = ['...######...', '..#......#..', '.#........#.', null, '#..........#', null, null, '.#........#.', '..########..', '...#....#...'];
const FACES = {   // eyes row, then two mouth rows
  happy: ['#..#....#..#', '#...#..#...#', '#....##....#'], messy: ['#..#....#..#', '#..........#', '#...####...#'],
  hungry: ['#..#....#..#', '#....##....#', '#....##....#'], grumpy: ['#.##....##.#', '#....##....#', '#...#..#...#'],
  sleepy: ['#.##....##.#', '#..........#', '#....##....#'],
};
const SAYS = { happy: 'Happy!', messy: 'Needs a clean', hungry: 'Hungry...', grumpy: 'Grumpy. Bored.', sleepy: 'Sleepy... zzz' };

function pocketPet() {
  const fresh = { food: 4, fun: 4, mess: 0, t: Date.now() }, had = store.get(PET_KEY, null);
  let s = had && Number.isFinite(had.t) ? had : fresh;
  const lcd = svg('svg', { viewBox: '0 0 16 11', class: 'gd-pet-px', 'aria-hidden': 'true', 'shape-rendering': 'crispEdges' });
  const meters = h('div', { class: 'gd-pet-m', role: 'img' }), status = h('div', { class: 'gd-pet-s', 'aria-live': 'polite' });
  function draw() {
    s = petAge(s, Date.now());
    store.set(PET_KEY, s);
    const mood = petMood(s), face = FACES[mood];
    const px = (x, y) => svg('rect', { x, y, width: 1, height: 1 });
    const rows = PET.map((r, y) => r || face[[3, 5, 6].indexOf(y)]);
    lcd.replaceChildren(...rows.flatMap((r, y) => [...r].flatMap((p, x) => p === '#' ? [px(x + 1, y)] : [])),
      ...(s.mess >= 2 ? [[13, 9], [14, 9], [15, 9], [14, 8]].map(([x, y]) => px(x, y)) : []));   // a little pile beside it
    lcd.classList.toggle('still', mood === 'sleepy');
    const bar = v => '●'.repeat(Math.ceil(v)) + '○'.repeat(4 - Math.ceil(v));
    meters.textContent = `FOOD ${bar(s.food)} FUN ${bar(s.fun)}`;
    meters.setAttribute('aria-label', `Food ${Math.ceil(s.food)} of 4, fun ${Math.ceil(s.fun)} of 4`);
    if (status.textContent !== SAYS[mood]) status.textContent = SAYS[mood];   // only announce a change
  }
  const act = f => () => { s = petAge(s, Date.now()); f(); draw(); };
  const btn = (label, f) => h('button', { type: 'button', onclick: act(f) }, label);
  const body = h('div', { class: 'gd gd-pet', role: 'group', 'aria-label': 'Pocket Pet' },
    h('div', { class: 'gd-pet-lcd' }, lcd, meters, status),
    h('div', { class: 'gd-pet-b' },
      btn('Feed', () => { s.food = Math.min(4, s.food + 1); }),
      btn('Play', () => { s.fun = Math.min(4, s.fun + 1); s.food = Math.max(0, s.food - .25); }),
      btn('Clean', () => { s.mess = 0; })));
  draw();
  const timer = setInterval(draw, 30000);
  return gadget('pet', 'Pocket Pet', body, 220, () => clearInterval(timer));
}

// ---------- Visual Novel ----------

// A PC-98 adventure game's message window, chatting about life at the computer.
const VN_LINES = [
  'おはよう! The fan is humming. Coffee first, then email.',
  'You left forty tabs open again... 大丈夫, I counted them for you.',
  'It is raining outside. 雨の日は、ゲームの日だね。',
  'I defragmented my thoughts. All the blue blocks are in a row now.',
  'Look, the screensaver stars! Just one more minute, okay?',
  'ちょっと待って — saving... saving... done. Phew.',
  'The modem sings when it dials. I think it is a happy song.',
  'Your desktop is so tidy today. えらい、えらい。',
  'I made you a folder called "Later". It is very full.',
  'お茶、冷めちゃうよ。 Your tea is getting cold.',
  'Shall we play Minesweeper? I won’t click the corners.',
  'The clock says it is late. 夜ふかしは、ほどほどにね。',
  'I like the sound the floppy makes. カリカリ、カリカリ。',
  'Thank you for not unplugging me during the update.',
  'また明日ね。 Good night, and sweet dreams.',
];

// One press: a line still typing finishes at once; a finished one moves on to the next.
export const vnAdvance = ({ line, shown }, lines) =>
  shown < [...lines[line]].length ? { line, shown: [...lines[line]].length } : { line: (line + 1) % lines.length, shown: 0 };
// One timer tick: one more character, stopping at the end of the line.
export const vnType = ({ line, shown }, lines) => ({ line, shown: Math.min(shown + 1, [...lines[line]].length) });
console.assert(vnType({ line: 0, shown: 0 }, ['あb']).shown === 1 && vnType({ line: 0, shown: 2 }, ['あb']).shown === 2, 'vn: types one character, stops at the end');
console.assert(vnAdvance({ line: 0, shown: 1 }, ['あb', 'c']).shown === 2 && vnAdvance({ line: 0, shown: 2 }, ['あb', 'c']).line === 1, 'vn: a press finishes the line, then moves on');
console.assert(vnAdvance({ line: 1, shown: 1 }, ['a', 'c']).line === 0, 'vn: the last line wraps to the first');

function visualNovel() {
  let st = { line: 0, shown: 0 };
  const text = h('span', { 'aria-hidden': 'true' }), more = h('span', { class: 'gd-vn-more', 'aria-hidden': 'true' }, '▼');
  const live = h('span', { class: 'gd-vn-live', lang: 'ja', 'aria-live': 'polite' });
  function draw() {
    const chars = [...VN_LINES[st.line]];
    text.textContent = chars.slice(0, st.shown).join('');
    more.hidden = st.shown < chars.length;
  }
  // The whole line goes to the screen reader once, not letter by letter.
  const say = () => { if (live.textContent !== VN_LINES[st.line]) live.textContent = VN_LINES[st.line]; };
  const next = () => { st = vnAdvance(st, VN_LINES); if (reducedMotion.matches) st = vnAdvance(st, VN_LINES); say(); draw(); };
  const body = h('div', { class: 'gd gd-vn', tabindex: 0, role: 'button', 'aria-label': 'Visual Novel: next line', title: 'Click or press Enter',
    onclick: next, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } } },
    h('p', { class: 'gd-vn-msg', lang: 'ja' }, text, more), live);
  if (reducedMotion.matches) st = vnAdvance(st, VN_LINES);
  // A finished line isn't drawn again: it would redo the page's layout 16 times a second for nothing.
  const timer = setInterval(() => { const n = vnType(st, VN_LINES); if (n.shown !== st.shown) { st = n; draw(); } }, 60);
  say(); draw();
  return gadget('vn', 'Visual Novel', body, 120, () => clearInterval(timer));
}

// ---------- Weather ----------

// Made-up Akihabara weather, the same all day: there's no network call, so it's seeded by the date
// and shaped by Tokyo's monthly normals, with snow only December to February and June's rainy season.
const CONDS = ['sun', 'cloud', 'rain', 'snow'], NAMES = { sun: 'Sunny', cloud: 'Cloudy', rain: 'Rain', snow: 'Snow' };
const HI = [10, 11, 14, 19, 23, 26, 30, 31, 27, 22, 17, 12], LO = [1, 2, 5, 10, 15, 19, 23, 24, 21, 15, 9, 4];
const WINTER = [11, 0, 1];
const odds = m => m === 5 ? [.2, .35, .45, 0] : WINTER.includes(m) ? [.55, .27, .1, .08] : [.45, .3, .25, 0];

export function weatherFor(d) {
  let s = 0;
  for (const c of `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`) s = Math.imul(s ^ c.charCodeAt(0), 16777619);
  const r = () => {   // mulberry32
    let t = s += 0x6d2b79f5;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 2 ** 32;
  };
  const m = d.getMonth(), o = odds(m);
  let p = r();
  const cond = CONDS.find((_, k) => (p -= o[k]) < 0) || 'cloud';   // a rounding miss lands on cloud, never snow
  const j = Math.round(r() * 6 - 3), hi = HI[m] + j - (cond === 'rain' ? 2 : 0), lo = LO[m] + j - Math.round(r() * 2);
  return cond === 'snow' ? { cond, hi: Math.min(hi, 3), lo: Math.min(lo, -1) } : { cond, hi, lo };
}
// Coolest at 2 am, warmest at 2 pm.
const tempAt = (w, hour) => Math.round(w.lo + (w.hi - w.lo) * (1 - Math.cos((hour - 2) / 12 * Math.PI)) / 2);
const toF = c => Math.round(c * 9 / 5 + 32);
const YEAR = Array.from({ length: 365 }, (_, i) => new Date(2026, 0, i + 1));
console.assert(JSON.stringify(weatherFor(new Date(2026, 9, 28))) === JSON.stringify(weatherFor(new Date(2026, 9, 28, 23, 59))), 'weather: the same all day');
console.assert(YEAR.every(d => weatherFor(d).cond !== 'snow' || WINTER.includes(d.getMonth())), 'weather: snow only in winter');
console.assert(YEAR.filter(d => d.getMonth() === 7).every(d => { const w = weatherFor(d); return w.cond !== 'snow' && w.hi > w.lo; }), 'weather: no snow in August, highs above lows');
console.assert(Array.from({ length: 90 }, (_, i) => weatherFor(new Date(2026, 11, i + 1)).cond).includes('snow'), 'weather: it can snow in winter');
console.assert(new Set(YEAR.map(d => weatherFor(d).cond)).size === 4, 'weather: every condition turns up in a year');
console.assert(toF(0) === 32 && toF(100) === 212 && tempAt({ lo: 5, hi: 15 }, 14) === 15 && tempAt({ lo: 5, hi: 15 }, 2) === 5, 'weather: °F and the daily curve');

const CLOUD = '<path d="M4 12a3 3 0 0 1 .5-6 4 4 0 0 1 7.5 1 2.5 2.5 0 0 1 0 5z" fill="#eef3f8" stroke="#8a9bb0" stroke-width=".7"/>';
const ICONS = {
  sun: '<circle cx="8" cy="9" r="3.5" fill="#ffc83d"/><path d="M8 2v2M8 14v2M1 9h2M13 9h2M3 4l1.5 1.5M11.5 12.5L13 14M3 14l1.5-1.5M11.5 5.5L13 4" stroke="#ffc83d" stroke-linecap="round"/>',
  cloud: CLOUD,
  rain: CLOUD + '<path d="M6 14l-1 3M9 14l-1 3M12 14l-1 3" stroke="#5ab0ff" stroke-linecap="round"/>',
  snow: CLOUD + '<g fill="#bfe6ff" stroke="#5a8fc4" stroke-width=".4"><circle cx="5.5" cy="15.5" r="1"/><circle cx="9" cy="16.5" r="1"/><circle cx="12" cy="15" r="1"/></g>',
};
const wxIcon = (cond, label) => {
  const e = svg('svg', { viewBox: '0 0 16 18', class: 'gd-wx-ico', ...label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' } });
  e.innerHTML = ICONS[cond];
  return e;
};

// The weather girl, dressed for the day: a sun hat and a wave, a cardigan under a cloud,
// a raincoat and umbrella, a coat with scarf and earmuffs.
const DRESS = { sun: '#ff8fb8', cloud: '#a99be0', rain: '#ffd23f', snow: '#e0474c' };
const ARMS = { sun: 'M23 44L13 33M37 44L43 56', cloud: 'M23 44L18 56M37 44L42 56', rain: 'M23 44L18 56M37 44L44 41', snow: 'M23 44L18 56M37 44L42 56' };
const EXTRA = {
  sun: '<ellipse cx="30" cy="16" rx="19" ry="4" fill="#f3d88a"/><path d="M21 16q9-13 18 0z" fill="#f3d88a"/><path d="M21.5 13.5h17" stroke="#ff6f91" stroke-width="2"/>',
  cloud: '<path d="M44 14a5 5 0 0 1 9-2 4 4 0 0 1 3 7h-13a3 3 0 0 1 1-5z" fill="#fff" opacity=".9"/>',
  rain: '<path d="M44 14V41" stroke="#555" stroke-width="1.5"/><path d="M6 15Q30-8 56 15z" fill="#3b7fc4" stroke="#2a5f94"/><path d="M4 30l-1 4M7 52l-1 4M55 32l-1 4M57 56l-1 4" stroke="#dff1ff" stroke-linecap="round"/>',
  snow: '<path d="M17 26q13-14 26 0" fill="none" stroke="#e0474c" stroke-width="2"/><circle cx="17" cy="29" r="4" fill="#fff"/><circle cx="43" cy="29" r="4" fill="#fff"/><path d="M22 40h16v4h-16zM33 43h4v9h-4z" fill="#fff"/><g fill="#fff"><circle cx="6" cy="20" r="1.5"/><circle cx="54" cy="12" r="1.5"/><circle cx="8" cy="58" r="1.5"/><circle cx="53" cy="46" r="1.5"/></g>',
};
const girl = cond => `<circle cx="13" cy="34" r="5" fill="#5a3825"/><circle cx="47" cy="34" r="5" fill="#5a3825"/>
  <circle cx="30" cy="25" r="15" fill="#5a3825"/>
  <path d="M25 62v10M35 62v10" stroke="#ffe3cf" stroke-width="3"/><ellipse cx="25" cy="73" rx="3" ry="1.6" fill="#7a4a3a"/><ellipse cx="35" cy="73" rx="3" ry="1.6" fill="#7a4a3a"/>
  <path d="${ARMS[cond]}" stroke="#ffe3cf" stroke-width="3" stroke-linecap="round"/>
  <path d="M23 40h14l7 22h-28z" fill="${DRESS[cond]}"/>
  <circle cx="30" cy="28" r="12" fill="#ffe3cf"/><path d="M17 26Q30 6 43 26Q36 19 30 22Q24 19 17 26z" fill="#5a3825"/>
  <ellipse cx="25" cy="30" rx="2" ry="3" fill="#3a2a4a"/><ellipse cx="35" cy="30" rx="2" ry="3" fill="#3a2a4a"/><circle cx="25.7" cy="29" r=".8" fill="#fff"/><circle cx="35.7" cy="29" r=".8" fill="#fff"/>
  <ellipse cx="21" cy="34" rx="2.5" ry="1.3" fill="#ff9db0" opacity=".7"/><ellipse cx="39" cy="34" rx="2.5" ry="1.3" fill="#ff9db0" opacity=".7"/>
  <path d="M28 35q2 2 4 0" fill="none" stroke="#a0505a" stroke-linecap="round"/>${EXTRA[cond]}`;

const FKEY = 'w95.weather.f';

function weather() {
  let f = store.get(FKEY, false);
  const deg = c => (f ? toF(c) : c) + '°';
  const fig = svg('svg', { viewBox: '0 0 60 80', class: 'gd-wx-girl', 'aria-hidden': 'true' });
  const temp = h('button', { class: 'gd-wx-t', type: 'button', title: 'Switch between °C and °F', onclick: () => { f = !f; store.set(FKEY, f); draw(); } });
  const what = h('div', { class: 'gd-wx-c' }), range = h('div', { class: 'gd-wx-city' });   // what the girl's picture says, in words
  const days = h('div', { class: 'gd-wx-days' });
  const body = h('div', { class: 'gd gd-wx', role: 'group', 'aria-label': 'Weather in Akihabara' },
    h('div', { class: 'gd-wx-now' }, fig, h('div', { class: 'gd-wx-txt' }, temp, what, range, h('div', { class: 'gd-wx-city' }, 'Akihabara'))), days);
  function draw() {
    const now = new Date(), w = weatherFor(now);
    if (body.dataset.wx !== w.cond) fig.innerHTML = girl(body.dataset.wx = w.cond);
    temp.textContent = deg(tempAt(w, now.getHours())) + (f ? 'F' : 'C');
    what.textContent = NAMES[w.cond];
    range.textContent = `H ${deg(w.hi)}  L ${deg(w.lo)}`;
    days.replaceChildren(...[1, 2, 3].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i), n = weatherFor(d);
      return h('div', null, d.toLocaleDateString(undefined, { weekday: 'short' }), wxIcon(n.cond, NAMES[n.cond]), `${deg(n.hi)} ${deg(n.lo)}`);
    }));
  }
  draw();
  const timer = setInterval(draw, 60000);
  return gadget('weather', 'Weather', body, 178, () => clearInterval(timer));
}

// ---------- Docking, the gallery, and remembering ----------

const MAKERS = { clock: () => launch('clock'), cpu: cpuMeter, calendar, slides: slideshow, moe: moeClock, kanji: kanjiOfTheDay, pet: pocketPet, vn: visualNovel, weather, mascot };

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
    if (w.mascot) continue;   // she walks about on her own
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
  if (had && (had.mascot ? had.el.isConnected : all().includes(had))) return had.focus();
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

// What each era puts on the desktop the first time it boots; ids not built yet are skipped.
const ERA_GADGETS = {
  '1.0': ['vn', 'moe'], '2.0': ['vn', 'moe'], '3.1': ['vn', 'moe', 'kanji'],
  '95': ['pet', 'moe', 'slides', 'mascot'], '98': ['pet', 'moe', 'kanji', 'mascot'], 'me': ['pet', 'moe', 'mascot'],
  '2000': ['moe', 'calendar', 'mascot'], 'xp': ['moe', 'weather', 'slides', 'mascot'],
  'vista': ['clock', 'cpu', 'weather', 'slides', 'mascot'], '7': ['clock', 'cpu', 'weather', 'mascot'],
  '8': ['kanji', 'moe', 'weather', 'mascot'], '10': ['kanji', 'moe', 'mascot'], '11': ['kanji', 'moe', 'weather', 'mascot'],
};
const ERA_KEY = 'w95.gadgets.era';

export function reopen() {
  const fresh = store.get(ERA_KEY, null) !== V.id;
  store.set(ERA_KEY, V.id);
  const here = LIST.map(g => g[0]);
  // A version switch reloads the page; show that era's gadgets instead of the last era's.
  (fresh ? ERA_GADGETS[V.id] || [] : store.get(KEY, [])).filter(id => MAKERS[id] && here.includes(id)).forEach(add);
}

const LIST = [['clock', 'Clock', 'i-clock', AERO], ['cpu', 'CPU Meter', 'i-sysmon', AERO], ['calendar', 'Calendar', null, true], ['slides', 'Slide Show', 'i-viewer', true], ['moe', 'Moe Clock', 'i-clock', true], ['kanji', 'Kanji of the Day', 'i-charmap', true], ['pet', 'Pocket Pet', 'i-game', true], ['vn', 'Visual Novel', 'i-book', true], ['weather', 'Weather', () => wxIcon('sun'), true], ['mascot', 'Desktop Mascot', sprite, true]]
  .filter(g => g[3]);

function gallery() {
  const tile = ([id, name, ic]) => h('button', { class: 'gd-tile', type: 'button', onclick: () => add(id) },
    typeof ic === 'function' ? ic() : ic ? icon(ic) : h('span', { class: 'gd-cal-ico' }, new Date().getDate()), h('span', null, name));
  const body = h('div', { class: 'gd-gallery' }, h('p', null, 'Click a gadget to add it to the desktop.'), h('div', { class: 'gd-tiles' }, LIST.map(tile)));
  return createWindow({ app: 'gadgets', title: 'Gadgets', icon: 'i-programs', body, width: 'auto', resizable: false, route: 'gadgets' });
}

export default { id: 'gadgets', title: 'Gadgets', icon: 'i-programs', open: gallery };
