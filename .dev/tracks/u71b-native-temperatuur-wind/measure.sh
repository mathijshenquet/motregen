#!/usr/bin/env bash
set -euo pipefail

measure_label=${1:?Geef een unieke meetnaam}
measure_assets=${2:?Geef de warme assetmap relatief aan de projectroot}
measure_text=${3:-warm}
measure_track=.dev/tracks/u71b-native-temperatuur-wind
measure_cache=tmp/u71b-$measure_label
if [[ -e $measure_cache ]]; then
  printf 'Meetcache bestaat al: %s\n' "$measure_cache" >&2
  exit 1
fi
if [[ $measure_text != warm && $measure_text != cold-text ]]; then exit 1; fi
git check-ignore "$measure_cache/LOG.md" >/dev/null
node --input-type=module - "$measure_assets" "$measure_cache" "$measure_text" <<'JS'
import { mkdir, readdir, copyFile } from 'node:fs/promises'
const [source, destination, text] = process.argv.slice(2)
await mkdir(destination)
for (const name of await readdir(source)) {
  if (!/^(basemap-|overlay-|pressure-marks-|isoline-text-)/.test(name)) continue
  if (text === 'cold-text' && name.startsWith('isoline-text-')) continue
  await copyFile(`${source}/${name}`, `${destination}/${name}`)
}
JS
export TG_BOT_KEY=x MOTREGEN_ORIGIN=https://motregen.nl
export MOTREGEN_RENDER_CACHE=../$measure_cache
export MOTREGEN_CHROMIUM_PATH=${MOTREGEN_CHROMIUM_PATH:-/nix/store/j8hc3kdypr2gaa2w3dq0a370lwfzbasf-chromium-151.0.7922.137/bin/chromium}
measure_time=${MOTREGEN_TIME_PATH:-/nix/store/y51431wmnm7vli4l347dpn44nyhmcrw7-time-1.10/bin/time}
date -u +%FT%TZ > "$measure_track/$measure_label-host.txt"
git rev-parse HEAD >> "$measure_track/$measure_label-host.txt"
cat /proc/loadavg >> "$measure_track/$measure_label-host.txt"
if flock /home/mathijs/motregen-perf.lock "$measure_time" -v -o "$measure_track/$measure_label-resource.txt" \
  taskset -c 0,1 web/scripts/e2e-slot.sh pnpm -C bot render --matrix \
  --manifest=../"$measure_track/manifest.json" --dry-run-prime=../"$measure_track/$measure_label-register.json" \
  > "$measure_track/$measure_label.log" 2>&1; then
  measure_status=0
else
  measure_status=$?
fi
cat /proc/loadavg >> "$measure_track/$measure_label-host.txt"
exit "$measure_status"
