// A VNBox game's text cleanup: filters for what hooks get wrong (doubled characters, redraws, markup,
// ruby), run in a fixed order on each hooked line before the text log sees it. Saved per game as
// `cleanup` in the recent-game record. No Unicode normalization: NFKC turns … and full-width forms
// into ASCII. Ported from chimimouryou (apps/web/src/lib/data/hook-cleanup.ts,
// BSD-3-Clause, Copyright (c) 2026, ッツ Reader Authors).
// A cleanup is { control, markup, cp932, rubyFirst, repeatedChars, repeatCount, typewriter,
// repeatedLine, repeatedPhrases, trailingRepeat, quotesOnly, replace, rules: [{ pattern, replacement }],
// newOnly, recentLines, recentSize }: every filter off unless set, except newOnly, on unless false.

// The filters in the order they run, with their names for Text > Text Cleanup.
export const FILTERS = [
  ['control', 'Control characters', 'Removes invisible control characters.'],
  ['markup', 'Tags and {ruby}', 'Removes <tags>; {base/reading} keeps the base.'],
  ['cp932', 'Non-Shift JIS', 'Removes characters Shift JIS has no code for.'],
  ['rubyFirst', 'Ruby first', 'Removes a reading padded with spaces before its kanji.'],
  ['repeatedChars', 'Repeated characters', 'ああいいうう → あいう.'],
  ['typewriter', 'Typewriter redraws', 'ああいあいう → あいう.'],
  ['repeatedLine', 'Repeated line', 'あいうあいう → あいう.'],
  ['repeatedPhrases', 'Repeated sentences', 'Each sentence once: S1S1S2S2 → S1S2.'],
  ['trailingRepeat', 'Repeated ending', 'An ending repeated three or more times, once.'],
  ['quotesOnly', 'Only 「…」', 'Keeps the quoted speech, drops a name before it.'],
  ['replace', 'Replace', 'Your regular expressions, in order.'],
  ['newOnly', 'New text only', 'Drops the previous line when the next one repeats it first.'],
  ['recentLines', 'Recent lines', 'Drops a line already seen lately (backlog screens).'],
];

export const DEFAULT_RECENT = 10;

export const filterOn = (cleanup, key) => key === 'newOnly' ? cleanup.newOnly !== false : !!cleanup[key];

export const stripControl = text => text.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, '');

export const stripMarkup = text => text
  .replace(/<[^<>]*>/g, '')
  .replace(/\{([^{}/:|]*)[/:|][^{}]*\}/g, '$1')
  .replace(/\{[^{}]*\}/g, '');

let cp932Chars;
function cp932Set() {
  if (cp932Chars) return cp932Chars;
  const decoder = new TextDecoder('shift_jis');
  const chars = new Set();
  const add = bytes => {
    const char = decoder.decode(new Uint8Array(bytes));
    if ([...char].length === 1 && char !== '�') chars.add(char);
  };
  for (let byte = 0; byte < 0xe0; byte++) if (byte < 0x80 || byte > 0xa0) add([byte]);
  for (let lead = 0x81; lead <= 0xfc; lead++) {
    if (lead > 0x9f && lead < 0xe0) continue;
    for (let trail = 0x40; trail <= 0xfc; trail++) if (trail !== 0x7f) add([lead, trail]);
  }
  return cp932Chars = chars;
}
export const keepCp932 = text => [...text].filter(c => cp932Set().has(c)).join('');

export const dropRubyFirst = text => text.replace(/[ぁ-ゟ゠-ヿ]+[ 　]+(?=[㐀-鿿豈-﫿々〆ヶ])/gu, '');

// Runs of one character, as [char, length].
function runs(text) {
  const found = [];
  for (const char of text) {
    const last = found[found.length - 1];
    if (last && last[0] === char) last[1]++;
    else found.push([char, 1]);
  }
  return found;
}

// count 0: the most common run length (a longer one on a tie); 1 leaves the line alone.
export function collapseRepeatedChars(text, count = 0) {
  const lineRuns = runs(text);
  let times = count;
  if (times < 2) {
    const tally = new Map();
    lineRuns.forEach(([, length]) => tally.set(length, (tally.get(length) || 0) + 1));
    const top = [...tally].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    times = top ? top[0] : 1;
  }
  if (times < 2) return text;
  // A run shorter than the count is a single character the hook sent once: kept.
  return lineRuns.map(([char, length]) => char.repeat(Math.ceil(length / times))).join('');
}

export function collapseRepeatedLine(text) {
  const period = (text + text).indexOf(text, 1);
  return period > 0 && period < text.length ? text.slice(0, period) : text;
}

export function collapseRepeatedPhrases(text) {
  const sentences = text.match(/[^。！？!?」』\n]*(?:[。！？!?」』\n]+|$)/gu) || [];
  return sentences.filter((s, i) => s !== sentences[i - 1]).join('');
}

// The longest text the line was typed out to, when it is three or more ever longer prefixes of it
// one after another (あ + あい + あいう): a game redrawing its line one character at a time.
export function collapseTypewriter(text) {
  // The shortest full text first: a longer one would hold redraws itself.
  for (let start = text.length - 1; start > 0; start--) {
    if (text[start] !== text[0]) continue;
    const full = text.slice(start);
    let size = full.length, end = start, parts = 1;
    // Back from the full text, each earlier part a shorter prefix of it.
    while (end > 0) {
      let length = Math.min(size - 1, end);
      while (length > 0 && !text.startsWith(full.slice(0, length), end - length)) length--;
      if (!length) break;
      size = length;
      end -= length;
      parts++;
    }
    if (end === 0 && parts >= 3) return full;
  }
  return text;
}

