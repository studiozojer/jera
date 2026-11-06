# Interim Jera identity

Selected by David on 2026-11-01. A human designer will finish the identity; these are the selected interim assets, not an invitation to keep refining their outlines.

- `jera-mark.svg`: direction **04 / Drawn**, exported from [Figma 11:18](https://www.figma.com/design/hMHHSwGpq3A26xosOspqWO?node-id=11-18). A transparent 280 × 280 canvas centres the original mark without stretching it or changing its paths.
- `jera-combo.svg`: the exact combined mark selected in [Figma 12:6](https://www.figma.com/design/hMHHSwGpq3A26xosOspqWO?node-id=12-6). Its original 51:25 proportions and all six paths are preserved.

Both SVG assets use `currentColor`. The sign-in header uses `../../brand.contract`, a direct transcription of the combined SVG paths, so Exact can render them as vectors with the platform foreground colour in light and dark modes. Keep that component and the SVG paths in sync.

The app icon is the separately selected `jeraappicon.icon` Icon Composer project, copied from `armillary/local/jeraappicon.icon` with its artwork and materials preserved on 2026-11-01. The internal image filename is normalized from `Image 4.png` to `Image4.png` (and its JSON reference updated) because Exact’s asset gate refuses spaces. This replaces the earlier `jera-appicon2.icon` selection. Jera now opens with a dark app theme by default. Both Apple hosts select this layered source through `host.ios.icon` / `host.macos.icon` in `app.json`. Changing the installed native icon requires a new native build.

## Dark icon selection — November 6

David requested the black-background Dark variant for the native icon and favicon. The selected layered project now uses a solid black default fill, so native Default and Dark appearances both have a black backdrop. Its original artwork, shadow and translucency are preserved; Apple still renders each native appearance’s own materials. The source project remains the selected icon for both Apple hosts. This requires a native rebuild; the app’s dark UI theme does not select its Home Screen appearance.

`jera-appicon-dark.png` (1024 × 1024) and `jera-favicon-dark-v4.png` (64 × 64) are Apple-rendered **Dark/iOS** renditions. The 1024px export is byte-identical to the original blue-fill project’s Dark rendition. The 64px file is the first `icons` entry and therefore Exact’s web favicon; the 1024px entry supplies the web manifest. New URLs avoid reusing the old favicon cache. Earlier blue PNGs remain historical, unselected assets. `icon-provenance.json` records the source and export hashes. The UI wordmark is separate from these assets.

To regenerate from the app directory, use 1024 or 64 for SIZE and the corresponding dark PNG filename for OUTPUT:

```sh
"/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool" \
  "$PWD/assets/brand/jeraappicon.icon" --export-image \
  --output-file "$PWD/assets/brand/$OUTPUT" --platform iOS --rendition Dark \
  --width "$SIZE" --height "$SIZE" --scale 1
```
