#!/usr/bin/env python3
"""Spot-check a published seamless chunk against its NetCDF ensemble source."""

import argparse
import json
import re
import struct
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import h5py
import numpy as np
import zstandard


def read_chunk(path: Path) -> tuple[dict[str, Any], bytes]:
    with path.open("rb") as source:
        if source.read(4) != b"mrf0":
            raise ValueError(f"bad magic in {path}")
        json_length = struct.unpack("<I", source.read(4))[0]
        header = json.loads(source.read(json_length))
        return header, source.read()


def source_grid_values(source: Any, time_index: int) -> np.ndarray:
    variable: Any = source["precip_intensity"]
    raw = np.asarray(variable[:, time_index, :, :], dtype=np.float64)
    missing = int(np.asarray(variable.attrs["_FillValue"]).item())
    scale = float(np.asarray(variable.attrs["scale_factor"]).item())
    offset = float(np.asarray(variable.attrs["add_offset"]).item())
    raw[raw == missing] = np.nan
    return np.nanmedian(raw * scale + offset, axis=0)


def reproject(source: Any, values: np.ndarray, target: dict[str, Any]) -> np.ndarray:
    latitudes = np.asarray(source["lat"][:], dtype=np.float64)
    longitudes = np.asarray(source["lon"][:], dtype=np.float64)
    rows, columns = np.indices((int(target["height"]), int(target["width"])))
    x = float(target["x0"]) + (columns + 0.5) * float(target["dx"])
    y = float(target["y0"]) + (rows + 0.5) * float(target["dy"])
    longitude = np.degrees(x / 6_378_137.0)
    latitude = np.degrees(2.0 * np.arctan(np.exp(y / 6_378_137.0)) - np.pi / 2.0)
    source_columns = np.floor(
        (longitude - longitudes[0]) / (longitudes[1] - longitudes[0]) + 0.5
    ).astype(np.intp)
    source_rows = np.floor(
        (latitude - latitudes[0]) / (latitudes[1] - latitudes[0]) + 0.5
    ).astype(np.intp)
    covered = (
        (source_columns >= 0)
        & (source_columns < longitudes.size)
        & (source_rows >= 0)
        & (source_rows < latitudes.size)
    )
    result = np.full(covered.shape, np.nan, dtype=np.float64)
    result[covered] = values[source_rows[covered], source_columns[covered]]
    return result


def check_frame(
    source: h5py.File,
    header: dict[str, Any],
    payload: bytes,
    frame_index: int,
    source_index: int,
) -> dict[str, Any]:
    frame = header["frames"][frame_index]
    compressed = payload[frame["offset"] : frame["offset"] + frame["len"]]
    cells = int(header["grid"]["width"]) * int(header["grid"]["height"])
    decoded = np.frombuffer(
        zstandard.ZstdDecompressor().decompress(compressed, max_output_size=cells),
        dtype=np.uint8,
    ).reshape(int(header["grid"]["height"]), int(header["grid"]["width"]))
    expected = reproject(source, source_grid_values(source, source_index), header["grid"])
    quant = np.asarray([np.nan if value is None else value for value in header["quant"]])
    expected_missing = np.isnan(expected)
    if not np.array_equal(decoded == 255, expected_missing):
        mismatch = int(np.count_nonzero((decoded == 255) != expected_missing))
        raise AssertionError(f"frame {frame_index}: no-data mask differs in {mismatch} cells")
    valid = ~expected_missing
    codes = decoded[valid].astype(np.int64)
    actual = quant[codes]
    error = np.abs(actual - expected[valid])
    lower = quant[np.maximum(codes - 1, 0)]
    upper = quant[np.minimum(codes + 1, 254)]
    step = np.maximum(np.abs(actual - lower), np.abs(upper - actual))
    dry_ok = (codes == 0) & (expected[valid] <= quant[1] / 2.0)
    bad = ~(dry_ok | (error <= step + 1e-6))
    if np.any(bad):
        raise AssertionError(
            f"frame {frame_index}: {int(np.count_nonzero(bad))} cells exceed one quantization step"
        )
    return {
        "time": frame["time"],
        "valid_cells": int(np.count_nonzero(valid)),
        "masked_cells": int(np.count_nonzero(expected_missing)),
        "max_error_mm_h": float(error.max()),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("data_dir", type=Path)
    parser.add_argument("netcdf", type=Path)
    args = parser.parse_args()
    manifest = json.loads((args.data_dir / "manifest.json").read_text())
    chunk_meta = next(chunk for chunk in manifest["chunks"] if chunk["source"] == "seamless")
    header, payload = read_chunk(args.data_dir / chunk_meta["url"])
    if header["source"] != "seamless" or header.get("field", "rain_rate") != "rain_rate":
        raise AssertionError("selected chunk is not seamless rain")
    match = re.fullmatch(r"KNMI_PYSTEPS_BLEND_ENS_(\d{12})\.nc", args.netcdf.name)
    if match is None:
        raise ValueError("unexpected seamless source filename")
    run = datetime.strptime(match.group(1), "%Y%m%d%H%M").replace(tzinfo=UTC)
    if header["run"] != run.isoformat(timespec="seconds").replace("+00:00", "Z"):
        raise AssertionError("NetCDF and mrf runs differ")
    selected = sorted({0, len(header["frames"]) // 2, len(header["frames"]) - 1})
    with h5py.File(args.netcdf) as source:
        root: Any = source
        source_times = np.asarray(root["time"][:], dtype=np.int64)
        checks = []
        for frame_index in selected:
            validity = datetime.fromisoformat(header["frames"][frame_index]["time"].replace("Z", "+00:00"))
            seconds = int((validity - run).total_seconds())
            matches = np.flatnonzero(source_times == seconds)
            if matches.size != 1:
                raise AssertionError("published validity time is absent from NetCDF")
            checks.append(
                check_frame(root, header, payload, frame_index, int(matches[0]))
            )
    print(json.dumps({"frames": checks}))


if __name__ == "__main__":
    main()
