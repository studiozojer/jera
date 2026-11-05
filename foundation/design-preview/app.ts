import type { Answer, Sources } from './app.contract.d.ts';
import { getExperienceSnapshot, setExperienceFromComposer } from './experience.ts';

export const appId = 'studio.zojer.jera.design-preview';
export const grants = '';
// Only app-local context sources. Posts/drafts remain synthetic, without network,
// identity, permission or storage operations. Public does not publish to ATproto.
const sources: Sources = {
  experienceSnapshot: () => getExperienceSnapshot(),
  changeExperience: ([mode, at]) => setExperienceFromComposer(mode, at),
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
