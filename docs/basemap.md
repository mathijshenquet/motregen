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
De stijl en MapLibre-workerpool starten parallel met het weermanifest. Zodra de eigen stijl binnen is,
start het ophalen van de gewone Latin-glyphs; een klein MapLibre-protocol deelt
deze bytes met latere labelrequests. Iedere worker krijgt een kopie zodat
overdracht de gedeelde buffer intact laat. Dit voorkomt dat de eerste fontaanvraag
pas na tegelverwerking begint; het netwerkverkeer blijft in de koude rig gemeten.
De bron, het profiel en het afgeleide PMTiles-archief blijven beschikbaar in de
repo voor de ODbL-verplichtingen.

## Herbouw

Activeer de repo-devenv via direnv en installeer de workspace met `pnpm install`.
Vanaf de root:

```bash
pnpm basemap:build
```

Devenv bevat tilemaker, de PMTiles-CLI, osmium, GDAL en unzip. De ingang downloadt de vier
vastgepinde PBF’s, controleert SHA256, voegt ze samen, filtert tags en maakt
met osmium een complete-way/multipolygon-extract. Landcover wordt met osmium
naar GeoJSON geëxporteerd en door `landcover.mts` in bos, gras, park, moeras,
zand en bebouwing ingedeeld. GDAL/GEOS verenigt de vlakken per klasse en
ruimtelijke groep van 0,5° vóór de tegelbouw; tilemaker past daarna simplificatie
en minimumoppervlak per zoom toe. Tilemaker gebruikt
`config.json` en `process.lua` en schrijft `tmp/basemap/build/nl.pmtiles`.
De PMTiles-CLI clustert en verifieert het archief.
`publish.mts` controleert iedere tegel op het toegestane schema, grenzen,
landklassen en labels, meet tegelgroottes per zoom en weigert meer dan 25 MB.
`budget.json` bewaart het U59-manifest voor de archief-/tegelrapportage.
De +25 %-gate vergelijkt het daadwerkelijke koude mobiele kaartverkeer met
de eigen U59-nulmeting; de mobiele rig bewaakt daarnaast maximaal 1 s kaartfase.
Daarna schrijft het `tools/basemap/tiles/nl-<16 hex SHA256>.pmtiles`, een
manifest met de volledige hash en twee stijlen. De tegels en stijlen worden
samen gecommit; downloads en tussenbestanden zijn genegeerd.

`MOTREGEN_BASEMAP_SCRATCH` kiest een andere tijdelijke directory;
`MOTREGEN_BASEMAP_THREADS` kiest het aantal tilemaker-threads (standaard vier).
De tagselectie heeft een hash in `tmp/basemap/build/filter.sha256`; wijziging
van de selectie bouwt het regio-extract opnieuw. Verwijder
`tmp/basemap/build/region.osm.pbf` om de voorbewerking te forceren.
`landcover.sha256` bewaakt de GIS-voorbewerking; de grote exports en GeoPackage
staan uitsluitend in scratch.
Bij vernieuwde brondata moeten datum/URL’s, SHA256’s, de
kustsnapshot en beide gegenereerde stijlen samen worden bijgewerkt. Laat oude
gehashte archieven gedurende een frontend-cacheovergang in het package staan.

## Zoombereik en schema

De kaartbounds volgen `MAP_CONTAIN_BOUNDS`: west 2,3108, zuid 50,3256,
oost 7,4192, noord 53,6844. Bronzoom z4–10. Bij z4/z5 past dit venster in één
tegel; bij desktop-start z6 in vier. Het OSM-landextract volgt deze bounds.
Landcover gebruikt de aanwezige bronextracten binnen [0,49,10,55], om ook
de ruimte rond de contain-view met bos/gras/bebouwing te vullen.
Het archief bevat kustwater tot [-5,48,13,57], omdat contain-zoom ook ruimte
buiten de app-bounds toont. Zo krijgt de Noordzee geen rechte, lege rand.

