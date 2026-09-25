# U41 — stil in rust (LOG, append-only)

## 2026-09-25 21:10 — start, meetopstelling, nulmeting
- Worker: claude opus 5.5, branch `track/u41-stil-in-rust` vanaf `4007903` (main + spec).
- Meting: `.dev/tracks/u41-stil-in-rust/measure.mjs` — prod-build (`pnpm build`), `vite preview`
  met `MOTREGEN_DATA_ORIGIN=http://localhost:8080` (live ingest), headless Chromium (swiftshader,
  1280×800, DPR 1), 4 s inloop, dan 30 s afspelen. CDP `Performance.getMetrics` (TaskDuration/
  ScriptDuration = hoofddraad) + proces-CPU uit /proc (renderer = hoofddraad + workers + compositor;
  gpu = swiftshader). Tellers uit het bestaande meetpunt `__motregenIsolines()` (map `render`-events,
  overlay-draws, traces, labelrondes) — geen nieuwe dev-teller nodig.
- Repro: `cd web && pnpm build && MOTREGEN_DATA_ORIGIN=http://localhost:8080 pnpm exec vite preview
  --port 4341 --strictPort` ; `direnv exec .. node ../.dev/tracks/u41-stil-in-rust/measure.mjs
  http://127.0.0.1:4341/ <label>` (buiten de sandbox; browsers via devenv).
- Kanttekening: deze host heeft geen GPU; swiftshader kost ~9 cores en in de temperatuurmodus
  verhongert de frame-loop (regen 2 draws/s i.p.v. 23), dus hoofddraadtijd daar is ondergrens.

Nulmeting (`voor`, main `4007903`):

| scenario | taak s | script s | renderer-CPU s | gpu-CPU s | map-renders/s | regen/s | wind/s | isolijn/s | traces | labelrondes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| weer | 16,86 | 7,38 | 22,99 | 268,7 | 2,7 | 23,1 | 25,0 | 0 | 0 | 0 |
| temperatuur | 4,34 | 1,49 | 9,07 | 310,3 | 2,4 | 2,0 | 3,9 | 3,9 | 117 | 5 |

## 2026-09-25 21:30 — meting aangescherpt; ingreep 1 (isolijnen per uur)
- Meting v2 (alle cijfers hieronder): 40 s inloop (diepe-idle L2-lading klaar), dan `Home` op de
  slider (afspelen loopt door vanaf cursor 0, zodat elk venster dezelfde fase van de lus meet — 30 s
  vensters op willekeurige plekken gaven ±40 % ruis), 30 s meten. Renderer-CPU uit /proc gesplitst
  per draad (hoofddraad `chrome-headless*`, `DedicatedWorker*`, compositor); `postMessage` per
  worker-script geteld via een init-script in het meetscript (geen appwijziging). De ongelabelde
  blob-worker is MapLibre's eigen worker.
- Ingreep 1: `IsolineLayer` houdt drie getraceerde snedes (pool). Afspelen (`setTime(t, playing)`):
  alleen de hele uren ⌊t⌋ en ⌊t⌋+1 gaan naar de tracer; de tussenstand is een overvloeiing in de
  composite-shader (lijnen+vulling van beide uursnedes, gewicht = uurfractie), dus per frame alleen
  de blit. Vector- en vulpass alleen bij nieuwe geometrie of kaartbeeld. Stil (pauze/scrubben): de
  exacte snede zoals voorheen, dus stills ongewijzigd. Labels volgen de dominante snede (wisselen op
  het halve uur; `onPass` ook bij wissel van dominant). Een vervangen uurlaag (manifest-refresh)
  maakt alleen de snedes die hem gebruikten ongeldig; een nieuw geladen laag niets.
  `traceTimes()` als pure functie + unit-test.
