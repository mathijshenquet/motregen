#!/usr/bin/env bash
# U62: laagvarianten van de scrubber, drie ronden door elkaar, onder de gedeelde perf-lock van de dev-host.
# Gebruik vanuit web/: tmp/u62/run-layer-variants.sh [baseURL]
set -u
base="${1:-http://127.0.0.1:4320}"
# Eerst wachten tot de host rustig is en dán pas de lock nemen: wachten mét de lock zou andere tracks
# blokkeren zonder dat er gemeten wordt.
quiet() { while awk '{ exit !($1 >= 8) }' /proc/loadavg; do sleep 20; done; }
run() { quiet; flock -w 7200 /home/mathijs/motregen-perf.lock pnpm exec tsx tmp/u62/paint-cost.ts "$base" "$1" "$2" 2>&1 | tail -1; }
for round in 1 2 3; do
  run "lock-nu-$round" ''
  run "lock-contain-$round" '.scrub-surface { contain: paint; }'
  run "lock-geenlaag-$round" '.chart-track { will-change: auto; }'
done
echo "LAYER-VARIANTS-DONE"
