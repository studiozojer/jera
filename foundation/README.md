# Jera foundation

**Product status:** this build is a working capture/backend prototype, but its separate password login remains misaligned. Existing-account ATproto OAuth and verified DID ownership are required corrective work. Snapback is the accepted authoritative store for private drafts, shared modules and most initial application data; user input will not be published to ATproto during this phase. Lexicons and PDS storage are deferred while the UX develops. Read [the current product contract](PRODUCT.md) before extending it.

Jera's first Exact + Snapback slice: capture an idea into a module, retain its original wording and provenance, queue organizing work, and let an authenticated operator return attributed context. Multiple armillaries coexist. An armillary's identity is its backend endpoint plus its record ID; there is no assumed universal singleton.

The existing Expo application at the repository root remains the historical implementation. New foundation work lives here. The foundation backend is deployed at `https://snapback.jera.ink`. Migration of the Expo screens and an autonomous organizer remain future work.

## Pinned dependencies

- Exact2: `../tooling/exact2` git submodule, revision `4e9000abbdaa8315ae864cdb8253af143aac510c`.
- Native compatibility: [two recorded upstream Swift fixes](patches/README.md), applied automatically by both iPhone build paths to the pinned SDK.
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
cd app
bun exact.mjs snapback --rebuild --artifact-only
cd ..
bun run check
```

The wiring command compiles the Snapback WebAssembly device; the following schema check generates typed backend operations. Both use the pinned dependencies.

Run the backend from `foundation`:

```sh
bun run dev
```

In another terminal, from `foundation/app`:

```sh
bun exact.mjs web
```

The current prototype uses a separate password account to create an armillary/module and capture an idea. This describes the legacy test flow; it is not the accepted Jera onboarding experience. Drafts are saved on this device per account and module. A source link is optional. Unicode and whitespace are preserved as entered. A queued capture remains visible as queued until its receipt is confirmed; **Check delivery** retries the same durable intent. Reloading does not create a new capture intent. Other accounts cannot read the module without membership.

The development origin is `http://127.0.0.1:4417`. Phone builds bake `https://snapback.jera.ink`; sessions, device partitions and drafts have distinct storage names for each origin. Unknown origins are refused until explicitly configured. A phone cannot reach the laptop through its own loopback address.

## iPhone builds: local and EAS

Run these commands from `foundation/app`, using Bun 1.4.2. Both paths build **Exact**, use bundle ID `studio.zojer.jera.exact`, and connect to the deployed backend. The repository-root `expo run:ios` and EAS files build the historical Expo app.

```sh
# Inspect this Mac's toolchain and signing prerequisites.
bun run ios:check

# Compile, sign, install and launch on an unlocked, paired iPhone.
bun run ios:local
# Choose a phone explicitly if more than one is connected:
bun run ios:local --phone "YOUR PHONE NAME"

# Cloud build, using EAS-managed signing (starts a paid build).
bun run ios:cloud
```

Local prerequisites: Xcode with iOS SDK, Rust 1.97.0 (`rustup target add --toolchain 1.97.0 aarch64-apple-ios`), the pinned SDK and foundation dependencies installed as above, and Git access to `expo/snapback`. Install an Apple Development certificate **with its private key**, and a development provisioning profile covering this bundle ID and phone. The phone needs Developer Mode enabled. Exact finds installed credentials; `EXACT_IDENTITY` (certificate SHA-1) and `EXACT_PROFILE` (absolute profile path) override selection. `BUN` may name a Bun 1.4.2 executable if the default Bun is older.

`bun run ios:archive` creates `artifacts/jera.ipa` using explicit `EXACT_IDENTITY` and `EXACT_PROFILE`. For compilation evidence without signing, `node ../scripts/ios.mjs unsigned` builds an **uninstallable** archive at the same path. This is not a device acceptance test.

The [EAS custom build](https://docs.expo.dev/custom-builds/functions/) uses `.eas/build/exact-ios.yml`, not Expo prebuild. It fetches a clean copy of the pinned public Exact submodule, installs the pinned tools, imports EAS credentials into a temporary keychain, builds the Exact archive and uploads it. Signing material is deleted afterward. The EAS macOS image tracks `latest`; Exact, Bun, Rust and Node versions are pinned.

EAS signing was configured on 2026-10-31 for this bundle ID and the registered iPhone “hazy”, using the existing studio distribution certificate. No cloud build was started. For a new phone or future renewal:

1. Register the iPhone with `npx eas-cli@27.2.0 device:create` if it is not already registered.
2. Run `bun run ios:credentials` here to configure signing for **`studio.zojer.jera.exact`**. Credentials for the old Expo bundle ID do not cover it.
Before the first cloud build, create an EAS **preview**, **secret** variable named `JERA_GITHUB_TOKEN` with read-only access to `expo/snapback`. Use `npx eas-cli@27.2.0 env:create --environment preview --name JERA_GITHUB_TOKEN --visibility secret` and its prompt, or the EAS dashboard. Do not paste a token into a command argument or source file. The workflow uses temporary Git askpass credentials for Cargo's private source fetch.

No paid cloud build or physical-phone installation is implied by configuring this workflow. Validate launch, login, capture, relaunch and draft recovery on the actual phone after signing is ready.

Verified on 2026-10-31: a locally signed iPhone archive was produced at `app/artifacts/jera.ipa`; code-signature validation passed, and its receipt contains the production origin and session scope. Exact web verification and backend integration also pass. The signed build was subsequently installed and launched on the physical iPhone, and its process stayed running. In-app authorization, capture and native typing remain unverified; the password screen exposed the identity misalignment described above. EAS configuration, workflow schema and archive contents were checked; a cloud build still needs the source-access secret above and build approval.

## Hosted backend

See [operations](ops/README.md) for paths, backups, deployment and restoration. Snapback runs on the Jera PDS VPS as its own unprivileged systemd service, behind Caddy HTTPS. Stjerneborg is the selected operator host; no operator scheduler has been installed there yet. An operator uses `JERA_ORIGIN=https://snapback.jera.ink` and its own account session, with write membership in the modules it organizes. A local coding harness can query the same API later.

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

Never enable development doors for a shared or production service. Native build/typing/performance evidence is separate. Local and EAS build paths are documented above. Paid EAS builds require explicit approval. Browser verification does not establish native readiness.

## Current boundaries

- No ATproto publication, Spaces integration, GitHub synchronization or automated AI processing is present. Publication and protocol storage are explicitly deferred; private data lives authoritatively in Snapback. Existing-account ATproto identity is required now. A running organizer remains future work.
- Password identity is an implementation defect relative to Jera’s requirements. Replace it with existing-account authorization and verified DID binding, preserving any real data deliberately. Cross-backend membership federation remains separate design work.
- The screen shows bounded pages (50 ideas/nodes/tasks). It labels incomplete results; the API exposes cursors. Device replication retains the latest 500 artifacts/nodes per module. It is not a complete offline archive.
- Module revocation denies subsequent module reads and writes. Previously downloaded content cannot be made unknown to its reader. Armillary directory membership currently remains after a module grant is removed, so the recipient can still see that armillary's name; module contents remain denied.
- Claims last five minutes with no heartbeat extension yet. A worker should release work it cannot finish and reclaim only after expiry. Future long-running code work should use a separate job contract; this task is idea organization.
- Local drafts and Snapback partitions are device storage, not an encrypted vault. The deployed service has nightly snapshots and a tested isolated restore. The current separate password signup is being retired as a product direction; adding password recovery would deepen the wrong account model. Verified ATproto identity and its session boundary are required next.
