# Eigen basiskaart

De kaart volgt U59/MIP-21 optie 1: MapLibre met een eigen PMTiles-archief uit
OpenStreetMap. Wegen, gebouwen, POI’s, huisnummers en waterway-lijnen komen
niet in de tegels terecht. De licht/donkerstijl komt uit
`tools/basemap/style.mts`; de gegenereerde JSON staat in `web/public/basemap/`.

## Bronnen en licenties

Geofabrik-extracten Nederland, België, Nordrhein-Westfalen en Niedersachsen,
stand 2026-10-06, dekken de app-bounds inclusief de rand. URL’s staan in
`tools/basemap/build.sh`, SHA256’s in `tools/basemap/sources.sha256`.
[Geofabrik](https://download.geofabrik.de/europe/netherlands.html) levert
OSM-data onder de ODbL. De kaart houdt de bestaande OSM-attributie; zowel de
bronmetadata als het About-paneel verwijzen naar OpenStreetMap.

De Noordzee komt uit [OSM water polygons](https://osmdata.openstreetmap.de/data/water-polygons.html)
(ODbL), gedownload 2026-10-07. SHA256 van de oorspronkelijke WGS84-zip:
`7cb5d70f89c139b71a93c02181f8f6f136c61219580f2322c45eae4874831b15`.
De in de repo vastgelegde afgeleide kust (`ocean.geojson.gz`) is met GDAL
geclipt tot [-5,48,13,57], gesimplificeerd op 0,00015° en op vijf decimalen
opgeslagen. Daarmee blijft herbouw onafhankelijk van de dagelijkse kustupdate.

```bash
ogr2ogr -f GeoJSON -spat -5 48 13 57 -clipsrc -5 48 13 57 \
  -simplify 0.00015 -lco COORDINATE_PRECISION=5 ocean.geojson \
  water-polygons-split-4326/water_polygons.shp
gzip -n -9 -c ocean.geojson > tools/basemap/ocean.geojson.gz
```

De meegeleverde Noto Sans Regular-glyphs (Latin 0–511) komen uit de
OpenFreeMap-fontservice. Noto gebruikt de SIL Open Font License; deze staat
naast de glyphs. `tilemaker` 3.1.0 en npm `pmtiles` 4.5.0 gebruiken BSD-licenties.
De bron, het profiel en het afgeleide PMTiles-archief blijven beschikbaar in de
repo voor de ODbL-verplichtingen.

## Herbouw

Activeer de repo-devenv via direnv en installeer de workspace met `pnpm install`.
Vanaf de root:

```bash
pnpm basemap:build
```

Devenv bevat tilemaker, osmium, GDAL en unzip. De ingang downloadt de vier
vastgepinde PBF’s, controleert SHA256, voegt ze samen, filtert tags en maakt
met osmium een complete-way/multipolygon-extract. Tilemaker gebruikt
`config.json` en `process.lua` en schrijft `tmp/basemap/build/nl.pmtiles`.
`publish.mts` controleert iedere tegel op het toegestane schema, grenzen,
landklassen en labels, meet tegelgroottes per zoom en weigert meer dan 25 MB.
Daarna schrijft het `tools/basemap/tiles/nl-<16 hex SHA256>.pmtiles`, een
manifest met de volledige hash en twee stijlen. De tegels en stijlen worden
samen gecommit; downloads en tussenbestanden zijn genegeerd.

`MOTREGEN_BASEMAP_SCRATCH` kiest een andere tijdelijke directory;
`MOTREGEN_BASEMAP_THREADS` kiest het aantal tilemaker-threads (standaard vier).
Verwijder `tmp/basemap/build/region.osm.pbf` om de voorbewerking opnieuw te
laten lopen. Bij vernieuwde brondata moeten datum/URL’s, SHA256’s, de
kustsnapshot en beide gegenereerde stijlen samen worden bijgewerkt. Laat oude
gehashte archieven gedurende een frontend-cacheovergang in het package staan.

## Zoombereik en schema

De kaartbounds volgen `MAP_CONTAIN_BOUNDS`: west 2,3108, zuid 50,3256,
oost 7,4192, noord 53,6844. Bronzoom z4–13. Bij z4/z5 past het venster in één
tegel; bij desktop-start z6 in vier. MapLibre kan voor de viewport ook
buurtegels buiten deze bounds aanvragen; ontbrekende tiles zijn leeg.

De app gebruikt contain-zoom en een maximale detailzoom waarbij de kaart
minimaal 20 km breed blijft. MaxZoom hangt van de viewport af: ongeveer 9,84
bij 390 px, 11,55 bij 1280 px en 13,14 bij 3840 px op Nederlandse breedte.
Boven z13 gebruikt MapLibre bron-overzoom; de bestaande zoomregel blijft gelden.

| Laag | Geometrie | Attributen |
| --- | --- | --- |
| water | vlakken, inclusief rivierwater en Noordzee | geen |
| landcover | grove vlakken | class: wood of urban |
| boundary | lijnen; uitsluitend admin 2/4, geen maritime | admin_level, maritime=0 |
| place | punten; land, provincie, city/town/village | name (name:nl, anders name), class, rank, population |

Kleine land-/watervlakken verdwijnen op lage zoom. Plaatslabels beginnen op
basis van klasse en bevolking; `symbol-sort-key` gebruikt rank voor botsingen.
Landen staan in de bron maar krijgen net als voorheen geen zichtbaar label.
De bestaande `motregen-province-boundaries`-laag behoudt zijn naam, patroon,
kleur en laagvolgorde. `label_village` komt vóór de temperatuurlaag;
`label_town`, `label_city` en `label_state` houden voorrang in labelbotsingen.

## Serveren en deploy

`motregen-basemap` is een Nix-package van de gehashte archieven. De NixOS-module
mount dit alleen-lezen op `caddyDataDir/basemap`, binnen de bestaande datamount.
Het bestand gaat dus mee in dezelfde Nix-deploy als de frontend; er is geen
handmatige upload naar ingest-state nodig en herbouw draait niet op de box.
Caddy serveert uitsluitend `/data/basemap/nl-<hash>.pmtiles` met range-requests,
CORS, geen Content-Encoding en `public, max-age=31536000, immutable`.
Niet-gehashte bestanden, het buildmanifest en onbekende archieven geven 404.

De bron-URL is `pmtiles://${DATA_ORIGIN}/data/basemap/nl-<hash>.pmtiles`.
DATA_ORIGIN is standaard de frontend-origin; een optionele `VITE_DATA_ORIGIN`
kan een andere publieke origin kiezen. Dev gebruikt de bestaande `/data`-proxy:
kopieer `tools/basemap/tiles/*.pmtiles` naar `basemap/` onder de lokale
Caddy-data-root. Glyphs komen van de frontend en blijven lokaal.

## Meten

De gewone rigfixture is klein en representeert geen huidige kaart. Leg voor
het nulpunt echte OpenFreeMap-tegels, fonts, sprites en rasterachtergrond vast:

```bash
pnpm basemap:snapshot
pnpm --filter motregen-web perf:mobile --profile mobile-4g --scenario koud \
  --basemap openfreemap --repeat 3 --baseline
pnpm --filter motregen-web perf:mobile --profile mobile-4g --scenario koud \
  --basemap own --compare
```

Herhaal met `--profile desktop`. Beide bronnen draaien daarna offline onder
dezelfde rig; externe requests maken de test rood. De OpenFreeMap-snapshot
blijft in `tmp/basemap/openfreemap` vastgezet op dezelfde tileset; verwijderen
ververst hem. Liberty-filtering leeft alleen in de referentietooling.
Vergelijking controleert het weerfixture-, viewport-, netwerk- en rigcontract;
de kaartbron mag veranderen. De gate vereist basemap-fase totaal ≤1000 ms,
p50 ≤150 ms en geen wire/decode-regressie. De som van tegelduur bevat
netwerk+worker/afhandeling en overlappende requests; het is geen exclusieve
hoofddraad-CPU-meting. CDP’s 4× page-throttle remt MapLibre-workers niet.

Visuele controle van desktop en 390 px, licht/donker:

```bash
MOTREGEN_MOBILE_BASEMAP=own pnpm --filter motregen-web e2e \
  e2e/basemap.spec.ts --config playwright.basemap.config.ts --project desktop
```

Met `MOTREGEN_MOBILE_BASEMAP=openfreemap` ontstaan dezelfde referentiebeelden.
De screenshots staan in `web/tmp/basemap/`. Exacte meetresultaten en synchrone
receipts staan in de track-LOG.
