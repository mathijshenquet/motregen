"""Snijdt echte ICON-D2-bestanden (DWD open data, regular-lat-lon) bij tot een klein vak rond De Bilt voor de tests.

Alle berichten blijven staan (het uurbericht en de drie kwartieren erna), met dezelfde sleutels; alleen het raster
krimpt tot 51,90–52,30 N × 4,90–5,50 E. De bitmap blijft, zoals in de echte bestanden (met `missingValue` als geheel
getal); het zuidwestelijke hoekpunt wordt ontbrekend gemaakt om dat pad te testen. Het resultaat wordt opnieuw met
bzip2 ingepakt, zoals de DWD het levert.

Gebruik (vanuit tools/zonneschijn, dat eccodes in zijn uv-omgeving heeft):
    uv run python ../../crates/ingest/tests/fixtures/icon-d2-fixture.py <bron.grib2> <doel.grib2.bz2>
"""

import bz2
import sys

import eccodes
import numpy as np

SOUTH, NORTH, WEST, EAST = 51.90, 52.30, 4.90, 5.50


def crop(handle) -> bytes:
    ni, nj = eccodes.codes_get(handle, "Ni"), eccodes.codes_get(handle, "Nj")
    lat0 = eccodes.codes_get(handle, "latitudeOfFirstGridPointInDegrees")
    lon0 = eccodes.codes_get(handle, "longitudeOfFirstGridPointInDegrees")
    step = eccodes.codes_get(handle, "iDirectionIncrementInDegrees")
    assert eccodes.codes_get(handle, "jScansPositively") == 1
    lon0 = lon0 - 360 if lon0 > 180 else lon0
    first_row, last_row = round((SOUTH - lat0) / step), round((NORTH - lat0) / step)
    first_column, last_column = round((WEST - lon0) / step), round((EAST - lon0) / step)
    values = eccodes.codes_get_values(handle).reshape(nj, ni)
    box = values[first_row : last_row + 1, first_column : last_column + 1]
    missing = eccodes.codes_get(handle, "missingValue")
    assert not np.any(box == missing)
    box = box.copy()
    box[0, 0] = missing
    clone = eccodes.codes_clone(handle)
    eccodes.codes_set(clone, "Ni", box.shape[1])
    eccodes.codes_set(clone, "Nj", box.shape[0])
    eccodes.codes_set(clone, "latitudeOfFirstGridPointInDegrees", SOUTH)
    eccodes.codes_set(clone, "longitudeOfFirstGridPointInDegrees", WEST)
    eccodes.codes_set(clone, "latitudeOfLastGridPointInDegrees", NORTH)
    eccodes.codes_set(clone, "longitudeOfLastGridPointInDegrees", EAST)
    eccodes.codes_set_values(clone, box.ravel())
    message = eccodes.codes_get_message(clone)
    eccodes.codes_release(clone)
    return message


def main() -> int:
    source, target = sys.argv[1], sys.argv[2]
    messages = []
    with open(source, "rb") as handle_file:
        while (handle := eccodes.codes_grib_new_from_file(handle_file)) is not None:
            messages.append(crop(handle))
            eccodes.codes_release(handle)
    with open(target, "wb") as out:
        out.write(bz2.compress(b"".join(messages)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
