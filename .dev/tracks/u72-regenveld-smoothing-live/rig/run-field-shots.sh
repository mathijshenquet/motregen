#!/usr/bin/env bash
# U72: de hele beeldmatrix. Gebruik vanuit web/: tmp/u72/run-field-shots.sh [baseURL]
# HARMONIE begint ruim 6 uur vooruit (daarvoor loopt de blend); +9 u valt vanmiddag in de nacht, +23 u morgen overdag.
set -u
base="${1:-http://127.0.0.1:4320}"
failures=0
shoot() { pnpm exec tsx tmp/u72/field-shots.ts "$base" "$@" 2>&1 | grep -E '\.png ·' || failures=$((failures + 1)); }
for device in 1280 390; do
  for zoom in nl stad; do
    if [ "$zoom" = nl ]; then view=''; else view='5.6,52.2,9'; fi
    shoot "$zoom" "$device" dag radar 0 "$view"
    shoot "$zoom" "$device" nacht-vast radar 0 "$view"
    shoot "$zoom" "$device" nacht harmonie "${U72_NIGHT_HOURS:-9}" "$view"
    shoot "$zoom" "$device" dag harmonie "${U72_DAY_HOURS:-23}" "$view"
  done
done
echo "U72-SHOTS-FAILURES: $failures"
