#!/usr/bin/env bash
set -euo pipefail

desktop_output=${1:?Usage: desktop-loop.sh OUTPUT_DIR REFERENCE_DIST INLINE_DIST LAZY_DIST SVG_DIST TILE_DIST}
desktop_reference=${2:?Missing REFERENCE_DIST}
desktop_inline=${3:?Missing INLINE_DIST}
desktop_lazy=${4:?Missing LAZY_DIST}
desktop_svg=${5:?Missing SVG_DIST}
desktop_tile=${6:?Missing TILE_DIST}
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
capture svg "$desktop_svg" --repeat=3 --query=perf=1\&dev\&kaartstart=svg
capture tegel "$desktop_tile" --repeat=3 --query=perf=1\&dev\&kaartstart=tegel

for desktop_mode in svg tegel; do
  if [[ $desktop_mode == svg ]]; then desktop_dist=$desktop_svg; else desktop_dist=$desktop_tile; fi
  MOTREGEN_RIG_DIST="$desktop_dist" MOTREGEN_DESKTOP_REVIEW=1 bash scripts/desktop-rig.sh "$desktop_output/$desktop_mode-review" "$desktop_mode" > "$desktop_output/$desktop_mode-review.txt" 2>&1
done

for desktop_name in reference inline lazy reference-dev svg tegel; do
  desktop_query=''
  case $desktop_name in
    reference) desktop_dist=$desktop_reference ;;
    inline) desktop_dist=$desktop_inline ;;
    lazy) desktop_dist=$desktop_lazy ;;
    reference-dev) desktop_dist=$desktop_reference; desktop_query='dev' ;;
    svg) desktop_dist=$desktop_svg; desktop_query='dev&kaartstart=svg' ;;
    tegel) desktop_dist=$desktop_tile; desktop_query='dev&kaartstart=tegel' ;;
  esac
  MOTREGEN_RIG_DIST="$desktop_dist" MOTREGEN_DESKTOP_LIGHTHOUSE=1 MOTREGEN_DESKTOP_QUERY="$desktop_query" bash scripts/desktop-rig.sh "$desktop_output/$desktop_name-lighthouse" > "$desktop_output/$desktop_name-lighthouse.txt" 2>&1
done
