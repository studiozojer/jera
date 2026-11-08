import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPublicIndex, publicPresentation, publicParentGaps, blueskyUrl } from '../app/public-data.ts';

const did = 'did:plc:' + 'a'.repeat(24), uri = `at://${did}/app.bsky.feed.post/first`;
test('own continuations identify missing parents without altering protocol edges', () => {
  const rows = [
    { uri, parent: '', root: '' },
    { uri: uri + '-normal', parent: uri, root: uri },
    { uri: uri + '-gap', parent: uri + '-deleted', root: uri },
    { uri: uri + '-descendant', parent: uri + '-gap', root: uri },
    { uri: uri + '-foreign-gap', parent: 'at://did:plc:other/app.bsky.feed.post/reply', root: uri },
  ];
  const before = structuredClone(rows);
  assert.deepEqual([...publicParentGaps(rows)], [uri + '-gap', uri + '-foreign-gap']);
  assert.deepEqual(rows, before);
});
test('public reader renders stored text/media with a canonical source destination', () => {
  const result = publicPresentation({ uri, record: JSON.stringify({ text: '♍︎ ♍️', embed: {
    $type: 'app.bsky.embed.images', images: [{ alt: 'A synthetic drawing', image: { ref: { $link: 'bafyreiaaaaaaaa' } } }],
  } }) }, did);
  assert.equal(result.images[0].alt, 'A synthetic drawing');
  assert.equal(result.images.length, 1);
  assert(result.images[0].src.startsWith('https://cdn.bsky.app/'));
  assert.equal(result.sourceUrl, blueskyUrl(uri));
  assert.equal(blueskyUrl('https://attacker.test'), '');
  const external = publicPresentation({ uri, record: JSON.stringify({ embed: { $type: 'app.bsky.embed.external', external: { uri: 'javascript:alert(1)', title: 'Unsafe link' } } }) }, did);
  assert.equal(external.embedUrl, '');
});

test('public reader pages roots, deduplicates own thread context and pins one generation', async () => {
  const calls = [];
  const request = async (kind, operation, args) => {
    calls.push([kind, operation, args]);
    if (operation === 'publicIndexStatus') return { data: { generation: 'A', state: 'ready', syncedAt: 123 } };
    assert.equal(args.generation, 'A');
    if (operation === 'publicIndexRoots') return { data: [{ uri, body: 'Root' }], next: null };
    if (operation === 'publicIndexThread') return { data: [{ uri, body: 'Root' }, { uri: uri + '-child', body: 'Own reply' }], next: null };
    assert.fail(operation);
  };
  const result = await loadPublicIndex(request, 50, uri);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.roots, [uri]);
  assert.equal(result.more, false);
  assert.equal(calls.filter(c => c[1] === 'publicIndexThread').length, 1);
});

test('public reader registers once and distinguishes a first backfill from an empty completed feed', async () => {
  const request = async (kind, operation) => operation === 'publicIndexStatus' ? { data: null } : { result: { generation: '', state: 'pending' } };
  const result = await loadPublicIndex(request, 50, '');
  assert.equal(result.ready, false);
  assert.equal(result.state, 'pending');
  assert.deepEqual(result.rows, []);
});

test('a snapshot change restarts the public read instead of mixing pages', async () => {
  let changed = false;
  const result = await loadPublicIndex(async (kind, operation) => {
    if (operation === 'publicIndexStatus') return { data: { generation: changed ? 'B' : 'A', state: 'ready', syncedAt: 123 } };
    if (!changed) { changed = true; throw Object.assign(new Error('Snapshot changed'), { code: 'INDEX_CHANGED' }); }
    return { data: [{ uri, body: 'New snapshot' }], next: null };
  }, 50, '');
  assert.equal(result.rows[0].body, 'New snapshot');
});
