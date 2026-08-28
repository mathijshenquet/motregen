#!/usr/bin/env python3
"""Export the AROME total-precipitation field as the conformance fixture."""

import argparse
import json
from pathlib import Path

import numpy as np
import xarray as xr


def export_fixture(source: Path, output: Path) -> None:
    dataset = xr.open_dataset(
        source,
        engine="cfgrib",
        backend_kwargs={
            "filter_by_keys": {
                "table2Version": 253,
                "indicatorOfParameter": 61,
            },
            "indexpath": "",
        },
    )
    try:
        variable = next(iter(dataset.data_vars.values()))
        values = np.asarray(variable.values, dtype=np.float32)
        metadata = {
            "selector": {
                "edition": 1,
                "table2Version": 253,
                "indicatorOfParameter": 61,
                "indicatorOfTypeOfLevel": 105,
                "level": 0,
                "stepType": "accum",
            },
            "shape": list(values.shape),
            "dtype": str(values.dtype),
            "start_step": 0,
            "end_step": int(dataset.step.values / np.timedelta64(1, "h")),
            "short_name": variable.attrs.get("GRIB_shortName"),
            "param_id": variable.attrs.get("GRIB_paramId"),
            "units": variable.attrs.get("units"),
            "grid": {
                "type": variable.attrs.get("GRIB_gridType"),
                "ni": int(variable.attrs["GRIB_Nx"]),
                "nj": int(variable.attrs["GRIB_Ny"]),
                "latitude_first": variable.attrs[
                    "GRIB_latitudeOfFirstGridPointInDegrees"
                ],
                "longitude_first": variable.attrs[
                    "GRIB_longitudeOfFirstGridPointInDegrees"
                ],
                "latitude_last": variable.attrs[
                    "GRIB_latitudeOfLastGridPointInDegrees"
                ],
                "longitude_last": variable.attrs[
                    "GRIB_longitudeOfLastGridPointInDegrees"
                ],
                "latitude_increment": variable.attrs[
                    "GRIB_jDirectionIncrementInDegrees"
                ],
                "longitude_increment": variable.attrs[
                    "GRIB_iDirectionIncrementInDegrees"
                ],
            },
            "source": source.name,
        }
        output.mkdir(parents=True, exist_ok=True)
        np.save(output / "precip.npy", values, allow_pickle=False)
        (output / "metadata.json").write_text(
            json.dumps(metadata, indent=2, sort_keys=True) + "\n"
        )
    finally:
        dataset.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    export_fixture(args.source, args.output)


if __name__ == "__main__":
    main()
