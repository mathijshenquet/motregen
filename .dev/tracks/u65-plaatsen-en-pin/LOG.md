# Track U65 — plaatsen en pin

## 2026-10-08 10:19 UTC — start
- Spec, projectcontext en U57 gelezen; devenv/direnv actief, werkboom schoon op track/u65-plaatsen-en-pin.
- Opdrachtgever vraagt dit LOG expliciet committed; daarom wijkt deze track af van de algemene scratch-LOG-regel.
- Huidige onthouden locatie komt uit kaartcamera of laatstgekozen favoriet; losse pin wordt nog niet apart opgeslagen. Volledige OSM-lijst krijgt een index, eigen pinopslag en zoneresolutie vóór de eerste kaart.
- Volgende stap: herbruikbare bron uit basiskaartpijplijn vinden, generator + compacte lijst en gerichte unitchecks; coherent eerste commit direct als draft-PR publiceren.

## 2026-10-08 08:21 UTC — bron en aanpak
- Correctie: starttijd in vorige entry was handmatig verkeerd ingevuld; hostklok is 08:xx UTC, gestart rond 08:13 UTC.
- Gepubliceerd U60-PMTiles heeft 6.985 city/town/village-punten; beperken tot kaartbounds geeft 6.035. Genereren uit dit archief vermijdt een nieuwe multi-GB OSM-download.
- Gemeenten voor dubbele namen via PDOK gemeentegrenzen (NL) en OSM Overpass admin_level=8 (BE/DE); een ingecheckte kleine lookup houdt de normale generator offline/reproduceerbaar.
- Keuze: kd-tree met vaste lokale projectie; zone = nearest-slug gelijk OF binnen city 8/town 5/village 3 km (haversine). Pin apart bewaren, kamera alleen als migratiefallback.

## 2026-10-08 08:27 UTC — eerste controle en reviewbasis
- kd-tree + zonefunctie getest: 14 checks groen (7 index/zone, 7 locatiegeheugen), exit 0 gezien: `pnpm --filter motregen-web exec vitest run src/core/place-index.test.ts src/core/location-memory.test.ts`.
- Indexcheck vergelijkt 100 verspreide punten tegen een onafhankelijke lineaire referentie met 5.000 kandidaten; radiusgrenzen en Amsterdam-Noord/Haarlem expliciet getest.
- Eerste commit bevat de zelfstandig bruikbare index/zoneregel; lijstexport en App-integratie zijn nog in uitvoering. Overpass levert gemeenten met tussentijdse 429/504; lookup wordt per batch veilig opgeslagen.
- Volgende stap: draft-PR openen, gemeenten/export afronden en volledige trackgate uitvoeren.

## 2026-10-08 08:43 UTC — complete implementatie, gate gestart
- Draft-PR #93: https://github.com/mathijshenquet/motregen/pull/93; eerste push bevestigd met `git ls-remote origin track/u65-plaatsen-en-pin`.
- Export herkent Point én MultiPoint, alle 6.997 plaatsen binnen MAP_CONTAIN_BOUNDS. Asset plaatsen-4d18b8790eecd5af.json: 132.509 bytes, gzip 60.946 bytes ≤ 60 KiB. Offline generator twee keer byte-identiek, exit 0 gezien (`pnpm basemap:places`). Lookup teruggebracht tot de 290 benodigde gemeentevermeldingen.
- Lazy loader, kd-tree, exacte losse pinopslag, voorkeur laatste locatie/favoriet/centrum, privacy-slug en browsernavigatie geïntegreerd. Standaard De Bilt telt zonder geheugen niet als onthouden pin.
- U65-regels vastgelegd in MIP-21 (adoptiestatus niet veranderd), bron/formaat in docs/plaatsen.md. Temperatuurlabels en sitemap blijven bij de originele 67 handmatige plaatsen (spec noemde 69; werkelijk 67).
- Typecheck exit 0. Eerste volledige unit-run: 490 groen, nieuwe catalogustest viel om door mijn onjuist relatieve pad; gecorrigeerd, gerichte catalogusrun 2/2 exit 0. Volledige run herhalen voor schoon receipt.
- Build exit 0 gezien vóór laatste Caddy-uitbreiding. Precompressed JSON + immutable header en gerichte SEO-check toegevoegd; nieuwe build en desktop location/presets/seo volgen nu. PR blijft draft zolang die checks lopen.

