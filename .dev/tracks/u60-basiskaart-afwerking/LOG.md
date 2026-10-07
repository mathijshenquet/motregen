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
