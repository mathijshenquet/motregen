"""KNMI-stationsuren (zonneschijnduur SQ en globale straling Q) ophalen.

Bron: https://www.daggegevens.knmi.nl/klimatologie/uurgegevens (geen sleutel).
SQ is in 0,1 uur per uurvak, berekend uit globale straling; -1 betekent < 0,05 uur.
Q is in J/cm² per uurvak. Uur HH is het uurvak dat eindigt op HH UT.

Schrijft data/stations.csv en data/obs-<jaar>.csv (station, eind van het uur in UTC, SQ in minuten, Q in W/m²).
"""

import csv
import json
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

ENDPOINT = "https://www.daggegevens.knmi.nl/klimatologie/uurgegevens"
DATA = Path(__file__).parent / "data"


def post(form: dict[str, str], attempts: int = 4) -> requests.Response:
    for attempt in range(attempts):
        response = requests.post(ENDPOINT, data=form, timeout=300)
        if response.ok:
            return response
        time.sleep(5 * (attempt + 1))
    response.raise_for_status()
    return response


def fetch_stations() -> list[dict[str, str]]:
    text = post({"start": "2026101000", "end": "2026101001", "vars": "SQ", "stns": "ALL"}).text
    stations = []
    in_table = False
    for line in text.splitlines():
        if line.startswith("# STN"):
            in_table = True
            continue
        if in_table:
            parts = line.lstrip("# ").split()
            if len(parts) < 5 or not parts[0].isdigit():
                break
            stations.append({"station": parts[0], "lon": parts[1], "lat": parts[2], "name": " ".join(parts[4:])})
    return stations


def fetch_year(year: int, last_day: date) -> list[tuple[int, str, float, float]]:
    rows = []
    month_start = date(year, 1, 1)
    while month_start <= min(date(year, 12, 31), last_day):
        next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        month_end = min(next_month - timedelta(days=1), last_day)
        form = {
            "start": month_start.strftime("%Y%m%d") + "01",
            "end": month_end.strftime("%Y%m%d") + "24",
            "vars": "SQ:Q",
            "stns": "ALL",
            "fmt": "json",
        }
        for record in json.loads(post(form).text):
            if record["SQ"] is None or record["Q"] is None:
                continue
            day = datetime.fromisoformat(record["date"].replace("Z", "+00:00"))
            hour_end = day + timedelta(hours=record["hour"])
            sunshine_minutes = 0.0 if record["SQ"] < 0 else record["SQ"] * 6.0
            radiation_wm2 = record["Q"] * 1e4 / 3600.0
            rows.append((record["station_code"], hour_end.strftime("%Y-%m-%dT%H"), sunshine_minutes, radiation_wm2))
        month_start = next_month
    return rows


def main() -> int:
    first_year = int(sys.argv[1]) if len(sys.argv) > 1 else 2016
    last_day = date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else datetime.now(timezone.utc).date() - timedelta(days=1)
    DATA.mkdir(exist_ok=True)
    with open(DATA / "stations.csv", "w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["station", "lon", "lat", "name"])
        writer.writeheader()
        writer.writerows(fetch_stations())
    for year in range(first_year, last_day.year + 1):
        target = DATA / f"obs-{year}.csv"
        if target.exists() and year < last_day.year:
            continue
        rows = fetch_year(year, last_day)
        with open(target, "w", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["station", "hour_end_utc", "sunshine_min", "radiation_wm2"])
            writer.writerows(rows)
        print(f"{target.name}: {len(rows)} uren", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
