#!/usr/bin/env bash
# MIP-37: opeenvolgende botgeneraties met één gedeelde framecache, zoals de bot ze draait.
# Gebruik (vanuit web/, onder de perf-lock):
#   scripts/perf-lock.sh bash ../tools/measure-frame-cache-chain.sh <werkmap> <snapshot>...
# MOTREGEN_FEELS_REFERENCE="min,max" zet een gisteren-bereik in elk manifest (zolang prod het nog niet publiceert).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="${1:?werkmap ontbreekt}"
shift
binary="${MOTREGEN_RENDER_BIN:-$root/target/release/motregen-render}"
rm -rf "$work"
mkdir -p "$work"
generation=0
for snapshot in "$@"; do
  generation=$((generation + 1))
  snapshot="$(realpath "$snapshot")"
  python3 - "$snapshot/manifest.json" "$work/manifest-$generation.json" "${MOTREGEN_FEELS_REFERENCE:-}" <<'PYTHON'
import json, sys
manifest = json.load(open(sys.argv[1]))
if sys.argv[3]:
    low, high = (float(value) for value in sys.argv[3].split(","))
    manifest["feels_reference"] = {"day": "referentie", "min": low, "max": high}
json.dump(manifest, open(sys.argv[2], "w"))
PYTHON
  TIMEFORMAT="%R %U %S"
  { time taskset -c 0,1 "$binary" --mode all --modes "${MOTREGEN_MODES:-weather,wind,feels,air}" --data-dir "$snapshot" \
    --basemap-dir "$root/crates/render/assets/basemaps" --manifest "$work/manifest-$generation.json" \
    --out-dir "$work/generatie-$generation" --frame-cache "$work/cache" > "$work/generatie-$generation.json"; } \
    2> "$work/generatie-$generation.time"
  python3 - "$work/generatie-$generation.json" "$generation" $(cat "$work/generatie-$generation.time") <<'PYTHON'
import json, sys
media = json.load(open(sys.argv[1]))
wall, user, system = (float(value) for value in sys.argv[3:6])
print(f"generatie {sys.argv[2]} (nu {media['now']}): {wall:.2f} s wand, {user + system:.2f} s CPU")
for mode, entry in sorted(media["modes"].items()):
    cache = entry["cache"]
    print(f"  {mode:8} {entry['total_ms'] / 1000:6.2f} s  hergebruikt {cache['reused_frames']:3}  gerenderd {cache['rendered_frames']:3}  vluchtig {cache['volatile_frames']:3}"
          f"  geschreven {cache['written_bytes'] / 2**20:6.1f} MB  keten {'ja' if cache['resumed_chain'] else 'nee'}")
PYTHON
done | tee "$work/summary.txt"
du -sh "$work/cache" | tee -a "$work/summary.txt"
