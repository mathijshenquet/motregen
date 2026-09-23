# U6 — kaart contain i.p.v. cover (worker: claude opus)

## 2026-09-23 13:05 — start, ontwerpkeuze
- Spec gelezen. MapLibre 5.24 heeft `transformConstrain` (map-optie): een callback
  `(lngLat, zoom) → {center, zoom}` die de transform zelf bij élke wijziging toepast
  (pan, pinch, fling, easeTo-doelen, resize). Gekozen boven een centrum-clamp op
  `move`: geen achteraf-corrigeren dus geen rubberband/jitter, en `maxBounds` kan weg.
- Eigen berekening i.p.v. `cameraForBounds`: de minZoom moet per frame in de
  constrain-callback beschikbaar zijn en zuiver testbaar; het is één log2.
- Nieuw `web/src/core/map-constraint.ts`: `containZoom` (krappe as bepaalt),
  `containView` (startweergave, mercator-midden van de bounds), `constrainView`
  (per as: centrum-interval [lo+w/2, hi−w/2]; bij contain zijn de grenzen omgewisseld
  — één clamp, continu bij gelijke span).
- Bounds: `MAP_CONTAIN_BOUNDS` = NL/Vlaanderen + 4 % per zijde (één set voor fit én
  clamp, zodat contain→cover naadloos overgaat). Let op: ingezoomd kun je daardoor
  minder ver oostwaarts pannen dan met de oude asymmetrische padding (oost 15 %).
  Tunable constante.
- App: `maxBounds` weg, `transformConstrain: constrainMapView`, `setMinZoom(containZoom)`
  bij start en op `resize` (houdt NavigationControl zoom-uit-knop en wheel eerlijk),
  detaillimiet (maxZoom) ongewijzigd en doorgegeven aan de clamp; opgeslagen view
  wordt bij herstel door `constrainView` gehaald; zonder view: contain-gecentreerd.

## 2026-09-23 14:05 — e2e + screenshots + gates
- Nieuw `web/e2e/map-zoom.spec.ts` (desktop + mobile-4g/Pixel 5; fast-3g overgeslagen,
  gedrag i.p.v. perf): start zonder view → zoom-uit-knop disabled (minZoom = contain);
  slepen naar de hoek → opgeslagen view op containZoom met alle bounds in beeld;
  opgeslagen view {-20, 40, z3} → hersteld geclampt (knop disabled, bounds in beeld);
  opgeslagen z10 boven Utrecht → 20× wheel-uit → eindigt op containZoom, bounds in beeld.
- Testvalkuil (geen productbug): een Playwright-`mouseup` buiten het venster komt niet
  aan, dus de drag eindigde nooit (map.isMoving() bleef true, geen moveend). Sleepdoel
  wordt nu binnen de viewport geclampt. Op mobile-4g (4× CPU-throttle) landen
  tussenliggende moveends; de wheel-assert pollt daarom tot minZoom.
- Screenshots op minZoom met de échte basemap (OpenFreeMap; de e2e-style is synthetisch
  en toont geen land), vite dev MOTREGEN_SYNTH=1 op :4196:
  `minzoom-real-basemap-{desktop,pixel5-portrait,pixel5-landscape}.png`. Kaartvlak
  desktop 810×720 (hoogte is de krappe as), Pixel 5 ~393×320 CSS-px (kaart is de
  bovenste strook, dus ook daar is hoogte krap). Heel NL + Vlaanderen in beeld; zoom-uit
  op alle drie disabled.
- Gates (synchrone exit status, vanuit `web/`):
  - `pnpm typecheck` → TYPECHECK-EXIT 0
  - `pnpm test` → TEST-EXIT 0 (103/103, waarvan 7 nieuw in map-constraint.test.ts)
  - `pnpm build` → BUILD-EXIT 0
  - `devenv shell -- pnpm exec playwright test` (buiten sandbox, na wachten op vrije
    8185/4185) → E2E-EXIT 0: 6 passed, 3 skipped (location-spec alleen desktop;
    map-zoom niet op fast-3g).
- Voor de PM/PO:
  - Op de telefoon liggen de zoekbalk (boven) en het merkpilletje (linksonder) óver de
    kaartrand, dus bij contain valt de noordrand (Groningen-label) deels onder de
    zoekbalk. Optie voor later: overlay-insets als padding in `constrainView` meenemen.
  - Randgeval: als de viewport krimpt zonder zoomwijziging (bv. draaien), blijft de
    zoom-uit-knop disabled tot de volgende zoom-event; NavigationControl luistert alleen
    naar 'zoom'. Knop is op telefoonbreedte sowieso verborgen; wheel/pinch werken wel.
  - Ingezoomd pan-bereik is kleiner dan voorheen (bounds 4 % i.p.v. oost 15 %).
