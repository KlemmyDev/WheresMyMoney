# WheresMyMoney logo: Trail

One continuous line draws a W and climbs like a rising chart to a dot: the path your money took, ending at "here it is". The line is teal and the dot is ink. A small gap (a mask, so it works on any background) separates the dot from the end of the line.

| File | Use |
| --- | --- |
| `wmm-mark.svg` | Bare mark on dark UI (top bar at 28px, loading screen) |
| `wmm-mark-light.svg` | Bare mark on light backgrounds |
| `wmm-mark-small.svg` | Bare mark at 32px and below (heavier line) |
| `wmm-tile.svg` | Mark on its dark tile, 64px and up |
| `wmm-favicon.svg` | Favicon: tile with heavier line |
| `wmm-app-icon.svg` | 512px full-bleed PWA icon; the mark sits inside the 80% maskable safe zone (`"purpose": "any maskable"`) |
| `wmm-logo-dark.svg`, `wmm-logo-light.svg` | Horizontal lockup. The wordmark is live text in **Sora SemiBold** (600, letter-spacing -0.02em), so in the app render it as HTML text beside `wmm-mark.svg` with Sora bundled locally (for example `@fontsource/sora`, weight 600 only). The interface itself stays in IBM Plex |

Colours: teal `#2DD4BF` (line on dark), deep teal `#0D9488` (line on light), ink `#E6EDF3` / `#0F1720` (dot, wordmark), tile `#0D1117`.
Home Screen name: "Money". Clear space: at least the dot's diameter. Minimum sizes: 16px mark, 120px-wide lockup.
Loading animation: the line draws left to right (`stroke-dashoffset`, 700ms, `cubic-bezier(.2,.8,.2,1)`), then the dot pops in (420ms, `cubic-bezier(.3,1.4,.5,1)`). Play it once, never loop, and show it static under reduced motion.
Don't recolour the line or the dot, rotate the mark, close the gap, or retype the wordmark in another font.
Design reference: the Brand page of the design canvas, concept "2 · Trail" in `BrandLogo2.dc.html`.
