import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountSearch } from '../accounts.mjs';

const did = c => 'did:plc:' + c.repeat(24);
test('PDS discovery paginates, matches names, skips inactive/invalid handles, coalesces and refreshes', async () => {
  let time = 0, scans = 0, renamed = false;
  const fetcher = async input => {
    const url = new URL(input), repo = url.searchParams.get('repo');
    if (url.pathname.endsWith('listRepos')) {
      scans++;
      return Response.json(url.searchParams.has('cursor') ? { repos: [{ did: did('b'), active: false }, { did: did('c') }] } : { repos: [{ did: did('a'), active: true }], cursor: 'next' });
    }
    assert.notEqual(repo, did('b'));
    if (url.pathname.endsWith('describeRepo')) return Response.json({ did: repo, handle: renamed ? 'renamed.test' : 'alice.test', handleIsCorrect: repo !== did('c'), collections: ['app.bsky.actor.profile'] });
    return Response.json({ value: { displayName: 'Alice Example' } });
  };
  const search = createAccountSearch({ fetcher, now: () => time });
  assert.deepEqual((await search('a')).items, []);
  assert.deepEqual((await search(did('a'))).items, []);
  assert.equal(scans, 0);
  const [a, b] = await Promise.all([search('EXAMPLE'), search('@alice')]);
  assert.equal(scans, 2);
  assert.equal(a.items[0].handle, 'alice.test');
  assert.deepEqual(a.items, b.items);
  renamed = true; time = 300001;
  assert.equal((await search('renamed')).items[0].handle, 'renamed.test');
  assert.equal((await search('alice.test')).items.length, 0);
  assert.equal(scans, 4);
});

test('Bluesky results are cached, deduplicated by DID and follow the local PDS match', async () => {
  let searches = 0;
  const fetcher = async input => {
    const url = new URL(input);
    if (url.hostname === 'public.api.bsky.app') {
      searches++; assert.equal(url.searchParams.get('q'), 'alice');
      return Response.json({ actors: [{ did: did('a'), handle: 'stale.test' }, { did: did('d'), handle: 'alice.bsky.social', displayName: 'Alice' }] });
    }
    if (url.pathname.endsWith('listRepos')) return Response.json({ repos: [{ did: did('a') }] });
    return Response.json({ did: did('a'), handle: 'alice.test', handleIsCorrect: true, collections: [] });
  };
  const search = createAccountSearch({ searchBluesky: true, fetcher });
  assert.deepEqual((await search('alice')).items.map(a => a.handle), ['alice.test', 'alice.bsky.social']);
  await search('@Alice'); assert.equal(searches, 1);
});

test('one unavailable directory preserves the other source; all unavailable stays distinguishable from no matches', async () => {
  const fetcher = async input => {
    if (new URL(input).hostname === 'public.api.bsky.app') return Response.json({ actors: [{ did: did('d'), handle: 'alice.bsky.social' }] });
    throw new Error('Offline');
  };
  const result = await createAccountSearch({ searchBluesky: true, fetcher })('alice');
  assert.equal(result.available, true); assert.equal(result.complete, false); assert.equal(result.items.length, 1);
  const offline = await createAccountSearch({ fetcher: async () => { throw new Error('Offline'); } })('alice');
  assert.equal(offline.available, false); assert.deepEqual(offline.items, []);
});
