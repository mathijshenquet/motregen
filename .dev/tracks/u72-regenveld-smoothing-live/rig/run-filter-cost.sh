#!/usr/bin/env bash
# U72: voorfilter-kosten per stand, elk onder de perf-lock, load bij de start ≤ 16 (wachten buiten de lock).
# Gebruik vanuit web/: tmp/u72/run-filter-cost.sh
set -u
measure() {
  local label="$1"; shift
  for attempt in $(seq 1 20); do
    while awk '{ exit !($1 > 15.5) }' /proc/loadavg; do sleep 10; done
    line=$(U72_MAX_LOAD=16 flock -w 7200 /home/mathijs/motregen-perf.lock pnpm exec tsx tmp/u72/filter-cost.ts http://127.0.0.1:4320 "$label" "$@" 2>&1 | grep -E '^\{' | head -1)
    case "$line" in '{'*) echo "$line"; return 0 ;; esac
  done
  echo "MISLUKT: $label"; return 1
}
for taps in 3 5 7 9; do measure "harmonie-blur$taps" 9 bilineair "blur ${taps}×${taps}"; done
measure harmonie-glad 9 bilineair glad
measure radar-blur5 0 'blur 5×5' bilineair
measure radar-glad 0 glad bilineair
echo "U72-FILTERKOSTEN-KLAAR"
