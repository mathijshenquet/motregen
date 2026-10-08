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

## 2026-10-08 09:23 UTC — schone gate en gerichte volgordemeting
- Correctie bij vorige entry: bot-unitreceipt was 60/60, niet 63/63; web 506/506 blijft correct.
- SYNCHROON exit 0: `MOTREGEN_E2E_PORT=4397 MOTREGEN_E2E_DATA_PORT=8397 pnpm --filter motregen-web e2e e2e/location.spec.ts e2e/presets.spec.ts e2e/seo.spec.ts e2e/basemap-cache.spec.ts --project desktop` — 22/22. Amsterdam-Noord blijft exact bij twee herlaads met een onvoltooide catalogusaanvraag; Woerden idem zonder geocoder; andere stad Haarlem kiest direct het kleine-lijstcentrum.
- Extra PWA-gate vond een bestaande testfout: goto(page.url()) met hetzelfde tijdfragment deed een same-document navigatie (trace: 6 ms, geen nieuwe documentresponse), waardoor SW-controle nooit begon. Twee calls vervangen door echte reload. Beide viewporttests nu groen; catalogus ontbreekt in precache, staat na echte aanvraag in runtime-cache en is daarna offline opvraagbaar (6.997 namen).
- Laatste typecheck en build exit 0; profiler/rapportage-unitcheck 20/20 exit 0: `pnpm --filter motregen-web exec vitest run scripts/mobile-report.test.ts src/core/perf.test.ts`.
- Hostload bleef bij parallelle bot-/Chromium-taken oplopen (loadavg 19–59). Voor deze PO-vraag is de causale aanvraagvolgorde controleerbaar onder load. Rigmodus --request-order behoudt het profiel, quota, koude cache en native Resource Timing, labelt de capture expliciet als volgorde en weigert baseline/compare (ook compactBaseline weigert zo'n capture). Normale perf-rig houdt zijn rustige-host-gate. Geen oude timingbaseline vergelijken of overschrijven; nieuwe U65-watervallen gebruiken main met Kaderhemel aan en documenteren de hostload.
- Volgende stap: desktop/po-android captures, extractor + ingecheckte compacte JSON/SVG, PR met tabel en bewijslinks bijwerken. Preview is uit de huidige werkboom opnieuw gebouwd.

## 2026-10-08 09:40 UTC — Resource Timing-bewijs desktop en po-android
- Beide captures SYNCHROON exit 0 (1/1 per profiel): `MOTREGEN_E2E_PORT=4397 MOTREGEN_E2E_DATA_PORT=8397 pnpm --filter motregen-web perf:mobile --profile desktop --scenario koud-spelend --basemap own --repeat 1 --request-order`, daarna hetzelfde met `--profile po-android`. Broncommit a071653 bevat U62/U66 + de volledige laadvolgorde- en opslagfix; Kaderhemel staat aan. Koude HTTP-cache, SW geblokkeerd, geen live-netwerk, beide nul netwerkbevindingen.
- De desktop gebruikt het bestaande desktopprofiel (raster ×1); po-android gebruikt 390×844, wifi 30 Mbps/20 ms, renderer + workers op 40% kernquota met 5 ms-periode, raster ×6. Hostload bij start 45,89/38,60: uitsluitend bewijs van aanvraagvolgorde, geen performancebaseline of snelheidsvergelijking. Geen eerdere baseline overschreven.
- Native tijden vanaf navigation timeOrigin (ms), inclusief worker-entries naar dezelfde origin omgerekend:

| gebeurtenis | desktop | po-android |
| --- | ---: | ---: |
| manifeststart | 149,7 | 489,9 |
| stijlstart | 149,5 | 489,7 |
| eerste regen-Range (header) | 247,6 | 839,7 |
| eerste regenframe-Range | 285,3 | 1009,4 |
| milestone:ttfp | 2349,1 | 3029,9 |
| plaatsen-4d18b8790eecd5af.json start | 3121,4 | 4075,0 |
| plaatsenstart − ttfp | +772,3 | +1045,1 |
| catalogus gzip-bodybytes | 60.946 | 60.946 |

- Extractor receipt exit 0: `pnpm --filter motregen-web exec tsx scripts/place-waterfall.ts tmp/perf-mobile/desktop-koud-spelend-run1.raw.json tmp/perf-mobile/po-android-koud-spelend-run1.raw.json`. Het manifest heeft een ?s=1 query; de extractor gebruikt pathname. Playwright-netwerkstart wijkt af van native fetchstart, daarom koppelt hij bevestigde 206-Ranges via URL + bodygrootte aan native entries. Alle getoonde starts blijven native Resource Timing, ttfp is de echte user-timingmeasure.
- Compacte JSON + SVG ingecheckt onder metingen/desktop.plaatsen.* en metingen/po-android.plaatsen.*; volledige .raw.json/.trace.json/.md blijven in web/tmp/perf-mobile/. SVG visueel gecontroleerd. Beide assertions eisen lijst ná ttfp, manifest, stijl, eerste header-Range én eerste frame-Range. Rechtstreekse guardcheck op de echte capture bevestigt dat compactBaseline hem weigert.
- Laatste codecontrole corrigeerde de zoek-snapshot voor dubbele namen: de catalogus kiest de juiste naam-slug bij het punt, geen extra korte slug van de andere plaats. De expliciet gekozen zoeknaam/slug blijft ook bij late catalogusverrijking staan. Catalogus/geheugen/profiler/rapportage 30/30 exit 0; herhaalde location/flanders desktop 8/8 exit 0; daarna volledige units opnieuw web 506/506 + bot 60/60 exit 0. Laatste typecheck/build en zoekbrowsercheck worden na deze entry nog afgesloten.
- Preview 4345 actief; HTTP /weer/amsterdam levert huidige bundle index-CUGmmm59.js vóór de laatste zoeknaamcorrectie. Een laatste normale build vernieuwt de preview ook voor die correctie. Geen server-side plaatsdata toegevoegd; kleine lijst, thermolabels en sitemap blijven behouden.

## 2026-10-08 09:41 UTC — eindreceipt en PR-bewijs
- Laatste zoeknaamcorrectie geverifieerd: `pnpm typecheck` en `pnpm build` exit 0; `MOTREGEN_E2E_PORT=4397 MOTREGEN_E2E_DATA_PORT=8397 pnpm --filter motregen-web e2e e2e/flanders.spec.ts --project desktop` 1/1 exit 0. Test controleert Gent-URL én de direct opgeslagen exacte pin met Gent-zone, naast de markerprojectie.
- De laatste wijziging raakt alleen expliciete zoekkeuze; het opstartpad uit beide watervallen blijft gelijk. Typecheck na de definitieve extractor met header- én frame-Range exit 0. Volledige unitreceipt 506 web/60 bot, desktop trackgate 22/22 en aanvullende gerichte receipts hierboven blijven expliciet onderscheiden.
- Alle check-sessies afgesloten met geobserveerde exitstatus. git diff --check exit 0. Eindcommit bevat JSON/SVG-bewijs, LOG en zoek-snapshotcorrectie; push en PR #93 bijwerken met native watervaltabel, bewijslinks en hostloadbeperking. Preview blijft bewust als user-service voor review beschikbaar; niet gemerged.

## 2026-10-08 09:54:23 UTC — slotentry, track klaar
- Orkestrator meldt U65 gemerged op main als 0fb247ecef5229efe0a8ee3205f98290a1e9a9bb (0fb247ec), na onafhankelijke gate: typecheck exit 0, 506 unitchecks, build exit 0 en 27 gerichte desktop-e2e groen. Mergecommit na fetch gecontroleerd; behoort tot origin/main.
- Preview motregen-u65-preview.service gestopt met systemctl --user stop (exit 0). Service niet actief; ss toont geen listener meer op poort 4345. Alle checks afgerond, geen lopende checksessies.
- Slotentry append-only; commit + push naar track/u65-plaatsen-en-pin. Track klaar, geen open werk.
