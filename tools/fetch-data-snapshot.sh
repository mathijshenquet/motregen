#!/usr/bin/env bash
# Bevroren datasnapshot van de publieke data: manifest + alle chunks die het noemt.
# Gebruik: tools/fetch-data-snapshot.sh <doelmap> [origin]   (origin standaard https://motregen.nl/data)
# Wacht met --after <now> tot het manifest een latere "now" heeft dan <now>.
set -euo pipefail
after=""
if [[ ${1:-} == --after ]]; then
  after="$2"
  shift 2
fi
target="${1:?doelmap ontbreekt}"
origin="${2:-https://motregen.nl/data}"
mkdir -p "$target/chunks"
manifest="$target/manifest.json"
while true; do
  curl -fsS "$origin/manifest.json" -o "$manifest.tmp"
  now=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["now"])' "$manifest.tmp")
  if [[ -z $after || $now > $after ]]; then break; fi
  sleep 20
done
python3 -c 'import json, sys; [print(chunk["url"]) for chunk in json.load(open(sys.argv[1]))["chunks"]]' "$manifest.tmp" |
  while read -r url; do
    [[ -f "$target/$url" ]] || curl -fsS "$origin/$url" -o "$target/$url"
  done
mv "$manifest.tmp" "$manifest"
echo "$now"