De app gebruikt contain-zoom en een maximale detailzoom waarbij de kaart
minimaal 20 km breed blijft. MaxZoom hangt van de breedte van het kaartvlak
af: ongeveer 9,84 bij 390 px, 11,55 bij 1280 px en 13,14 bij 3840 px op
Nederlandse breedte. Dat is niet altijd de schermbreedte: op het 1280 px
brede desktopbeeld is de kaart naast de tabel 810 px breed, met maximale
zoom circa 10,93 bij de gekozen kustlocatie (51,9° N).
Boven z10 gebruikt MapLibre bron-overzoom; de bestaande zoomregel blijft gelden.
Z9, z10 en z11 zijn vergeleken bij start en maximale appzoom op 390, 1280 en
3840 px. Z10 behoudt het Brielse Meer en bruikbare watervormen bij overzoom;
z9 maakt die te grof. Z11 voegt vooral kleine vlakken toe. Het U60-z10-archief met de ruimere kustdekking is `nl-1395e020ae33a90b.pmtiles`,
4.191.993 B voor 1.951 tegels (+18,55 % tegenover U59). Het U59-archief
`nl-0aa536ff364f7cce.pmtiles` blijft beschikbaar tijdens de frontend-cacheovergang.
Het manifest bewaart SHA256 en gecomprimeerde/uitgepakte tegelgroottes.

| Zoom | Tegels | Gecomprimeerd totaal | p50 / grootste tegel |
| --- | ---: | ---: | ---: |
| 4 | 4 | 18.153 B | 1.597 / 12.252 B |
| 5 | 7 | 44.943 B | 2.071 / 31.925 B |
| 6 | 12 | 107.650 B | 3.822 / 35.174 B |
| 7 | 33 | 204.075 B | 2.284 / 46.798 B |
| 8 | 118 | 509.497 B | 813 / 55.839 B |
| 9 | 405 | 1.106.471 B | 271 / 34.280 B |
| 10 | 1.372 | 2.233.115 B | 95 / 23.101 B |

| Laag | Geometrie | Attributen |
| --- | --- | --- |
| water | vlakken, inclusief rivierwater en Noordzee | geen |
| landcover | grove vlakken | class: wood, grass, park, wetland, sand of urban |
| boundary | lijnen; uitsluitend admin 2/4, geen maritime | admin_level, maritime=0 |
| place | punten; land, provincie, city/town/village | name (name:nl, anders name), class, rank, population |

Kleine land-/watervlakken verdwijnen op lage zoom. Plaatslabels beginnen op
basis van klasse en bevolking; `symbol-sort-key` gebruikt rank voor botsingen.
Landen staan in de bron maar krijgen net als voorheen geen zichtbaar label.
De bestaande `motregen-province-boundaries`-laag behoudt zijn naam, patroon,
kleur en laagvolgorde. `label_village` komt vóór de temperatuurlaag;
`label_town`, `label_city` en `label_state` houden voorrang in labelbotsingen.

## Stijl

U60 gebruikt de relevante lagen uit de vastgelegde Liberty-stijl in
`tools/basemap/liberty-reference.json`. Kleuren, dekking en plaatslabelgroottes
komen uit deze referentie. Voor donker gebruikt de generator dezelfde
`darkenLibertyLayer`-transformatie als de U59-referentie: achtergrond `#101d21`,
water `#183746`, plaatsnamen `#c7d5d8` met een donkere halo. De provinciegrens
houdt zijn eigen patroon en verf; provincienamen houden U59’s minimumzoom 6,
grootte en kleur. Steden staan net als in Liberty na de provincienamen, zodat
een provincie de belangrijkste stadsnaam niet verdringt.

