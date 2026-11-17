# Jera checkpoint — November 10, 2026

The released baseline is main 1d5699538c987a2e7e3c0d98746548239e796e9b, merged PR #11. Public / Personal tabs select definitions governing Snapback reading, writing and draft context. That revision is live at https://jera.ink and installed/launched on hazy's iPhone. The composed commons' projects/jera/checkpoints/2026-11-09-selected-view-release.md owns the release handoff; older November 9 checkpoints retain historical states.

## Feed startup fix — feature branch, not released

Branch feat/feed-startup is based on that released main. David reports that headers appear before posts on both web and mobile and authorizes fixing the confirmed public-profile dependency. loadPosts now reads authorized records/audiences and cache-only author presentation, without waiting on profile networking. An explicit independent Exact resource refreshes other authors, while the existing account-profile resource refreshes the viewer. Derived posts update names/avatars/parent attribution by DID while preserving body, IDs, permissions, thread links and draft state. Cache misses or failed profile calls leave DID-based fallbacks. Account/view guards reject stale account results.

The forced ATproto authorization refresh, backend RLS, publication gateway, schema and deployed data are unchanged. This does not add an offline cached-private-feed display or detached native background promises. Public metadata cache entries remain DID-validated; handles and avatars do not establish authority. An extra explicit loopback fixture binding on 4477 isolates this work from running previews.

Controlled browser comparison against real local Snapback with synthetic profile transport: with a three-second profile delay, first-post time fell from 3392ms to 153ms. The deliberately delayed authorization case remains about 3.39s, confirming that boundary was preserved. These are local reproduction measurements, not production or native speed guarantees. The separate held-profile regression checks cold/warm post display before profile completion, later name/reply attribution, failed lookups and logout before late completion.

Verification: 35 backend/auth/cache tests, 38 app tests (167 assertions), nine Exact browser workflows and the held-profile regression pass. Final Exact web verification passes ordinary phone/desktop layout and reload checks; it reports the same 25 largest-text layout findings and three source typography findings as the released baseline. They remain open, not waived. The synchronous oracle skips fresh-dependent workflows and Lean semantics did not run. Native prerequisites pass; this fix has not been natively built, installed or deployed.

Evidence in this worktree: .local/feed-startup/ contains the held-profile screenshots, browser-regression.json, controlled measurements.json, test logs and verification report. The diagnostic baseline and investigation are in the primary checkout's .local/feed-startup/ and the commons' projects/jera/reviews/2026-11-09-feed-startup.md. Use Bun 1.4.2; README.md documents the independent browser check. Existing previews remain separate.

## Released baseline and operations

Public means readable by signed-in Jera accounts. Personal writes to the existing shared private audience, with server-enforced DID membership and parent inheritance. This is hosted access control, not end-to-end encryption. Drafts are owner-only. ATproto supplies verified DID identity; no ATproto publication is enabled. Existing posts remain unchanged.

The live web artifact is /opt/jera-web/releases/1d5699538c987a2e7e3c0d98746548239e796e9b on 91.98.204.141. The previous b89fa594d1eea48b75284f29c0ff51e9b3ed14e0 artifact remains for rollback. Production schema generation 7 did not change during that release; schema SHA-256 is 35efd7061e37a3f865a5c86e26ebd10851dfbedb916d90c5b6129486cff263b1. Hosted sign-in/callback/CORS/refusal/provider handoff and API/PDS health passed without account consent or production test posts.

The prior released phone app, profile and receipts are retained in the primary checkout's .local/release-1d56995/. It installed/launched at 23:07 Pacific on November 9 as studio.zojer.jera.exact. Static version/build labels 0.1.0/1 do not identify source freshness. The older .local/phone-release-current/Jera.app contains the preceding release and remains preserved.

Exact stays pinned to 4e9000abbdaa8315ae864cdb8253af143aac510c with the same three recorded compatibility patches: AudioSession.swift, TintDimmingIOS.swift and host/web/auth-glue.js. Do not discard or stage SDK contents. For the primary checkout's retained native caches, use the canonical CARGO_TARGET_DIR at foundation/app/target; the app/target alias alone caused a source-provenance mismatch after compilation. The valid explicit signing profile covers Associated Domains; preflight its device, expiry and capabilities before a long build. Worktrees need isolated build targets. See ops/README.md and the commons' EF-005 record; no SDK source workaround was added.

## Next

Review/merge this bounded startup fix, then explicitly release it to web/phone. Verify the real account's post/read/reply/delete/reload, draft recovery and sharing/revocation journeys; native keyboard/IME/accessibility and largest-text findings remain separate acceptance work.

The full view editor is deferred by David's agreement until a concrete need appears. Its future Settings entry belongs on the profile/account sheet. The next product proof after acceptance remains an independently authenticated operator with explicit context, mandate, durable delivery/claims, attributable reply and linked provenance receipt. Tool-assisted autonomy, ranking/firehose ingestion, cross-device folder sync and operator VMs remain later work.

## Tycho response vessel — November 13, 2026

Branch `feat/tycho-worker`, PR https://github.com/studiozojer/jera/pull/13, adds the manually targeted, review-gated runner under `scripts/operator/`. No app, production schema or phone release changes. The two Bellhouse PRs were merged together at `dc18abc`; the laptop installation includes both controls and upstream cron locks/timeouts.

Tycho has completed real Jera OAuth as `did:plc:ynouwsusgwwgnalvg5ms2kmo`. Its own session can read `01M7A0ZRT8S0AG58WWTMM7KDAR` and its selected graph notes in the local `operators` VM. Credential values stay outside Git. The root-owned guest release `/opt/jera-operator/dda264e` is selected by `/opt/jera-operator/current`. A manual systemd oneshot runs as `tycho`, with no timer or boot activation. Bellhouse reports the configured operator paused.

The first draft attempt is held in `/home/tycho/state/jera-replies/reply.sqlite`: OpenCode returned HTTP 401, `This API key has expired`. No model answer or Jera post was created. David was asked to replace the key in OpenCode Console and update this laptop's OpenCode credential, without pasting it into chat. Transfer only the `opencode` credential entry privately to Tycho. Inspect and preserve the held attempt before explicitly retrying; repeated triggers do not automatically spend again. The saved Jera session lasts one day; renew via ordinary OAuth if expired, never privileged session minting.

First response remains subject to David's review. Publication requires the saved envelope hash, rechecks source access, reuses its persisted intent and verifies the result. Full interactive Tycho boot, autonomous mention polling, per-operator enable/pause controls, graph synchronization and off-machine restore-tested backup remain later work. The current bounded vessel loads identity and selected notes, and denies model tools.

Validation: real isolated Snapback contract test includes operator parent-audience inheritance, DID attribution, intent reuse and revocation; six OAuth tests pass; a separate-process Bun test verifies durable holds and review-hash refusal. Guest service verification and an actual repeated trigger retain the held job without another model request. No browser/UI change requiring a new app build.
