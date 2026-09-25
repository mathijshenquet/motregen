# Track U27 — Vlaanderen (log, append-only)

## 2026-09-25T08:50 — start

- Gelezen: AGENTS.md, spec, docs/grid.md, docs/arome.md, map-frame.ts, map-constraint.ts,
  places.ts, temperature.ts, pdok.ts, basemap.ts, LocationSearch.tsx, U2/U7-LOG (labeldichtheid:
  greedy Poisson-disk op prioriteitsvolgorde, spacing clamp(min(b,h)/7, 56..96 px)).
- Host-load bij start 29 (vier andere workers): e2e wacht op load < 16.

## 2026-09-25T09:00 — Dekkingscontrole met echte prod-frames

Script `web/tmp/coverage.ts` en `web/tmp/uvcov.ts` (gitignored; Range-fetch header + één frame
van https://motregen.nl/data/, decode met `core/mrf`). Receipts: beide `npx tsx …` → exit 0.

| bron/veld | frame | Gent / Antwerpen / Hasselt / Brussel / Voeren | geldige zuidgrens (2,5…7° O) |
| --- | --- | --- | --- |
| rtcor rain_rate | 05:50Z | 0 / 0 / 0 / 0 / 0 (geldig, droog) | 49,33 … 49,09° N (radar-footprint) |
| nowcast rain_rate | 08:45Z | geldig | 49,33 … 49,09° N |
| seamless rain_rate | 10:50Z | geldig | 48,99° N |
| harmonie rain_rate | 05:00Z | geldig | 48,99° N (AROME-rand 49°) |
| harmonie temp_c | 01:00Z | 12,9 / 13,2 / 9,6 / 14,7 / 8,7 °C | 49,00° N |
| harmonie feels_like_c | 01:00Z | 11,1 / 11,1 / 8,7 / 11,7 / 6,9 °C | 49,00° N |
| uv / uv_clear | 07:15Z / 11:30Z | 0,38 / 0,38 / 0,43 (uv), ~3,2 (uv_clear) | bbox lat 49,24–54,00, lon 2,25–7,77 |

Bevinding: alle bronnen dekken heel Vlaanderen ruim (ook de Voerstreek en Brussel); de
radarcomposiet reikt tot ~49,1–49,3° N, dus ook de nieuwe kaartzuidrand 50,45 ligt ver binnen de
data. (UV-frame 06:00Z was no-data boven Vlaanderen — vóór zonsopkomst; overdag geldig.) Geen
PO-bevinding nodig.

## 2026-09-25T09:02 — Implementatie (commit 6ee612d), draft-PR #55

- **Kader**: `NETHERLANDS_FLANDERS_BOUNDS.south` 50,67 → 50,45 (west 2,5 blijft). Analytisch
  (containZoom, 4 % padding): kader w/h 1,005 → 0,936. Pixel 5 portret blijft breedte-begrensd →
  overzichtszoom ongewijzigd (5,757 bij 393×727); desktop/liggend is hoogte-begrensd → −0,10 zoom
  (1280×720: 6,637 → 6,535). Stills + gemeten viewport volgen (wachten op load < 16).
- **Plaatsen**: 14 Vlaamse steden in `places.ts` (met `country: 'BE'`, gebruikt voor de
  viewport-landkeuze van de zoekbalk) en `temperature.ts`. Prioriteit: Antwerpen, Gent, Brussel,
  Hasselt, Brugge in de kop (na de NL-provinciekop, dus Zeeland/Middelburg blijft winnen);
  Leuven, Kortrijk, Oostende, Turnhout midden; Mechelen, Aalst, Genk, Sint-Niklaas, Roeselare staart.
  Greedy-dichtheid (U7) ongewijzigd. Gemeten selectie: telefoonoverzicht (5,6/56 px) 13 labels,
  Vlaams: Antwerpen + Kortrijk (Gent wijkt voor Middelburg, Brugge ook); desktop zoom 7/96 px 22
  labels, Vlaams: Antwerpen, Gent, Brussel, Brugge, Kortrijk (Mechelen wijkt: geen brij
  Antwerpen–Mechelen–Brussel); Belgisch Limburg (Hasselt) pas vanaf zoom 8/72 px, want 30 km van
  Maastricht. NB: desktop-overzicht zat vóór U27 al op de halve stap 6,5 (6,96 → 6,5), dus −0,10
  zoom verandert de labelset daar niet.
- **Basiskaartlabels — BEVINDING, geen codewijziging**: de premisse "prepareBasemapStyle toont nu
  alleen NL-plaatsnamen" klopt niet. Liberty/OpenFreeMap-place-lagen zijn wereldwijd en er is geen
  landfilter; `withDutchNames` zet ze op `name:nl`. Brugge, Antwerpen, Brussel, Düsseldorf,
  Keulen, Bonn, Münster staan er al (zie U6-still `minzoom-real-basemap-desktop.png`). Vlaamse
  plaatsen verschijnen dus al op dezelfde niveaus. Wallonië/Duitsland/Frankrijk wéghalen zou een
  nieuwe beperking zijn die de PO niet vroeg (en OpenMapTiles-`place` heeft geen landattribuut; het
  kan alleen met een `within`-polygoon). Niet gedaan; voor de PO/orkestrator als optie.
  Provinciegrenzen: de bestaande `admin_level = 4`-laag tekent NL- én BE-grenzen al (gewesten/
  provincies zijn in OSM beide 4 resp. 6 — BE-provincies zijn admin_level 6, dus die staan er níet,
  alleen gewestgrenzen Vlaanderen/Wallonië/Brussel). Ongewijzigd gelaten.
- **Zoeken**: `core/geocoder.ts` — PDOK + Digitaal Vlaanderen geolocatie v4 (`/Location`, gratis,
  geen sleutel, CORS `*`) parallel via `allSettled`; alleen gemeenten (`basisregisters_gemeente`,
  `urbis_gemeente` = Brussel), middelpunt direct uit het antwoord (geen lookup). Volgorde: land van
  de dichtstbijzijnde `places`-stad onder het kaartcentrum eerst, andere bron ≥ 2 van 6 rijen,
  exacte naamtreffer bovenaan (Hasselt NL én BE). BE-rijen: small `BE`. `docs/geocoding.md`.
  `LocationSearch` krijgt `mapCenter` (App: `map.getCenter()`), verder geen UI-wijziging.
- **About**: bron "Zoeken" (PDOK + Digitaal Vlaanderen, bronvermelding) en de zin "De kaart dekt
  Nederland en Vlaanderen: de KNMI-radar en HARMONIE reiken tot ver over de grens."
- **Tests**: `geocoder.test.ts` (viewportland, merge/voorrang/reservering, exacte treffer,
  gemeentefilter+dedupe, beide bronnen gemockt via fetch-stub, één/beide bronnen falen),
  `LocationSearch.test.tsx` (Gent · BE zonder PDOK-lookup), `places.test.ts` (Vlaamse klikken),
  `temperature.test.ts` (Vlaamse provincies; bovengrens desktop-zoom-7 20 → 24; A–M–B-dichtheid),
  `map-constraint.test.ts` (kader bevat Brussel/Leuven/Hasselt/Voeren/Halle/De Panne; rotatietest
  omgedraaid: liggend past nu verder uitgezoomd), `map-frame.test.ts` (nieuwe padding-getallen).
  e2e `flanders.spec.ts`: zoeken op "Gent" (beide API's gemockt) → rij "Gent BE" bovenaan,
  klik → scrubber "voor Gent" en de marker op de projectie van Gent (±6 px).
- Receipts tot nu: `pnpm typecheck` exit 0; `pnpm test` exit 0 (43 files, 245 tests; `pnpm
  synthgen` eerst nodig voor mrf.test).
