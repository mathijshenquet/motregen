#!/usr/bin/env bash
# U62-experiment: kaart die met de kaarttijd meetweent, aan tegen uit, drie geldige runs elk, onder de perf-lock.
# Gebruik vanuit web/: tmp/u62/run-map-night.sh [baseURL] [HH:MM start]
set -u
base="${1:-http://127.0.0.1:4320}"
start="${2:-18:40}"
# Wachten op een rustige host vóór de lock; een run die toch op de load-check strandt wordt herhaald.
measure() {
  for attempt in 1 2 3 4 5 6; do
    while awk '{ exit !($1 >= 7) }' /proc/loadavg; do sleep 15; done
    line=$(flock -w 7200 /home/mathijs/motregen-perf.lock pnpm exec tsx tmp/u62/map-night-frames.ts "$base" "$1" "$2" "$start" 2>&1 | grep -E '^\{|Error' | head -1)
    echo "$line"
    case "$line" in '{'*) return 0 ;; esac
  done
  return 1
}
for round in 1 2 3; do
  measure "uit-$round" uit
  measure "aan-$round" aan
done
echo "U62-KAART-KLAAR"
