# Exact native compatibility patch

Base: Exact `4e9000abbdaa8315ae864cdb8253af143aac510c`.

A real iPhone archive build with Xcode 26.5 / Swift 6.3.2 found two upstream compile failures. Both were still present at upstream `30f6d1ec34c0f52a3a6c9216216ab899ca62b6fe` on 2026-10-31:

- `TintDimmingIOS.grey` shadows the static `level` function with its local result. Qualify the call with `Self`.
- `AudioSession.observe` references iOS 27 symbols unavailable in the Xcode 26 SDK. Runtime `#available` does not protect unavailable declarations at compile time. Use the SDK's existing interruption-notification path on every supported OS until the native toolchain and SDK can move together. The separate iOS 27 lifecycle path is not enabled by this patch.

Both local and EAS builds apply this exact patch through `scripts/patch-sdk.mjs`. Application behavior remains in application sources; this patch repairs SDK compilation. The submodule stays at the recorded base revision and shows these two intentional local modifications. Applying the patch is idempotent; mismatched SDK source is refused. Do not discard it silently during a dependency upgrade. Remove it once an upstream revision compiles on the supported toolchain, after native validation.

No upstream PR has been submitted. This is a carried compatibility fix, not an upstream release.
