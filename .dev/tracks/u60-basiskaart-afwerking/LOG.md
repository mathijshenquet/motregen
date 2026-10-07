# U60 — basiskaart-afwerking

## 2026-10-07T21:15:00Z — Start

- `git fetch origin main` + `git merge --ff-only origin/main`: exit 0; basis `7e8c33b`, inclusief contrastieve A/B-aanvulling.
- Spec, MIP-21, docs/basemap.md, tilemaker-profiel, publisher, snapshot en basemap-client gelezen. Devenv actief (`DIRENV_ACTIVE`, `IN_NIX_SHELL`).
- PO-PNG bekeken: het bestand toont de uurtabel, geen kaart. Eigen vaste A/B-views leveren het visuele bewijs.
- U59-tracklog is niet aanwezig in deze checkout; de broncheckout en bewaarde snapshot/tussenbestanden worden gezocht.
- Plan: Liberty-snapshot hergebruiken; groenklassen/rankfilters en nachtcontrast aanpassen, archief via publisher vernieuwen; vaste A/B in licht/donker met meettabel; gerichte checks en mobiele rig. Preview 4340, rig 4397/8397, aparte outDir.
- Dit LOG is op expliciet verzoek committed, append-only. Grote tussenbestanden staan onder het genegeerde `tmp/`.

## 2026-10-07T19:17:00Z — Bronnen gevonden

- Correctie tijdregistratie: vorige entry gebruikte de lokale PO-tijd als UTC. Hostklok is circa 19:15 UTC (21:15 Amsterdam); vanaf hier UTC uit `date -u`.
- U59-bestanden staan in `/home/mathijs/motregen/tmp/basemap/`; bewaarde Liberty-snapshot en gepinde OSM-bronnen worden naar de eigen genegeerde scratch gekopieerd. De U59-track-LOG is ook daar niet aanwezig; docs en receipts onder tmp zijn de terugval.
- Eigen donkere achtergrond is `#222e31`, terwijl U59 Liberty-donker `#101d21` gebruikt: dit verklaart minder water/landcontrast. De kleurreferentie en bestaande `darkenLibertyLayer` worden hergebruikt.

## 2026-10-07T19:22:00Z — Referentie opnieuw vastgelegd

- Correctie vorige entry: de veronderstelde U59-scratch in de main-checkout bestond niet; de kopieercommando’s faalden. Zoekactie over `/home/mathijs` vond geen bewaarde U59-snapshot of bron-PBF’s.
- `pnpm basemap:snapshot`: exit 0. Liberty opnieuw vastgelegd op tileset `20261004_113936_pt`; relevante stijllagen komen in `tools/basemap/liberty-reference.json`, zodat productieherbouw geen netwerkstijl nodig heeft. OSM-PBF’s opnieuw opgehaald, hashcontrole volgt.
- Liberty kleurt `farmland` niet: die klasse blijft buiten het archief. Gras omvat meadow/grassland/heath/scrub/park; wetland begint visueel op z12, zand is zichtbaar in de detailviews.
- Koude mobiele U59-nulmeting gestart vóór stijlwijzigingen, eigen poorten en rig-outDir.
## 2026-10-07T19:23:20Z — Eerste implementatie

- Groenprofiel uitgebreid met grass/park/wetland/sand; farmland bewust niet toegevoegd, Liberty kleurt die klasse niet. Landcover wordt grover gesimplificeerd en per klasse samengevoegd.
- Stijlgenerator gebruikt vastgelegde Liberty-verven en de bestaande donkertransformatie. Label-minzoom/grootte volgen Liberty, rank/population en padding beperken concurrentie zonder wegen toe te voegen.
- Eerste tilemaker-run faalde door Lua’s meervoudige `gsub`-return naar `tonumber`; afzonderlijke `population_text` herstelt dat. Herbouw loopt.
- Voor-meting: drie eigen-kaartfasen 678,8 / 244,9 / 458,2 ms. `--compare` exit 1 wegens verouderd baselinecontract, hoewel de drie browserruns slaagden. Nieuwe OpenFreeMap-baseline: exit 0, 128 decodes en 2.470.372 B in alle drie runs, spreiding 0 %.
- Web-typecheck exit 0. Bestaande basemap-unitcheck verwacht nog een onvoorwaardelijk naamveld: 2 van 6 rood; wordt aangepast voor de rankselectie.
- A/B-tooling schrijft vaste beeldparen, zichtbare unieke plaatsnamen, geometrisch groenmasker en CIE L*-verschillen. Deze verificatie is nog niet uitgevoerd; draft-PR volgt nu.
## 2026-10-07T19:27:42Z — Checks en bouwstatus

