# Track U68 — één klok (spelen pas als alles klaar is) en de kaart vóór de HARMONIE-flood (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via
herdr; voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; beëindig geen turn terwijl
shells lopen. Eigen worktree; branch `track/u68-een-klok-en-kaartprioriteit` vanaf main. LOG:
`.dev/tracks/u68-een-klok-en-kaartprioriteit/LOG.md`. Vandaag 2026-10-09. Rig-/e2e-poorten
`MOTREGEN_E2E_PORT=4392 MOTREGEN_E2E_DATA_PORT=8392`; e2e bouwt naar `tmp/e2e-dist`, nooit `web/dist` van de
main-checkout. Preview voor de PO op poort 4350 (`pnpm preview --host 0.0.0.0 --port 4350 --strictPort`,
`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data`). Perf-metingen: gepaard A/B, startload ≤ 16, lock per run
(`docs/perf.md` §perf-lock; wachten op load BUITEN de lock). `.env` is een symlink; nooit committen.

Read first: `AGENTS.md`, `.dev/LOG.md` (top: de nachtronde van 2026-10-09 met de Firefox-profielanalyse),
`.dev/proposals/0019-*.md` (§De lat), `0023-laadtijd-lussen.md`, `web/src/App.tsx` (afspeellus rond
`createEffect` met `playing()/mapRendering()/mapReady()`, `mountRain`/`attachMapLayers` op `style.load`,
`replaceMapStartWhenComplete`), `web/src/core/map-start.ts`, `web/src/components/HistogramScrubber.tsx`
(`glideRate`), `web/src/core/perf.ts` (ttfr/ttfp-definities), U63/U64-LOGs onder `.dev/tracks/`.

## Waarneming PO (Firefox-profiel 2026-10-09 09.55, desktop, 4330)
"Het histogram loopt al, maar de kaart begint pas vrij laat mee te lopen en door desynced klokken springt
het dan naar voren." En: "het lijkt me sowieso cleaner om pas de kaart te laten lopen als alles klaar is;
je moet je toch eerst even oriënteren." Analyse: de regen-laag op de kaart wordt pas gemount bij MapLibre
`style.load`, dat wacht op de PMTiles-header; die stond in de rij achter ~37 HARMONIE-.mrf-aanvragen die om
205 ms tegelijk starten (4330 = HTTP/1.1, 6 verbindingen; prod = HTTP/2, zelfde vorm). De scrubber heeft de
kaart niet nodig en speelt eerder.

## Opdracht
1. **Eén klok.** Afspelen (scrubber-cursor, histogram-glide én kaartregen) start pas als de kaart kan
   tekenen: dezelfde gereedheid als `mapReady` (eerste regentekenbeurt op de kaart). Vóór dat moment staat
   de cursor stil op "nu" en glijdt niets. Geen sprong bij de start. Houd de speelregel van MIP-19 verder
   intact (spelen zodra cursorframe + volgende er zijn). Pas de ttfr-definitie in `perf.ts`/`docs/perf.md` aan
   waar nodig zodat "spelende tijdlijn" = dit startmoment; e2e die op afspelen wachten (perf-journey, play,
   table) bijwerken met de reden.
2. **Kaart vóór de HARMONIE-flood.** De PMTiles-header en de eerste zichtbare tegels mogen niet achter de
   HARMONIE-series in de rij staan. Kandidaten (meet, kies): (a) HARMONIE-series pas starten ná `style.load`
   of na de eerste basiskaart-tegel, behalve wat de tabelrijen op `ttfp` nodig hebben; (b) `priority: 'high'`
   op header/tegel-fetches en `'low'` op de series; (c) de header vroeg ophalen (vóór het manifest-vervolg) en
   via een eigen pmtiles-`Source` aanleveren. Meet gepaard koud+warm op desktop (eigen rig, HTTP/1.1 preview
   én tegen https://motregen.nl voor HTTP/2) en po-android: ttfr, ttfp, moment van `style.load`, eerste
   tegel; waterval erbij.
3. **Regen los van `style.load`** (alleen als 1+2 de desync niet al wegnemen): de regen-overlay mounten
   zodra de kaartcanvas er is, niet pas na de stijl, zodat regen over de z4-startkaart kan spelen. Meet.
4. Gate: typecheck, unit, build, `perf.spec`/`play`/`table`/`basemap` desktop + mobile-4g; firefox-project;
   screenshots/filmstrip (eigen Playwright-filmstrip zoals `web/tmp/orkestrator/play-sync.mjs` in de
   main-checkout, kopieer die) vóór/ná met de cursorpositie per 250 ms. Draft-PR vroeg; "klaar voor merge"
   met cijfers.

## Afbakening en bar
Geen andere UI-wijzigingen; geen verandering aan de z4-startkaart (die is net gefixt: wissel na alle
tegels, beide tegels samen). Leesbaarheid: geen één-letternamen, geen slimme one-liners, commentaar alleen
voor het niet-vanzelfsprekende waarom.
