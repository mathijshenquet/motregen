# U26 — pin-navigatie (worker: claude opus 5.5)

## 2026-09-25 08:55 UTC — start
- Spec gelezen (`.dev/specs/track-u26-pin-navigatie.md`), App.tsx-kaartlaag, location-memory,
  map-constraint, location/map-zoom e2e, U2/U14-LOG. `pnpm install --frozen-lockfile` → exit 0.
- MapLibre is 5.24.0. Bevindingen in de bron:
  - `TouchPanHandler` pant met elk aantal vingers; `dragPan.disable()` zou dus ook twee-vinger-pan
    uitzetten (pinch-zoom zit apart in `TwoFingersTouchZoomHandler`, pant niet). MapLibre's eigen
    splitsing is `cooperativeGestures`: minTouches 2 voor touch-pan, container krijgt
    `touch-action: pan-x pan-y` (pagina scrolt), maar ook ctrl+wiel voor zoom op desktop.
    Keuze: `cooperativeGestures` alleen aanzetten bij `(pointer: coarse)`; de hint-overlay
    ("gebruik twee vingers") via CSS verbergen — spec: één vinger op de kaart doet niets.
  - `Marker({draggable})` hangt aan kaart-mouse/touch-events en kent geen edge-scroll bij stilstaande
    vinger. Keuze: eigen Pointer-Events-drag op het pin-element (pointer capture, propagatie gestopt
    zodat MapLibre-handlers niets zien), rAF-lus voor edge-scroll, eigen dubbeltik-herkenning
    (dblclick is op touch onbetrouwbaar).
  - `TransformConstrainFunction` is `(lngLat, zoom) → {center, zoom}`: bearing/pitch kunnen daar niet
    op 0. Hard uit via opties (`dragRotate`, `touchPitch`, `pitchWithRotate`, `maxPitch: 0`) +
    `keyboard.disableRotation()` + `touchZoomRotate.disableRotation()`. Geen code-pad met bearing
    (grep). e2e borgt het.
- Load bij start 24.6 → e2e later.

## 2026-09-25 09:05 UTC — implementatie + unit/build
- `web/src/core/pin-navigation.ts`: `edgePanVelocity` (pure kern), `attachPinNavigation`
  (pointer-drag, rAF edge-scroll, dubbeltik), `PAN_ZOOM_ONLY`, `restrictMapGestures`.
  App.tsx: marker wordt één keer gemaakt en daarna verplaatst (was: remove+new per pick),
  `revealPoint` (easeTo alleen als het punt buiten/in de rand van het vrije kaartvlak valt),
  startfix, `__motregenCamera`-hook voor e2e.
- Edge-scroll-keuze: de pin blijft onder de vinger. In de 48 px-rand pant de kaart met
  max(dwell ∝ diepte (12 px/s per px, ≤ 576 px/s), sleepsnelheid richting die rand) —
  "meebewegen met de sleepsnelheid" + doorlopen bij stilhouden. Topmarge telt vanaf de
  bedekte top-inset (versheidspil/zoekpil). Contain-constraint blijft: panBy loopt door
  `transformConstrain`.
- Startfix (`grantedStartFix` in location-memory): Permissions API `granted` → één
  `getCurrentPosition` (timeout 10 s, maximumAge 60 s), label "Mijn locatie". Geen
  Permissions API (Safari < 16), prompt/denied/fout → huidig gedrag, zonder prompt. Fix buiten
  `MAP_CONTAIN_BOUNDS` (buitenland) → genegeerd (geen data daar). Komt de fix binnen nadat de
  gebruiker al iets anders koos, dan wint de keuze van de gebruiker.
- Trade-off `cooperativeGestures` op coarse pointers: een *muiswiel* zoomt daar alleen met ctrl
  (trackpad-pinch stuurt ctrlKey en werkt wel). Op telefoons irrelevant; `map-zoom` e2e
  (Pixel 5) houdt nu ctrl vast tijdens het wielen.
- Lange-druk-pin-verplaatsen niet gebouwd (optioneel in spec; zou met pagina-scroll vechten).
- Edge-scroll pant per frame met `panBy(duration 0)` → `moveend` per frame; die listeners
  (debounced view-opslag, isolijnlabels alleen in temperatuurmodus) zijn goedkoop genoeg.
- Fresh worktree: `pnpm synthgen` (buiten sandbox: tsx-pipe EPERM) nodig voor mrf.test-fixture.
- Receipts (vanuit `web/`, synchroon):
  - `pnpm typecheck` → TYPECHECK-EXIT: 0
  - `pnpm test` → TEST-EXIT: 0 (42 files, 242 tests)
  - `pnpm build` → BUILD-EXIT: 0
- Draft-PR: https://github.com/mathijshenquet/motregen/pull/56
- e2e wacht op load < 16 (was 30).

## 2026-09-25 09:25 UTC — PO-aanvulling: pin wordt subtiel afgekapt
- Oorzaak (MapLibre 5.24 `marker.ts`): het standaardpinpad raakt de viewBox-randen (x 0/27, y 0),
  element is 27 px breed → `translate(-50%,-100%)` zet het op x.5 px, en `.maplibregl-marker` heeft
  `will-change: transform` → eigen compositing-laag ter grootte van de box; antialiasing buiten de
  box valt weg (boven/links/rechts; onder staat de schaduw-ellips met ruimte).
- Fix: `.location-pin { padding: 2px 2px 0 }` + `.location-pin svg { overflow: visible }`. Geen
  padding onder en symmetrisch opzij → onder-midden (het anker) ongewijzigd. Verificatie (200 %-crops
  op zoom 7,3 en 8,7, anker-meting met/zonder fix) volgt na de lopende e2e (één Chromium).
- Eerste gerichte e2e-run (09:02, load 14,4): FULL-GATE-EXIT: 1 — 11 passed, 2 failed, 14 skipped.
  Beide fouten in mijn testaannames: (1) svg-onderkant ≠ anker (6,5 px) → centreer-check nu tegen
  de gekalibreerde startpositie van de pin; (2) startlabel bij geseede view is "Utrecht", niet
  "De Bilt" → vergelijken met het label van vóór het gebaar. Herhaalrun staat in de hostlock-rij.
