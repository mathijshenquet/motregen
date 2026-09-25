# Track U27 — Vlaanderen: plaatsen, labels, zoeken, meer ruimte in het zuiden (claude opus 5.5)

Read first: `AGENTS.md`, `docs/grid.md` (gedeeld grid tot 48,85° N: de data
dekt Vlaanderen al), `docs/arome.md` (HARMONIE-domein 49–56° N), `web/src/
core/map-frame.ts` (`NETHERLANDS_FLANDERS_BOUNDS`, zuid 50,67), `web/src/
core/map-constraint.ts`, `web/src/core/places.ts` en `web/src/core/
temperature.ts` (plaatsenlijsten, alleen NL), `web/src/core/pdok.ts`
(geocoder: PDOK Locatieserver, alleen NL), `web/src/core/basemap.ts`
(`withDutchNames`, label-filters op `place`), `web/src/components/
LocationSearch.tsx`, U2- en U7-LOGs (labeldichtheid). Your LOG: `.dev/
tracks/u27-vlaanderen/LOG.md` — committed, append-only, timestamped. Branch
`track/u27-vlaanderen` vanaf main. Eigen worktree. Preview:
http://ageq-mthq:4300/.

## PO (2026-09-25)

"Graag Vlaanderen toevoegen (temperatuur enzo?) en de kaart wat meer ruimte
geven ten zuiden; motregen.nl is ook voor Belgen."

## Vaststelling vooraf (orkestrator)

Radar (KNMI-composiet), nowcast en HARMONIE dekken Vlaanderen al: het
gedeelde grid loopt tot 48,85° N en het AROME-domein tot 49° N. Controleer
dat in de eerste stap met een echte frame (waarden ≠ no-data boven Gent/
Antwerpen/Hasselt) en leg de dekkingsgrens vast in de LOG — als de radar-
composiet in het zuiden van Vlaanderen no-data is, is dat een bevinding voor
de PO, geen reden om te stoppen (HARMONIE dekt dan alsnog). Wat ontbreekt is
alleen de client: plaatsen, labels, zoeken, kaderruimte.

## Opdracht

1. **Kader**: `NETHERLANDS_FLANDERS_BOUNDS.south` van 50,67 naar ~50,45
   (Brussel, Leuven, Hasselt en de Voerstreek met marge in beeld); west
   blijft 2,5. Controleer de contain-fit op desktop en Pixel 5 (U6/U14):
   heel NL+Vlaanderen in beeld zonder dat de kaart op mobiel te klein wordt;
   meet de zoom vóór/na en lever stills.
2. **Plaatsen**: Vlaamse steden in `places.ts` (nearest-place-label bij
   kaartklik) en `temperature.ts` (temperatuurlabels): Antwerpen, Gent,
   Brugge, Leuven, Mechelen, Hasselt, Kortrijk, Oostende, Aalst, Genk,
   Sint-Niklaas, Turnhout, Roeselare, Brussel. Dichtheidsregels uit U7
   blijven gelden (geen labelbrij rond Antwerpen–Mechelen–Brussel).
3. **Basiskaart-labels**: `prepareBasemapStyle` toont nu alleen NL-
   plaatsnamen op de gekozen niveaus; verruim de filters zodat Vlaamse
   plaatsen op dezelfde niveaus verschijnen (en Wallonië/Duitsland/Frankrijk
   níet — landsgrens BE-NL verdwijnt niet, provinciegrenzen alleen als ze
   nu ook voor NL staan).
4. **Zoeken**: PDOK kent geen Belgische plaatsen. Voeg een tweede bron toe
   voor België; voorkeur: het Vlaamse Geopunt/"Basisregisters" adres-
   suggestie-API (gratis, zonder sleutel) of, als dat niet stabiel blijkt,
   Nominatim met `countrycodes=be` en het verplichte User-Agent/rate-beleid.
   Resultaten van beide bronnen samenvoegen (NL-resultaten eerst bij een
   NL-viewport, BE eerst bij een BE-viewport, op basis van het kaartcentrum).
   Toon het land alleen als `small` bij een BE-resultaat ("Gent · BE").
   Leg de gekozen API met URL en beleid vast in `docs/` (één korte sectie).
5. **About/uitleg**: één zin in de About-modal dat de kaart Nederland en
   Vlaanderen dekt op KNMI-data (de KNMI-composiet en HARMONIE reiken tot
   over Vlaanderen).
6. **Tests**: places-dichtheid, geocoder-merge (unit, met gemockte
   responses), e2e: zoeken op "Gent" levert een BE-resultaat en zet de pin;
   contain-fit-still vóór/na.

## Niet doen

- Geen ingest-wijzigingen (de data dekt al). Geen Wallonië (Franstalig,
  buiten scope). Geen UI-shell-wijzigingen buiten de zoekresultaten (U22).

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4370
MOTREGEN_E2E_DATA_PORT=8370 pnpm e2e` (hostlock, load < 16, één Chromium,
poorten vooraf vrij) groen, synchrone exit statussen in de LOG. Draft-PR
vroeg. Geen codex.
