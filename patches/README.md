# Exact compatibility patches

Base: Exact `4e9000abbdaa8315ae864cdb8253af143aac510c`.

A real iPhone archive build with Xcode 26.5 / Swift 6.3.2 found two upstream compile failures. Both were still present at upstream `30f6d1ec34c0f52a3a6c9216216ab899ca62b6fe` on 2026-10-31:

- `TintDimmingIOS.grey` shadows the static `level` function with its local result. Qualify the call with `Self`.
- `AudioSession.observe` references iOS 27 symbols unavailable in the Xcode 26 SDK. Runtime `#available` does not protect unavailable declarations at compile time. Use the SDK's existing interruption-notification path on every supported OS until the native toolchain and SDK can move together. The separate iOS 27 lifecycle path is not enabled by this patch.

Both local and EAS builds apply this exact patch through `scripts/patch-sdk.mjs`. Application behavior remains in application sources; this patch repairs SDK compilation. The submodule stays at the recorded base revision and shows these two intentional local modifications. Applying the patch is idempotent; mismatched SDK source is refused. Do not discard it silently during a dependency upgrade. Remove it once an upstream revision compiles on the supported toolchain, after native validation.

No upstream PR has been submitted. This is a carried compatibility fix, not an upstream release.

## Web OAuth popup — November 5

`exact2-auth-popup-coop.patch` corrects an observed upstream browser-runtime defect on the same pinned base. In a fresh normal browser, real sign-in navigation left the authorization page open while its original WindowProxy reported closed. The existing three-second grace then answered `cancelled` before the user's callback. The popup was not actually closed; browser window isolation had severed the opener relationship.

When BroadcastChannel is available, the fix waits for that surviving callback channel, supersession, or the existing ten-minute bound. Callback origin/path checks and the runner's state validation are unchanged. Without a callback channel, the existing closed-popup grace remains. A manually closed window with a working channel therefore remains pending until the bound or a superseding attempt; a closed proxy alone cannot distinguish that from an isolated provider still in use.

`app/exact.mjs` applies the recorded patches idempotently for web commands as well as the iPhone wrapper. Preserve that bootstrap when regenerating the app launcher with `exact update`. Patch reproducibility is tested against copies of the pinned base files. No SDK revision was advanced and no upstream PR was opened. Remove this carried patch when a validated upstream version owns the behavior.

Four focused handoff regressions pass (delayed channel callback, foreign callback rejection, timeout and no-channel fallback), as do the SDK's seven existing web authorization tests. The actual provider page remains pending past seven seconds after the fix instead of showing false cancellation. Real-account completion and phone-to-web synchronization still require David's interactive retry.
