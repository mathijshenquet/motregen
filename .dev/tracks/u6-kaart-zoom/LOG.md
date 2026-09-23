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