- Draft-PR geopend: https://github.com/mathijshenquet/motregen/pull/87; implementatie/verificatie nog in uitvoering.
- Stijlvalidator vond dat zoom alleen de invoer van een buitenste step/interpolate mag zijn; rankselectie omgezet naar buitenste text-field-step. Unitcheck gebruikt nu ook MapLibre’s echte validator.
- `pnpm typecheck`: exit 0 (web + bot). `pnpm test`: eerst exit 1 wegens ontbrekende gegenereerde UV-fixture. Na `pnpm --filter motregen-web synthgen` opnieuw `pnpm test`: exit 0, web 70 bestanden/461 tests en bot groen. `tsc` op de nieuwe A/B-spec: exit 0.
- De eerste A/B-start is bewust beëindigd (exit 143) voordat de archiefherbouw voltooid was; geen visueel receipt geclaimd.
- Tilemaker is CPU-actief, maar polygon-union van de extra groenklassen kost veel tijd op lage zoom. Als dit geen beheersbare herbouw oplevert, blijft zoomgeneralisatie behouden en vervalt die extra union-stap.
## 2026-10-07T19:31:11Z — Archiefherbouw

- `pnpm basemap:build` derde poging: exit 0, inclusief bron-SHA256, tilemaker, PMTiles cluster/verify en publisher-schema-/naamcontrole. Extra polygon-union is verwijderd: circa 90 s herbouw tegenover minutenlang vastzitten op lage zoom.
- Strikte losse tooling-typecheck exit 0. Hiervoor is de web-maplibre-typebinding tijdelijk onder het genegeerde tools/basemap/node_modules beschikbaar gemaakt; eerdere losse check kon de type-import buiten web niet vinden.
- A/B opnieuw gestart met het vernieuwde archief; de beeld- en labelresultaten bepalen eventuele verdere generalisatie/rankafstelling.
## 2026-10-07T19:36:57Z — Eerste A/B gelezen, bijstelling

- Eerste beeldparen bekeken: groen is nog te schaars (390-start 8,20→2,52 %, Utrecht z9 19,77→12,49 %; 1280-start 10,8→3,1 %). Startlabels 390 6→6, desktop 19→30; detail-Utrecht z9 25→39 / 70→110. Dit is nog geen eindresultaat.
- Groenfilter 0,6→0,08 en simplificatie terug naar U59’s 0,00015 om meer oppervlak te behouden; herbouw loopt. Oude meet-JSON’s staan in genegeerde scratch/iteration-1.
- Nachtcontrast kale-landverf: U59 eigen ΔL* water–land 3,47 en label–land 66,33; Liberty/U60 11,68 en 74,53. Het start-raster maakt Liberty’s daadwerkelijke land iets lichter (390: 8,4 water–land); U60 hoeft dat contrastverlies niet over te nemen.
- A/B-tests maakten alle 28 paren maar meldden de lokale blob-URL’s van MapLibre-workers ten onrechte als extern. Check beperkt tot http/https; geen extern netwerk geaccepteerd. Nachtgate controleert minstens Liberty-contrast in plaats van gelijkheid aan zijn rasterafzwakking.
- Labelvarianten worden in een browser onder hetzelfde e2e-slot gemeten, met nadruk op grote herkenbare steden en oorspronkelijke provincielabels.
## 2026-10-07T19:43:51Z — Checkpoint en verdere generalisatie

- Losse kleine groenpolygonen behouden gaf 9.716.018 B en overschreed het budget. Deze tussenversie wordt niet gepubliceerd in de branch.
- Nieuwe poging: unions per circa 7×11 km via ZOrder-groepen, met oorspronkelijke zoomsimplificatie en area-filter. Dat behoudt aaneengesloten groen zonder één landelijke union. Herbouw loopt.
- Steden staan nu net als Liberty na provincie-labels, zodat grote steden niet door provincietekst verdwijnen; provincie-minzoom/grootte/kleur blijven U59. Tuning startset: 390 7 versus 6, 1280 18 versus 19. Detail-padding wordt bij z10 weer klein.
- Checkpoint commit bevat code en gevalideerde rankstijl op het bestaande U59-archief; vernieuwde tegels/beeldparen volgen pas na budget- en A/B-gates. Zo blijft de gepushte stijlbron beschikbaar.
## 2026-10-07T20:03:29Z — Kandidaten-A/B en parks

- Unions bleven ook met precieze lokale sleutels te traag; gewone zoomgeneralisatie zonder union levert een reproduceerbare kandidaat binnen het archiefbudget: 4.224.699 B (+19,47 %). Niet-geselecteerde archieven blijven alleen in scratch.
- Kandidaten-A/B en basemap-spec: 11 browsertests passed; tooling-uitgang apart geobserveerd. Startlabels nu 390 6→7 (+16,7 %), 1280 19→18 (−5,3 %). Utrecht z9 25→23; z10 29→27; geen externe requests.
- Groen bij de kandidaat: start390 8,20→3,67 %, Utrecht z9 19,77→15,53 %, z10 18,72→17,27 %. Detail is veel beter; lage zoom vraagt nog parkvlakken.
- Oorzaak extra lage-zoomverlies: tilemaker stuurt multipolygonen automatisch naar way_function, maar boundary-relaties van nationale parken/natuurreservaten alleen via relation_function. Die vlakroute ontbreekt; toegevoegd op hetzelfde landcover-schema. Herbouw met definitief profiel loopt; daarna A/B en perf opnieuw.
## 2026-10-07T20:08:41Z — Budget ook per zoom

