# View definitions and read-only source adapters

A view supplies the context for reading and new writing. Audience selection belongs in view creation, outside the posting GUI. The view constrains which lexicons can be used and supplies a default; the chosen lexicon supplies its fields. `purpose` belongs only to `contribution.v1`, not to this contract or every post. “View” is the working name, pending product calibration.

This increment implements a portable definition, two read-only source adapters, an evaluator and a local CLI. The generic definition does not yet drive the app's feed or composer. The app retains its existing Public/Private navigation and simple body editor; earlier structured drafts are privately retained before a body-only copy is shown, with the same audience. View creation and an optional lexicon chooser within a configured view are later UI work. There is no general indexer factory, operator delivery queue or automatic publication here.

## Default Private policy

`contracts/views/private.v1.json` is the first authored default: one logical Snapback source, inclusive authorized reads and body-only `post.v1` as its sole permitted/default writing lexicon. The app consumes this policy/definition for private draft preparation and publication. It still uses its existing feed query and resolves the shared Private audience or inherited reply audience through existing operations; generic source evaluation and a view-creation interface remain separate. Contribution stays available to historical records and other explicitly configured views. [RECORDS.md](RECORDS.md) explains preservation of earlier structured drafts and sealed retries.

## Portable definition

`views/definition.mjs` validates the following bounded contract, rejecting unknown fields/options:

```json
{
  "schemaVersion": 1,
  "id": "studio-work",
  "version": 1,
  "sources": ["network", "notes"],
  "select": {"lexicons": []},
  "presentation": {"order": "newest-first", "group": "thread"},
  "compose": {
    "destination": "network",
    "audience": "circle",
    "lexicons": [{"ref": "contribution.v1", "digest": "a845f54580e5dbd575299d04fdffa21c464d50ba1639d53783fb6676be8f1b9e"}],
    "defaultLexicon": "contribution.v1"
  }
}
```

`schemaVersion` selects the contract vocabulary; `id` and `version` identify this authored view revision. Logical source names resolve in runtime bindings. Empty `select.lexicons` includes all authorized observations; otherwise it accepts exact `{ref,digest}` pairs. A file observation or historical untyped post has no synthetic lexicon and does not match a typed filter. Selection happens after source authorization. V1 supports no arbitrary query language, scripts or processors.

`presentation` requests newest-first ordering with a deterministic identity tie-break. `group` is `thread` or `none`; the evaluator returns the hint and source-qualified parent edges, without inventing missing parents or implementing a GUI. `compose: null` makes a read-only view. Otherwise composition names one destination and audience binding, permitted exact lexicons, and a default among them. These are writing constraints/defaults, independent of read selection; they never grant posting, membership or tool authority. A resolved writing context is reported as `bound`, not as authorized. A future writer must validate the selected definition and recheck current destination/audience/reply rights through the existing trusted gateway.

## Local bindings and one observation

Bindings are private host configuration. They are not embedded in or distributed with the view. Example `local-bindings.json`:

```json
{
  "reader": "<local reader or operator context>",
  "sources": {
    "network": {
      "type": "snapback",
      "origin": "https://snapback.jera.ink",
      "principal": "did:plc:<verified DID>",
      "tokenEnv": "JERA_VIEW_TOKEN"
    },
    "notes": {"type": "folder", "root": "/absolute/canonical/path/to/notes"}
  },
  "audiences": {"circle": {"source": "network", "id": "<existing audience id>"}}
}
```

Use an independently authenticated DID session in `JERA_VIEW_TOKEN`, never the identity service's credential. The Snapback adapter verifies the session principal against its binding before and after scanning. `reader` partitions local checkpoint state; it is not authentication or a substitute for source permissions. A local folder is readable only by the process's existing filesystem authority. A missing binding remains unavailable; moving this definition to an operator VM does not transfer credentials, files or authority. Binding compatibility requires the branch schema on the selected server; no production schema rollout is implied by this example.