Naast bos zijn meadow/grass/grassland/heath/scrub, parken/natuurreservaten,
wetland en sand/beach opgenomen. Farmland is in Liberty geen gekleurde laag
en wordt daarom niet meegeleverd. Wetland wordt bij z12 zichtbaar, ook bij
bron-overzoom; een vlakke kleur vervangt het spritepatroon zodat er geen
extra sprite-aanvraag nodig is. Tilemaker generaliseert de landcover per zoom
met `simplify_below`, `simplify_level`, `filter_below` en `filter_area`.
GEOS-union komt eerst, daarna Visvalingam-simplificatie en minimumoppervlak.
Beide zoomprofielen schrijven naar dezelfde landcover-laag. Bos/gras/parken
hebben een gevulde Liberty-kleur zonder omtrek. Residential/commercial/
industrial/retail vormen de lichtgrijze bebouwing, met Liberty’s residential-verf.

Plaatsnamen krijgen een rang uit OSM-bevolking en place-klasse. City/town/village
volgen Liberty’s minimumzoom; een `text-field`-stap per zoom selecteert de
rang, `symbol-sort-key` geeft grote plaatsen voorrang en `text-padding`
compenseert de ontbrekende concurrerende weglabels. De kaart houdt het
bestaande schema van vier lagen.

De contrastieve controle gebruikt dezelfde camera en het werkelijke kaartvlak
van de 390/1280 px-app voor beide bronnen. `basemap-comparison.spec.ts` schrijft
licht/donker-beeldparen van start, Utrecht, kust, IJsselmeer en z7/z9/z10/z12.
Afzonderlijke zwart/wit-renders meten het onbedekte groen- en landuse-grijsoppervlak
zonder omtrekken. Groen en grijs moeten per paar binnen ±15 % van Liberty liggen;
gebouwen tellen niet als landuse-grijs. MapLibre
levert de geplaatste unieke city/town/village-labels. CIE L*-verschillen meten
water, labeltekst en grensverf tegenover de dominante kale landkleur. De
uitslagen en meetbeperkingen staan in het U60-LOG, de eindparen vragen PO-review.

```bash
pnpm basemap:snapshot --detail
MOTREGEN_E2E_PORT=4397 MOTREGEN_E2E_DATA_PORT=8397 \
  MOTREGEN_MOBILE_BASEMAP=own MOTREGEN_BASEMAP_COMPARISON=1 \
  pnpm --filter motregen-web e2e e2e/basemap-comparison.spec.ts \
  --config playwright.basemap.config.ts --project desktop
```

## Serveren en deploy

