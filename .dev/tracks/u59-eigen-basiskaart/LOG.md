# U59 — eigen basiskaart

## 2026-10-07T16:22:10Z

Opdracht/spec en MIP-21 gelezen; schone branch `track/u59-eigen-basiskaart`, devenv actief. Deze LOG wordt op expliciet verzoek gecommit (uitzondering op de algemene scratch-LOG-regel). Eerst nulpunt, daarna tilemaker-pijplijn; geen agents gedelegeerd.

De bestaande `perf:mobile`-rig gebruikt een 106-byte synthetische land/watertegel, geen representatieve OpenFreeMap-tegels. Daarom een aparte basemap-keuze in dezelfde rig toevoegen met lokaal vastgelegde echte tegels en identieke viewport/throttle. Bestaande synthetische baseline blijft afzonderlijk. Ontdekking: nixpkgs levert tilemaker 3.1.0; machine heeft circa 88 GiB beschikbaar geheugen en 1,3 TiB vrije opslag.

## 2026-10-07T16:28:49Z

Nulpunt met echte OpenFreeMap/Liberty-snapshot (planet `20261004_113936_pt`), offline onder dezelfde rig. `pnpm --filter motregen-web exec tsx ../tools/basemap/snapshot.mts` → exit 0 (50 lokale bestanden). Eerste poging miste snapshot omdat synthgen de fixturemap wist; opgelost door snapshot in genegeerde `tmp/basemap/openfreemap` te bewaren en na synthgen te kopiëren. `pnpm typecheck` → synchrone exit 0.

`pnpm --filter motregen-web perf:mobile --profile mobile-4g --scenario koud --basemap openfreemap --repeat 3 --baseline` → synchrone exit 0; 3/3. Basemap-fase count 5, totaal 5568,5 / 5816,9 / 5764,4 ms; p50 850,2 / 894,5 / 869,0 ms. Tegels+glyphs: 10 requests, 1.306.253 B, PW/RT exact gelijk. Alle bodybytes: 3.009.816 B, 297 decodes, 0% spreiding. Fase omvat netwerk én MapLibre-worker/afhandeling; som van overlappende tegelduur is geen exclusieve hoofddraad-CPU. CDP remt workers niet. Desktopmeting loopt.

Pakketkeuze: tilemaker 3.1.0 (BSD), osmium/GDAL voor extract/kust; npm pmtiles 4.5.0 (BSD) toegevoegd voor het MapLibre-protocol. De kustbron is OSM water polygons (ODbL), geen losse coastline-lijnen: zo blijven Noordzee en Waddenwater gevuld. Pijplijnbestanden worden uitgewerkt; productie is nog niet gewijzigd.