- Gates: `pnpm typecheck` 0, `pnpm test` 0 (46 files, 318 tests), `pnpm build` 0.
- e2e (`perf`, `wind-zoom`, `focus`, `--project desktop`, poorten 4441/8441): EXIT 1 — 10 passed,
  2 skipped, 1 failed: `perf.spec` passief chunkbudget 862 506 B > 800 000 B. **Bestaat al op main**:
  zelfde spec op een schone worktree van `4007903` faalt met exact 862 506 B (EXIT 1). Niet van
  deze track; voor de orkestrator (waarschijnlijk U37/U34 cloud-/Lucht-bytes in de passieve fase).

| scenario | build | taak s | script s | hoofddraad-CPU s | worker-CPU s | gpu-CPU s | map-renders/s | regen/s | wind/s | isolijn/s | traces | worker-berichten |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| weer | voor | 11,77 | 2,98 | 10,21 | 2,07 | 338,9 | 2,8 | 29,8 | 30,8 | 0 | 0 | zstd 87, maplibre 297 |
| weer | na-1 | 11,60 | 3,02 | 10,18 | 2,13 | 333,3 | 3,0 | 29,4 | 30,5 | 0 | 0 | zstd 87, maplibre 297 |
| temperatuur | voor | 2,45 | 1,22 | 1,99 | 1,81 | 320,9 | 1,7 | 1,9 | 3,8 | 3,8 | 114 | tracer 114, labels 3, maplibre 261 |
| temperatuur | na-1 | 10,63 | 2,90 | 8,54 | 5,15 | 368,8 | 2,6 | 19,9 | 28,3 | 25,4 | 5 | tracer 5, labels 4, zstd 180, maplibre 297 |

- Lezing: vóór verhongerde de frame-loop in de temperatuurmodus (1,9 regenframes/s: elke trace gaf
  een vector- + vulpass op de swiftshader-GPU). Na: 20 fps, dus absolute hoofddraadtijd stijgt; per
  getekend frame 43 → 18 ms. Tracer 114 → 5 berichten. De worker-CPU na komt van zstd (180 decodes
  van regen-/motion-/gevoelstemperatuurframes, die nu wél op tijd opgevraagd worden), niet van de
  isolijnworkers.
- Observatie (buiten de vier ingrepen): ook in de weermodus 87 zstd-decodes per 30 s afspelen —
  de frame-LRU (512) is kleiner dan het manifest (896 frames) zodra de L2-lading alles heeft
  gedecodeerd, dus elk rondje decodeert regen + motion opnieuw. Melden, niet aanpakken.

## 2026-09-25 22:05 — ingreep 2 (repaint alleen bij een echt nieuw beeld)
- Inventaris `triggerRepaint`: wind, regen en isolijnen tekenen al op eigen overlay-canvassen (U8c);
  hun animatie trekt MapLibre niet mee. `map.triggerRepaint` resteert in `applyFocus` (alleen bij
  focuswissel), de terugval zonder overlay, en day-night (uit). Diagnose met een tijdelijke build
  (niet gecommit) die `map` blootlegde: in 15 s weermodus 23× `setData` op `motregen-temperature`
  → 138 data-events → 60 kaartrenders. **Alle** MapLibre-renders tijdens afspelen kwamen van de
  stadstemperaturen: de geïnterpoleerde waarde van een van de ~20 steden slaat ~1,5×/s een graad om.
- Ingreep: (a) stadstemperaturen tijdens afspelen op het dichtstbijzijnde uurframe (één wissel per
  uur); stil/scrubben geïnterpoleerd zoals voorheen (stills gelijk). Zichtbaar verschil alleen
  tijdens afspelen: een stadswaarde springt op het halve uur i.p.v. ergens binnen het uur — PO
  beoordeelt op de preview. (b) de afspeel-frame-loop tikt op ≤ 30 Hz (was WIND_MAX_FPS = 60):
  regen-crossfade/flow, isolijn-overvloeiing en klok volgen die tik; de windpartikels houden hun eigen
  60 Hz-lus. Eerste poging legde de 30 Hz-grens in de `LayerOverlay` van regen/isolijnen (timer-pad);
  teruggedraaid ten gunste van de grens aan de bron (minder scheduling-paden).