- Park-route herbouw exit 0: 4.330.752 B (+22,47 % archief), maar z5–7 bevatten nog te grote piektegels (z6 +54 %). Daarom wordt het +25 %-budget ook per zoom en voor de grootste tegel gecontroleerd, niet alleen op het archief.
- Landcover heeft nu een grover lage-zoomprofiel z5–7 (`filter_area` 0,45) dat naar dezelfde landcover-schema-laag schrijft. Detail z8–10 gebruikt 0,3 en iets extra simplificatie (0,00023). Geen tweede bron of extra clientwerk.
- Nationale hoofdsteden krijgen rang 2, zoals de belangrijke steden in Liberty; zo wordt Brussel bij de lage-zoomselectie niet achter Charleroi verborgen. Geen nieuw place-attribuut nodig.
- Definitieve herbouw loopt; alle A/B-paren en de mobiele rig worden daarop opnieuw gemeten.
## 2026-10-07T20:14:55Z — Publisher-gate en hervatpunt

- Publisher weigert nu archief én per-zoom totaal/grootste tegel boven U59 +25 %, met vaste referentie in `tools/basemap/budget.json`.
- Herbouw 9: exit 1, gate vond z6-grootste 36.106 B tegen maximaal 35.573,75 B. Profiel z5–7 aangescherpt naar filter_area 0,56; detail z8–10 simplify_level 0,00024 en filter_area 0,3.
- Herbouw 10 loopt, output `tmp/basemap/u60/build-10.txt`; actieve exec-session 42285 was poging 9 (afgerond rood). Daglicht-/nacht-A/B-kandidaat was 11/11 groen; eind-A/B op nieuwe hash moet nog.
- Volgende stappen: herbouw 10 receipt/budget bekijken; alleen U59-archief + gekozen nieuwe hash in tools/basemap/tiles houden (tussenversies naar tmp); commit data/stijlen; `MOTREGEN_E2E_PORT=4397 MOTREGEN_E2E_DATA_PORT=8397 MOTREGEN_MOBILE_BASEMAP=own MOTREGEN_BASEMAP_COMPARISON=1 pnpm --filter motregen-web e2e e2e/basemap-comparison.spec.ts e2e/basemap.spec.ts --config playwright.basemap.config.ts --project desktop`; daarna `MOTREGEN_E2E_PORT=4397 MOTREGEN_E2E_DATA_PORT=8397 pnpm --filter motregen-web perf:mobile --profile mobile-4g --scenario koud --basemap own --repeat 3 --compare`.
- Daarna eindmetingen naar LOG via `pnpm --filter motregen-web exec tsx ../tools/basemap/report-comparison.mts`; screenshots alle 8 app-paren bekijken; docs nieuwe archief/statistiek; typecheck/test/build (web/dist voor preview 4340; rig uitsluitend tmp/perf-mobile/dist-4397), cache-spec, Nix-basemap-package, finale PR-status/PO-review. Nog geen eind-groen claim.
## 2026-10-07T20:19:05Z — Definitief archief: bytegates groen

- `pnpm basemap:build` poging 10: exit 0, inclusief gepinde bron-SHA’s, tilemaker, PMTiles cluster/verify, alle schema-/naamchecks en de nieuwe +25 %-gates per archief, tegeltotaal per zoom en grootste tegel.
- Definitief `nl-1395e020ae33a90b.pmtiles`: 4.191.993 B (+18,55 % tegenover U59 3.536.092 B), 1.951 tegels, z4–10. Alleen U59 en deze nieuwe hash blijven in de publiceerbare tiles-map; tussenarchieven verplaatst naar genegeerde scratch/rejected.
- Code en gehashte data/stijlen worden nu samen gecommit. Docs-archiefcijfers bijgewerkt. Eind-A/B en rig hieronder volgen op deze hash; PO-akkoord blijft open.

## 2026-10-07T20:31:48.577Z — Eindchecks en labelcorrectie