From `foundation`, with the view and private bindings already written:

```sh
node scripts/view.mjs view.json local-bindings.json checkpoint.json
```

The CLI emits current authorized observations, per-source completion states, upsert/withdraw observations and resolved writing context to stdout. Treat that output as private: it can contain all selected file/post text. It does not send any mutation or upload. Store the checkpoint outside the indexed folder. The checkpoint holds source-qualified identities and revision hashes, not content; it is still private metadata and is written with mode 0600. Its scope includes the definition, reader and source locations/expected principals, so another account or source configuration starts a new comparison.

One exclusive local lock protects each checkpoint path; a successful run atomically replaces the file. After a process crash a stale `.lock` may remain: verify the process is gone before removing it. A corrupt checkpoint fails visibly rather than being silently reset. This is a bounded rescan and comparison tool, not durable event delivery: stdout failure after checkpoint replacement can lose a change notification, and crashing before replacement may repeat it. Every successful scan still returns the full current result. Operators need their own durable queue/acknowledgment and effect reconciliation in the next milestone.

## Source guarantees

| Adapter | Identity/revision | Changes and access |
|---|---|---|
| Snapback | Logical source + immutable post ID; SHA-256 of canonical decoded record | Pages authenticated `postsList`; honors RLS before selection/counts. Retains exact lexicon payload and deletion tombstones. Existing posts are immutable except author-owned deletion; new revisions here observe that transition, not an invented edit API. |
| Folder | Logical source + relative path; SHA-256 of raw UTF-8 bytes | Reads `.md`, `.yao`, `.txt` recursively. Preserves Unicode, whitespace and BOM. Rename is a withdrawal plus a new file observation, never a newly attributed human post. Source paths remain references; there is no upload or network authority. |

The folder adapter requires a canonical directory without symlinks, refuses symlink entries, bounds depth to 16, total entries to 4,000, supported files to 1,000, each file to 256 KiB and total contents to 8 MiB. It bounds the actual read and checks file identity/metadata around it. Invalid UTF-8, changed/unreadable files, a missing directory or exceeded bounds make the whole source unavailable for that run. It is a reader within a trusted local filesystem, not an OS sandbox against a hostile process replacing ancestor directories concurrently.

Snapback scans are limited to 1,000 posts, with distinct progressing cursors and authoritative complete pages required. Neither adapter promises an atomic multi-record snapshot: source data and permissions can change while pages/files are read, and a grant can be revoked after a request completes. Each subsequent protected request uses source authority again. Consumers must refresh and recheck before acting; a stored observation is not a current permission grant.

A successful scan produces `upsert` for new/revised observations and `withdraw` for previously observed records now absent. Withdrawal is deliberately weaker than deletion: a Snapback record can disappear because access was revoked. A deleted record still readable in Snapback is an explicit cleared tombstone. Incomplete/unavailable scans emit no records, old counts or synthetic withdrawals for that source and preserve its previous digest checkpoint. Other available sources can still contribute; their status remains explicit. Failed-source checkpoint metadata stays local and is never used as visible cached content. Recovery rescans and compares against the last successful observation.

## Evidence and next boundary

`tests/views.test.mjs` exercises strict definitions, exact local text, revision/rename/removal, invalid UTF-8/symlink/unavailable-source recovery, checkpoint scoping and corruption, real Snapback RLS, exact structured payloads, tombstones, revocation, identity mismatch, pagination beyond 100 records, a fault injected into the second real-store page, recovery, CLI restart and lock contention. The CLI performs reads only. Existing gateway, draft and browser suites remain separate evidence.

Next, consume a selected view's resolved writing context at the app's entry to composition, with drafts scoped by that view/context and protected from silent audience changes. Build view creation outside the composer. An operator subscription can later reference the same immutable view revision while keeping grants, cursors, claims, context libraries and provenance receipts separate. That is where durable work proposals and bounded autonomy begin; a `request` purpose alone starts no work.
