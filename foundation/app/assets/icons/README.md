# Sign-in controls

`login-desktop.svg` and `login-touch.svg` preserve the two SF Symbols characters David supplied for the sign-in action: U+1001F0 (􀇰) and U+103564 (􃕤). Their medium glyph outlines come from the locally installed SF Symbols app's `SFSymbolsFallback.otf`, normalized into 24 × 24 viewboxes with the transforms applied to the path coordinates. These are glyph exports, not newly drawn substitutes. Tamber uses the same vectors on each host, avoiding private-use text glyphs that browsers may render as missing characters.

The primary pointer selects the variant: `coarse` uses the touch symbol; a mouse or trackpad uses the desktop symbol. Both controls retain the accessible label “Continue with ATproto”.

`login-disabled.svg` exports David's disabled-state glyph U+10355D (􃕝) using the same process. Empty or malformed input shows this glyph in daoUI's `ic/disabled` color (15% alpha); an in-progress authorization retains its busy indicator.
