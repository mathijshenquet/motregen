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
