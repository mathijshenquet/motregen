#!/usr/bin/env python3
"""Displayed-frame benchmark for a browser on an Android phone, measured with SurfaceFlinger (no profiler).

Per run: open the URL in the given browser, settle, then count frames SurfaceFlinger presents for the browser's
SurfaceView over a fixed window. Variants run interleaved (A B C ..., repeated); before every round the phone
cools on the home screen until thermal status is 0. Needs adb on PATH and a phone that stays awake
(e.g. `adb shell svc power stayon ac`).

Usage: sfbench.py variants.json out.jsonl [--rounds 3] [--settle 15] [--window 10]
variants.json: [{"name": "A", "package": "org.mozilla.firefox", "url": "http://..."}, ...]
"""

import argparse
import json
import re
import statistics
import subprocess
import sys
import time
import urllib.request

UNSET_TIMESTAMPS = {"0", "9223372036854775807"}


def adb(*args: str) -> str:
    return subprocess.run(["adb", *args], check=True, capture_output=True, text=True).stdout


def thermal_status() -> int:
    match = re.search(r"Thermal Status: (\d+)", adb("shell", "dumpsys", "thermalservice"))
    return int(match.group(1)) if match else -1


def battery_temperature_celsius() -> float:
    match = re.search(r"temperature: (\d+)", adb("shell", "dumpsys", "battery"))
    return int(match.group(1)) / 10 if match else float("nan")


def keyguard_showing() -> bool:
    return "isKeyguardShowing=true" in adb("shell", "dumpsys", "window")


def build_id(url: str) -> str:
    """The dev server has no version.json; use the ETag of / plus the hashed index bundle name."""
    origin = re.match(r"https?://[^/]+", url).group(0)
    with urllib.request.urlopen(origin + "/", timeout=5) as response:
        etag = response.headers.get("ETag", "")
        modified = response.headers.get("Last-Modified", "")
        html = response.read().decode("utf-8", "replace")
    bundle = re.search(r"/assets/(index-[\w-]+\.js)", html)
    return " ".join(part for part in (bundle.group(1) if bundle else "", etag, modified) if part)


def content_layer(variant: dict) -> str:
    """Firefox (GeckoView) presents into its SurfaceView; Chrome into a `ChromeChildSurface` layer instead,
    so variants may name the layer to match with "layer"."""
    wanted = variant.get("layer")
    for line in adb("shell", "dumpsys", "SurfaceFlinger", "--list").splitlines():
        name = line.split("RequestedLayerState{", 1)[-1].rsplit(" parentId", 1)[0]
        if wanted and wanted in name:
            return name
        if not wanted and f"SurfaceView[{variant['package']}/" in name and "(BLAST)" in name:
            return name
    raise RuntimeError(f"no content layer for {variant['package']} {wanted or ''}")


def presented_timestamps(layer: str) -> tuple[int, set[int]]:
    lines = adb("shell", "dumpsys", "SurfaceFlinger", "--latency", f"'{layer}'").splitlines()
    stamps = set()
    for line in lines[1:]:
        fields = line.split()
        if len(fields) == 3 and fields[1] not in UNSET_TIMESTAMPS:
            stamps.add(int(fields[1]))
    return int(lines[0]), stamps


def measure(variant: dict, settle: float, window: float, screenshot: str) -> dict:
    adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", f"'{variant['url']}'", variant["package"])
    time.sleep(settle)
    layer = content_layer(variant)
    started = {"thermal_status": thermal_status(), "battery_c": battery_temperature_celsius(),
               "build": build_id(variant["url"]), "time": time.strftime("%H:%M:%S")}
    refresh_period_ns, before = presented_timestamps(layer)
    # `--latency-clear` does not reliably empty the 128-frame history, so only count frames newer than this.
    baseline = max(before, default=0)
    seen: set[int] = set()
    window_start = time.time()
    while time.time() - window_start < window:
        time.sleep(0.4)
        seen |= {stamp for stamp in presented_timestamps(layer)[1] if stamp > baseline}
    with open(screenshot, "wb") as f:
        subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=f, check=True)
    stamps = sorted(seen)
    intervals_ms = sorted((b - a) / 1e6 for a, b in zip(stamps, stamps[1:]))
    span_s = (stamps[-1] - stamps[0]) / 1e9 if len(stamps) > 1 else 0.0

    def percentile(q: float) -> float:
        return intervals_ms[min(len(intervals_ms) - 1, int(q * len(intervals_ms)))] if intervals_ms else float("nan")

    return {**started, "variant": variant["name"], "url": variant["url"], "package": variant["package"],
            "frames": len(stamps), "span_s": round(span_s, 2),
            "fps": round((len(stamps) - 1) / span_s, 1) if span_s else 0.0,
            "p50_ms": round(percentile(0.5), 1), "p90_ms": round(percentile(0.9), 1),
            "max_ms": round(intervals_ms[-1], 1) if intervals_ms else float("nan"),
            "refresh_hz": round(1e9 / refresh_period_ns), "keyguard_after": keyguard_showing(),
            "screenshot": screenshot}


def cool_down(max_wait_s: float = 1200) -> float:
    adb("shell", "input", "keyevent", "KEYCODE_HOME")
    started = time.time()
    while thermal_status() != 0 and time.time() - started < max_wait_s:
        time.sleep(20)
    return time.time() - started


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("variants")
    parser.add_argument("out")
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--settle", type=float, default=15)
    parser.add_argument("--window", type=float, default=10)
    parser.add_argument("--pause", type=float, default=5, help="seconds between runs within a round")
    args = parser.parse_args()

    variants = json.load(open(args.variants))
    results = []
    with open(args.out, "a") as out:
        for round_number in range(1, args.rounds + 1):
            waited = cool_down()
            print(f"round {round_number}: cooled {waited:.0f} s, thermal status {thermal_status()}, "
                  f"battery {battery_temperature_celsius()} C", flush=True)
            for variant in variants:
                result = measure(variant, args.settle, args.window, f"bench-{variant['name']}-{round_number}.png")
                result["round"] = round_number
                results.append(result)
                out.write(json.dumps(result) + "\n")
                out.flush()
                print(f"  {variant['name']}#{round_number}: {result['fps']} fps, p50 {result['p50_ms']} ms, "
                      f"p90 {result['p90_ms']} ms, max {result['max_ms']} ms, thermal {result['thermal_status']}, "
                      f"battery {result['battery_c']} C, build {result['build']}", flush=True)
                time.sleep(args.pause)
    adb("shell", "input", "keyevent", "KEYCODE_HOME")

    print("\nmedians over rounds:")
    for variant in variants:
        runs = [r for r in results if r["variant"] == variant["name"]]
        print(f"  {variant['name']}: fps {statistics.median(r['fps'] for r in runs)}, "
              f"p50 {statistics.median(r['p50_ms'] for r in runs)} ms, "
              f"p90 {statistics.median(r['p90_ms'] for r in runs)} ms, "
              f"max {statistics.median(r['max_ms'] for r in runs)} ms  (n={len(runs)})")


if __name__ == "__main__":
    sys.exit(main())
