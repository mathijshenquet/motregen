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
