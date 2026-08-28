# Gedeeld neerslaggrid

Alle regenbronnen worden vóór kwantisatie met nearest neighbour naar één
vast raster gebracht. Het raster is EPSG:3857, heeft vierkante cellen van
1 km en omvat heel het bruikbare KNMI-radarbeeld plus een kleine marge:

| eigenschap | waarde |
| --- | ---: |
| westrand `x0` | 0 m |
| noordrand `y0` | 7.600.000 m |
| `dx`, `dy` | +1.000 m, −1.000 m |
| breedte × hoogte | 1.250 × 1.350 |
| oostrand | 1.250.000 m |
| zuidrand | 6.250.000 m |
| benaderde lon/lat-extent | 0,00–11,23° O; 48,85–56,21° N |

`x0` en `y0` zijn celranden. Het midden van cel `(rij, kolom)` is dus
`(x0 + (kolom + 0,5) dx, y0 + (rij + 0,5) dy)`. Rij 0 ligt in het noorden.
De codeconstante is `ingest::grid::SHARED_GRID`; mrf-headers nemen alle
waarden daaruit over, zodat clients niets hoeven te hardcoderen.

## Wijziging 2026-08-28: radar-footprint en byte-impact

Het oude grid (`x=250…900 km`, `y=7.200…6.500 km`, 650×700) bevatte op
basis van de actuele radarcomposietmetadata slechts 185.575 van de 535.500
radarcelcentra (34,65%). De overige 349.925 cellen (65,35%) lagen buiten de
kaart, met name Noordzee, kust, en de randen in België en Duitsland. Na
transformatie van alle broncelcentra naar EPSG:3857 ligt de volledige
footprint op `x=0,7…1.207.526,2 m`, `y=6.257.933,1…7.552.278,8 m`. Het nieuwe
grid omvat die footprint geheel, met 7 km zuid-, 48 km noord-, circa 1 km
west- en 42 km oostmarge.

De uitbreiding vergroot alleen on-gecomprimeerde framedata; werkelijke
zstd-grootte blijft van het weerbeeld afhangen. De vaste factor is 3,7088×:

| chunktype | oud grid / bytes per frame | nieuw grid / bytes per frame | toename |
| --- | ---: | ---: | ---: |
| radar: RTCOR, nowcast, HARMONIE-regen | 650×700 / 455.000 | 1.250×1.350 / 1.687.500 | +1.232.500 (+270,9%) |
| 2km-uurvelden: temperatuur, gevoelstemp, wind, straling, RH, bewolking | 325×350 / 113.750 | 625×675 / 421.875 | +308.125 (+270,9%) |
| 5km-UV | 130×140 / 18.200 | 250×270 / 67.500 | +49.300 (+270,9%) |

## Indexmaps

De daemon berekent bij het openen van een bronproduct één indexmap van
1.250 × 1.350 `u32`-waarden. Elk element bevat de index van het dichtstbijzijnde
bronpunt of `u32::MAX` buiten het bronbereik. Alle frames van dezelfde
bron/gridcombinatie gebruiken daarna uitsluitend een gather; er vindt geen
projectiewiskunde in de frame-loop plaats. Buiten bronbereik wordt no-data.

Voor AROME wordt het EPSG:3857-celcentrum teruggebracht naar lon/lat en op
het reguliere 390 × 390-puntenraster afgerond. Voor radar gaat lon/lat eerst
naar het stereografische raster uit de HDF5-metadata. Alle radarbronpunten
vallen binnen het gekozen gedeelde extent; de rechthoekige hoekresten buiten
de gebogen radar-footprint worden bewust no-data. Het AROME-raster begint op
49° N en heeft in de uiterste zuid/westrand eveneens no-data; de indexmap
voorkomt zo bronwaarde-extrapolatie.

## Radarprojectie

De HDF5-producten publiceren deze PROJ-definitie:

```text
+proj=stere +lat_0=90 +lon_0=0 +lat_ts=60 +a=6378137 +b=6356752 +x_0=0 +y_0=0 +units=km
```

Het bronraster heeft 700 × 765 cellen. De celranden lopen van `x=0` tot
`700 km` en van `y=−3650` tot `−4415 km`; cel `(0,0)` heeft centrum
`(0,5, −3650,5) km`. De HDF5-attributen drukken dit enigszins indirect uit:
`geo_column_offset=0`, `geo_row_offset=3650`, pixelgrootte `(1,−1) km` en
pixeldefinitie `LU`. De vier gepubliceerde hoeken transformeren tot op enkele
meters naar `(0,−4415)`, `(0,−3650)`, `(700,−3650)` en `(700,−4415) km`.
De Rust-formule is met die hoeken tegen PROJ gekruistest.
