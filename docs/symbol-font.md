# Zojer Symbols in Jera

Jera bundles the studio symbol font from daoUI: 25 rune characters (24 Elder Futhark runes plus both Ingwaz forms) and 30 Kairos SVG-derived characters. The composer’s **Symbols** control opens Zodiac, Planets, Minor bodies and Runes. A partial shortcode searches across categories; insertion remains an explicit action. `:ingwaz:` inserts ᛝ, while `:ingwaz-diamond:` inserts ᛜ. `:pluto:` uses the corrected U+2BD5 form. The generic ♡ artwork is offered as **Heart** / `:heart:`: a heart in someone’s writing is not automatically an Eros asteroid tag.

Literal supported characters in post text and titles use nested text spans with Zojer Symbols. Shortcodes stay visible as typed; explicit U+FE0F emoji requests stay with the surrounding text and platform fallback. No stored text is normalized or migrated. Recognition and family filtering include the new vocabulary, with UTF-16 offsets preserved for insertion. Unknown characters keep platform fallback.

## Native editor font

A plain native TextInput needs one font that can render both letters and our symbols. `JeraEditor-Regular.otf` is an app-local companion face built from the already bundled Whyte Book plus Zojer’s 55 symbol outlines. It retains Whyte’s existing glyphs, advances, kerning/layout tables and line metrics, including its word spacing. The builder checks every original glyph’s drawing and horizontal metrics after reopening the export. This avoids replacing the native editor with a rendered overlay or a per-keystroke controlled rich-text input. Search uses the same companion face.

The Whyte companion is an internal app asset, not a standalone studio font release. The original font names, assets and licenses remain in the repository; the companion has its own family and PostScript names. Fonts load through the existing `expo-font` startup path. Builds consume committed assets and require no sibling checkout or Python runtime.

## Sync and provenance

The symbol font and repertoire remain owned by daoUI’s `fonts/kairos-astrology/` and `fonts/elder-futhark/`. The app-specific companion builder is `scripts/build-editor-font.py`. `src/theme/symbols.provenance.json` records the daoUI commit, source hashes, generated asset hashes, body font hash and builder hash. `npm run check:symbols` checks these local outputs without requiring daoUI.

To update the symbols after a daoUI font change:

```sh
python3 -m venv .local/font-tools
.local/font-tools/bin/pip install -r scripts/requirements-fonts.txt
DAOUI_PATH=/path/to/daoUI SYMBOL_FONT_PYTHON=.local/font-tools/bin/python npm run sync-symbols
npm run check:symbols
```

Run this after `sync-foundation` if that changes the body font. Do not hand-edit `symbols.gen.ts`, the bundled symbol font or the companion font. The initial source is daoUI `22b4293`, on `feat/elder-futhark-font`; its font assets are not yet on daoUI main.

## Verification

Typecheck, lint, all 11 unit tests, daoUI copy checks and symbol provenance checks pass. iOS, Android and web JavaScript exports include both new fonts. The companion build preserved all 619 original Whyte glyphs and metrics and produced a deterministic font on rebuild.

`PLAYWRIGHT_MODULE=/path/to/playwright node scripts/review-symbols.cjs` runs an isolated synthetic browser trial. It checks loaded fonts and asks Chromium which custom font actually drew a symbol, exercises category and shortcode insertion, caret placement, exact draft recovery/post storage, detail/save, and alternate Ingwaz family filtering. Captures cover 320/390/1280px, light/dark, composer, feed and detail. The broader `review-reading.cjs` regression also passes. Captures and receipts live under ignored `.local/design/`; the new symbol captures were opened for visual review. Explicit emoji and text forms remain visually distinct in Chromium.

Native font fallback, emoji presentation, IME, undo, selection, keyboard motion and physical-device typing remain unverified. JavaScript exports and browser checks establish packaging and web behavior, not those native properties. Use the existing [typing trial](typing-trial.md) on a device with mixed letters, runes, astrology, emoji and shortcodes.

Implementation references: [Expo SDK 57 Font](https://docs.expo.dev/versions/v57.0.0/sdk/font/), [React Native Text](https://reactnative.dev/docs/text), [React Native TextInput](https://reactnative.dev/docs/textinput), and [fontTools Type 2 pen](https://fonttools.readthedocs.io/en/latest/pens/t2CharStringPen.html).
