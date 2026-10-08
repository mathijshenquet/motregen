#!/usr/bin/env bash
set -euo pipefail

if [[ ${MOTREGEN_PERF_LOCK_HELD:-0} == 1 ]]; then
  exec "$@"
fi

exec flock -w 7200 /home/mathijs/motregen-perf.lock env MOTREGEN_PERF_LOCK_HELD=1 "$@"