## 2026-10-08 08:53 UTC — eindcontrole en overdracht
- Complete gate exit 0 geobserveerd: `pnpm typecheck`; `pnpm test` (web 492/492, bot 60/60); `pnpm build`.
- Desktop receipt, 19/19 exit 0: `MOTREGEN_E2E_PORT=4397 MOTREGEN_E2E_DATA_PORT=8397 pnpm --filter motregen-web e2e e2e/location.spec.ts e2e/presets.spec.ts e2e/seo.spec.ts --project desktop`. Hiermee zijn pin slepen in Amsterdam-Noord, /weer/amsterdam herladen, Haarlem-centrum, URL/time/popstate, sitemap en Caddy gzip + immutable header gecontroleerd.
- Laatste correctie: ook een vóór de eerste kaart gekozen URL-centrum direct opslaan. Gerichte herhaling location/presets 13/13 exit 0, exact command als boven met alleen die twee bestanden; nieuwe assert controleert de onthouden Haarlem-coördinaten.
- Codecontrole vond dat de catalogus geen landcodes heeft: geocoderbronvoorkeur daarom expliciet uit de bestaande lijst behouden. Catalogus/geocoder 8/8 exit 0, daarna volledige unit/typecheck/build opnieuw exit 0; de overige e2e-paden zijn hierdoor niet veranderd.
- Preview http://ageq-dev2:4345/ draait als user-unit motregen-u65-preview.service (bewust blijvend; geen lopende checks). MOTREGEN_DATA_ORIGIN=https://motregen.nl/data, lokale PMTiles met Range. HTTP-verificatie: Amsterdam-title correct; live manifest generated 2026-10-08T08:48:38Z met 42 chunks; PMTiles-header 206/127 bytes. Eerste preview-origin zonder /data gaf SPA-HTML, vóór overdracht hersteld en opnieuw gecontroleerd.
- `git diff --check` exit 0. Regels en bron beschreven, dataset en gzip eingecheckt, thermolabels/sitemap ongewijzigd. Laatste commit/push + PR-status bijwerken; gereed voor onafhankelijke orkestrator-gate en merge, niet gemerged.

## 2026-10-08 09:12 UTC — PO-laadpijplijnvraag, correctie en main-merge
- Controle bevestigde twee fouten: App vroeg de catalogus direct in onMount en wachtte op de lijst bij een plaats-URL; Workbox precache bevatte bovendien plaatsen-*.json. Beide gecorrigeerd: idle na de eerste getekende afspeelwissel (ttfp); gepauzeerde tijdpreset na eerste regen-draw. Runtime-cache uitsluitend na de echte aanvraag, geen precache.
- Pinopslag bevat nu plaatsnaam/slug en alle passende zones (nearest OF city/town/village-radius), direct bij kiezen; favorieten eveneens. Herladen beslist uit lokale zones of de bestaande kleine lijst, zonder de volledige lijst. Verrijken na laden verandert geen pin. Server-side HTML bewust buiten scope (PO: YAGNI).
- origin/main 43b92d6 inclusief U62 8d75754 + U66 gemerged als 2ce9ace, geen conflicten. Nieuwe meetruns hebben Kaderhemel aan; oude startsituatie is geen timingbaseline voor dit vervolg.
- Gerichte unit receipt: 29/29 exit 0 (`pnpm --filter motregen-web exec vitest run src/core/place-index.test.ts src/core/location-memory.test.ts src/core/saved-places.test.ts src/core/place-catalogue.test.ts src/core/perf.test.ts`). Volledige unit receipt daarna: web 506/506 + bot 63/63; typecheck/build exit 0 gezien. Laatste App-correctie vraagt nog nieuwe build/typecheck.
- Eerste nieuwe desktopgate 17/20: nieuwe geblokkeerde Woerden-herlaad groen; Amsterdam-test werd nog vóór test.use(serviceWorkers:block) geladen en SW omzeilde de onderschepte request. Favorieten-verrijking verving UI-objecten en verloor focus; metadata-opslag nu gescheiden van de UI-array. Eén manifest-404 viel samen met mijn parallelle unit-pretest synthgen die de geserveerde fixture herbouwde; die taken voortaan sequentieel. Schone gate volgt.
- Eerste rigpoging (`MOTREGEN_E2E_PORT=4397 MOTREGEN_E2E_DATA_PORT=8397 pnpm --filter motregen-web perf:mobile --profile desktop --scenario koud-spelend --basemap own --repeat 1 --load-wait 1`) brak af bij loadavg 10,66–17,64, exit 1, geen measurement receipt. Niet als baseline gebruikt. Nieuwe Resource Timing-extractor scripts/place-waterfall.ts eist plaatsenstart > milestone:ttfp en > manifest/stijl/regen-Range; desktop en po-android volgen na de functionele gate op rustige host.