- Eerste eind-A/B exit 1: mobiel 6→8 plaatslabels, buiten ±20 %. Padding onder z6 verhoogd van 18 naar 24; z8–9 gebruikt 14. Nieuwe vier A/B-tests lopen; mobiel licht/donker inmiddels passed. Maskertransities uitgeschakeld om identieke dag-/nacht-geometrie te meten.
- Definitieve archiefcode: pnpm typecheck, pnpm test, pnpm build alle exit 0. Web 70 bestanden/461 tests; bot 58 tests. Na de paddingcorrectie basemap-unitcheck 6/6 en pnpm --filter motregen-web build opnieuw exit 0. Receipts in tmp/basemap/u60/{typecheck-final,unit-final,build-web-final,build-preview-final}.txt.
- nix build .#motregen-basemap --no-link --print-out-paths: exit 0. Package /nix/store/zcgrg2v2d8mghxzmq9vja34vz5d2il8z-motregen-basemap; archief-SHA exact gelijk aan repo: 1395e020ae33a90b51b0013650ce2b5697d655124b0cc1082de52b7274a79540.
- Preview http://ageq-dev2:4340/ gestart op de productiebuild. Lokale ingest :8080 is niet beschikbaar; daarom MOTREGEN_DATA_ORIGIN=https://motregen.nl/data. HTTP-root/manifest 200, PMTiles Range 0–126 geeft 206 met 127 B. De lokale gehashte kaart wordt rechtstreeks geserveerd.
- Volgende stap: eind-A/B receipt, mobiele rig drie koude runs, cache-spec en PO-beeldreview.

## 2026-10-07T20:32:10.276Z — Contrastieve A/B (nl-1395e020ae33a90b.pmtiles, head d3b24bf)

Oud = offline OpenFreeMap/Liberty met U59’s filtering en darkenLibertyLayer; nieuw = eigen archief. De camera en het kaartvlak zijn per paar gelijk. Groen is het getekende onbedekte wood/grass/park-oppervlak via een zwart/wit-masker, als percentage van het hele kaartvlak (incl. water). Plaatslabels zijn unieke geplaatste city/town/village-namen; provincies tellen niet mee.

ΔL* gebruikt sRGB→CIE L*. Kale landkleur = dominante screenshotkleur nabij de stijlachtergrond; water-/labelverf zijn de dekkende stijlkleuren, grenzen worden met hun werkelijke dekking over land gemengd. Dit meet kleurcontrast vóór tekst-antialiasing; lijndikte, halo en groenoppervlak blijven in de PNG-paren zichtbaar. Liberty’s rasterachtergrond beïnvloedt alleen de lage startzoom. Wetland-textuur en fijne POI-/gebouwdetails zijn geen onderdeel van de eigen kaart.

