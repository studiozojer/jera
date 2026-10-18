# Social shell

The shell provides navigation, post identity, text presentation, search, saved posts, profile and composition. Record adapters supply the content shape. Both built-in adapters and unknown records travel through the same local store; the original record is preserved beside its UI projection. Existing `astrofeed.posts.v1` posts and `astrofeed.draft.v1` drafts remain readable without rewriting their text.

## Try a record

Open Explore → Record playground (or the desktop sidebar). Choose Post, Note or Unknown type. Edit the JSON, inspect the live preview, then Add to local feed. Invalid JSON or missing adapter-required fields disables adding and leaves the input in place. Open a post and select View record to inspect all original fields. Saved posts survive reloads; the profile shows locally authored posts.

`studio.zojer.jera.note` is a provisional UI example, not a published lexicon. It reads `title`, `body` and optional string-array `topics`. The `app.bsky.feed.post` adapter reads `text`; its presence does not imply support for every Bluesky field, facets, embeds, schema validation or network publishing. Unknown `$type` values get a fallback with original fields available for inspection. No arbitrary field guessing.

## Add an adapter

Add a `RecordAdapter` to `recordAdapters` in `src/lib/records.ts`: an exact `type`, `label`, `description`, representative `example`, and `project(record)`. Projection returns `text`, optional `title`, `label` and `tags`; it should throw a clear error when fields needed to render are invalid. The playground examples and feed filters derive from this registry. Feed cards, search and detail use the same projection, so a new text record type needs no screen changes. Preserve source values and unknown fields. For shapes beyond titled text and tags, extend the presentation contract deliberately rather than passing untyped JSON into every screen.

`src/components/Page.tsx`, `ui.tsx`, `PostCard.tsx` and `SocialTabs*` supply the reusable surface. Routes under `src/app/(tabs)` compose these; composer, post detail and playground live above the tabs. `src/lib/storage.tsx` remains the local persistence boundary. A later ATproto client can replace that boundary while retaining record envelopes and the shared presentation layer.

## daoUI boundary

Colors come from `tokens.json` through `sync-tokens.mjs`. `sync-foundation.mjs` reads `DesignTokens.swift`, `type.json` and the three required font files. Generated assets are committed so cloud builds do not need a sibling checkout. The shell maps its text roles to canonical scale entries; the composer retains its explicit larger editing size. Native tab geometry and material are platform-owned; the web adapter supplies sidebar/bottom navigation. Font load failure releases the splash to a system fallback.

## Evidence and limits

Typecheck, lint and nine unit tests cover exact symbol forms, range replacement, old-post compatibility, custom-field retention, projection/search and invalid records. Browser walkthroughs cover phone/desktop layouts, light/dark surfaces, searching custom topics, bookmark save/reload/remove, custom record preview/add/inspection, draft close/recovery/post/clear, and profile membership. JavaScript exports cover iOS, Android and web. These do not establish native keyboard, IME, undo, safe-area or tab-material behavior; the physical-device trial in `typing-trial.md` remains open.
