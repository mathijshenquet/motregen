#!/usr/bin/env bash
# U62: alle perf-metingen van deze track, drie ronden door elkaar, onder de gedeelde perf-lock van de dev-host.
# Gebruik vanuit web/: tmp/u62/run-perf.sh [baseURL] [eerste ronde]
set -u
base="${1:-http://127.0.0.1:4320}"
first="${2:-1}"
# Eerst wachten tot de host rustig is en dán pas de lock nemen: wachten mét de lock zou andere tracks
# blokkeren zonder dat er gemeten wordt.
quiet() { while awk '{ exit !($1 >= 8) }' /proc/loadavg; do sleep 20; done; }
locked() { quiet; flock -w 7200 /home/mathijs/motregen-perf.lock "$@" 2>&1 | tail -1; }
for round in $(seq "$first" 3); do
  locked pnpm exec tsx tmp/u62/paint-cost.ts "$base" "lock-nu-$round" ''
  locked pnpm exec tsx tmp/u62/paint-cost.ts "$base" "lock-contain-$round" '.scrub-surface { contain: paint; }'
  locked pnpm exec tsx tmp/u62/paint-cost.ts "$base" "lock-geenlaag-$round" '.chart-track { will-change: auto; }'
done
for round in 1 2 3; do
  locked pnpm exec tsx tmp/u62/wind-frames.ts "$base" "uit-$round" uit
  locked pnpm exec tsx tmp/u62/wind-frames.ts "$base" "meer-$round" meer
done
echo "U62-PERF-DONE"
