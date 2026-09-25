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
