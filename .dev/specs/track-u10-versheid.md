# Track U10 — dataversheid zichtbaar in plaats van de "Nu"-klok (claude opus)

Read first: `AGENTS.md`, `web/src/components/MapClock.tsx`, `web/src/App.tsx`
(`manifestNow`, `perf.setManifestGenerated`, `scheduleManifestRefresh`,
`MapClock`-aanroep), `web/src/core/manifest-refresh.ts`, `docs/contract.md`
(manifest: `generated`, `now`, per chunk `run` + `times`), `.dev/research/
prospect-2026-08/sweep.md` §7 (RainViewer "radar scan age") en §"Stil
verouderde data", `SYNTHESE.md` ("inspecteerbare kaarten (versheid!)").
Your LOG: `.dev/tracks/u10-versheid/LOG.md` — committed, append-only,
timestamped. Branch: `track/u10-versheid` vanaf main. Eigen worktree.
Integratie-instantie: http://ageq-mthq:4300/ (proxy naar prod-data).

## PO-opdracht (2026-09-23)

"In plaats van Nu moet je eerder de data-refresh laten zien. Wat mensen
niet fijn vinden aan Buienradar is dat je niet weet of data stale is."
Het marktonderzoek bevestigt dat: stil verouderde data is gevaarlijker dan
een zichtbare fout; RainViewer maakt versheid controleerbaar.

## Opdracht

1. Vervang de "Nu hh:mm"-helft van `MapClock` door een versheidsindicator:
   de tijd van de nieuwste radarmeting (laatste rtcor-frame) als
   hoofdgetal, bv. "Radar 14:35 · 3 min geleden", met een stille
   statuskleur/dot: vers (≤ 8 min), verouderend (8–20), verouderd (> 20
   of manifest-refresh mislukt), en "offline"-status als de refresh
   faalt. Relatieve tijd tikt elke 10–30 s mee. De "Kaart hh:mm"-helft
   (scrubberpositie ≠ nu) blijft.
2. Tik/klik op de indicator opent een klein detailpaneel (popover, zelfde
   familie als de About-dialog): per bron de run/laatste meting en leeftijd
   — radar (rtcor), nowcast, seamless, HARMONIE-run, UV — plus "manifest
   ververst hh:mm" en een knop "Nu verversen" die `refreshManifest`
   triggert. Zo wordt versheid een controleerbare eigenschap.
3. Zuivere afleiding in `core/freshness.ts` (leeftijden, statusklasse,
   labels) met unit tests; manifest-refresh mislukking wordt een status,
   geen console-only.
4. Toegankelijkheid: aria-live="polite" alleen bij statuswissel (niet bij
   elke tik), tekstlabels naast kleur.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4302
MOTREGEN_E2E_DATA_PORT=8302 pnpm e2e` green, synchrone exit statussen in
LOG. Screenshots vers/verouderd/offline (forceer via synth-manifest of
netwerkblokkade in Playwright), desktop + Pixel 5, licht + donker. Draft-PR
vroeg. Geen codex. Scope: MapClock (hernoem gerust naar `Freshness`),
nieuwe core-module, kleine App.tsx-bedrading; U9 werkt parallel in
HistogramScrubber.
