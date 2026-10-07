#!/usr/bin/env bash
set -euo pipefail
cover_dir="$1"

for zoom in 4 5 6 7 8 9 10; do
  detail_zoom="$zoom"
  if [ "$zoom" = 10 ]; then detail_zoom=12; fi
  pixel_metres="$(awk -v z="$zoom" 'BEGIN { print 40075016.6856 / (256 * 2^z) }')"
  tolerance="$(awk -v p="$pixel_metres" -v z="$zoom" 'BEGIN { print p * (z < 10 ? 0.25 : 0.1) }')"
  urban_buffer="$(awk -v p="$pixel_metres" -v z="$zoom" 'BEGIN { print p * (z == 6 ? 0.5 : z == 7 ? 0.25 : z == 8 ? 0.125 : 0.1) }')"
  ogr2ogr -f GeoJSON "$cover_dir/cover-$zoom.tmp.geojson" "$cover_dir/landcover-parts.gpkg" \
    -overwrite -t_srs EPSG:4326 -nlt MULTIPOLYGON -dialect SQLite \
    -sql "SELECT ST_SimplifyPreserveTopology(CASE WHEN class = 'urban' THEN ST_Buffer(ST_UnaryUnion(ST_Collect(ST_Buffer(ST_CollectionExtract(ST_MakeValid(geom), 3), $urban_buffer))), -$urban_buffer) ELSE ST_UnaryUnion(ST_Collect(ST_CollectionExtract(ST_MakeValid(geom), 3))) END, $tolerance) AS geometry, class, detail_minzoom FROM cover WHERE detail_minzoom <= $detail_zoom GROUP BY class, detail_minzoom, CAST(ST_X(ST_Centroid(geom)) / 5000 AS INTEGER), CAST(ST_Y(ST_Centroid(geom)) / 5000 AS INTEGER)"
  if [ "$zoom" -le 5 ]; then
    ogr2ogr -f GeoJSONSeq "$cover_dir/ne-$zoom.geojsonl" "$cover_dir/natural-earth-urban.geojson" -overwrite \
      -where "detail_minzoom <= $zoom"
  fi
  mv "$cover_dir/cover-$zoom.tmp.geojson" "$cover_dir/cover-$zoom.geojson"
done
pnpm --filter motregen-web exec tsx ../tools/basemap/merge-landcover.mts "$cover_dir"
