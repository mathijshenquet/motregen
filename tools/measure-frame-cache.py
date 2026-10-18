"""Samenvatting van tools/measure-frame-cache.sh: tijden, hergebruik en pariteit per modus."""

import filecmp
import json
import statistics
import sys
from pathlib import Path

work = Path(sys.argv[1])
repeats = int(sys.argv[2])
walls = dict(line.split() for line in (work / "wall.txt").read_text().splitlines())


def media(name):
    return json.loads((work / f"{name}.json").read_text())


def median(values):
    return statistics.median(values)


labels = ["koud-a", "warm-b", "koud-b"] + (["basis-b"] if "basis-b-1" in walls else [])
for label in labels:
    runs = [media(f"{label}-{run}") for run in range(1, repeats + 1)]
    wall = median(int(walls[f"{label}-{run}"]) for run in range(1, repeats + 1))
    print(f"{label}: generatie {wall / 1000:.2f} s wand (mediaan van {repeats})")
    for mode in sorted(runs[0]["modes"]):
        total = median(run["modes"][mode]["total_ms"] for run in runs)
        cache = runs[0]["modes"][mode].get("cache")
        if cache is None:
            print(f"  {mode:8} {total / 1000:6.2f} s  zonder cache")
            continue
        print(
            f"  {mode:8} {total / 1000:6.2f} s  hergebruikt {cache['reused_frames']:3}"
            f"  gerenderd {cache['rendered_frames']:3}  niet-cachebaar {cache['uncacheable_frames']}"
            f"  mismatches {cache['mismatches']}  geschreven {cache['written_bytes'] / 2**20:6.1f} MB"
            f"  keten {'ja' if cache['resumed_chain'] else 'nee'}"
        )
    written = sum(run_mode.get("cache", {}).get("written_bytes", 0) for run_mode in runs[0]["modes"].values())
    print(f"  geschreven totaal {written / 2**20:.1f} MB")


def compare(left, right):
    differing = []
    for path in sorted((work / left).glob("*.mp4")) + sorted((work / left).glob("*.jpg")):
        if not filecmp.cmp(path, work / right / path.name, shallow=False):
            differing.append(path.name)
    return differing


pairs = [("warm-b-1", "seed-b"), ("warm-b-1", "koud-b-1")] + ([("koud-b-1", "basis-b-1")] if "basis-b" in labels else [])
for left, right in pairs:
    differing = compare(left, right)
    films = [name for name in differing if name.endswith(".mp4")]
    stills = [name for name in differing if name.endswith(".jpg")]
    print(f"{left} vs {right}: films anders {films or 'geen'}, stills anders {len(stills)}"
          + (f" ({sorted({name.split('-')[0] for name in stills})})" if stills else ""))
