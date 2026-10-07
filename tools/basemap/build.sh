#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
scratch="${MOTREGEN_BASEMAP_SCRATCH:-tmp/basemap}"
mkdir -p "$scratch/sources" "$scratch/build"

for region in netherlands belgium germany/nordrhein-westfalen germany/niedersachsen; do
  name="${region##*/}"
  source="$scratch/sources/$name.osm.pbf"
  if [ ! -f "$source" ]; then
    curl --fail --location --retry 3 "https://download.geofabrik.de/europe/$region-261006.osm.pbf" --output "$source.part"
    mv "$source.part" "$source"
  fi
done
if [ -f tools/basemap/sources.sha256 ]; then
  (cd "$scratch/sources" && sha256sum --check "${OLDPWD}/tools/basemap/sources.sha256")
fi
filter_tags=(
  n/place
  wr/natural=water,wood,grassland,heath,scrub,wetland,sand,beach
  wr/landuse=forest,residential,commercial,industrial,retail,reservoir,grass,meadow,allotments,village_green,recreation_ground
  wr/leisure=park,garden,golf_course,nature_reserve
  wr/waterway=riverbank wr/boundary=administrative,national_park
)
filter_hash="$(printf '%s\n' "${filter_tags[@]}" | sha256sum | cut -d ' ' -f 1)"
previous_filter_hash="$(cat "$scratch/build/filter.sha256" 2>/dev/null || true)"
if [ ! -f "$scratch/build/region.osm.pbf" ] || [ "$filter_hash" != "$previous_filter_hash" ]; then
  osmium merge "$scratch"/sources/*.osm.pbf -o "$scratch/build/merged.osm.pbf" --overwrite
  osmium tags-filter "$scratch/build/merged.osm.pbf" "${filter_tags[@]}" \
    -o "$scratch/build/filtered.osm.pbf" --overwrite
  osmium extract --bbox 2.3108,50.3256,7.4192,53.6844 --strategy smart "$scratch/build/filtered.osm.pbf" -o "$scratch/build/region.osm.pbf" --overwrite
  printf '%s\n' "$filter_hash" > "$scratch/build/filter.sha256"
fi
cp tools/basemap/config.json tools/basemap/process.lua "$scratch/build/"
gzip --decompress --stdout tools/basemap/ocean.geojson.gz > "$scratch/build/ocean.geojson"
(
  cd "$scratch/build"
  tilemaker --input region.osm.pbf --output nl.pmtiles --config config.json --process process.lua --threads "${MOTREGEN_BASEMAP_THREADS:-4}"
  pmtiles cluster nl.pmtiles
  pmtiles verify nl.pmtiles
)
pnpm --filter motregen-web exec tsx ../tools/basemap/publish.mts "$scratch/build/nl.pmtiles"
