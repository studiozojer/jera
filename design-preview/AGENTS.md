<!-- exact:begin (exact new writes this block; bun exact.mjs update rewrites it) -->
# design-preview: an Exact app

Run `bun exact.mjs --help` first to create `.exact/checkout`; set `EXACT=<checkout>` if needed.

`app.contract` is the view, `app.ts` the data module, `app.test.contract` the tests, `app.json`
the manifest: set `app.name` and `app.id` before building. The app uses Exact at
`.exact/checkout` by path (`EXACT` overrides it).

Start from the nearest pattern: `bun exact.mjs
pattern` lists them and `pattern <name>` writes one, tested. .exact/checkout/docs/start-here-site.md (a site) or
.exact/checkout/docs/start-here.md is the only required reading. `bun exact.mjs contract vocab <name>` answers a
name (none: the card); `bun exact.mjs docs <heading words>` a guide's
section. Run `bun exact.mjs verify` when the features work, and `verify ios|android` at the end for a
phone app. When an iPhone app is ready to try, run `bun exact.mjs share` and send its link;
repeat for each change the person should see. `bun exact.mjs help` lists the verbs, including
app.json's `"commands"`.
`bun exact.mjs update` refreshes files. Native verbs (`ios`, `mac`, `linux`, `android`, `windows`)
name their platform in app.json on first use and build in a generated workspace;
`update --without <platform>` stops shipping it.
`bun .exact/checkout/scripts/exact.mjs setup --check` names what a native build lacks (`--platform ios --device` for a phone's: `share`, `ios --device`).

Generated, so don't edit: `exact.mjs` and this block.

## Feedback (required)

When a doc was wrong or missing, a workaround was needed, something took several tries or a
command confused you, record it: `bun exact.mjs feedback note "<what happened>"`. It attaches
exact2's commit and the last exit code, never output or code. `bun exact.mjs feedback status` says
whether notes are sent and whether to keep a diary; under `never`, skip all of this.
<!-- exact:end -->

## Jera composition scope

This is an isolated synthetic composition preview, not the authenticated production app or the operator runtime. Read README.md and provenance.json; consult the composed daoUI skill and Jera design strata before changing the direction. The preview has no network/auth/storage grants. Do not add real accounts, auto-publish posts or claim seeded operator replies are live. Keep the product app at ../app/ unchanged while calibrating this composition. Browser checks run through verify; native typing and platform presentation remain unverified until separately exercised.

## Experience context

Every Jera design session carries the north star in `../PRODUCT.md`: the lexicon being interacted with influences its UI. Preserve familiar shared structure while allowing context to shape presentation and available operations. Read `EXPERIENCE.md` before changing private/public behavior. The composer control changes the app context, post projection, draft key and navigation return together; it is not a production permission control. Fractal architecture is a conditional lens for reusable contracts, not a requirement to build a recursive framework.
