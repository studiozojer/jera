# First physical-device typing trial

Goal: write, revise and recover a tagged post without unexpected text changes, lost caret position, focus loss or noticeable typing stalls. Run on a physical device using an EAS-built app; record platform, model, OS, keyboard, build and Observe environment.

## Scenarios

- Type a short paragraph quickly, then a long draft. Compare the plain editor with the symbol rail present. Check predictive typing, autocorrect and swipe typing without turning them off to make a test pass.
- Type `:virgo:`, accept the suggestion, continue typing, move into the middle, select a range and insert a symbol. Include preceding emoji, both presentation selectors and pasted multilingual text. Verify exact persisted content and the visible draft agree.
- Use CJK marked text, dictation, emoji keyboard and a hardware keyboard. Accept symbols only when intended. Test native undo and redo around conversion; if undo breaks, record the failure and do not call the editor ready.
- Open and dismiss the keyboard repeatedly, interactively dismiss it, and rotate or resize where supported. Check toolbar anchoring, safe areas, large accessibility text and VoiceOver/TalkBack labels.
- Close and reopen a draft, background during continuous typing, restart after a save, and simulate storage failure. Confirm existing content is not overwritten by a failed load. Verify successful posting clears the draft; clear failures should be visible and must not silently invite duplicate posting.
- Add a Virgo post and verify the feed’s visible heading says Virgo posts and the new post appears. Reset All. Verify shortcode, bare symbol, text presentation and emoji presentation match while original post text remains distinct.

## Evidence

Keep task results and subjective feel separate from measured timings. Compare a release/profile baseline on the same device before comparing different phones. Observe startup and per-route first-render/interactive distributions; retain sample counts and p50/p90/p99. Do not label JS callback duration, time until someone begins typing or average FPS as native input latency. Native input-to-display measurement requires an instrument that observes input and actual rendering.

No raw drafts or private post text in telemetry or shared screenshots. Use synthetic content. Debug results belong to a separate experiment environment if explicitly enabled; they do not establish release performance.

## Next comparison

Explicit acceptance is the baseline. Compare automatic closing-colon replacement with immediate undo only after native composition can be handled reliably. If a predicted outcome does not occur, report it rather than changing the scenario to make the prediction true. Albers’s review is design feedback, not a user study; David’s hands-on trial remains necessary.
