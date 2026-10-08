#!/usr/bin/env bash
set -euo pipefail

if [[ ${MOTREGEN_PERF_LOCK_HELD:-0} == 1 ]]; then
  exec "$@"
fi

# Een handmatige buitenste flock zonder onze env-marker mag geen tweede, blokkerende lock nemen.
perf_owner=$(lslocks --noheadings --notruncate --output PID,PATH,MODE | awk '$2 == "/home/mathijs/motregen-perf.lock" && $3 == "WRITE" { print $1; exit }')
perf_ancestor=$PPID
while [[ -n $perf_owner && $perf_ancestor -gt 1 ]]; do
  if [[ $perf_ancestor == "$perf_owner" ]]; then
    export MOTREGEN_PERF_LOCK_HELD=1
    exec "$@"
  fi
  perf_ancestor=$(awk '/^PPid:/ { print $2 }' "/proc/$perf_ancestor/status" 2>/dev/null) || break
done

exec flock -w 7200 /home/mathijs/motregen-perf.lock env MOTREGEN_PERF_LOCK_HELD=1 "$@"
