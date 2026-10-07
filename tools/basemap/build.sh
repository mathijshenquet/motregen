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
if [ ! -f "$scratch/build/region.osm.pbf" ]; then
  osmium merge "$scratch"/sources/*.osm.pbf -o "$scratch/build/merged.osm.pbf" --overwrite
  osmium tags-filter "$scratch/build/merged.osm.pbf" n/place w/natural=water,wood w/landuse=forest,residential,commercial,industrial,retail,reservoir w/waterway=riverbank r/natural=water,wood r/landuse=forest,residential,commercial,industrial,retail,reservoir r/waterway=riverbank r/boundary=administrative w/boundary=administrative -o "$scratch/build/filtered.osm.pbf" --overwrite
  osmium extract --bbox 2.3108,50.3256,7.4192,53.6844 --strategy smart "$scratch/build/filtered.osm.pbf" -o "$scratch/build/region.osm.pbf" --overwrite
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
