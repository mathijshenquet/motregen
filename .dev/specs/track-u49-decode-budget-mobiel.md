# Track U49 — decode-budget op mobiel: niet alles vooraf decoderen (claude-opus-5-5)

Read first: `AGENTS.md`, `.dev/proposals/0016-profielmodus.md`, `.dev/proposals/0008-data-dieet.md`,
`docs/perf.md`, `web/src/core/mrf.ts` (`MrfClient`: workers = min(4, cores−1), `getFrames`,
`prefetch`, `prefetchMotion`, cache), `web/src/core/zstd.worker.ts`, `web/src/App.tsx` (prefetch-
planning rond regel 880–950: `nearby`, `nearbyFrames`, batch-prefetch bij afspelen; `layer.setTime`
en de frame-lus), `web/src/core/frame-batcher.ts`, `web/src/core/rain-layer.ts`, `docs/mrf.md`,
`docs/data-dieet.md`. LOG: `.dev/tracks/u49-decode-budget-mobiel/LOG.md` (committed, append-only,
timestamped). Branch `track/u49-decode-budget-mobiel` vanaf main. Eigen worktree. Vandaag:
2026-10-07. U48 (watermasker in `wind-layer.ts`) loopt parallel; raak die file niet aan.

## De meting (PO-opname 2026-10-07, Firefox op Android, 29 s koude start)

`~/motregen-profiles/2026-10-07T09:11:43.411Z-linux-armv81.json`: **893 frame-decodes in 29 s**,
p50 17 ms, p95 87 ms, max 154 ms, **23,6 s decodetijd in totaal** (in de workers, maar op een
telefoon met weinig sterke kernen verdringt dat de hoofddraad en de GPU-upload). Op de Mac
(Chrome) dezelfde 855 decodes in 1,9 s. Daarnaast basemap-tiles 12× p50 372 ms, isolijn-trace
p95 33 ms (worker), texture-upload p95 15 ms. Dezelfde oorzaak drijft de rode `perf.spec`-
budgetregel (passieve chunkbytes 1,05 MB tegen 800 KB): de client haalt en decodeert bij de start
vrijwel de hele tijdlijn van alle velden.

## Doel (meetbaar)

Op een Android-klasse toestel (en in de desktop-e2e met `mobile-4g`-profiel) in de eerste 30 s na
koude start: **≤ 150 decodes en ≤ 5 s totale decodetijd**, zonder dat scrubben of afspelen zichtbaar
op een frame wacht (scrub-latency p95 in de HUD mag niet verslechteren op desktop). Meet vóór en
ná met `pnpm prof:capture` (desktop + Playwright `mobile-4g`-emulatie met CPU-throttling 4×) en
noteer per meting aantal decodes, totale decodetijd en scrub-p95.

## Aanpak (voorstel; meet en kies)

1. **Decodeer op aanvraag, niet vooruit**: alleen het frame op de cursor, het afspeelvenster
   (de volgende ~3 s) en de velden van de actieve modus; de rest pas als de cursor erheen gaat.
   Gedownloade bytes mogen in cache blijven; het decoderen is het dure deel.
2. **Budget per apparaat**: `navigator.hardwareConcurrency` ≤ 4 of `deviceMemory` ≤ 4 →
   1–2 decode-workers en een kleiner prefetch-venster; desktop houdt het huidige gedrag.
   Geen UA-sniffing.
3. **Prioriteit**: een scrub-/afspeelframe mag nooit achter prefetch-decodes in de wachtrij
   staan (prioriteitswachtrij in `MrfClient`, prefetch annuleerbaar als de cursor springt).
4. **Niet-getoonde velden** (wolkenlagen, druk, stoten, UV) alleen decoderen als hun kolom of
   modus ze nodig heeft; dit hoort bij `camsInManifest`-achtige "laad wat je toont" (MIP-14).
5. Daarna het `perf.spec`-budget eerlijk zetten op wat de nieuwe passieve start werkelijk haalt.

## Gates

`pnpm typecheck`, `pnpm test` (unit voor de wachtrij/budgetbeslissing), `pnpm build`, gerichte e2e
`perf.spec`, `scrub*`/`playback*` `--project desktop` onder een slot, en de vóór/ná-meting met
synchrone exit statussen in de LOG. Draft-PR vroeg. Leesbaarheidsbar: geen één-letternamen, geen
slimme one-liners, commentaar alleen voor een niet-triviaal waarom.
