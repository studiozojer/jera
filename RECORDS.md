# Structured posts — first contract milestone

Jera's internal structured posts use the existing Snapback `posts` table and verified DID identities. They are public or private application records, not ATproto repository records. `contribution.v1` is the first application lexicon: `purpose` (`archive`, `reflect`, `request`), `body` and `references`. The composer now returns to simple Text writing following David’s UX feedback. The default Private policy below preserves earlier Contribution drafts while showing a body-only copy with the same audience. Publication uses the same trusted gateway as the CLI. Audience and permitted/default lexicons belong to the surrounding [view contract](VIEWS.md); generic view creation and app integration are later work. Purpose is specific to this lexicon.

## Public and historical compatibility

The default Public view again reads Snapback posts, including earlier untyped public records and their original threads. New public posts/replies use `post.v1`. `contracts/views/public.v1.json` selects `visibility: public` and supplies the same body-only writing lexicon; its logical public audience binds to `id: null`. Old records keep null lexicon metadata and their exact source identity; no historical payload backfill or relabeling is needed.

`POST /records/publish` now accepts `audience: null` as an explicit request for a public Jera post. An omitted audience remains invalid. A non-null audience still means private membership-controlled writing. Clients cannot supply a separate visibility value. The trusted mutation derives it from the audience, checks the parent, prevents public replies to private posts, and permits public replies to public legacy or structured posts. Public content is readable by signed-in Jera accounts on this backend, with no ATproto writes. Old sealed untyped publication intents keep their original retry route.

`post.v1` remains intentionally smaller than Bluesky's post schema: only `body` in its payload, with identity/time/audience/thread links in Jera's envelope. It does not include media attachments, rich-text facets, quote embeds or language metadata. The body schema and Snapback/local validation permit 12,000 Unicode code points; the current HTML editor's `maxlength=12000` counts UTF-16 units, so supplementary characters such as many emoji consume two editor units. The latter is a stricter UI cap, not a 300-grapheme Bluesky constraint. The schema, gateway and editor limits were not expanded in this change.

## Default Private writing policy

`post.v1` is the default Private lexicon: `{body: string}` only, with the same nonblank/12,000-codepoint bound. It rejects purpose, references and other extra payload fields. Its immutable digest is `357161d483360602f84ec47750d4f7cbcfa5d8ed6bcdb9d2a35fd97a5f1b2710`. `contracts/views/private.v1.json` permits/defaults only this exact version for writing while retaining all authorized historical records for reading. The generated `app/private-definition.ts` distributes the same view policy and definition; refresh it with `node scripts/sync-record-contracts.mjs`. Tests verify equality with the authored contracts.

The ordinary editor stays body-only. New private text drafts receive `post.v1` and their existing default/private-parent audience when publication is sealed, and use the same gateway as other structured records. `contribution.v1` remains immutable and registered; it is disabled for new writing in this default view, not globally deleted or a server-wide ban on other clients/views. Its purpose is never a required field of a simple post.

At opening or cloud recovery, an unsealed structured draft outside this view's allowed set is retained whole under owner-only draft scope `retained:<original intent>`, with its definition, payload, audience and alternatives. The active copy uses the same audience and body with `post.v1` and a fresh intent. The retained branch syncs through the existing private draft mechanism and survives retirement of the active posted draft. The app does not yet expose an archive browser; authenticated draft queries can recover a retained scope. A sealed pending publication is left untouched so an ambiguous result cannot become a duplicate or different post. Older untyped posts remain untyped and readable.

## Definition and envelope

`contracts/lexicons/contribution.v1.json` owns the payload schema and presentation hints. `contracts/validate.mjs` interprets a bounded vocabulary of objects with explicit fields, strings, enums and arrays. Validation rejects unknown fields and unsupported schema keywords; it never normalizes content or silently drops fields. A supported definition can be added to the explicit registry without altering the post table. New executable widgets/processors still need implementation.

Definitions are immutable versions. The catalog supplies a SHA-256 digest of sorted-key canonical JSON, including the schema and presentation metadata. A record request must name both the version and digest. Retain old definitions when adding new versions; the pinned digest test prevents silently editing v1. This is application versioning, not an ATproto lexicon registry.

