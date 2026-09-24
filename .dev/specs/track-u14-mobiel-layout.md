# Track U14 — mobiele UI-pass: kaart groot, scrubber eronder, tabel bij scrollen (claude opus)

Read first: `AGENTS.md`, `web/src/App.tsx` (layout: `map-shell`, `scrubber`,
`forecast-panel`, sidebar vs mobiel), `web/src/styles.css` (media queries
≤430/≤768), `web/src/components/HistogramScrubber.tsx`, `ForecastTable.tsx`,
`Freshness.tsx`, `LocationSearch.tsx`, `docs/perf.md` (Pixel-5-profielen), de
U6-LOG-opmerking dat overlays (zoekbalk, merk) op mobiel over de kaartrand
liggen, en de U7-observatie van een lege band van ~60 px onder de kaart.
Referentie voor gevoel: DWD WarnWetter. Your LOG: `.dev/tracks/u14-mobiel-
layout/LOG.md` — committed, append-only, timestamped. Branch `track/u14-
mobiel-layout` vanaf main. Eigen worktree. Integratie-instantie:
http://ageq-mthq:4300/.

## PO (2026-09-24)

"Een pass over de mobiele UI: de kaart moet vrij groot zijn, daaronder de
scrubber, en pas bij scroll-down de tabel."

## Opdracht

1. Vóór-screenshots Pixel 5 portrait + landscape, licht/donker, incl. de
   hele pagina (scroll) en met open zoekveld.
2. Layout mobiel (≤768 px): kaart neemt het grootste deel van de eerste
   viewport (richtwaarde ≥ 60 % van `100dvh`, met veilige zones), direct
   daaronder de scrubber (histogram + horizonpillen + versheid/klok waar
   die logisch zit), en de tabel begint onder de fold; scrollen brengt de
   tabel omhoog. Overweeg sticky gedrag: bij scrollen krimpt de kaart mee
   of blijft de scrubber zichtbaar (kies één, motiveer met screenshots).
   Overlays (zoekbalk, merk/About, thema, versheidspil, zoomknoppen) mogen
   de kaartrand niet meer verstoppen: leg vast waar ze staan en check dat
   U6's contain-fit niet onder de zoekbalk valt (overlay-insets meenemen
   in `constrainView`-padding als dat nodig is).
3. Los de lege ~60 px-band onder de kaart op (U7: waarschijnlijk een leeg
   `current-weather`-blok).
4. Aanraakdoelen ≥ 44 px, safe-area-insets (notch/home-indicator), geen
   horizontale scroll, `100dvh` i.p.v. `100vh`.
5. Playwright-screenshots ná, dezelfde set; e2e mobiele budgetten blijven
   (passief, warm 0 B, cold TTFR).

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4332
MOTREGEN_E2E_DATA_PORT=8332 pnpm e2e` green, synchrone exit statussen in
LOG. Draft-PR vroeg. Geen codex. U15 werkt parallel in ForecastTable (UV-
kolom): raak de tabel alleen voor layout/positie, niet de kolominhoud.
