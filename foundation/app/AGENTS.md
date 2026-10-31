<!-- exact:begin (exact new writes this block; bun exact.mjs update rewrites it) -->
# app: an Exact app

`app.contract` is the view, `app.ts` its data module, `app.test.contract` its tests, `app.json`
the manifest: set its `app.name` and `app.id` before the first build. The app uses the exact2
checkout at `../../tooling/exact2` by path (`EXACT2` overrides it).

This file is already in your instructions. Start from the nearest pattern: `bun exact.mjs
pattern` lists them and `pattern <name>` writes one, tested. ../../tooling/exact2/docs/start-here.md is the guide,
the only required reading (LLP 1115 D7). `bun exact.mjs contract vocab <name>` answers a
name (none: the card, ../../tooling/exact2/docs/card.md); `bun exact.mjs docs <heading words>` a guide's
section. Run `bun exact.mjs verify` when the features work, and `verify ios` once at the end for an iPhone
app. `bun exact.mjs help` lists the verbs, and your own in app.json `"commands"`.
`bun exact.mjs update` refreshes files; `bun exact.mjs lock` repairs Cargo lock drift.
`bun exact.mjs update --without linux` stops shipping Linux.
`bun ../../tooling/exact2/scripts/exact.mjs setup --check` names what a native build lacks.
The authoring diary: `bun exact.mjs feedback status` says whether this project keeps one.
A backend: this app's data is Snapback 4's (../../tooling/exact2/snapback4/README.md). The backend is above it:
`../snapback/schema.q`, with `snapback4@0.4.33` installed. `app.json` mounts the driver and
`../snapback/generated`; `app.ts` names and grants its origin. `bun exact.mjs snapback --rebuild` generates operations
and rebuilds the device, including after exact2 moves; `snapback --port <n>` moves the origin. Start
`bunx snapback4 dev --port <the origin's port>` above before `test web`. `fresh` resets it per test
(Snapback4 0.4.33, dev only; a password-only schema's dev needs `--unsafe-dev-doors` for it). Typed reads use `db.read(api.recent, {}, now)`; `send` writes, syncs and answers
the write's fate. `failure(x).reason` carries a refusal's code. Read the guide before data code.

Generated, so don't edit: `exact.mjs`, `rust-toolchain.toml`, `.cargo/config.toml`,
`Cargo.toml`'s `[patch.crates-io]` and this block.
<!-- exact:end -->

## Jera native verification boundary

The generated SDK advice above is subject to `../AGENTS.md`: native builds use EAS and require explicit approval before spending a build. Do not run `verify ios`, local Xcode, or local native simulator commands. Web verification is prepared with a disposable backend by `test-server.mjs`. See `../README.md` for setup and current limits.
