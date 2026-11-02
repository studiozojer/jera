import type { Answer } from './app.contract.d.ts';

export const appId = 'studio.zojer.jera.design-preview';
export const grants = '';
// This composition prototype has no network, identity, storage or agent sources.
// Sample posts and edits live in Contract state and reset on reload.
export const answer: Answer = () => { throw new Error('This preview has no external data sources.'); };
