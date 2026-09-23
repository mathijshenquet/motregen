# U8b — isolijnen 1 °C, streep/stip, alleen lijnlabels, vloeiend (worker: claude opus)

## 2026-09-23 16:40 — meting vóór (waar zit de schok?)
- Opzet: `vite build --outDir tmp/dist-before` op main-tip a74a7c2, `vite preview` met
  `MOTREGEN_DATA_ORIGIN=http://100.108.127.86:4300/data` (echte KNMI-data), Playwright-script
  `web/tmp/measure.mjs` (ongecommit, tmp/ is ignored): wikkelt `Worker` om rondes van de
  isolijn-worker te tellen/timen, rAF-intervallen, 10–12 s afspelen met vastgezette focus.
- feels_like_c = HARMONIE, **uurframes** (24 stuks). Lineaire blend tussen twee uurframes is
  in de tijd alleen C0: elke lijn verandert op elk heel uur van richting/snelheid.
- Desktop (SwiftShader): 3,9 worker-rondes/s → **setData-gap p50 273 ms, p95 680 ms**;
  worker p50 25 / p95 178 / max 232 ms; aantal lijnen springt 44↔58 tussen rondes
  (ringen boven/onder MIN_RING-drempel en kwantisatie van de mix op 1/20).
  fps 9,2 (SwiftShader, geen GPU-gate).
- Mobiel (4× CPU-throttle; worker-CPU wordt niet gethrottled): 5,4 rondes/s, gap p50 110 /
  p95 413 ms, worker p50 51 / p95 101 ms; fps 10,5.
- Conclusie: de schok zit in (1) de update-cadans ~4/s i.p.v. per frame — elke setData is
  een sprong, (2) topologie (ringen die verschijnen/verdwijnen) per ronde, (3) de C0-knik
  per uur. (1)+(2) zijn inherent aan CPU-geometrie; (3) aan de lineaire tijdsblend.

## 2026-09-23 16:50 — keuze: GPU-variant (a) + temporele B-spline (PO-aanvulling)
- GPU: contouren in een fragmentshader, per frame continu → per definitie geen sprongen;
  topologie verandert dan alleen continu (lijnen krimpen tot punt). Variant (b) houdt
  sprongen per update (hooguit kleiner) en kost meer CPU op mobiel.
- Veld: per uurframe éénmalig blur + no-data-vullen (cache), per rAF een gewogen som van de
  frames in het tijdvenster op de CPU (47k cellen × ≤8 frames, sub-ms) → één RG16F-texture
  (waarde, geldig). Shader: bicubische B-spline-sampling (4 bilineaire taps) zodat de lijnen
  geen knikjes op celgrenzen hebben; AA-lijn via afgeleiden; pariteitstreep in de shader.
- Temporeel (PO-aanvulling): gewichten uit een kubische B-spline-kern over de uurframes met
  schaal `venster` uur (support 4·venster frames, genormaliseerd). venster 0 = oude lineaire
  blend. B-spline is C2 in de tijd → geen richtingsknik per uur; niet-interpolerend
  (lagere nauwkeurigheid, PO akkoord). Meten: knik (snelheidssprong op de uurgrens) en
  afwijking t.o.v. de exacte uurvelden, per venster.
- Labels: blijven uit de worker-geometrie (zelfde temporele gewichten), op een lagere cadans
  (knop), alleen de symbol-laag; de lijnlaag vervalt.

## 2026-09-23 17:20 — eerste GPU-versie (c681547), meting temporele kern, punt 5
- Eerste versie: per rAF CPU-mix van de uurframes + RG16F-upload + fullscreen contour-shader.
  Stippel i.p.v. streep op oneven graden (de basiskaart tekent provinciegrenzen gestreept);
  richting-onafhankelijk via 16 hoekbakken (fragmentshader kent geen booglengte).
  Stadslabels: `text-opacity = 1 − focus` + `text-ignore-placement` bij focus ≥ 0,5 (niet
  verbergen: dan vuurt mouseleave en oscilleert de hover).
