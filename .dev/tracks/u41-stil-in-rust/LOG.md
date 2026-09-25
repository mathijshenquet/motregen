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
