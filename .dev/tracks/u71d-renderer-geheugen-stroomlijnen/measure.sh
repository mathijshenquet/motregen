#!/usr/bin/env bash
set -euo pipefail

measure_label=${1:?Geef een unieke meetnaam}
measure_assets=${2:?Geef een warme assetmap}
measure_high=${3:-2200M}
measure_max=${4:-2600M}
measure_text=${5:-warm}
measure_runtime=${6:-source}
measure_track=.dev/tracks/u71d-renderer-geheugen-stroomlijnen
measure_cache=tmp/u71d-$measure_label
if [[ -e $measure_cache || -e $measure_track/$measure_label.json ]]; then
  printf 'Meetnaam bestaat al: %s\n' "$measure_label" >&2
  exit 1
fi
if [[ $measure_text != warm && $measure_text != cold-text && $measure_text != cold ]]; then exit 1; fi
if [[ $measure_runtime != source && $measure_runtime != built ]]; then exit 1; fi
git check-ignore "$measure_cache/LOG.md" >/dev/null
node --input-type=module - "$measure_assets" "$measure_cache" "$measure_text" <<'JS'
import { mkdir, readdir, copyFile } from 'node:fs/promises'
const [source, destination, text] = process.argv.slice(2)
await mkdir(destination)
for (const name of await readdir(source)) {
  if (text === 'cold') continue
  if (!/^(basemap-|overlay-|pressure-marks-|isoline-text-)/.test(name)) continue
  if (text === 'cold-text' && name.startsWith('isoline-text-')) continue
  await copyFile(`${source}/${name}`, `${destination}/${name}`)
}
JS
export TG_BOT_KEY=x MOTREGEN_ORIGIN=https://motregen.nl
export MOTREGEN_RENDER_CACHE=../$measure_cache
export MOTREGEN_CHROMIUM_PATH=${MOTREGEN_CHROMIUM_PATH:-/niet-bestaand/u71d-chromium}
export MOTREGEN_TIME_PATH=${MOTREGEN_TIME_PATH:-/nix/store/y51431wmnm7vli4l347dpn44nyhmcrw7-time-1.10/bin/time}
date -u +%FT%TZ > "$measure_track/$measure_label-host.txt"
git rev-parse HEAD >> "$measure_track/$measure_label-host.txt"
git diff --stat -- bot nix/modules/motregen.nix nix/packages/bot.nix flake.nix >> "$measure_track/$measure_label-host.txt"
git diff HEAD -- bot nix/modules/motregen.nix nix/packages/bot.nix flake.nix | node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs"
writeFileSync(process.argv[1], JSON.stringify({ patch: readFileSync(0, "utf8") }, null, 2) + "\n")
' "$measure_track/$measure_label-source.json"
cat /proc/loadavg >> "$measure_track/$measure_label-host.txt"
if flock /home/mathijs/motregen-perf.lock systemd-run --user --wait --pipe \
  --unit="motregen-u71d-$measure_label" --working-directory="$PWD" \
  -p MemoryHigh="$measure_high" -p MemoryMax="$measure_max" -p MemorySwapMax=0 -p CPUQuota=200% \
  "$(command -v env)" "PATH=$PATH" "MALLOC_ARENA_MAX=2" "MALLOC_MMAP_THRESHOLD_=131072" "TG_BOT_KEY=x" "MOTREGEN_ORIGIN=$MOTREGEN_ORIGIN" \
  "MOTREGEN_RENDER_CACHE=$MOTREGEN_RENDER_CACHE" "MOTREGEN_CHROMIUM_PATH=$MOTREGEN_CHROMIUM_PATH" \
  "MOTREGEN_TIME_PATH=$MOTREGEN_TIME_PATH" "MOTREGEN_NODE_HEAP=${MOTREGEN_NODE_HEAP:-}" \
  "$(command -v node)" "$measure_track/profile.mjs" "$measure_label" "$measure_runtime" \
  > "$measure_track/$measure_label.log" 2>&1; then
  measure_status=0
else
  measure_status=$?
fi
cat /proc/loadavg >> "$measure_track/$measure_label-host.txt"
printf 'systemd-run exit=%s\n' "$measure_status" >> "$measure_track/$measure_label-host.txt"
exit "$measure_status"
