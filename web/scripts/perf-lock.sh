#!/usr/bin/env bash
set -euo pipefail

if [[ ${MOTREGEN_PERF_LOCK_HELD:-0} == 1 ]]; then
  node scripts/perf-quiet.ts --check
  if [[ ${1:-} == scripts/e2e-slot.sh ]]; then
    shift
    for perf_slot in 1 2; do
      if flock -n -o -E 75 "/tmp/motregen-e2e-slot$perf_slot.lock" "$@"; then exit 0; else perf_status=$?; fi
      if [[ $perf_status != 75 ]]; then exit "$perf_status"; fi
    done
    exit 76
  fi
  exec "$@"
fi

# Een handmatige buitenste flock zonder onze env-marker mag geen tweede, blokkerende lock nemen.
perf_owner=$(lslocks --noheadings --notruncate --output PID,PATH,MODE | awk '$2 == "/home/mathijs/motregen-perf.lock" && $3 == "WRITE" && !found { print $1; found = 1 }')
perf_ancestor=$PPID
while [[ -n $perf_owner && $perf_ancestor -gt 1 ]]; do
  if [[ $perf_ancestor == "$perf_owner" ]]; then
    export MOTREGEN_PERF_LOCK_HELD=1
    exec bash "$0" "$@"
  fi
  perf_ancestor=$(awk '/^PPid:/ { print $2 }' "/proc/$perf_ancestor/status" 2>/dev/null) || break
done

while true; do
  node scripts/perf-quiet.ts
  if flock -w 7200 -o /home/mathijs/motregen-perf.lock env MOTREGEN_PERF_LOCK_HELD=1 bash "$0" "$@"; then
    exit 0
  else
    perf_status=$?
  fi
  # 76 betekent drukke host of bezette e2e-slots; beide wachtrijen blijven buiten de perf-lock.
  if [[ $perf_status != 76 ]]; then exit "$perf_status"; fi
  sleep 5
done
