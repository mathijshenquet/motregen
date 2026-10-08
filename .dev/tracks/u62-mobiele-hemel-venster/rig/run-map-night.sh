#!/usr/bin/env bash
# U62 / MIP-24: wat kost de kaart die de kaarttijd volgt? Oude build (e267f6d, tween standaard uit) op 4321
# tegen de nieuwe (tween aan onder Expressief) op 4320, drie geldige runs elk door elkaar, 20 s afspelen
# vanaf vlak vóór zonsondergang op po-android, onder de gedeelde perf-lock.
# Gebruik vanuit web/: tmp/u62/run-map-night.sh [HH:MM start]
set -u
start="${1:-18:40}"
# Wachten op een rustige host vóór de lock; een run die toch op de load-check strandt wordt herhaald.
measure() {
  for attempt in $(seq 1 12); do
    while awk '{ exit !($1 >= 7) }' /proc/loadavg; do sleep 15; done
    line=$(flock -w 7200 /home/mathijs/motregen-perf.lock pnpm exec tsx tmp/u62/map-night-frames.ts "$1" "$2" uit "$start" 2>&1 | grep -E '^\{|Error' | head -1)
    echo "$line"
    case "$line" in '{'*) return 0 ;; esac
  done
  return 1
}
for round in 1 2 3; do
  measure http://127.0.0.1:4321 "oud-$round"
  measure http://127.0.0.1:4320 "nieuw-$round"
done
echo "U62-KAART-KLAAR"
