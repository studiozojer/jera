# Jera

An Expo SDK 57 text-social app shell for trying custom ATproto record shapes. It uses daoUI typography, layout tokens and semantic colors, with native tabs on mobile and responsive navigation on web. Named Jera by David on 2026-10-08. Native application identity: `studio.zojer.jera`; deep-link scheme: `jera`. The checkout is `repos/jera`; the linked EAS project is `@studiozojer/jera`.

The shell is local: Feed, Explore, Saved, Profile, a native multiline composer with recoverable drafts, and a shared post view. Search covers authors, projected text, titles and topics. Bookmarks persist across restarts. Sample posts are marked. Symbol assistance (zodiac, planets, minor bodies and runes) is optional in the composer; enabling it keeps the original first-symbol feed-filter experiment. Exact shortcode and Unicode presentation forms remain intact unless the user accepts an insertion.

Open **Explore → Record playground** to edit an example or paste JSON, preview its feed card, and add it locally. `$type` selects a small display adapter. Ordinary `app.bsky.feed.post` and an experimental `studio.zojer.jera.note` demonstrate two shapes; unknown types retain their fields behind a fallback card. These are rendering experiments, not full ATproto schema validation or network publishing. See [the extension guide](docs/social-shell.md).

The [symbol font integration](docs/symbol-font.md) brings the carved runes and Kairos-style astrology into the composer and posts, with exact Unicode text preserved.

The [reading and writing foundation](docs/design-foundation.md) adds shared daoUI controls, a refined stream composition, a retained card alternative and a repeatable browser review.

## Run and check

Use Node 22 and npm. Install with `npm ci`; run `npm start`, `npm run typecheck`, `npm run lint`, `npm test` and `npx expo-doctor`. `npx expo export --platform all` checks JavaScript bundling for iOS, Android and web; it is not a native build or a device test.

`npm run web` is useful for layout and editing smoke tests. Native typing, IME, selection, undo, autocorrect and keyboard motion need a physical-device trial. Symbol insertion uses separate native and web adapters; neither a source review nor a unit test proves their native interaction quality. Ordinary input is native-owned rather than controlled through React on every keystroke.

## EAS and Observe

Project: https://expo.dev/accounts/studiozojer/projects/jera . Observe is installed and configured for startup, per-route readiness and bounded interaction events. No draft text, post text or account credentials are recorded in custom events. Preview and production environments are separate; debug event dispatch stays off by default. Source-map upload is configured for release builds.

Use `npx eas-cli@latest build --platform ios --profile preview` or the Android equivalent after selecting the target device and provisioning signing. Cloud builds only: do not invoke local Xcode or an on-machine native simulator. EAS Observe requires a native build and is unavailable in Expo Go. A linked dashboard and installed library do not establish metrics ingestion. An iPhone preview completed on October 8, 2026 ([build record](https://expo.dev/accounts/studiozojer/projects/jera/builds/033ff131-e1ba-4057-9ee6-3a2af72a19ba)). On October 18, EAS confirmed the enabled iPhone “hazy” under the existing Zojer Studio Apple team. This supersedes the earlier signing-blocker note; it does not establish native typing acceptance.

Observe can measure startup and route timings. First edit and symbol acceptance are interaction events, not keystroke-to-display latency measurements. Use physical-device editing trials and native performance profiling alongside p50/p90/p99 route and startup comparisons. See [the device protocol](docs/typing-trial.md).

## Design and provenance

The design lives in [the commons](../../zojercommons/projects/jera/specs/2026-10-08-composer-and-posts-design.md). The [evolving north star](../../operators/kepler/athanor/astrology-atproto-north-star.md) and [Albers exploration](../../operators/kepler/athanor/astrology-composer-albers.md) hold the intent and research.

daoUI colors, layout tokens, the canonical type scale, and Whyte/Inktrap/Fraktion fonts are generated and committed with provenance; run `npm run sync-tokens` and `npm run sync-foundation` with `../daoUI` available. EAS consumes only committed output. Platform navigation and ordinary native editing supply the mechanics. FlashList, automatic shortcode conversion and semantic related-symbol recommendations remain candidates for later comparisons, not measured improvements.

Drafts and local posts use AsyncStorage and are not encrypted. Keep prototype trials synthetic. npm audit currently reports advisories in the SDK’s dependency/tooling tree; its suggested forced fixes include incompatible SDK downgrades. SDK compatibility passes, but this is not a dependency security clearance or release approval.
