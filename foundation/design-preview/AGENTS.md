<!-- exact:begin (exact new writes this block; bun exact.mjs update rewrites it) -->
# design-preview: an Exact app

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
Shared data: `exact new <path> --snapback`, or `bun exact.mjs snapback` here.
Install `snapback4@0.4.33` above; ../../tooling/exact2/snapback4/README.md has setup and server commands.

Generated, so don't edit: `exact.mjs`, `rust-toolchain.toml`, `.cargo/config.toml`,
`Cargo.toml`'s `[patch.crates-io]` and this block.
<!-- exact:end -->

## Jera composition scope

This is an isolated synthetic composition preview, not the authenticated production app or the operator runtime. Read README.md and provenance.json; consult the composed daoUI skill and Jera design strata before changing the direction. The preview has no network/auth/storage grants. Do not add real accounts, auto-publish posts or claim seeded operator replies are live. Keep the product app at ../app/ unchanged while calibrating this composition. Browser checks run through verify; native typing and platform presentation remain unverified until separately exercised.
