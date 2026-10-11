#!/usr/bin/env bash
# U77: frametijd van een mengvariant tegen een referentie, gepaard en om en om, load bij de start ≤ 16, de perf-lock
# per run en wachten op de load buiten de lock (naar rig/run-field-frames.sh van U72).
# Gebruik vanuit web/: tmp/u77/run-blend-frames.sh <naam> <uren vooruit> <palet> <referentie-menging> <menging> [paren]
set -u
name="$1"; hours="$2"; palette="$3"; reference="$4"; blend="$5"; pairs="${6:-3}"
measure() {
  local label="$1"; shift
  for attempt in $(seq 1 20); do
    while awk '{ exit !($1 > 15.5) }' /proc/loadavg; do sleep 10; done
    line=$(U77_MAX_LOAD=16 flock -w 7200 /home/mathijs/motregen-perf.lock pnpm exec tsx tmp/u77/blend-frames.ts http://127.0.0.1:4320 "$label" "$hours" "$palette" "$@" 2>&1 | grep -E '^\{' | head -1)
    case "$line" in '{'*) echo "$line"; return 0 ;; esac
  done
  echo "MISLUKT: $label"; return 1
}
for pair in $(seq 1 "$pairs"); do
  if [ $((pair % 2)) -eq 1 ]; then measure "$name-$reference-$pair" "$reference"; measure "$name-$blend-$pair" "$blend"
  else measure "$name-$blend-$pair" "$blend"; measure "$name-$reference-$pair" "$reference"; fi
done
echo "U77-FRAMES-KLAAR: $name"
