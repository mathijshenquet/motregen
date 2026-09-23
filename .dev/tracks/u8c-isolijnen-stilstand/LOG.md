# U8c — isolijnen: stilstand na refresh/scroll, perf op echte GPU (claude opus)

## 2026-09-23 20:10 — start
- Spec gelezen, U8b-LOG, isoline-layer/labels, App.tsx-isolijnpaden.
- PO-prioriteit 0 (mid-turn): fans op MacBook (DPR 2) met isolijnen aan. Eerst dat, dan de
  stilstandbug.
- Codelezing (vóór meting): de isolijnlaag vraagt zelf geen continue repaint (alleen
  `invalidate` bij wijziging + één catch-up-timer). MAAR de windlaag roept in elke `render()`
  `map.triggerRepaint()` aan → de hele kaart repaint altijd continu, met en zonder focus.
  In focus komt daar per repaint een schermvullende blit (composite) van de isolijntexture bij,
  op device-resolutie. Te meten: repaints/s, passes/s, pixels per pass/blit.
- Wachtrij (PO, na de perf): isolijnen uitfaden waar |∇T| klein is (smoothstep g_lo/g_hi °C/km,
  knoppen), vergelijken met (b) alpha op lijnsnelheid en (c) extra smoothing; labels volgen;
  screenshots licht+donker. Firefox-profiel van de PO lezen als het komt.

## 2026-09-23 20:35 — instrumentatie
- `IsolineLayer.stats`: passPixels/compositePixels (cumulatief), passMs/compositeMs (EMA) via
  `EXT_disjoint_timer_query_webgl2` (asynchrone queries, hooguit 8 in de lucht), anders CPU-tijd
  rond de draw met `timing: 'cpu'`. App telt `map.on('render')` → `repaints`. HUD (`?perf=1`):
  "Kaart: N repaints/s", "Isolijnen: passes/s · ms/pass · labels", "Isolijnen blit: ms · Mpx/pass".
- Harnas `web/tmp/u8c-cost.mjs` (preview tegen prod-data, 1440×900, DPR 2, SwiftShader).

