#!/usr/bin/env bash
# MIP-37: koude en warme botgeneratie op twee opeenvolgende datasnapshots, op twee kernen.
# Gebruik (vanuit web/, onder de perf-lock):
#   scripts/perf-lock.sh bash ../tools/measure-frame-cache.sh <snapshot-a> <snapshot-b> <werkmap> [herhalingen]
# Snapshots maak je met tools/fetch-data-snapshot.sh, B vijf minuten na A.
#   koud-a   lege cache, generatie A
#   warm-b   cache van koud-a, generatie B (de productiesituatie)
#   koud-b   lege cache, generatie B
#   seed-b   cache van koud-a zonder beelden, alleen de labelcheckpoints: de koude referentie voor warm-b
#   basis-b  zonder cache, met MOTREGEN_BASELINE_BIN (bijv. een build van main), alleen als die gezet is
# Kopieer de binary eerst naar een vaste plek (MOTREGEN_RENDER_BIN): de cachesleutel hangt aan de binary.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
snapshot_a="$(realpath "${1:?snapshot A ontbreekt}")"
snapshot_b="$(realpath "${2:?snapshot B ontbreekt}")"
work="${3:?werkmap ontbreekt}"
repeats="${4:-2}"
binary="${MOTREGEN_RENDER_BIN:-$root/target/release/motregen-render}"
basemaps="$root/crates/render/assets/basemaps"
rm -rf "$work"
mkdir -p "$work"

render() { # naam snapshot [cachemap]
  local started ended executable="$binary" cache=()
  if [[ -n ${3:-} ]]; then cache=(--frame-cache "$3"); else executable="$MOTREGEN_BASELINE_BIN"; fi
  started=$(date +%s%N)
  taskset -c 0,1 "$executable" --mode all --data-dir "$2" --basemap-dir "$basemaps" \
    --out-dir "$work/$1" "${cache[@]}" > "$work/$1.json"
  ended=$(date +%s%N)
  echo "$1 $(( (ended - started) / 1000000 ))" >> "$work/wall.txt"
}

for run in $(seq 1 "$repeats"); do
  render "koud-a-$run" "$snapshot_a" "$work/cache-a-$run"
done
for run in $(seq 1 "$repeats"); do
  cp -a "$work/cache-a-1" "$work/cache-warm-$run"
  render "warm-b-$run" "$snapshot_b" "$work/cache-warm-$run"
  render "koud-b-$run" "$snapshot_b" "$work/cache-koud-b-$run"
  if [[ -n ${MOTREGEN_BASELINE_BIN:-} ]]; then render "basis-b-$run" "$snapshot_b"; fi
done
cp -a "$work/cache-a-1" "$work/cache-seed"
find "$work/cache-seed" \( -name '*.rgb' -o -name '*.jpg' \) -delete
render seed-b "$snapshot_b" "$work/cache-seed"
python3 "$root/tools/measure-frame-cache.py" "$work" "$repeats" | tee "$work/summary.txt"
