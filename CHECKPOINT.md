# Jera checkpoint — November 9, 2026

Resume from `main`. The application and release work through PRs #6–#9 is merged; `a9b4e5d` anchors the root-layout cleanup. Current Jera uses Exact + Snapback. The obsolete root Expo implementation was removed and remains in Git history. The authenticated UI is in `app/`; contracts, auth, schema, scripts, tests and operations are at the repository root.

## Selected-view implementation — November 9, in review

The isolated `feat/selected-views` branch implements Public / Personal feed tabs and consumes the selected authored definition for Snapback selection/grouping, new-writing policy and per-view draft context. `private` stays the stable Personal ID and server visibility term. The previous compact switch remains an unused specimen. The composer inherits context and has no view selector. Existing posts are untouched, default root drafts keep their keys, Personal replies keep the legacy key and Public replies have an isolated branch. Recognized old Public reply drafts retain their originals during adoption. Writing-policy changes preserve incompatible drafts; already-sealed intents retry their original payload/scope even if the new binding is unavailable.

The feature is not deployed or installed. View editing/renaming/pinning/ordering remains the next settings increment; David places the future Settings entry button on the profile/account sheet. `VIEWS.md` describes the implemented boundary, source availability and saved-context behavior. Current app integration binds Snapback only; the host-local folder adapter remains CLI work.

Verification: 34 real-store backend/auth tests, 38 app tests (167 assertions), and all nine Exact browser workflows pass. `verify web --backend http://127.0.0.1:4457` also passes those workflows, ordinary-size checks and reload checks. Its largest-text pass reports 25 layout findings, including thread controls and sticky-header/tab boundaries, plus three source-level typography findings (one in the deliberately retained switch specimen). These are retained, not waived or represented as a clean accessibility pass. The synchronous oracle skips the `fresh`-dependent workflows and Lean semantics did not run; actual browser/backend execution is the evidence. Native prerequisites pass; there is no new native build or device-acceptance claim. Local screenshots/logs are retained in `.local/selected-views/` and `app/.exact/verify/` within that worktree.

## Shipped and installed

- https://jera.ink serves the web app; www redirects to the root. DNS and normal root-domain certificate verification passed. The API remains https://snapback.jera.ink on `91.98.204.141`; PDS health was preserved.
- Production schema generation 7 provides trusted versioned publication. Both default Public and Private contexts write body-only `post.v1`; historical untyped records retain their original meaning. Actual rollout preserved all original fields in all 59 existing application records. Backups and the isolated restore/adoption checks passed.
- Public means readable by signed-in Jera accounts. Private posts are hosted in Snapback and restricted by audience ownership/membership. Drafts are account-private, with local recovery and Snapback syncing. This is server-enforced access, not end-to-end encryption. No ATproto publication is enabled.
- The iPhone update installed and launched successfully on hazy’s iPhone at 08:33 Pacific on November 9. It uses `studio.zojer.jera.exact`. Version 0.1.0/build 1 are static labels, not source identifiers. The retained compiled November 8 app was re-signed with a new profile; its app.ts matches current main. The subsequent repository cleanup changed paths and tooling, not UI behavior. Human account/posting acceptance remains separate.

The active hosted web artifact is `b89fa594d1eea48b75284f29c0ff51e9b3ed14e0`; backend source was staged from `6e7a0b5`. Root hosting includes the direct-route correction from `45432cb`. A repository layout cleanup did not require another production rollout.

## Build and signing

Use Bun 1.4.2. From the repo root: `bun run ios:check`, `bun run ios:local --phone "hazy's iPhone"`, `bun run web`, `bun run test`, and `bun run test:app`. `web` is the local real-account client on port 3033. Root native commands forward into `app/`. See README.md for a fresh checkout and EAS configuration. Paid EAS builds need explicit approval.

Exact remains pinned to `4e9000abbdaa8315ae864cdb8253af143aac510c` plus three committed compatibility fixes. Its dirty submodule files are expected: `AudioSession.swift`, `TintDimmingIOS.swift` and `host/web/auth-glue.js`. Do not discard these patches or accidentally stage the SDK contents. The SDK pin did not advance.

