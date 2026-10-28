// node tools/vnclean-check.mjs: checks js/apps/vnclean.js's filters (chimimouryou's hook-cleanup.test.ts).
import assert from 'node:assert/strict';
import { cleanHookLine, collapseRepeatedChars, collapseRepeatedLine, collapseRepeatedPhrases, collapseTrailingRepeat,
  collapseTypewriter, dropRubyFirst, hookCleaner, keepCp932, keepQuotes, ruleError, stripControl, stripMarkup,
  suggestCleanup, rulesFromText, rulesText } from '../js/apps/vnclean.js';

const eq = assert.equal;
eq(collapseRepeatedChars('ここここはは何何処処？？'), 'ここは何処？');
eq(collapseRepeatedChars('おお前前ははもうう死死んんででいいるる'), 'お前はもう死んでいる');
eq(collapseRepeatedChars('そうか……ああ、わかった'), 'そうか……ああ、わかった');
eq(collapseRepeatedChars('あああいいいう', 3), 'あいう');

eq(collapseRepeatedLine('吾輩は猫である。吾輩は猫である。'), '吾輩は猫である。');
eq(collapseRepeatedLine('吾輩は猫である。'), '吾輩は猫である。');
eq(collapseRepeatedPhrases('おはよう。おはよう。元気？元気？'), 'おはよう。元気？');
eq(collapseRepeatedPhrases('「待って」「待って」そう言った。'), '「待って」そう言った。');

eq(collapseTypewriter('ああいあいう'), 'あいう');
eq(collapseTypewriter('今今日今日は今日は晴れ'), '今日は晴れ');
eq(collapseTypewriter('AABABCABCD'), 'ABCD');
eq(collapseTypewriter('ここ'), 'ここ');
eq(collapseTypewriter('あいあいう'), 'あいあいう');

eq(collapseTrailingRepeat('どうしてどうしてどうして'), 'どうして');
eq(collapseTrailingRepeat('え？　待ってよ待ってよ待ってよ'), 'え？　待ってよ');
eq(collapseTrailingRepeat('待ってよ待ってよ'), '待ってよ待ってよ');

eq(stripMarkup('<color=red>{太一/たいち}</color>は{p}走った'), '太一は走った');
eq(stripControl('今日は\u0001\u001b晴れ\n明日も'), '今日は晴れ\n明日も');
eq(keepCp932('ＡＢＣ…「髙橋」①ｶﾅé😀'), 'ＡＢＣ…「髙橋」①ｶﾅ');
eq(dropRubyFirst('くろす　　黒須太一は走った'), '黒須太一は走った');
eq(dropRubyFirst('彼は　みやすみ  宮澄見里と'), '彼は　宮澄見里と');
eq(keepQuotes('太一「行くぞ」'), '「行くぞ」');
eq(keepQuotes('風が吹いた。'), '風が吹いた。');

assert.notEqual(ruleError('('), '');
eq(ruleError('^【.+?】'), '');
eq(cleanHookLine('【太一】「おう」', { replace: true, rules: [{ pattern: '^【.+?】', replacement: '' }, { pattern: '(', replacement: 'x' }] }), '「おう」');
eq(cleanHookLine('ＡＢ……ｶﾅ①', {}), 'ＡＢ……ｶﾅ①');

const r = rulesFromText('^【.+?】\n(\n a => b => c\n\n');
assert.deepEqual(r.rules, [{ pattern: '^【.+?】', replacement: '' }, { pattern: ' a => b', replacement: 'c' }]);
eq(r.bad.length, 1);
eq(rulesText(r.rules), '^【.+?】 => \n a => b => c');
assert.deepEqual(rulesFromText(rulesText(r.rules)).rules, r.rules);

const clean = hookCleaner({}), off = hookCleaner({ newOnly: false });
off('あ。');
eq(off('あ。い'), 'あ。い');
eq(clean('少しばかり無邪気すぎる。', 'a'), '少しばかり無邪気すぎる。');
eq(clean('少しばかり無邪気すぎる。忍「ところで」', 'a'), '忍「ところで」');
eq(clean('少しばかり無邪気すぎる。', 'b'), '少しばかり無邪気すぎる。');
eq(clean('新しいページ。', 'a'), '新しいページ。');
eq(clean('あ', 'c'), 'あ');
eq(clean('あい', 'c'), 'あい');

const recent = hookCleaner({ recentLines: true, recentSize: 2, markup: true });
eq(recent('一行目', 'a'), '一行目');
eq(recent('一行目', 'b'), '一行目');
eq(recent('一行目', 'a'), '');
eq(recent('二行目', 'a'), '二行目');
eq(recent('三行目', 'a'), '三行目');
eq(recent('一行目', 'a'), '一行目');
eq(recent('<br>', 'a'), '');

eq(suggestCleanup(['少しばかり。', '少しばかり。忍「ところで」', '少しばかり。忍「ところで」行こうか。']), undefined);
assert.deepEqual(suggestCleanup(['今今日日はは晴晴れれ', '「「おおははよようう」」', 'ままたた明明日日', '行行くくよよ。。']), { repeatedChars: true });
assert.deepEqual(suggestCleanup(['<r>くろす　黒須は笑った', '<r>みやすみ　宮澄と話す', '<r>きりはら　霧原だ']), { markup: true, rubyFirst: true });
eq(suggestCleanup(['吾輩は猫である。', '名前はまだ無い。', 'どこで生れたかとんと見当がつかぬ。']), undefined);
eq(suggestCleanup(['今今日日']), undefined);
console.log('vnclean ok');