- Gates: typecheck 0, test 0 (318), build 0.
- e2e (drie specs, desktop): EXIT 1 — 9 passed, 2 skipped, 2 failed: `perf.spec` (862 506 B, bestaand,
  zie ingreep 1) en `wind-zoom` "continuous zoom 7→9" (0,63 < 0,7). **Die laatste is wisselvallig op
  main**: `--repeat-each 3` op een schone `4007903`-worktree: 1 passed, 2 failed (0,675 en 0,650);
  op deze branch met identieke code wisselend 1× geslaagd / 1× gefaald. Niet van deze track; drempel
  of meetopzet (swiftshader-timing) is voor de orkestrator.

| scenario | build | taak s | script s | hoofddraad-CPU s | worker-CPU s | gpu-CPU s | map-renders/s | regen/s | wind/s | isolijn/s | traces | worker-berichten |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| weer | voor | 11,77 | 2,98 | 10,21 | 2,07 | 338,9 | 2,8 | 29,8 | 30,8 | 0 | 0 | zstd 87, maplibre 297 |
| weer | na-2 | 7,29 | 1,95 | 6,48 | 4,32 | 263,5 | 0,5 | 29,3 | 31,6 | 0 | 0 | zstd 162, maplibre 45 |
| temperatuur | na-1 | 10,63 | 2,90 | 8,54 | 5,15 | 368,8 | 2,6 | 19,9 | 28,3 | 25,4 | 5 | tracer 5, zstd 180, maplibre 297 |
| temperatuur | na-2 | 7,86 | 2,01 | 6,32 | 0,58 | 352,2 | 0,5 | 28,2 | 31,4 | 28,4 | 5 | tracer 5, zstd 27, maplibre 45 |

