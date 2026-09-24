# U13 — isolijnen analytisch (claude opus) — LOG (append-only)

## 2026-09-24 — start
- Spec: `.dev/specs/track-u13-isolijnen-analytisch.md`. Branch `track/u13-isolijnen-analytisch`
  vanaf main (eac6b5d). Eerst de fade-bug, dan het onderzoek A/B/C met meting.
- Gelezen: `isoline-layer.ts` (contour-shader: afstandsveld (s−L)/|∇s|, bicubisch = 4
  trilineaire fetches × 2 tijd = 8), `isoline-field.ts` (opvullen), `isolines.ts`
  (defaults: blur 2, fade gradiënt 0,02–0,06 °C/km, gekalibreerd U8c p50 op lijnpixels 0,08).