| Paar (oud naast nieuw) | Groen % oud / nieuw | Plaatslabels oud / nieuw | ΔL* water–land | ΔL* label–land | ΔL* landgrens–land | ΔL* provinciegrens–land |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [390 licht start](ab-390-light-start.png) | 8.20 / 4.39 | 6 / 6 | 17.27 / 19.78 | 93.88 / 96.39 | 49.81 / 44.14 | 30.14 / 31.90 |
| [390 licht utrecht](ab-390-light-utrecht.png) | 19.77 / 15.62 | 25 / 28 | 19.78 / 19.78 | 96.39 / 96.39 | 52.32 / 44.14 | 31.90 / 31.90 |
| [390 licht kust](ab-390-light-kust.png) | 2.03 / 1.79 | 5 / 3 | 19.78 / 19.78 | 96.39 / 96.39 | 52.32 / 44.14 | 31.90 / 31.90 |
| [390 licht ijsselmeer](ab-390-light-ijsselmeer.png) | 3.22 / 2.39 | 15 / 14 | 19.78 / 19.78 | 96.39 / 96.39 | 52.32 / 44.14 | 31.90 / 31.90 |
| [390 licht utrecht-z7](ab-390-light-utrecht-z7.png) | 15.20 / 12.41 | 16 / 15 | 19.78 / 19.78 | 96.39 / 96.39 | 52.32 / 44.14 | 31.90 / 31.90 |
| [390 licht utrecht-z10](ab-390-light-utrecht-z10.png) | 18.72 / 17.22 | 29 / 27 | 19.78 / 19.78 | 96.39 / 96.39 | 52.32 / 44.14 | 31.90 / 31.90 |
| [390 licht utrecht-z12](ab-390-light-utrecht-z12.png) | 6.51 / 4.00 | 1 / 1 | 19.78 / 19.78 | 96.39 / 96.39 | 52.32 / 44.14 | 31.90 / 31.90 |
| [390 donker start](ab-390-dark-start.png) | 8.20 / 4.39 | 6 / 6 | 8.37 / 11.68 | 71.23 / 74.53 | 38.89 / 36.40 | 35.20 / 37.75 |
| [390 donker utrecht](ab-390-dark-utrecht.png) | 19.77 / 15.62 | 25 / 28 | 11.68 / 11.68 | 74.53 / 74.53 | 42.20 / 36.40 | 37.75 / 37.75 |
| [390 donker kust](ab-390-dark-kust.png) | 2.03 / 1.79 | 5 / 3 | 11.68 / 11.68 | 74.53 / 74.53 | 42.20 / 36.40 | 37.75 / 37.75 |
| [390 donker ijsselmeer](ab-390-dark-ijsselmeer.png) | 3.22 / 2.39 | 15 / 14 | 11.68 / 11.68 | 74.53 / 74.53 | 42.20 / 36.40 | 37.75 / 37.75 |
| [390 donker utrecht-z7](ab-390-dark-utrecht-z7.png) | 15.20 / 12.41 | 16 / 15 | 11.68 / 11.68 | 74.53 / 74.53 | 42.20 / 36.40 | 37.75 / 37.75 |
| [390 donker utrecht-z10](ab-390-dark-utrecht-z10.png) | 18.72 / 17.22 | 29 / 27 | 11.68 / 11.68 | 74.53 / 74.53 | 42.20 / 36.40 | 37.75 / 37.75 |
| [390 donker utrecht-z12](ab-390-dark-utrecht-z12.png) | 6.51 / 4.00 | 1 / 1 | 11.68 / 11.68 | 74.53 / 74.53 | 42.20 / 36.40 | 37.75 / 37.75 |
| [1280 licht start](ab-1280-light-start.png) | 10.85 / 4.58 | 19 / 18 | 18.16 / 19.78 | 94.77 / 96.39 | 50.71 / 44.14 | 30.77 / 31.90 |
| [1280 licht utrecht](ab-1280-light-utrecht.png) | 17.13 / 13.38 | 70 / 77 | 19.78 / 19.78 | 96.39 / 96.39 | 52.32 / 44.14 | 31.90 / 31.90 |
| [1280 licht kust](ab-1280-light-kust.png) | 5.54 / 4.69 | 32 / 25 | 19.78 / 19.78 | 96.39 / 96.39 | 52.32 / 44.14 | 31.90 / 31.90 |
| [1280 licht ijsselmeer](ab-1280-light-ijsselmeer.png) | 7.43 / 5.45 | 55 / 61 | 19.78 / 19.78 | 96.39 / 96.39 | 52.32 / 44.14 | 31.90 / 31.90 |
| [1280 licht utrecht-z7](ab-1280-light-utrecht-z7.png) | 12.23 / 7.27 | 40 / 44 | 19.78 / 19.78 | 96.39 / 96.39 | 52.32 / 44.14 | 31.90 / 31.90 |
| [1280 licht utrecht-z10](ab-1280-light-utrecht-z10.png) | 20.52 / 18.61 | 85 / 79 | 19.78 / 19.78 | 96.39 / 96.39 | 52.32 / 44.14 | 31.90 / 31.90 |
| [1280 licht utrecht-z12](ab-1280-light-utrecht-z12.png) | 16.80 / 7.90 | 5 / 5 | 19.78 / 19.78 | 96.39 / 96.39 | 52.32 / 44.14 | 31.90 / 31.90 |
| [1280 donker start](ab-1280-dark-start.png) | 10.85 / 4.58 | 19 / 18 | 8.37 / 11.68 | 71.23 / 74.53 | 38.89 / 36.40 | 35.20 / 37.75 |
| [1280 donker utrecht](ab-1280-dark-utrecht.png) | 17.13 / 13.38 | 70 / 77 | 11.68 / 11.68 | 74.53 / 74.53 | 42.20 / 36.40 | 37.75 / 37.75 |
| [1280 donker kust](ab-1280-dark-kust.png) | 5.54 / 4.69 | 32 / 25 | 11.68 / 11.68 | 74.53 / 74.53 | 42.20 / 36.40 | 37.75 / 37.75 |
| [1280 donker ijsselmeer](ab-1280-dark-ijsselmeer.png) | 7.43 / 5.45 | 55 / 61 | 11.68 / 11.68 | 74.53 / 74.53 | 42.20 / 36.40 | 37.75 / 37.75 |
| [1280 donker utrecht-z7](ab-1280-dark-utrecht-z7.png) | 12.23 / 7.27 | 40 / 44 | 11.68 / 11.68 | 74.53 / 74.53 | 42.20 / 36.40 | 37.75 / 37.75 |
| [1280 donker utrecht-z10](ab-1280-dark-utrecht-z10.png) | 20.52 / 18.61 | 85 / 79 | 11.68 / 11.68 | 74.53 / 74.53 | 42.20 / 36.40 | 37.75 / 37.75 |
| [1280 donker utrecht-z12](ab-1280-dark-utrecht-z12.png) | 16.80 / 7.90 | 5 / 5 | 11.68 / 11.68 | 74.53 / 74.53 | 42.20 / 36.40 | 37.75 / 37.75 |

Bijbehorende volledige app-paren: `app-<390|1280>-<light|dark>-<start|utrecht>.png`. Het eindbeeld ligt ter PO-review; een technische gate is geen smaakakkoord.


## 2026-10-07T20:34:35.115Z — Mobiele rig en eindbeeld

