import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  postRecord,
  presentation,
  readPosts,
  searchPosts,
  validateRecord,
} from '../src/lib/records.ts';

test('existing stored posts keep exact text and gain a record view without migration', () => {
  const text = ':virgo: ♍ ♍︎ ♍️';
  const posts = readPosts(
    JSON.stringify([
      { id: 'old', author: 'You', text, createdAt: '2026-10-07T12:00:00Z' },
    ]),
  );
  assert.equal(postRecord(posts[0]).text, text);
  assert.equal(presentation(posts[0]).text, text);
  assert.deepEqual(presentation(posts[0]).tags, ['Virgo']);
  assert.equal(posts[0].record, undefined);
});
test('custom fields survive storage, while projection and search use the adapter', () => {
  const record = {
    $type: 'studio.zojer.jera.note',
    title: 'Garden',
    body: 'Let the thought grow.',
    topics: ['patience'],
    custom: { value: 42 },
  };
  const posts = readPosts(
    JSON.stringify([
      {
        id: 'note',
        author: 'You',
        text: 'old projection',
        createdAt: '2026-10-17',
        record,
      },
    ]),
  );
  assert.deepEqual(postRecord(posts[0]), record);
  assert.equal(presentation(posts[0]).text, record.body);
  for (const query of ['garden', 'grow', 'patience', 'you'])
    assert.equal(searchPosts(posts, query).length, 1);
  assert.equal(searchPosts(posts, 'old projection').length, 0);
});
test('unknown records are preserved and presented without guessing at their text fields', () => {
  const record = validateRecord({
    $type: 'example.test.entry',
    secret: 'do not infer this as body',
  });
  const post = { id: 'x', author: 'You', text: '', createdAt: '', record };
  assert.equal(presentation(post).supported, false);
  assert.equal(presentation(post).text.includes('do not infer'), false);
  assert.equal(postRecord(post), record);
});
test('malformed known records and storage fail visibly instead of silently discarding content', () => {
  for (const value of [
    null,
    [],
    {},
    { $type: ' ' },
    { $type: 'app.bsky.feed.post', text: 5 },
    { $type: 'studio.zojer.jera.note', title: 'a', body: 'b', topics: [1] },
  ])
    assert.throws(() => validateRecord(value));
  assert.throws(() => readPosts('{}'));
  assert.throws(() => readPosts('[{"id":"partial"}]'));
});
