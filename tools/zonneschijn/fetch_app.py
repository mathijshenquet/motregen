"""De verwachting die de MeteoSwiss-app toont, voor de SwissMetNet-stations van fetch_swiss.py (U95c).

Bron: MeteoSwiss Open Government Data, collectie ch.meteoschweiz.ogd-local-forecasting. Volgens MeteoSwiss "the same
forecast data used in the MeteoSwiss app and on the website for each ZIP-code"; een mix van INCA, ICON-CH1-EPS,
ICON-CH2-EPS en ECMWF, elk uur een run tot +192 h. Op 2026-10-18 nagerekend: app-API plzDetail?plz=800100 `sunshine1h`
is getal voor getal gelijk aan deze bestanden voor de uren na de run.

MeteoSwiss bewaart maar ~2 dagen. Elke run die hier langskomt, wordt daarom bewaard in meteoswiss-app/<run>.csv.gz
(in git); de steekproef groeit alleen door dit script vaker te draaien. Kolom Date is het eind van het uur in UTC.
"""

import csv
import gzip
import io
import sys
import time
from pathlib import Path

import requests

COLLECTION = "https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-local-forecasting"
POINTS = "https://data.geo.admin.ch/ch.meteoschweiz.ogd-local-forecasting/ogd-local-forecasting_meta_point.csv"
HERE = Path(__file__).parent
ARCHIVE = HERE / "meteoswiss-app"
PARAMETERS = {"sre000h0": "sunshine_min", "gre000h0": "radiation_wm2"}


def get(url: str, **options) -> requests.Response:
    for attempt in range(5):
        response = requests.get(url, timeout=300, **options)
        if response.ok:
            return response
        time.sleep(5 * (attempt + 1))
    response.raise_for_status()
    return response


def station_points() -> dict[str, str]:
    stations = {row["station"] for row in csv.DictReader(open(HERE / "data" / "stations-ch.csv"))}
    points = csv.DictReader(io.StringIO(get(POINTS).content.decode("latin-1")), delimiter=";")
    return {row["point_id"]: row["station_abbr"] for row in points if row["point_type_id"] == "1" and row["station_abbr"] in stations}


def run_assets() -> dict[str, dict[str, str]]:
    """run (JJJJMMDDUU) → {parameter: url} voor alle runs die nu op de server staan."""
    runs: dict[str, dict[str, str]] = {}
    url = f"{COLLECTION}/items?limit=100"
    while url:
        page = get(url).json()
        for feature in page["features"]:
            for name, asset in feature["assets"].items():
                parts = name.split(".")
                if len(parts) == 5 and parts[3] in PARAMETERS:
                    runs.setdefault(parts[2][:10], {})[parts[3]] = asset["href"]
        url = next((link["href"] for link in page["links"] if link["rel"] == "next"), None)
    return runs


def fetch_parameter(url: str, points: dict[str, str]) -> dict[tuple[str, str], str]:
    values = {}
    with get(url, stream=True) as response:
        lines = response.iter_lines(decode_unicode=False)
        next(lines)
        for line in lines:
            point_id, _, stamp, value = line.decode("latin-1").split(";")
            if point_id in points:
                hour_end = f"{stamp[0:4]}-{stamp[4:6]}-{stamp[6:8]}T{stamp[8:10]}"
                values[(points[point_id], hour_end)] = value
    return values


def main() -> int:
    ARCHIVE.mkdir(exist_ok=True)
    points = station_points()
    for run, urls in sorted(run_assets().items()):
        target = ARCHIVE / f"{run}.csv.gz"
        if target.exists() or set(urls) != set(PARAMETERS):
            continue
        columns = {parameter: fetch_parameter(url, points) for parameter, url in urls.items()}
        keys = sorted(set.intersection(*(set(values) for values in columns.values())))
        with gzip.GzipFile(target, "wb", mtime=0) as compressed, io.TextIOWrapper(compressed, newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["run", "station", "hour_end_utc", *PARAMETERS.values()])
            for station, hour_end in keys:
                writer.writerow([run, station, hour_end, *(columns[parameter][(station, hour_end)] for parameter in PARAMETERS)])
        print(f"{run}: {len(keys)} stationsuren", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
