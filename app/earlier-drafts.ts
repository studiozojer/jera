import { Drafts, allRows, beginDraft, matchesPublication, newIntent, syncScope, type Draft, type Request } from './social-data.ts';

export type EarlierDraft = { id: string; body: string; revision: number; label: string; pending: boolean };
const scope = 'root:public';
async function wasPosted(request: Request, drafts: Drafts, draft: Draft) {
  if (!draft.sealed) return false;
  try {
    const post = (await request('q', 'postForIntent', { intent: draft.sealed.intent })).data;
    return !!post && matchesPublication(post, draft.sealed, drafts.principal) && (!draft.posted || draft.posted === post.id);
  } catch { return false; }
}
export async function earlierPublicDrafts(request: Request, drafts: Drafts) {
  const local = await drafts.get(scope), items: EarlierDraft[] = [];
  if (local.body.trim() && !await wasPosted(request, drafts, local)) items.push({
    id: 'local', body: local.body, revision: local.revision, label: 'On this device', pending: !!local.sealed,
  });
  try {
    const cloud = await allRows(request, 'earlierPublicDrafts');
    for (const row of cloud) if (row.body.trim()) items.push({
      id: `cloud:${row.id}`, body: row.body, revision: row.revision, label: 'Synced draft', pending: false,
    });
    return { items, available: true };
  } catch { return { items, available: false }; }
}

// Explicitly copy text into a fresh private intent. Neither the original public
// intent nor its cloud branch is retired, retried or rewritten by recovery.
export async function copyEarlierPublicDraft(request: Request, drafts: Drafts, selected: Pick<EarlierDraft, 'id' | 'body' | 'revision'>) {
  let source: { body: string; revision: number } | null;
  if (selected.id === 'local') {
    const local = await drafts.get(scope);
    if (await wasPosted(request, drafts, local)) throw new Error('This draft was already posted. The original is kept.');
    source = local;
  } else if (selected.id.startsWith('cloud:')) {
    source = (await request('q', 'earlierPublicDraft', { id: selected.id.slice(6) })).data;
  } else source = null;
  if (!source || source.body !== selected.body || source.revision !== selected.revision || !source.body.trim()) {
    throw new Error('This draft changed. Refresh before copying. The original is kept.');
  }
  // Hydrate the normal private branch before checking occupancy. Recovery must
  // not hide a synced private draft merely because this device is new.
  await beginDraft(request, drafts, 'private', '');
  await syncScope(request, drafts, 'root:private');
  return drafts.use(v => {
    const current = v.drafts['root:private'];
    if (selected.id === 'local') {
      const latest = v.drafts[scope];
      if (!latest || latest.body !== selected.body || latest.revision !== selected.revision) throw new Error('This draft changed. Refresh before copying. The original is kept.');
    }
    if (current?.sealed || (current?.body && current.body !== selected.body)) {
      throw new Error('Your private draft is occupied. Open it first, or use Copy text. The earlier draft is kept.');
    }
    if (current?.body === selected.body) return current;
    const next: Draft = { ...current, body: selected.body, revision: (current?.revision || 0) + 1, intent: newIntent(), sealed: null };
    v.drafts['root:private'] = next;
    return next;
  }, true);
}
