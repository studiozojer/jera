# Jera's product contract

This is the current acceptance contract, based on David's direction and his authentication correction on 2026-10-31. Earlier agent-authored plans that deferred ATproto identity are superseded. Keep implementation evidence separate from decisions about what Jera is.

## Settled requirements

- Jera is an ATproto application. People sign in with an existing ATproto account; its verified DID is their canonical identity. A separate Jera email/password account is not an accepted substitute. Internal backend principals and sessions must be bound to that identity.
- Preserve scattered ideas, original wording, exact Unicode forms and provenance, including fragments that never become executable work. Derived interpretations must retain attribution and links to their sources.
- Multiple armillaries can coexist. Shared modules have human and operator participants. A later local coding harness must be able to query the work without depending on one model or operator runtime.
- The intended interaction is social: threads, operator mentions and attributable responses. The first operator should organize ideas into an armillary for later action. A claimable queue alone is not an operating AI collaborator.
- Exact and Snapback are selected infrastructure. Their examples do not decide Jera's account model, public-record ownership, privacy, or user journey. Snapback is not an ATproto PDS.
- Unicode tagging is core to the direction. Astrology is an optional module. Discovery-feed ranking and a large capability framework are deferred.

## Initial storage and visibility — David's clarification

Start with explicit private drafts. Snapback is the authoritative store for captured ideas, shared private armillary modules and most application data during the initial UX iterations. It is not merely an index of PDS records. User input does not go onto ATproto in this phase. Sharing inside Jera follows backend module permissions; capture itself does not authorize broader sharing or publication.

ATproto supplies existing-account authorization and verified DID identity now. Lexicons, PDS storage and permissioned ATproto storage are deferred until the UX makes the record shapes clearer. Their absence is accepted initial scope, not a foundation defect. Do not gate private capture on designing public records or implement automatic publication/migration.

Future publication requires an explicit user action and its own record/visibility design. Preserve source text, attribution and stable internal IDs so that design can evolve without pretending today's backend records already have AT URIs. Check current permissioned-data capabilities before a future integration; a membership check cannot make a public PDS record private.

## Acceptance before calling the foundation aligned

Show a real existing-account login on the phone, verify the DID, and show that ownership, module access and operator attribution use that identity. Test rejection of unverified identity claims, account switching and session restoration. The app must not require a separate Jera password.

For the first private-capture journey, verify the original record in Snapback, draft recovery and the actual personal/module access boundary. Saving must not issue PDS writes or publish user input. Preserve the original text, distinguish pending work from confirmed effects, and keep source and synthesis separately attributable. Lexicons and public-record evidence are not acceptance gates for this phase.

Keep protocol integration evidence separate from backend tests, compilation, installation and visual checks. A test that creates a Snapback password account does not satisfy ATproto login acceptance. A stubbed PDS response does not prove publication. An installed app that stays running does not prove its user journey.

## Current implementation and acceptance status

The app now authorizes an existing ATproto account through the official OAuth SDK, and the server mints Snapback sessions with the verified DID as principal. Password/guest signup is disabled. Its lack of Jera lexicons and PDS writes matches the clarified initial scope. Real-backend and handoff tests pass; browser tests simulate the provider explicitly. Production discovery/PAR reaches the real authorization UI. David reported successful real-account phone login and arrival at the signed-in screen on 2026-11-01. This is account-holder evidence of login and callback completion; relaunch, verified-DID review and the private-capture journey remain separate acceptance checks.

Legacy backend records and local password-era files remain preserved, without email-to-DID reassignment. Old password sessions were revoked; new app credentials and drafts use a separate versioned namespace. Retain useful capture, membership, queue, build and deployment work. Do not reset production or infer ownership from an email/handle match.

## Current signed-in surface — 2026-11-01

After successful phone login, David requested a deliberately minimal signed-in screen: the approved SVG wordmark at the top-left, followed by an avatar at the top-right that opens a simple account bottom sheet. The sheet follows his supplied screenshot: rounded-square avatar, name and secondary-color handle in a lockup, then one full-width Log out button with breathing room below. Use the native sheet’s spring motion and interactive dismissal, inspired by `local/inbox/animations-on-iphone-reel.MP4`. Remove the workspace directory, DID, refresh controls and loading feedback. Do not run directory polling behind this shell. Preserve existing records and local drafts; the backend model and future capture/organizing direction remain in place.
