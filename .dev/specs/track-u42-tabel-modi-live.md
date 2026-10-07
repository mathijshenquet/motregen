# Track U42 — tabelkoppen en modi herindeling, live met de PO in de pane (gpt-5.6-sol)

Read first: `AGENTS.md`, `.dev/proposals/0014-kolommen-en-extra-lagen.md` (§Amendement
2026-10-07 = de opdracht), `.dev/specs/track-u34-wind-live.md` (§Werkwijze: zo werkt een
live-pane), `web/src/components/ForecastTable.tsx`, `web/src/core/focus-mode.ts`,
`web/src/components/HistogramScrubber.tsx`, `web/src/core/moon.ts`, `web/src/styles.css`
(tabel, `@media (max-width: 959px)`, `pointer: coarse`), `web/src/core/usage.ts` (baken-
velden `pinFeel`/`pinWind`), `docs/dev-opties.md`. LOG: `.dev/tracks/u42-tabel-modi-live/LOG.md`
(committed, append-only, timestamped). Branch `track/u42-tabel-modi-live` vanaf main.
Eigen worktree (herdr). Vandaag: 2026-10-07.

## Werkwijze (live-pane, loop van minuten)

De PO zit in deze pane en kijkt live mee. Per stap één gerichte wijziging, `pnpm typecheck`,
`pnpm build`, dan "klaar, herlaad" met in één zin wat er veranderde. Geen e2e, geen stills,
geen meetscript tenzij de PO erom vraagt. Commit na elke stap die de PO goedkeurt.

Preview (achtergrond, blijft draaien; na een wijziging alleen `pnpm build`):

    cd web && pnpm synthgen && pnpm build && MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --host 0.0.0.0 --port 4320 --strictPort

URL voor de PO: http://ageq-mthq:4320/ (ook vanaf zijn telefoon via het tailnet). Meld
de URL in je eerste bericht aan de PO. Test je stappen zelf ook op een smal viewport
(Chromium devtools-emulatie is genoeg).

## Opdracht (volgorde = voorstel; de PO stuurt bij)

1. **Weer standaard gepind.** `FocusMode` krijgt een vaste standaardmodus `clouds`→ hernoem
   naar `weather` waar dat de leesbaarheid helpt; er is altijd precies één gepinde modus;
   klik op de gepinde kop doet niets (geen "terug naar niets"). Weer-modus = de standaard-
   kaart zoals die nu zonder pin is: regen plus de bestaande achtergrondwind (ambient) blijven;
   "alleen regen" betekent dat Weer geen wolkensluier/-modus overneemt, niet dat de wind
   verdwijnt (PO-steer 2026-10-07). In het histogram blijven de drie wolkenlagen in Weer
   zichtbaar zoals vóór U42: rustig, onder het regenhistogram (geen kale regen-only grafiek).
   Lucht (stap 2) gebruikt dezelfde lagen als actieve modus (volle nadruk, laagwaarden bij de
   cursor) en voegt de wolkensluier op de kaart toe (PO-verduidelijking 2026-10-07, tweede).
   Stap 1, 2 en 3 zijn samen de eerste review-eenheid. Bij semantische twijfel over
   bestaand gedrag: eerst vragen, dan pas verwijderen. Baken: `pinFeel`/`pinWind` blijven; voeg `pinAir` toe
   (MIP-13-contract in `docs/analytics.md` + `USAGE_FIELDS`/schema-versie).
2. **Lucht** vervangt de kolommen UV en Weer-als-wolkenmodus: één kolom met eigen modus
   (`air`): kaart = bewolkingssluier (nu `clouds`), scrubber = wolkenlagen zoals nu in Weer.
   Cel: overdag UV-waarde + relatieve UV-balk met een wolkje dat de bedekking toont;
   's nachts de maan (bestaande `MoonReading`). Hover/klik op de hele kolom (Maarten: "UV/RV
   niet hoverbaar").
3. **RV uit beeld**: kolom en header weg uit de tabel; data, ingest, `humiditySeries` en de
   scrubber-waarde blijven bestaan (komt terug als extra kolom in U38).
4. **Uur zonder kop**; `table-layout: fixed`, uurkolom op inhoudsbreedte, de vier modus-
   koppen (Weer, Lucht, Gevoel, Wind) gelijk verdeeld. Op 360–430 px moeten icoon + label
   nog passen; anders label onder het icoon kleiner.
5. **Maan pimpen**: fotorealistische schijf. Bron: NASA Scientific Visualization Studio
   "Moon Phase and Libration" (publiek domein); gebruik één volle-maan-still als texture
   (`web/public/moon.png`, ≤ 10 KB op 64 px, plus @2x), met onze `moonLitPath`-terminator als
   mask, zachte gloed. Herkomst + licentie in `docs/` (één regel) en About-attributie als er
   een bronregel staat. Geen 8760 frames.
6. **Mobiel: koppen als tabelkop.** Onder de kaart is de koprij plus de eerste rij (±1,2 rij
   hoog) zichtbaar met een schaduw/verloop aan de onderkant als nudge dat er meer is. Tik of
   sleep op die strook opent de tabel als view-switch (sticky handle, snap open/dicht, de
   kaart schuift weg); in de open staat rendert de kaart niet (pauzeer de frame-lus en de
   windlaag; `isolines`-tracer idle). Terug via de handle of de kaartstrook bovenaan.
   Experimenteer eerst met de simpelste variant; de PO kiest op gevoel.
7. **Zon op/onder-rijen**: dividers weg of meer marge (Maarten) — PO kiest live.
8. Bij "klaar" van de PO: `pnpm test` (unit voor focus-mode default, kolomset, maan-mask),
   gerichte e2e `--project desktop` (`table.spec`, `focus.spec`, `usage.spec`) onder een slot,
   stills desktop/Pixel 5, LOG met synchrone exit statussen, draft-PR.

## Afbakening

Geen kolomset/paging (U38), geen nieuwe data, geen wijzigingen aan de windlaag-tuning.
Leesbaarheidsbar: geen één-letternamen, geen slimme one-liners, commentaar alleen voor een
niet-triviaal waarom.