- Lezing: kaartrenders 2,8 → 0,5/s (resterend: uurwissels + MapLibre's eigen natekenen na setData);
  MapLibre-worker 297 → 45 berichten. Regen-draws blijven ~29/s omdat swiftshader hier toch al op
  ~30 fps zat; op een 60 Hz-Mac halveert dit ze. De worker-CPU schommelt met de zstd-decodes
  (27–180 per venster, LRU-churn, zie observatie ingreep 1), niet met de isolijnworkers.

## 2026-09-25 22:40 — ingreep 3 (Solid-cascade per frame dempen)
- Profiel eerst (`profile.mjs`: CDP Profiler + sourcemaps, en `trace.mjs`: devtools.timeline per
  eventnaam). JS per tik was na ingreep 2 al klein (frame-loop inclusief ~1,25 ms, grootste post
  `Freshness` met Intl-formattering per tik); `readPointSeries` kwam tijdens afspelen niet voor (in het
  PO-profiel waarschijnlijk de laadfase). De hoofddraad zat voor **41 % in `Layerize`**: de
  scrubber-baan kreeg per tik een nieuwe `translateX` (ondanks `will-change`), met de baan via CSS
  vastgezet: Layerize 480 → 0 ms per 5 s.
- Ingreep:
  - Tekenlagen niet-reactief: `drawLayers()` (regen, wind, stadslabels, day-night, isolijnen +
    dekking) wordt per tik direct vanuit de frame-loop aangeroepen. Eén effect tekent alleen als de
    loop niet loopt (scrubben, toetsen, pauze, focus-/stapwissel, nieuwe tijdlijn). Dekkingsmemo's
    zijn niet-reactieve functies; het opacity-effect volgt alleen de focus.
  - Reactief op minuut/frame-index: klok (`Freshness` krijgt `cursorMinute`/`cursorFrame`), UV-chip,
    scrubber-`aria-valuetext` (memo op minuut; tekst identiek, hh:mm).
  - Scrubber-baan tijdens gelijkmatig afspelen als één Web-Animations-animatie op de compositor
    (`glideRate` = epoch-ms/ms uit de loop; 0 tijdens terugglijden). Inline transform staat dan stil;
    bij pauze/slepen/terugglijden/afwijking > 2 px valt hij terug op de gewone transform. Controle
    tijdens afspelen: uurtik t.o.v. de cursor wijkt < 1 px af van klok × 0,98 px/min (4 samples).
  - `showTemperature` stopt vroeg bij dezelfde invoer (frames, afgeronde mix, zoom, maat);
    frame-keys van de isolijntijdlijn één keer per tijdlijn i.p.v. per tik.
- Gates: typecheck 0, test 0 (318), build 0.
- e2e (drie specs, desktop): EXIT 1 — 10 passed, 2 skipped, 1 failed: alleen het bestaande
  `perf.spec`-budget (861 273 B, zie ingreep 1); `wind-zoom` continu slaagde deze keer.

| scenario | build | taak s | script s | hoofddraad-CPU s | worker-CPU s | gpu-CPU s | map-renders/s | regen/s | wind/s | isolijn/s | traces | worker-berichten |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| weer | voor | 11,77 | 2,98 | 10,21 | 2,07 | 338,9 | 2,8 | 29,8 | 30,8 | 0 | 0 | zstd 87, maplibre 297 |
| weer | na-2 | 7,29 | 1,95 | 6,48 | 4,32 | 263,5 | 0,5 | 29,3 | 31,6 | 0 | 0 | zstd 162, maplibre 45 |
| weer | na-3 | 4,01 | 1,59 | 3,67 | 3,72 | 314,2 | 0,5 | 29,3 | 31,6 | 0 | 0 | zstd 146, maplibre 45 |
| temperatuur | na-2 | 7,86 | 2,01 | 6,32 | 0,58 | 352,2 | 0,5 | 28,2 | 31,4 | 28,4 | 5 | tracer 5, zstd 27, maplibre 45 |
| temperatuur | na-3 | 3,53 | 1,45 | 3,02 | 0,43 | 371,8 | 0,4 | 21,2 | 30,7 | 23,9 | 4 | tracer 4, zstd 14, maplibre 45 |

- Tussenstand weermodus t.o.v. de nulmeting: taaktijd −66 %, hoofddraad-CPU −64 %.
  Tussenversie van ingreep 3 zonder de compositor-baan: weer 5,97 s / temperatuur 7,03 s taaktijd.

## 2026-09-25 23:10 — ingreep 4 (stil op de achtergrond); stills; eindstand
- Ingreep: `pageVisible` (visibilitychange) stopt de afspeel-frame-loop (afspelen blijft "aan" en
  gaat verder waar hij was) en zet de wind op zichtbaarheid 0 (zijn eigen lus vraagt dan geen frame
  meer; trails blijven staan, bij terugkeer wekt `setTuning` hem). `watchIdle` (nieuw,
  `core/activity.ts` + unit-test): na 60 s zonder invoer (pointer, toets, wiel, touch; zichtbaar
  worden telt als invoer) wind-`maxFps` 60 → 30, afspelen loopt door; eerste invoer zet hem direct
  terug. Eén timer die de resttijd herzet: een pointermove kost alleen een tijdstempel.
  Controle op de windlaag (`__motregenWind.tuning.maxFps`): na laden 60, na 62 s stilte 30, direct na
  een muisbeweging 60.
- Gates: typecheck 0, test 0 (48 files, 320 tests), build 0.
- e2e (drie specs, desktop): EXIT 1 — 10 passed, 2 skipped, 1 failed: alleen het bestaande
  `perf.spec`-budget (861 273 B).
- Scenario `verborgen` in de meting: `visibilityState` via een property-override op `hidden` gezet
  (headless kent geen echte achtergrondtab; de browser zelf zou rAF daar ook al smoren, dit meet de
  app-kant). `rust`: 61 s geen invoer vóór het venster; op swiftshader haalt de wind toch al ~30 fps,
  dus daar geen verschil in draws/s zichtbaar — vandaar de directe controle hierboven.
- Stills (`stills.mjs`, gepauzeerd op End − 3×PageDown, gewacht op `data-load-stage="complete"`, dan
  weer → temperatuur → wind), vóór = main `4007903`, ná = deze branch, direct na elkaar geschoten:
  zijpaneel in alle vijf 0,00 % pixels met verschil > 24; temperatuur licht en donker (isolijnen,
  vulling, labels) 0,00 %; weer/wind 0,3 % op de kaart = willekeurige windpartikels. Eerdere opnames
  zonder de wacht op `complete` verschilden door laadtiming (wolkband/rijhoogte), niet door de code.

### Eindtabel (30 s afspelen, prod-build, 1280×800, swiftshader; vóór = main `4007903`)

| scenario | build | taak s | script s | hoofddraad-CPU s | worker-CPU s | gpu-CPU s | map-renders/s | regen/s | wind/s | isolijn/s | traces | worker-berichten |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| weer | voor | 11,77 | 2,98 | 10,21 | 2,07 | 338,9 | 2,8 | 29,8 | 30,8 | 0 | 0 | zstd 87, maplibre 297 |
| weer | na-4 | 3,17 | 1,28 | 2,94 | 1,70 | 319,6 | 0,5 | 30,0 | 31,7 | 0 | 0 | zstd 85, maplibre 45 |
| temperatuur | voor | 2,45* | 1,22 | 1,99 | 1,81 | 320,9 | 1,7 | 1,9* | 3,8* | 3,8* | 114 | tracer 114, labels 3, maplibre 261 |
| temperatuur | na-4 | 3,45 | 1,47 | 2,88 | 0,25 | 376,4 | 0,4 | 24,6 | 32,0 | 25,9 | 4 | tracer 4, labels 4, maplibre 45 |
| verborgen (temp.) | na-4 | 0,37 | 0,03 | 0,40 | 0 | 0,2 | 0 | 0 | 0 | 0 | 0 | geen |
| rust (> 60 s) | na-4 | 3,35 | 1,48 | 2,92 | 0,09 | 258,6 | 1,1 | 29,3 | 27,6 | 0 | 0 | maplibre 135 |

\* vóór verhongerde de temperatuurmodus op deze GPU-loze host: 1,9 frames/s (elke trace gaf een
vector- + vulpass), dus lage absolute hoofddraadtijd. Per getekend frame: 43 ms vóór → 4,7 ms ná.

- Tegen de doelen: hoofddraad-taaktijd weermodus −73 % (11,77 → 3,17 s; doel −60 %), hoofddraad-CPU
  −71 %. Isolijnworkers tijdens afspelen: tracer 114 → 4 berichten per 30 s (alleen uurstappen),
  worker-CPU temperatuurmodus 1,81 → 0,25 s. MapLibre-renders 2,8 → 0,5/s (resterend = uurwissels
  van de stadslabels + MapLibre's eigen natekenen); frame-wissels in dit venster ~1,5/s radar, dus
  onder "frame-wissels + windlaag" (wind rendert niet via MapLibre).
- Voor de PO op de preview (zichtbaar tijdens afspelen, niet op stills): isolijnen vloeien tussen
  twee uursnedes over i.p.v. continu te schuiven; stadstemperaturen en isolijnlabels wisselen per uur
  (op het halve uur) i.p.v. binnen het uur; klok/scrubber/regen tikken op 30 Hz (wind 60 Hz).
- Open voor de orkestrator: (1) `perf.spec` passief chunkbudget faalt al op main (861–862 KB > 800 KB);
  (2) `wind-zoom` "continuous zoom" is wisselvallig op main (1/3 geslaagd); (3) frame-LRU (512) <
  manifest (896 frames) → na de L2-lading decodeert elk afspeelrondje regen + motion opnieuw (zstd
  85–180 decodes per 30 s); niet in deze vier ingrepen.
- Geen dev-knoppen of tellers toegevoegd (bestaande meetpunten `__motregenIsolines`/`__motregenWind`
  volstonden); de diagnose-build die `map` blootlegde is nooit gecommit.

## 2026-09-25 23:20 — rebase op main `267fad5`
- Rebase schoon (main raakte in web/ alleen `public/robots.txt`). Op de gerebasede kop: typecheck 0,
  test 0 (320), build 0. e2e niet opnieuw (één keer per ingreep gedaan; rebase raakt geen app-code).
