#!/usr/bin/env bash
# U108: rivier-middellijnen (rang 1–3) als GPKG per rang en als MBTiles-laag `waterway`, voor strak.sh en diagram.sh.
# Zonder vastgelegde rivers.geojson.gz eerst afleiden uit Overpass.
# Gebruik: bash tools/basemap/rivers.sh [--refresh]; MOTREGEN_RIVER_MAX_RANK=2 laat rang 3 weg (rivers-r2.mbtiles).
set -euo pipefail
cd "$(dirname "$0")/../.."
scratch="${MOTREGEN_BASEMAP_SCRATCH:-tmp/basemap}/rivers"
mkdir -p "$scratch"

if [ ! -f tools/basemap/rivers.geojson.gz ] || [ "${1:-}" = "--refresh" ]; then
  if [ ! -s "$scratch/overpass.json" ]; then
    curl --fail --max-time 600 -A 'motregen-basemap-build/1.0' -o "$scratch/overpass.json" \
      --data-urlencode 'data=[out:json][timeout:240];way["waterway"="river"](49.8,1.8,54.2,8.2);out tags geom;' \
      https://overpass.kumi.systems/api/interpreter
  fi
  (cd web && node --import tsx ../tools/basemap/rivers.mts "../$scratch/overpass.json" "../$scratch/rivers-raw.geojsonl")
  rm -f "$scratch/rivers.geojson"
  # Eén lijn per rivier: losse OSM-ways samenvoegen, ~20 m vereenvoudigen (ruim onder 1 px op z12).
  ogr2ogr -f GeoJSON "$scratch/rivers.geojson" "$scratch/rivers-raw.geojsonl" -lco COORDINATE_PRECISION=5 \
    -dialect SQLite -sql "SELECT ST_SimplifyPreserveTopology(ST_LineMerge(ST_Union(geometry)), 0.0002) AS geometry, name, rank FROM \"rivers-raw\" GROUP BY name, rank"
  gzip -n -9 -c "$scratch/rivers.geojson" > tools/basemap/rivers.geojson.gz
fi

gzip --decompress --stdout tools/basemap/rivers.geojson.gz > "$scratch/rivers.geojson"
max_rank="${MOTREGEN_RIVER_MAX_RANK:-3}"
tiles="$scratch/rivers$([ "$max_rank" = 3 ] || echo "-r$max_rank").mbtiles"
rm -f "$scratch/rivers.gpkg" "$tiles"
for rank in $(seq 1 "$max_rank"); do
  ogr2ogr -f GPKG $([ "$rank" = 1 ] || echo -update) "$scratch/rivers.gpkg" "$scratch/rivers.geojson" -nln "rank$rank" -where "rank = $rank" -select rank -t_srs EPSG:3857
done
# Rang 1 vanaf z5, rang 2 vanaf z7, rang 3 vanaf z9: dezelfde drempels als de stijl, zodat er geen bytes
# meegaan die niet getekend worden.
ogr2ogr -f MBTILES "$tiles" "$scratch/rivers.gpkg" \
  -dsco MINZOOM=4 -dsco MAXZOOM=10 -dsco COMPRESS=YES -dsco SIMPLIFICATION=2 -dsco SIMPLIFICATION_MAX_ZOOM=2 \
  -dsco CONF='{"rank1":{"target_name":"waterway","minzoom":5},"rank2":{"target_name":"waterway","minzoom":7},"rank3":{"target_name":"waterway","minzoom":9}}'
