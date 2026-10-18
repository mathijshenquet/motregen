#!/usr/bin/env bash
# Reproduceert de U95-meting (en U95c, Zwitserland; U99, ICON-D2) vanuit een checkout. Data landt in data/ (git-ignored); bestaande
# runs en afgesloten jaren worden niet opnieuw opgehaald. Sleutel: KNMI_OPEN_DATA_API_KEY (omgeving of .env).
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
step fetch_swiss.py
step fetch_app.py
step fetch_openmeteo.py 2026-01-09 "$(date -u +%F)" ch
# U99 (MIP-39): ICON-D2 op twee leads en HARMONIE op dezelfde lead een dag vooruit.
step fetch_icon_d2.py 2026-01-09 2026-10-15
step fetch_icon_d2.py 2026-01-09 2026-10-15 kwartier
step fetch_harmonie.py 2026-01-09 2026-10-15 --step 4 --run-hours 0,3,6,9,12,15,18,21 --leads 23-27 --out harmonie-dag1
step evaluate.py
step evaluate_icon_d2.py
echo "== bench.mts 6"
node bench.mts 6
code=$?
echo "EXIT: $code (bench.mts)"
if [ "$code" -ne 0 ]; then status=1; fi
exit "$status"