An authenticated `GET /records/lexicons` returns `{lexicons: [{ref, digest, definition}]}`. `POST /records/publish` accepts exactly:

```json
{
  "intent": "<persisted 26-character intent>",
  "lexicon": {"ref": "contribution.v1", "digest": "<catalog digest>"},
  "audience": "<audience id>",
  "parent": null,
  "payload": {
    "purpose": "reflect",
    "body": "Keep my original wording.",
    "references": [{"uri": "repo:notes/example.yao", "revision": "<source revision>"}]
  }
}
```

`parent` can be omitted or identify an accessible post. The composer may also supply `draft: {device, revision, scope}`: an owner-bound device branch reference used to retire its private cloud draft in the same transaction as publication. Other callers can omit it. References are attributed source identifiers; storing one does not fetch it, verify its contents or grant access to it. There is no provenance run receipt yet. Author, time, root, visibility and record ID are assigned by the trusted path. Client-supplied author/time/visibility fields are rejected. This endpoint writes to an explicit private audience or, with `audience: null`, to Public on Snapback. ATproto publishing is separate work.

The resulting envelope retains existing post fields plus `lexicon`, `lexiconDigest` and the decoded `payload`. `body` is a compatibility projection from the validated payload so existing readers and threads can display it. Old posts have null lexicon/payload metadata and retain their exact IDs, authors, content and audience. No synthetic version is assigned to historical text.

## Trusted write boundary

The identity service mounts the record routes behind its existing origin checks. It verifies the caller's Snapback session and OAuth authority, validates the exact lexicon/payload, then uses its existing server-only `service:atproto-auth` credential to call `commitStructuredPost`. That mutation checks the actual author's current audience/reply permissions transactionally. Only that service can insert structured payloads. The normal text mutation cannot accept them, and table rules reject direct user insertion of lexicon metadata or payloads. Production Caddy routes `/records/*` to the identity service and blocks external access to the restricted commit mutation.

This service is a trusted write authority, already responsible for verified session minting and public-index ingestion. Its credential remains loopback/server-only. The application and CLI receive no service token. Deploying this change requires the schema, complete identity-service code (including `contracts/` and `scripts/client.mjs`) and route configuration together; no production rollout occurs just by committing the branch.

Structured payloads are stored as `payloadJson: text 1..65536 ?`, with a 65,536-byte canonical JSON admission limit at the gateway. `contracts/records.mjs` projects this into an object-shaped envelope. Direct generated Snapback queries expose the storage field; the portable projection and `JeraClient.readRecord` expose the application envelope. `readRecord` refuses incomplete reads rather than reporting them as missing.

Why text: pinned Snapback Quarry cannot inspect arbitrary JSON fields. In Snapback core `3653cae`, `rows/disclosed.rs` also reserves `max_bytes * 256` for a private JSON column's decode. A 65,536-byte JSON declaration exhausted the 16 MiB read budget even for a tiny legacy post; list reads and point reads showed different outcomes. Canonical text reduces that reservation while preserving the same validated logical payload. The real-store upgrade test retains point-read checks and a full-size Unicode payload. No SDK behavior is patched for this feature.

## Audience and reply semantics

`createAudience(name, kind)` creates an owner-bound named audience. `kind` is immutable: `owner` prohibits membership grants at the mutation and table boundaries; `shared` permits the owner's existing `read`/`reply` grants. `availableAudiences(c)` pages readable audiences. The old `audienceList` and `ensureAudience` retain their single `Private` audience behavior for the current client; that name is reserved from the new creation operation. Existing audiences adopt `shared`, preserving all existing members.

Any authenticated author may start a public root or reply to a public post. An audience owner may start a private root post. A member with reply access may reply within that audience; read-only members cannot contribute. Private descendants preserve the parent's audience. A public legacy parent can receive a private branch in the replying owner's audience. A cross-audience private reply is rejected. Membership revocation immediately affects subsequent reads, writes and publication retries. Original authors retain tombstone deletion of their own replies after losing read access.

## Intents, deletion and drafts

Persist the complete envelope and its intent before sending. `(author, intent)` identifies the logical write. Each gateway HTTP attempt uses a fresh internal transport receipt so the mutation rechecks current access and content rather than returning a cached service response. Concurrent requests and retries after a lost response converge on one row. A changed payload, audience, parent or lexicon under a live intent is rejected. JSON object property order is canonicalized before comparison.

