#!/usr/bin/env python3
"""Cross-check a published UV frame against the KNMI NetCDF4/HDF5 source."""

import argparse
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

import h5py
import numpy as np

from spot_check_arome_fields import chunk_frame, target_values


def dataset(group: h5py.Group, name: str) -> h5py.Dataset:
    value = group[name]
    if not isinstance(value, h5py.Dataset):
        raise AssertionError(f"{name} is not a dataset")
    return value


def check(data_dir: Path, source: Path) -> None:
    with h5py.File(source) as file:
        product = file["PRODUCT"]
        assert isinstance(product, h5py.Group)
        latitude = np.asarray(dataset(product, "latitude")[:], dtype=np.float32)
        longitude = np.asarray(dataset(product, "longitude")[:], dtype=np.float32)
        times = np.asarray(dataset(product, "time")[:], dtype=np.float32)
        statuses = np.asarray(dataset(product, "status")[:], dtype=np.uint8)
        available = np.flatnonzero(statuses != 0)
        if available.size == 0:
            raise AssertionError("source has no available UV frames")
        index = int(available[-1].item())
        cloudy = np.asarray(dataset(product, "uvi_cloudy")[index], dtype=np.float32)
        date_raw = cast(Any, file.attrs["data_product_date"])
        date_text = bytes(date_raw).decode() if not isinstance(date_raw, bytes) else date_raw.decode()

    time = (
        datetime.strptime(date_text, "%Y%m%d").replace(tzinfo=UTC)
        + timedelta(hours=float(times[index]))
    ).isoformat().replace("+00:00", "Z")
    source_grid = {
        "longitude_first": float(longitude[0]),
        "latitude_first": float(latitude[0]),
        "longitude_increment": float(longitude[1] - longitude[0]),
        "latitude_increment": float(latitude[1] - latitude[0]),
        "width": float(longitude.size),
        "height": float(latitude.size),
    }
    codes, header = chunk_frame(data_dir, "uv", time)
    expected = target_values(cloudy, source_grid, header["grid"], allow_outside=True)
    expected[expected < 0] = np.nan
    expected_missing = np.isnan(expected)
    actual_missing = codes == 255
    if not np.array_equal(expected_missing, actual_missing):
        raise AssertionError("UV no-data mask differs")
    quant = np.asarray([np.nan if value is None else value for value in header["quant"]])
    error = np.abs(quant[codes[~expected_missing]] - expected[~expected_missing])
    step = 12.0 / 254.0
    if np.any(error > step + 1e-4):
        raise AssertionError(f"{int(np.count_nonzero(error > step + 1e-4))} UV cells exceed one step")
    print(
        f"uv: {error.size} valid cells, {int(expected_missing.sum())} no-data cells, "
        f"max error {float(error.max()):.6f}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("data_dir", type=Path)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    check(args.data_dir, args.source)


if __name__ == "__main__":
    main()
