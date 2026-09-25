# Track U41 — stil in rust: CPU van de pagina tijdens afspelen (claude opus 5.5)

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `web/src/App.tsx` (afspeel-effect rond r.548,
`startFrameLoop`), `web/src/core/wind-layer.ts`, `web/src/core/isoline-layer.ts`,
`web/src/core/isolines.ts` (workers/tracer), `web/src/components/HistogramScrubber.tsx`.
LOG: `.dev/tracks/u41-stil-in-rust/LOG.md` (append-only, timestamps, synchrone exit-statussen).
Branch `track/u41-stil-in-rust` vanaf main (`0584276` of nieuwer).

## Waarom (PO 2026-09-25, "macbook voelde aardig warm")

Firefox-profiel van de PO, 16,5 s afspelen op de preview (dev-server 4310, dus JS-cijfers wat
opgeblazen; structuur klopt): `/home/mthq/tmp/motregen-idle-profile-2026-09-25.json.gz`,
analyse-script `/home/mthq/tmp/ffprof-threads.py` (processed-profile v75, `shared`-tabellen,
`prefixOffset`). Gemeten CPU over die 16,5 s:

| draad | CPU | aandeel core |
| --- | --- | --- |
| pagina-hoofddraad | 7,8 s | 47 % |
| GPU-renderer (Firefox) | 5,7 s | 35 % |
| 6 isolijn-workers samen | 4,6 s | 28 % |
| canvas-renderer + compositor | 2,5 s | 15 % |

Hoofddraad inclusief: MapLibre `triggerRepaint`→`_render` 19 % (tiles 11 %, drawLayerSymbols 6 %,
_updatePlacement 4 %, pruneUnusedLayers 4,5 %), Solid `updateComputation`/`writeSignal`/`runTop`
~9 %, `readPointSeries/indexes` 3,6 %, `updateIsolineLabels` 2,4 %, `uploadRain` 1,9 %. Workers:
`traceContours`/`marchingSquares`/`ringFadeRaster`/`refine` — het isolijnveld wordt tijdens afspelen
per frame hertraceerd.

## Doel (meetbaar, één meting per stap)

Zelfde scenario op een **prod-build** (`pnpm build` + `pnpm preview`, `MOTREGEN_DATA_ORIGIN=
http://localhost:8080` = lokale live ingest op deze host) in headless Chromium via Playwright met
CDP `Performance.getMetrics` (TaskDuration/ScriptDuration over 30 s afspelen in de standaard
weermodus én in de temperatuurmodus) — of `chrome://tracing` niet nodig. Vóór/ná in de LOG als
tabel. Streef: hoofddraad-taaktijd −60 %, worker-CPU tijdens afspelen ~0 tussen uurstappen,
aantal MapLibre-renders per seconde ≤ aantal echte frame-wissels + windlaag.

## Vier ingrepen (in deze volgorde; na elke ingreep meten en LOG)

1. **Isolijnen niet per frame hertraceren.** Tracen alleen bij een uurstap (nieuw uurframe-paar) of
   bij zoom/moveend; de tussenstand tijdens de tween niet naar de workers. Als de tween visueel
   nodig is: blend in de raster-vulpas (shader) tussen twee getraceerde standen, of tween alleen
   de vulling en houd de lijnen op het dichtstbijzijnde uur. Labels (`updateIsolineLabels`) idem.
2. **Repaint alleen bij een echt nieuw beeld.** Inventariseer alle `triggerRepaint`-aanroepen.
   Radar: 5-minuutframes; de crossfade/flow-tween tussen twee frames op ≤ 30 Hz en alleen als de
   uploadRain iets nieuws heeft. De windlaag mag niet de volledige MapLibre-render (tiles, symbolen,
   placement) per vsync meetrekken: eigen canvas/overlay-render of MapLibre's `render` alleen als
   de kaart zelf beweegt. Meet renders/s vóór/ná (tel in `_render` via een dev-teller achter `?dev`
   die daarna weer weg mag, of via performance.mark).
3. **Solid-cascade per frame dempen.** `setCursor` per animatieframe → welke effecten lopen mee?
   Tekenlagen lezen de cursor niet-reactief (ref/store) en krijgen hem via de frame-loop; reactief
   blijven alleen tabel, klok en scrubber, en die alleen bij een wisseling van frame-index/minuut.
   `readPointSeries/indexes` niet per frame.
4. **Stil op de achtergrond.** Tab verborgen (`visibilitychange`) → frame-loop en wind pauzeren;
   > 60 s geen invoer → wind naar 30 fps en afspelen mag doorlopen. Herstel direct bij invoer.

## Guardrails

- Geen zichtbare verandering: stills vóór/ná (desktop licht/donker, weer- en temperatuurmodus,
  windmodus) in `.dev/tracks/u41-stil-in-rust/stills/`; PO beoordeelt op de preview.
- Bereik is precies deze vier punten. Geen nieuwe dev-knoppen die blijven (MIP-12); een tijdelijke
  teller mag, maar gaat in de laatste commit weer weg of krijgt eigenaar+vervaldatum in
  `docs/dev-opties.md`.
- e2e: alleen `e2e/perf.spec.ts`, `e2e/wind-zoom.spec.ts`, `e2e/focus.spec.ts` `--project desktop`,
  één keer per ingreep, onder het slot (`pnpm e2e … --project desktop`). Geen volledige suite.
- Gates: `pnpm typecheck`, `pnpm test`, `pnpm build`; synchrone exit-statussen in de LOG.
- Draft-PR vroeg; rebase op main vóór je klaar-melding. Meld je met één regel: head + meettabel.
