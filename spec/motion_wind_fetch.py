#!/usr/bin/env -S uv run --script
"""Download a small, reproducible radar/wind corpus without writing to production."""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

API = "https://api.dataplatform.knmi.nl/open-data/v1"
DEFAULT_TIMES = ["2026-10-09T00:00Z", "2026-10-10T12:00Z", "2026-10-11T06:00Z", "2026-10-12T12:00Z",
                 "2026-10-13T00:00Z", "2026-10-14T12:00Z", "2026-10-15T21:00Z", "2026-10-16T06:00Z"]


def get_bytes(url: str, headers: dict[str, str] | None = None) -> bytes:
    with urlopen(Request(url, headers=headers or {}), timeout=90) as response:
        if headers and "Range" in headers and response.status != 206:
            raise ValueError("Server ignored byte range")
        return response.read()


def download_url(dataset: str, filename: str, key: str) -> str:
    metadata = json.loads(get_bytes(f"{API}/datasets/{dataset}/versions/1.0/files/{filename}/url",
                                    {"Authorization": key}))
    return metadata["temporaryDownloadUrl"]


def tar_members(url: str, leads: set[int], target: Path) -> list[str]:
    offset = 0
    found: dict[int, str] = {}
    for _ in range(130):
        header = get_bytes(url, {"Range": f"bytes={offset}-{offset + 511}"})
        if len(header) != 512 or not header.strip(b"\0"):
            break
        size = int(header[124:136].strip(b"\0 "), 8)
        name = header[:100].split(b"\0")[0].decode()
        if header[156:157] in (b"0", b"\0"):
            lead = int(name.rsplit("_", 2)[1]) // 100
            if lead in leads:
                path = target / name
                if not path.exists():
                    path.write_bytes(get_bytes(url, {"Range": f"bytes={offset + 512}-{offset + 511 + size}"}))
                if path.stat().st_size != size:
                    raise ValueError(f"Short GRIB member {name}")
                found[lead] = str(path.resolve())
        offset += 512 + ((size + 511) // 512) * 512
        if found.keys() == leads:
            return [found[lead] for lead in sorted(found)]
    raise ValueError("Tar lacks requested lead hours")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--env", type=Path, default=Path(".env"))
    parser.add_argument("--times", nargs="+", default=DEFAULT_TIMES)
    arguments = parser.parse_args()
    key = os.environ.get("KNMI_OPEN_DATA_API_KEY")
    if not key:
        entries = dict(line.strip().split("=", 1) for line in arguments.env.read_text().splitlines()
                       if "=" in line and not line.lstrip().startswith("#"))
        key = entries["KNMI_OPEN_DATA_API_KEY"].strip("\"'")
    arguments.output.mkdir(parents=True, exist_ok=True)
    datasets = []
    for timestamp in arguments.times:
        start = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        label = start.strftime("%Y%m%dT%H%M")
        target = arguments.output / label
        target.mkdir(exist_ok=True)
        try:
            radar_paths = []
            for index in range(13):
                valid = start + timedelta(minutes=5 * index)
                filename = f"RAD_NL25_RAC_RT_{valid:%Y%m%d%H%M}.h5"
                path = target / filename
                if not path.exists():
                    url = download_url("nl_rdr_data_rtcor_5m", filename, key)
                    path.write_bytes(get_bytes(url))
                radar_paths.append(str(path.resolve()))
            model_run = start - timedelta(hours=3)
            filename = f"HARM43_V1_P1_{model_run:%Y%m%d%H}.tar"
            url = download_url("harmonie_arome_cy43_p1", filename, key)
            wind_paths = tar_members(url, {3, 4}, target)
            datasets.append({"label": label, "kind": "rtcor", "rain": radar_paths,
                             "wind": wind_paths, "wind_run": model_run.isoformat()})
            print(f"{label}: {len(radar_paths)} radarframes, {len(wind_paths)} GRIB-leden", flush=True)
        except HTTPError as error:
            print(f"{label}: HTTP {error.code}; corpus incomplete", flush=True)
            raise SystemExit(1) from None
    (arguments.output / "corpus.json").write_text(json.dumps(datasets, indent=2) + "\n")


if __name__ == "__main__":
    main()
