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
