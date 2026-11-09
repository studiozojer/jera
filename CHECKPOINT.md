# Jera delivery checkpoint — November 6, 2026

Continue on `feat/social-loop`. The functional/artwork state is anchored by `b9dbffe`; this checkpoint adds handoff documentation. The historical root Expo app and the synthetic `design-preview` are separate from the authenticated Exact app in `app`.

## Current delivery

The real client has chronological feeds, threads/replies, full-row entry, feed/thread composer entry points, independent Public/Private experiences, DID audiences and author-owned Delete with confirmation. Replies to public posts may be public or private; descendants of private posts stay in that audience. Public means signed-in Jera accounts. Snapback owns posts and private drafts; no ATproto publishing is installed. Heart/repost/send remain disabled. Operator reasoning and memory/runtime remain separate from Jera; the first independent autonomous operator reply remains future work.

The shared Figma globe/eye selector is in the header and composer. Posts use tighter author/time/body spacing, smaller ellipsis glyphs with full targets and 4px padding below actions. The native icon defaults to a black backdrop; the favicon and web manifest use Apple-rendered Dark artwork. See `EXPERIENCE-CONTROL.md`, `DELETION.md`, `DRAFT-LIFECYCLE.md`, `POST-BUTTON.md`, `PERMISSIONS.md` and `app/assets/brand/README.md` for the actual contracts and provenance.

Posted local drafts remain sealed/cached after success. Each new composer session checks its intent in Snapback before retiring confirmed content. Unposted or uncertain drafts remain recoverable. An explicit route-owned preparation command replaced copying a retained resource answer during refresh. Posting persists the exact editor snapshot before sending; background autosave does not toggle Post availability. Generation 6 exposes author-only deletion; the one-off reset operation was removed after David’s requested reset. Do not repeat that historical reset on resumption.

## Runtime and dependencies

| Item | Checkpoint |
| --- | --- |
| Live Mac web | `http://127.0.0.1:3033/`, real account/backend; retain its running session |
| Production | `https://snapback.jera.ink`, VPS `91.98.204.141`, generation 6 confirmed at this checkpoint; development/password/guest doors disabled |
| Exact | `4e9000abbdaa8315ae864cdb8253af143aac510c` plus the two committed patch files in `patches/` |
| Snapback / Bun | 0.4.33 / 1.4.2 |
| daoUI consumer | 106 files, clean canonical source receipt `0281730b9db9e3b40dbaa869ca60983a3341e9cb`; library branch `feat/exact-system` at `5dddc02` |
| Latest phone release | Built `2026-11-06T08:27:34.972Z`, installed on David’s iPhone; automatic launch refused while locked |

The SDK submodule intentionally shows three modified files: AudioSession.swift, TintDimmingIOS.swift and web/auth-glue.js. At this checkpoint, all three were compared byte-for-byte with fresh pinned-base copies after applying Jera’s committed patches, and matched exactly. Patch application/idempotence passes. Keep the recorded patch/bootstrap mechanism; the submodule pointer stays pinned. These fixes are preserved in Git without publishing a private SDK fork.

The latest phone installation used the newly built release bundle directly. The ignored IPA/archive receipt under `app/artifacts` is older; it is not the latest release. Rebuild through the documented wrapper when producing another archive. Binary caches, signing material, credentials and private device journals are not source checkpoints. The last icon review opened the actual compiled native legacy icon and confirmed a black backdrop; Home Screen appearance still awaits human confirmation.

## Evidence and remaining work

The last data/lifecycle pass recorded 21 Node storage/auth/native-context tests, 17 adapter tests and six Exact browser scenarios passing. Normal-browser workflows cover draft opening/recovery, offline/lost-response retention, replies, separate modes, Delete permissions/failure/cancel and steady Post state. Later visual changes received bounded desktop/phone-width reviews, touch-target/spacing measurements, the daoUI receipt check and native builds/installation. Dark favicon bytes and generated manifest entries were checked against the live web server. Do not present earlier workflow suites as rerun after every asset-only edit.

Ordinary-size layout checks had no findings. The expanded largest-text tour retained 19 overlaps, one fixed-size and one word-break finding; Lean was unavailable. These remain open. David reports that the draft fix appears to work and that the tightened composition looks better. Those observations are separate from comprehensive native keyboard, IME, accessibility, safe-area and cross-device Private acceptance.

Standing north stars: the lexicon being interacted with influences the UI; Public/Private remain recognizable parallel experiences. Every debugging/performance investigation should deepen understanding of Exact/Snapback and reveal appropriate improvements in framework contracts, diagnostics and operator workflows. Keep the user report, hypothesis, bounded reproduction, source change, comparable outcome and human acceptance distinct. Use synthetic/content-free evidence rather than collecting real keystrokes or private text.

The composed commons owns the cross-project checkpoint, selected source dialogue, recordings and strata at `projects/jera/`; discover its binding from the workspace. Runtime data and conversations are not reconstructed from a clean Git checkout. Temporary review servers on 3035/4417 were stopped; the live 3033 client was kept running.
