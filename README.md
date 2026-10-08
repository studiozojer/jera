# Jera

An Expo SDK 57 prototype for an astrology-coded ATproto app, starting with an excellent typing experience. Named Jera by David on 2026-10-08. Native application identity: `studio.zojer.jera`; deep-link scheme: `jera`. The checkout is `repos/jera`; the linked EAS project is `@studiozojer/jera`.

The first slice is local: a posts feed, native multiline composer, recoverable draft, explicit symbol insertion and family filtering. Sample posts are marked. Add post stores text on the device and opens the first recognized symbol’s feed. It does not publish to Bluesky or another ATproto service. Exact shortcode and Unicode presentation forms are preserved unless the user accepts an insertion.

## Run and check

Use Node 22 and npm. Install with `npm ci`; run `npm start`, `npm run typecheck`, `npm run lint`, `npm test` and `npx expo-doctor`. `npx expo export --platform all` checks JavaScript bundling for iOS, Android and web; it is not a native build or a device test.

`npm run web` is useful for layout and editing smoke tests. Native typing, IME, selection, undo, autocorrect and keyboard motion need a physical-device trial. Symbol insertion uses separate native and web adapters; neither a source review nor a unit test proves their native interaction quality. Ordinary input is native-owned rather than controlled through React on every keystroke.

## EAS and Observe

Project: https://expo.dev/accounts/studiozojer/projects/jera . Observe is installed and configured for startup, per-route readiness and bounded interaction events. No draft text, post text or account credentials are recorded in custom events. Preview and production environments are separate; debug event dispatch stays off by default. Source-map upload is configured for release builds.

Use `npx eas-cli@latest build --platform ios --profile preview` or the Android equivalent after selecting the target device and provisioning signing. Cloud builds only: do not invoke local Xcode or an on-machine native simulator. EAS Observe requires a native build and is unavailable in Expo Go. A linked dashboard and installed library do not establish metrics ingestion. The first iPhone preview attempt stopped before upload because EAS has no suitable internal-distribution signing credentials. The Zojer Studio Apple team currently has no registered iPhone; register the trial device and provision credentials before retrying.

Observe can measure startup and route timings. First edit and symbol acceptance are interaction events, not keystroke-to-display latency measurements. Use physical-device editing trials and native performance profiling alongside p50/p90/p99 route and startup comparisons. See [the device protocol](docs/typing-trial.md).

## Design and provenance

The design lives in [the commons](../../zojercommons/projects/jera/specs/2026-10-08-composer-and-posts-design.md). The [evolving north star](../../operators/kepler/athanor/astrology-atproto-north-star.md) and [Albers exploration](../../operators/kepler/athanor/astrology-composer-albers.md) hold the intent and research.

System fonts and native mechanics are the starting point. daoUI colors are generated and committed with provenance; run `npm run sync-tokens` with `../daoUI` available. EAS consumes only committed generated output. FlashList, automatic shortcode conversion and semantic related-symbol recommendations remain candidates for later comparisons, not measured improvements.

Drafts and local posts use AsyncStorage and are not encrypted. Keep prototype trials synthetic. npm audit currently reports advisories in the SDK’s dependency/tooling tree; its suggested forced fixes include incompatible SDK downgrades. SDK compatibility passes, but this is not a dependency security clearance or release approval.
