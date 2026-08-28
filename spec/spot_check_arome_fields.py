#!/usr/bin/env python3
"""Cross-check published AROME fields against cfgrib."""

import argparse
import json
import re
import struct
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import xarray as xr
import zstandard


def read_field(path: Path, parameter: int, level: int) -> tuple[np.ndarray, dict[str, float]]:
    dataset = xr.open_dataset(
        path,
        engine="cfgrib",
        backend_kwargs={
            "filter_by_keys": {
                "table2Version": 253,
                "indicatorOfParameter": parameter,
                "level": level,
                "timeRangeIndicator": 0,
            },
            "indexpath": "",
        },
    )
    try:
        variable = next(iter(dataset.data_vars.values()))
        return np.asarray(variable.values, dtype=np.float32), {
            "longitude_first": float(variable.attrs["GRIB_longitudeOfFirstGridPointInDegrees"]),
            "latitude_first": float(variable.attrs["GRIB_latitudeOfFirstGridPointInDegrees"]),
            "longitude_increment": float(variable.attrs["GRIB_iDirectionIncrementInDegrees"]),
            "latitude_increment": float(variable.attrs["GRIB_jDirectionIncrementInDegrees"]),
            "width": float(variable.attrs["GRIB_Nx"]),
            "height": float(variable.attrs["GRIB_Ny"]),
        }
    finally:
        dataset.close()


def target_values(
    source: np.ndarray,
    source_grid: dict[str, float],
    target: dict[str, Any],
    *,
    allow_outside: bool = False,
) -> np.ndarray:
    rows, columns = np.indices((int(target["height"]), int(target["width"])))
    x = float(target["x0"]) + (columns + 0.5) * float(target["dx"])
    y = float(target["y0"]) + (rows + 0.5) * float(target["dy"])
    longitude = np.degrees(x / 6_378_137.0)
    latitude = np.degrees(2.0 * np.arctan(np.exp(y / 6_378_137.0)) - np.pi / 2.0)
    source_columns = np.floor(
        (longitude - source_grid["longitude_first"]) / source_grid["longitude_increment"] + 0.5
    ).astype(np.intp)
    source_rows = np.floor(
        (latitude - source_grid["latitude_first"]) / source_grid["latitude_increment"] + 0.5
    ).astype(np.intp)
    valid = (
        (source_columns >= 0)
        & (source_rows >= 0)
        & (source_columns < int(source_grid["width"]))
        & (source_rows < int(source_grid["height"]))
    )
    if not allow_outside and not np.all(valid):
        raise AssertionError("target grid is not covered by source")
    if allow_outside:
        result = np.full(source_columns.shape, np.nan, dtype=np.float32)
        result[valid] = source[source_rows[valid], source_columns[valid]]
        return result
    if (
        source_columns.min() < 0
        or source_rows.min() < 0
        or source_columns.max() >= int(source_grid["width"])
        or source_rows.max() >= int(source_grid["height"])
    ):
        raise AssertionError("target grid is not covered by source")
    return source[source_rows, source_columns]


def chunk_frame(data_dir: Path, field: str, time: str) -> tuple[np.ndarray, dict[str, Any]]:
    manifest = json.loads((data_dir / "manifest.json").read_text())
    chunk = next(candidate for candidate in manifest["chunks"] if candidate.get("field", "rain_rate") == field)
    path = data_dir / chunk["url"]
    with path.open("rb") as source:
        if source.read(4) != b"mrf0":
            raise AssertionError(f"bad magic in {path}")
        json_length = struct.unpack("<I", source.read(4))[0]
        header = json.loads(source.read(json_length))
        frame = next(candidate for candidate in header["frames"] if candidate["time"] == time)
        source.seek(8 + json_length + frame["offset"])
        compressed = source.read(frame["len"])
    decoded = zstandard.ZstdDecompressor().decompress(
        compressed,
        max_output_size=int(header["grid"]["width"]) * int(header["grid"]["height"]),
    )
    return np.frombuffer(decoded, dtype=np.uint8).reshape(
        int(header["grid"]["height"]), int(header["grid"]["width"])
    ), header


def check(data_dir: Path, member: Path) -> None:
    match = re.fullmatch(r"HA43_N20_(\d{12})_00100_GB", member.name)
    if match is None:
        raise ValueError("reference member must be AROME lead +1")
    time = (
        datetime.strptime(match.group(1), "%Y%m%d%H%M").replace(tzinfo=UTC) + timedelta(hours=1)
    ).isoformat().replace("+00:00", "Z")
    temperature, source_grid = read_field(member, 11, 2)
    wind_u, wind_grid = read_field(member, 33, 10)
    relative_humidity, humidity_grid = read_field(member, 52, 2)
    cloud_fraction, cloud_grid = read_field(member, 71, 0)
    if any(grid != source_grid for grid in (wind_grid, humidity_grid, cloud_grid)):
        raise AssertionError("cfgrib AROME field grids differ")

    checks = [
        ("temp_c", temperature - np.float32(273.15), 0.3),
        ("wind_u_ms", wind_u, 0.25),
        ("rel_humidity", relative_humidity * np.float32(100.0), 100.0 / 254.0),
        ("cloud_frac", cloud_fraction * np.float32(100.0), 100.0 / 254.0),
    ]
    for field, source_values, quant_step in checks:
        codes, header = chunk_frame(data_dir, field, time)
        expected = target_values(source_values, source_grid, header["grid"], allow_outside=True)
        quant = np.asarray([np.nan if value is None else value for value in header["quant"]])
        actual = quant[codes]
        covered = ~np.isnan(expected)
        error = np.abs(actual[covered] - expected[covered])
        if np.any((codes == 255) != ~covered) or np.any(error > quant_step + 1e-4):
            raise AssertionError(
                f"{field}: {int(np.count_nonzero(error > quant_step + 1e-4))} cells exceed one quantization step"
            )
        print(
            f"{field}: {error.size} covered cells, {int(np.count_nonzero(~covered))} no-data cells, "
            f"max error {float(error.max()):.6f}"
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("data_dir", type=Path)
    parser.add_argument("lead_one_member", type=Path)
    args = parser.parse_args()
    check(args.data_dir, args.lead_one_member)


if __name__ == "__main__":
    main()
