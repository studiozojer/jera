# Jera foundation

**Product status:** existing-account ATproto OAuth and DID-bound Snapback sessions are implemented; password and guest signup are disabled. David reported successful real-account login on the phone on 2026-11-01; relaunch and private-capture acceptance remain separate. Snapback is the accepted authoritative store for private drafts, shared modules and most initial application data; user input will not be published to ATproto during this phase. Lexicons and PDS storage are deferred while the UX develops. Read [the current product contract](PRODUCT.md) before extending it.

The private backend supports the first Exact + Snapback slice: capture an idea into a module, retain its original wording and provenance, queue organizing work, and let an authenticated operator return attributed context. Multiple armillaries coexist. An armillary's identity is its backend endpoint plus its record ID; there is no assumed universal singleton.

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

The raw development server above exercises storage only. Real sign-in uses the deployed auth service; local browser verification runs its own explicitly simulated provider and isolated backend (`bun exact.mjs verify`). A live web deployment requires explicitly registering its callback and origin with the auth service. For a local UI preview, from `foundation/app`:

```sh
bun exact.mjs web
```

Enter your existing ATproto handle or DID and choose **Continue with ATproto**. Approve access on your provider’s page and return to Jera. The signed-in screen keeps the approved SVG wordmark at the top-left on `bg.base`, with your avatar at the top-right. Press the avatar to open an account sheet containing your avatar, name, handle and a full-width **Log out** button. On iOS, Exact presents a content-sized native sheet with an explicit system grabber in compact widths; the daoUI background extends through its safe area. Tapping outside or swiping down dismisses it. Wider presentations use a modal card; the browser switches to a centered content-sized card at 768px. iOS 26 intentionally floats short native sheets with a small outer inset; this is distinct from the corrected mismatched bottom background. David approved this native inset on 2026-11-01. The header stays quiet while a saved session restores. There are no directory queries, periodic refreshes, loading labels, DID display or refresh controls. The earlier workspace/composer UI is removed at David's request; backend records and existing on-device drafts are preserved. No separate Jera account is created. See [authorization architecture and verification](auth/README.md).

Account presentation comes from Bluesky’s public `app.bsky.actor.getProfile` service, queried with the verified session DID without credentials. A cache scoped to that DID preserves the name and handle offline; if the profile or avatar is unavailable, a quiet initial replaces the photo. Public profile data never establishes identity. Profile lookup runs when the signed-in identity changes, without periodic polling.

The daoUI-to-Exact presentation boundary is explicit: Tamber’s `background` and `Canvas` roles alias `bg.base` so native-owned surfaces agree with authored content. Sheet routes own native detents and grabbers; the app’s web hatch supplies content-sized drawer/card geometry and pointer dismissal. The presence of that page module must not select Snapback’s native device, so the app selects its storage adapter explicitly from the host’s Navigation Timing fact. No SDK source modification is needed.

To repeat the normal-browser panel check, use three terminals with the app’s default loopback backend (no `EXACT_BACKEND_ORIGIN` override): `node test-server.mjs` in `foundation/app`, `bun exact.mjs web --port 3034` there, then `bun ../tests/panel.browser.mjs` there. Use Bun 1.4.2; stop the fixture servers afterwards. This creates fresh browser contexts and a disposable Snapback store, and never uses a personal account.

The development origin is `http://127.0.0.1:4417`. Phone builds bake `https://snapback.jera.ink`; sessions, device partitions and drafts have distinct storage names for each origin. Unknown origins are refused until explicitly configured. A phone cannot reach the laptop through its own loopback address.

## Local browser with live accounts

From `foundation/app`, run `bun run web:live` using Bun 1.4.2, then open `http://127.0.0.1:3033`. This uses the live Snapback backend and real ATproto authorization. The auth service explicitly allows that one loopback callback alongside the native callback. Use the numeric address and fixed port; other origins are not registered. Browser and phone sessions are separate, but the same verified DID accesses the same private backend records. `verify` continues to use its isolated fixture.

## Typography

The Exact view uses the existing Jera pairing: Whyte Book for body text and editing, Whyte Inktrap Regular for headings, and Fraktion Mono for account identifiers, links and status metadata. `app/assets/fonts` contains byte-identical copies of the three source faces in the repository’s root `assets/fonts`; Exact bundles these app-local files for web and native builds. Font sizes retain the platform text styles and accessibility scaling. Native styled buttons retain their platform typography.

