#!/usr/bin/env bash
set -euo pipefail
cover_dir="$1"

generalize_zoom() {
  local zoom="$1"
  local detail_zoom="$zoom"
  if [ "$zoom" = 10 ]; then detail_zoom=12; fi
  local pixel_metres tolerance park_tolerance urban_buffer query profile_hash ogr_pid
  pixel_metres="$(awk -v z="$zoom" 'BEGIN { print 40075016.6856 / (256 * 2^z) }')"
  tolerance="$(awk -v p="$pixel_metres" 'BEGIN { print p * 0.25 }')"
  park_tolerance="$(awk -v p="$pixel_metres" -v z="$zoom" 'BEGIN { print p * (z < 10 ? 0.1 : 0.25) }')"
  urban_buffer="$(awk -v p="$pixel_metres" -v z="$zoom" 'BEGIN { print p * (z == 6 ? 0.5 : z == 7 ? 0.2 : z == 8 ? 0.125 : 0.1) }')"
  query="SELECT ST_SimplifyPreserveTopology(CASE WHEN class IN ('urban', 'urban_other') THEN ST_Buffer(ST_UnaryUnion(ST_Collect(ST_Buffer(ST_CollectionExtract(ST_MakeValid(geom), 3), $urban_buffer))), -$urban_buffer) ELSE ST_UnaryUnion(ST_Collect(ST_CollectionExtract(ST_MakeValid(geom), 3))) END, CASE WHEN class = 'park' THEN $park_tolerance ELSE $tolerance END) AS geometry, class, detail_minzoom FROM cover WHERE detail_minzoom <= $detail_zoom GROUP BY class, detail_minzoom, CAST(ST_X(ST_Centroid(geom)) / 5000 AS INTEGER), CAST(ST_Y(ST_Centroid(geom)) / 5000 AS INTEGER)"
  profile_hash="$( { printf '%s\n' "$query"; cat "$cover_dir/landcover-parts.sha256"; } | sha256sum | cut -d ' ' -f 1)"
  if [ ! -s "$cover_dir/cover-$zoom.geojson" ] || [ "$profile_hash" != "$(cat "$cover_dir/cover-$zoom.sha256" 2>/dev/null || true)" ]; then
    ogr2ogr -f GeoJSON "$cover_dir/cover-$zoom.tmp.geojson" "$cover_dir/landcover-parts.gpkg" \
      -overwrite -t_srs EPSG:4326 -nlt MULTIPOLYGON -dialect SQLite -sql "$query" &
    ogr_pid="$!"
    trap 'kill "$ogr_pid" 2>/dev/null || true' EXIT TERM
    wait "$ogr_pid"
    trap - EXIT TERM
    mv "$cover_dir/cover-$zoom.tmp.geojson" "$cover_dir/cover-$zoom.geojson"
    printf '%s\n' "$profile_hash" > "$cover_dir/cover-$zoom.sha256"
  fi
  if [ "$zoom" -le 5 ]; then
    ogr2ogr -f GeoJSONSeq "$cover_dir/ne-$zoom.geojsonl" "$cover_dir/natural-earth-urban.geojson" -overwrite \
      -where "detail_minzoom <= $zoom"
  fi
}

pids=()
cleanup() { for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT
for zoom in 4 5 6 7 8 9 10; do
  generalize_zoom "$zoom" &
  pids+=("$!")
  if [ "${#pids[@]}" -eq 4 ]; then
    for pid in "${pids[@]}"; do wait "$pid"; done
    pids=()
  fi
done
for pid in "${pids[@]}"; do wait "$pid"; done
pnpm --filter motregen-web exec tsx ../tools/basemap/merge-landcover.mts "$cover_dir"
for zoom in 4 5 6 7 8 9 10; do
  mv "$cover_dir/landcover-$zoom.tmp.geojson" "$cover_dir/landcover-$zoom.geojson"
done
