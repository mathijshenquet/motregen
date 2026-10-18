#!/usr/bin/env bash
# Reproduceert de U95-meting vanuit een checkout. Data landt in data/ (git-ignored); bestaande runs en
# afgesloten jaren worden niet opnieuw opgehaald. Sleutel: KNMI_OPEN_DATA_API_KEY (omgeving of .env).
set -u
cd "$(dirname "$0")"
status=0
step() {
  echo "== $*"
  uv run python "$@"
  local code=$?
  echo "EXIT: $code ($1)"
  if [ "$code" -ne 0 ]; then status=1; fi
}
step fetch_obs.py 2016 2026-10-17
step fetch_harmonie.py 2026-01-09 2026-10-15
step fetch_harmonie.py 2026-01-09 2026-10-15 --step 4 --run-hours 3,6,9,12,15,18 --leads 0-3 --out harmonie-kort
step fetch_openmeteo.py 2026-01-09 2026-10-15
step evaluate.py
echo "== bench.mts 6"
node bench.mts 6
code=$?
echo "EXIT: $code (bench.mts)"
if [ "$code" -ne 0 ]; then status=1; fi
exit "$status"