- Temporele kern op echte data (`web/tmp/temporal.ts`, run 11Z, 44 935 cellen, blur 2):
  | venster | knik |Δv| op uurgrens | / snelheid | afwijking t.o.v. uurveld gem / p95 / max |
  |---|---|---|---|
  | 0 lineair | 0,396 °C/u | 0,81 | 0 / 0 / 0 |
  | 1 B-spline | 0,007 | 0,01 | 0,066 / 0,209 / 0,799 °C |
  | 2 | 0,003 | 0,01 | 0,173 / 0,564 / 1,879 |
  | 3 | 0,002 | 0,01 | 0,277 / 0,913 / 2,550 |
  Venster 1 haalt de richtingsknik weg voor ~0,07 °C gemiddelde afwijking; breder levert
  niets extra's op en kost nauwkeurigheid → alleen 0 en 1 als knop.
- Punt 5 (stadslabels 16°→17°): gekozen (a) `fadeDuration: 0` op de kaart (`?labelfade=300`
  voor A/B). Gewijzigde symbooltekst is voor MapLibre een nieuw symbool (CrossTileSymbolIndex
  matcht op tekst) → met fade flitst het weg/in; zonder fade in-place wissel, en de t3j-dodge
  (8 variabele ankers, collision met plaatsnamen) blijft intact. Kosten: fps fade0 vs fade300
  9,2/10,5 en 8,3/8,4 (ruis, host-load ~50), zelfde labelselectie. Nadeel: ook basiskaartlabels
  poppen i.p.v. faden bij zoom-collisions. (b) HTML-markers met odometer niet gebouwd: MapLibre
  geeft het gekozen variabele anker niet prijs, dus markers verliezen de t3j-collision met
  plaatsnamen (PO-bug van 08-31). Voor PO: odometer kan, maar dan met eigen dodge (vast anker
  onder de stip + queryRenderedFeatures op plaatslabels) — aparte beslissing.
  (Video's van de A/B waren 16–18 MB; niet gecommit, lokaal in web/tmp/video-labels-*.)
- Bestaande bug gevonden (ook op main a74a7c2): na een runtime themawissel (knop Licht →
  Systeem → donker) verdwijnen de stadstemperatuurlabels; bij initieel donker thema niet.
  Buiten scope (App.tsx-stijlwissel), gemeld voor de orchestrator.

## 2026-09-23 17:40 — PO-bijsturing: nul werk in rust, snede door (x,y,t), kosten
- Herbouwd (`core/isoline-layer.ts`): uurframes als lagen van één RG16F-**3D-texture** (x,y,t),
  per uurframe éénmalig geblurd/gevuld en geüpload (`texSubImage3D`). Snede t = scrubber:
  lineair één trilineaire fetch, B-spline in de tijd twee (GPU Gems-truc). Veld als impliciete
  afstandsfunctie (T−L)/|∇T| → uniforme lijnbreedte/AA, alle niveaus via fract.
- Contour-pass in `prerender` naar een offscreen RGBA8-target, alleen het zichtbare extent
  (de grid-quad met de kaartmatrix; buiten beeld wordt geclipt), en alleen als de snede
  verandert: kaartbeeld direct, tijd/stijl/lagen hooguit `maxHz` (default 20, knop), daartussen
  hergebruik. Elke andere repaint (windpartikels) = één blit. Geen eigen rAF-loop; de enige
  timer is een catch-up-repaint als een tijdwijziging binnen het 20-Hz-venster viel.
  Resolutie default 0,5 (knop) met ondergrens 1 offscreen-px per CSS-px (op DPR 1 smeert
  halve resolutie de stippel uit — screenshot b1-crop).
- Labels: contourgeometrie per uurframe éénmalig in de worker, gecachet per frame+stap+blur+
  glad; label volgt het dichtstbijzijnde uur. Labelcadans-knop vervallen.
- Precompute van de *lijnen* (optie PO-4) afgewezen op kosten én gedrag: geometrie kost
  13,9 ms/uurframe (stap 1, desktop node) + GeoJSON-tiling, en twee uurgeometrieën laten zich
  niet tweenen (andere topologie) — alleen crossfaden (dubbele lijnen). GPU-snede: zie bench.

### kosten (vóór = main a74a7c2, na = deze branch; SwiftShader, host 16 cores load 33–58)
Harnas `web/tmp/cost.mjs` (CPU-busy% = alle Chromium-processen incl. SwiftShader-GPU via
/proc; main-busy% = CDP TaskDuration; 8 s venster; vóór/na geïnterleaved). Absolute CPU% is
ruis-gedomineerd (identieke "rust zonder focus"-runs: 211 vs 266 %); lees de structurele
tellers en main-busy.

Desktop (1×):
| scenario | build | CPU% | main% | fps | frame p50/p95 ms | passes/s | worker-rondes/s |
|---|---|---|---|---|---|---|---|
| rust | vóór | 211 | 38 | 5,2 | 183/600 | – | 0 |
| rust | na | 266 | 5 | 7,0 | 150/283 | – | 0 |
| afspelen | vóór | 296 | 73 | 6,5 | 150/367 | – | 0 |
| afspelen | na | 433 | 81 | 8,6 | 117/283 | – | 0 |
| afspelen+focus | vóór | 359 | 81 | 6,4 | 133/417 | – | 4,25 |
| afspelen+focus | na | 295 | 81 | 4,4 | 217/650 | 3,7 | 0,25 |
| rust+focus | vóór | 322 | 5 | 7,1 | 133/267 | – | 0 |
| rust+focus | na | 309 | 4 | 7,0 | 133/267 | **0** | **0** |

Mobiel profiel (4× CPU-throttle):
| scenario | build | CPU% | main% | fps | frame p50/p95 ms | passes/s | worker-rondes/s |
|---|---|---|---|---|---|---|---|
| rust | vóór | 399 | 15 | 7,5 | 117/267 | – | 0 |
| rust | na | 383 | 12 | 7,6 | 133/267 | – | 0 |
| afspelen | vóór | 381 | 72 | 6,6 | 133/383 | – | 0 |
| afspelen | na | 367 | 68 | 7,7 | 83/417 | – | 0 |
| afspelen+focus | vóór | 397 | **85** | 5,6 | 167/283 | – | **4** |
| afspelen+focus | na | 382 | **46** | 3,6 | 267/483 | 3,4 | **0,12** |
| rust+focus | vóór | 383 | 11 | 6,7 | 150/200 | – | 0 |
| rust+focus | na | 403 | 16 | 7,5 | 133/250 | **0** | **0** |

- Rust (met en zonder focus) = main: 0 contour-passes, 0 worker-rondes; zonder focus doet de
  laag niets (opacity 0 → vroege return, geen effecten).
- Afspelen+focus mobiel: main-thread 85 % → 46 % (worker 4 → 0,12 rondes/s: één per uur).
- fps met focus ligt onder SwiftShader ~25 % lager dan zonder, óók bij maxHz 5 (A/B 60/20/5 Hz:
  5,6/5,0/4,9 en 4,5/3,6/6,5 fps vs zonder focus 7,4/6,0) → niet de contour-pass maar de
  schermvullende blit per repaint; SwiftShader is fill-rate-gebonden (software). Op een echte
  GPU is één texture-fetch per pixel verwaarloosbaar; te bevestigen op echte hardware.
- Contour-pass zelf (`__motregenIsolines().bench(60, res)`, readPixels-sync; gl.finish synct in
  Chrome niet): DPR 2 (2560×1600), mediaan van 5×60: bilineair res 1 / 0,5: 0,50 / 0,46 ms;
  bicubisch 0,50 / 0,33 ms; 4×-throttle 0,48/0,33 resp. 0,41/0,25 ms. Bicubisch niet meetbaar
  duurder → default aan (haalt de celhoekjes van bilineair weg, zichtbaar in b2-crop).
  **Voor PO: dezelfde bench op de eigen laptop in de console** (focus vastzetten, dan
  `__motregenIsolines().bench(60)`), want hier is geen echte GPU (virtio-gpu VM).
- Blur/ingest: dekwantiseren 0,31 ms, blur 2× 0,64 ms (4× 1,30), vullen 3,1 ms per uurframe,
  éénmalig per frame (`web/tmp/blurcost.ts`). Blur is níet het dure deel → geen ingest-track
  nodig voor kosten; een voorgesmoothed/grover veld van de ingest zou alleen kwaliteit/bytes
  raken (compressed frame p50 13,2 kB). Duurste CPU-post was de label-geometrie (13,9 ms per
  ronde bij stap 1), nu één keer per uurframe.
- Frametijd-trace (`web/tmp/trace.mjs`): onder SwiftShader op deze host bij ~5 fps niet
  scheidend (frames zonder pass zijn per constructie de korte binnen het 50-ms-venster).
  Uploads: 2 per 12 s (één per nieuw uurframe), label-rondes 1–2 per 12 s.

## 2026-09-23 18:00 — lijnlabels als ankers op het (x,y,t)-oppervlak (PO-eis)
- `core/isoline-labels.ts`: elk label is een persistent anker (niveau, kolom, rij). Na elke
  contour-pass (`IsolineLayer.onPass`, dus exact dezelfde snede en ≤20-Hz-cadans als de lijnen)
  schuift het met twee Newton-stappen p ← p − (T−L)∇T/|∇T|² terug op zijn niveau; T en ∇T via
  dezelfde kubische B-spline (ruimte) en tijdgewichten (`sliceWeights`) als de shader, op de
  CPU-kopie van de uurvelden. Despawn met fade (300 ms, reduced motion direct) als het niveau
  wegvalt (residu > 0,1·stap, geldigheid, of een Newton-stap > 2 cellen = sprong naar een andere
  lijn) of als twee ankers dichter dan `minDistancePx` (knop, 90) naderen — de oudste blijft.
  Spawn langs de uurgeometrie uit de worker (per uurframe gecachet) met `spacingPx` (knop, 260),
  alleen in beeld, bij nieuwe geometrie, na moveend of hooguit elke 750 ms; max 60 ankers.
  Rotatie = tangent (loodrecht op ∇T), rechtop gehouden.
- Keuze HTML-`Marker` i.p.v. point-symbols op een GeoJSON-bron: een setData per snede laat
  MapLibre asynchroon her-tilen (label loopt een of meer frames achter op de GPU-lijn en het
  kost een worker-rondje per update); markers zetten de positie synchroon in dezelfde frame.
  Geen MapLibre-collision in beide gevallen. De GeoJSON-symbollaag voor labels is weg.
- Meting glijden (`web/tmp/glide.mjs`, 12 s afspelen met focus, SwiftShader ~7 fps = ~4
  gesimuleerde minuten per frame): verplaatsing per label per frame p50 1,0 / p95 4,1 / p99 7,3 /
  max 15 px; uitschieters > 5 px verspreid over 33 van 85 frames, 1–7 labels per frame (nooit
  alle tegelijk) → normaalsnelheid van de lijn, geen sprongen. Bij 60 fps ≈ 1/12 daarvan.
  48 spawns, 24 despawns, ~26 levend; 4 worker-rondes in 12 s (één per nieuw uur).
  Video: `afspelen-focus-na.webm` (vóór: `afspelen-focus-voor.webm`); beeld `licht-focus-ankers.png`.
- e2e uitgebreid: labels verschijnen in focus en zijn na de uitfade weg; nieuwe test "pinned
  focus at rest does no contour or worker work" (passes en labelRounds gelijk over 2 s).

### Gates op deze tip (synchroon, web/)
- `direnv exec .. pnpm typecheck` → TYPECHECK-EXIT: 0
- `direnv exec .. pnpm test` → TEST-EXIT: 0 (170 tests)
- `direnv exec .. pnpm build` → BUILD-EXIT: 0
- `MOTREGEN_E2E_PORT=4303 MOTREGEN_E2E_DATA_PORT=8303 direnv exec .. pnpm e2e` → E2E-EXIT: 0
  (10 passed, 11 skipped). Eerdere run op c681547+ gaf 1 rood in perf.spec mobile-4g
  (manifest-refresh now-line binnen 10 s, host-load ~50; de fast-3g-variant slaagde); kwam niet
  terug.

### Open
- Voor PO: (1) bench op echte hardware: focus vastzetten, console `__motregenIsolines().bench(60)`
  (ms per contour-pass) — hier alleen SwiftShader in een VM; (2) odometer-stadslabels (b) als
  aparte keuze (kost de t3j-collision tenzij eigen dodge); (3) stippel vs streep en
  lijnkleur/-dikte beoordelen (`donker-focus-crop.png`, `licht-focus-ankers.png`).
- Voor orchestrator: bestaande bug op main — stadslabels weg na runtime-themawissel.
- Ingest: geen gesmoothed/grover veld nodig voor kosten (blur 0,64 ms per uurframe, éénmalig).
