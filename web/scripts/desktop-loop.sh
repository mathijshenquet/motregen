#!/usr/bin/env bash
set -euo pipefail

desktop_output=${1:?Usage: desktop-loop.sh OUTPUT_DIR REFERENCE_DIST INLINE_DIST LAZY_DIST TILE_DIST}
desktop_reference=${2:?Missing REFERENCE_DIST}
desktop_inline=${3:?Missing INLINE_DIST}
desktop_lazy=${4:?Missing LAZY_DIST}
desktop_tile=${5:?Missing TILE_DIST}
mkdir -p "$desktop_output"
export MOTREGEN_E2E_PORT=${MOTREGEN_E2E_PORT:-4394}
export MOTREGEN_E2E_DATA_PORT=${MOTREGEN_E2E_DATA_PORT:-8394}
export MOTREGEN_RIG_PREBUILT=1

capture() {
  local desktop_name=$1 desktop_dist=$2
  shift 2
  MOTREGEN_RIG_DIST="$desktop_dist" bash scripts/desktop-rig.sh "$desktop_output/$desktop_name" "$@" > "$desktop_output/$desktop_name.txt" 2>&1
  pnpm exec tsx scripts/start-waterfall.ts "$desktop_output"/"$desktop_name"-*-run*.json > "$desktop_output/$desktop_name-tables.md"
}

capture reference "$desktop_reference" --repeat=3
capture inline "$desktop_inline" --repeat=3
capture lazy "$desktop_lazy" --repeat=3
capture reference-warm "$desktop_reference" --repeat=3 --warm
capture lazy-warm "$desktop_lazy" --repeat=3 --warm
capture reference-dev "$desktop_reference" --repeat=3 --query=perf=1\&dev
capture tegel "$desktop_tile" --repeat=3 --query=perf=1\&dev\&kaartstart=tegel
MOTREGEN_RIG_DIST="$desktop_tile" MOTREGEN_DESKTOP_REVIEW=1 bash scripts/desktop-rig.sh "$desktop_output/tegel-review" tegel > "$desktop_output/tegel-review.txt" 2>&1

for desktop_name in reference inline lazy reference-dev tegel; do
  desktop_query=''
  case $desktop_name in
    reference) desktop_dist=$desktop_reference ;;
    inline) desktop_dist=$desktop_inline ;;
    lazy) desktop_dist=$desktop_lazy ;;
    reference-dev) desktop_dist=$desktop_reference; desktop_query='dev' ;;
    tegel) desktop_dist=$desktop_tile; desktop_query='dev&kaartstart=tegel' ;;
  esac
  MOTREGEN_RIG_DIST="$desktop_dist" MOTREGEN_DESKTOP_LIGHTHOUSE=1 MOTREGEN_DESKTOP_QUERY="$desktop_query" bash scripts/desktop-rig.sh "$desktop_output/$desktop_name-lighthouse" > "$desktop_output/$desktop_name-lighthouse.txt" 2>&1
done
