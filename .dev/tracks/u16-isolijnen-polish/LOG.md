# U16 — isolijnen-polish (worker log, append-only)

## 2026-09-24 — start
- Spec gelezen; code: isoline-labels.ts (anker.fade = gradiënt), isoline-contours.ts
  (ringFade/buildSegments), isoline-tracer.ts (worker), isoline-layer.ts (vector- en rastershader).
- Plan labels: de tracer levert naast de segmenten de korte ringen (gesloten, lengte < L_min,
  ook fade 0) met niveau, fade, bbox en punten. Na elke vector-pass (onPass) zoekt elk anker
  de korte ring van zijn niveau waar het op ligt (afstand tot polyline < 1 cel); ringfade × gradiënt-
  fade = opacity. Niet gevonden = lange/open lijn = 1. Fade 0 → despawn met fade. Continu, geen
  stabiele ring-id nodig (ids zijn niet stabiel over tracer-snedes).
- Plan oneven: `odd: 'half' | 'dash' | 'equal'` i.p.v. `dashed`; halve breedte met minimaal
  1 device-px (dan alpha = breedte/1 px): bij hw < 0,5 is de som van de dekking niet behouden
  over subpixelposities (0,825 vs 0,65 bij hw 0,325) → flikkeren; bij hw ≥ 0,5 wel.
