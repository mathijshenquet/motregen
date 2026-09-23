# Track U6 — kaartbegrenzing: contain in plaats van cover (claude opus)

Read first: `AGENTS.md`, `web/src/core/map-frame.ts`, `web/src/App.tsx`
(map-constructor: `maxBounds: mapMovementBounds`, `applyMapDetailLimit`,
de U2-`moveend`-hook en `initialMapView`), `web/src/core/location-memory.ts`.
Your LOG: `.dev/tracks/u6-kaart-zoom/LOG.md` — committed, append-only,
timestamped. Branch: `track/u6-kaart-zoom` vanaf main (bevat U2 + U5).
Eigen worktree.

## PO-punt (2026-09-23)

"We beperken de kaart, goed, maar het gedraagt zich als object-fit: cover
terwijl we object-fit: contain met NL willen." Nu: `maxBounds` dwingt de
viewport bínnen de (gepadde) NL/Vlaanderen-bounds, dus op een smal scherm
(telefoon, portrait) kun je nooit heel Nederland in beeld krijgen, en
uitzoomen stopt zodra de viewport de bounds raakt.

## Gewenst gedrag

- Uitzoomen kan tot het punt waarop `NETHERLANDS_FLANDERS_BOUNDS` (plus een
  kleine marge) precies in de viewport past — per as de krappe as bepaalt
  (contain). Verder uitzoomen niet; de minimale zoom volgt de viewport en
  wordt bij resize/orientatiewissel herberekend (`map.cameraForBounds` of
  eigen berekening; kies, motiveer).
- Pannen, per as: is de viewport-span ≥ de bounds-span, dan blijven de
  bounds volledig in beeld (contain: je kunt NL niet uit beeld schuiven; de
  kaart mag "zweven" met basemap-rand eromheen). Is de viewport-span
  kleiner, dan blijft de viewport binnen de bounds (cover, zoals nu).
  Implementeer als centrum-clamp op `move` (of via een transform-
  constraint als MapLibre dat schoner toelaat) — zonder rubberband/jitter
  tijdens pinch-zoom en fling; test op het mobiele profiel.
- `maxBounds` vervalt (het is de oorzaak). Bestaande `minimumMapWidthKm`-
  detaillimiet (inzoomgrens) blijft. U2's opgeslagen kaartpositie blijft
  werken en wordt bij herstel ook geclampt.
- Startweergave zonder opgeslagen view: NL "contain" gecentreerd (in plaats
  van het vaste center/zoom 5.3/52.15/6.4), zodat desktop én telefoon heel
  NL zien.
- Zet de zuivere clamp-/fit-wiskunde in `core/map-frame.ts` (of een nieuw
  `core/map-constraint.ts`) met unit tests: contain-as, cover-as, gemengd
  (portrait: lat cover, lng contain), resize herberekent minZoom.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` green (synchrone
exit status in LOG; de e2e-poorten 8185/4185 zijn gedeeld met andere
tracks — wacht tot vrij, kill niets). Screenshots desktop + Pixel-5-
portrait op minZoom in de LOG-map. Draft-PR vroeg. Geen codex. U4 werkt
parallel in App.tsx (urenoverzicht, kaartklok) — houd je diff bij het
map-constructor/move-pad.
