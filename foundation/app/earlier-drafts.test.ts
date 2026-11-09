import { test, expect } from 'bun:test';
import { Drafts, publish, type Request } from './social-data.ts';
import { earlierPublicDrafts, copyEarlierPublicDraft } from './earlier-drafts.ts';

const did = 'did:plc:' + 'a'.repeat(24), origin = 'https://drafts.test';
function fixture() {
  const files = new Map<string, Uint8Array>();
  const fs = {
    readFile: async (path: string) => files.get(path)!.buffer as ArrayBuffer,
    atomicWriteFile: async (path: string, bytes: Uint8Array) => { files.set(path, bytes); },
    readdir: async () => [...files.keys()].map(path => path.split('/').pop()!),
  };
  const drafts = new Drafts(fs, origin, did), mutations: string[] = [];
  let cloud = [{ id: 'branch', body: 'Earlier synced ♍︎ ♍️ :virgo:', revision: 7 }];
  const request: Request = async (kind, op, args) => {
    if (kind === 'm') mutations.push(op);
    if (op === 'earlierPublicDrafts') return { data: cloud, next: null };
    if (op === 'earlierPublicDraft') return { data: cloud.find(row => row.id === args.id) || null };
    if (op === 'latestDraft') return { data: [] };
    if (op === 'draftForDevice' || op === 'postForIntent') return { data: null };
    if (op === 'saveSocialDraft') return { state: 'sent', result: args };
    throw new Error(op);
  };
  return { fs, drafts, request, mutations, cloud };
}
test('explicit recovery copies synced Unicode text with a fresh private intent and keeps every original', async () => {
  const { drafts, request, cloud, mutations } = fixture();
  await drafts.save('root:public', 'Local variant', 2);
  const original = await drafts.get('root:public');
  const result = await earlierPublicDrafts(request, drafts);
  expect(result.items.length).toBe(2);
  const selected = result.items.find(row => row.id === 'cloud:branch')!;
  const copied = await copyEarlierPublicDraft(request, drafts, selected);
  expect(copied.body).toBe(cloud[0].body);
  expect(copied.sealed).toBeNull();
  expect(copied.intent).not.toBe(original.intent);
  expect(await drafts.get('root:public')).toEqual(original);
  const again = await copyEarlierPublicDraft(request, drafts, selected);
  expect(again.intent).toBe(copied.intent);
  expect(again.revision).toBe(copied.revision);
  expect(cloud[0].body).toBe(selected.body);
  expect(mutations).not.toContain('publishPost');
});
test('recovery refuses occupied local and newly hydrated private drafts', async () => {
  const local = fixture();
  const selected = (await earlierPublicDrafts(local.request, local.drafts)).items[0];
  await local.drafts.save('root:private', 'Current private draft', 1);
  await expect(copyEarlierPublicDraft(local.request, local.drafts, selected)).rejects.toThrow('occupied');
  expect((await local.drafts.get('root:private')).body).toBe('Current private draft');
  const fresh = fixture();
  const request: Request = async (kind, op, args, id) => op === 'latestDraft' ? { data: [{ body: 'Private from another device', revision: 9 }] } : fresh.request(kind, op, args, id);
  await expect(copyEarlierPublicDraft(request, fresh.drafts, selected)).rejects.toThrow('occupied');
  expect((await fresh.drafts.get('root:private')).body).toBe('Private from another device');
});
test('unconfirmed public intents stay sealed and recovery never retries them', async () => {
  const { drafts, request, mutations } = fixture();
  await drafts.save('root:public', 'Ambiguous earlier post', 1);
  await publish(async () => { throw new Error('Offline'); }, drafts, 'public', '', 1);
  const original = await drafts.get('root:public');
  const selected = (await earlierPublicDrafts(request, drafts)).items.find(row => row.id === 'local')!;
  expect(selected.pending).toBe(true);
  await copyEarlierPublicDraft(request, drafts, selected);
  expect(await drafts.get('root:public')).toEqual(original);
  expect(mutations).not.toContain('publishPost');
  expect((await drafts.get('root:private')).sealed).toBeNull();
});
test('a pending private intent is never replaced, even with identical text', async () => {
  const { drafts, request, cloud, mutations } = fixture();
  await drafts.save('root:private', cloud[0].body, 1);
  await drafts.use(v => {
    const draft = v.drafts['root:private'];
    draft.sealed = { intent: draft.intent, body: draft.body, visibility: 'private', audience: 'existing-audience', parent: null };
  }, true);
  const original = await drafts.get('root:private');
  const selected = (await earlierPublicDrafts(request, drafts)).items[0];
  await expect(copyEarlierPublicDraft(request, drafts, selected)).rejects.toThrow('occupied');
  expect(await drafts.get('root:private')).toEqual(original);
  expect(mutations).toEqual([]);
});
test('confirmed posted caches are omitted without retiring their original intent', async () => {
  const { drafts, request } = fixture();
  await drafts.save('root:public', 'Already posted', 1);
  let post: any;
  const transport: Request = async (kind, op, args, id) => {
    if (op === 'publishPost') { post = { id: 'posted', author: did, ...args }; return { state: 'sent', result: post }; }
    if (op === 'postForIntent') return { data: post };
    return request(kind, op, args, id);
  };
  await publish(transport, drafts, 'public', '', 1);
  const original = await drafts.get('root:public');
  expect((await earlierPublicDrafts(transport, drafts)).items.some(row => row.id === 'local')).toBe(false);
  await expect(copyEarlierPublicDraft(transport, drafts, { id: 'local', body: original.body, revision: original.revision })).rejects.toThrow('already posted');
  expect(await drafts.get('root:public')).toEqual(original);
});
test('stale source snapshots are refused; offline listing preserves local recovery and account isolation', async () => {
  const { drafts, request, fs } = fixture();
  const old = (await earlierPublicDrafts(request, drafts)).items[0];
  await expect(copyEarlierPublicDraft(request, drafts, { ...old, revision: old.revision - 1 })).rejects.toThrow('changed');
  await drafts.save('root:public', 'Local preserved', 1);
  const offline: Request = async () => { throw new Error('Offline'); };
  const result = await earlierPublicDrafts(offline, drafts);
  expect(result.available).toBe(false);
  expect(result.items[0].body).toBe('Local preserved');
  await expect(copyEarlierPublicDraft(offline, drafts, result.items[0])).rejects.toThrow('Offline');
  expect((await drafts.get('root:private')).body).toBe('');
  expect((await earlierPublicDrafts(offline, new Drafts(fs, origin, 'did:plc:' + 'b'.repeat(24)))).items).toEqual([]);
  expect((await earlierPublicDrafts(offline, new Drafts(fs, 'https://other.test', did))).items).toEqual([]);
});
