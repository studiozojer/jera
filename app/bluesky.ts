// Stored in the existing per-account, per-origin vault, outside the map of
// Snapback drafts. Background draft sync never sends this text anywhere.
import { countGraphemes } from 'unicode-segmenter/grapheme';
import { Drafts, newIntent } from './social-data.ts';

export type PostedLink = { uri: string; cid: string; url: string; text: string };
export type BlueskyDraft = { intent: string; text: string; revision: number; pending: boolean; posts: PostedLink[] };
const fresh = (posts: PostedLink[] = []): BlueskyDraft => ({ intent: newIntent(), text: '', revision: 0, pending: false, posts });

export function measureBlueskyPost(text: string) {
  const count = countGraphemes(text);
  const bytes = new TextEncoder().encode(text).length;
  const limit = 300;
  const byteLimit = 3000;
  return { text, count, limit, bytes, byteLimit, valid: count <= limit && bytes <= byteLimit };
}

export function openBluesky(drafts: Drafts) {
  return drafts.use(v => v.bluesky ??= fresh(), true);
}

export function saveBluesky(drafts: Drafts, intent: string, revision: number, text: string, seal = false) {
  return drafts.use(v => {
    const d = v.bluesky;
    if (!d || d.intent !== intent) throw new Error('This draft has changed. Reopen the Bluesky view.');
    if (!Number.isSafeInteger(revision) || revision < 0 || text.length > 12000) throw new Error('Invalid Bluesky draft.');
    if (revision < d.revision || (revision === d.revision && text !== d.text) || (d.pending && text !== d.text)) {
      if (!seal && revision < d.revision) return d;
      throw new Error('The saved draft changed. Reopen the Bluesky view.');
    }
    if (seal && !text.trim()) throw new Error('Write something before posting.');
    d.text = text;
    d.revision = revision;
    if (seal) d.pending = true;
    return d;
  }, true);
}

export async function sendBluesky(drafts: Drafts, intent: string, revision: number, text: string,
  submit: (payload: { did: string; intent: string; text: string }) => Promise<Omit<PostedLink, 'text'>>) {
  const size = measureBlueskyPost(text);
  if (size.count > size.limit) throw new Error('A Bluesky post can contain up to 300 characters. Shorten your draft and try again.');
  if (size.bytes > size.byteLimit) throw new Error('A Bluesky post can contain up to 3,000 UTF-8 bytes. Shorten your draft and try again.');
  await saveBluesky(drafts, intent, revision, text, true);
  let receipt;
  try {
    receipt = await submit({ did: drafts.principal, intent, text });
  } catch (error) {
    // Validation ran before reserving a PDS record. Only this definite refusal
    // unlocks the text. Network failures must retry the same frozen bytes.
    if ((error as { code?: string }).code === 'E_POST_TEXT')
      await drafts.use(v => { if (v.bluesky?.intent === intent) v.bluesky.pending = false; }, true);
    throw error;
  }
  const prefix = 'at://' + drafts.principal + '/app.bsky.feed.post/';
  const rkey = receipt.uri?.startsWith(prefix) ? receipt.uri.slice(prefix.length) : '';
  if (!/^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/.test(rkey) || !receipt.cid ||
      receipt.url !== 'https://bsky.app/profile/' + drafts.principal + '/post/' + rkey)
    throw new Error('Could not verify the posting receipt. Retry this post.');
  return drafts.use(v => {
    if (!v.bluesky) throw new Error('Missing Bluesky draft.');
    if (v.bluesky.intent === intent)
      v.bluesky = fresh([{ ...receipt, text }, ...v.bluesky.posts].slice(0, 30));
    return v.bluesky;
  }, true);
}
