#!/usr/bin/env bash
# U72: frametijd van een stand tegen de standaard (bilineair/bilineair/kruisfade), gepaard en om en om, load bij de
# start ≤ 16, de perf-lock per run en wachten op de load buiten de lock.
# Gebruik vanuit web/: tmp/u72/run-field-frames.sh <naam> <uren vooruit> <radar-stand> <harmonie-stand> <tijdmenging> [paren]
set -u
name="$1"; hours="$2"; radar="$3"; harmonie="$4"; time_blend="$5"; pairs="${6:-3}"
measure() {
  local label="$1"; shift
  for attempt in $(seq 1 20); do
    while awk '{ exit !($1 > 15.5) }' /proc/loadavg; do sleep 10; done
    line=$(U72_MAX_LOAD=16 flock -w 7200 /home/mathijs/motregen-perf.lock pnpm exec tsx tmp/u72/field-frames.ts http://127.0.0.1:4320 "$label" "$hours" "$@" 2>&1 | grep -E '^\{' | head -1)
    case "$line" in '{'*) echo "$line"; return 0 ;; esac
  done
  echo "MISLUKT: $label"; return 1
}
baseline() { measure "$name-nu-$1" bilineair bilineair kruisfade; }
candidate() { measure "$name-stand-$1" "$radar" "$harmonie" "$time_blend"; }
for pair in $(seq 1 "$pairs"); do
  if [ $((pair % 2)) -eq 1 ]; then baseline "$pair"; candidate "$pair"; else candidate "$pair"; baseline "$pair"; fi
done
echo "U72-FRAMES-KLAAR: $name"
