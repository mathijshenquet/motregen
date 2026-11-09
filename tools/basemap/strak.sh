#!/usr/bin/env bash
# U108 `strak`: landbedekking (z5–9) en water (z5–8) opnieuw generaliseren uit het huidige archief, voor een
# rustiger en goedkoper beeld op lage zoom. Stedelijk gebied, bos en park krijgen gladde randen zonder snippers, kleine
# plassen verdwijnen, gras/zand/moeras pas vanaf z9. z4 en z10 blijven ongewijzigd.
# Gebruik: bash tools/basemap/strak.sh → tools/basemap/tiles/nl-<hash>.pmtiles + manifest-strak.json
set -euo pipefail
cd "$(dirname "$0")/../.."
scratch="${MOTREGEN_BASEMAP_SCRATCH:-tmp/basemap}/strak"
mkdir -p "$scratch"
base="tools/basemap/tiles/$(jq -r .filename tools/basemap/tiles/manifest-nu.json)"

(cd web && node --import tsx ../tools/basemap/extract-layer.mts "../$base" 10 landcover "../$scratch/landcover-z10.geojsonl")
rm -f "$scratch/source.gpkg"
# Uitgesplitst per deel en daarna samengevoegd (een echte OF over overlappende tegelstukken). Geldig maken met
# GEOSMakeValid: SpatiaLite's ST_MakeValid (rttopo) gaf voor zelfrakende zeepolygonen een collectie zonder vlak, en
# verloor zo 60 % van het ongeldige wateroppervlak (hele zeestukken weg) en 14 % van de ongeldige landbedekking.
ogr2ogr -f GPKG "$scratch/source.gpkg" "$scratch/landcover-z10.geojsonl" -nln cover -a_srs EPSG:3857 -nlt POLYGON -explodecollections
for zoom in 5 6 7 8; do
  (cd web && node --import tsx ../tools/basemap/extract-layer.mts "../$base" "$zoom" water "../$scratch/water-z$zoom.geojsonl")
  ogr2ogr -f GPKG -update "$scratch/source.gpkg" "$scratch/water-z$zoom.geojsonl" -nln "water$zoom" -a_srs EPSG:3857 -nlt POLYGON -explodecollections
done

rm -f "$scratch/strak.gpkg"
first=1
add() {  # laagnaam, SQL
  ogr2ogr -f GPKG $([ "$first" = 1 ] || echo -update) "$scratch/strak.gpkg" "$scratch/source.gpkg" -nln "$1" \
    -nlt MULTIPOLYGON -explodecollections -dialect SQLite -sql "$2"
  first=0
}
for zoom in 5 6 7 8 9; do
  px="$(awk -v z="$zoom" 'BEGIN { print 40075016.6856 / (256 * 2^z) }')"
  # Dezelfde selectie per zoom als het oorspronkelijke profiel (detail_minzoom), daarna licht sluiten en openen
  # (0,3 px): de massa blijft gelijk, losse snippers en stekels verdwijnen. Vereenvoudigen op 0,5 px. Groeperen per
  # 64 px houdt de unions klein; naden vallen weg omdat vlakken geen rand hebben.
  for class in urban wood park; do
    if [ "$class" = wood ] && [ "$zoom" -lt 7 ]; then continue; fi
    smooth="$(awk -v p="$px" 'BEGIN { print p * 0.3 }')"
    add "landcover$zoom$class" "SELECT ST_SimplifyPreserveTopology(ST_Buffer(ST_Buffer(ST_UnaryUnion(ST_Collect(ST_Buffer(ST_CollectionExtract(GEOSMakeValid(geom), 3), $smooth, 2))), -2 * $smooth, 2), $smooth, 2), $px * 0.5) AS geom, '$class' AS class, $zoom AS detail_minzoom FROM cover WHERE class = '$class' AND detail_minzoom <= $zoom GROUP BY CAST(ST_X(ST_Centroid(geom)) / ($px * 64) AS INTEGER), CAST(ST_Y(ST_Centroid(geom)) / ($px * 64) AS INTEGER)"
  done
  if [ "$zoom" = 9 ]; then
    add "landcover9rest" "SELECT ST_SimplifyPreserveTopology(ST_UnaryUnion(ST_Collect(ST_CollectionExtract(GEOSMakeValid(geom), 3))), $px * 0.5) AS geom, class, 9 AS detail_minzoom FROM cover WHERE class IN ('grass', 'sand', 'wetland') AND detail_minzoom <= 9 GROUP BY class, CAST(ST_X(ST_Centroid(geom)) / ($px * 64) AS INTEGER), CAST(ST_Y(ST_Centroid(geom)) / ($px * 64) AS INTEGER)"
  else
    add "water$zoom" "SELECT ST_UnaryUnion(ST_Collect(ST_CollectionExtract(GEOSMakeValid(geom), 3))) AS geom FROM water$zoom GROUP BY CAST(ST_X(ST_Centroid(geom)) / ($px * 64) AS INTEGER), CAST(ST_Y(ST_Centroid(geom)) / ($px * 64) AS INTEGER)"
  fi
done
# Kleine stukken weg (na het uitsplitsen per deel): landbedekking < 3 px², plassen < 2 px².
for layer in $(ogrinfo -q "$scratch/strak.gpkg" | awk -F'[: ]+' '/^[0-9]+:/ { print $2 }'); do
  case "$layer" in
    landcover*) minimum=3 ;; water*) minimum=2 ;; *) continue ;;
  esac
  zoom="$(echo "$layer" | grep -o '[0-9]' | head -1)"
  px="$(awk -v z="$zoom" 'BEGIN { print 40075016.6856 / (256 * 2^z) }')"
  ogrinfo -q "$scratch/strak.gpkg" -dialect SQLite -sql "DELETE FROM \"$layer\" WHERE ST_Area(geom) < $px * $px * $minimum" > /dev/null
done

conf="{"
for layer in $(ogrinfo -q "$scratch/strak.gpkg" | awk -F'[: ]+' '/^[0-9]+:/ { print $2 }'); do
  zoom="$(echo "$layer" | grep -o '[0-9]' | head -1)"
  target=landcover; case "$layer" in water*) target=water ;; esac
  conf="$conf\"$layer\":{\"target_name\":\"$target\",\"minzoom\":$zoom,\"maxzoom\":$zoom},"
done
conf="${conf%,}}"
rm -f "$scratch/strak.mbtiles"
ogr2ogr -f MBTILES "$scratch/strak.mbtiles" "$scratch/strak.gpkg" -dsco MINZOOM=5 -dsco MAXZOOM=9 -dsco COMPRESS=YES \
  -dsco CONF="$conf"
MOTREGEN_RIVER_MAX_RANK=2 bash tools/basemap/rivers.sh
(cd web && node --import tsx ../tools/basemap/compose.mts strak "../$scratch" --replace landcover:5-9 --replace water:5-8 \
  "../$scratch/strak.mbtiles" "../${MOTREGEN_BASEMAP_SCRATCH:-tmp/basemap}/rivers/rivers-r2.mbtiles")
