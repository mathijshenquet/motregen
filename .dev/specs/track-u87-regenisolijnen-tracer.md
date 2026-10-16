# U87 — regenisolijnen als getraceerde lijnen (zelfde logica als temperatuur en druk)

Eigenaar: worker `u87-regen-tracer` (gpt-6.1-sol). Orkestrator: Claude. Branch `track/u87-regen-tracer` vanaf
`origin/int/eval-2026-10-16` (daar staan de huidige regenisolijnen, U86). Track-LOG `.dev/tracks/u87-regen-tracer/LOG.md`
(append-only, tijd uit `date`). **Slice**: geen e2e of volledige suites; typecheck, de unit-tests die je toevoegt of raakt,
en zelf kijken. De orkestrator gate op de integratiebranch. Eén eigen preview op poort 4310, en die stop je als je klaar
bent. Commit en push elke 15–20 minuten. Geen prod-acties.

## Probleem
De regenlijnen (buitenrand bij menging `rand` + isolijnen 1 · 4 · 13 mm/u, U86) worden per pixel in de regenshader
getekend (`web/src/core/rain-layer.ts`, `contourValue` / `u_outline_*`; sinds U86 op een kubische B-spline). Ze zijn
grillig en volgen het raster in trapjes. PO-voorbeelden 2026-10-16: (1) nacht, Noordzee voor Noord-Holland; (2) **18:52 CEST
vandaag, NW–NNW van Texel** (HARMONIE-tijd: cellen van 2,5 km op ons 1 km-raster → blokken → trapjes). De temperatuur- en
drukisolijnen zijn wél glad: die worden in een worker getraceerd (`isoline-tracer*.ts`, `isoline-contours.ts`), met splines
gladgemaakt (`isoline-spline.ts`) en als geometrie getekend (`isoline-layer.ts`). PO: "wellicht kan je gewoon dezelfde
logica als voor de andere isolijnen gebruiken?"

## Ontwerp (volg dit; wijk af met reden in de LOG)
1. **Per regenframe één keer traceren** in de worker, met de bestaande tracer en spline, op de drempels van de buitenrand
   (`DATA_EDGE_INDEX`, zie `rainOutline`) en de isolijnen (`RAIN_ISOLINE_RATES[look.isolines]`). Werk in bytes (log-
   schaal) zoals het veld; cellen zonder data (255) gelden als droog. Gebruik het voorgefilterde veld als dat er is
   (`rain-smoothing.ts`), zodat de lijn bij de getekende regen past. Cache per frame; nooit per animatiebeeld traceren.
2. **Meeschuiven met de bewegingsvectoren op de GPU**, exact zoals de regen in `rain-layer.ts`: lijnen van het linker
   frame verschuiven met `+w·v`, die van het rechter frame met `−(1−w)·v` (zelfde `velocity`, cap en fallback als de
   regenshader, gelezen uit dezelfde motiontextuur in de vertexshader), en ze vloeien over met dezelfde
   `blendWeight(mix)`. Zo liggen de lijnen tijdens afspelen op de bui.
3. **Tekenen** met de lijnrenderer en het profiel van de bestaande isolijnen (`lineProfile`, `isolineWidthCss`,
   anti-aliasing): buitenrand iets dikker, binnenlijnen dunner en zachter; kleuren uit `rainOutlines(look)`. De legenda
   linksonder (U86) blijft.
4. **De per-pixellijnen uit de regenshader halen** zodra dit werkt (de B-spline mag dan ook weg).

## Bewijs
- Zelf schermbeelden op de twee PO-plekken (live data via preview 4310; HARMONIE vandaag 16:52Z rond 4,5°E 53,2°N; en een
  radar/nowcast-tijd met buien), dag en nacht, 1280 en 390: geen trapjes, lijnen glad en op de regenrand.
- Tijdens afspelen op de lijn blijven: neem met `web/scripts/rain-motion-strip.ts` (vaste camera via
  `window.__motregenJumpTo`, `REPRO_WAIT_MS`) een reeks per 30 s over één interval van 5 min en kijk of de lijnen met de
  regen meeschuiven zonder voor of achter te lopen.
- Kosten: meet de tracetijd per frame in de worker en de extra tijd per getekend beeld (bestaande `perf`-fasen); meld ze.

Leesbaarheid: geen één-letternamen, geen slimme one-liners, commentaar alleen voor het niet-vanzelfsprekende waarom.
Een eerlijke "dit lukt niet zo, want…" is evenveel waard als groen. Meld **"U87 slice"** met head-sha, de beelden en de cijfers.