## Sign-in design

The sign-in hierarchy follows David's desktop/mobile screenshots: top-left identity, invitation, account entry, then a separated FAQ. `app/app.tamber` vendors the consumed daoUI semantic colors from `daoUI/tokens.json` at `85fb2ac`; `bg.base` aliases `bg/solid/base`, with `tx.secondary` and `tx.warning` retaining their catalog alpha values and light/dark variants. The sign-in field and suggestion handles use Whyte; Fraktion labels the FAQ.

The sign-in action uses David's `#F7B667` accent only for a complete, syntactically valid handle or supported DID. Partial names still search but cannot submit. Local normalization trims whitespace, removes a leading `@`, and lowercases handles; OAuth remains responsible for resolution and verified identity. FAQ links use the same `#F7B667` accent and inline text runs, including “demo of your prompt”. Empty or malformed input uses the supplied disabled glyph in daoUI’s `ic/disabled` (15% alpha).

Suggestions use an anchored, scrollable auto-dismiss popover, so they do not move the FAQ. Escape and outside clicks dismiss it; Down enters the results, arrow keys navigate them, and Enter chooses the focused account without authorizing. The two supplied click glyphs switch with the primary pointer's touch/mouse capability. Public avatars have an initial fallback for missing or failed images. See `app/assets/icons/README.md` for the glyph provenance.

Client auth/search HTTP requests use Exact's `exactTimeout: 15000`. With the pinned SDK, `AbortSignal.timeout()` can calculate fractional remaining milliseconds on the native live clock; the native request decoder requires an integer and rejects the request before networking. A fixed-clock agent drive did not reproduce this. On 2026-11-01, a temporary public-search probe in the signed release reproduced that rejection on the phone; changing to `exactTimeout` made the same release probe succeed. The probe was removed afterward. This verifies native search transport, not complete interactive OAuth acceptance.

At large text sizes, result rows wrap and the popover can flip above its input to fit the viewport. Verification records the intentional opaque popup overlap on the invitation as a scoped exception. Long suggestion handles use an ellipsis; the accessible row label and selected input retain the full handle. The FAQ describes private Jera storage and future operator workflows without claiming protocol publication or a running operator.

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

The CLI accepts JSON from a file or standard input and prints response JSON. Supply `JERA_ORIGIN` and `JERA_TOKEN` through your harness's environment/secret storage. The token is a Snapback session issued after ATproto authorization and bound to the verified DID. It is not a PDS access token; password endpoints are disabled. Dedicated operator account onboarding and CLI sign-in remain separate work. Do not put tokens in committed files or shell arguments.

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
- Existing-account OAuth is implemented and the backend principal is the verified DID. Browser/provider fixtures and real-backend tests pass independently; complete phone authorization remains an explicit acceptance gate. Legacy records are retained without guessed ownership. Cross-backend membership federation remains separate design work.
- The signed-in app is a quiet header and account sheet while the next interface develops. Directory/capture/organizing operations remain available through the backend API and authenticated CLI. The API exposes cursors; callers must handle incomplete pages.
- Module revocation denies subsequent module reads and writes. Previously downloaded content cannot be made unknown to its reader. Armillary directory membership currently remains after a module grant is removed, so the recipient can still see that armillary's name; module contents remain denied.
- Claims last five minutes with no heartbeat extension yet. A worker should release work it cannot finish and reclaim only after expiry. Future long-running code work should use a separate job contract; this task is idea organization.
- Local drafts and Snapback partitions are device storage, not an encrypted vault. The deployed service has nightly snapshots and a tested isolated restore. Password signup is disabled. Auth state is backed up with application state. Remote OAuth revocation is observed during session restore/renewal; see auth/README.md for session custody and offline limitations.

Browser scenarios cover account search/selection, login into the quiet shell, no periodic loading UI after 15 seconds, relaunch, sheet dismissal, logout, wider-card presentation and offline session restoration/logout. The separate normal-browser check in `tests/panel.browser.mjs` exercises popup callback delivery and account switching after navigation, plus drawer geometry, drag cancellation/dismissal and resizing. Unit tests cover profile validation, per-DID caching, offline fallback and unavailable avatars. Capture and access control continue to be covered by the isolated backend tests; the removed composer is no longer an active browser-test journey.