## 2026-09-23 21:10 — PO-profiel (Firefox, macOS Retina MacBook, 13 s, 1 ms; main vóór U8c)
Bestand `web/tmp/profiles/po-macbook-firefox-2026-09-23.json.gz`; analyse `web/tmp/ffprof2.py`
(processed format v75: shared stack/frame/funcTable, `prefixOffset`, CPU uit `threadCPUDelta` µs).
- **Er stonden twee motregen-tabs open** (pid 39217 en 67332, beide http://ageq-mthq), beide
  aan het afspelen; 67332 draait een andere (oudere) bundle zonder labels/placement-kost.
  Alles hieronder telt dus dubbel t.o.v. één tab.
- CPU per thread over 13 s (100 % = één core):
  | proces/thread | CPU | aandeel core |
  |---|---|---|
  | GPU-proces Renderer (WebRender) | 11,3 s | 87 % |
  | GPU-proces CanvasRenderer (WebGL-uitvoering) | 9,9 s | 76 % |
  | tab 39217 GeckoMain (focus-tab, huidige build) | 6,2 s | 48 % |
  | tab 67332 GeckoMain | 5,1 s | 39 % |
  | parent Compositor | 1,5 s | 11 % |
  | GPU Compositor / parent main | 0,6 s / 0,6 s | 5 % / 5 % |
  | DOM workers (beide tabs) | ~0,4 s | 3 % |
- **Repaint-frequentie**: `requestAnimationFrame callbacks`/`DisplayList` in het venster:
  tab 39217 1228 in 12,95 s = **95/s**, tab 67332 1446 = **112/s** (mediaan-interval 8,5–8,8 ms:
  ProMotion 120 Hz). De kaart draait continu op schermfrequentie. Oorzaak: `WindLayer.render()`
  roept elke frame `map.triggerRepaint()` aan — met én zonder focus, ook gepauzeerd. De
  isolijnlaag vraagt zelf geen continue repaint.
- **CanvasRenderer (9,9 s): 54 % in `agxsTwiddleAddressCommon`** = Apple-GPU texture-swizzle op
  de CPU bij uploads. In de tab: `showFrame → setFrames → uploadRain → texImage2D` 1,02 s (16 %)
  resp. 0,95 s (19 %). `RainLayer.setFrames` uploadt beide regenframes (+ motion-encode) op
  **elke** cursorstap tijdens afspelen (~100/s), ook als het framepaar niet veranderd is (alleen
  de mix). Dit is de grootste enkele post in de hele opname.
- **`_updatePlacement` (MapLibre symboolplaatsing) 0,68 s = 11 % van de focus-tab** vs 0,04 s in
  de andere tab: `fadeDuration: 0` (U8b, stadslabels in place) laat MapLibre op élke render een
  *volledige* plaatsing forceren (`forceFullPlacement ||= fadeDuration === 0`, style.ts) — ×95/s.
- Isolijnen zelf (focus-tab): `prerender` 0,16 s + `updateIsolineLabels` 0,17 s (Newton 0,01,
  spawn 0,09) + `showIsolines` 0,04 + `showIsolineField` 0,01 ≈ **0,4 s = 3 % van één core**;
  `pass` (JS) 0,01 s. De GPU-kost van pass/blit valt niet uit te splitsen in CanvasRenderer
  (geen timer-markers); de uploads domineren daar.
- Conclusie: de fans komen van (1) regen-heruploads per frame tijdens afspelen, (2) continue
  repaint op 95–112 Hz door de wind, (3) volledige symboolplaatsing per frame door fadeDuration 0,
  (4) twee tabs. Isolijnen zijn een kleine post; wel maken ze (3) actueel (U8b-keuze).

## 2026-09-23 21:55 — perf-fixes op het PO-profiel (A regen-upload, B wind/overlays, C plaatsing, isolijnpass)
- **Regen-upload (profiel: 54 % CanvasRenderer + 16–19 % tab-main)**: `RainLayer.setFrames` uploadt
  alleen nog een framebuffer die nieuw is (`planRainUploads`: identiteit van de gedecodeerde
  frame-array = frame-index; stap vooruit = textures wisselen + één upload; motion idem). Mix per
  rAF is een uniform. Gemeten: afspelen 3,7–4 uploads/s (= framewissels), was 2 × ~100/s + motion.
- **Wind + regen op eigen canvassen** (`core/overlay-canvas.ts`, PO-suggestie, eigen afweging op de
  meetdata): elke custom layer draait ongewijzigd op een eigen doorzichtige WebGL2-canvas direct
  na de kaartcanvas (wind onder, regen boven: dezelfde volgorde als de oude lagenstapel; HTML-
  markers/labels blijven erboven). Matrix = `transform.getProjectionDataForCustomLayer()`, exact
  wat MapLibre aan custom layers geeft. Kaartbeweging tekent synchroon in het kaart-`render`-event.
  Gevolg: MapLibre rendert niet meer continu; in rust 0 kaartrenders, dus ook 0 symboolplaatsing
  en 0 isolijnblits. Terugval als kaartlaag als WebGL2 voor een tweede context ontbreekt.
- **Wind-cadans**: knop `Max. fps` (10–120, default 60) in de overlay (rAF-gating, 4 ms speling);
  verborgen tab = geen rAF = geen frames; onzichtbare wind (intensiteit×zichtbaarheid 0) vraagt
  geen volgende frame. Het deeltjesbudget meet nu tegen het eigen framebudget (30 fps is geen trage
  GPU). Er is geen "gepauzeerde" windtoestand: de deeltjes lopen bewust ook bij een stilstaande
  scrubber — dat is nu de enige rust-animatie (alleen de windcanvas).
- **fadeDuration 0 (C)**: niet teruggedraaid. De kost was "volledige plaatsing × kaartrenders/s";
  kaartrenders zijn nu 0 in rust en ≈ isolijnpasses/s bij afspelen+focus. Gemeten plaatsingstijd:
  rust 8,4 → 0 ms/s, afspelen 366 → 1,3 ms/s, afspelen+focus 177 → 8 ms/s. De flits-oplossing van
  U8b blijft zo gratis; een eigen crossfade/odometer is niet nodig voor perf.
- **Isolijnpass**: offscreen target in CSS-px × resolutie (default ½, DPR telt niet mee) → op DPR 2
  1440×900: 0,87 → 0,22 Mpx/pass; maxHz 20 → 10; shader: vroege return na de afgeleiden voor pixels
  zonder lijn of op doorgetrokken lijnen (stippel-trig alleen op oneven lijnpixels), stippel-
  richtingen uit een uniform-tabel i.p.v. 4× cos/sin. Fetches per pixel ongewijzigd 8 (bicubisch
  4 taps × B-spline-tijd 2 trilineaire fetches). `bench()` gebruikt nu dezelfde matrix als de pass.

### meting (`web/tmp/u8c-cost.mjs`, SwiftShader in VM, 1440×900 DPR 2, prod-data, 6 s)
| scenario | build | main% | kaart-repaints/s | passes/s | Mpx/pass | plaatsing ms/s | regen-frames/s | wind-frames/s |
|---|---|---|---|---|---|---|---|---|
| rust | vóór | 3 | 9,3 | 0 | – | 8,4 | (in kaart) | (in kaart) |
| rust | na | 4 | **0** | 0 | – | **0** | 0 | 36 |
| rust+focus | vóór | 3 | 9,1 (+9,1 blits) | 0 | – | 7,8 | | |
| rust+focus | na | 3 | **0** (0 blits) | 0 | – | **0** | 0 | 34 |
| afspelen+focus | vóór | 71 | 6,2 | 5,1 | 0,87 | 177 | | |
| afspelen+focus | na | **12** | 8,3 | 6,7 | 0,22 | 8,3 | 4,2 | 8,3 |
| afspelen | vóór | 79 | 8,5 | 0 | – | 366 | | |
| afspelen | na | **10** | 1,7 | 0 | – | 1,3 | 10 | 20 |
SwiftShader haalt hier ~9 fps; "9 repaints/s" vóór = alles wat hij haalt (continu). Totale
Chromium-CPU blijft ~1100–1300 % want SwiftShader rastert de windcanvas (fullscreen fade+composite
op DPR 2) in software — geen maat voor een echte GPU; daarvoor de PO-heropname.
- Harnas-valkuil (geen bug): Afspelen klikken terwijl de muis in de scrubber staat = U9-hover-scrub
  → "hervat na verlaten"; knop toont Pauzeren maar de tijd staat stil tot de muis weggaat.

## 2026-09-23 22:30 — stilstandbug, invalidatie, PO-heropname 22:07
### stilstand (spec-opdracht 1)
- Harnas `web/tmp/u8c-stall.mjs` (focus vast + afspelen, prod-data): refresh met zelfde runs /
  nieuwe HARMONIE-run (chunk-URL's `?run=2`) / nieuwe `now`, pan, scroll-zoom, resize, verborgen
  tab (visibilitychange), andere tab + terug, volledige reload — op main (vóór) én deze branch:
  snede loopt door, 6–10 passes/s. Geen stilstand in die paden. Focus-pin staat niet in
  localStorage (koude start = niet vastgezet), dus (d) bestaat niet als pad.
- **Wel gevonden, reproduceerbaar op prod**: de gevoelstemperatuur-tijdlijn begint bij het eerste
  HARMONIE-frame (run 17Z → 18:00), de regenhistorie 3 u terug (16:50). `frameBlend` klemt
  daarvóór op frame 0 → tijdens afspelen door de historie **staan de isolijnen stil** terwijl regen
  en wind doorlopen (`web/tmp/u8c-scrub.mjs`: 17:31 → t = 0,000; 18:03 → 0,066). Na elke refresh
  met een nieuwe run schuift die grens op en wordt het bevroren stuk groter — past bij "na een
  refresh stonden ze stil". Fix: `timelineCoverage` → isolijnen + labels faden buiten de uurframes
  lineair uit over 20 min (`ISOLINE_EDGE_FADE_MS`); bij dekking 0 is de laag onzichtbaar en doet
  geen pass. Met de U4-`hist`-chunks in prod (na de ingest-upgrade) krimpt het gat tot vóór de
  oudste historierun.
- **Invalidatie per uurlaag**: de laagsleutel was `eerste chunk-URL | lengte | blur`; een nieuwe run
  die middenin frames vervangt bij gelijke lengte liet de oude run in het volume staan (lijnen
  oud, labels — per chunk gecachet — nieuw). Nu `IsolineLayer.setFrameKeys` per index
  (chunk#frame|blur): gewijzigde lagen worden gemarkeerd, opnieuw geüpload (upload-race bewaakt
  met `frameKey`) en de snede herrekend; de laag wordt alleen herbouwd als de diepte verandert.
  Centraal punt = `showIsolineField` (manifest-apply en tijdlijnwissel lopen via de tijdlijn-memo's);
  kaartbeeld/resize zit in de camera-sleutel van `prerender`; visibility is een no-op (rAF).
- e2e `focus.spec.ts`: "pinned isolines re-render after a manifest refresh with a new run and after
  a scroll-zoom, then rest again" (uploads én passes stijgen na refresh, passes na zoom, daarna
  passes/labelRounds/kaart-repaints stil). Pannen verschuift op minimale zoom niets (U6-contain),
  dus scroll-zoom.
- Harnas-valkuil: Afspelen klikken met de muis in de scrubber = U9 hover-scrub ("hervat na verlaten").

### PO-heropname 22:07 (`web/tmp/profiles/po-macbook-firefox-2026-09-23-2207.json.gz`, 31,6 s, build 0f20f4f op :4323)
| thread | 21:35 (main, 13 s) | 22:07 (U8c, 31,6 s) |
|---|---|---|
| GPU CanvasRenderer | 9,9 s = 76 % | 3,4 s = **11 %** (twiddle 5,4 s → 0,66 s) |
| GPU Renderer | 87 % | 42 % |
| motregen-tab main | 48 % + 39 % (twee tabs) | 39 % (één tab) |
- Per seconde (`web/tmp/fftimeline.py`-snippet in LOG-historie): in rust geen MapLibre-`_render`
  meer (main ~19 %). Maar bij **afspelen + focus** (s 16–30) nog ~120 kaartrenders/s: elke
  `setTime` deed `triggerRepaint`, terwijl de pass maar 10 Hz mag — 110 renders/s alleen om de
  oude snede te blitten, incl. volledige plaatsing. Fix: `setTime` vraagt pas een render aan als
  het maxHz-venster open is (anders catch-up-timer). Gemeten: afspelen+focus kaartrenders ≈ passes.
- rAF bleef 120/s in rust door lege gating-ticks van de fps-grens → vervangen door een timer tot
  vlak vóór de volgende toegestane frame. Afspeellus en regencanvas volgen nu dezelfde
  `Max. fps` (default 60): op 120 Hz geen dubbele cursor-effecten meer.
- NB Firefox-functienamen in de geminificeerde bundle zijn onbetrouwbaar (`update`,
  `_calcMatrices` als rAF-callback); de boom eronder is de MapLibre-render + plaatsing.

### Gates op 0f20f4f+ (vóór de throttle/timer-commit)
- `MOTREGEN_E2E_PORT=4321 MOTREGEN_E2E_DATA_PORT=8321 direnv exec .. pnpm e2e` → E2E-EXIT: 0 (20 passed, 13 skipped)
