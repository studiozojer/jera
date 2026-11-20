# Jera

Jera is an Exact native and web app backed by Snapback. The active application lives in `app/`; shared authentication, storage, gateways and server operations live in [studiozojer/jera-snapback](https://github.com/studiozojer/jera-snapback). Jera and Ansuz are clients of that backend. The obsolete Expo implementation is preserved in Git history before the root-layout cleanup.

The web app is hosted at https://jera.ink and uses https://snapback.jera.ink. Existing ATproto accounts provide verified DID identity. Public and Personal views write posts using the simple `post.v1` application lexicon in Snapback. The default Bluesky view publishes text to the signed-in account’s PDS after a separate create-post consent and explicit submission. Feed text uses freshly authorized Snapback results and cached author labels; updated public names/avatars load through an independent resource, so profile networking does not hold back post content. Read [PRODUCT.md](PRODUCT.md), [RECORDS.md](RECORDS.md) and [PERMISSIONS.md](PERMISSIONS.md) for these boundaries.

## Setup

Use Bun 1.4.2 and Node 22 or newer. Exact is pinned to `4e9000abbdaa8315ae864cdb8253af143aac510c` with the recorded [compatibility patches](patches/README.md). Device compilation requires access to the pinned Exact2 and Snapback SDK sources. The client build uses the generated API in this checkout.

From the repository root:

```sh
git submodule update --init tooling/exact2
(cd tooling/exact2 && bun install --frozen-lockfile)
bun install --frozen-lockfile
(cd app && bun exact.mjs snapback --rebuild --artifact-only)
bun run check
```

The device build generates the WebAssembly engine and its bindings. The client check verifies the device and mounted API version. The checked-in Jera API snapshot comes from the original Jera schema at commit `5157982`, generated with Snapback 0.4.33. Review client contract changes alongside the matching backend release. Local database files, signing credentials and build artifacts are ignored.

## Run

From the repository root:

```sh
bun run web
bun run ios:check
bun run ios:local --phone "hazy's iPhone"
```

`web` serves the real-account client on http://127.0.0.1:3033 against production. That loopback callback is explicitly registered. The native commands forward to the Exact app in `app/`. `expo run:ios` does not build this implementation.

Native builds require Xcode, Rust 1.97.0 with the iOS target, a signing certificate and a profile covering bundle ID `studio.zojer.jera.exact`, the device and Associated Domains. The old wildcard profile lacked that capability. Xcode automatic signing generated a matching explicit profile; the retained app was re-signed, installed and launched on November 9. See [the current checkpoint](CHECKPOINT.md) for signing evidence, retained artifacts and the next work.

The existing custom EAS builder lives in `app/.eas/`, with configuration in `app/eas.json`. Its Expo configuration supplies EAS project/signing metadata only. Paid EAS builds require explicit approval. Native typing and complete real-account acceptance require physical-device evidence.

## Verify

```sh
bun run test
bun run test:app
```

The client suite applies the recorded SDK patches before running. For local integration, clone [jera-snapback](https://github.com/studiozojer/jera-snapback) alongside this repository, then install its dependencies with `npm ci` at its root and `npm ci --prefix auth`. A worktree or alternate layout can set `JERA_BACKEND_DIR` to the backend checkout’s absolute path. The client consumes that checkout only for local server development and integration.

```sh
bun run test:integration
(cd app && bun exact.mjs test web --backend http://127.0.0.1:4457)
```

The real-store view test and simulated-provider browser fixture use disposable stores with the shared schema. For the server suite run `npm test` in jera-snapback. The hosted sign-in check in `tests/hosted-signin.browser.mjs` exercises the deployed browser and real provider discovery without entering credentials.

## Structure

| Directory | Responsibility |
|---|---|
| `app/` | Authenticated Exact UI and native/web builds |
| `snapback/generated/` | Generated client API for Jera’s pinned Snapback release |
| `contracts/` | Immutable lexicons and portable view definitions |
| `views/` | Read-only source adapters and bounded evaluation |
| `scripts/` | Build, packaging, SDK patches and agent CLI |
| `ops/` | Static Jera web release and routing |
| `tests/` | Client, view-integration and browser checks |
| `design-preview/` | Separate synthetic Exact design specimen |
| `tooling/exact2/` | Pinned SDK submodule |

See [web release instructions](ops/README.md), [views](VIEWS.md) for the source contract, and [draft lifecycle](DRAFT-LIFECYCLE.md) for recovery. Dated delivery documents retain earlier states. The two selected definitions govern the app’s Snapback reading, writing and draft contexts; see VIEWS.md. Account-owned view editing and autonomous operators remain follow-up work.

## Startup performance regression

The held-profile browser check uses a separate synthetic real-store preview, with no production credentials or posts. From the repository root, start the fixture with PORT=4477 node app/test-server.mjs, then the preview with EXACT_BACKEND_ORIGIN=http://127.0.0.1:4477 bun app/exact.mjs web --port 3037. Run bun tests/feed-startup.browser.mjs. It holds profile responses while requiring post text to appear, checks cached reload and later name/reply attribution, then exercises failed profiles and logout before late completion. Ports 4477/4478 and 3037 must be available; do not reset another preview's fixture. Stop this task's fixture before Exact test/verify commands, which manage their own disposable store. Existing fixture bindings and account/origin isolation remain explicit.

Operator environments and the bounded reply runner live in [Hearth](https://github.com/studiozojer/hearth). Jera owns the authenticated API and record contracts used by those independent operators.
