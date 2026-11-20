import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthStore } from '../store.mjs';
import { publishBluesky, postScope, hasPostScope } from '../bluesky.mjs';

const did = 'did:plc:' + 'a'.repeat(24);
const input = { intent: '01H12345678901234567890123', text: 'A thought ♍︎' };

test('an ambiguous write reconciles with the original key, and a confirmed retry never recreates a deleted post', async t => {
  const store = new AuthStore(':memory:');
  t.after(() => store.close());
  let writes = 0, saved;
  const session = { did, fetchHandler: async (path, options) => {
    if (path.endsWith('createRecord')) {
      writes++;
      const { repo, collection, rkey, record } = JSON.parse(options.body);
      assert.equal(repo, did);
      assert.equal(collection, 'app.bsky.feed.post');
      saved = { uri: `at://${repo}/${collection}/${rkey}`, cid: 'persisted-cid', value: record };
      throw new Error('lost response');
    }
    assert.match(path, /getRecord\?/);
    return Response.json(saved);
  } };
  await assert.rejects(publishBluesky(store, session, input), /confirmation is pending/);
  await assert.rejects(publishBluesky(store, session, { ...input, text: 'changed' }), /different text/);
  const receipt = await publishBluesky(store, session, input);
  assert.equal(receipt.uri, saved.uri);
  saved = undefined;
  assert.deepEqual(await publishBluesky(store, session, input), receipt);
  assert.equal(writes, 1);
});

test('post length is validated in graphemes and bytes before reserving an intent', async t => {
  const store = new AuthStore(':memory:');
  t.after(() => store.close());
  for (const text of [' ', 'x'.repeat(301), '👨‍👩‍👦'.repeat(200)]) {
    await assert.rejects(publishBluesky(store, { did }, { ...input, text }), { status: 422 });
    assert.equal(store.get('bluesky-intent', did + '/' + input.intent), undefined);
  }
});

test('posting needs the signed-in subject and collection create grant', async () => {
  const session = (sub, scope) => ({ did, getTokenInfo: async () => ({ sub, scope }) });
  assert.equal(await hasPostScope(session(did, 'atproto'), did), false);
  assert.equal(await hasPostScope(session(did, 'atproto ' + postScope), did), true);
  assert.equal(await hasPostScope(session('another', 'atproto ' + postScope), did), false);
});
