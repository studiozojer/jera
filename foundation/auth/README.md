# Jera account authorization

Jera uses existing ATproto accounts. The native app accepts a handle or DID and opens its system authentication browser. The official `@atproto/oauth-client-node` SDK resolves the account, performs PAR/PKCE/DPoP and verifies the returned subject. Only `atproto` identity scope is requested; this service does not publish input or request collection access.

The server issues a Snapback session whose principal is the verified DID. There is no email mapping, new user table, password signup or guest login. Snapback remains the authoritative private application store.

## Account discovery

The sign-in field offers suggestions after two characters and a 250 ms pause. `/oauth/accounts` combines Bluesky's public `app.bsky.actor.searchActorsTypeahead` index with a small cached directory of public accounts on `JERA_PDS_ORIGIN` (default `https://pds.jera.ink`). Search text is sent to Bluesky; this does not send drafts or authenticate an account. There is no separate network indexer or persistent account table.

Local discovery uses public `listRepos`, `describeRepo`, and optional Bluesky profile records. It follows up to five pages of 100 repositories with bounded concurrency and a 12-second deadline. Successful local scans are cached for five minutes; partial scans and failures retry after 30 seconds. Bluesky results have a bounded 30-second cache. Local matches appear first, with duplicates removed by DID. Suggestions are rate limited and capped at eight; outages and incomplete results retain manual entry.

These sources are not a complete ATproto directory. Full handles and DIDs from other PDSes remain valid sign-in inputs even when absent from search. Selecting a suggestion only fills the handle; the official OAuth client still resolves and verifies identity before any session is issued.

## Handoff and session custody

The app prepares a random verifier and state in its secret store. The browser receives only the verifier's SHA-256 challenge. The server binds authorization to a short-lived flow and a browser cookie, then returns a one-time code through Exact's declared callback. Exchanging that code requires the original device verifier. The flow is consumed before minting; a lost exchange response requires starting sign-in again. Callback targets are explicitly allowlisted. Tokens never appear in callback URLs.

OAuth state and sessions are stored in a private SQLite database; signing keys and the Snapback service token stay in `/var/lib/jera-snapback/auth`. The service is a single process with an explicit local SDK refresh lock. Do not scale it to multiple processes without a shared lock. Public metadata is `/oauth/client-metadata.json`, public signing keys `/oauth/jwks.json`; Caddy routes these and `/auth/refresh` to the loopback auth service.

Session restore and renewal check the Snapback bearer and refresh the underlying OAuth authority. Definite OAuth revocation revokes that DID's Snapback sessions; transient network failure preserves local drafts. Already-issued backend sessions are not continuously checked against the PDS on every mutation: remote revocation is observed on restore/renewal. Normal sign-out revokes the device's Snapback session and retires its local replica. It does not revoke other devices' shared OAuth authority. Offline sign-out clears local access but cannot confirm remote revocation.

App secrets, replica partitions and drafts are scoped by endpoint and DID. The new `atproto-v1` key namespace does not load old password credentials. Old local files and backend records are retained; no email-to-DID ownership guess or automatic deletion occurs.

## Operations and evidence

Node 22.13+ is required; production uses its isolated Node 24.11.0 runtime. Install dependencies with `npm ci --ignore-scripts`. `../ops/install-auth.sh` backs up the existing deployment, adopts the schema, preserves records, retires legacy sessions and starts the unprivileged service. The dependency tree belongs to that service account and retains restrictive permissions. Source archives made on macOS must exclude AppleDouble metadata (`COPYFILE_DISABLE=1 tar --no-xattrs ...`).

`node --test test/*.test.mjs` checks forged callbacks, browser/device mismatch, replay, expiration, origin restrictions and revocation handling. Its OAuth client is explicitly simulated. `../tests/backend.test.mjs` uses a real isolated Snapback store and trusted fixture DID principals. Exact browser scenarios simulate the provider and use that real backend. None of these substitute for approving a real account on the phone.

Production discovery/PAR has reached the real Bluesky authorization UI using Jera's published metadata. Full phone authorization, callback completion, verified ownership and relaunch still require the account holder's interactive sign-in. No PDS content is written by these checks.