`motregen-basemap` is een Nix-package van de gehashte archieven. De NixOS-module
mount dit alleen-lezen op `caddyDataDir/basemap`, binnen de bestaande datamount.
Het bestand gaat dus mee in dezelfde Nix-deploy als de frontend; er is geen
handmatige upload naar ingest-state nodig en herbouw draait niet op de box.
Caddy serveert uitsluitend `/data/basemap/nl-<hash>.pmtiles` met range-requests,
CORS, geen Content-Encoding en `public, max-age=31536000, immutable`.
Niet-gehashte bestanden, het buildmanifest en onbekende archieven geven 404.
De serviceworker gebruikt CacheFirst voor deze gehashte kaartbestanden,
ook bij een andere DATA_ORIGIN. Ieder gevraagd bytebereik krijgt een eigen
cachekey; een andere archiefhash krijgt een nieuwe key. De Cache API weigert
206-responses, daarom bewaren de Workbox-hooks het bereik als 200 en herstellen
ze status 206 met dezelfde Content-Range, ETag en bytes bij uitlezen.
Er worden maximaal 384 bereiken gedurende een jaar bewaard, met opruimen bij
opslagtekort. De kaartstijlen en glyphs zitten in de frontend-precache.
Offline is de eerder bekeken kaartdekking beschikbaar; het hele archief wordt
niet vooraf gedownload. Zie de [Workbox-pluginhooks](https://developer.chrome.com/docs/workbox/using-plugins).

De bron-URL is `pmtiles://${DATA_ORIGIN}/data/basemap/nl-<hash>.pmtiles`.
DATA_ORIGIN is standaard de frontend-origin; een optionele `VITE_DATA_ORIGIN`
kan een andere publieke origin kiezen. Dev gebruikt de bestaande `/data`-proxy:
kopieer `tools/basemap/tiles/*.pmtiles` naar `basemap/` onder de lokale
Caddy-data-root. Glyphs komen van de frontend en blijven lokaal.

Tot het archief op de data-origin staat (eerste deploy), serveren dev en preview het zelf: de
Vite-plugin `localBasemapArchive` in `web/vite.config.ts` beantwoordt `/data/basemap/nl-<hash>.pmtiles`
met Range-ondersteuning uit `tools/basemap/tiles/` (orkestrator 2026-10-07: 4330 toonde een grijze
kaart omdat de proxy naar motregen.nl een 404 kreeg).

## Meten

De gewone rigfixture is klein en representeert geen huidige kaart. Leg voor
het nulpunt echte OpenFreeMap-tegels, fonts, sprites en rasterachtergrond vast:

```bash
pnpm basemap:snapshot
MOTREGEN_E2E_PORT=4393 MOTREGEN_E2E_DATA_PORT=8393 \
  pnpm --filter motregen-web perf:mobile --profile mobile-4g --scenario koud \
  --basemap openfreemap --repeat 3 --baseline
MOTREGEN_E2E_PORT=4393 MOTREGEN_E2E_DATA_PORT=8393 \
  pnpm --filter motregen-web perf:mobile --profile mobile-4g --scenario koud \
  --basemap own --repeat 3 --compare
```

Herhaal met `--profile desktop`. Beide bronnen draaien daarna offline onder
dezelfde rig; externe requests maken de test rood. De OpenFreeMap-snapshot
blijft in `tmp/basemap/openfreemap` vastgezet op dezelfde tileset; verwijderen
ververst hem. Liberty-filtering leeft alleen in de referentietooling.
Vergelijking controleert het weerfixture-, viewport-, netwerk- en rigcontract;
de kaartbron mag veranderen. De mobiele gate vereist basemap-fase totaal
≤1000 ms en geen wire/decode-regressie. P50 ≤300 ms is sinds het
orkestratorbesluit van 2026-10-07 een vervolgstreefwaarde; desktop-tijden
zijn informatief. De uitkomsten en de motivatie staan in [perf.md](perf.md#eigen-basiskaart-u59).
De som van tegelduur bevat
netwerk+worker/afhandeling en overlappende requests; het is geen exclusieve
hoofddraad-CPU-meting. CDP’s 4× page-throttle remt MapLibre-workers niet.

Visuele controle van desktop en 390 px, licht/donker:

```bash
MOTREGEN_E2E_PORT=4393 MOTREGEN_E2E_DATA_PORT=8393 \
  MOTREGEN_MOBILE_BASEMAP=own pnpm --filter motregen-web e2e \
  e2e/basemap.spec.ts --config playwright.basemap.config.ts --project desktop
```

Met `MOTREGEN_MOBILE_BASEMAP=openfreemap` ontstaan dezelfde referentiebeelden.
De screenshots staan in `web/tmp/basemap/`. Exacte U60-meetresultaten en synchrone receipts staan in
`.dev/tracks/u60-basiskaart-afwerking/LOG.md`.

`basemap-parse.rig.ts` met dezelfde config laadt gedecomprimeerde tegels en
glyphs uit geheugen en meet vijf runs na één opwarmrun. Dit onderscheidt
MapLibre-worker/overdracht van HTTP, maar is nog geen exclusieve hoofddraad-CPU.
`basemap-cache.spec.ts` met `playwright.basemap-cache.config.ts` controleert
een warm bezoek zonder kaartnetwerk na het wissen van de browser-HTTP-cache,
plus offline ranges op dezelfde en een andere origin.

```bash
MOTREGEN_E2E_PORT=4393 MOTREGEN_E2E_DATA_PORT=8393 \
  MOTREGEN_MOBILE_BASEMAP=own pnpm --filter motregen-web e2e \
  e2e/basemap-cache.spec.ts --config playwright.basemap-cache.config.ts --project desktop
```
