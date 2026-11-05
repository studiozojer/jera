# Parallel experiences

Jera’s standing north star is that the lexicon being interacted with influences the UI. Private/public is the first contextual axis in this prototype, rather than a lexicon taxonomy. Both experiences use the same feed, thread, writing and navigation components. They can acquire deliberate contextual variations as use reveals different needs. The accepted direction is in `../PRODUCT.md` and the composed commons’ Jera strata.

## Control and state

`ExperienceModeControl` in `experience.contract` is a controlled Jera composition using the canonical daoUI Action treatment. It currently sits below the composer heading and presents explicit Private/Public choices with radio semantics, roving Tab focus, Arrow keys, Home and End. Its position and visual expression are candidates for further design. Its contract stays `mode`, `change`, `disabled` so another representation can replace it without rewriting app state.

`experience.ts` owns one app-local experience store. `app.ts` bridges its snapshot and change operation into Exact resources/mutations. The view projects the latest revision from the source response; it does not own another independently mutable mode. Selection changes the entire app context, not just the next post’s audience. The default is Public, retaining the earlier preview’s starting feed. Context, posts and drafts reset on reload with this synthetic preview.

Other app sources can observe the same authority:

```ts
import { getExperienceSnapshot, getLastExperienceChange, subscribeExperience } from './experience.ts';

const stop = subscribeExperience(event => {
  // React to context; event carries no post or draft content.
});
const current = getExperienceSnapshot();
const latest = getLastExperienceChange();
// Later, when this observer's context ends:
stop();
```

Change records have type `jera.experience.changed`, version 1, previousMode, mode, revision, origin `composer`, and a supplied wall-clock timestamp `at`. Revisions increase only for actual changes. Reads give late observers current context; subscriptions receive subsequent changes in order, including when an observer reacts with another change. An observer failure cannot roll back selection or block peers; the store retains bounded revision-only diagnostics. App writes go through the composer action so context and navigation remain coherent. This is an in-process event boundary, not a deployed webhook or cross-device subscription. A future transport can adapt the contract without coupling the control to networking.

## Content and return paths

Post records carry `visibility`. Public views exclude private records, including reply counts and branch previews. Private conversations may reference public posts and their publicly readable context alongside private replies; a public focused post is marked as such, and private records carry a quiet Private cue. This is a synthetic preview projection, not an ACL. Its public records are assumed publicly readable; the real data module must return only records the authenticated DID is allowed to read.

Public feeds show public root posts. Private feeds show private roots and the heads of private branches attached to public parents, with a “Private reply to…” cue. Descendants remain within their branch. Feed creation order is independent of oldest-first reply order. The original sixty fixtures contain 46 public and 14 private records; new posts inherit the selected experience. Existing posts are not moved by context changes.

New-post draft identity remains `{mode, context: ""}`. An unsent reply is keyed by its recipient (`{mode: "reply", context: parentId}`): explicitly changing its audience keeps that recipient, text and mounted editor. Selecting Public is a deliberate change to the eventual reply audience; posting still requires the Post action. The picker is available for public parents. Private parents show a fixed Private indicator, and the selection and posting actions independently enforce `canReplyInExperience`, so hiding the control is not the only guard. Private descendants of public roots also cannot acquire public children.

Cancel and browser Back after a reply audience change return to its parent conversation in the selected experience, with the selected feed below it. Successful posting preserves both immediate parent and original root, reveals the reply, and returns through the selected context. A changed new-post composer still returns to the selected feed. Private content is not rendered on direct public routes. Readable public context within Private does not add public roots to the private feed.

The future live audience model and current module membership implementation are distinguished in `../PERMISSIONS.md`. There is no DID picker, post ACL, group scope, live permission change or implicit grant to the original author in this preview. The global event interface remains unchanged.

## First presentation seam

The Tamber `experience` axis selects one app-owned token, `experience.canvas`: Public aliases the existing `bg.base`; Private aliases canonical `dao.bg.solid.black`. In dark mode these are #1A1714 and #090604. Authored page, sheet, header, corner mask and surface-button grounds bind that token. Other type, color, spacing and component contracts remain shared. Mode labels provide orientation beyond the color difference.

The comments beside this token and the root presentation action reserve the future lexicon/context presentation resolver. This is intentionally one canvas mapping, rather than a second independent theme or a recursive renderer framework. OS scheme and daoUI’s aesthetic theme remain separate axes.

The pinned SDK refuses app-axis variation of host Canvas/background roles (`tamber-role-axis`). Those fixed host aliases remain intact; the prototype changes authored surfaces. Browser captures and checks cover the authored header, masks, surface button and sheet. Native-owned safe-area and presentation paint remain unverified and belong to the later resolver/host integration work. No SDK source is modified to bypass that boundary.

## Review

Use Bun 1.4.2. Run `bun test experience.test.ts`, `python3 dao/check.py`, and `bun exact.mjs verify`. Against a separately running preview on port 3034, run `node scripts/review-experience.cjs` and `node scripts/review-reply-audiences.cjs`; `JERA_PREVIEW_URL` and `PLAYWRIGHT_MODULE` override its defaults. Stop the dev watcher before verify. Direct captures and proof are in ignored `.exact/experience-review/`.

The focused browser review checks actual canvas colors, retained editor identity, keyboard ownership, per-mode drafts, visible feed filtering, browser Back and the posted result. The Contract scenarios cover Cancel/Post return paths and existing writing/threading behavior. The unit tests cover the snapshot/event interface. These are distinct evidence. Geometry findings are retained in the verify report; a wrapper exit code alone does not establish a clean layout or native acceptance.

No production data, permissions, OAuth flow, phone build or ATproto publication is changed by this iteration. Public and Private are prototype experience labels. The prior phone promotion remains unfinished and separate; live readership and publication still require their own access and storage implementation.