- Eind-A/B: MOTREGEN_E2E_PORT=4397 MOTREGEN_E2E_DATA_PORT=8397 MOTREGEN_MOBILE_BASEMAP=own MOTREGEN_BASEMAP_COMPARISON=1 pnpm --filter motregen-web e2e e2e/basemap-comparison.spec.ts --config playwright.basemap.config.ts --project desktop: exit 0, 4 tests, 28 kaartparen en 8 app-paren. Startlabels licht én donker 390: 6→6 (0 %), 1280: 19→18 (−5,3 %).
- Alle acht app-paren daadwerkelijk bekeken: labels zijn rustiger en het nachtbeeld heeft Liberty’s water-/tekstcontrast; groen blijft grover en minder volledig, vooral in de startview en bij overzoom.
- Groen-Utrecht z9 390: 19,77→15,62 %; z10: 18,72→17,22 %. Start390 8,20→4,39 %, start1280 10,85→4,58 %. Dit resterende lage-zoom-/overzoomverschil is expliciet aan de PO ter review, geen claim van gelijk groenoppervlak.
- Nacht ΔL* water–land 11,68 en label–land 74,53, gelijk aan Liberty’s vectorverf; Liberty’s start-raster verlaagt dat naar 8,37 / 71,23. De eigen U59-palette had 3,47 / 66,33. Grenzen/provincies staan in de volledige tabel hierboven.
- MOTREGEN_E2E_PORT=4397 MOTREGEN_E2E_DATA_PORT=8397 pnpm --filter motregen-web perf:mobile --profile mobile-4g --scenario koud --basemap own --repeat 3 --compare: exit 0; 3 browsertests, 128 decodes in elke run, geen netwerkbevindingen, bytes/decodes-spreiding 0 %. Output tmp/basemap/u60/perf-own-final.txt; beknopte eigen voor/na-receipts in perf-mobile.json.

| Run | U59 kaartfase ms | U60 kaartfase ms | Kaartbytes U59 / U60 | Totaalbytes U59 / U60 |
| --- | ---: | ---: | ---: | ---: |
| 1 | 678.8 | 387.4 | 133345 / 138043 | 1253787 / 1260526 |
| 2 | 244.9 | 261.4 | 133345 / 138043 | 1253787 / 1260526 |
| 3 | 458.2 | 244.5 | 133345 / 138043 | 1253787 / 1260526 |

- Kaartbytes +3.52 %, totaalbytes +0.54 % t.o.v. eigen U59; beide onder +25 %. Vergelijking met het verse OpenFreeMap-nulpunt: −48,974 % totaalbytes, decodes gelijk.
- Losse strikte TypeScript-check op style/publisher/snapshot/comparison/report en e2e-spec: exit 0 met --allowImportingTsExtensions (eerste handmatige oproep miste die flag en gaf TS5097 op de bestaande .mts-import).
- Volgende stap: cache + laatste gerichte basiskaartchecks, finale commit/push en bijgewerkte draft-PR.

## 2026-10-07T20:35:05.389Z — Tegelbudget per zoom

Gecomprimeerde bytes; publisher valideert totaal én grootste tegel tegen dezelfde U59-nulmeting.

| Zoom | Totaal U59 / U60 B | Groei totaal | Grootste U59 / U60 B | Groei grootste |
| --- | ---: | ---: | ---: | ---: |
| 4 | 16388 / 18153 | 10.77 % | 10469 / 12252 | 17.03 % |
| 5 | 40273 / 44943 | 11.60 % | 27227 / 31925 | 17.25 % |
| 6 | 91148 / 107650 | 18.10 % | 28459 / 35174 | 23.60 % |
| 7 | 207680 / 204075 | -1.74 % | 50129 / 46798 | -6.64 % |
| 8 | 505563 / 509497 | 0.78 % | 47865 / 55839 | 16.66 % |
| 9 | 909240 / 1106471 | 21.69 % | 32688 / 34280 | 4.87 % |
| 10 | 1799077 / 2233115 | 24.13 % | 21270 / 23101 | 8.61 % |

## 2026-10-07T20:37:03.970Z — Technisch afgerond, eindparen voor PO

