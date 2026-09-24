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

## 2026-09-24 ~11:00 — implementatie (d801cc2, 45ffad3)
- **Labels faden mee**: `shortRings()` (isoline-contours) levert per snede alle gesloten lijnen
  < L_min met fade (ook 0), bbox, punten en de koorde-tolerantie; `TraceResult.rings`.
  `IsolineLayer.rings` = ringen van de *getekende* geometrie. `ringFadeAt()` zoekt de korte ring
  van het ankerniveau binnen max(1 cel, 2× koordetolerantie) van de polyline; anders 1 (lange/open
  lijn). Anker-opacity = opacity × gradiënt-fade × ringFade, continu per pass; ringFade 0 (ring
  ≤ ½·L_min) → despawn met de bestaande 300 ms-fade; niet spawnen op een ring met fade 0.
- Bijvangst (nodig voor de koppeling): labels lopen nu op `layer.sliceTime` = tijd van de getekende
  vectorsnede i.p.v. de scrubbertijd. De worker loopt tijdens afspelen achter; anders liggen anker
  en ring (dus label en lijn) op verschillende tijden. Raster: ongewijzigd (`this.time`).
- **Oneven lijnen**: `IsolineTuning.odd: 'half' | 'dash' | 'equal'` (default `half`), knop
  "Oneven lijnen" (halve breedte/stippel/gelijk) i.p.v. "Stippel oneven"; dash-code ongewijzigd
  achter `dash`. Ook in de rastershader. `oddLine()`: halve breedte, maar minimaal 1 device-px en
  de rest als alpha (DPR 1 z5: 0,65 px → 1 px × α 0,65; z9: 1 px × α 1; DPR 2 z9: 2 px).
  Waarom: het capsuleprofiel clamp(hw+½−d) behoudt de totale dekking over subpixelposities alleen
  bij hw ≥ ½; bij 0,65 px wisselt de lijn 0,83 ↔ 0,65 (≈ 21 % flikker). Unittest rekent dat na
  (spread < 1e-9 met oddLine, > 20 % naïef).
- Tests: ring 40 km bij L_min 60 → `ringFadeAt` en label-opacity ≈ smoothstep(30, 60, 40) = 0,259
  (op 0,05; de koordelengte ligt ~0,5 % onder de omtrek); labeltest (jsdom, Marker gemockt) laat
  een ring 70 → 40 → 28 km krimpen: opacity 1 → ≈ 0,26 → despawn (count 0).
- Synthdata in deze worktree was pre-U15 (mrf.test faalde op uv_clear-chunk): `pnpm synthgen`
  opnieuw (buiten de sandbox: tsx-IPC-socket geeft daarbinnen EPERM).

## 2026-09-24 ~11:05 — screenshots + meting
- Previews: `pnpm exec vite build --outDir tmp/dist-u16` (en main `1c19675` via git archive naar
  tmp/dist-main), `MOTREGEN_DATA_ORIGIN=https://motregen.nl/data vite preview --port 4361/4362`.
  Script `web/tmp/u16.mjs` (ignored): `direnv exec .. flock /tmp/motregen-e2e.lock node tmp/u16.mjs
  shots|perf <origin> tmp/shots <label>`; Chromium/SwiftShader 1280×800 DPR 1, focus gepind.
- Shots `web/tmp/shots/u16-{z6,z9}-{half,dash}-{light,dark}.png` (z6 dash donker overgeslagen).
  z6: oneven lijnen zichtbaar dunner/lichter, even ongewijzigd; labels 26–28, HUD 63–66 ringen
  waarvan 30–35 vervaagd. z9: oneven 1 px, 8 labels.
- Afspelen + focus, 8 s, 2× afwisselend (load 8 → 11): main 5,3 / 4,8 fps, 6,0 / 5,7 passes/s,
  trace 8,6 / 9,2 ms; U16 5,7 / 4,6 fps, 5,5 / 5,7 passes/s, trace 9,7 / 9,2 ms. Gelijk binnen
  ruis; plafond is SwiftShader (passMs ~124 ms in beide), zoals U13.
- Rust 3 s na pauze, beide builds: 0 passes, 0 traces, 0 labelrondes, 0 repaints, 0 isolijn-draws.

## 2026-09-24 ~11:10 — gates (synchroon, web/, HEAD 45ffad3)
- `direnv exec .. pnpm typecheck` → TYPECHECK-EXIT: 0
- `direnv exec .. pnpm test` → TEST-EXIT: 0 (39 files, 216 tests). (Eerste run exit 1: vitest pakte
  mijn scratch-kopie van main in web/tmp/main-src mee; verwijderd, herdraaid.)
- `direnv exec .. pnpm build` → BUILD-EXIT: 0
- `MOTREGEN_E2E_PORT=4340 MOTREGEN_E2E_DATA_PORT=8340 direnv exec .. pnpm e2e` (flock in het script,
  poorten vooraf vrij, load 9,1 → 10,0) → E2E-EXIT: 0 (20 passed, 13 skipped, 4,9 min).
- Previews 4361/4362 gestopt.

## Voor de PO
- Oneven lijnen default halve breedte; op DPR 1 uitgezoomd is dat 1 px met alpha 0,65 (geen
  sub-pixel-lijn, geen flikker). Knop "Oneven lijnen" in `?dev` voor stippel/gelijk.
- Labels volgen nu de getekende snede (kan tijdens afspelen een fractie achter de scrubber liggen,
  net als de lijnen zelf).