Deletion clears the live row's body and serialized payload while preserving identity, lexicon metadata, audience and thread edges. An original-intent retry returns the tombstone and never restores content. Once deleted, the old payload is unavailable for comparison; a retry still checks author/intent, audience, parent and exact lexicon. This is live-record deletion, not a promise to erase backups or framework operation receipts.

Without a draft reference, structured publication leaves drafts alone. With a reference, the commit atomically clears the matching author's cloud branch through the reserved cloud revision. An already newer branch is kept. Old delayed saves cannot overwrite this tombstone. Existing text posting/draft retirement keeps its transaction and recovery behavior.

The composer extends the account/origin-scoped local journal with the selected audience, exact lexicon/digest, complete payload and its definition. Local saves do not wait for networking. The owner-only `socialDrafts.compositionJson` field synchronizes that snapshot and retained format alternatives; it is separate from the audience of a published post. Format alternatives saved by the earlier UI remain preserved. The format switch is no longer exposed; a later view-context transition must preserve that data rather than silently changing an existing draft. A fresh device adopts the complete draft with its own publishing intent. Reference-row identifiers belong to the form snapshot, never the published payload.

The exact envelope is sealed before calling the gateway. Ambiguous outcomes remain sealed across restart and keep their original intent; definitive refusals retain the editable payload. A successful receipt is followed by an authoritative record check. The posted cache is retained until the next explicit opening confirms the record and retires the draft. All content fields, including non-body changes, participate in synchronization and publication checks.

The tested compatibility direction is old store → new schema. Rolling the backend schema back after creating owner-only audiences is not a safe undo: the old schema cannot enforce their new policy, and it does not understand structured payloads. Keep the new backend boundary when rolling back only the UI; review a separate data-preserving transition before any backend rollback.

## Clients and evidence

The existing `JeraClient` adds `publishRecord(envelope)` and `readRecord(id)`. With `JERA_ORIGIN` and the independently authenticated account's `JERA_TOKEN` set, the CLI accepts `node scripts/agent.mjs publish record envelope.json`; the file must already contain its stable intent. The CLI prints that intent before sending and uses the same gateway as the future composer. The real-store integration test executes this command with a synthetic account and envelope.

`tests/contracts.test.mjs` checks full prior-schema adoption, exact payload retention, invalid payload/version/digest/identity rejection, direct mutation/table bypass attempts, owner-only policy, separate audience isolation, independent operator attribution, legacy replies, concurrent retries, lost responses, revocation, deletion and restart. Its OAuth refresh is simulated; storage, sessions and the HTTP handler are real. The full historical schema fixture is captured from Jera `37454f0` so the adoption test does not generate its expected starting state from the new implementation.

For concurrent worktree verification, the fixture entry point allows Exact to select an isolated backend with `EXACT_BACKEND_ORIGIN=http://127.0.0.1:4457 bun exact.mjs test web --json` from `app`. That explicit local origin has separate credential-storage keys and grants; the default fixture remains on port 4417 and the interactive preview can remain on 4437. Use the pinned Bun toolchain from the project setup.

The browser composer uses daoUI's existing native select and text-field expressions. Purpose options, labels and reference bounds come from the definition; unsupported controls refuse editing instead of dropping data. `app/record-validation.js` is a generated copy of the portable validator, refreshed with `node scripts/sync-record-contracts.mjs`; a test requires byte-for-byte parity with the canonical source. Exact bundles app-local sources, so this explicit distribution step keeps both runtimes on the same validator.

The default Private composer uses the body-only policy above; an already sealed historical structured publication retains its original controls and context while awaiting reconciliation. Missing or revoked audiences block new publication while retaining the draft. Ordinary Text writing keeps its previous shared-Private behavior. Contribution posts display purpose and references alongside their body. Supported definition fields still drive the recovery form; richer widgets and arbitrary lexicon-specific readers require explicit code.

[VIEWS.md](VIEWS.md) records the implemented read-only definition/adapters foundation. Generic view creation, autonomous subscriptions and provenance receipts remain subsequent work. This composer does not execute requests or publish to ATproto.
