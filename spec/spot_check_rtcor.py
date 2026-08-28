import argparse
import json
import struct
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import h5py
import numpy as np
from pyproj import CRS, Transformer


def scalar(group: Any, name: str) -> Any:
    return group.attrs[name][0]


def text(group: Any, name: str) -> str:
    return group.attrs[name].decode("ascii")


def read_header(path: Path) -> dict:
    with path.open("rb") as source:
        if source.read(4) != b"mrf0":
            raise ValueError("invalid mrf magic")
        length = struct.unpack("<I", source.read(4))[0]
        return json.loads(source.read(length))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("hdf5", type=Path)
    parser.add_argument("chunk", type=Path)
    parser.add_argument("frame", type=int)
    parser.add_argument("decoded", type=Path)
    args = parser.parse_args()

    header = read_header(args.chunk)
    grid = header["grid"]
    decoded = np.fromfile(args.decoded, dtype=np.uint8).reshape(
        grid["height"], grid["width"]
    )
    with h5py.File(args.hdf5) as source_file:
        source: Any = source_file
        geographic = source["geographic"]
        image = source["image1"]
        calibration = image["calibration"]
        raw = image["image_data"][:]
        projection = text(source["geographic/map_projection"], "projection_proj4_params")
        transform = Transformer.from_crs(
            CRS.from_epsg(3857), CRS.from_proj4(projection), always_xy=True
        )
        columns = np.arange(grid["width"], dtype=np.float64) + 0.5
        rows = np.arange(grid["height"], dtype=np.float64) + 0.5
        x, y = np.meshgrid(
            grid["x0"] + columns * grid["dx"],
            grid["y0"] + rows * grid["dy"],
        )
        source_x, source_y = transform.transform(x, y)
        source_columns = np.rint(
            (source_x - float(scalar(geographic, "geo_column_offset")))
            / float(scalar(geographic, "geo_pixel_size_x"))
            - 0.5
        ).astype(np.int64)
        source_rows = np.rint(
            (source_y + float(scalar(geographic, "geo_row_offset")))
            / float(scalar(geographic, "geo_pixel_size_y"))
            - 0.5
        ).astype(np.int64)
        inside = (
            (source_rows >= 0)
            & (source_rows < raw.shape[0])
            & (source_columns >= 0)
            & (source_columns < raw.shape[1])
        )
        source_values = np.full(decoded.shape, 65535, dtype=np.uint16)
        source_values[inside] = raw[source_rows[inside], source_columns[inside]]
        missing = int(scalar(calibration, "calibration_missing_data"))
        outside = int(scalar(calibration, "calibration_out_of_image"))
        masked = (source_values == missing) | (source_values == outside)
        formula = text(calibration, "calibration_formulas").removeprefix("GEO=")
        scale, offset = formula.split("*PV+")
        expected = (source_values.astype(np.float32) * float(scale) + float(offset)) * 12.0
        valid_time = datetime.strptime(
            text(source["overview"], "product_datetime_end"), "%d-%b-%Y;%H:%M:%S.%f"
        ).replace(tzinfo=timezone.utc)

    frame_time = header["frames"][args.frame]["time"]
    if frame_time != valid_time.isoformat(timespec="seconds").replace("+00:00", "Z"):
        raise AssertionError("HDF5 validity time does not match selected mrf frame")

    quant = np.array([np.nan if value is None else value for value in header["quant"]])
    if not np.array_equal(decoded == 255, masked):
        mismatch = int(np.count_nonzero((decoded == 255) != masked))
        raise AssertionError(f"no-data mask differs in {mismatch} cells")
    valid = ~masked
    reconstructed = quant[decoded[valid]]
    expected_valid = expected[valid]
    code = decoded[valid].astype(np.int64)
    lower = quant[np.maximum(code - 1, 0)]
    upper = quant[np.minimum(code + 1, 254)]
    step = np.maximum(np.abs(reconstructed - lower), np.abs(upper - reconstructed))
    dry_ok = (code == 0) & (expected_valid <= quant[1] / 2.0)
    error = np.abs(reconstructed - expected_valid)
    bad = ~(dry_ok | (error <= step + 1e-6))
    if np.any(bad):
        raise AssertionError(f"{int(np.count_nonzero(bad))} cells exceed one quantization step")
    print(
        json.dumps(
            {
                "frame_time": frame_time,
                "cells": int(decoded.size),
                "valid_cells": int(np.count_nonzero(valid)),
                "masked_cells": int(np.count_nonzero(masked)),
                "max_error_mm_h": float(np.max(error)),
            }
        )
    )


if __name__ == "__main__":
    main()
