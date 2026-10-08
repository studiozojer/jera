import assert from 'node:assert/strict';
import { test } from 'node:test';
import { familiesIn, recognizeSymbols, replaceRange, shortcodeAt } from '../src/lib/symbols.ts';

test('equivalent Virgo forms keep their distinct original sequences', () => {
  const source = ':virgo: ♍ ♍︎ ♍️ :VIRGO:';
  const tags = recognizeSymbols(source);
  assert.equal(tags.length, 5);
  assert.deepEqual(tags.map((t) => t.raw), [':virgo:', '♍', '♍︎', '♍️', ':VIRGO:']);
  assert.deepEqual(familiesIn(source), ['virgo']);
  for (const tag of tags) assert.equal(source.slice(tag.start, tag.end), tag.raw);
});

test('UTF-16 offsets survive preceding emoji and replacement in the middle of a draft', () => {
  const source = '🌙 :virgo: tomorrow';
  const tag = recognizeSymbols(source)[0];
  assert.equal(tag.start, 3);
  const accepted = replaceRange(source, tag.start, tag.end, '♍︎');
  assert.equal(accepted.text, '🌙 ♍︎ tomorrow');
  assert.equal(accepted.caret, 5);
  assert.equal(accepted.text.slice(accepted.caret), ' tomorrow');
});

test('partial candidates only apply at a collapsed caret; unknown text stays intact', () => {
  const partial = shortcodeAt('Hello :vir', { start: 10, end: 10 });
  assert.deepEqual(partial?.options.map((s) => s.id), ['virgo']);
  assert.equal(shortcodeAt('Hello :vir', { start: 7, end: 10 }), null);
  assert.deepEqual(familiesIn(':not-a-tag: :virgoish:'), []);
  assert.deepEqual(shortcodeAt(':unknown:', { start: 9, end: 9 })?.options, []);
});

test('all zodiac families are recognized with presentation variants', () => {
  assert.equal(familiesIn('♈︎♉️♊♋︎♌️♍♎︎♏️♐♑︎♒️♓').length, 12);
  assert.throws(() => replaceRange('a', -1, 0, '♍︎'), RangeError);
});

test('a caret inside or before the closing colon consumes the whole shortcode, not following prose', () => {
  for (const caret of [2, 4, 6, 7]) {
    const source = ':virgo: tomorrow';
    const candidate = shortcodeAt(source, { start: caret, end: caret })!;
    const accepted = replaceRange(source, candidate.start, candidate.end, '♍︎');
    assert.equal(accepted.text, '♍︎ tomorrow');
  }
  const joined = ':virgo:tomorrow';
  const candidate = shortcodeAt(joined, { start: 7, end: 7 })!;
  assert.equal(replaceRange(joined, candidate.start, candidate.end, '♍︎').text, '♍︎tomorrow');
});
