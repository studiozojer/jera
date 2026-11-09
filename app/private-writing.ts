import type { Drafts } from './social-data.ts';
import { newIntent } from './social-data.ts';
import { newComposition } from './composition.ts';
import { privateView, postDefinition } from './private-definition.ts';

// A view change must not discard structured work or widen its audience. Keep
// the full original as a separate owner-only recovery branch before simplifying.
// Sealed retries are an existing publication, never a new-format conversion.
export async function preparePrivateWriting(drafts: Drafts, scope: string) {
  return drafts.use(v => {
    const current = v.drafts[scope];
    if (!current || current.sealed || !current.composition || privateView.compose.lexicons.some(l => l.ref === current.composition!.lexicon.ref && l.digest === current.composition!.lexicon.digest)) return current;
    const retained = `retained:${current.intent}`;
    if (v.drafts[retained]) throw new Error('The earlier draft is already retained. Your draft is kept.');
    v.drafts[retained] = {...current, revision: Math.max(1,current.revision), syncedRevision:0, cloudRevision:0};
    const next = {...current, revision:current.revision+1, intent:newIntent(),
      composition:newComposition(postDefinition,current.composition.audience,current.body)};
    v.drafts[scope] = next;
    return next;
  },true);
}
