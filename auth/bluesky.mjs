import { createHash } from 'node:crypto';
import { TID } from '@atproto/common-web';

export const postCollection = 'app.bsky.feed.post';
export const postScope = 'repo:app.bsky.feed.post?action=create';
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function refuse(message, status) {
  throw Object.assign(new Error(message), { jeraSafe: true, status });
}

export async function hasPostScope(session, did) {
  const info = await session.getTokenInfo();
  return session.did === did && info.sub === did && info.scope.split(' ').includes(postScope);
}

// Reserve one PDS record key before the first network call. The journal retains
// the fingerprint and receipt, so retrying a confirmed but later deleted post
// cannot bring it back. Draft text stays on the device until an explicit press.
export async function publishBluesky(store, session, input) {
  const did = session.did;
  const { intent, text } = input;
  if (typeof intent !== 'string' || !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(intent) || typeof text !== 'string' || !text.trim()
      || Buffer.byteLength(text) > 3000 || [...graphemes.segment(text)].length > 300) {
    refuse('Use up to 300 characters and 3,000 UTF-8 bytes for a Bluesky post.', 422);
  }
  const key = did + '/' + intent;
  const fingerprint = createHash('sha256').update(text).digest('hex');
  const lifetime = Number.MAX_SAFE_INTEGER - Date.now();
  const fresh = store.insert('bluesky-intent', key, {
    fingerprint, rkey: TID.nextStr(), createdAt: new Date().toISOString(),
  }, lifetime);
  const saved = store.get('bluesky-intent', key);
  if (saved.fingerprint !== fingerprint) refuse('This pending post has different text. Your draft is kept.', 409);
  if (saved.receipt) return saved.receipt;
  const { rkey, createdAt } = saved;
  const record = { $type: postCollection, text, createdAt };
  const uri = `at://${did}/${postCollection}/${rkey}`;
  const query = new URLSearchParams({ repo: did, collection: postCollection, rkey });
  function confirm(result) {
    if (result.uri !== uri || typeof result.cid !== 'string' || !result.cid) refuse('Could not confirm the Bluesky record. Check again.', 503);
    const receipt = { uri, cid: result.cid, url: `https://bsky.app/profile/${did}/post/${rkey}` };
    store.set('bluesky-intent', key, { ...saved, receipt }, lifetime);
    return receipt;
  }
  const request = (path, options) => session.fetchHandler('/xrpc/com.atproto.repo.' + path, {
    ...options, redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  try {
    if (!fresh) {
      const response = await request('getRecord?' + query);
      const existing = await response.json();
      if (response.ok) {
        if (existing.value?.text !== text || existing.value?.createdAt !== createdAt || existing.value?.$type !== postCollection || Object.keys(existing.value).length !== 3)
          refuse('A different record exists at this address. Your draft is kept.', 409);
        return confirm(existing);
      }
      if (existing.error !== 'RecordNotFound') refuse('Could not check the pending Bluesky post. Try again.', 503);
    }
    const response = await request('createRecord', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo: did, collection: postCollection, rkey, record }),
    });
    if (response.ok) return confirm(await response.json());
    if (response.status === 401 || response.status === 403) refuse('Authorize Bluesky posting again. Your draft is kept.', 403);
  } catch (error) {
    if (error.jeraSafe) throw error;
  }
  refuse('Post confirmation is pending. Retry to check the original post.', 503);
}
