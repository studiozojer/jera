# Reading and writing foundation

The first design refinement replaces app-local control styling with daoUI's portable `rn/reading` family. The mobile feed starts with a compact header and filters, followed immediately by the writing. Stream is the working default; `/?layout=cards` retains the alternative using the same records and actions. This is a proposed composition awaiting David's visual calibration.

The shared components live in `src/dao/reading/` as generated source copies. `src/theme/ReadingTheme.tsx` binds Jera's generated canonical tokens. `src/components/ui.tsx` supplies icons, routing and compatibility for existing callers. `PostCard` keeps record projection and bookmark persistence in the app; the shared `ReadingItem` only organizes author, content and footer slots. `Field` forwards the real native input ref and callbacks, leaving ordinary typing, explicit symbol insertion and draft storage under the existing composer.

## Development

Run `npm run sync-reading` with sibling daoUI available (or `DAOUI_PATH` set explicitly), then `npm run check:dao`. The receipt records the source commit, dirty state and exact SHA-256 hashes. Never hand-edit generated component copies. EAS consumes the committed copies without a sibling dependency. Fonts, colors and the canonical type scale retain their existing generators.

The component bench is daoUI's `/page/reading`. It documents and exercises both compositions with synthetic in-memory state; Jera is the persistent app integration. See daoUI's `rn/reading/README.md` for choosing and composing the eleven building blocks. The initial family is a pilot, not a complete replacement for every existing daoUI implementation.

## Repeatable review

Start `npm run web -- --port 8091`, then run `node scripts/review-reading.cjs` with Playwright installed separately. Set `PLAYWRIGHT_MODULE` to use an existing installation and `JERA_PREVIEW_URL` to change the URL. Captures and the verification receipt go to `.local/design/foundation/` and remain untracked. Use synthetic records only.

The script exercises save/reload/unsave, search and empty results, custom-record preview and field retention, exact draft recovery and caret continuation, post/clear, symbol insertion/filter reset, keyboard activation and old local records. It captures the two compositions, 320/390/1280px layouts, dark mode and composer states. Browser text enlargement is a separate smoke check; it does not simulate native Dynamic Type. Inspect the images as well as the script result. If an expected result fails, report the mismatch and investigate before changing an assertion.

Native keyboard/IME/undo, safe areas, VoiceOver/TalkBack and physical-device typing still require device evidence. JavaScript exports verify packaging, not those interactions. No network publishing, credentials, lexicon schema or storage migration was introduced.