export function collapseTrailingRepeat(text) {
  const chars = [...text];
  for (let size = 2; size * 3 <= chars.length; size++) {
    const unit = chars.slice(-size).join('');
    let end = chars.length;
    while (end >= size && chars.slice(end - size, end).join('') === unit) end -= size;
    if ((chars.length - end) / size >= 3) return chars.slice(0, end).join('') + unit;
  }
  return text;
}

export function keepQuotes(text) {
  const open = text.indexOf('「'), close = text.lastIndexOf('」');
  return open >= 0 && close > open ? text.slice(open, close + 1) : text;
}

// The rule's error message, or '' for a valid pattern.
export function ruleError(pattern) {
  try { new RegExp(pattern, 'gu'); return ''; } catch (e) { return e.message; }
}

export const applyRules = (text, rules = []) => rules.reduce((line, r) =>
  r.pattern && !ruleError(r.pattern) ? line.replace(new RegExp(r.pattern, 'gu'), r.replacement) : line, text);

// The rules as the dialog's textarea shows them, one a line: pattern => replacement.
export const rulesText = rules => (rules || []).map(r => r.pattern + ' => ' + r.replacement).join('\n');
export function rulesFromText(text) {
  const rules = [], bad = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const at = line.lastIndexOf(' => ');
    const r = at < 0 ? { pattern: line, replacement: '' } : { pattern: line.slice(0, at), replacement: line.slice(at + 4) };
    const err = ruleError(r.pattern);
    if (err) bad.push(line + '  (' + err + ')'); else rules.push(r);
  }
  return { rules, bad };
}

// A line ends at one of these; a redraw cut mid-sentence (あ, あい) is not a finished line.
const lineEnd = /[。！？!?」』）)…―〜～♪]$/u;

// The stateless filters, in order (everything but newOnly and recentLines).
export function cleanHookLine(line, cleanup) {
  let text = line;
  if (cleanup.control) text = stripControl(text);
  if (cleanup.markup) text = stripMarkup(text);
  if (cleanup.cp932) text = keepCp932(text);
  if (cleanup.rubyFirst) text = dropRubyFirst(text);
  if (cleanup.repeatedChars) text = collapseRepeatedChars(text, cleanup.repeatCount);
  if (cleanup.typewriter) text = collapseTypewriter(text);
  if (cleanup.repeatedLine) text = collapseRepeatedLine(text);
  if (cleanup.repeatedPhrases) text = collapseRepeatedPhrases(text);
  if (cleanup.trailingRepeat) text = collapseTrailingRepeat(text);
  if (cleanup.quotesOnly) text = keepQuotes(text);
  if (cleanup.replace) text = applyRules(text, cleanup.rules);
  return text.trim() ? text : '';
}

// The whole chain as clean(line, threadId): '' for a line to drop. Each thread keeps its own recent lines.
export function hookCleaner(cleanup) {
  // finished: the thread's last finished line (ends at lineEnd), the page text a new line starts with.
  const recent = new Map(), finished = new Map(), last = new Map();
  const size = cleanup.recentSize || DEFAULT_RECENT;
  return (line, threadId = '') => {
    let text = cleanHookLine(line, cleanup);
    if (text && filterOn(cleanup, 'newOnly')) {
      const previous = finished.get(threadId) || '';
      const full = text.trimEnd();
      const continues = !!previous && full.startsWith(previous);
      const before = last.get(threadId) || '';
      last.set(threadId, full);
      // The line just sent again behind the end of the one before it (忍「…」, then
      // 満面の笑顔で言うのだ。忍「…」): nothing new.
      if (before.length > 1 && full.length > before.length && full.endsWith(before)) return '';
      // Kept while a game redraws the new line in pieces (あ。い, あ。いう), so each piece is cut too.
      if (lineEnd.test(full)) finished.set(threadId, full);
      else if (!continues) finished.delete(threadId);
      // Only a finished line counts, so a typewriter sending one fire per character isn't cut to
      // single characters.
      if (continues && full.length > previous.length) text = full.slice(previous.length).trim();
    }
    if (!text || !cleanup.recentLines) return text;
    const seen = recent.get(threadId) || [];
    if (seen.includes(text)) return '';
    recent.set(threadId, [...seen, text].slice(-size));
    return text;
  };
}

// A thread's lines through the whole chain, the dropped ones left out.
export function cleanLines(lines, cleanup) {
  const clean = hookCleaner(cleanup);
  return lines.map(line => clean(line)).filter(Boolean);
}

// Filters the suggestion tries, in chain order: the ones fixing what a hook breaks, not the matters
// of taste (only 「…」, replace). newOnly is on by default, so it is never suggested.
const SUGGESTABLE = ['control', 'markup', 'cp932', 'rubyFirst', 'repeatedChars', 'typewriter',
  'repeatedLine', 'repeatedPhrases', 'trailingRepeat', 'recentLines'];

// The smallest cleanup that makes the recent lines clean: each filter in order is added when it
// changes or drops at least a quarter of the lines left by the ones before. undefined: nothing to
// fix, or fewer than 3 lines.
export function suggestCleanup(lines) {
  const texts = lines.filter(line => line.trim());
  if (texts.length < 3) return undefined;
  let cleanup = {};
  for (const key of SUGGESTABLE) {
    const before = cleanLines(texts, cleanup);
    const changed = key === 'recentLines'
      ? before.length - cleanLines(before, { recentLines: true, newOnly: false }).length
      : before.filter(line => cleanHookLine(line, { [key]: true }) !== line).length;
    if (changed * 4 >= before.length && changed > 0) cleanup = { ...cleanup, [key]: true };
  }
  return Object.keys(cleanup).length ? cleanup : undefined;
}
