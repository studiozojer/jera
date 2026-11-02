# Jera composition preview

An isolated Exact preview for judging a quiet stream, focused composer and recognizable thread. The production sign-in/account app at `../app/` is unchanged. The Preview label and sample conversation label distinguish the fixtures from live operator work.

The shared header keeps Write and the account entry in the same place across the stream and thread. Read the seeded Kepler conversation, write a new post, or reply in a thread. Cancel retains the relevant draft; new-post and per-thread reply drafts remain separate. The composer uses the caret and text selection without a surrounding focus ring, following David’s preference for a quieter writing surface. Exact Unicode text is retained. Posts, replies and drafts live only for the mounted preview and reset on reload. Seeded operator replies are authored fixtures; typing an @mention does not call an operator.

## Run and review

Use the repository's pinned Exact submodule and Bun 1.4.2. Set `BUN` to that binary if the default Bun is older. From this directory, run `bun exact.mjs web --port 3034` for the interactive preview, and `bun exact.mjs verify` for the browser workflow/layout pass. The app has a separate identity, no capabilities or external data sources, and requires no backend or production credentials.

Review the stream, composing, cancel/reopen and post/reply path at phone and desktop widths. Inspect the ordinary and enlarged text results, not just the passing interactions. Native keyboard, IME, safe-area paint, sheet gestures, assistive focus and physical-device feel remain separate work. Do not run the SDK-wide prove matrix. The actual Snapback post/independent-operator reply proof remains to be implemented after composition calibration; this preview does not settle thread audience or operator runtime architecture.

## Design ownership

`dao.contract` is an initial Exact expression of daoUI's named type ramp, spacing, radii and touch target, and `app.tamber` retains the existing Jera mapping of canonical colors plus David's approved gold action accent. Scalable text insets accommodate the browser font ink while retaining canonical font size and leading. `post.contract` owns author anatomy and the preview record shape; `chrome.contract` owns shared app chrome. These are local candidates to examine through use, not a claim that a complete Exact daoUI library already exists. `provenance.json` records source revisions, copied font/brand hashes and deliberate local expression.

The current product direction, original conversation, Albers process reflection and design strata live in the composed commons under `projects/jera/` and `projects/daoui/`. Discover the actual composition binding rather than assuming a worktree resolves the main checkout's sibling paths. Keep future UI corrections connected to that intent and return reusable changes to daoUI when use warrants it.