The first phone installation failed because the HTTPS callback grant derived `webcredentials:jera.ink`, while the old wildcard profile did not permit Associated Domains. The manually generated explicit profile also omitted that entitlement. Xcode automatic signing succeeded using the configured developer account and a tiny temporary target with Jera's explicit ID and required capability. It generated a correct development profile, avoiding a full Jera recompile. Re-signing passed strict signature verification and the phone accepted installation.

Local-only evidence and retained artifacts:

- `.local/phone-release-current/Jera.app`: installed signed app, original build receipt and separate `signing-update.json`.
- `.local/provisioning-probe/`: temporary Xcode signing target and automatic-provisioning log. Never install this probe in place of Jera.
- `foundation/app/target/`: original pre-layout build caches/artifacts, retained locally and excluded from Git. No foundation/ source remains tracked.
- `.local/legacy-expo-artifacts-2026-11-08/`: retained ignored Expo artifacts. Running earlier preview worktrees and dependencies were preserved.
- `.worktrees/root-layout/.local/`: layout test logs. Earlier previews use separate worktrees and synthetic stores; do not reset production to reproduce them.

## Evidence and limits

The layout/release checks passed: 34 Node backend/auth tests, 31 app tests with 134 assertions, all eight Exact browser workflows, schema check (14 tables/47 operations, zero problems/eight advisory notes), native prerequisite check, and all 40 Cargo dependency paths. The updated main checkout passed its backend/app tests. Recorded patches apply reproducibly to the pinned SDK. The deployed sign-in page, callback execution, CORS/refusal and actual provider discovery/PAR were checked without granting user account consent. Phone installation and launch are now verified.

Still separate: real-account post/read/reply/delete/reload and cross-device acceptance of this release, private sharing/revocation on devices, native keyboard/IME/accessibility behavior, and the known expanded-text layout findings. Do not report passing fixtures or successful launch as proof of those journeys.

## Where to continue

1. Confirm the installed phone and hosted web journeys with David, retaining data and checking draft recovery/account identity. Keep this bounded; do not re-run a cold native build to answer an installation question.
2. Review/integrate the selected-view implementation above, then finish milestone 2 with account-owned view configuration outside the composer. The portable view contract and read-only Snapback/local-folder adapters already exist and are tested; they are bounded CLI scans, not generic background indexers. View creation/audience selection stays outside the composer; lexicon choice and its controls are downstream of a view. Default post.v1 stays simple; Contribution is retained as an experiment.
3. Milestone 3: one independently authenticated operator, explicit context sources, a standing mandate, durable delivery/claim/recovery, an attributable reply and a small inspectable provenance receipt. Prove restart without duplicate replies and revocation before protected actions. There is no autonomous worker today.
4. Milestone 4: one bounded tool-assisted journey (the I Ching example), retained outcomes, safe reconciliation of uncertain effects, out-of-scope proposals and demonstrated correction retrieval.
5. Milestone 5: expand lexicons, sources, processors and factories from evidence. Firehose/ranking, cross-device source sync and operator VMs/bellhouses remain separate later projects.

Release follow-ups: validate capability/profile compatibility before a long build; persist an unambiguous valid profile selection; consider separating the web-only callback from native capability declarations; improve build version/source identification. Off-host backups to Stjerneborg remain pending. Older design-preview PR #3 and other historical branches are separate work, not omissions from this release.

## Design commitments

“Receive -> understand -> choose a response or proposal -> check the mandate -> act -> verify -> retain the outcome.”

“The reply is the conversational result; the provenance is a linked, inspectable record of the work.”

Jev informs understanding; it is not the sole trusted decision authority. Explicit context sources shape work proposals and the cognitive lightcone. Human control owns scope/direction; bounded feedback supports useful autonomous progress. The commons' Jera athanor, original dialogue and strata 018–025 hold the wider rationale. Start with its current index and contract-foundation node; preserve useful original wording.
