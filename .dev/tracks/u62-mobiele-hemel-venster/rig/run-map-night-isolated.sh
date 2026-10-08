#!/usr/bin/env bash
# U62 / MIP-24, geïsoleerd: dezelfde code met de kaart-tween uit (4322, tmp/u62/dist-geen-tween) tegen de
# gewone build met de tween aan (4320). Gepaard, om en om, load ≤ 16, de perf-lock per run.
# Gebruik vanuit web/: tmp/u62/run-map-night-isolated.sh [HH:MM start] [aantal paren]
set -u
start="${1:-18:40}"
pairs="${2:-3}"
measure() {
  for attempt in $(seq 1 20); do
    while awk '{ exit !($1 > 15.5) }' /proc/loadavg; do sleep 10; done
    line=$(U62_MAX_LOAD=16 flock -w 7200 /home/mathijs/motregen-perf.lock pnpm exec tsx tmp/u62/map-night-frames.ts "$1" "$2" uit "$start" 2>&1 | grep -E '^\{' | head -1)
    case "$line" in '{'*) echo "$line"; return 0 ;; esac
  done
  return 1
}
for pair in $(seq 1 "$pairs"); do
  if [ $((pair % 2)) -eq 1 ]; then measure http://127.0.0.1:4322 "zonder-$pair"; measure http://127.0.0.1:4320 "met-$pair"
  else measure http://127.0.0.1:4320 "met-$pair"; measure http://127.0.0.1:4322 "zonder-$pair"; fi
done
echo "U62-KAART-KLAAR"
