#!/usr/bin/env bash
# U62 blending-proef: regen in Wind, alfa tegen vermenigvuldigen, gepaard en om en om, load ≤ 16, de perf-lock
# per run en wachten op de load buiten de lock. Gebruik vanuit web/: tmp/u62/run-blend-frames.sh [aantal paren]
set -u
pairs="${1:-3}"
measure() {
  for attempt in $(seq 1 20); do
    while awk '{ exit !($1 > 15.5) }' /proc/loadavg; do sleep 10; done
    line=$(U62_MAX_LOAD=16 flock -w 7200 /home/mathijs/motregen-perf.lock pnpm exec tsx tmp/u62/blend-frames.ts http://127.0.0.1:4320 "$1" "$2" 2>&1 | grep -E '^\{' | head -1)
    case "$line" in '{'*) echo "$line"; return 0 ;; esac
  done
  return 1
}
for pair in $(seq 1 "$pairs"); do
  if [ $((pair % 2)) -eq 1 ]; then measure "alfa-$pair" alfa; measure "vermenigvuldigen-$pair" vermenigvuldigen
  else measure "vermenigvuldigen-$pair" vermenigvuldigen; measure "alfa-$pair" alfa; fi
done
echo "U62-BLEND-KLAAR"