- MOTREGEN_E2E_PORT=4397 MOTREGEN_E2E_DATA_PORT=8397 MOTREGEN_MOBILE_BASEMAP=own pnpm --filter motregen-web e2e e2e/basemap-cache.spec.ts --config playwright.basemap-cache.config.ts --project desktop: exit 0, 2 tests. Beide warme reloads 0 kaartnetwerkrequests; cached Range 206, offline eigen hash en afwijzing van foutieve/cross-origin ranges groen. Receipts tmp/basemap/u60/cache-final.txt en web/tmp/basemap/cache-{390,1280}.json.
- MOTREGEN_E2E_PORT=4397 MOTREGEN_E2E_DATA_PORT=8397 MOTREGEN_MOBILE_BASEMAP=own pnpm --filter motregen-web e2e e2e/basemap.spec.ts --config playwright.basemap.config.ts --project desktop: exit 0, 7 tests op de definitieve stijl/hash, incl. maximale kaartzoom 390/1280/3840. Output tmp/basemap/u60/basemap-final.txt.
- Unitrepro voor de echte MapLibre-stijlvalidator: pnpm --filter motregen-web exec vitest run src/core/basemap.test.ts. Losse toolingrepro: pnpm --filter motregen-web exec tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --types node --skipLibCheck ../tools/basemap/style.mts ../tools/basemap/publish.mts ../tools/basemap/snapshot.mts ../tools/basemap/comparison-fixture.mts ../tools/basemap/report-comparison.mts e2e/basemap-comparison.spec.ts. De tijdelijk genegeerde tools/basemap/node_modules/maplibre-gl verwijst naar web/node_modules/maplibre-gl voor die losse type-import; workspace-typecheck heeft die niet nodig.
- Preview root/manifest HTTP 200; gehashte PMTiles en live MRF Range geven 206 (127 / 32 B). Preview blijft op http://ageq-dev2:4340/ draaien met MOTREGEN_DATA_ORIGIN=https://motregen.nl/data; sessie 51755.
- 28 kaartparen, 8 volledige app-paren, 4 meet-JSON’s, eigen mobiele voor/na-receipts en meegeleverd PO-beeld worden samen gecommit. Het meegeleverde PO-beeld bleek de uurtabel te tonen; daarom dienen de eigen vaste paren als kaartbewijs.
- Alle afgesproken technische gates groen; groenoppervlak is nog niet gelijk aan Liberty, met name op lage zoom en z12-overzoom. Draft-PR #87 blijft ter PO-beoordeling, geen merge.

## 2026-10-07T20:40:04.422Z — Orkestrator: groen/grijs opnieuw

- PO/orkestrator keurt labels en nachtcontrast goed, maar groen af: losse parkomlijningen, te weinig bos/landcover en bebouwing. Nieuwe harde beeldgate: groen én grijs per A/B-paar binnen ±15 % van Liberty.
- Aanpak: natuurlijke bos-/grasvlakken zonder omtrek, per-zoom union/simplify/min-area; residential/commercial/industrial/retail als Liberty-grijs. Meting wordt uitgebreid naar grijs en faalt per paar buiten ±15 %. Mobiele eigen U59-bytegate +25 % en kaartfase ≤1 s blijven leidend.
- Vorige publisher stelde daarnaast striktere archief-/perzoom-maxgates in, terwijl de PO nu het gemeten mobiele bytebudget aanwijst (vorige groei +3,52 %). Die extra grenzen mogen de gevraagde vlakdekking niet meer onderdrukken; werkelijke bytes worden opnieuw gemeten.

## 2026-10-07T20:51:15.032Z — Vlakkenpipeline en nieuwe beeldgate

- Bos/gras/park/sand krijgen transparante omtrek en fill-antialias=false; Liberty-vulling/dekking behouden. Grijs blijft Liberty-residential, nu op volledigere samengevoegde residential/commercial/industrial/retail-vlakken.
- osmium export + streaming TypeScript-classificatie + GDAL/GEOS ST_UnaryUnion per klasse/0,5°-groep vervangen herhaalde tilemaker-unions. Bron-landcover bestrijkt aanwezige vier extracten binnen [0,49,10,55]; water/grenzen/plaatsnamen behouden hun eigen extract. Tilemaker gebruikt Visvalingam en lager min-area, met minder extreme laagzoom-simplificatie.
- Bronexport/classificatie en GeoPackage-import voltooid; circa 2,2 GB GIS-tussenbestand, genegeerd. Eerste GEOS-union loopt; nog geen native/beeld/perf-receipt. Build-cachehash bewaakt classifier, pipeline en bronfingerprint.
- Stijlunit 6/6 exit 0 en strikte tooling/spec-typecheck exit 0. Nieuwe e2e-gate meet onbedekt groen/grijs zonder omtrek en faalt per paar buiten ±15 %. Grijs is landuse, geen gebouwen; bij Liberty’s landuse-maxzoom 12 is dat oppervlak nul.
- Tilemaker-profiel en archiefcijfers blijven voorlopig; nieuwe archiefhash volgt pas na herbouw en beelden. Oudere paren zijn terug te zien op commit 444e205. Draft-PR is weer in uitvoering; labels/nachtcontrast zijn PO-goedgekeurd, groen/grijs niet.
- Technische bron voor union-/simplificatievolgorde: https://github.com/systemed/tilemaker/blob/v3.1.0/docs/CONFIGURATION.md en src/tile_worker.cpp; GEOS-union komt vóór tilemaker-simplify/min-area.

## 2026-10-07T21:06:59.504Z — Kleinere uniongroepen, checkpoint

