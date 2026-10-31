# Jera foundation

Jera's first Exact + Snapback slice: capture an idea into a module, retain its original wording and provenance, queue organizing work, and let an authenticated operator return attributed context. Multiple armillaries coexist. An armillary's identity is its backend endpoint plus its record ID; there is no assumed universal singleton.

The existing Expo application at the repository root remains the historical implementation. New foundation work lives here. This is a development foundation, not a deployed service or a finished migration of the Expo screens.

## Pinned dependencies

- Exact2: `../tooling/exact2` git submodule, revision `4e9000abbdaa8315ae864cdb8253af143aac510c`.
- Snapback server: `snapback4@0.4.33` in `package.json` and `bun.lock`, matching Exact's device engine.
- Bun: `1.4.2`. Node 22 runs the agent CLI and backend integration test.
- The SDK's native/device Rust dependencies require access to Expo's private Snapback repository. A plain public checkout alone is insufficient. No secrets are checked in.

From the repository root:

```sh
git submodule update --init tooling/exact2
cd tooling/exact2
bun install --frozen-lockfile
cd ../../foundation
bun install --frozen-lockfile
bun run check
cd app
bun exact.mjs snapback --port 4417
```

The first wiring command compiles the Snapback WebAssembly device. It generates the typed backend operations and uses the pinned SDK, not whatever checkout happens to be beside this repository.

Run the backend from `foundation`:

```sh
bun run dev
```

In another terminal, from `foundation/app`:

```sh
bun exact.mjs web
```

Create an account, create an armillary and module, then capture an idea. Drafts are saved on this device per account and module. A source link is optional. Unicode and whitespace are preserved as entered. A queued capture remains visible as queued until its receipt is confirmed; **Check delivery** retries the same durable intent. Reloading does not create a new capture intent. Other accounts cannot read the module without membership.

The development origin is `http://127.0.0.1:4417`. Before using another origin, change both `origin` and the origin-specific `sessionKey` in `app/app.ts`, update the corresponding Exact backend override, and rebuild. Never reuse a session key between services. A phone needs a reachable HTTPS service; loopback points at the phone itself.

## Data and operator contract

| Record | Meaning |
| --- | --- |
| `armillaries` | A named shared context owned by a principal |
| `modules` / `members` | A module's audience; principals have read or write access |
| `artifacts` | Immutable source text, optional source URL, author and creation time |
| `tasks` | One organizing task per captured artifact, with an exclusive five-minute claim |
| `nodes` | An operator's attributed synthesis linked to the original artifact |
| `edges` | Attributed relationships between nodes, with a written reason |

Capturing the artifact and enqueueing its task are one transaction. A synthesis does not replace its source or turn a fragment into a commitment. A worker claims a task, reads its original artifact, and completes it with a title and synthesis. Concurrent claimants cannot both win. Expired claims can be reclaimed after a worker disappears; completion requires the current, unexpired claim. A worker can explicitly release its claim. This slice creates one synthesis node per source and links nodes within the same module.

Human and operator accounts use the same API and module rules. The module owner grants `read` or `write` with `setMember`, and revokes access with `removeMember`. Writers can capture and organize; only the owner manages membership. There is no bespoke capability engine or model-specific tool protocol. An actual model worker/scheduler is not included or running yet.

Queries are authenticated `POST /q/<name>` with `{ "args": { ... } }`. Mutations are `POST /m/<name>` with `{ "id": "<stable 26-character intent ID>", "args": { ... } }`. Keep the same ID and arguments when retrying an ambiguous mutation. HTTP 200 can contain a refused mutation (`state: "failed"`); the included client checks the envelope, not just the status code.

The CLI accepts JSON from a file or standard input and prints response JSON. Supply `JERA_ORIGIN` and `JERA_TOKEN` through your harness's environment/secret storage. The token is a Snapback password session issued by `/auth/login` or `/auth/signup`, not an ATproto session. Do not put tokens in committed files or shell arguments.

```sh
node scripts/agent.mjs query armillariesList empty.json
node scripts/agent.mjs query modulesList armillary.json
node scripts/agent.mjs query tasksList module.json
node scripts/agent.mjs mutate claim claim.json
node scripts/agent.mjs query artifactsList module.json
node scripts/agent.mjs mutate complete synthesis.json
node scripts/agent.mjs query nodesList module.json
node scripts/agent.mjs mutate connect connection.json
```

Example argument files:

```json
{"armillary":"ARMILLARY_ID"}
```

```json
{"module":"MODULE_ID"}
```

```json
{"task":"TASK_ID"}
```

```json
{"task":"TASK_ID","title":"A possible direction","body":"An attributed synthesis, preserving uncertainty."}
```

The CLI prints an `intent-id` on stderr **before sending**. Retain it and pass it as the last argument when retrying. Paginate queries with the response's `next` cursor in argument `c`; do not infer that a bounded page contains all records. Query `tasksList` across pages to find pending or expired claims. The schema and generated `snapback/generated/api.ts` are the authoritative operation signatures.

## Verification

From `foundation`, `bun run check` compiles the schema and `bun test` is **not** the test command: use `bun run test` (Node's test runner). The integration test starts an isolated real Snapback server on a temporary port and deletes its temporary store afterward. It covers account/module isolation, read-only members, exact Unicode, idempotent writes, concurrent claims, revocation, persistence, lease recovery and graph edges.

Browser tests automatically start and stop a real, disposable Snapback server through `app/test-server.mjs`. It uses `--fresh`, so its store disappears when the process ends. Stop the normal development server on port 4417 first; the harness refuses to take over an occupied port. From `foundation/app`:

```sh
bun exact.mjs test web
bun exact.mjs verify
```

The test file's `fresh` resets only this managed test server between scenarios. Registering the server also keeps Exact's normal and large-text tours sequential, so one tour cannot reset another tour's accounts.

Never enable development doors for a shared or production service. Native build/typing/performance evidence is separate: use EAS, with explicit approval for a build. Do not run the SDK's local native build/simulator commands. Browser verification does not establish native readiness.

## Current boundaries

- No ATproto publication, Spaces integration, GitHub synchronization, deployment, or automated AI processing is present. These will be adapters to this data and work contract, not prerequisites for capturing ideas.
- Password identity is the foundation's temporary identity mechanism. ATproto DIDs/account linking and membership federation across independent backends remain design work.
- The screen shows bounded pages (50 ideas/nodes/tasks). It labels incomplete results; the API exposes cursors. Device replication retains the latest 500 artifacts/nodes per module. It is not a complete offline archive.
- Module revocation denies subsequent module reads and writes. Previously downloaded content cannot be made unknown to its reader. Armillary directory membership currently remains after a module grant is removed, so the recipient can still see that armillary's name; module contents remain denied.
- Claims last five minutes with no heartbeat extension yet. A worker should release work it cannot finish and reclaim only after expiry. Future long-running code work should use a separate job contract; this task is idea organization.
- Local drafts and Snapback partitions are device storage, not an encrypted vault. Server backup, recovery operations, migrations and production authentication policy need a deployment pass.
