#!/usr/bin/env bash
# U62 / MIP-24: wat kost de kaart die de kaarttijd volgt? Gepaarde meting: oude build (e267f6d, tween
# standaard uit) op 4321 tegen de nieuwe (tween aan onder Expressief) op 4320, telkens direct na elkaar,
# 20 s afspelen vanaf vlak vóór zonsondergang op po-android. Load ≤ 16 (orkestrator 2026-10-08), de
# perf-lock per run en wachten op de load gebeurt buiten de lock.
# Gebruik vanuit web/: tmp/u62/run-map-night.sh [HH:MM start] [aantal paren]
set -u
start="${1:-18:40}"
pairs="${2:-4}"
measure() {
  for attempt in $(seq 1 20); do
    while awk '{ exit !($1 > 15.5) }' /proc/loadavg; do sleep 10; done
    line=$(U62_MAX_LOAD=16 flock -w 7200 /home/mathijs/motregen-perf.lock pnpm exec tsx tmp/u62/map-night-frames.ts "$1" "$2" uit "$start" 2>&1 | grep -E '^\{|Error' | head -1)
    echo "$line"
    case "$line" in '{'*) return 0 ;; esac
  done
  return 1
}
for pair in $(seq 1 "$pairs"); do
  # Om en om beginnen, zodat een trend in de load niet één kant bevoordeelt.
  if [ $((pair % 2)) -eq 1 ]; then measure http://127.0.0.1:4321 "oud-$pair"; measure http://127.0.0.1:4320 "nieuw-$pair"
  else measure http://127.0.0.1:4320 "nieuw-$pair"; measure http://127.0.0.1:4321 "oud-$pair"; fi
done
echo "U62-KAART-KLAAR"