- Eerste union in 0,5°-groepen na circa acht CPU-minuten zonder eerste rij beëindigd: build-revision-1 exit 143, geen groen receipt. Tweede aanpak groepeert op geometriecentroid per 0,05° en verwerkt vier klassen tegelijk. Vier grote klassen voltooid: wood circa 487 MB, grass 955 MB, urban 201 MB, park 34 MB in scratch.
- Bouw 2 exit 2 doordat ik generalize-landcover.sh wijzigde terwijl bash er nog uit las: de verschoven regels maakten de afronding ongeldig. Actieve scripts voortaan ongemoeid laten. bash -n op het definitieve script is groen.
- Bouw 3 loopt met MOTREGEN_LANDCOVER_RESUME=1 pnpm basemap:build, output tmp/basemap/u60/build-revision-3.txt, exec-session 30782. De vier volledige GeoJSON’s worden met ogrinfo gevalideerd en hergebruikt; zand/moeras en samengevoegde bron worden daarna opgebouwd. Nieuwe bestanden worden atomair gepubliceerd.
- Eerste GIS-import voltooide vóór de mislukte union; parts-fingerprint vastgelegd op dezelfde classifier, gepinde bronnen en filterhash om die identieke import te hergebruiken. Bron- en union-caches zijn nu gescheiden.
- A/B meet naast totaal groen/grijs ook wood/grass/park afzonderlijk in JSON om ander groen niet als bosherstel te laten doorgaan. Stilering/bebouwingsverf komen uit dezelfde Liberty-referentie; labelselectie en nachtpalet blijven PO-goedgekeurd.
- pnpm typecheck exit 0 (web+bot). Stijlunit/strikte toolingcheck eerder exit 0. Nieuwe native hash, ±15 %-beeldgates en mobiele byte-/tijdgates staan nog open; volgende stap na bouw 3 is de volledige contrastieve A/B.

## 2026-10-07T21:37:00Z — Eerste uitgebreide kandidaat afgekeurd, bronregels vastgesteld

- Bouw 4 valideerde native geometrie maar publicatie faalde op de absolute 25 MB-productiegrens: 104.721.954 B. Scratch-publicatie met MOTREGEN_BASEMAP_OUTPUT gaf exit 0; kandidaat nl-7c856d341db0dffc.pmtiles blijft uitsluitend genegeerd. Streaming samenvoeging vermijdt de eerder afgebroken dure ogr-merge (bouw 3 exit 143).
- Contrastieve A/B kandidaat wide: exit 1, alle vier profielen gemeten. Start390 groen 7,90→14,21 %, grijs 15,71→4,94 %; Utrecht z9 groen 19,14→63,04 %. Geen geslaagde beeldgate. Receipts/meet-JSON’s in tmp/basemap/u60/iteration-wide; werkbeelden worden later vervangen door de geslaagde kandidaat.
- Liberty-producerregels onderzocht in primaire bron: https://github.com/openmaptiles/planetiler-openmaptiles/tree/main/src/main/java/org/openmaptiles/layers. Landcover begint op z7 en selecteert oorspronkelijke polygonen op pixeloppervlak vóór union. Park omvat boundary=protected_area en kan hetzelfde gebied daarnaast als bos bevatten. Onze selectie miste die beschermde gebieden en liet te kleine grasvlakken toe.
- Landuse gebruikt Natural Earth 50m urban areas op z4–5, OSM residential vanaf z6, overige stedelijke klassen vanaf z9. Natural Earth-download SHA256 69e916a46e663eefe8469cf4154bd34ff9486fb91e4a54762dbe85c1bbfb912b; public domain: https://www.naturalearthdata.com/about/terms-of-use/.
- Volgende stap: selectie van bronoppervlakken volgens zoom, beschermde gebieden zelfstandig meenemen, Natural Earth-laagzoomgrijs toevoegen en union/simplify/min-area op die selectie. De native bovengrens z10 blijft; detailselectie moet ook z12-overzoom volgen. ±15 % per paar en mobiele +25 %/≤1 s nog open.

## 2026-10-07T21:43:00Z — WIP op expliciet verzoek, nachtelijke afronding

- Volledige huidige WIP wordt gecommit/gepusht op verzoek van de orkestrator wegens verbindingsduur. A/B-bestanden in dit checkpoint tonen de afgekeurde wide-kandidaat; zij zijn nadrukkelijk geen geslaagde eindparen.
- Nieuwe pipeline geselecteerde bronpolygonen op geprojecteerd pixeloppervlak, union per klasse/detailzoom/5 km-cel, zoomafhankelijke topology-preserving simplify en closing van stedelijke vlakken. Beschermde gebieden zelfstandig park naast bos/gras. Native z10 bevat detail tot z12, stijlfilter detail_minzoom bewaakt overzoom.
- Natural Earth 50m urban areas uitgesneden [0,49,10,55] als gecomprimeerde reproduceerbare bron voor grijs z4–5. Bouw 5 en echte MapLibre-stijlvalidatie gestart (exec-session 14177, tmp/basemap/u60/build-revision-5.txt).
- Opdracht bevestigd: vannacht afronden met groen/grijs elk paar ±15 %, eindparen, mobiele rig-gate, docs en PR #87 ready; PO slaapt. Geen mergeopdracht.
