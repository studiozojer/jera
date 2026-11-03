# Canonical daoUI integration review

This isolated branch is based on social-loop `420937e`. It consumes daoUI canonical Exact source checkpoint `804b73aa`, with the exact revision, toolchain and 106 source/asset hashes in `dao/provenance.json`. No build or runtime source is imported from a sibling daoUI checkout. The canonical library contains 52 components; this consumer deliberately integrates Button, IconButton and Menu without replacing Jera’s routing, data projection or accepted visual direction.

Button owns Post/Cancel/Done behavior and states. IconButton owns post actions, Back and the physical 48/64px floating Write control, with independent glyph sizing. Menu owns the native trigger and expanded state. Tamber params retain Jera’s gold primary action and opaque hover/pressed surfaces. Comment accessible names include direct reply counts. Back/Cancel/Done pass `controlId="back"` to preserve Exact’s native `navigationBack` lookup; native gesture behavior remains unverified.

## Reproduction and evidence

```sh
npm run check:dao-exact
npm run lint
bun foundation/design-preview/exact.mjs verify --shots .exact/dao-review
# After verify completes, serve the isolated preview on an unused port:
bun foundation/design-preview/exact.mjs web --port 4319
JERA_PREVIEW_URL=http://127.0.0.1:4319 bun foundation/design-preview/scripts/review-daoui.mjs
JERA_PREVIEW_URL=http://127.0.0.1:4319 bun foundation/design-preview/scripts/review-threading.cjs
```

The browser script accepts DAOUI_CHROMIUM as an explicit Chromium executable path. It records synthetic captures/assertions under ignored `.exact/daoui-review`. The existing threading script records its independent proof under `.exact/threading-review`. Stop the dev server before Exact verify so they do not compete over backend-origin metadata. The active social-loop port3034 remains separate.

All nine Contract scenarios pass, as do eleven focused browser assertions and the focused-thread browser review. A standalone web build has zero compiler warnings; both build and verify were also run with macOS sandbox-exec denying reads under the entire daoUI repository. The offline receipt checker passes. Lint and a scoped Expo app/tests typecheck pass. The unmodified root typecheck fails at pinned SDK `tooling/exact2/packages/translation/test/web.mjs:68:123` (TS1005, expected comma); it was not narrowed to conceal that finding.

The rendered check retains two ordinary-size menu/Write intersections and fifteen maximum-text intersections with sticky chrome. These remain open consumer calibration findings. In the pinned SDK, the outer verify wrapper exits zero after exploration even when its rendered report contains findings; inspect the report. Lean comparison did not run, no authored invariants were proved, and the exploration omits host-only observations. Neither that exit code nor the browser assertions establish native parity.

Native iOS/macOS/Linux builds, physical-device editing, assistive technology and human acceptance remain unverified. Workspace native builds require EAS. daoUI’s complete inventory, per-family coverage, API and platform limits are in its `exact/docs/`; custom detent pan physics remains an explicit implementation gap there. No active social-loop source or preview port was modified by this integration.
