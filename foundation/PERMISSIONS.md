# Private audiences and permissions

David’s accepted November 5 direction is a simple private-audience experience: the author chooses which verified DIDs can see and interact with their private posts. Graduated layers, named groups, action scopes and tag/lexicon selectors may follow. Keep that extensibility in the data boundary while presenting one understandable private audience first.

## What exists in this repository

`foundation/snapback/schema.q` currently authorizes memory modules, not social posts. A module owner calls `setMember(module, principal, access)` with `access` equal to `read` or `write`, and can revoke it through `removeMember`. OAuth-backed sessions supply the verified DID as the viewer/principal. The owner’s membership is protected from removal. Both access levels can read module contents; writes such as capture require write membership. Module membership also controls sync recipients. Armillary reader records permit discovery of the containing armillary; they are separate from module content access.

There are no post/thread tables, post audiences, Close Friends list, permission groups, tag selectors or lexicon-scoped grants in that schema. This is a source inspection, not a new production deployment audit. The synthetic design preview has neither verified accounts nor backend access enforcement. Its Public label does not publish to ATproto.

## Accepted reply rule

A reply can narrow its immediate parent’s audience, never broaden it. A public parent permits public or private replies. A private parent permits only private replies, including a private branch inside an otherwise public conversation. Root, parent and author attribution remain intact. The original public author does not automatically gain access to another author’s private reply.

Public responses, counts, previews, notifications and subscriptions must exclude inaccessible private descendants. A private experience may show a publicly readable parent as context without exposing private branch content to public readers. Permission revocation must also affect cached/subscribed content when this becomes live.

## Proposed live data boundary

Separate verified identity, audience membership, action grants and resource matching. A post can reference its author and an audience ID instead of copying a list of DIDs into every UI component. The initial private audience belongs to the author and contains selected DIDs. A named group can later supply members to one or more audiences; scoped grants can associate a subject/audience with actions and a resource selector. Selectors may eventually match a post, tag or lexicon. This is a proposed model, not an implemented database API.

Reading, replying, editing one’s own content and managing an audience should be distinct capabilities. Do not interpret a user’s permission to interact as permission to edit everyone’s posts or manage their membership. For a private reply, resolve effective readership within the parent’s effective audience as well as the replying author’s chosen audience. A group reference alone does not prove that subset relationship. Preserve explicit parent access checks and attribution on the server.

Keep the first UI to a list of DIDs that may see/interact with the author’s private posts. No group builder, scope language or lexicon permissions editor is needed in the composing flow. Before live implementation, settle how membership changes affect earlier posts and how separate read/reply capabilities appear in that simple audience UI; prototype visibility is not a substitute for those decisions or server enforcement.

The next live implementation should verify add/revoke, wrong-DID access, read-only versus replying permissions, narrower private branches, count/notification isolation, stale subscriptions, and author attribution against an isolated real Snapback store. Existing module read/write grants are useful implementation precedent, rather than the final post permission model.
