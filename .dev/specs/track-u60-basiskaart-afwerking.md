# Track U60 — basiskaart-afwerking: groen terug, minder plaatsnamen (MIP-21 vervolg)

Berichten die in deze pane als geplakte tekst binnenkomen zijn instructies van de orkestrator
(Claude, PM) via herdr; voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min (de
Codex-verbinding valt rond het uur weg); LOG bijhouden.

Read first: `AGENTS.md`, `.dev/proposals/0021-eigen-basiskaart.md`, `docs/basemap.md`,
`tools/basemap/` (process.lua, style.mts, config.json, snapshot.mts), `web/src/core/basemap.ts`,
U59-LOG `.dev/tracks/u59-eigen-basiskaart/LOG.md`. LOG: `.dev/tracks/u60-basiskaart-afwerking/LOG.md`.
Branch `track/u60-basiskaart-afwerking` vanaf main. Eigen worktree; rig-poorten
`MOTREGEN_E2E_PORT=4397 MOTREGEN_E2E_DATA_PORT=8397`; preview op 4340 (herstart de preview-server na
elke vite.config-wijziging; bouw rig/e2e naar een aparte outDir, nooit `web/dist`). Vandaag 2026-10-07.

## PO-feedback op de eerste eigen kaart (4330, 2026-10-07 21:10, screenshot in de track-map)

"Er is een stuk minder groen nu, en er staan te veel plaatsnamen (waarschijnlijk door minder andere
elementen)." En: "het voelt wel zeer snappy" — dat moet zo blijven.

## Opdracht

1. **Groen terug, zoals liberty**: de U59-spec vroeg "landcover grof, maximaal twee klassen"; dat was
   te zuinig. Neem de landcover/landuse-klassen over die liberty op z8–z12 toont (wood/forest, grass/
   meadow/park, farmland waar liberty dat kleurt, wetland, sand/beach) met liberty's kleuren uit de
   bewaarde OpenFreeMap-stijl (snapshot in de rig), gegeneraliseerd per zoom (tilemaker simplify/
   min-area per zoom) zodat de tegelgrootte ≤ +25 % van nu blijft. Vergelijk per zoom (z7, z9, z10
   en overzoom z12) screenshot naast screenshot met de OpenFreeMap-snapshot in dezelfde view.
2. **Plaatsnamen-dichtheid als liberty**: liberty toont per zoom een beperkte set via `rank`/
   klasse en minzoom per klasse (city/town/village) plus collisie met wegen en andere labels; onze
   kaart mist die concurrenten, dus er passen te veel labels. Reproduceer liberty's zichtbare set:
   `text-field`-filters op klasse + rank per zoom (neem liberty's minzoom per klasse over), een
   `rank`/bevolking in de tegel (OSM `population`, `place` klasse), `symbol-sort-key` op rank,
   `text-padding` ruimer. Meet: aantal zichtbare plaatslabels in de startview 390 px en 1280 px,
   onze kaart vs de OpenFreeMap-snapshot (zelfde view) — doel ±20 %. Provincienamen en
   labelgrootte ongemoeid tenzij liberty anders doet.
3. **Snappy blijft**: rig `pnpm perf:mobile --profile mobile-4g --scenario koud --basemap own
   --repeat 3 --compare`: basemap totaal ≤ 1 s blijft, bytes ≤ +25 % t.o.v. de huidige baseline;
   anders generaliseren tot het past. Nieuwe `nl-<hash>.pmtiles` via de bestaande publisher
   (hash in stijl, Nix-package, SW-cache raakt vanzelf de nieuwe hash).
4. Eigen screenshots (390 px + 1280 px, licht én donker, start-view en ingezoomd op Utrecht) bekijken
   en in één zin benoemen vóór "klaar"; typecheck/test/build/gerichte e2e; docs/basemap.md §Stijl
   bijwerken; LOG met synchrone receipts; draft-PR vroeg.

## Afbakening

Geen schema-uitbreiding buiten landcover/landuse/place; geen wegen. Leesbaarheid: geen één-letter-
namen, geen slimme one-liners, commentaar alleen voor het niet-voor-de-hand-liggende waarom.
