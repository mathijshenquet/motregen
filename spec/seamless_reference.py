#!/usr/bin/env python3
"""Independent h5py reference decoder for KNMI seamless ensemble files."""

import argparse
import json
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import h5py
import numpy as np


def text(attribute: Any) -> str:
    value = attribute
    if isinstance(value, np.ndarray):
        value = value.item()
    if isinstance(value, bytes):
        return value.decode("ascii")
    return str(value)


def decode(path: Path, start_after_minutes: int) -> dict[str, Any]:
    match = re.fullmatch(r"KNMI_PYSTEPS_BLEND_ENS_(\d{12})\.nc", path.name)
    if match is None:
        raise ValueError(f"unexpected seamless filename {path.name}")
    run = datetime.strptime(match.group(1), "%Y%m%d%H%M").replace(tzinfo=UTC)
    with h5py.File(path) as source:
        root: Any = source
        members = np.asarray(root["ens_number"][:], dtype=np.int64)
        times = np.asarray(root["time"][:], dtype=np.int64)
        latitudes = np.asarray(root["lat"][:], dtype=np.float64)
        longitudes = np.asarray(root["lon"][:], dtype=np.float64)
        precipitation: Any = root["precip_intensity"]
        if not np.array_equal(members, np.arange(1, 21)):
            raise ValueError("ensemble members changed")
        if not np.array_equal(times, np.arange(300, 21_601, 300)):
            raise ValueError("lead times changed")
        missing = int(np.asarray(precipitation.attrs["_FillValue"]).item())
        scale = float(np.asarray(precipitation.attrs["scale_factor"]).item())
        offset = float(np.asarray(precipitation.attrs["add_offset"]).item())
        frames = []
        for index, seconds in enumerate(times):
            if seconds <= start_after_minutes * 60:
                continue
            raw = np.asarray(precipitation[:, index, :, :], dtype=np.float64)
            raw[raw == missing] = np.nan
            rates = np.nanmedian(raw * scale + offset, axis=0)
            frames.append(
                {
                    "time": (run + timedelta(seconds=int(seconds)))
                    .isoformat(timespec="seconds")
                    .replace("+00:00", "Z"),
                    "rates_mm_h": rates.reshape(-1).tolist(),
                }
            )
        return {
            "run": run.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "grid": {
                "latitude_first": float(latitudes[0]),
                "longitude_first": float(longitudes[0]),
                "latitude_increment": float(latitudes[1] - latitudes[0]),
                "longitude_increment": float(longitudes[1] - longitudes[0]),
                "width": int(longitudes.size),
                "height": int(latitudes.size),
            },
            "frames": frames,
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--start-after-minutes", type=int, default=0)
    args = parser.parse_args()
    product = decode(args.source, args.start_after_minutes)
    args.output.write_text(json.dumps(product, allow_nan=False))


if __name__ == "__main__":
    main()
