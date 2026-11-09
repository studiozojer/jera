# Sign-in controls

`login-desktop.svg` and `login-touch.svg` preserve the two SF Symbols characters David supplied for the sign-in action: U+1001F0 (􀇰) and U+103564 (􃕤). Their medium glyph outlines come from the locally installed SF Symbols app's `SFSymbolsFallback.otf`, normalized into 24 × 24 viewboxes with the transforms applied to the path coordinates. These are glyph exports, not newly drawn substitutes. Tamber uses the same vectors on each host, avoiding private-use text glyphs that browsers may render as missing characters.

The primary pointer selects the variant: `coarse` uses the touch symbol; a mouse or trackpad uses the desktop symbol. Both controls retain the accessible label “Continue with ATproto”.

`login-disabled.svg` exports David's disabled-state glyph U+10355D (􃕝) using the same process. Empty or malformed input shows this glyph in daoUI's `ic/disabled` color (15% alpha); an in-progress authorization retains its busy indicator.

## Experience switch

`experience-public.svg` and `experience-private.svg` preserve the SF Pro Regular glyph outlines from Jera Figma `hMHHSwGpq3A26xosOspqWO`, permissions-switch `69:457`, button instances `69:458` and `69:459` (globe and eye.square). Original symbols are U+1001AA and U+100F47 at 18px. The Figma exports retain their full SVG geometry and root bounds: 22×19 and 21×18.

To make tint semantic on every Exact host, temporary instance copies were exported with opaque neutral `#404040` paint, which Exact accepts as a monochrome template. Runtime daoUI `ic.primary` / `ic.tertiary` supply selected/inactive paint. Original Figma nodes retain their original bindings; the temporary copies were removed in the same export operation. No glyph outlines were redrawn or edited after export.
