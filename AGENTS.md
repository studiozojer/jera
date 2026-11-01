# Jera entry point

Jera's current implementation direction is the Exact + Snapback rewrite in `foundation/`. For that work, read `foundation/AGENTS.md` and `foundation/PRODUCT.md`; the Expo-specific guidance below applies to the historical root app. Both local and EAS native build paths are authorized for Jera. Existing ATproto accounts and verified DIDs are required for the rewrite; its currently shipped password login is a known product misalignment. Do not defer ATproto identity because a framework starter supplies another login mechanism.

Read `README.md` and the current design in `../../zojercommons/projects/jera/specs/2026-10-08-composer-and-posts-design.md` when composed. The evolving north star is `../../operators/kepler/athanor/astrology-atproto-north-star.md`. Prioritize typing quality and preserve exact symbol representations. Relative paths resolve from this repo. User content is local-only in the current prototype; do not silently add network publishing or import Kepler’s account credentials.

Use EAS Build for native builds and EAS Simulator for simulator checks. Do not use local Xcode builds or local native simulators. Native typing requires physical-device evidence; web rendering and JS exports cannot establish it.

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `eas build --profile development` in the cloud.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
