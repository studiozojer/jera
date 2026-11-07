# Own-posts Public index

David selected this first public-network slice on November 7, 2026: index the logged-in DID’s Bluesky posts, show top-level posts in Public, and retain self-authored continuations. Other people’s replies, likes, reposts, discovery and personalized ranking remain later work. Snapback stores and queries this rebuildable index; the author’s PDS remains authoritative. This changes Public reading. It does not enable ATproto publishing or migrate private records.

## Data and execution

`publicIndexAccounts` registers the authenticated viewer, active/pending generation, source PDS/revision, synchronization state and last successful synchronization time. `publicIndexRecords` retains the AT URI, CID, exact record JSON, text, parent/root references and authored time. SHA-256 URI keys keep Snapback’s inferred composite indexes within its portable key budget; original URIs remain in the records. Rows are available only to that account and the trusted ingestion service. Registration never accepts a client-supplied DID, and clients cannot import or alter network records.

The existing single-process identity service runs `auth/public-index.mjs` once at startup and every minute. This is application ingestion infrastructure, separate from an autonomous operator. Its existing `service:atproto-auth` token remains server-only. It resolves each registered DID through the OAuth SDK’s identity resolver, then reads the discovered PDS without sending account credentials. The pinned ATproto safe-fetch wrapper rejects private network destinations and unsafe redirects. Identity, PDS origin and source record ownership are checked on each scan.

The worker checks account status and repository revision. An unchanged revision/PDS avoids another import. Otherwise it walks the `app.bsky.feed.post` collection into a new generation, verifies that the repository revision/commit stayed unchanged, and atomically publishes that generation only when its staged count matches. A complete empty collection removes deleted posts; confirmed inactive accounts produce an empty generation. Failed pages, malformed records, revision changes and interrupted scans preserve the previous visible generation. Subsequent passes remove obsolete staging generations. A process restart resumes from Snapback’s account registry.

This v1 periodically reconciles a complete collection; it has no relay subscription. Each scan is bounded to 200 pages of 100 records and a two-minute source deadline. A continuously changing or larger repository may remain stale and needs a later ingestion strategy. API reads trust the resolved PDS over HTTPS; this importer does not independently verify repository signatures/MST proofs. Those limits are explicit rather than a claim of complete network synchronization.

## Reader

The Public reader registers the current account on first use, pages roots in groups of 50 and loads its own thread records when a conversation opens. Queries pin every page to the same active generation; a changed generation restarts the read. A failed refresh keeps the last successful displayed feed. Initial synchronization, a completed empty feed and stale/error states remain distinct.

The existing daoUI composition displays exact text, images with alt text and external attachment links. Video and quoted records link to Bluesky. Rich-text facets and unsupported embed fields remain intact in the indexed JSON; inline facet interaction, video playback, moderation/label preference parity and arbitrary lexicon rendering are not established by this first reader. Image delivery currently uses Bluesky’s CDN. The source link identifies the original public record.

Public has no Jera Write/Reply/Delete or engagement controls in this slice. The private composer, audiences, drafts and existing stored records remain in place. Historical Jera-only public posts are preserved in Snapback but are not merged into the new Bluesky feed; legacy public drafts are retained and cannot be accidentally published to ATproto. The broader Public/Permeable/Local experience design remains separate work.

## Operations

The index uses the existing Snapback deployment and its backup/restore mechanism. No additional application database or credential is introduced. Deploy the additive `schema.q` through the documented `ops/install-schema.sh` path with a backup and compatibility check; then stage the updated `auth/` sources and run its locked dependency installation before restarting `jera-atproto-auth`. Its existing token must identify `service:atproto-auth`. The worker retries unavailable storage on the next tick. Promote the client after the schema and worker are serving. Do not run historical resets or destructive migrations.

For local verification, run `bun run check` and `node --test tests/*.test.mjs auth/test/*.test.mjs` from `foundation`, using Bun 1.4.2 and Node 22+. Run `bun exact.mjs verify` from `app`. The normal-browser review uses `node test-server.mjs`, `bun exact.mjs web --port 3039`, then `bun foundation/tests/public-index.browser.mjs` from the repository root. These fixture services use simulated OAuth/PDS responses and a real disposable Snapback store. Captures are ignored under `.local/public-index-review/`; stop those servers afterward.

The implementation was also checked with a read-only scan of the real public `atproto.com` DID into an isolated disposable Snapback store. That establishes the public PDS path, not real-account OAuth acceptance or deployment. Native delivery and account-holder acceptance remain separate; the local signing check requires a certificate/private key and provisioning profile.
