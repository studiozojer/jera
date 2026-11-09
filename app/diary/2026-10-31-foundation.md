# Jera foundation — 2026-10-31

SDK: Exact2 `4e9000abbdaa8315ae864cdb8253af143aac510c`; Snapback4 `0.4.33`; Bun `1.4.2`.

Implemented a password-authenticated Exact client over the full Snapback device: multiple armillaries, permissioned modules, immutable source capture, draft recovery, durable capture intent, and a view of organizing work and derived context. A Node CLI exposes the same authenticated operations to any operator harness. Native adapter wiring follows the pinned SDK's Harmony example; it has not been built or driven natively.

## Evidence

- `snapback4 check`: passed. Remaining advisory notes are documented below.
- `node --test tests/backend.test.mjs` from the parent: passed against a real isolated, persisted Snapback server. The test includes four accounts, two armillaries, Unicode/whitespace preservation, replay idempotency, simultaneous claims, read-only access, revocation/regrant, restart, expired-lease reclaim, attributed synthesis and graph links.
- `bun exact.mjs verify`: **verify: clean**, two browser integration scenarios passed, light/dark at 390×844 and 1280×900, reload/relaunch checks, and large-text tour without spills. Screenshots inspected. The supplemental synchronous oracle skips the authored integration scenarios at `fresh`; it does not prove network or reload behavior. Those are exercised by the actual browser runner.
- No deployment, ATproto publication, AI worker execution, EAS build, or physical-device test was performed.

## Useful friction

Contract children may own form state but not resources or mutations. Keep mutations at the root and pass actions into a child editor. Action arguments observe state from the start of the action: saving the input's new value must pass the event argument, not the state just assigned. Draft files are scoped by endpoint/account/module, serialized, and atomically replaced; a submitted draft retains its capture intent through a lost reply and reload.

Snapback rejects mutations in an HTTP 200 envelope too (`state: "failed"`). The raw harness client must inspect that envelope. An owner's grant lookup must be able to read an existing grant before `if absent` can safely support regrant; the initial armillary grant rule lacked that visibility and the integration test caught it.

Exact's unregistered-backend verification ran the normal and large-text tours concurrently; their `fresh` resets invalidated each other's sessions. Registering a managed disposable test server makes the tours sequential and avoids touching a developer's normal store. The launcher uses Snapback's `--fresh` and closes with the harness.

Offline directory availability is explicit in its answer, rather than masquerading as an empty directory. Actual permission denials still fail. A resource invalidated by sign-out can briefly retain the old principal argument; local draft loading returns an unauthenticated placeholder in that case and never reads another account's file. Session-owned UI is hidden during session restoration or failure.

## Reviewed schema advisories

Membership upserts carry original immutable values from the parent module. Recipient membership is an explicit owner grant; there is no additional role hierarchy. Capture's module reference is admitted only through write membership; there is no module-delete operation in this slice. The membership query's completeness can be partial, so clients do not claim an exhaustive list. Online-only queries and bounded replication are deliberate. See the parent README for retained armillary-directory grants after module revocation and other current limits.

A reload returns to the armillary directory; the selected module is navigation state, not durable data. Drafts, captures and accounts persist and the tests reopen the relevant module to prove that distinction.
