import argparse
import json
from pathlib import Path

import h5py
import numpy as np

PROJECTION = "+proj=stere +lat_0=90 +lon_0=0 +lat_ts=60 +a=6378137 +b=6356752 +x_0=0 +y_0=0 +units=km"


def scalar(group: h5py.Group, name: str):
    return group.attrs[name][0]


def text(group: h5py.Group, name: str) -> str:
    return group.attrs[name].decode("ascii")


def timestamp(value: str) -> str:
    from datetime import datetime, timezone

    parsed = datetime.strptime(value, "%d-%b-%Y;%H:%M:%S.%f").replace(tzinfo=timezone.utc)
    return parsed.isoformat(timespec="seconds").replace("+00:00", "Z")


def decode(path: Path, kind: str) -> dict:
    with h5py.File(path) as source:
        geographic = source["geographic"]
        overview = source["overview"]
        count = int(scalar(overview, "number_image_groups"))
        expected = 1 if kind == "rtcor" else 25
        run_attribute = "product_datetime_end" if kind == "rtcor" else "product_datetime_start"
        run = timestamp(text(overview, run_attribute))
        frames = []
        for index in range(1, count + 1):
            image = source[f"image{index}"]
            if text(image, "image_geo_parameter") != "PRECIP_[MM]":
                continue
            calibration = image["calibration"]
            formula = text(calibration, "calibration_formulas").removeprefix("GEO=")
            scale_text, offset_text = formula.split("*PV+")
            raw = image["image_data"][:]
            missing = int(scalar(calibration, "calibration_missing_data"))
            outside = int(scalar(calibration, "calibration_out_of_image"))
            rates = (raw.astype(np.float32) * float(scale_text) + float(offset_text)) * 12.0
            rates[(raw == missing) | (raw == outside)] = np.nan
            valid = run if kind == "rtcor" else timestamp(text(image, "image_datetime_valid"))
            frames.append({"time": valid, "rates_mm_h": rates.ravel().tolist()})
        if len(frames) != expected:
            raise ValueError(f"expected {expected} precipitation frames, found {len(frames)}")
        projection = text(source["geographic/map_projection"], "projection_proj4_params")
        if projection != PROJECTION:
            raise ValueError(f"unexpected projection: {projection}")
        return {
            "run": run,
            "grid": {
                "projection": projection,
                "x0_km": float(scalar(geographic, "geo_column_offset")),
                "y0_km": -float(scalar(geographic, "geo_row_offset")),
                "dx_km": float(scalar(geographic, "geo_pixel_size_x")),
                "dy_km": float(scalar(geographic, "geo_pixel_size_y")),
                "width": int(scalar(geographic, "geo_number_columns")),
                "height": int(scalar(geographic, "geo_number_rows")),
            },
            "frames": frames,
        }


def copy_attribute(source, target, name: str):
    target.attrs[name] = source.attrs[name]


def make_fixture(source_path: Path, target_path: Path, kind: str):
    row_slice = slice(300, 304)
    column_slice = slice(325, 330)
    with h5py.File(source_path) as source, h5py.File(target_path, "w") as target:
        geographic = target.create_group("geographic")
        source_geographic = source["geographic"]
        for name in (
            "geo_column_offset",
            "geo_dim_pixel",
            "geo_par_pixel",
            "geo_pixel_def",
            "geo_pixel_size_x",
            "geo_pixel_size_y",
            "geo_row_offset",
        ):
            copy_attribute(source_geographic, geographic, name)
        geographic.attrs["geo_column_offset"] = np.array([325.0], dtype=np.float32)
        geographic.attrs["geo_row_offset"] = np.array([3950.0], dtype=np.float32)
        geographic.attrs["geo_number_columns"] = np.array([5], dtype=np.int32)
        geographic.attrs["geo_number_rows"] = np.array([4], dtype=np.int32)
        projection = geographic.create_group("map_projection")
        for name in source["geographic/map_projection"].attrs:
            copy_attribute(source["geographic/map_projection"], projection, name)

        overview = target.create_group("overview")
        for name in (
            "number_image_groups",
            "product_datetime_end",
            "product_datetime_start",
            "product_group_name",
        ):
            copy_attribute(source["overview"], overview, name)

        count = int(scalar(source["overview"], "number_image_groups"))
        for index in range(1, count + 1):
            source_image = source[f"image{index}"]
            image = target.create_group(f"image{index}")
            for name in source_image.attrs:
                copy_attribute(source_image, image, name)
            calibration = image.create_group("calibration")
            for name in source_image["calibration"].attrs:
                copy_attribute(source_image["calibration"], calibration, name)
            image.create_dataset(
                "image_data",
                data=source_image["image_data"][row_slice, column_slice],
                compression="gzip",
            )


def main():
    parser = argparse.ArgumentParser()
    subcommands = parser.add_subparsers(dest="command", required=True)
    export = subcommands.add_parser("export")
    export.add_argument("kind", choices=("rtcor", "nowcast"))
    export.add_argument("input", type=Path)
    export.add_argument("output", type=Path)
    fixtures = subcommands.add_parser("make-fixture")
    fixtures.add_argument("kind", choices=("rtcor", "nowcast"))
    fixtures.add_argument("input", type=Path)
    fixtures.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.command == "export":
        args.output.write_text(json.dumps(decode(args.input, args.kind), allow_nan=True))
    else:
        make_fixture(args.input, args.output, args.kind)


if __name__ == "__main__":
    main()
