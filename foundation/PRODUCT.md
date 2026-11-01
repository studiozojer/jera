# Jera's product contract

This is the current acceptance contract, based on David's direction and his authentication correction on 2026-10-31. Earlier agent-authored plans that deferred ATproto identity are superseded. Keep implementation evidence separate from decisions about what Jera is.

## Settled requirements

- Jera is an ATproto application. People sign in with an existing ATproto account; its verified DID is their canonical identity. A separate Jera email/password account is not an accepted substitute. Internal backend principals and sessions must be bound to that identity.
- Preserve scattered ideas, original wording, exact Unicode forms and provenance, including fragments that never become executable work. Derived interpretations must retain attribution and links to their sources.
- Multiple armillaries can coexist. Shared modules have human and operator participants. A later local coding harness must be able to query the work without depending on one model or operator runtime.
- The intended interaction is social: threads, operator mentions and attributable responses. The first operator should organize ideas into an armillary for later action. A claimable queue alone is not an operating AI collaborator.
- Exact and Snapback are selected infrastructure. Their examples do not decide Jera's account model, public-record ownership, privacy, or user journey. Snapback is not an ATproto PDS.
- Unicode tagging is core to the direction. Astrology is an optional module. Discovery-feed ranking and a large capability framework are deferred.

## Decisions still being resolved

Public artifacts and attributable responses are intended to participate in ATproto through lexicons and author-owned records. The precise record types, which artifacts are public, and the publish action still need design. Two questions are open with David:

1. Are captures public by default with explicit private drafts, or private until explicitly published?
2. Can private shared modules initially live in Jera's backend, or must the first usable version support permissioned ATproto storage for those modules?

Do not convert an unanswered visibility question into public writes. Independently implement existing-account authorization and verified DID binding. Check current permissioned-data capabilities on the actual deployment before depending on them. A membership check cannot make a public PDS record private.

## Acceptance before calling the foundation aligned

Show a real existing-account login on the phone, verify the DID, and show that ownership, module access and operator attribution use that identity. Test rejection of unverified identity claims, account switching and session restoration. The app must not require a separate Jera password.

For the agreed first capture/publish journey, identify the authoritative store and verify the original record there. Public-record evidence includes the author's DID, lexicon, AT URI and observed CID; private-record evidence includes its actual access boundary. Preserve the original text, distinguish pending work from confirmed effects, and keep source and synthesis separately attributable.

Keep protocol integration evidence separate from backend tests, compilation, installation and visual checks. A test that creates a Snapback password account does not satisfy ATproto login acceptance. A stubbed PDS response does not prove publication. An installed app that stays running does not prove its user journey.

## Current implementation gap

The installed build enables Snapback password identity, stores ownership using its principals, and has no verified DID binding. It has no Jera lexicons or PDS writes. It is a private capture/work-queue prototype with working build and hosting paths. Its password tests demonstrate storage behavior, not the intended account model. These gaps are known misalignments, not accepted product scope.

Retain useful capture, membership, queue, build and deployment work where it fits the corrected boundaries. Before changing identity, inventory any real records and their ownership; define migration or explicit disposal of synthetic fixtures. Do not reset production or infer that a password account belongs to a DID from an email/handle match.
