"""Compare one raw 10/300 m wind point with the published map wind."""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path

import eccodes
import numpy as np
import zstandard


def raw_point(path: Path, longitude: float, latitude: float) -> dict:
    result = {}
    with path.open("rb") as source:
        while (message := eccodes.codes_grib_new_from_file(source)) is not None:
            try:
                parameter = eccodes.codes_get_long(message, "indicatorOfParameter")
                level = eccodes.codes_get_long(message, "level")
                if parameter not in (33, 34) or level not in (10, 300):
                    continue
                width = eccodes.codes_get_long(message, "Ni")
                height = eccodes.codes_get_long(message, "Nj")
                first_longitude = eccodes.codes_get_double(
                    message, "longitudeOfFirstGridPointInDegrees"
                )
                first_latitude = eccodes.codes_get_double(
                    message, "latitudeOfFirstGridPointInDegrees"
                )
                longitude_step = eccodes.codes_get_double(
                    message, "iDirectionIncrementInDegrees"
                )
                latitude_step = eccodes.codes_get_double(
                    message, "jDirectionIncrementInDegrees"
                )
                column = round((longitude - first_longitude) / longitude_step)
                row = round((latitude - first_latitude) / latitude_step)
                values = np.asarray(
                    eccodes.codes_get_array(message, "values"), dtype=float
                ).reshape(height, width)
                result[f"{parameter}-{level}"] = float(values[row, column])
            finally:
                eccodes.codes_release(message)
    return result


def published_point(
    snapshot: Path, longitude: float, latitude: float, time: str
) -> dict:
    manifest = json.loads((snapshot / "manifest.json").read_text())
    result = {}
    for chunk in manifest["chunks"]:
        if chunk["field"] not in ("wind_u_ms", "wind_v_ms"):
            continue
        raw = (snapshot / chunk["url"]).read_bytes()
        header_length = 8 + struct.unpack_from("<I", raw, 4)[0]
        header = json.loads(raw[8:header_length])
        if header.get("pred"):
            raise ValueError("This point probe expects non-predictive wind frames")
        frame = next(
            (entry for entry in header["frames"] if entry["time"] == time), None
        )
        if frame is None:
            continue
        grid = header["grid"]
        offset = header_length + frame["offset"]
        decompressed = zstandard.ZstdDecompressor().decompress(
            raw[offset : offset + frame["len"]]
        )
        values = np.frombuffer(decompressed, dtype=np.uint8).reshape(
            grid["height"], grid["width"]
        )
        projected_east = math.radians(longitude) * 6378137
        projected_north = (
            math.log(math.tan(math.pi / 4 + math.radians(latitude) / 2)) * 6378137
        )
        column = round((projected_east - grid["x0"]) / grid["dx"])
        row = round((projected_north - grid["y0"]) / grid["dy"])
        result[chunk["field"]] = header["quant"][int(values[row, column])]
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("grib", type=Path)
    parser.add_argument("--longitude", type=float, default=3.97)
    parser.add_argument("--latitude", type=float, default=53.06)
    parser.add_argument("--time", default="2026-10-16T06:00:00Z")
    arguments = parser.parse_args()
    print(
        json.dumps(
            {
                "raw": raw_point(
                    arguments.grib, arguments.longitude, arguments.latitude
                ),
                "published": published_point(
                    arguments.snapshot,
                    arguments.longitude,
                    arguments.latitude,
                    arguments.time,
                ),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
