"""Build the recorded-shape ADS fixture for U39 until a real ADS download exists.

The GRIB2 encoding mirrors what ADS returns for `cams-europe-air-quality-forecasts`
with `data_format: grib` (PDT 40, discipline 0, category 20; fields identified by
parameterNumber + constituentType, mass density in kg m-3, pollen in m-3). The
values are real CAMS-Europe values for the same run, sampled from Open-Meteo at the
native 0.1-degree cell centres (Open-Meteo snaps to its own 0.1-degree lattice, so
positions are off by at most 0.05 degree). Replace with a real ADS download once the
key exists: `motregen-cams --record <file>` keeps the raw GRIB.

Usage: uv run --with eccodes --with requests python make_ads_fixture.py <run YYYY-MM-DD> <leads> <out.grib2>
"""

import datetime
import sys
import time

import eccodes as ec
import requests

# (open-meteo name, parameterNumber, constituentType, scale to GRIB units)
FIELDS = [
    ("mugwort_pollen", 59, 62201, 1.0),
    ("pm2_5", 0, 40009, 1e-9),
    ("pm10", 0, 40008, 1e-9),
    ("nitrogen_dioxide", 0, 5, 1e-9),
    ("ozone", 0, 0, 1e-9),
]
# ADS area [N, W, S, E] = [53.9, 2.2, 50.2, 7.6] selects these cell centres.
LATS = [round(53.85 - 0.1 * j, 2) for j in range(37)]
LONS = [round(2.25 + 0.1 * i, 2) for i in range(54)]


def fetch(run: str, leads: int) -> dict[str, list[list[float]]]:
    points = [(lat, lon) for lat in LATS for lon in LONS]
    series: dict[str, list[list[float]]] = {name: [] for name, *_ in FIELDS}
    for start in range(0, len(points), 100):
        batch = points[start : start + 100]
        if start:
            time.sleep(12)  # Open-Meteo counts every location; stay under 600 per minute.
        response = requests.get(
            "https://air-quality-api.open-meteo.com/v1/air-quality",
            params={
                "latitude": ",".join(str(lat) for lat, _ in batch),
                "longitude": ",".join(str(lon) for _, lon in batch),
                "hourly": ",".join(name for name, *_ in FIELDS),
                "domains": "cams_europe",
                "timezone": "GMT",
                "start_date": run,
                "end_date": (
                    datetime.date.fromisoformat(run) + datetime.timedelta(hours=leads)
                ).isoformat(),
            },
            timeout=60,
        )
        response.raise_for_status()
        body = response.json()
        body = body if isinstance(body, list) else [body]
        for location in body:
            for name in series:
                values = location["hourly"][name][: leads + 1]
                series[name].append([0.0 if value is None else value for value in values])
    return series


def main() -> None:
    run, leads, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    series = fetch(run, leads)
    with open(out, "wb") as handle:
        for lead in range(leads + 1):
            for name, number, constituent, scale in FIELDS:
                gid = ec.codes_grib_new_from_samples("GRIB2")
                for key, value in [
                    ("centre", "ecmf"),
                    ("dataDate", int(run.replace("-", ""))),
                    ("dataTime", 0),
                    ("productDefinitionTemplateNumber", 40),
                    ("discipline", 0),
                    ("parameterCategory", 20),
                    ("parameterNumber", number),
                    ("constituentType", constituent),
                    ("typeOfGeneratingProcess", 2),
                    ("typeOfFirstFixedSurface", 103),
                    ("scaleFactorOfFirstFixedSurface", 0),
                    ("scaledValueOfFirstFixedSurface", 0),
                    ("indicatorOfUnitOfTimeRange", 1),
                    ("forecastTime", lead),
                    ("gridType", "regular_ll"),
                    ("Ni", len(LONS)),
                    ("Nj", len(LATS)),
                    ("latitudeOfFirstGridPointInDegrees", LATS[0]),
                    ("longitudeOfFirstGridPointInDegrees", LONS[0]),
                    ("latitudeOfLastGridPointInDegrees", LATS[-1]),
                    ("longitudeOfLastGridPointInDegrees", LONS[-1]),
                    ("iDirectionIncrementInDegrees", 0.1),
                    ("jDirectionIncrementInDegrees", 0.1),
                    ("jScansPositively", 0),
                    ("bitsPerValue", 12),
                ]:
                    ec.codes_set(gid, key, value)
                values = [point[lead] * scale for point in series[name]]
                ec.codes_set_values(gid, values)
                ec.codes_write(gid, handle)
                ec.codes_release(gid)


if __name__ == "__main__":
    main()
