# Gedeeld neerslaggrid

Alle regenbronnen worden vóór kwantisatie met nearest neighbour naar één
vast raster gebracht. Het raster is EPSG:3857, heeft vierkante cellen van
1 km en omvat Nederland plus zee- en grensmarge:

| eigenschap | waarde |
| --- | ---: |
| westrand `x0` | 250.000 m |
| noordrand `y0` | 7.200.000 m |
| `dx`, `dy` | +1.000 m, −1.000 m |
| breedte × hoogte | 650 × 700 |
| oostrand | 900.000 m |
| zuidrand | 6.500.000 m |
| benaderde lon/lat-extent | 2,25–8,08° O; 50,31–54,53° N |

`x0` en `y0` zijn celranden. Het midden van cel `(rij, kolom)` is dus
`(x0 + (kolom + 0,5) dx, y0 + (rij + 0,5) dy)`. Rij 0 ligt in het noorden.
De codeconstante is `ingest::grid::SHARED_GRID`; mrf-headers nemen alle
waarden daaruit over, zodat clients niets hoeven te hardcoderen.

## Indexmaps

De daemon berekent bij het openen van een bronproduct één indexmap van
650 × 700 `u32`-waarden. Elk element bevat de index van het dichtstbijzijnde
bronpunt of `u32::MAX` buiten het bronbereik. Alle frames van dezelfde
bron/gridcombinatie gebruiken daarna uitsluitend een gather; er vindt geen
projectiewiskunde in de frame-loop plaats. Buiten bronbereik wordt no-data.

Voor AROME wordt het EPSG:3857-celcentrum teruggebracht naar lon/lat en op
het reguliere 390 × 390-puntenraster afgerond. Voor radar gaat lon/lat eerst
naar het stereografische raster uit de HDF5-metadata. Beide actuele
bronrasters dekken de gekozen gedeelde extent volledig.

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
