#!/usr/bin/env bash
set -euo pipefail
cover_dir="$1"

generalize_class() {
  local cover_class="$1"
  if [ "${MOTREGEN_LANDCOVER_RESUME:-0}" = 1 ] && [ -s "$cover_dir/cover-$cover_class.geojson" ]; then
    ogrinfo -ro -so "$cover_dir/cover-$cover_class.geojson" > "$cover_dir/cover-$cover_class-check.txt"
    return
  fi
  ogr2ogr -f GeoJSON "$cover_dir/cover-$cover_class.tmp.geojson" "$cover_dir/landcover-parts.gpkg" \
    -overwrite -nlt MULTIPOLYGON -dialect SQLite \
    -sql "SELECT ST_UnaryUnion(ST_Collect(ST_CollectionExtract(ST_MakeValid(geom), 3))) AS geometry, class FROM cover WHERE class = '$cover_class' GROUP BY CAST(ST_X(ST_Centroid(geom)) * 20 AS INTEGER), CAST(ST_Y(ST_Centroid(geom)) * 20 AS INTEGER)"
  mv "$cover_dir/cover-$cover_class.tmp.geojson" "$cover_dir/cover-$cover_class.geojson"
}

pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT
for cover_class in wood grass urban park sand wetland; do
  generalize_class "$cover_class" &
  pids+=("$!")
  if [ "${#pids[@]}" -eq 4 ]; then
    for pid in "${pids[@]}"; do wait "$pid"; done
    pids=()
  fi
done
for pid in "${pids[@]}"; do wait "$pid"; done

{
  printf '<OGRVRTDataSource><OGRVRTUnionLayer name="landcover">\n'
  for cover_class in wood grass urban park sand wetland; do
    printf '<OGRVRTLayer name="%s"><SrcDataSource relativeToVRT="1">cover-%s.geojson</SrcDataSource><SrcLayer>SELECT</SrcLayer></OGRVRTLayer>\n' "$cover_class" "$cover_class"
  done
  printf '</OGRVRTUnionLayer></OGRVRTDataSource>\n'
} > "$cover_dir/landcover.vrt"
ogr2ogr -f GeoJSON "$cover_dir/landcover.tmp.geojson" "$cover_dir/landcover.vrt" -overwrite
mv "$cover_dir/landcover.tmp.geojson" "$cover_dir/landcover.geojson"
