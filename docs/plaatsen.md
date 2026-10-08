# Plaatsencatalogus

De catalogus komt uit de `place`-laag op z10 van de eigen basiskaart: alle OSM-punten met
`place=city|town|village` binnen `MAP_CONTAIN_BOUNDS`, inclusief de Vlaamse en Duitse rand.
Multipoints worden uitgepakt en tegelbufferduplicaten verdwijnen op naam + centrumcoördinaten.
De oorspronkelijke lijst in `web/src/core/places.ts` blijft de temperatuurlabels en sitemap voeden.

`pnpm basemap:places` maakt de catalogus uit het ingecheckte PMTiles-archief; een volledige
`pnpm basemap:build` voert dezelfde export na publicatie uit. Beide schrijven
`web/public/plaatsen-<sha256-prefix>.json` en `web/src/core/places-asset.ts`.
Het artefact van 2026-10-08 bevat 6.997 plaatsen: 132.509 bytes JSON, 60.946 bytes gzip (niveau 9).
De export schrijft ook `.json.gz`; de gegenereerde Caddy-route serveert die variant met gzip en
een immutable cacheheader, zodat het gemeten budget ook voor het netwerk geldt.
De generator weigert meer dan 60 KiB gzip. De loader haalt het bestand eenmaal op; bij een fout
blijft de oude lijst beschikbaar. De service worker neemt de catalogus mee voor offline gebruik.

JSON bevat de namen, vier base64-kolommen met unsigned varints, gemeente-suffixen per rij en de
coördinatenschaal. Longitude en latitude zijn delta-gecodeerde gehele getallen met zigzag voor het
teken. De andere kolommen zijn `rang * 3 + klasse` (city 0, town 1, village 2) en bevolking.
Plaatscentra worden afgerond op drie decimalen (maximaal circa 65 meter); pinopslag wordt niet
gequantiseerd. Rijen staan in breedtegraadstroken van 0,05° en daarbinnen van west naar oost,
zodat de coördinaatverschillen klein blijven. De browser bouwt eenmaal een kd-tree in een lokale
projectie met `cos(52°)` voor longitude. Zoekwerk loopt alleen bij locatiekeuze, niet per kaartframe.

De gemeente-lookup staat in `tools/basemap/place-municipalities.json`. Een normale export vraagt
geen externe dienst. `pnpm basemap:places --refresh-municipalities` vult ontbrekende gemeenten
in vanuit [PDOK Bestuurlijke Gebieden](https://api.pdok.nl/kadaster/bestuurlijkegebieden/ogc/v1)
(Nederland) en [OSM Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)
(België/Duitsland). Alleen administratieve grenzen tellen: niveau 8, met als Duitse fallback een
kreisfreie Stadt op niveau 6, daarna een Ortsgemeinde op niveau 9. Bij meerdere actieve grenzen
worden de namen in de vaste Overpass-setvolgorde gecombineerd. De lookup wordt tussentijds
opgeslagen, zodat dezelfde opdracht na een tijdelijke fout kan worden hervat.

Bron: © OpenStreetMap-bijdragers, ODbL-1.0; het PMTiles-archief en de Geofabrik-bronchecksums
staan in `tools/basemap/tiles/manifest.json` en `tools/basemap/sources.sha256`.
De URL- en zoneregels staan bij de U65-uitwerking in MIP-21.
