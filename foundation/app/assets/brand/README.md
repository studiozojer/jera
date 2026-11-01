# Interim Jera identity

Selected by David on 2026-11-01. A human designer will finish the identity; these are the selected interim assets, not an invitation to keep refining their outlines.

- `jera-mark.svg`: direction **04 / Drawn**, exported from [Figma 11:18](https://www.figma.com/design/hMHHSwGpq3A26xosOspqWO?node-id=11-18). A transparent 280 × 280 canvas centres the original mark without stretching it or changing its paths.
- `jera-combo.svg`: the exact combined mark selected in [Figma 12:6](https://www.figma.com/design/hMHHSwGpq3A26xosOspqWO?node-id=12-6). Its original 51:25 proportions and all six paths are preserved.

Both SVG assets use `currentColor`. The sign-in header uses `../../brand.contract`, a direct transcription of the combined SVG paths, so Exact can render them as vectors with the platform foreground colour in light and dark modes. Keep that component and the SVG paths in sync.

The app icon is the separately selected `jeraappicon.icon` Icon Composer project, copied from `armillary/local/jeraappicon.icon` with its artwork and materials preserved on 2026-11-01. The internal image filename is normalized from `Image 4.png` to `Image4.png` (and its JSON reference updated) because Exact’s asset gate refuses spaces. This replaces the earlier `jera-appicon2.icon` selection. Jera now opens with a dark app theme by default. Both Apple hosts select this layered source through `host.ios.icon` / `host.macos.icon` in `app.json`. Changing the installed native icon requires a new native build.

`jeraappicon.png` (1024 × 1024) and `jera-favicon-v3.png` (64 × 64) are flattened Default/iOS renditions exported by Apple's Icon Composer CLI. They preserve the supplied project's materials and blue gradient. The web favicon uses the first `icons` manifest entry; the larger rendition is also available in the web manifest. These app icon assets do not replace the sign-in wordmark.

To regenerate either PNG from the app directory, set `SIZE` to `1024` or `64` and `OUTPUT` to its corresponding filename:

```sh
"/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool" \
  assets/brand/jeraappicon.icon --export-image \
  --output-file "assets/brand/$OUTPUT" --platform iOS --rendition Default \
  --width "$SIZE" --height "$SIZE" --scale 1
```
